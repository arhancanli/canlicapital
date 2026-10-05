#!/usr/bin/env node
// Supplied-file preparation via one local MCP call; the delivered intake core is unchanged.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types, TextDecoder } from 'node:util';
import { performance } from 'node:perf_hooks';
import { canonicalJson } from './canonical-json.mjs';

export const EXPERT_INTAKE_CLIENT_LIMITS = Object.freeze({
  gold: 524288, intake: 65536, evidenceInventory: 32768, intakeSettings: 4096,
  evidence: 32768, evidenceTotal: 262144, evidenceCount: 64, inputCount: 68,
  inputTotal: 786432, report: 2097152, reportFile: 2097153,
  path: 4096, argvCount: 140, argvBytes: 524288, stdout: 4096, stderr: 1024,
  childStderr: 8192, refusal: 1024, request: 2097152, response: 8388608, tool: 7340032,
  workMs: 15000, closeMs: 5000, totalMs: 20000,
});
const IDENTITY = Object.freeze(['dev', 'ino', 'mode', 'uid', 'gid']);
const STABLE = Object.freeze([...IDENTITY, 'nlink', 'size', 'mtimeNs', 'ctimeNs']);
const SCALARS = Object.freeze({
  '--gold': 'gold', '--expected-gold-sha256': 'expectedGold', '--intake': 'intake',
  '--evidence-inventory': 'evidenceInventory', '--intake-settings': 'intakeSettings',
  '--out': 'out',
});
const REQUIRED_INPUTS = Object.freeze(['gold', 'intake', 'evidenceInventory', 'intakeSettings']);
const CODES = new Set(['CLI_ARGUMENTS', 'CLI_PATH', 'CLI_SHA', 'CLI_COUNT', 'CLI_INPUT',
  'CLI_INPUT_BOUND', 'CLI_EVIDENCE_BOUND', 'CLI_TOTAL_BOUND',
  'CLI_ALIAS', 'CLI_INPUT_CHANGED', 'CLI_READ', 'CLI_CLOSE', 'CLI_SOURCE', 'CLI_PREPARE',
  'CLI_REPORT_BOUND', 'CLI_PARENT', 'CLI_OUTPUT', 'CLI_WRITE', 'CLI_FLUSH',
  'CLI_READBACK', 'CLI_OUTPUT_CHANGED', 'CLI_STDIO', 'CLOCK', 'ABORTED', 'WORK_DEADLINE',
  'CLOSE_DEADLINE', 'CHILD_UNCERTAIN', 'CONNECT', 'CALL', 'TOOL_REFUSED', 'RESPONSE_BOUND',
  'RESPONSE_SHAPE', 'RESPONSE_HASH', 'RESPONSE_BINDING', 'RESPONSE_ROWS', 'RESPONSE_UNKNOWNS',
  'STDERR_BOUND', 'REQUEST_BOUND', 'ROOT', 'INTERNAL']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (left, right, keys) => keys.every(key => left[key] === right[key]);
export class ExpertIntakeClientError extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new ExpertIntakeClientError(code); };
const failureFor = (error, fallback) => error instanceof ExpertIntakeClientError ? error : new ExpertIntakeClientError(fallback);

function path(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value ||
      Buffer.byteLength(value, 'utf8') > EXPERT_INTAKE_CLIENT_LIMITS.path || /\p{Cc}/u.test(value)) refuse('CLI_PATH');
  // Buffer encoding substitutes lone surrogates; they cannot identify a supplied UTF-8 path.
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) refuse('CLI_PATH');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) refuse('CLI_PATH');
  }
  return value;
}

export function parseExpertIntakeClientArgs(argv) {
  if (types.isProxy(argv) || !Array.isArray(argv) || Object.getPrototypeOf(argv) !== Array.prototype) refuse('CLI_ARGUMENTS');
  const properties = Object.getOwnPropertyDescriptors(argv), count = properties.length?.value;
  if (!Number.isSafeInteger(count) || count < 12 || count > EXPERT_INTAKE_CLIENT_LIMITS.argvCount || count % 2 ||
      Reflect.ownKeys(properties).length !== count + 1) refuse('CLI_ARGUMENTS');
  const values = []; let argvBytes = 0;
  for (let index = 0; index < count; index++) {
    const row = properties[index];
    if (!row || !Object.hasOwn(row, 'value') || typeof row.value !== 'string') refuse('CLI_ARGUMENTS');
    argvBytes += Buffer.byteLength(row.value, 'utf8');
    if (argvBytes > EXPERT_INTAKE_CLIENT_LIMITS.argvBytes) refuse('CLI_ARGUMENTS');
    values.push(row.value);
  }
  const result = { evidence: [] };
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index], value = values[index + 1];
    if (flag === '--evidence') {
      const name = 'evidence', maximum = EXPERT_INTAKE_CLIENT_LIMITS.evidenceCount;
      if (result[name].length >= maximum) refuse('CLI_COUNT');
      result[name].push(path(value));
    } else {
      if (!Object.hasOwn(SCALARS, flag)) refuse('CLI_ARGUMENTS');
      const name = SCALARS[flag];
      if (Object.hasOwn(result, name)) refuse('CLI_ARGUMENTS');
      result[name] = name === 'expectedGold' ? value : path(value);
    }
  }
  if (Object.values(SCALARS).some(name => !Object.hasOwn(result, name))) refuse('CLI_ARGUMENTS');
  if (typeof result.expectedGold !== 'string' || result.expectedGold.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(result.expectedGold)) refuse('CLI_SHA');
  const files = [...REQUIRED_INPUTS.map(name => result[name]), ...result.evidence, result.out];
  if (new Set(files).size !== files.length) refuse('CLI_ALIAS');
  return result;
}

// Numeric ownership is relinquished BEFORE the sole close attempt, even on failure.
function release(ops, record, failure) {
  if (record.fd === undefined) return failure;
  const owned = record.fd; record.fd = undefined;
  try { ops.closeSync(owned); } catch { return failure ?? new ExpertIntakeClientError('CLI_CLOSE'); }
  return failure;
}

function canonicalParent(ops, file, code) {
  if (ops.realpathSync(dirname(file)) !== dirname(file)) refuse(code);
}

function regularOwned(stat, maximum, uid) {
  return stat.isFile() && stat.uid === uid && stat.nlink === 1n && stat.size >= 1n && stat.size <= BigInt(maximum);
}

function inputGuard(ops, record, uid) {
  canonicalParent(ops, record.path, 'CLI_INPUT_CHANGED');
  const held = ops.fstatSync(record.fd, { bigint: true }), linked = ops.lstatSync(record.path, { bigint: true });
  if (!regularOwned(held, record.maximum, uid) || !linked.isFile() ||
      !same(record.before, held, STABLE) || !same(record.before, linked, STABLE)) refuse('CLI_INPUT_CHANGED');
}

function admitInputs(ops, parsed, records, uid) {
  const names = [...REQUIRED_INPUTS.map(name => ({ name, path: parsed[name], maximum: EXPERT_INTAKE_CLIENT_LIMITS[name] })),
    ...parsed.evidence.map(file => ({ name: 'evidence', path: file, maximum: EXPERT_INTAKE_CLIENT_LIMITS.evidence }))];
  if (names.length > EXPERT_INTAKE_CLIENT_LIMITS.inputCount) refuse('CLI_COUNT');
  let total = 0, evidence = 0;
  for (const row of names) {
    const record = { ...row }; records.push(record);
    record.fd = ops.openSync(row.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    record.before = ops.fstatSync(record.fd, { bigint: true });
    if (!regularOwned(record.before, row.maximum, uid)) refuse('CLI_INPUT_BOUND');
    inputGuard(ops, record, uid);
    if (records.some(other => other !== record && other.before && same(other.before, record.before, ['dev', 'ino']))) refuse('CLI_ALIAS');
    const size = Number(record.before.size); total += size;
    if (row.name === 'evidence') evidence += size;
  }
  if (evidence > EXPERT_INTAKE_CLIENT_LIMITS.evidenceTotal) refuse('CLI_EVIDENCE_BOUND');
  if (total > EXPERT_INTAKE_CLIENT_LIMITS.inputTotal) refuse('CLI_TOTAL_BOUND');
}

function readBytes(ops, fd, size, code) {
  // No payload allocation occurs until every native size and aggregate is admitted.
  try {
    const bytes = Buffer.alloc(size); let offset = 0;
    while (offset < size) {
      const requested = Math.min(65536, size - offset), count = ops.readSync(fd, bytes, offset, requested, offset);
      if (!Number.isSafeInteger(count) || count <= 0 || count > requested) refuse(code);
      offset += count;
    }
    if (ops.readSync(fd, Buffer.alloc(1), 0, 1, size) !== 0) refuse(code);
    return bytes;
  } catch (error) { throw failureFor(error, code); }
}

function privateDirectory(stat, uid) {
  return stat.isDirectory() && stat.uid === uid && (stat.mode & 0o077n) === 0n;
}

function parentGuard(ops, parent, directory, uid) {
  if (ops.realpathSync(parent) !== parent) refuse('CLI_PARENT');
  const linked = ops.lstatSync(parent, { bigint: true });
  if (!privateDirectory(linked, uid) || !same(directory.before, linked, IDENTITY)) refuse('CLI_PARENT');
  if (directory.fd !== undefined) {
    const held = ops.fstatSync(directory.fd, { bigint: true });
    if (!privateDirectory(held, uid) || !same(directory.before, held, IDENTITY)) refuse('CLI_PARENT');
  }
}

function admitParent(ops, file, directory, uid, records) {
  const parent = dirname(file);
  directory.fd = ops.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY |
    fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  directory.before = ops.fstatSync(directory.fd, { bigint: true });
  if (!privateDirectory(directory.before, uid)) refuse('CLI_PARENT');
  parentGuard(ops, parent, directory, uid);
  let existing;
  try { existing = ops.lstatSync(file, { bigint: true }); }
  catch (error) { if (error?.code !== 'ENOENT') refuse('CLI_OUTPUT'); }
  if (existing) {
    if (records.some(row => same(row.before, existing, ['dev', 'ino']))) refuse('CLI_ALIAS');
    refuse('CLI_OUTPUT');
  }
}

function outputGuard(ops, file, before, size, written = null) {
  const linked = ops.lstatSync(file, { bigint: true });
  if (!linked.isFile() || linked.nlink !== 1n || (linked.mode & 0o777n) !== 0o600n ||
      linked.size !== BigInt(size) || !same(before, linked, IDENTITY) ||
      (written !== null && !same(written, linked, STABLE))) refuse('CLI_OUTPUT_CHANGED');
}

function serialize(report) {
  let json;
  try { json = JSON.stringify(report); } catch { refuse('CLI_PREPARE'); }
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > EXPERT_INTAKE_CLIENT_LIMITS.report) refuse('CLI_REPORT_BOUND');
  const bytes = Buffer.from(json + '\n', 'utf8');
  if (bytes.length > EXPERT_INTAKE_CLIENT_LIMITS.reportFile) refuse('CLI_REPORT_BOUND');
  return bytes;
}

function summary(report, bytes) {
  const selected = report?.coverage?.selected_n, roles = report?.coverage?.declared_roles_n;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > 128 ||
      !Number.isSafeInteger(roles) || roles < 0 || roles > 3) refuse('CLI_PREPARE');
  const text = JSON.stringify({ status: 'saved', report_sha256: digest(bytes), report_bytes: bytes.length,
    selected_n: selected, declared_role_count: roles, syntactic_only: true }) + '\n';
  if (Buffer.byteLength(text) > EXPERT_INTAKE_CLIENT_LIMITS.stdout) refuse('CLI_STDIO');
  return text;
}

function writeReport(ops, file, bytes, directory, output, uid) {
  const parent = dirname(file);
  parentGuard(ops, parent, directory, uid);
  output.fd = ops.openSync(file, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL |
    fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  const before = ops.fstatSync(output.fd, { bigint: true });
  if (!before.isFile() || before.uid !== uid || before.nlink !== 1n || before.size !== 0n ||
      (before.mode & 0o777n) !== 0o600n) refuse('CLI_OUTPUT');
  parentGuard(ops, parent, directory, uid); outputGuard(ops, file, before, 0);
  let offset = 0, attempts = 0;
  while (offset < bytes.length) {
    if (++attempts > 4096) refuse('CLI_WRITE');
    const requested = Math.min(65536, bytes.length - offset); let count;
    try { count = ops.writeSync(output.fd, bytes, offset, requested, offset); } catch { refuse('CLI_WRITE'); }
    if (!Number.isSafeInteger(count) || count <= 0 || count > requested) refuse('CLI_WRITE');
    offset += count;
  }
  try { ops.fsyncSync(output.fd); } catch { refuse('CLI_FLUSH'); }
  const written = ops.fstatSync(output.fd, { bigint: true });
  if (!same(before, written, [...IDENTITY, 'nlink']) || written.size !== BigInt(bytes.length)) refuse('CLI_OUTPUT_CHANGED');
  const readback = readBytes(ops, output.fd, bytes.length, 'CLI_READBACK');
  if (!readback.equals(bytes) || digest(readback) !== digest(bytes) ||
      !same(written, ops.fstatSync(output.fd, { bigint: true }), STABLE)) refuse('CLI_READBACK');
  parentGuard(ops, parent, directory, uid); outputGuard(ops, file, before, bytes.length, written);
  const closeFailure = release(ops, output);
  if (closeFailure) throw closeFailure;
  try { ops.fsyncSync(directory.fd); } catch { refuse('CLI_FLUSH'); }
  parentGuard(ops, parent, directory, uid); outputGuard(ops, file, before, bytes.length, written);
  const parentCloseFailure = release(ops, directory);
  if (parentCloseFailure) throw parentCloseFailure;
  parentGuard(ops, parent, directory, uid); outputGuard(ops, file, before, bytes.length, written);
  // On uncertainty the created private file remains; there is no unlink, overwrite or retry.
}

const own = (value, key) => Object.hasOwn(value, key);
function strictJson(bytes, code) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { refuse(code); }
  if (!Buffer.from(source, 'utf8').equals(bytes)) refuse(code);
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
    if (depth > 64 || ++nodes > 1048576) refuse(code);
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
        if (result.length >= 32768) refuse(code);
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
    if (depth > 64 || ++nodes > 1048576) refuse('RESPONSE_BOUND');
    if (v === null || typeof v === 'boolean') { append(JSON.stringify(v)); return; }
    if (typeof v === 'string') { text(v); return; }
    if (typeof v === 'number') { if (!Number.isFinite(v)) refuse('RESPONSE_SHAPE'); append(JSON.stringify(v)); return; }
    if (typeof v !== 'object' || types.isProxy(v)) refuse('RESPONSE_SHAPE');
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) refuse('RESPONSE_SHAPE');
    const keys = Reflect.ownKeys(v);
    if (keys.length > 32769 || keys.some(k => typeof k !== 'string')) refuse('RESPONSE_BOUND');
    append(array ? '[' : '{');
    const entries = array ? keys.filter(k => k !== 'length') : keys;
    if (array && (v.length > 32768 || entries.length !== v.length || entries.some((k, i) => k !== String(i)))) refuse('RESPONSE_SHAPE');
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

/** One clock shared by capture, SDK boundaries, closure, output and terminal. */
export function createExpertIntakeClientBudget({ now = () => performance.now(), signal } = {}) {
  let previous, closeStart, firstFailure, disposed = false;
  const abort = new AbortController(), listeners = new Set();
  const fail = code => {
    if (firstFailure !== undefined) return;
    firstFailure = CODES.has(code) ? code : 'INTERNAL';
    abort.abort(new ExpertIntakeClientError(firstFailure));
    for (const listener of [...listeners]) { try { listener(new ExpertIntakeClientError(firstFailure)); } catch { /* An observer cannot lose the first failure. */ } }
  };
  const observe = () => {
    const time = now();
    if (!Number.isFinite(time) || (previous !== undefined && time < previous)) { fail('CLOCK'); refuse('CLOCK'); }
    previous = time; return time;
  };
  const started = observe();
  const onAbort = () => fail('ABORTED');
  if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
  return {
    started, signal: abort.signal, fail, observe,
    get failure() { return firstFailure; },
    work() {
      const time = observe();
      if (time - started >= EXPERT_INTAKE_CLIENT_LIMITS.workMs) fail('WORK_DEADLINE');
      if (firstFailure !== undefined) refuse(firstFailure);
      return time;
    },
    beginClose() {
      if (closeStart === undefined) {
        closeStart = observe();
        if (closeStart - started >= EXPERT_INTAKE_CLIENT_LIMITS.workMs) fail('WORK_DEADLINE');
      }
      return closeStart;
    },
    closing({ allowFailure = false } = {}) {
      const time = observe();
      if (closeStart === undefined) refuse('INTERNAL');
      if (time - closeStart > EXPERT_INTAKE_CLIENT_LIMITS.closeMs || time - started > EXPERT_INTAKE_CLIENT_LIMITS.totalMs) {
        fail('CLOSE_DEADLINE'); refuse(firstFailure ?? 'CLOSE_DEADLINE');
      }
      if (!allowFailure && firstFailure !== undefined) refuse(firstFailure);
      return time;
    },
    remaining() { return Math.max(0, started + EXPERT_INTAKE_CLIENT_LIMITS.workMs - observe()); },
    closeRemaining() {
      const time = observe();
      return Math.max(0, Math.min(closeStart + EXPERT_INTAKE_CLIENT_LIMITS.closeMs - time, started + EXPERT_INTAKE_CLIENT_LIMITS.totalMs - time));
    },
    onFailure(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    lifecycle() {
      const end = observe();
      return { work_ms: closeStart - started, closure_ms: end - closeStart, total_ms: end - started };
    },
    dispose() { if (!disposed) { disposed = true; signal?.removeEventListener('abort', onAbort); listeners.clear(); } },
  };
}

function checkedFilesystem(ops, boundary) {
  return Object.fromEntries(['openSync', 'fstatSync', 'lstatSync', 'realpathSync', 'readSync', 'writeSync', 'fsyncSync', 'closeSync'].map(name => [name,
    name === 'openSync' ? (...args) => {
      boundary();
      const fd = ops.openSync(...args);
      // The returned FD is ours before a post-open clock observation can throw.
      try { boundary(); } catch (error) {
        try { ops.closeSync(fd); } catch { /* Relinquished once; preserve the sticky clock refusal. */ }
        throw error;
      }
      return fd;
    } : name === 'closeSync' ? (...args) => {
      // Cleanup always attempts the one owned close, even when a clock is already failed.
      let result;
      try { result = ops[name](...args); } finally { try { boundary(); } catch { /* Sticky failure is checked at final admission. */ } }
      return result;
    } : (...args) => { boundary(); const result = ops[name](...args); boundary(); return result; },
  ]));
}

function captureFiles(parsed, filesystem, boundary, records, directory, uid) {
  const ops = checkedFilesystem(filesystem, boundary);
  admitInputs(ops, parsed, records, uid);
  admitParent(ops, parsed.out, directory, uid, records);
  const captured = { evidence: [] };
  for (const record of records) {
    const bytes = readBytes(ops, record.fd, Number(record.before.size), 'CLI_READ');
    inputGuard(ops, record, uid);
    if (record.name === 'evidence') captured[record.name].push(bytes);
    else captured[record.name] = bytes;
  }
  for (const record of records) inputGuard(ops, record, uid);
  parentGuard(ops, dirname(parsed.out), directory, uid);
  let failure;
  for (const record of records) failure = release(ops, record, failure);
  if (failure) throw failure;
  boundary();
  if (digest(captured.gold) !== parsed.expectedGold) refuse('CLI_SHA');
  // All four structured inputs are fatal UTF8/duplicate-key JSON;
  // evidence remains opaque, exactly bound raw bytes.
  const json = Object.fromEntries(REQUIRED_INPUTS.map(name => [name, strictJson(captured[name], 'CLI_INPUT')]));
  return { captured, json };
}


export function buildExpertIntakeClientRequest(captured, expected) {
  if (typeof expected !== 'string' || expected.length !== 64 || !/^[a-f0-9]{64}$/.test(expected)) refuse('CLI_SHA');
  const singles = REQUIRED_INPUTS.map(name => captured[name]), evidence = captured.evidence;
  if (types.isProxy(evidence) || !Array.isArray(evidence) || Object.getPrototypeOf(evidence) !== Array.prototype ||
      evidence.length > EXPERT_INTAKE_CLIENT_LIMITS.evidenceCount || Object.keys(evidence).length !== evidence.length) refuse('CLI_COUNT');
  let total = 0, evidenceBytes = 0;
  // All native Buffer sizes/ownership are admitted before the first base64 copy.
  for (const [index, bytes] of [...singles, ...evidence].entries()) {
    if (types.isProxy(bytes) || !Buffer.isBuffer(bytes) || Object.getPrototypeOf(bytes) !== Buffer.prototype ||
        types.isSharedArrayBuffer(bytes.buffer)) refuse('CLI_INPUT');
    const maximum = index < singles.length ? EXPERT_INTAKE_CLIENT_LIMITS[REQUIRED_INPUTS[index]] : EXPERT_INTAKE_CLIENT_LIMITS.evidence;
    if (bytes.length < 1 || bytes.length > maximum) refuse('CLI_INPUT_BOUND');
    total += bytes.length; if (index >= singles.length) evidenceBytes += bytes.length;
  }
  if (evidenceBytes > EXPERT_INTAKE_CLIENT_LIMITS.evidenceTotal) refuse('CLI_EVIDENCE_BOUND');
  if (total > EXPERT_INTAKE_CLIENT_LIMITS.inputTotal) refuse('CLI_TOTAL_BOUND');
  const request = { name: 'filingfacts_prepare_expert_intake', arguments: {
    gold_base64: captured.gold.toString('base64'), expected_gold_raw_sha256: expected,
    intake_base64: captured.intake.toString('base64'), evidence_inventory_base64: captured.evidenceInventory.toString('base64'),
    evidence_base64: evidence.map(bytes => bytes.toString('base64')), intake_settings_base64: captured.intakeSettings.toString('base64'),
  } };
  if (Buffer.byteLength(JSON.stringify(request) + '\n') > EXPERT_INTAKE_CLIENT_LIMITS.request) refuse('REQUEST_BOUND');
  return request;
}

/** Original keysets are admitted BEFORE owned JSON copying or SDK projection. */
export function admitExpertIntakeClientParams(request, contract, observe = () => {}) {
  observe(); contract.admitOriginalCall(request, observe); observe();
  if (request.name !== 'filingfacts_prepare_expert_intake') refuse('CLI_ARGUMENTS');
  const admitted = ownedJson(request, EXPERT_INTAKE_CLIENT_LIMITS.request);
  contract.captureIntakeArguments(admitted.arguments, { observe }); observe();
  if (Buffer.byteLength(JSON.stringify(admitted) + '\n') > EXPERT_INTAKE_CLIENT_LIMITS.request) refuse('REQUEST_BOUND');
  return admitted;
}

/** No second core call. Compare the entire returned report to the one captured-byte reference. */
export function validateExpertIntakeClientReply(reply, reference, contract, observe = () => {}) {
  observe(); const admitted = ownedJson(reply, EXPERT_INTAKE_CLIENT_LIMITS.tool); observe();
  if (!jsonRecord(admitted) || Object.keys(admitted).some(key => !['resultType', 'content', 'structuredContent', 'isError'].includes(key)) ||
      (own(admitted, 'resultType') && admitted.resultType !== 'complete') ||
      (own(admitted, 'isError') && typeof admitted.isError !== 'boolean')) refuse('RESPONSE_SHAPE');
  if (admitted.isError === true) refuse('TOOL_REFUSED');
  if (!Array.isArray(admitted.content) || admitted.content.length !== 1) refuse('RESPONSE_SHAPE');
  const block = admitted.content[0]; requireKeys(block, ['type', 'text'], 'RESPONSE_SHAPE');
  if (block.type !== 'text' || typeof block.text !== 'string' || Buffer.byteLength(block.text) > EXPERT_INTAKE_CLIENT_LIMITS.report) refuse('RESPONSE_SHAPE');
  const parsedText = strictJson(Buffer.from(block.text, 'utf8'), 'RESPONSE_SHAPE'); observe();
  const report = ownedJson(admitted.structuredContent, EXPERT_INTAKE_CLIENT_LIMITS.report); observe();
  if (block.text !== JSON.stringify(report) || !equal(parsedText, report)) refuse('RESPONSE_BINDING');
  if (!contract.INTAKE_TOOL_OUTPUT.safeParse(report).success) refuse('RESPONSE_SHAPE'); observe();
  if (!equal(report, reference)) refuse('RESPONSE_BINDING'); observe();
  // Persist this original returned structuredContent copy, never the local reference.
  return report;
}

function packageRoot(filesystem) {
  const module = filesystem.realpathSync(fileURLToPath(import.meta.url)), root = dirname(dirname(module));
  if (dirname(module) !== resolve(root, 'src') || !filesystem.statSync(root).isDirectory() ||
      !filesystem.statSync(resolve(root, 'src/expert-intake-stdio.mjs')).isFile()) refuse('ROOT');
  return root;
}

function memoizedEffect(action) {
  let pending;
  return () => {
    if (pending) return pending;
    let fulfill, reject;
    pending = new Promise((yes, no) => { fulfill = yes; reject = no; }); pending.catch(() => {});
    // Publish ownership BEFORE a reentrant native callback or its synchronous failure.
    try { Promise.resolve(action()).then(fulfill, reject).catch(() => {}); }
    catch (error) { reject(error); }
    return pending;
  };
}
async function workCall(budget, callback, fallback) {
  await Promise.resolve(); budget.work();
  let pending;
  try { pending = Promise.resolve(callback({ signal: budget.signal, timeout: Math.max(1, Math.floor(budget.remaining())) })); }
  catch (error) { throw failureFor(error, fallback); }
  // Handle both original task outcomes BEFORE a post-callback clock can refuse.
  pending.catch(() => {});
  budget.work();
  let stop;
  const interrupted = new Promise((_, reject) => {
    stop = () => reject(new ExpertIntakeClientError(budget.failure ?? 'ABORTED'));
    if (budget.signal.aborted) stop(); else budget.signal.addEventListener('abort', stop, { once: true });
  });
  try { const result = await Promise.race([pending, interrupted]); budget.work(); return result; }
  catch (error) { throw failureFor(error, fallback); }
  finally { budget.signal.removeEventListener('abort', stop); }
}

function refused(code, lifecycle) {
  return { status: 'refused', code: CODES.has(code) ? code : 'INTERNAL', ...(lifecycle ? { lifecycle } : {}),
    message: 'Supplied-file intake preparation refused. No input or SDK diagnostic is echoed.' };
}

/** Trusted native fault seams are JS-only, never caller CLI or wire options. */
export async function runExpertIntakeClientFiles(argv, dependencies = {}) {
  const filesystem = dependencies.filesystem ?? fs;
  const budget = dependencies.budget ?? createExpertIntakeClientBudget(dependencies);
  const records = [], directory = {}, output = {};
  let parsed, context, report, reference, contract, operations, failure, workTimer, closeTimer, connectAttempts = 0, auditCalls = 0, closeAttempts = 0, stderrBytes = 0;
  let closure = { owned_pid: null, owned_child_absent: true, evidence: 'no_child_started' };
  try {
    workTimer = setTimeout(() => budget.fail('WORK_DEADLINE'), Math.max(1, budget.remaining()));
    budget.work(); parsed = parseExpertIntakeClientArgs(argv); budget.work();
    if (typeof process.getuid !== 'function') refuse('CLI_INPUT');
    const uid = BigInt(process.getuid());
    context = { ...captureFiles(parsed, filesystem, () => budget.work(), records, directory, uid), expected: parsed.expectedGold };
    // Exactly ONE unchanged core reference AFTER full capture and BEFORE any SDK startup.
    const core = await workCall(budget, () => dependencies.core ?? import('./expert-intake-core.mjs'), 'CLI_SOURCE');
    budget.work();
    const coreLimits = { goldBytes: 524288, intakeBytes: 65536, inventoryBytes: 32768, settingsBytes: 4096,
      evidenceBytes: 32768, evidenceTotalBytes: 262144, totalInputBytes: 786432, evidence: 64, reportBytes: 2097152 };
    if (!core || typeof core.prepareExpertIntake !== 'function' || !core.EXPERT_INTAKE_LIMITS ||
        Object.entries(coreLimits).some(([key, value]) => core.EXPERT_INTAKE_LIMITS[key] !== value)) refuse('CLI_SOURCE');
    reference = await workCall(budget, () => core.prepareExpertIntake(context.captured.gold, parsed.expectedGold,
      context.captured.intake, context.captured.evidenceInventory, context.captured.evidence, context.captured.intakeSettings), 'CLI_PREPARE');
    reference = ownedJson(reference, EXPERT_INTAKE_CLIENT_LIMITS.report); budget.work();
    contract = await workCall(budget, () => dependencies.contract ?? import('./expert-intake-stdio.mjs'), 'CLI_SOURCE');
    if (!contract.INTAKE_TOOL_OUTPUT.safeParse(reference).success) refuse('CLI_PREPARE'); budget.work();
    serialize(reference); budget.work();
    const request = admitExpertIntakeClientParams(buildExpertIntakeClientRequest(context.captured, parsed.expectedGold), contract, () => budget.work());
    const stderr = chunk => {
      try {
        if (!Buffer.isBuffer(chunk) || types.isProxy(chunk) || types.isSharedArrayBuffer(chunk.buffer) ||
            chunk.length > EXPERT_INTAKE_CLIENT_LIMITS.childStderr - stderrBytes) { budget.fail('STDERR_BOUND'); return; }
        stderrBytes += chunk.length;
      } catch { budget.fail('STDERR_BOUND'); }
    };
    const root = dependencies.packageRoot ?? packageRoot(filesystem);
    budget.work();
    operations = dependencies.operations ?? createExpertIntakeSdkOperations(root, budget, contract, { sdkModules: dependencies.sdkModules,
      serializeWire: dependencies.serializeWire, onStderr: stderr });
    if (!operations || ['connect', 'callTool', 'close'].some(name => typeof operations[name] !== 'function')) refuse('CONNECT');
    await workCall(budget, options => { connectAttempts++; return operations.connect({ ...options, onStderr: stderr }); }, 'CONNECT');
    const reply = await workCall(budget, options => { auditCalls++; return operations.callTool(request, { ...options, toolDefinition: contract.INTAKE_TOOL }); }, 'CALL');
    report = validateExpertIntakeClientReply(reply, reference, contract, () => budget.work()); budget.work();
  } catch (error) { failure = failureFor(error, 'INTERNAL'); budget.fail(failure.code); }
  finally {
    clearTimeout(workTimer);
    try { budget.beginClose(); } catch (error) { failure ??= failureFor(error, 'CLOCK'); }
    if (operations) {
      closeAttempts++;
      try {
        // Always attempt memoized own closure, including earlier capture/call refusal.
        const closing = Promise.resolve(operations.close()); closing.catch(() => {});
        const remaining = budget.closeRemaining();
        closure = await Promise.race([closing, new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new ExpertIntakeClientError('CLOSE_DEADLINE')), Math.max(1, remaining)); })]);
        budget.closing({ allowFailure: true });
        if (!jsonRecord(closure) || closure.owned_child_absent !== true ||
            (closure.evidence === 'same_owned_child_exit_or_close' ? !Number.isSafeInteger(closure.owned_pid) || closure.owned_pid < 1 :
              !['no_child_started', 'injected_no_child'].includes(closure.evidence) || closure.owned_pid !== null)) refuse('CHILD_UNCERTAIN');
      } catch (error) {
        failure ??= failureFor(error, 'CHILD_UNCERTAIN'); budget.fail(failure.code);
        let pid = null; try { pid = operations.ownedPid?.() ?? null; } catch { /* Unknown stays explicit. */ }
        closure = { owned_pid: Number.isSafeInteger(pid) && pid > 0 ? pid : null, owned_child_absent: null, evidence: 'unknown' };
      } finally { clearTimeout(closeTimer); }
    }
  }
  let bytes, lifecycle, terminal;
  try {
    budget.closing();
    if (failure) throw failure;
    if (connectAttempts !== 1 || auditCalls !== 1 || closeAttempts !== 1 || closure.owned_child_absent !== true) refuse('CHILD_UNCERTAIN');
    bytes = serialize(report); budget.closing();
    const ops = checkedFilesystem(filesystem, () => budget.closing());
    writeReport(ops, parsed.out, bytes, directory, output, BigInt(process.getuid()));
    budget.closing();
    lifecycle = { ...budget.lifecycle(), connect_attempts: connectAttempts, audit_calls: auditCalls, close_attempts: closeAttempts,
      ...closure, stderr_bytes: stderrBytes, limits_ms: { work: 15000, closure: 5000, total: 20000 } };
    terminal = { status: 'saved', report_sha256: digest(bytes), report_bytes: bytes.length,
      selected_n: report.coverage.selected_n, declared_role_count: report.coverage.declared_roles_n, syntactic_only: true, lifecycle };
  } catch (error) { failure ??= failureFor(error, 'CLI_OUTPUT'); budget.fail(failure.code); }
  for (const row of records) failure = release(filesystem, row, failure);
  failure = release(filesystem, output, failure); failure = release(filesystem, directory, failure);
  if (failure) budget.fail(failure.code);
  try { budget.closing({ allowFailure: true }); lifecycle ??= { ...budget.lifecycle(), connect_attempts: connectAttempts, audit_calls: auditCalls, close_attempts: closeAttempts, ...closure, stderr_bytes: stderrBytes }; }
  catch { budget.fail('CLOCK'); }
  if (budget.failure !== undefined) terminal = refused(budget.failure, lifecycle);
  if (!dependencies.budget) budget.dispose();
  return { exitCode: terminal?.status === 'saved' ? 0 : 1, terminal: terminal ?? refused('INTERNAL', lifecycle) };
}

/** SAME adapter for real locked SDK classes and trusted native synthetic classes. */
export function createExpertIntakeSdkOperations(root, budget, contract, {
  sdkModules, serializeWire = JSON.stringify, onStderr = () => {},
} = {}) {
  let client, transport, child, pid = null, exited = false, closed = false, startAttempted = false;
  let exitPromise = Promise.resolve(), closePromise, auditCalls = 0;
  const scope = {
    observe() { budget.work(); if (closed || exited) { budget.fail('CHILD_UNCERTAIN'); refuse('CHILD_UNCERTAIN'); } },
    remaining: () => budget.remaining(), onFailure: listener => budget.onFailure(listener),
    fail: code => budget.fail(code === 'DEADLINE' ? 'WORK_DEADLINE' : CODES.has(code) ? code : 'CALL'),
    close() { closed = true; budget.fail('CHILD_UNCERTAIN'); },
    get failure() { return budget.failure; },
  };
  return {
    ownedPid: () => pid,
    async connect(options) {
      let modules = sdkModules;
      if (!modules) {
        budget.work(); const clientModule = await import('@modelcontextprotocol/client'); budget.work();
        const transportModule = await import('@modelcontextprotocol/client/stdio'); budget.work();
        modules = { Client: clientModule.Client, StdioClientTransport: transportModule.StdioClientTransport };
      }
      budget.work(); if (closed) refuse('CONNECT');
      const { Client, StdioClientTransport } = modules;
      if (typeof Client !== 'function' || typeof StdioClientTransport !== 'function') refuse('CONNECT');
      client = new Client({ name: 'canli-offline-expert-intake-client', version: '0.0.0' }, {
        capabilities: {}, versionNegotiation: { mode: 'legacy' }, inputRequired: { autoFulfill: false },
      });
      transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, 'src/expert-intake-stdio.mjs')],
        cwd: root, stderr: 'pipe', maxBufferSize: EXPERT_INTAKE_CLIENT_LIMITS.response,
        // Explicit test-only Node guard inheritance is not authentication or a CLI flag.
        env: typeof process.env.NODE_OPTIONS === 'string' ? { NODE_OPTIONS: process.env.NODE_OPTIONS } : {},
      });
      const transportClose = memoizedEffect(transport.close.bind(transport));
      transport.close = () => { closed = true; return transportClose(); };
      client.close = memoizedEffect(client.close.bind(client));
      const originalStart = transport.start.bind(transport);
      let writer;
      transport.send = message => {
        budget.work();
        if (!writer || closed || exited || transport._process !== child) refuse('CALL');
        return writer.send(message, scope);
      };
      transport.start = () => {
        budget.work(); if (closed || startAttempted) refuse('CONNECT');
        startAttempted = true;
        const originalPending = originalStart();
        // BOTH outcomes owned before ANY fallible child field, PID or listener admission.
        const handled = Promise.resolve(originalPending).then(() => {}, () => {
          try { if (!closed) budget.fail('CONNECT'); } catch { /* Outcome is still handled. */ }
        });
        handled.catch(() => {});
        child = transport._process;
        if (!child) refuse('CHILD_UNCERTAIN');
        exitPromise = new Promise(resolveExit => {
          const absent = () => { exited = true; resolveExit(); };
          child.once('exit', absent); child.once('close', absent);
          child.once('spawn', () => {
            if (Number.isSafeInteger(child.pid) && child.pid > 0) pid = child.pid;
            else budget.fail('CHILD_UNCERTAIN');
          });
        });
        if (Number.isSafeInteger(child.pid) && child.pid > 0) pid = child.pid;
        if (child.exitCode !== null && child.exitCode !== undefined || child.signalCode !== null && child.signalCode !== undefined) exited = true;
        if (!child.stdin || typeof child.stdin.write !== 'function') refuse('CHILD_UNCERTAIN');
        writer = contract.createIntakeNativeWriter(child.stdin, { serialize: serializeWire, frameBytes: EXPERT_INTAKE_CLIENT_LIMITS.request });
        budget.work(); return originalPending;
      };
      if (!transport.stderr || typeof transport.stderr.on !== 'function') refuse('CONNECT');
      transport.stderr.on('data', onStderr);
      client.onerror = () => { if (!closed) budget.fail('CALL'); };
      budget.work(); await client.connect(transport, options); budget.work();
      if (!child || pid === null || exited) refuse('CHILD_UNCERTAIN');
    },
    async callTool(request, options) {
      if (++auditCalls !== 1 || !client || closed || exited) refuse('CALL');
      const admitted = admitExpertIntakeClientParams(request, contract, () => budget.work());
      const reply = await client.callTool(admitted, options); budget.work();
      // Locked legacy decodeResult may consume complete resultType. Do not normalize a contradiction.
      if (!jsonRecord(reply) || (own(reply, 'resultType') && reply.resultType !== 'complete')) refuse('RESPONSE_SHAPE');
      return reply;
    },
    close() {
      closed = true;
      if (!closePromise) {
        closePromise = memoizedEffect(async () => {
          let failure;
          try { if (client) await client.close(); } catch { failure = new ExpertIntakeClientError('CHILD_UNCERTAIN'); }
          try { if (transport) await transport.close(); } catch { failure ??= new ExpertIntakeClientError('CHILD_UNCERTAIN'); }
          if (startAttempted && (!child || pid === null)) failure ??= new ExpertIntakeClientError('CHILD_UNCERTAIN');
          if (child && pid !== null && !exited) await exitPromise;
          if (failure) throw failure;
          return { owned_pid: pid, owned_child_absent: child ? exited : true,
            evidence: child ? 'same_owned_child_exit_or_close' : 'no_child_started' };
        });
      }
      return closePromise();
    },
  };
}

/** Captured native terminal writer, freshly observed AFTER encoding/listener admission. */
export async function expertIntakeClientCommand(argv, dependencies = {}) {
  let budget, result, encoded, capturedWrite, timer, written = false, cleanup = () => {};
  const interrupts = dependencies.interrupts ?? process; let stream;
  const onInterrupt = () => budget?.fail('ABORTED');
  try {
    budget = createExpertIntakeClientBudget(dependencies);
    interrupts.on('SIGINT', onInterrupt); interrupts.on('SIGTERM', onInterrupt);
    result = await runExpertIntakeClientFiles(argv, { ...dependencies, budget });
    stream = result.exitCode === 0 ? dependencies.stdout ?? process.stdout : dependencies.stderr ?? process.stderr;
    capturedWrite = stream.write.bind(stream);
    const json = (dependencies.serializeTerminal ?? JSON.stringify)(result.terminal);
    if (typeof json !== 'string') refuse('CLI_STDIO');
    encoded = Buffer.from(json + '\n');
    if (encoded.length > (result.exitCode === 0 ? EXPERT_INTAKE_CLIENT_LIMITS.stdout : EXPERT_INTAKE_CLIENT_LIMITS.refusal)) refuse('CLI_STDIO');
    if (result.exitCode === 0) budget.closing(); else budget.closing({ allowFailure: true });
    await new Promise((resolveWrite, rejectWrite) => {
      let settled = false, returned = false, callbackDone = false, needsDrain = false, drained = false;
      const finish = error => { if (settled) return; settled = true; error ? rejectWrite(error) : resolveWrite(); };
      const complete = () => { if (returned && callbackDone && (!needsDrain || drained)) finish(); };
      const onDrain = () => { drained = true; complete(); }, onError = () => finish(new ExpertIntakeClientError('CLI_STDIO'));
      const onAbort = () => finish(new ExpertIntakeClientError(budget.failure ?? 'ABORTED'));
      stream.once('drain', onDrain); stream.once('error', onError);
      if (result.exitCode === 0) budget.signal.addEventListener('abort', onAbort, { once: true });
      cleanup = () => { stream.removeListener('drain', onDrain); stream.removeListener('error', onError); budget.signal.removeEventListener('abort', onAbort); };
      timer = setTimeout(() => finish(new ExpertIntakeClientError('CLOSE_DEADLINE')), Math.max(1, budget.closeRemaining()));
      try {
        if (result.exitCode === 0) budget.closing(); else budget.closing({ allowFailure: true });
        written = true;
        needsDrain = capturedWrite(encoded, error => { if (error) finish(new ExpertIntakeClientError('CLI_STDIO')); else { callbackDone = true; complete(); } }) === false;
        returned = true; complete();
      } catch (error) { finish(failureFor(error, 'CLI_STDIO')); }
    });
    budget.closing({ allowFailure: result.exitCode !== 0 });
    return { ...result, written, write_completed: true };
  } catch (error) {
    budget?.fail(failureFor(error, 'CLI_STDIO').code);
    // No second native write or raw exception after an uncertain terminal effect.
    return { exitCode: 1, terminal: refused(budget?.failure ?? 'CLI_STDIO'), written, write_completed: false };
  } finally {
    clearTimeout(timer); cleanup(); budget?.dispose();
    interrupts.removeListener('SIGINT', onInterrupt); interrupts.removeListener('SIGTERM', onInterrupt);
  }
}

let entry = false;
try { entry = !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); }
catch { /* Ordinary imports dispatch nothing. */ }
if (entry) {
  const result = await expertIntakeClientCommand(process.argv.slice(2));
  process.exitCode = result.exitCode;
}
