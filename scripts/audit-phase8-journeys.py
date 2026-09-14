"""Cross-family navigation and destructive-action-free media failure checks."""
import argparse,json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--transition-probe',action='store_true');parser.add_argument('--normal',action='store_true');args=parser.parse_args()
out=Path('artifacts/qa/phase8-release');rows=[]
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  b=getattr(p,engine).launch()
  for width in [390,1440]:
   print({'journey':engine,'width':width,'normal':args.normal},flush=True)
   page=b.new_page(viewport={'width':width,'height':900},reduced_motion='no-preference' if args.normal else 'reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   if args.transition_probe:
    def patch_css(route):
     response=route.fetch();route.fulfill(response=response,body=response.text()+'\n@media(prefers-reduced-motion:reduce){@view-transition{navigation:none;}}')
    page.route('**/*.css',patch_css)
   page.route('**/api/v1/keys',lambda r:r.abort());page.route('**/api/waitlist',lambda r:r.abort())
   page.goto('http://127.0.0.1:4188',wait_until='networkidle')
   toggle=page.locator('.cc-shell__index > summary');toggle.focus();page.keyboard.press('Enter');assert page.locator('.cc-shell__index').get_attribute('open') is not None
   page.keyboard.press('Escape');assert toggle.evaluate('e=>e===document.activeElement')
   page.locator('.cc-shell__index > summary').click()
   page.locator('.cc-shell__panel a[href="/research"]').first.click();page.wait_for_url('**/research',wait_until='domcontentloaded');page.wait_for_load_state('networkidle')
   page.locator('.hub-index a[href="#researchLibrary"]').click();page.locator('#archive-query').fill('forward Sharpe')
   paper=page.locator('#researchLibraryList li:visible a').first;assert paper.count();paper.click();page.wait_for_load_state('networkidle')
   assert page.locator('.paper__title').is_visible();page.locator('.reader-index__verify').click();page.wait_for_url('**/verify',wait_until='domcontentloaded')
   page.wait_for_load_state('networkidle');assert page.locator('.hub-index').is_visible()
   page.locator('.cc-shell__index > summary').click();page.locator('.cc-shell__panel a[href="/developers"]').first.click();page.wait_for_url('**/developers',wait_until='domcontentloaded')
   page.wait_for_load_state('networkidle');assert page.locator('#quickstart').is_visible()
   overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
   if errors or overflow:
    page.screenshot(path=str(out/f'journey-failure-{engine}-{width}.png'));print({'engine':engine,'width':width,'url':page.url,'errors':errors,'overflow':overflow},flush=True)
   assert not errors,(engine,width,errors);assert not overflow,(engine,width,page.url)
   rows.append({'engine':engine,'width':width,'case':'home-research-search-paper-verify-developers','passed':True});page.close()
  for route in ['/','/systems','/research','/developers','/research/forward-sharpe-evidence-standard']:
   if args.normal:continue
   for js in [True,False]:
    page=b.new_page(viewport={'width':390,'height':844},java_script_enabled=js,reduced_motion='reduce')
    page.route(re.compile(r'\.(webp|png|avif|mp4|woff2?|ttf)(\?|$)'),lambda r:r.abort())
    page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
    assert page.locator('h1').first.is_visible();assert page.locator('main').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    if route=='/':
     for selector in ['#live-record','#developer-api','#evidence','.home-questions','#access']:assert page.locator(selector).is_visible()
    if route=='/research':assert page.locator('#researchLibraryList>li').count()==111
    rows.append({'engine':engine,'route':route,'javascript':js,'case':'decorative-media-and-font-failure','passed':True});page.close()
  b.close()
(out/('journeys-normal.json' if args.normal else 'journeys-transition-probe.json' if args.transition_probe else 'journeys.json')).write_text(json.dumps(rows,indent=2)+'\n');print({'cases':len(rows),'passed':True})
