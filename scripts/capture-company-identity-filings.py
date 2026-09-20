"""Capture filing identity evidence for the explicitly recorded review queue."""
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
OUT = ROOT / 'artifacts/seo/corpus-local/identity-filings'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = ROOT / 'artifacts/seo/company-identity-filing-review-20260920.json'
SOURCE = ROOT / 'artifacts/seo/company-identity-exclusions-20260920.json'
report = {'schema': 'canli.company-identity-filing-review.v1',
          'input_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
          'publication_approved': False, 'complete': False, 'filings': [],
          'scope': 'Filing identities and inline context identifiers for latest selected core accessions; not all-history numeric verification or admission.'}


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
    for case in json.loads(SOURCE.read_bytes())['cases']:
        if case['review_state'] != 'IDENTITY_AND_FILING_SCOPE_REVIEW_REQUIRED':
            continue
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
            item['state'] = 'IDENTITY_EVIDENCE_CAPTURED_REVIEW_PENDING'
            save()
            print(case['cik'], accession, 'identity facts', len(item['dei_identity_facts']), flush=True)
    report['complete'] = True
    save()
except Exception as error:
    report['error'] = str(error)
    save()
    raise
