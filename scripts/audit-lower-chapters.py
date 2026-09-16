"""Exercise the new lower-page controls without submitting external forms."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/lower-chapters')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine, width, reduced in [('chromium', 1440, False), ('webkit', 1440, True), ('webkit', 390, True)]:
        browser = getattr(p, engine).launch(headless=True)
        page = browser.new_page(viewport={'width': width, 'height': 1000}, reduced_motion='reduce' if reduced else 'no-preference')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:4188/', wait_until='networkidle')
        page.locator('.evidence-core__stage').evaluate('e => e.scrollIntoView({behavior:"instant"})')
        if width > 900:
            page.wait_for_selector('.evidence-core[data-renderer=webgl]')
            for index in range(5):
                button = page.locator('.core-state-button').nth(index)
                button.evaluate('e => e.click()')
                assert button.get_attribute('aria-pressed') == 'true'
                assert page.locator('.evidence-core').get_attribute('data-selected-core') == str(index)
            page.locator('.core-follow').evaluate('e => e.click()')
            assert page.locator('.evidence-core').get_attribute('data-selected-core') is None
        else:
            assert page.locator('.core-state-button:disabled').count() == 5
        page.locator('#film-tab-0').focus()
        page.keyboard.press('ArrowRight')
        assert page.locator('#film-tab-1').get_attribute('aria-selected') == 'true'
        assert page.locator('.system-film:visible').count() == 1
        page.keyboard.press('End')
        assert page.locator('#film-tab-2').get_attribute('aria-selected') == 'true'
        page.keyboard.press('Home')
        assert page.locator('#film-tab-0').get_attribute('aria-selected') == 'true'
        page.evaluate("location.hash = 'film-panel-2'")
        page.wait_for_function("document.querySelector('#film-tab-2').getAttribute('aria-selected') === 'true'")
        page.evaluate("location.hash = '%E0%A4%A'")
        page.wait_for_timeout(100)
        assert page.locator('.trace-line > li').count() == 5
        assert page.locator('.trace-line > :not(li)').count() == 0
        for selector in ['.evidence-core__stage', '.system-films', '.trace', '.paper-stack', '#evidence', '#trust', '.home-questions']:
            page.locator(selector).evaluate('e => scrollTo({top:e.getBoundingClientRect().top+scrollY-100,behavior:"instant"})')
            page.wait_for_timeout(500)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(out / f'{engine}-{width}-{selector.strip(".#")}.png'))
        assert not errors, errors
        results.append({'engine': engine, 'width': width, 'reduced': reduced, 'passed': True})
        browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
