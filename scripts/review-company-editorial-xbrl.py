"""Resolve unmatched editorial observations against original XBRL instances."""
import argparse
import base64
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
import subprocess
import time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
NS = {'x': 'http://www.xbrl.org/2003/instance'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def verified(receipt):
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['bytes'] == len(raw) and receipt['sha256'] == sha(raw)
    return raw


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
            measure = unit.find('x:measure', NS)
            if len(unit) != 1 or measure is None:
                continue
            qname = (measure.text or '').strip().split(':')
            if len(qname) != 2 or scopes[measure].get(qname[0]) != 'http://www.xbrl.org/2003/iso4217' or qname[1] != row['unit']:
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


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('capture', type=Path)
    p.add_argument('comparison', type=Path)
    p.add_argument('cache', type=Path)
    p.add_argument('output', type=Path)
    p.add_argument('--offline', action='store_true')
    args = p.parse_args()
    capture_bytes = args.capture.read_bytes()
    comparison_bytes = args.comparison.read_bytes()
    capture, comparison = json.loads(capture_bytes), json.loads(comparison_bytes)
    assert comparison['capture_report_sha256'] == sha(capture_bytes)
    filings = {(f['cik'], f['accession']): f for f in capture['filings']}
    args.cache.resolve().relative_to(ROOT)
    args.cache.mkdir(parents=True, exist_ok=True)
    report = {'schema': 'canli.editorial-xbrl-review.v1', 'publication_approved': False,
              'capture_sha256': sha(capture_bytes), 'comparison_sha256': sha(comparison_bytes),
              'code_sha256': sha(Path(__file__).read_bytes()), 'filings': [], 'complete': False,
              'scope': 'Previously unmatched selected observations only. Numerical reproduction does not establish accounting scope or editorial approval.'}
    if args.output.exists():
        prior = json.loads(args.output.read_bytes())
        assert prior['capture_sha256'] == report['capture_sha256'] and prior['comparison_sha256'] == report['comparison_sha256']
        assert not prior.get('access_stop'), 'Prior access stop; do not resume'
    def save():
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    for source in comparison['filings']:
        rows = [c['selected'] for c in source['checks'] if not c['matched']]
        if not rows:
            continue
        key = (source['cik'], source['accession'])
        index = filings[key]['index_capture']
        assert index['status'] == 200
        soup = BeautifulSoup(verified(index), 'html.parser')
        links = []
        for tr in soup.select('tr'):
            cells = tr.find_all('td')
            if len(cells) < 4:
                continue
            kind = cells[3].get_text(strip=True)
            description = cells[1].get_text(' ', strip=True).upper()
            if kind == 'EX-101.INS' or (kind == 'XML' and 'INSTANCE' in description):
                a = cells[2].find('a')
                if a:
                    links.append(urljoin(index['url'], a['href']))
        item = {'cik': key[0], 'accession': key[1], 'selected_rows': len(rows)}
        report['filings'].append(item)
        if len(set(links)) != 1:
            item.update(state='INSTANCE_SELECTION_UNRESOLVED', links=links)
            save()
            continue
        url = links[0]
        parsed = urlsplit(url)
        assert parsed.scheme == 'https' and parsed.hostname == 'www.sec.gov'
        assert parsed.path.startswith('/Archives/edgar/data/')
        stem = args.cache / (key[0] + '-' + key[1] + '-instance')
        body, receipt_path = stem.with_suffix('.response'), stem.with_suffix('.receipt.json')
        if body.exists() or receipt_path.exists():
            assert body.exists() and receipt_path.exists(), 'Incomplete cache pair'
            receipt = json.loads(receipt_path.read_bytes())
            assert receipt['url'] == url
            raw = verified(receipt)
        else:
            assert not args.offline, 'Uncaptured instance in offline replay'
            time.sleep(1)
            result = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
                "const r=await fetch(process.argv[1],{headers:{'User-Agent':'CanliCapital research reference canlicapital.com'},redirect:'error',signal:AbortSignal.timeout(30000)});console.log(JSON.stringify({status:r.status,body:Buffer.from(await r.arrayBuffer()).toString('base64')}));", url]))
            raw = base64.b64decode(result['body'])
            receipt = {'url': url, 'status': result['status'], 'bytes': len(raw), 'sha256': sha(raw),
                       'captured_at': datetime.now(timezone.utc).isoformat(), 'body_path': str(body.resolve().relative_to(ROOT))}
            body.write_bytes(raw)
            receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
        item['instance_capture'] = receipt
        if receipt['status'] in (403, 429):
            report['access_stop'] = receipt
            save()
            raise RuntimeError('Access stop retained; do not retry')
        if receipt['status'] != 200:
            item['state'] = 'INSTANCE_FETCH_FAILED'
        else:
            item['checks'] = compare(raw, key[0], rows)
            item['state'] = 'COMPARED_REVIEW_PENDING'
        save()
        print(key, item['state'], flush=True)
    report['complete'] = True
    save()


if __name__ == '__main__':
    main()
