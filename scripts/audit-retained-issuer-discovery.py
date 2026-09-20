"""Read retained SEC identity metadata; do not fetch, publish or open returns."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

import pyarrow.parquet as pq

site = Path(__file__).resolve().parents[1]
engine = Path(sys.argv[1]).resolve()
retained = site / 'artifacts/seo/corpus-local/retained-issuer-discovery'
retained.mkdir(parents=True, exist_ok=True)
bindings = []


def capture(path):
    body = path.read_bytes()
    digest = hashlib.sha256(body).hexdigest()
    destination = retained / (digest + path.suffix)
    if destination.exists():
        assert destination.read_bytes() == body
    else:
        destination.write_bytes(body)
    bindings.append({'source_path': str(path), 'sha256': digest, 'bytes': len(body),
                     'retained_path': str(destination.relative_to(site))})
    return body


def identities(value):
    assert isinstance(value, dict)
    result = set()
    for row in value.values():
        cik = row['cik_str']
        assert type(cik) is int and 0 < cik <= 9999999999
        result.add(str(cik).zfill(10))
    return result


current = identities(json.loads(capture(site / 'artifacts/seo/corpus-local/next-1000/company_tickers.json')))
older = identities(json.loads(capture(engine / 'data/raw/repurchase_issuance_flow/company_tickers.json')))
delivery = json.loads(capture(site / 'artifacts/seo/corpus-local/company-three-cohort-delivery-v3/delivery.json'))
admitted = {row['cik'] for row in delivery['files']}
attempted = set()
for cohort in ['fresh-review', 'next-1000', 'third-1000']:
    attempted.update(json.loads(capture(site / f'artifacts/seo/corpus-local/{cohort}/ciks.json')))
new = older - current
candidates = new - admitted - attempted
statuses = {}
parts = engine / 'artifacts/feasibility/repurchase_issuance_flow/companyfacts_parts'
for path in sorted(parts.glob('issuer-status-*.parquet')):
    capture(path)
    for row in pq.read_table(path, columns=['cik', 'raw_sha256', 'raw_bytes', 'error']).to_pylist():
        cik = str(row['cik']).zfill(10)
        if cik in new:
            statuses.setdefault(cik, []).append(row)
website_unattempted = set(candidates)
candidates -= set(statuses)
checks = []
for cik, rows in sorted(statuses.items()):
    check = {'cik': cik, 'new_unattempted_candidate': cik in candidates, 'status_rows': len(rows)}
    path = engine / f'data/raw/repurchase_issuance_flow/companyfacts/CIK{cik}.json.gz'
    hashes = {row['raw_sha256'] for row in rows if row['raw_sha256']}
    check['distinct_recorded_source_hashes'] = sorted(hashes)
    if not path.exists():
        check['state'] = 'NO_RETAINED_SOURCE_BODY'
    else:
        raw = gzip.decompress(capture(path))
        digest = hashlib.sha256(raw).hexdigest()
        matched = [row for row in rows if row['raw_sha256'] == digest and row['raw_bytes'] == len(raw) and not row['error']]
        payload = json.loads(raw)
        check.update(raw_sha256=digest, raw_bytes=len(raw), entity_name=payload.get('entityName'))
        source_cik = payload.get('cik')
        check['source_cik_type'] = type(source_cik).__name__
        if not matched:
            check['state'] = 'CACHE_BINDING_MISMATCH'
        elif type(source_cik) is int and source_cik == int(cik):
            check['state'] = 'CACHE_MATCHES_RECORDED_HASH_AND_IDENTITY'
        elif isinstance(source_cik, str) and source_cik.isdigit() and int(source_cik) == int(cik):
            check['state'] = 'HASH_MATCHES_BUT_STRING_CIK_REQUIRES_SCHEMA_REVIEW'
        else:
            check['state'] = 'ENTITY_IDENTITY_MISMATCH' 
        check['capture_timestamp_status'] = 'NO_PER_RESPONSE_TIMESTAMP_VERIFIED'
    checks.append(check)
report = {'schema': 'canli.retained-issuer-discovery.v1', 'network_requests': 0,
          'counts': {'current_discovery': len(current), 'retained_discovery': len(older),
                     'retained_outside_current': len(new), 'combined_discovery': len(current | older),
                     'outside_current_already_admitted': len(new & admitted),
                     'outside_current_previously_attempted_not_admitted': len((new & attempted) - admitted),
                     'new_before_retained_attempt_review': len(website_unattempted),
                     'retained_attempt_holdbacks': len(website_unattempted & set(statuses)),
                     'new_unattempted_candidates': len(candidates)},
          'candidate_ciks': sorted(candidates), 'cached_source_checks': checks, 'bindings': bindings,
          'publication_approved': False,
          'claim_boundary': 'Identity discovery only. Names do not prove current listing or company-page eligibility. Prior attempted identities stay excluded. Cached bytes matching an old record do not establish HTTP status, per-response capture time, fresh acquisition or editorial approval. No return data opened or trial identity spent.'}
output = Path(sys.argv[2]) if len(sys.argv) > 2 else site / 'artifacts/seo/retained-issuer-discovery-20260920.json'
output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'counts': report['counts'], 'cached_source_checks': checks}, indent=2))
