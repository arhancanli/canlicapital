"""Read-only shell review across representative page families. No real writes."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--origin',default='http://127.0.0.1:4188')
parser.add_argument('--quick',action='store_true')
args=parser.parse_args()
out=Path('artifacts/qa/phase4-shell/browser')
out.mkdir(parents=True,exist_ok=True)
routes=['/','/systems','/research','/developers','/tools/selection-risk','/performance','/methodology','/verify','/measurements/forward-evidence-maturity','/research/forward-sharpe-evidence-standard','/publication/alphamax/v0.1.0','/notes/deflating-a-sharpe-ratio']
if args.quick: routes=['/','/developers']
results=[]
with sync_playwright() as p:
    for engine in (['chromium'] if args.quick else ['chromium','webkit']):
        browser=getattr(p,engine).launch()
        for route in routes:
            for width,height in [(1440,1000),(390,844)]:
                page=browser.new_page(viewport={'width':width,'height':height})
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.route('**/api/waitlist',lambda r:r.abort())
                page.route('**/api/v1/keys',lambda r:r.abort())
                response=page.goto(args.origin+route,wait_until='networkidle')
                assert response.ok,route
                menu=page.locator('.cc-shell__index')
                toggle=menu.locator('summary')
                assert page.locator('header[data-shell-revision="4"]').count()==1
                cta=page.locator('.cc-shell__cta')
                assert cta.is_visible() and cta.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)>0')
                before=cta.bounding_box()
                header_box=page.locator('.cc-shell').bounding_box()
                assert before['x']+before['width']<=width and before['y']+before['height']<=header_box['y']+header_box['height'],(route,width,'CTA outside header')
                name=(route.strip('/').replace('/','-') or 'home')
                page.screenshot(path=str(out/f'{engine}-{width}-{name}-top.png'))
                toggle.focus()
                page.keyboard.press('Enter')
                assert menu.get_attribute('open') is not None
                assert page.locator('.cc-shell__status').is_visible()
                page.wait_for_timeout(300)
                if route=='/':page.screenshot(path=str(out/f'{engine}-{width}-menu-open.png'))
                # WebKit on macOS follows Safari's links-via-Option-Tab default.
                page.keyboard.press('Alt+Tab' if engine=='webkit' else 'Tab')
                assert page.evaluate('!!document.activeElement.closest(".cc-shell__panel")'),(route,width,engine)
                page.keyboard.press('Escape')
                assert menu.get_attribute('open') is None
                assert toggle.evaluate('e=>e===document.activeElement')
                toggle.click()
                # The menu is non-modal: focus may leave it without a trap.
                cta.focus()
                page.wait_for_timeout(50)
                assert menu.get_attribute('open') is None
                toggle.click()
                page.mouse.click(3,20)
                assert menu.get_attribute('open') is None
                after=cta.bounding_box()
                assert abs(before['x']-after['x'])<1 and abs(before['width']-after['width'])<1
                active=page.locator('header a[aria-current="page"]').evaluate_all('ns=>ns.map(n=>new URL(n.href).pathname)')
                assert all(path.rstrip('/')==route.rstrip('/') for path in active), (route,active)
                footer=page.locator('.cc-footer__context')
                assert footer.get_attribute('open') is None
                footer.locator('summary').scroll_into_view_if_needed()
                page.wait_for_timeout(900)
                page.screenshot(path=str(out/f'{engine}-{width}-{name}-footer.png'))
                footer.locator('summary').focus()
                page.keyboard.press('Enter')
                assert footer.get_attribute('open') is not None
                assert page.locator('.cc-handoff__steps a').count()==3
                assert page.locator('.cc-handoff.is-kinetic').count()==0
                page.keyboard.press('Enter')
                assert not errors,(route,width,errors)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(route,width,'overflow')
                page.emulate_media(reduced_motion='reduce')
                toggle.click()
                assert menu.get_attribute('open') is not None
                assert page.evaluate('getComputedStyle(document.querySelector(".cc-shell")).position==="sticky"')
                results.append({'route':route,'engine':engine,'width':width,'passed':True})
                page.close()
        browser.close()
(out/('quick.json' if args.quick else 'report.json')).write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'cases':len(results),'passed':True},indent=2))
