#!/usr/bin/env node
// Explicit supplied-file wrapper. The delivered reconciler and its semantics are unchanged.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

export const EXPERT_SUBMISSION_CLI_LIMITS = Object.freeze({
  gold: 512 * 1024, intake: 64 * 1024, evidenceInventory: 32 * 1024, intakeSettings: 4096,
  evidence: 32 * 1024, evidenceTotal: 256 * 1024, intakeTotal: 768 * 1024,
  submissionInventory: 16 * 1024, auditSettings: 4096, submission: 2 * 1024 * 1024,
  evidenceCount: 64, submissionCount: 2, inputCount: 72, inputTotal: 4 * 1024 * 1024,
  report: 6 * 1024 * 1024, reportFile: 6 * 1024 * 1024 + 1, path: 4096,
  stdout: 4096, stderr: 1024,
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
  'CLI_READBACK', 'CLI_OUTPUT_CHANGED', 'CLI_STDIO']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (left, right, keys) => keys.every(key => left[key] === right[key]);
class Refusal extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new Refusal(code); };
const failureFor = (error, fallback) => error instanceof Refusal ? error : new Refusal(fallback);

function path(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value ||
      Buffer.byteLength(value, 'utf8') > EXPERT_SUBMISSION_CLI_LIMITS.path || /\p{Cc}/u.test(value)) refuse('CLI_PATH');
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

function argumentsFor(argv) {
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
  try { ops.closeSync(owned); } catch { return failure ?? new Refusal('CLI_CLOSE'); }
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
  const names = [...REQUIRED_INPUTS.map(name => ({ name, path: parsed[name], maximum: EXPERT_SUBMISSION_CLI_LIMITS[name] })),
    ...parsed.evidence.map(file => ({ name: 'evidence', path: file, maximum: EXPERT_SUBMISSION_CLI_LIMITS.evidence })),
    ...parsed.submission.map(file => ({ name: 'submission', path: file, maximum: EXPERT_SUBMISSION_CLI_LIMITS.submission }))];
  if (names.length > EXPERT_SUBMISSION_CLI_LIMITS.inputCount) refuse('CLI_COUNT');
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
  if (evidence > EXPERT_SUBMISSION_CLI_LIMITS.evidenceTotal) refuse('CLI_EVIDENCE_BOUND');
  if (intake > EXPERT_SUBMISSION_CLI_LIMITS.intakeTotal) refuse('CLI_INTAKE_BOUND');
  if (total > EXPERT_SUBMISSION_CLI_LIMITS.inputTotal) refuse('CLI_TOTAL_BOUND');
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
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > EXPERT_SUBMISSION_CLI_LIMITS.report) refuse('CLI_REPORT_BOUND');
  const bytes = Buffer.from(json + '\n', 'utf8');
  if (bytes.length > EXPERT_SUBMISSION_CLI_LIMITS.reportFile) refuse('CLI_REPORT_BOUND');
  return bytes;
}

function summary(report, bytes) {
  const selected = report?.coverage?.selected_n, roles = report?.coverage?.role_submissions_provided_n;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > 128 ||
      !Number.isSafeInteger(roles) || roles < 0 || roles > 2) refuse('CLI_RECONCILE');
  const text = JSON.stringify({ status: 'saved', report_sha256: digest(bytes), report_bytes: bytes.length,
    selected_n: selected, supplied_role_count: roles, syntactic_only: true }) + '\n';
  if (Buffer.byteLength(text) > EXPERT_SUBMISSION_CLI_LIMITS.stdout) refuse('CLI_STDIO');
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

/** Trusted JS-only fault seams; the actual command always uses native fs and the one local core. */
export async function main(argv, { filesystem = fs, loadCore = () => import('./expert-submission-audit-core.mjs') } = {}) {
  const records = [], directory = {}, output = {}; let failure, stdout = '';
  try {
    const parsed = argumentsFor(argv);
    if (typeof process.getuid !== 'function') refuse('CLI_INPUT');
    const uid = BigInt(process.getuid());
    admitInputs(filesystem, parsed, records, uid);
    try { admitParent(filesystem, parsed.out, directory, uid, records); }
    catch (error) { throw failureFor(error, 'CLI_PARENT'); }
    const captured = { evidence: [], submission: [] };
    for (const record of records) {
      const bytes = readBytes(filesystem, record.fd, Number(record.before.size), 'CLI_READ');
      inputGuard(filesystem, record, uid);
      if (record.name === 'evidence' || record.name === 'submission') captured[record.name].push(bytes);
      else captured[record.name] = bytes;
    }
    // Reobserve earlier inputs after later captures, before forgetting any descriptor.
    for (const record of records) inputGuard(filesystem, record, uid);
    parentGuard(filesystem, dirname(parsed.out), directory, uid);
    for (const record of records) failure = release(filesystem, record, failure);
    if (failure) throw failure;
    let core;
    try { core = await loadCore(); } catch { refuse('CLI_SOURCE'); }
    let report;
    try { report = core.reconcileExpertSubmissions(captured.gold, parsed.expectedGold, captured.intake,
      captured.evidenceInventory, captured.evidence, captured.intakeSettings,
      captured.submissionInventory, captured.submission, captured.auditSettings); }
    catch { refuse('CLI_RECONCILE'); }
    const bytes = serialize(report), terminal = summary(report, bytes);
    try { writeReport(filesystem, parsed.out, bytes, directory, output, uid); }
    catch (error) { throw failureFor(error, 'CLI_OUTPUT'); }
    stdout = terminal;
  } catch (error) { failure = failure ?? failureFor(error, 'CLI_INPUT'); }
  for (const record of records) failure = release(filesystem, record, failure);
  failure = release(filesystem, output, failure);
  failure = release(filesystem, directory, failure);
  if (failure) {
    const code = CODES.has(failure.code) ? failure.code : 'CLI_INPUT';
    return { exitCode: 1, stdout: '', stderr: `expert-submission-cli: ${code}\n` };
  }
  return { exitCode: 0, stdout, stderr: '' };
}

function standard(fd, text, maximum) {
  const bytes = Buffer.from(text, 'utf8'); if (bytes.length > maximum) refuse('CLI_STDIO');
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.writeSync(fd, bytes, offset, bytes.length - offset);
    if (!Number.isSafeInteger(count) || count <= 0 || count > bytes.length - offset) refuse('CLI_STDIO');
    offset += count;
  }
}

let entry = false;
try { entry = !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); }
catch { /* Ordinary imports dispatch nothing. */ }
if (entry) {
  const result = await main(process.argv.slice(2)); process.exitCode = result.exitCode;
  try {
    standard(1, result.stdout, EXPERT_SUBMISSION_CLI_LIMITS.stdout);
    standard(2, result.stderr, EXPERT_SUBMISSION_CLI_LIMITS.stderr);
  } catch {
    process.exitCode = 1;
    try { standard(2, 'expert-submission-cli: CLI_STDIO\n', EXPERT_SUBMISSION_CLI_LIMITS.stderr); }
    catch { /* No echo and no command retry. */ }
  }
}
