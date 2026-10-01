import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, openSync, fstatSync, closeSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createBaselineContract, projectQuestions, V0_DIRECTORY, V0_SHA256 } from './baseline-contract.mjs';
import { sha256 } from './evidence.mjs';
import { canonicalJson } from '../../canonical-json.mjs';
import { ACCOUNTING_SCHEMA, LEDGER_SCHEMA, MAX_JSON_BYTES, MAX_RAW_BYTES, PACKETS_SCHEMA,
  prepareAttemptContract, auditAttemptLedger, replayAttemptReport } from './attempt-accounting.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MODULE = join(ROOT, 'scripts/datasets/filing-facts/attempt-accounting.mjs');
const TS = '2026-10-01T00:00:00.000Z';
const bytes = value => Buffer.from(JSON.stringify(value) + '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const BASELINE = createBaselineContract(ROOT), QUESTIONS = projectQuestions(ROOT, BASELINE);
const BASE = bytes(BASELINE), Q = bytes(QUESTIONS);
const CONTRACT = prepareAttemptContract(ROOT, BASE, Q);
const time = duration => ({ started_at: TS, ended_at: '2026-10-01T00:00:00.003Z', duration_ms: duration, unavailable_reason: null });
const unavailableTime = reason => ({ started_at: null, ended_at: null, duration_ms: null, unavailable_reason: reason });

function ledger(contract = CONTRACT) {
  return { schema: LEDGER_SCHEMA, purpose: 'synthetic-software-fixture', contract_sha256: contract.contract_sha256,
    question_projection_sha256: contract.questions.projection_sha256, source_contract_sha256: null, arm: 'closed',
    provider: 'synthetic-fixture', requested_model: 'fixture-model', generation_settings: { temperature: 0 },
    time_basis: 'caller-observed-monotonic-ms', bounds: { attempts_per_item: 8, item_duration_ms: 30000 },
    response_pointers: { answer: '/answer', response_id: '/id', model: '/model',
      usage: { input_tokens: '/usage/input_tokens', output_tokens: '/usage/output_tokens' } },
    price_basis: { currency: 'USD', as_of: TS, provider: 'synthetic-fixture', model: 'fixture-model',
      source_text: 'SYNTHETIC SOFTWARE FIXTURE ONLY: input0.1/output0.2 per unit. No provider pricing or billing.',
      units: { input_tokens: 'token', output_tokens: 'token' },
      rates_per_unit: { input_tokens: '0.1', output_tokens: '0.2' } },
    items: QUESTIONS.questions.map((question, i) => ({ id: question.id, question_sha256: sha256(question.question),
      status: 'completed', error: null, declared_attempts: 1, final_attempt: 1, response_text: 'ANSWER: 0', response_missing_reason: null,
      time: time(3), attempts: [{ id: `fixture-${i + 1}-1`, ordinal: 1, turn: 1, retry_of: null, status: 'response', http_status: 200,
        request_raw: JSON.stringify({ question: question.question }), response_raw: JSON.stringify({ id: `fixture-response-${i + 1}`,
          model: 'fixture-model', answer: 'ANSWER: 0', usage: { input_tokens: 2, output_tokens: 1 } }),
        response_missing_reason: null, answer_text: 'ANSWER: 0', answer_missing_reason: null, error: null,
        usage_unavailable_reason: null, time: time(2), tool_traces: [] }] })) };
}
const audit = (value, contract = CONTRACT, packets = null, root = ROOT) => auditAttemptLedger(root, bytes(contract), BASE, Q, packets, Buffer.isBuffer(value) ? value : bytes(value));
function addRetry(value, knownErrorUsage = true) {
  const item = value.items[0], successful = clone(item.attempts[0]);
  const first = item.attempts[0];
  first.status = 'http_error'; first.http_status = 429; first.error = 'synthetic429';
  first.response_raw = JSON.stringify({ model: 'fixture-model', error: { message: 'synthetic429' },
    ...(knownErrorUsage ? { usage: { input_tokens: 1, output_tokens: 0 } } : {}) });
  first.answer_text = null; first.answer_missing_reason = 'error body has no answer';
  first.usage_unavailable_reason = knownErrorUsage ? null : 'error body contains no usage'; first.time = time(5);
  successful.id = 'fixture-1-2'; successful.ordinal = 2; successful.retry_of = 1;
  item.attempts.push(successful); item.declared_attempts = 2; item.final_attempt = 2; item.time = time(7);
  return value;
}
function packets() {
  const raw = JSON.stringify({ note: 'SYNTHETIC SOFTWARE FIXTURE numeric-source packet', facts: [] });
  return { schema: PACKETS_SCHEMA, rights: { status: 'cleared', content_class: 'original-questions-numeric-facts-filing-identifiers',
    basis: 'Synthetic fixture assertion only', evidence_text: 'Synthetic fixture, not evidence of legal clearance.' },
    truncation_policy: { method: 'none', unit: 'utf16-code-units', limit: 1024 },
    items: QUESTIONS.questions.map(question => ({ id: question.id, available: true, unavailable_reason: null,
      coverage_kind: 'selected-facts', coverage_evidence_text: null,
      original_source_bindings: [{ uri: 'fixture://numeric-source', sha256: sha256(raw), bytes: Buffer.byteLength(raw) }],
      source_assisted: { raw_text: raw, supplied_text: raw }, mcp: { raw_text: raw, supplied_text: raw } })) };
}
function sandbox(t) {
  const dir = mkdtempSync(join(tmpdir(), 'canli-attempt-accounting-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = new Set([...Object.keys(BASELINE.implementation.sources), ...Object.keys(BASELINE.context),
    ...Object.keys(V0_SHA256).map(name => `${V0_DIRECTORY}/${name}`),
    'scripts/datasets/filing-facts/attempt-accounting.mjs', 'scripts/datasets/filing-facts/ATTEMPTS.md']);
  for (const path of paths) { mkdirSync(dirname(join(dir, path)), { recursive: true }); copyFileSync(join(ROOT, path), join(dir, path)); }
  return dir;
}

test('full fixed cohort replays exact supplied-rate estimates without claiming billing or a model benchmark', () => {
  const value = ledger(), report = audit(value);
  assert.equal(CONTRACT.schema, ACCOUNTING_SCHEMA); assert.equal(report.coverage.selected_items, 15);
  assert.equal(report.coverage.recorded_attempts, 15); assert.equal(report.coverage.attempt_records_complete, true);
  assert.equal(report.usage.input_tokens.complete_total, '30'); assert.equal(report.usage.output_tokens.complete_total, '15');
  assert.equal(report.cost.complete_usage_estimate, '6'); assert.equal(report.cost.actual_billed_total, null);
  assert.equal(report.latency.complete_attempt_duration_total_ms, 30); assert.equal(report.latency.mean_item_duration_ms, 3);
  assert.equal(report.latency.mean_attempt_duration_ms, 2); assert.equal(report.coverage.estimated_cost_known_attempts, 15);
  assert.equal(report.model_baseline, false); assert.equal(report.execution_authorized, false);
  assert.equal(report.provider_authenticity_verified, false); assert.equal(report.observed_billing_verified, false);
  assert.equal(replayAttemptReport(ROOT, bytes(CONTRACT), BASE, Q, null, bytes(value), bytes(report)).status, 'recomputed-local-attempt-report');
});

test('a failed429 and its retry both contribute recorded usage, latency and exact cost', () => {
  const report = audit(addRetry(ledger()));
  assert.equal(report.coverage.recorded_attempts, 16); assert.equal(report.coverage.retry_attempts, 1);
  assert.equal(report.coverage.failed_or_aborted_attempts, 1); assert.equal(report.cost.complete_usage_estimate, '6.1');
  assert.equal(report.usage.input_tokens.complete_total, '31'); assert.equal(report.latency.complete_attempt_duration_total_ms, 35);
  assert.equal(report.items[0].attempts[0].error, 'synthetic429'); assert.equal(report.items[0].attempts[0].http_status, 429);
});

test('missing error usage is unknown and prevents complete totals rather than becoming zero', () => {
  const report = audit(addRetry(ledger(), false));
  assert.equal(report.coverage.recorded_attempts, 16); assert.equal(report.usage.input_tokens.known_attempts, 15);
  assert.equal(report.usage.input_tokens.known_subtotal, '30'); assert.equal(report.usage.input_tokens.complete_total, null);
  assert.equal(report.cost.known_component_subtotal, '6'); assert.equal(report.cost.complete_usage_estimate, null);
  assert.equal(report.items[0].attempts[0].usage.input_tokens, null);
});

test('malformed raw response is retained as a failed attempt with unavailable usage', () => {
  const value = ledger(), item = value.items[0], attempt = item.attempts[0];
  item.status = 'error'; item.error = 'synthetic malformed body'; item.final_attempt = null;
  item.response_text = null; item.response_missing_reason = 'no decoded answer';
  attempt.status = 'transport_error'; attempt.error = 'synthetic malformed body'; attempt.response_raw = '{broken JSON';
  attempt.answer_text = null; attempt.answer_missing_reason = 'malformed JSON'; attempt.usage_unavailable_reason = 'malformed JSON';
  const report = audit(value);
  assert.equal(report.coverage.error_items, 1); assert.equal(report.coverage.failed_or_aborted_attempts, 1);
  assert.equal(report.items[0].attempts[0].response.sha256, sha256('{broken JSON'));
  assert.equal(report.cost.complete_usage_estimate, null); assert.equal(report.cost.known_component_subtotal, '5.6');
});

test('transport failure before a response retains explicit missing raw response and error', () => {
  const value = ledger(), item = value.items[0], attempt = item.attempts[0];
  item.status = 'error'; item.error = 'synthetic disconnected'; item.final_attempt = null;
  item.response_text = null; item.response_missing_reason = 'transport failure';
  attempt.status = 'transport_error'; attempt.error = 'synthetic disconnected'; attempt.http_status = null;
  attempt.response_raw = null; attempt.response_missing_reason = 'no response received';
  attempt.answer_text = null; attempt.answer_missing_reason = 'no response received'; attempt.usage_unavailable_reason = 'no usage received';
  const report = audit(value);
  assert.equal(report.items[0].attempts[0].response, null); assert.equal(report.coverage.error_items, 1);
  assert.equal(report.cost.complete_usage_estimate, null); assert.equal(report.usage.output_tokens.complete_total, null);
});

test('partial usage keeps a known component subtotal while full estimate stays unknown', () => {
  const value = ledger(), attempt = value.items[0].attempts[0], raw = JSON.parse(attempt.response_raw);
  delete raw.usage.output_tokens; attempt.response_raw = JSON.stringify(raw); attempt.usage_unavailable_reason = 'output usage missing';
  const report = audit(value);
  assert.equal(report.cost.known_component_subtotal, '5.8'); assert.equal(report.cost.complete_usage_estimate, null);
  assert.equal(report.usage.input_tokens.complete_total, '30'); assert.equal(report.usage.output_tokens.complete_total, null);
});

test('missing prices or a different observed model never become a zero or applicable estimate', () => {
  const value = ledger(); value.price_basis = null;
  assert.equal(audit(value).cost.known_component_subtotal, null); assert.equal(audit(value).cost.complete_usage_estimate, null);
  const changed = ledger(), attempt = changed.items[0].attempts[0], raw = JSON.parse(attempt.response_raw);
  raw.model = 'other-observed-model'; attempt.response_raw = JSON.stringify(raw);
  const report = audit(changed);
  assert.equal(report.items[0].attempts[0].observed_model, 'other-observed-model');
  assert.equal(report.items[0].attempts[0].estimated_cost, null); assert.equal(report.cost.complete_usage_estimate, null);
});

test('a partial capture retains all15 item denominators and unknown attempt/item totals', () => {
  const value = ledger(); value.items = value.items.slice(0, 1); const report = audit(value);
  assert.equal(report.coverage.selected_items, 15); assert.equal(report.coverage.captured_items, 1);
  assert.equal(report.coverage.missing_items, 14); assert.equal(report.coverage.declared_attempts_total, null);
  assert.equal(report.items.length, 15); assert.equal(report.items[1].status, 'missing_record');
  assert.equal(report.cost.known_component_subtotal, '0.4'); assert.equal(report.cost.complete_usage_estimate, null);
  assert.equal(report.latency.mean_item_duration_ms, null);
});

test('declared missing attempts and missing retry predecessors stay visible', () => {
  const value = ledger(), item = value.items[0], attempt = item.attempts[0];
  item.declared_attempts = 3; item.final_attempt = 3; attempt.ordinal = 3; attempt.retry_of = 2;
  const report = audit(value);
  assert.deepEqual(report.items[0].missing_attempts, [1, 2]); assert.equal(report.coverage.missing_attempts_in_declared_items, 2);
  assert.equal(report.coverage.declared_attempts_total, 17); assert.equal(report.cost.complete_usage_estimate, null);
  assert.equal(report.latency.complete_attempt_duration_total_ms, null);
});

test('not-started and unknown-attempt-count items keep unavailable measurements', () => {
  const value = ledger(), item = value.items[0];
  Object.assign(item, { status: 'not_started', declared_attempts: 0, attempts: [], final_attempt: null,
    response_text: null, response_missing_reason: 'not started', time: unavailableTime('not started') });
  const report = audit(value);
  assert.equal(report.coverage.not_started_items, 1); assert.equal(report.coverage.declared_attempts_total, 14);
  assert.equal(report.cost.complete_usage_estimate, null); assert.equal(report.latency.mean_item_duration_ms, null);
  const unknown = ledger(); unknown.items[0].declared_attempts = null;
  assert.equal(audit(unknown).coverage.declared_attempts_total, null); assert.equal(audit(unknown).cost.complete_usage_estimate, null);
  const beforeStart = ledger();
  Object.assign(beforeStart.items[0], { status: 'aborted', error: 'synthetic abort before request', declared_attempts: 0,
    attempts: [], final_attempt: null, response_text: null, response_missing_reason: 'not requested', time: unavailableTime('not requested') });
  const aborted = audit(beforeStart);
  assert.equal(aborted.coverage.declared_attempts_total, 14); assert.equal(aborted.items[0].estimated_cost, null);
  assert.equal(aborted.cost.complete_usage_estimate, null);
});

test('interrupted pending attempt remains recorded and cannot supply final latency or complete cost', () => {
  const value = ledger(), item = value.items[0], attempt = item.attempts[0];
  Object.assign(item, { status: 'aborted', error: 'synthetic interruption', final_attempt: null, response_text: null,
    response_missing_reason: 'interrupted', time: unavailableTime('interrupted') });
  Object.assign(attempt, { status: 'pending', http_status: null, response_raw: null, response_missing_reason: 'interrupted',
    answer_text: null, answer_missing_reason: 'interrupted', usage_unavailable_reason: 'interrupted',
    time: { started_at: TS, ended_at: null, duration_ms: null, unavailable_reason: 'interrupted' } });
  const report = audit(value);
  assert.equal(report.coverage.pending_attempts, 1); assert.equal(report.coverage.aborted_items, 1);
  assert.equal(report.coverage.attempt_latency_known, 14); assert.equal(report.cost.complete_usage_estimate, null);
});

test('unknown/duplicate items and altered question bindings refuse instead of changing the cohort', () => {
  for (const change of [value => { value.items[0].id = 'not-selected'; }, value => { value.items[1].id = value.items[0].id; },
    value => { value.items[0].question_sha256 = '0'.repeat(64); }]) {
    const value = ledger(); change(value); assert.throws(() => audit(value), /item|question binding/);
  }
  const questions = clone(QUESTIONS); questions.questions[0].question += ' changed';
  assert.throws(() => prepareAttemptContract(ROOT, BASE, bytes(questions)), /question-only projection/);
});

test('duplicate attempts, forward retry references and changing retry request bytes refuse', () => {
  for (const change of [value => { value.items[1].attempts[0].id = value.items[0].attempts[0].id; },
    value => { value.items[0].attempts[1].retry_of = 2; }, value => { value.items[0].attempts[1].request_raw += ' '; }]) {
    const value = addRetry(ledger()); change(value); assert.throws(() => audit(value), /attempt identity|retry predecessor|retry changes/);
  }
});

test('raw answers, HTTP outcomes and final attempt selection cannot contradict their record', () => {
  for (const change of [value => { value.items[0].attempts[0].answer_text = 'ANSWER: 99'; },
    value => { value.items[0].attempts[0].http_status = 500; }, value => { value.items[0].final_attempt = null; }]) {
    const value = ledger(); change(value); assert.throws(() => audit(value), /raw answer|HTTP\/error|raw attempt binding/);
  }
  const older = addRetry(ledger()); older.items[0].final_attempt = 1;
  assert.throws(() => audit(older), /final response|final raw/);
});

test('negative/nonfinite/backwards times and invalid price metadata refuse', () => {
  const negative = ledger(); negative.items[0].time.duration_ms = -1;
  assert.throws(() => audit(negative), /duration/);
  const infinity = bytes(ledger()).toString().replace('"duration_ms":3', '"duration_ms":1e400');
  assert.throws(() => audit(Buffer.from(infinity)), /duration/);
  const backwards = ledger(); backwards.items[0].time.ended_at = '2026-09-30T23:59:59.999Z';
  assert.throws(() => audit(backwards), /backwards/);
  for (const change of [value => { value.price_basis.rates_per_unit.input_tokens = '-1'; },
    value => { value.price_basis.rates_per_unit.input_tokens = 'Infinity'; }, value => { value.price_basis.source_text = ''; },
    value => { value.price_basis.as_of = '2026-10-32T00:00:00.000Z'; }, value => { value.price_basis.currency = ['USD']; }]) {
    const value = ledger(); change(value); assert.throws(() => audit(value), /price/);
  }
  const alias = ledger(); alias.response_pointers.usage.output_tokens = alias.response_pointers.usage.input_tokens;
  assert.throws(() => audit(alias), /usage components/);
});

test('invalid raw usage stays unavailable, never counted as measured zero', () => {
  const value = ledger(), attempt = value.items[0].attempts[0], raw = JSON.parse(attempt.response_raw);
  raw.usage.input_tokens = -1; raw.usage.output_tokens = 0.5; attempt.response_raw = JSON.stringify(raw);
  attempt.usage_unavailable_reason = 'provider fields are invalid counts';
  const report = audit(value);
  assert.deepEqual(report.items[0].attempts[0].usage, { input_tokens: null, output_tokens: null });
  assert.equal(report.cost.complete_usage_estimate, null); assert.equal(report.usage.input_tokens.known_subtotal, '28');
});

test('exact decimal rate arithmetic and changed report/raw ledger bytes are auditable', () => {
  const value = ledger(); value.price_basis.rates_per_unit = { input_tokens: '0.000000000001', output_tokens: '0' };
  const report = audit(value); assert.equal(report.cost.complete_usage_estimate, '0.00000000003');
  const changed = clone(report); changed.cost.complete_usage_estimate = '99';
  assert.throws(() => replayAttemptReport(ROOT, bytes(CONTRACT), BASE, Q, null, bytes(value), bytes(changed)), /offline replay/);
  assert.throws(() => replayAttemptReport(ROOT, bytes(CONTRACT), BASE, Q, null, Buffer.concat([bytes(value), Buffer.from(' ')]), bytes(report)), /offline replay/);
});

test('source packet equality binds all15 availability rows but never proves rights or absence completeness', () => {
  const input = bytes(packets()), contract = prepareAttemptContract(ROOT, BASE, Q, input);
  assert.equal(contract.source_parity.available, 15); assert.equal(contract.source_parity.rights.independently_verified, false);
  assert.ok(contract.source_parity.items.every(row => row.byte_parity === true && !row.independently_verified_complete && !row.unanswerable_requirement_satisfied));
  assert.equal(contract.execution.model_calls_authorized, false);
  const unavailable = packets(); Object.assign(unavailable.items[0], { available: false, unavailable_reason: 'not captured', source_assisted: null, mcp: null });
  const result = prepareAttemptContract(ROOT, BASE, Q, bytes(unavailable));
  assert.equal(result.source_parity.unavailable, 1); assert.equal(result.source_parity.items[0].byte_parity, null);
});

test('source packet divergence, omitted availability, uncleared rights or split Unicode truncation refuse', () => {
  for (const change of [value => { value.items[0].mcp.raw_text += ' '; value.items[0].mcp.supplied_text += ' '; },
    value => { value.items.pop(); }, value => { value.rights.status = 'unverified'; },
    value => { value.truncation_policy = { method: 'prefix', unit: 'utf16-code-units', limit: 1 };
      value.items[0].mcp = value.items[0].source_assisted = { raw_text: '\ud83d\ude00', supplied_text: '\ud83d' }; }]) {
    const value = packets(); change(value); assert.throws(() => prepareAttemptContract(ROOT, BASE, Q, bytes(value)), /packet|source|rights|byte bounds/);
  }
});

test('closed/source-assisted labels cannot bypass source-arm and tool-trace restrictions', () => {
  const assisted = ledger(); assisted.arm = 'source_assisted'; assert.throws(() => audit(assisted), /source-assisted remains held/);
  const closedSource = ledger(); closedSource.source_contract_sha256 = '0'.repeat(64); assert.throws(() => audit(closedSource), /source-arm binding/);
  const closedTool = ledger(); closedTool.items[0].attempts[0].tool_traces.push({});
  assert.throws(() => audit(closedTool), /closed ledger/);
});

test('MCP success packets and explicit tool errors retain full and supplied result bindings', () => {
  const input = packets(), raw = bytes(input), contract = prepareAttemptContract(ROOT, BASE, Q, raw), value = ledger(contract);
  value.arm = 'mcp'; value.source_contract_sha256 = sha256(canonicalJson(contract.source_parity));
  value.items[0].attempts[0].tool_traces = [
    { id: 'tool-success', name: 'fixture_numeric_source', status: 'result', error: null, arguments_raw: '{}',
      result_raw: input.items[0].mcp.raw_text, result_supplied: input.items[0].mcp.supplied_text },
    { id: 'tool-error', name: 'fixture_numeric_source', status: 'error', error: 'synthetic tool failure', arguments_raw: '{}',
      result_raw: 'synthetic tool failure', result_supplied: 'synthetic tool failure' },
  ];
  const report = audit(value, contract, raw);
  assert.equal(report.coverage.tool_calls, 2); assert.equal(report.coverage.failed_tool_calls, 1);
  assert.equal(report.items[0].attempts[0].tool_traces[0].raw.sha256, sha256(input.items[0].mcp.raw_text));
  value.items[0].attempts[0].tool_traces[0].result_supplied += ' changed';
  assert.throws(() => audit(value, contract, raw), /frozen source packet/);
});

test('changed accounting/scoring/data source bytes refuse without altering original fixtures', t => {
  const root = sandbox(t);
  for (const path of ['scripts/datasets/filing-facts/ATTEMPTS.md', 'scripts/datasets/filing-facts/eval.mjs', `${V0_DIRECTORY}/filing-facts-v0.jsonl`]) {
    const target = join(root, path), original = readFileSync(target); writeFileSync(target, Buffer.concat([original, Buffer.from('\nchanged fixture\n')]));
    assert.throws(() => prepareAttemptContract(root, BASE, Q), /implementation changed|loaded preparation|historical V0 bytes/);
    writeFileSync(target, original); assert.deepEqual(readFileSync(join(ROOT, path)), original);
  }
  assert.equal(prepareAttemptContract(root, BASE, Q).contract_sha256, CONTRACT.contract_sha256);
});

test('declared finite-bound violations remain reported with their failed/retry costs', () => {
  const value = addRetry(ledger()); value.bounds.attempts_per_item = 1;
  value.items[0].time.duration_ms = 30001;
  const report = audit(value);
  assert.ok(report.bounds_violations.some(row => row.reason.includes('declared attempts')));
  assert.ok(report.bounds_violations.some(row => row.reason.includes('observed attempt')));
  assert.ok(report.bounds_violations.some(row => row.reason.includes('duration')));
  assert.equal(report.cost.complete_usage_estimate, '6.1'); assert.equal(report.execution_authorized, false);
});

test('attempt durations exceeding the item cap remain visible with missing or understated item clocks', () => {
  for (const itemDuration of [null, 3]) {
    const value = ledger(), item = value.items[0], attempt = item.attempts[0];
    attempt.time.duration_ms = 30001; item.time.duration_ms = itemDuration;
    item.time.unavailable_reason = itemDuration === null ? 'item duration not captured' : null;
    const report = audit(value);
    assert.deepEqual(report.bounds_violations, [{ id: item.id, attempt_id: attempt.id, ordinal: 1,
      observed_duration_ms: 30001, reviewed_item_duration_ms: 30000,
      reason: 'observed attempt duration exceeds reviewed item bound' }]);
    assert.equal(report.cost.complete_usage_estimate, '6'); assert.equal(report.cost.known_component_subtotal, '6');
    assert.equal(report.latency.complete_attempt_duration_total_ms, 30029);
    assert.equal(report.items[0].time.duration_ms, itemDuration);
    assert.equal(report.latency.mean_item_duration_ms, itemDuration === null ? null : 3);
    assert.equal(report.execution_authorized, false);
  }
});

test('bounded raw/JSON inputs refuse without a resource exhaustion experiment', () => {
  const value = ledger(); value.items[0].attempts[0].request_raw = 'x'.repeat(MAX_RAW_BYTES + 1);
  assert.throws(() => audit(value), /request body exceeds/);
  assert.throws(() => auditAttemptLedger(ROOT, bytes(CONTRACT), BASE, Q, null, Buffer.alloc(MAX_JSON_BYTES + 1)), /bounded JSON input/);
});

test('offline CLI creates private exclusive outputs, replays them and refuses input overwrite', t => {
  const dir = mkdtempSync(join(tmpdir(), 'canli-attempt-cli-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = Object.fromEntries(['baseline', 'questions', 'contract', 'ledger', 'report'].map(name => [name, join(dir, `${name}.json`)]));
  writeFileSync(paths.baseline, BASE); writeFileSync(paths.questions, Q); writeFileSync(paths.ledger, bytes(ledger()));
  const args = command => [MODULE, command, ROOT, paths.baseline, paths.questions, '-', paths.contract,
    ...(command === 'prepare' ? [] : [paths.ledger, paths.report])];
  for (const command of ['prepare', 'audit', 'replay']) {
    const result = spawnSync(process.execPath, args(command), { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.error, undefined);
  }
  for (const path of [paths.contract, paths.report]) {
    const fd = openSync(path, 'r'); try { assert.equal(fstatSync(fd).mode & 0o777, 0o600); } finally { closeSync(fd); }
  }
  const original = readFileSync(paths.contract), result = spawnSync(process.execPath, args('prepare'), { encoding: 'utf8', timeout: 5000 });
  assert.notEqual(result.status, 0); assert.deepEqual(readFileSync(paths.contract), original);
});
