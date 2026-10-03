import assert from 'node:assert/strict';
import fs from 'node:fs';
import child from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { canonicalJson } from '../../canonical-json.mjs';
import { createBaselineContract, projectQuestions, V0_DIRECTORY, V0_SHA256 } from './baseline-contract.mjs';
import { LEDGER_SCHEMA, prepareAttemptContract } from './attempt-accounting.mjs';
import { readDataset, sha256 } from './evidence.mjs';
import { stratifiedSample } from './eval.mjs';
import { ATTEMPT_SCORING_LIMITS, ATTEMPT_SCORING_SOURCE_FILES, scoreAttemptLedger } from './attempt-scoring.mjs';

const ROOT = fs.realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
const ENTRY = join(ROOT, 'scripts/datasets/filing-facts/attempt-scoring-cli.mjs');
const CORE_URL = pathToFileURL(join(ROOT, 'scripts/datasets/filing-facts/attempt-scoring.mjs')).href;
const BASELINE = createBaselineContract(ROOT), QUESTIONS = projectQuestions(ROOT, BASELINE);
const SAMPLE = stratifiedSample(readDataset(fs.readFileSync(join(ROOT, V0_DIRECTORY, 'filing-facts-v0.jsonl'))).items, 3, 20261001);
const bytes = value => Buffer.from(JSON.stringify(value) + '\n');
const unknownTime = () => ({ started_at: null, ended_at: null, duration_ms: null, unavailable_reason: 'synthetic clock unavailable' });

function documents() {
  const baseline = bytes(BASELINE), questions = bytes(QUESTIONS);
  const contract = prepareAttemptContract(ROOT, baseline, questions);
  const ledger = { schema: LEDGER_SCHEMA, purpose: 'synthetic-software-fixture', arm: 'closed',
    contract_sha256: contract.contract_sha256, question_projection_sha256: contract.questions.projection_sha256,
    source_contract_sha256: null, provider: 'synthetic-fixture', requested_model: 'fixture-model',
    generation_settings: { temperature: 0 }, time_basis: 'caller-observed-monotonic-ms',
    bounds: { attempts_per_item: 8, item_duration_ms: 30000 }, price_basis: null,
    response_pointers: { answer: '/answer', response_id: '/id', model: '/model',
      usage: { input_tokens: '/usage/input_tokens', output_tokens: '/usage/output_tokens' } },
    items: QUESTIONS.questions.map((question, i) => {
      const text = SAMPLE[i].answer.kind === 'not_reported' ? 'ANSWER: not reported' : `ANSWER: ${SAMPLE[i].answer.value}`;
      return { id: question.id, question_sha256: sha256(question.question), status: 'completed', error: null,
        declared_attempts: 1, final_attempt: 1, response_text: text, response_missing_reason: null, time: unknownTime(),
        attempts: [{ id: `cli-fixture-${i + 1}`, ordinal: 1, turn: 1, retry_of: null, status: 'response', http_status: 200,
          request_raw: JSON.stringify({ question: question.question }),
          response_raw: JSON.stringify({ id: `fixture-response-${i + 1}`, model: 'fixture-model', answer: text,
            usage: { input_tokens: 2, output_tokens: 1 } }), response_missing_reason: null,
          answer_text: text, answer_missing_reason: null, error: null, usage_unavailable_reason: null,
          time: unknownTime(), tool_traces: [] }] };
    }) };
  return { accounting: bytes(contract), baseline, questions, ledger: bytes(ledger) };
}

function fixture(t, supplied = documents()) {
  const folder = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'canli-attempt-cli-')));
  fs.chmodSync(folder, 0o700); t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const paths = ['accounting', 'baseline', 'questions', 'ledger'].map(name => join(folder, `${name}.json`));
  paths.forEach((path, i) => fs.writeFileSync(path, supplied[['accounting', 'baseline', 'questions', 'ledger'][i]], { mode: 0o600 }));
  const output = join(folder, 'artifact.json'), proof = join(folder, 'fault-proof.json'), foreign = join(folder, 'foreign-fd.txt');
  fs.writeFileSync(foreign, 'foreign descriptor must survive', { mode: 0o600 });
  return { folder, paths, output, proof, foreign, supplied, args: ['score', ROOT, ...paths, output] };
}

function terminal(result) {
  assert.equal(result.error, undefined, 'one bounded child must return a real terminal');
  assert.equal(result.signal, null); assert.ok(Number.isSafeInteger(result.pid) && result.pid > 0);
  assert.throws(() => process.kill(result.pid, 0), error => error.code === 'ESRCH', 'owned completed PID must be absent');
  return result;
}

function run(files, { args = files.args, entry = ENTRY, fault = null, replay = false } = {}) {
  if (fault) { files.proofOrdinal = (files.proofOrdinal ?? 0) + 1; files.proof = join(files.folder, `fault-proof-${files.proofOrdinal}.json`); }
  const argv = fault ? ['--import', 'data:text/javascript,' + encodeURIComponent(preload(files, fault, replay)), entry, ...args] : [entry, ...args];
  return terminal(child.spawnSync(process.execPath, argv, { encoding: 'utf8', timeout: 12000, killSignal: 'SIGKILL',
    maxBuffer: 8192, env: { PATH: process.env.PATH } }));
}

function success(result, mode = 'score') {
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  assert.ok(Buffer.byteLength(result.stdout) <= 4096);
  const value = JSON.parse(result.stdout);
  assert.equal(value.mode, mode); assert.equal(value.selected_items, 15);
  assert.equal(value.purpose, 'synthetic-software-fixture'); assert.equal(value.arm, 'closed');
  assert.equal(value.model_baseline, false); assert.equal(value.execution_authorized, false);
  assert.match(value.artifact_sha256, /^[0-9a-f]{64}$/); assert.match(value.artifact_file_sha256, /^[0-9a-f]{64}$/);
  return value;
}

function refusal(result, code) {
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.ok(Buffer.byteLength(result.stderr) <= 1024);
  assert.match(result.stderr, /^attempt-scoring-cli: CLI_[A-Z_]+\n$/);
  if (code) assert.equal(result.stderr, `attempt-scoring-cli: ${code}\n`);
  assert.ok(!result.stderr.includes('PRIVATE_BODY_SENTINEL'));
}

// Test observations use the same admitted FD for metadata and bytes, including mode preservation checks.
function fileSnapshot(path) {
  let fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    assert.ok(before.isFile() && before.size >= 0n && before.size <= 10n * 1024n * 1024n);
    const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, Math.min(65536, bytes.length - offset), offset);
      assert.ok(Number.isSafeInteger(count) && count > 0 && count <= Math.min(65536, bytes.length - offset));
      offset += count;
    }
    assert.equal(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length), 0);
    const after = fs.fstatSync(fd, { bigint: true });
    for (const key of ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs']) assert.equal(after[key], before[key]);
    return { bytes, mode: Number(after.mode) };
  } finally { const owned = fd; fd = undefined; fs.closeSync(owned); }
}
function snapshot(files) {
  return files.paths.map(fileSnapshot);
}
function unchanged(files, before) {
  files.paths.forEach((path, i) => {
    const after = fileSnapshot(path); assert.deepEqual(after.bytes, before[i].bytes); assert.equal(after.mode, before[i].mode);
  });
}
const readProof = files => JSON.parse(fs.readFileSync(files.proof));
const nativeInputs = files => ({ ...Object.fromEntries(['accounting', 'baseline', 'questions', 'ledger'].map((name, i) =>
  [name, fs.readFileSync(files.paths[i])])), packets: null });

// A test-only child preload: load the unchanged core first, then bind faults to actual admitted FDs.
// Its exit observer writes a separate owned proof; the product never writes this observer file.
function preload(files, fault, replay) {
  const config = { inputs: [...files.paths, ...(replay ? [files.output] : [])], output: files.output,
    parent: dirname(files.output), proof: files.proof, foreign: files.foreign, fault };
  return `
import fs from 'node:fs';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls';
import child from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
await import(${JSON.stringify(CORE_URL)});
const c = ${JSON.stringify(config)};
const original = Object.fromEntries(['openSync','closeSync','fstatSync','lstatSync','readSync','writeSync','fsyncSync',
  'writeFileSync','appendFileSync','truncateSync','unlinkSync','renameSync','fchmodSync'].map(name => [name, fs[name]]));
const held = new Map(); let foreign; let fired = false; let outputCreated = false;
const trace = { admitted: 0, reads: 0, firstReadAdmitted: null, allocations: 0, firstAllocationAdmitted: null, preAdmissionAllocations: 0,
  writes: 0, flushes: 0, directoryFlushes: 0, closeAttempts: {}, fired: false, armedWriteDenial: 0,
  writeDenialAttempts: 0, armedEffects: 0, effectAttempts: 0, unlinkAttempts: 0 };
const copy = (stat, updates) => Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, updates);
const forbidden = () => { trace.effectAttempts++; throw Error('synthetic effect denied'); };
globalThis.fetch = forbidden;
for (const [target, names] of [[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],
  [net.Socket.prototype,['connect']],[tls,['connect']],[child,['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']]])
  for (const name of names) target[name] = forbidden;
for (const call of [() => fetch('https://invalid.fixture'), () => http.get('https://invalid.fixture'),
  () => https.request('https://invalid.fixture'), () => net.connect(1), () => tls.connect(1),
  () => child.execFileSync('never-run-fixture')]) {
  try { call(); } catch {} trace.armedEffects++;
}
trace.effectAttempts = 0;
fs.openSync = (path, flags, ...rest) => {
  if (c.fault === 'write-denial' && typeof flags === 'number' &&
      ((flags & 3) !== 0 || (flags & fs.constants.O_CREAT) !== 0)) {
    trace.writeDenialAttempts++; throw Error('synthetic write denied');
  }
  const fd = original.openSync(path, flags, ...rest);
  if (c.inputs.includes(path)) { held.set(fd, 'input-' + c.inputs.indexOf(path)); trace.admitted++; }
  else if (path === c.output && (flags & fs.constants.O_CREAT)) { held.set(fd, 'output'); outputCreated = true; }
  else if (path === c.parent) held.set(fd, 'parent');
  return fd;
};
const alloc = Buffer.alloc;
Buffer.alloc = (...args) => {
  if ([...held.values()].some(label => label.startsWith('input-'))) {
    trace.allocations++; if (trace.firstAllocationAdmitted === null) trace.firstAllocationAdmitted = trace.admitted;
    if (trace.admitted < c.inputs.length) trace.preAdmissionAllocations++;
  }
  return alloc(...args);
};
fs.fstatSync = (fd, ...args) => {
  const stat = original.fstatSync(fd, ...args), label = held.get(fd);
  if (c.fault === 'input-metadata' && label === 'input-0' && trace.reads > 0) { trace.fired = true; return copy(stat, { mtimeNs: stat.mtimeNs + 1n }); }
  if (c.fault === 'foreign-parent' && label === 'parent') { trace.fired = true; return copy(stat, { uid: stat.uid + 1n }); }
  return stat;
};
fs.lstatSync = (path, ...args) => {
  const stat = original.lstatSync(path, ...args);
  if (c.fault === 'parent-after-create' && path === c.parent && outputCreated) {
    trace.fired = true; return copy(stat, { ino: stat.ino + 1n });
  }
  if (c.fault === 'post-readback-change' && path === c.output && fired)
    return copy(stat, { ctimeNs: stat.ctimeNs + 1n });
  return stat;
};
fs.readSync = (fd, buffer, offset, length, position) => {
  const label = held.get(fd);
  if (label?.startsWith('input-')) {
    trace.reads++; if (trace.firstReadAdmitted === null) trace.firstReadAdmitted = trace.admitted;
    if (c.fault === 'read-zero' && length > 1 && !fired) { fired = true; trace.fired = true; return 0; }
    if (c.fault === 'growth' && label === 'input-0' && !fired) { fired = true; trace.fired = true; original.appendFileSync(c.inputs[0], ' '); }
    if (c.fault === 'truncation' && label === 'input-0' && !fired) { fired = true; trace.fired = true; original.truncateSync(c.inputs[0], 1); }
    if (c.fault === 'earlier-change' && label === 'input-3' && !fired) { fired = true; trace.fired = true; original.appendFileSync(c.inputs[0], ' '); }
    if (c.fault === 'short-read') length = Math.min(length, 19);
  }
  const count = original.readSync(fd, buffer, offset, length, position);
  if (c.fault === 'readback-corrupt' && label === 'output' && count > 0 && !fired) {
    fired = true; trace.fired = true; buffer[offset] ^= 1;
  }
  return count;
};
fs.writeSync = (fd, buffer, offset, length, position) => {
  if (c.fault === 'write-denial' && fd !== 1 && fd !== 2) { trace.writeDenialAttempts++; throw Error('synthetic write denied'); }
  if (held.get(fd) === 'output') {
    trace.writes++;
    if (c.fault === 'write-zero') { trace.fired = true; return 0; }
    if (c.fault === 'partial-write') {
      if (trace.writes > 1) { trace.fired = true; throw Error('synthetic write fault'); }
      length = Math.min(length, 8);
    }
    if (c.fault === 'short-write') length = Math.min(length, 127);
  }
  return original.writeSync(fd, buffer, offset, length, position);
};
fs.writeFileSync = (...args) => {
  if (c.fault === 'write-denial') { trace.writeDenialAttempts++; throw Error('synthetic write denied'); }
  return original.writeFileSync(...args);
};
if (c.fault === 'write-denial') {
  try { fs.writeFileSync(c.output + '.denial-control', 'never written'); } catch { trace.armedWriteDenial++; }
  trace.writeDenialAttempts = 0;
}
fs.fsyncSync = fd => {
  const label = held.get(fd);
  if (label === 'output') { trace.flushes++; if (c.fault === 'file-flush') { trace.fired = true; throw Error('synthetic fsync fault'); } }
  if (label === 'parent') {
    trace.directoryFlushes++;
    if (c.fault === 'directory-flush') { trace.fired = true; throw Error('synthetic directory fsync fault'); }
    if (c.fault === 'post-readback-change' && !fired) {
      const changed = original.openSync(c.output, fs.constants.O_RDWR);
      try { original.writeSync(changed, Buffer.from('x'), 0, 1, 0); } finally { original.closeSync(changed); }
      fired = true; trace.fired = true;
    }
  }
  return original.fsyncSync(fd);
};
fs.closeSync = fd => {
  const label = held.get(fd);
  if (label) trace.closeAttempts[label] = (trace.closeAttempts[label] ?? 0) + 1;
  const target = c.fault === 'reader-close-reuse' ? 'input-0' : c.fault === 'writer-close-reuse' ? 'output' :
    c.fault === 'directory-close-reuse' ? 'parent' : null;
  if (label === target && !fired) {
    fired = true; trace.fired = true; original.closeSync(fd);
    foreign = original.openSync(c.foreign, fs.constants.O_RDONLY);
    trace.foreignFDReused = foreign === fd; throw Error('synthetic close after real close');
  }
  const value = original.closeSync(fd); held.delete(fd); return value;
};
fs.unlinkSync = () => { trace.unlinkAttempts++; throw Error('unlink denied'); };
fs.renameSync = () => { trace.unlinkAttempts++; throw Error('replacement denied'); };
fs.fchmodSync = () => { trace.unlinkAttempts++; throw Error('mode rewrite denied'); };
syncBuiltinESMExports();
process.on('exit', () => {
  if (foreign !== undefined) {
    try { trace.foreignFDStillOpen = original.fstatSync(foreign).isFile(); } catch { trace.foreignFDStillOpen = false; }
  }
  trace.outputCreated = outputCreated;
  // A saved convenience writer can still call patched fs methods internally. The separate
  // observer uses only captured native primitives, so replay's armed write denial stays intact.
  const body = Buffer.from(JSON.stringify(trace)); if (body.length > 4096) throw Error('observer bound');
  let proofFD = original.openSync(c.proof, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
    fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  try {
    let offset = 0;
    while (offset < body.length) {
      const count = original.writeSync(proofFD, body, offset, body.length - offset, offset);
      if (!Number.isSafeInteger(count) || count <= 0 || count > body.length - offset) throw Error('observer write');
      offset += count;
    }
    original.fsyncSync(proofFD);
  } finally { const owned = proofFD; proofFD = undefined; original.closeSync(owned); }
  if (foreign !== undefined && trace.foreignFDStillOpen) original.closeSync(foreign);
});
`;
}

function copiedRoot(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'canli-cli-source-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = new Set([...ATTEMPT_SCORING_SOURCE_FILES, ...Object.keys(BASELINE.context),
    ...Object.keys(V0_SHA256).map(name => `${V0_DIRECTORY}/${name}`)]);
  for (const path of paths) { fs.mkdirSync(dirname(join(root, path)), { recursive: true }); fs.copyFileSync(join(ROOT, path), join(root, path)); }
  return root;
}

test('attempt scoring CLI: actual score and replay preserve exact core bytes fifteen rows and unknown measurements', t => {
  const files = fixture(t), before = snapshot(files), expected = scoreAttemptLedger(ROOT, nativeInputs(files));
  const scored = success(run(files)), artifactBefore = fileSnapshot(files.output);
  assert.deepEqual(artifactBefore.bytes, expected.artifact_bytes);
  assert.equal(scored.artifact_sha256, expected.artifact.artifact_sha256); assert.equal(scored.artifact_file_sha256, sha256(expected.artifact_bytes));
  assert.equal(artifactBefore.mode & 0o777, 0o600); assert.equal(expected.artifact.rows.length, 15);
  assert.equal(expected.artifact.measurement_sha256, sha256(canonicalJson(expected.artifact.measurement)));
  assert.ok(JSON.stringify(expected.artifact.measurement).includes('null'));
  const replay = success(run(files, { args: ['replay', ...files.args.slice(1)] }), 'replay');
  assert.equal(replay.artifact_sha256, scored.artifact_sha256); assert.deepEqual(fileSnapshot(files.output), artifactBefore);
  unchanged(files, before);
});

test('attempt scoring CLI: ordinary and owned symlink entries have equal missing argument refusal and valid bytes', t => {
  const files = fixture(t), alias = join(files.folder, 'owned-cli-alias.mjs'); fs.symlinkSync(ENTRY, alias);
  refusal(run(files, { args: [] }), 'CLI_ARGUMENTS'); refusal(run(files, { args: [], entry: alias }), 'CLI_ARGUMENTS');
  const direct = run(files); success(direct);
  const alternate = join(files.folder, 'alternate.json'), args = [...files.args]; args[6] = alternate;
  const viaAlias = run(files, { args, entry: alias }); success(viaAlias); assert.equal(viaAlias.stdout, direct.stdout);
  assert.deepEqual(fs.readFileSync(alternate), fs.readFileSync(files.output));
  success(run(files, { args: ['replay', ...files.args.slice(1)], entry: alias }), 'replay');
});

test('attempt scoring CLI: an import defines main without invoking a command or writing an artifact', t => {
  const files = fixture(t);
  const code = `const module = await import(${JSON.stringify(pathToFileURL(ENTRY).href)}); console.log(typeof module.main);`;
  const result = terminal(child.spawnSync(process.execPath, ['--input-type=module', '--eval', code],
    { encoding: 'utf8', timeout: 12000, maxBuffer: 8192, env: { PATH: process.env.PATH } }));
  assert.equal(result.status, 0); assert.equal(result.stdout, 'function\n'); assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: missing extra and unknown positional commands refuse before supplied effects', t => {
  const files = fixture(t), before = snapshot(files);
  for (const args of [[], files.args.slice(0, -1), [...files.args, 'extra'], ['collect', ...files.args.slice(1)],
    ['--help'], ['score', '--source', ...files.args.slice(2)]]) refusal(run(files, { args }));
  unchanged(files, before); assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: relative unbounded aliased and control-character paths refuse before capture', t => {
  const files = fixture(t), before = snapshot(files);
  for (const bad of ['relative', '/'+ 'x'.repeat(4096), files.folder + '/../input', '/tmp/PRIVATE_BODY_SENTINEL\n']) {
    const args = [...files.args]; args[2] = bad; refusal(run(files, { args }), 'CLI_PATH');
  }
  const duplicate = [...files.args]; duplicate[3] = duplicate[2]; refusal(run(files, { args: duplicate }), 'CLI_PATH');
  const root = [...files.args]; root[1] = join(files.folder, 'missing-root'); refusal(run(files, { args: root }), 'CLI_ROOT');
  unchanged(files, before); assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: every input size admission precedes all payload reads on sparse oversized files', t => {
  for (const [index, name] of ['accounting', 'baseline', 'questions', 'ledger'].entries()) {
    const files = fixture(t); fs.truncateSync(files.paths[index], ATTEMPT_SCORING_LIMITS[name] + 1);
    refusal(run(files, { fault: 'observe' }), 'CLI_INPUT_BOUND');
    const proof = readProof(files); assert.equal(proof.reads, 0); assert.equal(proof.outputCreated, false);
    assert.ok(Object.values(proof.closeAttempts).every(count => count === 1)); assert.equal(fs.existsSync(files.output), false);
  }
});

test('attempt scoring CLI: replay admits all five files before reading and refuses oversized artifact without writes', t => {
  const files = fixture(t); success(run(files));
  fs.truncateSync(files.output, ATTEMPT_SCORING_LIMITS.artifact + 1);
  refusal(run(files, { args: ['replay', ...files.args.slice(1)], fault: 'write-denial', replay: true }), 'CLI_INPUT_BOUND');
  const proof = readProof(files); assert.equal(proof.admitted, 5); assert.equal(proof.reads, 0);
  assert.equal(proof.writeDenialAttempts, 0); assert.equal(proof.armedWriteDenial, 1);
});

test('attempt scoring CLI: exact individual ceilings and aggregate-safe input bytes have a real successful control', t => {
  const pad = (value, size) => Buffer.concat([value, Buffer.alloc(size - value.length, 0x20)]);
  const supplied = documents(); supplied.baseline = pad(supplied.baseline, ATTEMPT_SCORING_LIMITS.baseline);
  supplied.questions = pad(supplied.questions, ATTEMPT_SCORING_LIMITS.questions);
  const contract = prepareAttemptContract(ROOT, supplied.baseline, supplied.questions);
  supplied.accounting = pad(bytes(contract), ATTEMPT_SCORING_LIMITS.accounting);
  const ledger = JSON.parse(supplied.ledger); ledger.contract_sha256 = contract.contract_sha256;
  ledger.question_projection_sha256 = contract.questions.projection_sha256;
  supplied.ledger = pad(bytes(ledger), ATTEMPT_SCORING_LIMITS.ledger);
  const files = fixture(t, supplied); success(run(files, { fault: 'observe' }));
  const proof = readProof(files); assert.equal(proof.firstReadAdmitted, 4); assert.equal(proof.firstAllocationAdmitted, 4);
  assert.equal(proof.preAdmissionAllocations, 0);
  assert.ok(Object.values(supplied).reduce((sum, value) => sum + value.length, 0) <= ATTEMPT_SCORING_LIMITS.supplied_total);
  const artifact = JSON.parse(fs.readFileSync(files.output));
  for (const name of ['accounting', 'baseline', 'questions', 'ledger']) assert.equal(artifact.inputs[name].bytes, ATTEMPT_SCORING_LIMITS[name]);
});

test('attempt scoring CLI: bounded short reads complete original bytes after all four and five admissions', t => {
  const files = fixture(t), expected = scoreAttemptLedger(ROOT, nativeInputs(files));
  success(run(files, { fault: 'short-read' })); assert.deepEqual(fs.readFileSync(files.output), expected.artifact_bytes);
  assert.equal(readProof(files).firstReadAdmitted, 4);
  success(run(files, { args: ['replay', ...files.args.slice(1)], fault: 'short-read', replay: true }), 'replay');
  assert.equal(readProof(files).firstReadAdmitted, 5);
});

test('attempt scoring CLI: zero short read refuses without creating output and the target fault is reached', t => {
  const files = fixture(t); refusal(run(files, { fault: 'read-zero' }), 'CLI_READ');
  assert.equal(readProof(files).fired, true); assert.ok(readProof(files).reads > 0); assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: one overflow read detects input growth before scoring', t => {
  const files = fixture(t); refusal(run(files, { fault: 'growth' }), 'CLI_READ');
  assert.equal(readProof(files).fired, true); assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: truncation refuses on the admitted target descriptor', t => {
  const files = fixture(t); refusal(run(files, { fault: 'truncation' }), 'CLI_READ');
  assert.equal(readProof(files).fired, true); assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: same descriptor metadata mutation refuses with a positive payload read', t => {
  const files = fixture(t); refusal(run(files, { fault: 'input-metadata' }), 'CLI_INPUT_CHANGED');
  const proof = readProof(files); assert.ok(proof.reads > 0); assert.equal(proof.fired, true);
  assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: earlier input changes during later capture cannot escape the final all-FD recheck', t => {
  const files = fixture(t); refusal(run(files, { fault: 'earlier-change' }), 'CLI_INPUT_CHANGED');
  assert.equal(readProof(files).fired, true); assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: invalid UTF8 duplicate members and contradictory closed-arm JSON fail through the real core', t => {
  const duplicate = Buffer.from(documents().ledger.toString().replace('"purpose":"synthetic-software-fixture"',
    '"purpose":"synthetic-software-fixture","purpose":"synthetic-software-fixture"'));
  for (const invalid of [Buffer.concat([Buffer.from('PRIVATE_BODY_SENTINEL'), Buffer.from([0xff, 0xfe])]), duplicate,
    bytes({ ...JSON.parse(documents().ledger), arm: 'mcp' })]) {
    const files = fixture(t); fs.writeFileSync(files.paths[3], invalid);
    refusal(run(files), 'CLI_SCORING'); assert.equal(fs.existsSync(files.output), false);
  }
});

test('attempt scoring CLI: changed scoring source fails real replay after a valid alternate-root control', t => {
  const files = fixture(t), root = copiedRoot(t); success(run(files)); const artifact = fs.readFileSync(files.output);
  const args = ['replay', root, ...files.paths, files.output]; success(run(files, { args }), 'replay');
  fs.appendFileSync(join(root, ATTEMPT_SCORING_SOURCE_FILES[0]), '\n// changed fixture source\n');
  refusal(run(files, { args, fault: 'write-denial', replay: true }), 'CLI_SCORING');
  assert.deepEqual(fs.readFileSync(files.output), artifact); assert.equal(readProof(files).writeDenialAttempts, 0);
});

test('attempt scoring CLI: same-length dataset tampering fails real replay and inherited same-buffer binding', t => {
  const files = fixture(t), root = copiedRoot(t), path = join(root, V0_DIRECTORY, 'filing-facts-v0.jsonl');
  success(run(files)); const artifact = fs.readFileSync(files.output);
  const data = fs.readFileSync(path); data[100] ^= 1; fs.writeFileSync(path, data);
  const args = ['replay', root, ...files.paths, files.output];
  refusal(run(files, { args, fault: 'write-denial', replay: true }), 'CLI_SCORING');
  assert.deepEqual(fs.readFileSync(files.output), artifact); assert.equal(readProof(files).writeDenialAttempts, 0);
});

test('attempt scoring CLI: rehashed edited artifact is refused by full real replay without overwriting it', t => {
  const files = fixture(t); success(run(files)); const original = fs.readFileSync(files.output);
  for (const edit of [artifact => { artifact.rows[0].correct = !artifact.rows[0].correct; },
    artifact => { artifact.measurement.items[0].response_text = 'altered companion fixture'; }]) {
    const artifact = JSON.parse(original); edit(artifact); artifact.measurement_sha256 = sha256(canonicalJson(artifact.measurement));
    delete artifact.artifact_sha256; artifact.artifact_sha256 = sha256(canonicalJson(artifact));
    const edited = bytes(artifact); fs.writeFileSync(files.output, edited);
    refusal(run(files, { args: ['replay', ...files.args.slice(1)], fault: 'write-denial', replay: true }), 'CLI_SCORING');
    assert.deepEqual(fs.readFileSync(files.output), edited); assert.equal(readProof(files).writeDenialAttempts, 0);
  }
});

test('attempt scoring CLI: existing output bytes and mode are preserved with no successful acknowledgment', t => {
  const files = fixture(t); fs.writeFileSync(files.output, 'original private artifact', { mode: 0o640 });
  const before = fileSnapshot(files.output);
  refusal(run(files), 'CLI_OUTPUT'); assert.deepEqual(fileSnapshot(files.output), before);
});

test('attempt scoring CLI: output symlink is refused and its target bytes and mode remain intact', t => {
  const files = fixture(t); fs.symlinkSync(files.foreign, files.output); const before = fileSnapshot(files.foreign);
  refusal(run(files), 'CLI_OUTPUT'); assert.ok(fs.lstatSync(files.output).isSymbolicLink());
  assert.deepEqual(fileSnapshot(files.foreign), before);
});

test('attempt scoring CLI: public output parent is refused after valid computation with no chmod or artifact', t => {
  const files = fixture(t), before = snapshot(files); fs.chmodSync(files.folder, 0o755);
  refusal(run(files), 'CLI_PARENT'); assert.equal(fs.statSync(files.folder).mode & 0o777, 0o755);
  unchanged(files, before); assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: foreign owner of the admitted parent descriptor refuses before creation', t => {
  const files = fixture(t); refusal(run(files, { fault: 'foreign-parent' }), 'CLI_PARENT');
  assert.equal(readProof(files).fired, true); assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: symlink and nonregular supplied inputs are rejected before payload reads', t => {
  const files = fixture(t); fs.unlinkSync(files.paths[0]); fs.symlinkSync(files.foreign, files.paths[0]);
  refusal(run(files, { fault: 'observe' }), 'CLI_INPUT'); assert.equal(readProof(files).reads, 0);
  fs.unlinkSync(files.paths[0]); fs.mkdirSync(files.paths[0]);
  refusal(run(files, { fault: 'observe' }), 'CLI_INPUT_BOUND'); assert.equal(readProof(files).reads, 0); assert.equal(fs.existsSync(files.output), false);
});

test('attempt scoring CLI: FIFO input and output refusal return actual bounded terminals without opening a stream', t => {
  const files = fixture(t), fifo = join(files.folder, 'owned.fifo');
  const created = terminal(child.spawnSync('mkfifo', [fifo], { encoding: 'utf8', timeout: 2000, maxBuffer: 8192 }));
  assert.equal(created.status, 0); const args = [...files.args]; args[2] = fifo;
  refusal(run(files, { args, fault: 'observe' }), 'CLI_INPUT_BOUND'); assert.equal(readProof(files).reads, 0);
  const output = [...files.args]; output[6] = fifo; refusal(run(files, { args: output }), 'CLI_OUTPUT'); assert.ok(fs.lstatSync(fifo).isFIFO());
});

test('attempt scoring CLI: short writes complete exact bytes with file and directory durability positive controls', t => {
  const files = fixture(t), expected = scoreAttemptLedger(ROOT, nativeInputs(files));
  success(run(files, { fault: 'short-write' })); assert.deepEqual(fs.readFileSync(files.output), expected.artifact_bytes);
  const proof = readProof(files); assert.ok(proof.writes > 1); assert.equal(proof.flushes, 1); assert.equal(proof.directoryFlushes, 1);
  assert.equal(proof.closeAttempts.output, 1); assert.equal(proof.closeAttempts.parent, 1); assert.equal(proof.unlinkAttempts, 0);
});

test('attempt scoring CLI: zero write retains the exclusively created empty output and never unlinks or retries', t => {
  const files = fixture(t); refusal(run(files, { fault: 'write-zero' }), 'CLI_WRITE');
  assert.equal(fs.statSync(files.output).size, 0); const proof = readProof(files); assert.equal(proof.fired, true);
  assert.equal(proof.writes, 1); assert.equal(proof.unlinkAttempts, 0); assert.equal(proof.closeAttempts.output, 1);
});

test('attempt scoring CLI: partial write failure retains the exact partial file with original inputs unchanged', t => {
  const files = fixture(t), before = snapshot(files), expected = scoreAttemptLedger(ROOT, nativeInputs(files));
  refusal(run(files, { fault: 'partial-write' }), 'CLI_OUTPUT');
  assert.deepEqual(fs.readFileSync(files.output), expected.artifact_bytes.subarray(0, 8)); unchanged(files, before);
  const proof = readProof(files); assert.equal(proof.fired, true); assert.equal(proof.writes, 2); assert.equal(proof.unlinkAttempts, 0);
});

test('attempt scoring CLI: file fsync failure leaves created bytes retained and does not acknowledge or unlink', t => {
  const files = fixture(t), expected = scoreAttemptLedger(ROOT, nativeInputs(files));
  refusal(run(files, { fault: 'file-flush' }), 'CLI_FLUSH'); assert.deepEqual(fs.readFileSync(files.output), expected.artifact_bytes);
  assert.equal(readProof(files).fired, true); assert.equal(readProof(files).unlinkAttempts, 0);
});

test('attempt scoring CLI: mismatching same-FD readback fails before success while retaining the explicit file', t => {
  const files = fixture(t), expected = scoreAttemptLedger(ROOT, nativeInputs(files));
  refusal(run(files, { fault: 'readback-corrupt' }), 'CLI_READBACK'); assert.deepEqual(fs.readFileSync(files.output), expected.artifact_bytes);
  assert.equal(readProof(files).fired, true); assert.equal(readProof(files).directoryFlushes, 0);
});

test('attempt scoring CLI: parent path identity uncertainty after creation retains an empty artifact', t => {
  const files = fixture(t); refusal(run(files, { fault: 'parent-after-create' }), 'CLI_PARENT');
  assert.equal(fs.statSync(files.output).size, 0); const proof = readProof(files); assert.equal(proof.fired, true);
  assert.equal(proof.outputCreated, true); assert.equal(proof.writes, 0); assert.equal(proof.unlinkAttempts, 0);
});

test('attempt scoring CLI: directory fsync failure cannot acknowledge a fully saved but uncertain entry', t => {
  const files = fixture(t), expected = scoreAttemptLedger(ROOT, nativeInputs(files));
  refusal(run(files, { fault: 'directory-flush' }), 'CLI_FLUSH'); assert.deepEqual(fs.readFileSync(files.output), expected.artifact_bytes);
  const proof = readProof(files); assert.equal(proof.closeAttempts.output, 1); assert.equal(proof.directoryFlushes, 1); assert.equal(proof.unlinkAttempts, 0);
});

test('attempt scoring CLI: same-size mutation after readback fails the final named file time guard', t => {
  const files = fixture(t), expected = scoreAttemptLedger(ROOT, nativeInputs(files));
  refusal(run(files, { fault: 'post-readback-change' }), 'CLI_OUTPUT_CHANGED');
  const actual = fs.readFileSync(files.output); assert.equal(actual.length, expected.artifact_bytes.length);
  assert.notDeepEqual(actual, expected.artifact_bytes); const proof = readProof(files);
  assert.equal(proof.fired, true); assert.equal(proof.closeAttempts.output, 1); assert.equal(proof.directoryFlushes, 1);
  assert.equal(proof.unlinkAttempts, 0);
});

test('attempt scoring CLI: reader close-after-close failure never retries or closes the proven reused foreign FD', t => {
  const files = fixture(t), before = snapshot(files); refusal(run(files, { fault: 'reader-close-reuse' }), 'CLI_CLOSE');
  const proof = readProof(files); assert.equal(proof.fired, true); assert.equal(proof.foreignFDReused, true);
  assert.equal(proof.foreignFDStillOpen, true); assert.equal(proof.closeAttempts['input-0'], 1);
  assert.equal(fs.existsSync(files.output), false); unchanged(files, before);
});

test('attempt scoring CLI: writer close-after-close failure retains bytes and the foreign reused FD without false success', t => {
  const files = fixture(t), expected = scoreAttemptLedger(ROOT, nativeInputs(files));
  refusal(run(files, { fault: 'writer-close-reuse' }), 'CLI_CLOSE'); const proof = readProof(files);
  assert.equal(proof.foreignFDReused, true); assert.equal(proof.foreignFDStillOpen, true); assert.equal(proof.closeAttempts.output, 1);
  assert.equal(proof.directoryFlushes, 0); assert.equal(proof.unlinkAttempts, 0); assert.deepEqual(fs.readFileSync(files.output), expected.artifact_bytes);
});

test('attempt scoring CLI: directory close ambiguity also releases numeric ownership before its sole attempt', t => {
  const files = fixture(t); refusal(run(files, { fault: 'directory-close-reuse' }), 'CLI_CLOSE');
  const proof = readProof(files); assert.equal(proof.foreignFDReused, true); assert.equal(proof.foreignFDStillOpen, true);
  assert.equal(proof.closeAttempts.parent, 1); assert.equal(proof.unlinkAttempts, 0); assert.ok(fs.statSync(files.output).size > 0);
});

test('attempt scoring CLI: replay reaches armed write denial but performs no filesystem writes or replacements', t => {
  const files = fixture(t); success(run(files)); const artifact = fs.readFileSync(files.output), before = snapshot(files);
  success(run(files, { args: ['replay', ...files.args.slice(1)], fault: 'write-denial', replay: true }), 'replay');
  const proof = readProof(files); assert.equal(proof.armedWriteDenial, 1); assert.equal(proof.writeDenialAttempts, 0);
  assert.equal(proof.outputCreated, false); assert.equal(proof.unlinkAttempts, 0);
  unchanged(files, before); assert.deepEqual(fs.readFileSync(files.output), artifact);
});

test('attempt scoring CLI: real score and replay do not invoke positively armed network or subprocess functions', t => {
  const files = fixture(t); success(run(files, { fault: 'observe' }));
  assert.equal(readProof(files).armedEffects, 6); assert.equal(readProof(files).effectAttempts, 0);
  success(run(files, { args: ['replay', ...files.args.slice(1)], fault: 'observe', replay: true }), 'replay');
  assert.equal(readProof(files).armedEffects, 6); assert.equal(readProof(files).effectAttempts, 0);
});

test('attempt scoring CLI: core encoded artifact capacity refusal precedes creating the requested output', t => {
  const supplied = documents(), ledger = JSON.parse(supplied.ledger);
  for (const item of ledger.items) {
    const answer = 'x'.repeat(36000); item.response_text = answer; item.attempts[0].answer_text = answer;
    const raw = JSON.parse(item.attempts[0].response_raw); raw.answer = answer; item.attempts[0].response_raw = JSON.stringify(raw);
  }
  supplied.ledger = bytes(ledger); const files = fixture(t, supplied);
  refusal(run(files), 'CLI_SCORING'); assert.equal(fs.existsSync(files.output), false);
});
