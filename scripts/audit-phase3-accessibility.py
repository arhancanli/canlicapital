"""Scoped axe checks for every Phase 3 section, including expanded content."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--origin',default='http://127.0.0.1:4188')
parser.add_argument('--axe',required=True)
args=parser.parse_args()
out=Path('artifacts/qa/phase3-publication/accessibility')
out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(1440,1000),(390,844),(720,500)]:
        page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
        page.route('**/api/waitlist',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"Unavailable"}'))
        page.goto(args.origin,wait_until='networkidle')
        page.locator('#record-details > summary').click()
        page.locator('.home-questions details').evaluate_all('nodes=>nodes.forEach(n=>n.open=true)')
        page.add_script_tag(path=args.axe)
        for selector in ['#live-record','#developer-api','#research','#evidence','#trust','.home-questions','#access','#footer','.offering','#evidence-core','#system-films','#method']:
            page.locator(selector).scroll_into_view_if_needed()
            page.wait_for_timeout(250)
            report=page.evaluate('''async selector=>{
              const r=await axe.run({include:[selector]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
              return {violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>v.id)};
            }''',selector)
            results.append({'width':width,'section':selector,**report})
        page.locator('#email').fill('phase3@example.invalid')
        page.locator('#waitlist-form button').click()
        page.wait_for_timeout(300)
        results.append({'width':width,'section':'form-error','violations':page.evaluate('''async()=> (await axe.run({include:['#waitlist-form']},{runOnly:{type:'tag',values:['wcag2aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)}))''')})
        page.close()
    browser.close()
(out/'report.json').write_text(json.dumps({'results':results,'limits':['Automated scoped checks, not WCAG certification. Manual assistive-technology release review remains.']},indent=2)+'\n')
failures=[r for r in results if r['violations']]
print(json.dumps({'states':len(results),'failures':failures},indent=2))
assert not failures
