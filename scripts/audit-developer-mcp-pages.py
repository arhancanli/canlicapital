# Full DOM measurements for the five developer/MCP discovery pages.
# Requires Playwright plus an explicitly supplied, version-pinned axe script.
# Example: python3 scripts/audit-developer-mcp-pages.py --base http://127.0.0.1:5293
#   --output /tmp/canli-audit --axe /path/to/axe.min.js --source COMMIT --check

import argparse
import hashlib
import json
import platform
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROUTES = ['/developers', '/mcp-servers', '/mcp-servers/validation', '/mcp-servers/fundamentals', '/mcp-servers/research']

parser = argparse.ArgumentParser()
parser.add_argument('--base', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--axe', required=True)
parser.add_argument('--axe-version', default='4.13.0')
parser.add_argument('--source', required=True)
parser.add_argument('--check', action='store_true', help='Fail on observed violations, metadata, overflow, skip focus or table keyboard defects; incomplete/manual checks remain reported.')
args = parser.parse_args()
assert urlparse(args.base).hostname in ['canlicapital.com', '127.0.0.1', 'localhost']
assert re.fullmatch(r'[a-f0-9]{40}', args.source), 'Supply the complete source commit; this label is verified separately against HTML/source evidence.'
output = Path(args.output)
assert not output.exists() or not any(output.iterdir()), 'Use a fresh output directory so a failed run cannot leave stale success receipts.'
output.mkdir(parents=True, exist_ok=True)
rows = []

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    browser_version = browser.version
    for route in ROUTES:
        for profile, width in [('desktop', 1440), ('mobile', 320)]:
            context = browser.new_context(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
            page = context.new_page()
            errors, failed_requests, console_errors, external_requests = [], [], [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('requestfailed', lambda r: failed_requests.append({'url': r.url, 'failure': r.failure}))
            page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
            page.on('request', lambda r: external_requests.append(r.url) if urlparse(r.url).hostname not in [urlparse(args.base).hostname, None] else None)
            page.add_init_script("""window.__auditLayoutShifts = []; new PerformanceObserver(list => {
              for (const entry of list.getEntries()) window.__auditLayoutShifts.push({value:entry.value, hadRecentInput:entry.hadRecentInput,
                sources:entry.sources.map(x => ({node:x.node?.tagName, className:x.node?.className, previousRect:x.previousRect.toJSON(), currentRect:x.currentRect.toJSON()}))});
            }).observe({type:'layout-shift', buffered:true});""")
            response = page.goto(args.base + route, wait_until='networkidle')
            page.evaluate('document.fonts.ready')
            raw = response.body()
            stem = route.strip('/').replace('/', '-') + '-' + profile
            (output / (stem + '.html')).write_bytes(raw)
            page.add_script_tag(path=args.axe)
            assert page.evaluate('axe.version') == args.axe_version, 'The supplied axe script must match the declared version.'
            axe = page.evaluate("""async () => await axe.run(document, {runOnly: {type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}})""")
            (output / (stem + '-axe.json')).write_text(json.dumps(axe, indent=2) + '\n')
            dom = page.evaluate("""() => {
              const meta = Object.fromEntries([...document.querySelectorAll('meta[name],meta[property]')].map(x=>[x.name || x.getAttribute('property'),x.content]));
              const schema = [...document.querySelectorAll('script[type="application/ld+json"]')].map(x=> {try{return {value:JSON.parse(x.textContent)}}catch(e){return {error:String(e)}}});
              const badTargets = [...document.querySelectorAll('a[href^="#"]')].filter(x=>x.hash.length>1 && !document.getElementById(decodeURIComponent(x.hash.slice(1)))).map(x=>x.hash);
              const h1 = [...document.querySelectorAll('h1')].map(x=>({text:x.textContent.trim(),font:getComputedStyle(x).fontFamily,weight:getComputedStyle(x).fontWeight,height:x.getBoundingClientRect().height}));
              return {title:document.title,meta,canonical:document.querySelector('link[rel="canonical"]')?.href,lang:document.documentElement.lang,
                h1,mainCount:document.querySelectorAll('main').length,schema,badAnchorTargets:badTargets,
                width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
                internalLinks:[...document.querySelectorAll('a[href]')].map(x=>x.href).filter(x=>new URL(x).origin===location.origin),
                fontFaces:[...document.fonts].map(x=>({family:x.family,weight:x.weight,status:x.status})),layoutShifts:window.__auditLayoutShifts};
            }""")
            page.keyboard.press('Tab')
            skip = page.evaluate("""() => ({text:document.activeElement.textContent.trim(),href:document.activeElement.getAttribute('href'),focusVisible:document.activeElement.matches(':focus-visible'),outline:getComputedStyle(document.activeElement).outline})""")
            page.keyboard.press('Enter')
            after_skip = page.evaluate("""() => ({tag:document.activeElement.tagName,id:document.activeElement.id,main:document.activeElement.closest('main')!==null})""")
            for selector in ['a[href="/developers"]', 'button', 'summary']:
                control = page.locator(selector).filter(visible=True).first
                if control.count():
                    control.focus()
                    dom.setdefault('focusSamples', []).append(control.evaluate("""x=>({tag:x.tagName,text:x.textContent.trim().slice(0,80),focusVisible:x.matches(':focus-visible'),outline:getComputedStyle(x).outline})"""))
            table_keyboard = []
            for table in page.locator('table.dev-table').all():
                dimensions = table.evaluate('x=>({clientWidth:x.clientWidth,scrollWidth:x.scrollWidth})')
                if dimensions['scrollWidth'] > dimensions['clientWidth'] + 1:
                    table.focus()
                    table.evaluate('x=>x.scrollLeft=0')
                    before = table.evaluate('x=>x.scrollLeft')
                    page.keyboard.press('ArrowRight')
                    page.evaluate('() => new Promise(resolve => setTimeout(resolve, 150))')
                    after = table.evaluate('x=>x.scrollLeft')
                    table_keyboard.append({'dimensions':dimensions,'focused':table.evaluate('x=>document.activeElement===x'),'before':before,'after':after,'moved':after>before})
            row = {'route': route, 'profile': profile, 'viewport': {'width': width, 'height': 900},
                   'status': response.status, 'body_sha256': hashlib.sha256(raw).hexdigest(), 'headers': response.all_headers(),
                   'axe_version': axe['testEngine']['version'], 'violations': [{'id':x['id'],'impact':x['impact'],'nodes':len(x['nodes'])} for x in axe['violations']],
                   'incomplete': [{'id':x['id'],'nodes':len(x['nodes'])} for x in axe['incomplete']], 'passes':len(axe['passes']),
                   'skip':skip, 'after_skip':after_skip, 'table_keyboard':table_keyboard, 'dom':dom, 'page_errors':errors, 'request_failures':failed_requests,
                   'console_errors':console_errors,'external_requests':external_requests}
            rows.append(row)
            page.screenshot(path=str(output/(stem+'.png')), full_page=True)
            print(json.dumps({'route':route,'profile':profile,'violations':row['violations'],'incomplete':row['incomplete'],
                              'overflow':dom['scrollWidth']>width,'skip':after_skip,'errors':errors}),flush=True)
            context.close()
    browser.close()

result = {'schema':'canli.developer-mcp-browser-baseline.v1','checked_at':datetime.now(timezone.utc).isoformat(),
          'base_url':args.base,'source_commit':args.source,'python':platform.python_version(),'browser':browser_version,
          'axe_script_sha256':hashlib.sha256(Path(args.axe).read_bytes()).hexdigest(),
          'scope':'Full DOM automated WCAG 2.2 A/AA and best-practice checks, retained manual/incomplete checks, sampled keyboard focus and widths. Not WCAG certification or an external rich-result decision.', 'rows':rows}
failures = []
for row in rows:
    dom = row['dom']
    defects = []
    if row['status'] != 200: defects.append('HTTP status')
    if dom['canonical'] != 'https://canlicapital.com' + row['route']: defects.append('canonical')
    if 'noindex' in dom['meta'].get('robots','').lower() or 'noindex' in row['headers'].get('x-robots-tag','').lower(): defects.append('canonical noindex')
    if len(dom['h1']) != 1 or dom['mainCount'] != 1 or not dom['lang']: defects.append('document semantics')
    if dom['scrollWidth'] > dom['width']: defects.append('horizontal overflow')
    if dom['badAnchorTargets']: defects.append('missing anchor targets')
    if any('error' in block for block in dom['schema']): defects.append('invalid JSON-LD')
    if row['violations']: defects.append('axe violations')
    if row['skip']['href'] != '#content' or not row['skip']['focusVisible'] or not row['after_skip']['main']: defects.append('skip keyboard focus')
    if any(not x['focused'] or not x['moved'] for x in row['table_keyboard']): defects.append('table keyboard scroll')
    if row['page_errors']: defects.append('page errors')
    if defects: failures.append({'route':row['route'],'profile':row['profile'],'defects':defects})
result['observed_failures'] = failures
(output/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
if args.check and failures:
    print(json.dumps({'observed_failures':failures}), file=sys.stderr)
    sys.exit(1)
