"""Focused Phase 2 browser checks; read-only, no API key issuance."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--origin', default='http://127.0.0.1:4187')
parser.add_argument('--label', default='dev')
args = parser.parse_args()
out = Path('artifacts/qa/phase2-atlas') / args.label
out.mkdir(parents=True, exist_ok=True)
results = []

def overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')

def loaded(page, selector):
    page.wait_for_function('(s) => [...document.querySelectorAll(s)].every(i => i.complete && i.naturalWidth > 0)', arg=selector)

with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.origin, wait_until='networkidle')
        page.wait_for_timeout(1000)
        loaded(page, '.cinema-hero__art img')
        page.screenshot(path=str(out / f'{engine}-hero.png'))
        for i in [0, 1, 2, 3, 2, 1, 0]:
            page.locator('.strategy-exhibition__controls button').nth(i).evaluate('e => e.click()')
            page.wait_for_timeout(850)
            assert page.locator('#sleeves').get_attribute('data-strategy-stage') == str(i)
            assert page.locator('.strategy-exhibition__controls [aria-current]').inner_text() == ['AlphaMax','AlphaTrend','AlphaVintage','AlphaForge'][i]
            row = page.locator('.sleeve-row').nth(i)
            loaded(page, f'.sleeve-row:nth-child({i+1}) .strategy-study img')
            box = row.bounding_box()
            assert abs(box['x']) < 2, (engine, i, box)
            desc, figure, metrics = [row.locator(s).bounding_box() for s in ['p', '.strategy-study', 'dl']]
            assert desc['y'] + desc['height'] <= figure['y'] + 1, (engine, i, 'description overlap')
            assert figure['y'] + figure['height'] <= metrics['y'] + 1, (engine, i, 'metrics overlap')
            assert metrics['y'] + metrics['height'] <= 935, (engine, i, 'metrics hidden')
            overflow(page)
            page.screenshot(path=str(out / f'{engine}-strategy-{i}.png'))
        page.locator('.strategy-exhibition__controls button').nth(3).focus()
        page.keyboard.press('Enter')
        page.wait_for_timeout(800)
        assert page.locator('#sleeves').get_attribute('data-strategy-stage') == '3'
        for i in [0, 1, 2, 1, 0]:
            page.locator('.process-controls button').nth(i).evaluate('e => e.click()')
            page.wait_for_timeout(850)
            assert page.locator('.cinema-process').get_attribute('data-process-stage') == str(i)
            chapter = page.locator('.cinema-process__chapter').nth(i)
            box = chapter.bounding_box()
            assert abs(box['x']) < 2, (engine, i, box)
            link = chapter.locator('a').bounding_box()
            assert 78 <= link['y'] and link['y'] + link['height'] <= 943, (engine, i, link)
            loaded(page, '.cinema-process__art img')
            overflow(page)
            page.screenshot(path=str(out / f'{engine}-process-{i}.png'))
        # Focusing an off-screen chapter must reveal its link, not strand it.
        page.locator('.cinema-process__chapter').nth(2).locator('a').focus()
        page.wait_for_timeout(800)
        assert page.locator('.cinema-process').get_attribute('data-process-stage') == '2'
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(600)
        assert page.locator('.strategy-exhibition, .process-controls').count() == 0
        assert page.locator('.strategy-study').count() == 4
        assert page.locator('.cinema-process.is-enhanced').count() == 0
        overflow(page)
        page.locator('#sleeves').scroll_into_view_if_needed()
        page.screenshot(path=str(out / f'{engine}-reduced.png'))
        page.set_viewport_size({'width': 390, 'height': 844})
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_timeout(600)
        assert page.locator('.strategy-exhibition, .process-controls').count() == 0
        overflow(page)
        for name, selector in [('hero','.cinema-hero'),('process','.cinema-process'),('max','.sleeve-row:nth-child(1)'),('trend','.sleeve-row:nth-child(2)'),('vintage','.sleeve-row:nth-child(3)'),('forge','.sleeve-row:nth-child(4)')]:
            node = page.locator(selector)
            node.scroll_into_view_if_needed()
            page.wait_for_timeout(350)
            node.screenshot(path=str(out / f'{engine}-mobile-{name}.png'))
            overflow(page)
        # Re-enter enhanced desktop mode; controls must not duplicate.
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.wait_for_timeout(650)
        assert page.locator('.strategy-exhibition__controls button').count() == 4
        assert page.locator('.process-controls button').count() == 3
        page.set_viewport_size({'width': 1280, 'height': 720})
        page.wait_for_timeout(500)
        assert page.locator('.strategy-exhibition').count() == 0
        overflow(page)
        assert not errors, errors
        page.close()
        # Static text must survive unavailable JavaScript and artwork.
        fallback = browser.new_page(viewport={'width':390,'height':844}, java_script_enabled=False)
        fallback.route('**/cinema/atlas/**', lambda route: route.abort())
        fallback.goto(args.origin, wait_until='networkidle')
        assert fallback.locator('.sleeve-row').count() == 4
        assert fallback.locator('.cinema-process__chapter a').count() == 3
        assert fallback.locator('#record-details').get_attribute('open') is None
        assert fallback.locator('#evidence-details').get_attribute('open') is not None
        overflow(fallback)
        fallback.screenshot(path=str(out / f'{engine}-nojs-failed-art.png'))
        fallback.close()
        results.append({'engine':engine,'passed':True,'checks':['hero image','four strategy stages and reverse','three process stages and reverse','description/art/metrics separation','keyboard activation and hidden-link focus','reduced motion','390px mobile','resize re-entry','short desktop','no-JS with failed images','no horizontal overflow','no page errors']})
        browser.close()
(out / 'report.json').write_text(json.dumps({'origin':args.origin,'results':results}, indent=2)+'\n')
print(json.dumps(results, indent=2))
