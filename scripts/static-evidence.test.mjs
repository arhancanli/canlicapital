import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStaticEvidence } from './build-static-evidence.mjs';
import { parseHTML } from 'linkedom';

test('research has source-derived evidence and complete document rows before hydration', async () => {
  const html = readFileSync(new URL('../research.html', import.meta.url), 'utf8');
  const out = await renderStaticEvidence(html, 'js/research.js');
  const source = JSON.parse(readFileSync(new URL('../public/glassbox/research.json', import.meta.url)));
  const count = source.factor_research.kept_count + source.factor_research.killed_count;
  assert.match(out, new RegExp(`data-es="factors">${count}<`));
  assert.ok(out.includes(source.honesty_note.replace(/[\u2013\u2014]/g, ' - ')));
  assert.ok(out.includes('research-library__link'));
  assert.ok(!out.includes('class="archive-search"'), 'interactive search initializes its listeners in the browser');
  assert.equal(await renderStaticEvidence(out, 'js/research.js'), out, 'rendered evidence is stable on a repeated build');
});

test('a missing research source stops publication instead of filling a guessed value', async () => {
  const html = readFileSync(new URL('../research.html', import.meta.url), 'utf8');
  await assert.rejects(renderStaticEvidence(html, 'js/research.js', { readArtifact: () => { throw new Error('missing captured artifact'); } }), /research bind failed/);
});

// Rendering a calculator exercises the actual UI binder and its shared core.
test('the static DSR default agrees with the existing formula and keeps its illustration boundary', async () => {
  const html = readFileSync(new URL('../tools/deflated-sharpe.html', import.meta.url), 'utf8');
  const out = await renderStaticEvidence(html, 'js/dsr-tool.js');
  const config = JSON.parse(html.match(/<script[^>]*id="dsr-tool-config"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const {calculateDsr} = await import('../js/dsr-core.js');
  const value = calculateDsr(config.defaults).deflated_sharpe_ratio.toFixed(3);
  assert.ok(out.includes(`id="dsr-value">${value}<`));
  assert.ok(out.includes('Illustrative calculation'));
  assert.ok(!out.includes('id="dsr-value">...'));
});

test('execution table defaults carry the actual isolated-assumption sweep into their provenance', async () => {
  const html = readFileSync(new URL('../tools/execution.html', import.meta.url), 'utf8');
  const { document } = parseHTML(html);
  const read = id => Number(document.getElementById(id).value);
  const { sweepSeeds } = await import('../js/execution-core.js');
  const rows = sweepSeeds({ seeds: read('lab-seeds'), bars: 750, gapVolatility: 0.004,
    fast: read('lab-fast'), slow: read('lab-slow'), settings: {
      spreadBps: read('lab-spread'), delayBars: read('lab-delay'),
      impactBps: read('lab-impact'), outageRate: read('lab-outage'),
    } });
  let computed = [];
  const out = await renderStaticEvidence(html, 'js/execution-lab.js', {
    computedSelectors: ['#lab-classification'], onComputed: texts => { computed = texts; },
  });
  for (const row of rows) {
    assert.ok(out.includes(`<td>${row.mean.toFixed(4)}</td>`));
    assert.ok(computed.some(text => text.includes(row.mean.toFixed(4)) && text.includes(row.label)));
  }
});

test('all six published default artifacts reproduce through the actual browser binders', async () => {
  for (const [slug, entry] of [['deflated-sharpe','dsr-tool'],['breadth','breadth-lab'],
    ['execution','execution-lab'],['selection-risk','selection-risk-lab'],
    ['trial-accounting','trial-accounting-tool'],['backtest-overfitting','backtest-overfitting-tool']]) {
    const html = readFileSync(new URL(`../tools/${slug}.html`, import.meta.url), 'utf8');
    const artifact = JSON.parse(readFileSync(new URL(`../public/glassbox/calculator-defaults/${slug}.json`, import.meta.url)));
    let computed;
    await renderStaticEvidence(html, `js/${entry}.js`, { onComputed: texts => { computed = texts; },
      computedSelectors: entry === 'execution-lab' ? ['#lab-classification'] : [] });
    assert.deepEqual(computed, artifact.computed_text, slug);
  }
});
