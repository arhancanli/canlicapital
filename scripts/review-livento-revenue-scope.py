"""Bind Livento's constant revenue history to its narrower real-estate narrative."""
import hashlib
import json
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
base = ROOT / 'artifacts/seo'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
target_path = base / 'company-fifth-editorial-targets-v6.json'
capture_path = base / 'company-fifth-filing-capture-20260920.json'
comparison_path = base / 'company-fifth-inline-comparison-20260920.json'
target_bytes, capture_bytes, comparison_bytes = (p.read_bytes() for p in (target_path, capture_path, comparison_path))
targets, capture, comparison = map(json.loads, (target_bytes, capture_bytes, comparison_bytes))
assert capture['complete'] and not capture.get('error')
assert capture['input_sha256'] == sha(target_bytes)
assert comparison['capture_report_sha256'] == sha(capture_bytes)
assert comparison['targets_sha256'] == sha(target_bytes)
target = next(t for t in targets['targets'] if t['cik'] == '0001593549' and t['tag'] == 'Revenues')
filing = next(f for f in capture['filings'] if f['cik'] == target['cik'] and f['accession'] == target['latest_selected_accession'])
check = next(f for f in comparison['filings'] if f['cik'] == target['cik'] and f['accession'] == target['latest_selected_accession'])
assert check['all_selected_rows_match']
receipt = filing['primary_capture']
raw = (ROOT / receipt['body_path']).read_bytes()
assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256']
soup = BeautifulSoup(raw, 'html.parser')
facts = soup.find_all(attrs={'name': 'us-gaap:Revenues'})
assert len(facts) == 2
paragraphs = set()
for fact in facts:
    assert fact.get_text(strip=True) == '2,000,000'
    paragraph = ' '.join(fact.find_parent('p').get_text(' ', strip=True).split())
    assert 'US$ 2,000,000 in revenue from the sale of real estate properties.' in paragraph
    assert 'December 31, 2023, and 2021' in paragraph
    paragraphs.add(paragraph)
assert len(paragraphs) == 1
statement_rows = [row for row in soup.find_all('tr') if row.get_text(' ', strip=True).startswith('Revenues 151,388')]
assert len(statement_rows) == 1
statement_table = ' '.join(statement_rows[0].find_parent('table').get_text(' ', strip=True).split())
assert 'Dec 31, 2023' in statement_table and '1,966,202' in statement_table
report = {
    'schema': 'canli.editorial-narrative-scope-hold.v1', 'publication_approved': False,
    'cik': target['cik'], 'tag': target['tag'], 'source_sha256': target['source_sha256'],
    'selected_sha256': target['selected_sha256'], 'primary_capture': receipt,
    'bindings': {str(p.relative_to(ROOT)): sha(b) for p,b in zip((target_path,capture_path,comparison_path),(target_bytes,capture_bytes,comparison_bytes))},
    'facts': [{'id': f['id'], 'context_id': f['contextref'], 'value': f.get_text(strip=True)} for f in facts],
    'visible_paragraph': next(iter(paragraphs)), 'statement_table_context': statement_table,
    'disposition': 'HOLD_REVENUE_HISTORY_REAL_ESTATE_SALES_SCOPE',
    'reason': 'The two latest-selected facts describe revenue from real-estate sales. They do not establish the company-wide revenue history implied by the generic route. The same filing presents a different revenue row for 2023. Do not substitute that table value without a separate selection and provenance policy.',
    'required_action': 'Resolve scope and apply a source-bound editorial exclusion before publishing this cohort. V6 is a review candidate and is not editorially approved.',
    'scope': 'Latest selected filing only; the separate 2022 accession remains outside this scope review. No source facts or selected values were changed.',
    'code_sha256': sha(Path(__file__).read_bytes()),
}
(base / 'company-fifth-livento-scope-hold-20260920.json').write_text(json.dumps(report, indent=2) + '\n')
print(report['disposition'])
