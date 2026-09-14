"""Read-only degraded-state checks; API responses are intercepted fixtures."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
routes=['/developers','/tools','/tools/deflated-sharpe','/tools/backtest-overfitting','/tools/selection-risk','/tools/execution','/tools/breadth','/tools/trial-accounting','/tools/evidence-chain']
rows=[]
with sync_playwright() as p:
    for engine in ['chromium','webkit']:
        browser=getattr(p,engine).launch()
        for route in routes:
            page=browser.new_page(java_script_enabled=False,viewport={'width':390,'height':844})
            page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
            assert page.locator('main h1').is_visible()
            assert len(page.locator('main').inner_text())>200
            assert page.locator('main a[href]').count()>0
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            rows.append({'engine':engine,'route':route,'state':'no-JS reading and links','passed':True});page.close()
        for route,selector in [('/tools/trial-accounting','#union-export'),('/tools/evidence-chain','#chain-copy')]:
            page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.route('**/*',lambda r:r.abort() if r.request.resource_type=='fetch' else r.continue_())
            page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
            expect(page.locator(selector)).to_be_disabled()
            expect(page.locator('#union-inspector' if 'trial-accounting' in route else '#chain-verification-status')).to_contain_text('FAIL')
            assert not errors
            rows.append({'engine':engine,'route':route,'state':'source failure disables actions','passed':True});page.close()
        for failure in ['network','malformed-json','timeout']:
            page=browser.new_page();page.goto('http://127.0.0.1:4188/developers',wait_until='networkidle')
            if failure=='network':page.route('**/api/v1/keys',lambda r:r.abort())
            elif failure=='malformed-json':page.route('**/api/v1/keys',lambda r:r.fulfill(status=201,content_type='application/json',body='invalid'))
            else:
                pending=[]
                page.route('**/api/v1/keys',lambda r:pending.append(r))
            page.locator('#dev-get-key-button').click()
            expect(page.locator('#dev-key-error')).to_be_visible(timeout=18000)
            expect(page.locator('#dev-get-key-button')).to_be_enabled()
            assert not page.locator('#dev-key-result').is_visible()
            if failure=='timeout':
                for request in pending:request.abort()
            rows.append({'engine':engine,'route':'/developers','state':failure,'passed':True});page.close()
        browser.close()
Path('artifacts/qa/phase5-developer/fallbacks.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'cases':len(rows),'passed':True}))
