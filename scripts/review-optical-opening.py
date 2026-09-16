"""Rendered second-direction review, not a declaration of visual approval."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts/qa/optical-opening-v2'
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine, width, height, reduced, scripting in [
        ('chromium', 1440, 1000, False, True),
        ('chromium', 390, 844, False, True),
        ('chromium', 320, 740, True, True),
        ('chromium', 1920, 1080, True, True),
        ('webkit', 1440, 1000, False, True),
        ('webkit', 390, 844, True, True),
        ('firefox', 1440, 1000, True, True),
        ('chromium', 390, 844, False, False),
    ]:
        browser = getattr(p, engine).launch()
        name = f'{engine}-{width}-{int(reduced)}-{int(scripting)}'
        context = browser.new_context(viewport={'width': width, 'height': height},
            reduced_motion='reduce' if reduced else 'no-preference', java_script_enabled=scripting)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:4187', wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        assert page.locator('h1').count() == 1
        assert page.locator('.cinema-hero__art img').evaluate('e=>e.complete && e.naturalWidth>0 && e.currentSrc.includes("optical-master-v3")')
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
        assert page.locator('h1').evaluate('e=>getComputedStyle(e).fontWeight') == '700'
        page.screenshot(path=str(out / f'{name}-hero.png'))
        for selector, suffix in [('.optical-threshold','transition'),('#introduction','intro')]:
            page.locator(selector).evaluate('e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-100,behavior:"instant"})')
            page.wait_for_timeout(700)
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            page.screenshot(path=str(out / f'{name}-{suffix}.png'))
        page.locator('.home-questions summary').first.focus()
        page.keyboard.press('Enter')
        assert page.locator('.home-questions details').first.get_attribute('open') is not None
        assert not errors, errors
        results.append({'case': name, 'passed': True, 'errors': errors})
        context.close()
        browser.close()
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width':1440,'height':1000},
        record_video_dir=str(out / 'video'), record_video_size={'width':1440,'height':1000})
    page = context.new_page()
    page.goto('http://127.0.0.1:4187', wait_until='networkidle')
    page.wait_for_timeout(1200)
    for step in range(150):
        page.evaluate('(y)=>scrollTo({top:y,behavior:"instant"})', step * 16)
        page.wait_for_timeout(40)
    page.wait_for_timeout(1000)
    video = page.video
    context.close()
    video.save_as(str(out / 'opening-scroll.webm'))
    browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
