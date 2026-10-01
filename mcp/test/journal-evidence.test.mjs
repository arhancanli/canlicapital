import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { genesisLine, nextLine } from '../src/local/js/trade-journal-core.js';
import { exportJournal, signJournalExport } from '../src/local/js/trade-journal-export-core.js';
import { createSession, toolValidatePaperEvidence } from '../src/server.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'canli-source-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { privateKey } = generateKeyPairSync('ed25519');
  const lines = [genesisLine({ privateKey, ts: '2026-01-01T00:00:00.000Z', payload: { account: { schema: 'canli.trade-journal.account.v0', strategy_id: 'synthetic validation', venue: 'local_sim', currency: 'USD', initial_cash: 1000, initial_positions: [], frequency: 'IRREGULAR' } } })];
  lines.push(nextLine({ privateKey, last: lines[0], kind: 'mark', ts: '2026-01-02T00:00:00.000Z', payload: { source: 'synthetic', marks: {} } }));
  const bytes = Buffer.from(lines.join('\n') + '\n'), journal_file = join(dir, 'source.jsonl'), record_file = join(dir, 'record.json');
  writeFileSync(journal_file, bytes);
  const bundle = exportJournal(bytes, { generated_at: '2026-01-03T00:00:00.000Z' });
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('network must not be used'); };
  const session = createSession({ local: true, fetchImpl, fullEnvelope: true });
  const run = async input => (await toolValidatePaperEvidence(session, input)).structuredContent;
  return { bytes, bundle, privateKey, journal_file, record_file, run, fetchImpl, calls: () => calls };
}

test('local validation binds full journal/range and claims, while source-free conformance stays explicit', async t => {
  const f = setup(t);
  const bound = await f.run({ record: f.bundle.record, journal_file: f.journal_file });
  assert.equal(bound.data.valid, true); assert.equal(bound.data.bindings.all_match, true);
  assert.equal(bound.receipt, null); assert.equal(bound.computed, 'locally'); assert.equal(f.calls(), 0);
  const shapeOnly = await f.run({ record: f.bundle.record });
  assert.equal(shapeOnly.data.valid, true); assert.equal(shapeOnly.data.bindings.checked, false);
  assert.match(shapeOnly.data.plain_reading, /No source journal or record signature was checked/);
  const altered = structuredClone(f.bundle.record); altered.returns.cumulative += 0.01;
  const mismatch = await f.run({ record: altered, journal_file: f.journal_file });
  assert.equal(mismatch.data.conformance_valid, true); assert.equal(mismatch.data.valid, false);
  assert.equal(mismatch.data.bindings.recomputed_matches.returns, false);
  const corrupt = Buffer.from(f.bytes); corrupt[corrupt.length - 10] ^= 1; writeFileSync(f.journal_file, corrupt);
  const bad = await f.run({ record: f.bundle.record, journal_file: f.journal_file });
  assert.equal(bad.data.bindings.chain_valid, false); assert.equal(bad.data.valid, false);
});

test('signed bundles verify the detached signature; deleting or tampering it fails', async t => {
  const f = setup(t), signed = signJournalExport(f.bundle, f.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  writeFileSync(f.record_file, JSON.stringify(signed));
  const valid = await f.run({ record_file: f.record_file, journal_file: f.journal_file });
  assert.equal(valid.data.bindings.record_signature_valid, true); assert.equal(valid.data.valid, true);
  assert.ok(Object.values(valid.data.bindings.bundle_matches).every(Boolean));
  const altered = structuredClone(signed); altered.metrics.fees_usd += 1;
  writeFileSync(f.record_file, JSON.stringify(altered));
  const badBundle = await f.run({ record_file: f.record_file, journal_file: f.journal_file });
  assert.equal(badBundle.data.bindings.record_signature_valid, true);
  assert.equal(badBundle.data.bindings.bundle_matches.metrics, false); assert.equal(badBundle.data.valid, false);
  writeFileSync(f.record_file, JSON.stringify(signed));
  const missing = await f.run({ record: signed.record, journal_file: f.journal_file });
  assert.equal(missing.data.bindings.record_signature_valid, false); assert.equal(missing.data.valid, false);
  const signature = { ...signed.signature, signature: Buffer.alloc(64).toString('base64') };
  const wrong = await f.run({ record: signed.record, signature, journal_file: f.journal_file });
  assert.equal(wrong.data.valid, false);
  await assert.rejects(f.run({ record_file: f.record_file, signature, journal_file: f.journal_file }), /not both/);
});

test('file and signature inputs cannot reach hosted or remote APIs, even with local enabled', async t => {
  const f = setup(t);
  for (const config of [{ local: false }, { local: true, hosted: { keySource: 'shared' } }]) {
    const session = createSession({ ...config, fetchImpl: f.fetchImpl });
    await assert.rejects(toolValidatePaperEvidence(session, { record_file: '/missing-private-file' }), /CANLI_LOCAL=1/);
    await assert.rejects(toolValidatePaperEvidence(session, { record: f.bundle.record, journal_file: '/missing-private-file' }), /never uploaded/);
  }
  assert.equal(f.calls(), 0);
  await assert.rejects(f.run({ record: f.bundle.record, record_file: f.record_file }), /exactly one/);
  writeFileSync(f.record_file, 'private-secret-invalid-json');
  await assert.rejects(f.run({ record_file: f.record_file }), { message: 'record file must contain valid UTF-8 JSON' });
  writeFileSync(f.record_file, JSON.stringify({ 'private-secret-key': 'private-secret-value' }));
  await assert.rejects(f.run({ record_file: f.record_file }), { message: 'record file must contain a canli.paper-evidence.v0 record or export bundle' });
  const invalid = await f.run({ record: {}, journal_file: '/not-read-for-a-malformed-record' });
  assert.equal(invalid.data.valid, false); assert.equal(invalid.data.bindings.checked, false);
});
