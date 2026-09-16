"""Verify actual full-scene geometry, focus navigation and native video lifecycle."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/full-scenes')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch()
        page = browser.new_page(viewport={'width':1440,'height':1000})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:4188/', wait_until='networkidle')
        page.wait_for_function('Number(document.querySelector(".cinema-process").dataset.sceneEnd)>0')
        assert not page.locator('.developer-motion').get_attribute('src')
        poses = []
        for phase in [0, .5, 1]:
            page.locator('.cinema-process').evaluate('(e,p)=>scrollTo({top:Number(e.dataset.sceneStart)+(Number(e.dataset.sceneEnd)-Number(e.dataset.sceneStart))*p,behavior:"instant"})', phase)
            page.wait_for_timeout(1100)
            poses.append(float(page.locator('[data-instrument-sequence]').get_attribute('data-optical-progress')))
            assert page.locator('.cinema-process__art').evaluate('e=>e.getBoundingClientRect().width>=innerWidth*.9')
            page.screenshot(path=str(out/f'{engine}-process-{phase}.png'))
        assert poses[0]<.05 and .45<poses[1]<.55 and poses[2]>.95, poses
        for index in [0,1,2]:
            link=page.locator(f'[data-process-step="{index}"] a')
            link.focus()
            page.wait_for_timeout(600)
            assert link.evaluate('e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=78&&r.bottom<=innerHeight}')
        page.locator('#developer-api').evaluate('e=>scrollTo({top:e.offsetTop-78,behavior:"instant"})')
        film=page.locator('.developer-motion')
        film.evaluate('e=>e.scrollIntoView({block:"start",behavior:"instant"})')
        page.wait_for_function('document.querySelector(".developer-motion").currentTime>0')
        page.screenshot(path=str(out/f'{engine}-developer.png'))
        toggle=page.locator('.developer-motion-toggle')
        toggle.click()
        assert film.evaluate('e=>e.paused')
        page.evaluate('scrollTo({top:0,behavior:"instant"})')
        film.evaluate('e=>e.scrollIntoView({block:"start",behavior:"instant"})')
        page.wait_for_timeout(500)
        assert film.evaluate('e=>e.paused')
        toggle.click()
        page.wait_for_function('!document.querySelector(".developer-motion").paused')
        page.evaluate('scrollTo({top:0,behavior:"instant"})')
        page.wait_for_function('document.querySelector(".developer-motion").paused')
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(400)
        assert not film.get_attribute('src')
        assert page.locator('.has-full-scene').count()==0
        assert not errors, errors
        results.append({'browser':engine,'poses':poses,'focus':True,'filmLifecycle':True,'errors':errors})
        browser.close()
(out/'report.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
