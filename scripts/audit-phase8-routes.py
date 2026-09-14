"""All current site routes: mobile WCAG rules and both-width layout checks."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
parser=argparse.ArgumentParser();parser.add_argument('--label',default='before');parser.add_argument('--retry-from');args=parser.parse_args()
routes=json.loads(Path('artifacts/qa/redesign-scope/inventory.json').read_text())['routes']
if args.retry_from:
 old=json.loads(Path(args.retry_from).read_text());needed={r['route'] for r in old if r.get('violations') or r.get('errors') or r.get('failure') or r.get('overflow')}
 routes=[r for r in routes if r['route'] in needed]
out=Path('artifacts/qa/phase8-release');out.mkdir(parents=True,exist_ok=True)
async def run():
 rows=[];sem=asyncio.Semaphore(3)
 async with async_playwright() as p:
  browser=await p.chromium.launch()
  async def inspect(r):
   async with sem:
    page=await browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));row={'route':r['route'],'errors':errors}
    try:
     response=await page.goto('http://127.0.0.1:4188'+r['route'],wait_until='networkidle',timeout=30000);row['status']=response.status
     await page.add_script_tag(path='/tmp/canli-phase2-axe.min.js')
     result=await page.evaluate('async()=>await axe.run(document.body)')
     row['violations']=[{'id':v['id'],'nodes':[{'target':n['target'],'summary':n.get('failureSummary')} for n in v['nodes']]} for v in result['violations'] if any(t.startswith('wcag') for t in v['tags'])]
     row['overflow']=[]
     for width in [390,1440]:
      await page.set_viewport_size({'width':width,'height':844});await page.wait_for_timeout(100)
      if await page.evaluate('document.documentElement.scrollWidth>innerWidth+1'):row['overflow'].append(width)
     if response.status!=200:row['failure']='HTTP '+str(response.status)
    except Exception as e:row['failure']=str(e)
    finally:await page.close()
    rows.append(row)
    if len(rows)%25==0:
     (out/('routes-'+args.label+'.json')).write_text(json.dumps(rows,indent=2)+'\n')
     print(json.dumps({'completed':len(rows),'total':len(routes),'routesWithFindings':sum(bool(x.get('violations') or x.get('failure') or x.get('errors') or x.get('overflow')) for x in rows)}),flush=True)
  await asyncio.gather(*(inspect(r) for r in routes));await browser.close()
 (out/('routes-'+args.label+'.json')).write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps({'completed':len(rows),'findings':sum(bool(x.get('violations') or x.get('failure') or x.get('errors') or x.get('overflow')) for x in rows)}),flush=True)
asyncio.run(run())
