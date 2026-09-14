"""Cross-engine sequence behavior, mobile order, and failure/reduced fallbacks."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

origin = os.environ.get('HOMEPAGE_AUDIT_ORIGIN', 'http://127.0.0.1:4187')
out = Path('artifacts/qa/instrument-sequence')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine_name in ['chromium', 'webkit', 'firefox']:
        browser = getattr(p, engine_name).launch()
        for mobile in [False, True]:
            name = f'{engine_name}-{"mobile" if mobile else "desktop"}'
            context = browser.new_context(viewport={'width': 390 if mobile else 1440, 'height': 844 if mobile else 1000})
            page = context.new_page()
            errors, frame_requests = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: frame_requests.append(request.url) if '/instrument/' in request.url and request.resource_type == 'fetch' else None)
            page.goto(origin, wait_until='networkidle')
            assert not frame_requests, f'{name}: premature animation downloads'
            if mobile:
                assert page.locator('.hero__copy').bounding_box()['y'] < page.locator('.hero-status').bounding_box()['y']
            root = page.locator('[data-instrument-sequence]')
            start = page.locator('.cinema-process').evaluate('el => el.getBoundingClientRect().top + scrollY - 78')
            positions = [start + (0 if mobile else 100), start + (220 if mobile else 1700)]
            frames = []
            for position in positions:
                page.evaluate('(y) => scrollTo({top:y,behavior:"instant"})', position)
                page.wait_for_function('document.querySelector("[data-instrument-sequence]").hasAttribute("data-sequence-ready")')
                page.wait_for_timeout(1200)
                frames.append(int(root.get_attribute('data-sequence-frame')))
            assert frames[1] > frames[0], f'{name}: sequence did not advance: {frames}'
            page.screenshot(path=str(out / f'{name}-open.png'))
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            page.emulate_media(reduced_motion='reduce')
            page.wait_for_function('!document.querySelector("[data-instrument-sequence]").hasAttribute("data-sequence-ready")')
            assert root.locator('img').is_visible()
            request_count = len(frame_requests)
            page.evaluate('scrollTo({top:0,behavior:"instant"})')
            page.wait_for_timeout(300)
            assert len(frame_requests) == request_count, 'Reduced mode continued downloading'
            assert not errors, errors
            results.append({'case': name, 'passed': True, 'observedFrames': frames, 'animationRequests': request_count, 'pageErrors': errors})
            context.close()
        # Deliberately fail only animation fetches; the static image remains.
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        page = context.new_page()
        failed_requests = []
        def block(route):
            if route.request.resource_type == 'fetch':
                failed_requests.append(route.request.url)
                route.fulfill(status=503, body='Intentional QA failure')
            else: route.continue_()
        page.route('**/cinema/instrument/**/*.webp', block)
        page.goto(origin, wait_until='networkidle')
        page.locator('.cinema-process').evaluate('el => scrollTo({top:el.getBoundingClientRect().top+scrollY-78,behavior:"instant"})')
        page.wait_for_timeout(1800)
        assert page.locator('[data-instrument-sequence] img').is_visible()
        assert failed_requests and len(failed_requests) == len(set(failed_requests)), 'Missing failure coverage or repeated failed requests'
        results.append({'case': f'{engine_name}-failed-frames', 'passed': True, 'failedRequests': len(failed_requests), 'staticFallbackVisible': True})
        context.close()
        browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
