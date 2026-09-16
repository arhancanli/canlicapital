"""Actual Safari shell regression; read-only, no logins or external forms."""
import base64
import json
import time
from pathlib import Path
from urllib.request import Request,urlopen

out=Path('artifacts/qa/phase4-shell/safari')
out.mkdir(parents=True,exist_ok=True)
def call(method,path,data=None):
    req=Request('http://127.0.0.1:64411'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method=method)
    with urlopen(req,timeout=30) as r: result=json.load(r)['value']
    if isinstance(result,dict) and result.get('error'):raise RuntimeError(result)
    return result
sid=call('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'safari'}}})['sessionId']
prefix='/session/'+sid
def js(script):return call('POST',prefix+'/execute/sync',{'script':script,'args':[]})
results=[]
try:
    call('POST',prefix+'/window/rect',{'width':1440,'height':1100})
    for route in ['/','/developers','/research','/methodology','/tools/selection-risk','/publication/alphamax/v0.1.0']:
        call('POST',prefix+'/url',{'url':'http://127.0.0.1:4188'+route})
        deadline=time.monotonic()+15
        while not js('return document.readyState==="complete" && !!document.querySelector("header[data-navigation-ready]")'):
            if time.monotonic()>deadline:raise AssertionError(route)
            time.sleep(.2)
        js('document.querySelector(".cc-shell__index > summary").click()')
        time.sleep(.3)
        assert js('return document.querySelector(".cc-shell__index").open')
        assert js('return getComputedStyle(document.querySelector(".cc-shell__cta")).fontSize!=="0px"')
        name=route.strip('/').replace('/','-') or 'home'
        (out/(name+'-menu.png')).write_bytes(base64.b64decode(call('GET',prefix+'/screenshot')))
        js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
        assert js('return !document.querySelector(".cc-shell__index").open && document.activeElement===document.querySelector(".cc-shell__index > summary")')
        js('document.querySelector(".cc-footer__context > summary").click();document.querySelector(".cc-footer__context").scrollIntoView()')
        time.sleep(.3)
        assert js('return document.querySelector(".cc-footer__context").open && !document.querySelector(".cc-handoff.is-kinetic")')
        assert js('return document.documentElement.scrollWidth<=innerWidth+1')
        (out/(name+'-footer.png')).write_bytes(base64.b64decode(call('GET',prefix+'/screenshot')))
        results.append({'route':route,'passed':True})
finally:call('DELETE',prefix)
(out/'report.json').write_text(json.dumps({'browser':'actual macOS Safari','results':results,'limits':['Escape event dispatched by test; physical keyboard sequence separately tested in Chromium/WebKit.','No backend, real forms or production deployment tested.']},indent=2)+'\n')
print(json.dumps({'safariRoutes':len(results),'passed':True}))
