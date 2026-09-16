"""Contrast and viewport review of changed reading surfaces."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('artifacts/qa/phase13-corrections');rows=[]
parser=argparse.ArgumentParser();parser.add_argument('--origin',default='http://127.0.0.1:4187');args=parser.parse_args()
with sync_playwright() as p:
 b=p.chromium.launch()
 for route in ['systems','research','performance','founder','progress']:
  page=b.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
  page.goto(args.origin+'/'+route,wait_until='networkidle')
  page.add_script_tag(path='/tmp/canli-phase2-axe.min.js')
  result=page.evaluate('async()=>await axe.run({include:[["main"]]},{runOnly:["color-contrast"]})')
  rows.append({'route':route,'violations':[{'id':v['id'],'nodes':[{'target':n['target'],'summary':n.get('failureSummary')} for n in v['nodes']]} for v in result['violations']]})
  sections=page.locator('main > section')
  for i in range(sections.count()):
   sections.nth(i).evaluate('e=>scrollTo(0,e.getBoundingClientRect().top+scrollY-90)')
   page.wait_for_timeout(80)
   page.screenshot(path=str(out/f'reading-{route}-{i}.png'))
  page.screenshot(path=str(out/f'reading-{route}-full.png'),full_page=True)
  page.close()
 b.close()
(out/'contrast.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps([{'route':r['route'],'nodes':sum(len(v['nodes']) for v in r['violations'])} for r in rows]))
