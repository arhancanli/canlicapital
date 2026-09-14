"""Capture every approved hub. Optional immutable source baseline, never overwritten."""
import argparse,json,re,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--label',required=True);parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
files=[Path(n+'.html') for n in ['systems','performance','research','methodology','measurements','verify','review','foundry']]+sorted(Path('research/topics').glob('*.html'))
root=Path('artifacts/qa/phase6-hubs');out=root/args.label;out.mkdir(parents=True,exist_ok=True)
if args.baseline:
    snapshot={}
    for file in files:
        source=file.read_text();main=re.search(r'<main\b[^>]*>([\s\S]*?)</main>',source).group(1)
        snapshot[str(file)]={'main':main,'sha256':hashlib.sha256(main.encode()).hexdigest()}
    with (root/'before.json').open('x') as handle:json.dump(snapshot,handle,indent=2)
rows=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for file in files:
        route='/'+str(file.with_suffix(''))
        for width in [1440,390]:
            page=browser.new_page(viewport={'width':width,'height':1000 if width==1440 else 844},reduced_motion='reduce')
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
            name=str(file.with_suffix('')).replace('/','-')+'-'+str(width)
            page.screenshot(path=str(out/(name+'-top.png')))
            main=page.locator('main');height=main.bounding_box()['height']
            page.evaluate('(y)=>scrollTo(0,y)',min(height*.55,5000));page.wait_for_timeout(150)
            page.screenshot(path=str(out/(name+'-middle.png')))
            rows.append({'route':route,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),'errors':errors,'headings':main.locator('h2').all_text_contents()})
            page.close()
    browser.close()
(out/'report.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'cases':len(rows),'issues':[r for r in rows if r['overflow'] or r['errors']]}))
