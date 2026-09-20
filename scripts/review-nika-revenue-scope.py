"""Bind an unresolved revenue/income interpretation to retained filing bytes."""
import hashlib
import json
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
sha = lambda b: hashlib.sha256(b).hexdigest()
prior_path = ROOT / 'artifacts/seo/company-fourth-retained-zero-review-20260920.json'
prior_raw = prior_path.read_bytes()
prior = json.loads(prior_raw)
case = next(c for c in prior['cases'] if c['cik'] == '0001145604' and c['tag'] == 'Revenues')
assert case['disposition'] == 'NARRATIVE_INCOME_SCOPE_REMAINS_OPEN'
inputs = {'quality': 'company-fourth-selected-quality-v6.json',
          'targets': 'company-fourth-editorial-targets-20260920.json',
          'capture': 'company-fourth-filing-capture-20260920.json',
          'inline': 'company-fourth-inline-comparison-20260920.json',
          'xbrl': 'company-fourth-xbrl-comparison-20260920.json'}
loaded = {}
for key, name in inputs.items():
    raw = (ROOT / 'artifacts/seo' / name).read_bytes()
    assert sha(raw) == prior['input_sha256'][key]
    loaded[key] = json.loads(raw)
target = next(t for t in loaded['targets']['targets'] if (t['cik'], t['tag']) == (case['cik'], case['tag']))
assert target['source_sha256'] == case['source_sha256']
assert target['latest_selected_accession'] == case['accession']
assert target['latest_accession_observations'] == case['selected_observations']
filing = next(f for f in loaded['capture']['filings'] if (f['cik'], f['accession']) == (case['cik'], case['accession']))
assert filing['primary_capture'] == case['primary_capture']
receipt = case['primary_capture']
body = (ROOT / receipt['body_path']).read_bytes()
assert receipt['status'] == 200 and len(body) == receipt['bytes'] and sha(body) == receipt['sha256']
soup = BeautifulSoup(body, 'html.parser')
facts = soup.find_all(attrs={'name': 'us-gaap:Revenues'})
assert len(facts) == 1
fact = facts[0]
assert fact.get_text(strip=True) == 'no' and fact['format'] == 'ixt-sec:numwordsen'
assert fact['contextref'] == 'From2024-01-01to2024-12-31'
paragraph = ' '.join(fact.find_parent('p').get_text(' ', strip=True).split())
assert 'has no current operations and has generated no income to date.' in paragraph
text = ' '.join(soup.get_text(' ', strip=True).split())
qualified = 'Furthermore, the company have not generated revenue to cover operating cost.'
assert qualified in text
reason = ('The inspected filing tags a statement about no income as revenue. That wording does not clearly establish total revenue. This history is withheld pending an unambiguous source; original source data remain available.')
report = {
    'schema': 'canli.editorial-unresolved-scope.v1', 'publication_approved': False,
    'prior_review_sha256': sha(prior_raw), 'code_sha256': sha(Path(__file__).read_bytes()),
    'cik': case['cik'], 'tag': case['tag'], 'source_sha256': case['source_sha256'],
    'accession': case['accession'], 'primary_capture': receipt,
    'selected_observations': case['selected_observations'],
    'evidence': {'fact_id': fact['id'], 'context_id': fact['contextref'],
                 'tagged_text': fact.get_text(strip=True), 'paragraph': paragraph,
                 'qualified_revenue_statement': qualified},
    'disposition': 'WITHHOLD_UNRESOLVED_REVENUE_SCOPE', 'reason': reason,
    'scope': 'Exact captured source only. No assertion of nonzero revenue, replacement value, all-history review, or approval of remaining concepts.'}
(ROOT / 'artifacts/seo/company-nika-revenue-scope-20260920.json').write_text(json.dumps(report, indent=2) + '\n')
print('Nika revenue scope withholding reproduced from retained filing')
