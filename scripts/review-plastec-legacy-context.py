"""Bind Plastec's two distinct 2012 periods to exact legacy facts and visible columns."""
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
    assert (cik, acc, d['table_index'], d['observations']) == ('0001433309', '0001144204-15-024210', 310, 8)
    assert d['primary_sha256'] == 'a34753a56b5f749239a98af10d69b014ac3634e20e6a09e816038f9dc8fb4619'
    source = gzip.decompress((ROOT / d['fixture']).read_bytes())
    assert sha(source) == d['source_sha256'] == 'cf4b5a43bd4fd766c3e43344162a2a5fabd8aa1327866bec066af37167006276'
    target_raw = (ROOT / spec['targets']['path']).read_bytes(); assert sha(target_raw) == spec['targets']['sha256']
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == acc]
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and rows == d['selected_observations']
    assert sorted({r['end'] for r in rows}) == d['period_ends'] == ['2012-04-30', '2012-12-31']
    rp = ROOT / spec['capture_directory'] / f'{cik}-{acc}-primary.receipt.json'
    rr = rp.read_bytes(); receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert sha(rr) == d['receipt_sha256'] and receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == d['primary_sha256']
    ic = d['instance_capture']; instance = (ROOT / ic['body_path']).read_bytes()
    assert ic['url'] == 'https://www.sec.gov/Archives/edgar/data/1433309/000114420415024210/pltyf-20141231.xml'
    assert ic['status'] == 200 and len(instance) == ic['bytes']
    assert sha(instance) == ic['sha256'] == '2b15157b6bc5c4071783f80a0d5647228c5ddfdfc31c6eee06d0f75772a06b6c'
    hp = ROOT / 'scripts/review-basic-diluted-legacy-v2.py'
    module = importlib.util.spec_from_file_location('legacy', hp); helper = importlib.util.module_from_spec(module); module.loader.exec_module(helper)
    checks = helper.compare(instance, cik, rows); assert all(c['matched'] for c in checks)
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    cells = lambda table_index, row_index: [clean(n) for n in tables[table_index].find_all('tr')[row_index].find_all('td', recursive=False)]
    assert cells(310, 0) == ['', '', 'Year ended April 30,', '', '', '8-month Period ended December 31,', '', '', 'Year ended December 31,', '', '', 'Year ended December 31,', '']
    assert cells(310, 1) == ['', '', '2012', '', '', '2012', '', '', '2013', '', '', '2014', '']
    assert cells(410, 0) == ['', '', '8-month Period ended December 31,', '', '', 'Year ended December 31,', '']
    assert cells(410, 1) == ['', '', '2011', '', '', '2012', '', '', '2012', '', '', '2013', '']
    assert cells(410, 3) == ['', '', '(Unaudited)', '', '', '(Audited)', '', '', '(Unaudited)', '', '', '(Audited)', '']
    assert cells(310, 2) == cells(410, 2) == ['', '', 'HK$', '', '', 'HK$', '', '', 'HK$', '', '', 'HK$', '']
    mapping = {'EarningsPerShareBasic': (35, 'Basic income per share attributable to Plastec Technologies, Ltd.'),
        'EarningsPerShareDiluted': (37, 'Diluted income per share attributable to Plastec Technologies, Ltd.'),
        'WeightedAverageNumberOfSharesOutstandingBasic': (31, 'Weighted average number of ordinary shares'),
        'WeightedAverageNumberOfDilutedSharesOutstanding': (33, 'Weighted average number of diluted ordinary shares')}
    xml = ET.fromstring(instance); evidence = []
    for check in checks:
        row = check['selected']; index, label = mapping[row['tag']]
        table_index, start, expected_start = (310, 2, '2011-05-01') if row['end'] == '2012-04-30' else (410, 10, '2012-01-01')
        assert row['start'] == expected_start
        values = cells(table_index, index); assert values[0] == label
        text = ''.join(values[start:start+3]).replace('HK$', '').replace(',', '').replace(' ', '')
        value = -Decimal(text[1:-1]) if text.startswith('(') and text.endswith(')') else Decimal(text)
        assert value == Decimal(str(row['val']))
        assert row['unit'] == ('HKD/shares' if index >= 35 else 'shares')
        facts = []
        for match in check['matches']:
            nodes = [n for n in xml if n.tag.startswith('{http://fasb.org/us-gaap/')
                and n.tag.split('}')[-1] == row['tag'] and n.get('contextRef') == match['context_id']
                and n.get('unitRef') == match['unit_id'] and Decimal(n.text or '') == Decimal(match['value'])]
            assert len(nodes) == 1
            context = xml.find("{http://www.xbrl.org/2003/instance}context[@id='" + match['context_id'] + "']")
            unit = xml.find("{http://www.xbrl.org/2003/instance}unit[@id='" + match['unit_id'] + "']")
            facts.append(dict(fact_xml=ET.tostring(nodes[0], encoding='unicode'), context_xml=ET.tostring(context, encoding='unicode'), unit_xml=ET.tostring(unit, encoding='unicode')))
        evidence.append(dict(selected=row, table_index=table_index, row_index=index, cells=values, visible_value=str(value), legacy_facts=facts))
    blocks = [clean(n) for n in soup.find_all(['p','div','td','span']) if n.find(['p','div','td']) is None]
    disclosures = d['paragraph_requires']
    assert all(text in blocks for text in disclosures)
    assert any(text.startswith('On September 11, 2012, the Company determined to change its fiscal year end')
               and 'have not been audited' in text for text in disclosures)
    assert any(text.startswith('For the year ended April 30, 2012, the 8-month period ended December 31, 2012')
               and 'exercise prices were higher than the average market price' in text for text in disclosures)
    assert d['disposition'] == 'REPORTED_PRESENTATION_REVIEWED_CAUSE_NOT_ESTABLISHED'
    decision = dict(cik=cik, source_sha256=sha(source), primary_capture=receipt, receipt_sha256=sha(rr),
        instance_capture=ic, selected_observations=rows, comparison=dict(checks=checks),
        legacy_evidence=evidence, table_index=310, table_text=clean(tables[310]), supporting_tables=[dict(table_index=410, text=clean(tables[410]))], disclosures=disclosures,
        reader_note=d['reader_note'], disposition=d['disposition'])
    result = dict(schema='canli.reviewed-share-context.v1', publication_approved=False,
        spec_sha256=sha(spec_raw), target_sha256=sha(target_raw), code_sha256=sha(Path(__file__).read_bytes()),
        helper_sha256=sha(hp.read_bytes()), decisions=[decision],
        scope='Eight source-pinned observations across the April fiscal year and separate unaudited December comparative year in 2012. Exact legacy issuer/period/HKD compound-unit/value and visible column checks. Presentation-only; exclusion cause for the unaudited comparative period is not established. No eight-month/annual conflation, full-history or publication approval.')
    with Path(sys.argv[2]).open('x') as h: h.write(json.dumps(result, indent=2)+'\n')
    print('8 legacy facts and distinct audited/unaudited period columns verified')
if __name__ == '__main__': main()
