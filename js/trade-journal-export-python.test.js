import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { accountingCases, caseJournal } from '../scripts/research/trade-journal/export-corpus.mjs';
import { exportJournal } from './trade-journal-export-core.js';
import { conformance } from './paper-evidence-core.js';

test('1,000 signed synthetic journals agree with independent Python Decimal accounting to absolute 1e-12', () => {
  const reference = JSON.parse(gunzipSync(readFileSync(new URL('../mcp-execution/test/fixtures/journal-export-python.json.gz', import.meta.url))));
  const schema = JSON.parse(readFileSync(new URL('../standards/paper-evidence/schema.json', import.meta.url)));
  assert.equal(reference.case_count, 1000); assert.equal(Object.keys(reference.cases).length, 1000);
  let numeric = 0, maxError = 0, insolvencies = 0;
  function compare(actual, expected, path) {
    if (typeof expected === 'number') {
      const delta = Math.abs(actual - expected); numeric++; maxError = Math.max(delta, maxError);
      assert.ok(Number.isFinite(actual) && delta <= 1e-12, `${path}: ${actual} vs ${expected}; delta ${delta}`);
    } else if (expected !== null && typeof expected === 'object') {
      assert.ok(actual !== null && typeof actual === 'object', path);
      if (Array.isArray(expected)) assert.equal(actual.length, expected.length, path);
      for (const [key, value] of Object.entries(expected)) compare(actual[key], value, `${path}.${key}`);
    } else assert.equal(actual, expected, path);
  }
  for (const c of accountingCases()) {
    const bundle = exportJournal(caseJournal(c), c.options);
    compare({ ...bundle, frequency: bundle.record.period.frequency }, reference.cases[c.name], c.name);
    assert.equal(conformance(bundle.record, schema).valid, true, c.name);
    if (bundle.metrics.max_drawdown > 1) {
      insolvencies++; assert.ok(bundle.series.some(r => r.return === null));
      assert.equal(bundle.record.returns.sharpe_reportable, false);
    }
  }
  assert.equal(insolvencies, 5); assert.equal(numeric, 36192); assert.ok(maxError <= 1e-12);
});
