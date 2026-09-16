import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out=Path('artifacts/qa/full-site-motion')
routes=['/tools/selection-risk','/tools/breadth','/tools/execution','/tools/trial-accounting','/tools/backtest-overfitting',
 '/founder','/engineering','/foundry','/review','/costs','/standards/paper-evidence','/how-to-validate-a-backtest',
 '/notes/one-symbol','/publication/alphamax/v0.1.0','/trials/df2ff29afd9fcdb8','/research/topics/momentum']
results=[]
with sync_playwright() as p:
    browser=p.webkit.launch()
    for width in [1440,390]:
        for route in routes:
            page=browser.new_page(viewport={'width':width,'height':1000},reduced_motion='reduce')
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            response=page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
            page.evaluate('document.fonts.ready')
            failures=[]
            if response.status!=200: failures.append('HTTP '+str(response.status))
            # Trial packets intentionally place their hero before the main article.
            if page.locator('h1').count()!=1: failures.append('heading')
            if page.locator('.cc-handoff').count()!=1: failures.append('shared carrying scene')
            if not page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'): failures.append('overflow')
            if errors: failures.extend(errors)
            if failures: page.screenshot(path=str(out/('family-failure-'+str(width)+'-'+route.replace('/','-')+'.png')))
            results.append({'width':width,'route':route,'failures':failures})
            page.close()
        (out/'remaining-families.json').write_text(json.dumps(results,indent=2)+'\n')
    browser.close()
print(json.dumps({'cases':len(results),'failures':[r for r in results if r['failures']]},indent=2))
assert all(not r['failures'] for r in results)
