"""Focused automated accessibility checks; not full conformance certification.

Provide a local axe-core 4.10.3 browser bundle with --axe. No dependencies installed.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--axe', required=True)
parser.add_argument('--origin', default='http://127.0.0.1:4188')
args = parser.parse_args()
out = Path('artifacts/qa/phase2-atlas/accessibility')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(1440,1000),(390,844),(720,500)]:
        page = browser.new_page(viewport={'width':width,'height':height})
        page.goto(args.origin, wait_until='networkidle')
        page.add_script_tag(path=args.axe)
        scenes = [('hero', '.cinema-hero', None), ('intro','.cinema-intro',None)]
        scenes += [(f'strategy-{i}',f'.sleeve-row:nth-child({i+1})',('.strategy-exhibition__controls button',i) if width == 1440 else None) for i in range(4)]
        scenes += [(f'process-{i}',f'.cinema-process__chapter:nth-child({i+1})',('.process-controls button',i) if width == 1440 else None) for i in range(3)]
        for name, selector, control in scenes:
            if control:
                page.locator(control[0]).nth(control[1]).evaluate('e => e.click()')
            else:
                page.locator(selector).scroll_into_view_if_needed()
            page.wait_for_timeout(650)
            report = page.evaluate('''async (selector) => {
                const r = await axe.run({include:[selector]}, {runOnly:{type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
                return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})), incomplete:r.incomplete.map(v=>v.id), passedRules:r.passes.length};
            }''', selector)
            results.append({'width':width,'height':height,'scene':name,**report})
        if width == 1440:
            sizes = page.locator('.strategy-exhibition__controls button,.process-controls button,.hero__actions a').evaluate_all('(nodes)=>nodes.map(n=>({text:n.textContent.trim(),w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}))')
            assert all(n['w']>=44 and n['h']>=44 for n in sizes), sizes
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
        page.close()
    browser.close()
report = {'origin':args.origin,'axeVersion':'4.10.3','results':results,
          'limits':['Automated checks only; VoiceOver and forced-colors manual checks remain for release review.', '720px reflow check is not a browser zoom certification.']}
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
failures = [r for r in results if r['violations']]
print(json.dumps({'states':len(results),'failures':failures},indent=2))
assert not failures
