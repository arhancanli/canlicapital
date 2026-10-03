import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT = join(ROOT, 'mcp-fundamentals/examples/audit-inputs-client.mjs');
const SERVER = join(ROOT, 'mcp-fundamentals/src/audit-inputs-stdio.mjs');
const TMP = fs.mkdtempSync(join(tmpdir(), 'canli-audit-client-'));
const original = Object.fromEntries(['openSync', 'readSync', 'fstatSync', 'closeSync', 'readFileSync', 'writeFileSync', 'symlinkSync', 'rmSync'].map(k => [k, fs[k]]));
const originalSpawn = cp.spawn;
let launches = 0;
const children = [];
const savedMethods = [];
const guardError = () => { const e = new Error('NATIVE_DENIAL_CONTROL'); e.code = 'NATIVE_DENIAL_CONTROL'; throw e; };
const temporary = value => {
  if (value instanceof URL) value = fileURLToPath(value);
  return typeof value === 'string' && (resolve(value) === TMP || resolve(value).startsWith(TMP + '/'));
};
function replace(object, key, value) { savedMethods.push([object, key, object[key]]); object[key] = value; }
function writeGuard(name) {
  const real = fs[name];
  return (...args) => {
    if (name === 'symlinkSync') {
      if (!temporary(args[1]) || !(temporary(args[0]) || args[0] === CLIENT)) guardError();
    } else if (!temporary(args[0]) || ((name === 'renameSync' || name === 'copyFileSync' || name === 'linkSync') && !temporary(args[1]))) guardError();
    return real(...args);
  };
}
// Arm native denial before ANY example/SDK/executor import. Only owned temp fixtures
// and precisely three fixed stdio children are admitted; no network or other command.
for (const [object, names] of [[http, ['request', 'get']], [https, ['request', 'get']], [net, ['connect', 'createConnection']], [tls, ['connect']], [dgram, ['createSocket']], [dns, ['lookup', 'resolve', 'resolve4', 'resolve6']]]) for (const name of names) replace(object, name, guardError);
replace(net.Server.prototype, 'listen', guardError);
const priorFetch = globalThis.fetch; globalThis.fetch = guardError;
for (const name of ['writeFile', 'appendFile', 'mkdir', 'rename', 'rm', 'unlink', 'truncate', 'copyFile', 'cp', 'symlink', 'link', 'chmod', 'chown']) {
  if (fs[name]) replace(fs, name, guardError);
  if (fsp[name]) replace(fsp, name, guardError);
}
for (const name of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'rmSync', 'unlinkSync', 'truncateSync', 'copyFileSync', 'cpSync', 'symlinkSync', 'linkSync', 'chmodSync', 'chownSync']) if (fs[name]) replace(fs, name, writeGuard(name));
replace(fs, 'createWriteStream', guardError);
replace(fs, 'openSync', (path, flags, ...args) => {
  const writable = typeof flags === 'string' ? /[wa+]/.test(flags) : (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0;
  if (writable && !temporary(path)) guardError();
  return original.openSync(path, flags, ...args);
});
for (const object of [fs, fsp]) {
  const open = object.open;
  replace(object, 'open', (path, flags, ...args) => {
    const writable = typeof flags === 'string' ? /[wa+]/.test(flags) : (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0;
    if (writable) guardError();
    return open(path, flags, ...args);
  });
}
for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'fork', 'spawnSync']) replace(cp, name, guardError);
const CHILD_MARKER = 'AUDIT_CLIENT_NATIVE_GUARD_ACTIVE\n';
const childGuard = join(TMP, 'no-network-write-preload.mjs');
fs.writeFileSync(childGuard, `
import fs from 'node:fs'; import fsp from 'node:fs/promises';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
import tls from 'node:tls'; import dgram from 'node:dgram'; import dns from 'node:dns';
import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
const denied = () => { const e = new Error('NATIVE_DENIAL_CONTROL'); e.code = 'NATIVE_DENIAL_CONTROL'; throw e; };
globalThis.fetch = denied;
for (const [o,names] of [[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],[tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]]) for (const n of names) o[n]=denied;
net.Server.prototype.listen=denied;
for (const n of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','rename','renameSync','rm','rmSync','unlink','unlinkSync','truncate','truncateSync','createWriteStream','copyFile','copyFileSync','cp','cpSync','symlink','symlinkSync','link','linkSync','chmod','chmodSync','chown','chownSync']) { if(fs[n])fs[n]=denied; if(fsp[n])fsp[n]=denied; }
const open=fs.openSync;
fs.openSync=(p,f,...a)=> { const writes=typeof f==='string'?/[wa+]/.test(f):(f&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND))!==0; if(writes)denied(); return open(p,f,...a); };
for(const o of [fs,fsp]) { const open=o.open; o.open=(p,f,...a)=>{const writes=typeof f==='string'?/[wa+]/.test(f):(f&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND))!==0;if(writes)denied();return open(p,f,...a);}; }
for(const n of ['write','writeSync','writev','writevSync']) {const original=fs[n];fs[n]=(...a)=>a[0]===1||a[0]===2?original(...a):denied();}
for(const n of ['exec','execSync','execFile','execFileSync','fork','spawn','spawnSync'])cp[n]=denied;
syncBuiltinESMExports();
let controls=0;
for(const f of [()=>fetch('https://invalid.invalid'),()=>fs.writeFileSync('/unallocated-audit-client-proof','x'),()=>cp.spawn('unallocated')])try{f();throw new Error('DENIAL_NOT_ACTIVE');}catch(e){if(e.code!=='NATIVE_DENIAL_CONTROL')throw e;controls++;}
if(controls!==3)throw new Error('DENIAL_NOT_ACTIVE');
process.stderr.write(${JSON.stringify(CHILD_MARKER)});
`, { mode: 0o600 });
replace(cp, 'spawn', (command, args, options) => {
  assert.equal(command, process.execPath);
  assert.deepEqual(args, [SERVER]);
  assert.equal(options.shell, false); assert.equal(options.cwd, ROOT);
  assert.ok(++launches <= 3, 'at most three actual SDK stdio child entries');
  assert.equal(options.env.NODE_OPTIONS, undefined); // Test preload is explicit, not inherited.
  const child = originalSpawn(command, ['--import', pathToFileURL(childGuard).href, ...args], options);
  children.push(child); return child;
});
syncBuiltinESMExports();

const { runAuditInputsClient, runAuditInputsFiles, captureAuditInputFiles, parseAuditClientArgs, auditClientCli, AuditClientError, AUDIT_CLIENT_LIMITS } = await import('../examples/audit-inputs-client.mjs');
const { executeAuditInputs, AUDIT_TOOL } = await import('../src/audit-inputs-stdio.mjs');
const { contentHash } = await import('../src/canonical-json.mjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const raw = value => Buffer.from(JSON.stringify(value));
const CIK = '0000123456';
const usage = (changes = {}) => ({ cik: CIK, taxonomy: 'us-gaap', concept: 'Assets', unit: 'USD', start: null, end: '2019-12-31', value: 100, used_on: '2020-03-01', ...changes });
const vintage = (changes = {}) => ({ end: '2019-12-31', val: 100, accn: '0000123456-20-000001', filed: '2020-02-10', form: '10-K', ...changes });
function fixture({ rows = [usage()], vintages = [vintage()], facts = {}, referenceWhitespace = false } = {}) {
  const reference = { schema: 'canli.fundamentals.audit-reference.v1', companyfacts: [{ cik: 123456, facts: { 'us-gaap': { Assets: { units: { USD: vintages } }, ...facts } } }] };
  return {
    reference: Buffer.from((referenceWhitespace ? ' \n' + JSON.stringify(reference, null, 2) + '\t\n' : JSON.stringify(reference))),
    usage: raw(rows),
    settings: raw({ schema: 'canli.fundamentals.audit-settings.v1', snapshot_captured_at: null, capture_reason: 'Synthetic supplied bytes, no authenticated capture.', completeness: 'partial', completeness_reason: 'Only selected synthetic observations supplied.', implementation_source_sha256: null }),
  };
}
function sixRows() {
  return fixture({ referenceWhitespace: true,
    rows: [usage(), usage({ value: 999 }), usage({ concept: 'Missing' }), usage({ concept: 'Ambiguous' }), usage({ unit: 'EUR' }), usage({ used_on: '2020-02-10' })],
    facts: { Ambiguous: { units: { USD: [vintage(), vintage({ val: 99, accn: '0000123456-20-000002' })] } } },
  });
}
function requestFor(f) { return { reference_base64: f.reference.toString('base64'), expected_reference_sha256: sha(f.reference), usage_base64: f.usage.toString('base64'), settings_base64: f.settings.toString('base64'), detail: 'compact' }; }
const clone = value => JSON.parse(JSON.stringify(value));
function rewrite(reply, change) {
  const result = clone(reply); change(result.structuredContent);
  result.structuredContent.content_hash = contentHash(result.structuredContent, createHash);
  result.content[0].text = JSON.stringify(result.structuredContent); return result;
}
function injected({ connect, call, close } = {}) {
  const effects = { connect: 0, call: 0, close: 0, requests: [] };
  const operations = {
    connect(options) { effects.connect++; return connect?.(options); },
    callTool(request, options) { effects.call++; effects.requests.push(request); assert.deepEqual(options.toolDefinition, AUDIT_TOOL); assert.ok(options.timeout > 0 && options.timeout <= 15000); return call ? call(request, options) : executeAuditInputs(request.arguments); },
    close() { effects.close++; return close ? close() : { owned_pid: null, owned_child_absent: true, evidence: 'injected_no_child' }; },
  };
  return { effects, operations };
}
function syntheticSdk(beforeWrite = async () => {}, { serialize = message => message, backpressure = false, writeError = false } = {}) {
  const effects = { starts: 0, writes: 0, transportCloses: 0, clientCloses: 0 };
  const frames = []; let serializations = 0, drainListeners = 0, drains = 0;
  class StdioClientTransport {
    constructor(parameters) { assert.equal(parameters.command, process.execPath); assert.deepEqual(parameters.args, [SERVER]); assert.equal(parameters.maxBufferSize, 524288); this.stderr = { on() {} }; }
    start() {
      effects.starts++; this._process = new EventEmitter();
      const stdin = this._process.stdin = new EventEmitter();
      stdin.write = frame => {
        effects.writes++; frames.push(frame);
        if (writeError) throw new Error('SYNTHETIC_PRIVATE_WRITE_ERROR');
        if (backpressure) {
          queueMicrotask(() => { assert.equal(stdin.listenerCount('drain'), 1); drains++; stdin.emit('drain'); });
          return false;
        }
        return true;
      };
      stdin.on('newListener', name => { if (name === 'drain') drainListeners++; });
      return Promise.resolve();
    }
    send() { assert.fail('Owned adapter must serialize and guard the native writer itself'); }
    close() { effects.transportCloses++; this._process?.emit('close'); this._process = undefined; return Promise.resolve(); }
  }
  class Client {
    constructor(identity, options) { assert.deepEqual(options.versionNegotiation, { mode: 'legacy' }); assert.equal(options.inputRequired.autoFulfill, false); }
    async connect(transport) { this.transport = transport; await transport.start(); }
    async callTool(request, options) {
      assert.deepEqual(options.toolDefinition, AUDIT_TOOL);
      await beforeWrite(); // Model pinned SDK's queued schema/send-options work.
      const message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: request };
      await this.transport.send({ toJSON: () => { serializations++; return serialize(message, this.transport); } });
      const result = clone(executeAuditInputs(request.arguments)); delete result.resultType;
      return result; // Exact legacy complete-return shape, not a live SDK entry.
    }
    close() { effects.clientCloses++; return this.transport.close(); }
  }
  return { effects, frames, serialized: () => serializations, drainCounts: () => ({ listeners: drainListeners, emissions: drains }), sdkModules: { Client, StdioClientTransport } };
}
function run(f = fixture(), options = {}, control = injected()) {
  return runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { ...options, operations: control.operations });
}
function refused(result, code, control, calls) {
  assert.equal(result.report.status, 'refused'); assert.equal(result.report.error.code, code);
  assert.ok(Buffer.byteLength(result.encoded) <= 2048); assert.equal(result.report.artifact, undefined);
  assert.deepEqual(JSON.parse(result.encoded), result.report);
  if (control) { assert.equal(control.effects.call, calls); assert.ok(control.effects.connect <= 1); assert.ok(control.effects.close <= 1); }
}
function writeFixture(f, label) {
  const out = { root: ROOT, expected_reference_sha256: sha(f.reference) };
  for (const key of ['reference', 'usage', 'settings']) { out[key] = join(TMP, label + '-' + key + '.json'); fs.writeFileSync(out[key], f[key], { mode: 0o600 }); }
  return out;
}
function argsFor(paths) { return ['--root', paths.root, '--reference', paths.reference, '--expected-reference-sha256', paths.expected_reference_sha256, '--usage', paths.usage, '--settings', paths.settings]; }
function pidAbsent(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH'); // Only this known owned PID.
}
function sdkClosed(result, before) {
  assert.equal(launches, before + 1);
  assert.equal(result.report.lifecycle.connect_attempts, 1); assert.equal(result.report.lifecycle.audit_calls, 1);
  assert.equal(result.report.lifecycle.close_attempts, 1); assert.equal(result.report.lifecycle.owned_child_absent, true);
  assert.equal(result.report.lifecycle.closure_evidence, 'same_owned_child_exit_or_close');
  assert.equal(result.report.lifecycle.stderr_bytes, Buffer.byteLength(CHILD_MARKER));
  pidAbsent(result.report.lifecycle.owned_pid);
}
async function actualEntry(entry, paths, nonce) {
  const priorArgv = process.argv, priorWrite = process.stdout.write, priorExit = process.exitCode;
  let output = '', writes = 0;
  process.argv = [process.execPath, entry, ...argsFor(paths)];
  process.stdout.write = function (chunk, encoding, callback) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
    // Node's test runner can write reporting/IPC frames while entry awaits its
    // child. Observe only this CLI terminal; preserve every native runner frame.
    if (typeof text !== 'string' || !text.startsWith('{"schema":"canli.fundamentals.audit-client-result.v1",')) return priorWrite.call(this, chunk, encoding, callback);
    output += text; writes++;
    assert.ok(Buffer.byteLength(output) <= 524288);
    if (typeof encoding === 'function') encoding(); else callback?.(); return true;
  };
  try {
    await import(pathToFileURL(CLIENT).href + '?actual-entry=' + nonce);
    assert.equal(writes, 1); assert.equal(process.exitCode, 0);
    return { report: JSON.parse(output), encoded: output };
  } finally { process.argv = priorArgv; process.stdout.write = priorWrite; process.exitCode = priorExit; }
}
after(() => {
  assert.equal(launches, 3, 'exactly three SDK child entries in this file');
  for (const child of children) { assert.notEqual(child.pid, undefined); pidAbsent(child.pid); }
  for (const [object, key, value] of savedMethods.reverse()) object[key] = value;
  globalThis.fetch = priorFetch; syncBuiltinESMExports(); original.rmSync(TMP, { recursive: true, force: true });
});

test('audit client: native network/write/command denial is active before imports with owned fixture allowance', () => {
  for (const operation of [() => fetch('https://invalid.invalid'), () => fs.writeFileSync(join(ROOT, 'unallocated'), 'x'), () => cp.exec('unallocated')]) assert.throws(operation, error => error.code === 'NATIVE_DENIAL_CONTROL');
  const path = join(TMP, 'positive-control'); fs.writeFileSync(path, 'owned'); assert.equal(fs.readFileSync(path, 'utf8'), 'owned');
  assert.equal(launches, 0);
});
test('audit client: native full selected denominator and six statuses preserve exact whitespace bindings and nulls', async () => {
  const f = sixRows(), result = await run(f);
  assert.equal(result.report.status, 'ok');
  assert.deepEqual(clone(result.report.artifact), clone(executeAuditInputs(requestFor(f)).structuredContent));
  assert.deepEqual(result.report.artifact.audit.coverage.counts, { match: 1, mismatch: 1, missing: 1, ambiguous: 1, unsupported: 1, timing_indeterminate: 1 });
  assert.equal(result.report.artifact.audit.rows.length, 6);
  for (const key of ['reference', 'usage', 'settings']) assert.deepEqual(result.report.artifact.audit.bindings[key], { bytes: f[key].length, sha256: sha(f[key]) });
  assert.equal(result.report.artifact.audit.implementation.declared_module_sha256_verified, false);
  assert.equal(Object.hasOwn(result.report.artifact.audit.implementation, 'runtime_identity_verified'), false);
  assert.equal(result.report.artifact.projection.complete_core_report, false);
});
test('audit client: every selected row remains present at the 64-row boundary', async () => {
  const result = await run(fixture({ rows: Array.from({ length: 64 }, () => usage({ concept: 'Missing' })) }));
  assert.equal(result.report.status, 'ok'); assert.equal(result.report.artifact.audit.rows.length, 64);
  assert.equal(result.report.artifact.audit.coverage.verdict_unknown_n, 64);
});
test('audit client: same-day timing retains an older selected diagnostic and null verdict', async () => {
  const result = await run(fixture({ rows: [usage({ used_on: '2020-02-10T23:59:59Z' })], vintages: [vintage({ filed: '2020-02-09' }), vintage({ val: 101 })] }));
  assert.equal(result.report.status, 'ok'); const row = result.report.artifact.audit.rows[0];
  assert.equal(row.status, 'timing_indeterminate'); assert.equal(row.verdict, null);
  assert.equal(row.selected.filed, '2020-02-09'); assert.equal(row.selected_reason, null);
});
test('audit client: primitive SHA type/length/case is required before clock or transport callbacks', async () => {
  const f = fixture(); let callbacks = 0;
  for (const value of [[sha(f.reference)], { toString() { callbacks++; return sha(f.reference); } }, sha(f.reference).toUpperCase(), 'a'.repeat(63), null]) {
    const result = await runAuditInputsClient(f.reference, value, f.usage, f.settings, { now() { callbacks++; return 0; }, operations: { connect() { callbacks++; } } }); refused(result, 'EXPECTED_SHA');
  }
  assert.equal(callbacks, 0);
});
test('audit client: separately supplied SHA mismatch stops before connect with no repaired input', async () => {
  const f = fixture(), control = injected();
  const result = await runAuditInputsClient(f.reference, 'f'.repeat(64), f.usage, f.settings, { operations: control.operations });
  refused(result, 'REFERENCE_SHA', control, 0); assert.equal(control.effects.connect, 0);
});
test('audit client: input native slots ignore own byteLength getters and preserve original bytes', async () => {
  const f = fixture(); let traps = 0;
  Object.defineProperty(f.reference, 'byteLength', { get() { traps++; throw new Error('trap'); } });
  const before = sha(f.reference); const result = await run(f); assert.equal(result.report.status, 'ok'); assert.equal(traps, 0); assert.equal(sha(f.reference), before);
});
test('audit client: proxy/shared/subclass and ordinary objects refuse before transport', async () => {
  const f = fixture(); let traps = 0;
  class ExtraBytes extends Uint8Array {}
  for (const bytes of [new Proxy(f.reference, { get() { traps++; throw new Error('trap'); } }), new Uint8Array(new SharedArrayBuffer(8)), new ExtraBytes(8), { length: 8 }]) {
    const control = injected(); const result = await runAuditInputsClient(bytes, sha(f.reference), f.usage, f.settings, { operations: control.operations }); refused(result, 'INPUT_BYTES', control, 0); assert.equal(control.effects.connect, 0);
  }
  assert.equal(traps, 0);
});
test('audit client: each native per-input +1 cap refuses before dispatch', async () => {
  for (const key of ['reference', 'usage', 'settings']) { const f = fixture(); f[key] = Buffer.alloc(AUDIT_CLIENT_LIMITS[key] + 1, 32); const control = injected(); refused(await run(f, {}, control), 'INPUT_BOUND', control, 0); assert.equal(control.effects.connect, 0); }
});
function paddedFixture(referenceN, usageN, settingsN) {
  const f = fixture(); for (const [key, n] of [['reference', referenceN], ['usage', usageN], ['settings', settingsN]]) { assert.ok(f[key].length <= n); f[key] = Buffer.concat([f[key], Buffer.alloc(n - f[key].length, 32)]); } return f;
}
test('audit client: admitted positive aggregate equality preserves original padded bytes', async () => {
  const f = paddedFixture(524288, 45056, 4096), control = injected(); const result = await run(f, {}, control);
  assert.equal(result.report.status, 'ok'); assert.equal(control.effects.call, 1);
  assert.equal(result.report.artifact.audit.bindings.reference.bytes, 524288); assert.equal(result.report.artifact.audit.bindings.settings.bytes, 4096);
});
test('audit client: individually admitted aggregate +1 refuses before copy/base64/dispatch', async () => {
  const f = paddedFixture(524288, 45057, 4096), control = injected(); refused(await run(f, {}, control), 'INPUT_AGGREGATE', control, 0); assert.equal(control.effects.connect, 0);
});
test('audit client: FD sizes and aggregate are admitted before any payload read', async () => {
  const paths = writeFixture(paddedFixture(524288, 45057, 4096), 'fd-aggregate'), control = injected(); let reads = 0, closes = 0;
  const adapter = { ...fs, readSync(...args) { reads++; return original.readSync(...args); }, closeSync(fd) { closes++; original.closeSync(fd); } };
  refused(await runAuditInputsFiles(paths, { fs: adapter, operations: control.operations }), 'INPUT_AGGREGATE', control, 0);
  assert.equal(reads, 0); assert.equal(closes, 3);
});
test('audit client: native FD individual +1 admission refuses before any payload read', async () => {
  const f = fixture(); f.reference = Buffer.alloc(524289, 32);
  const paths = writeFixture(f, 'fd-individual'), control = injected(); let reads = 0, closes = 0;
  const adapter = { ...fs, readSync(...a) { reads++; return original.readSync(...a); }, closeSync(fd) { closes++; original.closeSync(fd); } };
  refused(await runAuditInputsFiles(paths, { fs: adapter, operations: control.operations }), 'INPUT_BOUND', control, 0);
  assert.equal(reads, 0); assert.equal(closes, 1);
});
test('audit client: FD positive control uses bounded short chunks and exactly one overflow probe per file', () => {
  const f = fixture(), paths = writeFixture(f, 'fd-positive'); const positions = new Map(); let probes = 0, closes = 0;
  const adapter = { ...fs, readSync(fd, bytes, offset, length, position) {
    assert.ok(length <= 65536); if (length === 1 && position === Number(original.fstatSync(fd, { bigint: true }).size)) probes++;
    positions.set(fd, position); return original.readSync(fd, bytes, offset, Math.min(7, length), position);
  }, closeSync(fd) { closes++; original.closeSync(fd); } };
  const out = captureAuditInputFiles(paths, { fs: adapter }); for (const key of ['reference', 'usage', 'settings']) assert.deepEqual(out[key], f[key]);
  assert.equal(positions.size, 3); assert.equal(probes, 3); assert.equal(closes, 3);
});
test('audit client: native symlink input is refused without reading its payload', async () => {
  const paths = writeFixture(fixture(), 'input-symlink'), alias = join(TMP, 'input-alias.json'); fs.symlinkSync(paths.reference, alias);
  const control = injected(); let reads = 0;
  refused(await runAuditInputsFiles({ ...paths, reference: alias }, { fs: { ...fs, readSync(...a) { reads++; return original.readSync(...a); } }, operations: control.operations }), 'INPUT_OPEN', control, 0); assert.equal(reads, 0);
});
test('audit client: nonregular FD admission refuses before payload allocation/read', async () => {
  const paths = writeFixture(fixture(), 'nonregular'), control = injected(); let reads = 0, observed = 0;
  const adapter = { ...fs, fstatSync(fd, options) { observed++; const st = original.fstatSync(fd, options); return { ...st, isFile: () => false }; }, readSync() { reads++; } };
  refused(await runAuditInputsFiles(paths, { fs: adapter, operations: control.operations }), 'INPUT_TYPE', control, 0); assert.equal(reads, 0); assert.equal(observed, 1);
});
test('audit client: target short read refuses after positive FD admission', async () => {
  const paths = writeFixture(fixture(), 'short'), control = injected(); let target, faults = 0;
  const adapter = { ...fs, openSync(path, flags) { const fd = fs.openSync(path, flags); if (path === paths.reference) target = fd; return fd; }, readSync(fd, ...args) { if (fd === target) { faults++; return 0; } return original.readSync(fd, ...args); } };
  refused(await runAuditInputsFiles(paths, { fs: adapter, operations: control.operations }), 'INPUT_SHORT', control, 0); assert.equal(faults, 1);
});
test('audit client: target one-byte overflow refuses without dispatch', async () => {
  const paths = writeFixture(fixture(), 'overflow'), control = injected(); let target, faults = 0;
  const adapter = { ...fs, openSync(path, flags) { const fd = fs.openSync(path, flags); if (path === paths.reference) target = fd; return fd; }, readSync(fd, b, off, n, pos) { if (fd === target && n === 1 && pos === Number(original.fstatSync(fd, { bigint: true }).size)) { faults++; return 1; } return original.readSync(fd, b, off, n, pos); } };
  refused(await runAuditInputsFiles(paths, { fs: adapter, operations: control.operations }), 'INPUT_OVERFLOW', control, 0); assert.equal(faults, 1);
});
test('audit client: same target FD metadata mutation refuses with an asserted read effect', async () => {
  const paths = writeFixture(fixture(), 'mutated'), control = injected(); let target, reads = 0;
  const adapter = { ...fs, openSync(path, flags) { const fd = fs.openSync(path, flags); if (path === paths.reference) target = fd; return fd; }, readSync(fd, ...a) { if (fd === target) reads++; return original.readSync(fd, ...a); }, fstatSync(fd, options) { const st = original.fstatSync(fd, options); return fd === target && reads > 0 ? { ...st, mtimeNs: st.mtimeNs + 1n, isFile: () => true } : st; } };
  refused(await runAuditInputsFiles(paths, { fs: adapter, operations: control.operations }), 'INPUT_CHANGED', control, 0); assert.ok(reads >= 2);
});
test('audit client: close-after-close error never retries a reused foreign descriptor', async () => {
  const paths = writeFixture(fixture(), 'close-reused'), control = injected(); let target, foreign, targetCloses = 0;
  const foreignPath = join(TMP, 'foreign-owned.json'); fs.writeFileSync(foreignPath, 'foreign');
  const adapter = { ...fs, openSync(path, flags) { const fd = fs.openSync(path, flags); if (path === paths.reference) target = fd; return fd; }, closeSync(fd) {
    if (fd === target) { targetCloses++; original.closeSync(fd); foreign = original.openSync(foreignPath, fs.constants.O_RDONLY); assert.equal(foreign, target); throw new Error('close result uncertain after actual close'); }
    original.closeSync(fd);
  } };
  try { refused(await runAuditInputsFiles(paths, { fs: adapter, operations: control.operations }), 'INPUT_CLOSE', control, 0); assert.equal(targetCloses, 1); assert.ok(original.fstatSync(foreign).isFile()); assert.equal(fs.readFileSync(foreign, 'utf8'), 'foreign'); }
  finally { if (foreign !== undefined) original.closeSync(foreign); }
});
test('audit client: capture refusal still closes each owned FD once and retains close uncertainty', async () => {
  const paths = writeFixture(fixture(), 'failed-capture-close'), control = injected(); let target, foreign, closes = 0, faults = 0;
  const foreignPath = join(TMP, 'foreign-after-read.json'); fs.writeFileSync(foreignPath, 'untouched');
  const adapter = { ...fs, openSync(path, flags) { const fd = fs.openSync(path, flags); if (path === paths.reference) target = fd; return fd; }, readSync(fd, ...a) { if (fd === target) { faults++; throw new Error('read failed'); } return original.readSync(fd, ...a); }, closeSync(fd) { closes++; original.closeSync(fd); if (fd === target) { foreign = original.openSync(foreignPath, fs.constants.O_RDONLY); assert.equal(foreign, fd); throw new Error('close failed after closing'); } } };
  try { refused(await runAuditInputsFiles(paths, { fs: adapter, operations: control.operations }), 'INPUT_READ', control, 0); assert.equal(faults, 1); assert.equal(closes, 3); assert.equal(fs.readFileSync(foreign, 'utf8'), 'untouched'); }
  finally { if (foreign !== undefined) original.closeSync(foreign); }
});
test('audit client: duplicate-key raw JSON is refused rather than repaired before dispatch', async () => {
  const f = fixture(); f.reference = Buffer.from('{"schema":"x","schema":"y","companyfacts":[]}'); const control = injected(); refused(await run(f, {}, control), 'INPUT_JSON', control, 0); assert.equal(control.effects.connect, 0);
});
test('audit client: malformed UTF8 is refused without replacement or transport', async () => {
  const f = fixture(); f.reference = Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]); const control = injected(); refused(await run(f, {}, control), 'INPUT_UTF8', control, 0); assert.equal(control.effects.connect, 0);
});
test('audit client: strict CLI grammar refuses duplicates/missing/unknown/relative/control options with no effects', async () => {
  const paths = writeFixture(fixture(), 'grammar'), args = argsFor(paths);
  for (const bad of [args.slice(0, -2), [...args, '--unknown', 'x'], ['--reference', paths.reference, ...args.slice(2)], ['--__proto__', paths.root, ...args.slice(2)], args.map((v, i) => i === 3 ? 'relative.json' : v), args.map((v, i) => i === 3 ? '/bad\u0000path' : v)]) {
    const control = injected(); refused(await auditClientCli(bad, { operations: control.operations }), 'ARGUMENTS', control, 0); assert.equal(control.effects.connect, 0);
  }
  assert.deepEqual({ ...parseAuditClientArgs(args) }, paths);
});
test('audit client: explicit root must resolve to this repository rather than a caller-selected command', async () => {
  const paths = writeFixture(fixture(), 'root'), control = injected(); refused(await auditClientCli(argsFor({ ...paths, root: TMP }), { operations: control.operations }), 'ROOT', control, 0); assert.equal(control.effects.connect, 0);
});
test('audit client: isError stops after the sole audit and emits no arbitrary server error', async () => {
  const secret = 'SYNTHETIC_PRIVATE_ERROR_PAYLOAD'; const control = injected({ call: () => ({ resultType: 'complete', isError: true, content: [{ type: 'text', text: secret }] }) }); const result = await run(fixture(), {}, control); refused(result, 'TOOL_REFUSED', control, 1); assert.equal(result.encoded.includes(secret), false); assert.equal(control.effects.close, 1);
});
test('audit client: missing complete/structured/text tool fields refuse after exactly one call', async () => {
  for (const change of [r => { delete r.resultType; }, r => { delete r.structuredContent; }, r => { r.content = []; }, r => { r.content.push(r.content[0]); }]) {
    const control = injected({ call: request => { const r = clone(executeAuditInputs(request.arguments)); change(r); return r; } }); refused(await run(fixture(), {}, control), 'RESPONSE_SHAPE', control, 1);
  }
});
test('audit client: text/structured divergence and duplicate text keys refuse without retry', async () => {
  for (const change of [r => { r.content[0].text = JSON.stringify({ ...r.structuredContent, view: 'evidence' }); }, r => { r.content[0].text = r.content[0].text.replace('"schema":', '"schema":"duplicate","schema":'); }]) {
    const control = injected({ call: request => { const r = clone(executeAuditInputs(request.arguments)); change(r); return r; } }); refused(await run(fixture(), {}, control), 'RESPONSE_TEXT', control, 1);
  }
});
test('audit client: altered artifact hash refuses and does not authenticate omitted core evidence', async () => {
  const control = injected({ call: request => { const r = clone(executeAuditInputs(request.arguments)); r.structuredContent.content_hash = 'sha256:' + 'a'.repeat(64); r.content[0].text = JSON.stringify(r.structuredContent); return r; } }); refused(await run(fixture(), {}, control), 'RESPONSE_HASH', control, 1);
});
test('audit client: rehashed reference/usage/settings binding tamper refuses against exact request bytes', async () => {
  for (const key of ['reference', 'usage', 'settings']) {
    const control = injected({ call: request => rewrite(executeAuditInputs(request.arguments), d => { d.audit.bindings[key].sha256 = 'a'.repeat(64); }) }); refused(await run(fixture(), {}, control), 'RESPONSE_BINDING', control, 1);
  }
});
test('audit client: rehashed selected usage identity/order or denominator tamper refuses', async () => {
  const f = sixRows();
  for (const change of [d => { d.audit.rows[0].usage.value = 999; }, d => { [d.audit.rows[0], d.audit.rows[1]] = [d.audit.rows[1], d.audit.rows[0]]; }, d => { d.audit.rows.pop(); d.audit.coverage.selected_n--; d.projection.retained_selected_n--; }, d => { d.audit.coverage.counts.match++; }]) {
    const control = injected({ call: request => rewrite(executeAuditInputs(request.arguments), change) }); refused(await run(f, {}, control), 'RESPONSE_ROWS', control, 1);
  }
});
test('audit client: rehashed null timing/rights/source-verification promotion refuses', async () => {
  for (const change of [d => { d.audit.rows[5].verdict = true; }, d => { d.audit.established.source_rights = true; }, d => { d.audit.implementation.declared_module_sha256_verified = true; }, d => { d.audit.implementation.runtime_identity_verified = true; }]) {
    const control = injected({ call: request => rewrite(executeAuditInputs(request.arguments), change) }); refused(await run(sixRows(), {}, control), 'RESPONSE_UNKNOWNS', control, 1);
  }
});
test('audit client: oversized retained result is refused without echo or provisional artifact', async () => {
  const secret = 'SYNTHETIC_OVERSIZED_PAYLOAD'; const control = injected({ call: () => ({ content: [{ type: 'text', text: secret + 'x'.repeat(524288) }] }) }); const result = await run(fixture(), {}, control); refused(result, 'RESPONSE_BOUND', control, 1); assert.equal(result.encoded.includes(secret), false);
});
test('audit client: response accessors/proxies are rejected without invoking caller getters', async () => {
  let traps = 0;
  for (const make of [() => Object.defineProperty({}, 'content', { enumerable: true, get() { traps++; throw new Error('trap'); } }), () => new Proxy({}, { ownKeys() { traps++; throw new Error('trap'); } })]) {
    const control = injected({ call: make }); refused(await run(fixture(), {}, control), 'RESPONSE_SHAPE', control, 1);
  }
  assert.equal(traps, 0);
});
test('audit client: stderr exact-cap positive control is drained and never echoed', async () => {
  const control = injected({ connect: options => options.onStderr(Buffer.alloc(65536, 120)) }); const result = await run(fixture(), {}, control);
  assert.equal(result.report.status, 'ok'); assert.equal(result.report.lifecycle.stderr_bytes, 65536); assert.equal(result.encoded.includes('x'.repeat(100)), false);
});
test('audit client: stderr overflow stops before the sole audit and closes once', async () => {
  const control = injected({ connect: options => { options.onStderr(Buffer.alloc(65536)); options.onStderr(Buffer.from('SYNTHETIC_PRIVATE_STDERR')); } }); const result = await run(fixture(), {}, control); refused(result, 'STDERR_BOUND', control, 0); assert.equal(control.effects.close, 1); assert.equal(result.encoded.includes('SYNTHETIC_PRIVATE_STDERR'), false);
});
test('audit client: queued work before connect dispatch is reobserved and cannot launch', async () => {
  let time = 0, observations = 0; const control = injected();
  const result = await run(fixture(), { now() { observations++; if (observations === 4) queueMicrotask(() => { time = 15001; }); return time; } }, control);
  refused(result, 'WORK_DEADLINE', control, 0); assert.equal(control.effects.connect, 0);
});
test('audit client: synchronous connect acknowledgement exhausting work prevents audit dispatch', async () => {
  let time = 0; const control = injected({ connect: () => { time = 15001; } }); refused(await run(fixture(), { now: () => time }, control), 'WORK_DEADLINE', control, 0); assert.equal(control.effects.connect, 1); assert.equal(control.effects.close, 1);
});
test('audit client: preceding acknowledgement microtask is observed before the next audit effect', async () => {
  let time = 0; const control = injected({ connect: () => Promise.resolve().then(() => { time = 15001; }) }); refused(await run(fixture(), { now: () => time }, control), 'WORK_DEADLINE', control, 0); assert.equal(control.effects.close, 1);
});
test('audit client: native synthetic SDK positive send reaches the fixed adapter with one write and one close', async () => {
  const f = fixture(), control = syntheticSdk(), before = launches;
  const result = await runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { root: ROOT, sdkModules: control.sdkModules });
  assert.equal(result.report.status, 'ok'); assert.equal(launches, before);
  assert.deepEqual(control.effects, { starts: 1, writes: 1, transportCloses: 1, clientCloses: 1 });
  assert.equal(result.report.lifecycle.owned_child_absent, true); assert.equal(result.report.lifecycle.closure_evidence, 'same_owned_child_exit_or_close'); // Synthetic object, no real child.
  assert.deepEqual(control.frames, [JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'audit_inputs', arguments: requestFor(f) } }) + '\n']);
  assert.equal(control.serialized(), 1);
});
test('audit client: native synthetic queued SDK compilation cannot write after the absolute deadline', async () => {
  let time = 0;
  const f = fixture(), control = syntheticSdk(async () => { await Promise.resolve(); time = 15001; }), before = launches;
  const result = await runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { root: ROOT, sdkModules: control.sdkModules, now: () => time });
  refused(result, 'WORK_DEADLINE'); assert.equal(launches, before);
  assert.deepEqual(control.effects, { starts: 1, writes: 0, transportCloses: 1, clientCloses: 1 });
  assert.equal(result.report.lifecycle.audit_calls, 1); // API admission; no wire dispatch.
});
test('audit client: native serializer crossing the absolute deadline refuses before any stdin write', async () => {
  let time = 0; const before = launches, f = fixture();
  const control = syntheticSdk(async () => { time = 14999.5; }, { serialize: message => { time += 1; return message; } });
  const result = await runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { root: ROOT, sdkModules: control.sdkModules, now: () => time });
  refused(result, 'WORK_DEADLINE'); assert.equal(control.serialized(), 1); assert.deepEqual(control.frames, []);
  assert.deepEqual(control.effects, { starts: 1, writes: 0, transportCloses: 1, clientCloses: 1 }); assert.equal(launches, before);
  assert.equal(result.report.lifecycle.audit_calls, 1); assert.equal(result.report.lifecycle.owned_child_absent, true);
});
test('audit client: reentrant abort during native serialization refuses before any stdin write', async () => {
  const abort = new AbortController(), before = launches, f = fixture();
  const control = syntheticSdk(undefined, { serialize: message => { abort.abort(); return message; } });
  const result = await runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { root: ROOT, sdkModules: control.sdkModules, signal: abort.signal });
  refused(result, 'ABORTED'); assert.equal(control.serialized(), 1); assert.deepEqual(control.frames, []);
  assert.deepEqual(control.effects, { starts: 1, writes: 0, transportCloses: 1, clientCloses: 1 }); assert.equal(launches, before);
});
test('audit client: serialized legacy frame exact cap writes once and one byte overflow never writes', async () => {
  const f = fixture(), before = launches;
  for (const overflow of [0, 1]) {
    const control = syntheticSdk(undefined, { serialize: () => ({ padding: 'x'.repeat(AUDIT_CLIENT_LIMITS.request - 15 + overflow) }) });
    const result = await runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { root: ROOT, sdkModules: control.sdkModules });
    if (overflow) { refused(result, 'INPUT_BOUND'); assert.deepEqual(control.frames, []); }
    else { assert.equal(result.report.status, 'ok'); assert.equal(control.frames.length, 1); assert.equal(Buffer.byteLength(control.frames[0]), AUDIT_CLIENT_LIMITS.request); }
    assert.equal(control.serialized(), 1); assert.deepEqual(control.effects, { starts: 1, writes: overflow ? 0 : 1, transportCloses: 1, clientCloses: 1 });
  }
  assert.equal(launches, before);
});
test('audit client: native write backpressure awaits one drain without sending a second frame', async () => {
  const before = launches, f = fixture(), control = syntheticSdk(undefined, { backpressure: true });
  const result = await runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { root: ROOT, sdkModules: control.sdkModules });
  assert.equal(result.report.status, 'ok'); assert.equal(control.frames.length, 1); assert.equal(control.serialized(), 1);
  assert.deepEqual(control.drainCounts(), { listeners: 1, emissions: 1 });
  assert.deepEqual(control.effects, { starts: 1, writes: 1, transportCloses: 1, clientCloses: 1 }); assert.equal(launches, before);
});
test('audit client: throwing native stdin writer rejects its Promise without retry or diagnostic echo', async () => {
  const before = launches, f = fixture(), control = syntheticSdk(undefined, { writeError: true });
  const result = await runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { root: ROOT, sdkModules: control.sdkModules });
  refused(result, 'CALL'); assert.equal(result.encoded.includes('SYNTHETIC_PRIVATE_WRITE_ERROR'), false);
  assert.deepEqual(control.effects, { starts: 1, writes: 1, transportCloses: 1, clientCloses: 1 }); assert.equal(launches, before);
});
test('audit client: reentrant abort during connect prevents follow-up and closes once', async () => {
  const abort = new AbortController(); const control = injected({ connect: () => abort.abort() }); refused(await run(fixture(), { signal: abort.signal }, control), 'ABORTED', control, 0); assert.equal(control.effects.close, 1);
});
test('audit client: late call completion after abort cannot upgrade refusal or retry', { timeout: 1000 }, async () => {
  const abort = new AbortController(); let completed = false;
  const control = injected({ call: request => new Promise(resolveLate => { setTimeout(() => abort.abort(), 5); setTimeout(() => { completed = true; resolveLate(executeAuditInputs(request.arguments)); }, 20); }) });
  const result = await run(fixture(), { signal: abort.signal }, control); refused(result, 'ABORTED', control, 1); assert.equal(control.effects.close, 1);
  await new Promise(resolveWait => setTimeout(resolveWait, 30)); assert.equal(completed, true); refused(result, 'ABORTED', control, 1);
});
test('audit client: thrown protocol error is finite no-echo refusal with no hidden retry', async () => {
  const secret = 'SYNTHETIC_PRIVATE_HEADER_MISMATCH'; const control = injected({ call: () => { const e = new Error(secret); e.code = -32010; throw e; } }); const result = await run(fixture(), {}, control); refused(result, 'CALL', control, 1); assert.equal(result.encoded.includes(secret), false); assert.equal(control.effects.close, 1);
});
test('audit client: a null SDK PID or uncertain close acknowledgement is not absence evidence', async () => {
  const control = injected({ close: () => ({ owned_pid: null, owned_child_absent: null, evidence: 'unknown' }) }); refused(await run(fixture(), {}, control), 'CHILD_UNCERTAIN', control, 1); assert.equal(control.effects.close, 1);
});
test('audit client: rejected close retains known PID and never publishes the validated artifact', async () => {
  const control = injected({ close: () => { throw new Error('PRIVATE_CLOSE_FAILURE'); } }); control.operations.ownedPid = () => 123456789;
  const result = await run(fixture(), {}, control); refused(result, 'CLOSE', control, 1); assert.equal(result.report.lifecycle.owned_pid, 123456789); assert.equal(result.report.lifecycle.owned_child_absent, null); assert.equal(result.encoded.includes('PRIVATE_CLOSE_FAILURE'), false);
});
test('audit client: synchronous close exceeding the reserve is reobserved and refused', async () => {
  let time = 0; const control = injected({ close: () => { time = 5001; return { owned_pid: null, owned_child_absent: true, evidence: 'injected_no_child' }; } }); refused(await run(fixture(), { now: () => time }, control), 'CLOSE_DEADLINE', control, 1); assert.equal(control.effects.close, 1);
});
test('audit client: final encoding exceeding the close reserve cannot publish success', async () => {
  let closing = false, observedAfterClose = 0;
  const control = injected({ close: () => { closing = true; return { owned_pid: null, owned_child_absent: true, evidence: 'injected_no_child' }; } });
  const result = await run(fixture(), { now() { return closing && ++observedAfterClose >= 3 ? 5001 : 0; } }, control);
  refused(result, 'CLOSE_DEADLINE', control, 1); assert.equal(control.effects.close, 1); assert.equal(result.report.artifact, undefined);
});
test('audit client: backwards/nonfinite clock is refused without dispatch or raw diagnostics', async () => {
  const control = injected(); let n = 0;
  refused(await run(fixture(), { now: () => ++n === 1 ? 5 : 4 }, control), 'CLOCK', control, 0); assert.equal(control.effects.connect, 0);
  refused(await run(fixture(), { now: () => NaN }, injected()), 'CLOCK');
});
test('audit client: actual guarded SDK direct CLI roundtrip matches delivered compact executor and closes its only child', { timeout: 25000 }, async () => {
  const f = sixRows(), paths = writeFixture(f, 'actual'), before = launches;
  const result = await actualEntry(CLIENT, paths, 'direct'); sdkClosed(result, before);
  assert.deepEqual(result.report.artifact, clone(executeAuditInputs(requestFor(f)).structuredContent));
  assert.equal(result.report.artifact.audit.rows.length, 6); assert.equal(result.report.artifact.projection.complete_core_report, false);
});
test('audit client: actual guarded SDK symlink CLI has exact direct artifact parity and closes its only child', { timeout: 25000 }, async () => {
  const f = sixRows(), paths = writeFixture(f, 'alias-actual'), alias = join(TMP, 'audit-client-own-alias.mjs'); fs.symlinkSync(CLIENT, alias);
  const before = launches, result = await actualEntry(alias, paths, 'own-symlink'); sdkClosed(result, before);
  assert.deepEqual(result.report.artifact, clone(executeAuditInputs(requestFor(f)).structuredContent));
});
test('audit client: actual guarded SDK tool refusal still performs one call and confirms its owned child absent', { timeout: 25000 }, async () => {
  const f = fixture(); f.reference = raw({ schema: 'deliberately_invalid_synthetic_schema', companyfacts: [] });
  const paths = writeFixture(f, 'actual-refusal'), before = launches, result = await runAuditInputsFiles(paths);
  refused(result, 'TOOL_REFUSED'); sdkClosed(result, before); assert.equal(launches, 3);
});
