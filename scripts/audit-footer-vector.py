"""Check the final shared footer SVG at narrow and desktop widths."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(__file__).resolve().parents[1] / 'artifacts/qa/footer-vector'
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (320, 390, 1440):
        context = browser.new_context(viewport={'width': width, 'height': 1000}, reduced_motion='reduce')
        page = context.new_page()
        for route in ('/', '/developers', '/systems'):
            page.goto('http://127.0.0.1:4188' + route, wait_until='networkidle')
            footer = page.locator('.cc-footer')
            footer.scroll_into_view_if_needed()
            assert page.locator('.cc-footer__wordmark svg').count() == 1
            assert page.locator('.cc-footer__wordmark').get_attribute('aria-hidden') == 'true'
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            if route == '/' and width in (390, 1440):
                # Oversized element captures can rasterize fixed content that is
                # correctly outside the viewport. Verify that state before
                # suppressing the offscreen skip link for this image only.
                assert page.locator('.skip-link').evaluate('e => e.getBoundingClientRect().bottom < 0')
                footer.screenshot(path=str(out / f'home-{width}.png'),
                                  style='.skip-link:not(:focus) { visibility: hidden !important; }')
            results.append({'route': route, 'width': width, 'passed': True})
        context.close()
    browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print(f'PASS: {len(results)} footer vector views')
