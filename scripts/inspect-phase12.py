"""Bounded follow-up: expanded homepage, image sizing and WebKit click failure."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ORIGIN='https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app'
out=Path('artifacts/qa/phase12-review')
results={}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for width in [1440,390]:
        page=browser.new_page(viewport={'width':width,'height':900},reduced_motion='reduce')
        page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
        page.goto(ORIGIN,wait_until='networkidle')
        page.locator('#record-details > summary').click()
        for name,selector in [('offering','.offering'),('core','#evidence-core'),('films','#system-films'),('trace','#method'),('footer','.cc-footer')]:
            page.locator(selector).evaluate('e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-90)')
            page.wait_for_timeout(300)
            page.screenshot(path=str(out/f'expanded-{width}-{name}.png'))
        results[str(width)]=page.evaluate('''() => ({images:[...document.images].filter(i=>i.closest('.strategy-study,.cinema-hero__art')).map(i=>({src:i.currentSrc,naturalWidth:i.naturalWidth,displayWidth:i.getBoundingClientRect().width})),trust:document.querySelector('.trust-grid').innerText,head:document.querySelector('#evidence-record-head')?.innerText})''')
        page.close()
    browser.close()
    browser=p.webkit.launch()
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
    page.goto(ORIGIN+'/research',wait_until='networkidle')
    page.locator('.hub-index a[href="#researchLibrary"]').click()
    page.locator('#archive-query').fill('forward Sharpe')
    link=page.locator('#researchLibraryList li:visible a').first
    samples=[]
    for _ in range(10):
        samples.append(link.bounding_box())
        page.wait_for_timeout(200)
    results['webkitResearch']={'samples':samples}
    try:
        link.click(timeout=8000)
        page.wait_for_url('**/research/forward-sharpe-evidence-standard',timeout=10000)
        results['webkitResearch']['clickPassed']=True
    except Exception as e:
        results['webkitResearch']['clickPassed']=False
        results['webkitResearch']['error']=str(e)
    page.screenshot(path=str(out/'webkit-research-followup.png'))
    browser.close()
(out/'inspection.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'webkitResearchClick':results['webkitResearch']['clickPassed'],'inspectionSaved':True}))
