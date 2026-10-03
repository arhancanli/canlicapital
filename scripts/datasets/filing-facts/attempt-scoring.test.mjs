import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import child from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../../canonical-json.mjs';
import { createBaselineContract, projectQuestions, V0_DIRECTORY, V0_SHA256 } from './baseline-contract.mjs';
import { LEDGER_SCHEMA, prepareAttemptContract, auditAttemptLedger } from './attempt-accounting.mjs';
import { CONFIGURATION_SCHEMA, RESPONSE_SCHEMA, prepareCollectorPolicy, collectFixture, recoverFixture } from './attempt-collector.mjs';
import { readDataset, sha256 } from './evidence.mjs';
import { behaviour, scoreAnswer, stratifiedSample } from './eval.mjs';
import { ATTEMPT_SCORING_SCHEMA, ATTEMPT_SCORING_LIMITS, ATTEMPT_SCORING_SOURCE_FILES, scoreAttemptLedger, replayAttemptScoring } from './attempt-scoring.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TS = '2026-10-01T00:00:00.000Z';
const PURPOSE = 'synthetic-software-fixture';
const bytes = value => Buffer.from(JSON.stringify(value) + '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const BASELINE = createBaselineContract(ROOT), QUESTIONS = projectQuestions(ROOT, BASELINE);
const BASE = bytes(BASELINE), Q = bytes(QUESTIONS), CONTRACT = prepareAttemptContract(ROOT, BASE, Q);
const SAMPLE = stratifiedSample(readDataset(fs.readFileSync(join(ROOT, V0_DIRECTORY, 'filing-facts-v0.jsonl'))).items, 3, 20261001);
const answer = item => item.answer.kind === 'not_reported' ? 'ANSWER: not reported' : `ANSWER: ${item.answer.value}`;
const time = duration => ({ started_at: TS, ended_at: '2026-10-01T00:00:00.003Z', duration_ms: duration, unavailable_reason: null });
const unknownTime = () => ({ started_at: null, ended_at: null, duration_ms: null, unavailable_reason: 'synthetic clock unavailable' });
const price = () => ({ currency: 'USD', as_of: TS, provider: 'synthetic-fixture', model: 'fixture-model',
  source_text: 'SYNTHETIC SOFTWARE FIXTURE rates only; no pricing lookup or observed billing',
  units: { input_tokens: 'token', output_tokens: 'token' }, rates_per_unit: { input_tokens: '0.1', output_tokens: '0.2' } });
const pointers = () => ({ answer: '/answer', response_id: '/id', model: '/model',
  usage: { input_tokens: '/usage/input_tokens', output_tokens: '/usage/output_tokens' } });

function ledger() {
  return { schema: LEDGER_SCHEMA, purpose: PURPOSE, contract_sha256: CONTRACT.contract_sha256,
    question_projection_sha256: CONTRACT.questions.projection_sha256, source_contract_sha256: null, arm: 'closed',
    provider: 'synthetic-fixture', requested_model: 'fixture-model', generation_settings: { temperature: 0 },
    time_basis: 'caller-observed-monotonic-ms', bounds: { attempts_per_item: 8, item_duration_ms: 30000 },
    response_pointers: pointers(), price_basis: price(),
    items: QUESTIONS.questions.map((question, i) => {
      const text = answer(SAMPLE[i]);
      return { id: question.id, question_sha256: sha256(question.question), status: 'completed', error: null,
        declared_attempts: 1, final_attempt: 1, response_text: text, response_missing_reason: null, time: time(3),
        attempts: [{ id: `bridge-${i + 1}-1`, ordinal: 1, turn: 1, retry_of: null, status: 'response', http_status: 200,
          request_raw: JSON.stringify({ question: question.question }),
          response_raw: JSON.stringify({ id: `fixture-response-${i + 1}`, model: 'fixture-model', answer: text, usage: { input_tokens: 2, output_tokens: 1 } }),
          response_missing_reason: null, answer_text: text, answer_missing_reason: null, error: null,
          usage_unavailable_reason: null, time: time(2), tool_traces: [] }] };
    }) };
}
function inputs(value = ledger()) {
  return { accounting: bytes(CONTRACT), baseline: Buffer.from(BASE), questions: Buffer.from(Q), packets: null,
    ledger: Buffer.isBuffer(value) ? value : bytes(value) };
}
const score = (value, root = ROOT) => scoreAttemptLedger(root, inputs(value));
function setAnswer(item, text, position = item.attempts.length - 1) {
  const attempt = item.attempts[position], body = JSON.parse(attempt.response_raw); body.answer = text;
  attempt.response_raw = JSON.stringify(body); attempt.answer_text = text; attempt.answer_missing_reason = null;
  if (attempt.ordinal === item.final_attempt) item.response_text = text;
}
function twoAnswers(value, first, final) {
  const item = value.items[0], second = clone(item.attempts[0]);
  Object.assign(second, { id: 'bridge-1-2', ordinal: 2, turn: 2,
    request_raw: JSON.stringify({ question: QUESTIONS.questions[0].question, fixture_turn: 2 }) });
  item.attempts.push(second); item.final_attempt = 2; item.declared_attempts = 2;
  setAnswer(item, first, 0); setAnswer(item, final, 1); return value;
}
function sandbox(t) {
  const root = fs.mkdtempSync(join(tmpdir(), 'canli-scoring-source-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = new Set([...ATTEMPT_SCORING_SOURCE_FILES, ...Object.keys(BASELINE.context),
    ...Object.keys(V0_SHA256).map(name => `${V0_DIRECTORY}/${name}`)]);
  for (const path of paths) { fs.mkdirSync(dirname(join(root, path)), { recursive: true }); fs.copyFileSync(join(ROOT, path), join(root, path)); }
  return root;
}
function patched(target, replacements, fn) {
  const previous = Object.fromEntries(Object.keys(replacements).map(key => [key, target[key]]));
  Object.assign(target, replacements); syncBuiltinESMExports();
  try { return fn(); } finally { Object.assign(target, previous); syncBuiltinESMExports(); }
}
function rehash(artifact) {
  const value = clone(artifact); value.measurement_sha256 = sha256(canonicalJson(value.measurement));
  delete value.artifact_sha256; value.artifact_sha256 = sha256(canonicalJson(value)); return bytes(value);
}

test('full correct fixed cohort retains exact accounting companion and deterministically replays fifteen rows', () => {
  const supplied = inputs(), result = scoreAttemptLedger(ROOT, supplied), artifact = result.artifact;
  assert.equal(artifact.schema, ATTEMPT_SCORING_SCHEMA); assert.equal(artifact.summary.selected_items, 15);
  assert.equal(artifact.summary.correct, 15); assert.equal(artifact.summary.accuracy, 1);
  assert.equal(artifact.summary.behaviour.answerable, 12); assert.equal(artifact.summary.behaviour.unanswerable, 3);
  assert.equal(artifact.summary.behaviour.numbers_given, 12); assert.equal(artifact.summary.behaviour.numbers_wrong, 0);
  assert.deepEqual(artifact.measurement, auditAttemptLedger(ROOT, supplied.accounting, supplied.baseline, supplied.questions, null, supplied.ledger));
  assert.equal(artifact.measurement_sha256, sha256(canonicalJson(artifact.measurement)));
  assert.equal(artifact.implementation[`${'scripts/datasets/filing-facts'}/attempt-scoring.mjs`].sha256,
    sha256(fs.readFileSync(new URL('attempt-scoring.mjs', import.meta.url))));
  assert.equal(artifact.model_baseline, false); assert.equal(artifact.observed_billing_verified, false);
  assert.equal(artifact.execution_authorized, false); assert.equal(artifact.measurement.cost.actual_billed_total, null);
  assert.equal(Object.isFrozen(artifact.measurement.items), true);
  assert.deepEqual(result.artifact_bytes, scoreAttemptLedger(ROOT, supplied).artifact_bytes);
  assert.equal(replayAttemptScoring(ROOT, supplied, result.artifact_bytes).selected_items, 15);
});

test('mixed wrong units abstention malformed answers and formatted numeric invention preserve original scorer behaviour', () => {
  const value = ledger(), number = SAMPLE.findIndex(item => item.answer.kind === 'number'), absence = SAMPLE.findIndex(item => item.answer.kind === 'not_reported');
  setAnswer(value.items[number], `ANSWER: ${SAMPLE[number].answer.value} EUR`);
  const others = SAMPLE.map((item, i) => i).filter(i => i !== number && i !== absence && SAMPLE[i].template !== 'unanswerable');
  setAnswer(value.items[others[0]], 'ANSWER: not available'); setAnswer(value.items[others[1]], 'ANSWER: nonsense');
  setAnswer(value.items[absence], 'ANSWER: $1,000.00 USD');
  const artifact = score(value).artifact;
  const expected = SAMPLE.map((item, i) => ({ template: item.template, ...scoreAnswer(item, value.items[i].response_text) }));
  assert.deepEqual(artifact.summary.behaviour, behaviour(expected));
  assert.equal(artifact.rows[number].correct, false); assert.equal(typeof artifact.rows[number].parsed, 'number');
  assert.equal(artifact.rows[absence].parsed, 1000); assert.equal(artifact.rows[absence].correct, false);
  assert.equal(artifact.summary.behaviour.numbers_given, 10); assert.equal(artifact.summary.behaviour.numbers_wrong, 1 / 10);
  assert.equal(artifact.summary.behaviour.unanswerable_invented_number, 1 / 3);
  assert.equal(artifact.summary.behaviour.answerable_abstention, 1 / 12);
  assert.equal(Object.values(artifact.summary.by_template).every(row => row.selected_items === 3), true);
});

test('all abstentions keep full answerable denominators and numbers_wrong null rather than invented zero', () => {
  const value = ledger(); for (const item of value.items) setAnswer(item, 'ANSWER: not reported');
  const artifact = score(value).artifact;
  assert.equal(artifact.summary.accuracy, 3 / 15); assert.equal(artifact.summary.behaviour.numbers_given, 0);
  assert.equal(artifact.summary.behaviour.numbers_wrong, null); assert.equal(artifact.summary.behaviour.answerable_abstention, 1);
});

test('earlier correct final wrong and earlier wrong final correct each score only the named last attempt', () => {
  const correct = answer(SAMPLE[0]), wrong = 'ANSWER: 123456789012345';
  for (const [first, final, ok] of [[correct, wrong, false], [wrong, correct, true]]) {
    const artifact = score(twoAnswers(ledger(), first, final)).artifact;
    assert.equal(artifact.rows[0].scored_attempt, 2); assert.equal(artifact.rows[0].answer_text, final);
    assert.equal(artifact.rows[0].correct, ok); assert.equal(artifact.measurement.coverage.recorded_attempts, 16);
    assert.equal(artifact.measurement.items[0].attempts[0].answer_text, first);
  }
});

test('raw429 followed by an explicit retry preserves failed usage costs and retry accounting', () => {
  const value = ledger(), item = value.items[0], second = clone(item.attempts[0]);
  Object.assign(second, { id: 'bridge-1-2', ordinal: 2, retry_of: 1 }); item.attempts.push(second);
  item.final_attempt = 2; item.declared_attempts = 2;
  Object.assign(item.attempts[0], { status: 'http_error', http_status: 429, error: 'synthetic429',
    response_raw: JSON.stringify({ model: 'fixture-model', error: 'synthetic429', usage: { input_tokens: 1, output_tokens: 0 } }),
    answer_text: null, answer_missing_reason: 'error response has no answer', time: time(5) });
  const artifact = score(value).artifact;
  assert.equal(artifact.summary.correct, 15); assert.equal(artifact.measurement.coverage.retry_attempts, 1);
  assert.equal(artifact.measurement.coverage.failed_or_aborted_attempts, 1);
  assert.equal(artifact.measurement.usage.input_tokens.complete_total, '31');
  assert.equal(artifact.measurement.cost.complete_usage_estimate, '6.1');
  assert.equal(artifact.measurement.items[0].attempts[0].http_status, 429);
});

test('missing error aborted not-started incomplete and pending records all remain denominator failures', () => {
  const value = ledger(); value.items.splice(0, 1);
  for (const [i, status] of [[0, 'error'], [1, 'aborted'], [2, 'incomplete']]) {
    value.items[i].status = status; value.items[i].error = status === 'incomplete' ? null : `synthetic ${status}`;
  }
  Object.assign(value.items[3], { status: 'not_started', declared_attempts: 0, final_attempt: null, response_text: null,
    response_missing_reason: 'not started', attempts: [], time: unknownTime() });
  const pending = value.items[4];
  Object.assign(pending, { status: 'incomplete', declared_attempts: null, final_attempt: null, response_text: null,
    response_missing_reason: 'pending', time: unknownTime() });
  Object.assign(pending.attempts[0], { status: 'pending', http_status: null, response_raw: null, response_missing_reason: 'pending',
    answer_text: null, answer_missing_reason: 'pending', usage_unavailable_reason: 'pending', time: unknownTime() });
  const artifact = score(value).artifact;
  assert.deepEqual(artifact.rows.slice(0, 6).map(row => row.status), ['missing_record', 'error', 'aborted', 'incomplete', 'not_started', 'pending']);
  assert.equal(artifact.summary.selected_items, 15); assert.equal(artifact.summary.correct, 9);
  assert.equal(artifact.summary.accuracy, 9 / 15); assert.equal(artifact.summary.behaviour.answerable, 12);
  assert.equal(artifact.rows.slice(0, 6).every(row => !row.answered && !row.correct && row.parsed === null), true);
  assert.equal(artifact.measurement.coverage.pending_attempts, 1);
});

test('completed labels with undeclared or missing earlier attempt positions become explicit incomplete rows', () => {
  for (const missing of [false, true]) {
    const value = ledger(), item = value.items[0]; item.declared_attempts = missing ? 2 : null;
    if (missing) { item.final_attempt = 2; item.attempts[0].ordinal = 2; }
    const artifact = score(value).artifact;
    assert.equal(artifact.rows[0].record_status, 'completed'); assert.equal(artifact.rows[0].status, 'incomplete');
    assert.equal(artifact.rows[0].scored_attempt, null); assert.equal(artifact.summary.correct, 14);
  }
});

test('blank or missing ANSWER markers stay denominator failures and absent final raw bindings are refused', () => {
  const value = ledger(); setAnswer(value.items[0], ''); setAnswer(value.items[1], 'reasoning only');
  const artifact = score(value).artifact;
  assert.equal(artifact.rows[0].status, 'blank_response'); assert.equal(artifact.rows[1].status, 'no_final_answer');
  assert.equal(artifact.summary.correct, 13);
  const invalid = ledger(); invalid.items[0].final_attempt = null;
  assert.throws(() => score(invalid), /raw attempt binding|final raw successful|named attempt/);
});

test('all missing captures preserve full cohort and unavailable usage latency price and billing', () => {
  const value = ledger(); value.items = []; value.price_basis = null;
  const artifact = score(value).artifact;
  assert.equal(artifact.summary.correct, 0); assert.equal(artifact.summary.selected_items, 15);
  assert.equal(artifact.summary.behaviour.numbers_wrong, null); assert.equal(artifact.measurement.coverage.missing_items, 15);
  assert.equal(artifact.measurement.usage.input_tokens.known_subtotal, null);
  assert.equal(artifact.measurement.latency.mean_attempt_duration_ms, null);
  assert.equal(artifact.measurement.cost.complete_usage_estimate, null); assert.equal(artifact.measurement.cost.actual_billed_total, null);
});

test('incomplete usage and clocks retain nulls with labeled known subtotals without affecting valid final scoring', () => {
  const value = ledger(), item = value.items[0], attempt = item.attempts[0], body = JSON.parse(attempt.response_raw);
  delete body.usage.output_tokens; attempt.response_raw = JSON.stringify(body); attempt.usage_unavailable_reason = 'synthetic missing output usage';
  attempt.time = unknownTime(); item.time = unknownTime();
  const artifact = score(value).artifact;
  assert.equal(artifact.summary.correct, 15); assert.equal(artifact.measurement.items[0].attempts[0].usage.output_tokens, null);
  assert.equal(artifact.measurement.usage.output_tokens.known_subtotal, '14');
  assert.equal(artifact.measurement.usage.output_tokens.complete_total, null);
  assert.equal(artifact.measurement.cost.known_component_subtotal, '5.8');
  assert.equal(artifact.measurement.cost.complete_usage_estimate, null);
  assert.equal(artifact.measurement.latency.complete_attempt_duration_total_ms, null);
  value.price_basis = null; assert.equal(score(value).artifact.measurement.cost.known_component_subtotal, null);
});

test('malformed retained raw error responses preserve unavailable measurements and cannot become scored answers', () => {
  const value = ledger(), item = value.items[0], attempt = item.attempts[0];
  Object.assign(item, { status: 'error', error: 'synthetic malformed', final_attempt: null, response_text: null, response_missing_reason: 'malformed' });
  Object.assign(attempt, { status: 'transport_error', error: 'synthetic malformed', response_raw: '{broken JSON',
    answer_text: null, answer_missing_reason: 'malformed', usage_unavailable_reason: 'malformed' });
  const artifact = score(value).artifact;
  assert.equal(artifact.rows[0].status, 'error'); assert.equal(artifact.measurement.items[0].attempts[0].usage.input_tokens, null);
  assert.equal(artifact.inputs.ledger.sha256, sha256(bytes(value)));
});

function collector(t, count = 15) {
  const home = fs.mkdtempSync(join(tmpdir(), 'canli-scoring-collector-')); fs.chmodSync(home, 0o700);
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const configuration = { schema: CONFIGURATION_SCHEMA, purpose: PURPOSE, arm: 'closed', provider: 'synthetic-fixture', requested_model: 'fixture-model',
    generation_settings: { temperature: 0 }, response_pointers: pointers(), price_basis: price(),
    limits: { attempts_per_item: 8, turns_per_item: 6, item_duration_ms: 30000 },
    items: QUESTIONS.questions.slice(0, count).map((question, i) => ({ id: question.id, steps: [{ id: `collector-${i + 1}-1`, turn: 1,
      retry_of: null, request_raw: JSON.stringify({ question: question.question }), trigger: 'start', http_statuses: [], delay_ms: 0, reason: null }] })) };
  const supplied = { baseline: Buffer.from(BASE), questions: Buffer.from(Q), packets: null, accounting: bytes(CONTRACT), configuration: bytes(configuration) };
  return { home, supplied, policy: bytes(prepareCollectorPolicy(ROOT, supplied)) };
}
function envelope(text) {
  return bytes({ schema: RESPONSE_SCHEMA, purpose: PURPOSE, http_status: 200, error: null, tools: [],
    response_raw: JSON.stringify({ id: 'synthetic-response', model: 'fixture-model', answer: text, usage: { input_tokens: 2, output_tokens: 1 } }) });
}
const snapshot = home => Object.fromEntries(fs.readdirSync(home).sort().map(name => [name, sha256(fs.readFileSync(join(home, name)))]));

test('delivered collector completes actual synthetic capture and read-only recovery then scoring and replay', async t => {
  const s = collector(t); let calls = 0, tick = 0;
  const output = await collectFixture(ROOT, s.supplied, s.policy, s.home, { monotonic: () => ++tick, wall: () => TS,
    transport: request => { calls++; return envelope(answer(SAMPLE.find(item => item.question === JSON.parse(request.request_raw).question))); } });
  assert.equal(calls, 15); assert.equal(output.finalized, true);
  const before = snapshot(s.home), recovered = recoverFixture(ROOT, s.supplied, s.policy, s.home);
  assert.deepEqual(recovered.ledger_bytes, output.ledger_bytes); assert.deepEqual(snapshot(s.home), before); assert.equal(calls, 15);
  const supplied = inputs(output.ledger_bytes), result = scoreAttemptLedger(ROOT, supplied);
  assert.equal(result.artifact.summary.correct, 15); assert.deepEqual(result.artifact.measurement, recovered.report);
  assert.equal(replayAttemptScoring(ROOT, supplied, result.artifact_bytes).model_baseline, false);
});

test('collector interruption after raw persistence recovers pending without resubmission and keeps full denominator', async t => {
  const s = collector(t, 1); let calls = 0, tick = 0;
  const io = { ...fs, openSync(path, flags, mode) {
    if ((flags & fs.constants.O_CREAT) && basename(path) === 'event-0004.json') throw new Error('synthetic terminal-open failure');
    return fs.openSync(path, flags, mode);
  } };
  await assert.rejects(collectFixture(ROOT, s.supplied, s.policy, s.home, { io, monotonic: () => ++tick, wall: () => TS,
    transport: () => { calls++; return envelope(answer(SAMPLE[0])); } }), { code: 'FIXTURE_COLLECTOR_UNCERTAIN' });
  assert.equal(calls, 1); const before = snapshot(s.home), recovered = recoverFixture(ROOT, s.supplied, s.policy, s.home);
  assert.equal(recovered.finalized, false); assert.equal(recovered.report.coverage.pending_attempts, 1);
  const artifact = score(recovered.ledger_bytes).artifact;
  assert.equal(artifact.rows[0].status, 'pending'); assert.equal(artifact.summary.correct, 0);
  assert.equal(artifact.summary.selected_items, 15); assert.deepEqual(snapshot(s.home), before); assert.equal(calls, 1);
});

test('non-synthetic purposes arms providers observed models packets and tool traces are refused before scoring', () => {
  const changes = [v => { v.purpose = 'local-unverified-capture'; }, v => { v.arm = 'mcp'; }, v => { v.arm = 'source-assisted'; },
    v => { v.provider = 'real-provider'; }, v => { v.requested_model = 'real-model'; },
    v => { const b = JSON.parse(v.items[0].attempts[0].response_raw); b.model = 'real-model'; v.items[0].attempts[0].response_raw = JSON.stringify(b); },
    v => { v.items[0].attempts[0].tool_traces = [{}]; }, v => { v.price_basis.model = 'real-model'; }];
  for (const change of changes) { const value = ledger(); change(value); assert.throws(() => score(value)); }
  assert.throws(() => scoreAttemptLedger(ROOT, { ...inputs(), packets: bytes({}) }), /packets must be null/);
});

test('source context hidden request fields response metadata and settings metadata cannot enter a closed fixture', () => {
  for (const kind of ['request', 'response', 'settings']) {
    const value = ledger();
    if (kind === 'request') value.items[0].attempts[0].request_raw = JSON.stringify({ question: QUESTIONS.questions[0].question, context: 'fixture source' });
    if (kind === 'response') { const b = JSON.parse(value.items[0].attempts[0].response_raw); b.nested = { tool_metadata: [] }; value.items[0].attempts[0].response_raw = JSON.stringify(b); }
    if (kind === 'settings') value.generation_settings = { context: 'fixture source' };
    assert.throws(() => score(value), /unsupported|metadata/);
  }
  const value = ledger(); value.items[0].attempts[0].request_raw = JSON.stringify({ question: QUESTIONS.questions[1].question });
  assert.throws(() => score(value), /exact question-only/);
});

test('baseline expected sample question projection accounting and raw answer binding tampering are refused', () => {
  for (const change of [s => { const v = clone(BASELINE); v.bindings[0].expected_sha256 = '0'.repeat(64); s.baseline = bytes(v); },
    s => { const v = clone(BASELINE); v.sampling.item_ids.reverse(); s.baseline = bytes(v); },
    s => { const v = clone(QUESTIONS); v.questions[0].question += ' changed'; s.questions = bytes(v); },
    s => { const v = clone(CONTRACT); v.contract_sha256 = '0'.repeat(64); s.accounting = bytes(v); },
    s => { const v = ledger(); v.items[0].attempts[0].answer_text += 'changed'; s.ledger = bytes(v); }]) {
    const supplied = inputs(); change(supplied); assert.throws(() => scoreAttemptLedger(ROOT, supplied));
  }
});

test('physically changed dataset bytes fail same-buffer binding before scoring without touching the repository', t => {
  const root = sandbox(t), path = join(root, V0_DIRECTORY, 'filing-facts-v0.jsonl');
  fs.appendFileSync(path, ' '); assert.throws(() => score(ledger(), root), /same scoring dataset buffer/);
});

test('transient same-length scoring read swap cannot hash one dataset and parse another', t => {
  const root = sandbox(t), target = join(root, V0_DIRECTORY, 'filing-facts-v0.jsonl');
  const open = fs.openSync, read = fs.readSync, close = fs.closeSync; const descriptors = new Set(); let hits = 0;
  patched(fs, {
    openSync(path, ...args) { const fd = open(path, ...args); if (String(path) === target) descriptors.add(fd); return fd; },
    readSync(fd, buffer, offset, length, position) { const count = read(fd, buffer, offset, length, position);
      if (descriptors.has(fd) && count > 0 && position === 0) { buffer[offset] = 32; hits++; } return count; },
    closeSync(fd) { descriptors.delete(fd); return close(fd); },
  }, () => assert.throws(() => score(ledger(), root), /same scoring dataset buffer/));
  assert.equal(hits, 1); assert.equal(sha256(fs.readFileSync(target)), BASELINE.dataset.sha256);
});

test('post-load comment changes in every scoring helper and the whole new module or guide are refused', t => {
  const root = sandbox(t);
  for (const relative of ATTEMPT_SCORING_SOURCE_FILES) {
    const path = join(root, relative), original = fs.readFileSync(path);
    fs.appendFileSync(path, '\n// synthetic changed comment\n'); assert.throws(() => score(ledger(), root), /implementation changed/);
    fs.writeFileSync(path, original);
  }
  assert.equal(score(ledger(), root).artifact.summary.correct, 15);
});

test('whole-module comment mutation during captured dataset read is caught by post-scoring source recheck', t => {
  const root = sandbox(t), target = join(root, V0_DIRECTORY, 'filing-facts-v0.jsonl'), module = join(root, 'scripts/datasets/filing-facts/attempt-scoring.mjs');
  const open = fs.openSync, read = fs.readSync, close = fs.closeSync; const descriptors = new Set(); let hits = 0;
  patched(fs, {
    openSync(path, ...args) { const fd = open(path, ...args); if (String(path) === target) descriptors.add(fd); return fd; },
    readSync(fd, buffer, offset, length, position) { const count = read(fd, buffer, offset, length, position);
      if (descriptors.has(fd) && count > 0 && !hits) { hits++; fs.appendFileSync(module, '\n// changed after initial source capture\n'); } return count; },
    closeSync(fd) { descriptors.delete(fd); return close(fd); },
  }, () => assert.throws(() => score(ledger(), root), /implementation changed/));
  assert.equal(hits, 1);
});

test('rehashed row score status measurement implementation and input tampering are rejected by full replay', () => {
  const supplied = inputs(), result = scoreAttemptLedger(ROOT, supplied);
  for (const change of [v => { v.rows[0].correct = false; }, v => { v.rows[0].status = 'error'; },
    v => { v.summary.accuracy = 0; }, v => { v.measurement.usage.input_tokens.known_subtotal = '999'; },
    v => { v.implementation[ATTEMPT_SCORING_SOURCE_FILES[0]].sha256 = '0'.repeat(64); },
    v => { v.inputs.ledger.sha256 = '0'.repeat(64); }]) {
    const artifact = clone(result.artifact); change(artifact);
    assert.throws(() => replayAttemptScoring(ROOT, supplied, rehash(artifact)), /differs from full/);
  }
  const artifact = clone(result.artifact); artifact.artifact_sha256 = [artifact.artifact_sha256];
  assert.throws(() => replayAttemptScoring(ROOT, supplied, bytes(artifact)), /primitive SHA/);
});

test('native input admission refuses parsed strings shared arrays proxies getters and unknown members without invoking hooks', () => {
  let hooks = 0; const supplied = inputs();
  for (const value of ['{}', {}, new DataView(new ArrayBuffer(8)), new Uint8Array(new SharedArrayBuffer(8)),
    new Proxy(Buffer.from('{}'), { get() { hooks++; throw new Error('hook'); } })]) {
    assert.throws(() => scoreAttemptLedger(ROOT, { ...supplied, ledger: value }), /native|non-shared/);
  }
  const getter = { ...supplied }; Object.defineProperty(getter, 'ledger', { get() { hooks++; throw new Error('hook'); }, enumerable: true });
  assert.throws(() => scoreAttemptLedger(ROOT, getter), /native data members/);
  assert.throws(() => scoreAttemptLedger(ROOT, new Proxy(supplied, { ownKeys() { hooks++; throw new Error('hook'); } })), /closed data object/);
  assert.throws(() => scoreAttemptLedger(ROOT, { ...supplied, transport() { hooks++; } }), /exactly native/);
  assert.equal(hooks, 0);
});

test('intrinsic byte views ignore hostile own length getters and input copies precede source filesystem callbacks', () => {
  const supplied = inputs(), expected = sha256(supplied.ledger); let hooks = 0, hits = 0;
  Object.defineProperty(supplied.ledger, 'byteLength', { get() { hooks++; throw new Error('hook'); } });
  const open = fs.openSync;
  const result = patched(fs, { openSync(...args) { if (!hits++) supplied.ledger.fill(0); return open(...args); } },
    () => scoreAttemptLedger(ROOT, supplied));
  assert.equal(hooks, 0); assert.ok(hits > 0); assert.equal(result.artifact.inputs.ledger.sha256, expected);
  assert.equal(result.artifact.summary.correct, 15);
});

test('oversized native fields are refused before any source open or owned allocation', () => {
  const supplied = inputs(), tooLarge = Buffer.alloc(ATTEMPT_SCORING_LIMITS.ledger + 1); let effects = 0;
  const original = Buffer.alloc;
  patched(fs, { openSync() { effects++; throw new Error('source open'); } }, () => {
    Buffer.alloc = () => { effects++; throw new Error('owned allocation'); };
    try { assert.throws(() => scoreAttemptLedger(ROOT, { ...supplied, ledger: tooLarge }), /native byte bound/); }
    finally { Buffer.alloc = original; }
  });
  assert.equal(effects, 0);
});

test('invalid UTF8 duplicate members lone surrogates nonfinite JSON and excessive nesting are refused', () => {
  const raws = [Buffer.from([0xff]), Buffer.from('{"purpose":"x","purpose":"y"}'), Buffer.from('{"x":"\\ud800"}'),
    Buffer.from('{"x":1e999}'), Buffer.from('['.repeat(42) + '0' + ']'.repeat(42))];
  for (const raw of raws) assert.throws(() => scoreAttemptLedger(ROOT, { ...inputs(), ledger: raw }));
  const value = ledger(); value.items[0].attempts[0].response_raw = '{"model":"fixture-model","model":"fixture-model"}';
  assert.throws(() => score(value), /duplicate JSON/);
});

test('bounded raw ASCII NUL BMP and astral answers reserve full canonical expansion before derived encoding', () => {
  for (const text of ['x'.repeat(30000), '\0'.repeat(4100), 'é'.repeat(4100), '😀'.repeat(2050)]) {
    const value = ledger(); for (const item of value.items) setAnswer(item, `ANSWER: ${text}`);
    assert.ok(Buffer.byteLength(value.items[0].attempts[0].response_raw) < 64 * 1024);
    assert.throws(() => score(value), /derived encoded byte bound/);
  }
  const value = ledger(); setAnswer(value.items[0], 'ANSWER: \0é😀');
  const result = score(value); assert.ok(result.artifact_bytes.length < ATTEMPT_SCORING_LIMITS.artifact);
  assert.equal(result.artifact_bytes.toString().includes('\\u0000\\u00e9\\ud83d\\ude00'), true);
  assert.equal(replayAttemptScoring(ROOT, inputs(value), result.artifact_bytes).selected_items, 15);
});

test('settings raw request response and replay artifact each enforce their separate finite byte caps', () => {
  const settings = ledger(); settings.generation_settings = { fixture_setting: 'é'.repeat(3000) };
  assert.throws(() => score(settings), /derived encoded byte bound/);
  for (const field of ['request_raw', 'response_raw']) { const value = ledger(); value.items[0].attempts[0][field] = 'x'.repeat(65537); assert.throws(() => score(value), /raw byte bound/); }
  assert.throws(() => replayAttemptScoring(ROOT, inputs(), Buffer.alloc(ATTEMPT_SCORING_LIMITS.artifact + 1)), /native byte bound/);
});

test('one-descriptor nonblocking read refuses symlink nonregular oversize and changed metadata before scoring', t => {
  const root = sandbox(t), target = join(root, V0_DIRECTORY, 'filing-facts-v0.jsonl');
  const original = fs.readFileSync(target); fs.unlinkSync(target); fs.symlinkSync(join(ROOT, V0_DIRECTORY, 'filing-facts-v0.jsonl'), target);
  assert.throws(() => score(ledger(), root)); fs.unlinkSync(target); fs.writeFileSync(target, original);
  const stat = fs.fstatSync; let calls = 0;
  patched(fs, { fstatSync(...args) { const value = stat(...args); calls++; return { ...value, isFile: () => false }; } },
    () => assert.throws(() => score(ledger(), root), /bounded regular file/)); assert.equal(calls, 1);
  calls = 0;
  patched(fs, { fstatSync(...args) { const value = stat(...args); calls++; return {
    ...value, isFile: () => true, size: BigInt(ATTEMPT_SCORING_LIMITS.implementation_file + 1) }; } },
    () => assert.throws(() => score(ledger(), root), /bounded regular file/)); assert.equal(calls, 1);
  calls = 0;
  patched(fs, { fstatSync(...args) { const value = stat(...args); calls++; return calls % 2 === 0 ?
    { ...value, isFile: () => true, mtimeNs: value.mtimeNs + 1n } : value; } },
    () => assert.throws(() => score(ledger(), root), /changed during read/)); assert.equal(calls, 2);
});

test('close-after-close failure does not retry a reused unrelated descriptor or acknowledge scoring', t => {
  const root = sandbox(t), target = join(root, V0_DIRECTORY, 'filing-facts-v0.jsonl');
  const open = fs.openSync, close = fs.closeSync; let selected, reused, hits = 0;
  try {
    patched(fs, {
      openSync(path, ...args) { const fd = open(path, ...args); if (String(path) === target) selected = fd; return fd; },
      closeSync(fd) { close(fd); if (fd === selected && !hits++) { reused = open(join(root, 'scripts/datasets/filing-facts/ATTEMPT_SCORING.md'), fs.constants.O_RDONLY); assert.equal(reused, fd); throw new Error('synthetic close-after-close'); } },
    }, () => assert.throws(() => score(ledger(), root), /synthetic close-after-close/));
    assert.equal(hits, 1); assert.ok(fs.fstatSync(reused).isFile());
  } finally { if (reused !== undefined) close(reused); }
});

test('network process and credential positive guards stay untouched by scorer replay and root dataset reads stay read-only', () => {
  const supplied = inputs(), before = Object.fromEntries([...ATTEMPT_SCORING_SOURCE_FILES,
    ...Object.keys(V0_SHA256).map(name => `${V0_DIRECTORY}/${name}`)].map(path => [path, sha256(fs.readFileSync(join(ROOT, path)))]));
  let effects = 0, writes = 0, credentialReads = 0;
  const guard = () => { effects++; throw new Error('synthetic effect blocked'); };
  const saved = [];
  for (const [target, names] of [[http, ['request', 'get']], [https, ['request', 'get']], [net, ['connect', 'createConnection']],
    [tls, ['connect']], [child, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']], [globalThis, ['fetch']]]) {
    for (const name of names) { saved.push([target, name, target[name]]); target[name] = guard; assert.throws(() => target[name](), /synthetic effect blocked/); }
  }
  syncBuiltinESMExports(); assert.ok(effects >= 15); effects = 0;
  const readFile = fs.readFileSync, open = fs.openSync;
  try {
    patched(fs, {
      openSync(path, flags, ...args) { if (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC)) { writes++; throw new Error('write blocked'); } return open(path, flags, ...args); },
      readFileSync(path, ...args) { if (/credentials|\.env|\.config|\/\.vercel|auth\.json/.test(String(path))) { credentialReads++; throw new Error('credential read blocked'); } return readFile(path, ...args); },
      writeFileSync() { writes++; throw new Error('write blocked'); },
    }, () => {
      const result = scoreAttemptLedger(ROOT, supplied); assert.equal(replayAttemptScoring(ROOT, supplied, result.artifact_bytes).selected_items, 15);
    });
  } finally { for (const [target, name, original] of saved) target[name] = original; syncBuiltinESMExports(); }
  assert.equal(effects, 0); assert.equal(writes, 0); assert.equal(credentialReads, 0);
  for (const [path, expected] of Object.entries(before)) assert.equal(sha256(fs.readFileSync(join(ROOT, path))), expected);
});
