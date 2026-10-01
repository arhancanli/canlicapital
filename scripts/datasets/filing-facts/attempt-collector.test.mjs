import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createBaselineContract, projectQuestions, V0_DIRECTORY, V0_SHA256 } from './baseline-contract.mjs';
import { prepareAttemptContract, PACKETS_SCHEMA, MAX_RAW_BYTES, MAX_JSON_BYTES } from './attempt-accounting.mjs';
import { sha256 } from './evidence.mjs';
import { CONFIGURATION_SCHEMA, POLICY_SCHEMA, RESPONSE_SCHEMA, MAX_FIXTURE_BYTES,
  prepareCollectorPolicy, collectFixture, recoverFixture } from './attempt-collector.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TS = '2026-10-01T00:00:00.000Z';
const PURPOSE = 'synthetic-software-fixture';
const bytes = value => Buffer.from(JSON.stringify(value) + '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const BASELINE = createBaselineContract(ROOT), QUESTIONS = projectQuestions(ROOT, BASELINE);
const BASE = bytes(BASELINE), Q = bytes(QUESTIONS);
const sleep = delay => new Promise(resolve => setTimeout(resolve, delay));

function configuration(count = 1) {
  return { schema: CONFIGURATION_SCHEMA, purpose: PURPOSE, arm: 'closed', provider: 'synthetic-fixture', requested_model: 'fixture-model',
    generation_settings: { temperature: 0 }, response_pointers: { answer: '/answer', response_id: '/id', model: '/model',
      usage: { input_tokens: '/usage/input_tokens', output_tokens: '/usage/output_tokens' } },
    price_basis: { currency: 'USD', as_of: TS, provider: 'synthetic-fixture', model: 'fixture-model',
      source_text: 'SYNTHETIC SOFTWARE FIXTURE rates only; no pricing lookup or observed billing',
      units: { input_tokens: 'token', output_tokens: 'token' }, rates_per_unit: { input_tokens: '0.1', output_tokens: '0.2' } },
    limits: { attempts_per_item: 8, turns_per_item: 6, item_duration_ms: 30000 },
    items: QUESTIONS.questions.slice(0, count).map((question, index) => ({ id: question.id, steps: [{ id: `fixture-${index + 1}-1`,
      turn: 1, retry_of: null, request_raw: JSON.stringify({ question: question.question }), trigger: 'start', http_statuses: [], delay_ms: 0, reason: null }] })) };
}
function retry(config, trigger = 'http_error', delay = 0) {
  const first = config.items[0].steps[0];
  config.items[0].steps.push({ ...first, id: 'fixture-1-2', retry_of: 1, trigger,
    http_statuses: trigger === 'http_error' ? [429] : [], delay_ms: delay, reason: 'Explicit synthetic fixture retry only' });
  return config;
}
function continuation(config) {
  const first = config.items[0].steps[0];
  config.items[0].steps.push({ ...first, id: 'fixture-1-2', turn: 2, retry_of: null, trigger: 'response', reason: 'Explicit synthetic second turn',
    request_raw: JSON.stringify({ question: QUESTIONS.questions[0].question, fixture_turn: 2 }) });
  return config;
}
function response(body = {}, status = 200, tools = []) {
  return bytes({ schema: RESPONSE_SCHEMA, purpose: PURPOSE, http_status: status,
    response_raw: JSON.stringify({ id: 'fixture-response', model: 'fixture-model', answer: 'ANSWER: 0', usage: { input_tokens: 2, output_tokens: 1 }, ...body }),
    error: status >= 200 && status < 300 ? null : 'synthetic HTTP error', tools });
}
function packet(raw = 'SYNTHETIC numeric source '.repeat(1000), limit = 100) {
  return { schema: PACKETS_SCHEMA, rights: { status: 'cleared', content_class: 'original-questions-numeric-facts-filing-identifiers',
    basis: 'Synthetic fixture declaration only', evidence_text: 'No independent legal rights evidence supplied' },
    truncation_policy: { method: 'prefix', unit: 'utf16-code-units', limit }, items: QUESTIONS.questions.map(question => ({ id: question.id,
      available: true, unavailable_reason: null, coverage_kind: 'selected-facts', coverage_evidence_text: null,
      original_source_bindings: [{ uri: 'fixture://numeric-source', ...{ sha256: sha256(raw), bytes: Buffer.byteLength(raw) } }],
      source_assisted: { raw_text: raw, supplied_text: raw.slice(0, limit) }, mcp: { raw_text: raw, supplied_text: raw.slice(0, limit) } })) };
}
function setup(t, config = configuration(), packets = null, root = ROOT) {
  const home = fs.mkdtempSync(join(tmpdir(), 'canli-attempt-collector-'));
  fs.chmodSync(home, 0o700); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const inputs = { baseline: Buffer.from(BASE), questions: Buffer.from(Q), packets: packets === null ? null : bytes(packets),
    accounting: bytes(prepareAttemptContract(root, BASE, Q, packets === null ? null : bytes(packets))), configuration: bytes(config) };
  const policy = prepareCollectorPolicy(root, inputs);
  return { home, inputs, policy, policyBytes: bytes(policy), root };
}
function runtime(transport = () => response()) {
  let tick = 0;
  return { transport, monotonic: () => ++tick, wall: () => TS };
}
const collect = (s, rt = runtime()) => collectFixture(s.root, s.inputs, s.policyBytes, s.home, rt);
const recover = s => recoverFixture(s.root, s.inputs, s.policyBytes, s.home);
function events(home) { return fs.readdirSync(home).filter(name => /^event-/.test(name)).sort().map(name => ({ name, raw: fs.readFileSync(join(home, name)), ...JSON.parse(fs.readFileSync(join(home, name), 'utf8')) })); }
function snapshot(home) { return Object.fromEntries(fs.readdirSync(home).sort().map(name => [name, sha256(fs.readFileSync(join(home, name)))])); }
function sandbox(t) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'canli-collector-source-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const paths = new Set([...Object.keys(BASELINE.implementation.sources), ...Object.keys(BASELINE.context), ...Object.keys(V0_SHA256).map(name => `${V0_DIRECTORY}/${name}`),
    ...['attempt-accounting.mjs', 'ATTEMPTS.md', 'attempt-collector.mjs', 'COLLECTOR.md'].map(name => `scripts/datasets/filing-facts/${name}`)]);
  for (const path of paths) { fs.mkdirSync(dirname(join(dir, path)), { recursive: true }); fs.copyFileSync(join(ROOT, path), join(dir, path)); }
  return dir;
}
function instrument(hooks = {}) {
  const paths = new Map();
  return { ...fs,
    openSync(path, flags, mode) { hooks.open?.(path, flags); const fd = fs.openSync(path, flags, mode); paths.set(fd, String(path)); return fd; },
    writeSync(fd, buffer, offset, length, position) { const path = paths.get(fd); return hooks.write ? hooks.write({ path, fd, buffer, offset, length, position }) : fs.writeSync(fd, buffer, offset, length, position); },
    readSync(fd, buffer, offset, length, position) { const path = paths.get(fd); return hooks.read ? hooks.read({ path, fd, buffer, offset, length, position }) : fs.readSync(fd, buffer, offset, length, position); },
    fsyncSync(fd) { hooks.sync?.(paths.get(fd)); return fs.fsyncSync(fd); },
    closeSync(fd) { const path = paths.get(fd); paths.delete(fd); fs.closeSync(fd); hooks.close?.(path); } };
}

test('separate policy binds all fifteen questions, exact inputs and unchanged source bytes', t => {
  const s = setup(t);
  assert.equal(s.policy.schema, POLICY_SCHEMA); assert.equal(s.policy.selected_questions.length, 15);
  assert.equal(s.policy.inputs.questions.sha256, sha256(Q)); assert.equal(s.policy.dataset_sha256, BASELINE.dataset.sha256);
  assert.equal(s.policy.execution.fixture_only, true); assert.equal(s.policy.execution.model_calls_authorized, false);
  assert.equal(s.policy.implementation['scripts/datasets/filing-facts/attempt-collector.mjs'].sha256, sha256(fs.readFileSync(new URL('attempt-collector.mjs', import.meta.url))));
  assert.deepEqual(fs.readdirSync(s.home), []); // Preparation has no persistence or invocation effect.
});

test('full cohort saves pending before dispatch and recovers byte-equal raw ledger/report without billing claims', async t => {
  const s = setup(t, configuration(15)); let calls = 0;
  const output = await collect(s, runtime(request => {
    calls++;
    assert.equal(Object.isFrozen(request), true); assert.equal(Object.isFrozen(request.directive), true);
    assert.equal(Object.hasOwn(request, 'expected'), false); assert.equal(Object.hasOwn(request, 'answer'), false);
    assert.equal(request.question, QUESTIONS.questions[calls - 1].question);
    const saved = events(s.home).at(-1); assert.equal(saved.kind, 'pending'); assert.equal(saved.data.id, request.id);
    for (const name of fs.readdirSync(s.home)) assert.equal(fs.statSync(join(s.home, name)).mode & 0o777, 0o600);
    return response({ id: `fixture-response-${calls}` });
  }));
  assert.equal(calls, 15); assert.equal(output.report.coverage.completed_items, 15); assert.equal(output.report.coverage.recorded_attempts, 15);
  assert.equal(output.report.usage.input_tokens.complete_total, '30'); assert.equal(output.report.cost.complete_usage_estimate, '6');
  assert.equal(output.report.cost.actual_billed_total, null); assert.equal(output.report.model_baseline, false);
  assert.equal(output.report.latency.mean_item_duration_ms, null); assert.equal(output.complete_item_latency_verified, false);
  assert.notEqual(output.closure_observation, null); assert.equal(output.finalized, true);
  const reproduced = recover(s); assert.deepEqual(reproduced.ledger_bytes, output.ledger_bytes); assert.deepEqual(reproduced.report_bytes, output.report_bytes);
});

test('partial capture keeps the full selected denominator and unknown totals', async t => {
  const output = await collect(setup(t));
  assert.equal(output.report.coverage.selected_items, 15); assert.equal(output.report.coverage.missing_items, 14);
  assert.equal(output.report.coverage.recorded_attempts, 1); assert.equal(output.report.coverage.declared_attempts_total, null);
  assert.equal(output.report.cost.known_component_subtotal, '0.4'); assert.equal(output.report.cost.complete_usage_estimate, null);
  assert.equal(output.report.usage.input_tokens.complete_total, null);
});

test('explicit429 retry preserves both identities, raw error usage and exact supplied-rate subtotal', async t => {
  const s = setup(t, retry(configuration())); let calls = 0, firstRequest;
  const output = await collect(s, runtime(request => {
    calls++; if (calls === 1) firstRequest = request.request_raw;
    else { assert.equal(request.request_raw, firstRequest); assert.equal(events(s.home).filter(event => event.kind === 'terminal').length, 1); }
    return calls === 1 ? response({ id: 'fixture-429', answer: undefined, usage: { input_tokens: 1, output_tokens: 0 } }, 429) : response({ id: 'fixture-retry' });
  }));
  assert.equal(calls, 2); assert.equal(output.report.coverage.retry_attempts, 1); assert.equal(output.report.coverage.failed_or_aborted_attempts, 1);
  assert.equal(output.report.cost.known_component_subtotal, '0.5'); assert.equal(output.report.items[0].attempts[0].response_id, 'fixture-429');
  assert.equal(output.ledger.items[0].attempts[1].retry_of, 1); assert.equal(output.ledger.items[0].final_attempt, 2);
  assert.equal(recover(s).report.cost.known_component_subtotal, '0.5');
});

test('429 and unmatched HTTP errors never create an unplanned retry', async t => {
  for (const [config, status] of [[configuration(), 429], [retry(configuration()), 409]]) {
    const s = setup(t, config); let calls = 0;
    const output = await collect(s, runtime(() => { calls++; return response({ answer: undefined }, status); }));
    assert.equal(calls, 1); assert.equal(output.report.coverage.recorded_attempts, 1); assert.equal(output.ledger.items[0].status, 'error');
  }
});

test('transport exception retry retains the unavailable first usage and does not zero-fill it', async t => {
  const s = setup(t, retry(configuration(), 'transport_error')); let calls = 0;
  const output = await collect(s, runtime(() => { if (++calls === 1) throw new Error('synthetic connection failure'); return response(); }));
  assert.equal(calls, 2); assert.equal(output.ledger.items[0].attempts[0].status, 'transport_error');
  assert.equal(output.report.items[0].attempts[0].usage.input_tokens, null);
  assert.equal(output.report.items[0].estimated_cost, null); assert.equal(output.report.items[0].known_cost_component_subtotal, '0.4');
});

test('missing usage, price, model and response identity remain unavailable', async t => {
  const config = configuration(); config.price_basis = null;
  const output = await collect(setup(t, config), runtime(() => response({ id: undefined, model: undefined, usage: undefined })));
  const attempt = output.report.items[0].attempts[0];
  assert.equal(attempt.response_id, null); assert.equal(attempt.observed_model, null); assert.equal(attempt.usage.input_tokens, null);
  assert.equal(attempt.estimated_cost, null); assert.equal(output.report.cost.known_component_subtotal, null);
  assert.equal(output.report.cost.actual_billed_total, null);
});

test('different observed model prevents applying a supplied synthetic price', async t => {
  const output = await collect(setup(t), runtime(() => response({ model: 'fixture-other-model' })));
  assert.equal(output.report.items[0].attempts[0].usage.input_tokens, 2);
  assert.equal(output.report.items[0].attempts[0].estimated_cost, null);
});

test('malformed raw response body is preserved with unknown answer and usage', async t => {
  const s = setup(t), envelope = JSON.parse(response()); envelope.response_raw = '<synthetic malformed body>';
  const output = await collect(s, runtime(() => bytes(envelope)));
  assert.equal(output.ledger.items[0].attempts[0].response_raw, envelope.response_raw); assert.equal(output.ledger.items[0].status, 'incomplete');
  assert.equal(output.report.items[0].attempts[0].usage.input_tokens, null); assert.equal(recover(s).ledger.items[0].attempts[0].response_raw, envelope.response_raw);
});

test('invalid UTF-8 envelope bytes remain exact raw evidence before explicit refusal', async t => {
  const s = setup(t), invalid = Buffer.from([0xff, 0x7b, 0x7d]);
  const output = await collect(s, runtime(() => invalid));
  const raw = events(s.home).find(event => event.kind === 'raw');
  assert.deepEqual(Buffer.from(raw.data.payload_base64, 'base64'), invalid); assert.equal(raw.data.binding.sha256, sha256(invalid));
  assert.equal(output.ledger.items[0].attempts[0].status, 'transport_error'); assert.equal(output.report.items[0].attempts[0].usage.input_tokens, null);
  assert.equal(recover(s).report.coverage.failed_or_aborted_attempts, 1);
});

test('duplicate decoded envelope members are refused after exact raw capture', async t => {
  const s = setup(t), original = response().toString().replace('"purpose":', '"purpose":"other","purpose":');
  const output = await collect(s, runtime(() => original));
  assert.equal(output.ledger.items[0].attempts[0].status, 'transport_error');
  assert.match(output.ledger.items[0].attempts[0].error, /duplicate JSON/);
  assert.equal(events(s.home).find(event => event.kind === 'raw').data.binding.sha256, sha256(original));
});

test('unpaired callback string Unicode is refused without replacement-byte encoding', async t => {
  const s = setup(t), output = await collect(s, runtime(() => '\ud800'));
  assert.equal(events(s.home).some(event => event.kind === 'raw'), false);
  assert.match(output.ledger.items[0].attempts[0].error, /invalid Unicode/); assert.equal(output.report.items[0].attempts[0].usage.input_tokens, null);
});

test('bounded envelope oversize refusal records length without invented raw bytes or digest', async t => {
  const s = setup(t), output = await collect(s, runtime(() => Buffer.alloc(MAX_FIXTURE_BYTES + 1, 0x61)));
  const terminal = events(s.home).find(event => event.kind === 'terminal');
  assert.equal(terminal.data.received_bytes, MAX_FIXTURE_BYTES + 1); assert.equal(terminal.data.raw_sequence, null);
  assert.equal(output.ledger.items[0].attempts[0].response_raw, null); assert.equal(output.report.cost.known_component_subtotal, null);
});

test('oversized raw response inside a bounded envelope is retained separately and refused explicitly', async t => {
  const s = setup(t), envelope = JSON.parse(response()); envelope.response_raw = 'x'.repeat(MAX_RAW_BYTES + 1);
  const output = await collect(s, runtime(() => bytes(envelope)));
  assert.equal(output.ledger.items[0].attempts[0].status, 'transport_error'); assert.notEqual(events(s.home).find(event => event.kind === 'raw'), undefined);
  assert.equal(recover(s).report.items[0].attempts[0].estimated_cost, null);
});

test('MCP fixture raw tool result is saved before derivation of the shorter supplied result', async t => {
  const packets = packet(), config = configuration(); config.arm = 'mcp';
  const s = setup(t, config, packets), rawText = packets.items[0].mcp.raw_text;
  const output = await collect(s, runtime(() => response({}, 200, [{ id: 'fixture-tool', name: 'fixture-numeric-source', status: 'result', error: null,
    arguments_raw: '{}', result_raw: rawText }])));
  const recorded = events(s.home), raw = recorded.find(event => event.kind === 'raw'), terminal = recorded.find(event => event.kind === 'terminal');
  assert.ok(raw.sequence < terminal.sequence);
  assert.equal(JSON.parse(Buffer.from(raw.data.payload_base64, 'base64')).tools[0].result_raw, rawText);
  const trace = output.ledger.items[0].attempts[0].tool_traces[0]; assert.equal(trace.result_raw, rawText); assert.equal(trace.result_supplied, rawText.slice(0, 100));
  assert.equal(output.report.items[0].attempts[0].tool_traces[0].truncated, true);
  assert.equal(s.policy.execution.source_rights_and_complete_coverage, 'unverified-held'); assert.equal(recover(s).report.source_assisted_execution, 'held');
});

test('tool parity mismatch stays in raw evidence and refuses an accepted ledger result', async t => {
  const config = configuration(); config.arm = 'mcp'; const s = setup(t, config, packet());
  const output = await collect(s, runtime(() => response({}, 200, [{ id: 'fixture-tool', name: 'fixture-source', status: 'result', error: null,
    arguments_raw: '{}', result_raw: 'different synthetic source' }])));
  assert.equal(output.ledger.items[0].attempts[0].status, 'transport_error'); assert.match(output.ledger.items[0].attempts[0].error, /frozen source/);
  assert.equal(events(s.home).some(event => event.kind === 'raw'), true); assert.equal(output.report.coverage.tool_calls, 0);
});

test('conversation continuations are explicit separate turns rather than retries', async t => {
  const s = setup(t, continuation(configuration())); let calls = 0;
  const output = await collect(s, runtime(request => { assert.equal(request.turn, ++calls); return response({ id: `fixture-turn-${calls}` }); }));
  assert.equal(calls, 2); assert.equal(output.report.coverage.retry_attempts, 0); assert.equal(output.ledger.items[0].final_attempt, 2);
});

test('absolute deadline includes pending capture work and prevents a late dispatch', async t => {
  const s = setup(t); let tick = 0, calls = 0;
  const io = instrument({ write({ path, fd, buffer, offset, length, position }) {
    const written = fs.writeSync(fd, buffer, offset, length, position);
    if (basename(path) === 'event-0002.json') tick = 30001;
    return written;
  } });
  const output = await collect(s, { io, monotonic: () => tick, wall: () => TS, transport: () => { calls++; return response(); } });
  assert.equal(calls, 0); assert.equal(output.ledger.items[0].status, 'aborted'); assert.equal(output.ledger.items[0].attempts[0].status, 'aborted');
  assert.equal(output.report.items[0].attempts[0].usage.input_tokens, null);
  assert.equal(output.report.bounds_violations.some(violation => violation.attempt_id === 'fixture-1-1' && violation.observed_duration_ms === 30001), true);
  assert.equal(output.item_observations[0].deadline_overruns.length, 1);
});

test('timeout finalization ignores an abort-ignoring late fixture and starts no follow-up work', async t => {
  const config = continuation(configuration()); config.limits.item_duration_ms = 30;
  const s = setup(t, config); let calls = 0, resolveLate;
  const output = await collect(s, runtime(() => { calls++; return new Promise(resolve => { resolveLate = resolve; }); }));
  assert.equal(calls, 1); assert.equal(output.ledger.items[0].attempts[0].status, 'aborted');
  const frozenCapture = snapshot(s.home);
  resolveLate(response({ id: 'fixture-late' })); await sleep(5);
  assert.deepEqual(snapshot(s.home), frozenCapture); assert.equal(calls, 1);
  assert.equal(recover(s).report.items[0].attempts[0].usage.input_tokens, null);
});

test('explicit abort during backoff keeps known429 usage and prevents resubmission', async t => {
  const s = setup(t, retry(configuration(), 'http_error', 100)), controller = new AbortController(); let calls = 0;
  const rt = runtime(() => { calls++; return response({ answer: undefined }, 429); });
  rt.signal = controller.signal;
  rt.wait = () => { setTimeout(() => controller.abort(), 2); return new Promise(() => {}); };
  const output = await collect(s, rt);
  assert.equal(calls, 1); assert.equal(output.ledger.items[0].status, 'aborted'); assert.equal(output.report.items[0].attempts[0].usage.input_tokens, 2);
  assert.equal(events(s.home).find(event => event.kind === 'wait_done').data.status, 'aborted');
});

test('finite explicit backoff records the interval and an early injected wait is refused', async t => {
  for (const valid of [true, false]) {
    const s = setup(t, retry(configuration(), 'http_error', 20)); let tick = 0, calls = 0;
    const output = await collect(s, { monotonic: () => tick, wall: () => TS,
      wait: () => { if (valid) tick += 20; }, transport: () => { calls++; return calls === 1 ? response({ answer: undefined }, 429) : response(); } });
    assert.equal(calls, valid ? 2 : 1);
    assert.equal(events(s.home).find(event => event.kind === 'wait_done').data.status, valid ? 'elapsed' : 'error');
    if (valid) assert.equal(output.item_observations[0].observed_elapsed_lower_bound_ms, 20);
    else assert.equal(output.ledger.items[0].status, 'aborted');
  }
});

test('capture after a successful raw response preserves usage while exposing a marker deadline breach', async t => {
  const s = setup(t); let tick = 0;
  const io = instrument({ write({ path, fd, buffer, offset, length, position }) {
    const written = fs.writeSync(fd, buffer, offset, length, position);
    if (basename(path) === 'event-0005.json') tick = 30001;
    return written;
  } });
  const output = await collect(s, { io, monotonic: () => tick, wall: () => TS, transport: () => response() });
  assert.equal(output.ledger.items[0].status, 'aborted'); assert.equal(output.report.items[0].attempts[0].usage.input_tokens, 2);
  assert.equal(output.item_observations[0].observed_elapsed_lower_bound_ms, 30001);
  assert.equal(output.item_observations[0].deadline_overruns.length, 1); assert.equal(output.ledger.items[0].time.duration_ms, null);
});

test('interruption before terminal persistence keeps pending/unknown state and recovery never dispatches', async t => {
  const s = setup(t, continuation(configuration())); let calls = 0;
  const io = instrument({ open(path, flags) { if ((flags & fs.constants.O_CREAT) && basename(path) === 'event-0004.json') throw new Error('synthetic terminal-open failure'); } });
  await assert.rejects(collect(s, { ...runtime(() => { calls++; return response(); }), io }), { code: 'FIXTURE_COLLECTOR_UNCERTAIN' });
  assert.equal(calls, 1); const before = snapshot(s.home), output = recover(s);
  assert.equal(output.finalized, false); assert.equal(output.report.coverage.pending_attempts, 1);
  assert.equal(output.ledger.items[0].declared_attempts, null); assert.equal(output.report.items[0].attempts[0].usage.input_tokens, null);
  assert.equal(events(s.home).some(event => event.kind === 'raw'), true); assert.deepEqual(snapshot(s.home), before); assert.equal(calls, 1);
});

test('pending close failure yields no acknowledgment and dispatches no fixture', async t => {
  const s = setup(t); let calls = 0;
  const io = instrument({ close(path) { if (basename(path) === 'event-0002.json') throw new Error('synthetic close failure after actual descriptor closure'); } });
  await assert.rejects(collect(s, { ...runtime(() => { calls++; return response(); }), io }), { code: 'FIXTURE_COLLECTOR_UNCERTAIN' });
  assert.equal(calls, 0); assert.equal(recover(s).report.coverage.pending_attempts, 1);
});

test('short pending write leaves a retained partial file and refuses recovery without dispatch', async t => {
  const s = setup(t); let calls = 0;
  const io = instrument({ write(args) { return basename(args.path) === 'event-0002.json' ? 0 : fs.writeSync(args.fd, args.buffer, args.offset, args.length, args.position); } });
  await assert.rejects(collect(s, { ...runtime(() => { calls++; return response(); }), io }), { code: 'FIXTURE_COLLECTOR_UNCERTAIN' });
  assert.equal(calls, 0); assert.equal(fs.statSync(join(s.home, 'event-0002.json')).size, 0);
  assert.throws(() => recover(s), /UTF-8 JSON/);
});

test('pending readback failure is uncertain and cannot acknowledge or dispatch', async t => {
  const s = setup(t); let calls = 0;
  const io = instrument({ read(args) { if (basename(args.path) === 'event-0002.json') throw new Error('synthetic readback failure'); return fs.readSync(args.fd, args.buffer, args.offset, args.length, args.position); } });
  await assert.rejects(collect(s, { ...runtime(() => { calls++; return response(); }), io }), { code: 'FIXTURE_COLLECTOR_UNCERTAIN' });
  assert.equal(calls, 0); assert.equal(recover(s).report.coverage.pending_attempts, 1);
});

test('pending fsync failure is uncertain and starts no fixture', async t => {
  const s = setup(t); let calls = 0;
  const io = instrument({ sync(path) { if (basename(path) === 'event-0002.json') throw new Error('synthetic fsync failure'); } });
  await assert.rejects(collect(s, { ...runtime(() => { calls++; return response(); }), io }), { code: 'FIXTURE_COLLECTOR_UNCERTAIN' });
  assert.equal(calls, 0); assert.equal(recover(s).report.coverage.pending_attempts, 1);
});

test('final directory close failure does not return a success receipt despite recoverable final files', async t => {
  const s = setup(t);
  const io = instrument({ close(path) { if (path === s.home) throw new Error('synthetic final directory-close failure after actual closure'); } });
  await assert.rejects(collect(s, { ...runtime(), io }), { code: 'FIXTURE_COLLECTOR_UNCERTAIN' });
  assert.equal(recover(s).finalized, true);
});

test('directory substitution is refused and unrelated replacement files are never unlinked', async t => {
  const s = setup(t), retained = s.home + '-retained'; t.after(() => fs.rmSync(retained, { recursive: true, force: true }));
  await assert.rejects(collect(s, runtime(() => {
    fs.renameSync(s.home, retained); fs.mkdirSync(s.home, { mode: 0o700 }); fs.writeFileSync(join(s.home, 'unrelated.txt'), 'foreign replacement bytes');
    return response();
  })), { code: 'FIXTURE_COLLECTOR_UNCERTAIN' });
  assert.equal(fs.readFileSync(join(s.home, 'unrelated.txt'), 'utf8'), 'foreign replacement bytes');
  assert.equal(fs.existsSync(join(retained, 'event-0002.json')), true);
});

test('private file permissions, symlinks and hard links are refused by read-only recovery', async t => {
  for (const kind of ['permissions', 'symlink', 'hardlink']) {
    const s = setup(t); await collect(s); const path = join(s.home, 'event-0002.json');
    if (kind === 'permissions') fs.chmodSync(path, 0o644);
    else { const original = path + '-original'; fs.renameSync(path, original); if (kind === 'symlink') fs.symlinkSync(original, path); else fs.linkSync(original, path); }
    assert.throws(() => recover(s));
  }
});

test('event edits, missing sequence and final report tampering are refused', async t => {
  for (const kind of ['raw', 'sequence', 'final']) {
    const s = setup(t); await collect(s);
    if (kind === 'sequence') fs.renameSync(join(s.home, 'event-0002.json'), join(s.home, 'event-0099.json'));
    else {
      const record = events(s.home).find(event => event.kind === (kind === 'raw' ? 'raw' : 'final'));
      const parsed = JSON.parse(record.raw);
      if (kind === 'raw') parsed.data.binding.sha256 = '0'.repeat(64); else parsed.data.report_binding.sha256 = '0'.repeat(64);
      fs.writeFileSync(join(s.home, record.name), bytes(parsed));
    }
    assert.throws(() => recover(s), /binding|sequence|chain/);
  }
});

test('policy/input changes and duplicate projection members refuse before filesystem effects', async t => {
  for (const kind of ['policy', 'input', 'duplicate']) {
    const s = setup(t); let calls = 0;
    if (kind === 'policy') { const policy = clone(s.policy); policy.selected_questions[0].question_sha256 = '0'.repeat(64); s.policyBytes = bytes(policy); }
    if (kind === 'input') s.inputs.questions = Buffer.concat([s.inputs.questions, Buffer.from(' ')]);
    if (kind === 'duplicate') s.inputs.questions = Buffer.from(s.inputs.questions.toString().replace('"schema":', '"schema":"other","schema":'));
    await assert.rejects(collect(s, runtime(() => { calls++; return response(); })));
    assert.equal(calls, 0); assert.deepEqual(fs.readdirSync(s.home), []);
  }
});

test('invalid limits, turn/retry identities and real source-assisted/provider labels are rejected', t => {
  const s = setup(t);
  const changes = [config => { config.limits.attempts_per_item = 9; }, config => { config.limits.turns_per_item = 7; },
    config => { config.limits.item_duration_ms = 30001; }, config => { config.arm = 'source_assisted'; }, config => { config.provider = 'real-provider'; },
    config => { retry(config); config.items[0].steps[1].request_raw = 'changed'; }, config => { continuation(config); config.items[0].steps[1].turn = 7; },
    config => { retry(config); config.items[0].steps[1].id = config.items[0].steps[0].id; }, config => { config.limits.attempts_per_item = 1; retry(config); }];
  for (const change of changes) { const config = configuration(); change(config); assert.throws(() => prepareCollectorPolicy(ROOT, { ...s.inputs, configuration: bytes(config) })); }
  assert.deepEqual(fs.readdirSync(s.home), []);
});

test('changed loaded collector source after callback stops terminal acknowledgment and follow-up', async t => {
  const root = sandbox(t), s = setup(t, continuation(configuration()), null, root); let calls = 0;
  await assert.rejects(collect(s, runtime(() => {
    calls++; fs.appendFileSync(join(root, 'scripts/datasets/filing-facts/COLLECTOR.md'), '\nsynthetic source change\n'); return response();
  })), { code: 'FIXTURE_COLLECTOR_UNCERTAIN' });
  assert.equal(calls, 1); assert.equal(events(s.home).some(event => event.kind === 'terminal'), false);
  assert.throws(() => recover(s), /implementation changed/);
});

test('unavailable or backwards clocks prevent dispatch while missing wall time stays reasoned', async t => {
  const s = setup(t); let tick = 1, calls = 0;
  const output = await collect(s, { monotonic: () => tick--, wall: () => TS, transport: () => { calls++; return response(); } });
  assert.equal(calls, 0); assert.equal(output.ledger.items[0].status, 'aborted'); assert.equal(output.report.cost.known_component_subtotal, null);
  const other = setup(t), unknownWall = await collect(other, { ...runtime(), wall: () => null });
  assert.equal(unknownWall.ledger.items[0].attempts[0].time.started_at, null); assert.equal(unknownWall.ledger.items[0].attempts[0].time.unavailable_reason !== null, true);
});

test('nonempty directory and missing injected transport never overwrite or start a capture', async t => {
  const s = setup(t); fs.writeFileSync(join(s.home, 'historical.json'), 'existing historical bytes');
  await assert.rejects(collect(s), /must be empty/); assert.equal(fs.readFileSync(join(s.home, 'historical.json'), 'utf8'), 'existing historical bytes');
  const empty = setup(t); await assert.rejects(collect(empty, {}), /injected synthetic transport is required/); assert.deepEqual(fs.readdirSync(empty.home), []);
});

test('all protected V0 files remain byte-identical after collector fixtures', t => {
  for (const [name, expected] of Object.entries(V0_SHA256)) assert.equal(sha256(fs.readFileSync(join(ROOT, V0_DIRECTORY, name))), expected);
  const s = setup(t); assert.equal(s.policy.inputs.baseline.sha256, sha256(BASE));
});

test('directory admission validates the opened descriptor and refuses public or symlink homes before capture', async t => {
  const s = setup(t); let calls = 0;
  fs.chmodSync(s.home, 0o755);
  await assert.rejects(collect(s, runtime(() => { calls++; return response(); })), /existing owned mode0700/);
  assert.equal(calls, 0); assert.deepEqual(fs.readdirSync(s.home), []);
  fs.chmodSync(s.home, 0o700);
  const alias = s.home + '-symlink'; fs.symlinkSync(s.home, alias); t.after(() => fs.rmSync(alias, { force: true }));
  await assert.rejects(collectFixture(ROOT, s.inputs, s.policyBytes, alias, runtime(() => { calls++; return response(); })));
  assert.equal(calls, 0); assert.deepEqual(fs.readdirSync(s.home), []);
});

test('a queued microtask consuming the deadline prevents transport dispatch before any timer can run', async t => {
  const s = setup(t, continuation(configuration())); let tick = 0, calls = 0, queued = false;
  const io = instrument({ close(path) {
    if (!queued && basename(path) === 'event-0002.json') { queued = true; queueMicrotask(() => { tick = 30001; }); }
  } });
  const output = await collect(s, { io, monotonic: () => tick, wall: () => TS, transport: () => { calls++; return response(); } });
  assert.equal(queued, true); assert.equal(calls, 0); assert.equal(output.ledger.items[0].attempts[0].status, 'aborted');
  assert.match(output.ledger.items[0].attempts[0].error, /queued dispatch/);
  assert.equal(events(s.home).some(event => event.kind === 'raw'), false);
  assert.equal(recover(s).report.items[0].attempts[0].usage.input_tokens, null);
});

test('recovery caps513 packetless event names before reads while a512-name inventory reaches bounded parsing', async t => {
  const config = configuration(0), s = setup(t, config); await collect(s);
  const metadata = fs.readdirSync(s.home).filter(name => !/^event-/.test(name)); assert.equal(metadata.length, 6);
  for (const count of [513, 512]) {
    let eventOpens = 0;
    const io = { ...fs,
      readdirSync(path) { return path === s.home ? [...metadata, ...Array.from({ length: count }, (_, index) => `event-${String(index + 1).padStart(4, '0')}.json`)] : fs.readdirSync(path); },
      openSync(path, flags, mode) { if (/^event-/.test(basename(path))) eventOpens++; return fs.openSync(path, flags, mode); } };
    if (count === 513) {
      assert.throws(() => recoverFixture(ROOT, s.inputs, s.policyBytes, s.home, { io }), /event count exceeds finite bound/);
      assert.equal(eventOpens, 0);
    } else {
      assert.throws(() => recoverFixture(ROOT, s.inputs, s.policyBytes, s.home, { io }), { code: 'ENOENT' });
      assert.equal(eventOpens, 2); // One actual final event, then a missing second file; no valid512-event capture is claimed.
    }
  }
});

test('a synchronous native abort inside the fresh queued clock check prevents transport invocation', async t => {
  const s = setup(t), controller = new AbortController(); let armed = false, queued = false, calls = 0;
  const io = instrument({ close(path) {
    if (!queued && basename(path) === 'event-0002.json') { queued = true; queueMicrotask(() => { armed = true; }); }
  } });
  const output = await collect(s, { io, signal: controller.signal, wall: () => TS,
    monotonic: () => { if (armed) { armed = false; controller.abort(); } return 0; },
    transport: () => { calls++; return response(); } });
  assert.equal(controller.signal.aborted, true); assert.equal(calls, 0);
  assert.equal(output.ledger.items[0].attempts[0].status, 'aborted'); assert.equal(events(s.home).some(event => event.kind === 'raw'), false);
  assert.equal(recover(s).report.items[0].attempts[0].usage.input_tokens, null);
});

test('maximum full-cohort retry plan is refused before capture because its worst-case events exceed512', async t => {
  const s = setup(t), config = configuration(15); let calls = 0;
  for (const item of config.items) {
    const first = item.steps[0];
    for (let ordinal = 2; ordinal <= 8; ordinal++) item.steps.push({ ...first, id: `${first.id}-retry-${ordinal}`, retry_of: ordinal - 1,
      trigger: 'http_error', http_statuses: [429], delay_ms: 1, reason: 'Explicit bounded synthetic retry' });
  }
  s.inputs.configuration = bytes(config);
  assert.throws(() => prepareCollectorPolicy(ROOT, s.inputs), /planned worst-case events/);
  await assert.rejects(collect(s, runtime(() => { calls++; return response({}, 429); })), /planned worst-case events/);
  assert.equal(calls, 0); assert.deepEqual(fs.readdirSync(s.home), []);
  const valid = configuration(15), validPolicy = prepareCollectorPolicy(ROOT, { ...s.inputs, configuration: bytes(valid) });
  assert.equal(validPolicy.capture_limits.planned_worst_case_events, 91); // Includes a possible overrun per item and final marker.
});

test('bounded maximum-size original inputs refuse missing footer capacity before any filesystem effect', async t => {
  const s = setup(t); let calls = 0;
  const padded = input => Buffer.concat([input, Buffer.alloc(MAX_JSON_BYTES - input.length, 0x20)]);
  const baseline = padded(BASE), questions = padded(Q);
  s.inputs = { baseline, questions, packets: null,
    accounting: padded(bytes(prepareAttemptContract(ROOT, baseline, questions))), configuration: padded(bytes(configuration())) };
  s.policyBytes = bytes(prepareCollectorPolicy(ROOT, s.inputs));
  await assert.rejects(collect(s, runtime(() => { calls++; return response(); })), /reserved control\/footer capacity/);
  assert.equal(calls, 0); assert.deepEqual(fs.readdirSync(s.home), []);
});

test('bounded generation settings near the JSON limit refuse initial ledger expansion before capture', async t => {
  const s = setup(t), config = configuration(); let calls = 0;
  config.generation_settings.fixture_padding = 'x'.repeat(MAX_JSON_BYTES - 20000);
  s.inputs.configuration = bytes(config); assert.ok(s.inputs.configuration.length < MAX_JSON_BYTES);
  assert.throws(() => prepareCollectorPolicy(ROOT, s.inputs), /initial ledger leaves no reserved/);
  await assert.rejects(collect(s, runtime(() => { calls++; return response(); })), /initial ledger leaves no reserved/);
  assert.equal(calls, 0); assert.deepEqual(fs.readdirSync(s.home), []);
});
