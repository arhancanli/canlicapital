"""Check enhanced page states rather than only their default renders."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/interactive-accessibility')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in [1440, 390]:
        page = browser.new_page(viewport={'width': width, 'height': 1000}, reduced_motion='reduce')
        for route in ['/developers', '/research']:
            page.goto('http://127.0.0.1:4188'+route, wait_until='networkidle')
            skip = page.locator('body > .skip-link, body > .dev-skip')
            assert skip.evaluate('e=>e.getBoundingClientRect().bottom < 0')
            skip.focus()
            page.wait_for_function("[...document.querySelectorAll('body > .skip-link, body > .dev-skip')].every(e=>e.getBoundingClientRect().top>=0)")
            assert skip.evaluate('e=>e.getBoundingClientRect().top >= 0')
            page.add_script_tag(path='artifacts/tooling/axe/package/axe.min.js')
            if route == '/developers':
                page.locator('.dev-language-tabs').evaluate_all("groups=>groups.forEach(g=>g.querySelectorAll('button')[1].click())")
            else:
                page.locator('#archive-query').fill('carry')
            violations = page.evaluate('''async()=> (await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))''')
            results.append({'route':route,'width':width,'violations':violations})
            print(route,width,violations,flush=True)
        page.close()
    browser.close()
(out/'report.json').write_text(json.dumps(results,indent=2)+'\n')
assert not any(r['violations'] for r in results)
