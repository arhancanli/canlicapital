"""Read-only disclosure check in actual Safari against the current dev server."""
import json
import time
from urllib.request import Request, urlopen

def call(method, path, data=None):
    request = Request('http://127.0.0.1:64411' + path,
                      data=json.dumps(data).encode() if data is not None else None,
                      headers={'Content-Type': 'application/json'}, method=method)
    with urlopen(request, timeout=30) as response:
        result = json.load(response)['value']
    if isinstance(result, dict) and result.get('error'):
        raise RuntimeError(result)
    return result

session = call('POST', '/session', {'capabilities': {'alwaysMatch': {'browserName': 'safari'}}})['sessionId']
prefix = '/session/' + session

def js(script):
    return call('POST', prefix + '/execute/sync', {'script': script, 'args': []})

def wait(script):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if js(script):
            return
        time.sleep(.2)
    raise AssertionError(script)

try:
    call('POST', prefix + '/url', {'url': 'http://127.0.0.1:4187/'})
    wait('return document.readyState === "complete" && !!document.querySelector("#record-details")')
    assert js('return !document.querySelector("#record-details").open && document.querySelector("#evidence-details").open')
    js('document.querySelector("#record-details > summary").click()')
    wait('return document.querySelector("#record-details").open')
    js('document.querySelector("#record-details > summary").click()')
    wait('return !document.querySelector("#record-details").open')
    call('POST', prefix + '/url', {'url': 'http://127.0.0.1:4187/#method'})
    wait('return document.querySelector("#record-details").open')
    assert js('return document.documentElement.scrollWidth <= innerWidth + 1')
    print(json.dumps({'browser': 'actual Safari', 'origin': 'http://127.0.0.1:4187', 'passed': True,
                      'checks': ['optional room closed', 'limitations expanded', 'toggle both directions', 'method deep link opens room', 'no horizontal overflow']}, indent=2))
finally:
    call('DELETE', prefix)
