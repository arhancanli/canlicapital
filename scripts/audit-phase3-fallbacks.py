"""Phase 3 content survives absent JS and failed decorative media."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

results=[]
with sync_playwright() as p:
    for engine in ['chromium','webkit']:
        browser=getattr(p,engine).launch()
        for width in [390,1440]:
            page=browser.new_page(viewport={'width':width,'height':900},java_script_enabled=False)
            page.route('**/cinema/**',lambda r:r.abort())
            page.goto('http://127.0.0.1:4188',wait_until='networkidle')
            for selector in ['#live-record','#developer-api','#research','#evidence','#trust','.home-questions','#access','#footer']:
                assert page.locator(selector).is_visible(),selector
            page.locator('#record-details > summary').click()
            for selector in ['.offering','#evidence-core','#system-films','#method']:
                assert page.locator(selector).is_visible(),selector
            for question in page.locator('.home-questions summary').all():
                question.click()
            assert page.locator('.home-questions details[open]').count()==4
            assert page.locator('#developer-api a[href="/developers#quickstart"]').is_visible()
            assert page.locator('#waitlist-form').get_attribute('action')=='/api/waitlist'
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            results.append({'engine':engine,'width':width,'passed':True,'conditions':'JavaScript disabled; cinema media blocked; no forms submitted'})
            page.close()
        browser.close()
out=Path('artifacts/qa/phase3-publication/fallbacks.json')
out.write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
