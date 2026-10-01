// Required injected offline fixtures only. No provider, client, credential or network default.
import * as fs from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { canonicalJson } from '../../canonical-json.mjs';
import { sha256 } from './evidence.mjs';
import { LEDGER_SCHEMA, MAX_JSON_BYTES, MAX_RAW_BYTES, prepareAttemptContract, auditAttemptLedger } from './attempt-accounting.mjs';

export const CONFIGURATION_SCHEMA = 'canli.filing-facts-fixture-configuration.v1';
export const POLICY_SCHEMA = 'canli.filing-facts-fixture-policy.v1';
export const RESPONSE_SCHEMA = 'canli.filing-facts-fixture-response.v1';
export const EVENT_SCHEMA = 'canli.filing-facts-fixture-event.v1';
export const MAX_FIXTURE_BYTES = 512 * 1024;
const MANIFEST_SCHEMA = 'canli.filing-facts-fixture-manifest.v1';
const PURPOSE = 'synthetic-software-fixture';
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const MAX_EVENTS = 512;
const MAX_PACKET_BYTES = 256 * 1024;
const HERE = 'scripts/datasets/filing-facts';
const OWN_FILES = ['attempt-collector.mjs', 'COLLECTOR.md'];
const LOADED = Object.fromEntries(OWN_FILES.map(name => [name, fs.readFileSync(new URL(name, import.meta.url))]));
const INPUTS = ['baseline', 'questions', 'accounting', 'configuration', 'packets'];
const ID = /^[A-Za-z0-9._:-]{1,128}$/;
const pin = bytes => ({ bytes: bytes.length, sha256: sha256(bytes) });
const digest = value => sha256(canonicalJson(value));
const encoded = value => Buffer.from(JSON.stringify(value) + '\n');
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = (value, max = MAX_RAW_BYTES) => typeof value === 'string' && value.length <= max &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value) && Buffer.byteLength(value) <= max;
const nonempty = value => text(value) && Boolean(value.trim());
const utc = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  !value.startsWith('0000') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function refused(message) {
  const error = new RangeError(`fixture collector: ${message}`);
  error.code = 'FIXTURE_COLLECTOR_REFUSED';
  return error;
}
const fail = message => { throw refused(message); };
function uncertain(cause) {
  const error = new Error('fixture collector: capture is uncertain; retain all files for read-only recovery review', { cause });
  error.code = 'FIXTURE_COLLECTOR_UNCERTAIN';
  return error;
}
function keys(value, names) {
  if (!object(value) || Object.keys(value).length !== names.length || names.some(name => !Object.hasOwn(value, name))) fail('unsupported or missing members');
}
function capturedBytes(input, label, max = MAX_JSON_BYTES) {
  if ((!Buffer.isBuffer(input) && typeof input !== 'string') || input.length > max ||
      (typeof input === 'string' && !text(input, max))) fail(`${label} exceeds bounded well-formed input`);
  const bytes = Buffer.from(input);
  if (bytes.length > max) fail(`${label} exceeds bounded byte input`);
  return bytes;
}

// JSON.parse supplies grammar; this bounded scanner additionally refuses duplicate decoded keys.
function parse(input, label, max = MAX_JSON_BYTES) {
  const bytes = capturedBytes(input, label, max);
  let source, value;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); value = JSON.parse(source); }
  catch { fail(`${label} is not UTF-8 JSON`); }
  let i = 0, nodes = 0;
  const whitespace = () => { while (/[\t\n\r ]/.test(source[i] ?? '') && i < source.length) i++; };
  const string = () => {
    const start = i++;
    while (i < source.length) { const char = source[i++]; if (char === '\\') i++; else if (char === '"') break; }
    const result = JSON.parse(source.slice(start, i));
    if (!text(result, max)) fail(`${label} contains invalid Unicode`);
    return result;
  };
  function scan(depth) {
    if (++nodes > 200000 || depth > 40) fail(`${label} exceeds JSON depth/node bounds`);
    whitespace();
    if (source[i] === '"') { string(); return; }
    if (source[i] === '{' || source[i] === '[') {
      const map = source[i++] === '{', end = map ? '}' : ']', names = new Set();
      whitespace(); if (source[i] === end) { i++; return; }
      while (i < source.length) {
        if (map) {
          whitespace(); const name = string();
          if (names.has(name)) fail(`${label} contains duplicate JSON members`);
          names.add(name); whitespace(); i++; // Colon; grammar was already checked.
        }
        scan(depth + 1); whitespace();
        if (source[i++] === end) break;
      }
      return;
    }
    const start = i;
    while (i < source.length && !/[\t\n\r ,}\]]/.test(source[i])) i++;
    const atom = JSON.parse(source.slice(start, i));
    if (typeof atom === 'number' && !Number.isFinite(atom)) fail(`${label} contains an unbounded number`);
  }
  scan(0);
  return { bytes, value, binding: pin(bytes) };
}

function inputsSnapshot(input) {
  if (!object(input)) fail('inputs must contain exactly five byte members');
  const fields = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(fields).length !== INPUTS.length || INPUTS.some(name => !fields[name] || !Object.hasOwn(fields[name], 'value'))) fail('inputs must be plain byte members without accessors');
  return Object.fromEntries(INPUTS.map(name => [name, name === 'packets' && fields[name].value === null ? null : capturedBytes(fields[name].value, name)]));
}

const sameIdentity = (a, b) => ['dev', 'ino', 'uid', 'gid', 'mode'].every(name => a[name] === b[name]);
const sameSnapshot = (a, b) => sameIdentity(a, b) && ['nlink', 'size', 'mtimeNs', 'ctimeNs'].every(name => a[name] === b[name]);
function checkFile(stat, privateFile) {
  if (!stat.isFile() || (privateFile && (stat.uid !== BigInt(process.getuid()) || (stat.mode & 0o7777n) !== 0o600n || stat.nlink !== 1n))) fail('capture file must be owned singly linked regular mode0600');
}
function readDescriptor(io, fd, max, privateFile) {
  const before = io.fstatSync(fd, { bigint: true }); checkFile(before, privateFile);
  if (before.size > BigInt(max)) fail('file exceeds bounded input');
  const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
  while (offset < bytes.length) { const count = io.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!integer(count) || count < 1 || count > bytes.length - offset) fail('short or invalid read'); offset += count; }
  const after = io.fstatSync(fd, { bigint: true });
  if (!sameSnapshot(before, after)) fail('file changed during descriptor read');
  return { bytes, stat: after };
}
function implementation(root) {
  return Object.fromEntries(OWN_FILES.map(name => {
    const path = join(root, HERE, name); let fd;
    try {
      fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const { bytes, stat } = readDescriptor(fs, fd, MAX_JSON_BYTES, false);
      if (!sameSnapshot(stat, fs.lstatSync(path, { bigint: true })) || !bytes.equals(LOADED[name]) || !bytes.equals(fs.readFileSync(new URL(name, import.meta.url)))) fail('loaded collector implementation changed');
      const closing = fd; fd = undefined; fs.closeSync(closing);
      return [`${HERE}/${name}`, pin(bytes)];
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }));
}

function ledgerShell(contract, config) {
  return { schema: LEDGER_SCHEMA, purpose: PURPOSE, contract_sha256: contract.contract_sha256,
    question_projection_sha256: contract.questions.projection_sha256,
    source_contract_sha256: config.arm === 'closed' ? null : digest(contract.source_parity), arm: config.arm,
    provider: config.provider, requested_model: config.requested_model, generation_settings: config.generation_settings,
    time_basis: 'caller-observed-monotonic-ms', bounds: { attempts_per_item: config.limits.attempts_per_item, item_duration_ms: config.limits.item_duration_ms },
    response_pointers: config.response_pointers, price_basis: config.price_basis, items: [] };
}
function audit(root, inputs, ledger) {
  return auditAttemptLedger(root, inputs.accounting, inputs.baseline, inputs.questions, inputs.packets, encoded(ledger));
}
function prepare(root, inputs) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('root must be an absolute checkout path');
  for (const name of INPUTS) if (inputs[name] !== null) parse(inputs[name], name);
  const contractInput = parse(inputs.accounting, 'accounting'), configInput = parse(inputs.configuration, 'configuration');
  const contract = prepareAttemptContract(root, inputs.baseline, inputs.questions, inputs.packets);
  if (!same(contract, contractInput.value)) fail('accounting contract differs from bound inputs');
  const config = configInput.value;
  keys(config, ['schema', 'purpose', 'arm', 'provider', 'requested_model', 'generation_settings', 'response_pointers', 'price_basis', 'limits', 'items']);
  if (config.schema !== CONFIGURATION_SCHEMA || config.purpose !== PURPOSE || !['closed', 'mcp'].includes(config.arm) ||
      config.provider !== 'synthetic-fixture' || config.requested_model !== 'fixture-model') fail('only declared synthetic fixtures are supported; real experiment arms remain held');
  keys(config.limits, ['attempts_per_item', 'turns_per_item', 'item_duration_ms']);
  if (!integer(config.limits.attempts_per_item) || config.limits.attempts_per_item < 1 || config.limits.attempts_per_item > 8 ||
      !integer(config.limits.turns_per_item) || config.limits.turns_per_item < 1 || config.limits.turns_per_item > 6 ||
      !integer(config.limits.item_duration_ms) || config.limits.item_duration_ms < 1 || config.limits.item_duration_ms > 30000) fail('invalid finite fixture limits');
  if (config.price_basis !== null && (!object(config.price_basis) || !text(config.price_basis.source_text) || !config.price_basis.source_text.startsWith('SYNTHETIC SOFTWARE FIXTURE'))) fail('price metadata must be explicitly synthetic or null');
  if (!Array.isArray(config.items) || config.items.length > contract.sample.items) fail('invalid bounded fixture items');
  const positions = new Map(contract.questions.bindings.map((row, index) => [row.id, index]));
  const identities = new Set(); let last = -1;
  for (const item of config.items) {
    keys(item, ['id', 'steps']);
    if (!positions.has(item.id) || positions.get(item.id) <= last || !Array.isArray(item.steps) || item.steps.length < 1 || item.steps.length > config.limits.attempts_per_item) fail('fixture items must be unique ordered selected IDs with finite steps');
    last = positions.get(item.id);
    for (let index = 0; index < item.steps.length; index++) {
      const step = item.steps[index], previous = item.steps[index - 1];
      keys(step, ['id', 'turn', 'retry_of', 'request_raw', 'trigger', 'http_statuses', 'delay_ms', 'reason']);
      if (typeof step.id !== 'string' || !ID.test(step.id) || identities.has(step.id) || !text(step.request_raw) ||
          !integer(step.turn) || step.turn < 1 || step.turn > config.limits.turns_per_item || !integer(step.delay_ms) || step.delay_ms > config.limits.item_duration_ms ||
          !Array.isArray(step.http_statuses) || step.http_statuses.length > 16 || new Set(step.http_statuses).size !== step.http_statuses.length ||
          step.http_statuses.some(status => !Number.isInteger(status) || status < 100 || status > 599 || (status >= 200 && status < 300))) fail('invalid fixture directive identity/request/bounds');
      identities.add(step.id);
      if (index === 0) {
        if (step.turn !== 1 || step.retry_of !== null || step.trigger !== 'start' || step.http_statuses.length || step.delay_ms !== 0 || step.reason !== null) fail('invalid first fixture directive');
      } else {
        if (!nonempty(step.reason) || !['response', 'http_error', 'transport_error'].includes(step.trigger)) fail('follow-up requires an explicit finite directive and reason');
        if (step.trigger === 'response') {
          if (step.retry_of !== null || step.turn !== previous.turn + 1 || step.http_statuses.length) fail('response continuation must advance one conversation turn');
        } else if (step.retry_of !== index || step.turn !== previous.turn || step.request_raw !== previous.request_raw ||
          (step.trigger === 'http_error' ? !step.http_statuses.length : step.http_statuses.length)) fail('retry must retain predecessor request/turn and explicit trigger');
      }
    }
  }
  audit(root, inputs, ledgerShell(contract, config)); // Reuse353 settings/pointers/price/source validation.
  const body = { schema: POLICY_SCHEMA, purpose: PURPOSE, inputs: Object.fromEntries(INPUTS.map(name => [name, inputs[name] === null ? null : pin(inputs[name])])),
    accounting_contract_sha256: contract.contract_sha256, dataset_sha256: contract.baseline.dataset_sha256,
    selected_questions: contract.questions.bindings, sample: contract.sample, configuration: config,
    implementation: implementation(root), execution: { fixture_only: true, model_calls_authorized: false, provider_authenticity_verified: false,
      source_assisted: 'unsupported-held', source_rights_and_complete_coverage: 'unverified-held' } };
  return { policy: { ...body, policy_sha256: digest(body) }, contract, config };
}
export function prepareCollectorPolicy(root, input) { return prepare(root, inputsSnapshot(input)).policy; }
function checked(root, input, policyInput) {
  const inputs = inputsSnapshot(input), policy = parse(policyInput, 'policy'), prepared = prepare(root, inputs);
  if (!same(policy.value, prepared.policy)) fail('policy/input/implementation binding mismatch');
  return { inputs, policyBytes: policy.bytes, ...prepared };
}

// Existing private home, immutable exclusive files, same-descriptor readback, no unlink cleanup.
class CaptureStore {
  constructor(directory, io, create) {
    if (typeof directory !== 'string' || !isAbsolute(directory)) fail('capture directory must be absolute');
    this.io = io; this.path = resolve(directory); this.expected = new Map(); this.total = 0; this.fd = undefined;
    try {
      const entry = io.lstatSync(this.path, { bigint: true });
      if (!entry.isDirectory() || entry.uid !== BigInt(process.getuid()) || (entry.mode & 0o7777n) !== 0o700n) fail('capture directory must be existing owned mode0700');
      this.real = io.realpathSync(this.path);
      this.fd = io.openSync(this.path, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      this.identity = io.fstatSync(this.fd, { bigint: true });
      if (!sameIdentity(entry, this.identity)) fail('capture directory changed during open');
      this.guard();
      if (create && io.readdirSync(this.path).length) fail('capture directory must be empty; existing captures are immutable');
    } catch (error) { this.close(); throw error; }
  }
  guard() {
    if (this.fd === undefined || !sameIdentity(this.identity, this.io.fstatSync(this.fd, { bigint: true })) ||
        !sameIdentity(this.identity, this.io.lstatSync(this.path, { bigint: true })) || this.io.realpathSync(this.path) !== this.real) fail('capture directory substituted or changed');
  }
  name(name) {
    if (!/^(?:baseline|questions|accounting|configuration|packets|policy|manifest)\.json$|^event-\d{4}\.json$/.test(name)) fail('invalid capture filename');
    return join(this.path, name);
  }
  read(name) {
    this.guard(); let fd;
    try {
      fd = this.io.openSync(this.name(name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const result = readDescriptor(this.io, fd, MAX_JSON_BYTES, true);
      this.guard();
      if (!sameSnapshot(result.stat, this.io.lstatSync(this.name(name), { bigint: true }))) fail('capture file substituted');
      const closing = fd; fd = undefined; this.io.closeSync(closing); this.guard();
      return result.bytes;
    } finally { if (fd !== undefined) this.io.closeSync(fd); }
  }
  verify() {
    this.guard();
    const names = this.io.readdirSync(this.path).sort();
    if (!same(names, [...this.expected.keys()].sort())) fail('unexpected or missing capture files');
    for (const [name, bytes] of this.expected) if (!this.read(name).equals(bytes)) fail('retained capture bytes changed');
    this.guard();
  }
  write(name, input) {
    const bytes = capturedBytes(input, 'capture frame');
    if (this.expected.has(name) || this.total + bytes.length > MAX_CAPTURE_BYTES) fail('capture file conflict or aggregate byte bound');
    this.verify(); let fd;
    try {
      fd = this.io.openSync(this.name(name), fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
      checkFile(this.io.fstatSync(fd, { bigint: true }), true);
      let offset = 0;
      while (offset < bytes.length) { const count = this.io.writeSync(fd, bytes, offset, bytes.length - offset, offset); if (!integer(count) || count < 1 || count > bytes.length - offset) fail('short or invalid write'); offset += count; }
      this.io.fsyncSync(fd);
      const readback = readDescriptor(this.io, fd, MAX_JSON_BYTES, true);
      if (!readback.bytes.equals(bytes) || !sameSnapshot(readback.stat, this.io.lstatSync(this.name(name), { bigint: true }))) fail('write readback or identity mismatch');
      this.guard();
      const closing = fd; fd = undefined; this.io.closeSync(closing);
      this.io.fsyncSync(this.fd); this.guard();
      this.expected.set(name, bytes); this.total += bytes.length; this.verify();
    } catch (error) { throw uncertain(error); }
    finally { if (fd !== undefined) this.io.closeSync(fd); }
  }
  remember(name, bytes) {
    if (this.total + bytes.length > MAX_CAPTURE_BYTES) fail('capture exceeds aggregate byte bound');
    this.expected.set(name, bytes); this.total += bytes.length;
  }
  close() { if (this.fd !== undefined) { const closing = this.fd; this.fd = undefined; this.io.closeSync(closing); } }
}

function manifestFor(context) {
  const entries = Object.fromEntries(INPUTS.filter(name => context.inputs[name] !== null)
    .map(name => [name, { file: `${name}.json`, ...pin(context.inputs[name]) }]));
  entries.policy = { file: 'policy.json', ...pin(context.policyBytes) };
  return { schema: MANIFEST_SCHEMA, purpose: PURPOSE, policy_sha256: context.policy.policy_sha256, inputs: entries };
}
function observation(value) {
  keys(value, ['monotonic_ms', 'utc', 'unavailable_reason']);
  if (value.monotonic_ms !== null && (!Number.isFinite(value.monotonic_ms) || value.monotonic_ms < 0 || value.monotonic_ms > Number.MAX_SAFE_INTEGER)) fail('invalid observed monotonic clock');
  if (value.utc !== null && !utc(value.utc)) fail('invalid observed wall clock');
  if (value.monotonic_ms === null || value.utc === null ? !nonempty(value.unavailable_reason) : value.unavailable_reason !== null) fail('clock missing-reason mismatch');
  return value;
}
function clock(runtime) {
  const monotonic = runtime.monotonic ?? (() => performance.now()), wall = runtime.wall ?? (() => new Date().toISOString());
  if (typeof monotonic !== 'function' || typeof wall !== 'function') fail('clocks must be injected functions');
  let last = -1;
  return () => {
    let value = null, date = null, reason = null;
    try {
      const sample = monotonic();
      if (!Number.isFinite(sample) || sample < last || sample < 0 || sample > Number.MAX_SAFE_INTEGER) reason = 'monotonic clock unavailable or moved backwards';
      else { value = sample; last = sample; }
    } catch { reason = 'monotonic clock threw'; }
    try { const sample = wall(); if (utc(sample)) date = sample; else reason = reason ?? 'wall timestamp unavailable'; }
    catch { reason = reason ?? 'wall timestamp threw'; }
    return { monotonic_ms: value, utc: date, unavailable_reason: reason };
  };
}
function interval(start, end, item = false) {
  const duration = start?.monotonic_ms !== null && start?.monotonic_ms !== undefined && end?.monotonic_ms !== null && end?.monotonic_ms !== undefined ? end.monotonic_ms - start.monotonic_ms : null;
  const validDuration = duration !== null && duration >= 0 && duration <= 86400000 ? duration : null;
  const ended = end?.utc && (!start?.utc || end.utc >= start.utc) ? end.utc : null;
  return { started_at: start?.utc ?? null, ended_at: ended, duration_ms: item ? null : validDuration,
    unavailable_reason: item ? 'item marker acknowledgment is not in its persisted clock; observed elapsed is a lower bound only' :
      start?.utc && ended && validDuration !== null ? null : 'caller timing unavailable, backwards or beyond the bounded interval' };
}
function pendingAttempt(step, ordinal, observed) {
  return { id: step.id, ordinal, turn: step.turn, retry_of: step.retry_of, status: 'pending', http_status: null,
    request_raw: step.request_raw, response_raw: null, response_missing_reason: 'pending fixture has no retained terminal response',
    answer_text: null, answer_missing_reason: 'pending fixture has no retained answer', error: null,
    usage_unavailable_reason: 'pending fixture usage is unknown',
    time: { started_at: observed.utc, ended_at: null, duration_ms: null, unavailable_reason: 'pending fixture has no terminal clock' }, tool_traces: [] };
}
function pointer(value, path) {
  for (const key of path.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if ((!object(value) && !Array.isArray(value)) || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}
function rawBytes(record) {
  keys(record, ['id', 'ordinal', 'observed', 'binding', 'payload_base64']);
  if (typeof record.payload_base64 !== 'string' || record.payload_base64.length > Math.ceil(MAX_FIXTURE_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.payload_base64)) fail('invalid bounded raw envelope encoding');
  const bytes = Buffer.from(record.payload_base64, 'base64');
  if (bytes.length > MAX_FIXTURE_BYTES || bytes.toString('base64') !== record.payload_base64 || !same(pin(bytes), record.binding)) fail('raw envelope binding mismatch');
  return bytes;
}
function envelope(context, record) {
  const value = parse(rawBytes(record), 'fixture response', MAX_FIXTURE_BYTES).value;
  keys(value, ['schema', 'purpose', 'http_status', 'response_raw', 'error', 'tools']);
  if (value.schema !== RESPONSE_SCHEMA || value.purpose !== PURPOSE ||
      (value.http_status !== null && (!Number.isInteger(value.http_status) || value.http_status < 100 || value.http_status > 599)) ||
      (value.response_raw !== null && !text(value.response_raw)) || (value.error !== null && !nonempty(value.error)) ||
      (value.http_status !== null && value.http_status >= 200 && value.http_status < 300 && value.error !== null) ||
      (value.http_status !== null && (value.http_status < 200 || value.http_status >= 300) && value.error === null) ||
      !Array.isArray(value.tools) || value.tools.length > 32 || (context.config.arm === 'closed' && value.tools.length)) fail('invalid fixture response/status/raw bounds');
  const packet = context.inputs.packets === null ? null : parse(context.inputs.packets, 'packets').value;
  const source = packet?.items.find(item => item.id === record.id);
  const ids = new Set();
  const tools = value.tools.map(tool => {
    keys(tool, ['id', 'name', 'status', 'error', 'arguments_raw', 'result_raw']);
    if (typeof tool.id !== 'string' || !ID.test(tool.id) || ids.has(tool.id) || !nonempty(tool.name) || !['result', 'error'].includes(tool.status) ||
        (tool.status === 'result' ? tool.error !== null : !nonempty(tool.error)) || !text(tool.arguments_raw) || !text(tool.result_raw, MAX_PACKET_BYTES)) fail('invalid raw tool fixture');
    ids.add(tool.id);
    let supplied = tool.result_raw;
    if (tool.status === 'result') {
      if (!source?.available || source.mcp.raw_text !== tool.result_raw) fail('raw tool result differs from frozen source packet');
      supplied = packet.truncation_policy.method === 'prefix' ? tool.result_raw.slice(0, packet.truncation_policy.limit) : tool.result_raw;
      if (!text(supplied, MAX_PACKET_BYTES) || source.mcp.supplied_text !== supplied) fail('supplied tool result or Unicode differs from frozen packet');
    }
    return { ...tool, result_supplied: supplied };
  });
  return { value, tools };
}
function terminalAttempt(context, pending, raw, data) {
  const attempt = { ...pending.attempt, time: interval(pending.observed, data.observed) };
  if (data.classification === 'captured') {
    if (!raw || data.reason !== null || data.received_bytes !== null) fail('captured terminal requires its retained raw envelope');
    const { value, tools } = envelope(context, raw.data);
    attempt.status = value.http_status !== null && (value.http_status < 200 || value.http_status >= 300) ? 'http_error' : value.error !== null ? 'transport_error' : 'response';
    attempt.http_status = value.http_status; attempt.error = value.error;
    attempt.response_raw = value.response_raw;
    attempt.response_missing_reason = value.response_raw === null ? 'fixture envelope contains no raw response body' : null;
    attempt.tool_traces = tools;
    let body = null;
    try { if (value.response_raw !== null) body = JSON.parse(value.response_raw); } catch { /* Retain malformed bodies;353 uses the same raw-response semantics. */ }
    const answer = body === null ? undefined : pointer(body, context.config.response_pointers.answer);
    attempt.answer_text = text(answer) ? answer : null;
    attempt.answer_missing_reason = attempt.answer_text === null ? 'retained body has no bounded well-formed answer at the declared pointer' : null;
    const known = Object.values(context.config.response_pointers.usage).every(path => integer(body === null ? undefined : pointer(body, path)));
    attempt.usage_unavailable_reason = known ? null : 'retained body lacks valid counts for all declared usage pointers';
  } else {
    if (!['refused', 'timeout', 'aborted', 'transport-exception'].includes(data.classification) || !nonempty(data.reason)) fail('invalid explicit terminal failure');
    if (data.classification === 'refused' && raw) {
      let reason = null;
      try { envelope(context, raw.data); } catch (error) { reason = error.message; }
      if (reason === null || reason !== data.reason) fail('raw refusal does not reproduce');
    } else if (raw) fail('uncaptured terminal cannot hide a retained response');
    attempt.status = ['timeout', 'aborted'].includes(data.classification) ? 'aborted' : 'transport_error';
    attempt.error = data.reason;
    attempt.response_missing_reason = `no accepted response: ${data.classification}; inspect retained raw event if present`;
    attempt.answer_missing_reason = 'fixture failed or was refused; no accepted answer';
    attempt.usage_unavailable_reason = 'no accepted raw body; usage is unknown, not zero';
  }
  return attempt;
}
function matches(step, previous) {
  return previous?.status === step.trigger && (step.trigger !== 'http_error' || step.http_statuses.includes(previous.http_status));
}
function replay(context, frames) {
  const states = new Map(), raw = new Map(); let active = null, finalized = false, lastClock = -1;
  const selected = new Map(context.contract.questions.bindings.map(row => [row.id, row]));
  for (const frame of frames) {
    if (finalized) fail('events after finalization are refused');
    const data = frame.data;
    if (frame.kind !== 'final') {
      observation(data.observed);
      if (data.observed.monotonic_ms !== null) {
        if (data.observed.monotonic_ms < lastClock) fail('event clock moved backwards');
        lastClock = data.observed.monotonic_ms;
      }
    }
    if (frame.kind === 'item_start') {
      keys(data, ['id', 'observed']);
      const plan = context.config.items.find(item => item.id === data.id);
      if (!plan || active !== null || states.has(data.id)) fail('duplicate/conflicting item start');
      const completed = [...states.keys()];
      if (completed.some(id => context.config.items.findIndex(item => item.id === id) >= context.config.items.findIndex(item => item.id === data.id))) fail('item execution order differs from policy');
      active = data.id; states.set(data.id, { plan, start: data.observed, end: null, attempts: [], pending: null, wait: null, error: null, status: 'incomplete', overruns: [] });
    } else if (frame.kind === 'final') {
      keys(data, ['ledger_binding', 'report_binding']);
      if (active !== null) fail('finalization cannot hide an active item');
      finalized = true;
    } else {
      const state = states.get(data.id);
      if (!state || (frame.kind !== 'item_overrun' && active !== data.id)) fail('event has no active bound item');
      const ordinal = state.attempts.length + 1, step = state.plan.steps[ordinal - 1];
      if (frame.kind === 'wait') {
        keys(data, ['id', 'ordinal', 'observed']);
        if (!step || !step.delay_ms || state.pending || state.wait || data.ordinal !== ordinal || !matches(step, state.attempts.at(-1))) fail('invalid bounded backoff transition');
        state.wait = { ordinal, ended: false, start: data.observed };
      } else if (frame.kind === 'wait_done') {
        keys(data, ['id', 'ordinal', 'observed', 'status', 'reason']);
        if (!state.wait || state.wait.ended || data.ordinal !== state.wait.ordinal || !['elapsed', 'timeout', 'aborted', 'error'].includes(data.status) ||
            (data.status === 'elapsed' ? data.reason !== null : !nonempty(data.reason))) fail('invalid backoff completion');
        if (data.status === 'elapsed' && (state.wait.start.monotonic_ms === null || data.observed.monotonic_ms === null ||
            data.observed.monotonic_ms - state.wait.start.monotonic_ms < state.plan.steps[data.ordinal - 1].delay_ms)) fail('backoff completion lacks its declared observed interval');
        state.wait.ended = true; state.wait.status = data.status;
      } else if (frame.kind === 'pending') {
        keys(data, ['id', 'ordinal', 'observed']);
        if (!step || state.pending || data.ordinal !== ordinal || (ordinal > 1 && !matches(step, state.attempts.at(-1))) ||
            (step.delay_ms && (!state.wait?.ended || state.wait.status !== 'elapsed'))) fail('pending dispatch conflicts with the finite directive');
        if (state.start.monotonic_ms === null || data.observed.monotonic_ms === null ||
            data.observed.monotonic_ms - state.start.monotonic_ms >= context.config.limits.item_duration_ms) fail('pending directive lacks a clock inside its absolute item deadline');
        state.pending = { observed: data.observed, attempt: pendingAttempt(step, ordinal, data.observed), raw: null };
        state.wait = null;
      } else if (frame.kind === 'raw') {
        rawBytes(data);
        if (!state.pending || state.pending.raw !== null || data.ordinal !== state.pending.attempt.ordinal) fail('raw envelope has no unique pending attempt');
        raw.set(frame.sequence, frame); state.pending.raw = frame.sequence;
      } else if (frame.kind === 'terminal') {
        keys(data, ['id', 'ordinal', 'observed', 'raw_sequence', 'classification', 'reason', 'received_bytes']);
        if (!state.pending || data.ordinal !== state.pending.attempt.ordinal || data.raw_sequence !== state.pending.raw ||
            (data.received_bytes !== null && !integer(data.received_bytes))) fail('terminal identity/raw binding mismatch');
        state.attempts.push(terminalAttempt(context, state.pending, raw.get(data.raw_sequence), data)); state.pending = null;
      } else if (frame.kind === 'item_end') {
        keys(data, ['id', 'observed', 'status', 'error']);
        if (state.pending || (state.wait && !state.wait.ended) || !['completed', 'error', 'aborted', 'incomplete'].includes(data.status) ||
            (data.error !== null && !nonempty(data.error)) || (['error', 'aborted'].includes(data.status) && !nonempty(data.error))) fail('invalid item completion');
        const last = state.attempts.at(-1);
        if (data.status === 'completed' && (last?.status !== 'response' || last.answer_text === null || data.error !== null)) fail('completed item lacks its final successful raw answer');
        state.end = data.observed; state.status = data.status; state.error = data.error; active = null;
      } else if (frame.kind === 'item_overrun') {
        keys(data, ['id', 'observed', 'reason']);
        if (!state.end || state.overruns.length || active !== null || !nonempty(data.reason) ||
            (state.start.monotonic_ms !== null && data.observed.monotonic_ms !== null &&
              data.observed.monotonic_ms - state.start.monotonic_ms < context.config.limits.item_duration_ms)) fail('overrun needs an observed late/unknown clock after its item marker');
        state.overruns.push(data); state.end = data.observed; state.status = 'aborted'; state.error = data.reason;
      } else fail('unsupported capture event');
    }
  }
  const ledger = ledgerShell(context.contract, context.config);
  ledger.items = [...states.entries()].map(([id, state]) => {
    const attempts = [...state.attempts, ...(state.pending ? [state.pending.attempt] : [])];
    const last = state.attempts.at(-1), completed = state.status === 'completed';
    return { id, question_sha256: selected.get(id).question_sha256, status: state.status, error: state.error,
      declared_attempts: state.end ? attempts.length : null, final_attempt: completed ? last.ordinal : null,
      response_text: completed ? last.answer_text : null, response_missing_reason: completed ? null : 'item has no acknowledged final successful answer',
      time: interval(state.start, state.end, true), attempts };
  });
  if (encoded(ledger).length > MAX_JSON_BYTES) fail('reconstructed ledger exceeds353 byte bound');
  return { ledger, states, active, finalized };
}

class Journal {
  constructor(store, context, manifestBytes, frames = []) {
    this.store = store; this.context = context; this.manifestBytes = manifestBytes; this.frames = frames;
    this.previous = frames.length ? pin(encoded(frames.at(-1))).sha256 : pin(manifestBytes).sha256;
  }
  emit(kind, data) {
    if (this.frames.length >= MAX_EVENTS) fail('capture event bound exceeded');
    const frame = { schema: EVENT_SCHEMA, purpose: PURPOSE, policy_sha256: this.context.policy.policy_sha256,
      sequence: this.frames.length + 1, previous_sha256: this.previous, kind, data };
    replay(this.context, [...this.frames, frame]);
    const bytes = encoded(frame);
    this.store.write(`event-${String(frame.sequence).padStart(4, '0')}.json`, bytes);
    this.frames.push(frame); this.previous = sha256(bytes);
    return frame;
  }
  state() { return replay(this.context, this.frames); }
}

function ioFor(runtime) {
  const io = runtime.io ?? fs;
  for (const name of ['openSync', 'closeSync', 'fstatSync', 'lstatSync', 'realpathSync', 'readSync', 'writeSync', 'fsyncSync', 'readdirSync']) if (typeof io[name] !== 'function') fail('injected filesystem facade is incomplete');
  return io;
}
function frozen(value) {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
  return value;
}
function exceptionReason(error) {
  let value;
  try { value = Object.getOwnPropertyDescriptor(error, 'message')?.value; } catch { /* Do not invoke a thrown object's getter. */ }
  return text(value, 1024) ? `synthetic transport exception: ${value}` : 'synthetic transport exception; bounded message unavailable';
}
function waitDefault(delay, signal) {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, delay);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}
function boundedCall(task, remaining, external) {
  if (remaining === null || remaining <= 0) return Promise.resolve({ kind: 'timeout', reason: 'absolute fixture deadline elapsed or clock unavailable' });
  if (external?.aborted) return Promise.resolve({ kind: 'aborted', reason: 'explicit caller abort' });
  return new Promise(resolve => {
    const controller = new AbortController(); let settled = false, timer;
    const finish = outcome => {
      if (settled) return;
      settled = true; clearTimeout(timer); external?.removeEventListener('abort', abort);
      if (['timeout', 'aborted'].includes(outcome.kind)) controller.abort();
      resolve(outcome);
    };
    const abort = () => finish({ kind: 'aborted', reason: 'explicit caller abort' });
    external?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish({ kind: 'timeout', reason: 'absolute fixture deadline elapsed' }), Math.max(1, Math.ceil(remaining)));
    // Every loser is handled, but has no collector continuation, write or new dispatch.
    Promise.resolve().then(() => settled ? undefined : task(controller.signal))
      .then(value => { if (!settled) finish({ kind: 'returned', value }); }, error => { if (!settled) finish({ kind: 'exception', reason: exceptionReason(error) }); });
    if (external?.aborted) abort();
  });
}
function remaining(deadline, observed) { return observed.monotonic_ms === null || deadline === null ? null : deadline - observed.monotonic_ms; }
function acceptedRaw(value) {
  if (!Buffer.isBuffer(value) && typeof value !== 'string') return { bytes: null, reason: 'fixture callback must return bounded byte data; no object serialization', received: null };
  if (value.length > MAX_FIXTURE_BYTES) return { bytes: null, reason: 'fixture envelope exceeds512KiB; raw bytes not retained', received: Buffer.isBuffer(value) ? value.length : null };
  if (typeof value === 'string' && !text(value, MAX_FIXTURE_BYTES)) return { bytes: null, reason: 'fixture string exceeds UTF-8 bound or has invalid Unicode; no replacement encoding', received: null };
  return { bytes: Buffer.from(value), reason: null, received: null };
}
function finishKind(state) {
  const last = state.attempts.at(-1);
  if (last?.status === 'response') return last.answer_text === null ? { status: 'incomplete', error: null } : { status: 'completed', error: null };
  if (last?.status === 'aborted') return { status: 'aborted', error: last.error };
  return { status: 'error', error: last?.error ?? 'fixture ended without an acknowledged response' };
}
function result(context, journal, report, status, closure = null) {
  const state = journal.state(), ledgerBytes = encoded(state.ledger), reportBytes = encoded(report);
  return { status, purpose: PURPOSE, model_baseline: false, execution_authorized: false, policy_sha256: context.policy.policy_sha256,
    ledger: state.ledger, ledger_bytes: ledgerBytes, report, report_bytes: reportBytes,
    events: journal.frames.length, finalized: state.finalized, closure_observation: closure, complete_item_latency_verified: false,
    item_observations: [...state.states.entries()].map(([id, item]) => ({ id, start: item.start, last: item.end,
      observed_elapsed_lower_bound_ms: item.start.monotonic_ms !== null && item.end?.monotonic_ms !== null && item.end?.monotonic_ms !== undefined ? item.end.monotonic_ms - item.start.monotonic_ms : null,
      deadline_overruns: item.overruns })) };
}

export async function collectFixture(root, input, policyInput, directory, runtime) {
  if (!object(runtime) || typeof runtime.transport !== 'function') fail('an injected synthetic transport is required');
  if (runtime.wait !== undefined && typeof runtime.wait !== 'function') fail('wait must be an injected function');
  if (runtime.signal !== undefined && (!runtime.signal || typeof runtime.signal.aborted !== 'boolean' || typeof runtime.signal.addEventListener !== 'function' || typeof runtime.signal.removeEventListener !== 'function')) fail('invalid explicit abort signal');
  const context = checked(root, input, policyInput), observe = clock(runtime), io = ioFor(runtime);
  const store = new CaptureStore(directory, io, true);
  let captureStarted = false;
  try {
    const manifest = manifestFor(context), manifestBytes = encoded(manifest);
    captureStarted = true;
    for (const name of INPUTS) if (context.inputs[name] !== null) store.write(`${name}.json`, context.inputs[name]);
    store.write('policy.json', context.policyBytes); store.write('manifest.json', manifestBytes);
    const journal = new Journal(store, context, manifestBytes);
    const questions = parse(context.inputs.questions, 'questions').value.questions;
    for (const plan of context.config.items) {
      if (runtime.signal?.aborted) break;
      const start = observe(), deadline = start.monotonic_ms === null ? null : start.monotonic_ms + context.config.limits.item_duration_ms;
      journal.emit('item_start', { id: plan.id, observed: start });
      let end = null;
      for (let index = 0; index < plan.steps.length; index++) {
        const step = plan.steps[index], ordinal = index + 1;
        if (index && !matches(step, journal.state().states.get(plan.id).attempts.at(-1))) break;
        let observed = observe();
        if (runtime.signal?.aborted || remaining(deadline, observed) === null || remaining(deadline, observed) <= 0) {
          end = { status: 'aborted', error: runtime.signal?.aborted ? 'explicit caller abort before dispatch' : 'absolute item deadline elapsed or clock unavailable before dispatch' }; break;
        }
        if (step.delay_ms) {
          journal.emit('wait', { id: plan.id, ordinal, observed }); observed = observe();
          const waitStarted = observed;
          const waited = await boundedCall(signal => (runtime.wait ?? waitDefault)(step.delay_ms, signal), remaining(deadline, observed), runtime.signal);
          const waitEnded = observe();
          let status = waited.kind === 'returned' ? 'elapsed' : waited.kind === 'exception' ? 'error' : waited.kind;
          let waitReason = status === 'elapsed' ? null : waited.reason;
          if (status === 'elapsed' && (waitStarted.monotonic_ms === null || waitEnded.monotonic_ms === null || waitEnded.monotonic_ms - waitStarted.monotonic_ms < step.delay_ms)) {
            status = 'error'; waitReason = 'backoff returned before its requested interval or clock was unavailable';
          }
          journal.emit('wait_done', { id: plan.id, ordinal, observed: waitEnded, status, reason: waitReason });
          observed = observe();
          if (status !== 'elapsed' || remaining(deadline, observed) === null || remaining(deadline, observed) <= 0) {
            end = { status: 'aborted', error: waitReason ?? 'absolute item deadline elapsed after backoff capture' }; break;
          }
        }
        journal.emit('pending', { id: plan.id, ordinal, observed });
        // Acknowledged pending capture + checked implementation precede any fixture invocation.
        audit(root, context.inputs, journal.state().ledger); implementation(root); store.verify();
        observed = observe();
        const request = frozen({ purpose: PURPOSE, id: plan.id, question: questions.find(question => question.id === plan.id).question,
          attempt_id: step.id, ordinal, turn: step.turn, request_raw: step.request_raw, directive: JSON.parse(JSON.stringify(step)), deadline_monotonic_ms: deadline });
        const outcome = await boundedCall(signal => runtime.transport(Object.freeze({ ...request, signal })), remaining(deadline, observed), runtime.signal);
        let rawSequence = null, classification, reason = null, received = null;
        if (outcome.kind === 'returned') {
          const captured = acceptedRaw(outcome.value);
          if (captured.bytes === null) { classification = 'refused'; reason = captured.reason; received = captured.received; }
          else {
            const frame = journal.emit('raw', { id: plan.id, ordinal, observed: observe(), binding: pin(captured.bytes), payload_base64: captured.bytes.toString('base64') });
            rawSequence = frame.sequence;
            try { envelope(context, frame.data); classification = 'captured'; }
            catch (error) { classification = 'refused'; reason = error.message; }
          }
        } else { classification = outcome.kind === 'exception' ? 'transport-exception' : outcome.kind; reason = outcome.reason; }
        implementation(root);
        journal.emit('terminal', { id: plan.id, ordinal, observed: observe(), raw_sequence: rawSequence, classification, reason, received_bytes: received });
        audit(root, context.inputs, journal.state().ledger);
        observed = observe();
        if (runtime.signal?.aborted || remaining(deadline, observed) === null || remaining(deadline, observed) <= 0) {
          end = { status: 'aborted', error: runtime.signal?.aborted ? 'explicit caller abort after terminal capture' : 'absolute item deadline elapsed or clock unavailable after terminal capture' }; break;
        }
      }
      end ??= finishKind(journal.state().states.get(plan.id));
      journal.emit('item_end', { id: plan.id, observed: observe(), ...end });
      // Include marker work in scheduler admission; persisted item latency stays explicitly unknown.
      implementation(root); store.verify();
      const acknowledged = observe();
      if (remaining(deadline, acknowledged) === null || remaining(deadline, acknowledged) <= 0) journal.emit('item_overrun', {
        id: plan.id, observed: acknowledged, reason: 'deadline elapsed or clock unavailable after item marker acknowledgment' });
    }
    const ledger = journal.state().ledger, report = audit(root, context.inputs, ledger);
    journal.emit('final', { ledger_binding: pin(encoded(ledger)), report_binding: pin(encoded(report)) });
    // The closure clock is observed after final checks and descriptor closure, not before them.
    audit(root, context.inputs, journal.state().ledger); implementation(root); store.verify(); store.close();
    return result(context, journal, report, 'synthetic-fixture-capture-finalized', observe());
  } catch (error) {
    if (captureStarted && error.code !== 'FIXTURE_COLLECTOR_UNCERTAIN') throw uncertain(error);
    throw error;
  } finally { try { store.close(); } catch (error) { throw uncertain(error); } }
}

export function recoverFixture(root, input, policyInput, directory, runtime = {}) {
  const context = checked(root, input, policyInput), store = new CaptureStore(directory, ioFor(runtime), false);
  try {
    const names = store.io.readdirSync(store.path).sort();
    if (names.length > MAX_EVENTS + 7) fail('capture file count exceeds finite bound');
    for (const name of INPUTS) if (context.inputs[name] !== null) {
      const bytes = store.read(`${name}.json`);
      if (!bytes.equals(context.inputs[name])) fail('persisted original input binding mismatch');
      store.remember(`${name}.json`, bytes);
    }
    const policyBytes = store.read('policy.json');
    if (!policyBytes.equals(context.policyBytes)) fail('persisted policy bytes differ');
    store.remember('policy.json', policyBytes);
    const manifestBytes = store.read('manifest.json');
    if (!manifestBytes.equals(encoded(manifestFor(context)))) fail('capture manifest binding mismatch');
    store.remember('manifest.json', manifestBytes);
    let previous = sha256(manifestBytes); const frames = [];
    const eventNames = names.filter(name => /^event-\d{4}\.json$/.test(name));
    for (let index = 0; index < eventNames.length; index++) {
      const name = `event-${String(index + 1).padStart(4, '0')}.json`;
      if (eventNames[index] !== name) fail('event sequence has a gap or duplicate');
      const bytes = store.read(name), frame = parse(bytes, 'event').value;
      keys(frame, ['schema', 'purpose', 'policy_sha256', 'sequence', 'previous_sha256', 'kind', 'data']);
      if (frame.schema !== EVENT_SCHEMA || frame.purpose !== PURPOSE || frame.policy_sha256 !== context.policy.policy_sha256 || frame.sequence !== index + 1 || frame.previous_sha256 !== previous) fail('event chain/policy/sequence binding mismatch');
      previous = sha256(bytes); frames.push(frame); store.remember(name, bytes);
    }
    store.verify();
    const journal = new Journal(store, context, manifestBytes, frames), state = journal.state(), report = audit(root, context.inputs, state.ledger);
    if (state.finalized) {
      const final = frames.at(-1).data;
      if (!same(final.ledger_binding, pin(encoded(state.ledger))) || !same(final.report_binding, pin(encoded(report)))) fail('final ledger/report binding does not recompute');
    }
    implementation(root); store.verify(); store.close();
    return result(context, journal, report, state.finalized ? 'recomputed-finalized-synthetic-fixture' : 'recomputed-interrupted-synthetic-fixture');
  } finally { try { store.close(); } catch (error) { throw uncertain(error); } }
}
