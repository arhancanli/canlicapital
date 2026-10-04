"""Check every editable route at desktop and narrow-phone sizes with JavaScript off."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
ORIGIN=os.environ.get('REDESIGN_AUDIT_ORIGIN','http://127.0.0.1:4191').rstrip('/')
OUT=ROOT/'artifacts/qa/october-redesign'
SAMPLES={'/','/systems','/research','/performance','/progress','/open','/methodology','/developers','/mcp-servers','/mcp-servers/validation','/mcp-servers/fundamentals','/mcp-servers/research','/mcp-servers/execution','/tools','/tools/deflated-sharpe','/tools/selection-risk','/tools/execution','/founder','/engineering','/verify','/companies/0000320193','/research/forward-sharpe-evidence-standard','/measurements/trial-accounting','/publication/alphamax/v0.1.0','/datasets/filing-facts','/annotate'}
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 inventory=json.loads((ROOT/'docs/redesign/routes.json').read_text())['routes']
 results=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in [1440,320]:
   context=await browser.new_context(viewport={'width':width,'height':1000 if width==1440 else 844},java_script_enabled=False,reduced_motion='reduce')
   queue=asyncio.Queue()
   for route in inventory:queue.put_nowait(route)
   async def worker():
    page=await context.new_page()
    while not queue.empty():
     try:route=queue.get_nowait()
     except asyncio.QueueEmpty:break
     record={'route':route['route'],'family':route['family'],'width':width}
     try:
      response=await page.goto(ORIGIN+route['route'],wait_until='load',timeout=30000)
      record['status']=response.status if response else None
      await page.evaluate('document.fonts.ready')
      record.update(await page.evaluate('''()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,h1:document.querySelectorAll('main h1').length,main:document.querySelector('main')?.getBoundingClientRect().width||0,bodyText:document.querySelector('main')?.innerText.trim().length||0,displayFont:getComputedStyle(document.querySelector('h1')).fontFamily,stylesheet:[...document.styleSheets].some(s=>s.href?.includes('/assets/'))})'''))
      record['pass']=record['status']==200 and not record['overflow'] and record['h1']==1 and record['main']>0 and record['bodyText']>120 and 'Bricolage' in record['displayFont'] and record['stylesheet']
      if route['route'] in SAMPLES or not record['pass']:
       name=route['route'].strip('/').replace('/','-')or'home'
       await page.screenshot(path=str(OUT/f'{name}-{width}-no-js.png'),full_page=False)
      if not record['pass']:
       record['wideElements']=await page.evaluate('''[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='absolute'&&e.getClientRects().length).slice(0,8).map(e=>({tag:e.tagName,class:String(e.className),right:Math.round(e.getBoundingClientRect().right)}))''')
     except Exception as e:record.update({'pass':False,'error':str(e)})
     results.append(record);queue.task_done()
     if len(results)%100==0:print(f"Checked {len(results)} route/viewport cases",flush=True)
    await page.close()
   await asyncio.gather(*(worker() for _ in range(3)))
   await context.close()
  await browser.close()
 failures=[r for r in results if not r['pass']]
 report={'routes':len(inventory),'cases':len(results),'failures':failures,'results':results}
 (OUT/'all-routes-no-js.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'routes':len(inventory),'cases':len(results),'failed':len(failures),'firstFailures':failures[:15]},indent=2))
 if failures:raise SystemExit(1)
if __name__=='__main__':asyncio.run(main())
