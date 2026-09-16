"""Phase 5 WCAG A/AA automation. Retain best-practice findings separately."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

routes=['/developers','/tools','/tools/deflated-sharpe','/tools/backtest-overfitting','/tools/selection-risk','/tools/execution','/tools/breadth','/tools/trial-accounting','/tools/evidence-chain']
rows=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for route in routes:
        page=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
        page.route('**/api/v1/keys',lambda r:r.abort())
        page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
        page.add_script_tag(path='/tmp/canli-phase2-axe.min.js')
        result=page.evaluate('async()=>await axe.run(document.querySelector("main"))')
        violations=[];advisories=[]
        for v in result['violations']:
            item={'id':v['id'],'nodes':[n['target'] for n in v['nodes']]}
            (violations if any(t.startswith('wcag') for t in v['tags']) else advisories).append(item)
        rows.append({'route':route,'violations':violations,'advisories':advisories})
        page.close()
    browser.close()
Path('artifacts/qa/phase5-developer/accessibility-final.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'routes':len(rows),'wcagViolations':sum(len(r['violations']) for r in rows),'advisories':sum(len(r['advisories']) for r in rows)}))
assert not any(r['violations'] for r in rows)
