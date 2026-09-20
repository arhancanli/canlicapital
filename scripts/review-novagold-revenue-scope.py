"""Verify the visible scope attached to NOVAGOLD's hidden zero revenue fact."""
import hashlib
import json
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
base = ROOT / 'artifacts/seo'
source_path = base / 'company-fourth-filing-capture-20260920.json'
target_path = base / 'company-fourth-editorial-targets-20260920.json'
target = next(t for t in json.loads(target_path.read_bytes())['targets']
              if t['cik'] == '0001173420' and t['tag'] == 'Revenues')
filing = next(f for f in json.loads(source_path.read_bytes())['filings']
              if f['cik'] == target['cik'] and f['accession'] == target['latest_selected_accession'])
receipt = filing['primary_capture']
raw = (ROOT / receipt['body_path']).read_bytes()
assert receipt['status'] == 200 and len(raw) == receipt['bytes']
assert hashlib.sha256(raw).hexdigest() == receipt['sha256']
soup = BeautifulSoup(raw, 'html.parser')
facts = soup.find_all(attrs={'name': 'us-gaap:Revenues'})
assert len(facts) == 1 and facts[0].get_text(strip=True) == '0'
fact = facts[0]
visible = soup.find_all(style=lambda value: value and value.strip() == '-sec-ix-hidden:' + fact['id'])
assert len(visible) == 1 and visible[0].get_text(strip=True) == 'no'
paragraph = ' '.join(visible[0].parent.get_text(' ', strip=True).split())
assert 'The Company has no realized revenues from its principal asset.' in paragraph
assert 'Donlin Gold' in paragraph
report = {
    'schema': 'canli.editorial-hidden-fact-scope.v1', 'publication_approved': False,
    'cik': target['cik'], 'tag': target['tag'], 'source_sha256': target['source_sha256'],
    'primary_capture': receipt, 'fact_id': fact['id'], 'context_id': fact['contextref'],
    'visible_reference_style': visible[0]['style'], 'visible_paragraph': paragraph,
    'disposition': 'EXCLUDE_CONCEPT_PRINCIPAL_ASSET_SCOPE_NOT_COMPANY_TOTAL',
    'reason': 'The inspected filing links this revenue-tagged zero to a statement about no realized revenue from its principal asset, Donlin Gold. It does not establish a company-wide revenue total. This generic revenue history is omitted; original source data remain available.',
    'scope': 'Latest selected original filing and exact source snapshot. Does not assert that actual total revenue is nonzero or that every historical filing was reviewed.',
    'code_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}
(base / 'company-fourth-novagold-disposition-20260920.json').write_text(json.dumps(report, indent=2) + '\n')
print(report['disposition'])
