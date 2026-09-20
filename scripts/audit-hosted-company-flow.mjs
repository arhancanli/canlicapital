import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [configPath, output] = process.argv.slice(2);
const raw = readFileSync(configPath);
const config = JSON.parse(raw);
const origin = new URL(config.origin);
assert.equal(origin.protocol, 'https:');
assert.equal(origin.origin, config.origin);
assert.match(config.cik, /^\d{10}$/);
const report = { schema: 'canli.hosted-company-flow.v1', config,
  config_sha256: createHash('sha256').update(raw).digest('hex'),
  code_sha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  runner: process.env.GITHUB_RUN_ID ?? 'local', commit: process.env.GITHUB_SHA ?? null,
  complete: false, steps: [], request_failures: [], page_errors: [],
  scope: 'One Chromium desktop navigation flow on the pinned noindex preview. No full-corpus, production or indexing claim.' };
writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
let browser;
try {
  browser = await chromium.launch({ headless: true });
  report.browser_version = browser.version();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => report.page_errors.push(e.message));
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    report.request_failures.push({ origin: url.origin, path: url.pathname,
      type: request.resourceType(), error: request.failure()?.errorText });
    save();
  });
  const inspect = async (response, path) => {
    assert.equal(response?.status(), 200);
    assert.match(response.headers()['x-robots-tag'] ?? '', /noindex/);
    assert.equal(await page.locator('h1').count(), 1);
    assert(await page.locator('h1').isVisible());
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://canlicapital.com' + path);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await page.locator('main.company-reference').evaluate(e => parseFloat(getComputedStyle(e).paddingTop) >= 100));
    for (const href of ['/developers#quickstart', '/developers#ai-assistant', 'https://github.com/arhancanli/alphac']) {
      assert(await page.locator(`a[href="${href}"]`).count());
    }
    report.steps.push({ path, status: 'PASS' }); save();
  };
  await inspect(await page.goto(config.origin + '/companies', { waitUntil: 'networkidle' }), '/companies');
  for (const path of [`/companies/${config.cik}`, `/companies/${config.cik}/Assets`]) {
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.locator(`main a[href="${path}"]`).first().click(),
    ]);
    await inspect(response, path);
  }
  assert(await page.locator(`main a[href="${config.selected_path}"]`).count());
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.locator('main a[href="/developers#quickstart"]').first().click(),
  ]);
  assert.equal(response?.status(), 200);
  assert(await page.locator('#quickstart').count());
  assert.deepEqual(report.page_errors, []);
  assert.deepEqual(report.request_failures, []);
  report.steps.push({ path: '/developers#quickstart', status: 'PASS' });
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = String(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  report.complete = true;
  save();
  console.log(JSON.stringify(report));
}
