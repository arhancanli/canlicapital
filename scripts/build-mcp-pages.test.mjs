import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releasedCatalog, serverPage, directoryPage } from './build-mcp-pages.mjs';
import { inspectHtml } from './audit-live-seo.mjs';
import { jsonLdProblems } from './lib/jsonld-rules.mjs';

test('MCP discovery follows the hosted release pins and includes the complete registered tool set', () => {
  const catalog = releasedCatalog();
  const pins = JSON.parse(readFileSync(new URL('../config/mcp-hosted-releases.json', import.meta.url))).servers;
  assert.deepEqual(catalog.map(s => s.id).sort(), Object.keys(pins).sort());
  for (const s of catalog) {
    const manifest = JSON.parse(readFileSync(new URL(`../mcp-released/${s.id}/RELEASE.json`, import.meta.url)));
    assert.equal(s.commit, manifest.commit);
    assert.equal(s.version, manifest.version);
    assert.equal(s.package, manifest.package);
    const html = serverPage(s, catalog);
    for (const tool of s.tools) assert.ok(html.includes(`<code>${tool.name}</code>`), `${s.id}: ${tool.name}`);
    assert.ok(html.includes(`${s.commit}/${s.dir}`));
    assert.ok(html.includes(`https://canlicapital.com${s.endpoint}`));
    assert.ok(html.includes('npm package</a> can have a different version'));
  }
});

test('every MCP answer has its own metadata, canonical, crawlable siblings and honest application markup', () => {
  const catalog = releasedCatalog();
  const pages = [{ route: '/mcp-servers', html: directoryPage(catalog) }, ...catalog.map(s => ({ route: s.route, html: serverPage(s, catalog) }))];
  const titles = new Set(), descriptions = new Set();
  for (const { route, html } of pages) {
    const meta = inspectHtml(html, `https://canlicapital.com${route}`);
    assert.equal(meta.canonical, meta.requested_url);
    assert.equal(meta.h1.length, 1);
    assert.match(meta.robots, /^index, follow/);
    assert.ok(meta.description.length >= 140 && meta.description.length <= 160);
    titles.add(meta.title); descriptions.add(meta.description);
    for (const s of catalog) assert.ok(html.includes(`href="${s.route}"`));
    assert.deepEqual(jsonLdProblems(html), []);
    assert.doesNotMatch(html, /aggregateRating|reviewRating/);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const app = ld.find(node => node['@type'] === 'SoftwareApplication');
    if (app) {
      assert.equal(app.url, meta.canonical);
      assert.equal(app.offers.price, '0');
    }
  }
  assert.equal(titles.size, pages.length); assert.equal(descriptions.size, pages.length);
});

test('each question page answers in its first paragraph, shows the recorded result and marks up one FAQ', async () => {
  const { loadAnswers, answerPage, answersIndexPage } = await import('./build-mcp-pages.mjs');
  const answers = loadAnswers();
  assert.ok(answers.length >= 20);
  const h2h = JSON.parse(readFileSync(new URL('../public/benchmarks/finance-mcp-servers.json', import.meta.url), 'utf8'));
  const flagship = { ...h2h.flagship, views: JSON.parse(readFileSync(new URL('../config/canli-mcp.json', import.meta.url), 'utf8')).views };
  const titles = new Set(), descriptions = new Set();
  for (const a of answers) {
    const html = answerPage(a, answers, { flagship });
    const meta = inspectHtml(html, `https://canlicapital.com${a.route}`);
    assert.equal(meta.canonical, meta.requested_url, a.slug);
    assert.deepEqual(meta.h1.map((h) => h.replaceAll('&#39;', "'")), [a.question], a.slug);
    assert.match(meta.robots, /^index, follow/);
    assert.ok(meta.description.length >= 100 && meta.description.length <= 160, `${a.slug}: description ${meta.description.length}`);
    titles.add(meta.title); descriptions.add(meta.description);
    assert.deepEqual(jsonLdProblems(html), [], a.slug);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const faq = ld.find((n) => n['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, 1);
    assert.equal(faq.mainEntity[0].name, a.question);
    assert.equal(faq.mainEntity[0].acceptedAnswer.text, a.answer);
    assert.ok(html.includes(`canli-mcp ${a.recorded.version} on ${a.recorded.recorded.slice(0, 10)}`), `${a.slug}: says what was recorded and when`);
    for (const slug of a.related) assert.ok(html.includes(`href="/mcp-servers/answers/${slug}"`), `${a.slug} links ${slug}`);
    const cursor = new URL(html.match(/href="(cursor:[^"]+)"/)[1].replaceAll('&amp;', '&'));
    assert.deepEqual(JSON.parse(Buffer.from(cursor.searchParams.get('config'), 'base64').toString('utf8')), { command: 'npx', args: ['-y', 'canli-mcp'] });
    assert.equal(html.includes('data-mcp-demo'), Boolean(a.demo), `${a.slug}: a view only where one was recorded`);
  }
  assert.equal(titles.size, answers.length); assert.equal(descriptions.size, answers.length);
  const index = answersIndexPage(answers, { flagship });
  for (const a of answers) assert.ok(index.includes(`href="${a.route}"`));
  assert.ok(directoryPage(releasedCatalog(), { answers }).includes('href="/mcp-servers/answers"'), 'the flagship page links the questions');
});
