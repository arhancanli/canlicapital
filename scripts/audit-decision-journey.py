"""Read-only tests and settled views of the connected decision scene."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/decision-journey')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine, width, height in [('chromium',1440,1000), ('webkit',1440,1000), ('webkit',1024,768)]:
        browser = getattr(p, engine).launch(headless=True)
        page = browser.new_page(viewport={'width':width,'height':height})
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:4188/',wait_until='networkidle')
        page.wait_for_selector('.has-decision-journey')
        for i in [0,1,2,3,4,2,0]:
            page.locator('.decision-controls button').nth(i).evaluate('e=>e.click()')
            page.wait_for_timeout(650)
            assert page.locator('.trace').get_attribute('data-decision-stage') == str(i)
            assert page.locator('.decision-controls [aria-current=step]').count() == 1
            bounds=page.locator('.trace-line li').nth(i).bounding_box()
            assert abs(bounds['x']) < 2, bounds
            link=page.locator('.trace-line li').nth(i).locator('a')
            assert link.evaluate('e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e}')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            page.screenshot(path=str(out/f'{engine}-{width}-stage-{i}.png'))
        for i in range(5):
            page.locator('.trace').evaluate('(e,i)=>{const s=Number(e.dataset.decisionStart),end=Number(e.dataset.decisionEnd);scrollTo({top:s+(end-s)*(i+.2)/4.45,behavior:"instant"})}',i)
            page.wait_for_timeout(750)
            assert page.locator('.trace').get_attribute('data-decision-stage') == str(i)
            link=page.locator('.trace-line li').nth(i).locator('a')
            link.focus()
            page.wait_for_timeout(300)
            assert page.locator('.trace').get_attribute('data-decision-stage') == str(i)
            assert link.evaluate('e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=78&&r.bottom<=innerHeight}')
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(250)
        assert page.locator('.decision-viewport').count() == 0
        assert page.locator('.trace-line > li').count() == 5
        assert page.locator('.trace-line').evaluate('e=>Math.abs(e.getBoundingClientRect().width)<innerWidth')
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_timeout(250)
        assert page.locator('.decision-viewport').count() == 1
        assert not errors, errors
        results.append({'engine':engine,'width':width,'height':height,'passed':True})
        browser.close()
    for js in [True,False]:
        browser=p.webkit.launch(headless=True)
        page=browser.new_page(viewport={'width':390,'height':844},java_script_enabled=js)
        page.goto('http://127.0.0.1:4188/',wait_until='networkidle')
        assert page.locator('.decision-viewport').count()==0
        assert page.locator('.trace-line > li').count()==5
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        results.append({'engine':'webkit','width':390,'javascript':js,'passed':True})
        browser.close()
(out/'report.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
