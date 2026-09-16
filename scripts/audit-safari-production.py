"""Read-only local UI regression using Apple's actual Safari WebDriver."""
import base64
import json
import os
from pathlib import Path
import time
from urllib.request import Request, urlopen

driver = 'http://127.0.0.1:64411'
origin = 'http://127.0.0.1:4188'
out = Path(os.getenv('SAFARI_AUDIT_OUT', 'artifacts/qa/safari-production'))
out.mkdir(parents=True, exist_ok=True)

def call(method, path, data=None):
    request = Request(driver + path, data=json.dumps(data).encode() if data is not None else None,
        headers={'Content-Type': 'application/json'}, method=method)
    with urlopen(request, timeout=40) as response: result = json.load(response)['value']
    if isinstance(result, dict) and result.get('error'): raise RuntimeError(result)
    return result

session = call('POST', '/session', {'capabilities': {'alwaysMatch': {'browserName': 'safari'}}})['sessionId']
prefix = '/session/' + session
def js(script): return call('POST', prefix + '/execute/sync', {'script': script, 'args': []})
def wait(script, seconds=12):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        result = js(script)
        if result: return result
        time.sleep(.2)
    raise AssertionError('Safari condition timed out: ' + script)
def screenshot(name):
    (out / (name + '.png')).write_bytes(base64.b64decode(call('GET', prefix + '/screenshot')))

results = []
try:
    call('POST', prefix + '/window/rect', {'width': 1440, 'height': 1000})
    call('POST', prefix + '/url', {'url': origin})
    wait('return document.readyState === "complete" && (document.querySelector(".cinema-process.is-enhanced") || document.querySelector(".cinema-process.has-middle-stage"))')
    wait('return document.querySelector(".cinema-hero__art img").naturalWidth > 0')
    assert js('return document.documentElement.scrollWidth <= innerWidth + 1')
    screenshot('hero')
    wait('return Number(document.querySelector(".cinema-process").dataset.sceneEnd)>0')
    js('const e=document.querySelector(".cinema-process"); const start=Number(e.dataset.sceneStart),end=Number(e.dataset.sceneEnd);scrollTo({top:start+(end-start)*.8,behavior:"instant"});')
    frame = wait('return document.querySelector(".research-journey.has-continuity") ? "connected-scroll" : Number(document.querySelector("[data-instrument-sequence]").dataset.opticalProgress)>.6 && Number(document.querySelector("[data-instrument-sequence]").dataset.opticalProgress)')
    wait('return [...document.querySelectorAll(".optical-sculpture.is-ready")].some(e=>e.getBoundingClientRect().width>0)')
    screenshot('open-sequence')
    if os.getenv('SAFARI_FULL_JOURNEY'):
        for selector in ['#sleeves', '#live-record', '#developer-api', '#system-films', '#research', '#evidence', '#trust', '.home-questions', '#access']:
            js('const e=document.querySelector(' + json.dumps(selector) + ');scrollTo({top:e.getBoundingClientRect().top+scrollY-100,behavior:"instant"});')
            time.sleep(1)
            assert js('return document.documentElement.scrollWidth <= innerWidth + 1'), selector
            screenshot('journey-' + selector.lstrip('#.'))
    curve = js('return document.getElementById("equity-path").getAttribute("d")')
    if os.getenv('SAFARI_FULL_JOURNEY'):
        wait('return document.querySelectorAll(".decision-controls button").length === 5')
        for stage in [0, 1, 2, 3, 4, 0]:
            js('document.querySelectorAll(".decision-controls button")[' + str(stage) + '].click()')
            time.sleep(.7)
            assert js('return document.querySelector(".trace").dataset.decisionStage') == str(stage)
            assert js('const e=document.querySelectorAll(".trace-line li a")[' + str(stage) + ']; const r=e.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;')
            screenshot('decision-' + str(stage))
        results.append({'case': 'Safari five-stage decision journey', 'passed': True, 'checks': ['all stages', 'reverse jump', 'evidence links unobscured']})
    js('document.querySelector("[data-curve-key=alphaforge]").click()')
    assert wait('return document.querySelector("[data-curve-key=alphaforge]").getAttribute("aria-pressed")==="true"')
    assert js('return document.getElementById("equity-path").getAttribute("d")') != curve
    js('document.querySelector(".home-questions summary").click()')
    assert js('return document.querySelector(".home-questions details").open')
    call('POST', prefix + '/url', {'url': origin + '/#evidence'})
    assert wait('return document.getElementById("evidence-details").open')
    if os.getenv('SAFARI_FULL_JOURNEY'):
        wait('return document.querySelector(".cc-handoff").dataset.handoffEnd')
        packet_positions = []
        for phase in [0, .5, 1]:
            js('const e=document.querySelector(".cc-handoff"); const start=Number(e.dataset.handoffStart), end=Number(e.dataset.handoffEnd); scrollTo({top:start+(end-start)*' + str(phase) + ',behavior:"instant"});')
            time.sleep(1)
            packet_positions.append(js('return document.querySelector(".cc-handoff__packet").getBoundingClientRect().x'))
            screenshot('carrying-' + str(phase))
        assert packet_positions[-1] > packet_positions[0] + 300, packet_positions
        results.append({'case': 'Safari carrying sequence', 'passed': True, 'packetX': packet_positions})
    results.append({'case': 'Safari homepage', 'passed': True, 'opticalProgress': frame,
        'checks': ['hero decoded', 'no overflow', 'sequence advances', 'curve switching', 'FAQ disclosure', 'deep evidence hash']})
    routes = ['/developers', '/systems', '/research', '/performance']
    if os.getenv('SAFARI_FULL_JOURNEY'):
        routes += ['/open', '/progress', '/tools', '/tools/deflated-sharpe', '/tools/evidence-chain', '/methodology', '/verify', '/research/crypto-carry-portable-v1']
    for route in routes:
        call('POST', prefix + '/url', {'url': origin + route})
        wait('return document.readyState === "complete" && document.querySelector("h1")')
        assert js('return document.documentElement.scrollWidth <= innerWidth + 1'), route
        if os.getenv('SAFARI_FULL_JOURNEY'):
            assert wait('return document.documentElement.dataset.opticalMotion === "ready"'), route
            time.sleep(1)
            screenshot(route.strip('/').replace('/', '--'))
        results.append({'case': 'Safari ' + route, 'passed': True, 'heading': js('return document.querySelector("h1").textContent.trim()')})
    (out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))
finally:
    call('DELETE', prefix)
