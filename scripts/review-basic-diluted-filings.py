"""Offline basic/diluted comparison with namespace-checked share and per-share units."""
import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation
import hashlib
import importlib.util
from urllib.parse import urlsplit
import json
from pathlib import Path
import re
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
INSTANCE_NS = 'http://www.xbrl.org/2003/instance'

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def local(node):
    return (getattr(node, 'name', '') or '').split(':')[-1].lower()

def field(context, name):
    n = context.find(lambda x: local(x) == name and qname(x, x.name)[0] == INSTANCE_NS)
    return n.get_text(strip=True) if n else None

def qname(node, value):
    if ':' not in (value or ''):
        return None, value
    prefix, name = value.split(':', 1)
    current = node
    while current is not None:
        attrs = getattr(current, 'attrs', {}) or {}
        if 'xmlns:' + prefix in attrs:
            return attrs['xmlns:' + prefix], name
        current = getattr(current, 'parent', None)
    return None, name

def numeric(node):
    namespace, fmt = qname(node, node.get('format', ''))
    if fmt and (not namespace or not re.fullmatch(r'https?://www\.(?:xbrl\.org|sec\.gov)/inlineXBRL/transformation/\d{4}-\d{2}-\d{2}', namespace)):
        raise ValueError('unverified_transform_namespace')
    if fmt not in ('', 'numdotdecimal', 'num-dot-decimal', 'zerodash', 'fixed-zero'):
        raise ValueError('unsupported_format')
    texts = []
    for text in node.find_all(string=True):
        parent = text.parent
        excluded = False
        while parent is not node:
            if local(parent) == 'exclude':
                excluded = True
                break
            parent = parent.parent
        if not excluded:
            texts.append(str(text))
    text = ''.join(texts).strip()
    if fmt in ('numdotdecimal', 'num-dot-decimal'):
        text = text.replace(' ', '').replace('\u00a0', '')
        if not re.fullmatch(r'[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?', text):
            raise ValueError('unsupported_numeric_text')
        text = text.replace(',', '')
    if fmt in ('zerodash', 'fixed-zero') and text not in ('', '-', '\u2013', '\u2014', '0'):
        raise ValueError('unsupported_zero_text')
    scale = int(node.get('scale', '0'))
    if abs(scale) > 18:
        raise ValueError('unsupported_scale')
    sign = node.get('sign', '')
    if sign not in ('', '-'):
        raise ValueError('unsupported_sign')
    number = Decimal(0) if fmt in ('zerodash', 'fixed-zero') else Decimal(text)
    if not number.is_finite():
        raise ValueError('nonfinite_value')
    return number * Decimal(10) ** scale * (-1 if sign == '-' else 1)


def share_unit(unit):
    def children(node):
        return [x for x in node.children if getattr(x, 'name', None)]
    def measure(node):
        if qname(node, node.name) != (INSTANCE_NS, 'measure') or children(node):
            return None
        return qname(node, node.get_text(strip=True))
    nodes = children(unit)
    if len(nodes) != 1:
        return None
    if measure(nodes[0]) == (INSTANCE_NS, 'shares'):
        return 'shares'
    divide = nodes[0]
    if qname(divide, divide.name) != (INSTANCE_NS, 'divide'):
        return None
    parts = children(divide)
    if len(parts) != 2 or [qname(n, n.name) for n in parts] != [(INSTANCE_NS, 'unitnumerator'), (INSTANCE_NS, 'unitdenominator')]:
        return None
    numerator, denominator = map(children, parts)
    if len(numerator) != 1 or len(denominator) != 1 or measure(denominator[0]) != (INSTANCE_NS, 'shares'):
        return None
    amount = measure(numerator[0])
    if not amount or amount[0] != 'http://www.xbrl.org/2003/iso4217' or not re.fullmatch('[A-Z]{3}', amount[1]):
        return None
    return amount[1] + '/shares'

def compare(raw, cik, observations):
    soup = BeautifulSoup(raw, 'html.parser')
    contexts, units = {}, {}
    for node in soup.find_all(lambda n: local(n) in ('context', 'unit') and qname(n, n.name)[0] == INSTANCE_NS):
        target = contexts if local(node) == 'context' else units
        key = node.get('id')
        if key in target:
            raise ValueError('Duplicate context/unit identifier')
        target[key] = node
    wanted = {r['tag'] for r in observations}
    extracted, rejected = [], Counter()
    for node in soup.find_all(lambda n: local(n) == 'nonfraction' and qname(n, n.name)[0] in ('http://www.xbrl.org/2013/inlineXBRL', 'http://www.xbrl.org/2008/inlineXBRL')):
        namespace, tag = qname(node, node.get('name'))
        if tag not in wanted:
            continue
        if not namespace or not re.fullmatch(r'https?://(?:fasb\.org|xbrl\.us)/us-gaap/[^/]+', namespace):
            rejected['unverified_taxonomy_namespace'] += 1
            continue
        context, unit = contexts.get(node.get('contextref')), units.get(node.get('unitref'))
        if context is None or unit is None:
            rejected['missing_context_or_unit'] += 1
            continue
        if context.find(lambda n: local(n) in ('explicitmember', 'typedmember')):
            rejected['dimensional_context'] += 1
            continue
        identifier = field(context, 'identifier')
        if not identifier or not identifier.isdigit() or int(identifier) != int(cik):
            rejected['entity_mismatch'] += 1
            continue
        if any(qname(node, name) == ('http://www.w3.org/2001/XMLSchema-instance', 'nil')
               and value in ('true', '1') for name, value in node.attrs.items()):
            rejected['nil'] += 1
            continue
        currency = share_unit(unit)
        if currency is None:
            rejected['unsupported_share_unit'] += 1
            continue
        try:
            value = numeric(node)
        except (ValueError, InvalidOperation) as error:
            rejected[str(error) if isinstance(error, ValueError) else 'invalid_numeric_text'] += 1
            continue
        table_row = node.find_parent('tr')
        table = node.find_parent('table')
        neighbors = []
        if table_row:
            for neighbor in list(table_row.find_previous_siblings('tr', limit=2))[::-1]:
                neighbors.append(neighbor.get_text(' ', strip=True)[:1200])
        heading = table.find_previous(re.compile(r'^h[1-6]$')) if table else None
        extracted.append({'tag': tag, 'start': field(context, 'startdate'),
                          'end': field(context, 'enddate') or field(context, 'instant'),
                          'unit': currency, 'value': str(value), 'fact_id': node.get('id'),
                          'context_id': node.get('contextref'), 'table_row': table_row.get_text(' ', strip=True)[:2400] if table_row else None,
                          'preceding_rows': neighbors,
                          'table_header_rows': [r.get_text(' ', strip=True)[:1200] for r in table.find_all('tr', limit=5)] if table else [],
                          'paragraph': node.find_parent('p').get_text(' ', strip=True)[:2400] if not table_row and node.find_parent('p') else None,
                          'preceding_heading': heading.get_text(' ', strip=True)[:500] if heading else None})
    checks = []
    for row in observations:
        matches = [x for x in extracted if x['tag'] == row['tag'] and x['start'] == row.get('start')
                   and x['end'] == row['end'] and x['unit'] == row['unit']
                   and Decimal(x['value']) == Decimal(str(row['val']))]
        checks.append({'selected': row, 'matched': bool(matches), 'matches': matches,
                       'scope_disposition': 'PRIMARY_CONTEXT_REVIEW_PENDING' if matches else 'NUMERICAL_MATCH_UNRESOLVED'})
    return {'checks': checks, 'rejected_facts': dict(sorted(rejected.items()))}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('targets', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    raw = args.targets.read_bytes()
    targets = json.loads(raw)
    results = []
    for filing in targets['filings']:
        receipt_raw = (ROOT / filing['receipt_path']).read_bytes()
        if digest(receipt_raw) != filing['receipt_sha256']:
            raise ValueError('Receipt binding changed')
        receipt = json.loads(receipt_raw)
        primary = (ROOT / filing['body_path']).read_bytes()
        if receipt != filing['receipt'] or receipt['status'] != 200 or digest(primary) != receipt['sha256'] or len(primary) != receipt['bytes']:
            raise ValueError('Primary binding changed')
        results.append(dict(cik=filing['cik'], accession=filing['accession'], name=filing['name'], primary_sha256=receipt['sha256'], url=receipt['url'], **compare(primary, filing['cik'], filing['observations'])))
    report = dict(schema='canli.basic-diluted-primary-review.v1', publication_approved=False,
        targets_sha256=digest(raw), code_sha256=digest(Path(__file__).read_bytes()), filings=results,
        observations=sum(len(f['checks']) for f in results),
        matched_observations=sum(c['matched'] for f in results for c in f['checks']),
        scope='Retained convenience sample only. Share and currency-per-share units are namespace and structure checked; exact period/entity/unit/value matches are not accounting context or admission. Unsupported units/transforms and dimensional facts remain unresolved; no network or XBRL-instance fallback.')
    if report['observations'] != targets['observation_count']:
        raise ValueError('Observation accounting changed')
    with args.output.open('x') as f:
        f.write(json.dumps(report, indent=2)+'\n')
    print(json.dumps({k: report[k] for k in ['observations','matched_observations']}))

if __name__ == '__main__':
    main()
