"""Read-only Phase 13 local browser tests, with injected asset/clipboard failures."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path('artifacts/qa/phase13-corrections');OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--origin',default='http://127.0.0.1:4187');args=parser.parse_args()
ORIGIN=args.origin
rows=[]
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  b=getattr(p,engine).launch(headless=True)
  for width in [1440,390]:
   page=b.new_page(viewport={'width':width,'height':1000},reduced_motion='reduce')
   page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
   for route in ['/','/systems','/research','/performance','/founder','/progress']:
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(ORIGIN+route,wait_until='networkidle')
    page.evaluate('window.scrollTo(0,document.body.scrollHeight)');page.wait_for_timeout(200)
    page.screenshot(path=str(OUT/f'{engine}-{width}-{route.strip("/") or "home"}.png'),full_page=True)
    overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
    row={'engine':engine,'width':width,'route':route,'overflow':overflow,'errors':errors,'passed':not overflow and not errors};rows.append(row);print(json.dumps(row),flush=True)
    if route=='/':
     assert page.locator('#trust-chain').inner_text()=='797'
     pre=page.locator('.api-preview pre');pre.scroll_into_view_if_needed()
     assert pre.evaluate('e=>getComputedStyle(e).whiteSpace')=='pre'
     await_copy='Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.copiedCommand=text;}}})'
     page.evaluate(await_copy);page.locator('.api-command-copy').click()
     assert page.evaluate('window.copiedCommand')==pre.text_content()
     page.screenshot(path=str(OUT/f'{engine}-{width}-command.png'))
   page.close()
  # No arbitrary delay between filtering and activating the result.
  page=b.new_page(viewport={'width':1440,'height':900},reduced_motion='no-preference')
  page.goto(ORIGIN+'/research',wait_until='networkidle')
  page.locator('.hub-index a[href="#researchLibrary"]').click()
  page.locator('#archive-query').fill('forward Sharpe')
  page.locator('#researchLibraryList li:visible a').first.click(timeout=8000)
  page.wait_for_url('**/research/forward-sharpe-evidence-standard')
  rows.append({'engine':engine,'case':'immediate-filter-click','passed':True});page.close()
  for fail_all in [False,True]:
   page=b.new_page(viewport={'width':390,'height':900},reduced_motion='reduce')
   page.route('**/system-films/*poster.webp',lambda r:r.abort())
   if fail_all:page.route('**/system-films/*poster.png',lambda r:r.abort())
   page.goto(ORIGIN,wait_until='networkidle');page.locator('#record-details > summary').click()
   card=page.locator('[data-film-card="engine"]');card.scroll_into_view_if_needed()
   state='unavailable' if fail_all else 'ready'
   page.wait_for_function('(s)=>document.querySelector("[data-film-card=engine]").dataset.posterState===s',arg=state)
   assert card.locator('video').evaluate('v=>v.paused')
   assert card.locator('.system-film__body a').first.is_visible()
   page.screenshot(path=str(OUT/f'{engine}-poster-{state}.png'))
   rows.append({'engine':engine,'case':'poster-'+state,'passed':True});page.close()
  b.close()
(OUT/'report.json').write_text(json.dumps(rows,indent=2)+'\n')
assert all(r['passed'] for r in rows)
print(json.dumps({'passed':True,'cases':len(rows)}))
