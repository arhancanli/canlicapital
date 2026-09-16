"""Read-only scene, transition, fallback and product regression."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
out = Path('artifacts/qa/distinct-scenes')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine, width, height, reduced, js in [('chromium',1440,1000,False,True),('webkit',1440,1000,False,True),('webkit',390,844,False,True),('webkit',1440,700,False,True),('webkit',390,844,True,True),('chromium',320,700,True,False)]:
        browser = getattr(p, engine).launch()
        page = browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce' if reduced else 'no-preference',java_script_enabled=js)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:4187/',wait_until='networkidle')
        for selector in ['.cinema-intro','.cinema-process','#sleeves','#live-record','#developer-api','.offering','.evidence-core','.system-films','.trace','#research','#evidence','#trust','.home-questions','#access']:
            page.locator(selector).evaluate('e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-95,behavior:"instant"})')
            page.wait_for_timeout(650)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), (engine,width,height,selector)
            if width==1440 and height==1000:
                page.screenshot(path=str(out/f'{engine}-{selector.lstrip(".#")}.png'))
        assert page.locator('.sleeve-row').count()==4
        assert page.locator('.paper-card').count()==3
        if js:
            assert page.locator('.research-journey__rail').count()==0
            assert page.locator('.scene-bridge').count()==(0 if reduced else 4)
            before=page.locator('#equity-path').get_attribute('d')
            page.locator('[data-curve-key=alphaforge]').evaluate('e=>e.click()')
            assert page.locator('#equity-path').get_attribute('d')!=before
            page.emulate_media(reduced_motion='reduce')
            page.wait_for_timeout(350)
            assert page.locator('.scene-bridge').count()==0
            assert not page.locator('.developer-motion').get_attribute('src')
            page.emulate_media(reduced_motion='no-preference')
            page.wait_for_timeout(350)
            assert page.locator('.scene-bridge').count()==4
        assert not errors,errors
        results.append({'browser':engine,'width':width,'height':height,'reduced':reduced,'javascript':js,'passed':True})
        browser.close()
(out/'report.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
