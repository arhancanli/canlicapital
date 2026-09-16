import base64
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

OUT=Path(__file__).resolve().parents[1]/"artifacts/reference/united-carriers"
inventory=json.loads((OUT/"desktop-final-inventory.json").read_text())
urls=sorted(set(r["name"] for r in inventory["resources"] if "united-carriers.netlify.app/chunks/" in r["name"] and not any(x in r["name"] for x in ["vendor-","rolldown-"])))
def download(url):
 try:
  data=urlopen(url,timeout=25).read()
  name=url.rsplit("/",1)[-1]
  (OUT/name).write_bytes(data)
  return {"url":url,"file":name,"bytes":len(data)}
 except Exception as e: return {"url":url,"error":str(e)}
with ThreadPoolExecutor(max_workers=5) as pool:
 modules=list(pool.map(download,urls))
(OUT/"modules.json").write_text(json.dumps(modules,indent=2))
print("Captured",len(modules),"custom modules",flush=True)

with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 gallery=b.new_page(viewport={"width":1440,"height":1000})
 shots=json.loads((OUT/"desktop-scroll.json").read_text())
 for batch in range(0,len(shots),9):
  cards=[]
  for shot in shots[batch:batch+9]:
   data=base64.b64encode((OUT/shot["file"]).read_bytes()).decode()
   cards.append(f'<figure><figcaption>{shot["file"]} · scroll {round(shot["actualY"])}</figcaption><img src="data:image/png;base64,{data}"></figure>')
  gallery.set_content('<html><style>body{margin:0;padding:12px;background:#ddd;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}img{display:block;width:100%}figcaption{font:14px monospace;padding:8px;background:white}</style>'+''.join(cards)+'</html>')
  gallery.screenshot(path=str(OUT/f"desktop-sheet-{batch//9:02d}.png"),full_page=True)
 gallery.close()
 # Use the same inventory function, without executing the first collection script.
 source=(Path(__file__).parent/"inspect-united-reference.py").read_text()
 inv=re.search('INVENTORY = """([\\s\\S]*?)"""',source).group(1)
 ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
 mp=ctx.new_page()
 mp.goto("https://unitedcarriers.com",wait_until="domcontentloaded")
 mp.wait_for_timeout(12000)
 mi=mp.evaluate(inv)
 (OUT/"mobile-inventory.json").write_text(json.dumps(mi,indent=2))
 mp.screenshot(path=str(OUT/"mobile-entry.png"))
 print("Mobile height:",mi["scrollHeight"],flush=True)
 shots=[]
 for i,y in enumerate(range(0,mi["scrollHeight"],1000)):
  mp.evaluate("y=>window.scrollTo(0,y)",y)
  mp.wait_for_timeout(650)
  name=f"mobile-scroll-{i:02d}.png"
  mp.screenshot(path=str(OUT/name))
  shots.append({"file":name,"y":mp.evaluate("scrollY")})
 (OUT/"mobile-scroll.json").write_text(json.dumps(shots,indent=2))
 mp.screenshot(path=str(OUT/"mobile-full.png"),full_page=True)
 print("Mobile captured",len(shots),"frames",flush=True)
 # DOM candidates for interactions, including controls implemented as divs.
 candidates=mp.locator('[class*="menu"],[class*="faq"],[class*="dropdown"],[class*="header-toggle"]').evaluate_all("els=>els.map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.trim().slice(0,160),role:e.getAttribute('role'),tabindex:e.getAttribute('tabindex')}))")
 (OUT/"interaction-candidates.json").write_text(json.dumps(candidates,indent=2))
 ctx.close()
 reduced=b.new_page(viewport={"width":1440,"height":1000},reduced_motion="reduce")
 reduced.goto("https://unitedcarriers.com",wait_until="domcontentloaded")
 reduced.wait_for_timeout(12000)
 reduced.screenshot(path=str(OUT/"reduced-motion-entry.png"))
 (OUT/"reduced-motion-inventory.json").write_text(json.dumps(reduced.evaluate(inv),indent=2))
 b.close()
print("Detailed captures complete",flush=True)
