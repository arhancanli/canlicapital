"""Offline numerical and context extraction; never grants editorial admission."""
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
        measures = unit.find_all(lambda n: local(n) == 'measure' and qname(n, n.name)[0] == INSTANCE_NS)
        if len(measures) != 1 or unit.find(lambda n: local(n) == 'divide'):
            rejected['compound_unit'] += 1
            continue
        currency_namespace, currency = qname(measures[0], measures[0].get_text(strip=True))
        if currency_namespace != 'http://www.xbrl.org/2003/iso4217' or currency != 'USD':
            rejected['non_usd_unit'] += 1
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
    target_bytes = args.targets.read_bytes()
    targets = json.loads(target_bytes)
    assert targets['schema'] in ('canli.retained-concept-filing-targets.v1', 'canli.equal-history-retained-targets.v1')
    helper_path = ROOT / 'scripts/review-company-editorial-xbrl.py'
    helper_spec = importlib.util.spec_from_file_location('retained_xbrl_compare', helper_path)
    helper = importlib.util.module_from_spec(helper_spec)
    helper_spec.loader.exec_module(helper)
    results = []
    for filing in targets['filings']:
        receipt_bytes = (ROOT / filing['receipt_path']).read_bytes()
        assert digest(receipt_bytes) == filing['receipt_sha256']
        receipt = json.loads(receipt_bytes)
        assert receipt == filing['receipt'] and receipt['status'] == 200
        raw = (ROOT / filing['body_path']).read_bytes()
        assert digest(raw) == receipt['sha256'] and len(raw) == receipt['bytes']
        result = compare(raw, filing['cik'], filing['observations'])
        for check in result['checks']:
            check['match_method'] = 'INLINE_PRIMARY' if check['matched'] else 'UNRESOLVED'
        unmatched = [c['selected'] for c in result['checks'] if not c['matched']]
        candidates = sorted((ROOT / 'artifacts/seo/corpus-local').glob('**/' + filing['cik'] + '-' + filing['accession'] + '-instance.receipt.json')) if unmatched else []
        successful = []
        for candidate in candidates:
            metadata = json.loads(candidate.read_bytes())
            if metadata['status'] != 200:
                continue
            instance_path = ROOT / metadata.get('body_path', str(candidate.with_name(candidate.name.replace('.receipt.json', '.response'))))
            instance_bytes = instance_path.read_bytes()
            assert digest(instance_bytes) == metadata['sha256'] and len(instance_bytes) == metadata['bytes']
            url = urlsplit(metadata['url'])
            assert url.scheme == 'https' and url.hostname == 'www.sec.gov'
            assert url.path.startswith('/Archives/edgar/data/' + str(int(filing['cik'])) + '/' + filing['accession'].replace('-', '') + '/')
            successful.append((candidate, metadata, instance_bytes))
        if successful:
            assert len({m['sha256'] for _, m, _ in successful}) == 1, 'Conflicting retained XBRL bodies'
            candidate, metadata, instance_bytes = successful[0]
            supplemental = helper.compare(instance_bytes, filing['cik'], unmatched)
            result['instance_evidence'] = {'receipt_path':str(candidate.relative_to(ROOT)), 'receipt_sha256':digest(candidate.read_bytes()), 'receipt':metadata, 'checks':supplemental}
            by_row = {json.dumps(c['selected'],sort_keys=True):c for c in supplemental}
            for check in result['checks']:
                supplement = by_row.get(json.dumps(check['selected'],sort_keys=True))
                if not check['matched'] and supplement and supplement['matched']:
                    check['matched'] = True
                    check['match_method'] = 'RETAINED_XBRL_INSTANCE'
                    check['scope_disposition'] = 'PRIMARY_CONTEXT_REVIEW_PENDING'
        results.append({'cik': filing['cik'], 'accession': filing['accession'], 'name': filing['name'],
                        'primary_sha256': receipt['sha256'], 'url': receipt['url'], **result})
        print(filing['cik'], sum(c['matched'] for c in result['checks']), '/', len(result['checks']), flush=True)
    report = {'schema': 'canli.retained-concept-filing-review.v1', 'publication_approved': False,
              'targets_sha256': digest(target_bytes), 'xbrl_helper_sha256': digest(helper_path.read_bytes()), 'code_sha256': digest(Path(__file__).read_bytes()),
              'filings': results, 'observations': sum(len(f['checks']) for f in results),
              'matched_observations': sum(c['matched'] for f in results for c in f['checks']),
              'scope': 'Already-retained convenience sample only. Numerical matches with surrounding table text are evidence for review, not source-scope approval or all-history accuracy. Unsupported transforms, dimensional facts and missing matches remain unresolved; no acquisition or retry.'}
    assert report['observations'] == targets['observation_count']
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['observations', 'matched_observations']}))

if __name__ == '__main__':
    main()
