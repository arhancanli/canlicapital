"""Bind Bespoke's captured 2018/19 legacy instance to its visible statement."""
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
    assert (cik, acc, d['table_index'], d['observations']) == ('0001409197', '0001213900-19-026230', 14, 8)
    assert d['primary_sha256'] == '852363337928e2cd4b7369581361653e6c5ce232f31cd3a12b9349316de019d8'
    source = gzip.decompress((ROOT / d['fixture']).read_bytes())
    assert sha(source) == d['source_sha256'] == '80f06be680b2f10f5dbaf4e5eb9848ce2df8d50a6ba7797e9082455a4276410d'
    target_raw = (ROOT / spec['targets']['path']).read_bytes(); assert sha(target_raw) == spec['targets']['sha256']
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == acc]
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and rows == d['selected_observations']
    assert sorted({r['end'] for r in rows}) == d['period_ends'] == ['2018-08-31', '2019-08-31']
    rp = ROOT / spec['capture_directory'] / f'{cik}-{acc}-primary.receipt.json'
    rr = rp.read_bytes(); receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert sha(rr) == d['receipt_sha256'] and receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == d['primary_sha256']
    ic = d['instance_capture']; instance = (ROOT / ic['body_path']).read_bytes()
    assert ic['url'] == 'https://www.sec.gov/Archives/edgar/data/1409197/000121390019026230/bspk-20190831.xml'
    assert ic['status'] == 200 and len(instance) == ic['bytes']
    assert sha(instance) == ic['sha256'] == '0e98b831f263b95f8700212a691cf79b8741a22f0140d6ba1360a62c9e95ac8b'
    hp = ROOT / 'scripts/review-basic-diluted-legacy-v2.py'
    module = importlib.util.spec_from_file_location('legacy', hp); helper = importlib.util.module_from_spec(module); module.loader.exec_module(helper)
    checks = helper.compare(instance, cik, rows); assert all(c['matched'] for c in checks)
    soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[14]; trs = table.find_all('tr')
    cells = lambda index: [clean(n) for n in trs[index].find_all('td', recursive=False)]
    assert cells(1) == ['', '', 'August 31,', '', '', 'August 31,', '']
    assert cells(2) == ['', '', '2019', '', '', '2018', '']
    assert clean(trs[31]) == 'WEIGHTED AVERAGE COMMON SHARES OUTSTANDING'
    assert clean(trs[35]) == 'NET INCOME / (LOSS) PER COMMON SHARE OUTSTANDING'
    mapping = {'EarningsPerShareBasic': (36, 'Basic'), 'EarningsPerShareDiluted': (37, 'Diluted'),
        'WeightedAverageNumberOfSharesOutstandingBasic': (32, 'Basic'),
        'WeightedAverageNumberOfDilutedSharesOutstanding': (33, 'Diluted')}
    xml = ET.fromstring(instance); evidence = []
    for check in checks:
        row = check['selected']; index, label = mapping[row['tag']]; values = cells(index); assert values[0] == label
        start = 2 if row['end'] == '2019-08-31' else 6
        text = ''.join(values[start:start+3]).replace('$', '').replace(',', '').replace(' ', '')
        value = -Decimal(text[1:-1]) if text.startswith('(') and text.endswith(')') else Decimal(text)
        assert value == Decimal(str(row['val']))
        assert row['unit'] == ('USD/shares' if index >= 36 else 'shares')
        facts = []
        for match in check['matches']:
            nodes = [n for n in xml if n.tag.startswith('{http://fasb.org/us-gaap/')
                and n.tag.split('}')[-1] == row['tag'] and n.get('contextRef') == match['context_id']
                and n.get('unitRef') == match['unit_id'] and Decimal(n.text or '') == Decimal(match['value'])]
            assert len(nodes) == 1
            context = xml.find("{http://www.xbrl.org/2003/instance}context[@id='" + match['context_id'] + "']")
            unit = xml.find("{http://www.xbrl.org/2003/instance}unit[@id='" + match['unit_id'] + "']")
            facts.append(dict(fact_xml=ET.tostring(nodes[0], encoding='unicode'), context_xml=ET.tostring(context, encoding='unicode'), unit_xml=ET.tostring(unit, encoding='unicode')))
        evidence.append(dict(selected=row, table_index=14, row_index=index, cells=values, visible_value=str(value), legacy_facts=facts))
    blocks = [clean(n) for n in soup.find_all(['p','div','td','span']) if n.find(['p','div','td']) is None]
    disclosures = [t for t in dict.fromkeys(blocks) if t.startswith('Basic income / loss per share amounts are computed based')]
    assert len(disclosures) == 1 and '3,330,000 warrants and 1,200,000 options' in disclosures[0]
    assert '2,830,000 warrants and 1,200,000 options' in disclosures[0] and 'convertible debt were excluded' in disclosures[0]
    assert d['disposition'] == 'REVIEWED_ALLOCATION_UNIT_AND_DILUTION_CONTEXT'
    decision = dict(cik=cik, source_sha256=sha(source), primary_capture=receipt, receipt_sha256=sha(rr),
        instance_capture=ic, selected_observations=rows, comparison=dict(checks=checks),
        legacy_evidence=evidence, table_index=14, table_text=clean(table), disclosures=disclosures,
        reader_note=d['reader_note'], disposition=d['disposition'])
    result = dict(schema='canli.reviewed-share-context.v1', publication_approved=False,
        spec_sha256=sha(spec_raw), target_sha256=sha(target_raw), code_sha256=sha(Path(__file__).read_bytes()),
        helper_sha256=sha(hp.read_bytes()), decisions=[decision],
        scope='Eight source-pinned 2018/19 observations only: legacy entity/period/compound-unit/value checks plus explicit visible fiscal-year columns and signed statement cells. No later-period restatement, whole-history or publication approval.')
    with Path(sys.argv[2]).open('x') as h: h.write(json.dumps(result, indent=2)+'\n')
    print('8 legacy facts and signed visible cells verified')
if __name__ == '__main__': main()
