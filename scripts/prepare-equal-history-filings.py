"""Bind priority equality observations to retained primary filings; preserve gaps."""
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[1]
queue_path, output = map(Path, sys.argv[1:3])
assert len(sys.argv) in (3, 4), 'Usage: QUEUE NEW_OUTPUT [PRIOR_TARGETS]'
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
if len(sys.argv) == 4:
    previous_raw = Path(sys.argv[3]).read_bytes()
    previous = json.loads(previous_raw)
    assert previous['queue_sha256'] == sha(raw)
    prior = {(f['cik'], f['accession']): f for f in previous['filings']}
    assert len(prior) == len(previous['filings'])
    current = {(f['cik'], f['accession']): f for f in filings}
    for key, filing in prior.items():
        assert key in current
        assert current[key]['receipt']['sha256'] == filing['receipt']['sha256']
        assert current[key]['observations'] == filing['observations']
    report['prior_targets'] = {'path': sys.argv[3], 'sha256': sha(previous_raw),
                               'filings': len(prior), 'observations': previous['observation_count']}
    report['filings'] = [f for f in filings if (f['cik'], f['accession']) not in prior]
    report['observation_count'] = sum(len(f['observations']) for f in report['filings'])
    report['scope'] += ' This incremental target contains only filings absent from the pinned prior target; unchanged prior observations are counted separately.'
with output.open('x') as handle:
    json.dump(report, handle, indent=2)
    handle.write('\n')
print(json.dumps({'retained_filings': len(report['filings']), 'missing_filings': len(missing),
                  'observations': report['observation_count'], 'missing_observations': report['missing_observation_count']}))
