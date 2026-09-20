"""Bind the reported AFN/share facts to the conflicting dollar disclosure."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    inputs = {}
    def read(name):
        raw = (A/name).read_bytes(); inputs[name] = sha(raw)
        return json.loads(raw)
    capture = read('company-varonis-unit-capture-20260920.json')
    targets = read('company-varonis-unit-targets-20260920.json')
    if not capture['complete'] or capture['input_sha256'] != inputs['company-varonis-unit-targets-20260920.json'] or len(capture['filings']) != 1:
        raise ValueError('Capture binding changed')
    filing = capture['filings'][0]
    if (filing['cik'],filing['accession']) != ('0001361113','0001628280-22-002017'):
        raise ValueError('Wrong filing')
    for field in ['index_capture','primary_capture']:
        receipt = filing[field]; raw = (ROOT/receipt['body_path']).read_bytes()
        if receipt['status'] != 200 or sha(raw) != receipt['sha256'] or len(raw) != receipt['bytes']:
            raise ValueError('Capture changed')
    if sha(raw) != '3a843335a9c0c1854faaee096439706b6d26b3102aa5d554796b6ba9a89484be':
        raise ValueError('Reviewed primary changed')
    soup = BeautifulSoup(raw,'html.parser')
    text = ' '.join(' '.join(soup.stripped_strings).split())
    statement = 'Our functional and reporting currency is the U.S. dollar'
    if statement not in text:
        raise ValueError('Currency disclosure changed')
    start = text.index('b. Financial Statements in U.S. Dollars:')
    end = text.index('c. Principles of Consolidation:',start)
    currency_note = text[start:end]
    table = ' '.join(' '.join(soup.find_all('table')[38].stripped_strings).split())
    if 'Net loss per share of common stock, basic and diluted $ ( 1.11 ) $ ( 1.00 ) $ ( 0.87 )' not in table:
        raise ValueError('Primary presentation changed')
    rows = [{'tag':t['tag'],**r} for t in targets['targets'] for r in t['latest_accession_observations']]
    if len(rows) != 6 or {r['unit'] for r in rows} != {'AFN/shares'}:
        raise ValueError('Fixed review scope changed')
    helper = ROOT/'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('basic_diluted_review',helper)
    module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    comparison = module.compare(raw,filing['cik'],rows)
    if not all(c['matched'] for c in comparison['checks']):
        raise ValueError('Original tagged unit/value not reproduced')
    source = gzip.decompress((ROOT/'scripts/fixtures/editorial/varonis-reviewed-source.json.gz').read_bytes())
    if sha(source) != '5c7576b0fa53ccb95eac41b4bb2859484614b21a670c8a3b610da2be91cacc8a':
        raise ValueError('Companyfacts source changed')
    result = dict(schema='canli.varonis-unit-scope.v1',publication_approved=False,
        input_sha256=inputs,code_sha256=sha(Path(__file__).read_bytes()),helper_sha256=sha(helper.read_bytes()),
        source_sha256=sha(source),primary_capture=filing['primary_capture'],
        zero_based_table_index=38,primary_table=table,currency_disclosure=statement,
        accounting_policy_note=currency_note,unit_xml=str(soup.find('xbrli:unit',id='afnPerShare')),
        comparison=comparison,selected_observations=rows,
        disposition='WITHHOLD_SIX_AFN_PER_SHARE_OBSERVATIONS',
        reason='The source tags these six EPS facts as AFN/share while the same filing states that its financial statements use U.S. dollars. The currency conflict makes the selected unit unreliable. Preserve all source bytes and other periods/units; do not relabel or convert these observations.',
        scope='Six original-source numerical matches establish a source-level unit conflict, not correct AFN values or a replacement USD series. No whole-company admission or production change.')
    with Path(sys.argv[1]).open('x') as f:
        f.write(json.dumps(result,indent=2)+'\n')
    print('6 source-level currency conflicts; targeted hold required')

if __name__ == '__main__':
    main()
