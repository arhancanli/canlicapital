// Explicit offline saved-fixture adapter. The scoring core and its schema are unchanged.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

export const ATTEMPT_SCORING_CLI_STREAM_LIMITS = Object.freeze({ stdout: 4096, stderr: 1024 });
const IDENTITY = ['dev', 'ino', 'mode', 'uid', 'gid'];
const STABLE = [...IDENTITY, 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
const CODES = new Set(['CLI_ARGUMENTS', 'CLI_PATH', 'CLI_ROOT', 'CLI_INPUT', 'CLI_INPUT_BOUND',
  'CLI_INPUT_CHANGED', 'CLI_READ', 'CLI_CLOSE', 'CLI_SOURCE', 'CLI_SCORING', 'CLI_PARENT',
  'CLI_OUTPUT', 'CLI_WRITE', 'CLI_FLUSH', 'CLI_READBACK', 'CLI_OUTPUT_CHANGED', 'CLI_STDIO']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (left, right, keys) => keys.every(key => left[key] === right[key]);
class Refusal extends Error {
  constructor(code) { super(code); this.code = code; }
}
const refuse = code => { throw new Refusal(code); };

function path(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 4096 ||
      /[\x00-\x1f\x7f]/.test(value) || !isAbsolute(value) || normalize(value) !== value) refuse('CLI_PATH');
  return value;
}

function argumentsFor(argv) {
  if (types.isProxy(argv) || !Array.isArray(argv)) refuse('CLI_ARGUMENTS');
  if (Object.getOwnPropertyDescriptor(argv, 'length')?.value !== 7) refuse('CLI_ARGUMENTS');
  const properties = Array.from({ length: 7 }, (_, i) => Object.getOwnPropertyDescriptor(argv, String(i)));
  if (properties.some(property =>
        !property || !Object.hasOwn(property, 'value') || typeof property.value !== 'string')) refuse('CLI_ARGUMENTS');
  const values = Array.from({ length: 7 }, (_, i) => properties[i].value);
  const [mode, root, ...files] = values;
  if (!['score', 'replay'].includes(mode)) refuse('CLI_ARGUMENTS');
  path(root); files.forEach(path);
  if (new Set(files).size !== files.length) refuse('CLI_PATH');
  return { mode, root, files };
}

// Forget numeric ownership before close: a throwing close may already have reused the FD.
function release(record, failure) {
  if (record.fd === undefined) return failure;
  const owned = record.fd; record.fd = undefined;
  try { fs.closeSync(owned); }
  catch { return failure ?? new Refusal('CLI_CLOSE'); }
  return failure;
}

function canonicalParent(file) {
  const parent = dirname(file);
  if (fs.realpathSync(parent) !== parent) refuse('CLI_PATH');
}

function checkRoot(root) {
  const record = {}; let failure;
  try {
    if (fs.realpathSync(root) !== root) refuse('CLI_ROOT');
    record.fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY |
      fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(record.fd, { bigint: true });
    if (!stat.isDirectory() || !same(stat, fs.lstatSync(root, { bigint: true }), IDENTITY)) refuse('CLI_ROOT');
  } catch (error) { failure = error instanceof Refusal ? error : new Refusal('CLI_ROOT'); }
  failure = release(record, failure);
  if (failure) throw failure;
}

function regular(stat, maximum) {
  return stat.isFile() && stat.size >= 0n && stat.size <= BigInt(maximum);
}

function readBytes(fd, size, errorCode) {
  const bytes = Buffer.alloc(size); let offset = 0;
  while (offset < size) {
    const count = fs.readSync(fd, bytes, offset, Math.min(65536, size - offset), offset);
    if (!Number.isSafeInteger(count) || count <= 0 || count > Math.min(65536, size - offset)) refuse(errorCode);
    offset += count;
  }
  if (fs.readSync(fd, Buffer.alloc(1), 0, 1, size) !== 0) refuse(errorCode);
  return bytes;
}

function readSupplied(files, mode, limits) {
  const names = ['accounting', 'baseline', 'questions', 'ledger', ...(mode === 'replay' ? ['artifact'] : [])];
  const records = names.map((name, i) => ({ name, path: files[i] }));
  const captured = {}; let failure;
  try {
    let total = 0;
    for (const record of records) {
      canonicalParent(record.path);
      record.fd = fs.openSync(record.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      record.before = fs.fstatSync(record.fd, { bigint: true });
      if (!regular(record.before, limits[record.name])) refuse('CLI_INPUT_BOUND');
      if (!same(record.before, fs.lstatSync(record.path, { bigint: true }), STABLE)) refuse('CLI_INPUT_CHANGED');
      if (records.some(other => other !== record && other.before &&
          same(record.before, other.before, ['dev', 'ino']))) refuse('CLI_INPUT');
      total += Number(record.before.size);
    }
    if (total > (mode === 'replay' ? limits.replay_supplied_total : limits.supplied_total)) refuse('CLI_INPUT_BOUND');
    // Every descriptor/type/individual/aggregate admission precedes the first payload allocation/read.
    for (const record of records) {
      captured[record.name] = readBytes(record.fd, Number(record.before.size), 'CLI_READ');
      const after = fs.fstatSync(record.fd, { bigint: true });
      if (!regular(after, limits[record.name]) || !same(record.before, after, STABLE)) refuse('CLI_INPUT_CHANGED');
    }
    // Catch an earlier document changed while a later document was being captured, before closing any FD.
    for (const record of records) {
      canonicalParent(record.path);
      if (!same(record.before, fs.fstatSync(record.fd, { bigint: true }), STABLE) ||
          !same(record.before, fs.lstatSync(record.path, { bigint: true }), STABLE)) refuse('CLI_INPUT_CHANGED');
    }
  } catch (error) { failure = error instanceof Refusal ? error : new Refusal('CLI_INPUT'); }
  for (const record of records) failure = release(record, failure);
  if (failure) throw failure;
  return captured;
}

function privateDirectory(stat) {
  return stat.isDirectory() && typeof process.getuid === 'function' &&
    stat.uid === BigInt(process.getuid()) && (stat.mode & 0o777n) === 0o700n;
}

function parentGuard(parent, record) {
  if (fs.realpathSync(parent) !== parent) refuse('CLI_PARENT');
  const current = fs.lstatSync(parent, { bigint: true });
  if (!privateDirectory(current) || !same(record.before, current, IDENTITY)) refuse('CLI_PARENT');
  if (record.fd !== undefined) {
    const held = fs.fstatSync(record.fd, { bigint: true });
    if (!privateDirectory(held) || !same(record.before, held, IDENTITY)) refuse('CLI_PARENT');
  }
}

function outputGuard(file, before, size, completed = null) {
  const current = fs.lstatSync(file, { bigint: true });
  if (!current.isFile() || !same(before, current, IDENTITY) || current.nlink !== 1n ||
      current.size !== BigInt(size) || (current.mode & 0o777n) !== 0o600n ||
      (completed !== null && !same(completed, current, STABLE))) refuse('CLI_OUTPUT_CHANGED');
}

function writeArtifact(file, bytes, maximum) {
  if (!Buffer.isBuffer(bytes) || bytes.length > maximum) refuse('CLI_OUTPUT');
  const parent = dirname(file), directory = {}, output = {}; let failure;
  try {
    directory.fd = fs.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY |
      fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    directory.before = fs.fstatSync(directory.fd, { bigint: true });
    if (!privateDirectory(directory.before)) refuse('CLI_PARENT');
    parentGuard(parent, directory);
    // Do not pre-unlink or replace an existing entry. O_EXCL refuses files, symlinks and special entries.
    output.fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
    const before = fs.fstatSync(output.fd, { bigint: true });
    if (!before.isFile() || before.uid !== directory.before.uid || before.nlink !== 1n ||
        before.size !== 0n || (before.mode & 0o777n) !== 0o600n) refuse('CLI_OUTPUT');
    parentGuard(parent, directory); outputGuard(file, before, 0);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.writeSync(output.fd, bytes, offset, Math.min(65536, bytes.length - offset), offset);
      if (!Number.isSafeInteger(count) || count <= 0 || count > Math.min(65536, bytes.length - offset)) refuse('CLI_WRITE');
      offset += count;
    }
    try { fs.fsyncSync(output.fd); } catch { refuse('CLI_FLUSH'); }
    const written = fs.fstatSync(output.fd, { bigint: true });
    if (!same(before, written, [...IDENTITY, 'nlink']) || !regular(written, maximum) || written.size !== BigInt(bytes.length)) refuse('CLI_OUTPUT_CHANGED');
    const readback = readBytes(output.fd, bytes.length, 'CLI_READBACK');
    if (!readback.equals(bytes) || !same(written, fs.fstatSync(output.fd, { bigint: true }), STABLE)) refuse('CLI_READBACK');
    parentGuard(parent, directory); outputGuard(file, before, bytes.length, written);
    failure = release(output, failure);
    if (failure) throw failure;
    // The new parent entry needs its own durability step, after the file has closed successfully.
    try { fs.fsyncSync(directory.fd); } catch { refuse('CLI_FLUSH'); }
    parentGuard(parent, directory); outputGuard(file, before, bytes.length, written);
    failure = release(directory, failure);
    if (failure) throw failure;
    parentGuard(parent, directory); outputGuard(file, before, bytes.length, written);
  } catch (error) { failure = failure ?? (error instanceof Refusal ? error : new Refusal('CLI_OUTPUT')); }
  failure = release(output, failure);
  failure = release(directory, failure);
  if (failure) throw failure;
  // An uncertain created path is deliberately retained on every failure; no unlink/overwrite/retry.
}

function summary(mode, result, artifactBytes) {
  if (typeof result.artifact_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(result.artifact_sha256) ||
      result.selected_items !== 15) refuse('CLI_SCORING');
  const text = JSON.stringify({ mode, status: mode === 'score' ? 'saved-synthetic-attempt-scoring' : 'recomputed-synthetic-attempt-scoring',
    artifact_sha256: result.artifact_sha256, artifact_file_sha256: digest(artifactBytes), artifact_bytes: artifactBytes.length,
    selected_items: 15, purpose: 'synthetic-software-fixture', arm: 'closed', model_baseline: false,
    execution_authorized: false }) + '\n';
  if (Buffer.byteLength(text) > ATTEMPT_SCORING_CLI_STREAM_LIMITS.stdout) refuse('CLI_STDIO');
  return text;
}

/** Bounded result strings; main never writes stdout/stderr and replay never creates a path. */
export async function main(argv) {
  try {
    const { mode, root, files } = argumentsFor(argv);
    checkRoot(root);
    let core;
    try { core = await import('./attempt-scoring.mjs'); } catch { refuse('CLI_SOURCE'); }
    const captured = readSupplied(files, mode, core.ATTEMPT_SCORING_LIMITS);
    const inputs = { accounting: captured.accounting, baseline: captured.baseline, questions: captured.questions,
      ledger: captured.ledger, packets: null };
    let result;
    try {
      result = mode === 'score' ? core.scoreAttemptLedger(root, inputs) : core.replayAttemptScoring(root, inputs, captured.artifact);
    } catch { refuse('CLI_SCORING'); }
    const artifactBytes = mode === 'score' ? result.artifact_bytes : captured.artifact;
    const text = summary(mode, mode === 'score' ? { artifact_sha256: result.artifact.artifact_sha256,
      selected_items: result.artifact.summary.selected_items } : result, artifactBytes);
    if (mode === 'score') writeArtifact(files[4], artifactBytes, core.ATTEMPT_SCORING_LIMITS.artifact);
    return { exitCode: 0, stdout: text, stderr: '' };
  } catch (error) {
    const code = error instanceof Refusal && CODES.has(error.code) ? error.code : 'CLI_INPUT';
    return { exitCode: 1, stdout: '', stderr: `attempt-scoring-cli: ${code}\n` };
  }
}

function standard(fd, text, limit) {
  const bytes = Buffer.from(text); if (bytes.length > limit) refuse('CLI_STDIO');
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.writeSync(fd, bytes, offset, bytes.length - offset);
    if (!Number.isSafeInteger(count) || count <= 0 || count > bytes.length - offset) refuse('CLI_STDIO');
    offset += count;
  }
}

let entry = false;
try { entry = !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); }
catch { /* A library import is not a command. */ }
if (entry) {
  const result = await main(process.argv.slice(2)); process.exitCode = result.exitCode;
  try {
    standard(1, result.stdout, ATTEMPT_SCORING_CLI_STREAM_LIMITS.stdout);
    standard(2, result.stderr, ATTEMPT_SCORING_CLI_STREAM_LIMITS.stderr);
  } catch {
    process.exitCode = 1;
    try { standard(2, 'attempt-scoring-cli: CLI_STDIO\n', ATTEMPT_SCORING_CLI_STREAM_LIMITS.stderr); } catch { /* No echo/retry. */ }
  }
}
