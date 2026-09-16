"""Local release-candidate checks. Every form POST is intercepted, never sent."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/cohesive-release')
out.mkdir(parents=True, exist_ok=True)
results = []
sections = ['.cinema-hero', '.cinema-intro', '.cinema-process', '#sleeves', '#live-record', '#developer-api', '.offering', '.evidence-core', '.system-films', '.trace', '#research', '#evidence', '#trust', '.home-questions', '#access', '.cc-handoff']
with sync_playwright() as p:
    for engine, width, height in [('chromium', 1440, 1000), ('webkit', 1440, 1000), ('webkit', 1280, 850), ('chromium', 1920, 1080), ('webkit', 1024, 1000), ('webkit', 390, 844), ('chromium', 320, 700), ('webkit', 1440, 700)]:
        browser = getattr(p, engine).launch()
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors, requests = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append(r.url))
        page.goto('http://127.0.0.1:4188/', wait_until='networkidle')
        assert not any('/optical-layers/' in url for url in requests), 'Layers loaded before approaching the scene'
        for selector in sections:
            page.locator(selector).evaluate('e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-90,behavior:"instant"})')
            page.wait_for_timeout(500)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), (engine, width, height, selector)
            if width == 1440 and height == 1000 and selector in ['.cinema-process', '#sleeves', '#live-record', '#developer-api', '#research', '#access']:
                page.screenshot(path=str(out / f'{engine}-{selector.lstrip(".#")}.png'))
        assert not any('/cinema/instrument/' in url for url in requests), 'Retired mechanical frames requested'
        if width >= 1280 and height >= 760:
            assert page.locator('.research-journey__rail .optical-sculpture.is-ready').count() == 1
            poses = []
            for article in page.locator('.cinema-process__chapter').all():
                article.evaluate('e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-80,behavior:"instant"})')
                page.wait_for_timeout(700)
                poses.append(page.locator('.research-journey__rail .optical-sculpture__layer').first.evaluate('e=>getComputedStyle(e).transform'))
            assert len(set(poses)) == 3, poses
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(300)
        assert page.locator('.research-journey__rail').count() == 0
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_timeout(300)
        assert not errors, errors
        results.append({'engine': engine, 'width': width, 'height': height, 'sections': len(sections), 'errors': errors, 'passed': True})
        browser.close()

    browser = p.chromium.launch()
    for case in ['unavailable', 'limited', 'success', 'timeout']:
        page = browser.new_page()
        # Accelerate only the form's timeout in this test, not other timers.
        page.add_init_script('const timer=window.setTimeout;window.setTimeout=(f,n,...a)=>timer(f,n===15000?100:n,...a)')
        calls = []
        def respond(route):
            calls.append(route.request.method)
            if case == 'timeout':
                return
            if case == 'unavailable':
                route.fulfill(status=503, content_type='text/html', body='<h1>Unavailable</h1>')
            else:
                route.fulfill(status=429 if case == 'limited' else 200, content_type='application/json', body=json.dumps({'ok': case == 'success'}))
        page.route('**/api/waitlist', respond)
        page.goto('http://127.0.0.1:4188/', wait_until='networkidle')
        page.locator('#email').fill('not-an-email')
        page.locator('#waitlist-form').evaluate('e=>e.requestSubmit()')
        assert page.locator('#email').get_attribute('aria-invalid') == 'true'
        assert not calls
        page.locator('#email').fill('qa@example.invalid')
        page.locator('#waitlist-form').evaluate('e=>{e.requestSubmit();e.requestSubmit()}')
        page.wait_for_function('!document.querySelector("#waitlist-form button").disabled')
        message = page.locator('#form-status').inner_text()
        assert len(calls) == 1, (case, calls)
        assert ('on the research update list' in message) == (case == 'success'), (case, message)
        if case == 'timeout':
            assert 'not confirmed' in message
        assert 'Unexpected token' not in message
        results.append({'formCase': case, 'interceptedRequests': len(calls), 'message': message, 'passed': True})
        page.close()
    browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
