import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, symlinkSync, chmodSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { executeAuditInputs as repositoryAudit, AUDIT_TOOL_OUTPUT, STDIO_AUDIT_LIMITS } from '../examples/audit-inputs-stdio.mjs';
import { contentHash } from '../../scripts/canonical-json.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PINS = Object.freeze({
  'package/src/expert-intake-client.mjs': '16aaebba9e4d285fc706786e48683c80a09297cda141e0658b09947b9b4e9556',
  'package/src/expert-intake-stdio.mjs': '1cde7375eb1e63b381d9343373e55351b5efca4db27cb24e2e91a98e8515f0ae',
  'package/src/expert-intake-files.mjs': '68db164a80b8a37b8ed4ea9e3d4ffa0a42b43f8f6fcc28a91f7b97e702411a1f',
  'package/src/expert-submission-client.mjs': '2f6935f53821dcfee2a7cbae51e927672fb26c49c73353fc515ecb1096cceb31',
  'package/src/expert-submission-files.mjs': 'a5ed0b30f5338d3ed560f7fbc7cbb0e78966a56da188b72a8515ab077c4ea22d',
  'package/src/audit-inputs-client.mjs': '95fe942b1278768b4c938d82054d2d472eb3411c5587bdd8be4067b1dc0bc9b7',
  'package/src/canonical-json.mjs': '881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b',
  'package/src/audit-inputs-core.mjs': 'e612ba0e44d12fd275b3e1dc0a2331bfe6fb005b4da8075e46ae009c5e299059',
  'package/src/audit-inputs-stdio.mjs': '537673fc03d0954ae480b239b8b481d11e14d763f1d0c07a985bb7d8fbd5b5c0',
  'package/src/server.mjs': 'dd856068821d05648eb5f3ff6f2e2996cc165de2c9b6f1d24f506fbc29382d38',
  'package/src/expert-submission-stdio.mjs': '56075a5daaa61bffbace0551aefe1220c372854ddca295b6adddd62abef65208',
  'package/src/expert-submission-audit-core.mjs': '4040abc8f142d77571117979b73790be5a7ddb9bbf8fe6eee2fcb686ea9099f3',
  'package/src/expert-intake-core.mjs': '5095379afe5ca5be2c2fc8dc2fac191025c454f87e135d036b307f84bb57d545',
  'package/src/expert-agreement.mjs': '80732bf61e1cef9bd3ff06cf831307675546f4789f8336f1668d5fd637a7b4ef',
  'package/src/filing-facts-packet.mjs': '74f2b353c0bf48d6e409d25925a6d691cf105a6f50aafdf561efbbbe679023c8',
});
const FILES = Object.freeze([
  'package/LICENSE', 'package/README.md', 'package/AUDIT_INPUTS.md', 'package/EXPERT_SUBMISSIONS.md', 'package/AUDIT_INPUTS_CLIENT.md', 'package/EXPERT_SUBMISSION_FILES.md', 'package/EXPERT_SUBMISSION_CLIENT.md', 'package/EXPERT_INTAKE_FILES.md', 'package/EXPERT_INTAKE_STDIO.md', 'package/EXPERT_INTAKE_CLIENT.md', 'package/package.json', ...Object.keys(SOURCE_PINS),
].sort());
// Raw tar modes follow the frozen Git files, independently of bin-link installation.
const RAW_MODES = Object.freeze(Object.fromEntries(FILES.map(path => [
  path, ['package/src/audit-inputs-stdio.mjs', 'package/src/expert-submission-stdio.mjs', 'package/src/audit-inputs-client.mjs', 'package/src/expert-submission-files.mjs', 'package/src/expert-submission-client.mjs', 'package/src/expert-intake-files.mjs', 'package/src/expert-intake-stdio.mjs', 'package/src/expert-intake-client.mjs'].includes(path) ? 0o755 : 0o644,
])));
const PACKAGE_LIMITS = Object.freeze({ compressed: 256 * 1024, expanded: 2 * 1024 * 1024, members: 32, npmOutput: 64 * 1024, npmMs: 20000, childMs: 10000, closeMs: 3000, reapMs: 2500 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const raw = value => Buffer.from(JSON.stringify(value));
const CIK = '0000123456';
const first = (changes = {}) => ({ end: '2019-12-31', val: 100, accn: '0000123456-20-000001', filed: '2020-02-10', form: '10-K', ...changes });
const usage = (changes = {}) => ({ cik: CIK, taxonomy: 'us-gaap', concept: 'Assets', unit: 'USD', start: null, end: '2019-12-31', value: 100, used_on: '2020-03-01', ...changes });
function fixture({ rows = [usage()], vintages = [first(), first({ val: 90, accn: '0000123456-21-000002', filed: '2021-02-10' })], extraFacts = {} } = {}) {
  return {
    reference: raw({ schema: 'canli.fundamentals.audit-reference.v1', companyfacts: [{ cik: 123456, facts: { 'us-gaap': { Assets: { units: { USD: vintages } }, ...extraFacts } } }] }),
    usage: raw(rows),
    settings: raw({ schema: 'canli.fundamentals.audit-settings.v1', snapshot_captured_at: null, capture_reason: 'Synthetic supplied snapshot; no authenticated capture.', completeness: 'partial', completeness_reason: 'Synthetic supplied observations only.', implementation_source_sha256: null }),
  };
}
const argumentsFor = (f = fixture(), detail) => ({
  reference_base64: f.reference.toString('base64'), expected_reference_sha256: sha(f.reference),
  usage_base64: f.usage.toString('base64'), settings_base64: f.settings.toString('base64'),
  ...(detail === undefined ? {} : { detail }),
});
function payload(response) {
  assert.equal(response.content.length, 1);
  assert.equal(response.content[0].type, 'text');
  const value = response.structuredContent;
  assert.equal(response.content[0].text, JSON.stringify(value));
  assert.equal(AUDIT_TOOL_OUTPUT.safeParse(value).success, true);
  if (value.status === 'ok') {
    assert.notEqual(response.isError, true);
    const { content_hash, ...body } = value;
    assert.equal(content_hash, contentHash(body, createHash));
  } else assert.equal(response.isError, true);
  return value;
}
function refused(response, code) {
  const value = payload(response);
  assert.equal(value.status, 'refused');
  assert.equal(value.error.code, code);
  assert.ok(Buffer.byteLength(JSON.stringify(response)) < 1600);
  assert.equal(value.audit, undefined);
  return value;
}
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

function tarEntries(compressed) {
  assert.ok(compressed.length > 0 && compressed.length <= PACKAGE_LIMITS.compressed, 'TAR_BOUND');
  const bytes = gunzipSync(compressed, { maxOutputLength: PACKAGE_LIMITS.expanded });
  assert.equal(bytes.length % 512, 0, 'TAR_ALIGNMENT');
  const entries = new Map();
  const field = b => {
    assert.ok(b.every(unit => unit <= 0x7f), 'TAR_ASCII');
    return b.subarray(0, b.indexOf(0) < 0 ? b.length : b.indexOf(0)).toString('ascii');
  };
  const octal = b => { const s = field(b).trim(); assert.match(s, /^[0-7]+$/, 'TAR_NUMBER'); return Number.parseInt(s, 8); };
  let offset = 0, ended = false;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(b => b === 0)) {
      assert.ok(offset + 1024 <= bytes.length && bytes.subarray(offset).every(b => b === 0), 'TAR_END');
      ended = true; break;
    }
    assert.ok(entries.size < PACKAGE_LIMITS.members, 'TAR_MEMBERS');
    const prefix = field(header.subarray(345, 500)), name = field(header.subarray(0, 100));
    const path = (prefix ? prefix + '/' : '') + name;
    assert.match(path, /^package\/[A-Za-z0-9_./-]+$/, 'TAR_PATH');
    assert.ok(!path.split('/').includes('..') && !path.split('/').includes('.') && !path.includes('//'), 'TAR_PATH');
    assert.ok(!entries.has(path), 'TAR_DUPLICATE');
    const type = field(header.subarray(156, 157));
    assert.ok(type === '' || type === '0', 'TAR_REGULAR_FILES_ONLY');
    const size = octal(header.subarray(124, 136)), mode = octal(header.subarray(100, 108));
    assert.ok(size <= PACKAGE_LIMITS.expanded && [0o644, 0o755].includes(mode), 'TAR_FILE_BOUND_MODE');
    const sum = header.reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0);
    assert.equal(sum, octal(header.subarray(148, 156)), 'TAR_CHECKSUM');
    assert.ok(offset + 512 + size <= bytes.length, 'TAR_BODY');
    entries.set(path, { mode, bytes: Buffer.from(bytes.subarray(offset + 512, offset + 512 + size)) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.equal(ended, true, 'TAR_END');
  return entries;
}
function auditPackage(entries) {
  assert.deepEqual([...entries.keys()].sort(), FILES, 'PACKAGE_MEMBERS');
  const bare = new Set(['@modelcontextprotocol/server', '@modelcontextprotocol/server/stdio', 'zod']);
  for (const [path, row] of entries) {
    assert.equal(row.mode, RAW_MODES[path], 'PACKAGE_MODE:' + path);
    if (!/\.(?:mjs|js)$/.test(path)) continue;
    const source = row.bytes.toString('utf8');
    const dynamic = [...source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)];
    if (path === 'package/src/audit-inputs-client.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS[path], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio'], 'FIXED_DYNAMIC_IMPORTS');
    } else if (path === 'package/src/expert-submission-files.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS[path], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['./expert-submission-audit-core.mjs'], 'FIXED_DYNAMIC_IMPORTS');
      assert.ok(entries.has('package/src/expert-submission-audit-core.mjs'), 'MISSING_LOCAL_IMPORT');
    } else if (path === 'package/src/expert-submission-client.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS['package/src/expert-submission-client.mjs'], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio', './expert-submission-stdio.mjs'], 'FIXED_DYNAMIC_IMPORTS');
      assert.ok(entries.has('package/src/expert-submission-stdio.mjs'), 'LOCAL_IMPORT');
    } else if (path === 'package/src/expert-intake-files.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS[path], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['./expert-intake-core.mjs'], 'FIXED_DYNAMIC_IMPORTS');
      assert.ok(entries.has('package/src/expert-intake-core.mjs'), 'LOCAL_IMPORT');
    } else if (path === 'package/src/expert-intake-client.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS[path], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['./expert-intake-core.mjs', './expert-intake-stdio.mjs', '@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio'], 'FIXED_DYNAMIC_IMPORTS');
      assert.ok(entries.has('package/src/expert-intake-core.mjs') && entries.has('package/src/expert-intake-stdio.mjs'), 'LOCAL_IMPORT');
    } else assert.equal(dynamic.length, 0, 'DYNAMIC_IMPORT');
    assert.doesNotMatch(source.replace(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g, 'FIXED_SDK_IMPORT'), /\b(?:import\s*\(|require\s*\(|createRequire\b)/, 'DYNAMIC_IMPORT');
    const literalImports = [...source.matchAll(/^import .+ from ['"]([^'"]+)['"];$/gm)];
    assert.equal(literalImports.length, [...source.matchAll(/^import\b/gm)].length, 'UNPARSED_IMPORT');
    assert.doesNotMatch(source, /^export\s+(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\b/gm, 'UNPARSED_REEXPORT');
    for (const match of source.matchAll(/^import .+ from ['"]([^'"]+)['"];$/gm)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) {
        const target = posix.normalize(posix.join(posix.dirname(path), specifier));
        assert.ok(target.startsWith('package/') && !target.startsWith('package/../'), 'OUTSIDE_IMPORT');
        assert.ok(entries.has(target), 'MISSING_LOCAL_IMPORT');
      } else assert.ok(specifier.startsWith('node:') || bare.has(specifier), 'EXTERNAL_IMPORT');
    }
    assert.equal(sha(row.bytes), SOURCE_PINS[path], 'SOURCE_PIN');
  }
  const packageJson = JSON.parse(entries.get('package/package.json').bytes);
  assert.deepEqual(packageJson.bin, { 'canli-fundamentals-mcp': 'src/server.mjs', 'canli-fundamentals-audit': 'src/audit-inputs-stdio.mjs', 'canli-expert-submission-audit': 'src/expert-submission-stdio.mjs', 'canli-fundamentals-audit-files': 'src/audit-inputs-client.mjs', 'canli-expert-submission-files': 'src/expert-submission-files.mjs', 'canli-expert-submission-client': 'src/expert-submission-client.mjs', 'canli-expert-intake-files': 'src/expert-intake-files.mjs', 'canli-expert-intake-prepare': 'src/expert-intake-stdio.mjs', 'canli-expert-intake-client': 'src/expert-intake-client.mjs' }, 'PACKAGE_BIN');
  assert.deepEqual(packageJson.files, ['src', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md', 'EXPERT_INTAKE_FILES.md', 'EXPERT_INTAKE_STDIO.md', 'EXPERT_INTAKE_CLIENT.md']);
  assert.equal(packageJson.name, 'canli-fundamentals-mcp');
  assert.equal(packageJson.version, '0.5.0');
  assert.deepEqual(packageJson.dependencies, { '@modelcontextprotocol/server': '2.1.0', zod: '4.6.5', '@modelcontextprotocol/client': '2.1.0' });
  assert.match(entries.get('package/src/audit-inputs-stdio.mjs').bytes.toString(), /^#!\/usr\/bin\/env node\n/);
  assert.match(entries.get('package/src/expert-submission-stdio.mjs').bytes.toString(), /^#!\/usr\/bin\/env node\n/);
  return packageJson;
}
const absent = pid => {
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === 'ESRCH') return true; throw error; }
};
async function observeAbsence(pid) {
  const until = Date.now() + PACKAGE_LIMITS.reapMs;
  while (!absent(pid) && Date.now() < until) await new Promise(done => setTimeout(done, 10));
  return absent(pid);
}
async function npmPack(directory) {
  const output = join(directory, 'pack'); mkdirSync(output);
  const cache = join(directory, 'cache'); mkdirSync(cache);
  const networkGuard = join(directory, 'pack-network-guard.mjs');
  const writeGuardStart = GUARD.indexOf("for (const name of ['writeFile'");
  assert.ok(writeGuardStart > 0);
  writeFileSync(networkGuard, GUARD.slice(0, writeGuardStart) + 'syncBuiltinESMExports();\n');
  const userConfig = join(directory, 'npm-user.conf'), globalConfig = join(directory, 'npm-global.conf');
  writeFileSync(userConfig, ''); writeFileSync(globalConfig, '');
  const args = ['pack', '--offline', '--ignore-scripts', '--update-notifier=false', '--audit=false', '--fund=false', '--json', '--cache', cache, '--pack-destination', output, '--userconfig', userConfig, '--globalconfig', globalConfig];
  const child = spawn('npm', args, { cwd: PACKAGE_ROOT, env: { PATH: process.env.PATH, CI: 'true', NODE_OPTIONS: '--import=' + JSON.stringify(networkGuard) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', expired = false, overflow = false, outputBytes = 0;
  for (const [stream, append] of [[child.stdout, b => { stdout += b; }], [child.stderr, b => { stderr += b; }]]) {
    stream.on('data', b => {
      outputBytes += b.length;
      if (outputBytes > PACKAGE_LIMITS.npmOutput) { overflow = true; child.kill('SIGKILL'); return; }
      append(b.toString());
    });
  }
  const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); }, PACKAGE_LIMITS.npmMs);
  try {
    const result = await new Promise((done, reject) => { child.once('error', reject); child.once('close', (code, signal) => done({ code, signal })); });
    assert.equal(expired, false, 'NPM_DEADLINE'); assert.equal(overflow, false, 'NPM_OUTPUT_BOUND');
    assert.equal(result.code, 0, 'npm pack failed: ' + stderr); assert.equal(result.signal, null);
    assert.doesNotMatch(stderr, /DENIED_OPERATION/);
    assert.equal(await observeAbsence(child.pid), true, 'npm pack child remains');
    const records = JSON.parse(stdout); assert.equal(records.length, 1);
    assert.match(records[0].filename, /^[A-Za-z0-9_.-]+\.tgz$/);
    const compressed = readFileSync(join(output, records[0].filename));
    assert.equal(records[0].size, compressed.length);
    return { compressed, record: records[0], args };
  } finally { clearTimeout(timer); }
}
let packed = null, ownedDirectory = null;
const cleanup = [];
before(async t => {
  ownedDirectory = mkdtempSync(join(tmpdir(), 'canli-audit-package-'));
  const artifact = await npmPack(ownedDirectory);
  const entries = tarEntries(artifact.compressed);
  // Capture actual raw bytes and decoded modes before package admission or fixture writes.
  const rawProof = {
    schema: 'canli.fundamentals.audit-package-raw-artifact.v1',
    admission: 'RAW_CAPTURED_NOT_ADMITTED',
    npm_offline_ignore_scripts_update_notifier_disabled: true,
    compressed_bytes: artifact.compressed.length, compressed_sha256: sha(artifact.compressed),
    original_gzip_base64: artifact.compressed.toString('base64'),
    files: [...entries].map(([path, row]) => ({ path, mode: row.mode, bytes: row.bytes.length, sha256: sha(row.bytes) })),
  };
  const rawText = JSON.stringify(rawProof);
  assert.ok(Buffer.byteLength(rawText) <= 360 * 1024, 'TAR_PROOF_BOUND');
  t.diagnostic('CANLI_AUDIT_PACKAGE_TARBALL_RAW ' + rawText);
  const packageJson = auditPackage(entries);
  const nodeModules = join(ownedDirectory, 'fixture', 'node_modules'); mkdirSync(nodeModules, { recursive: true });
  const packageRoot = join(nodeModules, packageJson.name); mkdirSync(packageRoot);
  for (const [path, row] of entries) {
    const target = join(packageRoot, path.slice('package/'.length));
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, row.bytes); chmodSync(target, row.mode);
  }
  // This sole dependency link is disclosed; no install, registry call or repository source link.
  const dependencyRoot = join(PACKAGE_ROOT, 'node_modules');
  for (const [name, version] of [['@modelcontextprotocol/server', '2.1.0'], ['@modelcontextprotocol/core', '2.1.0'], ['zod', '4.6.5']])
    assert.equal(JSON.parse(readFileSync(join(dependencyRoot, name, 'package.json'))).version, version);
  symlinkSync(dependencyRoot, join(packageRoot, 'node_modules'), 'dir');
  const binRoot = join(nodeModules, '.bin'); mkdirSync(binRoot);
  const installedBins = [];
  for (const [name, path] of Object.entries(packageJson.bin)) {
    const target = join(packageRoot, path), rawMode = entries.get('package/' + path).mode;
    symlinkSync('../' + packageJson.name + '/' + path, join(binRoot, name));
    // Model npm bin-links' executable normalization only in this owned fixture.
    // The original tar record and protected repository file are never chmodded.
    if (rawMode !== 0o755) chmodSync(target, 0o755);
    const installedMode = statSync(target).mode & 0o777;
    assert.equal(installedMode, 0o755);
    installedBins.push({ name, path, raw_tar_mode: rawMode, installed_fixture_mode: installedMode, owned_fixture_only: true });
  }
  assert.equal(existsSync(join(ownedDirectory, 'fixture', '.git')), false);
  assert.equal(existsSync(join(ownedDirectory, 'fixture', 'scripts')), false);
  assert.equal(existsSync(join(packageRoot, 'scripts')), false);
  packed = { ...artifact, entries, packageJson, packageRoot, binRoot, dependencyRoot, installedBins, rawProof };
}, { timeout: 30000 });
after(() => {
  if (ownedDirectory) rmSync(ownedDirectory, { recursive: true, force: true });
  assert.ok(cleanup.every(row => row.closeCalls === 1 && row.absent && row.calls === row.dispatches));
});
async function withPackedClient(fn, { defaultServer = false } = {}) {
  const directory = mkdtempSync(join(ownedDirectory, 'session-'));
  const guard = join(directory, 'guard.mjs'); writeFileSync(guard, GUARD);
  const entry = join(packed.binRoot, defaultServer ? 'canli-fundamentals-mcp' : 'canli-fundamentals-audit');
  const beforeFiles = readdirSync(directory).sort();
  const transport = new StdioClientTransport({ command: entry, args: [], cwd: directory, stderr: 'pipe', maxBufferSize: 8 * 1024 * 1024, env: { PATH: process.env.PATH, NODE_OPTIONS: '--import=' + JSON.stringify(guard), CANLI_DATA_CACHE: '' } });
  let dispatches = 0, calls = 0;
  const send = transport.send.bind(transport);
  transport.send = message => { if (message.method === 'tools/call') dispatches++; return send(message); };
  const client = new Client({ name: 'packed-audit-test', version: '1.0.0' });
  let stderr = '', overflow = false, expired = false, ownedPid = null, closeCalls = 0;
  transport.stderr.on('data', b => {
    if (Buffer.byteLength(stderr) + b.length > 8192) {
      overflow = true; const pid = ownedPid ?? transport.pid;
      if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
      return;
    }
    stderr += b.toString();
  });
  const deadline = setTimeout(() => { expired = true; const pid = ownedPid ?? transport.pid; if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} } }, PACKAGE_LIMITS.childMs);
  try {
    await client.connect(transport); ownedPid = transport.pid; assert.ok(Number.isInteger(ownedPid));
    await client.listTools();
    const api = {
      listTools: client.listTools.bind(client), getServerVersion: client.getServerVersion.bind(client), getInstructions: client.getInstructions.bind(client),
      callTool: params => { calls++; return client.callTool(params); },
    };
    return await fn(api);
  } finally {
    ownedPid ??= transport.pid;
    let closeError = null, closeTimer;
    try {
      closeCalls++;
      await Promise.race([client.close(), new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new Error('CLOSE_DEADLINE')), PACKAGE_LIMITS.closeMs); })]);
    } catch (error) { closeError = error; if (ownedPid) { try { process.kill(ownedPid, 'SIGKILL'); } catch {} } }
    finally { clearTimeout(closeTimer); }
    const actuallyAbsent = ownedPid ? await observeAbsence(ownedPid) : true;
    if (!actuallyAbsent && ownedPid) { try { process.kill(ownedPid, 'SIGKILL'); } catch {} }
    clearTimeout(deadline);
    cleanup.push({ closeCalls, absent: actuallyAbsent, calls, dispatches });
    const afterFiles = readdirSync(directory).sort(); rmSync(directory, { recursive: true, force: true });
    assert.equal(actuallyAbsent, true, 'OWNED_PID_PRESENT'); assert.equal(closeCalls, 1);
    assert.equal(expired, false, 'CHILD_DEADLINE'); assert.equal(overflow, false, 'CHILD_STDERR_BOUND');
    assert.equal(dispatches, calls, 'HIDDEN_SDK_RETRY');
    assert.doesNotMatch(stderr, /DENIED_OPERATION/); assert.deepEqual(afterFiles, beforeFiles);
    if (closeError) throw closeError;
  }
}
const cloneEntries = () => new Map([...packed.entries].map(([p, row]) => [p, { mode: row.mode, bytes: Buffer.from(row.bytes) }]));

test('audit package: actual offline no-script tarball admits exact files modes shebang bins contract and pinned closure', t => {
  assert.deepEqual(auditPackage(packed.entries), packed.packageJson);
  assert.equal(packed.record.files.length, FILES.length);
  for (const row of packed.record.files) {
    const actual = packed.entries.get('package/' + row.path);
    assert.ok(actual); assert.equal(row.size, actual.bytes.length); assert.equal(row.mode, actual.mode);
  }
  assert.ok(packed.args.includes('--offline') && packed.args.includes('--ignore-scripts'));
  assert.ok(packed.args.includes('--update-notifier=false'));
  for (const [path, row] of packed.entries) assert.deepEqual(row.bytes, readFileSync(join(PACKAGE_ROOT, path.slice('package/'.length))));
  assert.doesNotMatch([...packed.entries.keys()].join('\n'), /(?:\.git|node_modules|test\/|examples\/|package-lock|\.env|coordination|credential)/);
  // Admission is separate from the original raw diagnostic, including installed bin modes.
  const proof = {
    schema: 'canli.fundamentals.audit-package-artifact.v2',
    admission: 'ADMITTED',
    name: packed.packageJson.name, version: packed.packageJson.version, bins: packed.packageJson.bin,
    npm_offline_ignore_scripts_update_notifier_disabled: true,
    compressed_bytes: packed.compressed.length, compressed_sha256: sha(packed.compressed),
    files: [...packed.entries].map(([path, row]) => ({ path, mode: row.mode, bytes: row.bytes.length, sha256: sha(row.bytes) })),
    installed_bins: packed.installedBins,
    SDK_command: 'Direct owned .bin symlink and existing shebang; NODE_OPTIONS pre-import guard.',
    sole_dependency_link: 'Existing remote CI SDK server/core2.1.0 and Zod4.6.5 node_modules; no repository runtime source link or install.',
  };
  const text = JSON.stringify(proof);
  assert.ok(Buffer.byteLength(text) <= 360 * 1024, 'TAR_PROOF_BOUND');
  t.diagnostic('CANLI_AUDIT_PACKAGE_TARBALL ' + text);
});
test('audit package: raw archive modes stay distinct from explicit owned bin-link executable normalization', () => {
  const beforeFiles = readdirSync(ownedDirectory).sort();
  for (const path of ['package/src/server.mjs', 'package/src/audit-inputs-stdio.mjs', 'package/src/canonical-json.mjs']) {
    const entries = cloneEntries();
    entries.get(path).mode = RAW_MODES[path] === 0o644 ? 0o755 : 0o644;
    assert.throws(() => auditPackage(entries), /PACKAGE_MODE/);
  }
  assert.deepEqual(readdirSync(ownedDirectory).sort(), beforeFiles);
  assert.deepEqual(packed.installedBins, [
    { name: 'canli-fundamentals-mcp', path: 'src/server.mjs', raw_tar_mode: 0o644, installed_fixture_mode: 0o755, owned_fixture_only: true },
    { name: 'canli-fundamentals-audit', path: 'src/audit-inputs-stdio.mjs', raw_tar_mode: 0o755, installed_fixture_mode: 0o755, owned_fixture_only: true },
    { name: 'canli-expert-submission-audit', path: 'src/expert-submission-stdio.mjs', raw_tar_mode: 0o755, installed_fixture_mode: 0o755, owned_fixture_only: true },
    { name: 'canli-fundamentals-audit-files', path: 'src/audit-inputs-client.mjs', raw_tar_mode: 0o755, installed_fixture_mode: 0o755, owned_fixture_only: true },
    { name: 'canli-expert-submission-files', path: 'src/expert-submission-files.mjs', raw_tar_mode: 0o755, installed_fixture_mode: 0o755, owned_fixture_only: true },
    { name: 'canli-expert-submission-client', path: 'src/expert-submission-client.mjs', raw_tar_mode: 0o755, installed_fixture_mode: 0o755, owned_fixture_only: true },
    { name: 'canli-expert-intake-files', path: 'src/expert-intake-files.mjs', raw_tar_mode: 0o755, installed_fixture_mode: 0o755, owned_fixture_only: true },
    { name: 'canli-expert-intake-prepare', path: 'src/expert-intake-stdio.mjs', raw_tar_mode: 0o755, installed_fixture_mode: 0o755, owned_fixture_only: true },
  ]);
  for (const row of packed.installedBins) {
    const path = 'package/' + row.path;
    assert.equal(packed.entries.get(path).mode, RAW_MODES[path]);
    assert.equal(statSync(join(packed.packageRoot, row.path)).mode & 0o777, 0o755);
    assert.equal(sha(readFileSync(join(packed.packageRoot, row.path))), SOURCE_PINS[path]);
    assert.equal(sha(readFileSync(join(PACKAGE_ROOT, row.path))), SOURCE_PINS[path]);
  }
});
test('audit package: canonical bytes and import-only core prove distinct old new whole hashes without changing functions', () => {
  const core = packed.entries.get('package/src/audit-inputs-core.mjs').bytes.toString();
  assert.equal(sha(Buffer.from(core.replace("from './canonical-json.mjs'", "from '../../scripts/canonical-json.mjs'"))), '40ac2b1e5321cb453a71797888138f38570a4d6057d197461d681237506bff36');
  assert.notEqual(sha(Buffer.from(core)), '40ac2b1e5321cb453a71797888138f38570a4d6057d197461d681237506bff36');
  assert.equal(sha(readFileSync(resolve(PACKAGE_ROOT, '../scripts/canonical-json.mjs'))), SOURCE_PINS['package/src/canonical-json.mjs']);
  assert.equal(sha(readFileSync(join(PACKAGE_ROOT, 'examples/audit-inputs-stdio.mjs'))), 'de1deacff44907249640e8c6dfe4a0df9ec38dc27aed4a299e8ffed0146a421c');
});
test('audit package: missing canonical helper refuses before any package source import', () => {
  const entries = cloneEntries(); entries.delete('package/src/canonical-json.mjs');
  assert.throws(() => auditPackage(entries), /PACKAGE_MEMBERS/);
});
test('audit package: changed canonical helper bytes refuse the independently pinned source audit', () => {
  const entries = cloneEntries(); entries.get('package/src/canonical-json.mjs').bytes[100] ^= 1;
  assert.throws(() => auditPackage(entries), /SOURCE_PIN/);
});
test('audit package: relative import escaping the tarball refuses source closure even if a repository exists elsewhere', () => {
  const entries = cloneEntries(), path = 'package/src/audit-inputs-core.mjs';
  entries.get(path).bytes = Buffer.from(entries.get(path).bytes.toString().replace("from './canonical-json.mjs'", "from '../../scripts/canonical-json.mjs'"));
  assert.throws(() => auditPackage(entries), /OUTSIDE_IMPORT/);
});
test('audit package: changed declared bin and additional private member both refuse the complete package audit', () => {
  const entries = cloneEntries(), json = JSON.parse(entries.get('package/package.json').bytes);
  json.bin['canli-fundamentals-audit'] = '../scripts/audit.mjs'; entries.get('package/package.json').bytes = raw(json);
  assert.throws(() => auditPackage(entries), /PACKAGE_BIN/);
  const added = cloneEntries(); added.set('package/private.env', { mode: 0o644, bytes: Buffer.from('PRIVATE_SYNTHETIC') });
  assert.throws(() => auditPackage(added), /PACKAGE_MEMBERS/);
});
test('audit package: gzip corruption compressed capacity and traversal path refuse before unpack writes', () => {
  const bad = Buffer.from(packed.compressed); bad[bad.length - 8] ^= 1;
  assert.throws(() => tarEntries(bad));
  assert.throws(() => tarEntries(Buffer.alloc(PACKAGE_LIMITS.compressed + 1)), /TAR_BOUND/);
  const bytes = gunzipSync(packed.compressed); Buffer.from('package/../private').copy(bytes, 0); bytes.fill(0, 18, 100);
  assert.throws(() => tarEntries(gzipSync(bytes)), /TAR_PATH/);
});
test('audit package: raw high-bit name prefix type numeric and checksum headers refuse before decoding or fixture writes', () => {
  const beforeFiles = readdirSync(ownedDirectory).sort();
  for (const index of [0, 100, 124, 148, 156, 345]) {
    const bytes = gunzipSync(packed.compressed);
    if (index !== 148) bytes[index] |= 0x80;
    bytes.fill(32, 148, 156);
    const sum = bytes.subarray(0, 512).reduce((n, b) => n + b, 0);
    Buffer.from(sum.toString(8).padStart(6, '0') + '\0 ').copy(bytes, 148);
    if (index === 148) bytes[index] |= 0x80;
    assert.throws(() => tarEntries(gzipSync(bytes)), /TAR_ASCII/);
  }
  assert.deepEqual(readdirSync(ownedDirectory).sort(), beforeFiles);
});
test('audit package: installed-bin-style symlink actually initializes exactly one annotated SDK tool with bounded schemas', { timeout: 20000 }, async () => {
  await withPackedClient(async client => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name), ['audit_inputs']);
    assert.deepEqual(tools[0].annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    assert.equal(tools[0].inputSchema.additionalProperties, false);
    assert.equal(tools[0].inputSchema.properties.expected_reference_sha256.minLength, 64);
    assert.equal(tools[0].inputSchema.properties.expected_reference_sha256.maxLength, 64);
    assert.equal(tools[0].outputSchema.type, 'object');
    assert.equal(client.getServerVersion().name, 'canli-fundamentals-audit');
    assert.match(client.getInstructions(), /every selected row/);
    assert.match(client.getInstructions(), /opt-in package/);
  });
});
test('audit package: actual compact and evidence outputs fingerprints hashes and exact raw bindings match delivered repository behavior', { timeout: 20000 }, async () => {
  await withPackedClient(async client => {
    const f = fixture({ rows: [usage(), usage({ value: 90 })] });
    for (const detail of ['compact', 'evidence']) {
      const args = argumentsFor(f, detail), d = payload(await client.callTool({ name: 'audit_inputs', arguments: args }));
      assert.deepEqual(d, JSON.parse(JSON.stringify(repositoryAudit(args).structuredContent)));
      assert.deepEqual(d.audit.rows.map(r => [r.status, r.verdict, r.selected.value]), [['match', true, 100], ['mismatch', false, 100]]);
      assert.equal(d.projection.retained_selected_n, 2);
      assert.equal(d.adapter.whole_module_sha256_verified, false);
      if (detail === 'evidence') for (const key of ['reference', 'usage', 'settings']) {
        assert.equal(d.audit.bindings[key].original_base64, f[key].toString('base64'));
        assert.equal(d.audit.bindings[key].sha256, sha(f[key]));
      }
    }
  });
});
test('audit package: all six outcome rows retain full selected N and unknown verdicts through the actual packed command', { timeout: 20000 }, async () => {
  await withPackedClient(async client => {
    const f = fixture({ vintages: [first()], extraFacts: { Tied: { units: { USD: [first(), first({ val: 99, accn: '0000123456-20-000002' })] } } },
      rows: [usage(), usage({ value: 99 }), usage({ concept: 'Absent' }), usage({ unit: 'EUR' }), usage({ concept: 'Tied' }), usage({ used_on: '2020-02-10' })] });
    const d = payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor(f) }));
    assert.deepEqual(d.audit.rows.map(r => r.status), ['match', 'mismatch', 'missing', 'unsupported', 'ambiguous', 'timing_indeterminate']);
    assert.equal(d.audit.coverage.selected_n, 6); assert.equal(d.projection.retained_selected_n, 6);
    assert.equal(d.audit.coverage.verdict_unknown_n, 4);
    for (const row of d.audit.rows.slice(2)) assert.equal(row.verdict, null);
  });
});
test('audit package: wrong reference SHA returns a bounded non-echoing refusal and a valid next call recovers', { timeout: 20000 }, async () => {
  await withPackedClient(async client => {
    refused(await client.callTool({ name: 'audit_inputs', arguments: { ...argumentsFor(), expected_reference_sha256: '0'.repeat(64) } }), 'CORE_REFERENCE_SHA');
    assert.equal(payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor() })).status, 'ok');
  });
});
test('audit package: hash terminator controls refuse strict SHA admission over actual SDK then recover', { timeout: 20000 }, async () => {
  await withPackedClient(async client => {
    const args = argumentsFor();
    for (const suffix of ['\n', '\r\n', '\u2028', '\0'])
      refused(await client.callTool({ name: 'audit_inputs', arguments: { ...args, expected_reference_sha256: args.expected_reference_sha256 + suffix } }), 'EXPECTED_SHA');
    assert.equal(payload(await client.callTool({ name: 'audit_inputs', arguments: args })).status, 'ok');
  });
});
test('audit package: noncanonical base64 padding alphabet and newline refuse without raw echo then recover', { timeout: 20000 }, async () => {
  await withPackedClient(async client => {
    for (const settings_base64 of ['e30=\n', '_w==', 'Zh==', 'Zm9=', 'e30'])
      refused(await client.callTool({ name: 'audit_inputs', arguments: { ...argumentsFor(), settings_base64 } }), 'BASE64');
    assert.equal(payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor() })).status, 'ok');
  });
});
test('audit package: oversized individually valid inputs refuse aggregate admission and all 64 selected rows still recover intact', { timeout: 20000 }, async () => {
  await withPackedClient(async client => {
    const args = { ...argumentsFor(), reference_base64: Buffer.alloc(STDIO_AUDIT_LIMITS.referenceBytes, 120).toString('base64'), usage_base64: Buffer.alloc(STDIO_AUDIT_LIMITS.usageBytes, 120).toString('base64') };
    refused(await client.callTool({ name: 'audit_inputs', arguments: args }), 'AGGREGATE_BOUND');
    const f = fixture({ rows: Array.from({ length: 64 }, () => usage()) });
    const d = payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor(f) }));
    assert.equal(d.audit.rows.length, 64); assert.equal(d.audit.coverage.selected_n, 64); assert.equal(d.projection.retained_selected_n, 64);
  });
});
test('audit package: supplied whole module hash stays unverified and source rights and full universe remain unknown', { timeout: 20000 }, async () => {
  await withPackedClient(async client => {
    const f = fixture(); f.settings = raw({ ...JSON.parse(f.settings), implementation_source_sha256: 'a'.repeat(64) });
    const d = payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor(f) }));
    assert.equal(d.audit.implementation.declared_module_sha256, 'a'.repeat(64));
    assert.equal(d.audit.implementation.declared_module_sha256_verified, false);
    assert.equal(d.adapter.whole_module_sha256_verified, false);
    assert.equal(d.audit.established.source_rights, null); assert.equal(d.audit.established.full_universe_coverage, null);
  });
});
test('audit package: callback failure still closes the SDK child once and observes actual PID absence', { timeout: 20000 }, async () => {
  const count = cleanup.length;
  await assert.rejects(withPackedClient(async client => {
    assert.equal(payload(await client.callTool({ name: 'audit_inputs', arguments: argumentsFor() })).status, 'ok');
    throw new Error('INTENTIONAL_PACK_CALLBACK_FAILURE');
  }), /INTENTIONAL_PACK_CALLBACK_FAILURE/);
  assert.equal(cleanup.length, count + 1); assert.equal(cleanup.at(-1).closeCalls, 1); assert.equal(cleanup.at(-1).absent, true);
});
test('audit package: armed pre-import child sentinel positively blocks network and file writes including caught attempts', { timeout: 20000 }, async () => {
  const directory = mkdtempSync(join(ownedDirectory, 'controls-')); const guard = join(directory, 'guard.mjs'); writeFileSync(guard, GUARD);
  async function probe(source, marker) {
    const child = spawn(process.execPath, ['--import', guard, '--input-type=module', '-e', source], { cwd: directory, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '', expired = false, overflow = false;
    child.stderr.on('data', b => {
      if (Buffer.byteLength(stderr) + b.length > 8192) { overflow = true; child.kill('SIGKILL'); return; }
      stderr += b.toString();
    });
    const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); }, 5000);
    try {
      const ended = await new Promise((done, reject) => { child.once('error', reject); child.once('close', (code, signal) => done({ code, signal })); });
      assert.equal(expired, false); assert.equal(overflow, false); assert.equal(ended.code, 77); assert.equal(ended.signal, null);
      assert.match(stderr, marker); assert.equal(await observeAbsence(child.pid), true);
    } finally { clearTimeout(timer); }
  }
  try {
    await probe("try { await fetch('https://invalid.example'); process.exitCode=1; } catch { process.exitCode=77; }", /DENIED_OPERATION:fetch/);
    await probe("import {writeFileSync} from 'node:fs'; try {writeFileSync('forbidden','x');process.exitCode=1;} catch {process.exitCode=77;}", /DENIED_OPERATION:writeFileSync/);
    assert.deepEqual(readdirSync(directory), ['guard.mjs']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('audit package: actual default command in the same tarball still lists exactly the protected seven tools', { timeout: 20000 }, async () => {
  await withPackedClient(async client => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['cross_section', 'find_company', 'history', 'known_as_of', 'list_concepts', 'restatements', 'vintages']);
    assert.equal(client.getServerVersion().version, '0.5.0');
    assert.ok(!tools.some(t => t.name === 'audit_inputs'));
  }, { defaultServer: true });
});
test('audit package: included self-contained synthetic client workflow executes against the packed command', { timeout: 20000 }, async () => {
  const guide = packed.entries.get('package/AUDIT_INPUTS.md').bytes.toString();
  const match = guide.match(/<!-- audit-package-workflow:start -->\s*\x60\x60\x60js\n([\s\S]+?)\n\x60\x60\x60\s*<!-- audit-package-workflow:end -->/);
  assert.ok(match, 'packaged workflow missing');
  const workflow = new Function('return (' + match[1] + ');')();
  await withPackedClient(async client => {
    const d = await workflow(client, createHash);
    assert.equal(d.audit.coverage.selected_n, 1); assert.equal(d.audit.rows[0].status, 'mismatch');
    assert.equal(d.audit.rows[0].selected.value, 100); assert.equal(d.audit.rows[0].later_only_value_observed, true);
  });
});
test('audit package: oversized unterminated protocol frame exits with bounded notice no raw echo and actual owned PID absence', { timeout: 15000 }, async () => {
  const directory = mkdtempSync(join(ownedDirectory, 'frame-')); const guard = join(directory, 'guard.mjs'); writeFileSync(guard, GUARD);
  const child = spawn(process.execPath, ['--import', guard, join(packed.binRoot, 'canli-fundamentals-audit')], { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', stdout = '', expired = false, overflow = false;
  for (const [stream, append] of [[child.stdout, b => { stdout += b; }], [child.stderr, b => { stderr += b; }]]) {
    stream.on('data', b => {
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + b.length > 8192) { overflow = true; child.kill('SIGKILL'); return; }
      append(b.toString());
    });
  }
  child.stdin.on('error', error => { assert.equal(error.code, 'EPIPE'); });
  const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); }, 7000);
  try {
    const terminal = new Promise((done, reject) => { child.once('error', reject); child.once('close', (code, signal) => done({ code, signal })); });
    child.stdin.end(Buffer.alloc(STDIO_AUDIT_LIMITS.requestBufferBytes + 64, 120));
    const ended = await terminal;
    assert.equal(expired, false); assert.equal(overflow, false); assert.equal(ended.signal, null);
    assert.equal(stdout, ''); assert.match(stderr, /transport refused \(TRANSPORT\)/);
    assert.doesNotMatch(stderr, /xxx|DENIED_OPERATION/);
    assert.equal(await observeAbsence(child.pid), true); assert.deepEqual(readdirSync(directory), ['guard.mjs']);
  } finally { clearTimeout(timer); rmSync(directory, { recursive: true, force: true }); }
});
