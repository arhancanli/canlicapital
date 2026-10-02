import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { auditInputs } from '../src/audit-inputs-core.mjs';
import { AUDIT_TOOL_INPUT, AUDIT_TOOL_OUTPUT, STDIO_AUDIT_LIMITS, executeAuditInputs } from '../examples/audit-inputs-stdio.mjs';
import { contentHash } from '../../scripts/canonical-json.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = resolve(PACKAGE_ROOT, 'examples/audit-inputs-stdio.mjs');
const CIK = '0000123456';
const sha = b => createHash('sha256').update(b).digest('hex');
const raw = value => Buffer.from(JSON.stringify(value));
const encode = bytes => bytes.toString('base64');
const first = (changes = {}) => ({ end: '2019-12-31', val: 100, accn: '0000123456-20-000001', filed: '2020-02-10', form: '10-K', ...changes });
const later = () => first({ val: 90, accn: '0000123456-21-000002', filed: '2021-02-10' });
const usage = (changes = {}) => ({ cik: CIK, taxonomy: 'us-gaap', concept: 'Assets', unit: 'USD', start: null, end: '2019-12-31', value: 100, used_on: '2020-03-01', ...changes });
function fixture({ rows = [usage()], vintages = [first(), later()], extraFacts = {} } = {}) {
  return {
    reference: raw({ schema: 'canli.fundamentals.audit-reference.v1', companyfacts: [{ cik: 123456, facts: { 'us-gaap': { Assets: { units: { USD: vintages } }, ...extraFacts } } }] }),
    usage: raw(rows),
    settings: raw({ schema: 'canli.fundamentals.audit-settings.v1', snapshot_captured_at: null, capture_reason: 'Synthetic supplied snapshot; no authenticated capture.', completeness: 'partial', completeness_reason: 'Synthetic supplied observations only.', implementation_source_sha256: null }),
  };
}
const argumentsFor = (f = fixture(), detail) => ({ reference_base64: encode(f.reference), expected_reference_sha256: sha(f.reference), usage_base64: encode(f.usage), settings_base64: encode(f.settings), ...(detail === undefined ? {} : { detail }) });
function payload(response) {
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0].type, 'text');
  assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent);
  const d = response.structuredContent;
  assert.equal(AUDIT_TOOL_OUTPUT.safeParse(d).success, true);
  if (d.status === 'ok') {
    assert.notEqual(response.isError, true);
    const { content_hash, ...body } = d;
    assert.equal(content_hash, contentHash(body, createHash));
  } else assert.equal(response.isError, true);
  return d;
}
function refused(response, code) {
  const d = payload(response);
  assert.equal(d.status, 'refused'); assert.equal(d.error.code, code);
  assert.equal(d.error.message, `Fundamentals audit refused (${code}).`);
  assert.ok(Buffer.byteLength(JSON.stringify(response)) < 1600);
  assert.equal(d.audit, undefined); assert.equal(d.projection, undefined);
  return d;
}

// The child guard executes before SDK/example imports. Parent fixture writes are separate.
// A denied operation emits a bounded marker BEFORE throwing, even if application code catches it.
const GUARD = `
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
const deny = name => (...args) => { process.stderr.write('DENIED_OPERATION:' + name + '\\n'); throw new Error('DENIED_OPERATION:' + name); };
globalThis.fetch = deny('fetch');
for (const [object, names] of [[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],[tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]])
  for (const name of names) object[name] = deny(name);
net.Server.prototype.listen = deny('listen');
for (const name of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','rename','renameSync','rm','rmSync','unlink','unlinkSync','truncate','truncateSync','createWriteStream','copyFile','copyFileSync','cp','cpSync','symlink','symlinkSync','link','linkSync','chmod','chmodSync','chown','chownSync'])
  if (typeof fs[name] === 'function') fs[name] = deny(name);
for (const name of ['writeFile','appendFile','mkdir','rename','rm','unlink','truncate','copyFile','cp','symlink','link','chmod','chown'])
  if (typeof fsp[name] === 'function') fsp[name] = deny(name);
const writable = flag => typeof flag === 'number' ? !!(flag & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) : flag !== undefined && flag !== 'r' && flag !== 'rs';
for (const name of ['open','openSync']) { const original = fs[name]; fs[name] = (...args) => writable(args[1]) ? deny(name)() : original(...args); }
const originalOpen = fsp.open; fsp.open = (...args) => writable(args[1]) ? deny('open')() : originalOpen(...args);
for (const name of ['write','writeSync','writev','writevSync']) { const original = fs[name]; fs[name] = (...args) => args[0] === 1 || args[0] === 2 ? original(...args) : deny(name)(); }
syncBuiltinESMExports();
`;
async function withClient(fn, { released = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'canli-audit-stdio-'));
  const guard = join(directory, 'guard.mjs'); writeFileSync(guard, GUARD);
  const expectedFiles = readdirSync(directory).sort();
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', guard, released ? resolve(PACKAGE_ROOT, 'src/server.mjs') : EXAMPLE], cwd: directory, stderr: 'pipe', maxBufferSize: 8 * 1024 * 1024 });
  const client = new Client({ name: 'audit-example-test', version: '1.0.0' });
  let stderr = ''; let deadlineExpired = false; let ownedPid = null;
  transport.stderr.on('data', b => { stderr += b.toString(); assert.ok(Buffer.byteLength(stderr) <= 8192, 'child stderr bound'); });
  const deadline = setTimeout(() => { deadlineExpired = true; const pid = ownedPid ?? transport.pid; if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} } }, 10000);
  try {
    await client.connect(transport);
    ownedPid = transport.pid; assert.ok(Number.isInteger(ownedPid));
    await client.listTools();
    return await fn(client);
  } finally {
    ownedPid ??= transport.pid;
    await client.close();
    // SDK close resolution alone does not prove its SIGKILL was reaped.
    const absent = () => { if (!ownedPid) return true; try { process.kill(ownedPid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } };
    const until = Date.now() + 2500;
    while (!absent() && Date.now() < until) await new Promise(done => setTimeout(done, 10));
    const actuallyAbsent = absent();
    if (!actuallyAbsent && ownedPid) { try { process.kill(ownedPid, 'SIGKILL'); } catch {} }
    clearTimeout(deadline);
    assert.equal(actuallyAbsent, true, 'owned child remains after bounded cleanup');
    assert.equal(deadlineExpired, false, 'finite child deadline exceeded');
    assert.doesNotMatch(stderr, /DENIED_OPERATION/);
    assert.deepEqual(readdirSync(directory).sort(), expectedFiles, 'example created a file');
    rmSync(directory, { recursive: true, force: true });
  }
}

test('audit stdio: actual SDK initialize lists exactly one annotated tool with discoverable input and output schemas', { timeout: 15000 }, async () => {
  await withClient(async client => {
    const a = await client.listTools(), b = await client.listTools();
    assert.deepEqual(a, b); assert.deepEqual(a.tools.map(t => t.name), ['audit_inputs']);
    const tool = a.tools[0]; assert.match(tool.description, /supplied/);
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(tool.inputSchema.required.sort(), ['expected_reference_sha256', 'reference_base64', 'settings_base64', 'usage_base64']);
    assert.equal(tool.outputSchema.type, 'object');
    assert.equal(client.getServerVersion().name, 'canli-fundamentals-audit-example');
    assert.match(client.getInstructions(), /every selected row/);
  });
});
test('audit stdio: actual SDK call preserves text structured schema and deterministic public JSON hashes', { timeout: 15000 }, async () => {
  await withClient(async client => {
    await client.listTools(); const args = argumentsFor(); const before = JSON.stringify(args);
    const a = payload(await client.callTool({ name: 'audit_inputs', arguments: args }));
    const b = payload(await client.callTool({ name: 'audit_inputs', arguments: args }));
    assert.deepEqual(a, b); assert.equal(JSON.stringify(args), before);
    assert.equal(a.view, 'compact'); assert.equal(a.projection.complete_core_report, false);
    assert.equal(a.audit.rows[0].status, 'match'); assert.equal(a.audit.rows[0].selected.value, 100);
  });
});
test('audit stdio: original value versus later-only counterexample uses the earlier exact accession over real stdio', { timeout: 15000 }, async () => {
  await withClient(async client => {
    const d = payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor(fixture({ rows: [usage(), usage({ value: 90 })] })) }));
    assert.deepEqual(d.audit.rows.map(r => [r.status, r.verdict, r.selected.value]), [['match', true, 100], ['mismatch', false, 100]]);
    assert.equal(d.audit.rows[1].later_only_value_observed, true);
    assert.equal(d.audit.rows[1].selected.accession, '0000123456-20-000001');
    assert.equal(d.audit.rows[1].formal_restatement_cause, null);
  });
});
test('audit stdio: all six outcomes remain visible with full-N null coverage on the actual client', { timeout: 15000 }, async () => {
  await withClient(async client => {
    const tied = [first(), first({ val: 99, accn: '0000123456-20-000002' })];
    const f = fixture({ vintages: [first()], extraFacts: { Tied: { units: { USD: tied } } }, rows: [usage(), usage({ value: 99 }), usage({ concept: 'Absent' }), usage({ unit: 'EUR' }), usage({ concept: 'Tied' }), usage({ used_on: '2020-02-10' })] });
    const d = payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor(f) }));
    assert.deepEqual(d.audit.rows.map(r => r.status), ['match', 'mismatch', 'missing', 'unsupported', 'ambiguous', 'timing_indeterminate']);
    assert.equal(d.projection.retained_selected_n, 6); assert.equal(d.audit.coverage.selected_n, 6);
    assert.equal(d.audit.coverage.verdict_unknown_n, 4);
    for (const row of d.audit.rows.slice(2)) { assert.equal(row.verdict, null); assert.ok(row.reason); }
    assert.equal(d.audit.rows[5].trading_calendar_lookahead, null);
  });
});
test('audit stdio: explicit evidence view is the exact complete unchanged core report and all raw input bindings', { timeout: 15000 }, async () => {
  await withClient(async client => {
    const f = fixture(); const expected = auditInputs(f.reference, sha(f.reference), f.usage, f.settings);
    const d = payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor(f, 'evidence') }));
    assert.deepEqual(d.audit, expected); assert.equal(d.projection.complete_core_report, true);
    assert.deepEqual(d.projection.omitted, []); assert.equal(d.projection.core_report_content_hash, expected.content_hash);
    for (const key of ['reference', 'usage', 'settings']) { assert.equal(d.audit.bindings[key].original_base64, encode(f[key])); assert.equal(d.audit.bindings[key].sha256, sha(f[key])); }
  });
});
test('audit stdio: compact projection names omissions without relabeling its digest as the complete report', () => {
  const f = fixture(), a = payload(executeAuditInputs(argumentsFor(f))), b = payload(executeAuditInputs(argumentsFor(f, 'evidence')));
  assert.equal(a.projection.core_report_content_hash, b.audit.content_hash); assert.notEqual(a.content_hash, b.content_hash);
  assert.equal(a.audit.content_hash, undefined); assert.equal(a.audit.schema, 'canli.fundamentals.audit-compact.v1');
  assert.ok(a.projection.omitted.includes('rows.*.later_vintages'));
  assert.equal(a.audit.bindings.reference.original_base64, undefined);
  assert.deepEqual(a.audit.rows[0].vintage_counts, { eligible: 1, same_day: 0, later: 1, unsupported: 0 });
  assert.deepEqual(a.audit.implementation, b.audit.implementation);
});
test('audit stdio: released seven-tool server stays unchanged and never lists the example', { timeout: 15000 }, async () => {
  await withClient(async client => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['cross_section', 'find_company', 'history', 'known_as_of', 'list_concepts', 'restatements', 'vintages']);
    assert.equal(client.getServerVersion().version, JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'))).version);
  }, { released: true });
});
test('audit stdio: no-network no-write child sentinel demonstrably refuses both prohibited operations', { timeout: 15000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'canli-audit-guard-control-')); const guard = join(directory, 'guard.mjs'); writeFileSync(guard, GUARD);
  async function probe(source, marker) {
    const child = spawn(process.execPath, ['--import', guard, '--input-type=module', '-e', source], { cwd: directory, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; child.stderr.on('data', b => { stderr += b; assert.ok(stderr.length <= 8192); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', resolveExit); }); clearTimeout(timer);
    assert.equal(code, 77); assert.match(stderr, marker);
  }
  try {
    await probe("try { await fetch('https://invalid.example'); process.exitCode=1; } catch { process.exitCode=77; }", /DENIED_OPERATION:fetch/);
    await probe("import {writeFileSync} from 'node:fs'; try {writeFileSync('forbidden','x');process.exitCode=1;} catch {process.exitCode=77;}", /DENIED_OPERATION:writeFileSync/);
    assert.deepEqual(readdirSync(directory), ['guard.mjs']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('audit stdio: wrong reference SHA yields a safe stable tool error and subsequent valid calls still work', { timeout: 15000 }, async () => {
  await withClient(async client => {
    refused(await client.callTool({ name: 'audit_inputs', arguments: { ...argumentsFor(), expected_reference_sha256: '0'.repeat(64) } }), 'CORE_REFERENCE_SHA');
    assert.equal(payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor() })).status, 'ok');
  });
});
test('audit stdio: closed arguments hashes details and missing settings never coerce or invent defaults', () => {
  const args = argumentsFor();
  for (const value of [null, [], { ...args, extra: 'private' }, { ...args, usage_base64: 5 }]) refused(executeAuditInputs(value), 'ARGUMENTS');
  for (const value of [args.expected_reference_sha256.toUpperCase(), 'f'.repeat(63)]) refused(executeAuditInputs({ ...args, expected_reference_sha256: value }), 'EXPECTED_SHA');
  refused(executeAuditInputs({ ...args, detail: 'best' }), 'DETAIL');
  const { settings_base64, ...missing } = args; refused(executeAuditInputs(missing), 'ARGUMENTS');
  assert.equal(AUDIT_TOOL_INPUT.safeParse({ ...args, extra: 1 }).success, false);
});
test('audit stdio: proxy accessor inherited and unexpected symbol arguments refuse without invoking user callbacks', () => {
  let calls = 0; const args = argumentsFor();
  const accessor = { ...args }; Object.defineProperty(accessor, 'usage_base64', { enumerable: true, get() { calls++; throw Error('private'); } });
  for (const value of [accessor, new Proxy(args, { get() { calls++; throw Error('private'); } }), Object.assign(Object.create({ detail: 'evidence' }), args), { ...args, [Symbol('hidden')]: 'secret' }]) refused(executeAuditInputs(value), 'ARGUMENTS');
  assert.equal(calls, 0);
});
test('audit stdio: canonical base64 refuses whitespace url alphabet missing excess internal padding and nonzero pad bits', () => {
  const args = argumentsFor();
  for (const value of ['e30=\n', 'e30', 'e30===', 'e=30', '====', '_w==', '-w==', 'Zh==', 'Zm9=']) refused(executeAuditInputs({ ...args, settings_base64: value }), 'BASE64');
});
test('audit stdio: base64 decoded lengths are enforced even when padded encoded lengths share a bucket', () => {
  const args = argumentsFor(); const maximum = STDIO_AUDIT_LIMITS.settingsBytes;
  assert.equal(encode(Buffer.alloc(maximum)).length, encode(Buffer.alloc(maximum + 1)).length);
  refused(executeAuditInputs({ ...args, settings_base64: encode(Buffer.alloc(maximum + 1)) }), 'INPUT_BOUND');
});
test('audit stdio: per-input encoded limits reject before malformed JSON is decoded or parsed', () => {
  for (const [key, limit] of [['reference_base64', STDIO_AUDIT_LIMITS.referenceBytes], ['usage_base64', STDIO_AUDIT_LIMITS.usageBytes], ['settings_base64', STDIO_AUDIT_LIMITS.settingsBytes]])
    refused(executeAuditInputs({ ...argumentsFor(), [key]: encode(Buffer.alloc(limit + 3, 120)) }), 'INPUT_BOUND');
});
test('audit stdio: jointly oversized individually allowed byte batches refuse before any JSON parse', () => {
  const args = { ...argumentsFor(), reference_base64: encode(Buffer.alloc(STDIO_AUDIT_LIMITS.referenceBytes, 120)), usage_base64: encode(Buffer.alloc(STDIO_AUDIT_LIMITS.usageBytes, 120)) };
  refused(executeAuditInputs(args), 'AGGREGATE_BOUND');
});
test('audit stdio: exact maximum settings bytes remain owned and valid while next byte refuses', () => {
  const f = fixture(); const padding = STDIO_AUDIT_LIMITS.settingsBytes - f.settings.length;
  f.settings = Buffer.concat([f.settings, Buffer.alloc(padding, 32)]);
  const args = argumentsFor(f); assert.equal(payload(executeAuditInputs(args)).audit.bindings.settings.bytes, 4096);
  refused(executeAuditInputs({ ...args, settings_base64: encode(Buffer.concat([f.settings, Buffer.from(' ')])) }), 'INPUT_BOUND');
});
test('audit stdio: raw duplicate decoded JSON keys and private source text produce bounded non-echoing core refusals over stdio', { timeout: 15000 }, async () => {
  await withClient(async client => {
    const f = fixture(); f.reference = Buffer.from('{"schema":"PRIVATE_SENTINEL_TEXT","schema":"duplicate","companyfacts":[]}');
    const response = await client.callTool({ name: 'audit_inputs', arguments: argumentsFor(f) }); refused(response, 'CORE_DUPLICATE_KEY');
    assert.doesNotMatch(JSON.stringify(response), /PRIVATE_SENTINEL_TEXT|duplicate|companyfacts/);
  });
});
test('audit stdio: raw invalid UTF8 survives base64 transport and is refused without replacement or reserialization', () => {
  const f = fixture(); f.reference = Buffer.from([0x7b, 0xff, 0x7d]); refused(executeAuditInputs(argumentsFor(f)), 'CORE_UTF8');
});
test('audit stdio: lossy raw numeric literal and nonfinite exponent retain the core precision refusals', () => {
  const f = fixture(); f.usage = Buffer.from(JSON.stringify([usage()]).replace('"value":100', '"value":0.10000000000000001')); refused(executeAuditInputs(argumentsFor(f)), 'CORE_NUMBER_PRECISION');
  f.usage = Buffer.from(JSON.stringify([usage()]).replace('"value":100', '"value":1e400')); refused(executeAuditInputs(argumentsFor(f)), 'CORE_NUMBER_RANGE');
});
test('audit stdio: source tamper with the original advertised hash cannot alter scored evidence', () => {
  const f = fixture(), args = argumentsFor(f); f.reference = Buffer.from(f.reference.toString().replace('"val":100', '"val":101'));
  refused(executeAuditInputs({ ...args, reference_base64: encode(f.reference) }), 'CORE_REFERENCE_SHA');
});
test('audit stdio: caller module hash remains unverified and absent source rights and universe coverage remain null', () => {
  const f = fixture(), settings = JSON.parse(f.settings); settings.implementation_source_sha256 = 'a'.repeat(64); f.settings = raw(settings);
  const d = payload(executeAuditInputs(argumentsFor(f)));
  assert.equal(d.audit.implementation.declared_module_sha256, 'a'.repeat(64)); assert.equal(d.audit.implementation.declared_module_sha256_verified, false);
  assert.equal(d.adapter.whole_module_sha256_verified, false); assert.equal(d.audit.established.source_rights, null); assert.equal(d.audit.established.full_universe_coverage, null);
});
function richFixture(vintageN) {
  const concept = 'C' + 'x'.repeat(127), unit = 'Δ'.repeat(64);
  const vintages = Array.from({ length: vintageN }, (_, i) => first({ accn: `0000123456-20-${String(i + 1).padStart(6, '0')}` }));
  const f = fixture({ rows: Array.from({ length: 64 }, () => usage({ concept, unit })) });
  f.reference = raw({ schema: 'canli.fundamentals.audit-reference.v1', companyfacts: [{ cik: 123456, facts: { 'us-gaap': { [concept]: { units: { [unit]: vintages } } } } }] });
  return f;
}
test('audit stdio: all 64 selected rows are retained when their complete compact projection fits', () => {
  const f = fixture({ rows: Array.from({ length: 64 }, () => usage()) }); const d = payload(executeAuditInputs(argumentsFor(f)));
  assert.equal(d.audit.rows.length, 64); assert.equal(d.audit.coverage.selected_n, 64); assert.equal(d.projection.retained_selected_n, 64);
  assert.ok(Buffer.byteLength(JSON.stringify(d)) <= STDIO_AUDIT_LIMITS.compactContentBytes);
});
test('audit stdio: oversized valid compact output refuses the whole batch rather than selecting fewer rows', () => {
  const f = richFixture(1); assert.equal(auditInputs(f.reference, sha(f.reference), f.usage, f.settings).coverage.selected_n, 64);
  refused(executeAuditInputs(argumentsFor(f)), 'OUTPUT_BOUND');
});
test('audit stdio: oversized valid complete evidence output refuses without emitting a partial report', { timeout: 15000 }, async () => {
  const f = richFixture(64); const full = auditInputs(f.reference, sha(f.reference), f.usage, f.settings);
  assert.equal(full.coverage.selected_n, 64); assert.equal(full.coverage.returned_matching_vintages, 4096);
  assert.ok(Buffer.byteLength(JSON.stringify(full)) > STDIO_AUDIT_LIMITS.evidenceContentBytes);
  await withClient(async client => { refused(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor(f, 'evidence') }), 'OUTPUT_BOUND'); });
});
test('audit stdio: documented synthetic workflow executes through the actual listed tool and preserves its counterexample', { timeout: 15000 }, async () => {
  const guide = readFileSync(resolve(PACKAGE_ROOT, 'AUDIT_INPUTS.md'), 'utf8');
  const match = guide.match(/<!-- audit-stdio-workflow:start -->\s*```js\n([\s\S]+?)\n```\s*<!-- audit-stdio-workflow:end -->/);
  assert.ok(match, 'marked runnable workflow missing');
  const workflow = new Function(`return (${match[1]});`)();
  await withClient(async client => {
    const d = await workflow(client, createHash);
    assert.equal(d.audit.rows.length, 1); assert.equal(d.audit.coverage.selected_n, 1);
    assert.equal(d.audit.rows[0].status, 'mismatch'); assert.equal(d.audit.rows[0].verdict, false);
    assert.equal(d.audit.rows[0].selected.value, 100); assert.equal(d.audit.rows[0].later_only_value_observed, true);
  });
});
test('audit stdio: oversized unterminated protocol frame closes with a bounded notice and no raw echo', { timeout: 15000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'canli-audit-frame-')); const guard = join(directory, 'guard.mjs'); writeFileSync(guard, GUARD);
  const child = spawn(process.execPath, ['--import', guard, EXAMPLE], { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', stdout = '', expired = false;
  child.stderr.on('data', b => { stderr += b; assert.ok(stderr.length <= 8192); });
  child.stdout.on('data', b => { stdout += b; assert.ok(stdout.length <= 8192); });
  child.stdin.on('error', error => { assert.equal(error.code, 'EPIPE'); });
  const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); }, 7000);
  try {
    const terminal = new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolveExit({ code, signal })); });
    child.stdin.end(Buffer.alloc(STDIO_AUDIT_LIMITS.requestBufferBytes + 64, 120));
    const ended = await terminal; clearTimeout(timer);
    assert.equal(expired, false); assert.equal(ended.signal, null);
    assert.equal(stdout, ''); assert.match(stderr, /transport refused \(TRANSPORT\)/);
    assert.doesNotMatch(stderr, /xxx|DENIED_OPERATION/);
    assert.deepEqual(readdirSync(directory), ['guard.mjs']);
  } finally { clearTimeout(timer); rmSync(directory, { recursive: true, force: true }); }
});
