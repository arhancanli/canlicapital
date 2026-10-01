// Independent synthetic peer probes against frozen PR344. No broker/model/network calls.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { genesisLine, nextLine } from '../../js/trade-journal-core.js';
import { exportJournal, journalBindings, signJournalExport } from '../../js/trade-journal-export-core.js';
import { validateLocalJournalEvidence } from '../../mcp/src/journal-evidence.mjs';
import { storeExport } from '../../mcp-execution/src/journal-export-file.mjs';


// Read back bounded synthetic evidence through one descriptor. No pathname check/read pair.
function observeFile(path) {
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const metadata = fs.fstatSync(fd);
    assert(metadata.isFile() && metadata.size <= 16 * 1024, 'synthetic observation size/type');
    const data = Buffer.alloc(metadata.size + 1);
    const count = fs.readSync(fd, data, 0, data.length, 0);
    assert.equal(count, metadata.size, 'synthetic observation length');
    return { mode: metadata.mode & 0o777, data: data.subarray(0, count) };
  } finally { fs.closeSync(fd); }
}
function observedBytesEqual(path, expected) {
  if (!path) return false;
  try { return observeFile(path).data.equals(expected); } catch { return false; }
}
const observerTemp = fs.mkdtempSync(join(tmpdir(), 'canli-fd-observer-'));
const observerContracts = {};
try {
  const target = join(observerTemp, 'target');
  const original = Buffer.from('synthetic original descriptor');
  fs.writeFileSync(target, original, { mode: 0o600, flag: 'wx' });
  const originalRead = fs.readSync;
  let replaced = false;
  fs.readSync = function(fd, ...args) {
    if (!replaced) {
      fs.renameSync(target, target + '.opened');
      fs.writeFileSync(target, Buffer.from('synthetic replacement'), { mode: 0o600, flag: 'wx' });
      replaced = true;
    }
    return originalRead.call(fs, fd, ...args);
  };
  try { assert.equal(observeFile(target).data.equals(original), true); }
  finally { fs.readSync = originalRead; }
  observerContracts.pathname_replacement_reads_original_descriptor = replaced;
  const link = join(observerTemp, 'link'); fs.symlinkSync(target, link);
  assert.throws(() => observeFile(link)); observerContracts.final_symlink_refused = true;
  const large = join(observerTemp, 'large'); fs.writeFileSync(large, Buffer.alloc(16 * 1024 + 1), { mode: 0o600, flag: 'wx' });
  assert.throws(() => observeFile(large)); observerContracts.oversized_observation_refused = true;
} finally { fs.rmSync(observerTemp, { recursive: true, force: true }); }

const { privateKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
const generated_at = '2026-01-06T00:00:00.000Z';
const account = { schema: 'canli.trade-journal.account.v0', strategy_id: 'synthetic peer probes', venue: 'local_sim', currency: 'USD', initial_cash: 1000, initial_positions: [{ symbol: 'X', qty: 1, price: 100 }], frequency: 'DAILY', periods_per_year: 365 };
const events = [
  ['mark', { marks: { X: 110 }, source: 'synthetic' }, '2026-01-02T00:00:00.000Z'],
  ['mark', { marks: { X: 115 }, source: 'synthetic' }, '2026-01-03T00:00:00.000Z'],
  ['mark', { marks: { X: 120 }, source: 'synthetic' }, '2026-01-04T00:00:00.000Z'],
];
function journal(a = account, e = events) {
  const lines = [genesisLine({ privateKey, ts: '2026-01-01T00:00:00.000Z', payload: { account: a } })];
  for (const [kind, payload, ts] of e) lines.push(nextLine({ last: lines.at(-1), privateKey, kind, payload, ts }));
  return Buffer.from(lines.join('\n') + '\n');
}
const bytes = journal(), bundle = exportJournal(bytes, { generated_at });
assert.equal(journalBindings(bundle.record, bytes, undefined, bundle).all_match, true);
const leaves = [];
function walk(value, path = []) {
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
  else leaves.push({ path, value });
}
for (const field of ['capital', 'identity', 'period', 'returns', 'costs', 'selection', 'risk', 'corrections', 'provenance', 'claim_maturity', 'notes']) walk(bundle.record[field], [field]);
let refused = 0;
for (const { path, value } of leaves) {
  const changed = structuredClone(bundle.record);
  let parent = changed;
  for (const key of path.slice(0, -1)) parent = parent[key];
  parent[path.at(-1)] = typeof value === 'number' ? value + 1 : typeof value === 'boolean' ? !value : value === null ? 1 : value + ' altered';
  try { assert.equal(journalBindings(changed, bytes).all_match, false, path.join('.')); }
  catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
  refused++;
}
let companions = 0;
for (const field of ['journal_sha256', 'head', 'entry_range', 'metrics', 'series', 'journal_public_key']) {
  const changed = structuredClone(bundle); changed[field] = null;
  assert.equal(journalBindings(changed.record, bytes, undefined, changed).all_match, false, field);
  companions++;
}
const signed = signJournalExport(bundle, pem);
assert.equal(journalBindings(signed.record, bytes, signed.signature, signed).all_match, true);
assert.equal(journalBindings(signed.record, bytes).all_match, false);
assert.equal(journalBindings(signed.record, bytes, { ...signed.signature, signature: Buffer.alloc(64).toString('base64') }).all_match, false);
const selected = exportJournal(bytes, { from: 1, to: 2, generated_at });
assert.equal(journalBindings(selected.record, bytes, undefined, selected).all_match, true);
assert.equal(selected.metrics.opening_equity, 1110);
assert.equal(selected.metrics.closing_equity, 1115);
const alteredScope = structuredClone(selected.record); alteredScope.provenance.source_bindings[1].path = 'journal/range/1/3';
assert.equal(journalBindings(alteredScope, bytes).all_match, false);
const corruptedTail = Buffer.from(bytes); corruptedTail[corruptedTail.length - 10] ^= 1;
assert.equal(journalBindings(selected.record, corruptedTail).all_match, false);
const missingMarks = structuredClone(events); missingMarks[0][1].marks = {};
assert.throws(() => exportJournal(journal(account, missingMarks)), /missing mark/);
assert.throws(() => exportJournal(bytes, { generated_at: '2026-01-03T12:00:00.000Z' }), /precedes/);
assert.match(bundle.record.capital.notes, /broker authenticity not established/);
assert.equal(bundle.record.provenance.independently_verifiable, false);
assert.equal(bundle.record.claim_maturity.external_review_count, 0);
assert.equal(bundle.record.selection.trials_counted, false);

const temp = fs.mkdtempSync(join(tmpdir(), 'canli-peer-review-'));
const observations = {};
try {
  const journalFile = join(temp, 'journal.jsonl'); fs.writeFileSync(journalFile, bytes);
  const validated = validateLocalJournalEvidence({ record: bundle.record, journal_file: journalFile });
  assert.equal(validated.envelope.data.valid, true); assert.equal(validated.envelope.receipt, null);
  const shape = validateLocalJournalEvidence({ record: signed.record });
  assert.equal(shape.envelope.data.bindings.checked, false);
  assert.match(shape.envelope.data.plain_reading, /No source journal or record signature was checked/);

  // A valid, finite declared periods_per_year can make the new bundle nonfinite.
  const tinyBytes = journal({ ...account, periods_per_year: 1e-309 });
  try {
    const tiny = exportJournal(tinyBytes, { generated_at });
    const finiteYears = Number.isFinite(tiny.metrics.min_track_record?.years);
    const roundtrip = JSON.parse(JSON.stringify(tiny));
    observations.minimum_track_record = {
      operation_accepted: true,
      periods_per_year: 1e-309,
      observations: tiny.metrics.min_track_record?.observations,
      years_finite: finiteYears,
      years_text: String(tiny.metrics.min_track_record?.years),
      json_years: roundtrip.metrics.min_track_record?.years,
      own_raw_bundle_matches: journalBindings(tiny.record, tinyBytes, undefined, tiny).all_match,
      own_json_bundle_matches: journalBindings(roundtrip.record, tinyBytes, undefined, roundtrip).all_match,
    };
  } catch (error) { observations.minimum_track_record = { operation_accepted: false, error: error.message, periods_per_year: 1e-309 }; }

  // Swap a checked directory before open: O_NOFOLLOW only protects the final file.
  const home = join(temp, 'home'), foreign = join(temp, 'foreign');
  fs.mkdirSync(home, { mode: 0o700 }); fs.mkdirSync(foreign, { mode: 0o700 });
  const exports = join(fs.realpathSync(home), 'exports'); fs.mkdirSync(exports, { mode: 0o700 });
  const foreignCanonical = fs.realpathSync(foreign);
  const originalOpen = fs.openSync; let swapped = false;
  fs.openSync = function(path, ...args) {
    if (!swapped && String(path).startsWith(exports + '/')) {
      fs.renameSync(exports, join(home, 'previous-exports'));
      fs.symlinkSync(foreign, exports, 'dir'); swapped = true;
    }
    return originalOpen.call(fs, path, ...args);
  };
  syncBuiltinESMExports();
  try {
    const payload = Buffer.from('synthetic private export');
    const output = storeExport(home, payload);
    const observed = observeFile(output);
    observations.directory_swap = { operation_accepted: true, path_advertised_under_exports: output.startsWith(exports + '/'), written_under_foreign_directory: fs.realpathSync(output).startsWith(foreignCanonical + '/'), final_mode: observed.mode, data_equal: observed.data.equals(payload), injected_concurrent_swap: swapped };
  } catch (error) {
    observations.directory_swap = { operation_accepted: false, error: error.message, injected_concurrent_swap: swapped };
  } finally { fs.openSync = originalOpen; syncBuiltinESMExports(); }

  // Failed writes must not unlink a pathname replaced by a different local writer.
  const cleanupHome = join(temp, 'cleanup-home'); fs.mkdirSync(cleanupHome, { mode: 0o700 });
  const cleanupDir = join(fs.realpathSync(cleanupHome), 'exports'); fs.mkdirSync(cleanupDir, { mode: 0o700 });
  const originalWrite = fs.writeFileSync;
  let namedPath, replacementCreated = false;
  const sentinel = Buffer.from('synthetic unrelated replacement must survive');
  fs.openSync = function(path, ...args) {
    const fd = originalOpen.call(fs, path, ...args);
    if (String(path).startsWith(cleanupDir + '/')) namedPath = String(path);
    return fd;
  };
  fs.writeFileSync = function(fd, ...args) {
    if (typeof fd === 'number' && namedPath && !replacementCreated) {
      fs.renameSync(namedPath, namedPath + '.original');
      originalWrite.call(fs, namedPath, sentinel, { mode: 0o600 });
      replacementCreated = true;
      throw new Error('synthetic injected write failure after pathname replacement');
    }
    return originalWrite.call(fs, fd, ...args);
  };
  syncBuiltinESMExports();
  let accepted = false, cleanupError;
  try { storeExport(cleanupHome, Buffer.from('synthetic export payload')); accepted = true; }
  catch (error) { cleanupError = error.message; }
  finally { fs.openSync = originalOpen; fs.writeFileSync = originalWrite; syncBuiltinESMExports(); }
  observations.no_replacement_cleanup = { operation_accepted: accepted, error: cleanupError, replacement_created: replacementCreated, unrelated_replacement_survives: observedBytesEqual(namedPath, sentinel) };
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

const reviewed_commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' }).trim();
console.log(JSON.stringify({ schema: 'canli.internal-peer-review.v1', reviewed_commit, synthetic_only: true, observer_contracts: observerContracts, model_or_broker_calls: 0, record_leaf_mutations_refused: refused, companion_mutations_refused: companions, signed_selection_clock_missing_and_self_attestation_probes: 'pass', observations, scope_limits: ['Internal code review, not external financial or expert review', 'Financial numerical oracle not rerun; no independent Sharpe, MinTRL or annual-compounding implementation'] }, null, 2));
