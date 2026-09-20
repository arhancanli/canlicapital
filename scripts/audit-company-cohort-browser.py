"""Sample a source-bound staged cohort in real browsers; never claims full coverage."""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('delivery', type=Path)
parser.add_argument('report', type=Path)
parser.add_argument('--base-url', default='http://127.0.0.1:4187')
parser.add_argument('--screenshots', type=Path, default=Path('artifacts/qa/company-reference'))
args = parser.parse_args()
manifest_bytes = (args.delivery / 'delivery.json').read_bytes()
manifest = json.loads(manifest_bytes)
records = []
for item in manifest['files']:
    descriptor = item['selected']
    data = (args.delivery / descriptor['storage_path']).read_bytes()
    assert len(data) == descriptor['bytes']
    assert hashlib.sha256(data).hexdigest() == descriptor['sha256']
    records.append(json.loads(data))
assert records, 'Empty cohort'

samples = {'/companies': 'first directory',
           f'/companies/page/{(len(records) + 49) // 50}': 'last directory'}
# A single directory page uses /companies, not the redirecting /page/1 route.
if len(records) <= 50:
    samples.pop('/companies/page/1')
longest_name = max(records, key=lambda r: len(r['name']))
samples[f"/companies/{longest_name['cik']}"] = 'longest issuer name'
most_concepts = max(records, key=lambda r: len(r['concepts']))
samples[f"/companies/{most_concepts['cik']}"] = 'most selected concepts'
histories = [(r, c) for r in records for c in r['concepts']]
for reason, key in [
    ('longest concept identifier', lambda rc: len(rc[1]['tag'])),
    ('most observations', lambda rc: len(rc[1]['observations'])),
    ('most original units', lambda rc: len({o['unit'] for o in rc[1]['observations']})),
    ('longest displayed number', lambda rc: max(len(str(o['val'])) for o in rc[1]['observations'])),
]:
    record, concept = max(histories, key=key)
    samples[f"/companies/{record['cik']}/{concept['tag']}"] = reason
for record, concept in histories:
    if any(o['unit'] == 'USD/shares' for o in concept['observations']):
        samples[f"/companies/{record['cik']}/{concept['tag']}"] = 'per-share units'
        break

for record, concept in histories:
    if len({o['end'] for o in concept['observations']}) >= 2 and all(o['val'] == 0 for o in concept['observations']):
        samples[f"/companies/{record['cik']}/{concept['tag']}"] = 'reported zero history'
        break
for record in records:
    vectors = {}
    found = False
    for concept in record['concepts']:
        vector = tuple(sorted((concept['kind'], o['unit'], o.get('start', ''), o['end'], o['val']) for o in concept['observations']))
        if vector in vectors:
            samples[f"/companies/{record['cik']}/{concept['tag']}"] = 'equal numerical histories'
            found = True
            break
        vectors[vector] = concept['tag']
    if found:
        break

for record in records:
    if record.get('editorial_exclusions'):
        samples[f"/companies/{record['cik']}"] = 'editorial scope exclusion'

args.screenshots.mkdir(parents=True, exist_ok=True)
report = {
    'schema': 'canli.company-cohort-browser.v1',
    'scope': 'Deterministic risk-based sample of local staged HTML; not full browser coverage, field performance, release approval or indexing.',
    'publication_approved': False,
    'delivery_manifest_sha256': hashlib.sha256(manifest_bytes).hexdigest(),
    'selection_policy': manifest.get('selection_policy', 'core-default'),
    'companies': len(records), 'samples': samples, 'checks': [], 'failures': [],
    'code_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}
try:
    with sync_playwright() as p:
        for engine in ['chromium', 'webkit']:
            browser = getattr(p, engine).launch(headless=True)
            try:
                for width in [320, 390, 1440]:
                    page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    for path, reason in samples.items():
                        response = page.goto(args.base_url + path, wait_until='networkidle')
                        assert response.status == 200, (path, response.status)
                        assert response.headers['x-robots-tag'] == 'noindex'
                        assert page.locator('h1').count() == 1
                        assert page.locator('link[rel=canonical]').get_attribute('href') == 'https://canlicapital.com' + path
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (engine, width, path, 'overflow')
                        data = page.locator('script[type="application/ld+json"]').evaluate_all('(nodes) => nodes.flatMap(n => JSON.parse(n.textContent))')
                        crumbs = next(item for item in data if item['@type'] == 'BreadcrumbList')
                        assert crumbs['itemListElement'][-1]['item'] == 'https://canlicapital.com' + path
                        for target in ['/developers#quickstart', '/developers#ai-assistant', 'https://github.com/arhancanli/alphac']:
                            assert page.locator(f'a[href="{target}"]').count(), (path, target)
                        assert page.locator('h1').evaluate('(n) => getComputedStyle(n).fontSize') != '32px', 'Styles not applied'
                        if path.startswith('/companies/') and not path.startswith('/companies/page/'):
                            assert page.locator('a[href^="/company-data/sources/"]').count(), path
                            assert page.locator('a[href^="/company-data/"]').count(), path
                        if reason == 'editorial scope exclusion':
                            record = next(r for r in records if path == '/companies/' + r['cik'])
                            assert page.locator('#editorial-scope').count() == 1
                            for excluded in record['editorial_exclusions']:
                                excluded_path = path + '/' + excluded['tag']
                                assert page.locator(f'a[href="{excluded_path}"]').count() == 0
                                assert page.request.get(args.base_url + excluded_path).status == 404
                                assert page.locator(f'a[href="{excluded["filing_url"]}"]').count()
                        if reason == 'per-share units':
                            assert 'USD/shares' in page.locator('main').inner_text()
                        if reason == 'reported zero history':
                            assert 'reported zeros, not values substituted for missing data' in page.locator('section[aria-labelledby="history-context"]').inner_text()
                        if reason == 'equal numerical histories':
                            context = page.locator('section[aria-labelledby="history-context"]')
                            assert 'accounting definitions remain distinct' in context.inner_text()
                            link = context.locator('a').first.get_attribute('href')
                            linked = page.request.get(args.base_url + link)
                            assert linked.status == 200
                        if engine == 'chromium' and width == 390 and reason in ['longest issuer name', 'longest concept identifier', 'equal numerical histories', 'reported zero history']:
                            image_path = args.screenshots / f"cohort-{manifest['files'][0]['cik']}-{reason.replace(' ', '-')}.png"
                            page.screenshot(path=str(image_path), full_page=True)
                        report['checks'].append({'engine': engine, 'width': width, 'path': path, 'status': 'PASS'})
                    assert not errors, errors
                    page.close()
            finally:
                browser.close()
except Exception as error:
    report['failures'].append(str(error))
    raise
finally:
    args.report.write_text(json.dumps(report, indent=2) + '\n')
print(f"{len(report['checks'])} browser checks passed across {len(samples)} sampled routes")
