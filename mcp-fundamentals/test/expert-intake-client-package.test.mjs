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
import { prepareExpertIntake, EXPERT_INTAKE_LIMITS } from '../src/expert-intake-core.mjs';
import { packetContent } from '../../js/filing-facts-packet.js';

// Synthetic supplied files only. No additional SDK entry or authenticated person.
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const L = Object.freeze({ compressed: 262144, expanded: 2097152, members: 32, npmOutput: 65536,
  packMs: 20000, commandMs: 21000, closeMs: 2500, stdout: 4096, stderr: 8192, fixture: 32 * 1024 * 1024 });
const LIMITS = Object.freeze({ gold: 524288, intake: 65536, evidenceInventory: 32768, intakeSettings: 4096,
  evidence: 32768, evidenceTotal: 262144, evidenceCount: 64, inputCount: 68, inputTotal: 786432,
  report: 2097152, reportFile: 2097153, path: 4096, stdout: 4096, stderr: 1024 });
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
  'src/expert-intake-client.mjs': '16aaebba9e4d285fc706786e48683c80a09297cda141e0658b09947b9b4e9556',
  'src/expert-intake-stdio.mjs': '1cde7375eb1e63b381d9343373e55351b5efca4db27cb24e2e91a98e8515f0ae',"src/expert-intake-files.mjs": "68db164a80b8a37b8ed4ea9e3d4ffa0a42b43f8f6fcc28a91f7b97e702411a1f", "src/expert-submission-client.mjs": "2f6935f53821dcfee2a7cbae51e927672fb26c49c73353fc515ecb1096cceb31", "src/audit-inputs-client.mjs": "95fe942b1278768b4c938d82054d2d472eb3411c5587bdd8be4067b1dc0bc9b7", "src/audit-inputs-core.mjs": "e612ba0e44d12fd275b3e1dc0a2331bfe6fb005b4da8075e46ae009c5e299059", "src/audit-inputs-stdio.mjs": "537673fc03d0954ae480b239b8b481d11e14d763f1d0c07a985bb7d8fbd5b5c0", "src/canonical-json.mjs": "881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b", "src/expert-agreement.mjs": "80732bf61e1cef9bd3ff06cf831307675546f4789f8336f1668d5fd637a7b4ef", "src/expert-intake-core.mjs": "5095379afe5ca5be2c2fc8dc2fac191025c454f87e135d036b307f84bb57d545", "src/expert-submission-audit-core.mjs": "4040abc8f142d77571117979b73790be5a7ddb9bbf8fe6eee2fcb686ea9099f3", "src/expert-submission-files.mjs": "a5ed0b30f5338d3ed560f7fbc7cbb0e78966a56da188b72a8515ab077c4ea22d", "src/expert-submission-stdio.mjs": "56075a5daaa61bffbace0551aefe1220c372854ddca295b6adddd62abef65208", "src/filing-facts-packet.mjs": "74f2b353c0bf48d6e409d25925a6d691cf105a6f50aafdf561efbbbe679023c8", "src/server.mjs": "dd856068821d05648eb5f3ff6f2e2996cc165de2c9b6f1d24f506fbc29382d38"});
const BIN = Object.freeze({ 'canli-fundamentals-mcp': 'src/server.mjs', 'canli-fundamentals-audit': 'src/audit-inputs-stdio.mjs',
  'canli-expert-submission-audit': 'src/expert-submission-stdio.mjs', 'canli-fundamentals-audit-files': 'src/audit-inputs-client.mjs',
  'canli-expert-submission-files': 'src/expert-submission-files.mjs', 'canli-expert-submission-client': 'src/expert-submission-client.mjs', 'canli-expert-intake-files': 'src/expert-intake-files.mjs', 'canli-expert-intake-prepare': 'src/expert-intake-stdio.mjs', 'canli-expert-intake-client': 'src/expert-intake-client.mjs' });
const FILES = Object.freeze(['src', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md', 'EXPERT_INTAKE_FILES.md', 'EXPERT_INTAKE_STDIO.md', 'EXPERT_INTAKE_CLIENT.md']);
const MEMBERS = Object.freeze(['LICENSE', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md', 'EXPERT_INTAKE_FILES.md', 'EXPERT_INTAKE_STDIO.md', 'EXPERT_INTAKE_CLIENT.md', 'package.json', ...Object.keys(SOURCE_PINS)].map(p => 'package/' + p).sort());
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
  const frame = Buffer.from('# CANLI_EXPERT_INTAKE_CLIENT_PACKAGE_' + kind + ' ' + json + '\n');
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
const isClient=!!process.argv[1]&&fs.realpathSync(process.argv[1])===path.join(own,'consumer','node_modules','canli-fundamentals-mcp','src','expert-intake-client.mjs');
const originalSpawn=cp.spawn;let launches=0;
cp.spawn=(command,args,options)=>{const root=path.join(own,'consumer','node_modules','canli-fundamentals-mcp');
 if(!isClient||command!==process.execPath||JSON.stringify(args)!==JSON.stringify([path.join(root,'src','expert-intake-stdio.mjs')])||options.cwd!==root||options.shell!==false||++launches!==1)deny();
 const child=originalSpawn(command,args,options),pid=child.pid;process.stderr.write('OWNED_EXPERT_INTAKE_CLIENT_CHILD '+JSON.stringify({event:'start',pid})+'\\n');
 const write=child.stdin.write.bind(child.stdin);let calls=0,discoveries=0;
 child.stdin.write=(frame,...rest)=>{const message=JSON.parse(frame);if(message.method==='tools/call'){calls++;if(process.env.CANLI_INTAKE_CLIENT_REFUSAL==='one'){message.params.arguments.expected_gold_raw_sha256='0'.repeat(64);frame=Buffer.from(JSON.stringify(message)+'\\n');}}if(['tools/list','server/discover'].includes(message.method))discoveries++;return write(frame,...rest);};
 child.once('exit',(code,signal)=>process.stderr.write('OWNED_EXPERT_INTAKE_CLIENT_CHILD '+JSON.stringify({event:'exit',pid,code,signal,calls,discoveries})+'\\n'));return child;
};
for(const n of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[n]=deny;
${installOwnedFileGuard.toString()}
installOwnedFileGuard(fs,fsp,path,own,deny,new Map(${JSON.stringify([...readOnlyCacheAliases])}));
syncBuiltinESMExports();
for(const fn of[()=>fetch('https://invalid.invalid'),()=>fs.writeFileSync('/unallocated-expert-file-fixture','x'),()=>cp.spawn('unallocated',[])])try{fn();throw new Error('NOT_ARMED');}catch(e){if(e.code!=='NATIVE_DENIAL')throw e;}
if(count!==3)throw new Error('NOT_ARMED');controls=false;process.stderr.write('EXPERT_INTAKE_CLIENT_NATIVE_GUARD '+JSON.stringify({denied:3})+'\\n');
`; }

async function runProcess(command, args, { cwd, workMs, stdoutCap, stderrCap, extraEnv = {} }) {
  const started = performance.now();
  const child = nativeSpawn(command, args, { cwd, shell: false, env: { PATH: process.env.PATH, CI: 'true', ...extraEnv, NODE_OPTIONS: '--import=' + pathToFileURL(packed?.guard ?? path.join(TMP,'guard.mjs')).href }, stdio: ['ignore','pipe','pipe'] });
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
    assert.match(stderr, /^EXPERT_INTAKE_CLIENT_NATIVE_GUARD \{"denied":3\}\n/); assert.doesNotMatch(stderr, /DENIED_OPERATION|NOT_ARMED/);
    return { exitCode: end.code, stdout, stderr: stderr.replace(/^EXPERT_INTAKE_CLIENT_NATIVE_GUARD \{"denied":3\}\n/, '') };
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
    else if (name === 'package/src/expert-intake-client.mjs') {
      assert.equal(hash(row.bytes), SOURCE_PINS['src/expert-intake-client.mjs'], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['./expert-intake-core.mjs', './expert-intake-stdio.mjs', '@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio'], 'FIXED_DYNAMIC_IMPORTS');
      assert.ok(entries.has('package/src/expert-intake-core.mjs') && entries.has('package/src/expert-intake-stdio.mjs'), 'LOCAL_IMPORT');
    } else assert.equal(dynamic.length,0,'DYNAMIC');
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
  assert.deepEqual([...entries.keys()].sort(),MEMBERS,'MEMBERS'); assert.equal(imports(entries),15,'JS_COUNT');
  for(const[name,row]of entries) { assert.equal(row.mode,MODES[name],'MODE'); if(SOURCE_PINS[name.slice(8)])assert.equal(hash(row.bytes),SOURCE_PINS[name.slice(8)],'SOURCE'); assert.deepEqual(row.bytes,expectedBytes.get(name),'FROZEN_BYTES'); }
  const metadata=JSON.parse(entries.get('package/package.json').bytes);
  assert.deepEqual(metadata.bin,BIN,'BIN'); assert.deepEqual(metadata.files,FILES,'FILES');
  assert.equal(metadata.name,'canli-fundamentals-mcp'); assert.equal(metadata.version,'0.5.0'); assert.equal(metadata.private,false);
  assert.deepEqual(metadata.dependencies,{'@modelcontextprotocol/server':'2.1.0',zod:'4.6.5','@modelcontextprotocol/client':'2.1.0'});
  return metadata;
}
function marked(guide,label) {
  const begin=`<!-- EXPERT_INTAKE_CLIENT_${label}_BEGIN -->`,end=`<!-- EXPERT_INTAKE_CLIENT_${label}_END -->`;
  assert.equal(guide.split(begin).length,2); assert.equal(guide.split(end).length,2);
  const block=guide.split(begin)[1].split(end)[0].trim(); assert.match(block,/^```json\n[\s\S]+\n```$/);
  const raw=Buffer.from(block.slice(8,-4)+'\n'); JSON.parse(raw); return raw;
}
function guideScenario(guide) {
  const rawDocuments = { gold: marked(guide, 'GOLD'), intake: marked(guide, 'INTAKE'),
    evidenceInventory: marked(guide, 'EVIDENCE_INVENTORY'), intakeSettings: marked(guide, 'INTAKE_SETTINGS') };
  return { rawDocuments, rawGold: rawDocuments.gold, gold: JSON.parse(rawDocuments.gold),
    intake: JSON.parse(rawDocuments.intake), evidenceInventory: JSON.parse(rawDocuments.evidenceInventory),
    intakeSettings: JSON.parse(rawDocuments.intakeSettings), evidence: [] };
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
  const gold = { schema: 'canli.filing-facts-gold-packet.v0', guidelines: 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md',
    judgements: clone(choices), annotator: '', labels: Array.from({ length: 3 }, (_, index) => ({
      id: `software-intake-${index}`, template: 'lookup', company: 'SYNTHETIC SOFTWARE FIXTURE',
      question: `Synthetic question ${index}?`, answer: `${index} fictional units`,
      filings: [`https://example.invalid/software-intake/${index}`], question_clear: '', answer_matches_filing: '', citation_correct: '', notes: '' })) };
  const packet = hash(packetContent(gold)), roles = ['reviewer_a', 'reviewer_b', 'adjudicator'].map(role => ({
    role, handle: `synthetic-${role}`, aliases: [], affiliations: null, conflicts: null,
    identity_evidence_ids: [], independence_evidence_ids: [], qualifications: [] }));
  const s = { gold, rawGold: bytes(gold), evidence: [],
    intake: { schema: 'canli.filing-facts-expert-intake.v1', packet_sha256: packet, roles, sources: [] },
    evidenceInventory: { schema: 'canli.filing-facts-expert-evidence.v1', evidence: [] },
    intakeSettings: { schema: 'canli.filing-facts-expert-settings.v1', packet_sha256: packet,
      prepared_on: '2026-10-05', required_uses: ['human_review'], implementation_source_sha256: null } };
  for (let i = 0; i < evidence; i++) {
    const raw = Buffer.from(`SYNTHETIC DOCUMENT ${i}; no authenticated person or rights`); s.evidence.push(raw);
    s.evidenceInventory.evidence.push({ id: `evidence-${i}`, packet_sha256: packet, purpose: 'identity',
      subject: { role: 'reviewer_a', handle: roles[0].handle }, expected_sha256: hash(raw), expected_bytes: raw.length });
  }
  return s;
}
function capturedFor(s) {
  return { ...(s.rawDocuments ?? { gold: s.rawGold, intake: bytes(s.intake), evidenceInventory: bytes(s.evidenceInventory),
    intakeSettings: bytes(s.intakeSettings) }), evidence: s.evidence };
}
function coreArgs(s) { const c = capturedFor(s); return [c.gold, hash(c.gold), c.intake, c.evidenceInventory, c.evidence, c.intakeSettings]; }
const referenceFor = s => prepareExpertIntake(...coreArgs(s));
function files(t, s = scenario()) {
  const root = fs.mkdtempSync(join(TMP, 'native-input-')); fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const raw = capturedFor(s), paths = {}, inputs = [];
  for (const name of ['gold', 'intake', 'evidenceInventory', 'intakeSettings']) {
    paths[name] = join(root, name + '.json'); fs.writeFileSync(paths[name], raw[name], { flag: 'wx', mode: 0o600 });
    inputs.push(paths[name]); suppliedFixtureBytes += raw[name].length;
  }
  paths.evidence = s.evidence.map((raw, i) => {
    const p = join(root, `evidence-${i}.bin`); fs.writeFileSync(p, raw, { flag: 'wx', mode: 0o600 });
    inputs.push(p); suppliedFixtureBytes += raw.length; return p;
  });
  assert.ok(suppliedFixtureBytes < 12 * 1024 * 1024, 'finite total supplied fixture bytes');
  const out = join(root, 'private-report.json');
  const argv = ['--gold', paths.gold, '--expected-gold-sha256', hash(s.rawGold), '--intake', paths.intake,
    '--evidence-inventory', paths.evidenceInventory, '--intake-settings', paths.intakeSettings, '--out', out,
    ...paths.evidence.flatMap(p => ['--evidence', p])];
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
async function withOwnedSetup(action, onRefusal) {
  let complete = false;
  try { const result = await action(); complete = true; return result; }
  finally { if (!complete) await onRefusal(); }
}
before(async t => {
  TMP = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'canli-intake-sdk-client-')); fs.chmodSync(TMP, 0o700);
  await withOwnedSetup(async () => {
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
    clientModule = await import(pathToFileURL(path.join(root, 'src/expert-intake-client.mjs')).href);
    contract = await import(pathToFileURL(path.join(root, 'src/expert-intake-stdio.mjs')).href);
    const guide = entries.get('package/EXPERT_INTAKE_CLIENT.md').bytes.toString('utf8'), s = guideScenario(guide);
    assert.match(guide, new RegExp(hash(s.rawGold))); assert.equal(s.intakeSettings.packet_sha256, hash(packetContent(s.gold)));
    packed = { ...artifact, entries, metadata, raw, root, consumer, guard, binRoot, bins, guide, s };
    await diagnosticNow('ADMITTED', { admission: 'ADMITTED', compressed_sha256: raw.compressed_sha256,
      files: [...entries].map(([name, row]) => ({ path: name, mode: row.mode, bytes: row.bytes.length, sha256: hash(row.bytes) })),
      bins, dependency_cache_links: dependencyLinks.length, actual_npm_install: false, repository_runtime_links: 0 }, nativeDiagnosticWrite, { signal: t.signal });
  }, () => { try { unlinkOwnedDependencyLinks(); } finally { restore(); restore = () => {}; if (TMP) fs.rmSync(TMP, { recursive: true, force: true }); } });
}, { timeout: 25000 });
after(() => {
  try { unlinkOwnedDependencyLinks(); }
  finally { try { restore(); } finally { if (TMP) fs.rmSync(TMP, { recursive: true, force: true }); } }
  assert.equal(packEntries, 1); assert.ok(commandEntries <= 3); assert.ok(actualSdkChildren <= 3);
  assert.ok(closures.every(row => row.known && row.absent));
});
const cloneEntries = () => new Map([...packed.entries].map(([name, row]) => [name, { mode: row.mode, bytes: Buffer.from(row.bytes) }]));
function responseFor(s) {
  const report = referenceFor(s);
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
      assert.equal(parameters.maxBufferSize, 8388608); assert.equal(parameters.stderr, 'pipe');
      assert.deepEqual(parameters.args, [path.join(packed.root, 'src/expert-intake-stdio.mjs')]);
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
    close() { effects.transportCloses++; options.onTransportClose?.(); child?.emit('exit'); child?.emit('close'); this._process = undefined; return Promise.resolve(); }
  }
  class Client {
    constructor(identity, configuration) {
      assert.deepEqual(configuration.versionNegotiation, { mode: 'legacy' }); assert.equal(configuration.inputRequired.autoFulfill, false);
    }
    async connect(t) { this.transport = t; const pending = t.start(); returnedOriginal = pending === originalPending; await pending; options.connected?.(t); }
    async callTool(request, secondOptions) {
      effects.calls++; assert.equal(secondOptions.toolDefinition, contract.INTAKE_TOOL);
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
  const result = await clientModule.runExpertIntakeClientFiles(options.argv ?? f.argv, { filesystem: io.filesystem, packageRoot: packed.root,
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
  const raw = snapshot(f.out, 2097153); assert.equal(hash(raw), result.terminal.report_sha256); assert.equal(raw.at(-1), 10);
  assert.deepEqual(JSON.parse(raw), clone(referenceFor(f.s)));
  assert.equal(fs.lstatSync(f.out).mode & 0o777, 0o600); assert.equal(result.terminal.lifecycle.owned_child_absent, true);
  assert.equal(result.terminal.lifecycle.audit_calls, 1); assert.equal(result.terminal.lifecycle.close_attempts, 1);
  assert.equal(result.terminal.selected_n, f.s.gold.labels.length); assert.equal(result.terminal.syntactic_only, true);
}
function fakeSize(io, paths, sizes) {
  const beforeStat = io.filesystem.fstatSync, beforePath = io.filesystem.lstatSync;
  io.filesystem.fstatSync = (...args) => { const result = beforeStat(...args), path = io.held.get(args[0]); return sizes.has(path) ? { ...result, size: BigInt(sizes.get(path)), isFile: () => true } : result; };
  io.filesystem.lstatSync = (...args) => { const result = beforePath(...args); return sizes.has(args[0]) ? { ...result, size: BigInt(sizes.get(args[0])), isFile: () => true } : result; };
}
async function actualCommand(t, kind) {
  assert.ok(++commandEntries <= 3);
  const f = files(t, guideScenario(packed.guide));
  const entry = kind === 'alias' ? path.join(packed.binRoot, 'canli-expert-intake-client') : path.join(packed.root, 'src/expert-intake-client.mjs');
  const result = await runProcess(entry, f.argv, { cwd: packed.consumer, workMs: L.commandMs, stdoutCap: 4096, stderrCap: 8192,
    extraEnv: kind === 'refusal' ? { CANLI_INTAKE_CLIENT_REFUSAL: 'one' } : {} });
  const lines = result.stderr.split('\n');
  const events = lines.filter(line => line.startsWith('OWNED_EXPERT_INTAKE_CLIENT_CHILD ')).map(line => JSON.parse(line.slice('OWNED_EXPERT_INTAKE_CLIENT_CHILD '.length)));
  assert.equal(events.length, 2); assert.equal(events[0].event, 'start'); assert.equal(events[1].event, 'exit');
  assert.equal(events[0].pid, events[1].pid); assert.equal(events[1].calls, 1); assert.equal(events[1].discoveries, 0);
  assert.equal(absent(events[0].pid), true); actualSdkChildren++;
  const terminalText = kind === 'refusal' ? lines.filter(line => !line.startsWith('OWNED_EXPERT_INTAKE_CLIENT_CHILD ') && !line.startsWith('EXPERT_INTAKE_CLIENT_NATIVE_GUARD ')).join('\n') : result.stdout;
  assert.equal(terminalText.split('\n').length, 2); const terminal = JSON.parse(terminalText);
  assert.equal(result.exitCode, kind === 'refusal' ? 1 : 0);
  assert.equal(terminal.lifecycle.owned_pid, events[0].pid); assert.equal(terminal.lifecycle.owned_child_absent, true);
  for (const [key, limit] of [['work_ms',15000],['closure_ms',5000],['total_ms',20000]]) assert.ok(terminal.lifecycle[key] >= 0 && terminal.lifecycle[key] <= limit);
  if (kind === 'refusal') { assert.equal(result.stdout, ''); refused({exitCode:1,terminal}, 'TOOL_REFUSED'); assert.equal(fs.existsSync(f.out), false); }
  else saved(f, {exitCode:0,terminal});
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_RAW_|SYNTHETIC_EXCEPTION|DENIED_OPERATION/);
  t.diagnostic('CANLI_EXPERT_INTAKE_CLIENT_ENTRY ' + JSON.stringify({entry:commandEntries,kind,owned_server_pid:events[0].pid,owned_server_absent:true,calls:1,discoveries:0,lifecycle:terminal.lifecycle,
    injected_wire_expected_SHA_only:kind==='refusal',actual_npm_install:false}));
}

class NativeOutput extends EventEmitter {
  constructor(write = () => true) { super(); this.frames = []; this.native = write; }
  write(frame) { this.frames.push(Buffer.from(frame)); return this.native(frame, this); }
}
function writerScope(budget, state = {}) {
  return { observe() { budget.work(); if (state.closed || state.exited) { budget.fail('CHILD_UNCERTAIN'); throw new Error('CHILD_UNCERTAIN'); } },
    remaining: () => budget.remaining(), onFailure: f => budget.onFailure(f), fail: () => budget.fail('CALL'), close: () => { state.closed = true; budget.fail('CHILD_UNCERTAIN'); }, get failure() {return budget.failure;} };
}
function checkReply(s, reply) { return clientModule.validateExpertIntakeClientReply(reply, referenceFor(s), contract); }
function noProgress(io, sdk) {
  assert.equal(io.events.filter(e => e.operation === 'readSync').length, 0);
  assert.equal(io.events.filter(e => e.operation === 'openSync' && (e.args[1] & fs.constants.O_CREAT)).length, 0);
  assert.equal(sdk.effects.starts, 0); assert.equal(sdk.effects.calls, 0);
}
async function withOwnedInputs(t, s, options) { return run(t, s, options); }
function checksum(header) {
  header.fill(32,148,156); const n = header.reduce((a,b)=>a+b,0);
  header.write(n.toString(8).padStart(6,'0')+'\0 ',148,'ascii');
}
test('intake client package: marked guide inputs are independently valid JSON and bind exact original same-gold buffers', () => {
  const s = guideScenario(packed.guide), c = coreArgs(s); assert.equal(c.length,6);
  assert.equal(hash(c[0]), hash(marked(packed.guide,'GOLD'))); assert.equal(s.gold.labels.length,6);
  assert.match(packed.guide,new RegExp(hash(c[0]))); assert.equal(referenceFor(s).coverage.selected_n,6);
  for (const name of ['GOLD','INTAKE','EVIDENCE_INVENTORY','INTAKE_SETTINGS']) assert.equal(marked(packed.guide,name).at(-1),10);
});

test('intake client package: one guarded offline pack captures RAW before strict26 nine-bin member mode and source admission', async () => {
  assert.equal(packEntries,1); assert.equal(packed.entries.size,26); assert.equal(Object.keys(packed.metadata.bin).length,9);
  assert.equal(imports(packed.entries),15); assert.equal(packed.raw.admission,'RAW_CAPTURED_NOT_ADMITTED');
  assert.deepEqual(admit(cloneEntries()),packed.metadata);
  const frames=[]; const value={v:'x'.repeat(8192)}; let offset=0;
  const total=await diagnosticNow('RAW',value,(fd,b,o,n)=>{assert.equal(o,offset);const count=Math.min(n,127);frames.push(Buffer.from(b.subarray(o,o+count)));offset+=count;return count;});
  assert.equal(total,offset); assert.match(Buffer.concat(frames).toString(),/CANLI_EXPERT_INTAKE_CLIENT_PACKAGE_RAW/);
  let writes=0,time=0; await assert.rejects(Promise.resolve().then(()=>diagnosticNow('RAW',{toJSON(){time=1001;return {}; }},()=>{writes++;return 1;},{now:()=>time})),/DEADLINE/);assert.equal(writes,0);
  assert.throws(()=>diagnosticNow('RAW',{},()=>0),/WRITE/); assert.throws(()=>diagnosticNow('RAW',{},()=>{const e=new Error();e.code='EPIPE';throw e;}));
});

test('intake client package: bounded single-member gzip rejects CRC ISIZE trailing data and compressed or expanded overflow before unpack', () => {
  for(const raw of [Buffer.concat([packed.compressed,Buffer.from([0])]),Buffer.concat([packed.compressed,packed.compressed]),Buffer.alloc(L.compressed+1)])assert.throws(()=>tarEntries(raw));
  const bad=Buffer.from(packed.compressed);bad[bad.length-8]^=1;assert.throws(()=>tarEntries(bad),/CRC/);
  const isize=Buffer.from(packed.compressed);isize[isize.length-4]^=1;assert.throws(()=>tarEntries(isize),/ISIZE/);
  assert.throws(()=>tarEntries(gzipSync(Buffer.alloc(L.expanded+512))));assert.equal(tarEntries(packed.compressed).size,26);
});

test('intake client package: checksum-valid high-bit TAR fields duplicate members links traversal and mode changes refuse before writes', () => {
  const inflated=inflateRawSync(packed.compressed.subarray(10));
  for(const change of [h=>{h[0]|=128;},h=>{h[156]=50;},h=>{h.write('package/../bad',0,'ascii');}]) {
    const raw=Buffer.from(inflated),header=raw.subarray(0,512);change(header);checksum(header);assert.throws(()=>tarEntries(gzipSync(raw)));
  }
  const mode=cloneEntries();mode.get('package/src/expert-intake-client.mjs').mode=0o644;assert.throws(()=>admit(mode),/MODE/);
  const duplicate=Buffer.concat([inflated.subarray(0,512+Math.ceil(packed.entries.values().next().value.bytes.length/512)*512),inflated]);assert.throws(()=>tarEntries(gzipSync(duplicate)));
});

test('intake client package: all15 JS-MJS modules and literal imports close within the artifact with unchanged existing source pins', () => {
  assert.equal(imports(cloneEntries()),15);
  for(const p of ['package/src/expert-intake-core.mjs','package/src/expert-intake-stdio.mjs']){const rows=cloneEntries();rows.delete(p);assert.throws(()=>imports(rows),/LOCAL_IMPORT/);}
  const changed=cloneEntries();changed.get('package/src/expert-intake-client.mjs').bytes=Buffer.from('import x from "../foreign.mjs";');assert.throws(()=>imports(changed),/SOURCE|LOCAL_IMPORT/);
});

test('intake client package: parent and child guards positively deny network foreign writes and cache-alias mutation', async () => {
  const before=denied;assert.throws(()=>fetch('https://invalid.invalid'),/NATIVE_DENIAL/);assert.throws(()=>fs.writeFileSync('/unallocated-intake-test','x'),/NATIVE_DENIAL/);
  const own=path.join(TMP,'guard-positive');fs.writeFileSync(own,'x',{flag:'wx',mode:0o600});assert.equal(snapshot(own).toString(),'x');
  assert.throws(()=>fs.renameSync(own,'/unallocated-intake-test'),/NATIVE_DENIAL/);assert.ok(denied>=before+3);fs.unlinkSync(own);
  const foreign=path.join(TMP,'foreign-cache-alias');assert.throws(()=>fs.symlinkSync(ROOT,foreign),/NATIVE_DENIAL/);
  assert.throws(()=>fs.writeFileSync(path.join(dependencyLinks[0].path,'bad'),'x'),/NATIVE_DENIAL/);
  const invalid=Buffer.concat([Buffer.from(path.join(TMP,'bad-utf8-')),Buffer.from([255])]);assert.throws(()=>fs.writeFileSync(invalid,'x'),/NATIVE_DENIAL/);
  // Unknown aliases are denied; only the separately recorded cache links need cleanup.
});

test('intake client native: exact scalar flag grammar primitive lowercase SHA and ordered evidence refuse coercion or hidden keys', async t => {
  const good=files(t), sdk=syntheticSdk(good.s),io=instrument();
  for(const args of [good.argv.slice(2),[...good.argv,'--root',packed.root],[...good.argv,'--gold',good.paths.gold],[...good.argv.slice(0,3),[good.argv[3]],...good.argv.slice(4)]]) {
    refused(await clientModule.runExpertIntakeClientFiles(args,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0}));
  }
  assert.equal(io.events.length,0);assert.equal(sdk.effects.starts,0);assert.deepEqual(clientModule.parseExpertIntakeClientArgs(good.argv).evidence,[]);
});

test('intake client native: all68 FD count and individual metadata admission precedes any payload read base64 SDK or output effect', async t => {
  const f=files(t,scenario({evidence:64})),io=instrument(),sdk=syntheticSdk(f.s);
  fakeSize(io,f.inputs,new Map([[f.paths.evidence.at(-1),32769]]));
  const r=await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0});refused(r,'CLI_INPUT_BOUND');noProgress(io,sdk);
  assert.equal(io.held.size,0);assert.equal(io.events.filter(e=>e.operation==='openSync').length,68);
});

test('intake client native: evidence group and768KiB aggregate admission remain independent of valid individual file sizes', async t => {
  const f=files(t,scenario({evidence:9})),io=instrument(),sdk=syntheticSdk(f.s);fakeSize(io,f.inputs,new Map(f.paths.evidence.map(p=>[p,32768])));
  const r=await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0});refused(r,'CLI_EVIDENCE_BOUND');noProgress(io,sdk);
  const p=files(t,scenario({evidence:8})),i=instrument(),s=syntheticSdk(p.s),sizes=new Map([[p.paths.gold,524288],[p.paths.intake,65536],[p.paths.evidenceInventory,32768],[p.paths.intakeSettings,4096],...p.paths.evidence.map(q=>[q,32768])]);fakeSize(i,p.inputs,sizes);
  refused(await clientModule.runExpertIntakeClientFiles(p.argv,{filesystem:i.filesystem,contract,sdkModules:s.sdkModules,now:()=>0}),'CLI_TOTAL_BOUND');noProgress(i,s);
});

test('intake client native: input aliases symlinks hardlinks foreign ownership and noncanonical private parents refuse without body reads', async t => {
  for(const kind of ['hardlink','symlink','parent']){const f=files(t),io=instrument(),sdk=syntheticSdk(f.s);
    if(kind==='parent')fs.chmodSync(f.root,0o755);else{fs.unlinkSync(f.paths.intake);(kind==='hardlink'?fs.linkSync:fs.symlinkSync)(f.paths.gold,f.paths.intake);}
    refused(await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0}));noProgress(io,sdk);fs.chmodSync(f.root,0o700);
  }
  const foreign=files(t),other=instrument(),fake=syntheticSdk(foreign.s),fstat=other.filesystem.fstatSync;
  other.filesystem.fstatSync=(fd,...args)=>{const value=fstat(fd,...args);return other.held.get(fd)===foreign.paths.gold?{...value,uid:value.uid+1n,isFile:()=>true}:value;};
  refused(await clientModule.runExpertIntakeClientFiles(foreign.argv,{filesystem:other.filesystem,contract,sdkModules:fake.sdkModules,now:()=>0}),'CLI_INPUT_BOUND');noProgress(other,fake);
  const linked=files(t),alias=path.join(TMP,'input-parent-alias');fs.symlinkSync(linked.root,alias);
  const args=[...linked.argv];args[1]=path.join(alias,'gold.json');const probe=instrument(),mock=syntheticSdk(linked.s);
  try{refused(await clientModule.runExpertIntakeClientFiles(args,{filesystem:probe.filesystem,contract,sdkModules:mock.sdkModules,now:()=>0}));noProgress(probe,mock);}finally{fs.unlinkSync(alias);}
});

test('intake client native: partial reads handle short buffers and admit one EOF overflow byte without unbounded allocation', async t => {
  const f=files(t),short=instrument({readSync(e,n){return n();}}),sdk=syntheticSdk(f.s);const native=short.filesystem.readSync;
  short.filesystem.readSync=(fd,b,o,n,p)=>native(fd,b,o,Math.min(n,7),p);
  saved(f,await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:short.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0}));
  for(const mode of ['eof','overflow']){const g=files(t),io=instrument({readSync(e,n){return mode==='eof'?0:e.args[4]===fs.fstatSync(e.fd).size?1:n();}}),s=syntheticSdk(g.s);
    refused(await clientModule.runExpertIntakeClientFiles(g.argv,{filesystem:io.filesystem,contract,sdkModules:s.sdkModules,now:()=>0}),'CLI_READ');assert.equal(s.effects.starts,0);}
});

test('intake client native: same-FD and post-path changes after later input captures refuse before the child starts', async t => {
  const f=files(t);let mutated=false;const io=instrument({readSync(e,n){const v=n();if(!mutated&&e.path===f.paths.intake){mutated=true;fs.appendFileSync(f.paths.gold,' ');}return v;}}),sdk=syntheticSdk(f.s);
  refused(await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0}),'CLI_INPUT_CHANGED');assert.equal(mutated,true);assert.equal(sdk.effects.starts,0);
});

test('intake client native: descriptor ownership is relinquished before single close even after real numeric FD reuse', async t => {
  const f=files(t),foreign=path.join(f.root,'unrelated');fs.writeFileSync(foreign,'x');let reused,attempts=0;
  const io=instrument({closeSync(e,n){if(e.path===f.paths.gold){attempts++;n();reused=fs.openSync(foreign,'r');assert.equal(reused,e.fd);throw new Error('SYNTHETIC_EXCEPTION');}return n();}}),sdk=syntheticSdk(f.s);
  try{refused(await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0}),'CLI_CLOSE');assert.equal(attempts,1);assert.ok(fs.fstatSync(reused).isFile());assert.equal(sdk.effects.starts,0);}finally{if(reused!==undefined)fs.closeSync(reused);}
});

test('intake client native: request fields preserve exactly four captured mandatory buffers and ordered opaque evidence', () => {
  const s=scenario({evidence:2}),c=capturedFor(s),r=clientModule.buildExpertIntakeClientRequest(c,hash(c.gold));
  assert.deepEqual(Object.keys(r),['name','arguments']);assert.equal(r.name,'filingfacts_prepare_expert_intake');assert.equal(Object.keys(r.arguments).length,6);
  for(const[k,b]of [['gold_base64',c.gold],['intake_base64',c.intake],['evidence_inventory_base64',c.evidenceInventory],['intake_settings_base64',c.intakeSettings]])assert.deepEqual(Buffer.from(r.arguments[k],'base64'),b);
  assert.deepEqual(r.arguments.evidence_base64,c.evidence.map(b=>b.toString('base64')));
});

test('intake client native: canonical base64 and raw two-param six-argument keysets are admitted before any SDK projection', () => {
  const s=scenario(),r=clientModule.buildExpertIntakeClientRequest(capturedFor(s),hash(s.rawGold));assert.deepEqual(clientModule.admitExpertIntakeClientParams(r,contract),r);
  for(const mutate of [x=>{x.foreign=true;},x=>{Object.defineProperty(x,'__proto__',{value:{},enumerable:true});},x=>{Object.defineProperty(x.arguments,'__proto__',{value:'x',enumerable:true});},x=>{x.arguments.gold_base64='Zg===';},x=>{x.arguments.evidence_base64=['Zh=='];}]){const v=clone(r);mutate(v);assert.throws(()=>clientModule.admitExpertIntakeClientParams(v,contract));}
});

test('intake client native: actual UTF8 request-frame bytes including escaped fields and LF refuse before native transmission', async t => {
  const output=new NativeOutput(),budget=clientModule.createExpertIntakeClientBudget({now:()=>0});
  const writer=contract.createIntakeNativeWriter(output,{frameBytes:2097152});await writer.send({jsonrpc:'2.0',id:1,method:'tools/call',params:{v:'x'}},writerScope(budget));assert.equal(output.frames[0].at(-1),10);
  await assert.rejects(writer.send({jsonrpc:'2.0',id:2,params:{v:'\0'.repeat(400000)}},writerScope(budget)));assert.equal(output.frames.length,1);budget.dispose();
});

test('intake client native: a bounded stable tool refusal cannot become success expose supplied bytes or trigger discovery retry', async t => {
  const s=scenario(),r=await run(t,s,{controls:{reply:()=>({isError:true,content:[{type:'text',text:'PRIVATE_RAW_SERVER_EXCEPTION'}]})}});refused(r.result,'TOOL_REFUSED');assert.equal(r.sdk.effects.calls,1);assert.equal(r.sdk.effects.starts,1);assert.equal(fs.existsSync(r.f.out),false);
});

test('intake client native: malformed structuredContent JSON text extra keys and mismatched complete report representations refuse', () => {
  const s=scenario();checkReply(s,responseFor(s));
  for(const mutate of [r=>{r.content.push({type:'text',text:'extra'});},r=>{r.extra='x';},r=>{r.content[0].text+=' ';},r=>{r.structuredContent.schema='unknown';}]){const r=responseFor(s);mutate(r);assert.throws(()=>checkReply(s,r));}
});

test('intake client native: selected-N roles items sources and task worklists cannot shrink while returning recomputed content hashes', () => {
  const s=scenario();for(const mutate of [r=>{r.coverage.selected_n--;},r=>{r.review_packets.pop();},r=>{r.role_worklists.pop();},r=>{r.source_worklists.push({foreign:true});}]){assert.throws(()=>checkReply(s,rehashed(s,mutate)));}checkReply(s,responseFor(s));
});

test('intake client native: both reviewer packets retain exactly the same complete blank gold and the distinct adjudicator worklist', () => {
  const s=scenario(),r=checkReply(s,responseFor(s));assert.equal(r.review_packets.length,2);assert.equal(r.adjudication.blank_submission.decisions.length,0);
  for(const packet of r.review_packets)assert.equal(JSON.stringify(packet).includes('"question_clear":"yes"'),false);
  const bad=rehashed(s,x=>{x.review_packets[0].packet.labels[0].notes='invented';});assert.throws(()=>checkReply(s,bad));
});

test('intake client native: qualification conflicts source-use evidence references and opaque evidence retain complete mechanical inventory', () => {
  const s=scenario({evidence:2}),r=responseFor(s);assert.equal(checkReply(s,r).evidence_inventory.length,2);
  for(const mutate of [x=>{x.role_worklists[0].tasks.pop();},x=>{x.evidence_inventory.pop();},x=>{x.intake=undefined;}]){assert.throws(()=>checkReply(s,rehashed(s,mutate)));}
});

test('intake client native: rehashed report changes are checked against unchanged-core same-buffer reference preparation', async t => {
  let references=0;const s=scenario(),sdk=syntheticSdk(s),r=await run(t,s,{sdk,dependencies:{core:{EXPERT_INTAKE_LIMITS,prepareExpertIntake(...args){references++;return prepareExpertIntake(...args);}}}});saved(r.f,r.result);assert.equal(references,1);assert.equal(sdk.effects.kernels,1);
  const bad=await run(t,s,{controls:{reply:()=>rehashed(s,x=>{x.interpretation+=' altered';})}});refused(bad.result);assert.equal(fs.existsSync(bad.f.out),false);
});

test('intake client native: raw byte bindings packet SHA and declaration fields cannot be repaired or bound only to altered companions', () => {
  const s=scenario();for(const mutate of [r=>{r.bindings.gold.sha256='0'.repeat(64);},r=>{r.expected_gold_raw_sha256='0'.repeat(64);},r=>{r.packet_sha256='0'.repeat(64);},r=>{r.implementation.declared_module_sha256='1'.repeat(64);}])assert.throws(()=>checkReply(s,rehashed(s,mutate)));checkReply(s,responseFor(s));
});

test('intake client native: real human expertise independence rights labels agreement and admission remain null and source declarations unverified', () => {
  const s=scenario(),r=checkReply(s,responseFor(s));assert.equal(r.implementation.declared_module_sha256_verified,false);assert.ok(Object.values(r.established).every(v=>v===null));
  for(const mutate of [x=>{x.established.verified_experts_n=1;},x=>{x.role_worklists[0].authenticated_human=true;},x=>{x.implementation.declared_module_sha256_verified=true;}])assert.throws(()=>checkReply(s,rehashed(s,mutate)));
});

test('intake client native: all absolute clocks reject nonfinite or backwards values and late callback completion before progress', async t => {
  for(const value of [NaN,Infinity])assert.throws(()=>clientModule.createExpertIntakeClientBudget({now:()=>value}),/CLOCK/);
  let time=4;const b=clientModule.createExpertIntakeClientBudget({now:()=>time});time=3;assert.throws(()=>b.work(),/CLOCK/);b.dispose();
  let n=0;const s=scenario();const r=await run(t,s,{controls:{callPending(){n=15000;return Promise.resolve(responseFor(s));}},dependencies:{now:()=>n}});refused(r.result,'WORK_DEADLINE');assert.equal(fs.existsSync(r.f.out),false);
});

test('intake client native: serialization crossing work deadline abort closed or exited state prevents the final captured native write', async () => {
  for(const mode of ['deadline','abort','closed','exited']){let time=0;const abort=new AbortController(),budget=clientModule.createExpertIntakeClientBudget({now:()=>time,signal:abort.signal}),state={},out=new NativeOutput();time=14999.5;
    const writer=contract.createIntakeNativeWriter(out,{serialize(message){if(mode==='deadline')time=15000.5;else if(mode==='abort')abort.abort();else state[mode]=true;return JSON.stringify(message);},frameBytes:2097152});
    await assert.rejects(writer.send({jsonrpc:'2.0',id:1,params:{}},writerScope(budget,state)));assert.equal(out.frames.length,0);budget.dispose();}
  const b=clientModule.createExpertIntakeClientBudget({now:()=>0}),o=new NativeOutput();await contract.createIntakeNativeWriter(o).send({jsonrpc:'2.0',id:1},writerScope(b));assert.equal(o.frames.length,1);b.dispose();
});

test('intake client native: a false native write waits on one bounded drain without repeating the transmitted frame', async () => {
  const b=clientModule.createExpertIntakeClientBudget({now:()=>0}),o=new NativeOutput(()=>false);let complete=false;
  const pending=contract.createIntakeNativeWriter(o).send({jsonrpc:'2.0',id:1},writerScope(b)).then(()=>{complete=true;});await Promise.resolve();assert.equal(complete,false);assert.equal(o.frames.length,1);o.emit('drain');await pending;assert.equal(o.frames.length,1);b.dispose();
});

test('intake client native: original startup and task Promise outcomes are owned before fallible post-callback or child-field observation', async t => {
  for(const delayed of [false,true]){const s=scenario(),sdk=syntheticSdk(s,{pidThrows:true,startPending:()=>delayed?new Promise((_,no)=>setTimeout(()=>no(new Error('PRIVATE_RAW_START')),1)):Promise.reject(new Error('PRIVATE_RAW_START'))});
    const r=await run(t,s,{sdk});refused(r.result);await new Promise(yes=>setTimeout(yes,5));assert.equal(sdk.effects.starts,1);assert.equal(sdk.effects.calls,0);}
  let time=0;const r=await run(t,scenario(),{controls:{callPending(){time=15000;return new Promise((_,no)=>setTimeout(()=>no(new Error('PRIVATE_RAW_TASK')),1));}},dependencies:{now:()=>time}});refused(r.result);await new Promise(yes=>setTimeout(yes,5));
});

test('intake client native: explicit legacy negotiation exact second-options toolDefinition and one call prohibit hidden list retry or sibling child', async t => {
  const r=await run(t);saved(r.f,r.result);assert.equal(r.sdk.effects.starts,1);assert.equal(r.sdk.effects.calls,1);assert.equal(r.sdk.effects.kernels,1);assert.equal(r.sdk.returnedOriginal(),true);assert.equal(r.sdk.frames.length,1);
  const message=JSON.parse(r.sdk.frames[0]);assert.equal(message.method,'tools/call');assert.equal(message.params.name,'filingfacts_prepare_expert_intake');
});

test('intake client native: memoized close publishes ownership before reentrant or failing callbacks and closes only the owned child', async () => {
  const s=scenario(),budget=clientModule.createExpertIntakeClientBudget({now:()=>0});let ops,reentered;
  const sdk=syntheticSdk(s,{onTransportClose(){reentered=ops.close();}});
  ops=clientModule.createExpertIntakeSdkOperations(packed.root,budget,contract,{sdkModules:sdk.sdkModules});await ops.connect({signal:budget.signal,timeout:1000});
  const original=sdk.transport().close; // Captured memoized wrapper itself is stable.
  const a=ops.close(),b=ops.close();assert.equal(a,b);assert.equal(a,reentered);await a;assert.equal(sdk.effects.clientCloses,1);assert.equal(sdk.effects.transportCloses,1);assert.equal(typeof original,'function');budget.dispose();
});

test('intake client native: a resolved close without terminal evidence and known owned PID absence refuses success', async t => {
  const s=scenario(),f=files(t),io=instrument();let closeCalls=0;
  const operations={connect:async()=>{},callTool:async()=>responseFor(s),close:async()=>{closeCalls++;return {owned_pid:123,owned_child_absent:null,evidence:'unknown'};}};
  const r=await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:io.filesystem,contract,operations,now:()=>0});refused(r,'CHILD_UNCERTAIN');assert.equal(closeCalls,1);assert.equal(fs.existsSync(f.out),false);
});

test('intake client native: first abort process signal and delayed rejection remain sticky across closure and partial output', async t => {
  const abort=new AbortController(),s=scenario(),r=await run(t,s,{controls:{callPending(){abort.abort();return Promise.reject(new Error('PRIVATE_RAW_AFTER_ABORT'));}},dependencies:{signal:abort.signal}});refused(r.result,'ABORTED');assert.equal(r.sdk.effects.calls,1);assert.equal(fs.existsSync(r.f.out),false);
});

test('intake client native: complete two-MiB report plus LF admits before private unused0600 O_EXCL output creation', async t => {
  const f=files(t);fs.writeFileSync(f.out,'ORIGINAL',{flag:'wx',mode:0o600});const io=instrument(),sdk=syntheticSdk(f.s);
  refused(await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0}),'CLI_OUTPUT');noProgress(io,sdk);assert.equal(snapshot(f.out).toString(),'ORIGINAL');
  const s=scenario(),bad=responseFor(s);bad.structuredContent.padding='x'.repeat(2097153);bad.content[0].text=JSON.stringify(bad.structuredContent);assert.throws(()=>checkReply(s,bad));
});

test('intake client native: short writes flush readback or replacement uncertainty retain partial output without unlink overwrite or retry', async t => {
  for(const fault of ['write','flush','readback']){const f=files(t);let writes=0;const io=instrument({writeSync(e,n){if(e.path===f.out&&fault==='write'){writes++;if(writes===1)return fs.writeSync(e.fd,e.args[1],e.args[2],3,e.args[4]);throw new Error('PRIVATE_RAW_WRITE');}return n();},fsyncSync(e,n){if(e.path===f.out&&fault==='flush')throw new Error('PRIVATE_RAW_FLUSH');return n();},readSync(e,n){if(e.path===f.out&&fault==='readback')return 0;return n();}}),sdk=syntheticSdk(f.s);
    const r=await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0});refused(r);assert.equal(fs.existsSync(f.out),true);assert.equal(io.events.filter(e=>e.operation==='openSync'&&e.path===f.out).length,1);}
});

test('intake client native: directory durability and output close after FD reuse are mandatory before success', async t => {
  const f=files(t);let reused,closes=0;const foreign=path.join(f.root,'unrelated');fs.writeFileSync(foreign,'x');
  const io=instrument({closeSync(e,n){if(e.path===f.out){closes++;n();reused=fs.openSync(foreign,'r');assert.equal(reused,e.fd);throw new Error('PRIVATE_RAW_CLOSE');}return n();}}),sdk=syntheticSdk(f.s);
  try{refused(await clientModule.runExpertIntakeClientFiles(f.argv,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,now:()=>0}),'CLI_CLOSE');assert.equal(closes,1);assert.ok(fs.fstatSync(reused).isFile());assert.equal(fs.existsSync(f.out),true);}finally{if(reused!==undefined)fs.closeSync(reused);}
  const g=files(t),i=instrument({fsyncSync(e,n){if(e.path===g.root)throw new Error('PRIVATE_RAW_DIR');return n();}}),s=syntheticSdk(g.s);refused(await clientModule.runExpertIntakeClientFiles(g.argv,{filesystem:i.filesystem,contract,sdkModules:s.sdkModules,now:()=>0}),'CLI_FLUSH');assert.equal(fs.existsSync(g.out),true);
});

test('intake client native: final terminal admission observes closure and total clocks and emits bounded no-echo summaries only', async t => {
  const f=files(t),sdk=syntheticSdk(f.s),io=instrument(),out=new EventEmitter();let nativeWrites=0,time=0;
  out.write=()=>{nativeWrites++;return true;};const interrupts=new EventEmitter();
  const r=await clientModule.expertIntakeClientCommand(f.argv,{filesystem:io.filesystem,contract,sdkModules:sdk.sdkModules,packageRoot:packed.root,now:()=>time,stdout:out,stderr:out,interrupts,serializeTerminal(value){time=20001;return JSON.stringify(value);}});
  assert.equal(r.exitCode,1);assert.equal(nativeWrites,0);assert.equal(r.written,false);assert.equal(interrupts.listenerCount('SIGINT'),0);assert.equal(interrupts.listenerCount('SIGTERM'),0);
});

test('intake client package: SDK entry1 shares the exact marked-guide installed file workflow with one prepare call and known owned close', {timeout:25000}, async t => {await actualCommand(t,'guide');assert.equal(commandEntries,1);assert.equal(actualSdkChildren,1);});

test('intake client package: SDK entry2 absolute owned bin alias preserves full report and direct-entry closure parity', {timeout:25000}, async t => {await actualCommand(t,'alias');assert.equal(commandEntries,2);assert.equal(actualSdkChildren,2);});

test('intake client package: SDK entry3 bounded admitted server refusal retains one-child ownership without hidden follow-up or input echo', {timeout:25000}, async t => {await actualCommand(t,'refusal');assert.equal(commandEntries,3);assert.equal(actualSdkChildren,3);assert.equal(closures.length,4);});

test('intake client package: hook refusal restores native guards in unconditional finally and all seven old artifact expectation inverses preserve names bodies and caps', async () => {
  const temp=fs.mkdtempSync(path.join(TMP,'forced-hook-refusal-')), armedSpawn=cp.spawn;let restored=0;
  await assert.rejects(withOwnedSetup(async()=>{cp.spawn=()=>{throw new Error('FORCED_SETUP_STOP');};throw new Error('FORCED_SETUP_STOP');},()=>{restored++;cp.spawn=armedSpawn;fs.rmSync(temp,{recursive:true,force:true});}),/FORCED_SETUP_STOP/);
  assert.equal(restored,1);assert.equal(cp.spawn,armedSpawn);assert.equal(fs.existsSync(temp),false);
  let successfulCleanup=0;await withOwnedSetup(async()=>true,()=>{successfulCleanup++;});assert.equal(successfulCleanup,0);
  const text=snapshot(path.join(ROOT,'test','expert-intake-client-package.test.mjs'),512*1024).toString();assert.match(text,/finally \{/);assert.match(text,/if \(!complete\)/);assert.match(text,/unlinkOwnedDependencyLinks\(\)/);
  const families={'audit-package.test.mjs':22,'expert-submission-package.test.mjs':30,'audit-inputs-client-package.test.mjs':38,'expert-submission-files-package.test.mjs':40,'expert-submission-client-package.test.mjs':40,'expert-intake-files-package.test.mjs':39,'expert-intake-stdio-package.test.mjs':38};
  for(const[name,count]of Object.entries(families)){const source=snapshot(path.join(ROOT,'test',name),512*1024).toString();assert.equal([...source.matchAll(/^test\('/gm)].length,count);assert.ok(source.includes(SOURCE_PINS['src/expert-intake-client.mjs']));}
  const data=JSON.parse(snapshot(path.join(ROOT,'package.json'))),inverse=clone(data);delete inverse.bin['canli-expert-intake-client'];inverse.files=inverse.files.filter(x=>x!=='EXPERT_INTAKE_CLIENT.md');assert.equal(Object.keys(inverse.bin).length,8);assert.equal(inverse.files.length,9);
});
