"""Isolated local startup observations, not field Web Vitals or Lighthouse."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--label',default='before');parser.add_argument('--throttle',action='store_true');args=parser.parse_args()
out=Path('artifacts/qa/phase8-release');out.mkdir(parents=True,exist_ok=True);rows=[]
routes=['/','/research','/developers','/research/forward-sharpe-evidence-standard','/publication/alphamax/v0.1.0']
if args.throttle:routes=['/','/developers','/research/forward-sharpe-evidence-standard']
init='''window.metrics={lcp:0,shifts:[],longTasks:[]};new PerformanceObserver(l=>l.getEntries().forEach(e=>metrics.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)metrics.shifts.push({time:e.startTime,value:e.value,nodes:e.sources.map(s=>s.node?.className||s.node?.tagName)})})).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>metrics.longTasks.push(e.duration))).observe({type:'longtask',buffered:true});'''
with sync_playwright() as p:
 b=p.chromium.launch()
 for route in routes:
  for width in ([390] if args.throttle else [1440,390]):
   for repeat in range(1 if args.throttle else 2):
    page=b.new_page(viewport={'width':width,'height':1000 if width==1440 else 844});page.add_init_script(init);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    if args.throttle:
     cdp=page.context.new_cdp_session(page);cdp.send('Emulation.setCPUThrottlingRate',{'rate':4});cdp.send('Network.enable');cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':150,'downloadThroughput':200000,'uploadThroughput':100000})
    page.goto('http://127.0.0.1:4188'+route,wait_until='domcontentloaded');page.wait_for_timeout(12000 if args.throttle else 4000)
    result=page.evaluate('''()=>({...metrics,resources:performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:r.transferSize,duration:r.duration})),fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),fontStatus:document.fonts.status})''')
    maxcls=0;start=last=score=0
    for s in result['shifts']:
     if s['time']-last>1000 or s['time']-start>5000:start=s['time'];score=0
     score+=s['value'];last=s['time'];maxcls=max(maxcls,score)
    result.update(route=route,width=width,repeat=repeat,cls=maxcls,errors=errors);rows.append(result);page.close()
    print(json.dumps({'route':route,'width':width,'repeat':repeat,'lcp':result['lcp'],'cls':maxcls}),flush=True)
 b.close()
(out/('startup-'+args.label+'.json')).write_text(json.dumps(rows,indent=2)+'\n')
