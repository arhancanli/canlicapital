"""Replay an exact unmatched partition with compound-unit validation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    primary_path, input_path, capture_path, output_path = map(Path, sys.argv[1:5])
    primary_raw = primary_path.read_bytes()
    primary = json.loads(primary_raw)
    input_raw = input_path.read_bytes()
    requests = json.loads(input_raw)
    capture_raw = capture_path.read_bytes()
    capture = json.loads(capture_raw)
    assert requests['primary_review_sha256'] == sha(primary_raw)
    assert capture['comparison_sha256'] == sha(input_raw)
    assert capture['capture_sha256'] == requests['capture_report_sha256']
    assert capture['complete'] and not capture.get('access_stop')
    helper_path = ROOT / 'scripts/review-basic-diluted-legacy-v2.py'
    spec = importlib.util.spec_from_file_location('compound_units', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    def key(cik, row):
        return cik + '|' + json.dumps(row, sort_keys=True, separators=(',', ':'))
    original = {key(f['cik'], c['selected']): c['matched'] for f in primary['filings'] for c in f['checks']}
    assert len(original) == primary['observations']
    assert sum(original.values()) == primary['matched_observations']
    wanted = {k for k, matched in original.items() if not matched}
    results, supplement = [], {}
    for filing in capture['filings']:
        request = next(f for f in requests['filings'] if (f['cik'], f['accession']) == (filing['cik'], filing['accession']))
        rows = [c['selected'] for c in request['checks']]
        receipt = filing['instance_capture']
        assert receipt['status'] == 200
        prefix = f"https://www.sec.gov/Archives/edgar/data/{int(filing['cik'])}/{filing['accession'].replace('-', '')}/"
        assert receipt['url'].startswith(prefix)
        path = (ROOT / receipt['body_path']).resolve()
        path.relative_to(A / 'corpus-local')
        raw = path.read_bytes()
        assert sha(raw) == receipt['sha256'] and len(raw) == receipt['bytes']
        checks = helper.compare(raw, filing['cik'], rows)
        for check in checks:
            k = key(filing['cik'], check['selected'])
            assert k not in supplement and k in wanted
            supplement[k] = check['matched']
        results.append(dict(cik=filing['cik'], accession=filing['accession'], instance_capture=receipt, checks=checks))
    expected_filings = {(f['cik'], f['accession']) for f in primary['filings'] if any(not c['matched'] for c in f['checks'])}
    assert len(results) == len(expected_filings)
    assert {(f['cik'], f['accession']) for f in results} == expected_filings
    assert set(supplement) == wanted
    combined = {**original, **supplement}
    result = dict(schema='canli.basic-diluted-legacy-partition.v1', publication_approved=False,
        primary_review_sha256=sha(primary_raw), acquisition_input_sha256=sha(input_raw), capture_sha256=sha(capture_raw),
        code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
        filings=results, observations=len(supplement), matched_observations=sum(supplement.values()),
        combined_observations=len(combined), combined_matches=sum(combined.values()),
        scope='Exact previously unmatched partition using namespace-checked shares and currency/share units, issuer, period and value matching. Original inline gaps and currency-only acquisition checks remain preserved. Numerical closure does not establish dilution context, share-scale interpretation or admission.')
    with output_path.open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['observations','matched_observations','combined_observations','combined_matches']}))

if __name__ == '__main__':
    main()
