import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keyFromSeed } from '../../scripts/research/trade-journal/corpus.mjs';
import { createSession, toolJournal } from '../src/server.mjs';
import { PEM, syntheticAccountJournal } from './helpers/journal-account.mjs';

const NOW = () => new Date('2026-12-01T00:00:00.000Z');
function setup(t, count = 3) {
  const home = mkdtempSync(join(tmpdir(), 'canli-export-')); t.after(() => rmSync(home, { recursive: true, force: true }));
  const bytes = syntheticAccountJournal(count); writeFileSync(join(home, 'journal.jsonl'), bytes);
  const session = createSession({ home, now: NOW });
  return { home, bytes, run: async args => (await toolJournal(session, args)).structuredContent };
}

test('inline export preserves source bytes, is unsigned by default and binds the selected window', async t => {
  const { home, bytes, run } = setup(t);
  const result = await run({ action: 'export', from: 1, to: 3, strategy_id: 'synthetic-mcp', session_id: 'label-only' });
  assert.equal(result.inline, true); assert.equal(result.record.provenance.signed, false);
  assert.deepEqual(result.entry_range, { from: 1, to: 3 }); assert.equal(result.series.length, 2);
  assert.equal(result.metrics.cumulative_return, 0); assert.equal(result.record.generated_at, NOW().toISOString());
  assert.ok(bytes.equals(readFileSync(join(home, 'journal.jsonl'))));
  assert.deepEqual(readdirSync(home), ['journal.jsonl']);
  await assert.rejects(run({ action: 'verify', sign: true }), /export parameters/);
  await assert.rejects(run({ action: 'export', strategy_id: 'wrong' }), /does not match/);
});

test('record signing is explicit, requires a matching private 0600 key and never returns key material', async t => {
  const { home, run } = setup(t), path = join(home, 'journal.key');
  writeFileSync(path, PEM, { mode: 0o600 });
  const signed = await run({ action: 'export', sign: true });
  assert.equal(signed.record.provenance.signed, true); assert.equal(signed.signature.scheme, 'Ed25519');
  assert.doesNotMatch(JSON.stringify(signed), /PRIVATE KEY/);
  chmodSync(path, 0o644); await assert.rejects(run({ action: 'export', sign: true }), /0600/);
  chmodSync(path, 0o600);
  writeFileSync(path, keyFromSeed('synthetic other key').export({ type: 'pkcs8', format: 'pem' }));
  await assert.rejects(run({ action: 'export', sign: true }), /does not match genesis/);
  rmSync(path); symlinkSync(join(home, 'journal.jsonl'), path);
  await assert.rejects(run({ action: 'export', sign: true }), /cannot be opened/);
});

test('large exports create exclusive private files and return bounded summaries with exact hashes', async t => {
  const { home, bytes, run } = setup(t, 350);
  const first = await run({ action: 'export' }), second = await run({ action: 'export' });
  assert.equal(first.inline, false); assert.equal(first.record, undefined); assert.equal(first.series, undefined);
  assert.notEqual(first.record_file, second.record_file);
  const artifact = readFileSync(first.record_file);
  assert.equal(first.artifact_sha256, 'sha256:' + createHash('sha256').update(artifact).digest('hex'));
  assert.equal(first.artifact_bytes, artifact.length); assert.equal(JSON.parse(artifact).series.length, 350);
  assert.equal(statSync(first.record_file).mode & 0o777, 0o600); assert.equal(statSync(join(home, 'exports')).mode & 0o777, 0o700);
  assert.ok(JSON.stringify(first).length < 4000); assert.ok(bytes.equals(readFileSync(join(home, 'journal.jsonl'))));
  rmSync(join(home, 'exports'), { recursive: true }); symlinkSync(home, join(home, 'exports'));
  await assert.rejects(run({ action: 'export' }), /exports directory must be private/);
});
