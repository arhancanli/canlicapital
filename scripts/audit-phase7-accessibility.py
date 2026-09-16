"""Representative family accessibility, including trial hero outside main."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path('artifacts/qa/phase7-reader');sample=json.loads((root/'sample/report.json').read_text())['cases'];routes=sorted(set(r['route'] for r in sample));rows=[]
with sync_playwright() as p:
 b=p.chromium.launch()
 for route in routes:
  page=b.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
  page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle');page.add_script_tag(path='/tmp/canli-phase2-axe.min.js')
  result=page.evaluate('async()=>await axe.run({include:[["main"],[".trial-hero"]]})')
  rows.append({'route':route,'violations':[{'id':v['id'],'nodes':[{'target':n['target'],'summary':n.get('failureSummary')} for n in v['nodes']]} for v in result['violations'] if any(t.startswith('wcag') for t in v['tags'])]});page.close()
 b.close()
(root/'accessibility.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps([r for r in rows if r['violations']]))
