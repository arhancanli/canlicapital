// Offline synthetic scoring only. No collector dispatch, provider, CLI or writes.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

import { canonicalJson, pythonNumber } from '../../canonical-json.mjs';
import { auditAttemptLedger, MAX_RAW_BYTES } from './attempt-accounting.mjs';
import { V0_DIRECTORY } from './baseline-contract.mjs';
import { behaviour, scoreAnswer, stratifiedSample } from './eval.mjs';
import { readDataset, SCORING_SOURCE_FILES, sha256 } from './evidence.mjs';

export const ATTEMPT_SCORING_SCHEMA = 'canli.filing-facts-attempt-scoring.v1';
export const ATTEMPT_SCORING_LIMITS = Object.freeze({
  accounting: 256 * 1024,
  baseline: 256 * 1024,
  questions: 256 * 1024,
  ledger: 8 * 1024 * 1024,
  supplied_total: 9 * 1024 * 1024,
  artifact: 1024 * 1024,
  replay_supplied_total: 10 * 1024 * 1024,
  dataset: 8 * 1024 * 1024,
  implementation_file: 128 * 1024,
  json_depth: 40,
  json_nodes: 200000,
  generation_settings: 16 * 1024,
});

const HERE = 'scripts/datasets/filing-facts';
const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const ATTEMPT_SCORING_SOURCE_FILES = Object.freeze([...new Set([
  ...SCORING_SOURCE_FILES.map(name => normalize(join(HERE, name))),
  ...['baseline-contract.mjs', 'baseline-contract-cli.mjs', 'BASELINE.md',
    'attempt-accounting.mjs', 'ATTEMPTS.md', 'attempt-scoring.mjs', 'ATTEMPT_SCORING.md'].map(name => `${HERE}/${name}`),
])].sort());
const HASH = /^[0-9a-f]{64}$/;
const ZERO_HASH = '0'.repeat(64);
const INPUTS = ['accounting', 'baseline', 'questions', 'packets', 'ledger'];
const TYPED = Object.getPrototypeOf(Uint8Array.prototype);
const SLOT = Object.fromEntries(['buffer', 'byteLength', 'byteOffset'].map(name =>
  [name, Object.getOwnPropertyDescriptor(TYPED, name).get]));
const ARRAY_LENGTH = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const COPY = Uint8Array.prototype.set;
const FORBIDDEN = new Set(['source', 'sources', 'context', 'source_context', 'source_packets',
  'source_assisted', 'tools', 'tool', 'tool_calls', 'tool_traces', 'tool_metadata', 'mcp', 'messages', 'prompt']);

function fail(message, code = 'ATTEMPT_SCORING_REFUSED') {
  const error = new RangeError(`attempt scoring: ${message}`); error.code = code; throw error;
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pin = bytes => ({ bytes: bytes.length, sha256: sha256(bytes) });
const hash = value => sha256(canonicalJson(value));
const isHash = value => typeof value === 'string' && HASH.test(value);

function keys(value, allowed, required = allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) fail('unsupported or missing members');
}

// Resolve neither getters nor caller iterators. Intrinsic slots also reject forged views.
function native(value, label, limit) {
  if (types.isProxy(value) || !types.isUint8Array(value)) fail(`${label} must be native non-shared byte input`);
  let buffer, length, offset;
  try {
    buffer = SLOT.buffer.call(value); length = SLOT.byteLength.call(value); offset = SLOT.byteOffset.call(value);
    ARRAY_LENGTH.call(buffer); // Throws for SharedArrayBuffer.
    new Uint8Array(buffer, offset, length); // Throws for a detached ArrayBuffer.
  } catch { fail(`${label} must be attached non-shared byte input`); }
  if (length > limit) fail(`${label} exceeds native byte bound`);
  return { buffer, length, offset };
}

function capture(inputs, artifactInput, replay) {
  if (types.isProxy(inputs) || !object(inputs) || ![Object.prototype, null].includes(Object.getPrototypeOf(inputs))) fail('inputs must be a closed data object');
  const descriptors = Object.getOwnPropertyDescriptors(inputs);
  if (Reflect.ownKeys(descriptors).length !== INPUTS.length || INPUTS.some(key => !Object.hasOwn(descriptors, key)) ||
      Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !INPUTS.includes(key)) ||
      INPUTS.some(key => !Object.hasOwn(descriptors[key], 'value'))) fail('inputs must contain exactly native data members');
  if (descriptors.packets.value !== null) fail('source packets are held; packets must be null');
  const views = Object.fromEntries(INPUTS.filter(key => key !== 'packets').map(key =>
    [key, native(descriptors[key].value, key, ATTEMPT_SCORING_LIMITS[key])]));
  if (replay) views.artifact = native(artifactInput, 'artifact', ATTEMPT_SCORING_LIMITS.artifact);
  const total = Object.values(views).reduce((sum, view) => sum + view.length, 0);
  const limit = replay ? ATTEMPT_SCORING_LIMITS.replay_supplied_total : ATTEMPT_SCORING_LIMITS.supplied_total;
  if (total > limit) fail('aggregate native byte bound exceeded');
  // All per-input and aggregate sizes were admitted before the first copy/hash/parse.
  return { packets: null, ...Object.fromEntries(Object.entries(views).map(([key, view]) => {
    const owned = Buffer.alloc(view.length);
    COPY.call(owned, new Uint8Array(view.buffer, view.offset, view.length));
    return [key, owned];
  })) };
}

function unicode(text) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('lone Unicode surrogate');
    } else if (code >= 0xdc00 && code <= 0xdfff) fail('lone Unicode surrogate');
  }
  return text;
}

// A finite parser, including duplicate keys, rather than JSON.parse's last-value policy.
function parse(bytes, label) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail(`${label} is not UTF-8 JSON`); }
  let at = 0, nodes = 0;
  const syntax = () => fail(`${label} is not JSON`, 'ATTEMPT_SCORING_JSON_SYNTAX');
  const space = () => { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; };
  function string() {
    const start = at++;
    while (at < text.length) {
      const code = text.charCodeAt(at++);
      if (code === 34) {
        let value;
        try { value = JSON.parse(text.slice(start, at)); } catch { syntax(); }
        return unicode(value);
      }
      if (code < 32) syntax();
      if (code === 92) {
        if (at >= text.length) syntax();
        const escape = text[at++];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(at, at + 4))) syntax(); at += 4;
        } else if (!'"\\/bfnrt'.includes(escape)) syntax();
      }
    }
    syntax();
  }
  function value(depth) {
    if (++nodes > ATTEMPT_SCORING_LIMITS.json_nodes || depth > ATTEMPT_SCORING_LIMITS.json_depth) fail(`${label} exceeds JSON depth/node bounds`);
    space(); const token = text[at];
    if (token === '"') return string();
    if (token === '{' || token === '[') {
      const list = token === '[', result = list ? [] : Object.create(null); at++; space();
      const end = list ? ']' : '}';
      if (text[at] === end) { at++; return result; }
      for (;;) {
        if (list) result.push(value(depth + 1));
        else {
          space(); if (text[at] !== '"') syntax(); const key = string();
          if (++nodes > ATTEMPT_SCORING_LIMITS.json_nodes) fail(`${label} exceeds JSON node bound`);
          if (Object.hasOwn(result, key)) fail(`${label} has a duplicate JSON member`);
          space(); if (text[at++] !== ':') syntax(); result[key] = value(depth + 1);
        }
        space(); if (text[at] === end) { at++; return result; }
        if (text[at++] !== ',') syntax();
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(at));
    if (!number) syntax(); at += number[0].length; const result = Number(number[0]);
    if (!Number.isFinite(result)) fail(`${label} contains a nonfinite number`);
    return result;
  }
  const result = value(0); space(); if (at !== text.length) syntax(); return result;
}

// Count the SAME Python-compatible encoding used by canonicalJson, without building it.
// Non-ASCII code units (including each half of an astral pair) consume six bytes.
function encodedSize(value, limit, reserve = 0) {
  let size = reserve, nodes = 0;
  const charge = count => { size += count; if (size > limit) fail('derived encoded byte bound exceeded'); };
  function string(text) {
    unicode(text); charge(2);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      charge(code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code) ? 2 : code < 32 || code >= 127 ? 6 : 1);
    }
  }
  function walk(node, depth) {
    if (++nodes > ATTEMPT_SCORING_LIMITS.json_nodes || depth > ATTEMPT_SCORING_LIMITS.json_depth) fail('derived JSON depth/node bound exceeded');
    if (node === null) charge(4);
    else if (typeof node === 'string') string(node);
    else if (typeof node === 'boolean') charge(node ? 4 : 5);
    else if (typeof node === 'number') { if (!Number.isFinite(node)) fail('nonfinite derived number'); charge(pythonNumber(node).length); }
    else if (Array.isArray(node)) {
      charge(2 + Math.max(0, node.length - 1)); for (const child of node) walk(child, depth + 1);
    } else if (object(node)) {
      const names = Object.keys(node); charge(2 + Math.max(0, names.length - 1));
      for (const name of names) { string(name); charge(1); walk(node[name], depth + 1); }
    } else fail('unsupported derived JSON value');
  }
  walk(value, 0); return size;
}

function readBounded(path, maximum) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 0n || before.size > BigInt(maximum)) fail('source/dataset must be a bounded regular file');
    const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count <= 0) fail('short source/dataset read'); offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, bytes.length) !== 0) fail('source/dataset grew during read');
    const after = fstatSync(descriptor, { bigint: true });
    if (!after.isFile() || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key])) fail('source/dataset changed during read');
    const owned = descriptor; descriptor = undefined; closeSync(owned);
    return bytes;
  } finally {
    if (descriptor !== undefined) { const owned = descriptor; descriptor = undefined; closeSync(owned); }
  }
}

const LOADED = Object.fromEntries(ATTEMPT_SCORING_SOURCE_FILES.map(path =>
  [path, readBounded(join(MODULE_ROOT, path), ATTEMPT_SCORING_LIMITS.implementation_file)]));

function implementations(root) {
  return Object.fromEntries(ATTEMPT_SCORING_SOURCE_FILES.map(path => {
    const captured = readBounded(join(root, path), ATTEMPT_SCORING_LIMITS.implementation_file);
    const current = readBounded(join(MODULE_ROOT, path), ATTEMPT_SCORING_LIMITS.implementation_file);
    if (!captured.equals(LOADED[path]) || !current.equals(LOADED[path])) fail(`loaded implementation changed: ${path}`);
    return [path, pin(captured)];
  }));
}

function forbidMetadata(value) {
  if (value === null || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN.has(key.toLowerCase().replaceAll('-', '_'))) fail('source/context/tool metadata is held');
    forbidMetadata(value[key]);
  }
}

function admitLedger(ledger, questions) {
  if (!object(ledger) || ledger.purpose !== 'synthetic-software-fixture' || ledger.arm !== 'closed' ||
      ledger.provider !== 'synthetic-fixture' || ledger.requested_model !== 'fixture-model' || ledger.source_contract_sha256 !== null) fail('only declared synthetic closed-arm fixtures are admitted');
  if (!object(ledger.generation_settings)) fail('generation settings must be an object');
  encodedSize(ledger.generation_settings, ATTEMPT_SCORING_LIMITS.generation_settings);
  forbidMetadata(ledger.generation_settings);
  if (ledger.price_basis !== null && (!object(ledger.price_basis) || ledger.price_basis.provider !== 'synthetic-fixture' || ledger.price_basis.model !== 'fixture-model')) fail('only matching synthetic fixture price labels are admitted');
  if (!Array.isArray(questions.questions) || !Array.isArray(ledger.items)) fail('question/item records must be arrays');
  const projected = new Map(questions.questions.map(row => [row.id, row.question]));
  for (const item of ledger.items) {
    if (!object(item) || !Array.isArray(item.attempts)) fail('item attempts must be an array');
    for (const attempt of item.attempts) {
      if (!object(attempt) || !Array.isArray(attempt.tool_traces) || attempt.tool_traces.length) fail('tool/source traces are held');
      if (typeof attempt.request_raw !== 'string' || Buffer.byteLength(attempt.request_raw) > MAX_RAW_BYTES) fail('request exceeds raw byte bound');
      const request = parse(Buffer.from(attempt.request_raw), 'request');
      keys(request, ['question', 'fixture_turn'], ['question']);
      if (typeof request.question !== 'string' || request.question !== projected.get(item.id) ||
          (Object.hasOwn(request, 'fixture_turn') && request.fixture_turn !== attempt.turn)) fail('request is not the exact question-only fixture envelope');
      if (attempt.response_raw !== null) {
        if (typeof attempt.response_raw !== 'string' || Buffer.byteLength(attempt.response_raw) > MAX_RAW_BYTES) fail('response exceeds raw byte bound');
        let response;
        try { response = parse(Buffer.from(attempt.response_raw), 'raw response'); }
        catch (error) { if (error.code !== 'ATTEMPT_SCORING_JSON_SYNTAX') throw error; }
        if (response !== undefined) forbidMetadata(response);
      }
    }
  }
}

function selected(buffer, baseline, questions) {
  if (!isHash(baseline.dataset?.sha256) || sha256(buffer) !== baseline.dataset.sha256) fail('same scoring dataset buffer differs from baseline hash');
  const dataset = readDataset(buffer), sample = stratifiedSample(dataset.items, 3, 20261001);
  const groups = new Set(sample.map(item => item.template));
  if (sample.length !== 15 || groups.size !== 5 || [...groups].some(group => sample.filter(item => item.template === group).length !== 3) ||
      canonicalJson(sample.map(item => item.id)) !== canonicalJson(baseline.sampling?.item_ids) ||
      canonicalJson(sample.map(item => ({ id: item.id, question: item.question }))) !== canonicalJson(questions.questions)) fail('fixed dataset/sample/question projection mismatch');
  const bindings = sample.map(item => ({ id: item.id, template: item.template, company_cik: item.company.cik,
    question_sha256: sha256(item.question), item_sha256: hash(item), expected_sha256: hash(item.answer),
    cited_facts_sha256: hash(item.facts), cited_filing_urls: [...new Set(item.facts.map(fact => fact.url))].sort(),
    source_availability: 'unverified', absence_coverage: item.template === 'unanswerable' ?
      'full annual concept history required; one earliest cited row does not prove completeness' : 'not an absence task' }));
  if (canonicalJson(bindings) !== canonicalJson(baseline.bindings)) fail('expected/source/item bindings mismatch');
  return { dataset, sample, bindings };
}

function frozen(value) {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
  return value;
}

function compute(root, owned) {
  if (typeof root !== 'string' || root.length > 4096 || !isAbsolute(root) || root.includes('\0')) fail('root must be a bounded absolute path');
  const implementation = implementations(root);
  // All four supplied documents are strictly parsed BEFORE an inherited auditor sees them.
  parse(owned.accounting, 'accounting'); const baseline = parse(owned.baseline, 'baseline');
  const questions = parse(owned.questions, 'questions'), ledger = parse(owned.ledger, 'ledger');
  admitLedger(ledger, questions);
  const datasetBytes = readBounded(join(root, V0_DIRECTORY, 'filing-facts-v0.jsonl'), ATTEMPT_SCORING_LIMITS.dataset);
  const { sample, bindings } = selected(datasetBytes, baseline, questions);
  const measurement = auditAttemptLedger(root, owned.accounting, owned.baseline, owned.questions, null, owned.ledger);
  if (measurement.items.some(item => item.attempts.some(attempt => attempt.observed_model !== null && attempt.observed_model !== 'fixture-model'))) fail('observed model must be the synthetic fixture model');
  const originals = new Map(ledger.items.map(item => [item.id, item]));
  const rows = sample.map((item, index) => {
    const record = measurement.items[index], original = originals.get(item.id);
    if (record.id !== item.id) fail('audited full-cohort item order mismatch');
    const eligible = record.status === 'completed' && record.attempt_records_complete;
    const final = eligible ? original.attempts.find(attempt => attempt.ordinal === original.final_attempt) : null;
    if (eligible && (!final || final.status !== 'response' || final.answer_text !== record.response_text)) fail('audited final raw answer mismatch');
    const answer = eligible ? final.answer_text : null;
    const scored = eligible ? scoreAnswer(item, answer) : { answered: false, correct: false, parsed: null };
    let status = record.status;
    if (status === 'completed' && !eligible) status = 'incomplete';
    else if (eligible) status = scored.answered ? 'scored' : answer.trim() ? 'no_final_answer' : 'blank_response';
    else if (status === 'incomplete' && record.attempts.some(attempt => attempt.status === 'pending')) status = 'pending';
    return { id: item.id, template: item.template, status, record_status: record.status,
      final_attempt: original?.final_attempt ?? null, scored_attempt: eligible ? final.ordinal : null,
      answer_text: answer, ...scored, expected: item.answer, binding: bindings[index] };
  });
  const correct = rows.filter(row => row.correct).length;
  const body = { schema: ATTEMPT_SCORING_SCHEMA, purpose: 'synthetic-software-fixture', arm: 'closed',
    model_baseline: false, provider_authenticity_verified: false, observed_billing_verified: false, execution_authorized: false,
    inputs: Object.fromEntries(INPUTS.map(name => [name, name === 'packets' ? null : pin(owned[name])])),
    dataset: pin(datasetBytes), sample: baseline.sampling, implementation, rows,
    summary: { selected_items: 15, correct, accuracy: correct / 15,
      by_template: Object.fromEntries([...new Set(rows.map(row => row.template))].sort().map(template => {
        const group = rows.filter(row => row.template === template), successes = group.filter(row => row.correct).length;
        return [template, { selected_items: group.length, correct: successes, accuracy: successes / group.length }];
      })), behaviour: behaviour(rows),
      status_counts: Object.fromEntries([...new Set(rows.map(row => row.status))].sort().map(status => [status, rows.filter(row => row.status === status).length])) },
    measurement, measurement_sha256: ZERO_HASH,
    limits: ['Software-fixture replay only; no real model baseline, ranking, provider authenticity or billing.',
      'All selected items remain denominators; only the audited final complete successful attempt is scored.',
      'The complete accounting companion preserves unknown measurements as null and known subtotals as partial.',
      'No verified source completeness, rights, real expert labels, actual indexing, adoption or strategy outcomes.',
      'Inherited auditors retain their original bounded-input and source-read behavior.'] };
  // Reserve both fixed-width hashes and newline before any derived companion/body encoding.
  const expectedBytes = encodedSize({ ...body, artifact_sha256: ZERO_HASH }, ATTEMPT_SCORING_LIMITS.artifact, 1);
  body.measurement_sha256 = hash(measurement);
  const artifact = { ...body, artifact_sha256: hash(body) };
  if (canonicalJson(implementations(root)) !== canonicalJson(implementation)) fail('implementation changed during scoring');
  const artifactBytes = Buffer.from(canonicalJson(artifact) + '\n');
  if (artifactBytes.length !== expectedBytes) fail('canonical encoding differs from admitted byte reservation');
  return { artifact: frozen(artifact), artifact_bytes: artifactBytes };
}

export function scoreAttemptLedger(root, inputs) {
  return compute(root, capture(inputs, null, false));
}

export function replayAttemptScoring(root, inputs, artifactBytes) {
  const owned = capture(inputs, artifactBytes, true);
  const supplied = parse(owned.artifact, 'artifact');
  if (!object(supplied) || !isHash(supplied.artifact_sha256) || !isHash(supplied.measurement_sha256)) fail('artifact needs primitive SHA-256 strings');
  encodedSize(supplied, ATTEMPT_SCORING_LIMITS.artifact, 1);
  const actual = compute(root, owned);
  if (canonicalJson(supplied) !== canonicalJson(actual.artifact)) fail('artifact differs from full input/source/scoring/measurement replay');
  return { status: 'recomputed-synthetic-attempt-scoring', artifact_sha256: actual.artifact.artifact_sha256,
    selected_items: actual.artifact.summary.selected_items, model_baseline: false, execution_authorized: false };
}
