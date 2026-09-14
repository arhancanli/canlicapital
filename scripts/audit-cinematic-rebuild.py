"""Full-page design regression: rendered states, fallbacks and preserved access."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/qa/cinematic-rebuild"
ORIGIN = os.environ.get("HOMEPAGE_AUDIT_ORIGIN", "http://127.0.0.1:4187")
OUT.mkdir(parents=True, exist_ok=True)
results = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, width, height, reduced, javascript in [
        ("desktop", 1440, 1000, False, True),
        ("wide", 1920, 1080, False, True),
        ("laptop", 1024, 768, False, True),
        ("mobile", 390, 844, False, True),
        ("small-mobile", 320, 740, False, True),
        ("tablet", 768, 1024, False, True),
        ("reduced", 1440, 1000, True, True),
        ("no-js", 390, 844, False, False),
        ("desktop-no-js", 1440, 1000, False, False),
    ]:
        context = browser.new_context(viewport={"width": width, "height": height}, java_script_enabled=javascript,
                                      reduced_motion="reduce" if reduced else "no-preference")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(ORIGIN, wait_until="networkidle")
        assert page.locator('h1').count() == 1
        assert page.locator('.cinema-hero__art img').evaluate('img => img.complete && img.naturalWidth > 0')
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), f'{name}: initial overflow'
        page.screenshot(path=str(OUT / f'{name}-hero.png'))
        enhanced = 'is-enhanced' in page.locator('.cinema-process').get_attribute('class')
        assert enhanced == (width >= 1000 and javascript and not reduced), name
        for selector, label in [('#introduction', 'intro'), ('.cinema-process', 'process'), ('#sleeves', 'strategies'), ('#live-record', 'record'), ('#developer-api', 'api'), ('#research', 'research'), ('#trust', 'accountability'), ('.home-questions', 'faq'), ('#access', 'access'), ('#footer', 'footer')]:
            page.locator(selector).evaluate('el => window.scrollTo({top: el.getBoundingClientRect().top + scrollY - 78, behavior: "instant"})')
            page.wait_for_timeout(180)
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), f'{name}: {label} overflow'
            page.screenshot(path=str(OUT / f'{name}-{label}.png'))
        for image in page.locator('.cinema-hero__art img, .cinema-process__art img, .developer-chapter__art').all():
            assert image.evaluate('img => img.complete && img.naturalWidth > 0')
        # Native question disclosures must work without scripting too.
        summary = page.locator('.home-questions summary').first
        summary.focus()
        page.keyboard.press('Enter')
        assert page.locator('.home-questions details').first.get_attribute('open') is not None
        page.keyboard.press('Enter')
        assert page.locator('.home-questions details').first.get_attribute('open') is None
        for disclosure in page.locator('.deep-record').all():
            disclosure.locator(':scope > summary').click()
            assert disclosure.get_attribute('open') is not None
        assert page.locator('.evidence-ledger').is_visible()
        assert page.locator('#trace-title').is_visible()
        if javascript:
            curve = page.locator('#equity-path').get_attribute('d')
            page.locator('[data-curve-key="alphaforge"]').click()
            assert page.locator('#equity-path').get_attribute('d') != curve
            assert page.locator('[data-curve-key="alphaforge"]').get_attribute('aria-pressed') == 'true'
            page.goto(ORIGIN + '/#evidence', wait_until='networkidle')
            assert page.locator('#evidence-details').get_attribute('open') is not None
            assert page.locator('#evidence-title').is_visible()
        if enhanced:
            page.emulate_media(reduced_motion='reduce')
            page.wait_for_function('!document.querySelector(".cinema-process").classList.contains("is-enhanced")')
            assert page.locator('.cinema-process__track').evaluate('el => getComputedStyle(el).transform') == 'none'
        assert not errors, errors
        results.append({'case': name, 'passed': True, 'enhanced': enhanced, 'pageErrors': errors})
        context.close()
    browser.close()

(OUT / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
