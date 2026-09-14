"""Read-only final preview review. Never submit keys, signup or other writes."""
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ORIGIN = 'https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app'
OUT = Path('artifacts/qa/phase12-review')
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--suite', choices=['visual', 'http', 'journeys', 'safari'], default='visual')
parser.add_argument('--normal', action='store_true')
parser.add_argument('--routes', nargs='+')
args = parser.parse_args()
if args.suite != 'visual':
    script = {'http':'audit-phase9-http.py', 'journeys':'audit-phase8-journeys.py', 'safari':'audit-phase4-safari.py'}[args.suite]
    source = Path('scripts', script).read_text()
    for old in ['https://meridian-f3xjbosh7-arhans-projects-ac470eaa.vercel.app', 'http://127.0.0.1:4188']:
        source = source.replace(old, ORIGIN)
    for old in ['artifacts/qa/phase9-preview', 'artifacts/qa/phase8-release', 'artifacts/qa/phase4-shell/safari']:
        source = source.replace(old, str(OUT / args.suite))
    (OUT / args.suite).mkdir(exist_ok=True)
    source = source.replace("page.route('**/api/v1/keys',lambda r:r.abort());", "page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort());page.route('**/api/v1/keys',lambda r:r.abort());")
    import sys
    sys.argv = [sys.argv[0]] + (['--normal'] if args.normal and args.suite == 'journeys' else [])
    exec(compile(source, script, 'exec'), {'__name__':'__main__'})
    raise SystemExit()

routes = args.routes or ['/', '/developers', '/tools', '/tools/selection-risk', '/systems', '/performance', '/research', '/methodology', '/tools/execution', '/verify', '/founder', '/progress', '/research/forward-sharpe-evidence-standard', '/publication/alphamax/v0.1.0']
rows = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 390]:
        for route in routes:
            page = browser.new_page(viewport={'width':width, 'height':900}, device_scale_factor=1, reduced_motion='reduce')
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.route('**/*', lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
            response = page.goto(ORIGIN + route, wait_until='networkidle')
            slug = route.strip('/').replace('/', '-') or 'home'
            # Exercise lazy-loaded content throughout the page before capturing.
            page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            page.wait_for_timeout(400)
            page.evaluate('window.scrollTo(0, 0)')
            page.wait_for_timeout(300)
            page.screenshot(path=str(OUT / f'{slug}-{width}-full.png'), full_page=True)
            if route == '/':
                for selector in ['.hero', '#introduction', '.cinema-process', '#sleeves', '#live-record', '#developer-api', '#research', '#evidence', '#trust', '.home-questions', '#access']:
                    element = page.locator(selector)
                    element.scroll_into_view_if_needed()
                    page.wait_for_timeout(200)
                    page.screenshot(path=str(OUT / f'home-{width}-{selector.strip(".#")}.png'))
            metrics = page.evaluate('''() => ({overflow:document.documentElement.scrollWidth>innerWidth+1,
              h1:document.querySelectorAll('h1').length,
              brokenImages:[...document.images].filter(i=>i.getBoundingClientRect().height>0&&i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),
              missingAlt:[...document.images].filter(i=>!i.hasAttribute('alt')).length,
              title:document.title,
              canonical:document.querySelector('link[rel="canonical"]')?.href})''')
            row = {'route':route, 'width':width, 'status':response.status, 'errors':errors, **metrics}
            row['passed'] = response.status==200 and not errors and not metrics['overflow'] and not metrics['brokenImages'] and metrics['h1']==1 and metrics['missingAlt']==0
            rows.append(row)
            print(json.dumps(row), flush=True)
            page.close()
    browser.close()
(OUT / ('visual-followup.json' if args.routes else 'visual-checks.json')).write_text(json.dumps(rows, indent=2)+'\n')
print(json.dumps({'cases':len(rows), 'failed':sum(not r['passed'] for r in rows)}))
