"""Reproduce three narrower-scope zero histories from retained filing evidence."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
base = ROOT / 'artifacts/seo'
cache = base / 'corpus-local/fifth-editorial-filings'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
paths = [base / ('company-fifth-' + suffix + '.json') for suffix in ['editorial-targets-v6', 'filing-capture-20260920', 'xbrl-comparison-20260920']]
raws = [p.read_bytes() for p in paths]
targets, capture, xbrl = map(json.loads, raws)
assert capture['complete'] and not capture.get('error')
assert capture['input_sha256'] == sha(raws[0]) and xbrl['capture_sha256'] == sha(raws[1]) and xbrl['complete']
x = '{http://www.w3.org/1999/xlink}'


def load(receipt):
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256']
    return raw


cases = []
for cik, tag in [('0001551182', 'Revenues'), ('0001477845', 'RevenueFromContractWithCustomerExcludingAssessedTax'), ('0001598646', 'RevenueFromContractWithCustomerExcludingAssessedTax')]:
    target = next(t for t in targets['targets'] if t['cik'] == cik and t['tag'] == tag)
    filing = next(f for f in capture['filings'] if f['cik'] == cik and f['accession'] == target['latest_selected_accession'])
    comparison = next(f for f in xbrl['filings'] if f['cik'] == cik and f['accession'] == target['latest_selected_accession'])
    checks = [c for c in comparison['checks'] if c['selected']['tag'] == tag]
    assert len(checks) == len(target['latest_accession_observations']) and all(c['matched'] for c in checks)
    load(comparison['instance_capture'])
    primary = filing['primary_capture']; soup = BeautifulSoup(load(primary), 'html.parser')
    text = ' '.join(soup.get_text(' ', strip=True).split())
    receipts = {'primary': primary, 'instance': comparison['instance_capture']}
    evidence = {}
    if cik == '0001551182':
        labels, roles = [], []
        for kind in ['lab', 'pre']:
            receipt = json.loads((cache / (cik + '-' + kind + '.receipt.json')).read_bytes()); receipts[kind] = receipt
            for link in ET.fromstring(load(receipt)):
                refs = {n.get(x + 'label') for n in link if n.get(x + 'href', '').endswith('#us-gaap_' + tag)}
                if not refs: continue
                if kind == 'pre': roles.append(link.get(x + 'role'))
                destinations = {n.get(x + 'to') for n in link if n.get(x + 'from') in refs}
                labels.extend(n.text for n in link if n.get(x + 'label') in destinations and n.text)
        assert 'Entity-wide revenue, major customer, amount' in labels
        passage = 'No single customer represented greater than 10% of net sales in 2016 , 2015 or 2014 , respectively.'
        assert passage in text
        rows = [' '.join(tr.get_text(' ', strip=True).split()) for tr in soup.find_all('tr')]
        sales = 'Net sales $ 19,747 $ 20,855 $ 22,552'; assert sales in rows
        evidence = {'labels': labels, 'presentation_roles': roles, 'primary_excerpts': [passage, sales]}
        reason = 'The inspected filing labels these zeros as revenue from major customers and states that no customer exceeded 10% of sales. They do not describe total company revenue; consolidated net sales are nonzero. This generic revenue history is omitted; original source data remain available.'
    else:
        nodes = soup.find_all(attrs={'name': 'us-gaap:' + tag}); assert len(nodes) == 1
        node = nodes[0]; assert node.get_text(strip=True) == 'no'
        paragraph = ' '.join(node.find_parent('p').get_text(' ', strip=True).split())
        if cik == '0001477845':
            assert 'has no t generated substantial revenues' in paragraph
            reason = 'The inspected filing tags a statement that the company has not generated substantial revenues. That qualification does not establish a zero total. This revenue history is omitted; original source data remain available.'
        else:
            assert 'has had no revenues from product sales to date' in paragraph
            reason = 'The inspected filing tags a statement about no revenue from product sales. That narrower scope does not establish total revenue from contracts with customers. This revenue history is omitted; original source data remain available.'
        evidence = {'fact_id': node['id'], 'context_id': node['contextref'], 'visible_paragraph': paragraph}
    cases.append({'cik': cik, 'tag': tag, 'source_sha256': target['source_sha256'], 'filing_url': primary['url'], 'reason': reason,
                  'receipts': receipts, 'evidence': evidence, 'numerical_checks': checks, 'disposition': 'EXCLUDE_CONCEPT_SCOPE_MISMATCH'})
report = {'schema': 'canli.editorial-zero-scope.v1', 'publication_approved': False, 'code_sha256': sha(Path(__file__).read_bytes()),
          'bindings': {str(p.relative_to(ROOT)): sha(raw) for p,raw in zip(paths,raws)}, 'cases': cases,
          'scope': 'Latest selected original filings and exact companyfacts snapshots. Numerical equality does not prove concept scope; no replacement values, all-history approval or assertion that the two pharmaceutical companies have nonzero revenue.'}
(base / 'company-fifth-zero-dispositions-20260920.json').write_text(json.dumps(report, indent=2) + '\n')
print('Three source-bound zero-history scope exclusions reproduced')
