"""Check representative clean preview routes and real browser navigation."""
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

origin, manifest_path, manifest_hash, output = sys.argv[1:]
url = urlsplit(origin)
assert url.scheme == 'https' and url.path in ('', '/') and not url.query and not url.fragment and not url.username
origin = origin.rstrip('/')
raw = Path(manifest_path).read_bytes()
assert hashlib.sha256(raw).hexdigest() == manifest_hash
manifest = json.loads(raw)
samples = [manifest['files'][i] for i in sorted({0, len(manifest['files']) // 2, len(manifest['files']) - 1})]
report = {'schema': 'canli.hosted-company-browser.v1', 'origin': origin, 'manifest_sha256': manifest_hash,
          'publication_approved': False, 'complete': False, 'checks': [], 'failures': [], 'navigation_retries': [],
          'code_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'scope': 'Representative clean noindex preview pages and first-company navigation at two viewports in Chromium/WebKit. Not full corpus, production activation, accessibility certification or field-performance evidence.'}
out = Path(output)
with out.open('x') as f:
    json.dump(report, f)


def save():
    out.write_text(json.dumps(report, indent=2) + '\n')


def inspect(page, response, path):
    assert response and response.status == 200, (path, response.status if response else None)
    assert 'noindex' in response.headers.get('x-robots-tag', '')
    assert page.locator('h1').count() == 1 and page.locator('h1').is_visible()
    assert page.locator('link[rel=canonical]').get_attribute('href') == 'https://canlicapital.com' + path
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'horizontal document overflow'
    assert page.locator('main.company-reference').evaluate('(e) => parseFloat(getComputedStyle(e).paddingTop) >= 100'), 'company styles not applied'
    for href in ['/developers#quickstart', '/developers#ai-assistant', 'https://github.com/arhancanli/alphac']:
        assert page.locator('a[href="' + href + '"]').count(), (path, href)


def navigate(page, path, engine, width):
    try:
        return page.goto(origin + path, wait_until='networkidle', timeout=45000)
    except Exception as error:
        if 'ERR_NETWORK_CHANGED' not in str(error):
            raise
        report['navigation_retries'].append({'engine': engine, 'width': width, 'path': path, 'error': str(error), 'attempt': 1})
        save()
        page.wait_for_timeout(300)
        return page.goto(origin + path, wait_until='networkidle', timeout=45000)


with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch(headless=True)
        try:
            for width in [390, 1440]:
                page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                paths = ['/companies'] + [path for sample in samples for path in
                                         ['/companies/' + sample['cik'], '/companies/' + sample['cik'] + '/Assets']]
                for path in paths:
                    try:
                        response = navigate(page, path, engine, width)
                        inspect(page, response, path)
                        if path == '/companies':
                            assert page.locator('main a[href="/companies/' + samples[0]['cik'] + '"]').count(), 'pinned first company absent from directory'
                        report['checks'].append({'engine': engine, 'width': width, 'path': path, 'status': 'PASS'})
                    except Exception as e:
                        report['failures'].append({'engine': engine, 'width': width, 'path': path, 'error': str(e)})
                        page.close()
                        page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
                        page.on('pageerror', lambda e: errors.append(str(e)))
                    save()
                try:
                    response = navigate(page, '/companies', engine, width)
                    inspect(page, response, '/companies')
                    first = '/companies/' + samples[0]['cik']
                    # Select visible links from the rendered DOM, then exercise
                    # the same clean paths a visitor follows.
                    with page.expect_navigation(wait_until='networkidle') as navigation:
                        page.locator('main a[href="' + first + '"]').first.click()
                    inspect(page, navigation.value, first)
                    with page.expect_navigation(wait_until='networkidle') as navigation:
                        page.locator('main a[href="' + first + '/Assets"]').first.click()
                    inspect(page, navigation.value, first + '/Assets')
                    assert page.locator('main a[href="' + samples[0]['selected']['path'] + '"]').count()
                    with page.expect_navigation(wait_until='networkidle') as navigation:
                        page.locator('main a[href="/developers#quickstart"]').first.click()
                    assert navigation.value.status == 200 and page.locator('#quickstart').count()
                    assert not errors, errors
                    report['checks'].append({'engine': engine, 'width': width, 'flow': 'directory-company-history-developer', 'status': 'PASS'})
                except Exception as e:
                    report['failures'].append({'engine': engine, 'width': width, 'flow': 'directory-company-history-developer', 'error': str(e)})
                save()
                page.close()
        finally:
            browser.close()
report['complete'] = True
report['passed'] = not report['failures']
save()
print(json.dumps({'checks': len(report['checks']), 'failures': len(report['failures']), 'passed': report['passed']}))
if not report['passed']:
    raise SystemExit(1)
