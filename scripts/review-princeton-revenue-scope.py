"""Retain the source passage behind a manual scope disposition; no admission."""
import hashlib
import json
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
comparison_path = ROOT / 'artifacts/seo/company-identity-inline-comparison-20260920.json'
comparison_bytes = comparison_path.read_bytes()
comparison = json.loads(comparison_bytes)
filing = next(f for f in comparison['filings'] if
              (f['cik'], f['accession']) == ('0000845385', '0001213900-23-024619'))
receipt = filing['primary_capture']
raw = (ROOT / receipt['body_path']).read_bytes()
assert receipt['status'] == 200 and len(raw) == receipt['bytes']
assert hashlib.sha256(raw).hexdigest() == receipt['sha256']
soup = BeautifulSoup(raw, 'html.parser')
checks = [c for c in filing['checks'] if c['selected']['tag'] == 'Revenues']
assert len(checks) == 3 and all(c['matched'] for c in checks)
tables = []
for check in checks:
    for match in check['matches']:
        fact = soup.find(attrs={'name': 'us-gaap:Revenues', 'contextref': match['context_id']})
        assert fact is not None and fact.find_parent('table') is not None
        tables.append(fact.find_parent('table').get_text(' ', strip=True))
assert len(set(tables)) == 1
full_text = soup.get_text(' ', strip=True)
table_text = tables[0]
position = full_text.index(table_text)
preceding = full_text[max(0, position - 1600):position]
assert 'Advantis Certified Staffing' in preceding
assert 'summarized financial information' in preceding
report = {
    'schema': 'canli.company-concept-scope-disposition.v1',
    'comparison_sha256': hashlib.sha256(comparison_bytes).hexdigest(),
    'cik': filing['cik'], 'accession': filing['accession'],
    'source_sha256': checks[0]['selected']['source_sha256'],
    'concept': 'Revenues', 'primary_capture': receipt,
    'preceding_filing_text': preceding, 'table_text': table_text,
    'matched_observations': [c['selected'] for c in checks],
    'reviewer': 'Source inspection; not independent human replication',
    'disposition': 'EXCLUDE_CONCEPT_BEFORE_ANY_IDENTITY_ADMISSION',
    'reason': 'The filing identifies this table as summarized financial information for Advantis Certified Staffing Solutions, Inc., an unconsolidated controlled portfolio company. Matching Princeton CIK contexts do not make these values Princeton revenue.',
    'publication_approved': False,
    'policy_changed': False,
    'limitations': 'Three latest-selected revenue observations inspected. Other concepts, prior observations and other issuers remain subject to review. Existing INVALID_ENTITY exclusion already prevents publication; no release object changes.'
}
output = ROOT / 'artifacts/seo/princeton-revenue-scope-20260920.json'
output.write_text(json.dumps(report, indent=2) + '\n')
print('Verified source passage and recorded exclusion requirement for three observations')
