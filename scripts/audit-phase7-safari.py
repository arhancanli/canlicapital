"""Actual Safari representative family reading and disclosure smoke tests."""
import base64,json,time
from pathlib import Path
from urllib.request import Request,urlopen
root=Path('artifacts/qa/phase7-reader');out=root/'safari';out.mkdir(exist_ok=True)
routes=sorted(set(r['route'] for r in json.loads((root/'sample/report.json').read_text())['cases']))
def call(method,path,data=None):
 req=Request('http://127.0.0.1:64411'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method=method)
 with urlopen(req,timeout=30) as r:return json.load(r)['value']
sid=call('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'safari'}}})['sessionId'];prefix='/session/'+sid
def js(script):return call('POST',prefix+'/execute/sync',{'script':script,'args':[]})
rows=[]
try:
 call('POST',prefix+'/window/rect',{'width':1440,'height':1100})
 for route in routes:
  call('POST',prefix+'/url',{'url':'http://127.0.0.1:4188'+route})
  deadline=time.monotonic()+20
  while not js('return document.readyState==="complete" && !!document.querySelector("header[data-navigation-ready]")'):
   if time.monotonic()>deadline:raise AssertionError(route)
   time.sleep(.2)
  assert js('return document.documentElement.scrollWidth<=innerWidth+1'),route
  js('const d=document.querySelector(".reader-index details");if(d)d.open=true;document.querySelector(".reader-index nav a")?.click()')
  time.sleep(.4)
  assert js('return !!document.querySelector(".reader-index")')
  js('scrollTo(0,document.documentElement.scrollHeight)');time.sleep(.3)
  (out/(route.strip('/').replace('/','-')+'.png')).write_bytes(base64.b64decode(call('GET',prefix+'/screenshot')))
  rows.append({'route':route,'passed':True})
finally:call('DELETE',prefix)
(out/'report.json').write_text(json.dumps({'browser':'actual Safari','cases':rows},indent=2)+'\n');print({'cases':len(rows),'passed':True})
