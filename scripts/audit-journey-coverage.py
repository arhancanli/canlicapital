import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out=Path('artifacts/qa/full-site-motion')
selectors=['.cinema-intro','.sleeves','.record-chapter','.developer-chapter','.offering','.evidence-core',
 '.system-films','.trace','.research','.evidence','.evidence-detail','.trust','.home-questions','.access']
results=[]
with sync_playwright() as p:
    for engine,width in [('chromium',1440),('webkit',390)]:
        browser=getattr(p,engine).launch()
        page=browser.new_page(viewport={'width':width,'height':1000})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:4188/',wait_until='networkidle')
        for selector in selectors:
            e=page.locator(selector)
            assert e.get_attribute('data-journey-motion'), selector
            e.evaluate('e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-95,behavior:"instant"})')
            page.wait_for_timeout(1100)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), (width,selector)
            if selector in ['.offering','.evidence-core','.system-films','.trace','.evidence-detail']:
                page.screenshot(path=str(out/f'final-{engine}-{width}-{selector[1:]}.png'))
        # Reduced motion can be toggled during the visit, not just before load.
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(500)
        assert not page.locator('.cc-handoff').get_attribute('data-handoff-progress')
        assert page.locator('.cc-handoff .cc-handoff__steps a').count()==3
        page.emulate_media(reduced_motion='no-preference')
        page.evaluate('document.documentElement.style.fontSize="200%"')
        page.wait_for_timeout(700)
        assert not page.locator('.cc-handoff').evaluate('e=>e.classList.contains("is-kinetic") && e.firstElementChild.offsetHeight>innerHeight-78')
        assert not errors, errors
        results.append({'engine':engine,'width':width,'sections':selectors,'passed':True,'runtimeReducedMotion':True,'largeTextUnsticking':True})
        browser.close()
(out/'section-coverage.json').write_text(json.dumps(results,indent=2)+'\n')
print('14 lower-page sections per browser: motion hooks, overflow, runtime reduced motion and large-text unsticking passed.')
