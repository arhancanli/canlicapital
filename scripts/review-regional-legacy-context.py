"""Bind Regional Health / AdCare's captured 2015/16 legacy instance to its visible statement."""
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
    assert (cik, acc, d['table_index'], d['observations']) == ('0001004724', '0001004724-17-000021', 112, 8)
    assert d['primary_sha256'] == '7b75680a04ec5e81c185ad4c1183339f58672b9bacb561bc4f2c635af815a725'
    source = gzip.decompress((ROOT / d['fixture']).read_bytes())
    assert sha(source) == d['source_sha256'] == 'f1e6a37875ed9bad416e92c78341131484deab37089c4e801d52524979860e6b'
    target_raw = (ROOT / spec['targets']['path']).read_bytes(); assert sha(target_raw) == spec['targets']['sha256']
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == acc]
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and rows == d['selected_observations']
    assert sorted({r['end'] for r in rows}) == d['period_ends'] == ['2015-12-31', '2016-12-31']
    rp = ROOT / spec['capture_directory'] / f'{cik}-{acc}-primary.receipt.json'
    rr = rp.read_bytes(); receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert sha(rr) == d['receipt_sha256'] and receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == d['primary_sha256']
    ic = d['instance_capture']; instance = (ROOT / ic['body_path']).read_bytes()
    assert ic['url'] == 'https://www.sec.gov/Archives/edgar/data/1004724/000100472417000021/adk-20161231.xml'
    assert ic['status'] == 200 and len(instance) == ic['bytes']
    assert sha(instance) == ic['sha256'] == 'bd2278e083f036c31ec62f00b2ed4211a7be0ee60f71f8709b110f7922ee99ff'
    hp = ROOT / 'scripts/review-basic-diluted-legacy-v2.py'
    module = importlib.util.spec_from_file_location('legacy', hp); helper = importlib.util.module_from_spec(module); module.loader.exec_module(helper)
    checks = helper.compare(instance, cik, rows); assert all(c['matched'] for c in checks)
    soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[112]; trs = table.find_all('tr')
    cells = lambda index: [clean(n) for n in trs[index].find_all('td', recursive=False)]
    assert cells(2) == ['', '', 'Year Ended December 31,']
    assert cells(3) == ['', '', '2016', '', '2015']
    assert cells(35) == ['Net loss attributable to AdCare Health Systems, Inc. common stockholders', '', '$', '(14,797', ')', '', '$', '(28,726', ')']
    assert cells(38)[0] == 'Basic and diluted:'
    assert cells(43)[0] == 'Weighted average shares of common stock outstanding:'
    mapping = {'EarningsPerShareBasic': (41, ''), 'EarningsPerShareDiluted': (41, ''),
        'WeightedAverageNumberOfSharesOutstandingBasic': (44, 'Basic and diluted'),
        'WeightedAverageNumberOfDilutedSharesOutstanding': (44, 'Basic and diluted')}
    xml = ET.fromstring(instance); evidence = []
    for check in checks:
        row = check['selected']; index, label = mapping[row['tag']]; values = cells(index); assert values[0] == label
        assert row['start'] == row['end'][:4] + '-01-01'
        is_eps = index == 41
        start = (2 if row['end'] == '2016-12-31' else 6) if is_eps else (2 if row['end'] == '2016-12-31' else 5)
        text = ''.join(values[start:start+3] if is_eps else values[start:start+1]).replace('$', '').replace(',', '').replace(' ', '')
        visible = -Decimal(text[1:-1]) if text.startswith('(') and text.endswith(')') else Decimal(text)
        value = visible if is_eps else visible * 1000
        assert value == Decimal(str(row['val']))
        assert row['unit'] == ('USD/shares' if is_eps else 'shares')
        facts = []
        for match in check['matches']:
            nodes = [n for n in xml if n.tag.startswith('{http://fasb.org/us-gaap/')
                and n.tag.split('}')[-1] == row['tag'] and n.get('contextRef') == match['context_id']
                and n.get('unitRef') == match['unit_id'] and Decimal(n.text or '') == Decimal(match['value'])]
            assert len(nodes) == 1
            context = xml.find("{http://www.xbrl.org/2003/instance}context[@id='" + match['context_id'] + "']")
            unit = xml.find("{http://www.xbrl.org/2003/instance}unit[@id='" + match['unit_id'] + "']")
            facts.append(dict(fact_xml=ET.tostring(nodes[0], encoding='unicode'), context_xml=ET.tostring(context, encoding='unicode'), unit_xml=ET.tostring(unit, encoding='unicode')))
        evidence.append(dict(selected=row, table_index=112, row_index=index, cells=values, visible_value=str(visible), normalized_value=str(value), legacy_facts=facts))
    blocks = [clean(n) for n in soup.find_all(['p','div','td','span']) if n.find(['p','div','td']) is None]
    disclosures = []
    for needle in d['paragraph_requires']:
        matches = [t for t in dict.fromkeys(blocks) if needle in t]
        assert matches, needle
        disclosures.extend(matches)
    policy = next(t for t in disclosures if t.startswith('Basic earnings per share is computed by dividing'))
    assert '4.4 million and 4.5 million' in policy and 'anti-dilutive in both periods' in policy
    assert "(Amounts in 000's, except per share data)" in disclosures
    assert d['disposition'] == 'REVIEWED_ALLOCATION_UNIT_AND_DILUTION_CONTEXT'
    decision = dict(cik=cik, source_sha256=sha(source), primary_capture=receipt, receipt_sha256=sha(rr),
        instance_capture=ic, selected_observations=rows, comparison=dict(checks=checks),
        legacy_evidence=evidence, table_index=112, table_text=clean(table), disclosures=disclosures,
        reader_note=d['reader_note'], disposition=d['disposition'])
    result = dict(schema='canli.reviewed-share-context.v1', publication_approved=False,
        spec_sha256=sha(spec_raw), target_sha256=sha(target_raw), code_sha256=sha(Path(__file__).read_bytes()),
        helper_sha256=sha(hp.read_bytes()), decisions=[decision],
        scope='Eight source-pinned 2015/16 observations only: legacy entity/period/compound-unit/value checks plus explicit visible fiscal-year columns and signed statement cells. No later-period restatement, whole-history or publication approval.')
    with Path(sys.argv[2]).open('x') as h: h.write(json.dumps(result, indent=2)+'\n')
    print('8 legacy facts and signed visible cells verified')
if __name__ == '__main__': main()
