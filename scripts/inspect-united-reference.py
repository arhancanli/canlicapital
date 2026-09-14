"""Read-only browser inspection of the public reference landing page."""
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "artifacts/reference/united-carriers"
OUT.mkdir(parents=True, exist_ok=True)
URL = "https://unitedcarriers.com/"

INVENTORY = """() => {
 const style = e => { const s=getComputedStyle(e), r=e.getBoundingClientRect(); return {
  tag:e.tagName, cls:e.className?.baseVal??e.className, id:e.id,
  x:r.x,y:r.y+scrollY,width:r.width,height:r.height,display:s.display,position:s.position,
  font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,spacing:s.letterSpacing,
  color:s.color,background:s.backgroundColor,padding:s.padding,gap:s.gap,radius:s.borderRadius,
  transform:s.transform,opacity:s.opacity,visibility:s.visibility,zIndex:s.zIndex
 }};
 return {
 title:document.title,url:location.href,width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,
 meta:[...document.querySelectorAll('meta')].map(e=>({name:e.name||e.getAttribute('property'),content:e.content})),
 structure:[...document.querySelectorAll('body > *,main > *,section,header,footer')].map(e=>({...style(e),headings:[...e.querySelectorAll('h1,h2,h3')].map(h=>h.textContent.trim()).slice(0,12)})),
 headings:[...document.querySelectorAll('h1,h2,h3,h4')].map(e=>({...style(e),text:e.textContent.trim()})),
 links:[...document.querySelectorAll('a')].map(e=>({...style(e),text:e.textContent.trim(),href:e.href,aria:e.getAttribute('aria-label')})),
 controls:[...document.querySelectorAll('button,[role=button],input,select,textarea,summary')].map(e=>({...style(e),text:e.textContent.trim(),type:e.type,aria:e.getAttribute('aria-label')})),
 images:[...document.images].map(e=>({src:e.currentSrc||e.src,alt:e.alt,loading:e.loading,naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight,...style(e)})),
 videos:[...document.querySelectorAll('video')].map(e=>({src:e.currentSrc,autoplay:e.autoplay,loop:e.loop,muted:e.muted,poster:e.poster,...style(e)})),
 canvases:[...document.querySelectorAll('canvas')].map(style),
 css:[...document.querySelectorAll('link[rel=stylesheet]')].map(e=>e.href),
 scripts:[...document.scripts].map(e=>({src:e.src,type:e.type,inline:e.src?'':e.textContent})),
 fonts:[...document.fonts].map(f=>({family:f.family,style:f.style,weight:f.weight,status:f.status})),
 scrollTriggers:window.ScrollTrigger?.getAll().map(t=>({trigger:t.trigger?.className,start:t.start,end:t.end,pin:!!t.pin,scrub:t.vars.scrub,id:t.vars.id})),
 globals:Object.keys(window).filter(k=>/gsap|lenis|three|split|swiper|lottie|webflow|barba|globe/i.test(k)),
 resources:performance.getEntriesByType('resource').map(r=>({name:r.name,type:r.initiatorType,duration:r.duration,transferSize:r.transferSize,decodedSize:r.decodedBodySize})),
 overflow:document.documentElement.scrollWidth>innerWidth
 };
}"""

def save_json(name, data):
 (OUT / name).write_text(json.dumps(data, indent=2), encoding="utf-8")

with sync_playwright() as p:
 browser = p.chromium.launch(headless=True)
 ctx = browser.new_context(viewport={"width":1440,"height":1000},device_scale_factor=1)
 page = ctx.new_page()
 errors=[]
 page.on("pageerror",lambda e:errors.append(str(e)))
 response=page.goto(URL,wait_until="domcontentloaded",timeout=60000)
 (OUT / "source.html").write_text(response.text(),encoding="utf-8")
 page.wait_for_timeout(2500)
 page.screenshot(path=str(OUT / "desktop-entry-early.png"))
 page.wait_for_timeout(12000)
 page.screenshot(path=str(OUT / "desktop-entry-settled.png"))
 desktop=page.evaluate(INVENTORY)
 save_json("desktop-inventory.json",desktop)
 print("Desktop initial:",desktop["scrollHeight"],"px;",len(desktop["images"]),"images;",len(desktop["scripts"]),"scripts",flush=True)
 # Inspect publicly served source assets. No requests to forms or write APIs.
 asset_index=[]
 for i,url in enumerate(dict.fromkeys(desktop["css"]+[s["src"] for s in desktop["scripts"] if s["src"]])):
  try:
   res=ctx.request.get(url,timeout=20000)
   if not res.ok: continue
   text=res.text()
   ext="css" if url in desktop["css"] else "js"
   name=f"source-{i:02d}.{ext}"
   (OUT/name).write_text(text,encoding="utf-8")
   asset_index.append({"url":url,"file":name,"bytes":len(text)})
  except Exception as e: asset_index.append({"url":url,"error":str(e)[:150]})
 save_json("source-assets.json",asset_index)
 print("Source assets captured",len(asset_index),flush=True)
 shots=[]
 height=desktop["scrollHeight"]
 for i,y in enumerate(range(0,height,850)):
  page.evaluate("y => window.scrollTo(0,y)",y)
  page.wait_for_timeout(650)
  actual=page.evaluate("scrollY")
  name=f"desktop-scroll-{i:02d}.png"
  page.screenshot(path=str(OUT/name))
  shots.append({"file":name,"requestedY":y,"actualY":actual})
  if i%8==0: print("Desktop scroll",i,"at",round(actual),flush=True)
 save_json("desktop-scroll.json",shots)
 save_json("desktop-final-inventory.json",page.evaluate(INVENTORY))
 save_json("browser-errors.json",errors)
 page.screenshot(path=str(OUT/"desktop-full.png"),full_page=True)
 # Contact sheets are browser-rendered documents for browsing captured frames.
 gallery=ctx.new_page()
 for batch in range(0,len(shots),9):
  cards=[]
  for shot in shots[batch:batch+9]:
   data=base64.b64encode((OUT/shot["file"]).read_bytes()).decode()
   cards.append(f'<figure><figcaption>{shot["file"]} · scroll {round(shot["actualY"])}</figcaption><img src="data:image/png;base64,{data}"></figure>')
  gallery.set_content('<html><style>body{margin:0;padding:12px;background:#ddd;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}img{display:block;width:100%}figcaption{font:14px monospace;padding:8px;background:white}</style>'+''.join(cards)+'</html>')
  gallery.screenshot(path=str(OUT/f"desktop-sheet-{batch//9:02d}.png"),full_page=True)
 gallery.close()
 ctx.close()
 # A fresh mobile context exposes the dedicated mobile art direction.
 mobile=browser.new_context(viewport={"width":390,"height":844},device_scale_factor=1,is_mobile=True,has_touch=True)
 mp=mobile.new_page()
 mp.goto(URL,wait_until="domcontentloaded",timeout=60000)
 mp.wait_for_timeout(12000)
 mi=mp.evaluate(INVENTORY)
 save_json("mobile-inventory.json",mi)
 mp.screenshot(path=str(OUT/"mobile-entry.png"))
 print("Mobile initial:",mi["scrollHeight"],"px",flush=True)
 mobile_shots=[]
 for i,y in enumerate(range(0,mi["scrollHeight"],1400)):
  mp.evaluate("y=>window.scrollTo(0,y)",y)
  mp.wait_for_timeout(550)
  name=f"mobile-scroll-{i:02d}.png"
  mp.screenshot(path=str(OUT/name))
  mobile_shots.append({"file":name,"y":mp.evaluate("scrollY")})
 save_json("mobile-scroll.json",mobile_shots)
 mp.screenshot(path=str(OUT/"mobile-full.png"),full_page=True)
 # Save menu candidates for a deliberate interaction follow-up.
 print("Mobile controls:",json.dumps(mi["controls"])[:2500],flush=True)
 mobile.close()
 browser.close()
print("Saved evidence to",OUT,flush=True)
