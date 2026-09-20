"""Recover previously attempted identities from retained, hash-bound SEC ledgers."""
import hashlib
import json
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'artifacts/seo/retained-issuer-discovery-20260920.json'
bindings = json.loads(source.read_bytes())['bindings']
parts = [b for b in bindings if Path(b['source_path']).name.startswith('issuer-status-')
         and Path(b['source_path']).suffix == '.parquet']
if not parts:
    raise ValueError('Missing retained acquisition ledgers')
ciks = set()
for binding in parts:
    path = ROOT / binding['retained_path']
    raw = path.read_bytes()
    if len(raw) != binding['bytes'] or hashlib.sha256(raw).hexdigest() != binding['sha256']:
        raise ValueError('Retained acquisition ledger changed')
    for row in pq.read_table(path, columns=['cik']).to_pylist():
        value = str(row['cik'])
        if not value.isascii() or not value.isdigit() or not 0 < int(value) <= 9999999999:
            raise ValueError('Invalid retained identity')
        ciks.add(value.zfill(10))
output = ROOT / 'artifacts/seo/retained-companyfacts-attempted-ciks-20260920.json'
queue = (json.dumps(sorted(ciks), indent=2) + '\n').encode()
if output.exists() and output.read_bytes() != queue:
    raise ValueError('Existing holdback queue differs; review before changing')
output.write_bytes(queue)
report = {'schema': 'canli.retained-acquisition-holdbacks.v1',
          'input_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'bindings': parts, 'count': len(ciks), 'queue_path': str(output.relative_to(ROOT)),
          'queue_sha256': hashlib.sha256(queue).hexdigest(),
          'scope': 'All identities in retained acquisition status ledgers, regardless of outcome. Exclude from new capture queues to avoid implicit reacquisition. No returns read, network request or eligibility inference.'}
(ROOT / 'artifacts/seo/retained-companyfacts-holdbacks-20260920.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'retained_status_parts': len(parts), 'previously_attempted_ciks': len(ciks)}))
