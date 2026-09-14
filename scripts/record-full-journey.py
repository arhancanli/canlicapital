"""Capture the implemented page, not a generated promotional video."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(os.getenv('JOURNEY_RECORD_OUT', 'artifacts/qa/full-site-motion'))
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000},
        record_video_dir=str(out / 'video'), record_video_size={'width': 1440, 'height': 1000})
    page = context.new_page()
    page.goto('http://127.0.0.1:4188/', wait_until='networkidle')
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(1500)
    # The shared reading indicator must reflect a real change in scroll position.
    start = page.locator('.cc-reading-progress').evaluate('e=>getComputedStyle(e).transform')
    targets = ['.cinema-intro', '.cinema-process', '#sleeves', '#live-record', '#developer-api',
               '#system-films', '#research', '#evidence', '#trust', '.home-questions', '#access', '.cc-handoff', '.cc-footer__wordmark']
    for index, selector in enumerate(targets):
        target = page.locator(selector).evaluate('e=>Math.max(0,e.getBoundingClientRect().top+scrollY-100)')
        current = page.evaluate('scrollY')
        steps = max(24, min(100, int(abs(target-current)/65)))
        for step in range(1, steps + 1):
            page.evaluate('y=>scrollTo({top:y,behavior:"instant"})', current + (target-current)*step/steps)
            page.wait_for_timeout(24)
        page.wait_for_timeout(1000)
        page.screenshot(path=str(out / f'journey-{index+1:02d}.png'))
        if selector == '.cinema-process':
            start_y, end_y = page.locator(selector).evaluate('e=>[Number(e.dataset.sceneStart),Number(e.dataset.sceneEnd)]')
            for frame in range(181):
                page.evaluate('y=>scrollTo({top:y,behavior:"instant"})', start_y+(end_y-start_y)*frame/180)
                page.wait_for_timeout(32)
            page.wait_for_timeout(900)
        if selector == '.cc-handoff':
            start_y, end_y = page.locator(selector).evaluate('e=>[Number(e.dataset.handoffStart),Number(e.dataset.handoffEnd)]')
            for frame in range(121):
                page.evaluate('y=>scrollTo({top:y,behavior:"instant"})', start_y+(end_y-start_y)*frame/120)
                page.wait_for_timeout(32)
            page.wait_for_timeout(1000)
    end = page.locator('.cc-reading-progress').evaluate('e=>getComputedStyle(e).transform')
    assert start != end
    # Verify API entrance motion actually changes between rendered frames.
    page.evaluate('scrollTo({top:0,behavior:"instant"})')
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(1000)
    api = page.locator('.api-preview')
    api.evaluate('e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-innerHeight*.8,behavior:"instant"})')
    page.wait_for_timeout(80)
    first = api.evaluate('e=>getComputedStyle(e).transform')
    page.wait_for_timeout(1300)
    last = api.evaluate('e=>getComputedStyle(e).transform')
    assert first != last, ('API entrance did not move', first, last)
    (out / 'motion-evidence.json').write_text(json.dumps({'readingProgress': [start, end], 'apiEntrance': [first, last]}, indent=2)+'\n')
    video = page.video
    context.close()
    video.save_as(str(out / 'full-journey.webm'))
    browser.close()
print('Full journey recorded; reading progress and API entrance movement verified.')
