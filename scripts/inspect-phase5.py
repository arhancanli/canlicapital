"""Read-only capture of every Phase 5 route. All key requests blocked."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--label',required=True);p.add_argument('--origin',default='http://127.0.0.1:4188');args=p.parse_args()
out=Path('artifacts/qa/phase5-developer')/args.label;out.mkdir(parents=True,exist_ok=True)
routes=['/developers','/tools','/tools/deflated-sharpe','/tools/backtest-overfitting','/tools/selection-risk','/tools/execution','/tools/breadth','/tools/trial-accounting','/tools/evidence-chain']
results=[]
with sync_playwright() as p:
 b=p.chromium.launch()
 for route in routes:
  for width in [1440,390]:
   page=b.new_page(viewport={'width':width,'height':1000 if width==1440 else 844},reduced_motion='reduce')
   page.route('**/api/v1/keys',lambda r:r.abort())
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(args.origin+route,wait_until='networkidle');page.wait_for_timeout(250)
   name=route.strip('/').replace('/','-')
   page.screenshot(path=str(out/f'{name}-{width}-top.png'))
   work=page.locator('#quickstart,.tools-grid,.lab-lab,.dsr-workbench,.union-workbench,.chain-workbench').first
   if work.count():
    work.scroll_into_view_if_needed();page.wait_for_timeout(250);page.screenshot(path=str(out/f'{name}-{width}-work.png'))
   results.append({'route':route,'width':width,'errors':errors,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),'controls':page.locator('main button,main input,main select,main textarea').evaluate_all('ns=>ns.map(n=>({tag:n.tagName,id:n.id,type:n.type,text:n.tagName==="BUTTON"?n.textContent:""}))')})
   page.close()
 b.close()
(out/'report.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'cases':len(results),'issues':[r for r in results if r['errors'] or r['overflow']]}))
