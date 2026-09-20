"""Freeze a source-bound subset for separate XBRL comparison, without requests."""
import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup

root = Path(__file__).resolve().parents[1]
capture_path, comparison_path, prefix = map(Path, sys.argv[1:])
sha = lambda raw: hashlib.sha256(raw).hexdigest()
capture_raw, comparison_raw = capture_path.read_bytes(), comparison_path.read_bytes()
capture, comparison = json.loads(capture_raw), json.loads(comparison_raw)
sources = {(f['cik'], f['accession']): f for f in capture['filings']}
assert len(sources) == len(capture['filings'])
selected, checks, selections = [], [], []
for filing in comparison['filings']:
    unresolved = [c for c in filing['checks'] if not c['matched']]
    if not unresolved:
        continue
    key = (filing['cik'], filing['accession'])
    source = sources[key]
    assert source['state'] == 'PRIMARY_CAPTURED_EDITORIAL_REVIEW_PENDING'
    assert source['primary_capture']['sha256'] == filing['primary_sha256']
    receipt = source['index_capture']
    body = (root / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(body) == receipt['bytes'] and sha(body) == receipt['sha256']
    expected = f'/Archives/edgar/data/{int(key[0])}/{key[1].replace("-", "")}/'
    index_url = urlsplit(receipt['url'])
    assert index_url.scheme == 'https' and index_url.hostname == 'www.sec.gov' and index_url.path.startswith(expected)
    links = set()
    for tr in BeautifulSoup(body, 'html.parser').select('tr'):
        cells = tr.find_all('td')
        if len(cells) < 4:
            continue
        kind, description = cells[3].get_text(strip=True), cells[1].get_text(' ', strip=True).upper()
        if kind == 'EX-101.INS' or (kind == 'XML' and 'INSTANCE' in description):
            anchor = cells[2].find('a')
            if anchor:
                url = urljoin(receipt['url'], anchor['href'])
                parsed = urlsplit(url)
                assert parsed.scheme == 'https' and parsed.hostname == 'www.sec.gov' and parsed.path.startswith(expected)
                links.add(url)
    selections.append({'cik': key[0], 'accession': key[1], 'urls': sorted(links),
                       'state': 'EXACT_INSTANCE_SELECTED' if len(links) == 1 else 'UNRESOLVED',
                       'observations': len(unresolved)})
    selected.append(source)
    checks.append({**filing, 'checks': unresolved})

snapshot = {'schema': 'canli.equal-history-capture-subset.v1', 'complete': True,
            'parent_capture_sha256': sha(capture_raw), 'parent_capture_complete': capture['complete'],
            'filings': selected, 'scope': 'Complete only for the explicitly selected captured subset; parent acquisition can remain incomplete.'}
snapshot_raw = (json.dumps(snapshot, indent=2) + '\n').encode()
comparison_subset = {'schema': 'canli.equal-history-xbrl-input.v1',
                     'capture_report_sha256': sha(snapshot_raw), 'parent_comparison_sha256': sha(comparison_raw),
                     'filings': checks, 'instance_selections': selections, 'publication_approved': False}
for suffix, raw in [('-capture.json', snapshot_raw), ('-comparison.json', (json.dumps(comparison_subset, indent=2) + '\n').encode())]:
    with Path(str(prefix) + suffix).open('xb') as handle:
        handle.write(raw)
print(json.dumps({'filings': len(selected), 'unambiguous_instances': sum(s['state'] == 'EXACT_INSTANCE_SELECTED' for s in selections),
                  'observations': sum(s['observations'] for s in selections)}))
