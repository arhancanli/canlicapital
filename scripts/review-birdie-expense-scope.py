"""Replay the source-scope discrepancy in Birdie Win's selected SG&A history."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    queue_raw = (A / 'company-five-cohort-equal-history-review-20260920.json').read_bytes()
    case = next(c for c in json.loads(queue_raw)['cases'] if c['cik'] == '0001873213' and 'SellingGeneralAndAdministrativeExpense' in c['tags'])
    targets = []
    for p in sorted(A.glob('company-equal-history-*targets-20260920.json')):
        targets.extend(json.loads(p.read_bytes()).get('filings', []))
    filings = []
    config = [('0001493152-25-017715', [51, 74, 76]), ('0001493152-24-039471', [59, 89, 91])]
    for accession, indices in config:
        matches = [t for t in targets if t.get('cik') == case['cik'] and t.get('accession') == accession and 'body_path' in t]
        if len(matches) != 1:
            raise ValueError('Missing or ambiguous primary target')
        t = matches[0]
        raw = (ROOT / t['body_path']).read_bytes()
        # Bind to the comparison report's independently retained primary hash.
        reviewed = []
        for stem in ['retained-review-qname', 'incremental-review', 'final-primary-review']:
            report = json.loads((A / ('company-equal-history-' + stem + '-20260920.json')).read_bytes())
            reviewed.extend(f for f in report['filings'] if f['cik'] == case['cik'] and f['accession'] == accession)
        if len(reviewed) != 1 or sha(raw) != reviewed[0]['primary_sha256']:
            raise ValueError('Primary comparison binding mismatch')
        tables = BeautifulSoup(raw, 'html.parser').find_all('table')
        filings.append({'accession': accession, 'primary_sha256': sha(raw), 'primary_path': t['body_path'], 'url': reviewed[0]['url'],
                        'tables': [{'zero_based_index': i, 'text': ' '.join(' '.join(tables[i].stripped_strings).split())} for i in indices]})
    differences = [{'end': '2025-07-31', 'statement_general_administrative': 47162, 'depreciation': 137, 'selected_sga_and_operating_total': 47299},
                   {'end': '2024-07-31', 'statement_general_administrative': 48364, 'depreciation': 718, 'selected_sga_and_operating_total': 49082},
                   {'end': '2023-07-31', 'statement_general_administrative': 29237, 'depreciation': 744, 'selected_sga_and_operating_total': 29981}]
    for difference in differences:
        if difference['statement_general_administrative'] + difference['depreciation'] != difference['selected_sga_and_operating_total']:
            raise ValueError('Expense bridge mismatch')
        for series in case['observations']:
            rows = [row for row in series['observations'] if row['end'] == difference['end']]
            if len(rows) != 1 or rows[0]['val'] != difference['selected_sga_and_operating_total'] or rows[0]['unit'] != 'USD':
                raise ValueError('Selected history changed')
        statement = filings[1 if difference['end'] == '2023-07-31' else 0]['tables'][0]['text']
        if not all(f'{difference[key]:,}' in statement for key in ['statement_general_administrative', 'depreciation', 'selected_sga_and_operating_total']):
            raise ValueError('Statement evidence changed')
    result = {'schema': 'canli.birdie-expense-scope.v1', 'publication_approved': False, 'queue_sha256': sha(queue_raw), 'code_sha256': sha(Path(__file__).read_bytes()),
              'cik': case['cik'], 'source_sha256': case['source_sha256'], 'selected_sha256': case['selected_sha256'], 'filings': filings, 'differences': differences,
              'disposition': 'WITHHOLD_SGA_HISTORY_PENDING_VERSIONED_POLICY',
              'interpretation': 'All three selected SG&A amounts come from segment presentations that aggregate statement general and administrative expenses with separately reported depreciation. Operating expense totals reproduce; the SG&A history is not the distinct consolidated statement line. Do not relabel or replace the source values. Withhold this SG&A history under a new source-bound policy before publication.',
              'scope': 'All three selected Birdie Win SG&A periods in the captured source; no assertion about future sources or every company.'}
    with Path(sys.argv[1]).open('x') as stream:
        stream.write(json.dumps(result, indent=2) + '\n')
    print('Three selected SG&A scope discrepancies verified')
if __name__ == '__main__':
    main()
