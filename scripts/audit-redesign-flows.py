"""Exercise redesigned tools and native navigation against the production bundle."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
ORIGIN=os.environ.get('REDESIGN_AUDIT_ORIGIN','http://127.0.0.1:4191').rstrip('/')
OUT=ROOT/'artifacts/qa/october-redesign'

async def main():
 records=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch()
  for width in [1440,390]:
   context=await browser.new_context(viewport={'width':width,'height':1000 if width==1440 else 844},reduced_motion='reduce')
   page=await context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   for route in ['/tools/deflated-sharpe','/tools/breadth','/tools/execution','/tools/selection-risk','/tools/trial-accounting','/tools/evidence-chain','/tools/backtest-overfitting']:
    record={'route':route,'width':width}
    try:
     response=await page.goto(ORIGIN+route,wait_until='networkidle');assert response.status==200
     if route.endswith('deflated-sharpe'):
      old=float(await page.locator('#dsr-value').inner_text())
      await page.locator('#effective_independent_trials').fill('10000')
      assert float(await page.locator('#dsr-value').inner_text())<old
      await page.locator('#observations').fill('1');assert await page.locator('#dsr-error').is_visible()
      await page.locator('#dsr-reset').click();assert float(await page.locator('#dsr-value').inner_text())==old
     elif route.endswith('breadth'):
      old=float(await page.locator('#lab-book').inner_text());await page.locator('#lab-n').fill('14')
      assert float(await page.locator('#lab-book').inner_text())>old
      await page.locator('#lab-rho').fill('-0.5');assert await page.locator('#lab-warning').is_visible()
     elif route.endswith('execution'):
      old=float(await page.locator('#lab-classification tr').nth(1).locator('td').first.inner_text());await page.locator('#lab-spread').fill('50')
      await page.locator('#lab-rerun').click();await page.wait_for_timeout(300)
      assert float(await page.locator('#lab-classification tr').nth(1).locator('td').first.inner_text())<old, 'Increasing spread must reduce the isolated assumption sweep result'
     elif route.endswith('selection-risk'):
      old=int(await page.locator('#lab-trials').inner_text());await page.locator('#lab-fast').fill('14')
      assert int(await page.locator('#lab-trials').inner_text())>old
      await page.locator('#lab-sweep').click();await page.wait_for_timeout(500)
      assert int(await page.locator('#lab-trials').inner_text())>=820
     elif route.endswith('trial-accounting'):
      await page.locator('#union-query').fill('zzzz-no-such-identity')
      assert await page.locator('#union-list button').count()==0
      await page.locator('#union-reset').click();assert await page.locator('#union-list button').count()>0
      await page.locator('#union-list button').last.click();assert (await page.locator('#union-inspector').inner_text()).strip()
     elif route.endswith('evidence-chain'):
      await page.wait_for_function("!document.querySelector('#chain-verify').disabled",timeout=20000)
      await page.locator('#chain-head-jump').click();await page.locator('#chain-mutate').click()
      assert await page.locator('#mutation-lab').get_attribute('data-state')=='broken'
      assert 'BREAK AT SEQ' in await page.locator('#mutation-result').inner_text()
     elif route.endswith('backtest-overfitting'):
      await page.locator('#pbo-reset').click();await page.locator('#pbo-run').click()
      await page.wait_for_function("document.querySelector('#pbo-value')?.textContent.includes('%')",timeout=20000)
     assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth+1'), 'Page overflow after the interaction'
     record['pass']=True
     await page.screenshot(path=str(OUT/(route.strip('/').replace('/','-')+f'-{width}-working.png')))
    except Exception as e:record.update({'pass':False,'error':str(e)})
    records.append(record)
   await page.goto(ORIGIN+'/developers',wait_until='networkidle')
   menu=page.locator('.cc-shell__index');await menu.locator('summary').focus();await page.keyboard.press('Enter')
   assert await menu.get_attribute('open') is not None
   await page.keyboard.press('Escape');assert await menu.get_attribute('open') is None
   records.append({'route':'/developers','width':width,'pass':not errors,'pageErrors':errors,'flow':'keyboard menu'})
   await context.close()
  await browser.close()
 failures=[r for r in records if not r['pass']]
 (OUT/'flows.json').write_text(json.dumps({'cases':len(records),'failures':failures,'results':records},indent=2)+'\n')
 print(json.dumps({'cases':len(records),'failures':failures},indent=2))
 if failures:raise SystemExit(1)
if __name__=='__main__':asyncio.run(main())
