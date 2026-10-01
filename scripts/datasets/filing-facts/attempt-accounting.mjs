// Offline contracts and replay only: no provider, transport, retries or source execution.
import { closeSync, constants, fstatSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../../canonical-json.mjs';
import { auditBaselineContract, projectQuestions } from './baseline-contract.mjs';
import { sha256 } from './evidence.mjs';

export const ACCOUNTING_SCHEMA = 'canli.filing-facts-attempt-contract.v1';
export const LEDGER_SCHEMA = 'canli.filing-facts-attempt-ledger.v1';
export const REPORT_SCHEMA = 'canli.filing-facts-attempt-report.v1';
export const PACKETS_SCHEMA = 'canli.filing-facts-source-packets.v1';
export const MAX_JSON_BYTES = 8 * 1024 * 1024;
export const MAX_RAW_BYTES = 64 * 1024;
export const MAX_ATTEMPTS_PER_ITEM = 64;
const MAX_PACKET_BYTES = 256 * 1024;
const ID = /^[A-Za-z0-9._:-]{1,128}$/;
const COMPONENT = /^[a-z][a-z0-9_]{0,63}$/;
const HASH = /^[0-9a-f]{64}$/;
const HERE = 'scripts/datasets/filing-facts';
const OWN_FILES = ['attempt-accounting.mjs', 'ATTEMPTS.md'];
const LOADED = Object.fromEntries(OWN_FILES.map(name => [name, readFileSync(new URL(name, import.meta.url))]));
const digest = value => sha256(canonicalJson(value));
const pin = bytes => ({ bytes: bytes.length, sha256: sha256(bytes) });
const fail = message => { throw new RangeError(`attempt accounting: ${message}`); };
const count = x => Number.isSafeInteger(x) && x >= 0;
const text = (x, max = MAX_RAW_BYTES) => typeof x === 'string' && x.length <= max &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(x) && Buffer.byteLength(x) <= max;
const nonempty = x => text(x) && Boolean(x.trim());
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);

function keys(value, allowed, required = allowed) {
  if (!object(value) || Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(value, k))) fail('unsupported or missing members');
}
function parse(bytes, label) {
  if ((!Buffer.isBuffer(bytes) && typeof bytes !== 'string') || bytes.length > MAX_JSON_BYTES) fail(`${label} exceeds bounded JSON input`);
  if (typeof bytes === 'string' && !text(bytes, MAX_JSON_BYTES)) fail(`${label} is not bounded well-formed Unicode`);
  const captured = Buffer.from(bytes);
  if (captured.length > MAX_JSON_BYTES) fail(`${label} exceeds bounded JSON input`);
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(captured)); }
  catch { fail(`${label} is not UTF-8 JSON`); }
  const pending = [[value, 0]];
  let nodes = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (++nodes > 200000 || depth > 40) fail(`${label} exceeds JSON depth/node bounds`);
    if (node !== null && typeof node === 'object') {
      const children = Array.isArray(node) ? node : Object.keys(node);
      if (children.length > 200000 - nodes - pending.length) fail(`${label} exceeds JSON depth/node bounds`);
      for (const child of children) pending.push([Array.isArray(node) ? child : node[child], depth + 1]);
    }
  }
  return { value, bytes: captured, binding: pin(captured) };
}
function utc(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !value.startsWith('0000') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function nullableText(value, reason, label) {
  if (value === null) { if (!nonempty(reason)) fail(`${label} needs an unavailable reason`); }
  else if (!text(value) || reason !== null) fail(`${label} must be bounded text with no missing reason`);
}
function timing(value) {
  keys(value, ['started_at', 'ended_at', 'duration_ms', 'unavailable_reason']);
  for (const k of ['started_at', 'ended_at']) if (value[k] !== null && !utc(value[k])) fail('invalid caller-observed timestamp');
  if (value.started_at !== null && value.ended_at !== null && value.ended_at < value.started_at) fail('caller-observed time goes backwards');
  if (value.duration_ms !== null && (!Number.isFinite(value.duration_ms) || value.duration_ms < 0 || value.duration_ms > 86400000)) fail('invalid caller-observed duration');
  const missing = ['started_at', 'ended_at', 'duration_ms'].some(k => value[k] === null);
  if (missing ? !nonempty(value.unavailable_reason) : value.unavailable_reason !== null) fail('timing missing-reason mismatch');
  return value;
}
function implementations(root) {
  return Object.fromEntries(OWN_FILES.map(name => {
    const bytes = readFileSync(join(root, HERE, name));
    if (!bytes.equals(LOADED[name]) || !bytes.equals(readFileSync(new URL(name, import.meta.url)))) fail('loaded accounting implementation changed');
    return [`${HERE}/${name}`, pin(bytes)];
  }));
}

function sourceParity(packetInput, baseline) {
  if (packetInput === null) return { input: null, rights: null, items: baseline.bindings.map(row => ({ id: row.id,
    availability: 'unverified', byte_parity: null, coverage_kind: 'unverified', independently_verified_complete: false,
    unanswerable_requirement_satisfied: false })), available: 0, unavailable: 0, unverified: baseline.sampling.items };
  const { value, binding } = parse(packetInput, 'source packets');
  keys(value, ['schema', 'rights', 'truncation_policy', 'items']);
  if (value.schema !== PACKETS_SCHEMA) fail('unsupported source packet schema');
  keys(value.rights, ['status', 'content_class', 'basis', 'evidence_text']);
  if (value.rights.status !== 'cleared' || value.rights.content_class !== 'original-questions-numeric-facts-filing-identifiers' ||
      !nonempty(value.rights.basis) || !nonempty(value.rights.evidence_text)) fail('source packets require an explicit scoped rights record');
  keys(value.truncation_policy, ['method', 'unit', 'limit']);
  const policy = value.truncation_policy;
  if (!['none', 'prefix'].includes(policy.method) || policy.unit !== 'utf16-code-units' || !count(policy.limit) || policy.limit < 1 || policy.limit > MAX_PACKET_BYTES) fail('unsupported source truncation policy');
  if (!Array.isArray(value.items) || value.items.length !== baseline.sampling.items) fail('source availability must declare every selected item');
  const items = value.items.map((item, i) => {
    keys(item, ['id', 'available', 'unavailable_reason', 'coverage_kind', 'coverage_evidence_text', 'original_source_bindings', 'source_assisted', 'mcp']);
    if (item.id !== baseline.sampling.item_ids[i] || typeof item.available !== 'boolean' ||
        !['selected-facts', 'captured-annual-series', 'full-original-sources', 'unverified'].includes(item.coverage_kind)) fail('source cohort/order/coverage mismatch');
    if (item.coverage_evidence_text !== null && !nonempty(item.coverage_evidence_text)) fail('invalid source coverage evidence');
    if (!Array.isArray(item.original_source_bindings) || item.original_source_bindings.length > 32) fail('invalid original source bindings');
    for (const original of item.original_source_bindings) {
      keys(original, ['uri', 'sha256', 'bytes']);
      if (!nonempty(original.uri) || typeof original.sha256 !== 'string' || !HASH.test(original.sha256) || !count(original.bytes)) fail('invalid original source binding');
    }
    let frames = null;
    if (item.available) {
      if (item.unavailable_reason !== null) fail('available packet has an unavailable reason');
      frames = Object.fromEntries(['source_assisted', 'mcp'].map(arm => {
        const frame = item[arm]; keys(frame, ['raw_text', 'supplied_text']);
        if (!text(frame.raw_text, MAX_PACKET_BYTES) || !text(frame.supplied_text, MAX_PACKET_BYTES) || !frame.raw_text.trim() || !frame.supplied_text.trim()) fail('source packet exceeds byte bounds or is empty');
        if (policy.method === 'none' && frame.raw_text.length > policy.limit) fail('untruncated packet exceeds declared limit');
        const expected = policy.method === 'none' ? frame.raw_text : frame.raw_text.slice(0, policy.limit);
        if (frame.supplied_text !== expected) fail('source packet does not follow declared truncation');
        return [arm, { raw: pin(Buffer.from(frame.raw_text)), supplied: pin(Buffer.from(frame.supplied_text)),
          truncated: frame.raw_text !== frame.supplied_text }];
      }));
      if (canonicalJson(frames.source_assisted) !== canonicalJson(frames.mcp)) fail('source-assisted and MCP packet bytes differ');
    } else if (!nonempty(item.unavailable_reason) || item.source_assisted !== null || item.mcp !== null) fail('unavailable source needs a reason and no packets');
    return { id: item.id, availability: item.available ? 'available' : 'unavailable', unavailable_reason: item.unavailable_reason,
      byte_parity: frames === null ? null : true, packets: frames, coverage_kind: item.coverage_kind,
      coverage_evidence: item.coverage_evidence_text === null ? null : pin(Buffer.from(item.coverage_evidence_text)),
      original_source_bindings: item.original_source_bindings, independently_verified_complete: false,
      unanswerable_requirement_satisfied: false };
  });
  return { input: binding, rights: { status: value.rights.status, content_class: value.rights.content_class, basis: value.rights.basis,
    evidence: pin(Buffer.from(value.rights.evidence_text)), independently_verified: false }, truncation_policy: policy, items,
    available: items.filter(row => row.availability === 'available').length,
    unavailable: items.filter(row => row.availability === 'unavailable').length, unverified: 0 };
}

export function prepareAttemptContract(root, baselineBytes, questionsBytes, packetBytes = null) {
  const baseline = parse(baselineBytes, 'baseline'), questions = parse(questionsBytes, 'questions');
  auditBaselineContract(root, baseline.value);
  const expected = projectQuestions(root, baseline.value);
  if (canonicalJson(questions.value) !== canonicalJson(expected)) fail('question-only projection differs from baseline');
  const parity = sourceParity(packetBytes, baseline.value);
  const body = { schema: ACCOUNTING_SCHEMA, purpose: 'offline-attempt-accounting-preparation',
    baseline: { input: baseline.binding, contract_sha256: baseline.value.contract_sha256,
      dataset_sha256: baseline.value.dataset.sha256, scoring_version: baseline.value.implementation.scoring_version,
      scoring_sources: baseline.value.implementation.sources }, questions: { input: questions.binding,
      projection_sha256: digest(expected), bindings: expected.questions.map(question => ({ id: question.id, question_sha256: sha256(question.question) })) },
    sample: baseline.value.sampling, source_parity: parity, implementation: implementations(root),
    execution: { status: 'unassigned-held', model_calls_authorized: false, source_assisted_capture: 'unsupported-held',
      unanswerable_full_original_source_coverage: 'unverified-held', finance_model_rights_and_release_admission: 'separate review required' },
    limits: ['Source equality verifies supplied bytes and truncation only, not rights, completeness or authentic source availability.',
      'Local ledgers and caller-observed clocks do not authenticate a provider or observed billing.',
      'Every source-assisted, MCP and closed execution remains held; no conversion into a PR343 capture is provided.',
      'Public questions are pipeline smoke inputs, not held-out expert gold, a model ranking or evidence of financial outcomes.'] };
  auditBaselineContract(root, baseline.value);
  implementations(root);
  return { ...body, contract_sha256: digest(body) };
}

function pointer(value, path) {
  if (typeof path !== 'string' || path.length > 256 || !path.startsWith('/') || /~(?![01])/.test(path)) fail('invalid response JSON pointer');
  for (const key of path.slice(1).split('/').map(k => k.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if ((!object(value) && !Array.isArray(value)) || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}
const SCALE = 1000000000000n;
function rate(value) {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,12})?$/.test(value)) fail('price rate needs a bounded nonnegative decimal string');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, '0'));
}
function money(value) {
  const fraction = String(value % SCALE).padStart(12, '0').replace(/0+$/, '');
  return `${value / SCALE}${fraction ? `.${fraction}` : ''}`;
}
function pricing(value, components) {
  if (value === null) return null;
  keys(value, ['currency', 'as_of', 'provider', 'model', 'source_text', 'units', 'rates_per_unit']);
  if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency) || !utc(value.as_of) || !nonempty(value.provider) || !nonempty(value.model) || !nonempty(value.source_text)) fail('price needs currency/as-of/provider/model/source metadata');
  keys(value.rates_per_unit, components);
  keys(value.units, components);
  if (components.some(name => !nonempty(value.units[name])) || value.units.input_tokens !== 'token' || value.units.output_tokens !== 'token') fail('price units must name each component and individual input/output tokens');
  const rates = Object.fromEntries(components.map(name => [name, rate(value.rates_per_unit[name])]));
  return { value, rates, binding: digest(value), source: pin(Buffer.from(value.source_text)) };
}
function traces(values, arm, source) {
  if (!Array.isArray(values) || values.length > 32) fail('invalid tool traces');
  if (arm === 'closed' && values.length) fail('closed ledger cannot contain tool/source traces');
  return values.map(trace => {
    keys(trace, ['id', 'name', 'status', 'error', 'arguments_raw', 'result_raw', 'result_supplied']);
    if (typeof trace.id !== 'string' || !ID.test(trace.id) || !nonempty(trace.name) || !['result', 'error'].includes(trace.status) ||
        (trace.status === 'result' ? trace.error !== null : !nonempty(trace.error)) ||
        !text(trace.arguments_raw) || !text(trace.result_raw, MAX_PACKET_BYTES) || !text(trace.result_supplied, MAX_PACKET_BYTES)) fail('invalid raw tool trace');
    if (trace.status === 'result' && (source?.availability !== 'available' || !source.packets ||
        sha256(trace.result_raw) !== source.packets.mcp.raw.sha256 || sha256(trace.result_supplied) !== source.packets.mcp.supplied.sha256)) fail('tool result differs from frozen source packet');
    return { id: trace.id, name: trace.name, status: trace.status, error: trace.error, arguments: pin(Buffer.from(trace.arguments_raw)), raw: pin(Buffer.from(trace.result_raw)),
      supplied: pin(Buffer.from(trace.result_supplied)), truncated: trace.result_raw !== trace.result_supplied };
  });
}

function replayLedger(contract, ledgerInput) {
  const { value: ledger, binding } = parse(ledgerInput, 'ledger');
  keys(ledger, ['schema', 'purpose', 'contract_sha256', 'question_projection_sha256', 'source_contract_sha256', 'arm',
    'provider', 'requested_model', 'generation_settings', 'time_basis', 'bounds', 'response_pointers', 'price_basis', 'items']);
  if (ledger.schema !== LEDGER_SCHEMA || !['synthetic-software-fixture', 'local-unverified-capture'].includes(ledger.purpose) ||
      ledger.contract_sha256 !== contract.contract_sha256 || ledger.question_projection_sha256 !== contract.questions.projection_sha256) fail('ledger schema/purpose/contract/question binding mismatch');
  if (!['closed', 'mcp'].includes(ledger.arm)) fail('source-assisted remains held; do not relabel it closed');
  const sourceBinding = contract.source_parity.input?.sha256 ?? null;
  if (ledger.arm === 'closed' ? ledger.source_contract_sha256 !== null : !sourceBinding || ledger.source_contract_sha256 !== digest(contract.source_parity)) fail('ledger source-arm binding mismatch');
  if (!nonempty(ledger.provider) || !nonempty(ledger.requested_model) || !object(ledger.generation_settings) ||
      ledger.time_basis !== 'caller-observed-monotonic-ms') fail('ledger needs declared provider/model/settings/time provenance');
  keys(ledger.bounds, ['attempts_per_item', 'item_duration_ms']);
  if (!count(ledger.bounds.attempts_per_item) || ledger.bounds.attempts_per_item < 1 || ledger.bounds.attempts_per_item > MAX_ATTEMPTS_PER_ITEM ||
      !count(ledger.bounds.item_duration_ms) || ledger.bounds.item_duration_ms < 1 || ledger.bounds.item_duration_ms > 600000) fail('invalid declared finite bounds');
  keys(ledger.response_pointers, ['answer', 'response_id', 'model', 'usage']);
  for (const name of ['answer', 'response_id', 'model']) pointer({}, ledger.response_pointers[name]);
  const usageMap = ledger.response_pointers.usage;
  if (!object(usageMap) || !Object.hasOwn(usageMap, 'input_tokens') || !Object.hasOwn(usageMap, 'output_tokens') ||
      Object.keys(usageMap).length > 16 || Object.keys(usageMap).some(k => !COMPONENT.test(k))) fail('usage needs bounded named input/output components');
  const components = Object.keys(usageMap).sort();
  if (new Set(Object.values(usageMap)).size !== components.length) fail('usage components cannot share the same response pointer');
  for (const path of Object.values(usageMap)) pointer({}, path);
  const price = pricing(ledger.price_basis, components);
  if (!Array.isArray(ledger.items) || ledger.items.length > contract.sample.items) fail('invalid item records');
  const selected = new Map(contract.questions.bindings.map(row => [row.id, row]));
  const rawItems = new Map(), allIds = new Set();
  for (const item of ledger.items) {
    keys(item, ['id', 'question_sha256', 'status', 'error', 'declared_attempts', 'final_attempt', 'response_text', 'response_missing_reason', 'time', 'attempts']);
    if (!selected.has(item.id) || rawItems.has(item.id) || item.question_sha256 !== selected.get(item.id).question_sha256) fail('unknown/duplicate item or question binding mismatch');
    if (!['completed', 'error', 'aborted', 'not_started', 'incomplete'].includes(item.status) ||
        (item.error !== null && !nonempty(item.error)) || (['error', 'aborted'].includes(item.status) && !nonempty(item.error))) fail('invalid item terminal status/error');
    if (item.declared_attempts !== null && (!count(item.declared_attempts) || item.declared_attempts > MAX_ATTEMPTS_PER_ITEM)) fail('invalid declared attempt count');
    nullableText(item.response_text, item.response_missing_reason, 'item response');
    timing(item.time);
    if (!Array.isArray(item.attempts) || item.attempts.length > MAX_ATTEMPTS_PER_ITEM ||
        (item.status === 'not_started' && (item.attempts.length || item.declared_attempts !== 0))) fail('invalid bounded attempt records');
    const attempts = new Map();
    for (const attempt of item.attempts) {
      keys(attempt, ['id', 'ordinal', 'turn', 'retry_of', 'status', 'http_status', 'request_raw', 'response_raw', 'response_missing_reason',
        'answer_text', 'answer_missing_reason', 'error', 'usage_unavailable_reason', 'time', 'tool_traces']);
      if (typeof attempt.id !== 'string' || !ID.test(attempt.id) || allIds.has(attempt.id) || !count(attempt.ordinal) || attempt.ordinal < 1 || attempt.ordinal > MAX_ATTEMPTS_PER_ITEM ||
          attempts.has(attempt.ordinal) || (item.declared_attempts !== null && attempt.ordinal > item.declared_attempts) ||
          !count(attempt.turn) || attempt.turn < 1 || attempt.turn > 6) fail('duplicate/invalid attempt identity or position');
      if (attempt.retry_of !== null && (!count(attempt.retry_of) || attempt.retry_of < 1 || attempt.retry_of >= attempt.ordinal)) fail('invalid retry predecessor');
      if (!['response', 'http_error', 'transport_error', 'aborted', 'pending'].includes(attempt.status) ||
          (attempt.http_status !== null && (!Number.isInteger(attempt.http_status) || attempt.http_status < 100 || attempt.http_status > 599)) ||
          (attempt.error !== null && !nonempty(attempt.error)) ||
          (['http_error', 'transport_error', 'aborted'].includes(attempt.status) && !nonempty(attempt.error))) fail('invalid attempt outcome/error');
      if (attempt.status === 'response' && (attempt.error !== null || (attempt.http_status !== null && (attempt.http_status < 200 || attempt.http_status >= 300)))) fail('response outcome contradicts HTTP/error fields');
      if (attempt.status === 'http_error' && (attempt.http_status === null || (attempt.http_status >= 200 && attempt.http_status < 300))) fail('HTTP error needs an unsuccessful HTTP status');
      if (!text(attempt.request_raw)) fail('request body exceeds byte bounds');
      nullableText(attempt.response_raw, attempt.response_missing_reason, 'raw response');
      nullableText(attempt.answer_text, attempt.answer_missing_reason, 'attempt answer');
      const time = timing(attempt.time);
      if (attempt.status === 'pending' && (attempt.http_status !== null || attempt.response_raw !== null || time.ended_at !== null || attempt.error !== null)) fail('pending attempt claims a completed response');
      let response = null;
      try { if (attempt.response_raw !== null) response = JSON.parse(attempt.response_raw); } catch { /* Retain malformed raw bodies; their usage remains unavailable. */ }
      const answer = response === null ? undefined : pointer(response, ledger.response_pointers.answer);
      if (attempt.answer_text !== (text(answer) ? answer : null)) fail('raw answer differs from response pointer');
      const usage = Object.fromEntries(components.map(name => {
        const raw = response === null ? undefined : pointer(response, usageMap[name]);
        return [name, count(raw) ? raw : null];
      }));
      const usageComplete = Object.values(usage).every(value => value !== null);
      if (usageComplete ? attempt.usage_unavailable_reason !== null : !nonempty(attempt.usage_unavailable_reason)) fail('usage missing-reason mismatch');
      const observedModel = response === null ? undefined : pointer(response, ledger.response_pointers.model);
      const responseId = response === null ? undefined : pointer(response, ledger.response_pointers.response_id);
      const priceApplicable = Boolean(price && ledger.provider === price.value.provider && observedModel === price.value.model);
      let knownCost = null, completeCost = null;
      if (priceApplicable) {
        for (const name of components) if (usage[name] !== null) knownCost = (knownCost ?? 0n) + BigInt(usage[name]) * price.rates[name];
        if (usageComplete) completeCost = knownCost;
      }
      const normalized = { id: attempt.id, ordinal: attempt.ordinal, turn: attempt.turn, retry_of: attempt.retry_of, status: attempt.status,
        http_status: attempt.http_status, request: pin(Buffer.from(attempt.request_raw)), response: attempt.response_raw === null ? null : pin(Buffer.from(attempt.response_raw)),
        response_missing_reason: attempt.response_missing_reason, answer_text: attempt.answer_text, error: attempt.error,
        observed_model: text(observedModel) ? observedModel : null, response_id: text(responseId) ? responseId : null,
        usage, usage_unavailable_reason: attempt.usage_unavailable_reason, time, tool_traces: traces(attempt.tool_traces, ledger.arm, contract.source_parity.items.find(row => row.id === item.id)),
        estimated_cost: completeCost === null ? null : money(completeCost), known_cost_component_subtotal: knownCost === null ? null : money(knownCost),
        cost_unavailable_reason: completeCost !== null ? null : !price ? 'price basis unavailable' : !priceApplicable ? 'price provider/observed-model applicability unverified' : 'usage components unavailable' };
      attempts.set(attempt.ordinal, { normalized, original: attempt, cost: completeCost, knownCost }); allIds.add(attempt.id);
    }
    for (const { original } of attempts.values()) if (original.retry_of !== null) {
      const previous = attempts.get(original.retry_of)?.original;
      if (previous && (previous.turn !== original.turn || previous.request_raw !== original.request_raw)) fail('retry changes request bytes or turn');
    }
    if (item.final_attempt !== null && (!count(item.final_attempt) || !attempts.has(item.final_attempt) ||
        attempts.get(item.final_attempt).normalized.answer_text !== item.response_text)) fail('final response differs from the named attempt');
    if (item.response_text !== null && item.final_attempt === null) fail('item response needs its raw attempt binding');
    if (item.status === 'completed' && (item.final_attempt === null || item.response_text === null || item.error !== null ||
        attempts.get(item.final_attempt)?.original.status !== 'response' || item.final_attempt !== Math.max(...attempts.keys()) ||
        (item.declared_attempts !== null && item.final_attempt !== item.declared_attempts))) fail('completed item needs its final raw successful response');
    if (item.status === 'not_started' && item.response_text !== null) fail('not-started item cannot have an answer');
    rawItems.set(item.id, { item, attempts });
  }
  const items = contract.questions.bindings.map(({ id }) => {
    const raw = rawItems.get(id);
    if (!raw) return { id, status: 'missing_record', declared_attempts: null, attempts: [], attempt_records_complete: false,
      response_text: null, error: null, time: null, estimated_cost: null, known_cost_component_subtotal: null, missing_attempts: null };
    const { item, attempts } = raw;
    const missing = item.declared_attempts === null ? null : Array.from({ length: item.declared_attempts }, (_, i) => i + 1).filter(i => !attempts.has(i));
    const complete = missing !== null && missing.length === 0 && !['not_started', 'incomplete'].includes(item.status) &&
      [...attempts.values()].every(({ original }) => original.status !== 'pending');
    const costs = [...attempts.values()];
    const known = costs.reduce((sum, row) => row.knownCost === null ? sum : (sum ?? 0n) + row.knownCost, null);
    const costComplete = complete && costs.length > 0 && costs.every(row => row.cost !== null);
    return { id, status: item.status, declared_attempts: item.declared_attempts,
      attempts: [...attempts.values()].sort((a, b) => a.original.ordinal - b.original.ordinal).map(row => row.normalized),
      attempt_records_complete: complete, missing_attempts: missing, response_text: item.response_text, error: item.error, time: item.time,
      estimated_cost: costComplete ? money(costs.reduce((sum, row) => sum + row.cost, 0n)) : null,
      known_cost_component_subtotal: known === null ? null : money(known) };
  });
  const attempts = items.flatMap(row => row.attempts), allComplete = items.every(row => row.attempt_records_complete);
  const declaredKnown = items.every(row => row.declared_attempts !== null);
  const finalDurations = attempts.filter(row => row.status !== 'pending' && row.time.duration_ms !== null);
  const itemDurations = items.filter(row => row.time?.duration_ms !== null && row.time?.duration_ms !== undefined && !['missing_record', 'not_started', 'incomplete'].includes(row.status));
  const sumDuration = rows => rows.reduce((sum, row) => sum + row.time.duration_ms, 0);
  const costs = [...rawItems.values()].flatMap(row => [...row.attempts.values()]);
  const knownCost = costs.reduce((sum, row) => row.knownCost === null ? sum : (sum ?? 0n) + row.knownCost, null);
  const costComplete = allComplete && items.every(row => row.estimated_cost !== null) && costs.length > 0 && costs.every(row => row.cost !== null);
  const usage = Object.fromEntries(components.map(name => {
    const observed = attempts.filter(row => row.usage[name] !== null);
    const total = observed.reduce((sum, row) => sum + BigInt(row.usage[name]), 0n);
    return [name, { recorded_attempts: attempts.length, known_attempts: observed.length,
      known_subtotal: observed.length ? String(total) : null,
      complete_total: allComplete && attempts.length > 0 && observed.length === attempts.length ? String(total) : null }];
  }));
  const violations = items.flatMap(row => [
    ...(row.declared_attempts !== null && row.declared_attempts > ledger.bounds.attempts_per_item ? [{ id: row.id, reason: 'declared attempts exceed reviewed bound' }] : []),
    ...(row.attempts.some(attempt => attempt.ordinal > ledger.bounds.attempts_per_item) ? [{ id: row.id, reason: 'observed attempt position exceeds reviewed bound' }] : []),
    ...(row.time?.duration_ms > ledger.bounds.item_duration_ms ? [{ id: row.id, reason: 'observed item duration exceeds reviewed bound' }] : []),
  ]);
  return { schema: REPORT_SCHEMA, purpose: ledger.purpose, model_baseline: false, provider_authenticity_verified: false, observed_billing_verified: false,
    execution_authorized: false, source_assisted_execution: 'held', unanswerable_full_source_coverage: 'unverified-held',
    contract_sha256: contract.contract_sha256, ledger: binding, arm: ledger.arm, provider: ledger.provider, requested_model: ledger.requested_model,
    generation_settings_sha256: digest(ledger.generation_settings), caller_time_basis: ledger.time_basis,
    price_basis: price === null ? null : { sha256: price.binding, currency: price.value.currency, as_of: price.value.as_of,
      provider: price.value.provider, model: price.value.model, units: price.value.units, rates_per_unit: price.value.rates_per_unit,
      source: price.source, cost_kind: 'supplied-rate usage estimate; not observed provider billing' },
    coverage: { selected_items: contract.sample.items, captured_items: rawItems.size, missing_items: items.filter(row => row.status === 'missing_record').length,
      completed_items: items.filter(row => row.status === 'completed').length, error_items: items.filter(row => row.status === 'error').length,
      aborted_items: items.filter(row => row.status === 'aborted').length, not_started_items: items.filter(row => row.status === 'not_started').length,
      incomplete_items: items.filter(row => row.status === 'incomplete').length, attempt_records_complete: allComplete,
      declared_attempts_total: declaredKnown ? items.reduce((sum, row) => sum + row.declared_attempts, 0) : null,
      recorded_attempts: attempts.length, missing_attempts_in_declared_items: items.reduce((sum, row) => sum + (row.missing_attempts?.length ?? 0), 0),
      pending_attempts: attempts.filter(row => row.status === 'pending').length, retry_attempts: attempts.filter(row => row.retry_of !== null).length,
      failed_or_aborted_attempts: attempts.filter(row => ['http_error', 'transport_error', 'aborted'].includes(row.status)).length,
      tool_calls: attempts.reduce((sum, row) => sum + row.tool_traces.length, 0),
      failed_tool_calls: attempts.reduce((sum, row) => sum + row.tool_traces.filter(trace => trace.status === 'error').length, 0),
      estimated_cost_known_attempts: attempts.filter(row => row.estimated_cost !== null).length,
      estimated_cost_unknown_attempts: attempts.filter(row => row.estimated_cost === null).length,
      attempt_latency_known: finalDurations.length, item_latency_known: itemDurations.length },
    usage, latency: { recorded_final_attempt_duration_known_subtotal_ms: finalDurations.length ? sumDuration(finalDurations) : null,
      complete_attempt_duration_total_ms: allComplete && attempts.length > 0 && finalDurations.length === attempts.length ? sumDuration(finalDurations) : null,
      mean_attempt_duration_ms: allComplete && attempts.length > 0 && finalDurations.length === attempts.length ? sumDuration(finalDurations) / attempts.length : null,
      mean_item_duration_ms: allComplete && itemDurations.length === contract.sample.items ? sumDuration(itemDurations) / contract.sample.items : null },
    cost: { currency: price?.value.currency ?? null, known_component_subtotal: knownCost === null ? null : money(knownCost),
      complete_usage_estimate: costComplete ? money(costs.reduce((sum, row) => sum + row.cost, 0n)) : null, actual_billed_total: null,
      actual_billed_total_reason: 'No provider billing evidence is verified by this offline contract.' },
    bounds_violations: violations, items,
    limits: ['Synthetic fixture values are software inputs, never observed model performance, latency or cost.',
      'Known subtotals include recorded failed/retried attempts; missing attempts and items prevent complete totals.',
      'Duration is supplied caller-observed monotonic elapsed time; wall timestamps do not establish it.',
      'Usage is extracted from retained raw JSON through declared pointers; invalid or missing components stay unavailable.',
      'Cost estimates cover supplied component rates only; pricing truth, tax, discounts, other fees and billing remain unverified.',
      'This artifact is separate from PR343 scoring evidence and provides no source-assisted-to-closed conversion.'] };
}

export function auditAttemptLedger(root, contractBytes, baselineBytes, questionsBytes, packetBytes, ledgerBytes) {
  const supplied = parse(contractBytes, 'accounting contract').value;
  const contract = prepareAttemptContract(root, baselineBytes, questionsBytes, packetBytes);
  if (canonicalJson(supplied) !== canonicalJson(contract)) fail('accounting contract differs from immutable inputs and implementation');
  const report = replayLedger(contract, ledgerBytes);
  const after = prepareAttemptContract(root, baselineBytes, questionsBytes, packetBytes);
  if (canonicalJson(after) !== canonicalJson(contract)) fail('sources changed during offline replay');
  return report;
}
export function replayAttemptReport(root, contractBytes, baselineBytes, questionsBytes, packetBytes, ledgerBytes, reportBytes) {
  const actual = auditAttemptLedger(root, contractBytes, baselineBytes, questionsBytes, packetBytes, ledgerBytes);
  if (canonicalJson(parse(reportBytes, 'report').value) !== canonicalJson(actual)) fail('report differs from offline replay');
  return { status: 'recomputed-local-attempt-report', contract_sha256: actual.contract_sha256, ledger: actual.ledger,
    selected_items: actual.coverage.selected_items, model_baseline: false, execution_authorized: false };
}

function boundedFile(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_JSON_BYTES)) fail('input is not a bounded regular file');
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < bytes.length) { const n = readSync(fd, bytes, length, bytes.length - length, length); if (!n) break; length += n; }
    const after = fstatSync(fd, { bigint: true });
    if (length !== Number(before.size) || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(k => before[k] !== after[k])) fail('input changed during descriptor read');
    return bytes.subarray(0, length);
  } finally { closeSync(fd); }
}
function entry() {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (entry()) {
  const [command, root, baselinePath, questionsPath, packetPath, contractPath, ledgerPath, reportPath] = process.argv.slice(2);
  if (!['prepare', 'audit', 'replay'].includes(command) || !root || !baselinePath || !questionsPath || !packetPath || !contractPath ||
      (command !== 'prepare' && (!ledgerPath || !reportPath))) fail('usage: prepare root baseline questions packets|- NEWcontract; audit|replay root baseline questions packets|- contract ledger report');
  const baseline = boundedFile(baselinePath), questions = boundedFile(questionsPath), packets = packetPath === '-' ? null : boundedFile(packetPath);
  const result = command === 'prepare' ? prepareAttemptContract(root, baseline, questions, packets) :
    command === 'audit' ? auditAttemptLedger(root, boundedFile(contractPath), baseline, questions, packets, boundedFile(ledgerPath)) :
      replayAttemptReport(root, boundedFile(contractPath), baseline, questions, packets, boundedFile(ledgerPath), boundedFile(reportPath));
  if (command === 'replay') process.stdout.write(JSON.stringify(result) + '\n');
  else { const fd = openSync(command === 'prepare' ? contractPath : reportPath, 'wx', 0o600); try { writeFileSync(fd, JSON.stringify(result, null, 2) + '\n'); } finally { closeSync(fd); } }
}
