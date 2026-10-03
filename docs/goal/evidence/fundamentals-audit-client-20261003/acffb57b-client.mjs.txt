import * as nativeFs from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { TextDecoder, types } from 'node:util';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_TOOL, AUDIT_TOOL_OUTPUT } from '../src/audit-inputs-stdio.mjs';
import { AUDIT_INPUTS_LIMITS } from '../src/audit-inputs-core.mjs';
import { canonicalJson, contentHash } from '../src/canonical-json.mjs';

// Repository-only, offline example. Importing it starts no client or input capture.
export const AUDIT_CLIENT_LIMITS = Object.freeze({
  reference: 524288, usage: 65536, settings: 4096, aggregate: 573440,
  request: 1048576, response: 524288, stderr: 65536, output: 524288,
  refusal: 2048, path: 4096, workMs: 15000, closeMs: 5000, totalMs: 20000,
});
const KEYS = Object.freeze(['reference', 'usage', 'settings']);
const STATUSES = Object.freeze(['match', 'mismatch', 'missing', 'ambiguous', 'unsupported', 'timing_indeterminate']);
const OMITTED = Object.freeze(['bindings.*.original_base64', 'rows.*.eligible_vintages', 'rows.*.same_day_vintages', 'rows.*.later_vintages', 'rows.*.unsupported_vintages']);
const USAGE_KEYS = Object.freeze(['cik', 'taxonomy', 'concept', 'unit', 'start', 'end', 'value', 'used_on']);
const NULL_ESTABLISHED = Object.freeze(['full_universe_coverage', 'survivorship_audit', 'source_rights', 'expert_adjudication', 'release_calibration', 'global_availability', 'trading_calendar_lookahead', 'split_or_scaling_adjustment']);
const CODES = new Set(['ARGUMENTS', 'ROOT', 'EXPECTED_SHA', 'REFERENCE_SHA', 'INPUT_BYTES', 'INPUT_BOUND', 'INPUT_AGGREGATE', 'INPUT_OPEN', 'INPUT_TYPE', 'INPUT_READ', 'INPUT_SHORT', 'INPUT_OVERFLOW', 'INPUT_CHANGED', 'INPUT_CLOSE', 'INPUT_UTF8', 'INPUT_JSON', 'OPERATIONS', 'CONNECT', 'CALL', 'TOOL_REFUSED', 'RESPONSE_BOUND', 'RESPONSE_SHAPE', 'RESPONSE_TEXT', 'RESPONSE_HASH', 'RESPONSE_BINDING', 'RESPONSE_ROWS', 'RESPONSE_UNKNOWNS', 'STDERR_BOUND', 'ABORTED', 'WORK_DEADLINE', 'CLOCK', 'CLOSE', 'CLOSE_DEADLINE', 'CHILD_UNCERTAIN', 'OUTPUT_BOUND', 'INTERNAL']);
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeLength = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength').get;
const nativeBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer').get;
const nativeSet = Uint8Array.prototype.set;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const own = (o, k) => Object.hasOwn(o, k);

export class AuditClientError extends Error {
  constructor(code) { super(`Offline audit client refused (${code}).`); this.code = code; this.name = 'AuditClientError'; }
}
const refuse = code => { throw new AuditClientError(code); };
const errorCode = (error, fallback) => error instanceof AuditClientError && CODES.has(error.code) ? error.code : fallback;
function expectedSha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) refuse('EXPECTED_SHA');
}
function pathText(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > AUDIT_CLIENT_LIMITS.path || Buffer.byteLength(value) > AUDIT_CLIENT_LIMITS.path || /[\u0000-\u001f\u007f]/.test(value) || !isAbsolute(value)) refuse('ARGUMENTS');
  return value;
}
function nativeSize(value) {
  if (types.isProxy(value) || !types.isUint8Array(value)) refuse('INPUT_BYTES');
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) || types.isSharedArrayBuffer(nativeBuffer.call(value))) refuse('INPUT_BYTES');
  return nativeLength.call(value);
}
function admitSizes(sizes) {
  for (const key of KEYS) if (!Number.isSafeInteger(sizes[key]) || sizes[key] < 1 || sizes[key] > AUDIT_CLIENT_LIMITS[key]) refuse('INPUT_BOUND');
  if (KEYS.reduce((n, key) => n + sizes[key], 0) > AUDIT_CLIENT_LIMITS.aggregate) refuse('INPUT_AGGREGATE');
}
function captureNative(reference, usage, settings) {
  const source = { reference, usage, settings };
  const sizes = Object.fromEntries(KEYS.map(key => [key, nativeSize(source[key])]));
  admitSizes(sizes); // All native slots admitted before ANY allocation/copy/base64.
  return Object.fromEntries(KEYS.map(key => {
    const bytes = Buffer.alloc(sizes[key]); nativeSet.call(bytes, source[key]); return [key, bytes];
  }));
}
function sameStat(a, b) {
  return ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
}

/** Trusted native FS or a bounded test adapter. No retry of an ambiguous numeric FD. */
export function captureAuditInputFiles(paths, { fs = nativeFs, boundary = () => {} } = {}) {
  const entries = [];
  let failure;
  let captured;
  try {
    for (const key of KEYS) {
      pathText(paths[key]); boundary();
      let fd;
      try { fd = fs.openSync(paths[key], fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW); }
      catch { refuse('INPUT_OPEN'); }
      const entry = { key, fd }; entries.push(entry); boundary();
      try { entry.stat = fs.fstatSync(fd, { bigint: true }); }
      catch { refuse('INPUT_READ'); }
      if (!entry.stat.isFile()) refuse('INPUT_TYPE');
      const size = entry.stat.size;
      if (typeof size !== 'bigint' || size < 1n || size > BigInt(AUDIT_CLIENT_LIMITS[key])) refuse('INPUT_BOUND');
      entry.size = Number(size); boundary();
    }
    admitSizes(Object.fromEntries(entries.map(e => [e.key, e.size])));
    captured = {};
    for (const entry of entries) {
      boundary();
      const bytes = Buffer.alloc(entry.size);
      let position = 0;
      while (position < bytes.length) {
        boundary();
        const remaining = Math.min(65536, bytes.length - position);
        let count;
        try { count = fs.readSync(entry.fd, bytes, position, remaining, position); }
        catch { refuse('INPUT_READ'); }
        if (!Number.isInteger(count) || count < 0 || count > remaining) refuse('INPUT_OVERFLOW');
        if (count === 0) refuse('INPUT_SHORT');
        position += count; boundary();
      }
      const overflow = Buffer.alloc(1); boundary();
      let extra;
      try { extra = fs.readSync(entry.fd, overflow, 0, 1, position); }
      catch { refuse('INPUT_READ'); }
      if (extra !== 0) refuse('INPUT_OVERFLOW');
      boundary();
      let after;
      try { after = fs.fstatSync(entry.fd, { bigint: true }); }
      catch { refuse('INPUT_READ'); }
      if (!after.isFile() || !sameStat(entry.stat, after)) refuse('INPUT_CHANGED');
      captured[entry.key] = bytes; boundary();
    }
  } catch (error) { failure = error instanceof AuditClientError ? error : new AuditClientError('INPUT_READ'); }
  finally {
    for (const entry of entries.reverse()) {
      const fd = entry.fd; entry.fd = undefined; // Relinquish BEFORE exactly one close attempt.
      if (fd !== undefined) try { fs.closeSync(fd); }
      catch { failure ??= new AuditClientError('INPUT_CLOSE'); }
    }
  }
  if (failure) throw failure;
  boundary();
  return captured;
}

// Structure-only parser: no financial calculation, date selection or input repair.
// The delivered executor remains responsible for the input schemas and arithmetic.
function strictJson(bytes, code) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { refuse(code === 'INPUT_JSON' ? 'INPUT_UTF8' : code); }
  let at = 0, nodes = 0;
  const space = () => { while (at < source.length && ' \r\n\t'.includes(source[at])) at++; };
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  function string() {
    const start = at++;
    while (at < source.length) {
      const c = source[at++];
      if (c === '\\') { at++; continue; }
      if (c === '"') {
        let value;
        try { value = JSON.parse(source.slice(start, at)); } catch { refuse(code); }
        for (let i = 0; i < value.length; i++) {
          const u = value.charCodeAt(i);
          if (u >= 0xd800 && u <= 0xdbff) { const v = value.charCodeAt(++i); if (!(v >= 0xdc00 && v <= 0xdfff)) refuse(code); }
          else if (u >= 0xdc00 && u <= 0xdfff) refuse(code);
        }
        return value;
      }
    }
    refuse(code);
  }
  function value(depth) {
    if (depth > 24 || ++nodes > 65536) refuse(code);
    space(); const c = source[at];
    if (c === '"') return string();
    if (c === '{') {
      at++; const result = Object.create(null); space();
      if (source[at] === '}') { at++; return result; }
      while (at < source.length) {
        space(); if (source[at] !== '"') refuse(code);
        const key = string(); if (own(result, key)) refuse(code);
        space(); if (source[at++] !== ':') refuse(code);
        result[key] = value(depth + 1); space();
        const delimiter = source[at++]; if (delimiter === '}') return result; if (delimiter !== ',') refuse(code);
      }
      refuse(code);
    }
    if (c === '[') {
      at++; const result = []; space();
      if (source[at] === ']') { at++; return result; }
      while (at < source.length) {
        if (result.length >= 4096) refuse(code);
        result.push(value(depth + 1)); space();
        const delimiter = source[at++]; if (delimiter === ']') return result; if (delimiter !== ',') refuse(code);
      }
      refuse(code);
    }
    for (const [token, result] of [['null', null], ['true', true], ['false', false]]) if (source.startsWith(token, at)) { at += token.length; return result; }
    number.lastIndex = at; const hit = number.exec(source);
    if (!hit || hit[0].length > 128 || !Number.isFinite(Number(hit[0]))) refuse(code);
    at = number.lastIndex; return Number(hit[0]);
  }
  const parsed = value(0); space(); if (at !== source.length) refuse(code); return parsed;
}

/** Admit a bounded, getter-free JSON graph before retaining/validating a reply. */
function ownedJson(value, maximum) {
  const chunks = []; let size = 0, nodes = 0;
  function append(part) { size += Buffer.byteLength(part); if (size > maximum) refuse('RESPONSE_BOUND'); chunks.push(part); }
  function text(s) { if (s.length > maximum || Buffer.byteLength(s) > maximum) refuse('RESPONSE_BOUND'); append(JSON.stringify(s)); }
  function visit(v, depth) {
    if (depth > 24 || ++nodes > 65536) refuse('RESPONSE_BOUND');
    if (v === null || typeof v === 'boolean') { append(JSON.stringify(v)); return; }
    if (typeof v === 'string') { text(v); return; }
    if (typeof v === 'number') { if (!Number.isFinite(v)) refuse('RESPONSE_SHAPE'); append(JSON.stringify(v)); return; }
    if (typeof v !== 'object' || types.isProxy(v)) refuse('RESPONSE_SHAPE');
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) refuse('RESPONSE_SHAPE');
    const keys = Reflect.ownKeys(v);
    if (keys.length > 4097 || keys.some(k => typeof k !== 'string')) refuse('RESPONSE_BOUND');
    append(array ? '[' : '{');
    const entries = array ? keys.filter(k => k !== 'length') : keys;
    if (array && (v.length > 4096 || entries.length !== v.length || entries.some((k, i) => k !== String(i)))) refuse('RESPONSE_SHAPE');
    entries.forEach((key, i) => {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable) refuse('RESPONSE_SHAPE');
      if (i) append(','); if (!array) { text(key); append(':'); }
      visit(descriptor.value, depth + 1);
    });
    append(array ? ']' : '}');
  }
  visit(value, 0);
  const encoded = chunks.join('');
  strictJson(Buffer.from(encoded), 'RESPONSE_SHAPE');
  return JSON.parse(encoded); // Owned ordinary JSON, after duplicate/Unicode validation.
}
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
function jsonRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function requireKeys(value, keys, code) {
  if (!jsonRecord(value) || Object.keys(value).length !== keys.length || keys.some(k => !own(value, k))) refuse(code);
}

function validateReply(reply, prepared) {
  const result = ownedJson(reply, AUDIT_CLIENT_LIMITS.response);
  if (result.isError === true) refuse('TOOL_REFUSED');
  if (result.resultType !== 'complete' || (own(result, 'isError') && result.isError !== false) || !Array.isArray(result.content) || result.content.length !== 1 || !jsonRecord(result.content[0]) || result.content[0].type !== 'text' || typeof result.content[0].text !== 'string' || !jsonRecord(result.structuredContent)) refuse('RESPONSE_SHAPE');
  const text = strictJson(Buffer.from(result.content[0].text), 'RESPONSE_TEXT');
  const data = result.structuredContent;
  if (!equal(text, data)) refuse('RESPONSE_TEXT');
  if (!AUDIT_TOOL_OUTPUT.safeParse(data).success || data.status !== 'ok' || data.view !== 'compact' || data.audit?.schema !== 'canli.fundamentals.audit-compact.v1') refuse('RESPONSE_SHAPE');
  if (typeof data.content_hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(data.content_hash) || contentHash(data, createHash) !== data.content_hash) refuse('RESPONSE_HASH');
  const audit = data.audit, projection = data.projection;
  requireKeys(projection, ['complete_core_report', 'core_report_content_hash', 'retained_selected_n', 'omitted'], 'RESPONSE_SHAPE');
  if (projection.complete_core_report !== false || !equal(projection.omitted, OMITTED) || audit.source_report_schema !== 'canli.fundamentals.audit-report.v1' || own(audit, 'content_hash')) refuse('RESPONSE_SHAPE');
  requireKeys(audit.bindings, KEYS, 'RESPONSE_BINDING');
  for (const key of KEYS) {
    requireKeys(audit.bindings[key], ['bytes', 'sha256'], 'RESPONSE_BINDING');
    if (!equal(audit.bindings[key], prepared.bindings[key])) refuse('RESPONSE_BINDING');
  }
  if (audit.expected_reference_sha256 !== prepared.expected || audit.reference_byte_binding_verified !== true || !equal(audit.settings, prepared.settings) || !equal(audit.limits, AUDIT_INPUTS_LIMITS)) refuse('RESPONSE_BINDING');
  const n = prepared.usage.length;
  if (n < 1 || n > 64 || audit.rows.length !== n || audit.coverage.selected_n !== n || projection.retained_selected_n !== n) refuse('RESPONSE_ROWS');
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
  audit.rows.forEach((row, i) => {
    if (!STATUSES.includes(row.status) || typeof row.reason !== 'string' || !row.reason.length || (row.selected_reason !== null && (typeof row.selected_reason !== 'string' || !row.selected_reason.length))) refuse('RESPONSE_ROWS');
    requireKeys(row.usage, [...USAGE_KEYS, 'cutoff_day', 'cutoff_precision'], 'RESPONSE_ROWS');
    const supplied = Object.fromEntries(USAGE_KEYS.map(k => [k, row.usage[k]]));
    if (!equal(supplied, prepared.usage[i]) || row.usage.cutoff_day !== supplied.used_on.slice(0, 10) || row.usage.cutoff_precision !== (supplied.used_on.length === 10 ? 'date' : 'utc_instant')) refuse('RESPONSE_ROWS');
    if (row.verdict !== (row.status === 'match' ? true : row.status === 'mismatch' ? false : null)) refuse('RESPONSE_UNKNOWNS');
    for (const key of ['formal_restatement_cause', 'global_first_availability', 'trading_calendar_lookahead']) if (row[key] !== null) refuse('RESPONSE_UNKNOWNS');
    for (const key of ['eligible_vintages', 'same_day_vintages', 'later_vintages', 'unsupported_vintages']) if (own(row, key)) refuse('RESPONSE_SHAPE');
    requireKeys(row.vintage_counts, ['eligible', 'same_day', 'later', 'unsupported'], 'RESPONSE_ROWS');
    if (Object.values(row.vintage_counts).some(v => !Number.isSafeInteger(v) || v < 0 || v > 4096)) refuse('RESPONSE_ROWS');
    if ((row.status === 'match' || row.status === 'mismatch') && (row.selected === null || row.selected_reason !== null)) refuse('RESPONSE_ROWS');
    if (row.status === 'timing_indeterminate' && (row.vintage_counts.same_day < 1 || row.reason !== 'same_day_date_only_filing_cannot_establish_intraday_availability')) refuse('RESPONSE_UNKNOWNS');
    if (row.selected === null && row.selected_reason === null) refuse('RESPONSE_ROWS');
    counts[row.status]++;
  });
  if (!equal(counts, audit.coverage.counts) || audit.coverage.verdict_supported_n !== counts.match + counts.mismatch || audit.coverage.verdict_unknown_n !== n - counts.match - counts.mismatch || audit.coverage.denominator !== 'Every explicitly selected usage row; no omitted missing, ambiguous, unsupported or same-day row.') refuse('RESPONSE_ROWS');
  const impl = audit.implementation;
  if (!jsonRecord(impl) || impl.declared_module_sha256 !== prepared.settings.implementation_source_sha256 || impl.declared_module_sha256_verified !== false || own(impl, 'runtime_identity_verified') || data.adapter?.whole_module_sha256_verified !== false) refuse('RESPONSE_UNKNOWNS');
  if (!jsonRecord(audit.established) || NULL_ESTABLISHED.some(k => audit.established[k] !== null) || ['source_authorship_verified', 'capture_time_verified', 'completeness_verified'].some(k => audit.established[k] !== false)) refuse('RESPONSE_UNKNOWNS');
  return data; // Complete selected-row compact artifact; omitted core evidence is not authenticated.
}

function prepare(bytes, expected) {
  const bindings = Object.fromEntries(KEYS.map(key => [key, { bytes: bytes[key].length, sha256: sha(bytes[key]) }]));
  if (bindings.reference.sha256 !== expected) refuse('REFERENCE_SHA');
  strictJson(bytes.reference, 'INPUT_JSON');
  const usage = strictJson(bytes.usage, 'INPUT_JSON'), settings = strictJson(bytes.settings, 'INPUT_JSON');
  if (!Array.isArray(usage) || usage.length < 1 || usage.length > 64 || usage.some(row => !jsonRecord(row) || !equal(Object.keys(row).sort(), [...USAGE_KEYS].sort()) || typeof row.used_on !== 'string') || !jsonRecord(settings)) refuse('INPUT_JSON');
  const request = { name: 'audit_inputs', arguments: { reference_base64: bytes.reference.toString('base64'), expected_reference_sha256: expected, usage_base64: bytes.usage.toString('base64'), settings_base64: bytes.settings.toString('base64'), detail: 'compact' } };
  // Includes a conservative allowance for fixed JSON-RPC method/id framing.
  if (Buffer.byteLength(JSON.stringify(request)) + 256 > AUDIT_CLIENT_LIMITS.request) refuse('INPUT_BOUND');
  return { expected, bindings, usage, settings, request };
}

function canonicalRoot(root, fs = nativeFs) {
  pathText(root);
  try {
    const actual = fs.realpathSync(root);
    const ownRoot = fs.realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
    if (actual !== ownRoot) refuse('ROOT');
    return actual;
  } catch (error) { if (error instanceof AuditClientError) throw error; refuse('ROOT'); }
}

function sdkOperations(root, boundary, stderr, fail) {
  let transport, client, processObject, ownedPid = null, exited = false, closed = false;
  let exitPromise = Promise.resolve();
  let closePromise;
  return {
    ownedPid() { return ownedPid; },
    async connect(options) {
      const [{ Client }, { StdioClientTransport }] = await Promise.all([import('@modelcontextprotocol/client'), import('@modelcontextprotocol/client/stdio')]);
      boundary(); if (closed) refuse('ABORTED');
      client = new Client({ name: 'canli-offline-audit-client', version: '0.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'legacy' }, inputRequired: { autoFulfill: false } });
      transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, 'mcp-fundamentals/src/audit-inputs-stdio.mjs')], cwd: root, stderr: 'pipe', maxBufferSize: AUDIT_CLIENT_LIMITS.response });
      const originalClose = transport.close.bind(transport); let transportClosing;
      transport.close = () => { closed = true; return transportClosing ??= originalClose(); };
      const clientClose = client.close.bind(client); let clientClosing;
      client.close = () => clientClosing ??= clientClose();
      const start = transport.start.bind(transport);
      transport.start = () => {
        boundary(); if (closed) refuse('ABORTED');
        const pending = start();
        // Exact locked 2.1.0 field; keep the object BEFORE SDK close clears it.
        processObject = transport._process;
        if (processObject) {
          if (Number.isSafeInteger(processObject.pid) && processObject.pid > 0) ownedPid = processObject.pid;
          exitPromise = new Promise(resolveExit => {
            const observedExit = () => { exited = true; resolveExit(); };
            processObject.once('exit', observedExit); processObject.once('close', observedExit);
            processObject.once('spawn', () => { ownedPid = processObject.pid; });
          });
        }
        return pending;
      };
      transport.stderr.on('data', stderr);
      client.onerror = () => { if (!closed) fail('CALL'); };
      boundary(); await client.connect(transport, options); boundary();
    },
    async callTool(request, options) {
      boundary(); if (closed) refuse('ABORTED');
      const result = await client.callTool(request, options);
      boundary();
      // Locked 2.1.0's legacy decodeResult removes resultType before returning
      // its complete result. Normalize ONLY this owned fixed legacy SDK surface.
      if (!jsonRecord(result) || (own(result, 'resultType') && result.resultType !== 'complete')) refuse('RESPONSE_SHAPE');
      return { ...result, resultType: 'complete' };
    },
    close() {
      closed = true;
      return closePromise ??= (async () => {
        if (client) await client.close();
        // If initialization never adopted the transport, still dispose the same child.
        if (transport) await transport.close();
        if (processObject && ownedPid !== null && !exited) await exitPromise;
        return { owned_pid: ownedPid, owned_child_absent: processObject ? exited : true, evidence: processObject ? 'same_owned_child_exit_or_close' : 'no_child_started' };
      })();
    },
  };
}

async function workflow(capture, expected, { operations, root, now = () => performance.now(), signal } = {}) {
  // Primitive expected hash is checked before ANY supplied clock/capture/transport callback.
  try { expectedSha(expected); } catch (error) { return terminalRefusal(errorCode(error, 'EXPECTED_SHA')); }
  let started, previous, workEnd, closeStart, firstFailure, artifact, prepared, ops;
  let connectAttempts = 0, auditCalls = 0, closeAttempts = 0, stderrBytes = 0;
  let closure = { owned_pid: null, owned_child_absent: true, evidence: 'no_child_started' };
  const abort = new AbortController();
  const fail = code => { firstFailure ??= code; if (!abort.signal.aborted) abort.abort(new AuditClientError(code)); };
  function observe() {
    const value = now();
    if (!Number.isFinite(value) || (previous !== undefined && value < previous)) refuse('CLOCK');
    previous = value; return value;
  }
  function workBoundary() {
    const time = observe();
    if (firstFailure || abort.signal.aborted) refuse(firstFailure ?? 'ABORTED');
    if (time - started >= AUDIT_CLIENT_LIMITS.workMs) { fail('WORK_DEADLINE'); refuse('WORK_DEADLINE'); }
    return time;
  }
  const onAbort = () => fail('ABORTED');
  let workTimer;
  let abortListener;
  async function workCall(fn, fallback) {
    await Promise.resolve(); workBoundary(); // Reentrant/preceding queued work precedes dispatch.
    const timeout = Math.max(1, Math.floor(AUDIT_CLIENT_LIMITS.workMs - (previous - started)));
    let pending;
    try { pending = Promise.resolve(fn({ signal: abort.signal, timeout })); }
    catch (error) { refuse(errorCode(error, fallback)); }
    // Consume even a synchronous throw/late asynchronous rejection after the race ends.
    pending.catch(() => {});
    workBoundary();
    const aborted = new Promise((_, reject) => {
      abortListener = () => reject(new AuditClientError(firstFailure ?? 'ABORTED'));
      if (abort.signal.aborted) abortListener(); else abort.signal.addEventListener('abort', abortListener, { once: true });
    });
    try { const value = await Promise.race([pending, aborted]); workBoundary(); return value; }
    catch (error) { refuse(errorCode(error, fallback)); }
    finally { abort.signal.removeEventListener('abort', abortListener); }
  }
  const stderr = chunk => {
    try {
      const length = nativeSize(chunk);
      if (length > AUDIT_CLIENT_LIMITS.stderr - stderrBytes) { stderrBytes = AUDIT_CLIENT_LIMITS.stderr + 1; fail('STDERR_BOUND'); }
      else stderrBytes += length;
    } catch { fail('STDERR_BOUND'); }
  };
  try {
    started = observe();
    if (signal?.aborted) fail('ABORTED'); else signal?.addEventListener('abort', onAbort, { once: true });
    workTimer = setTimeout(() => fail('WORK_DEADLINE'), AUDIT_CLIENT_LIMITS.workMs);
    workBoundary();
    const bytes = capture(workBoundary); workBoundary();
    prepared = prepare(bytes, expected); workBoundary();
    ops = operations ?? sdkOperations(canonicalRoot(root), workBoundary, stderr, fail);
    if (!ops || ['connect', 'callTool', 'close'].some(key => typeof ops[key] !== 'function')) refuse('OPERATIONS');
    await workCall(options => { connectAttempts++; return ops.connect({ ...options, onStderr: stderr }); }, 'CONNECT');
    const reply = await workCall(options => { auditCalls++; return ops.callTool(prepared.request, { ...options, toolDefinition: AUDIT_TOOL }); }, 'CALL');
    artifact = validateReply(reply, prepared); workBoundary();
  } catch (error) { firstFailure ??= errorCode(error, 'INTERNAL'); }
  finally {
    clearTimeout(workTimer); signal?.removeEventListener('abort', onAbort);
    // Disarm pending lazy imports/start after any failed work; close still has its reserve.
    if (!abort.signal.aborted) abort.abort(new AuditClientError(firstFailure ?? 'ABORTED'));
    let timer;
    try {
      workEnd = observe(); closeStart = workEnd;
      if (ops) {
        closeAttempts++;
        const closeRemaining = Math.max(0, Math.min(AUDIT_CLIENT_LIMITS.closeMs, AUDIT_CLIENT_LIMITS.totalMs - (closeStart - started)));
        const closing = Promise.resolve(ops.close()); closing.catch(() => {});
        closure = await Promise.race([closing, new Promise((_, reject) => { timer = setTimeout(() => reject(new AuditClientError('CLOSE_DEADLINE')), closeRemaining); })]);
        const time = observe();
        if (time - closeStart > AUDIT_CLIENT_LIMITS.closeMs || time - started > AUDIT_CLIENT_LIMITS.totalMs) refuse('CLOSE_DEADLINE');
        if (!jsonRecord(closure) || (closure.owned_pid !== null && (!Number.isSafeInteger(closure.owned_pid) || closure.owned_pid < 1)) || closure.owned_child_absent !== true || !['same_owned_child_exit_or_close', 'no_child_started', 'injected_no_child'].includes(closure.evidence)) refuse('CHILD_UNCERTAIN');
      }
    } catch (error) {
      firstFailure ??= errorCode(error, 'CLOSE');
      let pid = closure.owned_pid;
      try { if (typeof ops?.ownedPid === 'function') pid = ops.ownedPid(); } catch { /* Uncertainty stays explicit. */ }
      closure = { owned_pid: Number.isSafeInteger(pid) && pid > 0 ? pid : null, owned_child_absent: null, evidence: 'unknown' };
    }
    finally { clearTimeout(timer); }
  }
  let lifecycle;
  try {
    const end = observe();
    lifecycle = {
      connect_attempts: connectAttempts, audit_calls: auditCalls, close_attempts: closeAttempts,
      owned_pid: closure.owned_pid, owned_child_absent: closure.owned_child_absent, closure_evidence: closure.evidence,
      stderr_bytes: stderrBytes, work_ms: workEnd - started,
      closure_before_encoding_ms: end - closeStart, total_before_encoding_ms: end - started,
      limits_ms: { work: 15000, closure: 5000, total: 20000 }, encoding_budget_checked: firstFailure === undefined,
    };
    if (workEnd - started > AUDIT_CLIENT_LIMITS.workMs) firstFailure ??= 'WORK_DEADLINE';
    if (end - closeStart > AUDIT_CLIENT_LIMITS.closeMs || end - started > AUDIT_CLIENT_LIMITS.totalMs) firstFailure ??= 'CLOSE_DEADLINE';
    if (signal?.aborted) firstFailure ??= 'ABORTED';
    const report = firstFailure ? refusalReport(firstFailure, lifecycle) : {
      schema: 'canli.fundamentals.audit-client-result.v1', status: 'ok', artifact,
      verified: { compact_artifact_hash: true, original_byte_bindings: true, complete_selected_rows: true, complete_core_report: false, source_execution_authenticated: false },
      lifecycle,
    };
    const encoded = JSON.stringify(report) + '\n';
    if (Buffer.byteLength(encoded) > (firstFailure ? AUDIT_CLIENT_LIMITS.refusal : AUDIT_CLIENT_LIMITS.output)) refuse('OUTPUT_BOUND');
    const afterEncoding = observe();
    if (!firstFailure && (afterEncoding - closeStart > AUDIT_CLIENT_LIMITS.closeMs || afterEncoding - started > AUDIT_CLIENT_LIMITS.totalMs)) refuse('CLOSE_DEADLINE');
    if (!firstFailure && signal?.aborted) refuse('ABORTED');
    return { report, encoded };
  } catch (error) { return terminalRefusal(firstFailure ?? errorCode(error, 'INTERNAL'), lifecycle); }
}
function refusalReport(code, lifecycle) {
  return { schema: 'canli.fundamentals.audit-client-result.v1', status: 'refused', error: { code: CODES.has(code) ? code : 'INTERNAL', message: 'Offline audit did not produce a verified, closed compact result.' }, ...(lifecycle ? { lifecycle } : {}) };
}
function terminalRefusal(code, lifecycle) {
  if (lifecycle) lifecycle = { ...lifecycle, encoding_budget_checked: false };
  const report = refusalReport(code, lifecycle);
  // Own finite scalars only; no SDK exception, path, raw input, stderr or stack.
  return { report, encoded: JSON.stringify(report) + '\n' };
}

export function runAuditInputsClient(referenceBytes, expectedReferenceSha256, usageBytes, settingsBytes, options = {}) {
  return workflow(() => captureNative(referenceBytes, usageBytes, settingsBytes), expectedReferenceSha256, options);
}
export function runAuditInputsFiles(options, dependencies = {}) {
  return workflow(boundary => captureAuditInputFiles(options, { fs: dependencies.fs ?? nativeFs, boundary }), options.expected_reference_sha256, { ...dependencies, root: options.root });
}
export function parseAuditClientArgs(argv) {
  const mapping = { '--root': 'root', '--reference': 'reference', '--expected-reference-sha256': 'expected_reference_sha256', '--usage': 'usage', '--settings': 'settings' };
  if (!Array.isArray(argv) || argv.length !== 10) refuse('ARGUMENTS');
  const parsed = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const key = typeof argv[i] === 'string' && own(mapping, argv[i]) ? mapping[argv[i]] : undefined;
    if (!key || own(parsed, key)) refuse('ARGUMENTS');
    parsed[key] = argv[i + 1];
  }
  if (Object.keys(parsed).length !== 5) refuse('ARGUMENTS');
  expectedSha(parsed.expected_reference_sha256);
  for (const key of ['root', ...KEYS]) pathText(parsed[key]);
  return parsed;
}
export async function auditClientCli(argv, dependencies = {}) {
  try {
    const options = parseAuditClientArgs(argv);
    options.root = canonicalRoot(options.root, dependencies.fs ?? nativeFs);
    return await runAuditInputsFiles(options, dependencies);
  } catch (error) { return terminalRefusal(errorCode(error, 'ARGUMENTS')); }
}
function directEntry() {
  if (!process.argv[1]) return false;
  try { return nativeFs.realpathSync(process.argv[1]) === nativeFs.realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (directEntry()) {
  const terminal = await auditClientCli(process.argv.slice(2));
  process.stdout.write(terminal.encoded);
  process.exitCode = terminal.report.status === 'ok' ? 0 : 1;
}
