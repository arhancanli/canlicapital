import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { reconcileExpertSubmissions as originalCore } from '../../scripts/datasets/filing-facts/expert-submission-audit.mjs';
import { contentHash } from '../../scripts/canonical-json.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = Object.freeze({ compressed: 262144, expanded: 2097152, members: 32, npmOutput: 65536,
  fixture: 24 * 1024 * 1024, work: 15000, closure: 5000, total: 20000 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE_PINS = Object.freeze({
  'src/expert-submission-client.mjs': '2f6935f53821dcfee2a7cbae51e927672fb26c49c73353fc515ecb1096cceb31',
  'src/expert-submission-files.mjs': 'a5ed0b30f5338d3ed560f7fbc7cbb0e78966a56da188b72a8515ab077c4ea22d',
  'src/audit-inputs-client.mjs': '95fe942b1278768b4c938d82054d2d472eb3411c5587bdd8be4067b1dc0bc9b7',
  'src/server.mjs': 'dd856068821d05648eb5f3ff6f2e2996cc165de2c9b6f1d24f506fbc29382d38',
  'src/audit-inputs-stdio.mjs': '537673fc03d0954ae480b239b8b481d11e14d763f1d0c07a985bb7d8fbd5b5c0',
  'src/audit-inputs-core.mjs': 'e612ba0e44d12fd275b3e1dc0a2331bfe6fb005b4da8075e46ae009c5e299059',
  'src/canonical-json.mjs': '881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b',
  'src/expert-submission-stdio.mjs': '56075a5daaa61bffbace0551aefe1220c372854ddca295b6adddd62abef65208',
  'src/expert-submission-audit-core.mjs': '4040abc8f142d77571117979b73790be5a7ddb9bbf8fe6eee2fcb686ea9099f3',
  'src/expert-intake-core.mjs': '5095379afe5ca5be2c2fc8dc2fac191025c454f87e135d036b307f84bb57d545',
  'src/expert-agreement.mjs': '80732bf61e1cef9bd3ff06cf831307675546f4789f8336f1668d5fd637a7b4ef',
  'src/filing-facts-packet.mjs': '74f2b353c0bf48d6e409d25925a6d691cf105a6f50aafdf561efbbbe679023c8',
});
const SDK_SOURCE_PINS = Object.freeze({
  '@modelcontextprotocol/client/package.json': 'd3e82c6355b41114e61f892d628f0788db15def04658279cebaae656e41704a4',
  '@modelcontextprotocol/client/dist/stdio.mjs': '89b2fb52b95d4b2ba79f1bd4e022282d9654177e4ee06ee904efeb8764d59b5c',
  '@modelcontextprotocol/client/dist/src-DDAAhLnO.mjs': '743dee8114f52b5e7df4690770453f6655502cf729380757a392b1ff2ddb070d',
  '@modelcontextprotocol/server/package.json': 'b7ca8faf8b399f12f995ffb93873541abe98ba68d8e72eb9979b0540f4293dd9',
  '@modelcontextprotocol/server/dist/stdio.mjs': '017575c4e870c19579aec6973d405c504c542cc748e262e39fa0a36f3e96aab5',
  '@modelcontextprotocol/server/dist/mcp-Dw2OlZ1f.mjs': '29840cb4f42d4aaf0ed217080c87df34d7bfa9ddea2e6e56616f35e3ac56f44a',
  '@modelcontextprotocol/server/dist/src-D-y6h4N7.mjs': '9cc3caf713a88aa6d7787001b673915ee011ea5edc620118aae2737c4b335c75',
  '@modelcontextprotocol/core/package.json': 'c3902f5ce4f7c44fe8c763adab3ea0f76a6e0d6b54d88d81bc2a3ec0e47ebb34',
});
const MEMBERS = Object.freeze(['LICENSE', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md',
  'package.json', ...Object.keys(SOURCE_PINS)].map(name => 'package/' + name).sort());
const BIN = Object.freeze({ 'canli-fundamentals-mcp': 'src/server.mjs',
  'canli-fundamentals-audit': 'src/audit-inputs-stdio.mjs', 'canli-expert-submission-audit': 'src/expert-submission-stdio.mjs', 'canli-fundamentals-audit-files': 'src/audit-inputs-client.mjs', 'canli-expert-submission-files': 'src/expert-submission-files.mjs', 'canli-expert-submission-client': 'src/expert-submission-client.mjs' });
const MODES = Object.freeze(Object.fromEntries(MEMBERS.map(name => [name,
  ['package/src/audit-inputs-stdio.mjs', 'package/src/expert-submission-stdio.mjs', 'package/src/audit-inputs-client.mjs', 'package/src/expert-submission-files.mjs', 'package/src/expert-submission-client.mjs'].includes(name) ? 0o755 : 0o644])));
const RELOCATIONS = Object.freeze([
  ['src/expert-submission-stdio.mjs', 'examples/expert-submission-stdio.mjs', [
    ['../../scripts/datasets/filing-facts/expert-submission-audit.mjs', './expert-submission-audit-core.mjs'],
    ['../../scripts/canonical-json.mjs', './canonical-json.mjs'],
    ['Repository-only opt-in example.', 'Packaged opt-in command.'],
    ['Offline repository example', 'Offline opt-in package command'],
    ['repository EXPERT_SUBMISSION_STDIO.md', 'packaged EXPERT_SUBMISSIONS.md'],
    ['Repository expert-submission audit', 'Packaged expert-submission audit'],
  ]],
  ['src/expert-submission-audit-core.mjs', '../scripts/datasets/filing-facts/expert-submission-audit.mjs', [
    ['../../canonical-json.mjs', './canonical-json.mjs'], ['../../../js/filing-facts-packet.js', './filing-facts-packet.mjs'],
    ['./expert-intake.mjs', './expert-intake-core.mjs'], ['./agreement.mjs', './expert-agreement.mjs'],
  ]],
  ['src/expert-intake-core.mjs', '../scripts/datasets/filing-facts/expert-intake.mjs', [
    ['../../canonical-json.mjs', './canonical-json.mjs'], ['../../../js/filing-facts-packet.js', './filing-facts-packet.mjs'],
  ]],
  ['src/expert-agreement.mjs', '../scripts/datasets/filing-facts/agreement.mjs', [
    ['../../canonical-json.mjs', './canonical-json.mjs'], ['../../../js/filing-facts-packet.js', './filing-facts-packet.mjs'],
  ]],
  ['src/filing-facts-packet.mjs', '../js/filing-facts-packet.js', [['../scripts/canonical-json.mjs', './canonical-json.mjs']]],
]);
function snapshot(filename, cap) {
  let fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
  try {
    const first = fs.fstatSync(fd); assert.ok(first.isFile() && first.size <= cap, 'FILE_BOUND');
    const buffer = Buffer.alloc(first.size + 1); let n = 0;
    while (n < buffer.length) { const size = fs.readSync(fd, buffer, n, buffer.length - n, null); if (!size) break; n += size; }
    const last = fs.fstatSync(fd), post = fs.lstatSync(filename);
    for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) { assert.equal(last[key], first[key]); assert.equal(post[key], last[key]); }
    assert.equal(n, first.size); const owned = fd; fd = undefined; fs.closeSync(owned);
    return Buffer.from(buffer.subarray(0, n));
  } finally { if (fd !== undefined) { const owned = fd; fd = undefined; fs.closeSync(owned); } }
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function tarEntries(compressed) {
  assert.ok(Buffer.isBuffer(compressed) && compressed.length >= 18 && compressed.length <= L.compressed, 'GZIP_BOUND');
  assert.deepEqual([...compressed.subarray(0, 4)], [31, 139, 8, 0], 'GZIP_HEADER');
  const inflated = inflateRawSync(compressed.subarray(10), { maxOutputLength: L.expanded, info: true });
  const bytes = inflated.buffer, end = 10 + inflated.engine.bytesWritten;
  assert.equal(end + 8, compressed.length, 'GZIP_SINGLE_MEMBER');
  assert.equal(compressed.readUInt32LE(end), crc32(bytes), 'GZIP_CRC');
  assert.equal(compressed.readUInt32LE(end + 4), bytes.length >>> 0, 'GZIP_ISIZE');
  assert.ok(bytes.length <= L.expanded && bytes.length % 512 === 0, 'TAR_BOUND');
  const entries = new Map(); let offset = 0, ended = false;
  const ascii = (bytes, numeric = false) => {
    assert.ok(bytes.every(byte => byte <= 127), 'TAR_ASCII');
    const zero = bytes.indexOf(0), prefix = zero < 0 ? bytes : bytes.subarray(0, zero);
    if (zero >= 0) assert.ok(bytes.subarray(zero).every(byte => byte === 0 || (numeric && byte === 32)), 'TAR_FIELD_PADDING');
    return prefix.toString('ascii');
  };
  const octal = bytes => { const text = ascii(bytes, true).trim(); assert.match(text, /^[0-7]+$/, 'TAR_OCTAL'); return parseInt(text, 8); };
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      assert.ok(offset + 1024 <= bytes.length && bytes.subarray(offset).every(byte => byte === 0), 'TAR_END'); ended = true; break;
    }
    assert.ok(entries.size < L.members, 'TAR_COUNT');
    // Admit raw7-bit header bytes before any text field conversion.
    assert.ok(header.every(byte => byte <= 127), 'TAR_ASCII');
    const name = ascii(header.subarray(0, 100)), prefix = ascii(header.subarray(345, 500));
    const filename = prefix ? prefix + '/' + name : name;
    assert.match(filename, /^package\/[A-Za-z0-9_./-]+$/, 'TAR_PATH');
    assert.ok(!filename.includes('//') && filename.split('/').every(part => part && part !== '.' && part !== '..'), 'TAR_PATH');
    assert.ok(!entries.has(filename), 'TAR_DUPLICATE');
    const type = ascii(header.subarray(156, 157)); assert.ok(type === '' || type === '0', 'TAR_REGULAR');
    assert.equal(ascii(header.subarray(157, 257)), '', 'TAR_LINK');
    const size = octal(header.subarray(124, 136)), mode = octal(header.subarray(100, 108));
    assert.ok(size <= L.expanded && (mode === 0o644 || mode === 0o755), 'TAR_FILE_BOUND_MODE');
    const sum = header.reduce((n, byte, i) => n + (i >= 148 && i < 156 ? 32 : byte), 0);
    assert.equal(sum, octal(header.subarray(148, 156)), 'TAR_CHECKSUM');
    const next = offset + 512 + Math.ceil(size / 512) * 512; assert.ok(next <= bytes.length, 'TAR_BODY');
    entries.set(filename, { mode, bytes: Buffer.from(bytes.subarray(offset + 512, offset + 512 + size)) }); offset = next;
  }
  assert.equal(ended, true, 'TAR_END'); return entries;
}
function checkImports(entries) {
  const externals = new Set(['@modelcontextprotocol/server', '@modelcontextprotocol/server/stdio', 'zod']);
  for (const [filename, row] of entries) {
    if (!/\.(?:mjs|js)$/.test(filename)) continue;
    const source = row.bytes.toString('utf8');
    const dynamic = [...source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)];
    if (filename === 'package/src/audit-inputs-client.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS['src/audit-inputs-client.mjs'], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio'], 'FIXED_DYNAMIC_IMPORTS');
    } else if (filename === 'package/src/expert-submission-files.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS['src/expert-submission-files.mjs'], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['./expert-submission-audit-core.mjs'], 'FIXED_DYNAMIC_IMPORTS');
      assert.ok(entries.has('package/src/expert-submission-audit-core.mjs'), 'MISSING_LOCAL_IMPORT');
    } else if (filename === 'package/src/expert-submission-client.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS['src/expert-submission-client.mjs'], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio', './expert-submission-stdio.mjs'], 'FIXED_DYNAMIC_IMPORTS');
      assert.ok(entries.has('package/src/expert-submission-stdio.mjs'), 'LOCAL_IMPORT');
    } else assert.equal(dynamic.length, 0, 'DYNAMIC_IMPORT');
    assert.doesNotMatch(source.replace(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g, 'FIXED_SDK_IMPORT'), /\b(?:import\s*\(|require\s*\(|createRequire\b)/, 'DYNAMIC_IMPORT');
    const imports = [...source.matchAll(/^import .+ from ['"]([^'"]+)['"];$/gm)];
    assert.equal(imports.length, [...source.matchAll(/^import\b/gm)].length, 'UNPARSED_IMPORT');
    assert.doesNotMatch(source, /^export\s+(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\b/gm, 'UNPARSED_REEXPORT');
    for (const [, name] of imports) {
      if (name.startsWith('.')) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(filename), name));
        assert.ok(target.startsWith('package/src/') && entries.has(target), 'OUTSIDE_OR_MISSING_IMPORT');
      } else assert.ok(name.startsWith('node:') || externals.has(name), 'EXTERNAL_IMPORT');
    }
  }
}
let expectedBytes;
function audit(entries) {
  assert.deepEqual([...entries.keys()].sort(), MEMBERS, 'PACKAGE_MEMBERS'); checkImports(entries);
  for (const [filename, row] of entries) {
    assert.equal(row.mode, MODES[filename], 'PACKAGE_MODE');
    const local = filename.slice(8);
    if (SOURCE_PINS[local]) assert.equal(sha(row.bytes), SOURCE_PINS[local], 'SOURCE_PIN');
  }
  const metadata = JSON.parse(entries.get('package/package.json').bytes);
  assert.deepEqual(metadata.bin, BIN, 'PACKAGE_BIN');
  assert.deepEqual(metadata.files, ['src', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md'], 'PACKAGE_FILES');
  assert.equal(metadata.name, 'canli-fundamentals-mcp'); assert.equal(metadata.version, '0.5.0');
  assert.deepEqual(metadata.dependencies, { '@modelcontextprotocol/server': '2.1.0', zod: '4.6.5', '@modelcontextprotocol/client': '2.1.0' });
  for (const [filename, row] of entries) assert.deepEqual(row.bytes, expectedBytes.get(filename), 'EXACT_FROZEN_BYTES');
  assert.match(entries.get('package/src/expert-submission-stdio.mjs').bytes.toString(), /^#!\/usr\/bin\/env node\n/);
  return metadata;
}
const absent = pid => {
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; }
};
function bounded(promise, ms) {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('OWNED_BOUND')), Math.max(1, ms));
  })]).finally(() => clearTimeout(timer));
}
const NETWORK_GUARD = `
import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
import tls from 'node:tls'; import dgram from 'node:dgram'; import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
const deny = name => () => { process.stderr.write('DENIED_OPERATION:' + name + '\\n'); throw new Error('DENIED_OPERATION'); };
globalThis.fetch = deny('fetch');
for (const [object, names] of [[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],
  [tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]])
  for (const name of names) object[name] = deny(name);
net.Socket.prototype.connect = deny('socket'); net.Server.prototype.listen = deny('listen');
syncBuiltinESMExports();
`;
const CONSUMER_GUARD = NETWORK_GUARD + `
import fs from 'node:fs'; import fsp from 'node:fs/promises'; import child from 'node:child_process';
for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) child[name] = deny(name);
for (const name of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','rename','renameSync',
  'rm','rmSync','unlink','unlinkSync','truncate','truncateSync','createWriteStream','copyFile','copyFileSync','cp','cpSync',
  'symlink','symlinkSync','link','linkSync','chmod','chmodSync','chown','chownSync']) fs[name] = deny(name);
for (const name of ['writeFile','appendFile','mkdir','rename','rm','unlink','truncate','copyFile','cp','symlink','link','chmod','chown']) fsp[name] = deny(name);
const writable = flag => typeof flag === 'number' ? !!(flag & (fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND)) : flag !== undefined && flag !== 'r' && flag !== 'rs';
for (const name of ['open','openSync']) { const original = fs[name]; fs[name] = (...args) => writable(args[1]) ? deny(name)() : original(...args); }
const originalOpen = fsp.open; fsp.open = (...args) => writable(args[1]) ? deny('open')() : originalOpen(...args);
for (const name of ['write','writeSync','writev','writevSync']) { const original = fs[name]; fs[name] = (...args) => args[0] === 1 || args[0] === 2 ? original(...args) : deny(name)(); }
syncBuiltinESMExports();
`;
let directory, packed, adapter, workflow, npmAttempts = 0, actualEntries = 0;
const closures = [];
async function packOnce() {
  assert.equal(++npmAttempts, 1); const output = path.join(directory, 'output'), cache = path.join(directory, 'cache');
  fs.mkdirSync(output, { mode: 0o700 }); fs.mkdirSync(cache, { mode: 0o700 });
  const guard = path.join(directory, 'npm-network.mjs'); fs.writeFileSync(guard, NETWORK_GUARD, { flag: 'wx', mode: 0o600 });
  const user = path.join(directory, 'user.conf'), global = path.join(directory, 'global.conf');
  fs.writeFileSync(user, '', { flag: 'wx', mode: 0o600 }); fs.writeFileSync(global, '', { flag: 'wx', mode: 0o600 });
  const args = ['pack', '--offline', '--ignore-scripts', '--update-notifier=false', '--audit=false', '--fund=false',
    '--json', '--cache', cache, '--pack-destination', output, '--userconfig', user, '--globalconfig', global];
  const child = spawn('npm', args, { cwd: ROOT, env: { PATH: process.env.PATH, CI: 'true',
    NODE_OPTIONS: '--import=' + JSON.stringify(guard) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', bytes = 0, failed = null; const started = performance.now();
  for (const [stream, append] of [[child.stdout, text => { stdout += text; }], [child.stderr, text => { stderr += text; }]])
    stream.on('data', chunk => { bytes += chunk.length;
      if (bytes > L.npmOutput) { failed ??= 'NPM_OUTPUT'; child.kill('SIGKILL'); return; } append(chunk.toString());
    });
  const terminal = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  const timer = setTimeout(() => { failed ??= 'NPM_DEADLINE'; child.kill('SIGKILL'); }, L.total);
  try {
    const ended = await bounded(terminal, L.total + L.closure);
    assert.ok(performance.now() - started <= L.total, 'NPM_OBSERVED_WORK_BOUND');
    assert.equal(failed, null); assert.equal(ended.code, 0, 'NPM_EXIT'); assert.equal(ended.signal, null);
    assert.doesNotMatch(stderr, /DENIED_OPERATION/); assert.equal(absent(child.pid), true);
    const rows = JSON.parse(stdout); assert.equal(rows.length, 1); assert.match(rows[0].filename, /^[A-Za-z0-9_.-]+\.tgz$/);
    const compressed = snapshot(path.join(output, rows[0].filename), L.compressed);
    assert.equal(compressed.length, rows[0].size); return { compressed, args };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await bounded(terminal, L.closure); }
  }
}
before(async t => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canli-expert-package-')); fs.chmodSync(directory, 0o700);
  expectedBytes = new Map(MEMBERS.map(name => [name, snapshot(path.join(ROOT, name.slice(8)), L.expanded)]));
  const artifact = await packOnce(), entries = tarEntries(artifact.compressed);
  const raw = { admission: 'RAW_CAPTURED_NOT_ADMITTED', compressed_bytes: artifact.compressed.length,
    compressed_sha256: sha(artifact.compressed), original_gzip_base64: artifact.compressed.toString('base64'),
    files: [...entries].map(([filename, row]) => ({ path: filename, mode: row.mode, bytes: row.bytes.length, sha256: sha(row.bytes) })) };
  assert.ok(Buffer.byteLength(JSON.stringify(raw)) <= 512 * 1024);
  t.diagnostic('CANLI_EXPERT_PACKAGE_TARBALL_RAW ' + JSON.stringify(raw));
  const metadata = audit(entries);
  const consumer = path.join(directory, 'consumer'); fs.mkdirSync(consumer, { mode: 0o700 });
  const nodeModules = path.join(consumer, 'node_modules'); fs.mkdirSync(nodeModules);
  const packageRoot = path.join(nodeModules, metadata.name); fs.mkdirSync(packageRoot);
  let fixtureBytes = 0;
  for (const [filename, row] of entries) {
    fixtureBytes += row.bytes.length; assert.ok(fixtureBytes <= L.fixture);
    const target = path.join(packageRoot, filename.slice(8)); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, row.bytes, { flag: 'wx', mode: row.mode }); fs.chmodSync(target, row.mode);
  }
  const dependencyRoot = path.join(ROOT, 'node_modules'); const dependencies = [];
  for (const [name, version] of [['@modelcontextprotocol/server', '2.1.0'], ['@modelcontextprotocol/client', '2.1.0'], ['@modelcontextprotocol/core', '2.1.0'], ['zod', '4.6.5']]) {
    const bytes = snapshot(path.join(dependencyRoot, name, 'package.json'), 65536);
    assert.equal(JSON.parse(bytes).version, version); dependencies.push({ name, version, package_json_sha256: sha(bytes) });
  }
  for (const [name, expected] of Object.entries(SDK_SOURCE_PINS)) {
    const bytes = snapshot(path.join(dependencyRoot, name), 512 * 1024); assert.equal(sha(bytes), expected, 'LOCKED_SDK_SOURCE_PIN');
    dependencies.push({ selected_source: name, bytes: bytes.length, sha256: expected });
  }
  // The only external dependency tree: existing locked CI SDK/Zod. No source/scripts/js link or install.
  fs.symlinkSync(dependencyRoot, path.join(packageRoot, 'node_modules'), 'dir');
  const binRoot = path.join(nodeModules, '.bin'); fs.mkdirSync(binRoot);
  const bins = [];
  for (const [name, local] of Object.entries(metadata.bin)) {
    const target = path.join(packageRoot, local), rawMode = entries.get('package/' + local).mode;
    fs.symlinkSync('../' + metadata.name + '/' + local, path.join(binRoot, name));
    if (name === 'canli-fundamentals-mcp') fs.chmodSync(target, 0o755); // owned bin-links fixture only
    assert.equal(fs.statSync(target).mode & 0o777, 0o755);
    bins.push({ name, raw_mode: rawMode, installed_fixture_mode: 0o755, owned_fixture_only: true });
  }
  for (const name of ['.git', 'scripts', 'js']) { assert.equal(fs.existsSync(path.join(consumer, name)), false); assert.equal(fs.existsSync(path.join(packageRoot, name)), false); }
  const guide = entries.get('package/EXPERT_SUBMISSIONS.md').bytes.toString();
  const code = guide.match(/<!-- expert-package-workflow:start -->\s*```js\n([\s\S]+?)\n```\s*<!-- expert-package-workflow:end -->/);
  // Keep the generated consumer workflow inside the installed package directory:
  // its bare SDK imports use the ONE disclosed dependency link above, while its
  // named package imports resolve to the admitted sibling in consumer/node_modules.
  assert.ok(code); const workflowPath = path.join(packageRoot, 'consumer-workflow.mjs'); fs.writeFileSync(workflowPath, code[1], { flag: 'wx', mode: 0o600 });
  adapter = await import(pathToFileURL(path.join(packageRoot, 'src/expert-submission-stdio.mjs')));
  workflow = await import(pathToFileURL(workflowPath));
  const oracle = JSON.parse(JSON.stringify(originalCore(...workflow.syntheticInputs())));
  packed = { ...artifact, entries, metadata, raw, packageRoot, binRoot, consumer, dependencies, bins, oracle, guide_sha256: sha(entries.get('package/EXPERT_SUBMISSIONS.md').bytes) };
  const admitted = { admission: 'ADMITTED', compressed_sha256: raw.compressed_sha256, files: raw.files, bins, dependencies,
    sole_dependency_tree: dependencyRoot, repository_runtime_sources_linked: false, guide_sha256: packed.guide_sha256 };
  t.diagnostic('CANLI_EXPERT_PACKAGE_TARBALL_ADMITTED ' + JSON.stringify(admitted));
}, { timeout: 30000 });
after(() => {
  assert.equal(npmAttempts, 1); assert.ok(actualEntries <= 3);
  assert.ok(closures.every(row => row.absent && row.closeCalls === 1 && row.calls <= 1));
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});
const cloneEntries = () => new Map([...packed.entries].map(([name, row]) => [name, { mode: row.mode, bytes: Buffer.from(row.bytes) }]));
class Output extends EventEmitter {
  constructor(write = () => true) { super(); this.frames = []; this.behavior = write; }
  write(bytes) { this.frames.push(bytes); return this.behavior(bytes); }
}
function checksum(header) {
  header.fill(32, 148, 156); const sum = header.reduce((n, byte) => n + byte, 0);
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii'); return header;
}
function tarFixture(rows, mutate = () => {}) {
  const chunks = [];
  for (const [i, row] of rows.entries()) {
    const header = Buffer.alloc(512); header.write(row.name, 0, 'ascii');
    header.write('0000644\0', 100, 'ascii'); header.write(row.bytes.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
    header[156] = 48; mutate(header, i); checksum(header);
    chunks.push(header, row.bytes, Buffer.alloc((512 - row.bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]), { mtime: 0 });
}
async function memoryIngress(params, refused) {
  const input = new PassThrough(), output = new Output(), stderr = new Output(); let decoded = 0, calls = 0;
  const { server, transport } = adapter.createExpertSubmissionEndpoint({ input, output, stderr,
    decode: text => { decoded++; return Buffer.from(text, 'base64'); }, kernel: (...args) => { calls++; return originalCore(...args); } });
  const wait = async fn => { for (let i = 0; i < 100 && !fn(); i++) await new Promise(resolve => setImmediate(resolve)); assert.equal(Boolean(fn()), true); };
  const began = performance.now();
  try {
    await server.connect(transport);
    input.write(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'native-package', version: '0.0.0' } } }) + '\n'));
    await wait(() => output.frames.length === 1);
    input.write(Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params }) + '\n'));
    if (refused) {
      await wait(() => transport.closing !== undefined); await transport.close();
      assert.equal(output.frames.length, 1); assert.equal(decoded, 0); assert.equal(calls, 0); assert.equal(input.destroyed, true);
      assert.doesNotMatch(output.frames.join('') + stderr.frames.join(''), /PRIVATE_RAW_/);
      return null;
    }
    await wait(() => output.frames.length === 2); assert.equal(calls, 1); assert.equal(decoded, 6);
    const response = JSON.parse(output.frames[1]).result; assert.deepEqual(response.structuredContent, packed.oracle); return response;
  } finally { const closing = transport.close(); assert.equal(transport.close(), closing); await closing; await server.close(); input.destroy(); assert.ok(performance.now() - began < L.total); }
}
// One lexical launch site below, called by exactly two tests. Entry1 is the literal guide workflow.
async function otherOwnedEntry(kind) {
  assert.ok(++actualEntries <= 3); const cwd = fs.mkdtempSync(path.join(packed.consumer, 'session-'));
  const guard = path.join(cwd, 'guard.mjs'); fs.writeFileSync(guard, CONSUMER_GUARD, { flag: 'wx', mode: 0o600 });
  const scope = adapter.createWorkScope(), started = scope.started; const abort = new AbortController(); scope.bindSignal(abort.signal);
  const transport = new StdioClientTransport({ command: path.join(packed.binRoot, 'canli-expert-submission-audit'), args: [],
    cwd, stderr: 'pipe', maxBufferSize: adapter.EXPERT_STDIO_LIMITS.responseFrameBytes,
    env: { PATH: process.env.PATH, NODE_OPTIONS: '--import=' + JSON.stringify(guard) } });
  const client = new Client({ name: 'package-owned-' + kind, version: '0.0.0' },
    { versionNegotiation: { mode: 'legacy' }, inputRequired: { autoFulfill: false } });
  let child, pid, terminal = false, closing, closeCalls = 0, stderr = '', stderrOverflow = false, writer, timer; const wire = [];
  const start = transport.start.bind(transport);
  transport.start = async () => {
    scope.observe(); await start(); child = transport._process; pid = child?.pid;
    assert.ok(child && Number.isSafeInteger(pid) && pid > 1); child.once('exit', () => { terminal = true; }); scope.observe();
    writer = adapter.createExpertNativeWriter(child.stdin, { frameBytes: adapter.EXPERT_STDIO_LIMITS.requestFrameBytes,
      serialize: message => { const json = JSON.stringify(message); wire.push(json); return json; } });
    transport.send = message => writer.send(message, scope);
  };
  transport.stderr.on('data', bytes => {
    if (Buffer.byteLength(stderr) + bytes.length > 8192) { stderrOverflow = true; abort.abort(); return; }
    stderr += bytes.toString(); if (stderr.includes('DENIED_OPERATION')) abort.abort();
  });
  const closeOnce = () => { if (!closing) { closeCalls++; closing = Promise.resolve(client.close()); } return closing; };
  let workEnd, closeStart;
  try {
    timer = setTimeout(() => abort.abort(), L.work);
    await bounded(client.connect(transport), scope.remaining()); scope.observe();
    if (kind === 'raw-keys') {
      const params = { name: adapter.EXPERT_TOOL.name, arguments: workflow.wireInputs() };
      Object.defineProperty(params.arguments, '__proto__', { value: 'PRIVATE_RAW_KEY', enumerable: true });
      const outgoing = { jsonrpc: '2.0', id: 999, method: 'tools/call', params };
      assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(outgoing)).params.arguments, '__proto__'), true);
      const replies = []; let replyBytes = 0;
      child.stdout.on('data', bytes => { replyBytes += bytes.length; assert.ok(replyBytes <= 8192); replies.push(bytes); });
      await bounded(writer.send(outgoing, scope), scope.remaining()); scope.observe();
      if (!terminal) await bounded(new Promise(resolve => child.once('exit', resolve)), scope.remaining());
      assert.equal(replyBytes, 0, 'raw key refusal must not dispatch an admitted success');
    } else {
      // Failure after a known owned child is connected must still close that same child.
      throw new Error('INTENTIONAL_OWNED_CALLBACK_FAILURE');
    }
  } finally {
    clearTimeout(timer); workEnd = performance.now(); closeStart = workEnd; abort.abort();
    assert.equal(closeOnce(), closeOnce()); await bounded(closeOnce(), Math.min(L.closure, L.total - (closeStart - started)));
    if (child && !terminal && child.exitCode === null && child.signalCode === null)
      await bounded(new Promise(resolve => child.once('exit', resolve)), Math.min(L.closure - (performance.now() - closeStart), L.total - (performance.now() - started)));
    assert.ok(child && (terminal || child.exitCode !== null || child.signalCode !== null)); assert.equal(absent(pid), true);
    const ended = performance.now(); assert.ok(workEnd - started <= L.work && ended - closeStart <= L.closure && ended - started <= L.total);
    assert.equal(stderrOverflow, false); assert.doesNotMatch(stderr, /DENIED_OPERATION|PRIVATE_RAW_/); assert.ok(Buffer.byteLength(stderr) <= 8192);
    assert.equal(wire.filter(text => JSON.parse(text).method === 'server/discover' || JSON.parse(text).method === 'tools/list').length, 0);
    assert.equal(wire.filter(text => JSON.parse(text).method === 'tools/call').length, kind === 'raw-keys' ? 1 : 0);
    closures.push({ pid, absent: true, closeCalls, calls: kind === 'raw-keys' ? 1 : 0 });
    assert.deepEqual(fs.readdirSync(cwd), ['guard.mjs']); scope.dispose(); fs.rmSync(cwd, { recursive: true });
  }
}

test('expert package: exact14 admitted members retain independent source pins and raw modes', () => {
  const legacy = MEMBERS.filter(name => !['package/src/audit-inputs-client.mjs', 'package/AUDIT_INPUTS_CLIENT.md', 'package/src/expert-submission-files.mjs', 'package/EXPERT_SUBMISSION_FILES.md', 'package/src/expert-submission-client.mjs', 'package/EXPERT_SUBMISSION_CLIENT.md'].includes(name));
  assert.equal(legacy.length, 14); assert.deepEqual(legacy, ['LICENSE', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'package.json', ...Object.keys(SOURCE_PINS).filter(name => !['src/audit-inputs-client.mjs', 'src/expert-submission-files.mjs', 'src/expert-submission-client.mjs'].includes(name))].map(name => 'package/' + name).sort());
  assert.equal(MEMBERS.length, 20); assert.deepEqual(audit(cloneEntries()), packed.metadata);
  assert.equal(packed.raw.admission, 'RAW_CAPTURED_NOT_ADMITTED'); assert.equal(packed.raw.compressed_sha256, sha(packed.compressed));
});
test('expert package: all five import-only copies reverse to complete original sources', () => {
  for (const [local, original, changes] of RELOCATIONS) {
    let source = packed.entries.get('package/' + local).bytes.toString();
    if (local.endsWith('/expert-submission-stdio.mjs')) { assert.ok(source.startsWith('#!/usr/bin/env node\n')); source = source.slice('#!/usr/bin/env node\n'.length); }
    for (const [old, replacement] of [...changes].reverse()) { assert.equal(source.split(replacement).length, 2); source = source.replace(replacement, old); }
    assert.deepEqual(Buffer.from(source), snapshot(path.resolve(ROOT, original), L.expanded));
  }
});
test('expert package: original default and audit bytes stay separate from installed executable fixture modes', () => {
  for (const local of ['src/server.mjs', 'src/audit-inputs-stdio.mjs', 'src/audit-inputs-core.mjs', 'src/canonical-json.mjs'])
    assert.equal(sha(packed.entries.get('package/' + local).bytes), SOURCE_PINS[local]);
  const oldBins = packed.bins.filter(row => !['canli-fundamentals-audit-files', 'canli-expert-submission-files', 'canli-expert-submission-client'].includes(row.name));
  assert.deepEqual(oldBins.map(row => row.raw_mode), [0o644, 0o755, 0o755]);
  assert.equal(packed.bins.length, 6); assert.equal(packed.bins.find(row => row.name === 'canli-fundamentals-audit-files').raw_mode, 0o755);
  assert.ok(packed.bins.every(row => row.owned_fixture_only && row.installed_fixture_mode === 0o755));
});
test('expert package: missing changed and wrong-mode canonical sources refuse before extraction', () => {
  const missing = cloneEntries(); missing.delete('package/src/canonical-json.mjs'); assert.throws(() => audit(missing), /PACKAGE_MEMBERS/);
  const changed = cloneEntries(); changed.get('package/src/canonical-json.mjs').bytes[0] ^= 1; assert.throws(() => audit(changed), /SOURCE_PIN/);
  const mode = cloneEntries(); mode.get('package/src/canonical-json.mjs').mode = 0o755; assert.throws(() => audit(mode), /PACKAGE_MODE/);
});
test('expert package: new old and default source tampering all refuse the exact frozen-byte audit', () => {
  for (const local of ['src/expert-submission-stdio.mjs', 'src/expert-intake-core.mjs', 'src/audit-inputs-core.mjs', 'src/server.mjs']) {
    const rows = cloneEntries(); rows.get('package/' + local).bytes[500] ^= 1; assert.throws(() => audit(rows), /SOURCE_PIN/);
  }
});
test('expert package: private extra and missing guide members refuse strict membership', () => {
  const extra = cloneEntries(); extra.set('package/private-secret.json', { mode: 0o644, bytes: Buffer.from('PRIVATE') }); assert.throws(() => audit(extra), /PACKAGE_MEMBERS/);
  const missing = cloneEntries(); missing.delete('package/EXPERT_SUBMISSIONS.md'); assert.throws(() => audit(missing), /PACKAGE_MEMBERS/);
});
test('expert package: bin and files metadata changes refuse with every old mapping retained', () => {
  const rows = cloneEntries(), meta = JSON.parse(rows.get('package/package.json').bytes); meta.bin['canli-fundamentals-mcp'] = 'src/expert-submission-stdio.mjs';
  rows.get('package/package.json').bytes = Buffer.from(JSON.stringify(meta)); assert.throws(() => audit(rows), /PACKAGE_BIN/);
  const files = cloneEntries(), other = JSON.parse(files.get('package/package.json').bytes); other.files.pop(); files.get('package/package.json').bytes = Buffer.from(JSON.stringify(other));
  assert.throws(() => audit(files), /PACKAGE_FILES/);
});
test('expert package: every admitted JS and MJS import is checked including escape and absent dependency', () => {
  checkImports(cloneEntries());
  for (const suffix of ['js', 'mjs']) {
    const rows = cloneEntries(); rows.set('package/src/fixture.' + suffix, { mode: 0o644, bytes: Buffer.from("import x from '../../scripts/private.mjs';\n") });
    assert.throws(() => checkImports(rows), /OUTSIDE_OR_MISSING_IMPORT/);
  }
  const dynamic = cloneEntries(); dynamic.get('package/src/expert-agreement.mjs').bytes = Buffer.from("const x = import('./missing.mjs');\n");
  assert.throws(() => checkImports(dynamic), /DYNAMIC_IMPORT/);
});
test('expert package: gzip CRC trailing data and concatenated members refuse before TAR admission', () => {
  const crc = Buffer.from(packed.compressed); crc[crc.length - 8] ^= 1; assert.throws(() => tarEntries(crc), /GZIP_CRC/);
  assert.throws(() => tarEntries(Buffer.concat([packed.compressed, Buffer.from('x')])), /GZIP_SINGLE_MEMBER/);
  assert.throws(() => tarEntries(Buffer.concat([packed.compressed, gzipSync(Buffer.alloc(0))])), /GZIP_SINGLE_MEMBER/);
});
test('expert package: compressed expanded and member-count bounds refuse before fixture writes', () => {
  assert.throws(() => tarEntries(Buffer.alloc(L.compressed + 1)), /GZIP_BOUND/);
  assert.throws(() => tarEntries(gzipSync(Buffer.alloc(L.expanded + 512))));
  const rows = Array.from({ length: L.members + 1 }, (_, i) => ({ name: 'package/item-' + i, bytes: Buffer.alloc(0) }));
  assert.throws(() => tarEntries(tarFixture(rows)), /TAR_COUNT/);
});
test('expert package: checksum-valid high-bit path type mode size and checksum fields refuse raw ASCII', () => {
  for (const offset of [0, 100, 124, 156, 345]) {
    const bytes = tarFixture([{ name: 'package/a', bytes: Buffer.from('x') }], header => { header[offset] |= 128; });
    assert.throws(() => tarEntries(bytes), /TAR_ASCII/);
  }
  const valid = tarFixture([{ name: 'package/a', bytes: Buffer.from('x') }]);
  const inflated = inflateRawSync(valid.subarray(10)); inflated[148] |= 128;
  assert.throws(() => tarEntries(gzipSync(inflated)), /TAR_ASCII/);
});
test('expert package: checksum traversal duplicate link and nonregular controls refuse before extraction', () => {
  for (const name of ['package/../a', 'package//a']) assert.throws(() => tarEntries(tarFixture([{ name, bytes: Buffer.alloc(0) }])), /TAR_PATH/);
  assert.throws(() => tarEntries(tarFixture([{ name: 'package/a', bytes: Buffer.alloc(0) }, { name: 'package/a', bytes: Buffer.alloc(0) }])), /TAR_DUPLICATE/);
  for (const type of [49, 50, 53]) assert.throws(() => tarEntries(tarFixture([{ name: 'package/a', bytes: Buffer.alloc(0) }], h => { h[156] = type; })), /TAR_REGULAR/);
  const tar = inflateRawSync(packed.compressed.subarray(10)); tar[148] ^= 1; assert.throws(() => tarEntries(gzipSync(tar)), /TAR_CHECKSUM/);
});
test('expert package: Git-free consumer contains admitted bytes and only disclosed locked dependencies', () => {
  for (const name of ['.git', 'scripts', 'js']) assert.equal(fs.existsSync(path.join(packed.packageRoot, name)), false);
  for (const [name, row] of packed.entries) assert.deepEqual(snapshot(path.join(packed.packageRoot, name.slice(8)), L.expanded), row.bytes);
  assert.deepEqual(packed.dependencies.filter(row => row.version).map(row => row.version), ['2.1.0', '2.1.0', '2.1.0', '4.6.5']);
});
test('expert package: README and standalone guide expose a literal complete package-local workflow', () => {
  const guide = packed.entries.get('package/EXPERT_SUBMISSIONS.md').bytes.toString();
  assert.match(packed.entries.get('package/README.md').bytes.toString(), /\]\(EXPERT_SUBMISSIONS\.md\)/);
  for (const match of guide.matchAll(/\]\(([^)]+)\)/g)) assert.ok(/^https:\/\//.test(match[1]) || packed.entries.has('package/' + match[1]));
  assert.doesNotMatch(guide.match(/<!-- expert-package-workflow:start -->([\s\S]+)<!-- expert-package-workflow:end -->/)[1], /from ['"](?:\.\.\/|.*scripts\/|.*js\/)/);
  assert.equal(sha(packed.entries.get('package/EXPERT_SUBMISSIONS.md').bytes), packed.guide_sha256); assert.match(guide, /Unreleased/);
});
test('expert package: entry1 direct bin executes the exact marked guide workflow once with full core parity', { timeout: 21000 }, async () => {
  const cwd = fs.mkdtempSync(path.join(packed.consumer, 'guide-session-')); const guard = path.join(cwd, 'guard.mjs');
  fs.writeFileSync(guard, CONSUMER_GUARD, { flag: 'wx', mode: 0o600 }); assert.ok(++actualEntries <= 3);
  try {
    const report = await workflow.runExpertWorkflow({ entry: path.join(packed.binRoot, 'canli-expert-submission-audit'), cwd, guard,
      onClosed: row => closures.push(row) });
    assert.deepEqual(report, packed.oracle); assert.equal(report.coverage.selected_n, 3); assert.equal(report.coverage.required_item_assignments_n, 6);
    assert.deepEqual(fs.readdirSync(cwd), ['guard.mjs']);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});
test('expert package: entry2 raw original proto key refuses without a successful audit and closes known child', { timeout: 21000 }, async () => {
  await otherOwnedEntry('raw-keys');
});
test('expert package: entry3 callback failure closes once and observes the same owned PID absence', { timeout: 21000 }, async () => {
  await assert.rejects(otherOwnedEntry('callback'), /INTENTIONAL_OWNED_CALLBACK_FAILURE/);
});
test('expert package: complete native report keeps all roles tasks raw bytes and null established outcomes', () => {
  const result = adapter.executeExpertSubmission(workflow.wireInputs()); assert.deepEqual(result.structuredContent, packed.oracle);
  assert.equal(result.content[0].text, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent.content_hash, contentHash(result.structuredContent, createHash));
  assert.deepEqual(result.structuredContent.coverage.absent_role_submissions, ['reviewer_a', 'reviewer_b']);
  assert.equal(result.structuredContent.adjudication.item_tasks.length, 3);
  for (const value of Object.values(result.structuredContent.established)) assert.equal(value, null);
  assert.equal(result.structuredContent.implementation.dependency_source_pins_verified, false);
  assert.equal(result.structuredContent.implementation.declared_module_sha256_verified, false);
  assert.deepEqual(result.structuredContent.bindings, packed.oracle.bindings);
});
test('expert package: original argument and outer params keys refuse before native decode or kernel through SDK', async () => {
  for (const place of ['arguments', 'params']) {
    const params = { name: adapter.EXPERT_TOOL.name, arguments: workflow.wireInputs() };
    Object.defineProperty(place === 'params' ? params : params.arguments, '__proto__', { value: 'PRIVATE_RAW_PROTO', enumerable: true });
    await memoryIngress(params, true);
  }
  const params = { name: adapter.EXPERT_TOOL.name, arguments: workflow.wireInputs(), unexpected: 'PRIVATE_RAW_EXTRA' }; await memoryIngress(params, true);
  const positive = await memoryIngress({ name: adapter.EXPERT_TOOL.name, arguments: workflow.wireInputs() }, false);
  assert.equal(positive.content[0].text, JSON.stringify(packed.oracle));
});
test('expert package: type count and individual decoded limits refuse before the first decode', () => {
  const values = [ { ...workflow.wireInputs(), expected_gold_raw_sha256: ['a'.repeat(64)] },
    { ...workflow.wireInputs(), evidence_base64: Array(65).fill('') },
    { ...workflow.wireInputs(), gold_base64: Buffer.alloc(524289).toString('base64') } ];
  for (const args of values) {
    let decoded = 0, calls = 0; const result = adapter.executeExpertSubmission(args, { decode: text => { decoded++; return Buffer.from(text, 'base64'); }, kernel: () => { calls++; } });
    assert.equal(result.isError, true); assert.equal(decoded, 0); assert.equal(calls, 0);
  }
});
test('expert package: evidence and all-input aggregates refuse before decoding any individually admitted field', () => {
  const evidence = { ...workflow.wireInputs(), evidence_base64: Array(9).fill(Buffer.alloc(32768).toString('base64')) };
  const all = { ...workflow.wireInputs(), submission_base64: Array(2).fill(Buffer.alloc(2097152).toString('base64')) };
  for (const [args, code] of [[evidence, 'EVIDENCE_TOTAL_BOUND'], [all, 'TOTAL_INPUT_BOUND']]) {
    let n = 0; const result = adapter.executeExpertSubmission(args, { decode: () => { n++; throw new Error('must not decode'); } });
    assert.equal(JSON.parse(result.content[0].text).error.code, code); assert.equal(n, 0);
  }
});
test('expert package: noncanonical padding and wrong gold raw pin retain bounded non-echo refusal', () => {
  for (const args of [{ ...workflow.wireInputs(), gold_base64: 'Zh==' }, { ...workflow.wireInputs(), expected_gold_raw_sha256: 'f'.repeat(64) }]) {
    const result = adapter.executeExpertSubmission(args); assert.equal(result.isError, true); assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 2048);
    assert.equal(result.structuredContent, undefined); assert.ok(!JSON.stringify(result).includes(args.gold_base64));
  }
});
test('expert package: escaped duplicated result and whole frame capacities refuse with zero native writes', async () => {
  const output = new Output(); const writer = adapter.createExpertNativeWriter(output);
  const scope = adapter.createWorkScope();
  await assert.rejects(writer.send({ jsonrpc: '2.0', id: 1, result: { text: '\0'.repeat(3400000) } }, scope, { tool: true }), error => error.code === 'TOOL_RESULT_BOUND');
  assert.equal(output.frames.length, 0);
  const small = adapter.createExpertNativeWriter(output, { frameBytes: 128 });
  await assert.rejects(small.send({ jsonrpc: '2.0', id: 1, result: 'x'.repeat(128) }, adapter.createWorkScope()), error => error.code === 'FRAME_OUTPUT_BOUND');
  assert.equal(output.frames.length, 0); scope.dispose();
});
test('expert package: serialization crossing the absolute deadline prevents the captured native write', async () => {
  let now = 0; const output = new Output(), scope = adapter.createWorkScope({ clock: () => now });
  now = 14999.5; const writer = adapter.createExpertNativeWriter(output, { serialize: message => { now += 1; return JSON.stringify(message); } });
  await assert.rejects(writer.send({ jsonrpc: '2.0', id: 1, result: {} }, scope), error => error.code === 'DEADLINE');
  assert.equal(output.frames.length, 0); assert.equal(scope.failure, 'DEADLINE'); scope.dispose();
});
test('expert package: aborted serialized writes stay sticky while a positive control writes exactly once', async () => {
  const abort = new AbortController(), scope = adapter.createWorkScope({ signal: abort.signal }), output = new Output();
  const writer = adapter.createExpertNativeWriter(output, { serialize: message => { abort.abort(); return JSON.stringify(message); } });
  await assert.rejects(writer.send({ jsonrpc: '2.0', id: 1, result: {} }, scope), error => error.code === 'ABORTED');
  await assert.rejects(writer.send({ jsonrpc: '2.0', id: 2, result: {} }, scope), error => error.code === 'ABORTED'); assert.equal(output.frames.length, 0);
  const good = adapter.createWorkScope(); await adapter.createExpertNativeWriter(output).send({ jsonrpc: '2.0', id: 3, result: {} }, good);
  assert.equal(output.frames.length, 1); scope.dispose(); good.dispose();
});
test('expert package: pending writer is rejected by one memoized close and owned input destroy', async () => {
  const input = new PassThrough(), output = new Output(() => false), stderr = new Output(); let destroys = 0;
  const originalDestroy = input.destroy.bind(input); input.destroy = (...args) => { destroys++; return originalDestroy(...args); };
  const { transport } = adapter.createExpertSubmissionEndpoint({ input, output, stderr });
  transport.accept({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const pending = transport.send({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
  const rejection = assert.rejects(pending, error => error.code === 'CLOSED'); const closing = transport.close();
  assert.equal(transport.close(), closing); await closing; await rejection; assert.equal(destroys, 1); assert.equal(output.frames.length, 1);
  assert.equal(output.listenerCount('drain'), 0); assert.equal(input.destroyed, true);
});
test('expert package: native readback guards reject symlink and overflow before consumer snapshots', () => {
  const cwd = fs.mkdtempSync(path.join(directory, 'snapshot-')); const file = path.join(cwd, 'original');
  try { fs.writeFileSync(file, Buffer.from('same bytes'), { flag: 'wx', mode: 0o600 });
    assert.equal(snapshot(file, 10).toString(), 'same bytes'); assert.throws(() => snapshot(file, 9), /FILE_BOUND/);
    fs.symlinkSync(file, path.join(cwd, 'alias')); assert.throws(() => snapshot(path.join(cwd, 'alias'), 10));
  } finally { fs.rmSync(cwd, { recursive: true }); }
});
test('expert package: native sentinel positive control records even a caught forbidden effect without delegation', () => {
  const source = NETWORK_GUARD.match(/^const deny = .*;$/m)[0]; const writes = [], process = { stderr: { write: text => writes.push(text) } };
  const denied = runInNewContext(source + "\ndeny('synthetic-network');", { process });
  let continued = 0; try { denied(); } catch { continued++; }
  assert.equal(continued, 1); assert.deepEqual(writes, ['DENIED_OPERATION:synthetic-network\n']);
  assert.match(CONSUMER_GUARD, /child\[name\] = deny\(name\)/); assert.match(CONSUMER_GUARD, /fsp\[name\] = deny\(name\)/);
});
test('expert package: package frame admission retains strict UTF8 and whole request plus newline limits', () => {
  let dispatched = 0; const reader = new adapter.ExpertFrameBuffer(() => dispatched++);
  reader.append(Buffer.from([123, 255, 125, 10])); assert.throws(() => reader.readMessage(), error => error.code === 'FRAME_PARSE');
  assert.equal(dispatched, 0); assert.equal(reader.buffer.length, 0);
  reader.append(Buffer.alloc(adapter.EXPERT_STDIO_LIMITS.requestFrameBytes, 32));
  assert.throws(() => reader.append(Buffer.from('\n')), error => error.code === 'FRAME_INPUT_BOUND');
  assert.equal(dispatched, 0); assert.equal(reader.buffer.length, 0);
});
test('expert package: import closure admits from text in exported constants and refuses actual reexports', () => {
  const positive = cloneEntries(); positive.set('package/src/text-control.js', { mode: 0o644,
    bytes: Buffer.from('export const description = "Computed from supplied bytes.";\n') });
  checkImports(positive);
  for (const source of ["export * from '../../private.mjs';\n", "export { secret } from './missing.mjs';\n"]) {
    const negative = cloneEntries(); negative.set('package/src/actual-reexport.mjs', { mode: 0o644, bytes: Buffer.from(source) });
    assert.throws(() => checkImports(negative), /UNPARSED_REEXPORT/);
  }
});
