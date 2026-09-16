"""Actual macOS Safari, read-only Phase 2 scroll/navigation regression."""
import argparse
import base64
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--origin', default='http://127.0.0.1:4188')
args = parser.parse_args()
out = Path('artifacts/qa/phase2-atlas/safari')
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
    wait('return document.readyState === "complete" && document.querySelectorAll(".strategy-exhibition__controls button").length === 4')
    wait('return document.querySelector(".cinema-hero__art img").naturalWidth > 0')
    time.sleep(1)
    shot('hero')
    for i in [0,1,2,3,2,1,0]:
        js(f'document.querySelectorAll(".strategy-exhibition__controls button")[{i}].click()')
        time.sleep(.8)
        wait(f'return document.querySelector("#sleeves").dataset.strategyStage === "{i}"')
        assert js(f'return Math.abs(document.querySelectorAll(".sleeve-row")[{i}].getBoundingClientRect().x)<2')
        wait(f'return document.querySelectorAll(".strategy-study img")[{i}].naturalWidth > 0')
        shot('strategy-'+str(i))
    for i in [0,1,2,1,0]:
        js(f'document.querySelectorAll(".process-controls button")[{i}].click()')
        time.sleep(.8)
        wait(f'return document.querySelector(".cinema-process").dataset.processStage === "{i}"')
        assert js(f'return Math.abs(document.querySelectorAll(".cinema-process__chapter")[{i}].getBoundingClientRect().x)<2')
        shot('process-'+str(i))
    js('document.querySelectorAll(".cinema-process__chapter a")[2].focus()')
    time.sleep(.8)
    wait('return document.querySelector(".cinema-process").dataset.processStage === "2"')
    assert js('const r=document.activeElement.getBoundingClientRect();return r.y>=78&&r.bottom<innerHeight')
    assert js('return document.documentElement.scrollWidth <= innerWidth+1')
    assert js('return !document.querySelector("#record-details").open && document.querySelector("#evidence-details").open')
    report={'browser':'actual macOS Safari','origin':args.origin,'passed':True,
        'viewport':js('return {width:innerWidth,height:innerHeight}'),
        'checks':['four native strategy images','all strategy stages forward/reverse','all process stages forward/reverse','focused off-screen process link revealed','no horizontal overflow','optional room closed; limitations expanded']}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
finally:
    call('DELETE',prefix)
