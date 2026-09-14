"""Per-route reading-layout evidence; sample mode is for visual critique before full audit."""
import argparse,asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
parser=argparse.ArgumentParser();parser.add_argument('--sample',action='store_true');parser.add_argument('--retry',action='store_true');args=parser.parse_args()
root=Path('artifacts/qa/phase7-reader');routes=json.loads((root/'before.json').read_text())['routes']
if args.sample:
 selected=[]
 for family in ['research','measurements','trials','notes','publication','standards']:
  selected.append(next(r for r in routes if r['family']==family))
 routes=selected+[r for r in routes if r['family']=='top-level']
if args.retry:
 failed={r['file'] for r in json.loads((root/'all-routes/report.json').read_text())['issues']}
 routes=[r for r in routes if r['file'] in failed]
out=root/('retry' if args.retry else 'sample' if args.sample else 'all-routes');out.mkdir(parents=True,exist_ok=True)
async def run():
 rows=[];sem=asyncio.Semaphore(3)
 async with async_playwright() as p:
  browser=await p.chromium.launch()
  async def inspect(r,width):
   async with sem:
    page=await browser.new_page(viewport={'width':width,'height':1000 if width==1440 else 844},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    result={'route':r['route'],'file':r['file'],'width':width,'errors':errors}
    try:
     response=await page.goto('http://127.0.0.1:4188'+r['route'],wait_until='networkidle',timeout=25000)
     await page.evaluate('document.fonts.ready');result['status']=response.status
     result['overflow']=await page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
     result['readerIndex']=await page.locator('.reader-index').count()
     result['missingTargets']=await page.locator('.reader-index nav a').evaluate_all('(links)=>links.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash)')
     name=r['file'].replace('/','-').replace('.html','')+'-'+str(width)
     await page.screenshot(path=str(out/(name+'-top.png')))
     if args.sample:
      for pos in ['middle','bottom']:
       await page.evaluate('(f)=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f)',.5 if pos=='middle' else 1);await page.wait_for_timeout(120)
       await page.screenshot(path=str(out/(name+'-'+pos+'.png')))
    except Exception as e:result['failure']=str(e)
    finally:await page.close()
    rows.append(result)
    if len(rows)%50==0:print(json.dumps({'completed':len(rows),'total':len(routes)*2}),flush=True)
  await asyncio.gather(*(inspect(r,w) for r in routes for w in [1440,390]));await browser.close()
 issues=[r for r in rows if r.get('failure') or r.get('overflow') or r['errors'] or r.get('missingTargets') or r.get('readerIndex')!=1 or r.get('status')!=200]
 (out/'report.json').write_text(json.dumps({'cases':rows,'issues':issues},indent=2)+'\n');print(json.dumps({'cases':len(rows),'issues':issues}),flush=True)
asyncio.run(run())
