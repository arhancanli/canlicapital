import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path, { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import cp from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { TextDecoder } from 'node:util';
let prepareExpertIntake, EXPERT_INTAKE_LIMITS, packetContent, contract, workflow, canonicalJson, contentHash;

// Synthetic supplied bytes only. ONE future offline pack and at most THREE future SDK child entries.
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const L = Object.freeze({ compressed: 262144, expanded: 2097152, members: 32, npmOutput: 65536,
  packMs: 20000, commandMs: 10000, closeMs: 2500, stdout: 4096, stderr: 8192, fixture: 32 * 1024 * 1024 });
const LIMITS = Object.freeze({
  gold: 524288, intake: 65536, evidenceInventory: 32768, intakeSettings: 4096,
  evidence: 32768, evidenceTotal: 262144, evidenceCount: 64, inputCount: 68,
  inputTotal: 786432, report: 2097152, reportFile: 2097153,
  path: 4096, argvCount: 140, argvBytes: 524288, stdout: 4096, stderr: 1024,
});
const bytes = value => Buffer.from(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const sha = hash;
const clone = value => JSON.parse(JSON.stringify(value));
const choices = { question_clear: ['yes', 'no'], answer_matches_filing: ['yes', 'no', 'cannot_find'], citation_correct: ['yes', 'no'] };
let TMP, packed, main, writeTerminal, restore = () => {}, suppliedFixtureBytes = 0, commandEntries = 0, packEntries = 0, denied = 0;
const nativeSpawn = cp.spawn.bind(cp);
const nativeDiagnosticWrite = fs.writeSync.bind(fs);
const closures = [];
const SOURCE_PINS = Object.freeze({
  'src/expert-intake-stdio.mjs': '1cde7375eb1e63b381d9343373e55351b5efca4db27cb24e2e91a98e8515f0ae',"src/expert-intake-files.mjs": "68db164a80b8a37b8ed4ea9e3d4ffa0a42b43f8f6fcc28a91f7b97e702411a1f", "src/expert-submission-client.mjs": "2f6935f53821dcfee2a7cbae51e927672fb26c49c73353fc515ecb1096cceb31", "src/audit-inputs-client.mjs": "95fe942b1278768b4c938d82054d2d472eb3411c5587bdd8be4067b1dc0bc9b7", "src/audit-inputs-core.mjs": "e612ba0e44d12fd275b3e1dc0a2331bfe6fb005b4da8075e46ae009c5e299059", "src/audit-inputs-stdio.mjs": "537673fc03d0954ae480b239b8b481d11e14d763f1d0c07a985bb7d8fbd5b5c0", "src/canonical-json.mjs": "881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b", "src/expert-agreement.mjs": "80732bf61e1cef9bd3ff06cf831307675546f4789f8336f1668d5fd637a7b4ef", "src/expert-intake-core.mjs": "5095379afe5ca5be2c2fc8dc2fac191025c454f87e135d036b307f84bb57d545", "src/expert-submission-audit-core.mjs": "4040abc8f142d77571117979b73790be5a7ddb9bbf8fe6eee2fcb686ea9099f3", "src/expert-submission-files.mjs": "a5ed0b30f5338d3ed560f7fbc7cbb0e78966a56da188b72a8515ab077c4ea22d", "src/expert-submission-stdio.mjs": "56075a5daaa61bffbace0551aefe1220c372854ddca295b6adddd62abef65208", "src/filing-facts-packet.mjs": "74f2b353c0bf48d6e409d25925a6d691cf105a6f50aafdf561efbbbe679023c8", "src/server.mjs": "fe4c1042da41f58f34d7852a6b93ef7af82c612fca2c33f5b6af5143393300e8"});
const BIN = Object.freeze({ 'canli-fundamentals-mcp': 'src/server.mjs', 'canli-fundamentals-audit': 'src/audit-inputs-stdio.mjs',
  'canli-expert-submission-audit': 'src/expert-submission-stdio.mjs', 'canli-fundamentals-audit-files': 'src/audit-inputs-client.mjs',
  'canli-expert-submission-files': 'src/expert-submission-files.mjs', 'canli-expert-submission-client': 'src/expert-submission-client.mjs', 'canli-expert-intake-files': 'src/expert-intake-files.mjs', 'canli-expert-intake-prepare': 'src/expert-intake-stdio.mjs' });
const FILES = Object.freeze(['src', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md', 'EXPERT_INTAKE_FILES.md', 'EXPERT_INTAKE_STDIO.md']);
const MEMBERS = Object.freeze(['LICENSE', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md', 'EXPERT_INTAKE_FILES.md', 'EXPERT_INTAKE_STDIO.md', 'package.json', ...Object.keys(SOURCE_PINS)].map(p => 'package/' + p).sort());
const MODES = Object.freeze(Object.fromEntries(MEMBERS.map(name => [name, Object.values(BIN).filter(p => p !== 'src/server.mjs').includes(name.slice(8)) ? 0o755 : 0o644])));
const absent = pid => { assert.ok(Number.isSafeInteger(pid) && pid > 1); try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } };
const bounded = (promise, ms) => { let timer; return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OWNED_BOUND')), ms); })]).finally(() => clearTimeout(timer)); };

function diagnosticNow(kind, record, write = nativeDiagnosticWrite,
  { now = () => performance.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)), signal } = {}) {
  const started = now(); let previous = started, offset = 0, attempts = 0, aborted = false;
  const observe = () => {
    const current = now();
    assert.ok(Number.isFinite(started) && Number.isFinite(current) && current >= previous, 'RAW_DIAGNOSTIC_CLOCK');
    previous = current; aborted ||= Boolean(signal?.aborted);
    assert.ok(!aborted && current - started <= 1000, 'RAW_DIAGNOSTIC_DEADLINE');
  };
  observe();
  const json = JSON.stringify(record);
  observe();
  assert.ok(Buffer.byteLength(json) <= 384 * 1024, 'RAW_DIAGNOSTIC_BOUND');
  assert.ok(['RAW', 'RAW_MODES', 'ADMITTED'].includes(kind));
  const frame = Buffer.from('# CANLI_EXPERT_INTAKE_STDIO_PACKAGE_' + kind + ' ' + json + '\n');
  observe(); assert.ok(frame.length <= 384 * 1024 + 512, 'RAW_DIAGNOSTIC_BOUND');
  const pump = () => {
    while (offset < frame.length) {
      observe(); assert.ok(++attempts <= 4096, 'RAW_DIAGNOSTIC_ATTEMPTS');
      let wrote;
      try { wrote = write(1, frame, offset, Math.min(65536, frame.length - offset)); }
      catch (error) {
        if (!['EAGAIN', 'EWOULDBLOCK'].includes(error?.code)) throw error;
        // Resume this SAME bounded frame/offset only; do not repeat bytes or pack/command admission.
        observe();
        return Promise.resolve(wait(1)).then(() => { observe(); return pump(); });
      }
      assert.ok(Number.isSafeInteger(wrote) && wrote > 0 && wrote <= Math.min(65536, frame.length - offset), 'RAW_DIAGNOSTIC_WRITE');
      offset += wrote; observe();
    }
    return frame.length;
  };
  return pump();
}

function installOwnedFileGuard(fs, fsp, path, own, deny, links = new Map(), pending = new Map()) {
  const changes = [], ownedFDs = new Set([1, 2]);
  const nativeLstat = fs.lstatSync.bind(fs), nativeRealpath = fs.realpathSync.bind(fs), nativeReadlink = fs.readlinkSync.bind(fs);
  const textPath = p => {
    if (Buffer.isBuffer(p)) {
      const raw = p;
      try { p = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(p); } catch { return undefined; }
      if (!Buffer.from(p, 'utf8').equals(raw)) return undefined;
    }
    return typeof p === 'string' ? path.resolve(p) : undefined;
  };
  const owned = p => typeof p === 'string' && (p === own || p.startsWith(own + path.sep));
  const inside = p => {
    let cursor = textPath(p); if (!owned(cursor)) return false;
    for (;;) {
      try { nativeLstat(cursor); }
      catch (error) {
        if (error.code !== 'ENOENT' || cursor === own) return false;
        cursor = path.dirname(cursor); continue;
      }
      // An existing dangling symlink refuses; only absent final components walk
      // upward. Resolving the nearest existing ancestor also fences other aliases.
      try { return owned(nativeRealpath(cursor)); } catch { return false; }
    }
  };
  const ownedLinkUnlink = p => {
    const resolved = textPath(p), target = links.get(resolved);
    if (target === undefined || !owned(resolved) || !inside(path.dirname(resolved))) return false;
    try { return nativeLstat(resolved).isSymbolicLink() && nativeReadlink(resolved) === target; } catch { return false; }
  };
  const set = (object, name, fn) => { changes.push([object, name, object[name]]); object[name] = fn; };
  const writable = f => typeof f === 'number' ? !!(f & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) : f !== undefined && !['r', 'rs'].includes(f);
  const double = new Set(['rename','renameSync','copyFile','copyFileSync','cp','cpSync','link','linkSync','symlink','symlinkSync']);
  for (const object of [fs, fsp]) for (const name of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','mkdtemp','mkdtempSync','rename','renameSync','rm','rmSync','unlink','unlinkSync','truncate','truncateSync','createWriteStream','copyFile','copyFileSync','cp','cpSync','symlink','symlinkSync','link','linkSync','chmod','chmodSync','chown','chownSync']) {
    const original = object[name]; if (!original) continue;
    set(object, name, (...args) => {
      const cacheLink = object === fs && name === 'symlinkSync' && args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string' && pending.get(args[1]) === args[0];
      const unlink = object === fs && name === 'unlinkSync' && args.length === 1 && ownedLinkUnlink(args[0]);
      if (cacheLink ? !inside(args[1]) : !unlink && (!inside(args[0]) || (double.has(name) && !inside(args[1])))) deny();
      // Consume before the one native creation; finally removal remains harmless.
      if (cacheLink) pending.delete(args[1]);
      const result = original(...args);
      if (cacheLink) links.set(args[1], args[0]);
      if (unlink) links.delete(textPath(args[0]));
      return result;
    });
  }
  for (const name of ['openSync','open']) { const original = fs[name]; set(fs, name, (p, f, ...rest) => {
    const writing = writable(f); if (writing && !inside(p)) deny();
    if (name === 'openSync') { const fd = original(p, f, ...rest); if (writing) ownedFDs.add(fd); return fd; }
    const callback = rest.pop(); return original(p, f, ...rest, (error, fd) => { if (!error && writing) ownedFDs.add(fd); callback(error, fd); });
  }); }
  const open = fsp.open; set(fsp, 'open', async (p, f, ...rest) => {
    const ownPath = inside(p); if (writable(f) && !ownPath) deny();
    const handle = await open(p, f, ...rest);
    if (!ownPath) for (const name of ['write','writev','writeFile','appendFile','truncate','chmod','chown']) if (typeof handle[name] === 'function') set(handle, name, deny);
    return handle;
  });
  for (const name of ['close','closeSync']) { const original = fs[name]; set(fs, name, (fd, ...rest) => { ownedFDs.delete(fd); return original(fd, ...rest); }); }
  for (const name of ['write','writeSync','writev','writevSync','ftruncate','ftruncateSync','fchmod','fchmodSync','fchown','fchownSync']) {
    const original = fs[name]; if (original) set(fs, name, (fd, ...rest) => { if (!ownedFDs.has(fd)) deny(); return original(fd, ...rest); });
  }
  return () => { for (const [object, name, original] of changes.reverse()) object[name] = original; };
}

function parentGuard() {
  const changes = [];
  const deny = () => { denied++; const error = new Error('NATIVE_DENIAL'); error.code = 'NATIVE_DENIAL'; throw error; };
  const set = (object, name, fn) => { changes.push([object, name, object[name]]); object[name] = fn; };
  set(globalThis, 'fetch', deny);
  for (const [object, names] of [[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],[tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]]) for (const name of names) set(object, name, deny);
  set(net.Socket.prototype, 'connect', deny); set(net.Server.prototype, 'listen', deny);
  for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) set(cp, name, deny);
  set(cp, 'spawn', (command, args, options) => {
    const permit = sdkPermit; sdkPermit = null;
    if (!permit || command !== permit.command || !Array.isArray(args) || args.length !== 0 ||
        options.shell !== false || options.cwd !== undefined || JSON.stringify(options.stdio) !== JSON.stringify(['pipe','pipe','pipe']) ||
        options.env.NODE_OPTIONS !== '--import=' + pathToFileURL(packed.guard).href || ++sdkChildren > 3) deny();
    return nativeSpawn(command, args, options);
  });
  const restoreFiles = installOwnedFileGuard(fs, fsp, path, TMP, deny, readOnlyCacheAliases, pendingReadOnlyCacheLinks);
  syncBuiltinESMExports();
  return () => { restoreFiles(); for (const [object, name, original] of changes.reverse()) object[name] = original; syncBuiltinESMExports(); };
}

function childGuard() { return `
import fs from 'node:fs'; import fsp from 'node:fs/promises'; import path from 'node:path'; import cp from 'node:child_process';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram'; import dns from 'node:dns'; import {syncBuiltinESMExports} from 'node:module';
const own=${JSON.stringify(TMP)};let count=0,controls=true;
const deny=()=>{count++;if(!controls)process.stderr.write('DENIED_OPERATION\\n');const e=new Error('NATIVE_DENIAL');e.code='NATIVE_DENIAL';throw e;};
globalThis.fetch=deny;
for(const[o,ns]of[[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],[tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]])for(const n of ns)o[n]=deny;
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;
for(const n of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[n]=deny;
${installOwnedFileGuard.toString()}
installOwnedFileGuard(fs,fsp,path,own,deny,new Map(${JSON.stringify([...readOnlyCacheAliases])}));
syncBuiltinESMExports();
for(const fn of[()=>fetch('https://invalid.invalid'),()=>fs.writeFileSync('/unallocated-intake-fixture','x'),()=>cp.spawn('unallocated',[])])try{fn();throw new Error('NOT_ARMED');}catch(e){if(e.code!=='NATIVE_DENIAL')throw e;}
if(count!==3)throw new Error('NOT_ARMED');controls=false;process.stderr.write('EXPERT_INTAKE_PREPARE_NATIVE_GUARD '+JSON.stringify({denied:3})+'\\n');
`; }

async function runProcess(command, args, { cwd, workMs, stdoutCap, stderrCap }) {
  const started = performance.now();
  const child = nativeSpawn(command, args, { cwd, shell: false, env: { PATH: process.env.PATH, CI: 'true', NODE_OPTIONS: '--import=' + pathToFileURL(packed?.guard ?? path.join(TMP,'guard.mjs')).href }, stdio: ['ignore','pipe','pipe'] });
  let stdout = '', stderr = '', failure;
  const terminal = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); }); terminal.catch(() => {});
  for (const [stream, cap, append] of [[child.stdout,stdoutCap,text=>{stdout+=text;}],[child.stderr,stderrCap,text=>{stderr+=text;}]]) {
    let seen = 0; stream.on('data', b => { seen += b.length; if (seen > cap) { failure ??= 'OUTPUT_BOUND'; child.kill('SIGKILL'); return; } append(b.toString('utf8')); });
  }
  const timer = setTimeout(() => { failure ??= 'WORK_BOUND'; child.kill('SIGKILL'); }, Math.max(1, workMs - (performance.now() - started)));
  let known = false;
  try {
    const end = await bounded(terminal, workMs + L.closeMs); const observed = performance.now() - started;
    assert.equal(failure, undefined); assert.ok(observed <= workMs, 'OBSERVED_FIXTURE_WORK');
    assert.equal(end.signal, null); assert.equal(absent(child.pid), true); known = true;
    assert.match(stderr, /^EXPERT_INTAKE_PREPARE_NATIVE_GUARD \{"denied":3\}\n/); assert.doesNotMatch(stderr, /DENIED_OPERATION|NOT_ARMED/);
    return { exitCode: end.code, stdout, stderr: stderr.replace(/^EXPERT_INTAKE_PREPARE_NATIVE_GUARD \{"denied":3\}\n/, '') };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await bounded(terminal, L.closeMs); }
    if (Number.isSafeInteger(child.pid) && child.pid > 1) { assert.equal(absent(child.pid), true); known = true; }
    closures.push({ pid: child.pid, known, absent: known, command });
  }
}
async function packOnce() {
  assert.equal(++packEntries, 1);
  const output = path.join(TMP,'pack'), cache = path.join(TMP,'cache'); fs.mkdirSync(output); fs.mkdirSync(cache);
  const user = path.join(TMP,'user.conf'), global = path.join(TMP,'global.conf');
  for (const p of [user,global]) fs.writeFileSync(p,'',{flag:'wx',mode:0o600});
  const args = ['pack','--offline','--ignore-scripts','--update-notifier=false','--audit=false','--fund=false','--json','--cache',cache,'--pack-destination',output,'--userconfig',user,'--globalconfig',global];
  const result = await runProcess('npm', args, { cwd: ROOT, workMs: L.packMs, stdoutCap: L.npmOutput - L.stderr, stderrCap: L.stderr });
  assert.equal(result.exitCode,0); assert.equal(result.stderr,''); const rows=JSON.parse(result.stdout);
  assert.equal(rows.length,1); assert.match(rows[0].filename,/^[A-Za-z0-9_.-]+\.tgz$/);
  const compressed=snapshot(path.join(output,rows[0].filename),L.compressed); assert.equal(compressed.length,rows[0].size);
  return { compressed, args };
}
function imports(entries) {
  let checked=0;
  for (const [name,row] of entries) {
    if (!/\.(?:js|mjs)$/.test(name)) continue; checked++;
    const source=new TextDecoder('utf-8',{fatal:true}).decode(row.bytes);
    const dynamic=[...source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)];
    if (name==='package/src/audit-inputs-client.mjs') { assert.equal(hash(row.bytes),SOURCE_PINS[name.slice(8)],'FIXED_SOURCE'); assert.deepEqual(dynamic.map(m=>m[2]),['@modelcontextprotocol/client','@modelcontextprotocol/client/stdio'],'FIXED_DYNAMIC'); }
    else if (name==='package/src/expert-submission-files.mjs') { assert.equal(hash(row.bytes),SOURCE_PINS[name.slice(8)],'FIXED_SOURCE'); assert.deepEqual(dynamic.map(m=>m[2]),['./expert-submission-audit-core.mjs'],'FIXED_DYNAMIC'); assert.ok(entries.has('package/src/expert-submission-audit-core.mjs'),'LOCAL_IMPORT'); }
    else if (name==='package/src/expert-submission-client.mjs') { assert.equal(hash(row.bytes),SOURCE_PINS[name.slice(8)],'FIXED_SOURCE'); assert.deepEqual(dynamic.map(m=>m[2]),['@modelcontextprotocol/client','@modelcontextprotocol/client/stdio','./expert-submission-stdio.mjs'],'FIXED_DYNAMIC'); assert.ok(entries.has('package/src/expert-submission-stdio.mjs'),'LOCAL_IMPORT'); }
    else if (name==='package/src/expert-intake-files.mjs') { assert.equal(hash(row.bytes),SOURCE_PINS[name.slice(8)],'FIXED_SOURCE'); assert.deepEqual(dynamic.map(m=>m[2]),['./expert-intake-core.mjs'],'FIXED_DYNAMIC'); assert.ok(entries.has('package/src/expert-intake-core.mjs'),'LOCAL_IMPORT'); }
    else assert.equal(dynamic.length,0,'DYNAMIC');
    assert.doesNotMatch(source.replace(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,'FIXED_IMPORT'),/\b(?:import\s*\(|require\s*\(|createRequire\b)/,'DYNAMIC');
    assert.doesNotMatch(source,/^export\s+(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\b/gm,'REEXPORT');
    const statics=[...source.matchAll(/^import .+ from ['"]([^'"]+)['"];$/gm)];
    assert.equal(statics.length,[...source.matchAll(/^import\b/gm)].length,'UNPARSED_IMPORT');
    for (const [,specifier] of statics) {
      if (specifier.startsWith('.')) { const target=path.posix.normalize(path.posix.join(path.posix.dirname(name),specifier)); assert.ok(target.startsWith('package/src/')&&entries.has(target),'LOCAL_IMPORT'); }
      else assert.ok(specifier.startsWith('node:')||['@modelcontextprotocol/server','@modelcontextprotocol/server/stdio','zod'].includes(specifier),'EXTERNAL_IMPORT');
    }
  }
  return checked;
}
let expectedBytes;
function admit(entries) {
  assert.deepEqual([...entries.keys()].sort(),MEMBERS,'MEMBERS'); assert.equal(imports(entries),14,'JS_COUNT');
  for(const[name,row]of entries) { assert.equal(row.mode,MODES[name],'MODE'); if(SOURCE_PINS[name.slice(8)])assert.equal(hash(row.bytes),SOURCE_PINS[name.slice(8)],'SOURCE'); assert.deepEqual(row.bytes,expectedBytes.get(name),'FROZEN_BYTES'); }
  const metadata=JSON.parse(entries.get('package/package.json').bytes);
  assert.deepEqual(metadata.bin,BIN,'BIN'); assert.deepEqual(metadata.files,FILES,'FILES');
  assert.equal(metadata.name,'canli-fundamentals-mcp'); assert.equal(metadata.version,'0.5.0'); assert.equal(metadata.private,false);
  assert.deepEqual(metadata.dependencies,{'@modelcontextprotocol/server':'2.3.1',zod:'4.6.5','@modelcontextprotocol/client':'2.3.1'});
  return metadata;
}
function marked(guide,label) {
  const begin=`<!-- EXPERT_INTAKE_STDIO_${label}_BEGIN -->`,end=`<!-- EXPERT_INTAKE_STDIO_${label}_END -->`;
  assert.equal(guide.split(begin).length,2); assert.equal(guide.split(end).length,2);
  const block=guide.split(begin)[1].split(end)[0].trim(); assert.match(block,/^```json\n[\s\S]+\n```$/);
  const raw=Buffer.from(block.slice(8,-4)+'\n'); JSON.parse(raw); return raw;
}
function guideScenario(guide) {
  const rawDocuments = { gold: marked(guide,'GOLD'), intake: marked(guide,'INTAKE'),
    evidenceInventory: marked(guide,'EVIDENCE_INVENTORY'), intakeSettings: marked(guide,'INTAKE_SETTINGS') };
  const gold=JSON.parse(rawDocuments.gold), intake=JSON.parse(rawDocuments.intake), evidenceInventory=JSON.parse(rawDocuments.evidenceInventory), intakeSettings=JSON.parse(rawDocuments.intakeSettings);
  return { rawDocuments, rawGold: rawDocuments.gold, gold, intake, evidenceInventory, intakeSettings, evidence: [] };
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

function scenario({ evidence = 0 } = {}) {
  const s=guideScenario(packed.guide); delete s.rawDocuments;
  for(let index=0;index<evidence;index++) {
    const raw=Buffer.from([255,0,128,index%256]); s.evidence.push(raw);
    s.evidenceInventory.evidence.push({id:`fixture-${index}`,packet_sha256:s.intakeSettings.packet_sha256,purpose:'identity',
      subject:{role:'reviewer_a',handle:s.intake.roles[0].handle},expected_sha256:hash(raw),expected_bytes:raw.length});
  }
  return s;
}
function coreArgs(s) { return [s.rawGold,hash(s.rawGold),s.rawDocuments?.intake??bytes(s.intake),
  s.rawDocuments?.evidenceInventory??bytes(s.evidenceInventory),s.evidence,s.rawDocuments?.intakeSettings??bytes(s.intakeSettings)]; }
function checksum(header) { header.fill(32, 148, 156); header.write(header.reduce((n, b) => n + b, 0).toString(8).padStart(6, '0') + '\0 ', 148, 'ascii'); return header; }
function tinyTar(rows, mutate = () => {}) {
  const chunks = [];
  rows.forEach((row, index) => { const header = Buffer.alloc(512); header.write(row.name, 0, 'ascii'); header.write('0000644\0', 100, 'ascii');
    header.write(row.bytes.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii'); header[156] = 48;
    mutate(header, index); checksum(header); chunks.push(header, row.bytes, Buffer.alloc((512 - row.bytes.length % 512) % 512)); });
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]), { mtime: 0 });
}



const readOnlyCacheAliases = new Map(), pendingReadOnlyCacheLinks = new Map(), dependencyLinks = [];
let sdkPermit = null, sdkChildren = 0;
const SDK_SOURCE_PINS = Object.freeze({
  "@modelcontextprotocol/client/package.json": "4a886cbee0d611f822618e4ee94ae4589655c282fa0dbafc17e80da9697f2d91",
  "@modelcontextprotocol/client/dist/stdio.mjs": "af887c8972a37b8c3fcc78192d8f1d56c099bf8ca365f4843ec51ced6f5650da",
  "@modelcontextprotocol/client/dist/src-WCy6ifGf.mjs": "689dad5b2e36e44b937841f8ffdf3e402efeac43ce4d398aa5a87731a64eb36d",
  "@modelcontextprotocol/server/package.json": "66d43886157bb694672d5e24a590dc543ff44a482e0ec86fd78d437a2d5e0451",
  "@modelcontextprotocol/server/dist/stdio.mjs": "43a68ba2ed4569e6b35d436a7dd94ab32a31d49d6c00df8337e244f8b0a4f956",
  "@modelcontextprotocol/server/dist/mcp-DIH4cS6P.mjs": "2657fbeaebe76ef461e8d0860308da4c3404d2d3b6b1f06960b8ffc578fec1b4",
  "@modelcontextprotocol/server/dist/src-Cqbh3MYc.mjs": "bc81a674f25546e2a631a5f3c9cb1829654bbfcdd40cb89823aab5fb719211e5",
  "@modelcontextprotocol/core/package.json": "2d367771e2f50a8bda7d7d30bfe2e912739e0e0b9b89329fcb83d53b9848fc4b",
  "@modelcontextprotocol/client/dist/index.mjs": "8b370b8009c7b64834cc91bf5e6ab28e524d7c2ce952dfe57d943a6926f8d54b",
  "@modelcontextprotocol/server/dist/index.mjs": "60fca0c96c38d4e64df281ae22d85b3f9edf43306cc857c390054a5e4c3cf2fb",
  "zod/package.json": "a046ed85fa09571dba539fee9ef236152d12dabd1f229b014ec3bd2ebaad9000",
  "zod/v4/core/schemas.js": "e632b655441418f0593153abc6809fd81cf3e0782d810622d0a4fa50ef6e182e"
});
function unlinkOwnedDependencyLinks() {
  for (const row of dependencyLinks.reverse()) {
    const current = fs.lstatSync(row.path);
    assert.ok(current.isSymbolicLink()); assert.equal(current.dev,row.dev); assert.equal(current.ino,row.ino);
    assert.equal(fs.readlinkSync(row.path),row.target); fs.unlinkSync(row.path);
  }
  dependencyLinks.length = 0;
}
function cleanupOwnedFixture({
  unlink = unlinkOwnedDependencyLinks,
  restoreGuard = () => { restore(); restore=()=>{}; },
  remove = () => { if (TMP) fs.rmSync(TMP,{recursive:true,force:true}); },
} = {}) {
  // The SAME finally path is used after a refused hook and by native controls.
  // Unlink admitted aliases THROUGH the armed fence BEFORE recursing into TMP.
  try { unlink(); }
  finally { try { restoreGuard(); } finally { remove(); } }
}
function workflowSource(guide) {
  const begin='<!-- EXPERT_INTAKE_STDIO_WORKFLOW_BEGIN -->',end='<!-- EXPERT_INTAKE_STDIO_WORKFLOW_END -->';
  assert.equal(guide.split(begin).length,2); assert.equal(guide.split(end).length,2);
  const block=guide.split(begin)[1].split(end)[0].trim(); assert.match(block,/^```js\n[\s\S]+\n```$/);
  return block.slice(6,-4)+'\n';
}
before(async t => {
  TMP=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'canli-expert-intake-prepare-'));fs.chmodSync(TMP,0o700);
  let completed=false;
  try {
    expectedBytes=new Map(MEMBERS.map(name=>[name,snapshot(path.join(ROOT,name.slice(8)),L.expanded)]));
    const guard=path.join(TMP,'guard.mjs');fs.writeFileSync(guard,childGuard(),{flag:'wx',mode:0o600});
    restore=parentGuard();
    const artifact=await packOnce();
    const raw={admission:'RAW_CAPTURED_NOT_ADMITTED',compressed_bytes:artifact.compressed.length,
      compressed_sha256:hash(artifact.compressed),original_gzip_base64:artifact.compressed.toString('base64')};
    await diagnosticNow('RAW',raw,nativeDiagnosticWrite,{signal:t.signal});
    const entries=tarEntries(artifact.compressed);
    await diagnosticNow('RAW_MODES',{compressed_sha256:raw.compressed_sha256,
      files:[...entries].map(([name,row])=>({path:name,mode:row.mode,bytes:row.bytes.length,sha256:hash(row.bytes)}))},nativeDiagnosticWrite,{signal:t.signal});
    const metadata=admit(entries),consumer=path.join(TMP,'consumer');fs.mkdirSync(consumer,{mode:0o700});
    const nodeModules=path.join(consumer,'node_modules');fs.mkdirSync(nodeModules);
    const root=path.join(nodeModules,metadata.name);fs.mkdirSync(root);
    let charged=0;
    for(const[name,row]of entries) {
      charged+=row.bytes.length;assert.ok(charged<=L.expanded);
      const p=path.join(root,name.slice(8));fs.mkdirSync(path.dirname(p),{recursive:true});
      fs.writeFileSync(p,row.bytes,{flag:'wx',mode:row.mode});fs.chmodSync(p,row.mode);
    }
    const binRoot=path.join(nodeModules,'.bin');fs.mkdirSync(binRoot);const bins=[];
    for(const[name,local]of Object.entries(BIN)) {
      const p=path.join(root,local);fs.symlinkSync(p,path.join(binRoot,name));
      if(name==='canli-fundamentals-mcp')fs.chmodSync(p,0o755);
      bins.push({name,raw_mode:entries.get('package/'+local).mode,fixture_mode:fs.statSync(p).mode&0o777,owned_fixture_only:true});
    }
    const lock=JSON.parse(snapshot(path.join(ROOT,'package-lock.json')));assert.equal(Object.keys(lock.packages).length,15);
    for(const[local,pin]of Object.entries(SDK_SOURCE_PINS))assert.equal(hash(snapshot(path.join(ROOT,'node_modules',local),512*1024)),pin,'LOCKED_SDK_SOURCE_PIN');
    fs.mkdirSync(path.join(root,'node_modules'));
    for(const[relative,entry]of Object.entries(lock.packages)) {
      if(!relative)continue;
      const target=fs.realpathSync(path.join(ROOT,relative)),link=path.join(root,relative);
      const external=JSON.parse(snapshot(path.join(target,'package.json')));assert.equal(external.version,entry.version);
      assert.ok(target.includes('node_modules'+path.sep));fs.mkdirSync(path.dirname(link),{recursive:true});
      pendingReadOnlyCacheLinks.set(link,target);
      try {fs.symlinkSync(target,link);} finally {pendingReadOnlyCacheLinks.delete(link);}
      const st=fs.lstatSync(link);dependencyLinks.push({path:link,target,dev:st.dev,ino:st.ino});
    }
    // Consumer bare SDK imports use explicit read-only links, not a production install.
    for(const name of ['@modelcontextprotocol/client','@modelcontextprotocol/core','zod']) {
      const target=fs.realpathSync(path.join(ROOT,'node_modules',name)),link=path.join(nodeModules,name);
      fs.mkdirSync(path.dirname(link),{recursive:true});pendingReadOnlyCacheLinks.set(link,target);
      try {fs.symlinkSync(target,link);} finally {pendingReadOnlyCacheLinks.delete(link);}
      const st=fs.lstatSync(link);dependencyLinks.push({path:link,target,dev:st.dev,ino:st.ino});
    }
    fs.writeFileSync(guard,childGuard(),{mode:0o600});
    for(const n of ['.git','scripts','js'])assert.equal(fs.existsSync(path.join(root,n)),false);
    contract=await import(pathToFileURL(path.join(root,'src/expert-intake-stdio.mjs')).href);
    ({prepareExpertIntake,EXPERT_INTAKE_LIMITS}=await import(pathToFileURL(path.join(root,'src/expert-intake-core.mjs')).href));
    ({packetContent}=await import(pathToFileURL(path.join(root,'src/filing-facts-packet.mjs')).href));
    ({canonicalJson,contentHash}=await import(pathToFileURL(path.join(root,'src/canonical-json.mjs')).href));
    const guide=entries.get('package/EXPERT_INTAKE_STDIO.md').bytes.toString('utf8'),s=guideScenario(guide);
    assert.equal(s.intakeSettings.packet_sha256,hash(packetContent(s.gold)));
    const workflowPath=path.join(consumer,'prepare-example.mjs');fs.writeFileSync(workflowPath,workflowSource(guide),{flag:'wx',mode:0o600});
    workflow=await import(pathToFileURL(workflowPath).href);
    assert.deepEqual(workflow.syntheticArguments,wireArguments(s),'GUIDE_RAW_BYTE_PARITY');
    packed={...artifact,raw,entries,metadata,root,consumer,guard,binRoot,bins,guide,s};
    await diagnosticNow('ADMITTED',{admission:'ADMITTED',compressed_sha256:raw.compressed_sha256,
      files:[...entries].map(([name,row])=>({path:name,mode:row.mode,bytes:row.bytes.length,sha256:hash(row.bytes)})),
      bins,dependency_cache_links:dependencyLinks.length,repository_runtime_links:0,actual_npm_install:false},nativeDiagnosticWrite,{signal:t.signal});
    completed=true;
  } finally { if(!completed)cleanupOwnedFixture(); }
},{timeout:30000});
after(()=>{
  try {cleanupOwnedFixture();} finally {assert.equal(packEntries,1);assert.ok(commandEntries<=3);assert.ok(sdkChildren<=3);}
  assert.ok(closures.every(row=>row.known&&row.absent));
});
const cloneEntries=()=>new Map([...packed.entries].map(([name,row])=>[name,{mode:row.mode,bytes:Buffer.from(row.bytes)}]));
function wireArguments(s=guideScenario(packed.guide)) {
  const args=coreArgs(s);
  return {gold_base64:args[0].toString('base64'),expected_gold_raw_sha256:args[1],intake_base64:args[2].toString('base64'),
    evidence_inventory_base64:args[3].toString('base64'),evidence_base64:args[4].map(b=>b.toString('base64')),intake_settings_base64:args[5].toString('base64')};
}
function coreReport(s=guideScenario(packed.guide)) { return prepareExpertIntake(...coreArgs(s)); }
function refusal(result,code) {
  assert.equal(result.isError,true);assert.equal(result.structuredContent,undefined);
  const raw=result.content[0].text;assert.ok(Buffer.byteLength(JSON.stringify(result))<=2048);
  const value=JSON.parse(raw);assert.equal(value.status,'refused');if(code)assert.equal(value.error.code,code);
  assert.doesNotMatch(raw,/PRIVATE_RAW_|PRIVATE_EXCEPTION|\/Users\/|node_modules/);return value;
}
function success(result,s=guideScenario(packed.guide)) {
  assert.equal(result.isError,undefined);assert.equal(result.content.length,1);
  assert.equal(JSON.stringify(result.structuredContent),result.content[0].text);
  assert.deepEqual(result.structuredContent,JSON.parse(JSON.stringify(coreReport(s))));return result.structuredContent;
}
class Output extends EventEmitter {
  constructor(writeResult=()=>true) {super();this.frames=[];this.writeResult=writeResult;}
  write(frame) {this.frames.push(Buffer.from(frame));return this.writeResult(frame);}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function waitFor(predicate) {for(let i=0;i<100&&!predicate();i++)await tick();assert.equal(Boolean(predicate()),true);}
async function memoryRequest(params,{rawRefused=false,endpointOptions={},project,method='tools/call',allowClose=false}={}) {
  const input=new PassThrough(),output=new Output(),stderr=new Output();let decoded=0,calls=0;
  const {server,transport}=contract.createExpertIntakeEndpoint({input,output,stderr,
    decode:text=>{decoded++;return Buffer.from(text,'base64');},kernel:(...args)=>{calls++;return prepareExpertIntake(...args);},...endpointOptions});
  if(project)server.projectCallToolResult=project;
  try {
    await server.connect(transport);
    input.write(Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'synthetic-memory',version:'0.0.0'}}})+'\n'));
    await waitFor(()=>output.frames.length===1);
    input.write(Buffer.from(JSON.stringify({jsonrpc:'2.0',id:2,method,params})+'\n'));
    if(rawRefused) {
      await waitFor(()=>transport.closing!==undefined);const first=transport.close();assert.equal(first,transport.close());await first;
      assert.equal(output.frames.length,1);assert.equal(decoded,0);assert.equal(calls,0);assert.equal(input.destroyed,true);
      assert.ok(stderr.frames.length>0);assert.doesNotMatch(Buffer.concat(stderr.frames).toString(),/PRIVATE_RAW_|PRIVATE_EXCEPTION/);
      return {decoded,calls,output,stderr,transport};
    }
    await waitFor(()=>output.frames.length===2||(allowClose&&transport.closing!==undefined));
    return {response:output.frames.length===2?JSON.parse(output.frames[1]):null,decoded,calls,output,stderr,transport};
  } finally {const first=transport.close();assert.equal(first,transport.close());await first;await server.close();input.destroy();}
}
function noDecode(value,code) {
  let decoded=0,called=0;const result=contract.executeExpertIntake(value,{decode:text=>{decoded++;return Buffer.from(text,'base64');},kernel:(...args)=>{called++;return prepareExpertIntake(...args);}});
  refusal(result,code);assert.equal(decoded,0);assert.equal(called,0);return result;
}
function rehash(report) {report.content_hash=contentHash(report,createHash);return report;}
async function actualSdkEntry(t,kind) {
  assert.ok(++commandEntries<=3);
  const command=kind==='alias'?path.join(packed.binRoot,'canli-expert-intake-prepare'):path.join(packed.root,'src/expert-intake-stdio.mjs');
  const args=kind==='refusal'?{...workflow.syntheticArguments,expected_gold_raw_sha256:'0'.repeat(64)}:workflow.syntheticArguments;
  assert.equal(sdkPermit,null);sdkPermit={command};
  try {
    const result=await workflow.prepareIntakeOnce(args,{command,env:{PATH:process.env.PATH,CI:'true',NODE_OPTIONS:'--import='+pathToFileURL(packed.guard).href},signal:t.signal});
    assert.equal(sdkPermit,null);assert.equal(result.closure.close_calls,1);assert.equal(result.closure.absent,true);
    assert.ok(result.closure.work_ms<=15000&&result.closure.close_ms<=5000&&result.closure.total_ms<=20000);
    assert.equal(result.request_methods.filter(m=>m==='initialize').length,1);assert.equal(result.request_methods.filter(m=>m==='tools/call').length,1);
    assert.equal(result.request_methods.some(m=>['tools/list','server/discover','ping'].includes(m)),false);
    assert.match(result.stderr,/^EXPERT_INTAKE_PREPARE_NATIVE_GUARD \{"denied":3\}\n/);assert.doesNotMatch(result.stderr,/DENIED_OPERATION|NOT_ARMED|PRIVATE_RAW_/);
    closures.push({pid:result.closure.pid,known:true,absent:true,command});
    if(kind==='refusal')refusal(result.outcome,'CORE_GOLD_RAW_SHA');else success(result.outcome);
    return result;
  } finally {sdkPermit=null;}
}

test('prepare intake package: one guarded offline artifact captures complete RAW before strict24 eight-bin admission', async () => {
  assert.equal(packEntries,1);assert.equal(packed.entries.size,24);assert.equal(Object.keys(packed.metadata.bin).length,8);
  assert.equal(packed.raw.admission,'RAW_CAPTURED_NOT_ADMITTED');assert.equal(packed.raw.compressed_sha256,hash(packed.compressed));
  assert.equal(packed.compressed.length,packed.raw.compressed_bytes);assert.deepEqual(Buffer.from(packed.raw.original_gzip_base64,'base64'),packed.compressed);
  const raw={admission:'RAW_CAPTURED_NOT_ADMITTED',original_gzip_base64:packed.raw.original_gzip_base64},chunks=[];let writes=0,time=0,waits=0;
  const writer=(_fd,b,o,n)=>{if(++writes===2){const error=new Error('RETRY');error.code='EAGAIN';throw error;}const size=Math.min(n,127);chunks.push(Buffer.from(b.subarray(o,o+size)));return size;};
  await assert.rejects(async()=>{await diagnosticNow('RAW',raw,writer,{now:()=>time,wait:async()=>{waits++;time++;}});throw new Error('LATER_HOOK_REFUSAL');},/LATER_HOOK_REFUSAL/);
  assert.equal(waits,1);assert.ok(writes<=4096);assert.equal(Buffer.concat(chunks).toString(),'# CANLI_EXPERT_INTAKE_STDIO_PACKAGE_RAW '+JSON.stringify(raw)+'\n');
  let effects=0,clock=0;assert.throws(()=>diagnosticNow('RAW',{toJSON(){clock=1001;return{};}},()=>{effects++;return 1;},{now:()=>clock}),/RAW_DIAGNOSTIC_DEADLINE/);assert.equal(effects,0);
  assert.throws(()=>diagnosticNow('RAW',{toJSON(){throw new Error('SERIALIZER');}},()=>{effects++;return 1;}),/SERIALIZER/);assert.equal(effects,0);
  assert.throws(()=>diagnosticNow('RAW',raw,()=>{effects++;return 1;},{signal:{aborted:true}}),/RAW_DIAGNOSTIC_DEADLINE/);assert.equal(effects,0);
  assert.throws(()=>diagnosticNow('RAW',raw,()=>{effects++;const e=new Error('EPIPE');e.code='EPIPE';throw e;}),/EPIPE/);assert.equal(effects,1);
});

test('prepare intake package: bounded gzip raw ASCII octal checksum unique paths and current source modes refuse before extraction', () => {
  const positive=tinyTar([{name:'package/a',bytes:Buffer.from('x')}]);assert.equal(tarEntries(positive).size,1);
  for(const offset of [0,100,124,156,345])assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.from('x')}],header=>{header[offset]|=128;})),/TAR_ASCII/);
  // The checksum field itself is excluded from the sum. Mutate it AFTER the
  // valid checksum is written; recomputing afterward would erase this fault.
  const checksumHighbit=Buffer.from(inflateRawSync(positive.subarray(10),{maxOutputLength:L.expanded}));
  checksumHighbit[148]|=128;
  assert.throws(()=>tarEntries(gzipSync(checksumHighbit,{mtime:0})),/TAR_ASCII/);
  for(const rows of [[{name:'package/../a',bytes:Buffer.from('x')}],[{name:'package/a',bytes:Buffer.from('x')},{name:'package/a',bytes:Buffer.from('x')}]])assert.throws(()=>tarEntries(tinyTar(rows)),/TAR_PATH|TAR_DUPLICATE/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.from('x')}],header=>{header[156]=50;})),/TAR_REGULAR/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.from('x')}],header=>{header[124]=57;})),/TAR_OCTAL/);
  for(const data of [Buffer.concat([positive,positive]),Buffer.concat([positive,Buffer.from('x')]),positive.subarray(0,positive.length-1)])assert.throws(()=>tarEntries(data));
  const damaged=Buffer.from(positive);damaged[damaged.length-8]^=1;assert.throws(()=>tarEntries(damaged),/GZIP_CRC/);
  const wrongMode=cloneEntries();wrongMode.get('package/src/expert-intake-stdio.mjs').mode=0o644;assert.throws(()=>admit(wrongMode),/MODE/);
  assert.equal(packed.entries.get('package/src/server.mjs').mode,0o644);assert.equal(packed.entries.get('package/src/expert-intake-stdio.mjs').mode,0o755);
});

test('prepare intake package: all14 JS-MJS literal imports close inside the artifact and metadata inverses preserve six old families', () => {
  assert.equal(imports(cloneEntries()),14);
  const positive=cloneEntries();positive.set('package/src/from-text.mjs',{mode:0o644,bytes:Buffer.from("export const description = 'from text';\n")});assert.equal(imports(positive),15);
  for(const source of ["import x from '../../foreign.mjs';\n","export * from './canonical-json.mjs';\n","const x = import(variable);\n","import x from './missing.mjs';\n"]) {
    const entries=cloneEntries();entries.set('package/src/new-fault.mjs',{mode:0o644,bytes:Buffer.from(source)});assert.throws(()=>imports(entries),/LOCAL_IMPORT|REEXPORT|DYNAMIC/);
  }
  const metadata=clone(packed.metadata);delete metadata.bin['canli-expert-intake-prepare'];metadata.files=metadata.files.filter(p=>p!=='EXPERT_INTAKE_STDIO.md');
  const original=JSON.parse(snapshot(path.join(ROOT,'package.json')));delete original.bin['canli-expert-intake-prepare'];original.files=original.files.filter(p=>p!=='EXPERT_INTAKE_STDIO.md');assert.deepEqual(metadata,original);
  const families={'audit-package.test.mjs':22,'expert-submission-package.test.mjs':30,'audit-inputs-client-package.test.mjs':38,'expert-submission-files-package.test.mjs':40,'expert-submission-client-package.test.mjs':40,'expert-intake-files-package.test.mjs':39};
  for(const[name,count]of Object.entries(families)){const text=snapshot(path.join(ROOT,'test',name)).toString();assert.equal([...text.matchAll(/^test\('/gm)].length,count);assert.ok(text.includes(SOURCE_PINS['src/expert-intake-stdio.mjs']));}
});

test('prepare intake package: parent and child guards deny network foreign writes cache-alias mutations and unregistered two-path operations', async () => {
  const marker=path.join(TMP,'guard-control');fs.writeFileSync(marker,'x',{flag:'wx'});const inside=path.join(TMP,'unused-control'),alias=dependencyLinks[0].path;
  const controls=[()=>fetch('https://invalid.invalid'),()=>cp.spawn('UNOWNED',[]),()=>fs.writeFileSync('/unowned-expert-intake-control','x'),()=>fs.renameSync(marker,'/unowned-destination'),()=>fs.copyFileSync('/unowned-source',inside),()=>fs.writeFileSync(path.join(alias,'foreign-mutation'),'x'),()=>fs.unlinkSync(alias+'/package.json'),()=>fs.symlinkSync('/unowned-target',inside),()=>fs.writeFileSync(Buffer.from([255]),'x'),()=>fs.writeFileSync(Buffer.from('\ufeff'+inside),'x')];
  for(const control of controls)assert.throws(control,/NATIVE_DENIAL/);assert.equal(snapshot(marker).toString(),'x');assert.equal(fs.existsSync(inside),false);
  const handle=await fsp.open(path.join(alias,'package.json'),'r');try {await assert.rejects(async()=>handle.writeFile('x'),/NATIVE_DENIAL/);}finally{await handle.close();}
  const child=childGuard();assert.ok(child.includes(installOwnedFileGuard.toString()));assert.ok(child.includes(JSON.stringify([...readOnlyCacheAliases])));
  assert.equal(pendingReadOnlyCacheLinks.size,0);assert.equal(dependencyLinks.length,17);
  const effects=[];
  const hook=()=>{try{throw new Error('HOOK_REFUSAL');}finally{cleanupOwnedFixture({unlink:()=>effects.push('unlink'),restoreGuard:()=>effects.push('restore'),remove:()=>effects.push('remove')});}};
  assert.throws(hook,/HOOK_REFUSAL/);assert.deepEqual(effects,['unlink','restore','remove']);
  effects.length=0;
  assert.throws(()=>cleanupOwnedFixture({unlink:()=>{effects.push('unlink');throw new Error('UNLINK_REFUSAL');},restoreGuard:()=>effects.push('restore'),remove:()=>effects.push('remove')}),/UNLINK_REFUSAL/);
  assert.deepEqual(effects,['unlink','restore','remove']);
});

test('prepare intake native: exact marked-guide raw inputs retain complete preparation full-N worklists blank packets and null outcomes', () => {
  const s=guideScenario(packed.guide);assert.equal(hash(s.rawGold),'b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb');
  for(const raw of Object.values(s.rawDocuments)){assert.equal(raw.at(-1),10);assert.equal(typeof JSON.parse(raw),'object');}
  const report=success(contract.executeExpertIntake(wireArguments(s)),s);assert.equal(report.coverage.selected_n,3);assert.equal(report.coverage.prepared_item_assignments,6);
  assert.equal(report.review_packets.length,2);assert.equal(report.adjudication.item_tasks.length,3);assert.ok(Object.values(report.established).every(value=>value===null));
  assert.equal(report.implementation.declared_module_sha256_verified,false);assert.equal(report.prepared_on_authenticated,false);assert.equal(report.content_hash,contentHash(report,createHash));
});

test('prepare intake native: original params2 arguments6 and own proto or unknown keys refuse before SDK projection', async () => {
  const args=wireArguments();
  for(const make of [()=>({...args,PRIVATE_RAW_UNKNOWN:'x'}),()=>Object.assign(JSON.parse('{"__proto__":"PRIVATE_RAW_PROTO"}'),args)])await memoryRequest({name:contract.INTAKE_TOOL.name,arguments:make()},{rawRefused:true});
  for(const make of [()=>({name:contract.INTAKE_TOOL.name,arguments:args,PRIVATE_RAW_OUTER:'x'}),()=>Object.assign(JSON.parse('{"__proto__":"PRIVATE_RAW_OUTER_PROTO"}'),{name:contract.INTAKE_TOOL.name,arguments:args})])await memoryRequest(make(),{rawRefused:true});
  const positive=await memoryRequest({name:contract.INTAKE_TOOL.name,arguments:args});assert.equal(positive.decoded,4);assert.equal(positive.calls,1);success(positive.response.result);
});

test('prepare intake native: non-record boxed accessor proxy and shared argument values cannot coerce or decode payloads', () => {
  for(const value of [null,[],new String('PRIVATE_RAW_VALUE'),new Proxy(wireArguments(),{}),Object.create({})])noDecode(value,'ARGUMENTS');
  let getters=0;const accessor=wireArguments();Object.defineProperty(accessor,'gold_base64',{enumerable:true,get(){getters++;return 'eA==';}});noDecode(accessor,'ARGUMENTS');assert.equal(getters,0);
  for(const value of [new String('eA=='),Buffer.from('eA=='),{toString(){getters++;return'eA==';}}])noDecode({...wireArguments(),gold_base64:value},'BASE64_TYPE');assert.equal(getters,0);
  let called=0;const result=contract.executeExpertIntake(wireArguments(),{decode:text=>Buffer.from(new SharedArrayBuffer(Buffer.from(text,'base64').length)),kernel:()=>{called++;}});refusal(result,'DECODE');assert.equal(called,0);
});

test('prepare intake native: canonical base64 alphabet padding bits and malformed scalar tokens refuse before decoding', () => {
  for(const token of ['AB==','ABC=','eA==\n','e A==','eA=','====','eA--','\ud800'])noDecode({...wireArguments(),intake_base64:token},'BASE64');
  let calls=0;const args={...wireArguments(),intake_base64:'eA=='};const captured=contract.captureIntakeArguments(args,{decode:text=>{calls++;return Buffer.from(text,'base64');}});assert.equal(captured.kernelArguments[2].toString(),'x');assert.equal(calls,4);
});

test('prepare intake native: each mandatory nonempty individual cap refuses with zero decoder kernel or output effects', () => {
  for(const[field,cap]of [['gold_base64',524288],['intake_base64',65536],['evidence_inventory_base64',32768],['intake_settings_base64',4096]]) {
    noDecode({...wireArguments(),[field]:''},'EMPTY_INPUT');noDecode({...wireArguments(),[field]:Buffer.alloc(cap+1).toString('base64')},'INPUT_BOUND');
    const captured=contract.captureIntakeArguments({...wireArguments(),[field]:Buffer.alloc(cap).toString('base64')});assert.ok(captured.totalBytes>=cap);
  }
});

test('prepare intake native: dense evidence count per-buffer group and all-input metadata bounds precede every payload decode', () => {
  noDecode({...wireArguments(),evidence_base64:Array(65).fill('eA==')},'COUNT_BOUND');noDecode({...wireArguments(),evidence_base64:[,'eA==']},'ARRAY');
  const withSymbol=['eA=='];withSymbol[Symbol('hidden')]='x';noDecode({...wireArguments(),evidence_base64:withSymbol},'ARRAY');
  noDecode({...wireArguments(),evidence_base64:[Buffer.alloc(32769).toString('base64')]},'INPUT_BOUND');
  noDecode({...wireArguments(),evidence_base64:Array(9).fill(Buffer.alloc(32768).toString('base64'))},'EVIDENCE_TOTAL_BOUND');
  const maximum={...wireArguments(),gold_base64:Buffer.alloc(524288).toString('base64'),intake_base64:Buffer.alloc(65536).toString('base64'),evidence_inventory_base64:Buffer.alloc(32768).toString('base64'),intake_settings_base64:Buffer.alloc(4096).toString('base64'),evidence_base64:Array(8).fill(Buffer.alloc(32768).toString('base64'))};
  noDecode(maximum,'TOTAL_INPUT_BOUND');maximum.evidence_base64=[Buffer.alloc(159744).toString('base64')];noDecode(maximum,'INPUT_BOUND');
  const evidence=Array(4).fill(Buffer.alloc(32768).toString('base64'));evidence.push(Buffer.alloc(28672).toString('base64'));
  const admitted=contract.captureIntakeArguments({...maximum,evidence_base64:evidence});assert.equal(admitted.totalBytes,786432);
});

test('prepare intake native: original admitted scalar capture cannot change after admission and preserves same native buffers', () => {
  const args=wireArguments(),original=clone(args),decoded=[];
  const captured=contract.captureIntakeArguments(args,{decode:text=>{if(!decoded.length){args.intake_base64='PRIVATE_RAW_MUTATION';args.evidence_base64.push('PRIVATE_RAW_MUTATION');}const b=Buffer.from(text,'base64');decoded.push(b);return b;}});
  assert.equal(decoded.length,4);assert.equal(captured.kernelArguments[2].toString('base64'),original.intake_base64);assert.equal(captured.kernelArguments[4].length,0);
  for(const[index,buffer]of [[0,decoded[0]],[2,decoded[1]],[3,decoded[2]],[5,decoded[3]]])assert.equal(captured.kernelArguments[index],buffer);
});

test('prepare intake native: primitive lowercase gold SHA and terminal-byte rules reject with untouched positive controls', () => {
  const original=wireArguments();for(const value of [null,[original.expected_gold_raw_sha256],new String(original.expected_gold_raw_sha256),original.expected_gold_raw_sha256.toUpperCase(),original.expected_gold_raw_sha256+'\n',original.expected_gold_raw_sha256+'\r'])noDecode({...original,expected_gold_raw_sha256:value},'EXPECTED_SHA');
  success(contract.executeExpertIntake(original));assert.equal(contract.INTAKE_TOOL_INPUT.safeParse({...original,expected_gold_raw_sha256:original.expected_gold_raw_sha256+'\n'}).success,false);
});

test('prepare intake native: gold raw hash and immutable packet mismatches refuse without input path or error echo', () => {
  refusal(contract.executeExpertIntake({...wireArguments(),expected_gold_raw_sha256:'0'.repeat(64)}),'CORE_GOLD_RAW_SHA');
  const s=scenario();s.intakeSettings.packet_sha256='0'.repeat(64);refusal(contract.executeExpertIntake(wireArguments(s)),'CORE_PACKET_SHA');
  refusal(contract.executeExpertIntake(wireArguments(),{kernel:()=>{throw new Error('PRIVATE_EXCEPTION /Users/secret');}}),'INTERNAL');
  success(contract.executeExpertIntake(wireArguments()));
});

test('prepare intake native: settings source identities role declarations and missing evidence never reduce selected N', () => {
  const s=scenario();s.intake.roles=[];s.intakeSettings.implementation_source_sha256='a'.repeat(64);
  const report=success(contract.executeExpertIntake(wireArguments(s)),s);assert.equal(report.coverage.selected_n,3);assert.equal(report.coverage.declared_roles_n,0);
  assert.deepEqual(report.coverage.missing_roles,['reviewer_a','reviewer_b','adjudicator']);assert.equal(report.implementation.declared_module_sha256,'a'.repeat(64));assert.equal(report.implementation.declared_module_sha256_verified,false);
  assert.equal(report.source_worklists.length,3);assert.ok(Object.values(report.established).every(v=>v===null));
});

test('prepare intake native: opaque evidence bytes order and exact source IDs stay unverified and fully bound', () => {
  const s=scenario({evidence:2});const report=success(contract.executeExpertIntake(wireArguments(s)),s);assert.equal(report.coverage.evidence_provided_n,2);
  for(const[index,row]of report.evidence_inventory.entries()){assert.equal(row.binding.original_base64,s.evidence[index].toString('base64'));assert.equal(row.binding.sha256,hash(s.evidence[index]));}
  for(const row of report.source_worklists)assert.ok(s.gold.labels.some(label=>label.filings.some(url=>hash(Buffer.from(url))===row.source_id)));
  const reversed={...s,evidence:[...s.evidence].reverse()};refusal(contract.executeExpertIntake(wireArguments(reversed)),'CORE_EVIDENCE_SHA');
});

test('prepare intake native: paired reviewer packets stay entirely blank and distinct adjudicator tasks retain every item source and role', () => {
  const report=success(contract.executeExpertIntake(wireArguments()));assert.equal(report.review_packets.length,2);
  for(const packet of report.review_packets)for(const label of packet.packet.labels)for(const field of ['question_clear','answer_matches_filing','citation_correct','notes'])assert.equal(label[field],'');
  assert.deepEqual(report.review_packets[0].packet.labels,report.review_packets[1].packet.labels);assert.notEqual(report.review_packets[0].declared_handle,report.review_packets[1].declared_handle);
  assert.equal(report.adjudication.blank_submission.decisions.length,0);assert.equal(report.adjudication.item_tasks.length,3);
  for(const task of report.adjudication.item_tasks){assert.deepEqual(task.required_review_roles,['reviewer_a','reviewer_b']);assert.equal(task.verified_submissions,null);assert.equal(task.source_ids.length,1);}
});

test('prepare intake native: malformed hash or incomplete preparation output refuses while the entire public positive survives', async () => {
  for(const mutate of [r=>{r.content_hash='sha256:'+'0'.repeat(64);},r=>{r.bindings.gold.sha256='0'.repeat(64);rehash(r);},r=>{r.review_packets.pop();rehash(r);},r=>{r.coverage.selected_n=2;rehash(r);},r=>{r.adjudication.blank_submission.decisions.push({});rehash(r);},r=>{delete r.established.verified_experts_n;rehash(r);}]) {
    const report=clone(coreReport());mutate(report);let calls=0;
    refusal(contract.executeExpertIntake(wireArguments(),{kernel:()=>{calls++;return report;}}));assert.equal(calls,1);
  }
  const supplied=scenario({evidence:5}),role=supplied.intake.roles[0],url=supplied.gold.labels[0].filings[0];
  const source={source_id:hash(Buffer.from(url)),url,claims:[]};supplied.intake.sources.push(source);
  role.identity_evidence_ids=['fixture-0','missing-identity'];role.independence_evidence_ids=['fixture-1'];
  role.qualifications=[{id:'qualification-1',kind:'engineering',title:'Synthetic credential',task_relevance:'Financial statement review',
    evidence_ids:['fixture-2'],verification:{who:'declared-verifier',date:'2026-10-05',method:'Supplied synthetic declaration',evidence_ids:['fixture-2']}}];
  role.conflicts=[{id:'conflict-1',description:'Supplied synthetic conflict',evidence_ids:['fixture-3']}];
  source.claims=[{id:'rights-1',declaration_text:'Supplied synthetic scope',allowed_uses:['human_review'],denied_uses:['training'],
    evidence_ids:['fixture-4','missing-rights'],verification:{who:'declared-verifier',date:'2026-10-05',method:'Supplied synthetic declaration',evidence_ids:['fixture-4']}}];
  for(const [index,purpose,subject] of [[1,'independence',{role:role.role,handle:role.handle}],
    [2,'qualification',{role:role.role,handle:role.handle,qualification_id:'qualification-1'}],
    [3,'conflict',{role:role.role,handle:role.handle,conflict_id:'conflict-1'}],
    [4,'source_rights',{source_id:source.source_id,url:source.url}]]) {
    Object.assign(supplied.evidenceInventory.evidence[index],{purpose,subject});
  }
  const tamper=[
    r=>{r.source_worklists=[];},r=>{r.source_worklists.reverse();},r=>{r.source_worklists[0].item_ids=['foreign-item'];},
    r=>{r.source_worklists[0].actual_rights_verified=true;},r=>{r.source_worklists[0].declaration_present=false;},
    r=>{r.source_worklists[0].mechanical_flags.missing_declared_evidence=false;},
    r=>{r.source_worklists[0].mechanical_flags.restricted_required_uses=['evaluation'];},
    r=>{r.source_worklists[0].claims[0].declaration.allowed_uses=['training'];},
    r=>{r.source_worklists[0].claims[0].evidence.missing_ids=[];},
    r=>{r.source_worklists[0].claims[0].declared_verification_evidence.provided=[];},
    r=>{delete r.role_worklists[0].tasks;},r=>{r.role_worklists[0].declaration.handle='foreign';},
    r=>{r.role_worklists[0].identity_evidence.provided[0].sha256='0'.repeat(64);},
    r=>{r.role_worklists[0].independence_evidence.declared_ids=[];},r=>{r.role_worklists[0].qualifications=[];},
    r=>{r.role_worklists[0].qualifications[0].declared_verification_evidence=null;},
    r=>{r.role_worklists[0].conflicts[0].declaration.description='foreign';},
    r=>{r.review_packets[0].declared_handle='foreign';},r=>{r.review_packets[0].packet.annotator='foreign';},
    r=>{r.review_packets[0].packet.labels.reverse();},r=>{r.review_packets[0].packet.labels[0].notes='filled';},
    r=>{r.adjudication.blank_submission.adjudicator='foreign';},r=>{r.adjudication.blank_submission.packet_sha256='0'.repeat(64);},
    r=>{r.adjudication.item_tasks=r.adjudication.item_tasks.map(()=>({}));},r=>{r.adjudication.item_tasks.reverse();},
    r=>{r.adjudication.item_tasks[0].id='foreign-item';},r=>{r.adjudication.item_tasks[0].source_ids=['0'.repeat(64)];},
    r=>{r.adjudication.item_tasks[0].required_review_roles.reverse();},
    r=>{r.evidence_inventory=[];},r=>{r.evidence_inventory.reverse();},r=>{r.evidence_inventory[0].referenced=false;},
    r=>{r.evidence_inventory[0].binding.original_base64='eA==';},
    r=>{r.settings={};},r=>{r.settings.prepared_on='2026-10-04';},r=>{r.settings.required_uses=['training'];},
    r=>{r.implementation.declared_module_sha256='a'.repeat(64);},r=>{r.limits.roles=2;},
    r=>{r.coverage.evidence_provided_n=0;},r=>{r.coverage.evidence_missing_ids=[];},r=>{r.coverage.evidence_unreferenced_ids=['fixture-0'];},
  ];
  for(const mutate of tamper) {
    const report=clone(coreReport(supplied));mutate(report);rehash(report);let calls=0;
    const result=contract.executeExpertIntake(wireArguments(supplied),{kernel:()=>{calls++;return report;}});
    refusal(result);assert.equal(calls,1);assert.equal(result.structuredContent,undefined);
  }
  for(const s of [guideScenario(packed.guide),supplied,{...scenario(),intake:{...scenario().intake,roles:[]}}]) {
    const publicReport=clone(coreReport(s));let calls=0;
    success(contract.executeExpertIntake(wireArguments(s),{kernel:()=>{calls++;return publicReport;}}),s);assert.equal(calls,1);
  }
  const incomplete=clone(coreReport(supplied));incomplete.adjudication.item_tasks[0].source_ids=['0'.repeat(64)];rehash(incomplete);let calls=0;
  const wire=await memoryRequest({name:contract.INTAKE_TOOL.name,arguments:wireArguments(supplied)},
    {endpointOptions:{kernel:()=>{calls++;return incomplete;}}});
  assert.equal(calls,1);assert.equal(wire.decoded,9);refusal(wire.response.result,'OUTPUT_BINDING');
  assert.equal(wire.output.frames.some(frame=>JSON.parse(frame).result?.structuredContent!==undefined),false);
});

test('prepare intake native: public JSON clone and content hash preserve every field without comparing prototype artifacts', () => {
  const report=clone(coreReport()),normal=clone(report),publicNull=Object.assign(Object.create(null),report);
  const result=contract.executeExpertIntake(wireArguments(),{kernel:()=>publicNull});assert.equal(result.isError,undefined);assert.deepEqual(result.structuredContent,normal);assert.equal(result.content[0].text,JSON.stringify(normal));assert.equal(result.structuredContent.content_hash,contentHash(result.structuredContent,createHash));
  const poisoned=clone(report);Object.defineProperty(poisoned,'interpretation',{enumerable:true,get(){throw new Error('SHOULD_NOT_GET');}});refusal(contract.executeExpertIntake(wireArguments(),{kernel:()=>poisoned}),'OUTPUT_SCHEMA');
});

test('prepare intake native: full two-MiB report duplicates as exact JSON text and structured content with encoded escape caps', async () => {
  const report=clone(coreReport());report.interpretation='';rehash(report);const base=Buffer.byteLength(JSON.stringify(report));
  report.interpretation='\\'.repeat(100000)+'x'.repeat(2097152-base-200000);rehash(report);assert.equal(Buffer.byteLength(JSON.stringify(report)),2097152);
  const result=contract.executeExpertIntake(wireArguments(),{kernel:()=>report});assert.equal(result.isError,undefined);assert.equal(Buffer.byteLength(result.content[0].text),2097152);assert.equal(JSON.stringify(result.structuredContent),result.content[0].text);
  const output=new Output();await contract.createIntakeNativeWriter(output).send({jsonrpc:'2.0',id:1,result},contract.createWorkScope(),{tool:true});assert.equal(output.frames.length,1);assert.ok(output.frames[0].length<=8388608);
  report.interpretation+='x';rehash(report);refusal(contract.executeExpertIntake(wireArguments(),{kernel:()=>report}),'REPORT_BOUND');
  const over={resultType:'complete',content:[{type:'text',text:'\0'.repeat(1300000)}]};const stopped=new Output();await assert.rejects(contract.createIntakeNativeWriter(stopped).send({jsonrpc:'2.0',id:1,result:over},contract.createWorkScope(),{tool:true}),e=>e.code==='TOOL_RESULT_BOUND');assert.equal(stopped.frames.length,0);
});

test('prepare intake native: output schema violations cannot be repaired stripped or compacted into success', async () => {
  const report=clone(coreReport());report.implementation.runtime_identity_verified=true;rehash(report);refusal(contract.executeExpertIntake(wireArguments(),{kernel:()=>report}),'OUTPUT_SCHEMA');
  const injected=await memoryRequest({name:contract.INTAKE_TOOL.name,arguments:wireArguments()},{allowClose:true,project:result=>({...result,structuredContent:{coverage:result.structuredContent.coverage}})});
  assert.equal(injected.calls,1);assert.equal(injected.decoded,4);assert.ok(!injected.response||Object.hasOwn(injected.response,'error'));assert.equal(injected.output.frames.some(frame=>JSON.parse(frame).result?.structuredContent!==undefined),false);
});

test('prepare intake native: actual full UTF8 response including escaped ID and LF is admitted without truncation', async () => {
  const message={jsonrpc:'2.0',id:'\0'.repeat(128),result:{text:'€😀'}};const expected=Buffer.from(JSON.stringify(message)+'\n'),output=new Output();
  await contract.createIntakeNativeWriter(output,{frameBytes:expected.length}).send(message,contract.createWorkScope());assert.deepEqual(output.frames,[expected]);
  const stopped=new Output();await assert.rejects(contract.createIntakeNativeWriter(stopped,{frameBytes:expected.length-1}).send(message,contract.createWorkScope()),e=>e.code==='FRAME_OUTPUT_BOUND');assert.equal(stopped.frames.length,0);
  await assert.rejects(contract.createIntakeNativeWriter(stopped).send({...message,id:'x'.repeat(129)},contract.createWorkScope()),e=>e.code==='FRAME_ID');assert.equal(stopped.frames.length,0);
});

test('prepare intake native: fragmented request framing UTF8 pending scopes IDs and bounded method grammar retain strict limits', () => {
  const messages=[],input=new contract.IntakeFrameBuffer(message=>messages.push(message));const raw=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})+'\n');
  input.append(raw.subarray(0,5));assert.equal(input.readMessage(),null);input.append(raw.subarray(5));assert.equal(input.readMessage().id,1);input.finish();assert.equal(messages.length,1);
  for(const raw of [Buffer.from([255,10]),Buffer.from('\ufeff'+JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})+'\n'),Buffer.from('{"jsonrpc":"2.0","id":1,"method":"PRIVATE BAD"}\n')]){const frame=new contract.IntakeFrameBuffer();frame.append(raw);assert.throws(()=>frame.readMessage(),/FRAME_PARSE|FRAME_SHAPE/);}
  const truncated=new contract.IntakeFrameBuffer();truncated.append(Buffer.from('{}'));assert.throws(()=>truncated.finish(),/FRAME_UNTERMINATED/);
  const output=new Output(),stdin=new PassThrough(),transport=new contract.ExpertIntakeTransport(stdin,output);try {
    for(let i=0;i<16;i++)transport.accept({id:i,method:'tools/list'});assert.throws(()=>transport.accept({id:16,method:'tools/list'}),/FRAME_PENDING/);assert.throws(()=>transport.accept({id:0,method:'tools/list'}),/FRAME_PENDING/);
    transport.accept({method:'notifications/cancelled',params:{requestId:0}});assert.equal(transport.scopes.get(0).scope.failure,'ABORTED');
  }finally{void transport.close();}
});

test('prepare intake native: unknown tool or malformed method emits only stable bounded refusal and diagnostics', async () => {
  const result=await memoryRequest({name:'PRIVATE_RAW_TOOL',arguments:wireArguments()});refusal(result.response.result,'TOOL_NAME');assert.equal(result.calls,0);assert.equal(result.decoded,0);
  const method=await memoryRequest({}, {method:'PRIVATE_RAW_METHOD'});assert.deepEqual(method.response.error,{code:-32602,message:'Expert intake protocol refused.'});assert.equal(method.calls,0);
  const output=new Output(),diagnostic=contract.createIntakeDiagnostics(output);while(diagnostic.emit()){}assert.ok(diagnostic.bytes<=8192);assert.equal(diagnostic.failed,true);assert.doesNotMatch(Buffer.concat(output.frames).toString(),/PRIVATE_RAW_/);
});

test('prepare intake native: serializer deadline advance or throw prevents native write after exact frame admission', async () => {
  let now=0;const scope=contract.createWorkScope({clock:()=>now}),output=new Output();now=14999.5;
  const writer=contract.createIntakeNativeWriter(output,{serialize:message=>{const text=JSON.stringify(message);now+=1;return text;}});
  await assert.rejects(writer.send({jsonrpc:'2.0',id:1,result:{}},scope),e=>e.code==='DEADLINE');assert.equal(output.frames.length,0);assert.equal(scope.failure,'DEADLINE');
  const broken=new Output();await assert.rejects(contract.createIntakeNativeWriter(broken,{serialize:()=>{throw new Error('PRIVATE_EXCEPTION');}}).send({jsonrpc:'2.0',id:1,result:{}},contract.createWorkScope()),e=>e.code==='SERIALIZE');assert.equal(broken.frames.length,0);
  const positive=new Output();await contract.createIntakeNativeWriter(positive).send({jsonrpc:'2.0',id:1,result:{}},contract.createWorkScope());assert.equal(positive.frames.length,1);
});

test('prepare intake native: post-projection clock advance or sticky failure cannot issue success', async () => {
  let now=0;const response=await memoryRequest({name:contract.INTAKE_TOOL.name,arguments:wireArguments()},{allowClose:true,endpointOptions:{clock:()=>now},project:result=>{now=15000;return result;}});
  assert.equal(response.calls,1);assert.ok(!response.response||Object.hasOwn(response.response,'error'));assert.equal(response.output.frames.some(frame=>JSON.parse(frame).result?.structuredContent),false);
  const scope=contract.createWorkScope();scope.fail('FIRST');scope.fail('SECOND');const output=new Output();await assert.rejects(contract.createIntakeNativeWriter(output).send({jsonrpc:'2.0',id:1,result:{}},scope),e=>e.code==='FIRST');assert.equal(output.frames.length,0);
});

test('prepare intake native: caller and process signal fan-in retains the first abort across late callback outcomes', async () => {
  const first=new AbortController(),second=new AbortController(),scope=contract.createWorkScope({signal:first.signal});scope.bindSignal(second.signal);
  const output=new Output(()=>false),pending=contract.createIntakeNativeWriter(output).send({jsonrpc:'2.0',id:1,result:{}},scope);const stopped=assert.rejects(pending,e=>e.code==='ABORTED');first.abort();second.abort();await stopped;
  assert.equal(scope.failure,'ABORTED');assert.equal(output.frames.length,1);output.emit('drain');assert.equal(output.frames.length,1);assert.throws(()=>scope.observe(),/ABORTED/);scope.dispose();
});

test('prepare intake native: immediate and delayed task rejections are owned before fallible post-callback observation', async () => {
  const unhandled=[],observe=reason=>unhandled.push(reason);process.on('unhandledRejection',observe);
  try {
    let time=0;const original=Promise.reject(new Error('ORIGINAL')),scope=contract.createWorkScope({clock:()=>time});
    assert.throws(()=>contract.runObservedTask(()=>{time=15000;return original;},scope),/DEADLINE/);await tick();await tick();assert.deepEqual(unhandled,[]);
    let reject;const delayed=new Promise((_,fail)=>{reject=fail;}),second=contract.createWorkScope();const returned=contract.runObservedTask(()=>delayed,second);const refusal=assert.rejects(returned,/LATE/);reject(new Error('LATE'));await refusal;await tick();assert.deepEqual(unhandled,[]);
    assert.equal(contract.runObservedTask(()=>42,contract.createWorkScope()),42);
  }finally{process.off('unhandledRejection',observe);}
});

test('prepare intake native: both original startup Promise outcomes are observed before child field listener or writer admission', async () => {
  const original=Promise.resolve('READY'),scope=contract.createWorkScope(),order=[];
  const returned=contract.startOwnedPromise(()=>original,scope,{resolved:()=>order.push('resolved'),rejected:()=>order.push('rejected')});assert.equal(returned,original);await original;assert.deepEqual(order,['resolved']);
  const unhandled=[],handler=e=>unhandled.push(e);process.on('unhandledRejection',handler);
  try {
    let time=0,fields=0;const rejected=Promise.reject(new Error('ORIGINAL_START')),late=contract.createWorkScope({clock:()=>time});
    assert.throws(()=>{contract.startOwnedPromise(()=>{time=15000;return rejected;},late);fields++;},/DEADLINE/);assert.equal(fields,0);await tick();await tick();assert.deepEqual(unhandled,[]);
    const pending=Promise.resolve('START');contract.observeOriginalPromise(pending,{resolved:()=>{throw new Error('FIELD');},rejected:()=>{throw new Error('REJECTION_FIELD');}});await pending;await tick();assert.deepEqual(unhandled,[]);
  }finally{process.off('unhandledRejection',handler);}
});

test('prepare intake native: false stdout write waits for drain on the same clock and forwards the frame once', async () => {
  const output=new Output(()=>false),scope=contract.createWorkScope();let finished=false;
  const pending=contract.createIntakeNativeWriter(output).send({jsonrpc:'2.0',id:1,result:{}},scope).then(()=>{finished=true;});await tick();assert.equal(finished,false);assert.equal(output.frames.length,1);output.emit('drain');await pending;assert.equal(finished,true);assert.equal(output.frames.length,1);
  const synchronous=new Output(()=>{synchronous.emit('drain');return false;});await contract.createIntakeNativeWriter(synchronous).send({jsonrpc:'2.0',id:1,result:{}},contract.createWorkScope());assert.equal(synchronous.frames.length,1);
  let time=0;const late=new Output(()=>false),lateScope=contract.createWorkScope({clock:()=>time}),waiting=contract.createIntakeNativeWriter(late).send({jsonrpc:'2.0',id:1,result:{}},lateScope),refusal=assert.rejects(waiting,/DEADLINE/);time=15000;late.emit('drain');await refusal;assert.equal(late.frames.length,1);
});

test('prepare intake native: output error close abort and EPIPE settle pending work without duplicate write', async () => {
  for(const event of ['error','close']){const output=new Output(()=>false),scope=contract.createWorkScope(),pending=contract.createIntakeNativeWriter(output).send({jsonrpc:'2.0',id:1,result:{}},scope);const expected=assert.rejects(pending,e=>e.code===(event==='error'?'WRITE':'CLOSED'));output.emit(event,new Error('PRIVATE_EXCEPTION'));await expected;assert.equal(output.frames.length,1);}
  const output=new Output(()=>{const error=new Error('EPIPE');error.code='EPIPE';throw error;});await assert.rejects(contract.createIntakeNativeWriter(output).send({jsonrpc:'2.0',id:1,result:{}},contract.createWorkScope()),e=>e.code==='WRITE');assert.equal(output.frames.length,1);
  const aborted=new AbortController(),scope=contract.createWorkScope({signal:aborted.signal});aborted.abort();const stopped=new Output();await assert.rejects(contract.createIntakeNativeWriter(stopped).send({jsonrpc:'2.0',id:1,result:{}},scope),/ABORTED/);assert.equal(stopped.frames.length,0);
});

test('prepare intake native: fallible terminal listener admission preserves sticky refusal and memoized closure', async () => {
  const output=new Output();output.once=()=>{throw new Error('PRIVATE_LISTENER');};const scope=contract.createWorkScope();await assert.rejects(contract.createIntakeNativeWriter(output).send({jsonrpc:'2.0',id:1,result:{}},scope),e=>e.code==='WRITE');assert.equal(output.frames.length,0);assert.equal(scope.failure,'WRITE');
  const input=new PassThrough(),transport=new contract.ExpertIntakeTransport(input,new Output());const first=transport.close();assert.equal(transport.close(),first);await first;assert.equal(input.destroyed,true);
});

test('prepare intake native: final write observation follows event setup with no intervening callback or serialization', async () => {
  const events=[],scope=contract.createWorkScope({clock:()=>{events.push('clock');return 0;}}),output=new Output(()=>{events.push('write');return true;});
  const once=output.once.bind(output);output.once=(event,fn)=>{events.push('listen:'+event);return once(event,fn);};
  const writer=contract.createIntakeNativeWriter(output,{serialize:value=>{events.push('serialize');return JSON.stringify(value);}});await writer.send({jsonrpc:'2.0',id:1,result:{}},scope);
  const index=events.indexOf('write');assert.equal(events[index-1],'clock');assert.ok(events.lastIndexOf('serialize')<index-1);assert.ok(events.indexOf('listen:drain')<index-1);
  const captured=new Output(),native=contract.createIntakeNativeWriter(captured);captured.write=()=>{throw new Error('REPLACED');};await native.send({jsonrpc:'2.0',id:1,result:{}},contract.createWorkScope());assert.equal(captured.frames.length,1);
  let time=0;const late=new Output(),lateOnce=late.once.bind(late);late.once=(event,listener)=>{const result=lateOnce(event,listener);if(event==='drain')time=15000;return result;};await assert.rejects(contract.createIntakeNativeWriter(late).send({jsonrpc:'2.0',id:1,result:{}},contract.createWorkScope({clock:()=>time})),/DEADLINE/);assert.equal(late.frames.length,0);
});

test('prepare intake native: memoized close publishes ownership once and destroys owned input once after closure', async () => {
  const input=new PassThrough(),output=new Output(()=>false);let destroyed=0;const destroy=input.destroy.bind(input);input.destroy=(...args)=>{destroyed++;return destroy(...args);};
  const transport=new contract.ExpertIntakeTransport(input,output);transport.accept({id:1,method:'tools/list'});const pending=transport.send({jsonrpc:'2.0',id:1,result:{tools:[]}}),refusal=assert.rejects(pending,/CLOSED/);
  const first=transport.close();assert.equal(transport.close(),first);await first;await refusal;assert.equal(destroyed,1);assert.equal(transport.scopes.size,0);assert.equal(output.frames.length,1);
});

test('prepare intake native: failed startup and unknown PID absence never claim or close a foreign child', async () => {
  let probes=0;assert.equal(workflow.knownOwnedAbsent(null,()=>{probes++;}),null);assert.equal(workflow.knownOwnedAbsent(1,()=>{probes++;}),null);assert.equal(probes,0);
  assert.equal(workflow.knownOwnedAbsent(100,()=>{const e=new Error('MISSING');e.code='ESRCH';throw e;}),true);assert.equal(workflow.knownOwnedAbsent(100,()=>{}),false);
  assert.throws(()=>workflow.knownOwnedAbsent(100,()=>{const e=new Error('DENIED');e.code='EPERM';throw e;}),/OWNED_ABSENCE_UNKNOWN/);
  let observed=0;const original=Promise.reject(new Error('START_FAIL'));contract.startOwnedPromise(()=>original,contract.createWorkScope(),{rejected:()=>observed++});await assert.rejects(original,/START_FAIL/);assert.equal(observed,1);
});

test('prepare intake native: nonfinite backwards clocks kernel overrun and final cancellation refuse after observed return', () => {
  for(const initial of [NaN,Infinity])assert.throws(()=>contract.createWorkScope({clock:()=>initial}).observe(),/CLOCK/);
  let time=1;const scope=contract.createWorkScope({clock:()=>time});time=0;assert.throws(()=>scope.observe(),/CLOCK/);
  time=0;let calls=0;const late=contract.createWorkScope({clock:()=>time});refusal(contract.executeExpertIntake(wireArguments(),{scope:late,kernel:(...args)=>{calls++;const report=prepareExpertIntake(...args);time=15000;return report;}}),'DEADLINE');assert.equal(calls,1);
  const abort=new AbortController(),cancelled=contract.createWorkScope({signal:abort.signal});refusal(contract.executeExpertIntake(wireArguments(),{scope:cancelled,kernel:(...args)=>{const report=prepareExpertIntake(...args);abort.abort();return report;}}),'ABORTED');
});

test('prepare intake package: SDK entry1 reuses the installed-source marked-guide inputs for one complete preparation call and owned close', {timeout:21000}, async t=>{await actualSdkEntry(t,'direct');assert.equal(commandEntries,1);assert.equal(sdkChildren,1);});
test('prepare intake package: SDK entry2 absolute owned bin alias retains one call original startup ownership and bounded close', {timeout:21000}, async t=>{await actualSdkEntry(t,'alias');assert.equal(commandEntries,2);assert.equal(sdkChildren,2);});
test('prepare intake package: SDK entry3 stable tool refusal has no discovery retry input echo or extra child', {timeout:21000}, async t=>{await actualSdkEntry(t,'refusal');assert.equal(commandEntries,3);assert.equal(sdkChildren,3);assert.equal(closures.length,4);});
