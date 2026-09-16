"""Local lab observations only: never claim real-user Core Web Vitals from this."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

results=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(1440,1000),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height})
        page.add_init_script('''window.__atlasPerf={lcp:0,cls:0,longTasks:[]};
        new PerformanceObserver(l=>l.getEntries().forEach(e=>__atlasPerf.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
        new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)__atlasPerf.cls+=e.value})).observe({type:'layout-shift',buffered:true});
        new PerformanceObserver(l=>l.getEntries().forEach(e=>__atlasPerf.longTasks.push(e.duration))).observe({type:'longtask',buffered:true});''')
        page.goto('http://127.0.0.1:4188',wait_until='networkidle')
        initial=page.evaluate('''()=>({...__atlasPerf,assets:performance.getEntriesByType('resource').filter(e=>e.name.includes('/cinema/atlas/')).map(e=>({url:new URL(e.name).pathname,bytes:e.transferSize})), totalResourceBytes:performance.getEntriesByType('resource').reduce((s,e)=>s+e.transferSize,0)})''')
        start=page.locator('#developer-api').evaluate('e=>e.getBoundingClientRect().top+scrollY-78')
        page.evaluate('y=>scrollTo({top:y,behavior:"instant"})',start)
        page.wait_for_timeout(700)
        timing=page.evaluate('''async({start,distance})=>{const values=[];let prior=performance.now();for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);const now=performance.now();values.push(now-prior);prior=now;scrollTo({top:start+distance*i/179,behavior:'instant'});}const a=values.slice(3).sort((a,b)=>a-b);return {medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],maxMs:Math.max(...a),framesOver50Ms:a.filter(v=>v>50).length}}''',{'start':start,'distance':height*2.8 if width>=1000 else 400})
        results.append({'viewport':[width,height],'initial':initial,'scroll':timing,'scope':'Local built preview, headless Chromium, no CPU/network throttle; not field metrics'})
        page.close()
    browser.close()
out=Path('artifacts/qa/phase3-publication/performance.json')
out.write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
