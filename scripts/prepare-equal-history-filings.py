"""Bind priority equality observations to retained primary filings; preserve gaps."""
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[1]
queue_path, output = map(Path, sys.argv[1:])
raw = queue_path.read_bytes()
queue = json.loads(raw)
sha = lambda value: hashlib.sha256(value).hexdigest()
wanted = {}
for case in queue['cases']:
    if case['category'] == 'basic_diluted_nonzero_equality':
        continue
    for concept in case['observations']:
        for row in concept['observations']:
            key = (case['cik'], row['accn'])
            entry = wanted.setdefault(key, {'cik': case['cik'], 'accession': row['accn'],
                                           'name': case['name'], 'observations': []})
            observation = {'tag': concept['tag'], **row}
            if observation not in entry['observations']:
                entry['observations'].append(observation)

retained = {}
for path in sorted((root / 'artifacts/seo/corpus-local').glob('**/*-primary.receipt.json')):
    match = re.fullmatch(r'(\d{10})-(\d{10}-\d{2}-\d{6})-primary.receipt.json', path.name)
    if not match or match.groups() not in wanted:
        continue
    receipt_raw = path.read_bytes()
    receipt = json.loads(receipt_raw)
    if receipt['status'] != 200:
        continue
    body_path = root / receipt.get('body_path', str(path).replace('.receipt.json', '.response'))
    body = body_path.read_bytes()
    assert sha(body) == receipt['sha256'] and len(body) == receipt['bytes']
    url = urlsplit(receipt['url'])
    cik, accn = match.groups()
    assert url.scheme == 'https' and url.hostname == 'www.sec.gov'
    assert url.path.startswith(f'/Archives/edgar/data/{int(cik)}/{accn.replace("-", "")}/')
    evidence = {'receipt_path': str(path.relative_to(root)), 'receipt_sha256': sha(receipt_raw),
                'receipt': receipt, 'body_path': str(body_path.relative_to(root))}
    if match.groups() in retained:
        assert retained[match.groups()]['receipt']['sha256'] == receipt['sha256']
    else:
        retained[match.groups()] = evidence

filings, missing = [], []
for key, entry in sorted(wanted.items()):
    entry['observations'].sort(key=lambda row: (row['tag'], row['end'], row.get('start', ''), row['unit']))
    if key in retained:
        filings.append({**entry, **retained[key]})
    else:
        missing.append(entry)
report = {'schema': 'canli.equal-history-retained-targets.v1', 'publication_approved': False,
          'queue_sha256': sha(raw), 'code_sha256': sha(Path(__file__).read_bytes()),
          'filings': filings, 'missing_filings': missing,
          'observation_count': sum(len(f['observations']) for f in filings),
          'missing_observation_count': sum(len(f['observations']) for f in missing),
          'scope': 'All non-basic/diluted equality cases mapped to exact selected accessions. Missing primary captures remain explicit; retained presence is not numerical or scope verification. No source requests or admission.'}
with output.open('x') as handle:
    json.dump(report, handle, indent=2)
    handle.write('\n')
print(json.dumps({'retained_filings': len(filings), 'missing_filings': len(missing),
                  'observations': report['observation_count'], 'missing_observations': report['missing_observation_count']}))
