"""Versioned legacy comparator with default-namespace QName support."""
import argparse
import re
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
NS = {'x': 'http://www.xbrl.org/2003/instance'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def unit_name(unit, scopes):
    def measure(node):
        if node.tag != '{' + NS['x'] + '}measure' or len(node):
            return None
        parts = (node.text or '').strip().split(':')
        if len(parts) == 1:
            return scopes[node].get(''), parts[0]
        return (scopes[node].get(parts[0]), parts[1]) if len(parts) == 2 else None
    if len(unit) != 1:
        return None
    if measure(unit[0]) == (NS['x'], 'shares'):
        return 'shares'
    divide = unit[0]
    if divide.tag != '{' + NS['x'] + '}divide' or len(divide) != 2:
        return None
    if [n.tag for n in divide] != ['{' + NS['x'] + '}unitNumerator', '{' + NS['x'] + '}unitDenominator']:
        return None
    if any(len(n) != 1 for n in divide) or measure(divide[1][0]) != (NS['x'], 'shares'):
        return None
    value = measure(divide[0][0])
    if value is None or value[0] != 'http://www.xbrl.org/2003/iso4217' or not re.fullmatch('[A-Z]{3}', value[1]):
        return None
    return value[1] + '/shares'

def compare(raw, cik, rows):
    # QName values in measure text need the namespace scope at that element;
    # the spelling of a prefix alone does not establish a currency namespace.
    scopes, stack, pending = {}, [], {}
    parser = ET.iterparse(io.BytesIO(raw), events=('start-ns', 'start', 'end'))
    for event, item in parser:
        if event == 'start-ns':
            prefix, uri = item
            pending[prefix] = uri
        elif event == 'start':
            scope = {**(stack[-1] if stack else {}), **pending}
            pending = {}
            stack.append(scope)
            scopes[item] = scope
        else:
            stack.pop()
    root = parser.root
    contexts = {n.get('id'): n for n in root.findall('x:context', NS)}
    units = {n.get('id'): n for n in root.findall('x:unit', NS)}
    if len(contexts) != len(root.findall('x:context', NS)) or len(units) != len(root.findall('x:unit', NS)):
        raise ValueError('Duplicate context/unit id')
    results = []
    for row in rows:
        matches = []
        for node in root:
            # This exact legacy namespace occurs in the retained 2010 Holding
            # instance. Do not accept arbitrary issuer or lookalike namespaces.
            accepted_namespace = (node.tag.startswith('{http://fasb.org/us-gaap/') or
                                  node.tag.startswith('{http://xbrl.us/us-gaap/2009-01-31}'))
            if not accepted_namespace or node.tag.split('}')[-1] != row['tag']:
                continue
            if node.get('{http://www.w3.org/2001/XMLSchema-instance}nil') in ('true', '1'):
                continue
            ctx = contexts.get(node.get('contextRef'))
            unit = units.get(node.get('unitRef'))
            if ctx is None or unit is None:
                continue
            identity = ctx.find('x:entity/x:identifier', NS)
            if identity is None or not (identity.text or '').isdigit() or int(identity.text) != int(cik):
                continue
            if any(n.tag.split('}')[-1] in ('explicitMember', 'typedMember') for n in ctx.iter()):
                continue
            if unit_name(unit, scopes) != row['unit']:
                continue
            start = ctx.findtext('x:period/x:startDate', namespaces=NS)
            end = ctx.findtext('x:period/x:endDate', namespaces=NS) or ctx.findtext('x:period/x:instant', namespaces=NS)
            # XML date values can be formatted with surrounding whitespace.
            start = start.strip() if start is not None else None
            end = end.strip() if end is not None else None
            if start != row.get('start') or end != row['end']:
                continue
            try:
                value = Decimal(node.text or '')
            except InvalidOperation:
                continue
            if value == Decimal(str(row['val'])):
                matches.append({'context_id': node.get('contextRef'), 'unit_id': node.get('unitRef'), 'value': str(value)})
        results.append({'selected': row, 'matched': bool(matches), 'matches': matches})
    return results

