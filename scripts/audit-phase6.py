"""Phase 6 browser checks: all routes, local navigation, search and fallback."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--axe',action='store_true');p.add_argument('--width',type=int,default=390);a=p.parse_args()
routes=['/'+n for n in ['systems','performance','research','methodology','measurements','verify','review','foundry']]+['/'+str(n.with_suffix('')) for n in sorted(Path('research/topics').glob('*.html'))]
rows=[];out=Path('artifacts/qa/phase6-hubs')
with sync_playwright() as p:
 for engine in (['chromium'] if a.axe else ['chromium','webkit']):
  b=getattr(p,engine).launch()
  for route in routes:
   page=b.new_page(viewport={'width':a.width,'height':844},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
   if a.axe:
    page.add_script_tag(path='/tmp/canli-phase2-axe.min.js');result=page.evaluate('async()=>await axe.run(document.querySelector("main"))')
    rows.append({'route':route,'violations':[{'id':v['id'],'nodes':[{'target':n['target'],'summary':n.get('failureSummary')} for n in v['nodes']]} for v in result['violations'] if any(t.startswith('wcag') for t in v['tags'])]})
   else:
    assert page.locator('.hub-index').count()==1
    for link in page.locator('.hub-index a[href^="#"]').all():
     assert page.locator(link.get_attribute('href')).count()==1
    search=page.locator('#hub-query,#archive-query')
    if search.count():
     items=page.locator('.measure__card,.research-library--hub .research-library__item,#researchLibraryList .research-library__item')
     before=items.count();assert before>0
     search.fill('NO_MATCH_PHASE_SIX');assert items.locator('visible=true').count()==0
     page.locator('.hub-search button,.archive-search button').click()
     assert items.locator('visible=true').count()==before
    assert not errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    rows.append({'route':route,'engine':engine,'passed':True})
   page.close()
  if not a.axe:
   for js in [False,True]:
    page=b.new_page(java_script_enabled=js,viewport={'width':390,'height':844})
    page.route('**/research-index.json',lambda r:r.abort())
    page.goto('http://127.0.0.1:4188/research#researchLibrary',wait_until='networkidle')
    assert page.locator('#researchLibrary').is_visible()
    expected=len(json.loads(Path('public/research-index.json').read_text())['papers'])
    assert page.locator('#researchLibraryList > li').count()==expected
    rows.append({'route':'/research','engine':engine,'state':'index-failure' if js else 'no-JS','passed':True});page.close()
  b.close()
(out/(('accessibility' if a.axe else 'interactions')+f'-{a.width}.json')).write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'cases':len(rows),'violations':[{ 'route':r['route'],'rules':[{ 'id':v['id'],'count':len(v['nodes'])} for v in r['violations']]} for r in rows if r.get('violations')]}))
assert not any(r.get('violations') for r in rows)
