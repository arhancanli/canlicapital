"""Replay unresolved concept observations against the retained legacy capture index."""
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlsplit
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    report_path = ROOT / 'artifacts/seo/company-retained-concept-review-20260920.json'
    index_path = ROOT / 'artifacts/seo/company-constant-xbrl-capture-index.json'
    targets_path = ROOT / 'artifacts/seo/company-retained-concept-targets-20260920.json'
    helper_path = ROOT / 'scripts/review-company-editorial-xbrl.py'
    report = json.loads(report_path.read_bytes())
    assert sha(targets_path.read_bytes()) == report['targets_sha256']
    assert sha(helper_path.read_bytes()) == report['xbrl_helper_sha256']
    targets = json.loads(targets_path.read_bytes())
    index = json.loads(index_path.read_bytes())
    spec = importlib.util.spec_from_file_location('legacy_compare', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    results = []
    table_ids = {'0000818479': [141, 144, 176], '0001227654': [180, 184, 199]}
    for filing in report['filings']:
        rows = [c['selected'] for c in filing['checks'] if not c['matched']]
        if not rows:
            continue
        candidates = [g for g in index['groups'] if g['cik'] == filing['cik']
                      and g['primary_capture']['sha256'] == filing['primary_sha256']
                      and g['primary_capture']['url'] == filing['url']]
        assert len(candidates) == 1
        capture = candidates[0]['captures']['instance']
        url = urlsplit(capture['url'])
        assert capture['status'] == 200 and url.scheme == 'https' and url.hostname == 'www.sec.gov'
        assert url.path.startswith('/Archives/edgar/data/' + str(int(filing['cik'])) + '/' + filing['accession'].replace('-', '') + '/')
        path = (ROOT / capture['path']).resolve()
        path.relative_to(ROOT / 'artifacts/seo/corpus-local')
        raw = path.read_bytes()
        assert len(raw) == capture['bytes'] and sha(raw) == capture['sha256']
        checks = helper.compare(raw, filing['cik'], rows)
        target = next(t for t in targets['filings'] if (t['cik'], t['accession']) == (filing['cik'], filing['accession']))
        primary = (ROOT / target['body_path']).read_bytes()
        assert sha(primary) == filing['primary_sha256']
        tables = BeautifulSoup(primary, 'html.parser').find_all('table')
        evidence = [{'zero_based_table_index': i, 'text': ' '.join(tables[i].stripped_strings)}
                    for i in table_ids[filing['cik']]]
        results.append({'cik': filing['cik'], 'accession': filing['accession'],
                        'primary_sha256': filing['primary_sha256'], 'primary_url': filing['url'],
                        'instance_capture': capture, 'checks': checks, 'primary_tables': evidence})
    supplement = {'schema': 'canli.legacy-concept-supplement.v1', 'publication_approved': False,
                  'original_report_sha256': sha(report_path.read_bytes()),
                  'legacy_index_sha256': sha(index_path.read_bytes()),
                  'helper_sha256': sha(helper_path.read_bytes()), 'code_sha256': sha(Path(__file__).read_bytes()),
                  'filings': results, 'additional_matches': sum(c['matched'] for f in results for c in f['checks']),
                  'scope': 'Offline supplement preserves the original eight unresolved rows. Legacy XML plus primary tables provide numerical evidence, not new-concept admission or all-history approval. No source acquisition.'}
    output = ROOT / 'artifacts/seo/company-legacy-concept-supplement-20260920.json'
    output.write_text(json.dumps(supplement, indent=2) + '\n')
    print(json.dumps({'filings': len(results), 'additional_matches': supplement['additional_matches'], 'sha256': sha(output.read_bytes())}))


if __name__ == '__main__':
    main()
