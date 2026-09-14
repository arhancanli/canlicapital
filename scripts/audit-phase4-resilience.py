"""Bounded shell accessibility, native fallback and font-shift checks."""
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

out=Path('artifacts/qa/phase4-shell/resilience')
out.mkdir(parents=True,exist_ok=True)
origin='http://127.0.0.1:4188'
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(320,740),(390,844),(768,600),(1024,600),(1440,1000)]:
        page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
        page.goto(origin,wait_until='networkidle')
        page.add_script_tag(path='/tmp/canli-phase2-axe.min.js')
        for state,selector in [('closed','header'),('open','header'),('footer-open','footer')]:
            if state=='open':page.locator('.cc-shell__index > summary').click()
            if state=='footer-open':
                page.keyboard.press('Escape')
                page.locator('.cc-footer__context > summary').click()
            report=page.evaluate('''async selector=>{const r=await axe.run({include:[selector]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));}''',selector)
            results.append({'width':width,'state':state,'violations':report})
            page.screenshot(path=str(out/f'{width}-{state}.png'))
        page.close()
    native=[]
    for engine in ['chromium','webkit']:
        b=getattr(p,engine).launch()
        for width in [320,390,1440]:
            page=b.new_page(viewport={'width':width,'height':900},java_script_enabled=False)
            page.goto(origin+'/developers',wait_until='networkidle')
            page.locator('.cc-shell__index > summary').click()
            assert page.locator('.cc-shell__index').get_attribute('open') is not None
            assert page.locator('nav[aria-label="Tools"] a').count()>=3
            page.locator('.cc-shell__index > summary').click()
            page.locator('.cc-footer__context > summary').click()
            assert page.locator('.cc-handoff__steps a').count()==3
            assert page.locator('.cc-shell__cta').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(engine,width)
            native.append({'engine':engine,'width':width,'passed':True})
            page.close()
        b.close()
    shifts=[]
    for width,delay in [(1440,0),(1440,0),(1440,.3),(390,0),(390,.3)]:
        page=browser.new_page(viewport={'width':width,'height':1000})
        delayed_fonts=[]
        if delay:
            def delay_font(route):
                delayed_fonts.append(route.request.url.rsplit('/',1)[-1])
                time.sleep(delay)
                route.continue_()
            page.route('**/*.{woff2,ttf}',delay_font)
        page.add_init_script('''window.shifts=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)shifts.push({value:e.value,time:e.startTime,sources:e.sources.map(s=>({node:s.node?.className||s.node?.tagName,prev:s.previousRect,next:s.currentRect}))})})).observe({type:'layout-shift',buffered:true});''')
        page.goto(origin,wait_until='networkidle')
        page.wait_for_timeout(500)
        sample=page.evaluate('shifts')
        shifts.append({'width':width,'fontDelaySeconds':delay,'delayedFonts':delayed_fonts,'clsSum':sum(s['value'] for s in sample),'shifts':sample})
        # Preserved footer deep links must open the native disclosure.
        target=page.locator('.cc-footer__context h2').get_attribute('id')
        page.evaluate('(id)=>location.hash=id',target)
        page.wait_for_timeout(100)
        assert page.locator('.cc-footer__context').get_attribute('open') is not None
        page.close()
    browser.close()
report={'accessibility':results,'noJS':native,'startup':shifts,'limits':['Automated scoped accessibility only, not WCAG certification.','Local unthrottled CLS sums, not field measurements. Prior Phase 3 outlier remains retained.']}
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
failures=[r for r in results if r['violations']]
print(json.dumps({'axeStates':len(results),'failures':failures,'nativeCases':len(native),'clsSums':[s['clsSum'] for s in shifts]},indent=2))
assert not failures
