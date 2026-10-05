"""Check native scroll, all evidence states, and live reduced-motion cleanup."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = os.environ.get('REDESIGN_AUDIT_ORIGIN', 'http://127.0.0.1:4191').rstrip('/')
OUT = ROOT / 'artifacts/qa/october-redesign'

async def main():
 records = []
 async with async_playwright() as p:
  browser = await p.chromium.launch()
  for width in [1440, 390]:
   context = await browser.new_context(viewport={'width': width, 'height': 1000 if width == 1440 else 844}, reduced_motion='no-preference')
   page = await context.new_page()
   errors = []
   page.on('pageerror', lambda error: errors.append(str(error)))
   record = {'width': width, 'route': '/', 'flow': 'motion and reduced-motion change'}
   try:
    await page.goto(ORIGIN + '/', wait_until='networkidle')
    await page.evaluate('document.fonts.ready')
    if width == 1440:
     await page.wait_for_function("document.body.dataset.filmRenderer === 'webgl'")
     source = await context.request.get(ORIGIN + '/glassbox/trial_sharpe_distribution.json')
     assert source.ok
     identities = len((await source.json())['ranked'])
     assert int(await page.locator('body').get_attribute('data-film-identities')) == identities
     assert await page.locator('body').get_attribute('data-film-source') == '/glassbox/trial_sharpe_distribution.json'
     film_states = []
     for index, selector in enumerate(['.cinema-hero', '#vision', '#introduction']):
      await page.locator(selector).evaluate('e => scrollTo(0, e.getBoundingClientRect().top + scrollY - 88)')
      await page.wait_for_function('(n) => document.body.dataset.filmScene === String(n)', arg=index)
      film_states.append(index)
     record['archiveIdentities'] = identities
     record['filmStates'] = film_states
    else:
     assert await page.locator('body').get_attribute('data-film-renderer') == 'static'
    # The evidence renderer loads only when its chapter approaches the viewport.
    await page.locator('#evidence-core').evaluate('e => scrollTo(0, e.getBoundingClientRect().top + scrollY - 100)')
    if width == 1440:
     await page.wait_for_function("document.querySelector('#evidence-core').dataset.renderer === 'webgl'")
    else:
     await page.wait_for_function("document.querySelector('#evidence-core').dataset.renderer === 'static'")
     assert await page.locator('.core-chapters [data-core-chapter]').count() == 5
     assert await page.locator('.core-poster').is_visible(), 'The compact phone diagram must stay available'
     record['renderer'] = 'compact static diagram'
    await page.wait_for_function("document.querySelector('.cc-reading-progress') !== null")
    published = await page.locator('#metric-live-return').inner_text()
    await page.evaluate('scrollTo(0, 200)')
    await page.wait_for_timeout(300)
    assert abs(await page.evaluate('scrollY') - 200) <= 1, 'The page must preserve native scroll positions'
    if width == 1440:
     bounds = await page.locator('#evidence-core').evaluate('''e => {
      const pin=e.querySelector('.evidence-core__pin');
      return {start:e.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(pin).top),travel:e.offsetHeight-pin.offsetHeight};
     }''')
     assert bounds['travel'] > 2000, 'The full desktop chapter must have room for all five states'
     states = []
     for index in range(5):
      await page.evaluate('(y) => scrollTo(0, y)', bounds['start'] + bounds['travel'] * index / 4)
      await page.wait_for_timeout(250)
      state = await page.locator('[data-core-chapter].is-active').get_attribute('data-core-chapter')
      assert int(state) == index, f'Native scroll did not reach state {index}: {state}'
      states.append(state)
     record['scrollStates'] = states
     await page.screenshot(path=str(OUT / 'home-core-final-state.png'))
    record['step'] = 'reduced motion preference change'
    await page.emulate_media(reduced_motion='reduce')
    await page.wait_for_function("document.querySelector('.cc-reading-progress') === null")
    record['step'] = 'archive reduced motion cleanup'
    await page.wait_for_function("document.body.dataset.filmRenderer === 'static'")
    assert not await page.locator('#evidence-film-canvas').is_visible()
    if width == 1440:
     record['step'] = 'core reduced motion cleanup'
     await page.wait_for_function("document.querySelector('#evidence-core').dataset.motion === 'static'")
     assert await page.locator('[data-core-chapter].is-active').get_attribute('data-core-chapter') == '2'
    else:
     assert await page.locator('.core-poster').is_visible()
    assert await page.locator('#metric-live-return').inner_text() == published, 'Motion cannot alter a published value'
    assert await page.locator('.home-prism img').evaluate("e => getComputedStyle(e).transform") == 'none'
    assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
    assert not errors, errors
    record['pass'] = True
   except Exception as error:
    record.update({'pass': False, 'error': str(error), 'pageErrors': errors})
   records.append(record)
   await context.close()
  await browser.close()
 failures = [record for record in records if not record['pass']]
 (OUT / 'motion.json').write_text(json.dumps({'cases': len(records), 'failures': failures, 'results': records}, indent=2) + '\n')
 print(json.dumps({'cases': len(records), 'failures': failures}, indent=2))
 if failures: raise SystemExit(1)

if __name__ == '__main__': asyncio.run(main())
