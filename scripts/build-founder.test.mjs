import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { forwardSnapshot } from './build-founder.mjs';

const evidence = JSON.parse(readFileSync(new URL('../public/glassbox/stanford_cs_evidence_map.json', import.meta.url)));
const bytes = readFileSync(new URL('../public/glassbox/forward_evidence_maturity.json', import.meta.url));

test('published zero-observation snapshot keeps its actual evidence dates', () => {
  const result = forwardSnapshot(evidence, bytes);
  const report = JSON.parse(bytes);
  assert.equal(result.generatedAt, report.generated_at);
  assert.equal(result.lastMark, report.record.last_mark);
  assert.equal(result.firstMark, report.record.first_mark);
});

test('a newer report cannot silently replace the evidence-map binding', () => {
  const newer = JSON.parse(bytes);
  newer.record.daily_return_observations += 5;
  assert.throws(() => forwardSnapshot(evidence, Buffer.from(JSON.stringify(newer))), /source binding mismatch/);
});

test('bound bytes still require agreement with narrative facts and valid dates', () => {
  for (const mutate of [
    r => { r.record.daily_return_observations += 1; },
    r => { r.sharpe_evidence.status = 'ESTABLISHED'; },
    r => { delete r.generated_at; },
    r => { r.record.first_mark = '2099-01-01'; },
  ]) {
    const report = JSON.parse(bytes);
    mutate(report);
    const changed = Buffer.from(JSON.stringify(report));
    const map = structuredClone(evidence);
    map.source_bindings.forward.sha256 = createHash('sha256').update(changed).digest('hex');
    assert.throws(() => forwardSnapshot(map, changed), /snapshot (facts mismatch|dates missing or invalid)/);
  }
});
