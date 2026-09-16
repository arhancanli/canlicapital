"""Local production timing evidence; not a substitute for real-user metrics."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/cinematic-performance')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(1440, 1000), (390, 844)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page()
        page.add_init_script('''
          window.__perf = {longTasks:[],lcp:0,cls:0};
          new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__perf.longTasks.push(e.duration))).observe({type:'longtask',buffered:true});
          new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__perf.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
          new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__perf.cls+=e.value})).observe({type:'layout-shift',buffered:true});
        ''')
        page.goto('http://127.0.0.1:4188', wait_until='networkidle')
        initial = page.evaluate('''() => ({...window.__perf, resourceBytes:performance.getEntriesByType('resource').reduce((s,e)=>s+e.transferSize,0),
          sequenceFetches:performance.getEntriesByType('resource').filter(e=>e.name.includes('/instrument/')&&e.initiatorType==='fetch').length})''')
        # Warm the entry window then drive a repeatable 180-frame real scroll.
        start = page.locator('.cinema-process').evaluate('el=>el.getBoundingClientRect().top+scrollY-78')
        page.evaluate('(y)=>scrollTo({top:y,behavior:"instant"})', start)
        page.wait_for_timeout(700)
        timing = page.evaluate('''async ({start, distance}) => {
          const intervals=[],sequenceFrames=new Set(); let prior=performance.now();
          for(let i=0;i<180;i++){
            await new Promise(requestAnimationFrame);
            const now=performance.now();intervals.push(now-prior);prior=now;
            scrollTo({top:start+distance*i/179,behavior:'instant'});
            sequenceFrames.add(document.querySelector('[data-instrument-sequence]').dataset.sequenceFrame);
          }
          const sorted=intervals.slice(3).sort((a,b)=>a-b);
          return {medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],
            maxMs:Math.max(...sorted),over50ms:sorted.filter(v=>v>50).length,distinctSequenceFrames:[...sequenceFrames].filter(Boolean).length};
        }''', {'start': start, 'distance': height * 2.1 if width >= 1000 else 280})
        assert initial['sequenceFetches'] == 0
        assert timing['distinctSequenceFrames'] > 10
        results.append({'viewport': [width, height], 'initial': initial, 'scroll': timing,
                        'scope': 'Local production preview, headless Chromium, warm entry frames; no network/CPU throttle'})
        context.close()
    browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
