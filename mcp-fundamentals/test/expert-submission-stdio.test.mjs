import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  EXPERT_STDIO_LIMITS as LIMITS, EXPERT_TOOL, ExpertStdioError, createWorkScope,
  captureExpertArguments, executeExpertSubmission, createExpertNativeWriter,
  createExpertDiagnostics, ExpertFrameBuffer, createExpertSubmissionEndpoint,
} from '../examples/expert-submission-stdio.mjs';
import { reconcileExpertSubmissions } from '../../scripts/datasets/filing-facts/expert-submission-audit.mjs';
import { filledPacket } from '../../js/annotate-core.js';
import { packetDigest } from '../../scripts/datasets/filing-facts/agreement.mjs';
import { contentHash } from '../../scripts/canonical-json.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value));
const clone = value => JSON.parse(JSON.stringify(value));
const publicJson = value => JSON.parse(JSON.stringify(value));
const entry = fileURLToPath(new URL('../examples/expert-submission-stdio.mjs', import.meta.url));
const choices = { question_clear: ['yes', 'no'], answer_matches_filing: ['yes', 'no', 'cannot_find'], citation_correct: ['yes', 'no'] };
function setup(n = 3, suppliedGold) {
  const gold = suppliedGold ? JSON.parse(suppliedGold) : {
    schema: 'canli.filing-facts-gold-packet.v0', guidelines: 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md',
    judgements: clone(choices), annotator: '', labels: Array.from({ length: n }, (_, i) => ({
      id: 'synthetic-stdio-' + i, template: 'lookup', company: 'SYNTHETIC SOFTWARE FIXTURE COMPANY',
      question: 'Synthetic question ' + i + '?', answer: String(i + 1) + ' synthetic USD',
      filings: ['https://www.sec.gov/Archives/edgar/data/0/synthetic-stdio-' + i + '/'],
      question_clear: '', answer_matches_filing: '', citation_correct: '', notes: '',
    })),
  };
  const rawGold = suppliedGold ?? jsonBytes(gold); const packetSha = packetDigest(gold);
  const intake = { schema: 'canli.filing-facts-expert-intake.v1', packet_sha256: packetSha,
    roles: ['reviewer_a', 'reviewer_b', 'adjudicator'].map(role => ({
      role, handle: 'synthetic-stdio-' + role, aliases: [], affiliations: null, conflicts: null,
      identity_evidence_ids: [], independence_evidence_ids: [], qualifications: [],
    })), sources: [] };
  return {
    gold, rawGold, intake, evidenceInventory: { schema: 'canli.filing-facts-expert-evidence.v1', evidence: [] }, evidence: [],
    intakeSettings: { schema: 'canli.filing-facts-expert-settings.v1', packet_sha256: packetSha, prepared_on: '2026-10-04',
      required_uses: ['human_review'], implementation_source_sha256: null },
    submissionInventory: { schema: 'canli.filing-facts-expert-submission-inventory.v1', packet_sha256: packetSha, submissions: [] },
    submissions: [],
    auditSettings: { schema: 'canli.filing-facts-expert-submission-settings.v1', packet_sha256: packetSha, implementation_source_sha256: null },
  };
}
function submit(s, role, mutate = () => {}) {
  const handle = s.intake.roles.find(row => row.role === role).handle;
  const answers = Object.fromEntries(s.gold.labels.map(row => [row.id, {
    question_clear: 'yes', answer_matches_filing: 'yes', citation_correct: 'yes', notes: '',
  }]));
  const packet = filledPacket(s.gold, answers, handle, s.auditSettings.packet_sha256); mutate(packet);
  const raw = jsonBytes(packet); s.submissions.push(raw);
  s.submissionInventory.submissions.push({ role, declared_handle: handle, packet_sha256: s.auditSettings.packet_sha256,
    expected_sha256: sha(raw), expected_bytes: raw.length });
  return s;
}
function coreArguments(s) {
  return [s.rawGold, sha(s.rawGold), jsonBytes(s.intake), jsonBytes(s.evidenceInventory), s.evidence,
    jsonBytes(s.intakeSettings), jsonBytes(s.submissionInventory), s.submissions, jsonBytes(s.auditSettings)];
}
function wireArguments(s = setup()) {
  const a = coreArguments(s); const encoded = bytes => bytes.toString('base64');
  return {
    gold_base64: encoded(a[0]), expected_gold_raw_sha256: a[1], intake_base64: encoded(a[2]),
    evidence_inventory_base64: encoded(a[3]), evidence_base64: a[4].map(encoded), intake_settings_base64: encoded(a[5]),
    submission_inventory_base64: encoded(a[6]), submission_base64: a[7].map(encoded), audit_settings_base64: encoded(a[8]),
  };
}
function report(s = setup()) { return publicJson(reconcileExpertSubmissions(...coreArguments(s))); }
function payload(result) {
  assert.equal(result.isError, undefined);
  assert.equal(result.content.length, 1); assert.equal(result.content[0].type, 'text');
  const parsed = JSON.parse(result.content[0].text); assert.deepEqual(result.structuredContent, parsed);
  assert.equal(parsed.content_hash, contentHash(parsed, createHash)); return parsed;
}
function refusal(result, code) {
  assert.equal(result.isError, true); assert.equal(result.structuredContent, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.refusalBytes);
  const error = JSON.parse(result.content[0].text).error;
  if (code) assert.equal(error.code, code); return error;
}
function unknown(value) {
  for (const v of Object.values(value.established)) assert.equal(v, null);
  assert.equal(value.syntactic_agreement.verified_expert_agreement, null);
  assert.equal(value.adjudication.expert_adjudication, null);
  assert.equal(value.adjudication.decisions_created_n, 0); assert.deepEqual(value.adjudication.blank_submission.decisions, []);
  assert.equal(value.implementation.declared_module_sha256_verified, false);
  assert.equal(value.implementation.dependency_source_pins_verified, false);
  assert.equal(Object.hasOwn(value.implementation, 'runtime_identity_verified'), false);
  for (const row of value.role_coverage) for (const key of ['authenticated_human', 'task_expertise_verified', 'actual_independence_verified']) assert.equal(row[key], null);
}
function beforeDecode(value, code) {
  let decoded = 0; let called = 0;
  const result = executeExpertSubmission(value, {
    decode: text => { decoded++; return Buffer.from(text, 'base64'); },
    kernel: (...args) => { called++; return reconcileExpertSubmissions(...args); },
  });
  refusal(result, code); assert.equal(decoded, 0); assert.equal(called, 0); return result;
}
class Output extends EventEmitter {
  constructor(behavior = () => true) { super(); this.frames = []; this.behavior = behavior; }
  write(frame) { this.frames.push(frame); return this.behavior(frame); }
}
function clockScope() {
  const time = { now: 0 }; const scope = createWorkScope({ clock: () => time.now }); return { time, scope };
}
function sizedArguments() {
  const value = wireArguments(); const base64 = n => Buffer.alloc(n).toString('base64');
  for (const key of ['gold_base64', 'intake_base64', 'evidence_inventory_base64', 'intake_settings_base64', 'submission_inventory_base64', 'audit_settings_base64']) value[key] = base64(1);
  return { value, base64 };
}
function readSnapshot(filename, cap) {
  let fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
  try {
    const initial = fs.fstatSync(fd); assert.ok(initial.isFile() && initial.size <= cap);
    const buffer = Buffer.alloc(initial.size + 1); let total = 0;
    while (total < buffer.length) {
      const read = fs.readSync(fd, buffer, total, buffer.length - total, null);
      if (!read) break; total += read;
    }
    const after = fs.fstatSync(fd); const post = fs.lstatSync(filename);
    for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) assert.equal(after[key], initial[key]);
    for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) assert.equal(post[key], after[key]);
    assert.equal(total, initial.size);
    const owned = fd; fd = undefined; fs.closeSync(owned); return Buffer.from(buffer.subarray(0, total));
  } finally { if (fd !== undefined) { const owned = fd; fd = undefined; fs.closeSync(owned); } }
}
function boundedPromise(value, milliseconds) {
  let timer;
  return Promise.race([Promise.resolve(value), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('OWNED_WORKFLOW_DEADLINE')), Math.max(1, milliseconds));
  })]).finally(() => clearTimeout(timer));
}
function ownedAbsent(pid) {
  try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
}
const guardianSource = [
  "import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls'; import child from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';",
  "const deny = () => { throw new Error('OFFLINE_NETWORK_OR_NESTED_CHILD_DENIED'); };",
  'http.request = http.get = https.request = https.get = net.connect = net.createConnection = tls.connect = deny;',
  'net.Socket.prototype.connect = deny; globalThis.fetch = deny;',
  'child.spawn = child.spawnSync = child.exec = child.execSync = child.execFile = child.execFileSync = child.fork = deny;',
  'syncBuiltinESMExports();',
].join('\n');
let actualEntries = 0;
/** The ONLY lexical SDK child-launch site; called exactly once by each of three named tests. */
async function ownedWorkflow(kind) {
  assert.ok(++actualEntries <= 3, 'no fourth actual SDK child entry');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canli-expert-stdio-')); fs.chmodSync(directory, 0o700);
  const guard = path.join(directory, 'offline-guard.mjs'); fs.writeFileSync(guard, guardianSource, { flag: 'wx', mode: 0o600 });
  assert.equal(readSnapshot(guard, 8192).toString(), guardianSource);
  let target = entry;
  if (kind === 'symlink') { target = path.join(directory, 'expert-absolute-alias.mjs'); fs.symlinkSync(entry, target); assert.ok(path.isAbsolute(target)); }
  const s = submit(submit(setup(), 'reviewer_a'), 'reviewer_b'); const args = wireArguments(s); const expected = report(s);
  const wire = []; let stderrBytes = 0; let child; let pid; let observedExit = false; let closing;
  const scope = createWorkScope(); const started = scope.started;
  const abort = new AbortController(); scope.bindSignal(abort.signal);
  const transport = new StdioClientTransport({
    command: process.execPath, args: ['--import', guard, target], cwd: directory, stderr: 'pipe', maxBufferSize: LIMITS.responseFrameBytes,
  });
  const client = new Client({ name: 'synthetic-expert-submission-test', version: '0.0.0' }, {
    versionNegotiation: { mode: 'legacy' }, inputRequired: { autoFulfill: false },
  });
  transport.stderr.on('data', chunk => {
    if (chunk.length > LIMITS.stderrBytes - stderrBytes) { stderrBytes = LIMITS.stderrBytes + 1; abort.abort(); }
    else stderrBytes += chunk.length;
  });
  const originalStart = transport.start.bind(transport);
  transport.start = async () => {
    scope.observe(); await originalStart(); scope.observe();
    child = transport._process; pid = child?.pid;
    assert.ok(child && Number.isSafeInteger(pid) && pid > 1);
    child.once('exit', () => { observedExit = true; });
    const sender = createExpertNativeWriter(child.stdin, {
      frameBytes: LIMITS.requestFrameBytes,
      serialize: message => { const json = JSON.stringify(message); wire.push(json + '\n'); return json; },
    });
    transport.send = message => sender.send(message, scope);
  };
  const closeOnce = () => {
    if (!closing) closing = Promise.resolve(kind === 'bad-frame' ? transport.close() : client.close());
    return closing;
  };
  let workEnd; let closeStart;
  try {
    if (kind === 'bad-frame') {
      await boundedPromise(transport.start(), scope.remaining()); scope.observe();
      const bad = Buffer.from('{"jsonrpc":"2.0","id":1,"method":"secret-invalid" INVALID_PRIVATE_MARKER}\n');
      assert.ok(bad.length < LIMITS.requestFrameBytes); child.stdin.write(bad);
      await boundedPromise(new Promise(resolve => {
        if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once('exit', resolve);
      }), scope.remaining());
      scope.observe(); assert.equal(wire.length, 0);
    } else {
      await boundedPromise(client.connect(transport), scope.remaining()); scope.observe();
      const listed = await boundedPromise(client.listTools(), scope.remaining()); scope.observe();
      assert.equal(listed.tools.length, 1); assert.deepEqual(listed.tools[0], publicJson(EXPERT_TOOL));
      const outcome = await boundedPromise(client.callTool({ name: EXPERT_TOOL.name, arguments: args }, {
        toolDefinition: listed.tools[0], signal: abort.signal, timeout: Math.max(1, scope.remaining()),
      }), scope.remaining()); scope.observe();
      // Locked legacy callTool returns the complete result itself, not the
      // wire codec's internal kind/result wrapper.
      assert.ok(!Object.hasOwn(outcome, 'resultType') || outcome.resultType === 'complete');
      assert.deepEqual(payload(outcome), expected); unknown(outcome.structuredContent);
      const requests = wire.map(frame => JSON.parse(frame));
      assert.equal(requests.filter(row => row.method === 'initialize').length, 1);
      assert.equal(requests.filter(row => row.method === 'tools/list').length, 1);
      assert.equal(requests.filter(row => row.method === 'tools/call').length, 1);
      assert.equal(requests.filter(row => row.method === 'server/discover').length, 0);
      assert.equal(requests.filter(row => row.method === 'tools/call')[0].params.name, EXPERT_TOOL.name);
      for (const frame of wire) assert.ok(Buffer.byteLength(frame) <= LIMITS.requestFrameBytes);
    }
    scope.observe(); assert.ok(stderrBytes <= LIMITS.stderrBytes);
  } finally {
    workEnd = performance.now(); closeStart = workEnd; if (!abort.signal.aborted) abort.abort();
    const reserve = Math.min(LIMITS.closureMs, LIMITS.totalMs - (closeStart - started));
    await boundedPromise(closeOnce(), reserve);
    if (child && !observedExit && child.exitCode === null && child.signalCode === null) {
      await boundedPromise(new Promise(resolve => child.once('exit', resolve)), Math.min(LIMITS.closureMs - (performance.now() - closeStart), LIMITS.totalMs - (performance.now() - started)));
    }
    assert.ok(child && (observedExit || child.exitCode !== null || child.signalCode !== null), 'same captured child terminal required');
    assert.equal(ownedAbsent(pid), true, 'captured PID absence required; nullable SDK getter is insufficient');
    const ended = performance.now();
    assert.ok(workEnd - started <= LIMITS.workMs); assert.ok(ended - closeStart <= LIMITS.closureMs); assert.ok(ended - started <= LIMITS.totalMs);
    assert.ok(stderrBytes <= LIMITS.stderrBytes); scope.dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('expert stdio: one direct legacy SDK call returns the complete core report and known child closure', { timeout: 21000 }, async () => {
  await ownedWorkflow('direct');
});
test('expert stdio: one absolute symlink SDK entry preserves report identity and known child closure', { timeout: 21000 }, async () => {
  await ownedWorkflow('symlink');
});
test('expert stdio: third owned SDK entry closes malformed private input without a tool dispatch or retry', { timeout: 21000 }, async () => {
  await ownedWorkflow('bad-frame');
});
test('expert stdio: importing the module and constructing an inert endpoint emit no protocol data', async () => {
  const output = new Output(); const stderr = new Output(); const input = new PassThrough();
  const endpoint = createExpertSubmissionEndpoint({ input, output, stderr });
  assert.equal(endpoint.transport._started, false); assert.equal(output.frames.length, 0); assert.equal(stderr.frames.length, 0);
  assert.equal(actualEntries, 3); await endpoint.transport.close(); input.destroy();
});
test('expert stdio: delivered blank50 bytes retain100 assignments and every missing role and pair', () => {
  const raw = readSnapshot(fileURLToPath(new URL('../../public/datasets/filing-facts/v0/gold-packet-v0.json', import.meta.url)), LIMITS.goldBytes);
  assert.equal(sha(raw), '91c6f960e34509653800a4cda81bd0632dd58c889ee78eb6461a985765500413');
  const s = setup(50, raw); const actual = payload(executeExpertSubmission(wireArguments(s)));
  assert.deepEqual(actual, report(s)); assert.equal(actual.coverage.selected_n, 50);
  assert.equal(actual.coverage.required_item_assignments_n, 100); assert.equal(actual.adjudication.item_tasks.length, 50);
  assert.deepEqual(actual.coverage.absent_role_submissions, ['reviewer_a', 'reviewer_b']);
  assert.equal(actual.preparation.bindings.gold.original_base64, raw.toString('base64')); unknown(actual);
});
test('expert stdio: one absent role keeps the complete selected denominator and original returned bytes', () => {
  const s = submit(setup(), 'reviewer_b'); const actual = payload(executeExpertSubmission(wireArguments(s)));
  assert.deepEqual(actual, report(s)); assert.equal(actual.coverage.selected_n, 3);
  assert.equal(actual.submissions[0].packet, null); assert.equal(actual.role_coverage[0].missing_judgement_fields_n, 9);
  assert.equal(actual.submissions[1].binding.original_base64, s.submissions[0].toString('base64')); unknown(actual);
});
test('expert stdio: partial fields and missing required notes retain each task and per-field missing coverage', () => {
  const s = submit(submit(setup(), 'reviewer_a', p => {
    p.labels[0].question_clear = ''; p.labels[1].answer_matches_filing = 'cannot_find'; p.labels[1].notes = '';
  }), 'reviewer_b');
  const actual = payload(executeExpertSubmission(wireArguments(s))); assert.deepEqual(actual, report(s));
  assert.equal(actual.coverage.complete_syntactic_pairs_n, 1);
  assert.equal(actual.coverage.per_field.question_clear.pair_missing_n, 1);
  assert.ok(actual.adjudication.item_tasks[1].missing_fields[0].fields.includes('notes')); unknown(actual);
});
test('expert stdio: syntactically complete fictional returns establish no expert agreement or adjudication', () => {
  const s = submit(submit(setup(), 'reviewer_a'), 'reviewer_b'); const actual = payload(executeExpertSubmission(wireArguments(s)));
  assert.deepEqual(actual, report(s)); assert.equal(actual.coverage.complete_syntactic_pairs_n, 3); unknown(actual);
});
test('expert stdio: complete escape-heavy notes survive both public copies and the original raw bindings', () => {
  const notes = ('"\\' + String.fromCharCode(0)).repeat(256);
  const s = submit(submit(setup(), 'reviewer_a', p => { p.labels[0].notes = notes; }), 'reviewer_b', p => { p.labels[1].notes = notes; });
  const result = executeExpertSubmission(wireArguments(s)); const actual = payload(result); assert.deepEqual(actual, report(s));
  assert.equal(actual.submissions[0].packet.labels[0].notes, notes);
  assert.equal(actual.submissions[0].binding.original_base64, s.submissions[0].toString('base64'));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) > 2 * Buffer.byteLength(result.content[0].text)); unknown(actual);
});
test('expert stdio: caller64 and null source declarations remain unverified in the unchanged full report', () => {
  for (const declaration of [null, 'b'.repeat(64)]) {
    const s = setup(); s.intakeSettings.implementation_source_sha256 = declaration; s.auditSettings.implementation_source_sha256 = declaration;
    const actual = payload(executeExpertSubmission(wireArguments(s)));
    assert.equal(actual.implementation.declared_module_sha256, declaration); unknown(actual);
  }
});
test('expert stdio: primitive SHA arrays boxes uppercase and end suffixes stop before decode or kernel', () => {
  for (const value of [['a'.repeat(64)], new String('a'.repeat(64)), 'A'.repeat(64), 'a'.repeat(64) + '\n', 'a'.repeat(64) + '\u2028', null]) {
    const args = wireArguments(); args.expected_gold_raw_sha256 = value; beforeDecode(args, 'EXPECTED_SHA');
  }
});
test('expert stdio: extra missing symbol and inherited argument keys stop before decode', () => {
  const extra = wireArguments(); extra.extra_private = 'PRIVATE'; beforeDecode(extra, 'ARGUMENTS');
  const missing = wireArguments(); delete missing.audit_settings_base64; beforeDecode(missing, 'ARGUMENTS');
  const symbol = wireArguments(); symbol[Symbol('secret')] = true; beforeDecode(symbol, 'ARGUMENTS');
  beforeDecode(Object.create(wireArguments()), 'ARGUMENTS');
});
test('expert stdio: argument getters and proxies are refused without invoking caller traps', () => {
  let reads = 0; const args = wireArguments(); Object.defineProperty(args, 'gold_base64', { enumerable: true, get() { reads++; return 'AA=='; } });
  beforeDecode(args, 'ARGUMENTS'); assert.equal(reads, 0);
  const proxy = new Proxy(wireArguments(), { get() { reads++; throw new Error('PRIVATE'); } });
  beforeDecode(proxy, 'ARGUMENTS'); assert.equal(reads, 0);
});
test('expert stdio: sparse accessor proxy and foreign-prototype evidence arrays stop before decode', () => {
  const sparse = wireArguments(); sparse.evidence_base64 = new Array(1); beforeDecode(sparse, 'ARRAY');
  let reads = 0; const accessor = wireArguments(); accessor.evidence_base64 = []; Object.defineProperty(accessor.evidence_base64, '0', { enumerable: true, get() { reads++; return ''; } });
  beforeDecode(accessor, 'ARRAY'); assert.equal(reads, 0);
  const proxy = wireArguments(); proxy.evidence_base64 = new Proxy([], { get() { reads++; return ''; } }); beforeDecode(proxy, 'ARRAY'); assert.equal(reads, 0);
  const foreign = wireArguments(); foreign.evidence_base64 = Object.setPrototypeOf([], null); beforeDecode(foreign, 'ARRAY');
});
test('expert stdio: evidence and submission counts are refused before encoded element inspection', () => {
  const evidence = wireArguments(); evidence.evidence_base64 = Array(65).fill(''); beforeDecode(evidence, 'COUNT_BOUND');
  const submissions = wireArguments(); submissions.submission_base64 = Array(3).fill(''); beforeDecode(submissions, 'COUNT_BOUND');
  const sparseMaximum = wireArguments(); sparseMaximum.evidence_base64 = new Array(4294967295); beforeDecode(sparseMaximum, 'COUNT_BOUND');
});
test('expert stdio: nonprimitive base64 and noncanonical alphabet padding whitespace and suffixes stop before decode', () => {
  for (const value of [new String('AA=='), ['AA=='], 'AA==\n', 'AA== ', 'AA_=', 'A===', 'AAA', 'AB==', 'AAB=']) {
    const args = wireArguments(); args.gold_base64 = value; beforeDecode(args, typeof value === 'string' ? 'BASE64' : 'BASE64_TYPE');
  }
});
test('expert stdio: all six individual raw caps refuse encoded overflow before any allocation callback', () => {
  for (const [key, cap] of [['gold_base64', LIMITS.goldBytes], ['intake_base64', LIMITS.intakeBytes],
    ['evidence_inventory_base64', LIMITS.evidenceInventoryBytes], ['intake_settings_base64', LIMITS.intakeSettingsBytes],
    ['submission_inventory_base64', LIMITS.submissionInventoryBytes], ['audit_settings_base64', LIMITS.auditSettingsBytes]]) {
    const args = wireArguments(); args[key] = Buffer.alloc(cap + 1).toString('base64'); beforeDecode(args, 'INPUT_BOUND');
  }
});
test('expert stdio: evidence and submission individual plus-one caps refuse before decode', () => {
  const evidence = wireArguments(); evidence.evidence_base64 = [Buffer.alloc(LIMITS.evidenceBytes + 1).toString('base64')]; beforeDecode(evidence, 'INPUT_BOUND');
  const submission = wireArguments(); submission.submission_base64 = [Buffer.alloc(LIMITS.submissionBytes + 1).toString('base64')]; beforeDecode(submission, 'INPUT_BOUND');
});
test('expert stdio: individually valid evidence over256KiB is refused before the first decode', () => {
  const args = wireArguments(); args.evidence_base64 = Array(9).fill(Buffer.alloc(32768).toString('base64')); beforeDecode(args, 'EVIDENCE_TOTAL_BOUND');
});
test('expert stdio: individually valid first-six inputs over768KiB stop before decode', () => {
  const { value, base64 } = sizedArguments(); value.gold_base64 = base64(524288); value.intake_base64 = base64(65536);
  value.evidence_inventory_base64 = base64(32768); value.intake_settings_base64 = base64(4096); value.evidence_base64 = Array(5).fill(base64(32768));
  beforeDecode(value, 'INTAKE_TOTAL_BOUND');
});
test('expert stdio: individually valid two submissions over the full4MiB batch stop before decode', () => {
  const { value, base64 } = sizedArguments(); value.submission_base64 = [base64(2097152), base64(2097152)]; beforeDecode(value, 'TOTAL_INPUT_BOUND');
});
test('expert stdio: exact evidence first-six and full-batch boundaries admit owned bytes without a kernel', () => {
  const { value, base64 } = sizedArguments(); value.evidence_base64 = Array(8).fill(base64(32768));
  assert.equal(captureExpertArguments(value).kernelArguments[4].reduce((n, b) => n + b.length, 0), 262144);
  value.evidence_base64 = [...Array(4).fill(base64(32768)), base64(28672)];
  value.gold_base64 = base64(524288); value.intake_base64 = base64(65536); value.evidence_inventory_base64 = base64(32768); value.intake_settings_base64 = base64(4096);
  const captured = captureExpertArguments(value); assert.equal(captured.kernelArguments.slice(0, 6).reduce((n, b) => n + (Array.isArray(b) ? b.reduce((x, y) => x + y.length, 0) : typeof b === 'string' ? 0 : b.length), 0), 786432);
  const exact = sizedArguments(); exact.value.submission_base64 = [base64(2097152), base64(2097146)];
  assert.equal(captureExpertArguments(exact.value).totalBytes, 4194304);
});
test('expert stdio: canonical empty forms reach the unchanged kernel once and receive its stable byte refusal', () => {
  const args = wireArguments(); args.gold_base64 = ''; let calls = 0;
  const result = executeExpertSubmission(args, { kernel: (...a) => { calls++; return reconcileExpertSubmissions(...a); } });
  refusal(result, 'CORE_BYTE_BOUND'); assert.equal(calls, 1);
});
test('expert stdio: decoder length or byte substitution is refused before the kernel', () => {
  let calls = 0; const result = executeExpertSubmission(wireArguments(), { decode: () => Buffer.from('foreign'), kernel: () => { calls++; } });
  refusal(result, 'DECODE'); assert.equal(calls, 0);
});
test('expert stdio: invalid UTF8 JSON schema and separate raw gold pin are stable one-kernel refusals', () => {
  for (const raw of [Buffer.from([255]), Buffer.from('PRIVATE_INVALID_JSON'), jsonBytes({ schema: 'foreign-private' })]) {
    const s = setup(); s.rawGold = raw; let calls = 0;
    const result = executeExpertSubmission(wireArguments(s), { kernel: (...a) => { calls++; return reconcileExpertSubmissions(...a); } });
    refusal(result); assert.equal(calls, 1); assert.ok(!JSON.stringify(result).includes('PRIVATE_INVALID_JSON'));
  }
  const args = wireArguments(); args.expected_gold_raw_sha256 = '0'.repeat(64); refusal(executeExpertSubmission(args));
});
test('expert stdio: swapped or rehashed foreign submissions are not repaired or reassigned', () => {
  const s = submit(submit(setup(), 'reviewer_a'), 'reviewer_b'); [s.submissions[0], s.submissions[1]] = [s.submissions[1], s.submissions[0]];
  for (let i = 0; i < 2; i++) Object.assign(s.submissionInventory.submissions[i], { expected_sha256: sha(s.submissions[i]), expected_bytes: s.submissions[i].length });
  refusal(executeExpertSubmission(wireArguments(s)), 'CORE_SUBMISSION_HANDLE');
});
test('expert stdio: declaration terminators and foreign packet identity keep complete contract refusals', () => {
  for (const suffix of ['\n', '\r', '\u2028', '\u2029']) {
    const s = setup(); s.auditSettings.implementation_source_sha256 = 'a'.repeat(64) + suffix;
    refusal(executeExpertSubmission(wireArguments(s)), 'CORE_SHA');
  }
  const s = setup(); s.auditSettings.packet_sha256 = '0'.repeat(64); refusal(executeExpertSubmission(wireArguments(s)), 'CORE_PACKET_SHA');
});
test('expert stdio: a tampered complete report hash never becomes a successful tool result', () => {
  const fake = report(); fake.content_hash = 'sha256:' + '0'.repeat(64);
  refusal(executeExpertSubmission(wireArguments(), { kernel: () => fake }), 'CONTENT_HASH');
});
test('expert stdio: missing report rows or invented verified identity fail the advertised full-report schema', () => {
  const missing = report(); delete missing.submissions; refusal(executeExpertSubmission(wireArguments(), { kernel: () => missing }), 'OUTPUT_SCHEMA');
  const invented = report(); invented.implementation.declared_module_sha256_verified = true;
  refusal(executeExpertSubmission(wireArguments(), { kernel: () => invented }), 'OUTPUT_SCHEMA');
});
test('expert stdio: full report over6MiB is refused whole without removing original fields', () => {
  const fake = report(); fake.interpretation = 'x'.repeat(LIMITS.reportBytes); fake.content_hash = contentHash(fake, createHash);
  refusal(executeExpertSubmission(wireArguments(), { kernel: () => fake }), 'REPORT_BOUND');
  assert.equal(fake.interpretation.length, LIMITS.reportBytes);
});
test('expert stdio: an injected private exception is replaced by a tiny stable no-echo refusal', () => {
  const marker = 'PRIVATE_KERNEL_PATH_OR_CREDENTIAL';
  const result = executeExpertSubmission(wireArguments(), { kernel: () => { throw new Error(marker); } });
  refusal(result, 'INTERNAL'); assert.equal(JSON.stringify(result).includes(marker), false);
});

test('expert stdio: final sender writes exact locked JSON plus LF once with no extra serialization', async () => {
  const { scope } = clockScope(); const output = new Output(); let serialized = 0;
  const message = { jsonrpc: '2.0', id: 1, result: { complete: true, unicode: 'λ', escaped: '"\\\n' } };
  const sender = createExpertNativeWriter(output, { serialize: value => { serialized++; return JSON.stringify(value); } });
  await sender.send(message, scope); assert.equal(serialized, 1);
  assert.deepEqual(output.frames, [Buffer.from(JSON.stringify(message) + '\n')]); assert.equal(output.listenerCount('error'), 0);
  assert.equal(output.listenerCount('close'), 0); assert.equal(output.listenerCount('drain'), 0);
});
test('expert stdio: queued late sender performs no serialization or native write', async () => {
  const { time, scope } = clockScope(); time.now = 15000; const output = new Output(); let serialized = 0;
  const sender = createExpertNativeWriter(output, { serialize: value => { serialized++; return JSON.stringify(value); } });
  await assert.rejects(sender.send({ jsonrpc: '2.0', id: 1, result: {} }, scope), error => error.code === 'DEADLINE');
  assert.equal(serialized, 0); assert.equal(output.frames.length, 0);
});
test('expert stdio:14999.5ms plus1ms synchronous serialization crosses the same deadline with zero native writes', async () => {
  const { time, scope } = clockScope(); time.now = 14999.5; const output = new Output();
  const sender = createExpertNativeWriter(output, { serialize: value => { const text = JSON.stringify(value); time.now += 1; return text; } });
  await assert.rejects(sender.send({ jsonrpc: '2.0', id: 1, result: {} }, scope), error => error.code === 'DEADLINE');
  assert.equal(time.now, 15000.5); assert.equal(output.frames.length, 0);
});
test('expert stdio: serialization-triggered abort refuses before the same captured native writer', async () => {
  const controller = new AbortController(); const scope = createWorkScope({ clock: () => 0, signal: controller.signal }); const output = new Output();
  const sender = createExpertNativeWriter(output, { serialize: value => { const text = JSON.stringify(value); controller.abort(); return text; } });
  await assert.rejects(sender.send({ jsonrpc: '2.0', id: 1, result: {} }, scope), error => error.code === 'ABORTED');
  assert.equal(output.frames.length, 0); scope.dispose();
});
test('expert stdio: serialization-triggered reentrant close refuses before native write', async () => {
  const { scope } = clockScope(); const output = new Output();
  const sender = createExpertNativeWriter(output, { serialize: value => { const text = JSON.stringify(value); scope.close(); return text; } });
  await assert.rejects(sender.send({ jsonrpc: '2.0', id: 1, result: {} }, scope), error => error.code === 'CLOSED');
  assert.equal(output.frames.length, 0);
});
test('expert stdio: serialization-triggered known exit refuses before native write', async () => {
  const { scope } = clockScope(); const output = new Output();
  const sender = createExpertNativeWriter(output, { serialize: value => { const text = JSON.stringify(value); scope.exit(); return text; } });
  await assert.rejects(sender.send({ jsonrpc: '2.0', id: 1, result: {} }, scope), error => error.code === 'EXITED');
  assert.equal(output.frames.length, 0);
});
test('expert stdio: backpressure waits one drain and never writes the frame a second time', async () => {
  const { scope } = clockScope(); const output = new Output(() => false);
  const promise = createExpertNativeWriter(output).send({ jsonrpc: '2.0', id: 1, result: {} }, scope);
  assert.equal(output.frames.length, 1); assert.equal(output.listenerCount('drain'), 1);
  output.emit('drain'); output.emit('drain'); await promise; assert.equal(output.frames.length, 1);
  assert.equal(output.listenerCount('drain'), 0); assert.equal(output.listenerCount('error'), 0);
});
test('expert stdio: close before drain rejects and removes listeners without a second native write', async () => {
  const { scope } = clockScope(); const output = new Output(() => false);
  const promise = createExpertNativeWriter(output).send({ jsonrpc: '2.0', id: 1, result: {} }, scope);
  output.emit('close'); await assert.rejects(promise, error => error.code === 'CLOSED');
  assert.equal(output.frames.length, 1); assert.equal(output.listenerCount('drain'), 0); assert.equal(output.listenerCount('close'), 0);
});
test('expert stdio: abort while waiting for drain stays sticky and cannot revive a send', async () => {
  const controller = new AbortController(); const scope = createWorkScope({ clock: () => 0, signal: controller.signal }); const output = new Output(() => false);
  const sender = createExpertNativeWriter(output); const message = { jsonrpc: '2.0', id: 1, result: {} };
  const promise = sender.send(message, scope); controller.abort(); await assert.rejects(promise, error => error.code === 'ABORTED');
  output.emit('drain'); await assert.rejects(sender.send(message, scope), error => error.code === 'ABORTED');
  assert.equal(output.frames.length, 1); scope.dispose();
});
test('expert stdio: a native writer throw retains one attempt and no retry or raw exception echo', async () => {
  const { scope } = clockScope(); const output = new Output(() => { throw new Error('PRIVATE_WRITE_EXCEPTION'); });
  const sender = createExpertNativeWriter(output); const message = { jsonrpc: '2.0', id: 1, result: {} };
  await assert.rejects(sender.send(message, scope), error => error.code === 'WRITE' && !error.message.includes('PRIVATE'));
  await assert.rejects(sender.send(message, scope), error => error.code === 'WRITE'); assert.equal(output.frames.length, 1);
});
test('expert stdio: clock rollback after serialization refuses rather than renewing the absolute window', async () => {
  const { time, scope } = clockScope(); time.now = 10; const output = new Output();
  const sender = createExpertNativeWriter(output, { serialize: value => { time.now = 5; return JSON.stringify(value); } });
  await assert.rejects(sender.send({ jsonrpc: '2.0', id: 1, result: {} }, scope), error => error.code === 'CLOCK');
  assert.equal(output.frames.length, 0);
});
test('expert stdio: synchronous kernel exhaustion is caught before projector and final success write', async () => {
  const { time, scope } = clockScope(); let called = 0;
  const result = executeExpertSubmission(wireArguments(), { scope, kernel: (...args) => {
    called++; const value = reconcileExpertSubmissions(...args); time.now = 15000.5; return value;
  } });
  refusal(result, 'DEADLINE'); assert.equal(called, 1); const output = new Output();
  await assert.rejects(createExpertNativeWriter(output).send({ jsonrpc: '2.0', id: 1, result }, scope, { tool: true }), error => error.code === 'DEADLINE');
  assert.equal(output.frames.length, 0);
});
test('expert stdio: synthetic whole response exact20MiB includes LF and plus-one writes nothing', async () => {
  const empty = { jsonrpc: '2.0', id: 1, result: { fixture: '' } };
  const overhead = Buffer.byteLength(JSON.stringify(empty) + '\n');
  const message = { ...empty, result: { fixture: 'x'.repeat(LIMITS.responseFrameBytes - overhead) } };
  const exact = new Output(); await createExpertNativeWriter(exact).send(message, clockScope().scope);
  assert.equal(Buffer.byteLength(exact.frames[0]), LIMITS.responseFrameBytes);
  const overflow = new Output(); message.result.fixture += 'x';
  await assert.rejects(createExpertNativeWriter(overflow).send(message, clockScope().scope), error => error.code === 'FRAME_OUTPUT_BOUND');
  assert.equal(overflow.frames.length, 0);
});
test('expert stdio: synthetic complete escaped tool object exact19MiB and plus-one use the real sender cap', async () => {
  const result = { content: [{ type: 'text', text: '' }], structuredContent: { synthetic_frame_fixture: true } };
  const overhead = Buffer.byteLength(JSON.stringify(result)); result.content[0].text = 'x'.repeat(LIMITS.toolResultBytes - overhead);
  const message = { jsonrpc: '2.0', id: 1, result }; const exact = new Output();
  await createExpertNativeWriter(exact).send(message, clockScope().scope, { tool: true });
  assert.equal(Buffer.byteLength(JSON.stringify(JSON.parse(exact.frames[0]).result)), LIMITS.toolResultBytes);
  result.content[0].text += 'x'; const overflow = new Output();
  await assert.rejects(createExpertNativeWriter(overflow).send(message, clockScope().scope, { tool: true }), error => error.code === 'TOOL_RESULT_BOUND');
  assert.equal(overflow.frames.length, 0);
});
test('expert stdio: producer actual request cap counts the complete6MiB frame before native stdin effect', async () => {
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { fixture: 'x'.repeat(LIMITS.requestFrameBytes) } };
  const output = new Output();
  await assert.rejects(createExpertNativeWriter(output, { frameBytes: LIMITS.requestFrameBytes }).send(message, clockScope().scope), error => error.code === 'FRAME_OUTPUT_BOUND');
  assert.equal(output.frames.length, 0);
});
test('expert stdio: oversized or unsafe reflected IDs refuse before output serialization', async () => {
  for (const id of ['😀'.repeat(33), Number.MAX_SAFE_INTEGER + 1, [], '\ud800']) {
    const output = new Output(); let serialized = 0;
    await assert.rejects(createExpertNativeWriter(output, { serialize: value => { serialized++; return JSON.stringify(value); } })
      .send({ jsonrpc: '2.0', id, result: {} }, clockScope().scope), error => error.code === 'FRAME_ID');
    assert.equal(output.frames.length, 0); assert.equal(serialized, 0);
  }
});
test('expert stdio: exact128UTF8 ID is admitted while the next Unicode scalar is refused before SDK dispatch', () => {
  let messages = 0; const reader = new ExpertFrameBuffer(() => messages++);
  reader.append(jsonBytes({ jsonrpc: '2.0', id: 'é'.repeat(64), method: 'tools/list' })); reader.append(Buffer.from('\n'));
  assert.equal(reader.readMessage().id, 'é'.repeat(64)); assert.equal(messages, 1);
  reader.append(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 'é'.repeat(65), method: 'tools/list' }) + '\n'));
  assert.throws(() => reader.readMessage(), error => error.code === 'FRAME_SHAPE'); assert.equal(messages, 1);
});
test('expert stdio: fatal invalid UTF8 and malformed JSON are not repaired skipped or echoed', () => {
  for (const chunk of [Buffer.from([123, 255, 125, 10]), Buffer.from('PRIVATE_MALFORMED_JSON\n')]) {
    let messages = 0; const reader = new ExpertFrameBuffer(() => messages++); reader.append(chunk);
    assert.throws(() => reader.readMessage(), error => error instanceof ExpertStdioError && error.code === 'FRAME_PARSE' && !error.message.includes('PRIVATE'));
    assert.equal(messages, 0); assert.equal(reader.buffer.length, 0);
  }
});
test('expert stdio: complete input frame exact6MiB includes LF and preserves parsed admission', () => {
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { fixture: '' } };
  message.params.fixture = 'x'.repeat(LIMITS.requestFrameBytes - Buffer.byteLength(JSON.stringify(message) + '\n'));
  let messages = 0; const reader = new ExpertFrameBuffer(() => messages++);
  const frame = Buffer.from(JSON.stringify(message) + '\n'); assert.equal(frame.length, LIMITS.requestFrameBytes);
  reader.append(frame); assert.equal(reader.readMessage().params.fixture.length, message.params.fixture.length);
  reader.finish(); assert.equal(messages, 1);
});
test('expert stdio: retained unterminated input plus-one fails before copying a second chunk', () => {
  let messages = 0; const reader = new ExpertFrameBuffer(() => messages++);
  reader.append(Buffer.alloc(LIMITS.requestFrameBytes, 32)); assert.equal(reader.readMessage(), null);
  assert.throws(() => reader.append(Buffer.from('x')), error => error.code === 'FRAME_INPUT_BOUND');
  assert.equal(reader.buffer.length, 0); assert.equal(messages, 0);
});
test('expert stdio: EOF with an incomplete frame is a bounded failure with zero SDK dispatches', () => {
  let messages = 0; const reader = new ExpertFrameBuffer(() => messages++); reader.append(Buffer.from('{"PRIVATE_UNFINISHED":'));
  assert.throws(() => reader.finish(), error => error.code === 'FRAME_UNTERMINATED');
  assert.equal(messages, 0); assert.equal(reader.buffer.length, 0);
});
test('expert stdio: protocol shape unsafe IDs and extra envelope fields stop before SDK callbacks', () => {
  for (const message of [
    { jsonrpc: '2.0', id: Number.MAX_SAFE_INTEGER + 1, method: 'tools/list' },
    { jsonrpc: '2.0', id: 1, method: 'tools/list', private_extra: 'PRIVATE' },
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: [] },
    { jsonrpc: '1.0', id: 1, method: 'tools/list' },
  ]) {
    let messages = 0; const reader = new ExpertFrameBuffer(() => messages++);
    reader.append(Buffer.from(JSON.stringify(message) + '\n'));
    assert.throws(() => reader.readMessage(), error => error.code === 'FRAME_SHAPE'); assert.equal(messages, 0);
  }
});
test('expert stdio: diagnostic overflow is failing once and never truncation accepted as success', () => {
  const output = new Output(); let failed = 0; const diagnostics = createExpertDiagnostics(output, () => failed++);
  while (diagnostics.emit()) { assert.ok(diagnostics.bytes <= LIMITS.stderrBytes); }
  assert.equal(failed, 1); const count = output.frames.length; assert.equal(diagnostics.failed, true);
  diagnostics.emit(); assert.equal(output.frames.length, count);
  assert.equal(Buffer.byteLength(output.frames.join('')), diagnostics.bytes); assert.ok(diagnostics.bytes <= LIMITS.stderrBytes);
});
async function memoryCall(params) {
  const output = new Output(); const stderr = new Output(); const input = new PassThrough();
  const { server, transport } = createExpertSubmissionEndpoint({ input, output, stderr }); const started = performance.now();
  const waitFrames = async n => {
    for (let i = 0; i < 100 && output.frames.length < n; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(output.frames.length, n);
  };
  try {
    await server.connect(transport);
    input.write(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'synthetic-memory', version: '0.0.0' } } }) + '\n'));
    await waitFrames(1);
    input.write(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params }) + '\n'));
    await waitFrames(2); return JSON.parse(output.frames[1]);
  } finally {
    const first = transport.close(); assert.equal(transport.close(), first); await first; await server.close(); input.destroy();
    assert.ok(performance.now() - started < LIMITS.totalMs); assert.ok(Buffer.byteLength(stderr.frames.join('')) <= LIMITS.stderrBytes);
  }
}
test('expert stdio: unknown tool receives stable refusal through actual low-level SDK projection with no raw echo', async () => {
  const response = await memoryCall({ name: 'PRIVATE_UNKNOWN_TOOL', arguments: wireArguments() });
  refusal(response.result, 'TOOL_NAME'); assert.equal(JSON.stringify(response).includes('PRIVATE_UNKNOWN_TOOL'), false);
});
test('expert stdio: SDK validation exceptions are sanitized before the same native sender', async () => {
  const response = await memoryCall({ name: ['PRIVATE_SCHEMA_ARGUMENT'], arguments: wireArguments() });
  assert.equal(response.error.code, -32602); assert.equal(response.error.message, 'Expert submission protocol refused.');
  assert.equal(JSON.stringify(response).includes('PRIVATE_SCHEMA_ARGUMENT'), false);
});
test('expert stdio: duplicate pending IDs and cancelled scopes cannot revive or dispatch a second response', async () => {
  const input = new PassThrough(); const output = new Output(); const stderr = new Output();
  const { transport } = createExpertSubmissionEndpoint({ input, output, stderr });
  const request = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: EXPERT_TOOL.name, arguments: wireArguments() } };
  transport.accept(request); const scope = transport.scopeFor(1);
  assert.throws(() => transport.accept(request), error => error.code === 'FRAME_PENDING');
  transport.accept({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } });
  await assert.rejects(transport.send({ jsonrpc: '2.0', id: 1, result: {} }), error => error.code === 'ABORTED');
  assert.equal(scope.failure, 'ABORTED'); assert.equal(output.frames.length, 0); await transport.close(); input.destroy();
});
test('expert stdio: fixture byte snapshots admit a bounded regular FD and refuse a direct symlink', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canli-expert-snapshot-'));
  try {
    const filename = path.join(directory, 'original'); const bytes = Buffer.from('SYNTHETIC SAME BUFFER SNAPSHOT');
    fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 }); assert.deepEqual(readSnapshot(filename, bytes.length), bytes);
    const alias = path.join(directory, 'alias'); fs.symlinkSync(filename, alias);
    assert.throws(() => readSnapshot(alias, bytes.length)); assert.throws(() => readSnapshot(filename, bytes.length - 1));
    assert.equal(sha(readSnapshot(filename, bytes.length)), sha(bytes));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('expert stdio: memoized transport closure destroys the owned input once and settles a pending writer', async () => {
  const input = new PassThrough(); const output = new Output(() => false); const stderr = new Output();
  const destroy = input.destroy.bind(input); let destroys = 0;
  input.destroy = (...args) => { destroys++; return destroy(...args); };
  const { transport } = createExpertSubmissionEndpoint({ input, output, stderr });
  transport.accept({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const pending = transport.send({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
  const rejection = assert.rejects(pending, error => error.code === 'CLOSED');
  const first = transport.close(); assert.equal(transport.close(), first);
  await first; await rejection;
  assert.equal(input.destroyed, true); assert.equal(destroys, 1);
  await transport.close(); assert.equal(destroys, 1); assert.equal(output.frames.length, 1);
  assert.equal(output.listenerCount('drain'), 0); assert.equal(output.listenerCount('close'), 0);
});

// Native in-memory streams exercise the production raw ingress and locked SDK
// projection. This helper never creates a child or an additional SDK client.
async function memoryRawIngress(params, refused) {
  const input = new PassThrough(); const output = new Output(); const stderr = new Output();
  let decoded = 0; let calls = 0;
  const { server, transport } = createExpertSubmissionEndpoint({ input, output, stderr,
    decode: text => { decoded++; return Buffer.from(text, 'base64'); },
    kernel: (...args) => { calls++; return reconcileExpertSubmissions(...args); },
  });
  const started = performance.now();
  const waitFor = async predicate => {
    for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(Boolean(predicate()), true);
  };
  const frame = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params }) + '\n');
  try {
    await server.connect(transport);
    input.write(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'synthetic-raw-ingress', version: '0.0.0' } } }) + '\n'));
    await waitFor(() => output.frames.length === 1);
    input.write(frame);
    if (refused) {
      await waitFor(() => transport.closing !== undefined);
      const first = transport.close(); assert.equal(transport.close(), first); await first;
      assert.equal(input.destroyed, true); assert.equal(output.frames.length, 1);
      assert.equal(decoded, 0); assert.equal(calls, 0); assert.equal(transport.scopes.size, 0);
      assert.equal(transport.responses.size, 0);
      const diagnostic = stderr.frames.join('');
      assert.ok(diagnostic.length > 0 && Buffer.byteLength(diagnostic) <= LIMITS.stderrBytes);
      assert.equal(diagnostic.includes('PRIVATE_RAW_'), false);
      assert.equal(output.frames.join('').includes('PRIVATE_RAW_'), false);
      return { frame, response: null, decoded, calls };
    }
    await waitFor(() => output.frames.length === 2);
    assert.equal(calls, 1); assert.equal(stderr.frames.length, 0);
    return { frame, response: JSON.parse(output.frames[1]), decoded, calls };
  } finally {
    const first = transport.close(); assert.equal(transport.close(), first); await first; await server.close(); input.destroy();
    assert.ok(performance.now() - started < LIMITS.totalMs);
  }
}
test('expert stdio: raw own __proto__ argument refuses before locked SDK projection decode or core', async () => {
  const args = wireArguments();
  Object.defineProperty(args, '__proto__', { value: 'PRIVATE_RAW_ARGUMENT', enumerable: true });
  const { frame } = await memoryRawIngress({ name: EXPERT_TOOL.name, arguments: args }, true);
  assert.equal(Object.hasOwn(JSON.parse(frame).params.arguments, '__proto__'), true);
});
test('expert stdio: raw extra ordinary and __proto__ params refuse before SDK projection or core', async () => {
  for (const key of ['extra', '__proto__']) {
    const params = { name: EXPERT_TOOL.name, arguments: wireArguments() };
    Object.defineProperty(params, key, { value: 'PRIVATE_RAW_PARAMS', enumerable: true });
    const { frame } = await memoryRawIngress(params, true);
    assert.equal(Object.hasOwn(JSON.parse(frame).params, key), true);
  }
});
test('expert stdio: raw exact nine-key ingress reaches the unchanged core once and retains the complete report', async () => {
  const s = setup(); const args = wireArguments(s);
  const { frame, response, decoded, calls } = await memoryRawIngress({ name: EXPERT_TOOL.name, arguments: args }, false);
  assert.deepEqual(JSON.parse(frame).params.arguments, args);
  assert.equal(calls, 1); assert.equal(decoded, 6);
  const accepted = payload(response.result); assert.deepEqual(accepted, report(s)); unknown(accepted);
  assert.equal(accepted.coverage.selected_n, s.gold.labels.length);
});
test('expert stdio: raw admission preserves the request clock and refuses a crossing before SDK dispatch', async () => {
  const input = new PassThrough(); const output = new Output(); const stderr = new Output(); let observations = 0;
  const times = [0, 14999.5, 15000.5];
  const { transport } = createExpertSubmissionEndpoint({ input, output, stderr, clock: () => times[Math.min(observations++, 2)] });
  try {
    assert.throws(() => transport.accept({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: EXPERT_TOOL.name, arguments: wireArguments() } }), error => error.code === 'DEADLINE');
    assert.equal(observations, 3); assert.equal(transport.scopes.get(1).scope.failure, 'DEADLINE');
    assert.equal(output.frames.length, 0); assert.equal(stderr.frames.length, 0);
  } finally { const first = transport.close(); assert.equal(transport.close(), first); await first; input.destroy(); }
});
