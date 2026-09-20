"""Bind the complete deferred queue, retained coverage and exact primary results."""
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    descriptors = {}
    reports = []
    for stem in ['review', 'targets', 'primary-review']:
        name = 'company-basic-diluted-' + stem + '-20260920.json'
        raw = (A/'corpus-local'/name).read_bytes()
        packed = gzip.compress(raw, mtime=0)
        archive = A/(name+'.gz')
        if archive.exists():
            if gzip.decompress(archive.read_bytes()) != raw:
                raise ValueError('Preserve existing compressed evidence')
        else:
            with archive.open('xb') as f:
                f.write(packed)
        descriptors[stem] = dict(path=str(archive.relative_to(ROOT)), sha256=sha(archive.read_bytes()), uncompressed_sha256=sha(raw), bytes=archive.stat().st_size)
        reports.append(json.loads(raw))
    queue, targets, compared = reports
    if targets['queue_sha256'] != descriptors['review']['uncompressed_sha256'] or compared['targets_sha256'] != descriptors['targets']['uncompressed_sha256']:
        raise ValueError('Report input binding changed')
    def key(cik, row):
        return cik + '|' + json.dumps(row, sort_keys=True, separators=(',', ':'))
    wanted = {key(c['cik'], {'tag': t['tag'], **r}) for c in queue['cases'] for t in c['observations'] for r in t['observations']}
    retained = {key(f['cik'], r) for f in targets['filings'] for r in f['observations']}
    missing = {key(f['cik'], r) for f in targets['missing_filings'] for r in f['observations']}
    checks = {key(f['cik'], c['selected']): c['matched'] for f in compared['filings'] for c in f['checks']}
    if retained & missing or retained | missing != wanted or set(checks) != retained:
        raise ValueError('Exact observation partition changed')
    unresolved = [dict(cik=f['cik'], accession=f['accession'], selected=c['selected']) for f in compared['filings'] for c in f['checks'] if not c['matched']]
    unusual = [dict(cik=c['cik'], name=c['name'], selected={'tag': t['tag'], **r}) for c in queue['cases'] for t in c['observations'] for r in t['observations'] if r['unit']=='AFN/shares']
    result = dict(schema='canli.basic-diluted-coverage.v1', publication_approved=False,
        code_sha256=sha(Path(__file__).read_bytes()), reports=descriptors,
        groups=queue['groups'], companies=queue['companies'], pairs=queue['pairs'],
        original_unique_observations=len(wanted), retained_filings=len(targets['filings']),
        missing_filings=len(targets['missing_filings']), retained_observations=len(retained),
        missing_observations=len(missing), primary_numerical_matches=sum(checks.values()),
        unresolved_primary_observations=unresolved, unit_follow_up=unusual,
        unit_follow_up_boundary='AFN/share observations require original filing review. No currency correction or source-error conclusion is established.',
        scope='Exact current-policy deferred queue partition; retained convenience sample only. Numerical matches are not dilution scope, distinct reader value or admission. Full reports retained as lossless compressed artifacts; referenced primary captures are not bundled here.')
    with Path(sys.argv[1]).open('x') as f:
        f.write(json.dumps(result, indent=2)+'\n')
    print(json.dumps({k: result[k] for k in ['groups','companies','original_unique_observations','retained_filings','missing_filings','primary_numerical_matches']}))

if __name__ == '__main__':
    main()
