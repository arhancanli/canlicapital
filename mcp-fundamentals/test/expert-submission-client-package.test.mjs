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
import { EventEmitter } from 'node:events';
import { contentHash } from '../src/canonical-json.mjs';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { reconcileExpertSubmissions } from '../../scripts/datasets/filing-facts/expert-submission-audit.mjs';
import { packetContent } from '../../js/filing-facts-packet.js';

// Synthetic supplied files only. No additional SDK entry or authenticated person.
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const L = Object.freeze({ compressed: 262144, expanded: 2097152, members: 32, npmOutput: 65536,
  packMs: 20000, commandMs: 21000, closeMs: 2500, stdout: 4096, stderr: 8192, fixture: 32 * 1024 * 1024 });
const LIMITS = Object.freeze({ gold: 524288, intake: 65536, evidenceInventory: 32768, intakeSettings: 4096,
  evidence: 32768, evidenceTotal: 262144, intakeTotal: 786432, submissionInventory: 16384,
  auditSettings: 4096, submission: 2097152, evidenceCount: 64, submissionCount: 2, inputCount: 72,
  inputTotal: 4194304, report: 6291456, reportFile: 6291457, path: 4096, stdout: 4096, stderr: 1024 });
const bytes = value => Buffer.from(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const sha = hash;
const clone = value => JSON.parse(JSON.stringify(value));
const choices = { question_clear: ['yes', 'no'], answer_matches_filing: ['yes', 'no', 'cannot_find'], citation_correct: ['yes', 'no'] };
let TMP, packed, clientModule, contract, restore = () => {}, suppliedFixtureBytes = 0, commandEntries = 0, packEntries = 0, denied = 0;
const nativeSpawn = cp.spawn.bind(cp);
const nativeDiagnosticWrite = fs.writeSync.bind(fs);
const closures = [];
// One prevalidated cache target may be linked into its exact owned destination.
// The target is read only; this is not permission to mutate or replace cache files.
const pendingReadOnlyCacheLinks = new Map();
const readOnlyCacheAliases = new Map();
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
  const frame = Buffer.from('# CANLI_EXPERT_CLIENT_PACKAGE_' + kind + ' ' + json + '\n');
  observe();
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

// Shared by the parent and the generated child. Resolve native ancestors before
// admitting mutation: a TMP spelling cannot authorize a linked external cache.
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
  const restoreFiles = installOwnedFileGuard(fs, fsp, path, TMP, deny, readOnlyCacheAliases, pendingReadOnlyCacheLinks);
  syncBuiltinESMExports();
  return () => { restoreFiles(); for (const [object, name, original] of changes.reverse()) object[name] = original; syncBuiltinESMExports(); };
}

function childGuard() { return `
import fs from 'node:fs'; import fsp from 'node:fs/promises'; import path from 'node:path'; import cp from 'node:child_process';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram'; import dns from 'node:dns'; import {syncBuiltinESMExports} from 'node:module';
const own=${JSON.stringify(TMP)}; let count=0,controls=true;
const deny=()=>{count++;if(!controls)process.stderr.write('DENIED_OPERATION\\n');const e=new Error('NATIVE_DENIAL');e.code='NATIVE_DENIAL';throw e;};
globalThis.fetch=deny;
for(const[o,ns]of[[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],[tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]])for(const n of ns)o[n]=deny;
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;
const isClient=!!process.argv[1]&&fs.realpathSync(process.argv[1])===path.join(own,'consumer','node_modules','canli-fundamentals-mcp','src','expert-submission-client.mjs');
const originalSpawn=cp.spawn;let launches=0;
cp.spawn=(command,args,options)=>{const root=path.join(own,'consumer','node_modules','canli-fundamentals-mcp');
 if(!isClient||command!==process.execPath||JSON.stringify(args)!==JSON.stringify([path.join(root,'src','expert-submission-stdio.mjs')])||options.cwd!==root||options.shell!==false||++launches!==1)deny();
 const child=originalSpawn(command,args,options),pid=child.pid;process.stderr.write('OWNED_EXPERT_CLIENT_CHILD '+JSON.stringify({event:'start',pid})+'\\n');
 const write=child.stdin.write.bind(child.stdin);let calls=0,discoveries=0;
 child.stdin.write=(frame,...rest)=>{const message=JSON.parse(frame);if(message.method==='tools/call')calls++;if(['tools/list','server/discover'].includes(message.method))discoveries++;return write(frame,...rest);};
 child.once('exit',(code,signal)=>process.stderr.write('OWNED_EXPERT_CLIENT_CHILD '+JSON.stringify({event:'exit',pid,code,signal,calls,discoveries})+'\\n'));return child;
};
for(const n of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[n]=deny;
${installOwnedFileGuard.toString()}
installOwnedFileGuard(fs,fsp,path,own,deny,new Map(${JSON.stringify([...readOnlyCacheAliases])}));
syncBuiltinESMExports();
for(const fn of[()=>fetch('https://invalid.invalid'),()=>fs.writeFileSync('/unallocated-expert-file-fixture','x'),()=>cp.spawn('unallocated',[])])try{fn();throw new Error('NOT_ARMED');}catch(e){if(e.code!=='NATIVE_DENIAL')throw e;}
if(count!==3)throw new Error('NOT_ARMED');controls=false;process.stderr.write('EXPERT_CLIENT_NATIVE_GUARD '+JSON.stringify({denied:3})+'\\n');
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
    assert.match(stderr, /^EXPERT_CLIENT_NATIVE_GUARD \{"denied":3\}\n/); assert.doesNotMatch(stderr, /DENIED_OPERATION|NOT_ARMED/);
    return { exitCode: end.code, stdout, stderr: stderr.replace(/^EXPERT_CLIENT_NATIVE_GUARD \{"denied":3\}\n/, '') };
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
  const begin=`<!-- EXPERT_CLIENT_${label}_BEGIN -->`,end=`<!-- EXPERT_CLIENT_${label}_END -->`;
  assert.equal(guide.split(begin).length,2); assert.equal(guide.split(end).length,2);
  const block=guide.split(begin)[1].split(end)[0].trim(); assert.match(block,/^```json\n[\s\S]+\n```$/);
  const raw=Buffer.from(block.slice(8,-4)+'\n'); JSON.parse(raw); return raw;
}
function guideScenario(guide) {
  const rawGold=marked(guide,'GOLD'),gold=JSON.parse(rawGold);
  const rawDocuments={gold:rawGold,intake:marked(guide,'INTAKE'),evidenceInventory:marked(guide,'EVIDENCE_INVENTORY'),
    intakeSettings:marked(guide,'INTAKE_SETTINGS'),submissionInventory:marked(guide,'SUBMISSION_INVENTORY'),auditSettings:marked(guide,'AUDIT_SETTINGS')};
  return { rawGold,gold,rawDocuments,intake:JSON.parse(rawDocuments.intake),evidenceInventory:JSON.parse(rawDocuments.evidenceInventory),evidence:[],
    intakeSettings:JSON.parse(rawDocuments.intakeSettings),submissionInventory:JSON.parse(rawDocuments.submissionInventory),submission:[],auditSettings:JSON.parse(rawDocuments.auditSettings) };
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

function coreArgs(s) { return [s.rawGold, hash(s.rawGold), s.rawDocuments?.intake ?? bytes(s.intake), s.rawDocuments?.evidenceInventory ?? bytes(s.evidenceInventory), s.evidence,
  s.rawDocuments?.intakeSettings ?? bytes(s.intakeSettings), s.rawDocuments?.submissionInventory ?? bytes(s.submissionInventory), s.submission, s.rawDocuments?.auditSettings ?? bytes(s.auditSettings)]; }

function files(t, s = scenario()) {
  const root = fs.mkdtempSync(join(TMP, 'native-input-'));
  fs.chmodSync(root, 0o700); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const raw = s.rawDocuments ?? { gold: s.rawGold, intake: bytes(s.intake), evidenceInventory: bytes(s.evidenceInventory),
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

const dependencyLinks = [];
let actualSdkChildren = 0;
function unlinkOwnedDependencyLinks() {
  for (const row of dependencyLinks.reverse()) {
    assert.ok(fs.lstatSync(row.path).isSymbolicLink());
    assert.equal(fs.readlinkSync(row.path), row.target); fs.unlinkSync(row.path);
  }
  dependencyLinks.length = 0;
}
before(async t => {
  TMP = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'canli-expert-sdk-client-')); fs.chmodSync(TMP, 0o700);
  let complete = false;
  try {
    expectedBytes = new Map(MEMBERS.map(name => [name, snapshot(path.join(ROOT, name.slice(8)), L.expanded)]));
    const guard = path.join(TMP, 'guard.mjs'); fs.writeFileSync(guard, childGuard(), { flag: 'wx', mode: 0o600 });
    restore = parentGuard();
    const artifact = await packOnce();
    const raw = { admission: 'RAW_CAPTURED_NOT_ADMITTED', compressed_bytes: artifact.compressed.length,
      compressed_sha256: hash(artifact.compressed), original_gzip_base64: artifact.compressed.toString('base64') };
    await diagnosticNow('RAW', raw, nativeDiagnosticWrite, { signal: t.signal });
    const entries = tarEntries(artifact.compressed);
    await diagnosticNow('RAW_MODES', { compressed_sha256: raw.compressed_sha256,
      files: [...entries].map(([name, row]) => ({ path: name, mode: row.mode, bytes: row.bytes.length, sha256: hash(row.bytes) })) }, nativeDiagnosticWrite, { signal: t.signal });
    const metadata = admit(entries), consumer = path.join(TMP, 'consumer'); fs.mkdirSync(consumer, { mode: 0o700 });
    const nodeModules = path.join(consumer, 'node_modules'); fs.mkdirSync(nodeModules);
    const root = path.join(nodeModules, metadata.name); fs.mkdirSync(root);
    let charged = 0;
    for (const [name, row] of entries) {
      charged += row.bytes.length; assert.ok(charged <= L.expanded);
      const file = path.join(root, name.slice(8)); fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, row.bytes, { flag: 'wx', mode: row.mode }); fs.chmodSync(file, row.mode);
    }
    const binRoot = path.join(nodeModules, '.bin'); fs.mkdirSync(binRoot);
    const bins = [];
    for (const [name, local] of Object.entries(BIN)) {
      const target = path.join(root, local); fs.symlinkSync(target, path.join(binRoot, name));
      if (name === 'canli-fundamentals-mcp') fs.chmodSync(target, 0o755);
      bins.push({ name, raw_mode: entries.get('package/' + local).mode, owned_fixture_mode: fs.statSync(target).mode & 0o777 });
    }
    // Only locked external dependency cache paths are linked; none point to repo runtime sources.
    const lock = JSON.parse(snapshot(path.join(ROOT, 'package-lock.json'))); assert.equal(Object.keys(lock.packages).length, 15);
    fs.mkdirSync(path.join(root, 'node_modules'));
    for (const [relative, entry] of Object.entries(lock.packages)) {
      if (!relative) continue;
      const target = fs.realpathSync(path.join(ROOT, relative)), link = path.join(root, relative);
      const external = JSON.parse(snapshot(path.join(target, 'package.json')));
      assert.equal(external.version, entry.version); assert.ok(target.includes('node_modules' + path.sep));
      fs.mkdirSync(path.dirname(link), { recursive: true });
      assert.equal(pendingReadOnlyCacheLinks.size, 0); pendingReadOnlyCacheLinks.set(link, target);
      try { fs.symlinkSync(target, link); }
      finally { pendingReadOnlyCacheLinks.delete(link); }
      dependencyLinks.push({ path: link, target });
    }
    // The pack ran before links existed. Later client/endpoint entries receive
    // the exact verified aliases for link-only cleanup, never target mutation.
    fs.writeFileSync(guard, childGuard(), { mode: 0o600 });
    for (const name of ['.git', 'scripts', 'js']) assert.equal(fs.existsSync(path.join(root, name)), false);
    // Import first; fault adapters never intercept ESM loader/source reads.
    clientModule = await import(pathToFileURL(path.join(root, 'src/expert-submission-client.mjs')).href);
    contract = await import(pathToFileURL(path.join(root, 'src/expert-submission-stdio.mjs')).href);
    const guide = entries.get('package/EXPERT_SUBMISSION_CLIENT.md').bytes.toString('utf8'), s = guideScenario(guide);
    assert.match(guide, new RegExp(hash(s.rawGold))); assert.equal(s.intakeSettings.packet_sha256, hash(packetContent(s.gold)));
    packed = { ...artifact, entries, metadata, raw, root, consumer, guard, binRoot, bins, guide, s };
    await diagnosticNow('ADMITTED', { admission: 'ADMITTED', compressed_sha256: raw.compressed_sha256,
      files: [...entries].map(([name, row]) => ({ path: name, mode: row.mode, bytes: row.bytes.length, sha256: hash(row.bytes) })),
      bins, dependency_cache_links: dependencyLinks.length, actual_npm_install: false, repository_runtime_links: 0 }, nativeDiagnosticWrite, { signal: t.signal });
    complete = true;
  } finally {
    if (!complete) { try { unlinkOwnedDependencyLinks(); } finally { restore(); restore = () => {}; if (TMP) fs.rmSync(TMP, { recursive: true, force: true }); } }
  }
}, { timeout: 25000 });
after(() => {
  try { unlinkOwnedDependencyLinks(); }
  finally { try { restore(); } finally { if (TMP) fs.rmSync(TMP, { recursive: true, force: true }); } }
  assert.equal(packEntries, 1); assert.ok(commandEntries <= 3); assert.ok(actualSdkChildren <= 3);
  assert.ok(closures.every(row => row.known && row.absent));
});
const cloneEntries = () => new Map([...packed.entries].map(([name, row]) => [name, { mode: row.mode, bytes: Buffer.from(row.bytes) }]));
function contextFor(s) {
  const captured = { ...(s.rawDocuments ?? { gold: s.rawGold, intake: bytes(s.intake), evidenceInventory: bytes(s.evidenceInventory),
    intakeSettings: bytes(s.intakeSettings), submissionInventory: bytes(s.submissionInventory), auditSettings: bytes(s.auditSettings) }), evidence: s.evidence, submission: s.submission };
  const json = Object.fromEntries(['gold', 'intake', 'evidenceInventory', 'intakeSettings', 'submissionInventory', 'auditSettings'].map(name => [name, JSON.parse(captured[name])]));
  json.submission = s.submission.map(raw => JSON.parse(raw));
  return { captured, json, expected: hash(s.rawGold) };
}
function responseFor(s) {
  const report = reconcileExpertSubmissions(...coreArgs(s));
  return { resultType: 'complete', content: [{ type: 'text', text: JSON.stringify(report) }], structuredContent: clone(report) };
}
function rehashed(s, mutate) {
  const response = responseFor(s), report = response.structuredContent;
  mutate(report); report.content_hash = contentHash(report, createHash); response.content[0].text = JSON.stringify(report); return response;
}
function syntheticSdk(s, options = {}) {
  const effects = { clientCloses: 0, transportCloses: 0, starts: 0, calls: 0, writes: 0, kernels: 0 }, frames = [];
  let child, transport, originalPending, returnedOriginal = false;
  class StdioClientTransport {
    constructor(parameters) {
      assert.equal(parameters.maxBufferSize, 20971520); assert.equal(parameters.stderr, 'pipe');
      assert.deepEqual(parameters.args, [path.join(packed.root, 'src/expert-submission-stdio.mjs')]);
      this.stderr = new EventEmitter(); transport = this;
    }
    start() {
      effects.starts++;
      child = new EventEmitter(); child.pid = 919191; child.stdin = new EventEmitter();
      child.stdin.write = frame => {
        effects.writes++; frames.push(Buffer.from(frame));
        if (options.write) return options.write(frame, child.stdin);
        return true;
      };
      this._process = child;
      if (options.pidThrows) Object.defineProperty(child, 'pid', { get() { throw new Error('PRIVATE_RAW_PID'); } });
      originalPending = options.startPending?.() ?? Promise.resolve();
      return originalPending;
    }
    close() { effects.transportCloses++; child?.emit('exit'); child?.emit('close'); this._process = undefined; return Promise.resolve(); }
  }
  class Client {
    constructor(identity, configuration) {
      assert.deepEqual(configuration.versionNegotiation, { mode: 'legacy' }); assert.equal(configuration.inputRequired.autoFulfill, false);
    }
    async connect(t) { this.transport = t; const pending = t.start(); returnedOriginal = pending === originalPending; await pending; options.connected?.(t); }
    async callTool(request, secondOptions) {
      effects.calls++; assert.equal(secondOptions.toolDefinition, contract.EXPERT_TOOL);
      if (options.callPending) return options.callPending();
      options.beforeSend?.(transport, child);
      await this.transport.send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: request });
      effects.kernels++;
      const response = options.reply?.() ?? responseFor(s); delete response.resultType; return response;
    }
    close() { effects.clientCloses++; return this.transport.close(); }
  }
  return { sdkModules: { Client, StdioClientTransport }, effects, frames, returnedOriginal: () => returnedOriginal, child: () => child, transport: () => transport };
}
async function run(t, s = scenario(), options = {}) {
  const f = files(t, s), io = options.io ?? instrument(); const sdk = options.sdk ?? syntheticSdk(s, options.controls);
  const result = await clientModule.runExpertClientFiles(options.argv ?? f.argv, { filesystem: io.filesystem, packageRoot: packed.root,
    contract, sdkModules: sdk.sdkModules, now: () => 0, ...options.dependencies });
  return { f, io, sdk, result };
}
function refused(result, code) {
  assert.equal(result.exitCode, 1); assert.equal(result.terminal.status, 'refused');
  if (code) assert.equal(result.terminal.code, code);
  const raw = JSON.stringify(result.terminal); assert.ok(Buffer.byteLength(raw) <= 2048);
  assert.doesNotMatch(raw, /PRIVATE_RAW_|SYNTHETIC_EXCEPTION|\/Users\/|node_modules/);
}
function saved(f, result) {
  assert.equal(result.exitCode, 0); assert.equal(result.terminal.status, 'saved');
  const raw = snapshot(f.out, 6291457); assert.equal(hash(raw), result.terminal.report_sha256); assert.equal(raw.at(-1), 10);
  assert.deepEqual(JSON.parse(raw), clone(reconcileExpertSubmissions(...coreArgs(f.s))));
  assert.equal(fs.lstatSync(f.out).mode & 0o777, 0o600); assert.equal(result.terminal.lifecycle.owned_child_absent, true);
  assert.equal(result.terminal.lifecycle.audit_calls, 1); assert.equal(result.terminal.lifecycle.close_attempts, 1);
  assert.equal(result.terminal.selected_n, 3); assert.equal(result.terminal.syntactic_only, true);
}
function fakeSize(io, paths, sizes) {
  const beforeStat = io.filesystem.fstatSync, beforePath = io.filesystem.lstatSync;
  io.filesystem.fstatSync = (...args) => { const result = beforeStat(...args), path = io.held.get(args[0]); return sizes.has(path) ? { ...result, size: BigInt(sizes.get(path)), isFile: () => true } : result; };
  io.filesystem.lstatSync = (...args) => { const result = beforePath(...args); return sizes.has(args[0]) ? { ...result, size: BigInt(sizes.get(args[0])), isFile: () => true } : result; };
}
async function actualCommand(t, kind) {
  assert.ok(++commandEntries <= 3);
  const s = guideScenario(packed.guide);
  if (kind === 'refusal') { s.auditSettings.packet_sha256 = '0'.repeat(64); s.rawDocuments.auditSettings = bytes(s.auditSettings); }
  const f = files(t, s), entry = kind === 'alias' ? path.join(packed.binRoot, 'canli-expert-submission-client') : path.join(packed.root, 'src/expert-submission-client.mjs');
  const result = await runProcess(entry, f.argv, { cwd: packed.consumer, workMs: L.commandMs, stdoutCap: 4096, stderrCap: 8192 });
  const terminal = JSON.parse(result.stdout);
  assert.equal(result.exitCode, kind === 'refusal' ? 1 : 0); assert.equal(result.stdout.split('\n').length, 2);
  const events = result.stderr.split('\n').filter(line => line.startsWith('OWNED_EXPERT_CLIENT_CHILD ')).map(line => JSON.parse(line.slice('OWNED_EXPERT_CLIENT_CHILD '.length)));
  assert.equal(events.length, 2); assert.equal(events[0].event, 'start'); assert.equal(events[1].event, 'exit');
  assert.equal(events[0].pid, events[1].pid); assert.equal(events[1].calls, 1); assert.equal(events[1].discoveries, 0);
  assert.equal(absent(events[0].pid), true); actualSdkChildren++;
  assert.equal(terminal.lifecycle.owned_pid, events[0].pid); assert.equal(terminal.lifecycle.owned_child_absent, true);
  for (const [key, limit] of [['work_ms', 15000], ['closure_ms', 5000], ['total_ms', 20000]]) assert.ok(terminal.lifecycle[key] >= 0 && terminal.lifecycle[key] <= limit);
  if (kind === 'refusal') { refused({ exitCode: result.exitCode, terminal }, 'TOOL_REFUSED'); assert.equal(fs.existsSync(f.out), false); }
  else saved(f, { exitCode: result.exitCode, terminal });
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_RAW_|SYNTHETIC_EXCEPTION|DENIED_OPERATION/);
  t.diagnostic('CANLI_EXPERT_CLIENT_ENTRY ' + JSON.stringify({ entry: commandEntries, kind, owned_server_pid: events[0].pid,
    owned_server_absent: true, audit_calls: 1, discoveries: 0, lifecycle: terminal.lifecycle }));
}

test('expert client package: exact20 source bodies six bins raw modes and unchanged dependency metadata admit once', async () => {
  assert.equal(MEMBERS.length, 24); assert.equal(Object.keys(BIN).length, 8); assert.deepEqual(admit(cloneEntries()), packed.metadata);
  assert.equal(packed.bins[0].raw_mode, 0o644); assert.ok(packed.bins.every(row => row.owned_fixture_mode === 0o755));
  assert.equal(imports(cloneEntries()), 14); assert.equal(dependencyLinks.length, 14);
  const raw = { admission: 'RAW_CAPTURED_NOT_ADMITTED', compressed_bytes: packed.compressed.length, compressed_sha256: hash(packed.compressed), original_gzip_base64: packed.compressed.toString('base64') };
  // Native-only backpressure controls: preserve every byte and the one frame before refusal.
  const expectedFrame = '# CANLI_EXPERT_CLIENT_PACKAGE_RAW ' + JSON.stringify(raw) + '\n';
  const resumed = []; let attempt = 0, elapsed = 0, waits = 0;
  const backpressure = (fd, frame, offset, length) => {
    assert.equal(fd, 1); attempt++;
    if (attempt === 2 || attempt === 3) { const error = new Error('synthetic backpressure'); error.code = attempt === 2 ? 'EAGAIN' : 'EWOULDBLOCK'; throw error; }
    const count = Math.min(length, attempt === 1 ? 7 : 65536); resumed.push(Buffer.from(frame.subarray(offset, offset + count))); return count;
  };
  await assert.rejects(async () => {
    assert.equal(await diagnosticNow('RAW', raw, backpressure, { now: () => elapsed, wait: async ms => { waits++; elapsed += ms; } }), Buffer.byteLength(expectedFrame));
    throw new Error('SIMULATED_BEFORE_HOOK_REFUSAL');
  }, /SIMULATED_BEFORE_HOOK_REFUSAL/);
  assert.equal(waits, 2); assert.equal(Buffer.concat(resumed).toString(), expectedFrame);
  let deadlineWrites = 0, deadlineTime = 0;
  await assert.rejects(async () => diagnosticNow('RAW', raw, () => {
    deadlineWrites++; const error = new Error('synthetic backpressure'); error.code = 'EAGAIN'; throw error;
  }, { now: () => deadlineTime, wait: async () => { deadlineTime = 1001; } }), /RAW_DIAGNOSTIC_DEADLINE/);
  assert.equal(deadlineWrites, 1);
  let abortedWrites = 0; const aborted = { aborted: true };
  assert.throws(() => diagnosticNow('RAW', raw, () => { abortedWrites++; return 1; }, { signal: aborted }), /RAW_DIAGNOSTIC_DEADLINE/);
  assert.equal(abortedWrites, 0);
  let terminalWrites = 0;
  assert.throws(() => diagnosticNow('RAW', raw, () => { terminalWrites++; const error = new Error('synthetic closed pipe'); error.code = 'EPIPE'; throw error; }), /synthetic closed pipe/);
  assert.equal(terminalWrites, 1);
  let serializedTime = 0, serializedWrites = 0;
  assert.throws(() => diagnosticNow('RAW', { toJSON() { serializedTime = 1001; return { synthetic: true }; } },
    () => { serializedWrites++; return 1; }, { now: () => serializedTime }), /RAW_DIAGNOSTIC_DEADLINE/);
  assert.equal(serializedWrites, 0);
  let overcapWrites = 0, zeroWrites = 0;
  assert.throws(() => diagnosticNow('RAW', { over: 'x'.repeat(384 * 1024) }, () => { overcapWrites++; return 1; }), /RAW_DIAGNOSTIC_BOUND/);
  assert.equal(overcapWrites, 0);
  assert.throws(() => diagnosticNow('RAW', raw, () => { zeroWrites++; return 0; }), /RAW_DIAGNOSTIC_WRITE/);
  assert.equal(zeroWrites, 1);
});
test('expert client package: checksum-valid highbit duplicate traversal overflow and trailing gzip refuse before extraction', () => {
  const tiny = gzipSync(Buffer.alloc(1024), { mtime: 0 }); assert.equal(tarEntries(tiny).size, 0);
  const member = (name, size = 1) => {
    const block = Buffer.alloc(1024), header = block.subarray(0, 512);
    header.write(name); header.write('0000644\0', 100); header.write(size.toString(8).padStart(11, '0') + '\0', 124); header[156] = 48;
    header.fill(32, 148, 156); header.write(header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0') + '\0 ', 148); block[512] = 120; return block;
  };
  const a = member('package/a'), end = Buffer.alloc(1024);
  assert.equal(tarEntries(gzipSync(Buffer.concat([a, end]), { mtime: 0 })).size, 1);
  for (const expanded of [Buffer.concat([a, a, end]), Buffer.concat([member('package/../a'), end]), Buffer.concat([member('package/a', 2097153), end])]) assert.throws(() => tarEntries(gzipSync(expanded, { mtime: 0 })));
  for (const data of [Buffer.concat([tiny, tiny]), Buffer.concat([tiny, Buffer.from('x')]), tiny.subarray(0, tiny.length - 1)]) assert.throws(() => tarEntries(data));
  for (const offset of [0, 100, 124, 148, 156]) {
    const expanded = Buffer.alloc(1536), header = expanded.subarray(0, 512); header.write('package/a'); header.write('0000644\0', 100); header.write('00000000001\0', 124); header[156] = 48;
    header[offset] |= 128; header.fill(32, 148, 156); header.write(header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0') + '\0 ', 148); expanded[512] = 120;
    if (offset === 148) header[148] |= 128;
    assert.throws(() => tarEntries(gzipSync(expanded, { mtime: 0 })));
  }
});
test('expert client package: missing local imports changed source bytes and extra members cannot be normalized into admission', () => {
  const missing = cloneEntries(); missing.delete('package/src/expert-submission-stdio.mjs'); assert.throws(() => imports(missing), /LOCAL_IMPORT/);
  const changed = cloneEntries(); changed.get('package/src/expert-submission-client.mjs').bytes = Buffer.from("const x=import(privateSource);\n"); assert.throws(() => imports(changed), /FIXED_SOURCE|FIXED_DYNAMIC/);
  const extra = cloneEntries(); extra.set('package/private.json', { mode: 0o644, bytes: bytes({ secret: true }) }); assert.throws(() => admit(extra), /MEMBERS/);
});
test('expert client package: native guard admits exact owned Buffer paths including BOM and refuses malformed foreign or network writes', async () => {
  const own = path.join(TMP, '\ufeffowned-guard-control'); fs.writeFileSync(Buffer.from(own), 'x', { flag: 'wx' });
  assert.equal(fs.readFileSync(own, 'utf8'), 'x');
  assert.throws(() => fs.writeFileSync(Buffer.from('/foreign-expert-client-control'), 'x'), /NATIVE_DENIAL/);
  assert.throws(() => fs.writeFileSync(Buffer.from([255]), 'x'), /NATIVE_DENIAL/);
  assert.throws(() => fetch('https://invalid.invalid'), /NATIVE_DENIAL/);
  assert.equal(pendingReadOnlyCacheLinks.size, 0);
  assert.equal(dependencyLinks.length, 14);
  for (const row of dependencyLinks) {
    assert.ok(fs.lstatSync(row.path).isSymbolicLink());
    assert.equal(fs.readlinkSync(row.path), row.target);
  }
  const unapproved = path.join(TMP, 'unapproved-cache-target');
  assert.throws(() => fs.symlinkSync('/foreign-expert-client-cache', unapproved), /NATIVE_DENIAL/);
  assert.equal(fs.existsSync(unapproved), false);
  assert.throws(() => fs.symlinkSync(packed.root, '/foreign-expert-client-cache-link'), /NATIVE_DENIAL/);
  // The same file-guard function is installed in the parent and serialized into
  // the child. Its injected native spies cannot write to the real cache.
  assert.ok(childGuard().includes(installOwnedFileGuard.toString()));
  for (const role of ['parent', 'child']) {
    const calls = [], alias = dependencyLinks[0], aliases = new Map(dependencyLinks.map(row => [row.path, row.target]));
    let nextFD = 91;
    const fake = { constants: fs.constants, lstatSync: fs.lstatSync, realpathSync: fs.realpathSync, readlinkSync: fs.readlinkSync };
    for (const name of ['writeFileSync','appendFileSync','renameSync','copyFileSync','mkdirSync','unlinkSync','truncateSync','chmodSync','chownSync','symlinkSync','closeSync','writeSync','ftruncateSync','fchmodSync','fchownSync']) {
      fake[name] = (...args) => { calls.push({ role, name, args }); };
    }
    fake.openSync = (...args) => { calls.push({ role, name: 'openSync', args }); return nextFD++; };
    fake.open = (...args) => { const callback = args.pop(); calls.push({ role, name: 'open', args }); callback(null, nextFD++); };
    const promises = { open: async (...args) => {
      calls.push({ role, name: 'promiseOpen', args });
      return { fd: nextFD++, chmod(...rest) { calls.push({ role, name: 'handleChmod', args: rest }); }, write(...rest) { calls.push({ role, name: 'handleWrite', args: rest }); } };
    } };
    const deny = () => { const error = new Error('NATIVE_DENIAL'); error.code = 'NATIVE_DENIAL'; throw error; };
    const undo = installOwnedFileGuard(fake, promises, path, TMP, deny, aliases);
    try {
      const through = path.join(alias.path, 'package.json'), before = calls.length;
      for (const effect of [() => fake.writeFileSync(through, 'NEVER_WRITTEN'), () => fake.chmodSync(through, 0o777),
        () => fake.renameSync(own, through), () => fake.copyFileSync(through, own),
        () => fake.unlinkSync(through), () => fake.openSync(through, 'w'),
        () => fake.open(through, fs.constants.O_RDWR, () => assert.fail('native open must not forward'))]) {
        assert.throws(effect, /NATIVE_DENIAL/);
      }
      await assert.rejects(promises.open(through, 'r+'), /NATIVE_DENIAL/);
      assert.equal(calls.length, before, role + ' ZERO cache mutation/open forwarding');
      const readFD = fake.openSync(through, 'r'), afterRead = calls.length;
      for (const name of ['writeSync', 'ftruncateSync', 'fchmodSync', 'fchownSync']) assert.throws(() => fake[name](readFD, 0), /NATIVE_DENIAL/);
      assert.equal(calls.length, afterRead, role + ' read-only FD has ZERO mutation forwarding'); fake.closeSync(readFD);
      const handle = await promises.open(through, 'r'), afterHandle = calls.length;
      assert.throws(() => handle.chmod(0o777), /NATIVE_DENIAL/); assert.throws(() => handle.write('NEVER_WRITTEN'), /NATIVE_DENIAL/);
      assert.equal(calls.length, afterHandle, role + ' readonly handle has ZERO mutation forwarding');
      const beforeOwn = calls.length; fake.writeFileSync(own, 'OWNED_POSITIVE');
      const writeFD = fake.openSync(own, 'w'); fake.writeSync(writeFD, Buffer.from('OWNED_POSITIVE')); fake.closeSync(writeFD);
      assert.equal(calls.length, beforeOwn + 4);
      const beforeUnlink = calls.length; fake.unlinkSync(alias.path);
      assert.equal(calls.length, beforeUnlink + 1); assert.equal(aliases.has(alias.path), false);
      assert.throws(() => fake.unlinkSync(alias.path), /NATIVE_DENIAL/); assert.equal(calls.length, beforeUnlink + 1);
    } finally { undo(); }
  }
  // One already-validated target, one owned link, one creation permission. A
  // second creation is refused; exact link cleanup does not follow the target.
  const exact = path.join(TMP, 'one-shot-readonly-cache-control'), target = dependencyLinks[0].target;
  pendingReadOnlyCacheLinks.set(exact, target);
  try {
    fs.symlinkSync(target, exact); assert.equal(pendingReadOnlyCacheLinks.size, 0);
    assert.equal(fs.readlinkSync(exact), target); assert.equal(readOnlyCacheAliases.get(exact), target);
    assert.throws(() => fs.symlinkSync(target, exact), /NATIVE_DENIAL/);
  } finally { pendingReadOnlyCacheLinks.delete(exact); if (readOnlyCacheAliases.has(exact)) fs.unlinkSync(exact); }
  assert.equal(fs.existsSync(exact), false); assert.equal(readOnlyCacheAliases.size, 14);
});
test('expert client native: positive complete two-returned-packet report retains all notes fullN bindings nulls and private durable bytes', async t => {
  const s = scenario({ returned: 2 }); s.submission.forEach((raw, index) => { const packet = JSON.parse(raw); packet.labels[0].answer_matches_filing = 'no'; packet.labels[0].notes = 'SYNTHETIC complete explanatory note'; putReturn(s, index, bytes(packet)); });
  const { f, io, sdk, result } = await run(t, s); saved(f, result); assert.equal(io.held.size, 0);
  assert.equal(sdk.effects.calls, 1); assert.equal(sdk.effects.starts, 1); assert.equal(sdk.effects.transportCloses, 1); assert.equal(sdk.returnedOriginal(), true);
});
test('expert client native: missing duplicate unknown scalar flags sparse arrays and excessive counts stop before any file or child effect', async () => {
  let opens = 0, starts = 0;
  for (const argv of [[], ['--out', '/own/out'], Array(16), Array.from({ length: 150 }, (_, i) => i % 2 ? '/own/x' : '--evidence')]) {
    const result = await clientModule.runExpertClientFiles(argv, { filesystem: { openSync() { opens++; } }, contract,
      operations: { connect() { starts++; } }, now: () => 0 }); refused(result);
  }
  assert.equal(opens, 0); assert.equal(starts, 0);
});
test('expert client native: a late oversized individual file is rejected with all knownFDs closed before the first payload read', async t => {
  const f = files(t), io = instrument(); fakeSize(io, f.paths, new Map([[f.paths.auditSettings, 4097]]));
  const sdk = syntheticSdk(f.s), result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, packageRoot: packed.root, contract, sdkModules: sdk.sdkModules, now: () => 0 });
  refused(result, 'CLI_INPUT_BOUND'); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0); assert.equal(io.held.size, 0); assert.equal(sdk.effects.starts, 0);
});
test('expert client native: individual-positive evidence and aggregate4MiB failures occur before body reads or base64 child dispatch', async t => {
  for (const kind of ['evidence', 'all']) {
    const f = files(t, kind === 'evidence' ? scenario({ evidence: 9 }) : scenario({ returned: 2 })), io = instrument();
    const sizes = kind === 'evidence' ? new Map(f.paths.evidence.map(p => [p, 32768])) : new Map(f.paths.submission.map(p => [p, 2097152]));
    fakeSize(io, f.paths, sizes); const sdk = syntheticSdk(f.s);
    const result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, packageRoot: packed.root, contract, sdkModules: sdk.sdkModules, now: () => 0 });
    refused(result, kind === 'evidence' ? 'CLI_EVIDENCE_BOUND' : 'CLI_TOTAL_BOUND'); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0); assert.equal(io.held.size, 0); assert.equal(sdk.effects.starts, 0);
  }
});
test('expert client native: short EOF and a positive overflow byte both refuse without repairing the saved original', async t => {
  for (const overflow of [false, true]) {
    const f = files(t), io = instrument({ readSync(event, native) { if (event.path === f.paths.gold && (overflow ? event.args[4] === fs.statSync(f.paths.gold).size : event.args[4] === 0)) return overflow ? 1 : 0; return native(); } });
    const result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, contract, now: () => 0 }); refused(result, 'CLI_READ'); assert.equal(io.held.size, 0); assert.equal(fs.existsSync(f.out), false);
  }
});
test('expert client native: changing an earlier captured path during a later read is found by the whole-batch final observation', async t => {
  const f = files(t); let changed = false;
  const io = instrument({ readSync(event, native) { const result = native(); if (!changed && event.path === f.paths.auditSettings) { fs.appendFileSync(f.paths.gold, ' '); changed = true; } return result; } });
  const result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, contract, now: () => 0 }); refused(result, 'CLI_INPUT_CHANGED'); assert.equal(changed, true); assert.equal(io.held.size, 0);
});
test('expert client native: actual hardlinked aliases refuse at FD admission before any payload or SDK child', async t => {
  const f = files(t); fs.unlinkSync(f.paths.intake); fs.linkSync(f.paths.gold, f.paths.intake); const io = instrument();
  const result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, contract, now: () => 0 }); refused(result, 'CLI_ALIAS'); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0); assert.equal(io.held.size, 0);
});
test('expert client native: read-FD close-after-close uncertainty never retries a reused unrelated numeric descriptor', async t => {
  const f = files(t); let used, calls = 0, reused;
  const io = instrument({ closeSync(event, native) { if (event.path === f.paths.gold) { calls++; used = event.args[0]; native(); reused = fs.openSync(f.paths.intake, 'r'); assert.equal(reused, used); throw new Error('PRIVATE_RAW_CLOSE'); } return native(); } });
  try {
    const result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, contract, now: () => 0 }); refused(result, 'CLI_CLOSE'); assert.equal(calls, 1); assert.equal(fs.fstatSync(reused).isFile(), true); assert.equal(io.held.size, 0);
  } finally { if (reused !== undefined) fs.closeSync(reused); }
  const next = files(t); let time = 0;
  const atOpen = instrument({ openSync(event, native) { const fd = native(); if (event.path === next.paths.gold) time = 15001; return fd; } });
  const stopped = await clientModule.runExpertClientFiles(next.argv, { filesystem: atOpen.filesystem, contract, now: () => time });
  refused(stopped, 'WORK_DEADLINE'); assert.equal(atOpen.held.size, 0); assert.equal(atOpen.events.filter(row => row.operation === 'closeSync').length, 1);
});
test('expert client native: primitive exact64 gold hash and same-buffer mismatch stop before SDK import or child', async t => {
  const f = files(t);
  for (const value of ['0'.repeat(64), hash(f.s.rawGold) + '\n']) {
    const argv = [...f.argv]; argv[3] = value;
    const result = await clientModule.runExpertClientFiles(argv, { contract, now: () => 0 }); refused(result, 'CLI_SHA'); assert.equal(fs.existsSync(f.out), false);
  }
  const argv = [...f.argv]; argv[3] = [hash(f.s.rawGold)]; assert.throws(() => clientModule.parseExpertClientArgs(argv));
});
test('expert client native: fatal UTF8 and duplicate input JSON keys are never replacement-decoded before child entry', async t => {
  for (const raw of [Buffer.from([255]), Buffer.from('{"schema":"a","schema":"b"}')]) {
    const f = files(t); fs.writeFileSync(f.paths.auditSettings, raw); const sdk = syntheticSdk(f.s);
    const result = await clientModule.runExpertClientFiles(f.argv, { contract, sdkModules: sdk.sdkModules, now: () => 0 }); refused(result, 'CLI_INPUT'); assert.equal(sdk.effects.starts, 0);
  }
});
test('expert client native: own proto unknown outer keys sparse and noncanonicalbase64 are refused before SDK projection with positive original control', () => {
  const context = contextFor(scenario()), request = clientModule.buildExpertClientRequest(context.captured, context.expected);
  assert.deepEqual(clientModule.admitExpertClientParams(request, contract), request);
  for (const target of ['params', 'args', 'base64', 'sparse']) {
    const invalid = clone(request);
    if (target === 'params') Object.defineProperty(invalid, '__proto__', { value: {}, enumerable: true });
    if (target === 'args') Object.defineProperty(invalid.arguments, '__proto__', { value: {}, enumerable: true });
    if (target === 'base64') invalid.arguments.gold_base64 = 'Zh==';
    if (target === 'sparse') invalid.arguments.evidence_base64 = Array(1);
    assert.throws(() => clientModule.admitExpertClientParams(invalid, contract));
  }
});
test('expert client native: SAME native serialization crossing14999.5+1ms has zero wire or kernel with an exact positive send control', async t => {
  let time = 0;
  const s = scenario(), sdk = syntheticSdk(s, { beforeSend() { time = 14999.5; } });
  const { result } = await run(t, s, { sdk, dependencies: { now: () => time, serializeWire(message) { const raw = JSON.stringify(message); time += 1; return raw; } } });
  refused(result, 'WORK_DEADLINE'); assert.equal(sdk.effects.writes, 0); assert.equal(sdk.effects.kernels, 0); assert.equal(sdk.effects.transportCloses, 1);
  const positive = await run(t); saved(positive.f, positive.result); assert.equal(positive.sdk.effects.writes, 1);
});
test('expert client native: sticky abort after serialization and listener-admission state changes cannot make a wire effect', async t => {
  const signal = new AbortController(), sdk = syntheticSdk(scenario());
  const result = await run(t, scenario(), { sdk, dependencies: { signal: signal.signal, serializeWire(message) { const text = JSON.stringify(message); signal.abort(); return text; } } });
  refused(result.result, 'ABORTED'); assert.equal(sdk.effects.writes, 0); assert.equal(sdk.effects.kernels, 0);
});
test('expert client native: one false nativewrite resolves on one drain without retry and preserves SDK Promise completion', async t => {
  const s = scenario(), sdk = syntheticSdk(s, { write(frame, stream) { queueMicrotask(() => stream.emit('drain')); return false; } });
  const { f, result } = await run(t, s, { sdk }); saved(f, result); assert.equal(sdk.effects.writes, 1); assert.equal(sdk.effects.calls, 1);
});
test('expert client native: writer failure has no second write and still memoizes original child transportclose exactly once', async t => {
  const s = scenario(), sdk = syntheticSdk(s, { write() { throw new Error('PRIVATE_RAW_WRITE'); } });
  const { result } = await run(t, s, { sdk }); refused(result, 'CALL'); assert.equal(sdk.effects.writes, 1); assert.equal(sdk.effects.kernels, 0); assert.equal(sdk.effects.transportCloses, 1);
});
test('expert client native: queued late callback stops at same sender boundary rather than issuing a followup audit', async t => {
  let time = 0; const s = scenario(), sdk = syntheticSdk(s, { beforeSend() { time = 15001; } });
  const { result } = await run(t, s, { sdk, dependencies: { now: () => time } }); refused(result, 'WORK_DEADLINE'); assert.equal(sdk.effects.writes, 0); assert.equal(sdk.effects.calls, 1);
});
test('expert client native: synchronous compiler exhaustion owns a later task rejection before postcallback clock refusal', async t => {
  let time = 0, unhandled = 0; const onUnhandled = () => { unhandled++; }; process.on('unhandledRejection', onUnhandled);
  try {
    const s = scenario(), sdk = syntheticSdk(s, { callPending() { time = 15001; return Promise.reject(new Error('PRIVATE_RAW_LATE_TASK')); } });
    const { result } = await run(t, s, { sdk, dependencies: { now: () => time } }); await new Promise(resolve => setImmediate(resolve));
    refused(result, 'WORK_DEADLINE'); assert.equal(unhandled, 0); assert.equal(sdk.effects.writes, 0);
  } finally { process.removeListener('unhandledRejection', onUnhandled); }
});
test('expert client native: immediate and delayed originalSTART rejections stay owned when subsequent PID admission throws', async t => {
  let unhandled = 0; const onUnhandled = () => { unhandled++; }; process.on('unhandledRejection', onUnhandled);
  try {
    for (const delayed of [false, true]) {
      const s = scenario(), sdk = syntheticSdk(s, { pidThrows: true, startPending() { return delayed ? new Promise((_, reject) => queueMicrotask(() => reject(new Error('PRIVATE_RAW_START')))) : Promise.reject(new Error('PRIVATE_RAW_START')); } });
      const { result } = await run(t, s, { sdk }); await new Promise(resolve => setImmediate(resolve)); refused(result); assert.equal(sdk.effects.starts, 1); assert.equal(sdk.effects.calls, 0); assert.equal(sdk.effects.transportCloses, 1);
    }
    assert.equal(unhandled, 0);
  } finally { process.removeListener('unhandledRejection', onUnhandled); }
});
test('expert client native: same original pending task rejection after queued return is consumed without hidden retry or second call', async t => {
  const s = scenario(), sdk = syntheticSdk(s, { callPending() { return new Promise((_, reject) => queueMicrotask(() => reject(new Error('PRIVATE_RAW_TASK')))); } });
  const { result } = await run(t, s, { sdk }); refused(result, 'CALL'); assert.equal(sdk.effects.calls, 1); assert.equal(sdk.effects.transportCloses, 1);
});
test('expert client native: connect refusal closes the exact known child and never starts an audit', async t => {
  const s = scenario(), sdk = syntheticSdk(s, { connected() { throw new Error('PRIVATE_RAW_CONNECT'); } });
  const { result } = await run(t, s, { sdk }); refused(result, 'CONNECT'); assert.equal(sdk.effects.calls, 0); assert.equal(sdk.effects.transportCloses, 1);
});
test('expert client native: rehashed gold and submission binding tampering is refused beyond self-consistent content_hash', async t => {
  const s = scenario({ returned: 1 }), context = contextFor(s);
  for (const mutate of [report => { report.bindings.audit_settings.sha256 = '0'.repeat(64); }, report => { report.submissions[0].binding.original_base64 = Buffer.from('CHANGED').toString('base64'); }]) {
    assert.throws(() => clientModule.validateExpertClientReply(rehashed(s, mutate), context, contract), /RESPONSE_BINDING/);
  }
  const positive = responseFor(s);
  assert.deepEqual(clone(clientModule.validateExpertClientReply(positive, context, contract)), positive.structuredContent);
  const changes = [
    report => { report.preparation.source_worklists[0].item_ids = []; },
    report => { report.preparation.source_worklists[0].mechanical_flags.uncovered_required_uses = []; },
    report => { report.preparation.adjudication.item_tasks[0].id = 'CHANGED'; },
    report => { report.preparation.adjudication.item_tasks[0].source_ids = ['0'.repeat(64)]; },
    report => { report.preparation.adjudication.item_tasks.reverse(); },
    report => { report.preparation.adjudication.blank_submission.packet_sha256 = '0'.repeat(64); report.adjudication.blank_submission.packet_sha256 = '0'.repeat(64); },
    report => { report.preparation.adjudication.blank_submission.adjudicator = 'CHANGED'; report.adjudication.blank_submission.adjudicator = 'CHANGED'; },
    report => { const decisions = [{ id: s.gold.labels[0].id, decision: 'accept', notes: 'SYNTHETIC_FORGED_DECISION' }];
      report.preparation.adjudication.blank_submission.decisions = decisions; report.adjudication.blank_submission.decisions = clone(decisions); },
    report => { report.preparation.review_packets[0].assignment_status = 'missing_role_declaration'; },
    report => { report.adjudication.item_tasks[0].status = 'CHANGED'; },
  ];
  for (const [index, mutate] of changes.entries()) {
    const invalid = rehashed(s, report => { mutate(report); report.preparation.content_hash = contentHash(report.preparation, createHash); });
    assert.equal(invalid.structuredContent.preparation.content_hash, contentHash(invalid.structuredContent.preparation, createHash));
    assert.equal(invalid.structuredContent.content_hash, contentHash(invalid.structuredContent, createHash));
    assert.deepEqual(JSON.parse(invalid.content[0].text), invalid.structuredContent);
    assert.throws(() => clientModule.validateExpertClientReply(invalid, context, contract), /RESPONSE_BINDING|RESPONSE_ROWS/);
    if ([0, 1, 2, 7].includes(index)) {
      const sdk = syntheticSdk(s, { reply: () => clone(invalid) });
      const runResult = await run(t, s, { sdk }); refused(runResult.result);
      assert.equal(fs.existsSync(runResult.f.out), false); assert.equal(runResult.io.held.size, 0);
      assert.equal(sdk.effects.calls, 1); assert.equal(sdk.effects.transportCloses, 1);
      assert.deepEqual(snapshot(runResult.f.paths.gold), s.rawGold);
    }
  }
  // Shared sources preserve all original item memberships and their original order.
  const shared = scenario(); shared.gold.labels.forEach(row => { row.filings = [...shared.gold.labels[0].filings]; });
  shared.rawGold = bytes(shared.gold); const sharedPacket = hash(packetContent(shared.gold));
  for (const input of [shared.intake, shared.intakeSettings, shared.submissionInventory, shared.auditSettings]) input.packet_sha256 = sharedPacket;
  const sharedPositive = responseFor(shared);
  assert.deepEqual(clone(clientModule.validateExpertClientReply(sharedPositive, contextFor(shared), contract)), sharedPositive.structuredContent);
  assert.deepEqual(sharedPositive.structuredContent.preparation.source_worklists[0].item_ids, shared.gold.labels.map(row => row.id));
  // Source-use contradictions/missing evidence are mechanical supplied work, never rights clearance.
  const rights = scenario({ evidence: 1 }), url = rights.gold.labels[0].filings[0], sourceId = hash(Buffer.from(url));
  rights.intakeSettings.required_uses = ['human_review', 'training'];
  rights.evidenceInventory.evidence[0].purpose = 'source_rights'; rights.evidenceInventory.evidence[0].subject = { source_id: sourceId, url };
  rights.intake.sources = [{ source_id: sourceId, url, claims: [{ id: 'synthetic-claim', declaration_text: null,
    allowed_uses: ['human_review', 'training'], denied_uses: ['training'], evidence_ids: ['fixture-0', 'missing-reference'], verification: null }] }];
  const rightsPositive = responseFor(rights);
  assert.deepEqual(clone(clientModule.validateExpertClientReply(rightsPositive, contextFor(rights), contract)), rightsPositive.structuredContent);
  for (const mutate of [
    report => { report.preparation.source_worklists[0].claims[0].evidence.provided[0].sha256 = '0'.repeat(64); },
    report => { report.preparation.source_worklists[0].claims[0].evidence.missing_ids = []; },
    report => { report.preparation.source_worklists[0].mechanical_flags.contradictory_use_claims = []; },
    report => { report.preparation.source_worklists[0].mechanical_flags.restricted_required_uses = []; },
    report => { report.preparation.evidence_inventory[0].referenced = false; },
    report => { report.preparation.coverage.evidence_missing_ids = []; },
    report => { report.preparation.role_worklists[0].identity_evidence.declared_ids = ['FORGED']; },
  ]) {
    const invalid = rehashed(rights, report => { mutate(report); report.preparation.content_hash = contentHash(report.preparation, createHash); });
    assert.throws(() => clientModule.validateExpertClientReply(invalid, contextFor(rights), contract), /RESPONSE_BINDING/);
  }
});
test('expert client native: rehashed reduced selectedN or missing-pair denominator is refused while full originals remain intact', () => {
  const s = scenario(), context = contextFor(s);
  for (const mutate of [report => { report.coverage.selected_n--; }, report => { report.coverage.per_field.question_clear.pair_missing_n--; }]) {
    assert.throws(() => clientModule.validateExpertClientReply(rehashed(s, mutate), context, contract), /RESPONSE_ROWS/);
  }
});
test('expert client native: rehashed promoted human rights and declared-source flags never become verified outcomes', () => {
  const s = scenario(), context = contextFor(s);
  for (const mutate of [report => { report.established.verified_experts_n = 2; }, report => { report.preparation.source_worklists[0].actual_rights_verified = true; report.preparation.content_hash = contentHash(report.preparation, createHash); }, report => { report.implementation.dependency_source_pins_verified = true; }, report => { report.implementation.runtime_identity_verified = null; }]) {
    assert.throws(() => clientModule.validateExpertClientReply(rehashed(s, mutate), context, contract));
  }
});
test('expert client native: structured-text mismatch duplicate text keys and rehashed changed returned notes cannot lose companions', () => {
  const s = scenario({ returned: 1 }), context = contextFor(s), mismatch = responseFor(s); mismatch.content[0].text = '{}';
  assert.throws(() => clientModule.validateExpertClientReply(mismatch, context, contract));
  const duplicate = responseFor(s); assert.ok(duplicate.content[0].text.startsWith('{')); duplicate.content[0].text = '{"schema":"invalid",' + duplicate.content[0].text.slice(1); assert.throws(() => clientModule.validateExpertClientReply(duplicate, context, contract));
  assert.throws(() => clientModule.validateExpertClientReply(rehashed(s, report => { report.submissions[0].packet.labels[0].notes = 'ALTERED'; }), context, contract), /RESPONSE_BINDING/);
});
test('expert client native: complete escaped request cap and whole duplicated result cap refuse before wire or report persistence', async t => {
  const s = scenario(), sdk = syntheticSdk(s);
  const { result } = await run(t, s, { sdk, dependencies: { serializeWire() { return 'x'.repeat(6291456); } } });
  refused(result); assert.equal(sdk.effects.writes, 0); assert.equal(sdk.effects.kernels, 0);
  const reply = { resultType: 'complete', content: [{ type: 'text', text: '"'.repeat(6291456) }], structuredContent: { large: '"'.repeat(6291456) } };
  assert.throws(() => clientModule.validateExpertClientReply(reply, contextFor(s), contract), /RESPONSE_BOUND/);
});
test('expert client native: missing known-owned absence or exhausted close reserve cannot mark an output success', async t => {
  for (const exhausted of [false, true]) {
    let time = 0; const s = scenario(), sdk = syntheticSdk(s), budget = clientModule.createExpertClientBudget({ now: () => time });
    const actual = clientModule.createExpertSdkOperations(packed.root, budget, contract, { sdkModules: sdk.sdkModules });
    const ops = { ...actual, async close() { const closed = await actual.close(); if (exhausted) time = 5001; return exhausted ? closed : { ...closed, owned_child_absent: null }; } };
    const { f, result } = await run(t, s, { dependencies: { budget, operations: ops, now: () => time } }); refused(result, exhausted ? 'CLOSE_DEADLINE' : 'CHILD_UNCERTAIN'); assert.equal(fs.existsSync(f.out), false); budget.dispose();
  }
});
test('expert client native: existing output and nonprivate parent refuse before any SDK child without overwrite or permission repair', async t => {
  for (const existing of [false, true]) {
    const f = files(t); if (existing) fs.writeFileSync(f.out, 'ORIGINAL_PRIVATE'); else fs.chmodSync(f.root, 0o755);
    const sdk = syntheticSdk(f.s), result = await clientModule.runExpertClientFiles(f.argv, { contract, sdkModules: sdk.sdkModules, now: () => 0 });
    refused(result, existing ? 'CLI_OUTPUT' : 'CLI_PARENT'); assert.equal(sdk.effects.starts, 0); if (existing) assert.equal(fs.readFileSync(f.out, 'utf8'), 'ORIGINAL_PRIVATE');
  }
});
test('expert client native: uncertain short output followed by write failure retains the private partial file and no success', async t => {
  const f = files(t); let writes = 0;
  const io = instrument({ writeSync(event, native) { if (event.path === f.out) { if (++writes === 1) return fs.writeSync(event.args[0], event.args[1], event.args[2], 10, event.args[4]); throw new Error('PRIVATE_RAW_WRITE'); } return native(); } });
  const sdk = syntheticSdk(f.s), result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, contract, packageRoot: packed.root, sdkModules: sdk.sdkModules, now: () => 0 });
  refused(result, 'CLI_WRITE'); assert.equal(fs.statSync(f.out).size, 10); assert.equal(io.held.size, 0); assert.equal(fs.lstatSync(f.out).mode & 0o777, 0o600);
});
test('expert client native: fsync and sameFD readback uncertainty retain the complete file and refuse without a second output', async t => {
  for (const kind of ['fsync', 'readback']) {
    const f = files(t), io = instrument({ fsyncSync(event, native) { if (kind === 'fsync' && event.path === f.out) throw new Error('PRIVATE_RAW_FSYNC'); return native(); },
      readSync(event, native) { const count = native(); if (kind === 'readback' && event.path === f.out && event.args[4] === 0) event.args[1][0] ^= 1; return count; } });
    const sdk = syntheticSdk(f.s), result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, contract, packageRoot: packed.root, sdkModules: sdk.sdkModules, now: () => 0 });
    refused(result, kind === 'fsync' ? 'CLI_FLUSH' : 'CLI_READBACK'); assert.ok(fs.statSync(f.out).size > 0); assert.equal(io.held.size, 0);
  }
});
test('expert client native: post-readback path replacement and directory flush failure preserve uncertainty and retained outputs', async t => {
  for (const kind of ['path', 'directory']) {
    const f = files(t); let finalRead = false, swapped = false;
    const io = instrument({ readSync(event, native) { const count = native(); if (event.path === f.out && event.args[4] === fs.statSync(f.out).size) finalRead = true; return count; },
      lstatSync(event, native) { if (kind === 'path' && finalRead && !swapped && event.path === f.out) { const original = fs.readFileSync(f.out); fs.renameSync(f.out, f.out + '.retained'); fs.writeFileSync(f.out, original, { flag: 'wx', mode: 0o600 }); swapped = true; } return native(); },
      fsyncSync(event, native) { if (kind === 'directory' && event.path === f.root) throw new Error('PRIVATE_RAW_DIRECTORY'); return native(); } });
    const sdk = syntheticSdk(f.s), result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, contract, packageRoot: packed.root, sdkModules: sdk.sdkModules, now: () => 0 });
    refused(result, kind === 'path' ? 'CLI_OUTPUT_CHANGED' : 'CLI_FLUSH'); assert.ok(fs.existsSync(f.out)); assert.equal(io.held.size, 0); if (kind === 'path') assert.equal(swapped, true);
  }
});
test('expert client native: output close-after-close descriptor reuse is not retried and the durable report stays retained', async t => {
  const f = files(t); let reused, calls = 0;
  const io = instrument({ closeSync(event, native) { if (event.path === f.out) { calls++; native(); reused = fs.openSync(f.paths.gold, 'r'); assert.equal(reused, event.args[0]); throw new Error('PRIVATE_RAW_OUTPUT_CLOSE'); } return native(); } });
  try {
    const sdk = syntheticSdk(f.s), result = await clientModule.runExpertClientFiles(f.argv, { filesystem: io.filesystem, contract, packageRoot: packed.root, sdkModules: sdk.sdkModules, now: () => 0 });
    refused(result, 'CLI_CLOSE'); assert.equal(calls, 1); assert.equal(fs.fstatSync(reused).isFile(), true); assert.ok(fs.existsSync(f.out)); assert.equal(io.held.size, 0);
  } finally { if (reused !== undefined) fs.closeSync(reused); }
  const next = files(t); let time = 0;
  const atOpen = instrument({ openSync(event, native) { const fd = native(); if (event.path === next.out) time = 5001; return fd; } });
  const sdk = syntheticSdk(next.s), stopped = await clientModule.runExpertClientFiles(next.argv, { filesystem: atOpen.filesystem, packageRoot: packed.root, contract, sdkModules: sdk.sdkModules, now: () => time });
  refused(stopped, 'CLOSE_DEADLINE'); assert.equal(atOpen.held.size, 0); assert.equal(fs.statSync(next.out).size, 0);
});
test('expert client native: postserialization terminal clock refusal has zero native terminal writes and no echoed private exception', async t => {
  const f = files(t), s = f.s, sdk = syntheticSdk(s); let time = 0, writes = 0;
  const stream = new EventEmitter(); stream.write = () => { writes++; return true; };
  const result = await clientModule.expertClientCommand(f.argv, { contract, packageRoot: packed.root, sdkModules: sdk.sdkModules, now: () => time,
    interrupts: new EventEmitter(), stdout: stream, serializeTerminal(value) { const text = JSON.stringify(value); time = 5001; return text; } });
  assert.equal(result.exitCode, 1); assert.equal(result.written, false); assert.equal(writes, 0); assert.ok(fs.existsSync(f.out));
});
test('expert client package: marked guide direct entry1 uses the same six input buffers and one known closed SDK child', { timeout: 25000 }, async t => { await actualCommand(t, 'guide'); });
test('expert client package: owned absolute bin alias entry2 returns byteexact full report with one known closed SDK child', { timeout: 25000 }, async t => { await actualCommand(t, 'alias'); });
test('expert client package: complete invalid tool batch entry3 has a stable tiny refusal one call and known owned closure', { timeout: 25000 }, async t => { await actualCommand(t, 'refusal'); });
test('expert client native: terminal listener-admission abort and nonfinite or backwards clocks cannot issue success', async t => {
  const f = files(t), sdk = syntheticSdk(f.s), signal = new AbortController(); let writes = 0;
  const stream = new EventEmitter(); const once = stream.once.bind(stream);
  stream.once = (...args) => { const result = once(...args); signal.abort(); return result; }; stream.write = () => { writes++; return true; };
  const result = await clientModule.expertClientCommand(f.argv, { contract, packageRoot: packed.root, sdkModules: sdk.sdkModules, now: () => 0,
    signal: signal.signal, interrupts: new EventEmitter(), stdout: stream }); assert.equal(result.exitCode, 1); assert.equal(writes, 0);
  assert.throws(() => clientModule.createExpertClientBudget({ now: () => NaN }), /CLOCK/);
  let time = 2; const budget = clientModule.createExpertClientBudget({ now: () => time }); time = 1; assert.throws(() => budget.work(), /CLOCK/); budget.dispose();
});
