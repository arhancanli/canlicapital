import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(__file__).resolve().parents[1]/"artifacts/reference/united-carriers"
results={}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
 page=ctx.new_page()
 page.goto('https://unitedcarriers.com',wait_until='domcontentloaded')
 page.wait_for_timeout(12000)
 root=page.locator('.body-inner')
 height=root.evaluate('(e)=>e.scrollHeight')
 results['mobileScrollRoot']={'selector':'.body-inner','scrollHeight':height,'viewportHeight':844}
 print('Actual mobile scroll height',height,flush=True)
 shots=[]
 for i,y in enumerate(range(0,height,1000)):
  root.evaluate('(e,y)=>e.scrollTo(0,y)',y)
  page.wait_for_timeout(750)
  name=f'mobile-journey-{i:02d}.png'
  page.screenshot(path=str(OUT/name))
  shots.append({'file':name,'y':root.evaluate('(e)=>e.scrollTop')})
  if i%8==0: print('Mobile frame',i,flush=True)
 (OUT/'mobile-journey.json').write_text(json.dumps(shots,indent=2))
 root.evaluate('(e)=>e.scrollTo(0,0)')
 page.wait_for_timeout(800)
 toggle=page.locator('.header-menu-toggle')
 toggle.click()
 page.wait_for_timeout(1200)
 page.screenshot(path=str(OUT/'mobile-menu-open.png'))
 results['mobileMenuOpen']={'class':page.locator('.header').get_attribute('class'),'toggle':toggle.get_attribute('aria-expanded'),'visibleLinks':page.locator('.header-dropdown a:visible').all_text_contents()}
 page.keyboard.press('Escape')
 page.wait_for_timeout(600)
 results['mobileMenuAfterEscape']={'class':page.locator('.header').get_attribute('class'),'toggle':toggle.get_attribute('aria-expanded')}
 # Close using the same toggle if Escape did not close it.
 if results['mobileMenuAfterEscape']['class']==results['mobileMenuOpen']['class']:
  toggle.click()
  page.wait_for_timeout(700)
 faq=page.locator('.home-faq-main-item')
 faq.first.scroll_into_view_if_needed()
 page.wait_for_timeout(1500)
 faq.first.click()
 page.wait_for_timeout(600)
 page.screenshot(path=str(OUT/'mobile-faq-open.png'))
 results['faqFirst']={'active':faq.first.get_attribute('class'),'answerVisible':faq.first.locator('.home-faq-main-item-ans').is_visible(),'tag':faq.first.evaluate('(e)=>e.tagName'),'tabindex':faq.first.get_attribute('tabindex')}
 faq.nth(1).click()
 page.wait_for_timeout(600)
 results['faqSecond']={'firstClosed':not faq.first.locator('.home-faq-main-item-ans').is_visible(),'secondVisible':faq.nth(1).locator('.home-faq-main-item-ans').is_visible()}
 ctx.close()
 desktop=b.new_page(viewport={'width':1440,'height':1000})
 desktop.goto('https://unitedcarriers.com',wait_until='domcontentloaded')
 desktop.wait_for_timeout(12000)
 desktop.locator('.home-hero-btn').first.hover()
 desktop.wait_for_timeout(500)
 desktop.screenshot(path=str(OUT/'desktop-button-hover.png'))
 results['hoverButton']=desktop.locator('.home-hero-btn').first.evaluate('(e)=>({html:e.outerHTML,childStyles:[...e.querySelectorAll("*")].slice(0,12).map(c=>({class:c.className,background:getComputedStyle(c).backgroundColor,color:getComputedStyle(c).color,transform:getComputedStyle(c).transform}))})')
 desktop.mouse.move(1140,470)
 desktop.mouse.down()
 desktop.mouse.move(950,430,steps=16)
 desktop.mouse.up()
 desktop.wait_for_timeout(500)
 desktop.screenshot(path=str(OUT/'desktop-globe-drag.png'))
 desktop.evaluate('window.scrollTo(0,2500)')
 desktop.wait_for_timeout(1500)
 results['scrolledHeader']=desktop.locator('.header').get_attribute('class')
 desktop.screenshot(path=str(OUT/'desktop-scrolled-header.png'))
 # Capture settled editorial sections, avoiding mid-reveal screenshots.
 for selector,name in [('.home-intro','intro'),('.home-testi','testimonials'),('.home-partners','partners'),('.home-ins','insights'),('.home-faq','faq'),('.footer','footer')]:
  loc=desktop.locator(selector).first
  loc.evaluate('(e)=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY)')
  desktop.wait_for_timeout(1800)
  desktop.screenshot(path=str(OUT/f'desktop-section-{name}.png'))
 # Render compact mobile evidence sheets.
 gallery=b.new_page(viewport={'width':1440,'height':1000})
 for batch in range(0,len(shots),8):
  cards=[]
  for shot in shots[batch:batch+8]:
   data=base64.b64encode((OUT/shot['file']).read_bytes()).decode()
   cards.append(f'<figure><figcaption>{shot["file"]} · {round(shot["y"])}</figcaption><img src="data:image/png;base64,{data}"></figure>')
  gallery.set_content('<html><style>body{margin:0;padding:10px;background:#ddd;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}figure{margin:0}img{width:100%;display:block}figcaption{font:12px monospace;background:white;padding:8px}</style>'+''.join(cards)+'</html>')
  gallery.screenshot(path=str(OUT/f'mobile-sheet-{batch//8:02d}.png'),full_page=True)
 b.close()
(OUT/'interactions.json').write_text(json.dumps(results,indent=2))
print('Interactions captured',flush=True)
