"""Select the next missing primary batch against frozen v22 source bindings."""
import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    limit = int(sys.argv[2])
    assert 1 <= limit <= 100
    baseline_path = A / 'corpus-local/company-basic-diluted-targets-20260920.json'
    baseline_raw = baseline_path.read_bytes()
    baseline = json.loads(baseline_raw)
    directory = A / 'corpus-local/company-five-cohort-delivery-v22'
    manifest_raw = (directory / 'delivery.json').read_bytes()
    assert sha(manifest_raw) == '16a18cdc8d0bb19e6363599a0b491a8bb9e06aeebadb9c33b5e34f69e9110271'
    files = {f['cik']: f for f in json.loads(manifest_raw)['files']}
    candidates = sorted(baseline['missing_filings'], key=lambda f: (-len(f['observations']), f['cik'], f['accession']))
    selected, skipped, targets = [], [], []
    retained_receipts = {}
    for path in sorted((A / 'corpus-local').glob('**/*-primary.receipt.json')):
        retained_receipts.setdefault(path.name, []).append(path)
    for filing in candidates:
        name = filing['cik'] + '-' + filing['accession'] + '-primary.receipt.json'
        retained = retained_receipts.get(name, [])
        if retained:
            hashes = set()
            for path in retained:
                receipt = json.loads(path.read_bytes())
                assert receipt['status'] == 200, 'Inspect prior access/fetch failure before acquisition'
                url = urlsplit(receipt['url'])
                assert url.scheme == 'https' and url.hostname == 'www.sec.gov'
                assert url.path.startswith(f"/Archives/edgar/data/{int(filing['cik'])}/{filing['accession'].replace('-', '')}/")
                body = (ROOT / receipt['body_path']).read_bytes()
                assert sha(body) == receipt['sha256'] and len(body) == receipt['bytes']
                hashes.add(receipt['sha256'])
            assert len(hashes) == 1, 'Conflicting retained primary bodies; inspect before acquisition'
            skipped.append({'cik': filing['cik'], 'accession': filing['accession']})
            continue
        file = files[filing['cik']]
        raw = (directory / file['selected']['storage_path']).read_bytes()
        assert sha(raw) == file['selected']['sha256'] and len(raw) == file['selected']['bytes']
        record = json.loads(raw)
        assert record['source_sha256'] == file['source_sha256']
        assert record['selection_policy'] == 'extended-v22'
        by_tag = {}
        for row in filing['observations']:
            concept = next(c for c in record['concepts'] if c['tag'] == row['tag'])
            observation = {k: v for k, v in row.items() if k != 'tag'}
            assert observation in concept['observations'], 'Baseline observation no longer selected'
            by_tag.setdefault(row['tag'], []).append(observation)
        for tag, observations in sorted(by_tag.items()):
            targets.append(dict(cik=filing['cik'], name=filing['name'], tag=tag,
                source_sha256=file['source_sha256'], selected_sha256=file['selected']['sha256'],
                latest_selected_accession=filing['accession'], latest_accession_observations=observations))
        selected.append({'cik': filing['cik'], 'accession': filing['accession'], 'observations': len(filing['observations'])})
        if len(selected) == limit:
            break
    result = dict(schema='canli.basic-diluted-capture-batch.v2', publication_approved=False,
        baseline_sha256=sha(baseline_raw), delivery_manifest_sha256=sha(manifest_raw),
        code_sha256=sha(Path(__file__).read_bytes()), requested_limit=limit,
        selected_filings=selected, skipped_retained=skipped, targets=targets,
        observations=sum(f['observations'] for f in selected),
        scope='Bounded primary acquisition batch ranked by missing-observation coverage, then CIK/accession. Exact observations still present in current v22 records; existing captures skipped. Acquisition is not numerical or accounting-scope approval. No source alteration or publication.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'filings': len(selected), 'observations': result['observations'], 'skipped_retained': len(skipped)}))

if __name__ == '__main__':
    main()
