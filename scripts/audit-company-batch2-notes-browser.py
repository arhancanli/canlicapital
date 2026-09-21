"""Browser checks for every registered batch2 note plus existing withheld notices."""
import hashlib
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

base, output = sys.argv[1:3]
paths = [
    ('/companies', None),
    ('/companies/page/67', None),
    ('/companies/0000059255/EarningsPerShareBasic', 'presentation-only EPS review'),
    ('/companies/0000065596/EarningsPerShareDiluted', 'Two diluted-share observations remain withheld'),
    ('/companies/0001417926', 'Both 2014 share counts remain withheld'),
    ('/companies/0001607962/EarningsPerShareBasic', 'six separate ILS-tagged EPS observations remain withheld'),
    ('/companies/0001425205', 'older Iovance weighted-average share observation'),
    ('/companies/0001433309/EarningsPerShareBasic', 'presentation-only review'),
]
ROOT = Path(__file__).resolve().parents[1]
registry_path = ROOT / 'config/company-basic-diluted-batch2-reviews.json'
registry_raw = registry_path.read_bytes()
registry = json.loads(registry_raw)
expected = {}
inputs = {str(registry_path.relative_to(ROOT)): hashlib.sha256(registry_raw).hexdigest()}
for entry in registry['reviews']:
    report_path = ROOT / 'artifacts/seo' / entry['report']
    raw = report_path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == entry['sha256']
    inputs[str(report_path.relative_to(ROOT))] = entry['sha256']
    decision = json.loads(raw)['decisions'][entry['decision_index']]
    assert decision['cik'] == entry['cik'] and decision['disposition'] == entry['disposition']
    assert 'PENDING' not in decision['disposition']
    for tag in [None, *sorted({row['tag'] for row in decision['selected_observations']})]:
        path = '/companies/' + decision['cik'] + ('/' + tag if tag else '')
        expected.setdefault(path, []).append((decision['reader_note'], decision['primary_capture']['url']))
paths.extend((path, None) for path in sorted(expected) if path not in {p for p, _ in paths})
for filename in ['scripts/lib/company-filing-notes.mjs', 'scripts/lib/company-page-renderer.mjs',
                 'scripts/lib/company-preview-server.mjs', 'api/_lib/company-release.js',
                 'api/_lib/company-html.js', 'dist/company-page-assets.json',
                 'artifacts/seo/corpus-local/company-five-cohort-delivery-v22/company-release.json']:
    inputs[filename] = hashlib.sha256((ROOT / filename).read_bytes()).hexdigest()

report = dict(schema='canli.v22-batch2-notes-browser.v1', publication_approved=False,
              inputs=inputs, registered_reviews=len(registry['reviews']), reviewed_note_paths=len(expected),
              scope='Every registered batch2 reader note on overview and its reviewed concept pages, plus representative Chromium/WebKit mobile/desktop layout, exact source notices, canonical/developer links and withheld-history 404s. Not whole-corpus, accessibility certification, load, hosted or indexing evidence.',
              code_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), checks=[], failures=[])
try:
    with sync_playwright() as playwright:
        for engine in ['chromium', 'webkit']:
            browser = getattr(playwright, engine).launch(headless=True)
            try:
                for width in [390, 1440]:
                    page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    for path, notice in paths:
                        response = page.goto(base + path, wait_until='networkidle')
                        assert response.status == 200, (engine, width, path, response.status)
                        assert response.headers['x-robots-tag'] == 'noindex'
                        assert page.locator('h1').count() == 1
                        assert page.locator('link[rel=canonical]').get_attribute('href') == 'https://canlicapital.com' + path
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (engine, width, path, 'horizontal overflow')
                        assert page.locator('h1').evaluate('(n) => getComputedStyle(n).fontSize') != '32px'
                        if notice:
                            assert notice in page.locator('main').inner_text(), (engine, width, path, notice)
                        for text, source_url in expected.get(path, []):
                            section = page.locator('section[aria-labelledby="filing-context"]')
                            assert section.count() == 1
                            assert text in section.inner_text(), (path, 'Missing exact reviewed note')
                            assert section.locator(f'a[href="{source_url}"]').count(), (path, 'Missing note source')
                        if path == '/companies/0001263364':
                            page.screenshot(path=f'/tmp/canli-batch2-idaho-{engine}-{width}.png', full_page=True)
                        for target in ['/developers#quickstart' , '/developers#ai-assistant', 'https://github.com/arhancanli/alphac']:
                            assert page.locator(f'a[href="{target}"]').count(), (path, target)
                        data = page.locator('script[type="application/ld+json"]').evaluate_all('(nodes) => nodes.flatMap(n => JSON.parse(n.textContent))')
                        crumbs = next(item for item in data if item['@type'] == 'BreadcrumbList')
                        assert crumbs['itemListElement'][-1]['item'] == 'https://canlicapital.com' + path
                        if engine == 'chromium' and path == '/companies/0001425205':
                            page.screenshot(path=f'/tmp/canli-v22-grouped-before-interaction-{width}.png', full_page=True)
                        if path == '/companies/0001425205':
                            groups = page.locator('#editorial-scope').locator('..').locator('details.company-reference__withheld')
                            assert groups.count() == 4
                            assert groups.locator('tbody tr').count() == 14
                            record = page.request.get(base + '/company-data/0001425205.json').json()
                            expected_withheld = sorted((r['observation'].get('start', 'At date'), r['observation']['end'], str(r['observation']['val']), r['observation']['unit'], r['observation']['accn'], r['filing_url']) for r in record['editorial_exclusions'])
                            actual = sorted(tuple(row.locator('td, th').all_text_contents()) + (row.locator('a').get_attribute('href'),) for row in groups.locator('tbody tr').all())
                            assert actual == expected_withheld, 'Withheld observation/source mismatch'
                            for group in groups.all():
                                summary = group.locator('summary')
                                summary.focus()
                                page.keyboard.press('Enter')
                                assert group.get_attribute('open') is not None
                                assert group.locator('tbody tr').first.is_visible()
                                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                                assert group.locator('a[href^="https://www.sec.gov/Archives/"]').count() == group.locator('tbody tr').count()
                                page.keyboard.press('Enter')
                                assert group.get_attribute('open') is None
                            page.screenshot(path=f'/tmp/canli-v22-grouped-iovance-{engine}-{width}.png', full_page=True)
                        report['checks'].append(dict(engine=engine, width=width, path=path, status='PASS', reviewed_notes=len(expected.get(path, []))))
                        if len(report['checks']) % 25 == 0: print(json.dumps(dict(completed=len(report['checks']))), flush=True)
                    for tag in ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']:
                        path = '/companies/0001425205/' + tag
                        response = page.goto(base + path, wait_until='networkidle')
                        assert response.status == 404, (path, response.status)
                        report['checks'].append(dict(engine=engine, width=width, path=path, status='PASS', http_status=404))
                    assert not errors, errors
                    page.close()
            finally:
                browser.close()
except Exception as error:
    report['failures'].append(str(error))
    raise
finally:
    for filename, digest in inputs.items():
        if hashlib.sha256((ROOT / filename).read_bytes()).hexdigest() != digest:
            report['failures'].append('Input changed during browser audit: ' + filename)
    with Path(output).open('x') as handle:
        handle.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps(dict(checks=len(report['checks']), failures=report['failures'])))

if report['failures']: sys.exit(1)
