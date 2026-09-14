"""Bounded startup layout-shift investigation; retain every sample."""
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

results=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for delay in [0,0,0,.2]:
        page=browser.new_page(viewport={'width':1440,'height':1000})
        if delay:
            def font_route(route):
                time.sleep(delay)
                route.continue_()
            page.route('**/*.woff2',font_route)
        page.add_init_script('''window.shifts=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)shifts.push({value:e.value,time:e.startTime,sources:e.sources.map(s=>({node:s.node?.className||s.node?.tagName,prev:s.previousRect,next:s.currentRect}))})})).observe({type:'layout-shift',buffered:true});''')
        page.goto('http://127.0.0.1:4188',wait_until='networkidle')
        page.wait_for_timeout(300)
        shifts=page.evaluate('shifts')
        results.append({'fontDelaySeconds':delay,'clsSum':sum(s['value'] for s in shifts),'shifts':shifts})
        page.close()
    browser.close()
out=Path('artifacts/qa/phase3-publication/startup-trace.json')
out.write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
