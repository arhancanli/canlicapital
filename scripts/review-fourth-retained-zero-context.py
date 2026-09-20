"""Reproduce reviewed latest-filing context for the 22 retained zero histories."""
import hashlib
import json
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'artifacts/seo'
names = {'quality': 'company-fourth-selected-quality-v6.json',
         'targets': 'company-fourth-editorial-targets-20260920.json',
         'capture': 'company-fourth-filing-capture-20260920.json',
         'inline': 'company-fourth-inline-comparison-20260920.json',
         'xbrl': 'company-fourth-xbrl-comparison-20260920.json'}
raw = {key: (BASE / name).read_bytes() for key, name in names.items()}
data = {key: json.loads(value) for key, value in raw.items()}
hashes = {key: hashlib.sha256(value).hexdigest() for key, value in raw.items()}
assert data['inline']['capture_report_sha256'] == hashes['capture']
assert data['inline']['targets_sha256'] == hashes['targets']
assert data['xbrl']['comparison_sha256'] == hashes['inline']
assert data['xbrl']['capture_sha256'] == hashes['capture']
NARRATIVES = {
    '0001128189': 'Our Company has no revenues and very limited operating history.',
    '0001228627': 'Total Revenues We had no revenues for the years ended December 31, 2013 or 2012.',
    '0001145604': 'has no current operations and has generated no income to date.',
}
ROW_PREFIX = {
    ('0001132509', 'PaymentsToAcquirePropertyPlantAndEquipment'): 'Purchase of property, plant and equipment',
    ('0001174891', 'PaymentsToAcquirePropertyPlantAndEquipment'): 'Purchase of equipment',
    ('0001134982', 'Revenues'): 'Net revenues',
}
results = []
for page in data['quality']['flagged_pages']:
    if 'zero_only' not in page['flags']:
        continue
    cik, tag = page['cik'], page['tag']
    target = next(t for t in data['targets']['targets'] if (t['cik'], t['tag']) == (cik, tag))
    key = (cik, target['latest_selected_accession'])
    filing = next(f for f in data['capture']['filings'] if (f['cik'], f['accession']) == key)
    receipt = filing['primary_capture']
    body = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(body) == receipt['bytes']
    assert hashlib.sha256(body).hexdigest() == receipt['sha256']
    checks = [c for source in ['inline', 'xbrl'] for f in data[source]['filings']
              if (f['cik'], f['accession']) == key for c in f.get('checks', [])]
    for observation in target['latest_accession_observations']:
        expected = {**observation, 'cik': cik, 'tag': tag}
        assert any(c['matched'] and c['selected'] == expected for c in checks)
    soup = BeautifulSoup(body, 'html.parser')
    normalize = lambda text: ' '.join(text.split())
    document = normalize(soup.get_text(' ', strip=True))
    if cik in NARRATIVES:
        excerpt = NARRATIVES[cik]
        assert excerpt in document
        evidence = [{'type': 'narrative', 'text': excerpt}]
    else:
        if tag == 'CashAndCashEquivalentsAtCarryingValue':
            prefix = 'Cash and cash equivalents at end of period' if cik == '0001222333' else 'Cash, end of year'
        elif tag == 'NetCashProvidedByUsedInOperatingActivities':
            prefix = 'Net cash provided by operating activities'
        else:
            prefix = ROW_PREFIX.get((cik, tag), 'Revenue')
        evidence = []
        seen = set()
        for tr in soup.find_all('tr'):
            text = normalize(tr.get_text(' ', strip=True))
            if len(text) > 250 or not text.lower().startswith(prefix.lower()) or text in seen:
                continue
            if '—' not in text and ' -' not in text:
                continue
            table = tr.find_parent('table')
            assert table is not None
            seen.add(text)
            evidence.append({'type': 'statement_row', 'text': text,
                             'containing_table_text': normalize(table.get_text(' ', strip=True))})
        assert evidence, 'Missing reviewed primary row: ' + cik + '/' + tag
    unresolved = cik == '0001145604'
    results.append({'cik': cik, 'tag': tag, 'source_sha256': target['source_sha256'],
                    'accession': key[1], 'primary_capture': receipt,
                    'selected_observations': target['latest_accession_observations'],
                    'evidence': evidence,
                    'disposition': 'NARRATIVE_INCOME_SCOPE_REMAINS_OPEN' if unresolved else 'LATEST_SELECTED_ZERO_CONTEXT_SUPPORTED',
                    'note': 'The tagged wording says no income, not an explicit revenue total; numerical reproduction does not resolve that meaning.' if unresolved else 'Retain as reported for the inspected periods; do not infer a current zero or validate all historical filings.'})
assert len(results) == 22
report = {'schema': 'canli.retained-zero-context-review.v1', 'publication_approved': False,
          'input_sha256': hashes, 'code_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'reviewed_histories': len(results), 'latest_context_supported': 21,
          'scope_open': 1, 'cases': results,
          'scope': 'Latest selected filing context only, after five source-bound exclusions. Not all-history verification, search-intent approval, proof of current financial condition or publication approval.'}
(BASE / 'company-fourth-retained-zero-review-20260920.json').write_text(json.dumps(report, indent=2) + '\n')
print('22 retained histories reviewed:21latest contexts supported;1income/revenue scope remains open')
