"""Actual Safari hub smoke checks; local navigation only, no external writes."""
import base64,json,time
from pathlib import Path
from urllib.request import Request,urlopen
out=Path('artifacts/qa/phase6-hubs/safari');out.mkdir(parents=True,exist_ok=True)
routes=['/systems','/performance','/research','/methodology','/measurements','/verify','/review','/foundry','/research/topics/crypto']
def call(method,path,data=None):
    req=Request('http://127.0.0.1:64411'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method=method)
    with urlopen(req,timeout=30) as r:result=json.load(r)['value']
    if isinstance(result,dict) and result.get('error'):raise RuntimeError(result)
    return result
sid=call('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'safari'}}})['sessionId'];prefix='/session/'+sid
def js(script):return call('POST',prefix+'/execute/sync',{'script':script,'args':[]})
rows=[]
try:
    call('POST',prefix+'/window/rect',{'width':1440,'height':1100})
    for route in routes:
        call('POST',prefix+'/url',{'url':'http://127.0.0.1:4188'+route})
        deadline=time.monotonic()+15
        while not js('return document.readyState==="complete" && !!document.querySelector("header[data-navigation-ready]")'):
            if time.monotonic()>deadline:raise AssertionError(route)
            time.sleep(.2)
        assert js('return document.documentElement.scrollWidth<=innerWidth+1')
        assert js('return document.querySelectorAll(".hub-index").length===1')
        js('Array.from(document.querySelectorAll(".hub-index a")).find(e=>e.getAttribute("href").startsWith("#"))?.click()')
        time.sleep(.4)
        if route in ['/research','/measurements','/research/topics/crypto']:
            assert js('return !!document.querySelector("#hub-query,#archive-query")')
            js('const e=document.querySelector("#hub-query,#archive-query"); e.value="NO_MATCH_PHASE_SIX";e.dispatchEvent(new Event("input",{bubbles:true}))')
            assert js('return [...document.querySelectorAll(".measure__card,.research-library--hub .research-library__item,#researchLibraryList>li")].every(e=>e.hidden)')
            js('document.querySelector(".hub-search button,.archive-search button").click()')
        js('scrollTo(0,document.documentElement.scrollHeight)');time.sleep(.4)
        (out/(route.strip('/').replace('/','-')+'.png')).write_bytes(base64.b64decode(call('GET',prefix+'/screenshot')))
        rows.append({'route':route,'passed':True})
finally:call('DELETE',prefix)
(out/'report.json').write_text(json.dumps({'browser':'actual macOS Safari','results':rows,'limits':['Desktop smoke tests, not comprehensive interaction coverage.']},indent=2)+'\n')
print(json.dumps({'routes':len(rows),'passed':True}))
