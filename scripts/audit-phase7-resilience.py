"""WebKit family coverage: no-JS and native keyboard disclosure/anchor use."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--normal',action='store_true');args=parser.parse_args()
root=Path('artifacts/qa/phase7-reader');routes=sorted(set(r['route'] for r in json.loads((root/'sample/report.json').read_text())['cases']));rows=[]
with sync_playwright() as p:
 b=p.webkit.launch()
 for route in routes:
  for js in ([True] if args.normal else [False,True]):
   page=b.new_page(java_script_enabled=js,viewport={'width':1440 if args.normal else 390,'height':844},reduced_motion='no-preference' if args.normal else 'reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
   summary=page.locator('.reader-index summary')
   if summary.count():
    details=page.locator('.reader-index details');opened=details.get_attribute('open') is not None
    summary.focus();page.keyboard.press('Enter');assert (details.get_attribute('open') is not None)!=opened
    if opened:page.keyboard.press('Enter')
    link=page.locator('.reader-index nav a').first;target=link.get_attribute('href');link.focus();page.keyboard.press('Enter');page.wait_for_timeout(600)
    assert page.locator(target).is_visible()
   if args.normal:
    for f in [.5,1,.5,0]:
     page.evaluate('(f)=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f)',f);page.wait_for_timeout(350)
   assert not errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   rows.append({'route':route,'javascript':js,'passed':True});page.close()
 b.close()
(root/('normal-motion.json' if args.normal else 'resilience.json')).write_text(json.dumps(rows,indent=2)+'\n');print({'cases':len(rows),'passed':True})
