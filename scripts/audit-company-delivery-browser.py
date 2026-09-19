"""Local staged catalog rendering; no production requests or field metrics."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

paths = ['/companies', '/companies/page/7', '/companies/0001094517', '/companies/0001094517/Assets', '/companies/0001483994', '/companies/0001818874', '/companies/0000320193/Revenues']
checks = []
with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch(headless=True)
        try:
            for width in [390, 1440]:
                page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                for path in paths:
                    response = page.goto('http://127.0.0.1:4187' + path, wait_until='networkidle')
                    assert response.status == 200, path
                    assert response.headers['x-robots-tag'] == 'noindex'
                    assert page.locator('h1').count() == 1
                    assert page.locator('link[rel=canonical]').get_attribute('href') == 'https://canlicapital.com' + path
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (engine, width, path)
                    data = page.locator('script[type="application/ld+json"]').evaluate_all('(nodes) => nodes.flatMap(n => JSON.parse(n.textContent))')
                    crumbs = next(item for item in data if item['@type'] == 'BreadcrumbList')
                    assert crumbs['itemListElement'][-1]['item'] == 'https://canlicapital.com' + path
                    for target in ['/developers#quickstart', '/developers#ai-assistant', 'https://github.com/arhancanli/alphac']:
                        assert page.locator(f'a[href="{target}"]').count(), (path, target)
                    assert page.locator('h1').evaluate('(n) => getComputedStyle(n).fontSize') != '32px', 'Styles not applied'
                    if engine == 'chromium' and path == '/companies/0001094517':
                        page.screenshot(path=f'/tmp/canli-delivery-{width}.png', full_page=True)
                    checks.append({'engine': engine, 'width': width, 'path': path, 'status': 'PASS'})
                assert not errors, errors
                page.close()
        finally:
            browser.close()
Path('artifacts/seo/company-delivery-browser.json').write_text(json.dumps({'scope': 'Local staged HTML, layout/canonical/breadcrumb/developer links; no field-performance or index claim', 'checks': checks}, indent=2) + '\n')
print(f'{len(checks)} browser checks passed')
