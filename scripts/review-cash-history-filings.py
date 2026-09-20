"""Compare all queued historical cash observations to their retained primary HTML."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    targets_path = ROOT / 'artifacts/seo/company-cash-history-targets-20260920.json'
    capture_path = ROOT / 'artifacts/seo/company-cash-history-capture-20260920.json'
    helper_path = ROOT / 'scripts/review-retained-concept-filings.py'
    targets = json.loads(targets_path.read_bytes())
    capture = json.loads(capture_path.read_bytes())
    assert capture['complete'] and not capture.get('error') and not capture.get('stopped_on_access_response')
    assert capture['input_sha256'] == sha(targets_path.read_bytes())
    spec = importlib.util.spec_from_file_location('cash_inline', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    by_filing = {(t['cik'], t['latest_selected_accession']): t for t in targets['targets']}
    assert len(by_filing) == len(targets['targets']) == len(capture['filings'])
    assert set(by_filing) == {(f['cik'], f['accession']) for f in capture['filings']}
    results = []
    for filing in capture['filings']:
        target = by_filing[(filing['cik'], filing['accession'])]
        receipt = filing['primary_capture']
        raw = (ROOT / receipt['body_path']).read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256']
        rows = [{**r, 'tag': target['tag']} for r in target['observations']]
        assert all(r['accn'] == filing['accession'] for r in rows)
        comparison = helper.compare(raw, filing['cik'], rows)
        results.append({'cik': filing['cik'], 'accession': filing['accession'],
                        'primary_capture': receipt, **comparison})
    assert sum(len(f['checks']) for f in results) == targets['observations']
    report = {'schema': 'canli.cash-history-inline.v1', 'publication_approved': False,
              'capture_report_sha256': sha(capture_path.read_bytes()), 'targets_sha256': sha(targets_path.read_bytes()),
              'helper_sha256': sha(helper_path.read_bytes()), 'code_sha256': sha(Path(__file__).read_bytes()),
              'filings': results, 'scope': 'All queued historical rows, not only latest periods. Unsupported or absent inline facts remain unresolved. No source admission.'}
    output = ROOT / 'artifacts/seo/company-cash-history-inline-20260920.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'observations': targets['observations'], 'inline_matches': sum(c['matched'] for f in results for c in f['checks'])}))


if __name__ == '__main__':
    main()
