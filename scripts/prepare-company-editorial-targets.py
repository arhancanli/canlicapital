"""Prepare source-bound filing review targets; this never approves publication."""
import argparse
import hashlib
import json
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def prepare(delivery_dir, quality_path):
    manifest_bytes = (delivery_dir / 'delivery.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    quality_bytes = quality_path.read_bytes()
    quality = json.loads(quality_bytes)
    assert quality['delivery_manifest_sha256'] == digest(manifest_bytes)
    reasons = {}
    for page in quality['flagged_pages']:
        if 'constant_per_unit' in page['flags']:
            reasons.setdefault((page['cik'], page['tag']), set()).add('constant_per_unit')
    common_pairs = {
        frozenset(['EarningsPerShareBasic', 'EarningsPerShareDiluted']),
        frozenset(['WeightedAverageNumberOfDilutedSharesOutstanding',
                   'WeightedAverageNumberOfSharesOutstandingBasic']),
    }
    for group in quality['equal_vector_groups']:
        if frozenset(group['tags']) not in common_pairs:
            for tag in group['tags']:
                reasons.setdefault((group['cik'], tag), set()).add('unusual_equal_vector')
    targets = []
    for item in manifest['files']:
        wanted = {tag for cik, tag in reasons if cik == item['cik']}
        if not wanted:
            continue
        descriptor = item['selected']
        data = (delivery_dir / descriptor['storage_path']).read_bytes()
        assert len(data) == descriptor['bytes'] and digest(data) == descriptor['sha256']
        company = json.loads(data)
        assert company['cik'] == item['cik']
        assert company['source_sha256'] == item['source_sha256']
        for concept in company['concepts']:
            if concept['tag'] not in wanted:
                continue
            observations = concept['observations']
            latest = max(observations, key=lambda o: (o['filed'], o['accn']))
            accession = latest['accn']
            targets.append({
                'cik': company['cik'], 'name': company['name'], 'tag': concept['tag'],
                'reasons': sorted(reasons[(company['cik'], concept['tag'])]),
                'selected_sha256': descriptor['sha256'],
                'source_sha256': company['source_sha256'],
                'latest_selected_accession': accession,
                'filing_index_url': 'https://www.sec.gov/Archives/edgar/data/'
                    + str(int(company['cik'])) + '/' + accession.replace('-', '')
                    + '/' + accession + '-index.html',
                'latest_accession_observations': [o for o in observations if o['accn'] == accession],
                'all_selected_values_zero': all(o['val'] == 0 for o in observations),
                'disposition': 'PENDING_FILING_SCOPE_AND_USEFULNESS_REVIEW',
            })
    assert {(t['cik'], t['tag']) for t in targets} == set(reasons)
    targets.sort(key=lambda t: (t['cik'], t['tag']))
    return {
        'schema': 'canli.company-editorial-targets.v1',
        'publication_approved': False,
        'scope': 'Priority queue for constant histories and unusual equal vectors. Common EPS/share pairs and other quality flags remain outside this queue; latest filing review cannot prove all-history correctness.',
        'delivery_manifest_sha256': digest(manifest_bytes),
        'quality_report_sha256': digest(quality_bytes),
        'code_sha256': digest(Path(__file__).read_bytes()),
        'companies': len({t['cik'] for t in targets}),
        'concepts': len(targets),
        'filings': len({(t['cik'], t['latest_selected_accession']) for t in targets}),
        'targets': targets,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('delivery', type=Path)
    parser.add_argument('quality', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    report = prepare(args.delivery, args.quality)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['companies', 'concepts', 'filings']}))
