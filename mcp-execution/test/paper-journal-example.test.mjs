// Synthetic fixtures. Nothing in this file is a broker/model/latency experiment.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { PAPER_LIMITS, SYNTHETIC_SCENARIO, paperJournalMain, runPaperJournal, runPaperJournalStdio } from '../examples/paper-journal.mjs';
import { createSession, toolCheckOrders, toolJournal, toolSizePosition } from '../src/server.mjs';
import { verifyJournal } from '../src/core/js/trade-journal-core.js';
import { journalBindings } from '../src/core/js/trade-journal-export-core.js';

const scenario = () => structuredClone(SYNTHETIC_SCENARIO);
const envelope = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
function fixture(t, key = true) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'canli-paper-example-')));
  chmodSync(home, 0o700);
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  if (key) writeFileSync(join(home, 'journal.key'), pem, { mode: 0o600 });
  const session = createSession({ home, journalWrites: true, now: () => new Date('2025-01-02T00:00:00.000Z') });
  const calls = [];
  const callTool = async (request, options) => {
    calls.push(request);
    assert.ok(Object.isFrozen(request) && Object.isFrozen(request.arguments));
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(options.timeoutMs > 0 && options.timeoutMs <= PAPER_LIMITS.deadlineMs);
    if (request.name === 'size_position') return toolSizePosition(session, request.arguments);
    if (request.name === 'check_orders') return toolCheckOrders(session, request.arguments);
    assert.equal(request.name, 'journal');
    return toolJournal(session, request.arguments);
  };
  return { home, pem, session, calls, callTool };
}
function noJournal(f) { assert.equal(existsSync(join(f.home, 'journal.jsonl')), false); }
function roundtrip(report, home, pem) {
  assert.equal(report.status, 'completed', JSON.stringify(report.stop));
  assert.equal(report.call_count, 11);
  assert.equal(report.receipts.length, 6);
  assert.equal(report.requests.length, 6);
  assert.equal(report.pending_request, null);
  assert.equal(report.pending_export, null);
  const bytes = readFileSync(join(home, 'journal.jsonl'));
  const verified = verifyJournal(bytes);
  assert.equal(verified.valid, true);
  assert.equal(verified.entries, 6);
  const lines = bytes.toString().trimEnd().split('\n').map(line => JSON.parse(line).entry);
  assert.deepEqual(lines.map(e => e.kind), ['config', 'decision', 'check', 'order', 'fill', 'mark']);
  assert.equal(lines[2].payload.decision_seq, 1);
  for (let i = 0; i < report.receipts.length; i++) {
    assert.equal(report.receipts[i].operation_id, report.requests[i].operation_id);
    assert.equal(report.receipts[i].entry_seq, i);
    if (i) assert.equal(report.requests[i].expected_head, report.receipts[i - 1].entry_head);
  }
  assert.equal(report.export.head, verified.head);
  assert.equal(report.export.metrics.closing_equity, 10_006.5);
  assert.equal(report.export.metrics.fees_usd, 1);
  assert.equal(report.export.metrics.fill_count, 1);
  assert.equal(report.export.record.returns.sharpe_annualised, null);
  const { artifact_bytes, artifact_sha256, ...bundle } = report.export;
  assert.equal(journalBindings(report.export.record, bytes, report.export.signature, bundle).all_match, true);
  assert.ok(!JSON.stringify(report).includes(pem));
  assert.doesNotMatch(JSON.stringify(report), /BEGIN PRIVATE KEY|private_key|privatePem/);
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= PAPER_LIMITS.outputBytes);
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.requests[0]));
}

test('injected delivered tools complete a bound synthetic sizing/check/journal/export roundtrip', async t => {
  const f = fixture(t);
  const report = await runPaperJournal({ callTool: f.callTool, write: true });
  roundtrip(report, f.home, f.pem);
  assert.equal(f.calls.length, report.call_count);
  assert.deepEqual(f.calls.map(r => r.name === 'journal' ? r.arguments.action : r.name),
    ['size_position', 'check_orders', 'head', 'initialize', 'append', 'append', 'append', 'append', 'append', 'verify', 'export']);
});

test('actual local stdio example completes the signed synthetic roundtrip without returning the key', { timeout: 35_000 }, async t => {
  const f = fixture(t);
  const report = await runPaperJournalStdio({ home: f.home, write: true });
  roundtrip(report, f.home, f.pem);
  assert.equal(readFileSync(join(f.home, 'journal.key'), 'utf8'), f.pem);
});

test('the actual repository command defaults to two read-only calls without preparing a key', { timeout: 35_000 }, t => {
  const f = fixture(t, false);
  const command = fileURLToPath(new URL('../examples/paper-journal.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [command, '--home', f.home], { timeout: 34_000, encoding: 'utf8', maxBuffer: PAPER_LIMITS.outputBytes });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  const report = JSON.parse(child.stdout);
  assert.equal(report.status, 'writes_disabled');
  assert.equal(report.call_count, 2);
  assert.equal(report.requests.length, 0);
  assert.deepEqual(readdirSync(f.home), []);
});

test('injected default write denial performs checks and creates no journal or key', async t => {
  const f = fixture(t, false);
  const report = await runPaperJournal({ callTool: f.callTool });
  assert.equal(report.status, 'writes_disabled');
  assert.equal(report.call_count, 2);
  assert.equal(report.planning.check.row.accepted, true);
  assert.deepEqual(readdirSync(f.home), []);
});

test('a supplied notional limit rejects the order before any journal write or fabricated fill', async t => {
  const f = fixture(t), s = scenario(); s.check.limits.max_order_notional = 500;
  const report = await runPaperJournal({ callTool: f.callTool, scenario: s, write: true });
  assert.equal(report.status, 'declined');
  assert.equal(report.call_count, 2);
  assert.equal(report.planning.check.row.accepted, false);
  assert.ok(report.planning.check.row.reasons.length);
  assert.equal(report.requests.length, 0); assert.equal(report.export, null); noJournal(f);
});

test('the delivered kill switch rejects before initialization and is never removed', async t => {
  const f = fixture(t); writeFileSync(join(f.home, 'KILL'), 'synthetic owner kill switch', { mode: 0o600 });
  const report = await runPaperJournal({ callTool: f.callTool, write: true });
  assert.equal(report.status, 'declined'); assert.equal(report.call_count, 2);
  assert.equal(report.planning.check.kill_switch, 'engaged');
  assert.ok(report.planning.check.row.reasons.includes('kill_switch_engaged'));
  assert.equal(readFileSync(join(f.home, 'KILL'), 'utf8'), 'synthetic owner kill switch'); noJournal(f);
});

test('missing supplied fill fees stay unknown and stop before journal initialization', async t => {
  const f = fixture(t), s = scenario(); delete s.fill.fee;
  const report = await runPaperJournal({ callTool: f.callTool, scenario: s, write: true });
  assert.equal(report.stop.code, 'MISSING_FEE'); assert.equal(report.call_count, 2);
  assert.ok(report.unknowns.includes('supplied fill fee')); assert.equal(report.export, null); noJournal(f);
});

test('an absent commission schedule remains not modelled while explicit fixture fill fees are retained', async t => {
  const f = fixture(t), s = scenario(); delete s.check.fees;
  const report = await runPaperJournal({ callTool: f.callTool, scenario: s, write: true });
  roundtrip(report, f.home, f.pem);
  assert.equal(report.planning.check.row.commission_bps, null);
  assert.ok(report.planning.check.not_modelled.some(v => /commission|fee/i.test(v)));
});

test('a date-only commission schedule refuses as unknown while an explicitly supplied zero remains valid', async t => {
  const f = fixture(t);
  for (const extra of [{}, { min_usd: 0 }, { sell_fee_rate: 0 }]) {
    const missing = scenario(); missing.check.fees = { as_of: missing.check.fees.as_of, ...extra };
    const refused = await runPaperJournal({ callTool: f.callTool, scenario: missing, write: true });
    assert.equal(refused.stop.code, 'MISSING_FEE_SCHEDULE'); assert.equal(refused.call_count, 0);
    assert.ok(refused.unknowns.includes('supplied fee schedule amounts')); noJournal(f);
  }
  const zero = scenario(); zero.check.fees.commission_bps = 0;
  const report = await runPaperJournal({ callTool: f.callTool, scenario: zero, write: true });
  roundtrip(report, f.home, f.pem); assert.equal(report.planning.check.row.commission_bps, 0);
});

test('accessors and inline signing fields refuse before a local callback and do not echo their contents', async t => {
  const f = fixture(t); let reads = 0;
  const getter = scenario(); Object.defineProperty(getter.account, 'initial_cash', { get() { reads++; return 10_000; }, enumerable: true });
  const badKey = scenario(); badKey.account.private_key = f.pem;
  for (const s of [getter, badKey]) {
    const report = await runPaperJournal({ callTool: f.callTool, scenario: s, write: true });
    assert.equal(report.status, 'stopped'); assert.equal(report.call_count, 0);
    assert.ok(!JSON.stringify(report).includes(f.pem));
  }
  assert.equal(reads, 0); noJournal(f);
});

test('text/structured reply disagreement and oversized replies stop without accepting a plan', async t => {
  const f = fixture(t);
  for (const corrupt of [r => ({ ...r, content: [{ type: 'text', text: '{"position_qty":10,"position_qty":20}' }] }),
    r => ({ ...r, extra: 'x'.repeat(PAPER_LIMITS.replyBytes + 1) })]) {
    const report = await runPaperJournal({ write: true, callTool: async (req, opts) => corrupt(await f.callTool(req, opts)) });
    assert.equal(report.status, 'stopped'); assert.equal(report.call_count, 1);
    assert.equal(report.planning, null); assert.equal(report.requests.length, 0); noJournal(f);
  }
});

test('pre-trade response order identity and columns must match the delivered contract', async t => {
  const f = fixture(t);
  const report = await runPaperJournal({ write: true, callTool: async (req, opts) => {
    const r = await f.callTool(req, opts);
    if (req.name !== 'check_orders') return r;
    const data = structuredClone(r.structuredContent); data.rows[0][0] = 'OTHER'; return envelope(data);
  } });
  assert.equal(report.stop.code, 'MALFORMED_CHECK'); assert.equal(report.call_count, 2); noJournal(f);
});

test('a missing or mismatched initial request receipt retains the original request and stops progress', async t => {
  const f = fixture(t);
  const report = await runPaperJournal({ write: true, callTool: async (req, opts) => {
    const r = await f.callTool(req, opts);
    if (req.arguments.action !== 'initialize') return r;
    const data = structuredClone(r.structuredContent); data.request_sha256 = 'sha256:' + '0'.repeat(64); return envelope(data);
  } });
  assert.equal(report.stop.code, 'MALFORMED_RECEIPT'); assert.equal(report.call_count, 4);
  assert.equal(report.receipts.length, 0); assert.equal(report.requests.length, 1);
  assert.equal(report.pending_request.request.operation_id, 'synthetic-paper-v1:initialize');
  assert.equal(report.pending_request.dispatched, true);
  assert.equal(verifyJournal(readFileSync(join(f.home, 'journal.jsonl'))).entries, 1);
});

test('typed persistence uncertainty never retries or exposes a diagnostic key string', async t => {
  const f = fixture(t);
  const report = await runPaperJournal({ write: true, callTool: async (req, opts) => {
    if (req.arguments.action !== 'initialize') return f.callTool(req, opts);
    return { ...envelope({ action: 'initialize', error: { code: 'JOURNAL_STORE_UNCERTAIN', message: f.pem, journal_persistence_attempted: true } }), isError: true };
  } });
  assert.equal(report.stop.code, 'JOURNAL_STORE_UNCERTAIN'); assert.equal(report.call_count, 4);
  assert.equal(report.stop.journal_persistence_attempted, true);
  assert.equal(report.receipts.length, 0); assert.equal(report.pending_request.dispatched, true);
  assert.match(report.stop.persistence, /unknown/); assert.ok(!JSON.stringify(report).includes(f.pem)); noJournal(f);
});

test('a retained actual pending lock produces busy, preserves the lock, and schedules no retry', async t => {
  const f = fixture(t), lock = Buffer.from('synthetic pending original request');
  writeFileSync(join(f.home, 'journal.append.lock'), lock, { mode: 0o600 });
  const report = await runPaperJournal({ callTool: f.callTool, write: true });
  assert.equal(report.stop.code, 'JOURNAL_STORE_BUSY'); assert.equal(report.call_count, 4);
  assert.equal(report.receipts.length, 0); assert.equal(report.requests.length, 1);
  assert.ok(readFileSync(join(f.home, 'journal.append.lock')).equals(lock)); noJournal(f);
});

test('conflicting operation contents after a stale absent-head reply refuse without changing the existing journal', async t => {
  const f = fixture(t), s = scenario();
  await toolJournal(f.session, { action: 'initialize', operation_id: s.operation_prefix + ':initialize', ts: s.ts.initialize,
    payload: { account: { ...s.account, initial_cash: 9_999 } } });
  const before = readFileSync(join(f.home, 'journal.jsonl'));
  const report = await runPaperJournal({ write: true, callTool: (req, opts) => req.arguments.action === 'head' ?
    envelope({ action: 'head', exists: false }) : f.callTool(req, opts) });
  assert.equal(report.stop.code, 'JOURNAL_STORE_REFUSED'); assert.equal(report.call_count, 4);
  assert.ok(readFileSync(join(f.home, 'journal.jsonl')).equals(before));
  assert.equal(report.pending_request.request.payload.account.initial_cash, 10_000);
});

test('a normal rerun detects the existing journal and never replays the scenario', async t => {
  const f = fixture(t);
  assert.equal((await runPaperJournal({ callTool: f.callTool, write: true })).status, 'completed');
  const before = readFileSync(join(f.home, 'journal.jsonl'));
  const report = await runPaperJournal({ callTool: f.callTool, write: true });
  assert.equal(report.stop.code, 'EXISTING_JOURNAL'); assert.equal(report.call_count, 3);
  assert.equal(report.requests.length, 0); assert.ok(readFileSync(join(f.home, 'journal.jsonl')).equals(before));
});

test('a replay acknowledgement cannot advance the example to another operation', async t => {
  const f = fixture(t);
  const report = await runPaperJournal({ write: true, callTool: async (req, opts) => {
    const r = await f.callTool(req, opts);
    return req.arguments.action === 'initialize' ? envelope({ ...r.structuredContent, replayed: true }) : r;
  } });
  assert.equal(report.stop.code, 'EXISTING_OPERATION'); assert.equal(report.call_count, 4);
  assert.equal(report.receipts.length, 0); assert.equal(report.requests.length, 1);
});

test('a changed verified head stops before export and preserves all acknowledged write receipts', async t => {
  const f = fixture(t);
  const report = await runPaperJournal({ write: true, callTool: async (req, opts) => {
    const r = await f.callTool(req, opts);
    return req.arguments.action === 'verify' ? envelope({ ...r.structuredContent, head: 'sha256:' + '0'.repeat(64) }) : r;
  } });
  assert.equal(report.stop.code, 'HEAD_MISMATCH'); assert.equal(report.call_count, 10);
  assert.equal(report.receipts.length, 6); assert.equal(report.export, null);
  assert.ok(!f.calls.some(req => req.arguments.action === 'export'));
});

test('a tampered export digest is refused while its original export request remains visible', async t => {
  const f = fixture(t);
  const report = await runPaperJournal({ write: true, callTool: async (req, opts) => {
    const r = await f.callTool(req, opts);
    return req.arguments.action === 'export' ? envelope({ ...r.structuredContent, artifact_sha256: 'sha256:' + '0'.repeat(64) }) : r;
  } });
  assert.equal(report.stop.code, 'EXPORT_DIGEST'); assert.equal(report.call_count, 11);
  assert.equal(report.export, null); assert.equal(report.pending_export.dispatched, true);
  assert.equal(report.pending_export.request.sign, true);
});

test('rehashing a changed unsigned export companion cannot bless it with the original record signature', async t => {
  const f = fixture(t);
  const report = await runPaperJournal({ write: true, callTool: async (req, opts) => {
    const r = await f.callTool(req, opts);
    if (req.arguments.action !== 'export') return r;
    const data = structuredClone(r.structuredContent);
    data.metrics.closing_equity += 1_000;
    const fields = ['record', 'journal_sha256', 'head', 'entry_range', 'metrics', 'series', 'journal_public_key', 'signature'];
    const bytes = Buffer.from(JSON.stringify(Object.fromEntries(fields.map(k => [k, data[k]]))) + '\n');
    data.artifact_bytes = bytes.length; data.artifact_sha256 = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    return envelope(data);
  } });
  assert.equal(report.stop.code, 'MALFORMED_EXPORT'); assert.equal(report.call_count, 11);
  assert.equal(report.export, null); assert.equal(report.pending_export.dispatched, true);
  assert.equal(report.receipts.length, 6);
});

test('the finite call cap stops before dispatching export and keeps earlier acknowledgements', async t => {
  const f = fixture(t);
  const report = await runPaperJournal({ callTool: f.callTool, write: true, maxCalls: 10 });
  assert.equal(report.stop.code, 'CALL_LIMIT'); assert.equal(report.call_count, 10);
  assert.equal(f.calls.length, 10); assert.equal(report.receipts.length, 6);
  assert.equal(report.pending_export.dispatched, false);
});

test('a never-resolving callback reaches the native deadline without a follow-up call', async () => {
  let calls = 0;
  const report = await runPaperJournal({ write: true, deadlineMs: 50, callTool: () => { calls++; return new Promise(() => {}); } });
  assert.equal(report.stop.code, 'DEADLINE'); assert.equal(report.call_count, 1); assert.equal(calls, 1);
});

test('cancellation during a pending write retains its request and a late completion cannot change the returned result', async t => {
  const f = fixture(t), controller = new AbortController(); let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const work = runPaperJournal({ write: true, signal: controller.signal, callTool: (req, opts) => {
    calls++;
    if (req.arguments.action === 'initialize') { entered({ req, opts }); return pending; }
    return f.callTool(req, opts);
  } });
  const { req, opts } = await waiting;
  controller.abort(); const report = await work, original = JSON.stringify(report);
  assert.equal(report.stop.code, 'CANCELLED'); assert.equal(report.call_count, 4);
  assert.equal(report.pending_request.dispatched, true); assert.equal(report.receipts.length, 0);
  release(await f.callTool(req, opts)); // The trusted callback can still persist; the runner cannot preempt it.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(report), original); assert.equal(calls, 4);
  assert.equal(verifyJournal(readFileSync(join(f.home, 'journal.jsonl'))).entries, 1);
});

test('pre-abort, zero deadline and invalid enlarged policies dispatch no callbacks', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  for (const policy of [{ signal: controller.signal }, { deadlineMs: 0 }, { maxCalls: 12 }, { deadlineMs: 30_001 }]) {
    const report = await runPaperJournal({ ...policy, callTool: () => { calls++; } });
    assert.equal(report.status, 'stopped'); assert.equal(report.call_count, 0);
  }
  assert.equal(calls, 0);
});

test('a backwards caller clock stops after its first callback', async () => {
  let clock = 1_000, calls = 0;
  const report = await runPaperJournal({ now: () => clock, callTool: () => { calls++; clock--; return envelope({}); } });
  assert.equal(report.stop.code, 'CLOCK'); assert.equal(report.call_count, 1); assert.equal(calls, 1);
});

test('an abort delivered by the final dispatch clock sample prevents the callback and count', async () => {
  const controller = new AbortController(); let samples = 0, calls = 0;
  const report = await runPaperJournal({ signal: controller.signal, now: () => { if (++samples === 6) controller.abort(); return 1_000; },
    callTool: () => { calls++; } });
  assert.equal(report.stop.code, 'CANCELLED'); assert.equal(report.call_count, 0); assert.equal(calls, 0);
});

test('caller mutation during the first await cannot change the captured fixture or later write requests', async t => {
  const f = fixture(t), s = scenario(); let once = false;
  const report = await runPaperJournal({ write: true, scenario: s, callTool: (req, opts) => {
    if (!once) { once = true; s.account.initial_cash = 500; s.symbol = 'CHANGED'; s.fill.fee = 999; }
    return f.callTool(req, opts);
  } });
  roundtrip(report, f.home, f.pem);
  assert.equal(report.requests[0].payload.account.initial_cash, 10_000);
  assert.equal(report.requests[4].payload.fee, 1);
});

test('stdio home and command argument refusals do not create or repair local state', async t => {
  const f = fixture(t); chmodSync(f.home, 0o755);
  const report = await runPaperJournalStdio({ home: f.home, write: true });
  assert.equal(report.stop.code, 'HOME'); assert.equal(report.call_count, 0); noJournal(f);
  await assert.rejects(paperJournalMain(['--write']), /USAGE/);
  await assert.rejects(paperJournalMain(['--home', f.home, '--write', '--retry']), /USAGE/);
});
