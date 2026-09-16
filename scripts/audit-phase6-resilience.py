"""All-hub no-JS readability and representative normal-motion scroll/keyboard checks."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
routes=['/'+str(Path(f).with_suffix('')) for f in json.loads(Path('artifacts/qa/phase6-hubs/before.json').read_text())]
out=Path('artifacts/qa/phase6-hubs/resilience');out.mkdir(parents=True,exist_ok=True);rows=[]
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  b=getattr(p,engine).launch()
  for route in routes:
   page=b.new_page(java_script_enabled=False,viewport={'width':768,'height':1024})
   page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
   assert page.locator('main h1').is_visible()
   assert page.locator('.hub-index').is_visible()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   rows.append({'route':route,'engine':engine,'state':'no-JS/tablet','passed':True});page.close()
  for route in ['/systems','/performance','/research']:
   page=b.new_page(viewport={'width':1440,'height':1000},reduced_motion='no-preference');errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
   link=page.locator('.hub-index a[href^="#"]').last;target=link.get_attribute('href')
   link.focus();page.keyboard.press('Enter');page.wait_for_timeout(1200)
   assert page.locator(target).is_visible()
   for fraction in [0,.25,.5,.75,1,.5,0]:
    page.evaluate('(f)=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f)',fraction);page.wait_for_timeout(350)
   page.screenshot(path=str(out/(engine+route.replace('/','-')+'-normal-motion.png')))
   assert not errors
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   rows.append({'route':route,'engine':engine,'state':'normal-motion/keyboard-anchor/scroll-reverse','passed':True});page.close()
  b.close()
(out/'report.json').write_text(json.dumps(rows,indent=2)+'\n');print({'cases':len(rows),'passed':True})
