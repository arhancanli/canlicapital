"""Read-only UI and presentation coverage; never submit live API or waitlist forms."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ORIGIN = os.getenv('MOTION_ORIGIN', 'http://127.0.0.1:4188')
OUT = Path('artifacts/qa/full-site-motion')
OUT.mkdir(parents=True, exist_ok=True)
ROUTES = ['/', '/systems', '/research', '/performance', '/open', '/progress',
          '/developers', '/tools', '/tools/deflated-sharpe', '/tools/evidence-chain',
          '/methodology', '/verify', '/measurements', '/trials', '/notes',
          '/research/crypto-carry-portable-v1', '/measurements/alpaca-broker-reconciliation']
start_group = int(os.getenv('MOTION_START_GROUP', '0'))
results = json.loads((OUT / 'report.json').read_text()) if start_group else []
with sync_playwright() as p:
    for engine, width, reduced, js_enabled in [
        ('chromium', 1440, False, True), ('webkit', 390, False, True),
        ('webkit', 390, True, True), ('chromium', 320, True, False),
    ][start_group:]:
        browser = getattr(p, engine).launch()
        context = browser.new_context(viewport={'width': width, 'height': 1000 if width > 1000 else 844},
            reduced_motion='reduce' if reduced else 'no-preference', java_script_enabled=js_enabled)
        for route in ROUTES:
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            response = page.goto(ORIGIN + route, wait_until='networkidle')
            assert response.status == 200, (route, response.status)
            page.evaluate('document.fonts.ready')
            page.wait_for_timeout(450)
            assert page.locator('main h1').count() == 1, route
            if js_enabled:
                assert page.locator('html').get_attribute('data-optical-motion') == 'ready', route
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (engine, width, route, 'overflow')
            slug = 'home' if route == '/' else route.strip('/').replace('/', '--')
            prefix = f'{engine}-{width}-{int(reduced)}-{int(js_enabled)}-{slug}'
            if route in ['/', '/developers', '/systems', '/research/crypto-carry-portable-v1', '/tools/deflated-sharpe']:
                page.screenshot(path=str(OUT / f'{prefix}-entry.png'))
            if route == '/':
                assert page.locator('.deep-record[open]').count() == 2
                assert page.locator('.sleeve-row').count() == 4
                assert page.locator('.system-films video').count() >= 3
                for selector in ['#sleeves', '#live-record', '#developer-api', '#system-films', '#research', '#trust', '.home-questions', '#access']:
                    print(prefix, selector, flush=True)
                    # Ask the browser to scroll a long chapter to its start.
                    # Playwright's stability wait can stall on a scroll-linked
                    # element; native scrolling does not require that wait.
                    page.locator(selector).evaluate('(e) => e.scrollIntoView({block:"start",behavior:"instant"})')
                    page.wait_for_timeout(1000)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (prefix, selector)
                    if width == 1440 or (engine == 'webkit' and not reduced):
                        page.screenshot(path=str(OUT / f'{prefix}-{selector.strip("#.")}.png'))
                if js_enabled:
                    page.locator('[data-curve-key="alphamax"]').click()
                    assert page.locator('[data-curve-key="alphamax"]').get_attribute('aria-pressed') == 'true'
                    assert page.locator('#equity-path').get_attribute('d')
                page.locator('.home-questions summary').first.focus()
                page.keyboard.press('Enter')
                assert page.locator('.home-questions details').first.get_attribute('open') is not None
            # Verify lower-page content is reachable and the shared footer is visible.
            page.locator('.cc-footer').evaluate('(e) => e.scrollIntoView({block:"start",behavior:"instant"})')
            page.wait_for_timeout(500)
            assert page.locator('.cc-footer a[href="/developers"]').is_visible()
            assert not errors, (prefix, errors)
            results.append({'engine': engine, 'width': width, 'reduced': reduced, 'javascript': js_enabled, 'route': route, 'passed': True})
            page.close()
            (OUT / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
        context.close()
        browser.close()
print(f'{len(results)} route/browser/fallback cases passed.')
