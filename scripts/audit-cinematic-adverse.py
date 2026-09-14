"""Targeted adverse-condition checks, not real-device/CWV certification."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/cinematic-adverse')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for case, width in [('slow-cold', 390), ('assets-unavailable', 390),
                        ('large-text', 390), ('large-text', 1440)]:
        context = browser.new_context(viewport={'width': width, 'height': 1000}, reduced_motion='reduce')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script('''window.__vitals={lcp:0,cls:0};
          new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__vitals.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
          new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__vitals.cls+=e.value})).observe({type:'layout-shift',buffered:true});''')
        if case == 'slow-cold':
            cdp = context.new_cdp_session(page)
            cdp.send('Network.enable')
            cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
            cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150,
                     'downloadThroughput': 200000, 'uploadThroughput': 100000})
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        if case == 'assets-unavailable':
            page.route('**/*', lambda route: route.abort() if route.request.resource_type in ['image', 'font'] else route.continue_())
        page.goto(os.environ.get('HOMEPAGE_AUDIT_ORIGIN', 'http://127.0.0.1:4188'), wait_until='networkidle', timeout=90000)
        if case == 'large-text':
            page.add_style_tag(content='html { font-size: 200% !important; }')
            page.wait_for_timeout(300)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), f'{case}-{width}: overflow'
        assert page.locator('h1').is_visible()
        action = page.locator('.cinema-hero .button').first
        action.focus()
        page.keyboard.press('Tab')
        assert page.evaluate('getComputedStyle(document.activeElement).outlineStyle !== "none"'), f'{case}: focus absent'
        for selector in ['.cinema-hero', '.cinema-process', '.home-questions']:
            page.locator(selector).scroll_into_view_if_needed()
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), f'{case}: {selector} overflow'
        summary = page.locator('.home-questions summary').first
        summary.focus()
        page.keyboard.press('Enter')
        assert page.locator('.home-questions details').first.get_attribute('open') is not None
        page.evaluate('scrollTo(0,0)')
        page.screenshot(path=str(out / f'{case}-{width}.png'))
        assert not errors, errors
        results.append({'case': case, 'width': width, 'passed': True, 'pageErrors': errors,
                        'observedVitals': page.evaluate('window.__vitals'),
                        'scope': 'Local headless Chromium; large-text changes root font size, not native browser zoom'})
        context.close()
    browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
