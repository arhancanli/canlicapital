"""Actual Safari Phase 5 smoke checks. Never request a real API key."""
import base64,json,time
from pathlib import Path
from urllib.request import Request,urlopen

out=Path('artifacts/qa/phase5-developer/safari');out.mkdir(parents=True,exist_ok=True)
routes=['/developers','/tools','/tools/deflated-sharpe','/tools/backtest-overfitting','/tools/selection-risk','/tools/execution','/tools/breadth','/tools/trial-accounting','/tools/evidence-chain']
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
        if route=='/developers':
            js('document.querySelectorAll(".dev-snippets [role=tab]")[1].click()')
            assert js('return document.querySelectorAll(".dev-snippets [role=tab]")[1].getAttribute("aria-selected")==="true"')
        js('document.querySelector("#quickstart,.tools-grid,.lab-lab,.dsr-workbench,.union-workbench,.chain-workbench").scrollIntoView()')
        time.sleep(.3)
        name=route.strip('/').replace('/','-')
        (out/(name+'.png')).write_bytes(base64.b64decode(call('GET',prefix+'/screenshot')))
        rows.append({'route':route,'passed':True})
finally:call('DELETE',prefix)
(out/'report.json').write_text(json.dumps({'browser':'actual macOS Safari','results':rows,'limits':['Smoke checks, not comprehensive Safari interaction coverage.','API key issuance never invoked.']},indent=2)+'\n')
print(json.dumps({'routes':len(rows),'passed':True}))
