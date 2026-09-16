"""Read-only strategy scene and fallback regression."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('artifacts/qa/strategy-exhibition')
out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
    for engine in ['chromium','webkit']:
        browser=getattr(p,engine).launch()
        page=browser.new_page(viewport={'width':1440,'height':1000})
        page.goto('http://127.0.0.1:4188/',wait_until='networkidle')
        page.wait_for_timeout(1000)
        for i in [0,1,2,3,0]:
            page.locator('.strategy-exhibition__controls button').nth(i).evaluate('e=>e.click()')
            page.wait_for_timeout(800)
            assert page.locator('#sleeves').get_attribute('data-strategy-stage')==str(i)
            rect=page.locator('.sleeve-row').nth(i).bounding_box()
            assert abs(rect['x'])<2,(engine,i,rect)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            if i == 0:
                page.wait_for_function('document.querySelector(".strategy-exhibition__field").naturalWidth === 1672')
            page.screenshot(path=str(out/f'{engine}-{i}.png'))
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(400)
        assert page.locator('.strategy-exhibition').count()==0
        assert page.locator('.strategy-exhibition__field').count()==0
        assert page.locator('.sleeve-row').count()==4
        page.set_viewport_size({'width':390,'height':844})
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_timeout(400)
        assert page.locator('.strategy-exhibition').count()==0
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        results.append({'engine':engine,'passed':True,'checks':['four stages','reverse','reduced motion','mobile fallback']})
        browser.close()
(out/'report.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
