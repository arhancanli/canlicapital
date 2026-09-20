"""Reproduce two bounded cash-history scope reviews from retained filing bytes."""
import hashlib
import importlib.util
import json
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
TAG = 'CashAndCashEquivalentsAtCarryingValue'
CASES = {
    '0000825313': {
        'accession': '0000825313-19-000006', 'tables': [99, 125, 126],
        'visible_year_ends': ['2016-12-31', '2017-12-31', '2018-12-31'],
        'scope_note': 'The zero-cash statement is headed AllianceBernstein Holding L.P. The separate statement headed AllianceBernstein L.P. and Subsidiaries reports nonzero consolidated cash. Those balances belong to different statement entities; do not replace the holding partnership facts with the operating partnership amounts. Earlier historical periods remain unreviewed here.',
    },
    '0001062506': {
        'accession': '0001548123-21-000030', 'tables': [8],
        'visible_year_ends': ['2019-12-31', '2020-12-31'],
        'scope_note': 'Atlantica cash-flow statement reports zero closing cash for 2019 and 2020, while financing proceeds offset operating cash use. Zero closing cash does not mean no cash flows or expenses. No conclusion about other years or revenue scope follows.',
    },
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    delivery_dir = ROOT / 'artifacts/seo/corpus-local/company-three-cohort-delivery-v3'
    manifest_path = delivery_dir / 'delivery.json'
    manifest = json.loads(manifest_path.read_bytes())
    original_path = ROOT / 'artifacts/seo/company-constant-xbrl-comparison.json'
    original = json.loads(original_path.read_bytes())
    helper_path = ROOT / 'scripts/review-company-editorial-xbrl.py'
    spec = importlib.util.spec_from_file_location('cash_xbrl', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    results = []
    for cik, config in CASES.items():
        item = next(f for f in manifest['files'] if f['cik'] == cik)
        selected = (delivery_dir / item['selected']['storage_path']).read_bytes()
        assert sha(selected) == item['selected']['sha256'] and len(selected) == item['selected']['bytes']
        record = json.loads(selected)
        assert record['cik'] == cik and record['source_sha256'] == item['source_sha256']
        group = next(g for g in original['groups'] if g['cik'] == cik and TAG in g['tags'])
        assert group['source_sha256'] == record['source_sha256']
        prefix = ROOT / ('artifacts/seo/corpus-local/editorial-constant-filings/' + cik + '-' + config['accession'])
        primary_path = Path(str(prefix) + '-primary.response')
        primary = primary_path.read_bytes()
        assert sha(primary) == group['primary_capture']['sha256'] and len(primary) == group['primary_capture']['bytes']
        instance_meta = group['captures']['instance']
        instance = (ROOT / instance_meta['path']).read_bytes()
        assert sha(instance) == instance_meta['sha256'] and len(instance) == instance_meta['bytes']
        concept = next(c for c in record['concepts'] if c['tag'] == TAG)
        observations = [{**r, 'tag': TAG} for r in concept['observations'] if r['accn'] == config['accession']]
        checks = helper.compare(instance, cik, observations)
        assert checks and all(c['matched'] for c in checks)
        assert set(config['visible_year_ends']).issubset({r['end'] for r in observations})
        soup = BeautifulSoup(primary, 'html.parser')
        tables = soup.find_all('table')
        extracts = []
        for i in config['tables']:
            table = tables[i]
            extracts.append({'zero_based_table_index': i, 'text': ' '.join(table.stripped_strings),
                             'preceding_text': ' '.join(table.find_all_previous(string=True, limit=60)[::-1])[-2400:]})
        results.append({'cik': cik, 'name': record['name'], 'tag': TAG,
                        'source_sha256': record['source_sha256'], 'selected_sha256': sha(selected),
                        'primary_path': str(primary_path.relative_to(ROOT)), 'primary_capture': group['primary_capture'],
                        'instance_capture': instance_meta, 'checks': checks, 'tables': extracts,
                        'selected_history_observations': len(concept['observations']),
                        'observations_outside_inspected_accession': len(concept['observations']) - len(observations),
                        'visible_year_ends': config['visible_year_ends'], 'scope_note': config['scope_note'],
                        'disposition': 'SUPPORTED_IN_LISTED_STATEMENTS_ONLY'})
    report = {'schema': 'canli.retained-cash-scope.v1', 'publication_approved': False,
              'manifest_sha256': sha(manifest_path.read_bytes()), 'prior_comparison_sha256': sha(original_path.read_bytes()),
              'helper_sha256': sha(helper_path.read_bytes()), 'code_sha256': sha(Path(__file__).read_bytes()), 'cases': results,
              'scope': 'Two historical cash scope cases only. Five visible year-end columns plus XBRL comparisons for all selected rows in those accessions. No new capture, all-history approval, policy change, or inference that zero closing cash means no activity.'}
    output = ROOT / 'artifacts/seo/company-retained-cash-scope-20260920.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'cases': len(results), 'matched_observations': sum(len(c['checks']) for c in results),
                      'outside_inspected_accessions': sum(c['observations_outside_inspected_accession'] for c in results),
                      'report_sha256': sha(output.read_bytes())}))


if __name__ == '__main__':
    main()
