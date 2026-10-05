#!/usr/bin/env node
// Explicit preparation from supplied files. The delivered intake kernel is unchanged.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

export const EXPERT_INTAKE_FILES_LIMITS = Object.freeze({
  gold: 524288, intake: 65536, evidenceInventory: 32768, intakeSettings: 4096,
  evidence: 32768, evidenceTotal: 262144, evidenceCount: 64, inputCount: 68,
  inputTotal: 786432, report: 2097152, reportFile: 2097153,
  path: 4096, argvCount: 140, argvBytes: 524288, stdout: 4096, stderr: 1024,
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
  'CLI_READBACK', 'CLI_OUTPUT_CHANGED', 'CLI_STDIO']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (left, right, keys) => keys.every(key => left[key] === right[key]);
class Refusal extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new Refusal(code); };
const failureFor = (error, fallback) => error instanceof Refusal ? error : new Refusal(fallback);

function path(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value ||
      Buffer.byteLength(value, 'utf8') > EXPERT_INTAKE_FILES_LIMITS.path || /\p{Cc}/u.test(value)) refuse('CLI_PATH');
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
  if (!Number.isSafeInteger(count) || count < 12 || count > EXPERT_INTAKE_FILES_LIMITS.argvCount || count % 2 ||
      Reflect.ownKeys(properties).length !== count + 1) refuse('CLI_ARGUMENTS');
  const values = []; let argvBytes = 0;
  for (let index = 0; index < count; index++) {
    const row = properties[index];
    if (!row || !Object.hasOwn(row, 'value') || typeof row.value !== 'string') refuse('CLI_ARGUMENTS');
    argvBytes += Buffer.byteLength(row.value, 'utf8');
    if (argvBytes > EXPERT_INTAKE_FILES_LIMITS.argvBytes) refuse('CLI_ARGUMENTS');
    values.push(row.value);
  }
  const result = { evidence: [] };
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index], value = values[index + 1];
    if (flag === '--evidence') {
      const name = 'evidence', maximum = EXPERT_INTAKE_FILES_LIMITS.evidenceCount;
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
  try { ops.closeSync(owned); } catch { return failure ?? new Refusal('CLI_CLOSE'); }
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
  const names = [...REQUIRED_INPUTS.map(name => ({ name, path: parsed[name], maximum: EXPERT_INTAKE_FILES_LIMITS[name] })),
    ...parsed.evidence.map(file => ({ name: 'evidence', path: file, maximum: EXPERT_INTAKE_FILES_LIMITS.evidence }))];
  if (names.length > EXPERT_INTAKE_FILES_LIMITS.inputCount) refuse('CLI_COUNT');
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
  if (evidence > EXPERT_INTAKE_FILES_LIMITS.evidenceTotal) refuse('CLI_EVIDENCE_BOUND');
  if (total > EXPERT_INTAKE_FILES_LIMITS.inputTotal) refuse('CLI_TOTAL_BOUND');
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
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > EXPERT_INTAKE_FILES_LIMITS.report) refuse('CLI_REPORT_BOUND');
  const bytes = Buffer.from(json + '\n', 'utf8');
  if (bytes.length > EXPERT_INTAKE_FILES_LIMITS.reportFile) refuse('CLI_REPORT_BOUND');
  return bytes;
}

function summary(report, bytes) {
  const selected = report?.coverage?.selected_n, roles = report?.coverage?.declared_roles_n;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > 128 ||
      !Number.isSafeInteger(roles) || roles < 0 || roles > 3) refuse('CLI_PREPARE');
  const text = JSON.stringify({ status: 'saved', report_sha256: digest(bytes), report_bytes: bytes.length,
    selected_n: selected, declared_role_count: roles, syntactic_only: true }) + '\n';
  if (Buffer.byteLength(text) > EXPERT_INTAKE_FILES_LIMITS.stdout) refuse('CLI_STDIO');
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

/** Trusted JS-only fault seams; the actual command always uses native fs and the one local core. */
export async function main(argv, { filesystem = fs, loadCore = () => import('./expert-intake-core.mjs') } = {}) {
  const records = [], directory = {}, output = {}; let failure, stdout = '';
  try {
    const parsed = argumentsFor(argv);
    if (typeof process.getuid !== 'function') refuse('CLI_INPUT');
    const uid = BigInt(process.getuid());
    admitInputs(filesystem, parsed, records, uid);
    try { admitParent(filesystem, parsed.out, directory, uid, records); }
    catch (error) { throw failureFor(error, 'CLI_PARENT'); }
    const captured = { evidence: [] };
    for (const record of records) {
      const bytes = readBytes(filesystem, record.fd, Number(record.before.size), 'CLI_READ');
      inputGuard(filesystem, record, uid);
      if (record.name === 'evidence') captured[record.name].push(bytes);
      else captured[record.name] = bytes;
    }
    // Reobserve earlier inputs after later captures, before forgetting any descriptor.
    for (const record of records) inputGuard(filesystem, record, uid);
    parentGuard(filesystem, dirname(parsed.out), directory, uid);
    for (const record of records) failure = release(filesystem, record, failure);
    if (failure) throw failure;
    let core;
    try { core = await loadCore(); } catch { refuse('CLI_SOURCE'); }
    const expectedLimits = { goldBytes: 524288, intakeBytes: 65536, inventoryBytes: 32768, settingsBytes: 4096,
      evidenceBytes: 32768, evidenceTotalBytes: 262144, totalInputBytes: 786432, evidence: 64, reportBytes: 2097152 };
    if (!core || typeof core.prepareExpertIntake !== 'function' || !core.EXPERT_INTAKE_LIMITS ||
        Object.entries(expectedLimits).some(([key, value]) => core.EXPERT_INTAKE_LIMITS[key] !== value)) refuse('CLI_SOURCE');
    let report;
    try { report = core.prepareExpertIntake(captured.gold, parsed.expectedGold, captured.intake,
      captured.evidenceInventory, captured.evidence, captured.intakeSettings); }
    catch { refuse('CLI_PREPARE'); }
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
    return { exitCode: 1, stdout: '', stderr: `expert-intake-files: ${code}\n` };
  }
  return { exitCode: 0, stdout, stderr: '' };
}

/** SAME preencoded terminal frame; native short writes never repeat any file or core effect. */
export async function writeTerminal(fd, text, maximum, {
  write = fs.writeSync.bind(fs), now = () => performance.now(),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), signal,
} = {}) {
  const started = now(); let previous = started, offset = 0, attempts = 0, aborted = false;
  const observe = () => {
    const current = now(); aborted ||= Boolean(signal?.aborted);
    if (!Number.isFinite(started) || !Number.isFinite(current) || current < previous ||
        current - started > 1000 || aborted) refuse('CLI_STDIO');
    previous = current;
  };
  observe();
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > maximum) refuse('CLI_STDIO');
  const bytes = Buffer.from(text, 'utf8'); observe();
  while (offset < bytes.length) {
    observe(); if (++attempts > 4096) refuse('CLI_STDIO');
    const requested = Math.min(65536, bytes.length - offset); let count;
    try { count = write(fd, bytes, offset, requested); }
    catch (error) {
      if (!['EAGAIN', 'EWOULDBLOCK'].includes(error?.code)) refuse('CLI_STDIO');
      observe(); await wait(1); observe(); continue;
    }
    if (!Number.isSafeInteger(count) || count <= 0 || count > requested) refuse('CLI_STDIO');
    offset += count; observe();
  }
  return offset;
}

let entry = false;
try { entry = !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); }
catch { /* Ordinary imports dispatch nothing. */ }
if (entry) {
  const result = await main(process.argv.slice(2)); process.exitCode = result.exitCode;
  try {
    await writeTerminal(1, result.stdout, EXPERT_INTAKE_FILES_LIMITS.stdout);
    await writeTerminal(2, result.stderr, EXPERT_INTAKE_FILES_LIMITS.stderr);
  } catch {
    process.exitCode = 1;
    try { await writeTerminal(2, 'expert-intake-files: CLI_STDIO\n', EXPERT_INTAKE_FILES_LIMITS.stderr); }
    catch { /* No echo and no command retry. */ }
  }
}
