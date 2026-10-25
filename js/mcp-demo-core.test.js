import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compact } from 'canli-quant-mcp/src/math.mjs';
import { TOOLS } from 'canli-quant-mcp/src/tools/strategies.mjs';

import { NOT_RECORDED, answer, answerBook, callKey, computeLocally, lastCall } from './mcp-demo-core.js';

const recorded = (id) => JSON.parse(readFileSync(new URL(`../public/demos/canli-mcp/${id}.json`, import.meta.url), 'utf8'));
const calls = (id) => JSON.parse(readFileSync(new URL(`../public/demos/canli-mcp/${id}-calls.json`, import.meta.url), 'utf8'));

test('a call is matched on its tool and arguments, not on its dates or on how it was asked', () => {
  assert.deepEqual(lastCall({ calls: [{ name: 'a', arguments: {} }, { name: 'b', arguments: { x: 1 } }] }), { name: 'b', arguments: { x: 1 } });
  assert.equal(callKey({ name: 'price_history', arguments: { symbol: 'SPY', start: '2024-10-25' }, digits: 6, view: true }), callKey({ calls: [{ name: 'price_history', arguments: { start: '2010-01-01', symbol: 'SPY' } }], return: 'last' }));
  assert.notEqual(callKey({ name: 'options_chain', arguments: { symbol: 'NVDA', expiration: '2026-11-20' } }), callKey({ name: 'options_chain', arguments: { symbol: 'NVDA' } }));
  assert.equal(callKey({}), null);
});

test('the recordings answer what the views ask, and anything else says it was not recorded', () => {
  const market = recorded('market'), book = answerBook(market, calls('market'));
  const tile = answer(book, { name: 'price_history', arguments: { symbol: '^GSPC', start: '2024-10-26' }, digits: 6, view: true });
  assert.ok(!tile.isError && tile.structuredContent.close.length > 400, 'a tile opens two years of its chart');
  assert.equal(answer(book, { name: 'market_overview', arguments: {}, digits: 6, view: true }).structuredContent.us.length, market.result.structuredContent.us.length, 'Refresh shows the recording again');
  const backtest = recorded('backtest'), spx = answer(answerBook(backtest, calls('backtest')), { name: 'price_history', arguments: { symbol: 'SPY', start: '2010-01-04', end: '2026-10-23' }, digits: 6, view: true });
  assert.ok(Array.isArray(spx.structuredContent.close) && spx.structuredContent.close.length > 4000, 'SPY beside the backtest comes whole');
  const miss = answer(book, { name: 'price_history', arguments: { symbol: 'ZZZZ' } });
  assert.equal(miss.isError, true);
  assert.equal(miss.content[0].text, NOT_RECORDED);
});

test('each recording is a view result: the model got a summary, the view the whole result', () => {
  const index = JSON.parse(readFileSync(new URL('../public/demos/canli-mcp/index.json', import.meta.url), 'utf8'));
  assert.deepEqual(index.demos.map((d) => d.id), ['market', 'curve', 'compare', 'statements', 'surface', 'chart', 'backtest']);
  for (const d of index.demos) {
    const r = recorded(d.id);
    assert.equal(r.input.view, true, d.id);
    assert.equal(r.result.content[0].text.length, d.model_chars, d.id);
    assert.equal(JSON.stringify(r.result.structuredContent).length, d.view_chars, d.id);
    assert.match(JSON.parse(r.result.content[0].text).viewed ?? '', /interactive view/, `${d.id}: the model's side is the summary`);
  }
});

test('a backtest slider reruns the quant pack in the browser, and at the recorded setting it gives the recorded answer', () => {
  const backtest = recorded('backtest'), book = answerBook(backtest, calls('backtest'));
  const again = (patch) => ({ calls: [backtest.input.calls[0], { ...backtest.input.calls[1], arguments: { ...backtest.input.calls[1].arguments, ...patch } }], return: 'last', digits: 6, view: true });
  const run = (input) => { const r = computeLocally(input, book, { tools: TOOLS, compact }); return r && !r.isError ? { ...r, structuredContent: r.structuredContent.results.at(-1).result } : r; };
  const same = run(again({ curve: true }));
  const was = backtest.result.structuredContent.results.at(-1).result;
  for (const k of ['total_return', 'cagr', 'sharpe', 'max_drawdown']) // The recorded prices carry 6 significant digits, the server's run carried all of them.
    assert.ok(Math.abs(same.structuredContent[k] - was[k]) <= 1e-4 * Math.max(1, Math.abs(was[k])), `${k}: ${same.structuredContent[k]} vs ${was[k]}`);
  assert.equal(same.structuredContent.curve.rows.length, was.curve.rows.length);
  const faster = run(again({ fast: 20, curve: true }));
  assert.ok(!faster.isError && faster.structuredContent.parameters.fast === 20 && faster.structuredContent.sharpe !== was.sharpe);
  const sweep = run({ calls: [backtest.input.calls[0], { name: 'strategy_sweep', arguments: { recipe: 'ma_crossover', arguments: { prices: { $result: 0, path: 'close' } }, grid: { fast: [20, 50], slow: [200] } } }], return: 'last', digits: 6 });
  assert.equal(sweep.structuredContent.combinations, 2, 'the luck check sweeps the settings tried');
  assert.ok(sweep.structuredContent.deflation);
  assert.equal(computeLocally({ name: 'price_history', arguments: { symbol: 'SPY' } }, book, { tools: TOOLS, compact }), null, 'not a quant tool');
  assert.equal(computeLocally(again({ fast: 0 }), book, { tools: TOOLS, compact }).isError, true, 'a bad setting is an error, as on the server');
});
