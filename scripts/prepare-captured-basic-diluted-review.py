"""Bind a completed acquisition batch to exact primary comparison inputs."""
import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    target_path, capture_path, output_path = map(Path, sys.argv[1:4])
    target_raw, capture_raw = target_path.read_bytes(), capture_path.read_bytes()
    targets, capture = json.loads(target_raw), json.loads(capture_raw)
    assert capture['complete'] and not capture.get('error') and not capture.get('stopped_on_access_response'), 'Acquisition has not completed successfully'
    assert capture['input_sha256'] == sha(target_raw)
    wanted = {}
    for target in targets['targets']:
        key = (target['cik'], target['latest_selected_accession'])
        entry = wanted.setdefault(key, dict(cik=key[0], accession=key[1], name=target['name'], observations=[]))
        for row in target['latest_accession_observations']:
            assert row['accn'] == key[1]
            observation = dict(row, tag=target['tag'])
            assert observation not in entry['observations'], 'Duplicate target observation'
            entry['observations'].append(observation)
    captured = {(f['cik'], f['accession']): f for f in capture['filings']}
    assert len(captured) == len(capture['filings']) and set(captured) == set(wanted)
    filings, unresolved = [], []
    for key, entry in sorted(wanted.items()):
        filing = captured[key]
        if filing.get('state') != 'PRIMARY_CAPTURED_EDITORIAL_REVIEW_PENDING':
            unresolved.append(dict(**entry, capture_state=filing.get('state')))
            continue
        receipt = filing['primary_capture']
        url = urlsplit(receipt['url'])
        assert url.scheme == 'https' and url.hostname == 'www.sec.gov'
        assert url.path.startswith(f'/Archives/edgar/data/{int(key[0])}/{key[1].replace("-", "")}/')
        body_path = (ROOT / receipt['body_path']).resolve()
        body_path.relative_to(ROOT / 'artifacts/seo/corpus-local')
        raw = body_path.read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256']
        receipt_path = body_path.with_suffix('.receipt.json')
        receipt_raw = receipt_path.read_bytes()
        assert json.loads(receipt_raw) == receipt
        entry['observations'].sort(key=lambda row: (row['tag'], row['end'], row.get('start', ''), row['unit']))
        filings.append(dict(**entry, receipt=receipt, receipt_path=str(receipt_path.relative_to(ROOT)),
                            receipt_sha256=sha(receipt_raw), body_path=receipt['body_path']))
    count = sum(len(f['observations']) for f in filings)
    missing = sum(len(f['observations']) for f in unresolved)
    assert count + missing == targets['observations']
    result = dict(schema='canli.basic-diluted-captured-review-targets.v1', publication_approved=False,
        targets_sha256=sha(target_raw), capture_sha256=sha(capture_raw),
        code_sha256=sha(Path(__file__).read_bytes()), filings=filings, observation_count=count,
        unresolved_filings=unresolved, unresolved_observation_count=missing,
        scope='Completed batch partitioned into exact verified primary inputs and explicit capture gaps. Source identity/accounting context and numerical matches require subsequent review. No admission or production change.')
    with output_path.open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(filings=len(filings), observations=count, unresolved_filings=len(unresolved), unresolved_observations=missing)))

if __name__ == '__main__':
    main()
