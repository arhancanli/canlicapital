"""Read-only archive checks against the built preview; never submits a form."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('artifacts/qa/research-archive')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine, width in [('chromium', 1440), ('webkit', 390)]:
        browser = getattr(p, engine).launch()
        page = browser.new_page(viewport={'width': width, 'height': 1000}, reduced_motion='reduce')
        page.goto('http://127.0.0.1:4188/research', wait_until='networkidle')
        query = page.locator('#archive-query')
        query.wait_for()
        items = page.locator('#researchLibraryList > li')
        total = items.count()
        source = page.request.get('http://127.0.0.1:4188/research-index.json').json()
        assert total == len(source['papers'])
        query.fill('carry')
        visible = page.locator('#researchLibraryList > li:not([hidden])')
        assert 0 < visible.count() < total
        assert all('carry' in text.lower() for text in visible.all_text_contents())
        query.fill('no-such-document-xyz')
        assert visible.count() == 0
        assert 'No matching documents' in page.locator('.archive-search__status').inner_text()
        page.get_by_role('button', name='Clear search', exact=True).click()
        assert visible.count() == total
        assert query.evaluate('e=>document.activeElement===e')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
        page.locator('#researchLibrary').evaluate('e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-90,behavior:"instant"})')
        page.screenshot(path=str(out / f'{engine}-{width}.png'))
        results.append({'browser': engine, 'width': width, 'documents': total, 'passed': True})
        browser.close()
(out / 'report.json').write_text(json.dumps(results, indent=2)+'\n')
print(json.dumps(results, indent=2))
