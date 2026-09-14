"""Synthetic browser-only state tests; no network writes or stored records."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('artifacts/qa/phase13-corrections')
data=json.loads(Path('public/api/v1/chain/head.json').read_text())
data['data']['entry_count']=901
with sync_playwright() as p:
 b=p.chromium.launch();page=b.new_page(viewport={'width':390,'height':900},reduced_motion='reduce')
 page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 page.route('**/api/v1/chain/head.json',lambda r:r.fulfill(json=data))
 page.goto('http://127.0.0.1:4188',wait_until='networkidle')
 assert page.locator('#trust-chain').inner_text()=='901'
 # The evidence room is initially collapsed; its DOM content still hydrates.
 assert page.locator('#core-signed-count').text_content()=='901'
 page.evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new Error("Denied")}}})')
 page.locator('.api-command-copy').click()
 assert 'Select and copy' in page.locator('.api-command-status').inner_text()
 assert page.locator('.api-preview pre').evaluate('e=>e===document.activeElement')
 b.close()
report={'origin':'http://127.0.0.1:4188','runtimeCountBinding':True,'clipboardFailureAnnouncedAndFocused':True,'syntheticBrowserOnly':True,'externalWrites':0,'passed':True}
(out/'state-tests.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
