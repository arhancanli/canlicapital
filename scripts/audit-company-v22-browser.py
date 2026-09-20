"""Representative v22 layout and source-notice checks; not a whole-corpus audit."""
import hashlib
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

base, output = sys.argv[1:3]
paths = [
    ('/companies', None),
    ('/companies/page/67', None),
    ('/companies/0000059255/EarningsPerShareBasic', 'presentation-only EPS review'),
    ('/companies/0000065596/EarningsPerShareDiluted', 'Two diluted-share observations remain withheld'),
    ('/companies/0001417926', 'Both 2014 share counts remain withheld'),
    ('/companies/0001607962/EarningsPerShareBasic', 'six separate ILS-tagged EPS observations remain withheld'),
    ('/companies/0001425205', 'older Iovance weighted-average share observation'),
    ('/companies/0001433309/EarningsPerShareBasic', 'presentation-only review'),
]
report = dict(schema='canli.v22-browser.v1', publication_approved=False,
              scope='Representative Chromium/WebKit mobile/desktop layout, exact source notices, canonical/developer links and withheld-history 404s. Not whole-corpus, accessibility certification, load, hosted or indexing evidence.',
              code_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), checks=[], failures=[])
try:
    with sync_playwright() as playwright:
        for engine in ['chromium', 'webkit']:
            browser = getattr(playwright, engine).launch(headless=True)
            try:
                for width in [390, 1440]:
                    page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    for path, notice in paths:
                        response = page.goto(base + path, wait_until='networkidle')
                        assert response.status == 200, (engine, width, path, response.status)
                        assert response.headers['x-robots-tag'] == 'noindex'
                        assert page.locator('h1').count() == 1
                        assert page.locator('link[rel=canonical]').get_attribute('href') == 'https://canlicapital.com' + path
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (engine, width, path, 'horizontal overflow')
                        assert page.locator('h1').evaluate('(n) => getComputedStyle(n).fontSize') != '32px'
                        if notice:
                            assert notice in page.locator('main').inner_text(), (engine, width, path, notice)
                        for target in ['/developers#quickstart', '/developers#ai-assistant', 'https://github.com/arhancanli/alphac']:
                            assert page.locator(f'a[href="{target}"]').count(), (path, target)
                        data = page.locator('script[type="application/ld+json"]').evaluate_all('(nodes) => nodes.flatMap(n => JSON.parse(n.textContent))')
                        crumbs = next(item for item in data if item['@type'] == 'BreadcrumbList')
                        assert crumbs['itemListElement'][-1]['item'] == 'https://canlicapital.com' + path
                        if engine == 'chromium' and path == '/companies/0001425205':
                            page.screenshot(path=f'/tmp/canli-v22-iovance-{width}.png', full_page=True)
                        report['checks'].append(dict(engine=engine, width=width, path=path, status='PASS'))
                    for tag in ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']:
                        path = '/companies/0001425205/' + tag
                        response = page.goto(base + path, wait_until='networkidle')
                        assert response.status == 404, (path, response.status)
                        report['checks'].append(dict(engine=engine, width=width, path=path, status='PASS', http_status=404))
                    assert not errors, errors
                    page.close()
            finally:
                browser.close()
except Exception as error:
    report['failures'].append(str(error))
    raise
finally:
    with Path(output).open('x') as handle:
        handle.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps(dict(checks=len(report['checks']), failures=report['failures'])))
