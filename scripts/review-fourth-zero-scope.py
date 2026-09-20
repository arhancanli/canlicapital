"""Reproduce three zero-history scope exclusions from retained original filings."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
base = ROOT / 'artifacts/seo'
cache = base / 'corpus-local/fourth-editorial-filings'
filings = json.loads((base / 'company-fourth-filing-capture-20260920.json').read_bytes())['filings']
targets = json.loads((base / 'company-fourth-editorial-targets-20260920.json').read_bytes())['targets']
x = '{http://www.w3.org/1999/xlink}'


def load(receipt):
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and receipt['bytes'] == len(raw)
    assert hashlib.sha256(raw).hexdigest() == receipt['sha256']
    return raw


cases = []
for cik, tag, label in [('0001121795', 'CashAndCashEquivalentsAtCarryingValue', 'Cash equivalents'),
                        ('0001258602', 'Revenues', 'Intersegment servicing revenue'),
                        ('0001320461', 'Revenues', 'Intersegment sales')]:
    target = next(t for t in targets if t['cik'] == cik and t['tag'] == tag)
    filing = next(f for f in filings if f['cik'] == cik and f['accession'] == target['latest_selected_accession'])
    primary = filing['primary_capture']
    soup = BeautifulSoup(load(primary), 'html.parser')
    text = ' '.join(soup.get_text(' ', strip=True).split())
    receipts = {'primary': primary}
    labels, roles = [], []
    if cik != '0001320461':
        for kind in ['lab', 'pre']:
            receipt = json.loads((cache / (cik + '-' + kind + '.receipt.json')).read_bytes())
            receipts[kind] = receipt
            for link in ET.fromstring(load(receipt)):
                refs = {n.get(x + 'label') for n in link if n.get(x + 'href', '').endswith('#us-gaap_' + tag)}
                if not refs:
                    continue
                if kind == 'pre':
                    roles.append(link.get(x + 'role'))
                destinations = {n.get(x + 'to') for n in link if n.get(x + 'from') in refs}
                labels.extend(n.text for n in link if n.get(x + 'label') in destinations and n.text)
        assert label in labels
    if cik == '0001121795':
        passage = 'The Company had no cash equivalents at June 30, 2022 or 2021.'
        assert passage in text
        assert 'Cash $ 206 $ 7,350' in text
        excerpts = [passage, 'Cash $ 206 $ 7,350']
        reason = 'The inspected filing labels these zeros as cash equivalents alone, while its balance sheet reports nonzero cash. This combined cash-and-equivalents history is omitted; original source data remain available.'
    elif cik == '0001258602':
        excerpts = [' '.join(tr.get_text(' ', strip=True).split()) for tr in soup.find_all('tr')
                    if tr.get_text(' ', strip=True).startswith(label) and len(tr.get_text(' ', strip=True)) < 250]
        assert any('41,674' in t and '(41,674' in t for t in excerpts)
        reason = 'The inspected filing labels these selected values as intersegment servicing revenue after eliminations, not company-wide revenue. This generic revenue history is omitted; original source data remain available.'
    else:
        excerpts = []
        for node in soup.find_all(attrs={'name': 'us-gaap:Revenues'}):
            tr = node.find_parent('tr')
            if tr and 'Consolidated' in tr.get_text():
                table = ' '.join(tr.find_parent('table').get_text(' ', strip=True).split())
                if label in table and '2,815,879' in table:
                    excerpts.append(table)
        excerpts = sorted(set(excerpts))
        assert len(excerpts) == 1 and 'Consolidated $ — $ — $ —' in excerpts[0]
        reason = 'The inspected filing labels these selected zeros as intersegment sales after eliminations, while consolidated external sales are nonzero. This generic revenue history is omitted; original source data remain available.'
    cases.append({'cik': cik, 'tag': tag, 'source_sha256': target['source_sha256'],
                  'filing_url': primary['url'], 'reason': reason, 'receipts': receipts,
                  'labels': labels, 'presentation_roles': roles, 'primary_excerpts': excerpts,
                  'disposition': 'EXCLUDE_CONCEPT_SCOPE_MISMATCH'})
report = {'schema': 'canli.editorial-zero-scope.v1', 'publication_approved': False,
          'code_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'cases': cases,
          'scope': 'Latest selected filing evidence for three exact source snapshots; original values and earlier policy versions remain reproducible. Not an all-history or publication approval.'}
(base / 'company-fourth-zero-dispositions-20260920.json').write_text(json.dumps(report, indent=2) + '\n')
print('Three source-bound scope exclusions reproduced')
