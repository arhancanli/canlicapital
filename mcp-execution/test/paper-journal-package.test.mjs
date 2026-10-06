// Finite synthetic package fixtures. First execution is existing automatic remote CI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import childProcess from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { gzipSync, inflateRawSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMITS = Object.freeze({ compressed: 2 * 1024 * 1024, expanded: 8 * 1024 * 1024,
  nativePeak: 16 * 1024 * 1024, packMs: 30000, packStdout: 1024 * 1024, packStderr: 65536 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE_PINS = Object.freeze({
  "package/EXAMPLES.md": "e3f39e9764bdb50390b784c156b9aa0c1ef3daa235d7cfe95934851c8e9586ac",
  "package/JOURNAL_STORAGE.md": "71f246c46295d9cb6b1187709ec8a00111314c012688a53226be1967b456139a",
  "package/LICENSE": "e679ca02271c3b6ff38e197098b9260900656c23f06b787383624681f425fa26",
  "package/PAPER_JOURNAL.md": "56be27fd25576d4b7d142913e927c310f3ff0bcb6c9bb178460e55bc8cdd01f3",
  "package/README.md": "2c1c2b398b865f50e132053b713bf80c498c9f69afb79cf360e562eb13cc7bf8",
  "package/package.json": "46d0aae74872390d117fc9d1626038109de1d151be6dd32a24afdb8d365781f4",
  "package/src/check-orders.mjs": "ec2e0e50e04e413fff7047b17b5d8273591e66ae5ef63ef9ec2653188f07da21",
  "package/src/core/js/dsr-core.js": "79ec18cc7c15e0b2ad004dd5296e83020187912aab161b68aad4784d959816d1",
  "package/src/core/js/exec-cost-core.js": "c789a1889931cd6719b37d343ed1a3378b860ed804203df62bf92e47c6f017c9",
  "package/src/core/js/journal-files.js": "52a67922101613665b343c38c3f3133c50c496a0f90086ef31910b22c1e0646d",
  "package/src/core/js/moments-core.js": "bf0ccc0268df91fa684eb6ac34ca25bee7c90dfb2ebc1dc52fead64d354a0cb9",
  "package/src/core/js/pretrade-core.js": "c071f407ab129882089937f226112a6166223cba2f4d42c0d90599d60a164e45",
  "package/src/core/js/shortfall-core.js": "0be616f9be0a51d357dbe799cdbf810da67c826c4501a6f0bcdf258a035f49e0",
  "package/src/core/js/sizing-core.js": "2b51d81341614799d6ec1b9d25094644c6e4013870601ab156f4321212347a51",
  "package/src/core/js/trade-journal-core.js": "db394e2034c05f4d3d9deb34e0470da7ee8eaf239e484eeaa9f71d619a51ad94",
  "package/src/core/js/trade-journal-export-core.js": "d1ed1eacd557145dc70ea87f3326be0666fdcbce43f714d55f69e44904beabb1",
  "package/src/core/scripts/canonical-json.mjs": "881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b",
  "package/src/hosted.mjs": "39c0d8dd9cd4c1783729f2e357eee4a2f47b9a1ce22d11d8d75d8db7222718a7",
  "package/src/info.mjs": "5e529a47cb7218ec346af32d703be8825267e7e2d1d775d660de01c8f0dfe2d6",
  "package/src/journal-export-file.mjs": "71c49225e7e26c7f9e0368f20a731a2dcb0ceaf87818e9e386b1ed0b998ce834",
  "package/src/journal-store.mjs": "28296b91d83b76e1b8d5dddafcde3af7d15ba4a3098cd60b4e4ece304544598c",
  "package/src/journal-write.mjs": "c8b8bea0120082a638e2e470148fe052090c487493afd76757cba46039f1c354",
  "package/src/journal.mjs": "72829724fd58fb8d6c7af8dc21fde02a0f97b68a57eedd606f5ff92826957619",
  "package/src/local-input.mjs": "fafeb03647cd04897fb03cf637186a91c91c9da1186414fd167bcfe9d12ad825",
  "package/src/measure-shortfall.mjs": "74cc85b67a4c0b7a685e81979097c345f1b21fc41c2755b2a65a0303626dc9a2",
  "package/src/paper-journal.mjs": "12d8d1c06bf8d65f9f122e0afbde85a483c62d88517dc9d0ff5f785cba660098",
  "package/src/server.mjs": "4cd48c1dc40098ac049f45f3951322e3b63118605c36330c6d4874b25951c5bd",
  "package/src/size-position.mjs": "09e690c9f0452c039ff20fc3f2728e365e6f7ba6bcf9f2da150383654e8453f4"
});
const MEMBERS = Object.freeze([
  'EXAMPLES.md', 'JOURNAL_STORAGE.md', 'LICENSE', 'PAPER_JOURNAL.md', 'README.md', 'package.json',
  'src/check-orders.mjs', 'src/core/js/dsr-core.js', 'src/core/js/exec-cost-core.js', 'src/core/js/journal-files.js',
  'src/core/js/moments-core.js', 'src/core/js/pretrade-core.js', 'src/core/js/shortfall-core.js', 'src/core/js/sizing-core.js',
  'src/core/js/trade-journal-core.js', 'src/core/js/trade-journal-export-core.js', 'src/core/scripts/canonical-json.mjs',
  'src/hosted.mjs', 'src/info.mjs', 'src/journal-export-file.mjs', 'src/journal-store.mjs', 'src/journal-write.mjs',
  'src/journal.mjs', 'src/local-input.mjs', 'src/measure-shortfall.mjs', 'src/paper-journal.mjs', 'src/server.mjs', 'src/size-position.mjs',
].map(name => 'package/' + name).sort());
const BINS = Object.freeze({ 'canli-execution-mcp': 'src/server.mjs', 'canli-paper-journal': 'src/paper-journal.mjs' });
const MODES = Object.freeze(Object.fromEntries(MEMBERS.map(name => [name, name === 'package/src/paper-journal.mjs' ? 0o755 : 0o644])));
let directory, packageRoot, adapter, server, guide, packed, expectedBytes, expectedTotal, packEntries = 0, sdkEntries = 0;
const children = [], denials = [];
const nativeSpawn = childProcess.spawn, nativeRealpath = fs.realpathSync, nativeUnlink = fs.unlinkSync;
const capturedDiagnosticWrite = process.stdout.write.bind(process.stdout);
const owned = name => typeof name === 'string' && (path.resolve(name) === directory || path.resolve(name).startsWith(directory + path.sep));
const deny = name => { denials.push(name); throw new Error('DENIED_OPERATION'); };
function writePath(name) {
  const target = name instanceof URL ? fileURLToPath(name) : String(name);
  if (!owned(target)) deny('filesystem');
  let existing = path.resolve(target);
  while (!fs.existsSync(existing)) { const parent = path.dirname(existing); if (parent === existing) deny('filesystem'); existing = parent; }
  if (!owned(nativeRealpath(existing))) deny('filesystem');
}
const NETWORK_GUARD = `
import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
import tls from 'node:tls'; import dgram from 'node:dgram'; import dns from 'node:dns';
import child from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
const deny = () => { process.stderr.write('DENIED_OPERATION\\n'); throw new Error('DENIED_OPERATION'); };
globalThis.fetch = deny;
for (const [object, names] of [[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],
  [tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]]) for (const name of names) object[name] = deny;
net.Socket.prototype.connect = deny; net.Server.prototype.listen = deny;
for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) child[name] = deny;
syncBuiltinESMExports();
`;
function childGuardSource(root) {
  return NETWORK_GUARD + `
import fs from 'node:fs'; import fsp from 'node:fs/promises'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const fixture = ${JSON.stringify(root)}, realpath = fs.realpathSync, exists = fs.existsSync;
const owned = name => { const target = path.resolve(name instanceof URL ? fileURLToPath(name) : String(name));
  if (!(target === fixture || target.startsWith(fixture + path.sep))) deny();
  let current = target; while (!exists(current)) current = path.dirname(current);
  const actual = realpath(current); if (!(actual === fixture || actual.startsWith(fixture + path.sep))) deny(); };
const writable = flag => typeof flag === 'number' ? !!(flag & (fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND)) : flag !== undefined && flag !== 'r' && flag !== 'rs';
const descriptors = new Set();
for (const name of ['writeFileSync','appendFileSync','mkdirSync','unlinkSync','rmSync','rmdirSync','truncateSync','chmodSync','chownSync','createWriteStream']) {
 const original = fs[name]; fs[name] = (...args) => { owned(args[0]); return original(...args); }; }
for (const name of ['renameSync','copyFileSync','cpSync']) { const original = fs[name]; fs[name] = (...args) => { if (name === 'renameSync') owned(args[0]); owned(args[1]); return original(...args); }; }
const openSync = fs.openSync; fs.openSync = (...args) => { if (writable(args[1])) owned(args[0]); const fd = openSync(...args); if (writable(args[1])) descriptors.add(fd); return fd; };
const closeSync = fs.closeSync; fs.closeSync = fd => { descriptors.delete(fd); return closeSync(fd); };
for (const name of ['writeSync','writevSync']) { const original = fs[name]; fs[name] = (...args) => { if (args[0] !== 1 && args[0] !== 2 && !descriptors.has(args[0])) deny(); return original(...args); }; }
for (const name of ['writeFile','appendFile','mkdir','unlink','rm','rmdir','truncate','chmod','chown']) { const original = fs[name]; fs[name] = (...args) => { owned(args[0]); return original(...args); }; }
for (const name of ['writeFile','appendFile','mkdir','unlink','rm','rmdir','truncate','chmod','chown']) { const original = fsp[name]; fsp[name] = (...args) => { owned(args[0]); return original(...args); }; }
for (const name of ['rename','copyFile','cp']) for (const object of [fs,fsp]) { const original = object[name]; object[name] = (...args) => { if (name === 'rename') owned(args[0]); owned(args[1]); return original(...args); }; }
const open = fsp.open; fsp.open = (...args) => { if (writable(args[1])) owned(args[0]); return open(...args); };
syncBuiltinESMExports();
`;
}
function armEffects() {
  globalThis.fetch = () => deny('fetch');
  for (const [object, names] of [[http, ['get', 'request']], [https, ['get', 'request']], [net, ['connect', 'createConnection']],
    [tls, ['connect']], [dns, ['lookup', 'resolve', 'resolve4', 'resolve6']], [dgram, ['createSocket']]])
    for (const name of names) object[name] = () => deny('network');
  net.Socket.prototype.connect = () => deny('network'); net.Server.prototype.listen = () => deny('network');
  const descriptors = new Set(), writable = flag => typeof flag === 'number' ? !!(flag & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) : flag !== undefined && flag !== 'r' && flag !== 'rs';
  for (const object of [fs, fsp]) for (const name of ['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rm', 'rmdir', 'unlink', 'truncate', 'chmod', 'chown', 'createWriteStream',
    'writeFileSync', 'appendFileSync', 'mkdirSync', 'mkdtempSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'truncateSync', 'chmodSync', 'chownSync']) {
    if (typeof object[name] !== 'function') continue; const original = object[name];
    object[name] = (...args) => { writePath(args[0]); return original(...args); };
  }
  for (const object of [fs, fsp]) for (const name of ['rename', 'renameSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync', 'symlink', 'symlinkSync', 'link', 'linkSync']) {
    if (typeof object[name] !== 'function') continue; const original = object[name];
    object[name] = (...args) => { if (name.startsWith('rename')) writePath(args[0]); writePath(args[1]); return original(...args); };
  }
  const originalOpen = fs.openSync;
  fs.openSync = (...args) => { if (writable(args[1])) writePath(args[0]); const fd = originalOpen(...args); if (writable(args[1])) descriptors.add(fd); return fd; };
  const originalClose = fs.closeSync; fs.closeSync = fd => { descriptors.delete(fd); return originalClose(fd); };
  for (const name of ['writeSync', 'writevSync', 'write', 'writev']) { const original = fs[name];
    fs[name] = (...args) => { if (args[0] !== 1 && args[0] !== 2 && !descriptors.has(args[0])) deny('filesystem-fd'); return original(...args); };
  }
  for (const object of [fs, fsp]) { const original = object.open;
    object.open = (...args) => { if (writable(args[1])) writePath(args[0]); return original(...args); };
  }
  for (const name of ['spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[name] = () => deny('spawn');
  // The sole NEW native spawn site: one exact pack and at most three SDK-owned Node children.
  childProcess.spawn = (command, args, options) => {
    if (command === 'npm') {
      assert.equal(++packEntries, 1); assert.deepEqual(args.slice(0, 3), ['pack', '--json', '--ignore-scripts']);
      assert.ok(args.includes('--offline')); assert.equal(options.cwd, ROOT); assert.ok(owned(args[args.indexOf('--pack-destination') + 1]));
      return nativeSpawn(command, args, options);
    }
    if (command !== process.execPath || !packageRoot || args.length !== 1 || nativeRealpath(args[0]) !== path.join(packageRoot, 'src/server.mjs')) return deny('spawn');
    assert.ok(++sdkEntries <= 3); assert.equal(options.shell, false);
    assert.equal(options.env.NODE_OPTIONS, undefined); // production consumer supplies no preload
    const native = nativeSpawn(command, args, { ...options, env: { ...options.env, NODE_OPTIONS: '--import=' + JSON.stringify(path.join(directory, 'child-guard.mjs')) } });
    const row = { process: native, pid: null, exit: false, close: false, frames: [], frame_bytes: 0, requested_env: Object.keys(options.env).sort() };
    native.once('spawn', () => { row.pid = native.pid; }); native.once('exit', () => { row.exit = true; }); native.once('close', () => { row.close = true; });
    const write = native.stdin.write.bind(native.stdin);
    native.stdin.write = (bytes, ...rest) => { const size = Buffer.byteLength(bytes); assert.ok(size <= 65536 && row.frames.length < 16 && row.frame_bytes + size <= 1024 * 1024);
      row.frame_bytes += size; row.frames.push(JSON.parse(bytes)); return write(bytes, ...rest); };
    children.push(row); return native;
  };
  syncBuiltinESMExports();
}
function snapshot(filename, cap) {
  let fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
  try {
    const first = fs.fstatSync(fd); assert.ok(first.isFile() && first.size <= cap);
    const buffer = Buffer.alloc(first.size + 1); let n = 0;
    while (n < buffer.length) { const count = fs.readSync(fd, buffer, n, buffer.length - n, null); if (!count) break; n += count; }
    const last = fs.fstatSync(fd), post = fs.lstatSync(filename);
    for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) { assert.equal(last[key], first[key]); assert.equal(post[key], last[key]); }
    assert.equal(n, first.size); const closing = fd; fd = undefined; fs.closeSync(closing); return Buffer.from(buffer.subarray(0, n));
  } finally { if (fd !== undefined) { const closing = fd; fd = undefined; fs.closeSync(closing); } }
}
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; }
function tarEntries(compressed) {
  assert.ok(Buffer.isBuffer(compressed) && compressed.length >= 18 && compressed.length <= LIMITS.compressed, 'GZIP_BOUND');
  assert.deepEqual([...compressed.subarray(0, 4)], [31, 139, 8, 0], 'GZIP_HEADER');
  const inflated = inflateRawSync(compressed.subarray(10), { maxOutputLength: LIMITS.expanded, info: true });
  const bytes = inflated.buffer, end = 10 + inflated.engine.bytesWritten;
  assert.equal(end + 8, compressed.length, 'GZIP_SINGLE_MEMBER'); assert.equal(compressed.readUInt32LE(end), crc32(bytes), 'GZIP_CRC');
  assert.equal(compressed.readUInt32LE(end + 4), bytes.length >>> 0, 'GZIP_ISIZE'); assert.equal(bytes.length % 512, 0, 'TAR_BOUND');
  const entries = new Map(); let offset = 0, ended = false;
  const ascii = (value, numeric = false) => {
    assert.ok(value.every(byte => byte <= 127), 'TAR_ASCII'); const zero = value.indexOf(0), prefix = zero < 0 ? value : value.subarray(0, zero);
    if (zero >= 0) assert.ok(value.subarray(zero).every(byte => byte === 0 || (numeric && byte === 32)), 'TAR_FIELD_PADDING');
    return prefix.toString('ascii');
  };
  const octal = value => { const text = ascii(value, true).trim(); assert.match(text, /^[0-7]+$/, 'TAR_OCTAL'); return parseInt(text, 8); };
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) { assert.ok(offset + 1024 <= bytes.length && bytes.subarray(offset).every(byte => byte === 0), 'TAR_END'); ended = true; break; }
    assert.ok(entries.size < MEMBERS.length, 'TAR_COUNT'); assert.ok(header.every(byte => byte <= 127), 'TAR_ASCII');
    const name = ascii(header.subarray(0, 100)), prefix = ascii(header.subarray(345, 500)), filename = prefix ? prefix + '/' + name : name;
    assert.match(filename, /^package\/[A-Za-z0-9_./-]+$/, 'TAR_PATH'); assert.ok(!filename.includes('//') && filename.split('/').every(part => part && part !== '.' && part !== '..'), 'TAR_PATH');
    assert.ok(!entries.has(filename), 'TAR_DUPLICATE'); const type = ascii(header.subarray(156, 157)); assert.ok(type === '' || type === '0', 'TAR_REGULAR');
    assert.equal(ascii(header.subarray(157, 257)), '', 'TAR_LINK'); const size = octal(header.subarray(124, 136)), mode = octal(header.subarray(100, 108));
    assert.ok(size <= LIMITS.expanded && [0o644, 0o755].includes(mode), 'TAR_FILE_BOUND_MODE');
    assert.equal(header.reduce((n, byte, i) => n + (i >= 148 && i < 156 ? 32 : byte), 0), octal(header.subarray(148, 156)), 'TAR_CHECKSUM');
    const next = offset + 512 + Math.ceil(size / 512) * 512; assert.ok(next <= bytes.length, 'TAR_BODY');
    entries.set(filename, { mode, bytes: bytes.subarray(offset + 512, offset + 512 + size) }); offset = next;
  }
  assert.equal(ended, true, 'TAR_END'); return entries;
}
function checkImports(entries) {
  const external = new Set(['@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio', '@modelcontextprotocol/server', '@modelcontextprotocol/server/stdio', 'zod']);
  for (const [filename, row] of entries) {
    if (!/\.(?:js|mjs)$/.test(filename)) continue; const source = row.bytes.toString('utf8');
    const imports = [...source.matchAll(/\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
    const dynamic = [...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]);
    assert.equal(dynamic.length, [...source.matchAll(/\bimport\s*\(/g)].length, 'NONLITERAL_IMPORT');
    const exports = [...source.matchAll(/^\s*export\s+(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\s*['"]([^'"]+)['"]/gm)].map(match => match[1]);
    assert.doesNotMatch(source, /\brequire\s*\(|\bcreateRequire\b/, 'REQUIRE');
    for (const name of [...imports, ...dynamic, ...exports]) {
      if (name.startsWith('.')) { const target = path.posix.normalize(path.posix.join(path.posix.dirname(filename), name));
        assert.ok(target.startsWith('package/src/') && entries.has(target), 'IMPORT_CLOSURE');
      } else assert.ok(name.startsWith('node:') || external.has(name), 'IMPORT_EXTERNAL');
    }
  }
}
function audit(entries) {
  assert.deepEqual([...entries.keys()].sort(), MEMBERS, 'PACKAGE_MEMBERS'); checkImports(entries);
  for (const [filename, row] of entries) {
    assert.equal(row.mode, MODES[filename], 'PACKAGE_MODE'); assert.equal(sha(row.bytes), SOURCE_PINS[filename], 'SOURCE_PIN');
    assert.deepEqual(row.bytes, expectedBytes.get(filename), 'FROZEN_SOURCE_BYTES');
  }
  const metadata = JSON.parse(entries.get('package/package.json').bytes);
  assert.deepEqual(metadata.bin, BINS); assert.deepEqual(metadata.files, ['src', 'README.md', 'JOURNAL_STORAGE.md', 'EXAMPLES.md', 'PAPER_JOURNAL.md']);
  assert.deepEqual(metadata.dependencies, { '@modelcontextprotocol/server': '2.3.1', '@modelcontextprotocol/client': '2.3.1', zod: '4.6.5' });
  assert.equal(metadata.private, true); assert.equal(metadata.version, '0.1.0'); return metadata;
}
const bounded = (promise, ms) => { let timer; return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('FIXTURE_BOUND')), ms); })]).finally(() => clearTimeout(timer)); };
const absent = pid => { try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } };
function retainedDiagnostic(label, value) {
  const line = label + ' ' + JSON.stringify(value) + '\n';
  assert.ok(Buffer.byteLength(line) <= Math.ceil(LIMITS.compressed / 3) * 4 + 65536, 'DIAGNOSTIC_BOUND');
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer);
      process.stdout.removeListener('error', failed); process.stdout.removeListener('drain', drained);
      error ? reject(error) : resolve(); };
    const failed = () => finish(new Error('DIAGNOSTIC_WRITE'));
    const drained = () => finish();
    const timer = setTimeout(() => finish(new Error('DIAGNOSTIC_BOUND')), 5000);
    process.stdout.once('error', failed);
    try { if (capturedDiagnosticWrite(line)) finish(); else process.stdout.once('drain', drained); }
    catch { failed(); }
  });
}
async function packOnce() {
  const output = path.join(directory, 'pack'), cache = path.join(directory, 'cache'); fs.mkdirSync(output); fs.mkdirSync(cache);
  const guard = path.join(directory, 'pack-guard.mjs'); fs.writeFileSync(guard, childGuardSource(directory), { flag: 'wx', mode: 0o600 });
  const user = path.join(directory, 'user.conf'), global = path.join(directory, 'global.conf'); fs.writeFileSync(user, '', { flag: 'wx', mode: 0o600 }); fs.writeFileSync(global, '', { flag: 'wx', mode: 0o600 });
  const args = ['pack', '--json', '--ignore-scripts', '--offline', '--update-notifier=false', '--audit=false', '--fund=false',
    '--pack-destination', output, '--cache', cache, '--userconfig', user, '--globalconfig', global];
  const child = childProcess.spawn('npm', args, { cwd: ROOT, env: { PATH: process.env.PATH, CI: 'true', NODE_OPTIONS: '--import=' + JSON.stringify(guard) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', outBytes = 0, errBytes = 0, failure = null; const started = performance.now();
  child.stdout.on('data', bytes => { outBytes += bytes.length; if (outBytes > LIMITS.packStdout) { failure ??= 'PACK_STDOUT'; child.kill('SIGKILL'); } else stdout += bytes.toString(); });
  child.stderr.on('data', bytes => { errBytes += bytes.length; if (errBytes > LIMITS.packStderr) { failure ??= 'PACK_STDERR'; child.kill('SIGKILL'); } else stderr += bytes.toString(); });
  const terminal = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  const timer = setTimeout(() => { failure ??= 'PACK_DEADLINE'; child.kill('SIGKILL'); }, LIMITS.packMs);
  try {
    const ended = await bounded(terminal, LIMITS.packMs + 1000); assert.ok(performance.now() - started <= LIMITS.packMs);
    assert.equal(failure, null); assert.equal(ended.code, 0); assert.equal(ended.signal, null); assert.doesNotMatch(stderr, /DENIED_OPERATION/); assert.equal(absent(child.pid), true);
    const rows = JSON.parse(stdout); assert.equal(rows.length, 1); assert.match(rows[0].filename, /^[A-Za-z0-9_.-]+\.tgz$/);
    const compressed = snapshot(path.join(output, rows[0].filename), LIMITS.compressed); assert.equal(compressed.length, rows[0].size); return { compressed, args };
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await bounded(terminal, 5000); } }
}
before(async t => {
  directory = nativeRealpath(fs.mkdtempSync(path.join(os.tmpdir(), 'canli-paper-package-'))); fs.chmodSync(directory, 0o700); armEffects();
  fs.writeFileSync(path.join(directory, 'child-guard.mjs'), childGuardSource(directory), { flag: 'wx', mode: 0o600 });
  expectedBytes = new Map(MEMBERS.map(name => [name, snapshot(path.join(ROOT, name.slice(8)), LIMITS.expanded)]));
  expectedTotal = [...expectedBytes.values()].reduce((n, bytes) => n + bytes.length, 0); assert.ok(expectedTotal <= 4 * 1024 * 1024);
  for (const [filename, bytes] of expectedBytes) assert.equal(sha(bytes), SOURCE_PINS[filename], 'FROZEN_SOURCE_PIN');
  const artifact = await packOnce(), raw = { admission: 'RAW_CAPTURED_NOT_ADMITTED', compressed_bytes: artifact.compressed.length,
    compressed_sha256: sha(artifact.compressed), original_gzip_base64: artifact.compressed.toString('base64'), files: null };
  assert.ok(artifact.compressed.length + raw.original_gzip_base64.length * 2 + LIMITS.expanded + expectedTotal <= LIMITS.nativePeak, 'NATIVE_PEAK');
  await retainedDiagnostic('CANLI_PAPER_PACKAGE_TARBALL_RAW', raw); // flushed captured output before admission or extraction
  const entries = tarEntries(artifact.compressed); raw.files = [...entries].map(([filename, row]) => ({ path: filename, mode: row.mode, bytes: row.bytes.length, sha256: sha(row.bytes) }));
  await retainedDiagnostic('CANLI_PAPER_PACKAGE_RAW_MEMBERS', { admission: raw.admission, compressed_sha256: raw.compressed_sha256, files: raw.files });
  const metadata = audit(entries), consumer = path.join(directory, 'consumer'); fs.mkdirSync(consumer); fs.mkdirSync(path.join(consumer, 'node_modules'));
  packageRoot = path.join(consumer, 'node_modules', metadata.name); fs.mkdirSync(packageRoot);
  for (const [filename, row] of entries) { const target = path.join(packageRoot, filename.slice(8)); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, row.bytes, { flag: 'wx', mode: row.mode }); fs.chmodSync(target, row.mode); }
  const dependencies = [];
  for (const [name, version] of [['@modelcontextprotocol/client', '2.3.1'], ['@modelcontextprotocol/server', '2.3.1'], ['@modelcontextprotocol/core', '2.3.1'], ['zod', '4.6.5']]) {
    const bytes = snapshot(path.join(ROOT, 'node_modules', name, 'package.json'), 65536); assert.equal(JSON.parse(bytes).version, version); dependencies.push({ name, version, sha256: sha(bytes) }); }
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(packageRoot, 'node_modules'), 'dir');
  const bins = [], binRoot = path.join(consumer, 'node_modules/.bin'); fs.mkdirSync(binRoot);
  for (const [name, local] of Object.entries(BINS)) { const target = path.join(packageRoot, local); fs.chmodSync(target, 0o755);
    fs.symlinkSync('../' + metadata.name + '/' + local, path.join(binRoot, name)); bins.push({ name, raw_mode: entries.get('package/' + local).mode, owned_fixture_mode: 0o755 }); }
  const snippet = entries.get('package/PAPER_JOURNAL.md').bytes.toString().match(/<!-- paper-package-workflow:start -->\s*```js\n([\s\S]+?)\n```\s*<!-- paper-package-workflow:end -->/);
  assert.ok(snippet); const snippetPath = path.join(packageRoot, 'consumer-snippet.mjs'); fs.writeFileSync(snippetPath, snippet[1], { flag: 'wx', mode: 0o600 });
  adapter = await import(pathToFileURL(path.join(packageRoot, 'src/paper-journal.mjs')));
  server = await import(pathToFileURL(path.join(packageRoot, 'src/server.mjs'))); guide = await import(pathToFileURL(snippetPath));
  packed = { ...artifact, entries, metadata, raw, consumer, bins, dependencies };
  await retainedDiagnostic('CANLI_PAPER_PACKAGE_TARBALL_ADMITTED', { admission: 'ADMITTED', compressed_sha256: raw.compressed_sha256, files: raw.files, bins, dependencies,
    dependency_tree: path.join(ROOT, 'node_modules'), dependency_link_is_not_install: true, repository_sources_linked: false });
}, { timeout: 40000 });
after(() => {
  try {
    assert.equal(packEntries, 1); assert.equal(sdkEntries, 3); assert.equal(children.length, 3);
    assert.ok(children.every(row => row.pid && row.exit && row.close && absent(row.pid)));
    assert.deepEqual([...new Set(denials)].sort(), ['fetch', 'filesystem', 'network', 'spawn']);
  } finally {
    if (directory) {
      if (packageRoot) {
        // Unlink this exact owned link itself; the SDK tree is never traversed or removed.
        const dependencyLink = path.join(packageRoot, 'node_modules');
        if (fs.existsSync(dependencyLink)) {
          assert.ok(owned(dependencyLink) && fs.lstatSync(dependencyLink).isSymbolicLink());
          assert.equal(fs.readlinkSync(dependencyLink), path.join(ROOT, 'node_modules'));
          nativeUnlink(dependencyLink);
        }
      }
      fs.rmSync(directory, { recursive: true });
    }
  }
});
const clonedEntries = () => new Map([...packed.entries].map(([name, row]) => [name, { mode: row.mode, bytes: Buffer.from(row.bytes) }]));
const envelope = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
function homeFixture(key = false) {
  const home = fs.mkdtempSync(path.join(directory, 'home-')); fs.chmodSync(home, 0o700); let pem = null;
  if (key) { pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }); fs.writeFileSync(path.join(home, 'journal.key'), pem, { flag: 'wx', mode: 0o600 }); }
  const session = server.createSession({ home, journalWrites: true, now: () => new Date('2025-01-02T00:00:00.000Z') }); const requests = [];
  const callTool = async request => { requests.push(request); if (request.name === 'size_position') return server.toolSizePosition(session, request.arguments);
    if (request.name === 'check_orders') return server.toolCheckOrders(session, request.arguments); return server.toolJournal(session, request.arguments); };
  return { home, pem, session, requests, callTool };
}
class Output extends EventEmitter { constructor(effect = () => true) { super(); this.frames = []; this.effect = effect; } write(bytes) { this.frames.push(bytes); return this.effect(bytes); } }
function syntheticSdk(f, options = {}) {
  const counts = { connect: 0, calls: 0, clientClose: 0, transportClose: 0, writes: 0, definitionNames: [] }; let pipe, processObject;
  class Transport {
    constructor(params) { counts.params = params; this.stderr = new PassThrough(); pipe = this; }
    start() { if (options.startRefusal) return options.startRefusal();
      processObject = new EventEmitter(); processObject.pid = 12345; processObject.stdin = new Output(() => { counts.writes++; return true; });
      this._process = processObject; queueMicrotask(() => processObject.emit('spawn')); return Promise.resolve(); }
    close() { counts.transportClose++; options.onClose?.(); if (!processObject) return Promise.resolve();
      if (options.closeError) { processObject.emit('exit'); processObject.emit('close'); throw new Error('PRIVATE_DIAGNOSTIC'); }
      if (options.neverClose) return new Promise(() => {});
      if (!options.noExit) processObject.emit('exit'); processObject.emit('close'); this._process = undefined; return Promise.resolve(); }
  }
  class Client {
    constructor(info, config) { counts.config = config; }
    async connect(t) { counts.connect++; await t.start(); await t.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }); if (options.stderr) t.stderr.write(options.stderr); }
    async callTool(request, opts) { counts.calls++; counts.definitionNames.push(opts.toolDefinition.name); assert.equal(opts.toolDefinition.name, request.name);
      options.onQueuedSend?.();
      await pipe.send({ jsonrpc: '2.0', id: counts.calls + 1, method: 'tools/call', params: request }); return f.callTool(request, opts); }
    async close() { counts.clientClose++; if (options.reenter) assert.equal(this.close(), this.close()); await pipe.close(); }
  }
  return { modules: { Client, StdioClientTransport: Transport }, counts, get child() { return processObject; } };
}
async function injected(f, options = {}) { const sdk = syntheticSdk(f, options); const report = await adapter.runPaperJournalStdio({ home: f.home, write: !!options.write, sdkModules: sdk.modules, ...(options.now ? { now: options.now } : {}) }); return { report, sdk }; }
function checksum(header) { header.fill(32, 148, 156); header.write(header.reduce((n, byte) => n + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148, 'ascii'); return header; }
function tarFixture(rows, mutate = () => {}) {
  const chunks = []; for (const [i, row] of rows.entries()) { const header = Buffer.alloc(512); header.write(row.name, 0, 'ascii'); header.write('0000644\0', 100, 'ascii');
    header.write(row.bytes.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii'); header[156] = 48; mutate(header, i); checksum(header);
    chunks.push(header, row.bytes, Buffer.alloc((512 - row.bytes.length % 512) % 512)); }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]), { mtime: 0 });
}
function assertClosed(row, report, calls) {
  assert.equal(report.transport.scope, 'same_owned_child_exit_and_close'); assert.equal(row.pid, report.transport.owned_pid); assert.ok(row.exit && row.close && absent(row.pid));
  assert.equal(report.transport.observed_exit, true); assert.equal(report.transport.observed_close, true);
  assert.ok(report.transport.timing.observed_work_ms <= 25000 && report.transport.timing.observed_closure_ms <= 5000 && report.transport.timing.observed_total_ms <= 30000);
  assert.equal(row.frames.filter(frame => frame.method === 'tools/call').length, calls);
  assert.equal(row.frames.filter(frame => frame.method === 'tools/list' || frame.method === 'server/discover').length, 0);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_DIAGNOSTIC|BEGIN PRIVATE KEY/);
}

test('paper package: guards positively deny network fetch foreign writes and extra spawn before imports', () => {
  assert.throws(() => globalThis.fetch('https://invalid.example'), /DENIED_OPERATION/);
  assert.throws(() => http.get('https://invalid.example'), /DENIED_OPERATION/);
  assert.throws(() => fs.writeFileSync(path.join(ROOT, 'foreign-paper-fixture'), 'PRIVATE_DIAGNOSTIC'), /DENIED_OPERATION/);
  assert.throws(() => childProcess.spawn('unexpected-process', [], {}), /DENIED_OPERATION/);
});
test('paper package: exact28 raw members modes source pins and Git-free closure are admitted separately', () => {
  assert.equal(MEMBERS.length, 28); assert.equal([...packed.entries.keys()].filter(name => /\.(js|mjs)$/.test(name)).length, 22);
  assert.deepEqual(audit(clonedEntries()), packed.metadata); assert.equal(packed.raw.admission, 'RAW_CAPTURED_NOT_ADMITTED');
  assert.equal(packed.raw.compressed_sha256, sha(packed.compressed));
  for (const name of ['.git', 'js', 'scripts', 'examples']) assert.equal(fs.existsSync(path.join(packageRoot, name)), false);
});
test('paper package: complete original pure section and old34 test file remain byte exact', () => {
  const original = snapshot(path.join(ROOT, 'examples/paper-journal.mjs'), 65536), source = packed.entries.get('package/src/paper-journal.mjs').bytes;
  assert.equal(sha(original), 'f668f2b216694d0fdcc7b507941162198c38c7534f75a47c4d2265754e7ae724');
  const section = original.subarray(original.indexOf('// These values are a fixture'), original.indexOf('const DEFINITIONS ='));
  assert.equal(section.length, 24671); assert.equal(sha(section), 'c22053f578a018070ff8145591709995a8788e69420245f0e210418b6a5310b0');
  assert.ok(source.includes(section)); assert.equal(sha(snapshot(path.join(ROOT, 'test/paper-journal-example.test.mjs'), 65536)), '46011f1ab7f74c250f01a78429d3aafefb06bcfea9976b04887cc5a2065c59f8');
});
test('paper package: runtime promotion preserves every locked version integrity edge and original root command', () => {
  const lock = JSON.parse(snapshot(path.join(ROOT, 'package-lock.json'), 65536));
  assert.deepEqual(lock.packages[''].dependencies, packed.metadata.dependencies); assert.deepEqual(lock.packages[''].bin, BINS);
  for (const name of ['@modelcontextprotocol/client', 'cross-spawn', 'eventsource', 'eventsource-parser', 'isexe', 'jose', 'path-key', 'pkce-challenge', 'shebang-command', 'shebang-regex', 'which'])
    assert.equal(lock.packages['node_modules/' + name].dev, undefined);
  assert.equal(lock.packages['node_modules/@modelcontextprotocol/client'].version, '2.3.1');
  assert.equal(lock.packages['node_modules/@modelcontextprotocol/client'].integrity, 'sha512-mIGZXpHsjnZ6lD+gD/WCMpR5k8yVQQ8nNFH1N0Srf7AvnwTUMYD6pvTY8ng2+He5FfV7YMZLmrjL7cLa/cc3dQ==');
  // The root verify script belongs to the whole repository; this package only needs it to exist.
  assert.equal(typeof JSON.parse(snapshot(path.join(ROOT, '../package.json'), 32768)).scripts.verify, 'string');
});
test('paper package: original default server source mode differs only in owned executable fixture', () => {
  assert.equal(packed.entries.get('package/src/server.mjs').mode, 0o644); assert.equal(packed.entries.get('package/src/paper-journal.mjs').mode, 0o755);
  assert.deepEqual(packed.bins.map(row => row.raw_mode), [0o644, 0o755]); assert.ok(packed.bins.every(row => row.owned_fixture_mode === 0o755));
  assert.equal(sha(snapshot(path.join(packageRoot, 'src/server.mjs'), 65536)), SOURCE_PINS['package/src/server.mjs']);
});
test('paper package: missing extra changed and wrong-mode members refuse before extraction', () => {
  const missing = clonedEntries(); missing.delete('package/EXAMPLES.md'); assert.throws(() => audit(missing), /PACKAGE_MEMBERS/);
  const extra = clonedEntries(); extra.set('package/private.key', { mode: 0o644, bytes: Buffer.from('PRIVATE_DIAGNOSTIC') }); assert.throws(() => audit(extra), /PACKAGE_MEMBERS/);
  const changed = clonedEntries(); changed.get('package/src/server.mjs').bytes[0] ^= 1; assert.throws(() => audit(changed), /SOURCE_PIN/);
  const mode = clonedEntries(); mode.get('package/src/server.mjs').mode = 0o755; assert.throws(() => audit(mode), /PACKAGE_MODE/);
});
test('paper package: all JS and MJS imports reject missing escape and undeclared dependency', () => {
  for (const source of ["import value from '../../private.mjs';", "import value from './absent.mjs';", "import value from 'undeclared';"])
    for (const suffix of ['mjs', 'js']) { const rows = clonedEntries(); rows.set('package/src/fault.' + suffix, { mode: 0o644, bytes: Buffer.from(source) }); assert.throws(() => checkImports(rows), /IMPORT_/); }
});
test('paper package: from text in exported constants is valid and real reexports are audited', () => {
  const rows = clonedEntries(); rows.set('package/src/fault.js', { mode: 0o644, bytes: Buffer.from("export const description = 'copied from supplied rows';") }); checkImports(rows);
  for (const source of ["export * from '../../private.js';", "export { value } from './absent.mjs';"]) { rows.get('package/src/fault.js').bytes = Buffer.from(source); assert.throws(() => checkImports(rows), /IMPORT_CLOSURE/); }
});
test('paper package: gzip CRC concatenation and trailing bytes refuse before TAR admission', () => {
  const corrupt = Buffer.from(packed.compressed); corrupt[corrupt.length - 8] ^= 1; assert.throws(() => tarEntries(corrupt), /GZIP_CRC/);
  assert.throws(() => tarEntries(Buffer.concat([packed.compressed, Buffer.from([0])])), /GZIP_SINGLE_MEMBER/);
  assert.throws(() => tarEntries(Buffer.concat([packed.compressed, packed.compressed])), /GZIP_SINGLE_MEMBER/);
});
test('paper package: compressed expanded and member-count bounds prevent fixture writes', () => {
  assert.throws(() => tarEntries(Buffer.alloc(LIMITS.compressed + 1)), /GZIP_BOUND/);
  assert.throws(() => tarEntries(gzipSync(Buffer.alloc(LIMITS.expanded + 512))), /larger|length|size|buffer/i);
  const rows = Array.from({ length: 29 }, (_, i) => ({ name: 'package/' + i, bytes: Buffer.alloc(0) })); assert.throws(() => tarEntries(tarFixture(rows)), /TAR_COUNT/);
});
test('paper package: checksum-valid high-bit path type mode size and checksum raw fields refuse', () => {
  for (const offset of [0, 156, 100, 124]) { const bytes = tarFixture([{ name: 'package/README.md', bytes: Buffer.from('x') }], header => { header[offset] |= 128; }); assert.throws(() => tarEntries(bytes), /TAR_ASCII/); }
  const header = Buffer.from(inflateRawSync(packed.compressed.subarray(10))); header[148] |= 128; assert.throws(() => tarEntries(gzipSync(header)), /TAR_ASCII/);
});
test('paper package: traversal backslash duplicate links and extension headers refuse', () => {
  for (const name of ['../README.md', 'package/../README.md', '/package/README.md', 'package\\README.md']) assert.throws(() => tarEntries(tarFixture([{ name, bytes: Buffer.alloc(0) }])), /TAR_PATH/);
  assert.throws(() => tarEntries(tarFixture([{ name: 'package/A', bytes: Buffer.alloc(0) }, { name: 'package/A', bytes: Buffer.alloc(0) }])), /TAR_DUPLICATE/);
  for (const type of [49, 50, 53, 120, 103]) assert.throws(() => tarEntries(tarFixture([{ name: 'package/A', bytes: Buffer.alloc(0) }], h => { h[156] = type; })), /TAR_REGULAR/);
});
test('paper package: nonoctal bad checksum and truncated bodies refuse without extraction', () => {
  assert.throws(() => tarEntries(tarFixture([{ name: 'package/A', bytes: Buffer.alloc(0) }], h => { h[100] = 57; })), /TAR_OCTAL/);
  const inflated = inflateRawSync(packed.compressed.subarray(10)); const changed = Buffer.from(inflated);
  changed[148] = changed[148] === 48 ? 49 : 48; // valid octal checksum, unchanged valid path
  assert.throws(() => tarEntries(gzipSync(changed)), /TAR_CHECKSUM/);
  assert.throws(() => tarEntries(gzipSync(inflated.subarray(0, 512))), /TAR_BODY|TAR_END/);
});
test('paper package: guide and old repository instructions remain packaged without an npm-install claim', () => {
  const text = packed.entries.get('package/PAPER_JOURNAL.md').bytes.toString(); assert.match(text, /paper-package-workflow:start/);
  assert.match(text, /dependency link is disclosed/); assert.match(text, /not npm installation/);
  assert.equal(sha(packed.entries.get('package/EXAMPLES.md').bytes), 'e3f39e9764bdb50390b784c156b9aa0c1ef3daa235d7cfe95934851c8e9586ac');
  assert.match(packed.entries.get('package/README.md').bytes.toString(), /examples\/paper-journal\.mjs/);
});
test('paper package: entry1 exact installed guide defaults to two calls no key and known same-child closure', { timeout: 31000 }, async () => {
  const f = homeFixture(), frames = []; const report = await guide.guideRun(f.home, bytes => frames.push(bytes));
  assert.equal(report.status, 'writes_disabled', JSON.stringify(report.stop)); assert.equal(report.call_count, 2); assert.deepEqual(fs.readdirSync(f.home), []);
  assert.equal(frames.length, 1); assert.equal(frames[0], JSON.stringify(report) + '\n');
  assert.deepEqual(JSON.parse(frames[0]), JSON.parse(JSON.stringify(report)));
  assert.ok(Buffer.byteLength(frames[0]) <= 196609); assertClosed(children[0], report, 2);
});
test('paper package: entry2 complete synthetic signed record binds sole fee mark and null Sharpe', { timeout: 31000 }, async () => {
  const f = homeFixture(true), key = snapshot(path.join(f.home, 'journal.key'), 8192);
  const report = await adapter.runPaperJournalStdio({ home: f.home, write: true }); assert.equal(report.status, 'completed', JSON.stringify(report.stop));
  assert.equal(report.call_count, 11); assert.equal(report.receipts.length, 6); assert.equal(report.requests.length, 6); assert.equal(report.pending_request, null); assert.equal(report.pending_export, null);
  assert.equal(report.export.metrics.closing_equity, 10006.5); assert.equal(report.export.metrics.fees_usd, 1); assert.equal(report.export.record.returns.sharpe_annualised, null);
  assert.equal(report.export.record.capital.venue, 'local_sim'); assert.deepEqual(snapshot(path.join(f.home, 'journal.key'), 8192), key);
  const lines = snapshot(path.join(f.home, 'journal.jsonl'), 65536).toString().trimEnd().split('\n').map(line => JSON.parse(line).entry);
  assert.deepEqual(lines.map(row => row.kind), ['config', 'decision', 'check', 'order', 'fill', 'mark']); assertClosed(children[1], report, 11);
});
test('paper package: entry3 typed busy refuses once retains pending request and never erases lock', { timeout: 31000 }, async () => {
  const f = homeFixture(true), marker = Buffer.from('PRIVATE_DIAGNOSTIC pending owner review');
  fs.writeFileSync(path.join(f.home, 'journal.append.lock'), marker, { flag: 'wx', mode: 0o600 });
  const report = await adapter.runPaperJournalStdio({ home: f.home, write: true }); assert.equal(report.status, 'stopped'); assert.equal(report.stop.code, 'JOURNAL_STORE_BUSY');
  assert.equal(report.call_count, 4); assert.equal(report.receipts.length, 0); assert.equal(report.pending_request.dispatched, true); assert.equal(report.requests.length, 1);
  assert.deepEqual(snapshot(path.join(f.home, 'journal.append.lock'), 8192), marker); assert.equal(fs.existsSync(path.join(f.home, 'journal.jsonl')), false); assertClosed(children[2], report, 4);
});
test('paper package: native direct bin and absolute symlink identities admit the same argument result', async () => {
  const command = path.join(packageRoot, 'src/paper-journal.mjs'), alias = path.join(packed.consumer, 'paper-alias'); fs.symlinkSync(command, alias);
  assert.equal(adapter.paperJournalEntry(command, command), true); assert.equal(adapter.paperJournalEntry(alias, command), true);
  assert.equal(adapter.paperJournalEntry(path.join(packageRoot, 'src/server.mjs'), command), false);
  const f = homeFixture(), outputs = [];
  for (const entry of [command, alias]) {
    assert.equal(adapter.paperJournalEntry(entry, command), true); const sdk = syntheticSdk(f), frames = [];
    const report = await adapter.paperJournalCommand(['--home', f.home], { now: () => 0, sdkModules: sdk.modules, emit: bytes => frames.push(bytes) });
    assert.equal(report.status, 'writes_disabled'); assert.equal(report.transport.scope, 'injected_no_child'); assert.equal(report.transport.absence_scope, null); assert.equal(sdk.counts.calls, 2); assert.equal(frames.length, 1); outputs.push(frames[0]);
  }
  assert.equal(outputs[0], outputs[1]);
});
test('paper package: invalid arguments and private diagnostic failures never echo paths keys or options', async () => {
  const frames = []; const report = await adapter.paperJournalCommand(['--home', '/PRIVATE_DIAGNOSTIC', '--endpoint', 'PRIVATE_DIAGNOSTIC'], { emit: bytes => frames.push(bytes) });
  assert.equal(report.stop.code, 'USAGE'); assert.equal(report.call_count, 0); assert.doesNotMatch(frames.join(''), /PRIVATE_DIAGNOSTIC|endpoint/);
  const f = homeFixture(); const result = await injected({ ...f, callTool: () => { throw new Error('PRIVATE_DIAGNOSTIC'); } }); assert.equal(result.report.status, 'stopped'); assert.doesNotMatch(JSON.stringify(result.report), /PRIVATE_DIAGNOSTIC/);
});
test('paper package: safe server environment admits only platform keys and fixed local controls', () => {
  const env = adapter.paperServerEnvironment('/fixed/home', false, { PATH: '/safe', HOME: '/safe', PRIVATE_DIAGNOSTIC: 'secret', NODE_OPTIONS: '--bad', USER: '() { attack; }' });
  assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.PRIVATE_DIAGNOSTIC, undefined); assert.equal(env.USER, undefined); assert.equal(env.CANLI_EXEC_JOURNAL_WRITE, '0'); assert.equal(env.CANLI_EXEC_TOOLSETS, 'all');
});
test('paper package: native SDK config has explicit legacy exact tool definitions and no list retry', async () => {
  const f = homeFixture(), { report, sdk } = await injected(f); assert.equal(report.status, 'writes_disabled');
  assert.deepEqual(sdk.counts.config.versionNegotiation, { mode: 'legacy' }); assert.deepEqual(sdk.counts.config.inputRequired, { autoFulfill: false });
  assert.deepEqual(sdk.counts.definitionNames, ['size_position', 'check_orders']); assert.equal(sdk.counts.params.maxBufferSize, 524288); assert.equal(sdk.counts.clientClose, 1); assert.equal(sdk.counts.transportClose, 1);
  const refused = await injected({ ...f, callTool: () => envelope({ error: { code: 'HEADER_MISMATCH', message: 'PRIVATE_DIAGNOSTIC' } }) }); assert.equal(refused.sdk.counts.calls, 1); assert.equal(refused.report.stop.code, 'TOOL_ERROR');
});
test('paper package: queued call crossing absolute work deadline performs zero additional native writes', async () => {
  const f = homeFixture(); let clock = 0; const { report, sdk } = await injected(f, { now: () => clock, onQueuedSend: () => { clock = 25000; } });
  assert.equal(report.stop.code, 'DEADLINE'); assert.equal(sdk.counts.calls, 1); assert.equal(sdk.counts.writes, 1); assert.equal(report.call_count, 1); assert.equal(report.planning, null);
  assert.equal(f.requests.length, 0); assert.equal(sdk.counts.clientClose, 1); assert.equal(sdk.counts.transportClose, 1);
  // Both an already-rejected SDK task and a later rejection must stay owned after post-callback refusal.
  await new Promise(resolve => setImmediate(resolve));
  clock = 0; const scope = adapter.createPaperScope({ now: () => clock }); let rejectTask, taskCalls = 0;
  const delayed = new Promise((_, reject) => { rejectTask = reject; });
  const stopped = scope.bounded(() => { taskCalls++; clock = 25000; return delayed; });
  await assert.rejects(stopped, error => error.code === 'DEADLINE');
  rejectTask(new Error('PRIVATE_DIAGNOSTIC_LATE_REJECTION'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(taskCalls, 1); assert.equal(scope.failure.code, 'DEADLINE'); scope.dispose();
  const positive = adapter.createPaperScope({ now: () => 0 });
  assert.equal(await positive.bounded(() => Promise.resolve('exact positive task')), 'exact positive task'); positive.dispose();
});
test('paper package: serializer crossing prevents native write while an exact positive frame succeeds', async () => {
  let clock = 0; const scope = adapter.createPaperScope({ now: () => clock }), output = new Output(), writer = adapter.createPaperNativeWriter(output, scope);
  await writer.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }); assert.equal(output.frames.length, 1);
  await assert.rejects(writer.send({ toJSON() { clock = 25000; return { late: true }; } }), error => error.code === 'DEADLINE'); assert.equal(output.frames.length, 1); scope.dispose();
});
test('paper package: serializer reentrant abort is sticky and suppresses the captured native effect', async () => {
  const abort = new AbortController(), scope = adapter.createPaperScope({ signal: abort.signal }), output = new Output(), writer = adapter.createPaperNativeWriter(output, scope);
  await assert.rejects(writer.send({ toJSON() { abort.abort(); return {}; } }), error => error.code === 'CANCELLED');
  await assert.rejects(writer.send({ safe: true }), error => error.code === 'CANCELLED'); assert.equal(output.frames.length, 0); scope.dispose();
});
test('paper package: exact UTF8 frame equality succeeds and escaped overflow refuses before effect', async () => {
  const a = adapter.createPaperScope(), output = new Output(), writer = adapter.createPaperNativeWriter(output, a);
  await writer.send('x'.repeat(65533)); assert.equal(Buffer.byteLength(output.frames[0]), 65536);
  await assert.rejects(writer.send('x'.repeat(65534)), error => error.code === 'STDIO_FRAME_BOUND'); assert.equal(output.frames.length, 1); a.dispose();
  const b = adapter.createPaperScope(), escaped = new Output(); await assert.rejects(adapter.createPaperNativeWriter(escaped, b).send('\0'.repeat(11000)), error => error.code === 'STDIO_FRAME_BOUND'); assert.equal(escaped.frames.length, 0); b.dispose();
});
test('paper package: captured native write errors refuse without a second write or error echo', async () => {
  const scope = adapter.createPaperScope(), output = new Output(() => { throw new Error('PRIVATE_DIAGNOSTIC'); }), writer = adapter.createPaperNativeWriter(output, scope);
  await assert.rejects(writer.send({}), error => error.code === 'CALL_FAILED'); await assert.rejects(writer.send({}), error => error.code === 'CALL_FAILED'); assert.equal(output.frames.length, 1); scope.dispose();
});
test('paper package: one drain resolves one frame and late aborted drain cannot restore success', async () => {
  const scope = adapter.createPaperScope(), output = new Output(() => false), writer = adapter.createPaperNativeWriter(output, scope);
  const first = writer.send({}); assert.equal(output.listenerCount('drain'), 1); output.emit('drain'); await first; assert.equal(output.listenerCount('drain'), 0); assert.equal(output.frames.length, 1); scope.dispose();
  const abort = new AbortController(), secondScope = adapter.createPaperScope({ signal: abort.signal }), second = new Output(() => false);
  const pending = adapter.createPaperNativeWriter(second, secondScope).send({}); abort.abort(); second.emit('drain'); await assert.rejects(pending, error => error.code === 'CANCELLED'); assert.equal(second.frames.length, 1); secondScope.dispose();
});
test('paper package: closed and observed-exit states refuse without calling the captured writer', async () => {
  for (const state of [{ closed: true, exited: false }, { closed: false, exited: true }]) {
    const scope = adapter.createPaperScope(), output = new Output(); await assert.rejects(adapter.createPaperNativeWriter(output, scope, { state }).send({}), error => error.code === 'STDIO_CLOSED'); assert.equal(output.frames.length, 0); scope.dispose(); }
});
test('paper package: cumulative stderr overflow refuses and never retains or echoes diagnostic bytes', async () => {
  const f = homeFixture(), { report, sdk } = await injected(f, { stderr: Buffer.from('PRIVATE_DIAGNOSTIC' + 'x'.repeat(65536)) });
  assert.equal(report.stop.code, 'STDERR_BOUND'); assert.equal(sdk.counts.calls, 0); assert.doesNotMatch(JSON.stringify(report), /PRIVATE_DIAGNOSTIC/); assert.ok(report.transport.stderr_bytes > 65536);
});
test('paper package: memoized close is published before reentrancy and an error cannot mark success', async () => {
  const f = homeFixture(), success = await injected(f, { reenter: true }); assert.equal(success.report.status, 'writes_disabled'); assert.equal(success.sdk.counts.clientClose, 1); assert.equal(success.sdk.counts.transportClose, 1);
  assert.equal(success.sdk.counts.connect, 1); assert.equal(success.sdk.counts.calls, 2); assert.equal(success.sdk.counts.writes, 3);
  const failure = await injected(f, { closeError: true }); assert.equal(failure.report.status, 'stopped'); assert.equal(failure.report.stop.code, 'STDIO_CLOSE_UNCERTAIN'); assert.equal(failure.sdk.counts.transportClose, 1);
  for (const delayed of [false, true]) {
    let rejectStart;
    const result = await injected(f, { startRefusal: () => delayed ? new Promise((_, reject) => { rejectStart = reject; }) : Promise.reject(new Error('PRIVATE_DIAGNOSTIC_START')) });
    assert.equal(result.report.status, 'stopped'); assert.equal(result.report.stop.code, 'STDIO_CHILD_UNKNOWN'); assert.equal(result.report.call_count, 0);
    assert.equal(result.sdk.child, undefined); assert.equal(result.sdk.counts.connect, 1); assert.equal(result.sdk.counts.calls, 0); assert.equal(result.sdk.counts.writes, 0);
    assert.equal(result.sdk.counts.clientClose, 1); assert.equal(result.sdk.counts.transportClose, 1);
    assert.equal(result.report.transport.owned_pid, null); assert.equal(result.report.transport.observed_exit, null); assert.equal(result.report.transport.observed_close, null); assert.equal(result.report.transport.absence_scope, null);
    if (delayed) rejectStart(new Error('PRIVATE_DIAGNOSTIC_LATE_START'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.report.stop.code, 'STDIO_CHILD_UNKNOWN'); assert.doesNotMatch(JSON.stringify(result.report), /PRIVATE_DIAGNOSTIC/);
  }
});
test('paper package: never-resolving close remains uncertain within the finite closure reserve', { timeout: 6500 }, async () => {
  const f = homeFixture(), result = await injected(f, { neverClose: true }); assert.equal(result.report.status, 'stopped'); assert.equal(result.report.stop.code, 'STDIO_CLOSE_UNCERTAIN'); assert.equal(result.report.transport.observed_close, false); assert.equal(result.sdk.counts.transportClose, 1);
});
test('paper package: close resolution without observed same-child exit is never a success', { timeout: 6500 }, async () => {
  const f = homeFixture(), result = await injected(f, { noExit: true }); assert.equal(result.report.status, 'stopped'); assert.equal(result.report.stop.code, 'STDIO_CLOSE_UNCERTAIN'); assert.equal(result.report.transport.observed_exit, false); assert.equal(result.report.transport.observed_close, true);
});
test('paper package: work closure and final serialization observations cannot promote an expired report', async () => {
  const f = homeFixture(), sdk = syntheticSdk(f); let observations = 0, clock = 0; const frames = [];
  const report = await adapter.paperJournalCommand(['--home', f.home], { sdkModules: sdk.modules, emit: bytes => frames.push(bytes), now: () => { observations++; if (sdk.counts.transportClose) clock = 30001; return clock; } });
  assert.ok(observations > 4); assert.equal(report.status, 'stopped'); assert.equal(frames.length, 1); assert.equal(JSON.parse(frames[0]).status, 'stopped'); assert.ok(['DEADLINE', 'STDIO_CLOSE_UNCERTAIN'].includes(report.stop.code));
  const signed = homeFixture(true), ownSdk = syntheticSdk(signed), serialized = [], original = JSON.stringify; let encodedClock = 0, crossed = false;
  JSON.stringify = (...args) => { const bytes = original(...args); if (!crossed && args[0]?.schema === 'canli.paper-journal.example-receipt.v1') { crossed = true; encodedClock = 30001; } return bytes; };
  try {
    const stopped = await adapter.paperJournalCommand(['--home', signed.home, '--write'], { now: () => encodedClock, sdkModules: ownSdk.modules, emit: bytes => serialized.push(bytes) });
    assert.equal(crossed, true); assert.equal(stopped.stop.code, 'DEADLINE'); assert.equal(stopped.status, 'stopped');
    assert.equal(stopped.receipts.length, 6); assert.equal(stopped.requests.length, 6); assert.equal(ownSdk.counts.calls, 11);
    assert.equal(serialized.length, 1); assert.equal(JSON.parse(serialized[0]).status, 'stopped'); assert.ok(Buffer.byteLength(serialized[0]) <= 196609);
  } finally { JSON.stringify = original; }
});
test('paper package: malformed reply text schema and singleton-array hashes stop before followup', async () => {
  for (const mutate of [reply => ({ ...reply, content: [{ type: 'text', text: '{}' }] }), reply => ({ ...reply, structuredContent: [] }),
    reply => { const data = structuredClone(reply.structuredContent); data.limits_digest = [data.limits_digest]; return envelope(data); }]) {
    const f = homeFixture(), report = await adapter.runPaperJournal({ write: true, callTool: async request => mutate(await f.callTool(request)) });
    assert.equal(report.status, 'stopped'); assert.equal(report.call_count, 1); assert.equal(report.requests.length, 0); assert.equal(report.pending_request, null);
  }
});
test('paper package: primitive receipt hash mismatch preserves original pending initialize before decision', async () => {
  const f = homeFixture(true), report = await adapter.runPaperJournal({ write: true, callTool: async request => {
    const reply = await f.callTool(request); if (request.arguments.action !== 'initialize') return reply; const data = structuredClone(reply.structuredContent); data.entry_head = [data.entry_head]; return envelope(data);
  } }); assert.equal(report.stop.code, 'MALFORMED_RECEIPT'); assert.equal(report.call_count, 4); assert.equal(report.receipts.length, 0); assert.equal(report.requests.length, 1); assert.equal(report.pending_request.dispatched, true);
  assert.equal(report.pending_request.request.operation_id, 'synthetic-paper-v1:initialize'); assert.equal(f.requests.length, 4);
});
test('paper package: rehashed unsigned companion notional and turnover tamper retains pending export', async () => {
  const f = homeFixture(true), report = await adapter.runPaperJournal({ write: true, callTool: async request => {
    const reply = await f.callTool(request); if (request.arguments.action !== 'export') return reply; const data = structuredClone(reply.structuredContent);
    data.metrics.traded_notional_usd += 1000; data.series[0].turnover = data.metrics.traded_notional_usd / data.metrics.opening_equity;
    const bundle = Object.fromEntries(['record', 'journal_sha256', 'head', 'entry_range', 'metrics', 'series', 'journal_public_key', 'signature'].map(k => [k, data[k]]));
    const raw = Buffer.from(JSON.stringify(bundle) + '\n'); data.artifact_bytes = raw.length; data.artifact_sha256 = 'sha256:' + sha(raw); return envelope(data);
  } }); assert.equal(report.stop.code, 'MALFORMED_EXPORT'); assert.equal(report.receipts.length, 6); assert.equal(report.call_count, 11); assert.equal(report.pending_export.dispatched, true); assert.equal(report.export, null);
});
test('paper package: missing fee unknown and immutable synthetic null claims remain source equivalent', async () => {
  const f = homeFixture(), scenario = structuredClone(adapter.SYNTHETIC_SCENARIO); delete scenario.fill.fee;
  const report = await adapter.runPaperJournal({ write: true, scenario, callTool: f.callTool }); assert.equal(report.stop.code, 'MISSING_FEE'); assert.equal(report.call_count, 2); assert.ok(report.unknowns.includes('supplied fill fee')); assert.equal(report.export, null);
  assert.equal(fs.existsSync(path.join(f.home, 'journal.jsonl')), false); assert.ok(Object.isFrozen(adapter.SYNTHETIC_SCENARIO));
});
test('paper package: call bound and cancellation retain unsent or dispatched work without retry', async () => {
  const f = homeFixture(true), report = await adapter.runPaperJournal({ write: true, callTool: f.callTool, maxCalls: 3 });
  assert.equal(report.stop.code, 'CALL_LIMIT'); assert.equal(report.call_count, 3); assert.equal(report.pending_request.dispatched, false); assert.equal(report.requests.length, 1); assert.equal(f.requests.length, 3);
  const abort = new AbortController(), other = homeFixture(true), cancelled = await adapter.runPaperJournal({ write: true, signal: abort.signal, callTool: async request => {
    if (request.arguments.action === 'initialize') { abort.abort(); return new Promise(() => {}); } return other.callTool(request);
  } }); assert.equal(cancelled.stop.code, 'CANCELLED'); assert.equal(cancelled.pending_request.dispatched, true); assert.equal(cancelled.call_count, 4);
});
test('paper package: existing journal and typed persistence ambiguity never retry erase or echo', async () => {
  const f = homeFixture(true), first = await adapter.runPaperJournal({ write: true, callTool: f.callTool }); assert.equal(first.status, 'completed');
  const original = snapshot(path.join(f.home, 'journal.jsonl'), 65536), second = await adapter.runPaperJournal({ write: true, callTool: f.callTool }); assert.equal(second.stop.code, 'EXISTING_JOURNAL'); assert.equal(second.call_count, 3); assert.deepEqual(snapshot(path.join(f.home, 'journal.jsonl'), 65536), original);
  const other = homeFixture(), uncertain = await adapter.runPaperJournal({ write: true, callTool: request => request.arguments.action === 'initialize' ?
    { ...envelope({ error: { code: 'JOURNAL_STORE_UNCERTAIN', message: 'PRIVATE_DIAGNOSTIC', journal_persistence_attempted: true } }), isError: true } : other.callTool(request) });
  assert.equal(uncertain.stop.journal_persistence_attempted, true); assert.equal(uncertain.call_count, 4); assert.equal(uncertain.pending_request.dispatched, true); assert.doesNotMatch(JSON.stringify(uncertain), /PRIVATE_DIAGNOSTIC/);
  const bounded = await injected({ ...other, callTool: request => request.arguments.action === 'initialize' ?
    { ...envelope({ error: { code: 'JOURNAL_STORE_UNCERTAIN', journal_persistence_attempted: true } }), isError: true } : other.callTool(request) }, { write: true });
  assert.equal(bounded.report.stop.journal_persistence_attempted, true); assert.equal(bounded.report.pending_request.dispatched, true); assert.equal(bounded.sdk.counts.calls, 4);
});
test('paper package: oversized retained replies reserve complete bounded controls and pending export', async () => {
  const f = homeFixture(true), report = await adapter.runPaperJournal({ write: true, callTool: async request => {
    const reply = await f.callTool(request); if (request.arguments.action !== 'export') return reply;
    return { ...reply, large: 'x'.repeat(131073) };
  } }); assert.equal(report.status, 'stopped'); assert.equal(report.call_count, 11); assert.equal(report.receipts.length, 6); assert.equal(report.requests.length, 6); assert.equal(report.pending_export.dispatched, true);
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= adapter.PAPER_LIMITS.outputBytes); assert.ok(Object.isFrozen(report.pending_export));
});
test('paper package: caller and owned process cancellation share one scope without a followup write', async () => {
  for (const mode of ['default-SIGINT', 'default-SIGTERM', 'explicit-SIGINT', 'explicit-SIGTERM', 'caller-abort']) {
    const before = new Map(['SIGINT', 'SIGTERM'].map(name => [name, process.listeners(name)]));
    const external = new AbortController(), f = homeFixture(true); let cancelled = false;
    const sdk = syntheticSdk({ ...f, callTool: request => {
      if (request.arguments.action !== 'initialize') return f.callTool(request);
      cancelled = true;
      if (mode === 'caller-abort') external.abort();
      else {
        const name = mode.endsWith('SIGINT') ? 'SIGINT' : 'SIGTERM';
        const owned = process.listeners(name).filter(listener => !before.get(name).includes(listener));
        assert.equal(owned.length, 1); owned[0](); // invoke only this command's listener, never an OS signal
      }
      return new Promise(() => {});
    } });
    const frames = [], result = await adapter.paperJournalCommand(['--home', f.home, '--write'],
      { now: () => 0, sdkModules: sdk.modules, emit: frame => frames.push(frame),
        ...(mode.startsWith('default-') ? {} : { signal: external.signal }) });
    assert.equal(cancelled, true); assert.equal(result.stop.code, 'CANCELLED'); assert.equal(result.status, 'stopped');
    assert.equal(result.call_count, 4); assert.equal(result.requests.length, 1); assert.equal(result.receipts.length, 0);
    assert.equal(result.pending_request.request.operation_id, 'synthetic-paper-v1:initialize'); assert.equal(result.pending_request.dispatched, true);
    assert.equal(sdk.counts.calls, 4); assert.equal(sdk.counts.writes, 5); assert.equal(sdk.counts.clientClose, 1); assert.equal(sdk.counts.transportClose, 1);
    assert.equal(frames.length, 1); assert.equal(JSON.parse(frames[0]).pending_request.request.operation_id, result.pending_request.request.operation_id);
    assert.equal(external.signal.aborted, mode === 'caller-abort');
    for (const name of before.keys()) assert.deepEqual(process.listeners(name), before.get(name));
  }
  const external = new AbortController(), f = homeFixture(), sdk = syntheticSdk(f), frames = [];
  const result = await adapter.paperJournalCommand(['--home', f.home], { signal: external.signal, now: () => 0,
    sdkModules: sdk.modules, emit: frame => frames.push(frame) });
  assert.equal(result.status, 'writes_disabled'); assert.equal(external.signal.aborted, false); assert.equal(sdk.counts.calls, 2); assert.equal(frames.length, 1);
});
test('paper package: direct return reobserves deadline and abort after full final report capture', async () => {
  const original = JSON.stringify;
  for (const mode of ['positive', 'deadline', 'abort']) {
    const f = homeFixture(true), sdk = syntheticSdk(f), external = new AbortController(); let clock = 0, crossed = false;
    JSON.stringify = (...args) => {
      const bytes = original(...args);
      if (!crossed && args[0] === 'canli.paper-journal.example-receipt.v1' && sdk.counts.transportClose === 1) {
        crossed = true; if (mode === 'deadline') clock = 30001; if (mode === 'abort') external.abort();
      }
      return bytes;
    };
    try {
      const result = await adapter.runPaperJournalStdio({ home: f.home, write: true, sdkModules: sdk.modules, signal: external.signal, now: () => clock });
      assert.equal(crossed, true); assert.equal(result.status, mode === 'positive' ? 'completed' : 'stopped');
      assert.equal(result.stop?.code ?? null, mode === 'positive' ? null : mode === 'deadline' ? 'DEADLINE' : 'CANCELLED');
      assert.equal(result.receipts.length, 6); assert.equal(result.requests.length, 6); assert.equal(result.call_count, 11);
      assert.equal(result.export.record.identity.name, 'synthetic-paper-example'); assert.equal(result.pending_export, null);
      assert.equal(sdk.counts.calls, 11); assert.equal(sdk.counts.writes, 12); assert.equal(sdk.counts.clientClose, 1); assert.equal(sdk.counts.transportClose, 1);
      assert.ok(Object.isFrozen(result.receipts)); assert.ok(Buffer.byteLength(original(result)) <= 196608);
    } finally { JSON.stringify = original; }
  }
});
test('paper package: direct final capture clock faults retain complete receipts and sticky pending export', async () => {
  const original = JSON.stringify;
  for (const mode of ['throw', 'nonfinite', 'backward', 'pending-export']) {
    const f = homeFixture(true), sdk = syntheticSdk({ ...f, callTool: async request => {
      const reply = await f.callTool(request);
      if (mode !== 'pending-export' || request.arguments.action !== 'export') return reply;
      const data = structuredClone(reply.structuredContent); data.metrics.closing_equity += 1; return envelope(data);
    } }); let crossed = false;
    JSON.stringify = (...args) => { const bytes = original(...args);
      if (args[0] === 'canli.paper-journal.example-receipt.v1' && sdk.counts.transportClose === 1) crossed = true; return bytes; };
    try {
      const result = await adapter.runPaperJournalStdio({ home: f.home, write: true, sdkModules: sdk.modules,
        now: () => { if (!crossed) return 10; if (mode === 'nonfinite') return NaN; if (mode === 'backward') return 9; throw new Error('PRIVATE_DIAGNOSTIC'); } });
      assert.equal(crossed, true); assert.equal(result.status, 'stopped');
      assert.equal(result.stop.code, mode === 'pending-export' ? 'MALFORMED_EXPORT' : 'CLOCK');
      assert.equal(result.receipts.length, 6); assert.equal(result.requests.length, 6); assert.equal(result.call_count, 11);
      assert.equal(result.pending_export?.dispatched ?? null, mode === 'pending-export' ? true : null);
      if (mode === 'pending-export') assert.equal(result.pending_export.request.action, 'export');
      assert.equal(sdk.counts.calls, 11); assert.equal(sdk.counts.clientClose, 1); assert.equal(sdk.counts.transportClose, 1);
      assert.doesNotMatch(original(result), /PRIVATE_DIAGNOSTIC/); assert.ok(Buffer.byteLength(original(result)) <= 196608);
    } finally { JSON.stringify = original; }
  }
});
test('paper package: terminal postencoding clock faults emit one full stopped report with pending controls', async () => {
  const original = JSON.stringify;
  for (const mode of ['throw', 'nonfinite', 'backward', 'pending-export']) {
    const f = homeFixture(true), sdk = syntheticSdk({ ...f, callTool: async request => {
      const reply = await f.callTool(request);
      if (mode !== 'pending-export' || request.arguments.action !== 'export') return reply;
      const data = structuredClone(reply.structuredContent); data.metrics.closing_equity += 1; return envelope(data);
    } }); let encoded = false; const frames = [];
    JSON.stringify = (...args) => { const bytes = original(...args);
      if (args[0]?.schema === 'canli.paper-journal.example-receipt.v1') encoded = true; return bytes; };
    try {
      const result = await adapter.paperJournalCommand(['--home', f.home, '--write'], { sdkModules: sdk.modules,
        emit: frame => frames.push(frame), now: () => { if (!encoded) return 10; if (mode === 'nonfinite') return NaN;
          if (mode === 'backward') return 9; throw new Error('PRIVATE_DIAGNOSTIC'); } });
      assert.equal(encoded, true); assert.equal(result.status, 'stopped'); assert.equal(result.stop.code, mode === 'pending-export' ? 'MALFORMED_EXPORT' : 'CLOCK');
      assert.equal(result.receipts.length, 6); assert.equal(result.requests.length, 6); assert.equal(result.call_count, 11);
      assert.equal(result.pending_export?.dispatched ?? null, mode === 'pending-export' ? true : null);
      assert.equal(frames.length, 1); assert.equal(frames[0], original(result) + '\n');
      assert.ok(Buffer.byteLength(frames[0]) <= 196609); assert.doesNotMatch(frames[0], /PRIVATE_DIAGNOSTIC/);
      assert.equal(sdk.counts.calls, 11); assert.equal(sdk.counts.writes, 12); assert.equal(sdk.counts.clientClose, 1); assert.equal(sdk.counts.transportClose, 1);
    } finally { JSON.stringify = original; }
  }
});
