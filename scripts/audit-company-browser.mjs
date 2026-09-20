import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit } from 'playwright';
const origin = process.env.COMPANY_AUDIT_ORIGIN;
if (!origin || !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Set COMPANY_AUDIT_ORIGIN to a local production preview');
const output = 'artifacts/qa/company-reference';
mkdirSync(output, { recursive: true });
const report = [];
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  const browser = await launcher.launch();
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const path of ['/companies', '/companies/0000320193', '/companies/0000320193/Assets', '/companies/0000320193/Revenues', '/companies/0000025232', '/companies/0000025232/Assets', '/companies/0000029534', '/companies/0000029534/Assets', '/developers']) {
        const response = await page.goto(origin + path, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200);
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://canlicapital.com' + path);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engine} ${width} ${path} overflow`);
        if (path.startsWith('/companies')) {
          const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.flatMap(node => JSON.parse(node.textContent)));
          const breadcrumb = schemas.find(schema => schema['@type'] === 'BreadcrumbList');
          const current = breadcrumb.itemListElement.at(-1);
          assert.equal(current.item, 'https://canlicapital.com' + path);
          assert.equal(await page.locator('nav[aria-label=Breadcrumb] [aria-current=page]').count(), 1);
          const bytes = Buffer.byteLength(await response.text());
          assert.ok(bytes < 256 * 1024, 'Pilot reference document exceeds 256 KiB review budget');
        }
        if (path === '/companies/0000320193/Revenues') {
          assert.match(await page.locator('section[aria-labelledby=coverage]').innerText(), /2018-09-29/);
          assert.match(await page.locator('section[aria-labelledby=coverage]').innerText(), /ends more than two years before capture/);
          const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.flatMap(node => JSON.parse(node.textContent)));
          assert.match(schemas.find(schema => schema['@type'] === 'Dataset').temporalCoverage, /\/2018-09-29$/);
        }
        if (path === '/developers' || path.startsWith('/companies/')) {
          const prefix = path === '/developers' ? '' : '/developers';
          assert.ok(await page.locator(`a[href="${prefix}#quickstart"]`).count());
          assert.ok(await page.locator(`a[href="${prefix}#ai-assistant"]`).count());
          assert.ok(await page.locator('a[href="https://github.com/arhancanli/alphac"]').count());
        }
        if (engine === 'chromium') await page.screenshot({ path: `${output}/${width}-${path.slice(1).replaceAll('/', '-')}.png`, fullPage: true });
        report.push({ engine, width, path, status: 'PASS' });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
}
writeFileSync(`${output}/browser-report.json`, JSON.stringify({ checked_at: new Date().toISOString(), scope: 'Local production build; browser layout, canonical, breadcrumb and developer-link checks, not field performance or rankings', checks: report }, null, 2) + '\n');
console.log(`${report.length} browser checks passed`);
