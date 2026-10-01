import concurrent.futures
import datetime
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path('/Users/arhancanli/canlicapital-continuation-20261001')
OUT = Path(__file__).parent
BASE = 'https://canlicapital.com'
DEPLOY = 'https://meridian-95xs1yzz6-arhans-projects-ac470eaa.vercel.app'
PREVIOUS = json.loads((ROOT / 'artifacts/seo/mcp-findability-deployment-20261001.json').read_text())
report = {
    'schema': 'canli.joint-batch-live-verification.v1',
    'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'site_commit': '74d704d45df502e8a76c37439415842b47b93cb7',
    'deployment_url': DEPLOY,
    'pages': [], 'companies': [], 'dataset_files': [], 'hosted': [], 'problems': [],
    'scope': 'Sampled HTTP delivery and pinned hosted contracts. No analyzer score, indexing, expert label, broker order or model call.',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def request(url, body=None, headers=None):
    h = {'User-Agent': 'CanliCapital-owner-delivery-check/1.0'}
    h.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=h)
    try:
        res = urllib.request.urlopen(req, timeout=40)
    except urllib.error.HTTPError as error:
        res = error
    with res:
        return res.status, dict((k.lower(), v) for k, v in res.headers.items()), res.read(), res.url


class Page(HTMLParser):
    def __init__(self, raw):
        super().__init__()
        self.meta = {}; self.canonical = None; self.jsonld = []
        self.text = []; self.ld = None
        self.feed(raw.decode('utf-8'))

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta':
            self.meta[a.get('property', a.get('name', ''))] = a.get('content')
        if tag == 'link' and 'canonical' in a.get('rel', '').split():
            self.canonical = a.get('href')
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.ld = []

    def handle_data(self, text):
        self.text.append(text)
        if self.ld is not None:
            self.ld.append(text)

    def handle_endtag(self, tag):
        if tag == 'script' and self.ld is not None:
            self.jsonld.append(json.loads(''.join(self.ld)))
            self.ld = None


def check_page(path):
    status, headers, raw, final = request(BASE + path)
    page = Page(raw)
    ok = status == 200 and page.canonical == BASE + path
    ok = ok and 'index' in (page.meta.get('robots') or '') and 'noindex' not in (page.meta.get('robots') or '')
    ok = ok and 'noindex' not in headers.get('x-robots-tag', '') and bool(page.jsonld)
    card = {k: page.meta.get(k) for k in ['og:image', 'og:image:alt', 'og:image:width', 'og:image:height', 'og:site_name', 'twitter:card']}
    ok = ok and all(card.values()) and card['twitter:card'] == 'summary_large_image'
    row = {'path': path, 'status': status, 'canonical': page.canonical, 'robots': page.meta.get('robots'), 'x_robots_tag': headers.get('x-robots-tag'), 'structured_data_blocks': len(page.jsonld), 'card': card, 'body_sha256': sha(raw), 'pass': bool(ok)}
    if path == '/research/filing-facts-v0':
        text = ' '.join(' '.join(page.text).split())
        phrases = ['legacy answer parsing', 'no raw model responses or scoring version', 'effect of the parsing changes is unmeasured', 'full-sample coverage and denominator rules']
        row['evaluation_disclosure'] = {phrase: phrase in text for phrase in phrases}
        row['evaluation_guide_link'] = 'scripts/datasets/filing-facts/EVALUATION.md' in raw.decode()
        row['pass'] = row['pass'] and all(row['evaluation_disclosure'].values()) and row['evaluation_guide_link']
    return row


def check_company(prior):
    status, headers, raw, final = request(BASE + prior['path'])
    page = Page(raw)
    noindex = 'noindex' in headers.get('x-robots-tag', '') and 'noindex' in (page.meta.get('robots') or '')
    ok = status == prior['expected_status'] and noindex == prior['expected_noindex']
    if status == 200:
        ok = ok and page.canonical == BASE + prior['path']
    return {'path': prior['path'], 'status': status, 'canonical': page.canonical, 'robots': page.meta.get('robots'), 'x_robots_tag': headers.get('x-robots-tag'), 'expected_noindex': prior['expected_noindex'], 'pass': bool(ok)}


def check_file(name):
    path = '/datasets/filing-facts/v0/' + name
    status, headers, raw, final = request(BASE + path)
    local = (ROOT / ('public' + path)).read_bytes()
    return {'path': path, 'status': status, 'bytes': len(raw), 'sha256': sha(raw), 'matches_committed_bytes': raw == local, 'x_robots_tag': headers.get('x-robots-tag'), 'pass': status == 200 and raw == local and 'noindex' in headers.get('x-robots-tag', '')}


def rpc(path, method, params, call_id, session=None):
    h = {'Accept': 'application/json, text/event-stream', 'Content-Type': 'application/json'}
    if session:
        h['Mcp-Session-Id'] = session
    status, headers, raw, final = request(BASE + path, json.dumps({'jsonrpc': '2.0', 'id': call_id, 'method': method, 'params': params}).encode(), h)
    assert status == 200, (path, method, status, raw[:200])
    text = raw.decode()
    if text.lstrip().startswith('{'):
        answer = json.loads(text)
    else:
        data = [json.loads(line[6:]) for line in text.splitlines() if line.startswith('data: ')]
        answer = next(x for x in data if x.get('id') == call_id)
    assert 'error' not in answer, answer
    return answer['result'], headers.get('mcp-session-id')


def check_hosted(prior):
    init, session = rpc(prior['path'], 'initialize', {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'canli-owner-delivery-check', 'version': '1.0.0'}}, 1)
    listing, session = rpc(prior['path'], 'tools/list', {}, 2, session)
    names = [tool['name'] for tool in listing['tools']]
    version = init['serverInfo']['version']
    ok = version == prior['server']['version'] and names == prior['tools']
    return {'name': prior['name'], 'path': prior['path'], 'version': version, 'tools': names, 'count': len(names), 'protocol_version': init['protocolVersion'], 'same_version_and_tool_names_as_released_baseline': ok, 'pass': ok}


def group(key, jobs, function):
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(function, job) for job in jobs]
        for job, future in zip(jobs, futures):
            try:
                row = future.result(); report[key].append(row)
                if not row['pass']:
                    report['problems'].append({'group': key, 'job': str(job), 'failure': row})
            except Exception as error:
                report['problems'].append({'group': key, 'job': str(job), 'error': repr(error)})


pages = ['/', '/developers', '/annotate', '/research/filing-facts-v0', '/mcp-servers', '/mcp-servers/validation', '/mcp-servers/fundamentals', '/mcp-servers/research']
group('pages', pages, check_page)
group('companies', PREVIOUS['company'], check_company)
group('dataset_files', [p.name for p in sorted((ROOT / 'public/datasets/filing-facts/v0').iterdir()) if p.is_file()], check_file)
group('hosted', PREVIOUS['hosted'], check_hosted)

for label, operation in [
    ('deployment_home', lambda: request(DEPLOY + '/')),
    ('public_home', lambda: request(BASE + '/')),
    ('discovery', lambda: request(BASE + '/glassbox/mcp_discovery.json')),
    ('site_sitemap', lambda: request(BASE + '/sitemap-site.xml')),
    ('sitemap_index', lambda: request(BASE + '/sitemap.xml')),
    ('llms', lambda: request(BASE + '/llms.txt')),
    ('font', lambda: request(BASE + '/fonts/inter/InterVariable.woff2')),
]:
    try:
        status, headers, raw, final = operation()
        row = {'status': status, 'sha256': sha(raw), 'pass': status == 200}
        if label == 'deployment_home':
            deploy_home = raw
        if label == 'public_home':
            row['matches_captured_deployment_home'] = raw == deploy_home
            row['pass'] = row['pass'] and row['matches_captured_deployment_home']
        if label == 'discovery':
            row['matches_tested_bytes'] = raw == (ROOT / 'public/glassbox/mcp_discovery.json').read_bytes()
            row['pass'] = row['pass'] and row['matches_tested_bytes']
        if label == 'site_sitemap':
            row['page_coverage'] = {p: BASE + p in raw.decode() for p in pages}
            row['pass'] = row['pass'] and all(row['page_coverage'].values())
        if label == 'sitemap_index':
            row['child_count'] = len(ET.fromstring(raw).findall('{http://www.sitemaps.org/schemas/sitemap/0.9}sitemap'))
            row['pass'] = row['pass'] and row['child_count'] == 22
        if label == 'llms':
            row['mcp_pages_present'] = all(BASE + p in raw.decode() for p in pages if p.startswith('/mcp-servers'))
            row['pass'] = row['pass'] and row['mcp_pages_present']
        if label == 'font':
            row['matches_tested_bytes'] = raw == (ROOT / 'public/fonts/inter/InterVariable.woff2').read_bytes()
            row['pass'] = row['pass'] and row['matches_tested_bytes']
        report[label] = row
        if not row['pass']:
            report['problems'].append({'group': label, 'failure': row})
    except Exception as error:
        report['problems'].append({'group': label, 'error': repr(error)})

report['pass'] = not report['problems']
report['probe_sha256'] = sha(Path(__file__).read_bytes())
target = OUT / 'joint-batch-live-20261001.json'
target.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'pass': report['pass'], 'pages': len(report['pages']), 'company_cases': len(report['companies']), 'dataset_files': len(report['dataset_files']), 'hosted_contracts': len(report['hosted']), 'problems': report['problems'], 'receipt': str(target)}))
if not report['pass']:
    raise SystemExit(1)
