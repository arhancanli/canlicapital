"""Assert static capture visibility in actual Safari before spending a capture ID."""
import json
from pathlib import Path
from urllib.request import Request, urlopen

driver = 'http://127.0.0.1:64411'
def call(method, path, data=None):
    request = Request(driver + path, data=json.dumps(data).encode() if data is not None else None,
                      headers={'Content-Type': 'application/json'}, method=method)
    with urlopen(request, timeout=40) as response:
        result = json.load(response)['value']
    if isinstance(result, dict) and result.get('error'):
        raise RuntimeError(result)
    return result

session = call('POST', '/session', {'capabilities': {'alwaysMatch': {'browserName': 'safari'}}})['sessionId']
prefix = '/session/' + session
try:
    call('POST', prefix + '/url', {'url': 'http://127.0.0.1:4187/?figma-static=1'})
    result = call('POST', prefix + '/execute/sync', {'script': '''
      return {static:document.documentElement.hasAttribute('data-figma-static'),
        enhanced:document.querySelector('.cinema-process').classList.contains('is-enhanced'),
        nodes:[...document.querySelectorAll('.sleeve-row, .sleeves .section-heading > div, .research-link, .trust-grid article, .access > *')].map(e=>{
          let opacity=1;for(let n=e;n;n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity);
          return {name:e.textContent.trim().slice(0,70),opacity,animation:getComputedStyle(e).animationName};
        })};''', 'args': []})
    assert result['static'] and not result['enhanced'], result
    assert len(result['nodes']) >= 10, result
    assert all(n['opacity'] > .99 and n['animation'] == 'none' for n in result['nodes']), result
    out = Path('artifacts/tooling/figma/safari-static-visibility.json')
    out.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
finally:
    call('DELETE', prefix)
