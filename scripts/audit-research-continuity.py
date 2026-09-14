"""Read-only continuity/layout checks; no form submission or backend writes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/research-continuity')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine, width, reduced in [('chromium', 1440, False), ('webkit', 1440, False), ('webkit', 390, False), ('webkit', 1440, True)]:
        browser = getattr(p, engine).launch()
        page = browser.new_page(viewport={'width': width, 'height': 1000}, reduced_motion='reduce' if reduced else 'no-preference')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:4187/', wait_until='networkidle')
        page.wait_for_timeout(700)
        poses = []
        for selector in ['#research', '#evidence', '#trust', '.home-questions', '#access', '#research']:
            page.locator(selector).evaluate('e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-100,behavior:"instant"})')
            page.wait_for_timeout(1100)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (engine, width, selector)
            if width == 1440 and not reduced:
                assert page.locator('.research-journey__rail').count() == 1
                rail = page.locator('.research-journey__rail').bounding_box()
                root = page.locator('.research-journey').bounding_box()
                expected = max(root['y'], min(78, root['y'] + root['height'] - rail['height']))
                assert abs(rail['y'] - expected) < 2, (selector, rail['y'], expected)
                poses.append(page.locator('.research-journey__packet').evaluate('e=>getComputedStyle(e).transform'))
            page.screenshot(path=str(out / f'{engine}-{width}-{reduced}-{selector.lstrip("#.")}.png'))
        if poses:
            assert len(set(poses[:-1])) >= 4, poses
            assert poses[0] == poses[-1], ('reverse did not restore initial pose', poses)
        page.locator('#evidence-details').evaluate('e=>e.open=false')
        page.wait_for_timeout(400)
        page.locator('#evidence-details').evaluate('e=>e.open=true')
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(500)
        assert page.locator('.research-journey__rail').count() == 0
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_timeout(700)
        assert page.locator('.paper-card').count() == 3
        assert not errors, errors
        results.append({'browser': engine, 'width': width, 'initialReducedMotion': reduced, 'poses': poses, 'errors': errors, 'passed': True})
        browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
