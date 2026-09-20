import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const script = new URL('./prepare-company-batch.mjs', import.meta.url);
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'company-batch-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name, value) => { const path = join(dir, name); writeFileSync(path, JSON.stringify(value)); return path; };
  const discovery = write('discovery.json', Object.fromEntries([1,2,3,4].map(n => [n, { cik_str: n }])));
  const delivery = write('delivery.json', { schema: 'canli.company-delivery.v1', files: [{ cik: '0000000001' }] });
  const prior = write('prior.json', ['0000000001','0000000002']);
  const ledger = write('ledger.json', { schema: 'canli.company-prior-queues.v1', queues: [{ path: prior, sha256: createHash('sha256').update(readFileSync(prior)).digest('hex') }] });
  const queue = join(dir, 'queue.json');
  const run = () => spawnSync(process.execPath, [script.pathname, discovery, delivery, queue, '1', ledger], { encoding: 'utf8' });
  return { write, prior, queue, run };
}
test('new batches skip all pinned prior attempts, not only accepted companies', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(f.queue)), ['0000000003']);
  const report = JSON.parse(result.stdout);
  assert.equal(report.discovered_prior_only_ciks_skipped, 1);
  assert.equal(report.remaining_unqueued_after_batch, 1);
  assert.equal(f.run().status, 0);
});
test('changed prior evidence fails without touching an existing queue', t => {
  const f = fixture(t); assert.equal(f.run().status, 0);
  const before = readFileSync(f.queue);
  writeFileSync(f.prior, '[]');
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(readFileSync(f.queue), before);
});
test('refuses replacing a different queue', t => {
  const f = fixture(t); writeFileSync(f.queue, '["0000000004"]');
  assert.notEqual(f.run().status, 0);
  assert.equal(readFileSync(f.queue, 'utf8'), '["0000000004"]');
});
