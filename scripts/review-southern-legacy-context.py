"""Bind Southern Copper's captured 2008–2010 legacy instance to its visible statement."""
import gzip
import hashlib
import importlib.util
import json
from decimal import Decimal
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
ROOT = Path(__file__).resolve().parents[1]
sha = lambda b: hashlib.sha256(b).hexdigest()
clean = lambda n: ' '.join(' '.join(n.stripped_strings).split())

def main():
    spec_raw = Path(sys.argv[1]).read_bytes(); spec = json.loads(spec_raw)
    assert spec['schema'] == 'canli.reviewed-share-context-spec.v2' and len(spec['decisions']) == 1
    d = spec['decisions'][0]; cik, acc = d['cik'], d['accession']
    assert (cik, acc, d['table_index'], d['observations']) == ('0001001838', '0001104659-11-011083', 91, 8)
    assert d['primary_sha256'] == 'eaa33f247e7837220c701a7ed525167dfd6c31fdcb9724c9e8be4caf9e2477f6'
    source = gzip.decompress((ROOT / d['fixture']).read_bytes())
    assert sha(source) == d['source_sha256'] == 'bf9ab0f125f067fed8780461c2fcc2364e03d08ca32b598c380969308a378be0'
    target_raw = (ROOT / spec['targets']['path']).read_bytes(); assert sha(target_raw) == spec['targets']['sha256']
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == acc]
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and rows == d['selected_observations']
    assert sorted({r['end'] for r in rows}) == d['period_ends'] == ['2008-12-31', '2009-12-31', '2010-12-31']
    rp = ROOT / spec['capture_directory'] / f'{cik}-{acc}-primary.receipt.json'
    rr = rp.read_bytes(); receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert sha(rr) == d['receipt_sha256'] and receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == d['primary_sha256']
    ic = d['instance_capture']; instance = (ROOT / ic['body_path']).read_bytes()
    assert ic['url'] == 'https://www.sec.gov/Archives/edgar/data/1001838/000110465911011083/scco-20101231.xml'
    assert ic['status'] == 200 and len(instance) == ic['bytes']
    assert sha(instance) == ic['sha256'] == '535d5f6a86fa522d6816df71b8b46d6fd48f7f0671559ec402247c3716440972'
    hp = ROOT / 'scripts/review-basic-diluted-legacy-v2.py'
    module = importlib.util.spec_from_file_location('legacy', hp); helper = importlib.util.module_from_spec(module); module.loader.exec_module(helper)
    checks = helper.compare(instance, cik, rows); assert all(c['matched'] for c in checks)
    soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[91]; trs = table.find_all('tr')
    cells = lambda index: [clean(n) for n in trs[index].find_all('td', recursive=False)]
    assert cells(0) == ['For the years ended December 31, (in thousands, except for per share amounts)', '', '2010', '', '2009', '', '2008', '']
    assert cells(24) == ['Net income attributable to SCC', '', '$', '1,554,051', '', '$', '929,381', '', '$', '1,406,593', '']
    assert cells(22) == ['Less: Net income attributable to the non-controlling interest', '', '8,658', '', '5,192', '', '7,866', '']
    mapping = {'EarningsPerShareBasic': (27, 'Net earnings — basic and diluted'),
        'EarningsPerShareDiluted': (27, 'Net earnings — basic and diluted'),
        'WeightedAverageNumberOfSharesOutstandingBasic': (30, 'Weighted average shares outstanding — basic and diluted'),
        'WeightedAverageNumberOfDilutedSharesOutstanding': (30, 'Weighted average shares outstanding — basic and diluted')}
    xml = ET.fromstring(instance); evidence = []
    for check in checks:
        row = check['selected']; index, label = mapping[row['tag']]; values = cells(index); assert values[0] == label
        assert row['start'] == row['end'][:4] + '-01-01'
        is_eps = index == 27
        column = ({'2010-12-31': 3, '2009-12-31': 6, '2008-12-31': 9} if is_eps else {'2008-12-31': 6})[row['end']]
        text = values[column].replace(',', '')
        visible = Decimal(text)
        value = visible if is_eps else visible * 1000
        assert value == Decimal(str(row['val']))
        assert row['unit'] == ('USD/shares' if is_eps else 'shares')
        facts = []
        for match in check['matches']:
            nodes = [n for n in xml if n.tag.startswith('{http://xbrl.us/us-gaap/2009-01-31}')
                and n.tag.split('}')[-1] == row['tag'] and n.get('contextRef') == match['context_id']
                and n.get('unitRef') == match['unit_id'] and Decimal(n.text or '') == Decimal(match['value'])]
            assert len(nodes) == 1
            context = xml.find("{http://www.xbrl.org/2003/instance}context[@id='" + match['context_id'] + "']")
            unit = xml.find("{http://www.xbrl.org/2003/instance}unit[@id='" + match['unit_id'] + "']")
            facts.append(dict(fact_xml=ET.tostring(nodes[0], encoding='unicode'), context_xml=ET.tostring(context, encoding='unicode'), unit_xml=ET.tostring(unit, encoding='unicode')))
        evidence.append(dict(selected=row, table_index=91, row_index=index, cells=values, visible_value=str(visible), normalized_value=str(value), legacy_facts=facts))
    disclosures = [clean(trs[0]), clean(trs[22]), clean(trs[24])]
    assert d['disposition'] == 'REPORTED_PRESENTATION_REVIEWED_CAUSE_NOT_ESTABLISHED'
    decision = dict(cik=cik, source_sha256=sha(source), primary_capture=receipt, receipt_sha256=sha(rr),
        instance_capture=ic, selected_observations=rows, comparison=dict(checks=checks),
        legacy_evidence=evidence, table_index=91, table_text=clean(table), disclosures=disclosures,
        reader_note=d['reader_note'], disposition=d['disposition'])
    result = dict(schema='canli.reviewed-share-context.v1', publication_approved=False,
        spec_sha256=sha(spec_raw), target_sha256=sha(target_raw), code_sha256=sha(Path(__file__).read_bytes()),
        helper_sha256=sha(hp.read_bytes()), decisions=[decision],
        scope='Eight source-pinned 2008–2010 observations only: legacy entity/period/compound-unit/value checks plus explicit visible fiscal-year columns and signed statement cells. No later-period restatement, whole-history or publication approval.')
    with Path(sys.argv[2]).open('x') as h: h.write(json.dumps(result, indent=2)+'\n')
    print('8 legacy facts and signed visible cells verified')
if __name__ == '__main__': main()
