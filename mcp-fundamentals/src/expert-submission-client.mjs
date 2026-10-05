#!/usr/bin/env node
// Opt-in supplied-file SDK workflow. The delivered expert kernel/endpoint remain unchanged.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types, TextDecoder } from 'node:util';
import { performance } from 'node:perf_hooks';
import { canonicalJson, contentHash } from './canonical-json.mjs';
import { packetContent } from './filing-facts-packet.mjs';
import { agreement, cohensKappa, missingJudgements, JUDGEMENTS } from './expert-agreement.mjs';

export const EXPERT_CLIENT_LIMITS = Object.freeze({
  gold: 512 * 1024, intake: 64 * 1024, evidenceInventory: 32 * 1024, intakeSettings: 4096,
  evidence: 32 * 1024, evidenceTotal: 256 * 1024, intakeTotal: 768 * 1024,
  submissionInventory: 16 * 1024, auditSettings: 4096, submission: 2 * 1024 * 1024,
  evidenceCount: 64, submissionCount: 2, inputCount: 72, inputTotal: 4 * 1024 * 1024,
  report: 6 * 1024 * 1024, reportFile: 6 * 1024 * 1024 + 1, path: 4096,
  stdout: 4096, stderr: 8192, refusal: 2048,
  request: 6291456, response: 20971520, tool: 19922944,
  workMs: 15000, closeMs: 5000, totalMs: 20000,
});
const IDENTITY = Object.freeze(['dev', 'ino', 'mode', 'uid', 'gid']);
const STABLE = Object.freeze([...IDENTITY, 'nlink', 'size', 'mtimeNs', 'ctimeNs']);
const SCALARS = Object.freeze({
  '--gold': 'gold', '--expected-gold-sha256': 'expectedGold', '--intake': 'intake',
  '--evidence-inventory': 'evidenceInventory', '--intake-settings': 'intakeSettings',
  '--submission-inventory': 'submissionInventory', '--audit-settings': 'auditSettings', '--out': 'out',
});
const REQUIRED_INPUTS = Object.freeze(['gold', 'intake', 'evidenceInventory', 'intakeSettings',
  'submissionInventory', 'auditSettings']);
const CODES = new Set(['CLI_ARGUMENTS', 'CLI_PATH', 'CLI_SHA', 'CLI_COUNT', 'CLI_INPUT',
  'CLI_INPUT_BOUND', 'CLI_EVIDENCE_BOUND', 'CLI_INTAKE_BOUND', 'CLI_TOTAL_BOUND',
  'CLI_ALIAS', 'CLI_INPUT_CHANGED', 'CLI_READ', 'CLI_CLOSE', 'CLI_SOURCE', 'CLI_RECONCILE',
  'CLI_REPORT_BOUND', 'CLI_PARENT', 'CLI_OUTPUT', 'CLI_WRITE', 'CLI_FLUSH',
  'CLI_READBACK', 'CLI_OUTPUT_CHANGED', 'CLI_STDIO', 'CLOCK', 'ABORTED', 'WORK_DEADLINE',
  'CLOSE_DEADLINE', 'CHILD_UNCERTAIN', 'CONNECT', 'CALL', 'TOOL_REFUSED', 'RESPONSE_BOUND',
  'RESPONSE_SHAPE', 'RESPONSE_HASH', 'RESPONSE_BINDING', 'RESPONSE_ROWS', 'RESPONSE_UNKNOWNS',
  'STDERR_BOUND', 'REQUEST_BOUND', 'ROOT', 'INTERNAL']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (left, right, keys) => keys.every(key => left[key] === right[key]);
export class ExpertClientError extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new ExpertClientError(code); };
const failureFor = (error, fallback) => error instanceof ExpertClientError ? error : new ExpertClientError(fallback);

function path(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value ||
      Buffer.byteLength(value, 'utf8') > EXPERT_CLIENT_LIMITS.path || /\p{Cc}/u.test(value)) refuse('CLI_PATH');
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

export function parseExpertClientArgs(argv) {
  if (types.isProxy(argv) || !Array.isArray(argv) || Object.getPrototypeOf(argv) !== Array.prototype) refuse('CLI_ARGUMENTS');
  const properties = Object.getOwnPropertyDescriptors(argv), count = properties.length?.value;
  if (!Number.isSafeInteger(count) || count < 16 || count > 148 || count % 2 ||
      Reflect.ownKeys(properties).length !== count + 1) refuse('CLI_ARGUMENTS');
  const values = [];
  for (let index = 0; index < count; index++) {
    const row = properties[index];
    if (!row || !Object.hasOwn(row, 'value') || typeof row.value !== 'string') refuse('CLI_ARGUMENTS');
    values.push(row.value);
  }
  const result = { evidence: [], submission: [] };
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index], value = values[index + 1];
    if (flag === '--evidence' || flag === '--submission') {
      const name = flag.slice(2), maximum = name === 'evidence' ? 64 : 2;
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
  const files = [...REQUIRED_INPUTS.map(name => result[name]), ...result.evidence, ...result.submission, result.out];
  if (new Set(files).size !== files.length) refuse('CLI_ALIAS');
  return result;
}

// Numeric ownership is relinquished BEFORE the sole close attempt, even on failure.
function release(ops, record, failure) {
  if (record.fd === undefined) return failure;
  const owned = record.fd; record.fd = undefined;
  try { ops.closeSync(owned); } catch { return failure ?? new ExpertClientError('CLI_CLOSE'); }
  return failure;
}

function canonicalParent(ops, file, code) {
  if (ops.realpathSync(dirname(file)) !== dirname(file)) refuse(code);
}

function regularOwned(stat, maximum, uid) {
  return stat.isFile() && stat.uid === uid && stat.size >= 1n && stat.size <= BigInt(maximum);
}

function inputGuard(ops, record, uid) {
  canonicalParent(ops, record.path, 'CLI_INPUT_CHANGED');
  const held = ops.fstatSync(record.fd, { bigint: true }), linked = ops.lstatSync(record.path, { bigint: true });
  if (!regularOwned(held, record.maximum, uid) || !linked.isFile() ||
      !same(record.before, held, STABLE) || !same(record.before, linked, STABLE)) refuse('CLI_INPUT_CHANGED');
}

function admitInputs(ops, parsed, records, uid) {
  const names = [...REQUIRED_INPUTS.map(name => ({ name, path: parsed[name], maximum: EXPERT_CLIENT_LIMITS[name] })),
    ...parsed.evidence.map(file => ({ name: 'evidence', path: file, maximum: EXPERT_CLIENT_LIMITS.evidence })),
    ...parsed.submission.map(file => ({ name: 'submission', path: file, maximum: EXPERT_CLIENT_LIMITS.submission }))];
  if (names.length > EXPERT_CLIENT_LIMITS.inputCount) refuse('CLI_COUNT');
  let total = 0, evidence = 0, intake = 0;
  for (const row of names) {
    const record = { ...row }; records.push(record);
    record.fd = ops.openSync(row.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    record.before = ops.fstatSync(record.fd, { bigint: true });
    if (!regularOwned(record.before, row.maximum, uid)) refuse('CLI_INPUT_BOUND');
    inputGuard(ops, record, uid);
    if (records.some(other => other !== record && other.before && same(other.before, record.before, ['dev', 'ino']))) refuse('CLI_ALIAS');
    const size = Number(record.before.size); total += size;
    if (row.name === 'evidence') evidence += size;
    if (['gold', 'intake', 'evidenceInventory', 'intakeSettings', 'evidence'].includes(row.name)) intake += size;
  }
  if (evidence > EXPERT_CLIENT_LIMITS.evidenceTotal) refuse('CLI_EVIDENCE_BOUND');
  if (intake > EXPERT_CLIENT_LIMITS.intakeTotal) refuse('CLI_INTAKE_BOUND');
  if (total > EXPERT_CLIENT_LIMITS.inputTotal) refuse('CLI_TOTAL_BOUND');
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
  try { json = JSON.stringify(report); } catch { refuse('CLI_RECONCILE'); }
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > EXPERT_CLIENT_LIMITS.report) refuse('CLI_REPORT_BOUND');
  const bytes = Buffer.from(json + '\n', 'utf8');
  if (bytes.length > EXPERT_CLIENT_LIMITS.reportFile) refuse('CLI_REPORT_BOUND');
  return bytes;
}

function summary(report, bytes) {
  const selected = report?.coverage?.selected_n, roles = report?.coverage?.role_submissions_provided_n;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > 128 ||
      !Number.isSafeInteger(roles) || roles < 0 || roles > 2) refuse('CLI_RECONCILE');
  const text = JSON.stringify({ status: 'saved', report_sha256: digest(bytes), report_bytes: bytes.length,
    selected_n: selected, supplied_role_count: roles, syntactic_only: true }) + '\n';
  if (Buffer.byteLength(text) > EXPERT_CLIENT_LIMITS.stdout) refuse('CLI_STDIO');
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
  let offset = 0;
  while (offset < bytes.length) {
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
export function createExpertClientBudget({ now = () => performance.now(), signal } = {}) {
  let previous, closeStart, firstFailure, disposed = false;
  const abort = new AbortController(), listeners = new Set();
  const fail = code => {
    if (firstFailure !== undefined) return;
    firstFailure = CODES.has(code) ? code : 'INTERNAL';
    abort.abort(new ExpertClientError(firstFailure));
    for (const listener of [...listeners]) { try { listener(new ExpertClientError(firstFailure)); } catch { /* An observer cannot lose the first failure. */ } }
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
      if (time - started >= EXPERT_CLIENT_LIMITS.workMs) fail('WORK_DEADLINE');
      if (firstFailure !== undefined) refuse(firstFailure);
      return time;
    },
    beginClose() {
      if (closeStart === undefined) {
        closeStart = observe();
        if (closeStart - started >= EXPERT_CLIENT_LIMITS.workMs) fail('WORK_DEADLINE');
      }
      return closeStart;
    },
    closing({ allowFailure = false } = {}) {
      const time = observe();
      if (closeStart === undefined) refuse('INTERNAL');
      if (time - closeStart > EXPERT_CLIENT_LIMITS.closeMs || time - started > EXPERT_CLIENT_LIMITS.totalMs) fail('CLOSE_DEADLINE');
      if (!allowFailure && firstFailure !== undefined) refuse(firstFailure);
      return time;
    },
    remaining() { return Math.max(0, started + EXPERT_CLIENT_LIMITS.workMs - observe()); },
    closeRemaining() {
      const time = observe();
      return Math.max(0, Math.min(closeStart + EXPERT_CLIENT_LIMITS.closeMs - time, started + EXPERT_CLIENT_LIMITS.totalMs - time));
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
  const captured = { evidence: [], submission: [] };
  for (const record of records) {
    const bytes = readBytes(ops, record.fd, Number(record.before.size), 'CLI_READ');
    inputGuard(ops, record, uid);
    if (record.name === 'evidence' || record.name === 'submission') captured[record.name].push(bytes);
    else captured[record.name] = bytes;
  }
  for (const record of records) inputGuard(ops, record, uid);
  parentGuard(ops, dirname(parsed.out), directory, uid);
  let failure;
  for (const record of records) failure = release(ops, record, failure);
  if (failure) throw failure;
  boundary();
  if (digest(captured.gold) !== parsed.expectedGold) refuse('CLI_SHA');
  // Six structured inputs and returned submissions are fatal UTF8/duplicate-key JSON;
  // evidence remains opaque, exactly bound raw bytes.
  const json = Object.fromEntries(REQUIRED_INPUTS.map(name => [name, strictJson(captured[name], 'CLI_INPUT')]));
  json.submission = captured.submission.map(bytes => strictJson(bytes, 'CLI_INPUT'));
  return { captured, json };
}

export function buildExpertClientRequest(captured, expected) {
  if (typeof expected !== 'string' || expected.length !== 64 || !/^[a-f0-9]{64}$/.test(expected)) refuse('CLI_SHA');
  const args = {
    gold_base64: captured.gold.toString('base64'), expected_gold_raw_sha256: expected,
    intake_base64: captured.intake.toString('base64'), evidence_inventory_base64: captured.evidenceInventory.toString('base64'),
    evidence_base64: captured.evidence.map(bytes => bytes.toString('base64')), intake_settings_base64: captured.intakeSettings.toString('base64'),
    submission_inventory_base64: captured.submissionInventory.toString('base64'), submission_base64: captured.submission.map(bytes => bytes.toString('base64')),
    audit_settings_base64: captured.auditSettings.toString('base64'),
  };
  return { name: 'filingfacts_audit_expert_submissions', arguments: args };
}

const REVIEW_ROLES = Object.freeze(['reviewer_a', 'reviewer_b']);
const NULL_KEYS = new Set(['author_authenticated', 'document_authenticity', 'authenticated_human', 'task_expertise_verified', 'actual_independence_verified',
  'authenticity_verified', 'qualification_authenticity_verified', 'independently_assessed', 'rights_verified', 'actual_rights_verified',
  'source_completeness_verified', 'admitted_for_human_review', 'admitted_for_release', 'verified_submissions', 'expert_adjudication', 'verified_expert_agreement']);
const ESTABLISHED_KEYS = Object.freeze(['authenticated_humans_n', 'verified_experts_n', 'verified_independent_reviewers_n', 'verified_source_rights_n',
  'verified_source_completeness', 'expert_labelled_items_n', 'admitted_for_human_review', 'admitted_for_release', 'expert_agreement', 'expert_adjudication']);

function binding(row, bytes) {
  requireKeys(row, ['bytes', 'sha256', 'original_base64'], 'RESPONSE_BINDING');
  if (row.bytes !== bytes.length || row.sha256 !== digest(bytes) || row.original_base64 !== bytes.toString('base64')) refuse('RESPONSE_BINDING');
}
function nulls(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (NULL_KEYS.has(key) && child !== null) refuse('RESPONSE_UNKNOWNS');
    if (key === 'runtime_identity_verified') refuse('RESPONSE_UNKNOWNS');
    nulls(child);
  }
}
function sourceFlags(implementation, declared, preparation = false) {
  requireKeys(implementation, ['name', 'version', 'behavior_sha256', 'dependency_source_sha256', 'declared_module_sha256',
    'declared_module_sha256_verified', 'module_sha256_reason', ...(preparation ? [] : ['preparation_behavior_sha256', 'dependency_source_pins_verified'])], 'RESPONSE_UNKNOWNS');
  if (!jsonRecord(implementation) || implementation.declared_module_sha256 !== declared ||
      implementation.declared_module_sha256_verified !== false ||
      (preparation ? own(implementation, 'dependency_source_pins_verified') : implementation.dependency_source_pins_verified !== false)) refuse('RESPONSE_UNKNOWNS');
  nulls(implementation);
}

/** Validate the complete response against saved bytes, without executing another audit. */
export function validateExpertClientReply(input, context, contract) {
  const reply = ownedJson(input, EXPERT_CLIENT_LIMITS.tool);
  if (own(reply, 'resultType') && reply.resultType !== 'complete') refuse('RESPONSE_SHAPE');
  if (own(reply, 'isError') && typeof reply.isError !== 'boolean') refuse('RESPONSE_SHAPE');
  if (reply.isError === true) refuse('TOOL_REFUSED');
  if (!Array.isArray(reply.content) || reply.content.length !== 1 || reply.content[0]?.type !== 'text' || typeof reply.content[0].text !== 'string') refuse('RESPONSE_SHAPE');
  requireKeys(reply.content[0], ['type', 'text'], 'RESPONSE_SHAPE');
  const text = reply.content[0].text;
  if (Buffer.byteLength(text) > EXPERT_CLIENT_LIMITS.report) refuse('RESPONSE_BOUND');
  const report = strictJson(Buffer.from(text), 'RESPONSE_SHAPE');
  if (!equal(report, reply.structuredContent) || !contract.EXPERT_TOOL_OUTPUT.safeParse(report).success) refuse('RESPONSE_SHAPE');
  requireKeys(report, ['schema', 'implementation', 'preparation', 'packet_sha256', 'expected_gold_raw_sha256', 'bindings', 'settings',
    'limits', 'total_captured_input_bytes', 'submissions', 'role_coverage', 'coverage', 'syntactic_agreement', 'adjudication', 'established',
    'interpretation', 'content_hash'], 'RESPONSE_SHAPE');
  if (report.content_hash !== contentHash(report, createHash)) refuse('RESPONSE_HASH');
  const { captured, json, expected } = context;
  const p = report.preparation, n = json.gold.labels?.length, packet = digest(packetContent(json.gold));
  if (!Number.isSafeInteger(n) || n < 1 || n > 128 || report.expected_gold_raw_sha256 !== expected ||
      p?.expected_gold_raw_sha256 !== expected || p.packet_sha256 !== packet || report.packet_sha256 !== packet) refuse('RESPONSE_BINDING');
  requireKeys(p.bindings, ['gold', 'intake', 'inventory', 'settings'], 'RESPONSE_BINDING');
  for (const [key, name] of [['gold', 'gold'], ['intake', 'intake'], ['inventory', 'evidenceInventory'], ['settings', 'intakeSettings']]) binding(p.bindings[key], captured[name]);
  requireKeys(report.bindings, ['submission_inventory', 'audit_settings'], 'RESPONSE_BINDING');
  binding(report.bindings.submission_inventory, captured.submissionInventory); binding(report.bindings.audit_settings, captured.auditSettings);
  if (!equal(p.settings, json.intakeSettings) || !equal(report.settings, json.auditSettings) || p.raw_gold_byte_binding_verified !== true ||
      p.prepared_on_authenticated !== false || p.content_hash !== contentHash(p, createHash)) refuse('RESPONSE_BINDING');
  sourceFlags(p.implementation, json.intakeSettings.implementation_source_sha256, true);
  sourceFlags(report.implementation, json.auditSettings.implementation_source_sha256);
  for (const section of [p.established, report.established]) {
    requireKeys(section, ESTABLISHED_KEYS, 'RESPONSE_UNKNOWNS');
    if (Object.values(section).some(value => value !== null)) refuse('RESPONSE_UNKNOWNS');
  }
  // NULL checks cover derived worklists, never caller declarations that can carry
  // the words verification or adjudication as part of their unverified content.
  for (const section of [p.review_packets, p.role_worklists, p.source_worklists, p.evidence_inventory, p.adjudication,
    report.submissions, report.role_coverage, report.syntactic_agreement, report.adjudication]) nulls(section);
  if (!Array.isArray(p.review_packets) || p.review_packets.length !== 2 || !Array.isArray(p.role_worklists) || p.role_worklists.length !== 3) refuse('RESPONSE_ROWS');
  const declared = new Map(json.intake.roles.map(row => [row.role, row]));
  for (const [index, role] of ['reviewer_a', 'reviewer_b', 'adjudicator'].entries()) {
    const work = p.role_worklists[index], row = declared.get(role);
    if (work.role !== role || work.declared_handle !== (row?.handle ?? null) || !equal(work.declaration, row ?? null)) refuse('RESPONSE_BINDING');
  }
  for (const [index, role] of REVIEW_ROLES.entries()) {
    const row = p.review_packets[index], expectedPacket = { ...json.gold, annotator: declared.get(role)?.handle ?? '', packet_sha256: packet };
    if (row.role !== role || row.declared_handle !== (declared.get(role)?.handle ?? null) || !equal(row.packet, expectedPacket)) refuse('RESPONSE_ROWS');
  }
  const sources = new Map();
  json.gold.labels.forEach(row => row.filings.forEach(url => sources.set(digest(Buffer.from(url)), url)));
  if (!Array.isArray(p.source_worklists) || p.source_worklists.length !== sources.size ||
      p.coverage.required_roles_n !== 3 || p.coverage.declared_roles_n !== declared.size ||
      !equal(p.coverage.missing_roles, ['reviewer_a', 'reviewer_b', 'adjudicator'].filter(role => !declared.has(role))) ||
      p.coverage.distinct_sources_n !== sources.size || p.coverage.sources_declared_n !== json.intake.sources.length ||
      p.coverage.sources_missing_declaration_n !== sources.size - json.intake.sources.length ||
      p.coverage.evidence_provided_n !== captured.evidence.length) refuse('RESPONSE_ROWS');
  [...sources].forEach(([id, url], index) => {
    const work = p.source_worklists[index], declaration = json.intake.sources.find(row => row.source_id === id);
    if (work.source_id !== id || work.url !== url || work.declaration_present !== Boolean(declaration) ||
        !equal(work.required_uses, json.intakeSettings.required_uses) || !Array.isArray(work.claims) ||
        !equal(work.claims.map(row => row.declaration), declaration?.claims ?? [])) refuse('RESPONSE_BINDING');
  });
  const ev = json.evidenceInventory.evidence;
  if (!Array.isArray(ev) || ev.length !== captured.evidence.length || p.evidence_inventory.length !== ev.length) refuse('RESPONSE_BINDING');
  ev.forEach((row, index) => {
    const returned = p.evidence_inventory[index]; binding(returned.binding, captured.evidence[index]);
    for (const key of Object.keys(row)) if (!equal(returned[key], row[key])) refuse('RESPONSE_BINDING');
    if (returned.byte_binding_verified !== true) refuse('RESPONSE_BINDING');
  });
  const submissionRows = json.submissionInventory.submissions;
  if (!Array.isArray(submissionRows) || submissionRows.length !== captured.submission.length ||
      report.coverage.selected_n !== n || report.coverage.required_review_roles_n !== 2 || report.coverage.required_item_assignments_n !== 2 * n ||
      report.coverage.role_submissions_provided_n !== submissionRows.length || p.coverage.selected_n !== n ||
      p.coverage.prepared_items_per_review_role !== n || p.coverage.prepared_item_assignments !== 2 * n || p.coverage.prepared_completed_review_pairs_n !== 0) refuse('RESPONSE_ROWS');
  let total = REQUIRED_INPUTS.reduce((sum, key) => sum + captured[key].length, 0);
  total += [...captured.evidence, ...captured.submission].reduce((sum, bytes) => sum + bytes.length, 0);
  if (report.total_captured_input_bytes !== total) refuse('RESPONSE_BINDING');
  const byRole = new Map(submissionRows.map((row, index) => [row.role, { row, packet: json.submission[index], bytes: captured.submission[index] }]));
  const indexes = REVIEW_ROLES.map(role => new Map((byRole.get(role)?.packet.labels ?? []).map(row => [row.id, row])));
  if (byRole.size !== submissionRows.length || byRole.size > 2 || [...byRole.keys()].some(role => !REVIEW_ROLES.includes(role))) refuse('RESPONSE_BINDING');
  if (!equal(report.coverage.absent_role_submissions, REVIEW_ROLES.filter(role => !byRole.has(role)))) refuse('RESPONSE_ROWS');
  REVIEW_ROLES.forEach((role, index) => {
    const returned = report.submissions[index], source = byRole.get(role), coverage = report.role_coverage[index];
    if (returned.role !== role || coverage.role !== role || coverage.selected_n !== n) refuse('RESPONSE_ROWS');
    if (source) {
      binding(returned.binding, source.bytes);
      if (!equal(returned.packet, source.packet) || returned.declared_handle !== source.row.declared_handle || returned.raw_byte_binding_verified !== true) refuse('RESPONSE_BINDING');
      for (const key of ['packet_sha256', 'expected_sha256', 'expected_bytes']) if (returned[key] !== source.row[key]) refuse('RESPONSE_BINDING');
      if (source.packet.labels.length !== n) refuse('RESPONSE_ROWS');
      for (const label of source.packet.labels) {
        const gold = json.gold.labels.find(row => row.id === label.id);
        if (!gold) refuse('RESPONSE_ROWS');
        for (const key of ['id', 'template', 'company', 'question', 'answer', 'filings']) if (!equal(gold[key], label[key])) refuse('RESPONSE_ROWS');
      }
    } else if (returned.packet !== null || returned.binding !== null || returned.submission_status !== 'absent_submission' || returned.declared_handle !== (declared.get(role)?.handle ?? null)) refuse('RESPONSE_BINDING');
    const labels = source?.packet.labels ?? [], chosen = labels.reduce((count, label) => count + Object.keys(JUDGEMENTS).filter(key => JUDGEMENTS[key].includes(label[key])).length, 0);
    const complete = labels.filter(label => !missingJudgements(label).length).length;
    const completeJudgements = labels.filter(label => Object.keys(JUDGEMENTS).every(key => JUDGEMENTS[key].includes(label[key]))).length;
    if (coverage.immutable_rows_returned_n !== labels.length || coverage.chosen_judgement_fields_n !== chosen || coverage.missing_judgement_fields_n !== 3 * n - chosen ||
        coverage.complete_judgement_items_n !== completeJudgements || coverage.complete_with_required_notes_n !== complete ||
        coverage.items_missing_required_notes_n !== labels.filter(label => missingJudgements(label).includes('notes')).length) refuse('RESPONSE_ROWS');
  });
  for (const [field, choices] of Object.entries(JUDGEMENTS)) {
    const section = report.coverage.per_field[field], eligible = indexes.map(index => json.gold.labels.filter(row => choices.includes(index.get(row.id)?.[field])));
    const paired = json.gold.labels.filter(row => indexes.every(index => choices.includes(index.get(row.id)?.[field])));
    if (section.selected_n !== n || section.reviewer_a.eligible_n !== eligible[0].length || section.reviewer_b.eligible_n !== eligible[1].length ||
        section.reviewer_a.missing_n !== n - eligible[0].length || section.reviewer_b.missing_n !== n - eligible[1].length ||
        section.pair_eligible_n !== paired.length || section.pair_missing_n !== n - paired.length ||
        !equal(section.syntactic_agreement, paired.length ? cohensKappa(...indexes.map(index => paired.map(row => index.get(row.id)[field]))) : null)) refuse('RESPONSE_ROWS');
  }
  if (report.adjudication.expert_adjudication !== null || report.adjudication.decisions_created_n !== 0 ||
      !equal(report.adjudication.blank_submission, p.adjudication.blank_submission) || report.adjudication.item_tasks.length !== n || p.adjudication.item_tasks.length !== n) refuse('RESPONSE_ROWS');
  const completePairs = json.gold.labels.filter(row => indexes.every(index => !missingJudgements(index.get(row.id)).length)).length;
  if (report.coverage.complete_syntactic_pairs_n !== completePairs || report.syntactic_agreement.syntactic_only !== true ||
      !equal(report.syntactic_agreement.complete_item_pairs_result, byRole.size === 2 ? agreement(byRole.get('reviewer_a').packet, byRole.get('reviewer_b').packet, json.gold) : null)) refuse('RESPONSE_ROWS');
  json.gold.labels.forEach((row, index) => {
    const task = report.adjudication.item_tasks[index];
    const labels = indexes.map(index => index.get(row.id));
    const missing = REVIEW_ROLES.flatMap((role, i) => { const fields = missingJudgements(labels[i]); return fields.length ? [{ role, fields }] : []; });
    const disagreements = Object.keys(JUDGEMENTS).filter(key => labels.every(label => JUDGEMENTS[key].includes(label?.[key])) && labels[0][key] !== labels[1][key]);
    if (task.id !== row.id || task.selected_n !== n || !equal(task.source_ids, row.filings.map(url => digest(Buffer.from(url)))) ||
        !equal(task.missing_submissions, REVIEW_ROLES.filter(role => !byRole.has(role))) || !equal(task.missing_fields, missing) ||
        !equal(task.syntactic_disagreements, disagreements.map(field => ({ field, reviewer_a: labels[0][field], reviewer_b: labels[1][field] }))) ||
        task.adjudication !== null) refuse('RESPONSE_ROWS');
  });
  return report;
}

export function admitExpertClientParams(request, contract, observe = () => {}) {
  observe();
  const ownRequest = ownedJson(request, EXPERT_CLIENT_LIMITS.request);
  requireKeys(ownRequest, ['name', 'arguments'], 'CLI_ARGUMENTS');
  if (ownRequest.name !== 'filingfacts_audit_expert_submissions') refuse('CLI_ARGUMENTS');
  contract.captureExpertArguments(ownRequest.arguments, { observe });
  observe(); return ownRequest;
}

function packageRoot(filesystem) {
  const module = filesystem.realpathSync(fileURLToPath(import.meta.url));
  const root = dirname(dirname(module));
  if (dirname(module) !== resolve(root, 'src') || !filesystem.statSync(root).isDirectory() ||
      !filesystem.statSync(resolve(root, 'src/expert-submission-stdio.mjs')).isFile()) refuse('ROOT');
  return root;
}

/** SAME adapter for real locked SDK classes and trusted native synthetic classes. */
export function createExpertSdkOperations(root, budget, contract, {
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
      const modules = sdkModules ?? await Promise.all([import('@modelcontextprotocol/client'), import('@modelcontextprotocol/client/stdio')])
        .then(([clientModule, transportModule]) => ({ Client: clientModule.Client, StdioClientTransport: transportModule.StdioClientTransport }));
      budget.work(); if (closed) refuse('CONNECT');
      const { Client, StdioClientTransport } = modules;
      if (typeof Client !== 'function' || typeof StdioClientTransport !== 'function') refuse('CONNECT');
      client = new Client({ name: 'canli-offline-expert-submission-client', version: '0.0.0' }, {
        capabilities: {}, versionNegotiation: { mode: 'legacy' }, inputRequired: { autoFulfill: false },
      });
      transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, 'src/expert-submission-stdio.mjs')],
        cwd: root, stderr: 'pipe', maxBufferSize: EXPERT_CLIENT_LIMITS.response,
        // Explicit test-only Node guard inheritance is not authentication or a CLI flag.
        env: typeof process.env.NODE_OPTIONS === 'string' ? { NODE_OPTIONS: process.env.NODE_OPTIONS } : {},
      });
      const originalClose = transport.close.bind(transport); let transportClose;
      transport.close = () => { closed = true; return transportClose ??= originalClose(); };
      const originalClientClose = client.close.bind(client); let clientClose;
      client.close = () => clientClose ??= originalClientClose();
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
        if (!child.stdin || typeof child.stdin.write !== 'function') refuse('CHILD_UNCERTAIN');
        writer = contract.createExpertNativeWriter(child.stdin, { serialize: serializeWire, frameBytes: EXPERT_CLIENT_LIMITS.request });
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
      const admitted = admitExpertClientParams(request, contract, () => budget.work());
      const reply = await client.callTool(admitted, options); budget.work();
      // Locked legacy decodeResult may consume complete resultType. Do not normalize a contradiction.
      if (!jsonRecord(reply) || (own(reply, 'resultType') && reply.resultType !== 'complete')) refuse('RESPONSE_SHAPE');
      return reply;
    },
    close() {
      closed = true;
      return closePromise ??= (async () => {
        let failure;
        try { if (client) await client.close(); } catch { failure = new ExpertClientError('CHILD_UNCERTAIN'); }
        try { if (transport) await transport.close(); } catch { failure ??= new ExpertClientError('CHILD_UNCERTAIN'); }
        if (startAttempted && (!child || pid === null)) failure ??= new ExpertClientError('CHILD_UNCERTAIN');
        if (child && pid !== null && !exited) await exitPromise;
        if (failure) throw failure;
        return { owned_pid: pid, owned_child_absent: child ? exited : true,
          evidence: child ? 'same_owned_child_exit_or_close' : 'no_child_started' };
      })();
    },
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
    stop = () => reject(new ExpertClientError(budget.failure ?? 'ABORTED'));
    if (budget.signal.aborted) stop(); else budget.signal.addEventListener('abort', stop, { once: true });
  });
  try { const result = await Promise.race([pending, interrupted]); budget.work(); return result; }
  catch (error) { throw failureFor(error, fallback); }
  finally { budget.signal.removeEventListener('abort', stop); }
}

function refused(code, lifecycle) {
  return { status: 'refused', code: CODES.has(code) ? code : 'INTERNAL', ...(lifecycle ? { lifecycle } : {}),
    message: 'Supplied-file expert audit refused. No input or SDK diagnostic is echoed.' };
}

/** Trusted native fault seams are JS-only, never caller CLI or wire options. */
export async function runExpertClientFiles(argv, dependencies = {}) {
  const filesystem = dependencies.filesystem ?? fs;
  const budget = dependencies.budget ?? createExpertClientBudget(dependencies);
  const records = [], directory = {}, output = {};
  let parsed, context, report, contract, operations, failure, workTimer, closeTimer, connectAttempts = 0, auditCalls = 0, closeAttempts = 0, stderrBytes = 0;
  let closure = { owned_pid: null, owned_child_absent: true, evidence: 'no_child_started' };
  try {
    workTimer = setTimeout(() => budget.fail('WORK_DEADLINE'), Math.max(1, budget.remaining()));
    budget.work(); parsed = parseExpertClientArgs(argv); budget.work();
    if (typeof process.getuid !== 'function') refuse('CLI_INPUT');
    const uid = BigInt(process.getuid());
    context = { ...captureFiles(parsed, filesystem, () => budget.work(), records, directory, uid), expected: parsed.expectedGold };
    // SDK and contract imports occur only AFTER all native inputs and parent admission.
    contract = await workCall(budget, () => dependencies.contract ?? import('./expert-submission-stdio.mjs'), 'CLI_SOURCE');
    const request = admitExpertClientParams(buildExpertClientRequest(context.captured, parsed.expectedGold), contract, () => budget.work());
    const stderr = chunk => {
      try {
        if (!Buffer.isBuffer(chunk) || types.isProxy(chunk) || types.isSharedArrayBuffer(chunk.buffer) ||
            chunk.length > EXPERT_CLIENT_LIMITS.stderr - stderrBytes) { budget.fail('STDERR_BOUND'); return; }
        stderrBytes += chunk.length;
      } catch { budget.fail('STDERR_BOUND'); }
    };
    const root = dependencies.packageRoot ?? packageRoot(filesystem);
    budget.work();
    operations = dependencies.operations ?? createExpertSdkOperations(root, budget, contract, { sdkModules: dependencies.sdkModules,
      serializeWire: dependencies.serializeWire, onStderr: stderr });
    if (!operations || ['connect', 'callTool', 'close'].some(name => typeof operations[name] !== 'function')) refuse('CONNECT');
    await workCall(budget, options => { connectAttempts++; return operations.connect({ ...options, onStderr: stderr }); }, 'CONNECT');
    const reply = await workCall(budget, options => { auditCalls++; return operations.callTool(request, { ...options, toolDefinition: contract.EXPERT_TOOL }); }, 'CALL');
    report = validateExpertClientReply(reply, context, contract); budget.work();
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
        closure = await Promise.race([closing, new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new ExpertClientError('CLOSE_DEADLINE')), Math.max(1, remaining)); })]);
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
      selected_n: report.coverage.selected_n, supplied_role_count: report.coverage.role_submissions_provided_n, syntactic_only: true, lifecycle };
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

/** Captured native terminal writer, freshly observed AFTER encoding/listener admission. */
export async function expertClientCommand(argv, dependencies = {}) {
  let budget, result, encoded, capturedWrite, timer, written = false, cleanup = () => {};
  const interrupts = dependencies.interrupts ?? process, stream = dependencies.stdout ?? process.stdout;
  const onInterrupt = () => budget?.fail('ABORTED');
  try {
    budget = createExpertClientBudget(dependencies);
    interrupts.on('SIGINT', onInterrupt); interrupts.on('SIGTERM', onInterrupt);
    capturedWrite = stream.write.bind(stream);
    result = await runExpertClientFiles(argv, { ...dependencies, budget });
    const json = (dependencies.serializeTerminal ?? JSON.stringify)(result.terminal);
    if (typeof json !== 'string') refuse('CLI_STDIO');
    encoded = Buffer.from(json + '\n');
    if (encoded.length > (result.exitCode === 0 ? EXPERT_CLIENT_LIMITS.stdout : EXPERT_CLIENT_LIMITS.refusal)) refuse('CLI_STDIO');
    if (result.exitCode === 0) budget.closing(); else budget.closing({ allowFailure: true });
    await new Promise((resolveWrite, rejectWrite) => {
      let settled = false, returned = false, callbackDone = false, needsDrain = false, drained = false;
      const finish = error => { if (settled) return; settled = true; error ? rejectWrite(error) : resolveWrite(); };
      const complete = () => { if (returned && callbackDone && (!needsDrain || drained)) finish(); };
      const onDrain = () => { drained = true; complete(); }, onError = () => finish(new ExpertClientError('CLI_STDIO'));
      const onAbort = () => finish(new ExpertClientError(budget.failure ?? 'ABORTED'));
      stream.once('drain', onDrain); stream.once('error', onError);
      if (result.exitCode === 0) budget.signal.addEventListener('abort', onAbort, { once: true });
      cleanup = () => { stream.removeListener('drain', onDrain); stream.removeListener('error', onError); budget.signal.removeEventListener('abort', onAbort); };
      timer = setTimeout(() => finish(new ExpertClientError('CLOSE_DEADLINE')), Math.max(1, budget.closeRemaining()));
      try {
        if (result.exitCode === 0) budget.closing(); else budget.closing({ allowFailure: true });
        written = true;
        needsDrain = capturedWrite(encoded, error => { if (error) finish(new ExpertClientError('CLI_STDIO')); else { callbackDone = true; complete(); } }) === false;
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
  const result = await expertClientCommand(process.argv.slice(2));
  process.exitCode = result.exitCode;
}
