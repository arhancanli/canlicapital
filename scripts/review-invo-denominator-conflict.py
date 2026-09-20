"""Preserve two exact INVO source conflicts without choosing a replacement."""
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

def clean(node):
    return ' '.join(' '.join(node.stripped_strings).split())

def main():
    cik, accession = '0001417926', '0001185185-17-000595'
    target_raw = (A / 'company-basic-diluted-capture-batch1-targets-20260920.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/invo-reviewed-source.json.gz').read_bytes())
    assert sha(source) == '685ad9dc506bdfe829560566a030c772be69de24616cba6e2a255a48eadc071b'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    all_rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    rows = [r for r in all_rows if r['unit'] == 'shares' and r['end'] == '2014-12-31']
    assert len(rows) == 2 and all(r['val'] == 112672160 and r['start'] == '2014-01-01' for r in rows)
    receipt_raw = (A / f'corpus-local/basic-diluted-batch1-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(receipt_raw); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '3b8ae21fc87104eb128ec2b99768fcca1d1f12e6ac5893a40055ccbae3764d2f'
    legacy_raw = (A / 'company-basic-diluted-batch1-legacy-review-v2-20260920.json').read_bytes()
    legacy = next(f for f in json.loads(legacy_raw)['filings'] if f['cik'] == cik and f['accession'] == accession)
    capture = legacy['instance_capture']; xml = (ROOT / capture['body_path']).read_bytes()
    assert capture['status'] == 200 and len(xml) == capture['bytes']
    assert sha(xml) == capture['sha256'] == '9bd79588b17bea2bdbc75939f8c07ddd7554c4b242f0ecf224307c76d290fd01'
    helper_path = ROOT / 'scripts/review-basic-diluted-legacy-v2.py'
    spec = importlib.util.spec_from_file_location('legacy', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    checks = helper.compare(xml, cik, all_rows)
    assert checks == legacy['checks'] and all(c['matched'] for c in checks)
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    cells = {i: [[clean(c) for c in tr.find_all(['td', 'th'], recursive=False)] for tr in tables[i].find_all('tr')] for i in [30, 35]}
    assert cells[30][3][5] == cells[35][1][5] == '2014'
    assert cells[30][0][5] == 'For the Twelve' and cells[30][1][5] == 'Months Ended'
    assert cells[30][2][5] == 'December 31,' and cells[35][0][2] == 'Twelve Months Ended December 31,'
    assert cells[30][33][0] == 'Basic weighted average number of shares of common stock'
    assert cells[30][35][0] == 'Diluted weighted average number of shares of common stock'
    assert cells[30][33][7] == cells[30][35][7] == '112,672,160'
    assert cells[35][3][0] == 'Basic and diluted weighted-average number of common shares outstanding (Denominator)'
    assert cells[35][3][7] == '112,670,160'
    result = dict(schema='canli.invo-denominator-conflict.v1', publication_approved=False,
                  source_sha256=sha(source), target_sha256=sha(target_raw), receipt_sha256=sha(receipt_raw),
                  primary_capture=receipt, instance_capture=capture, legacy_report_sha256=sha(legacy_raw),
                  code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
                  selected_observations=rows, checks=[c for c in checks if c['selected'] in rows],
                  tables=[dict(table_index=i, text=clean(tables[i])) for i in [30, 35]],
                  statement_value=112672160, note_value=112670160, difference=2000,
                  disposition='TWO_EXACT_SHARE_OBSERVATIONS_REQUIRE_HOLD',
                  scope='Two 2014 share observations only. Original XML matches the main statement, which conflicts with the per-share note. No replacement, rounding correction, EPS recomputation or approval of other observations.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Two INVO 2014 share conflicts retained; no replacement')

if __name__ == '__main__':
    main()
