"""Focused audit of the simplified homepage reading path; existing dev server."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/redesign-scope')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for name in ['chromium', 'webkit']:
        browser = getattr(p, name).launch(headless=True)
        for width, height in [(1440, 1000), (390, 844)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto('http://127.0.0.1:4187/', wait_until='networkidle')
            room = page.locator('#record-details')
            assert not room.evaluate('(e) => e.open')
            assert page.locator('#evidence-details').evaluate('(e) => e.open')
            assert page.locator('.sleeve-row').count() == 4
            room.locator(':scope > summary').focus()
            page.keyboard.press('Enter')
            assert room.evaluate('(e) => e.open')
            page.keyboard.press('Enter')
            assert not room.evaluate('(e) => e.open')
            page.goto('http://127.0.0.1:4187/#method', wait_until='networkidle')
            page.wait_for_function('document.querySelector("#record-details").open')
            assert page.locator('#method').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(out / f'{name}-{width}-deep-link.png'))
            assert not errors, errors
            results.append({'browser': name, 'width': width, 'passed': True,
                            'checks': ['collapsed default', 'limitations expanded', 'keyboard toggle', 'deep link reveal', 'four strategies retained', 'no horizontal overflow', 'no page errors']})
            page.close()
        browser.close()
(out / 'disclosure-report.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
