"""Verify the actual carried-packet geometry, controls and fallback rendering."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/full-site-motion/handoff')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine, width, reduced, javascript in [('chromium',1440,False,True), ('webkit',1440,False,True), ('webkit',390,False,True), ('webkit',390,True,True), ('chromium',320,True,False)]:
        browser = getattr(p, engine).launch()
        context = browser.new_context(viewport={'width':width,'height':1000 if width>1000 else 844}, reduced_motion='reduce' if reduced else 'no-preference', java_script_enabled=javascript)
        for route in ['/', '/developers', '/research/crypto-carry-portable-v1', '/tools/deflated-sharpe']:
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:4188'+route,wait_until='networkidle')
            page.evaluate('document.fonts.ready')
            root = page.locator('.cc-handoff')
            assert root.count() == 1
            assert page.locator('#cc-handoff-title').count() == 1
            positions = []
            for phase in [0, .5, 1]:
                if width > 1000 and not reduced:
                    target = root.evaluate('(e,p)=>e.getBoundingClientRect().top+scrollY-78 + p*(e.offsetHeight-innerHeight+78)', phase)
                elif not reduced:
                    target = page.locator('.cc-handoff__stage').evaluate('(e,p)=>e.getBoundingClientRect().top+scrollY-innerHeight*.85+p*(e.offsetHeight+innerHeight*.6)', phase)
                else:
                    target = root.evaluate('e=>e.getBoundingClientRect().top+scrollY-78')
                page.evaluate('y=>scrollTo({top:y,behavior:"instant"})',target)
                page.wait_for_timeout(1000)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), (engine,width,route)
                positions.append(page.locator('.cc-handoff__packet').evaluate('e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})'))
                if route == '/':
                    page.screenshot(path=str(out / f'{engine}-{width}-{int(reduced)}-{int(javascript)}-{phase}.png'))
                if reduced: break
            if not reduced:
                assert positions[-1]['x'] > positions[0]['x'] + width*.4, positions
                assert root.get_attribute('data-handoff-phase') == '2'
            for href in ['/research', '/developers#validation', '/verify']:
                assert root.locator(f'a[href="{href}"]').count() == 1
            if width > 1000 and not reduced:
                root.locator('[data-handoff-step="0"]').focus()
                page.wait_for_timeout(700)
                assert root.get_attribute('data-handoff-phase') == '0'
            assert not errors, errors
            results.append({'engine':engine,'width':width,'reduced':reduced,'javascript':javascript,'route':route,'positions':positions,'passed':True})
            page.close()
            (out/'report.json').write_text(json.dumps(results,indent=2)+'\n')
        context.close()
        browser.close()
print(f'{len(results)} carrying-sequence cases passed.')
