"""Compare selected diagnostic rows to captured inline facts, without admission."""
import hashlib
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / 'artifacts/seo/company-identity-filing-review-20260920.json'
target_path = ROOT / 'artifacts/seo/company-identity-filing-targets-20260920.json'
source = json.loads(source_path.read_bytes())
target_report = json.loads(target_path.read_bytes())
targets = target_report['rows']
assert source['complete'] and not source.get('error')
assert source['input_sha256'] == target_report['input_sha256'], 'Different identity review inputs'
input_path = ROOT / 'artifacts/seo/company-identity-exclusions-20260920.json'
assert hashlib.sha256(input_path.read_bytes()).hexdigest() == source['input_sha256']
filing_keys = [(f['cik'], f['accession']) for f in source['filings']]
assert len(filing_keys) == len(set(filing_keys)), 'Duplicate captured filing'
assert targets and set(filing_keys) == {(r['cik'], r['accn']) for r in targets}, 'Incomplete filing coverage'
assert len({json.dumps(r, sort_keys=True) for r in targets}) == len(targets), 'Duplicate target row'
results = []


def field(context, name):
    node = context.find(lambda n: n.name and n.name.split(':')[-1].lower() == name)
    return node.get_text(strip=True) if node else None


for filing in source['filings']:
    receipt = filing['primary_capture']
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert hashlib.sha256(raw).hexdigest() == receipt['sha256']
    soup = BeautifulSoup(raw, 'html.parser')
    contexts = {n.get('id'): n for n in soup.find_all(lambda n: n.name and n.name.split(':')[-1].lower() == 'context')}
    units = {n.get('id'): n.get_text('', strip=True) for n in soup.find_all(lambda n: n.name and n.name.split(':')[-1].lower() == 'unit')}
    rows = [r for r in targets if r['cik'] == filing['cik'] and r['accn'] == filing['accession']]
    extracted = []
    for node in soup.find_all(lambda n: n.get('name') in {'us-gaap:' + r['tag'] for r in rows}):
        context = contexts.get(node.get('contextref'))
        if context is None or context.find(lambda n: n.name and n.name.split(':')[-1].lower() in ('explicitmember', 'typedmember')):
            continue
        identifier = field(context, 'identifier')
        if not identifier or not identifier.isdigit() or int(identifier) != int(filing['cik']):
            continue
        if node.get('xsi:nil') in ('true', '1'):
            continue
        fmt = node.get('format', '').split(':')[-1]
        if fmt not in ('numdotdecimal', 'num-dot-decimal', 'zerodash', 'fixed-zero'):
            continue
        try:
            value = Decimal(0) if fmt in ('zerodash', 'fixed-zero') else Decimal(node.get_text('', strip=True).replace(',', '').replace(' ', ''))
            value *= Decimal(10) ** int(node.get('scale', '0'))
            value *= -1 if node.get('sign') == '-' else 1
        except (InvalidOperation, ValueError):
            continue
        unit = units.get(node.get('unitref'), '')
        if not unit.startswith('iso4217:'):
            continue
        table_row = node.find_parent('tr')
        extracted.append({'tag': node['name'].split(':')[-1], 'entity_cik': identifier,
                          'start': field(context, 'startdate'), 'end': field(context, 'enddate') or field(context, 'instant'),
                          'unit': unit.removeprefix('iso4217:'), 'value': str(value),
                          'fact_id': node.get('id'), 'context_id': node.get('contextref'),
                          'table_row': table_row.get_text(' ', strip=True) if table_row else None})
    checks = []
    for row in rows:
        matches = [x for x in extracted if x['tag'] == row['tag'] and x['start'] == row.get('start') and
                   x['end'] == row['end'] and x['unit'] == row['unit'] and Decimal(x['value']) == Decimal(str(row['val']))]
        checks.append({'selected': row, 'matched': bool(matches), 'matches': matches})
    identity = [n.get_text(' ', strip=True) for n in soup.find_all(attrs={'name': 'dei:EntityCentralIndexKey'})]
    identity_matches = bool(identity) and all(x.isdigit() and int(x) == int(filing['cik']) for x in identity)
    results.append({'cik': filing['cik'], 'accession': filing['accession'], 'primary_capture': receipt,
                    'cover_cik_matches': identity_matches, 'checks': checks,
                    'all_selected_rows_match': bool(checks) and all(x['matched'] for x in checks)})
    print(filing['cik'], filing['accession'], sum(x['matched'] for x in checks), '/', len(checks), flush=True)
assert sum(len(r['checks']) for r in results) == len(targets), 'Target rows omitted'
report = {'schema': 'canli.identity-inline-comparison.v1',
          'capture_report_sha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
          'targets_sha256': hashlib.sha256(target_path.read_bytes()).hexdigest(),
          'filings': results, 'publication_approved': False,
          'claim_boundary': 'Latest-selected core observations only. Matches enforce entity, period, unit, value, scale/sign, and exclude dimensional/nil contexts. Unsupported formats or unmatched rows remain unresolved; numerical equality alone does not establish concept scope or all-history accuracy.'}
(ROOT / 'artifacts/seo/company-identity-inline-comparison-20260920.json').write_text(json.dumps(report, indent=2) + '\n')
