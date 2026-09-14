"""Read-only homepage Phase 3 review; release-note requests are intercepted."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--origin',default='http://127.0.0.1:4187')
parser.add_argument('--label',default='dev')
args=parser.parse_args()
out=Path('artifacts/qa/phase3-publication')/args.label
out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
    for engine in ['chromium','webkit']:
        browser=getattr(p,engine).launch()
        for width,height in [(1440,1000),(390,844)]:
            page=browser.new_page(viewport={'width':width,'height':height})
            errors=[]
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.route('**/api/waitlist',lambda route: route.fulfill(status=503,content_type='application/json',body='{"error":"Service unavailable"}'))
            page.goto(args.origin,wait_until='networkidle')
            page.wait_for_timeout(600)
            assert page.locator('.publication-route').count()==1
            assert page.locator('.developer-motion,.archive-panorama').count()==0
            for name,selector in [('record','#live-record'),('developer','#developer-api'),('research','#research'),('evidence','#evidence'),('trust','#trust'),('faq','.home-questions'),('access','#access'),('footer','#footer')]:
                node=page.locator(selector)
                node.scroll_into_view_if_needed()
                page.wait_for_timeout(600)
                node.screenshot(path=str(out/f'{engine}-{width}-{name}.png'))
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), (engine,width,name,'overflow')
            for key in ['alphac','alphamax','managed_futures','alphavintage','alphaforge']:
                button=page.locator(f'[data-curve-key="{key}"]')
                button.scroll_into_view_if_needed()
                button.click()
                assert button.get_attribute('aria-pressed')=='true'
                assert page.locator('#equity-path').get_attribute('d'), (engine,width,key)
            for details in page.locator('.home-questions details').all():
                summary=details.locator('summary')
                summary.focus()
                page.keyboard.press('Enter')
                assert details.get_attribute('open') is not None
                assert details.locator('p').is_visible()
                page.keyboard.press('Enter')
                assert details.get_attribute('open') is None
            page.locator('#email').fill('phase3-qa@example.invalid')
            page.locator('#waitlist-form button').click()
            page.wait_for_timeout(400)
            assert not page.locator('#waitlist-form button').is_disabled()
            assert 'Optional release notes only' not in page.locator('#form-status').inner_text()
            page.locator('#record-details > summary').click()
            assert page.locator('#record-details').get_attribute('open') is not None
            for name,selector in [('offering','.offering'),('core','#evidence-core'),('films','#system-films'),('trace','#method')]:
                node=page.locator(selector)
                node.scroll_into_view_if_needed()
                page.wait_for_timeout(600)
                node.screenshot(path=str(out/f'{engine}-{width}-{name}.png'))
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(engine,width,name,'overflow')
            page.locator('[role=tab]').nth(0).focus()
            page.keyboard.press('End')
            assert page.locator('[role=tab]').nth(2).get_attribute('aria-selected')=='true'
            page.emulate_media(reduced_motion='reduce')
            page.wait_for_timeout(400)
            assert page.locator('.publication-route').count()==1
            assert page.locator('.cc-handoff.is-kinetic').count()==0
            assert not errors,errors
            results.append({'engine':engine,'width':width,'passed':True,'checks':['12 section captures','curve controls','FAQ keyboard toggle','mocked release-note failure','optional-room expansion','film tabs keyboard','reduced motion','no overflow/page errors']})
            page.close()
        browser.close()
(out/'report.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
