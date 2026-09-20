"""Extract latest selected liability pairs from hash-bound filing comparisons.

This prepares primary context for review; it does not admit pages or infer
classification from numerical equality. No network requests are made.
"""
import hashlib
import json
from pathlib import Path
import sys


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def build(root):
    artifacts = root / 'artifacts/seo'
    closure_raw = (artifacts / 'company-equal-history-numerical-closure-20260920.json').read_bytes()
    closure = json.loads(closure_raw)
    queue_raw = (artifacts / 'company-five-cohort-equal-history-review-20260920.json').read_bytes()
    if digest(queue_raw) != closure['queue_sha256']:
        raise ValueError('Queue binding mismatch')
    filings = []
    for item in closure['inputs'][:3]:
        raw = (root / item['path']).read_bytes()
        if digest(raw) != item['sha256']:
            raise ValueError('Comparison binding mismatch')
        filings.extend(json.loads(raw)['filings'])
    cases = []
    for case in json.loads(queue_raw)['cases']:
        if set(case['tags']) != {'Liabilities', 'LiabilitiesCurrent'}:
            continue
        evidence = []
        for series in case['observations']:
            latest_end = max(row['end'] for row in series['observations'])
            latest = [row for row in series['observations'] if row['end'] == latest_end]
            if len(latest) != 1:
                raise ValueError('Ambiguous latest selected observation')
            selected = dict(latest[0], tag=series['tag'])
            found = [(filing, check) for filing in filings
                     if filing['cik'] == case['cik'] and filing['accession'] == selected['accn']
                     for check in filing['checks'] if check['selected'] == selected]
            if len(found) != 1 or not found[0][1]['matched']:
                raise ValueError('Missing or ambiguous numerical evidence')
            filing, check = found[0]
            evidence.append({'primary_sha256': filing['primary_sha256'],
                             'url': filing['url'], 'check': check})
        a, b = [item['check']['selected'] for item in evidence]
        if any(a.get(key) != b.get(key) for key in ['end', 'unit', 'val', 'accn']):
            raise ValueError('Latest pair differs')
        inline = all(item['check']['match_method'] == 'INLINE_PRIMARY'
                     and any(match.get('table_row') for match in item['check']['matches'])
                     for item in evidence)
        cases.append({'cik': case['cik'], 'name': case['name'],
                      'source_sha256': case['source_sha256'],
                      'selected_sha256': case['selected_sha256'],
                      'latest_selected_end': a['end'],
                      'primary_rows_available': inline, 'evidence': evidence})
    return {'schema': 'canli.liability-presentation-review.v1',
            'publication_approved': False,
            'closure_sha256': digest(closure_raw),
            'code_sha256': digest(Path(__file__).read_bytes()),
            'groups': len(cases),
            'groups_with_primary_rows': sum(case['primary_rows_available'] for case in cases),
            'cases': cases,
            'scope': 'Latest selected reporting date per tag, not largest accession or latest available company filing. Primary rows are review evidence, not all-history admission or proof that concepts are interchangeable. XML-only cases still need primary context.'}


if __name__ == '__main__':
    output = Path(sys.argv[1])
    report = build(Path(__file__).resolve().parents[1])
    with output.open('x') as stream:
        stream.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['groups', 'groups_with_primary_rows']}))
