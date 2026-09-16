"""Automated WCAG checks on representative production routes; manual QA remains."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

origin = os.environ.get('HOMEPAGE_AUDIT_ORIGIN', 'http://127.0.0.1:4187')
out = Path('artifacts/qa/cinematic-accessibility')
out.mkdir(parents=True, exist_ok=True)
axe = Path('artifacts/tooling/axe/package/axe.min.js')
assert axe.is_file(), 'Download/extract axe-core 4.10.3 into artifacts/tooling/axe first'
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in [1440, 390]:
        for route in ['/', '/developers', '/systems', '/research', '/performance', '/tools/selection-risk', '/methodology']:
            context = browser.new_context(viewport={'width': width, 'height': 1000 if width == 1440 else 844}, reduced_motion='reduce')
            page = context.new_page()
            page.goto(origin + route, wait_until='networkidle')
            awaitable = page.evaluate('document.fonts.ready.then(()=>true)')
            page.add_script_tag(path=str(axe))
            audit = page.evaluate('''async () => {
              const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
              return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,
                nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary,html:n.html}))})),
                incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length})),passes:r.passes.length};
            }''')
            results.append({'route': route, 'width': width, **audit})
            print(route, width, [(v['id'],len(v['nodes'])) for v in audit['violations']], flush=True)
            context.close()
    browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
count = sum(len(r['violations']) for r in results)
print(f'{len(results)} views; {count} violation groups; manual checks not certified by automation')
raise SystemExit(1 if count else 0)
