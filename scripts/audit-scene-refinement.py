"""Check reading holds, archive travel, and preserved strategy/product content."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out=Path('artifacts/qa/scene-refinement')
out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
    for engine in ['chromium','webkit']:
        browser=getattr(p,engine).launch()
        page=browser.new_page(viewport={'width':1440,'height':1000})
        page.goto('http://127.0.0.1:4187/',wait_until='networkidle')
        for pair in [[.02,.17],[.42,.57],[.82,.97]]:
            tracks=[]; optics=[]
            for phase in pair:
                page.locator('.cinema-process').evaluate('(e,p)=>scrollTo({top:+e.dataset.sceneStart+(e.dataset.sceneEnd-e.dataset.sceneStart)*p,behavior:"instant"})',phase)
                page.wait_for_timeout(850)
                tracks.append(page.locator('.cinema-process__track').evaluate('e=>getComputedStyle(e).transform'))
                optics.append(page.locator('.cinema-process__art').evaluate('e=>getComputedStyle(e).transform'))
            assert tracks[0]==tracks[1],tracks
            assert optics[0]!=optics[1],optics
        for selector in ['.sleeve-table','.system-films__grid','.archive-panorama']:
            page.locator(selector).evaluate('e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-110,behavior:"instant"})')
            page.wait_for_timeout(1100)
            page.screenshot(path=str(out/f'{engine}-{selector[1:]}.png'))
        panorama=page.locator('.archive-panorama')
        before=panorama.locator('img').evaluate('e=>getComputedStyle(e).transform')
        page.evaluate('scrollBy({top:350,behavior:"instant"})')
        page.wait_for_timeout(1000)
        after=panorama.locator('img').evaluate('e=>getComputedStyle(e).transform')
        assert before!=after
        assert page.locator('.sleeve-row').count()==4
        assert page.locator('.system-film').count()==3
        assert page.locator('.system-film:first-child .system-film__frame').evaluate('e=>e.getBoundingClientRect().width>innerWidth*.9')
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(500)
        assert panorama.locator('img').evaluate('e=>getComputedStyle(e).transform')=='none'
        assert page.locator('.cinema-process.is-enhanced').count()==0
        results.append({'browser':engine,'readingHolds':3,'archiveTravels':True,'wideProductFilm':True,'reducedMotion':True})
        browser.close()
(out/'report.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
