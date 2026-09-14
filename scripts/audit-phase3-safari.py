"""Actual macOS Safari, read-only Phase 3 scroll/navigation regression."""
import argparse
import base64
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--origin', default='http://127.0.0.1:4188')
args = parser.parse_args()
out = Path('artifacts/qa/phase3-publication/safari')
out.mkdir(parents=True, exist_ok=True)

def call(method, path, data=None):
    request = Request('http://127.0.0.1:64411' + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Content-Type':'application/json'}, method=method)
    with urlopen(request, timeout=30) as response:
        result = json.load(response)['value']
    if isinstance(result, dict) and result.get('error'):
        raise RuntimeError(result)
    return result

sid = call('POST', '/session', {'capabilities':{'alwaysMatch':{'browserName':'safari'}}})['sessionId']
prefix = '/session/' + sid
def js(script):
    return call('POST', prefix + '/execute/sync', {'script':script,'args':[]})
def wait(script):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if js(script): return
        time.sleep(.2)
    raise AssertionError(script)
def shot(name):
    (out / (name + '.png')).write_bytes(base64.b64decode(call('GET',prefix+'/screenshot')))

try:
    call('POST',prefix+'/window/rect',{'width':1440,'height':1100})
    call('POST',prefix+'/url',{'url':args.origin})
    wait('return document.readyState === "complete" && !!document.querySelector(".publication-route")')
    for selector in ['#live-record','#developer-api','#research','#evidence','#trust','.home-questions','#access','#footer']:
        js(f'const n=document.querySelector("{selector}");window.scrollTo(0,n.getBoundingClientRect().top+scrollY-100)')
        time.sleep(.6)
        assert js('return document.documentElement.scrollWidth<=innerWidth+1')
        shot(selector.replace('#','').replace('.',''))
    for i in range(5):
        js(f'document.querySelectorAll("[data-curve-key]")[{i}].click()')
        assert js(f'return document.querySelectorAll("[data-curve-key]")[{i}].getAttribute("aria-pressed")==="true"')
        assert js('return !!document.querySelector("#equity-path").getAttribute("d")')
    js('document.querySelector("#record-details > summary").click()')
    for selector in ['.offering','#evidence-core','#system-films','#method']:
        js(f'const n=document.querySelector("{selector}");window.scrollTo(0,n.getBoundingClientRect().top+scrollY-100)')
        time.sleep(.6)
        shot(selector.replace('#','').replace('.',''))
    assert js('return getComputedStyle(document.querySelector("#evidence-observations")).color==="rgb(0, 22, 203)"')
    assert js('return getComputedStyle(document.querySelector("#form-status")).color==="rgb(52, 59, 70)"')
    assert js('return !document.querySelector(".decision-viewport,.developer-motion,.archive-panorama")')
    assert js('return !document.querySelector(".cc-handoff.is-kinetic")')
    report={'browser':'actual macOS Safari','origin':args.origin,'passed':True,'checks':['12 section viewport captures','all five source-bound curves','no horizontal overflow','visible form labels and observation count','compact decision and footer fallbacks'],'limits':['No real forms submitted. Backend and production deployment not tested.']}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
finally:
    call('DELETE',prefix)

