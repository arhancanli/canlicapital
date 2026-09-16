"""Phase 5 interaction states. Key issuance and clipboard are mocked."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
out=Path('artifacts/qa/phase5-developer/states');out.mkdir(parents=True,exist_ok=True)
origin='http://127.0.0.1:4188';results=[]
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  browser=getattr(p,engine).launch()
  def page_for(route):
   page=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
   page.route('**/api/v1/keys',lambda r:r.abort())
   page.add_init_script('Object.defineProperty(navigator,"clipboard",{value:{writeText:async()=>{throw new Error("denied")}},configurable:true})')
   page.goto(origin+route,wait_until='networkidle');return page
  for status,payload in [(201,{'data':{'key':'ck_test_PHASE5_NOT_A_REAL_KEY','keys_remaining_today':4,'note':'Mock fixture only'}}),(201,{'data':{}}),(429,{'error':{'message':'Mock quota exhausted'}}),(503,{'error':{'message':'Mock service unavailable'}})]:
   page=page_for('/developers');page.unroute('**/api/v1/keys');pending=[]
   page.route('**/api/v1/keys',lambda r:pending.append(r))
   page.locator('#dev-get-key-button').click();page.wait_for_timeout(100)
   assert page.locator('#dev-get-key-button').is_disabled()
   assert page.locator('#dev-get-key-button').get_attribute('aria-busy')=='true'
   pending[0].fulfill(status=status,content_type='application/json',body=json.dumps(payload))
   success=status==201 and 'key' in payload.get('data',{})
   page.locator('#dev-key-result' if success else '#dev-key-error').wait_for(state='visible')
   if success:
    page.locator('#dev-key-result button').click()
    assert 'Clipboard' in page.locator('#dev-key-error').inner_text()
    assert any('ck_test_PHASE5_NOT_A_REAL_KEY' in text for text in page.locator('.dev-code').all_text_contents())
   group=page.locator('.dev-snippets').first
   group.get_by_role('tab').first.focus();page.keyboard.press('End')
   assert group.get_by_role('tab').last.get_attribute('aria-selected')=='true'
   group.locator('.dev-copy-example').click()
   assert 'Clipboard unavailable' in group.locator('.dev-copy-status').inner_text()
   page.screenshot(path=str(out/f'{engine}-key-{status}-{success}.png'))
   results.append({'engine':engine,'state':f'key-{status}-{success}','passed':True});page.close()
  page=page_for('/developers');page.unroute('**/api/v1/keys')
  page.evaluate('Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>{window.phase5Copied=text}},configurable:true})')
  for suffix in ['FIRST','SECOND']:
   page.route('**/api/v1/keys',lambda r:r.fulfill(status=201,content_type='application/json',body=json.dumps({'data':{'key':'ck_test_PHASE5_'+suffix}})))
   page.locator('#dev-get-key-button').click()
   expect(page.locator('#dev-key-result')).to_contain_text('ck_test_PHASE5_'+suffix)
   page.locator('#dev-key-result button').click()
   page.wait_for_function('(expected)=>window.phase5Copied===expected',arg='ck_test_PHASE5_'+suffix)
   assert any('ck_test_PHASE5_'+suffix in t for t in page.locator('.dev-code').all_text_contents())
   if suffix=='SECOND':assert not any('ck_test_PHASE5_FIRST' in t for t in page.locator('.dev-code').all_text_contents())
   page.unroute('**/api/v1/keys')
  results.append({'engine':engine,'state':'copy-success-and-repeat-key-template','passed':True});page.close()
  page=page_for('/tools/deflated-sharpe');page.locator('#observations').fill('0');page.locator('#observations').dispatch_event('input')
  assert page.locator('#dsr-error').is_visible();assert page.locator('#dsr-psr').inner_text()=='Unavailable'
  page.locator('#dsr-reset').click();assert not page.locator('#dsr-error').is_visible()
  results.append({'engine':engine,'state':'dsr-invalid-reset','passed':True});page.close()
  page=page_for('/tools/backtest-overfitting');page.locator('#pbo-matrix').fill('invalid');page.locator('#pbo-run').click()
  assert page.locator('#pbo-warning').is_visible();assert page.locator('#pbo-value').inner_text()=='Unavailable'
  page.locator('#pbo-reset').click();assert not page.locator('#pbo-warning').is_visible()
  results.append({'engine':engine,'state':'pbo-invalid-reset','passed':True});page.close()
  page=page_for('/tools/selection-risk');page.locator('#lab-fast').fill('60');page.locator('#lab-slow').fill('3');page.locator('#lab-slow').dispatch_event('input')
  assert page.locator('#lab-warning').is_visible();page.locator('#lab-fast').fill('2');page.locator('#lab-fast').dispatch_event('input')
  assert not page.locator('#lab-warning').is_visible();page.locator('#lab-reset-ledger').click()
  results.append({'engine':engine,'state':'selection-invalid-reset','passed':True});page.close()
  page=page_for('/tools/execution');page.locator('#lab-fast').fill('60');page.locator('#lab-slow').fill('3');page.locator('#lab-slow').dispatch_event('change')
  assert page.locator('#lab-warning').is_visible();page.locator('#lab-fast').fill('2');page.locator('#lab-fast').dispatch_event('change')
  page.locator('#lab-warning').wait_for(state='hidden')
  results.append({'engine':engine,'state':'execution-invalid-recovery','passed':True});page.close()
  page=page_for('/tools/breadth');before=page.locator('#lab-book').inner_text();page.locator('#lab-n').fill('20');page.locator('#lab-n').dispatch_event('input')
  assert page.locator('#lab-book').inner_text()!=before
  for button in page.locator('.lab-controls button').all():button.click()
  results.append({'engine':engine,'state':'breadth-input-presets','passed':True});page.close()
  page=page_for('/tools/trial-accounting');page.locator('#union-query').fill('NO_MATCH_PHASE5')
  assert page.locator('#union-visible').inner_text()=='0';page.locator('#union-reset').click();assert page.locator('#union-visible').inner_text()!='0'
  page.locator('#union-copy').click();expect(page.locator('#union-copy')).to_contain_text('address bar')
  results.append({'engine':engine,'state':'union-empty-reset-copy-denied','passed':True});page.close()
  page=page_for('/tools/evidence-chain');page.wait_for_function('document.querySelector("#chain-verification-status").dataset.state!=="loading"',timeout=30000)
  page.locator('#chain-copy').click();page.locator('#chain-copy-fallback').wait_for(state='visible')
  assert 'chain_hash' in page.locator('#chain-copy-fallback').input_value()
  page.locator('#chain-mutate').click();assert 'BREAK AT SEQ' in page.locator('#mutation-result').inner_text()
  results.append({'engine':engine,'state':'chain-copy-denied-local-mutation','passed':True});page.close()
  browser.close()
(out/'report.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps({'cases':len(results),'passed':True}))
