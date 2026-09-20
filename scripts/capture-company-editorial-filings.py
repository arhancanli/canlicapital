"""Capture primary filings for a hash-bound editorial queue; no admission."""
import argparse
import base64
import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('targets', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('report', type=Path)
args = parser.parse_args()
OUT = args.output.resolve()
OUT.relative_to(ROOT)
OUT.mkdir(parents=True, exist_ok=True)
REPORT = args.report
SOURCE = args.targets
source_bytes = SOURCE.read_bytes()
targets = json.loads(source_bytes)['targets']
report = {'schema': 'canli.company-editorial-filing-capture.v1',
          'input_sha256': hashlib.sha256(source_bytes).hexdigest(),
          'publication_approved': False, 'complete': False, 'filings': [],
          'scope': 'Primary filing capture for priority editorial targets; neither numeric verification nor editorial approval.'}
if REPORT.exists():
    previous = json.loads(REPORT.read_bytes())
    assert previous['input_sha256'] == report['input_sha256'], 'Changed review queue'
    assert not previous.get('stopped_on_access_response'), 'Prior access stop; do not resume'
    if previous.get('complete'):
        for filing in previous['filings']:
            for key in ['index_capture', 'primary_capture']:
                if key not in filing:
                    continue
                receipt = filing[key]
                raw = (ROOT / receipt['body_path']).read_bytes()
                assert len(raw) == receipt['bytes']
                assert hashlib.sha256(raw).hexdigest() == receipt['sha256']
        print('Completed capture verified; report unchanged')
        raise SystemExit(0)
cases = {}
for target in targets:
    case = cases.setdefault(target['cik'], {'cik': target['cik'],
        'entity_name': target['name'], 'discovery_names': [],
        'core_history_diagnostics': []})
    case['core_history_diagnostics'].append(target)


def save():
    REPORT.write_text(json.dumps(report, indent=2) + '\n')


def capture(url, name):
    assert urlsplit(url).scheme == 'https' and urlsplit(url).hostname == 'www.sec.gov'
    assert urlsplit(url).path.startswith('/Archives/edgar/data/')
    body = OUT / (name + '.response')
    receipt_file = OUT / (name + '.receipt.json')
    if body.exists() or receipt_file.exists():
        assert body.exists() and receipt_file.exists(), 'Incomplete prior capture; inspect before resuming'
        raw = body.read_bytes()
        receipt = json.loads(receipt_file.read_bytes())
        assert receipt['url'] == url and receipt['bytes'] == len(raw)
        assert receipt['sha256'] == hashlib.sha256(raw).hexdigest()
    else:
        time.sleep(1)
        result = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
            "const r=await fetch(process.argv[1],{headers:{'User-Agent':'CanliCapital research reference canlicapital.com'},redirect:'error',signal:AbortSignal.timeout(30000)});console.log(JSON.stringify({status:r.status,body:Buffer.from(await r.arrayBuffer()).toString('base64')}));", url]))
        raw = base64.b64decode(result['body'])
        receipt = {'url': url, 'status': result['status'], 'captured_at': datetime.now(timezone.utc).isoformat(),
                   'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                   'body_path': str(body.relative_to(ROOT))}
        body.write_bytes(raw)
        receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
    if receipt['status'] in (403, 429):
        report['stopped_on_access_response'] = receipt
        save()
        raise RuntimeError('Access response retained; stop without retry')
    return raw, receipt


try:
    for case in cases.values():
        for accession in sorted({x['latest_selected_accession'] for x in case['core_history_diagnostics']}):
            name = case['cik'] + '-' + accession
            base = f"https://www.sec.gov/Archives/edgar/data/{int(case['cik'])}/{accession.replace('-', '')}/"
            item = {'cik': case['cik'], 'companyfacts_name': case['entity_name'],
                    'discovery_names': case['discovery_names'], 'accession': accession}
            report['filings'].append(item)
            raw, item['index_capture'] = capture(base + accession + '-index.html', name + '-index')
            if item['index_capture']['status'] != 200:
                item['state'] = 'INDEX_FETCH_FAILED'
                save()
                continue
            soup = BeautifulSoup(raw, 'html.parser')
            item['index_filers'] = [x.get_text(' ', strip=True) for x in soup.select('.companyInfo')]
            links = []
            for tr in soup.select('tr'):
                cells = tr.find_all('td')
                if len(cells) >= 4 and cells[3].get_text(strip=True) in ('10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A'):
                    a = cells[2].find('a')
                    if a:
                        links.append(a['href'].replace('/ix?doc=', ''))
            if len(links) != 1:
                item.update(state='PRIMARY_DOCUMENT_SELECTION_UNRESOLVED', primary_links=links)
                save()
                continue
            raw, item['primary_capture'] = capture(urljoin('https://www.sec.gov', links[0]), name + '-primary')
            if item['primary_capture']['status'] != 200:
                item['state'] = 'PRIMARY_FETCH_FAILED'
                save()
                continue
            soup = BeautifulSoup(raw, 'html.parser')
            item['dei_identity_facts'] = [{'name': n.get('name'), 'context': n.get('contextref'), 'text': n.get_text(' ', strip=True)}
                for n in soup.find_all(lambda n: n.get('name') in ['dei:EntityRegistrantName', 'dei:EntityCentralIndexKey'])]
            contexts = {}
            for c in soup.find_all(lambda n: n.name and n.name.split(':')[-1].lower() == 'context'):
                ids = c.find_all(lambda n: n.name and n.name.split(':')[-1].lower() == 'identifier')
                contexts[c.get('id')] = {'identifiers': [x.get_text(strip=True) for x in ids],
                    'has_dimensions': bool(c.find(lambda n: n.name and n.name.split(':')[-1].lower() in ['explicitmember', 'typedmember']))}
            tags = {'us-gaap:' + h['tag'] for h in case['core_history_diagnostics'] if h['latest_selected_accession'] == accession}
            item['core_fact_contexts'] = [{'tag': tag, 'contexts': sorted({n.get('contextref', '') for n in soup.find_all(attrs={'name': tag})})} for tag in sorted(tags)]
            referenced = {x for t in item['core_fact_contexts'] for x in t['contexts']}
            item['contexts'] = {x: contexts.get(x) for x in sorted(referenced)}
            item['state'] = 'PRIMARY_CAPTURED_EDITORIAL_REVIEW_PENDING'
            save()
            print(case['cik'], accession, 'identity facts', len(item['dei_identity_facts']), flush=True)
    report['complete'] = True
    save()
except Exception as error:
    report['error'] = str(error)
    save()
    raise
