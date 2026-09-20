"""Expand a bound priority review into every selected filing, without approval."""
import argparse
import hashlib
import json
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def prepare(delivery, priority_path):
    manifest_bytes = (delivery / 'delivery.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    priority_bytes = priority_path.read_bytes()
    priority = json.loads(priority_bytes)
    if priority.get('delivery_manifest_sha256') != digest(manifest_bytes):
        raise ValueError('Priority review does not bind this delivery')
    files = {item['cik']: item for item in manifest['files']}
    if len(files) != len(manifest['files']):
        raise ValueError('Duplicate delivery company')
    targets, seen = [], set()
    for target in priority['targets']:
        key = (target['cik'], target['tag'])
        if key in seen:
            raise ValueError('Duplicate priority concept')
        seen.add(key)
        item = files[target['cik']]
        descriptor = item['selected']
        path = (delivery / descriptor['storage_path']).resolve()
        if delivery.resolve() not in path.parents:
            raise ValueError('Selected object escapes delivery')
        raw = path.read_bytes()
        if (len(raw) != descriptor['bytes'] or digest(raw) != descriptor['sha256']
                or target['selected_sha256'] != descriptor['sha256']):
            raise ValueError('Selected object binding mismatch')
        record = json.loads(raw)
        if (record['cik'] != target['cik'] or record['source_sha256'] != item['source_sha256']
                or target['source_sha256'] != item['source_sha256']):
            raise ValueError('Company source binding mismatch')
        concepts = [c for c in record['concepts'] if c['tag'] == target['tag']]
        if len(concepts) != 1:
            raise ValueError('Missing or ambiguous selected concept')
        observations = concepts[0]['observations']
        latest = max(observations, key=lambda o: (o['filed'], o['accn']))['accn']
        if (latest != target['latest_selected_accession'] or
                [o for o in observations if o['accn'] == latest]
                != target['latest_accession_observations']):
            raise ValueError('Latest priority observations do not reproduce')
        for accession in sorted({o['accn'] for o in observations}):
            targets.append({
                'cik': record['cik'], 'name': record['name'], 'tag': target['tag'],
                'reasons': target['reasons'], 'selected_sha256': descriptor['sha256'],
                'source_sha256': record['source_sha256'], 'accession': accession,
                'is_latest_selected_accession': accession == latest,
                'filing_index_url': 'https://www.sec.gov/Archives/edgar/data/'
                    + str(int(record['cik'])) + '/' + accession.replace('-', '')
                    + '/' + accession + '-index.html',
                'observations': [o for o in observations if o['accn'] == accession],
                'disposition': 'PENDING_NUMERICAL_SCOPE_AND_USEFULNESS_REVIEW',
            })
    targets.sort(key=lambda t: (t['cik'], t['tag'], t['accession']))
    latest_filings = {(t['cik'], t['accession']) for t in targets if t['is_latest_selected_accession']}
    all_filings = {(t['cik'], t['accession']) for t in targets}
    return {
        'schema': 'canli.company-history-review-targets.v1', 'publication_approved': False,
        'claim_boundary': 'Every selected observation for priority concepts only. Latest and earlier filings both require review; inclusion does not establish that a filing was captured, checked or semantically approved. Other concepts remain outside this queue.',
        'delivery_manifest_sha256': digest(manifest_bytes),
        'priority_report_sha256': digest(priority_bytes),
        'code_sha256': digest(Path(__file__).read_bytes()),
        'companies': len({t['cik'] for t in targets}), 'concepts': len(seen),
        'filings': len(all_filings), 'latest_filings': len(latest_filings),
        'additional_filings_beyond_latest_queue': len(all_filings - latest_filings),
        'observations': sum(len(t['observations']) for t in targets),
        'earlier_accession_observations': sum(len(t['observations']) for t in targets if not t['is_latest_selected_accession']),
        'targets': targets,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('delivery', type=Path)
    parser.add_argument('priority', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    report = prepare(args.delivery, args.priority)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k not in {'targets', 'claim_boundary'}}))
