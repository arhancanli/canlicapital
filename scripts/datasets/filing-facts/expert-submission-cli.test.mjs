import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { main, EXPERT_SUBMISSION_CLI_LIMITS as LIMITS } from './expert-submission-cli.mjs';
import { reconcileExpertSubmissions } from './expert-submission-audit.mjs';
import { packetContent } from '../../../js/filing-facts-packet.js';

// All documents, people, judgements and source URLs here are software fixtures.
const bytes = value => Buffer.from(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const cli = fileURLToPath(new URL('./expert-submission-cli.mjs', import.meta.url));
const choices = { question_clear: ['yes', 'no'], answer_matches_filing: ['yes', 'no', 'cannot_find'], citation_correct: ['yes', 'no'] };
let suppliedFixtureBytes = 0, childEntries = 0;

// Snapshot assertions admit the FD before allocation/read and forget it before one close.
function snapshot(path, maximum = LIMITS.reportFile) {
  let fd;
  try {
    fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true });
    assert.ok(before.isFile() && before.size >= 0n && before.size <= BigInt(maximum));
    const result = Buffer.alloc(Number(before.size)); let offset = 0;
    while (offset < result.length) {
      const count = fs.readSync(fd, result, offset, Math.min(65536, result.length - offset), offset);
      assert.ok(Number.isSafeInteger(count) && count > 0 && count <= result.length - offset); offset += count;
    }
    assert.equal(fs.readSync(fd, Buffer.alloc(1), 0, 1, result.length), 0);
    const after = fs.fstatSync(fd, { bigint: true }), linked = fs.lstatSync(path, { bigint: true });
    for (const key of ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs']) {
      assert.equal(after[key], before[key]); assert.equal(linked[key], before[key]);
    }
    const owned = fd; fd = undefined; fs.closeSync(owned); return result;
  } finally { if (fd !== undefined) { const owned = fd; fd = undefined; fs.closeSync(owned); } }
}

function scenario({ returned = 0, blank = false, evidence = 0 } = {}) {
  const gold = { schema: 'canli.filing-facts-gold-packet.v0', guidelines: 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md',
    judgements: clone(choices), annotator: '', labels: Array.from({ length: 3 }, (_, index) => ({
      id: `software-fixture-${index}`, template: 'lookup', company: 'SYNTHETIC SOFTWARE FIXTURE',
      question: `Synthetic question ${index}?`, answer: `${index} fictional units`,
      filings: [`https://example.invalid/software-fixture/${index}`], question_clear: '', answer_matches_filing: '', citation_correct: '', notes: '' })) };
  const packet = hash(packetContent(gold));
  const roles = ['reviewer_a', 'reviewer_b', 'adjudicator'].map(role => ({ role, handle: `synthetic-${role}`, aliases: [],
    affiliations: null, conflicts: null, identity_evidence_ids: [], independence_evidence_ids: [], qualifications: [] }));
  const s = { rawGold: Buffer.from(JSON.stringify(gold, null, 1) + '\n'), gold,
    intake: { schema: 'canli.filing-facts-expert-intake.v1', packet_sha256: packet, roles, sources: [] },
    evidenceInventory: { schema: 'canli.filing-facts-expert-evidence.v1', evidence: [] }, evidence: [],
    intakeSettings: { schema: 'canli.filing-facts-expert-settings.v1', packet_sha256: packet, prepared_on: '2026-10-03', required_uses: ['human_review'], implementation_source_sha256: null },
    submissionInventory: { schema: 'canli.filing-facts-expert-submission-inventory.v1', packet_sha256: packet, submissions: [] }, submission: [],
    auditSettings: { schema: 'canli.filing-facts-expert-submission-settings.v1', packet_sha256: packet, implementation_source_sha256: null } };
  for (let index = 0; index < evidence; index++) {
    const raw = Buffer.from(`SYNTHETIC DOCUMENT ${index}; no authenticated person or rights`); s.evidence.push(raw);
    s.evidenceInventory.evidence.push({ id: `fixture-${index}`, packet_sha256: packet, purpose: 'identity',
      subject: { role: 'reviewer_a', handle: roles[0].handle }, expected_sha256: hash(raw), expected_bytes: raw.length });
  }
  for (let index = 0; index < returned; index++) {
    const r = clone(gold); r.annotator = roles[index].handle; r.packet_sha256 = packet;
    if (!blank) for (const label of r.labels) for (const field of Object.keys(choices)) label[field] = 'yes';
    putReturn(s, index, bytes(r));
  }
  return s;
}

function putReturn(s, index, raw) {
  s.submission[index] = raw;
  s.submissionInventory.submissions[index] = { role: ['reviewer_a', 'reviewer_b'][index],
    declared_handle: s.intake.roles[index].handle, packet_sha256: s.auditSettings.packet_sha256,
    expected_sha256: hash(raw), expected_bytes: raw.length };
}

function coreArgs(s) { return [s.rawGold, hash(s.rawGold), bytes(s.intake), bytes(s.evidenceInventory), s.evidence,
  bytes(s.intakeSettings), bytes(s.submissionInventory), s.submission, bytes(s.auditSettings)]; }

function files(t, s = scenario()) {
  const root = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'canli-expert-submission-cli-'));
  fs.chmodSync(root, 0o700); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const raw = { gold: s.rawGold, intake: bytes(s.intake), evidenceInventory: bytes(s.evidenceInventory),
    intakeSettings: bytes(s.intakeSettings), submissionInventory: bytes(s.submissionInventory), auditSettings: bytes(s.auditSettings) };
  const paths = {}, inputs = [];
  for (const [name, data] of Object.entries(raw)) {
    const path = join(root, name + '.json'); paths[name] = path; inputs.push(path);
    fs.writeFileSync(path, data, { flag: 'wx', mode: 0o600 }); suppliedFixtureBytes += data.length;
  }
  paths.evidence = s.evidence.map((data, index) => join(root, `evidence-${index}.bin`));
  paths.submission = s.submission.map((data, index) => join(root, `submission-${index}.json`));
  for (const [names, data] of [[paths.evidence, s.evidence], [paths.submission, s.submission]]) {
    names.forEach((path, index) => { fs.writeFileSync(path, data[index], { flag: 'wx', mode: 0o600 });
      inputs.push(path); suppliedFixtureBytes += data[index].length; });
  }
  assert.ok(suppliedFixtureBytes < 12 * 1024 * 1024, 'finite total supplied fixture bytes');
  const out = join(root, 'private-report.json');
  const argv = ['--gold', paths.gold, '--expected-gold-sha256', hash(s.rawGold), '--intake', paths.intake,
    '--evidence-inventory', paths.evidenceInventory, '--intake-settings', paths.intakeSettings,
    '--submission-inventory', paths.submissionInventory, '--audit-settings', paths.auditSettings, '--out', out,
    ...paths.evidence.flatMap(path => ['--evidence', path]), ...paths.submission.flatMap(path => ['--submission', path])];
  return { root, out, paths, inputs, argv, s };
}

function instrument(hooks = {}) {
  const events = [], held = new Map();
  const operations = { ...fs };
  for (const name of ['openSync', 'fstatSync', 'lstatSync', 'realpathSync', 'readSync', 'writeSync', 'fsyncSync', 'closeSync']) {
    operations[name] = (...args) => {
      const path = name === 'openSync' || name === 'lstatSync' || name === 'realpathSync' ? args[0] : held.get(args[0]);
      const event = { operation: name, path, fd: typeof args[0] === 'number' ? args[0] : undefined, args };
      events.push(event);
      if (name === 'closeSync') held.delete(args[0]);
      const native = () => fs[name](...args);
      const result = hooks[name] ? hooks[name](event, native) : native();
      if (name === 'openSync') held.set(result, path);
      return result;
    };
  }
  for (const name of ['readFileSync', 'writeFileSync', 'unlinkSync', 'renameSync', 'mkdirSync', 'chmodSync', 'readdirSync']) {
    operations[name] = () => assert.fail(`production must not call ${name}`);
  }
  return { filesystem: operations, events, held };
}

function loader(observation = {}, replacement = reconcileExpertSubmissions) {
  return async () => {
    observation.loads = (observation.loads ?? 0) + 1;
    return { reconcileExpertSubmissions(...args) { observation.calls = (observation.calls ?? 0) + 1;
      observation.args = args; return replacement(...args); } };
  };
}

function refused(result, code) {
  assert.equal(result.exitCode, 1); assert.equal(result.stdout, '');
  assert.match(result.stderr, /^expert-submission-cli: CLI_[A-Z_]+\n$/);
  if (code) assert.equal(result.stderr, `expert-submission-cli: ${code}\n`);
  assert.ok(Buffer.byteLength(result.stderr) <= LIMITS.stderr);
}

function saved(f, result) {
  assert.equal(result.exitCode, 0); assert.equal(result.stderr, ''); assert.ok(Buffer.byteLength(result.stdout) <= LIMITS.stdout);
  const raw = snapshot(f.out), terminal = JSON.parse(result.stdout), expected = Buffer.from(JSON.stringify(reconcileExpertSubmissions(...coreArgs(f.s))) + '\n');
  assert.deepEqual(raw, expected); assert.equal(fs.lstatSync(f.out).mode & 0o777, 0o600);
  assert.deepEqual(terminal, { status: 'saved', report_sha256: hash(raw), report_bytes: raw.length,
    selected_n: 3, supplied_role_count: f.s.submission.length, syntactic_only: true });
  const report = JSON.parse(raw);
  assert.equal(report.coverage.selected_n, 3); assert.equal(report.coverage.required_item_assignments_n, 6);
  for (const value of Object.values(report.established)) assert.equal(value, null);
  for (const row of report.role_coverage) for (const field of ['authenticated_human', 'task_expertise_verified', 'actual_independence_verified']) assert.equal(row[field], null);
  assert.equal(report.adjudication.decisions_created_n, 0); assert.equal(report.adjudication.expert_adjudication, null);
  assert.equal(report.syntactic_agreement.verified_expert_agreement, null);
  assert.equal(report.implementation.declared_module_sha256_verified, false);
  assert.equal(report.preparation.bindings.gold.original_base64, f.s.rawGold.toString('base64'));
  return report;
}

function statWith(stat, changes) { return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, changes); }
function launch(args) {
  assert.ok(++childEntries <= 4, 'at most four actual command child entries');
  return spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 5000, maxBuffer: 8192 });
}

test('two absent reviewer files retain full selected-N and explicit missing roles in the exact private API report', async t => {
  const f = files(t), report = saved(f, await main(f.argv));
  assert.deepEqual(report.coverage.absent_role_submissions, ['reviewer_a', 'reviewer_b']);
  assert.equal(report.coverage.complete_syntactic_pairs_n, 0);
  assert.ok(report.adjudication.item_tasks.every(row => row.missing_submissions.length === 2));
});

test('one supplied reviewer retains the absent-role denominator and private original return binding', async t => {
  const f = files(t, scenario({ returned: 1 })), report = saved(f, await main(f.argv));
  assert.equal(report.role_coverage[0].complete_with_required_notes_n, 3);
  assert.equal(report.role_coverage[1].selected_n, 3); assert.equal(report.submissions[1].packet, null);
  assert.equal(report.submissions[0].binding.original_base64, f.s.submission[0].toString('base64'));
});

test('two blank exports stay present-but-incomplete instead of becoming absent files or verified agreement', async t => {
  const f = files(t, scenario({ returned: 2, blank: true })), report = saved(f, await main(f.argv));
  assert.equal(report.coverage.role_submissions_provided_n, 2); assert.equal(report.coverage.complete_syntactic_pairs_n, 0);
  assert.ok(report.role_coverage.every(row => row.submission_status === 'partial_syntactic_submission'));
});

test('partial judgements missing notes and disagreements survive with all three selected pairs and no adjudication', async t => {
  const s = scenario({ returned: 2 }), r = JSON.parse(s.submission[0]);
  r.labels[0].question_clear = ''; r.labels[1].answer_matches_filing = 'cannot_find'; r.labels[1].notes = '';
  putReturn(s, 0, bytes(r)); const f = files(t, s), report = saved(f, await main(f.argv));
  assert.equal(report.coverage.complete_syntactic_pairs_n, 1);
  assert.deepEqual(report.adjudication.item_tasks[1].missing_fields, [{ role: 'reviewer_a', fields: ['notes'] }]);
  assert.equal(report.adjudication.item_tasks[1].syntactic_disagreements[0].field, 'answer_matches_filing');
});

test('complete fictional agreement preserves exact full-N and every unknown human expert independence and rights outcome', async t => {
  const f = files(t, scenario({ returned: 2, evidence: 2 })), report = saved(f, await main(f.argv));
  assert.equal(report.coverage.complete_syntactic_pairs_n, 3);
  assert.equal(report.syntactic_agreement.complete_item_pairs_result.items, 3);
  for (const row of report.preparation.evidence_inventory) assert.equal(row.document_authenticity, null);
});

test('all original descriptors close before one lazy core load and one nine-buffer reconciliation call', async t => {
  const f = files(t, scenario({ returned: 2, evidence: 2 })), io = instrument(), observation = {};
  const loadCore = async () => {
    assert.deepEqual([...io.held.values()], [f.root]); return loader(observation)();
  };
  saved(f, await main(f.argv, { filesystem: io.filesystem, loadCore }));
  assert.equal(observation.loads, 1); assert.equal(observation.calls, 1); assert.equal(observation.args.length, 9);
  assert.deepEqual(observation.args, coreArgs(f.s)); assert.equal(io.held.size, 0);
  assert.deepEqual(io.events.filter(row => row.operation === 'openSync' && (row.args[1] & fs.constants.O_CREAT)).map(row => row.path), [f.out]);
});

test('expected gold hash requires a primitive exact lowercase64 before any filesystem operation', async t => {
  const f = files(t);
  for (const bad of ['0'.repeat(63), '0'.repeat(65), 'A'.repeat(64), '0'.repeat(64) + '\n', [hash(f.s.rawGold)]]) {
    const argv = [...f.argv]; argv[3] = bad; const io = instrument(); refused(await main(argv, io)); assert.equal(io.events.length, 0);
  }
  saved(f, await main(f.argv));
});

test('unknown duplicate missing-value scalar flags positional extras and accessor argv refuse before native IO', async t => {
  const f = files(t);
  const accessor = [...f.argv]; Object.defineProperty(accessor, '1', { get() { assert.fail('argv accessor must not execute'); } });
  for (const argv of [[...f.argv, '--unknown', '/x'], [...f.argv, '--gold', f.paths.gold], f.argv.slice(0, -1),
    [...f.argv, 'extra', 'value'], accessor, new Proxy(f.argv, { get() { assert.fail('argv proxy must not execute'); } })]) {
    const io = instrument(); refused(await main(argv, io), 'CLI_ARGUMENTS'); assert.equal(io.events.length, 0);
  }
});

test('relative unnormalized control oversized and unpaired-surrogate paths refuse before native IO', async t => {
  const f = files(t);
  for (const bad of ['relative.json', f.root + '/a/../gold.json', f.root + '/\0gold', f.root + '/\ngold', f.root + '/\u0085gold', '/' + 'x'.repeat(4096), f.root + '/\ud800']) {
    const argv = [...f.argv]; argv[1] = bad; const io = instrument(); refused(await main(argv, io), 'CLI_PATH'); assert.equal(io.events.length, 0);
  }
});

test('duplicate input or output paths are rejected before opening any descriptor', async t => {
  const f = files(t);
  for (const index of [5, 15]) {
    const argv = [...f.argv]; argv[index] = f.paths.gold; const io = instrument();
    refused(await main(argv, io), 'CLI_ALIAS'); assert.equal(io.events.length, 0);
  }
});

test('caller raw gold mismatch refuses unchanged reconciliation without creating output or echoing supplied values', async t => {
  const f = files(t); f.argv[3] = '0'.repeat(64);
  const result = await main(f.argv); refused(result, 'CLI_RECONCILE'); assert.equal(fs.existsSync(f.out), false);
  assert.ok(!result.stderr.includes(f.root) && !result.stderr.includes('0'.repeat(64)));
});

test('rehashed changed immutable return fields still refuse through the delivered packet contract', async t => {
  const s = scenario({ returned: 2 }), r = JSON.parse(s.submission[0]); r.labels[0].answer = 'tampered software fixture';
  putReturn(s, 0, bytes(r)); const f = files(t, s); refused(await main(f.argv), 'CLI_RECONCILE'); assert.equal(fs.existsSync(f.out), false);
});

test('swapped file order cannot silently repair submission inventory bindings or declared roles', async t => {
  const f = files(t, scenario({ returned: 2 })); [f.argv[17], f.argv[19]] = [f.argv[19], f.argv[17]];
  refused(await main(f.argv), 'CLI_RECONCILE'); assert.equal(fs.existsSync(f.out), false);
});

test('opaque evidence order and raw pins remain exact even though the CLI never interprets document contents', async t => {
  const f = files(t, scenario({ evidence: 2 })); [f.argv[17], f.argv[19]] = [f.argv[19], f.argv[17]];
  refused(await main(f.argv), 'CLI_RECONCILE'); assert.equal(fs.existsSync(f.out), false);
});

test('invalid UTF8 duplicate JSON keys trailing JSON and unpaired escaped Unicode refuse inherited semantics', async t => {
  for (const raw of [Buffer.from([0xff]), Buffer.from('{"schema":"a","schema":"b"}'),
    Buffer.from(JSON.stringify(scenario().auditSettings) + 'null'), Buffer.from('{"schema":"\\ud800"}')]) {
    const f = files(t); fs.writeFileSync(f.paths.auditSettings, raw);
    refused(await main(f.argv), 'CLI_RECONCILE'); assert.equal(fs.existsSync(f.out), false);
  }
});

test('direct actual command produces one bounded non-echo private report identical to the API', t => {
  const f = files(t, scenario({ returned: 2 })), child = launch([cli, ...f.argv]);
  assert.equal(child.error, undefined); assert.equal(child.signal, null); saved(f, { exitCode: child.status, stdout: child.stdout, stderr: child.stderr });
  assert.ok(!child.stdout.includes(f.root) && !child.stdout.includes('synthetic-reviewer'));
});

test('actual owned symlink command resolves both realpaths and saves the same direct-command report', t => {
  const f = files(t, scenario({ returned: 1 })), alias = join(f.root, 'owned-cli-alias.mjs'); fs.symlinkSync(cli, alias);
  const child = launch([alias, ...f.argv]); assert.equal(child.error, undefined); assert.equal(child.signal, null);
  saved(f, { exitCode: child.status, stdout: child.stdout, stderr: child.stderr });
});

test('actual direct command with missing arguments refuses rather than silently skipping the entry', () => {
  const child = launch([cli]); assert.equal(child.error, undefined); assert.equal(child.signal, null);
  refused({ exitCode: child.status, stdout: child.stdout, stderr: child.stderr }, 'CLI_ARGUMENTS');
});

test('ordinary library import dispatches nothing and subsequent actual entry stdout failure cannot claim saved success', t => {
  const f = files(t);
  const source = `import fs from 'node:fs';
    const file = ${JSON.stringify(cli)}, argv = ${JSON.stringify(f.argv)}, url = ${JSON.stringify(new URL('./expert-submission-cli.mjs', import.meta.url).href)};
    await import(url + '?ordinary-library');
    if (fs.existsSync(${JSON.stringify(f.out)})) throw new Error('library import dispatched');
    const native = fs.writeSync;
    fs.writeSync = function(fd, buffer, ...args) { if (fd === 1) return 0; return native(fd, buffer, ...args); };
    process.argv = [process.execPath, file, ...argv];
    await import(url + '?owned-command-stdout-failure');
    fs.writeSync = native;`;
  const child = launch(['--input-type=module', '-e', source]);
  assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 1);
  assert.equal(child.stdout, ''); assert.equal(child.stderr, 'expert-submission-cli: CLI_STDIO\n');
  assert.deepEqual(snapshot(f.out), Buffer.from(JSON.stringify(reconcileExpertSubmissions(...coreArgs(f.s))) + '\n'));
  assert.equal(childEntries, 4);
});

async function sizePlan(t, s, sizes, code, admitted = false) {
  const f = files(t, s), map = new Map(Object.entries(sizes(f))); let reads = 0;
  const io = instrument({
    fstatSync(event, native) { const st = native(); return map.has(event.path) ? statWith(st, { size: BigInt(map.get(event.path)) }) : st; },
    lstatSync(event, native) { const st = native(); return map.has(event.path) ? statWith(st, { size: BigInt(map.get(event.path)) }) : st; },
    readSync() { reads++; throw new Error('synthetic preflight boundary; no payload read'); },
  });
  refused(await main(f.argv, { filesystem: io.filesystem, loadCore: async () => assert.fail('no core on preflight refusal') }), code);
  assert.equal(reads, admitted ? 1 : 0); assert.equal(io.held.size, 0);
  assert.equal(fs.existsSync(f.out), false); return f;
}

test('exact64 evidence and2 submissions admit72 inputs before first payload read and retain all inventory order', async t => {
  const f = files(t, scenario({ evidence: 64, returned: 2 })), io = instrument();
  const report = saved(f, await main(f.argv, io)); assert.equal(report.preparation.evidence_inventory.length, 64);
  const firstRead = io.events.findIndex(row => row.operation === 'readSync');
  assert.equal(io.events.slice(0, firstRead).filter(row => row.operation === 'openSync' && f.inputs.includes(row.path)).length, 72);
  assert.deepEqual(report.preparation.evidence_inventory.map(row => row.binding.original_base64), f.s.evidence.map(raw => raw.toString('base64')));
});

test('sixty-fifth evidence and third submission refuse count before any input open', async t => {
  const f = files(t);
  for (const [flag, count] of [['--evidence', 65], ['--submission', 3]]) {
    const argv = [...f.argv, ...Array.from({ length: count }, (_, i) => [flag, join(f.root, `extra-${i}`)]).flat()];
    const io = instrument(); refused(await main(argv, io), 'CLI_COUNT'); assert.equal(io.events.length, 0);
  }
});

test('every individual file cap-plus-one refuses before payload read core load or output creation', async t => {
  for (const name of ['gold', 'intake', 'evidenceInventory', 'intakeSettings', 'submissionInventory', 'auditSettings', 'evidence', 'submission']) {
    await sizePlan(t, scenario({ evidence: 1, returned: 1 }), f => ({
      [Array.isArray(f.paths[name]) ? f.paths[name][0] : f.paths[name]]: LIMITS[name] + 1,
    }), 'CLI_INPUT_BOUND');
  }
});

test('all evidence cap exactly256KiB reaches the bounded read but cap-plus-one refuses before any read', async t => {
  const plan = (f, over) => Object.fromEntries(f.paths.evidence.map((file, index) => [file,
    index < 8 ? LIMITS.evidence : over ? 1 : f.s.evidence[index].length]));
  await sizePlan(t, scenario({ evidence: 8 }), f => plan(f, false), 'CLI_READ', true);
  await sizePlan(t, scenario({ evidence: 9 }), f => plan(f, true), 'CLI_EVIDENCE_BOUND');
});

test('intake-prefix768KiB boundary includes all four original documents and evidence before any payload read', async t => {
  const sizes = (f, over) => ({ [f.paths.gold]: LIMITS.gold, [f.paths.intake]: LIMITS.intake,
    [f.paths.evidenceInventory]: LIMITS.evidenceInventory, [f.paths.intakeSettings]: LIMITS.intakeSettings,
    ...Object.fromEntries(f.paths.evidence.map((file, index) => [file, index < 4 ? LIMITS.evidence : 28 * 1024 + over])) });
  await sizePlan(t, scenario({ evidence: 5 }), f => sizes(f, 0), 'CLI_READ', true);
  await sizePlan(t, scenario({ evidence: 5 }), f => sizes(f, 1), 'CLI_INTAKE_BOUND');
});

test('all-input4MiB boundary counts both individually bounded submissions and all six metadata files', async t => {
  const plan = (f, over) => {
    const metadata = ['gold', 'intake', 'evidenceInventory', 'intakeSettings', 'submissionInventory', 'auditSettings']
      .reduce((sum, name) => sum + fs.lstatSync(f.paths[name]).size, 0);
    return { [f.paths.submission[0]]: LIMITS.submission,
      [f.paths.submission[1]]: LIMITS.inputTotal - metadata - LIMITS.submission + over };
  };
  await sizePlan(t, scenario({ returned: 2 }), f => plan(f, 0), 'CLI_READ', true);
  await sizePlan(t, scenario({ returned: 2 }), f => plan(f, 1), 'CLI_TOTAL_BOUND');
});

test('an empty physical file refuses with no payload read despite empty optional file arrays being valid', async t => {
  const f = files(t); fs.truncateSync(f.paths.gold, 0); const io = instrument();
  refused(await main(f.argv, io), 'CLI_INPUT_BOUND'); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0);
  assert.equal(io.held.size, 0);
});

test('input symlink and real directory refuse FD-first no-follow admission without following contents', async t => {
  const f = files(t), link = join(f.root, 'input-alias.json'); fs.symlinkSync(f.paths.gold, link);
  for (const file of [link, f.root]) {
    const argv = [...f.argv]; argv[1] = file; const io = instrument(); refused(await main(argv, io));
    const open = io.events.find(row => row.operation === 'openSync'); assert.ok(open.args[1] & fs.constants.O_NOFOLLOW);
    assert.ok(open.args[1] & fs.constants.O_NONBLOCK); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0);
    assert.equal(io.held.size, 0);
  }
});

test('synthetic FIFO socket device and unknown-owned types refuse before body allocation with nonblocking flags', async t => {
  for (const change of [{ isFile: () => false, isFIFO: () => true }, { isFile: () => false, isSocket: () => true },
    { isFile: () => false, isCharacterDevice: () => true }, { uid: BigInt(process.getuid()) + 1n }]) {
    const f = files(t), io = instrument({ fstatSync(event, native) { const st = native();
      return event.path === f.paths.gold ? statWith(st, change) : st; } });
    refused(await main(f.argv, io), 'CLI_INPUT_BOUND'); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0);
    assert.ok(io.events[0].args[1] & fs.constants.O_NONBLOCK); assert.equal(io.held.size, 0);
  }
});

test('hard-linked input and existing output inode aliases refuse without reading or creating an output', async t => {
  const f = files(t), alias = join(f.root, 'hard-link.json'); fs.linkSync(f.paths.gold, alias);
  const argv = [...f.argv]; argv[5] = alias; const io = instrument(); refused(await main(argv, io), 'CLI_ALIAS');
  assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0); assert.equal(io.held.size, 0);
  fs.linkSync(f.paths.gold, f.out); const second = instrument(); refused(await main(f.argv, second), 'CLI_ALIAS');
  assert.equal(second.events.filter(row => row.operation === 'readSync').length, 0); assert.deepEqual(snapshot(f.out), f.s.rawGold);
});

test('existing output file symlink and directory are retained unchanged with no core call', async t => {
  for (const kind of ['file', 'symlink', 'directory']) {
    const f = files(t), marker = Buffer.from('SYNTHETIC existing report; never replace');
    if (kind === 'file') fs.writeFileSync(f.out, marker, { flag: 'wx', mode: 0o600 });
    if (kind === 'symlink') fs.symlinkSync(f.paths.gold, f.out);
    if (kind === 'directory') fs.mkdirSync(f.out, { mode: 0o700 });
    const before = fs.lstatSync(f.out, { bigint: true }), io = instrument();
    refused(await main(f.argv, { filesystem: io.filesystem, loadCore: async () => assert.fail('existing output') }), 'CLI_OUTPUT');
    const after = fs.lstatSync(f.out, { bigint: true }); assert.equal(after.ino, before.ino); assert.equal(after.mode, before.mode);
    if (kind === 'file') assert.deepEqual(snapshot(f.out), marker);
    assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0);
  }
});

test('nonprivate missing and symlinked output parents refuse without mkdir chmod or input body reads', async t => {
  const f = files(t), shared = join(f.root, 'shared'), link = join(f.root, 'parent-link');
  fs.mkdirSync(shared, { mode: 0o755 }); fs.chmodSync(shared, 0o755); fs.symlinkSync(f.root, link);
  for (const parent of [shared, join(f.root, 'missing'), link]) {
    const argv = [...f.argv]; argv[15] = join(parent, 'out.json'); const io = instrument();
    refused(await main(argv, io), 'CLI_PARENT'); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0);
    assert.equal(io.held.size, 0);
  }
});

test('noncanonical symlink input parent is refused before payload reads even with a regular endpoint FD', async t => {
  const f = files(t), link = join(f.root, 'parent-alias'); fs.symlinkSync(f.root, link);
  const argv = [...f.argv]; argv[1] = join(link, 'gold.json'); const io = instrument();
  refused(await main(argv, io), 'CLI_INPUT_CHANGED'); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0);
});

test('real short reads and writes advance exactly while original buffers and readback remain byte-exact', async t => {
  const f = files(t, scenario({ returned: 2 })); let shortenedReads = 0, shortenedWrites = 0;
  const io = instrument({
    readSync(event) { const [fd, buffer, offset, length, position] = event.args;
      if (length > 7) shortenedReads++; return fs.readSync(fd, buffer, offset, Math.min(length, 7), position); },
    writeSync(event) { const [fd, buffer, offset, length, position] = event.args;
      if (length > 11) shortenedWrites++; return fs.writeSync(fd, buffer, offset, Math.min(length, 11), position); },
  });
  saved(f, await main(f.argv, io)); assert.ok(shortenedReads > 0 && shortenedWrites > 0); assert.equal(io.held.size, 0);
});

test('zero negative fractional oversized and thrown native read counts never dispatch the core', async t => {
  for (const value of [0, -1, 0.5, Number.NaN, '1', 'throw', 'oversized']) {
    const f = files(t), observation = {}, io = instrument({ readSync(event) {
      assert.equal(event.path, f.paths.gold);
      if (value === 'throw') throw new Error('secret read failure');
      return value === 'oversized' ? event.args[3] + 1 : value;
    } });
    refused(await main(f.argv, { filesystem: io.filesystem, loadCore: loader(observation) }), 'CLI_READ');
    assert.equal(observation.loads, undefined); assert.equal(io.held.size, 0); assert.equal(fs.existsSync(f.out), false);
  }
});

test('the one overflow byte detects growth and is never silently included in a successful raw binding', async t => {
  const f = files(t), size = f.s.rawGold.length; let overflow = 0;
  const io = instrument({ readSync(event, native) { if (event.path === f.paths.gold && event.args[4] === size) {
    overflow++; return 1; } return native(); } });
  refused(await main(f.argv, io), 'CLI_READ'); assert.equal(overflow, 1); assert.equal(fs.existsSync(f.out), false);
});

test('actual truncation during the admitted read refuses short-read uncertainty and closes all held inputs', async t => {
  const f = files(t); let truncated = false;
  const io = instrument({ readSync(event, native) { if (event.path === f.paths.gold && !truncated) {
    truncated = true; fs.truncateSync(f.paths.gold, 1); } return native(); } });
  refused(await main(f.argv, io), 'CLI_READ'); assert.equal(truncated, true); assert.equal(io.held.size, 0);
});

test('same-FD size mtime and ctime changes after capture refuse before core import', async t => {
  for (const key of ['size', 'mtimeNs', 'ctimeNs']) {
    const f = files(t); let readTarget = false, changed = false;
    const io = instrument({
      readSync(event, native) { if (event.path === f.paths.gold) readTarget = true; return native(); },
      fstatSync(event, native) { const st = native(); if (readTarget && event.path === f.paths.gold) {
        changed = true; return statWith(st, { [key]: st[key] + 1n }); } return st; },
    });
    refused(await main(f.argv, { filesystem: io.filesystem, loadCore: async () => assert.fail('changed input') }), 'CLI_INPUT_CHANGED');
    assert.equal(changed, true); assert.equal(io.held.size, 0);
  }
});

test('replacing the input path after opening its original FD refuses postpath identity before core', async t => {
  const f = files(t); let replaced = false;
  const io = instrument({ readSync(event, native) {
    const result = native(); if (event.path === f.paths.gold && !replaced) {
      replaced = true; fs.renameSync(f.paths.gold, join(f.root, 'original-gold.json'));
      fs.writeFileSync(f.paths.gold, f.s.rawGold, { flag: 'wx', mode: 0o600 });
    } return result;
  } });
  refused(await main(f.argv, io), 'CLI_INPUT_CHANGED'); assert.equal(replaced, true); assert.equal(fs.existsSync(f.out), false);
});

test('an earlier captured file changed during a later read is caught by the final whole-inventory observation', async t => {
  const f = files(t); let changed = false;
  const io = instrument({ readSync(event, native) { if (event.path === f.paths.auditSettings && !changed) {
    changed = true; fs.appendFileSync(f.paths.gold, ' '); } return native(); } });
  refused(await main(f.argv, io), 'CLI_INPUT_CHANGED'); assert.equal(changed, true); assert.equal(io.held.size, 0);
});

test('source import failure happens after input release and never creates output or echoes exception details', async t => {
  const f = files(t), io = instrument(); let loads = 0;
  const result = await main(f.argv, { filesystem: io.filesystem, loadCore: async () => {
    loads++; assert.deepEqual([...io.held.values()], [f.root]); throw new Error(f.root + ' secret');
  } });
  refused(result, 'CLI_SOURCE'); assert.equal(loads, 1); assert.equal(io.held.size, 0); assert.equal(fs.existsSync(f.out), false);
});

test('core refusal is called once with captured bytes and cannot create or retry an output', async t => {
  const f = files(t), observation = {}, io = instrument();
  refused(await main(f.argv, { filesystem: io.filesystem, loadCore: loader(observation, () => { throw new Error('SYNTHETIC secret'); }) }), 'CLI_RECONCILE');
  assert.equal(observation.loads, 1); assert.equal(observation.calls, 1); assert.equal(fs.existsSync(f.out), false); assert.equal(io.held.size, 0);
});

test('serialized core-report cap includes all JSON overhead and refuses before output creation', async t => {
  const f = files(t), io = instrument(), observation = {};
  const result = await main(f.argv, { filesystem: io.filesystem,
    loadCore: loader(observation, () => ({ coverage: { selected_n: 3, role_submissions_provided_n: 0 }, payload: 'x'.repeat(LIMITS.report) })) });
  refused(result, 'CLI_REPORT_BOUND'); assert.equal(observation.calls, 1); assert.equal(fs.existsSync(f.out), false);
  assert.equal(io.events.filter(row => row.operation === 'writeSync').length, 0); assert.equal(io.held.size, 0);
});

test('exact6MiB serialized report admits exactly one additional newline and byte-identical native readback', async t => {
  const f = files(t), shell = { coverage: { selected_n: 3, role_submissions_provided_n: 0 }, payload: '' };
  const overhead = Buffer.byteLength(JSON.stringify(shell)); shell.payload = 'x'.repeat(LIMITS.report - overhead);
  const result = await main(f.argv, { loadCore: loader({}, () => shell) });
  assert.equal(result.exitCode, 0); const raw = snapshot(f.out); assert.equal(raw.length, LIMITS.reportFile);
  assert.equal(raw.at(-1), 10); assert.deepEqual(raw, Buffer.from(JSON.stringify(shell) + '\n'));
  assert.equal(JSON.parse(result.stdout).report_bytes, LIMITS.reportFile);
});

test('uncertain native output creation and existing-name race refuse without overwrite or auto-cleanup', async t => {
  const f = files(t), marker = Buffer.from('SYNTHETIC output-name race'); let created = false;
  const io = instrument({ openSync(event, native) {
    if (event.path === f.out) { assert.ok(event.args[1] & fs.constants.O_EXCL); assert.ok(event.args[1] & fs.constants.O_NOFOLLOW);
      created = true; fs.writeFileSync(f.out, marker, { flag: 'wx', mode: 0o600 }); }
    return native();
  } });
  refused(await main(f.argv, io), 'CLI_OUTPUT'); assert.equal(created, true); assert.deepEqual(snapshot(f.out), marker);
  assert.equal(io.events.filter(row => row.operation === 'writeSync').length, 0); assert.equal(io.held.size, 0);
});

test('zero negative noninteger oversized and throwing write counts retain the created private file and refuse', async t => {
  for (const value of [0, -1, 0.5, Number.NaN, '1', 'throw', 'oversized']) {
    const f = files(t); let writes = 0;
    const io = instrument({ writeSync(event) { assert.equal(event.path, f.out); writes++;
      if (value === 'throw') throw new Error('secret write details');
      return value === 'oversized' ? event.args[3] + 1 : value;
    } });
    refused(await main(f.argv, io), 'CLI_WRITE'); assert.equal(writes, 1);
    assert.ok(fs.lstatSync(f.out).isFile()); assert.equal(fs.lstatSync(f.out).mode & 0o777, 0o600); assert.equal(io.held.size, 0);
  }
});

test('write failure after real partial progress retains exactly those private bytes without unlink or retry', async t => {
  const f = files(t); let calls = 0;
  const io = instrument({ writeSync(event) {
    calls++; if (calls > 1) return 0;
    const [fd, buffer, offset, , position] = event.args; return fs.writeSync(fd, buffer, offset, 13, position);
  } });
  refused(await main(f.argv, io), 'CLI_WRITE'); assert.equal(calls, 2);
  assert.deepEqual(snapshot(f.out), Buffer.from(JSON.stringify(reconcileExpertSubmissions(...coreArgs(f.s))) + '\n').subarray(0, 13));
});

test('file fsync failure retains complete private output but forbids directory fsync and terminal success', async t => {
  const f = files(t); let fileFlushes = 0, directoryFlushes = 0;
  const io = instrument({ fsyncSync(event, native) {
    if (event.path === f.out) { fileFlushes++; throw new Error('uncertain file durability'); }
    directoryFlushes++; return native();
  } });
  refused(await main(f.argv, io), 'CLI_FLUSH'); assert.equal(fileFlushes, 1); assert.equal(directoryFlushes, 0);
  assert.ok(snapshot(f.out).length > 0); assert.equal(io.held.size, 0);
});

test('directory fsync failure after known file close retains output and forbids successful terminal status', async t => {
  const f = files(t); let directoryFlushes = 0;
  const io = instrument({ fsyncSync(event, native) {
    if (event.path === f.root) { directoryFlushes++;
      assert.ok(![...io.held.values()].includes(f.out)); throw new Error('uncertain directory durability'); }
    return native();
  } });
  refused(await main(f.argv, io), 'CLI_FLUSH'); assert.equal(directoryFlushes, 1);
  assert.deepEqual(snapshot(f.out), Buffer.from(JSON.stringify(reconcileExpertSubmissions(...coreArgs(f.s))) + '\n'));
  assert.equal(io.held.size, 0);
});

test('readback byte corruption zero count and overflow refuse with complete private file retained', async t => {
  for (const kind of ['byte', 'zero', 'overflow']) {
    const f = files(t); let targeted = 0;
    const io = instrument({ readSync(event, native) {
      if (event.path !== f.out) return native();
      if (kind === 'zero') { targeted++; return 0; }
      if (kind === 'overflow' && event.args[3] === 1) { targeted++; return 1; }
      const count = native();
      if (kind === 'byte' && event.args[4] === 0 && count > 0) { targeted++; event.args[1][event.args[2]] ^= 1; }
      return count;
    } });
    refused(await main(f.argv, io), 'CLI_READBACK'); assert.equal(targeted, 1);
    assert.equal(fs.lstatSync(f.out).mode & 0o777, 0o600); assert.equal(io.held.size, 0);
  }
});

test('native write size and post-readback FD changes refuse output certainty without deleting the file', async t => {
  for (const stage of ['size', 'readback']) {
    const f = files(t); let flushed = false, readback = false, hits = 0;
    const io = instrument({
      fsyncSync(event, native) { if (event.path === f.out) flushed = true; return native(); },
      readSync(event, native) { if (event.path === f.out) readback = true; return native(); },
      fstatSync(event, native) { const st = native();
        if (event.path === f.out && (stage === 'size' ? flushed : readback)) {
          hits++; return statWith(st, stage === 'size' ? { size: st.size + 1n } : { ctimeNs: st.ctimeNs + 1n });
        } return st;
      },
    });
    refused(await main(f.argv, io), stage === 'size' ? 'CLI_OUTPUT_CHANGED' : 'CLI_READBACK');
    assert.equal(hits, 1); assert.equal(io.held.size, 0); assert.ok(fs.lstatSync(f.out).isFile());
  }
});

test('post-write output pathname replacement refuses even when saved FD readback bytes still match', async t => {
  const f = files(t), displaced = join(f.root, 'retained-original-report.json');
  let readback = false, observedFD = false, swapped = false;
  const io = instrument({
    readSync(event, native) { if (event.path === f.out) readback = true; return native(); },
    fstatSync(event, native) { const st = native(); if (event.path === f.out && readback) observedFD = true; return st; },
    lstatSync(event, native) {
      // Rename only after final same-FD readback observation, so this fault actually reaches the postpath guard.
      if (event.path === f.out && observedFD && !swapped) {
        swapped = true; fs.renameSync(f.out, displaced);
        fs.writeFileSync(f.out, 'SYNTHETIC replacement', { flag: 'wx', mode: 0o600 });
      }
      return native();
    },
  });
  refused(await main(f.argv, io), 'CLI_OUTPUT_CHANGED');
  assert.equal(readback, true); assert.equal(observedFD, true); assert.equal(swapped, true);
  assert.equal(snapshot(f.out).toString(), 'SYNTHETIC replacement');
  assert.deepEqual(snapshot(displaced), Buffer.from(JSON.stringify(reconcileExpertSubmissions(...coreArgs(f.s))) + '\n'));
});

test('output-parent identity replacement after exclusive create retains original private file and refuses', async t => {
  const f = files(t), parent = join(f.root, 'private-output'), old = join(f.root, 'retained-parent');
  fs.mkdirSync(parent, { mode: 0o700 }); f.out = join(parent, 'report.json'); f.argv[15] = f.out; let swapped = false;
  const io = instrument({ openSync(event, native) { const fd = native();
    if (event.path === f.out) { swapped = true; fs.renameSync(parent, old); fs.mkdirSync(parent, { mode: 0o700 }); }
    return fd;
  } });
  refused(await main(f.argv, io), 'CLI_PARENT'); assert.equal(swapped, true);
  assert.ok(fs.lstatSync(join(old, 'report.json')).isFile()); assert.equal(fs.existsSync(f.out), false); assert.equal(io.held.size, 0);
});

test('output parent losing privacy before completion prevents success and retains the uncommitted report', async t => {
  const f = files(t), parent = join(f.root, 'private-output'); fs.mkdirSync(parent, { mode: 0o700 });
  f.out = join(parent, 'report.json'); f.argv[15] = f.out; let changed = false;
  const io = instrument({ fsyncSync(event, native) {
    if (event.path === f.out) { changed = true; fs.chmodSync(parent, 0o755); } return native();
  } });
  refused(await main(f.argv, io), 'CLI_PARENT'); assert.equal(changed, true); assert.ok(snapshot(f.out).length > 0);
});

async function closeReuse(t, name) {
  const f = files(t), foreignPath = join(f.root, 'foreign-synthetic-descriptor.txt');
  fs.writeFileSync(foreignPath, 'FOREIGN SYNTHETIC FD MUST STAY OPEN', { flag: 'wx', mode: 0o600 });
  const target = name === 'input' ? f.paths.gold : name === 'output' ? f.out : f.root;
  let targetFD, foreignFD, triggered = false, attempts = 0;
  t.after(() => { if (foreignFD !== undefined) fs.closeSync(foreignFD); });
  const io = instrument({ closeSync(event, native) {
    if (event.path !== target || triggered) {
      if (event.fd === targetFD) attempts++;
      return native();
    }
    attempts++; triggered = true; targetFD = event.fd;
    // Fill only known lower-numbered holes so the oracle actually reuses this FD, including the parent FD.
    const reserved = [];
    try {
      for (let index = 0; index < 80; index++) {
        const fd = fs.openSync(foreignPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        if (fd > targetFD) { fs.closeSync(fd); break; }
        assert.ok(fd < targetFD); reserved.push(fd);
      }
      fs.closeSync(targetFD);
      foreignFD = fs.openSync(foreignPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      assert.equal(foreignFD, targetFD, 'the real released number must now designate a foreign owned fixture FD');
    } finally { for (const fd of reserved) fs.closeSync(fd); }
    throw new Error('synthetic close threw AFTER release and foreign numeric reuse');
  } });
  const observation = {}, result = await main(f.argv, { filesystem: io.filesystem, loadCore: loader(observation) });
  refused(result, 'CLI_CLOSE'); assert.equal(triggered, true); assert.equal(attempts, 1); assert.equal(io.held.size, 0);
  assert.ok(fs.fstatSync(foreignFD).isFile());
  const check = Buffer.alloc(7); assert.equal(fs.readSync(foreignFD, check, 0, 7, 0), 7); assert.equal(check.toString(), 'FOREIGN');
  if (name === 'input') { assert.equal(observation.loads, undefined); assert.equal(fs.existsSync(f.out), false); }
  else { assert.equal(observation.calls, 1); assert.deepEqual(snapshot(f.out), Buffer.from(JSON.stringify(reconcileExpertSubmissions(...coreArgs(f.s))) + '\n')); }
}

test('input close after actual release and FD reuse is attempted once while foreign FD remains open and core stays unloaded', async t => {
  await closeReuse(t, 'input');
});

test('output close after actual release and FD reuse retains complete report and never closes the foreign FD', async t => {
  await closeReuse(t, 'output');
});

test('parent close after actual release and FD reuse refuses success without a foreign second close', async t => {
  await closeReuse(t, 'parent');
});

test('close throwing before release remains uncertain and is never retried while other owned inputs are released', async t => {
  const f = files(t); let uncertainFD, attempts = 0;
  t.after(() => { if (uncertainFD !== undefined) fs.closeSync(uncertainFD); });
  const io = instrument({ closeSync(event, native) {
    if (event.path === f.paths.gold) { uncertainFD = event.fd; attempts++; throw new Error('synthetic uncertain close'); }
    return native();
  } });
  refused(await main(f.argv, io), 'CLI_CLOSE'); assert.equal(attempts, 1); assert.equal(io.held.size, 0);
  assert.ok(fs.fstatSync(uncertainFD).isFile()); assert.equal(fs.existsSync(f.out), false);
});

test('first read refusal stays sticky when cleanup close also throws after releasing its descriptor', async t => {
  const f = files(t); let closeHits = 0;
  const io = instrument({ readSync() { throw new Error('first synthetic read failure'); },
    closeSync(event, native) { const result = native(); if (event.path === f.paths.gold) {
      closeHits++; throw new Error('later synthetic close failure'); } return result; } });
  refused(await main(f.argv, io), 'CLI_READ'); assert.equal(closeHits, 1); assert.equal(io.held.size, 0);
});

test('private output flush readback file close directory flush and directory close occur in required order', async t => {
  const f = files(t), io = instrument(); saved(f, await main(f.argv, io));
  const eventIndex = (operation, path) => io.events.findIndex(row => row.operation === operation && row.path === path);
  const indices = [eventIndex('writeSync', f.out), eventIndex('fsyncSync', f.out), eventIndex('readSync', f.out),
    eventIndex('closeSync', f.out), eventIndex('fsyncSync', f.root), eventIndex('closeSync', f.root)];
  assert.ok(indices.every(index => index >= 0)); assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  assert.equal(io.held.size, 0);
});

test('filesystem effect guard permits only the explicit exclusive private output and no hidden shared helper mutation', async t => {
  const f = files(t, scenario({ evidence: 1, returned: 2 })), io = instrument(); saved(f, await main(f.argv, io));
  for (const row of io.events.filter(row => row.operation === 'writeSync' || row.operation === 'fsyncSync')) {
    assert.ok(row.path === f.out || (row.operation === 'fsyncSync' && row.path === f.root));
  }
  const source = snapshot(cli, 64 * 1024).toString('utf8');
  const imports = [...source.matchAll(/^import .*? from '([^']+)';$/gm)].map(match => match[1]);
  assert.deepEqual(imports, ['node:fs', 'node:crypto', 'node:path', 'node:url', 'node:util']);
  assert.deepEqual([...source.matchAll(/import\('([^']+)'\)/g)].map(match => match[1]), ['./expert-submission-audit.mjs']);
  assert.ok(!/\b(?:spawn|exec|fetch|request|readFileSync|writeFileSync|unlinkSync|mkdirSync|chmodSync)\s*\(/.test(source));
  assert.ok(suppliedFixtureBytes < 12 * 1024 * 1024); assert.equal(childEntries, 4);
});
