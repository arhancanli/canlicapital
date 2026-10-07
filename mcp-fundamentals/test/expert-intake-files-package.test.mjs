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
let prepareExpertIntake, EXPERT_INTAKE_LIMITS, packetContent;

// Synthetic supplied files only. No additional SDK entry or authenticated person.
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
  'src/expert-intake-stdio.mjs': '1cde7375eb1e63b381d9343373e55351b5efca4db27cb24e2e91a98e8515f0ae',"src/expert-intake-files.mjs": "68db164a80b8a37b8ed4ea9e3d4ffa0a42b43f8f6fcc28a91f7b97e702411a1f", "src/expert-submission-client.mjs": "2f6935f53821dcfee2a7cbae51e927672fb26c49c73353fc515ecb1096cceb31", "src/audit-inputs-client.mjs": "95fe942b1278768b4c938d82054d2d472eb3411c5587bdd8be4067b1dc0bc9b7", "src/audit-inputs-core.mjs": "e612ba0e44d12fd275b3e1dc0a2331bfe6fb005b4da8075e46ae009c5e299059", "src/audit-inputs-stdio.mjs": "537673fc03d0954ae480b239b8b481d11e14d763f1d0c07a985bb7d8fbd5b5c0", "src/canonical-json.mjs": "881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b", "src/expert-agreement.mjs": "80732bf61e1cef9bd3ff06cf831307675546f4789f8336f1668d5fd637a7b4ef", "src/expert-intake-core.mjs": "5095379afe5ca5be2c2fc8dc2fac191025c454f87e135d036b307f84bb57d545", "src/expert-submission-audit-core.mjs": "4040abc8f142d77571117979b73790be5a7ddb9bbf8fe6eee2fcb686ea9099f3", "src/expert-submission-files.mjs": "a5ed0b30f5338d3ed560f7fbc7cbb0e78966a56da188b72a8515ab077c4ea22d", "src/expert-submission-stdio.mjs": "56075a5daaa61bffbace0551aefe1220c372854ddca295b6adddd62abef65208", "src/filing-facts-packet.mjs": "74f2b353c0bf48d6e409d25925a6d691cf105a6f50aafdf561efbbbe679023c8", "src/server.mjs": "3166e985089e96e4a677282dcdfc4b89c691f71c7749513cedf87bc5642bb7a1"});
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
  const frame = Buffer.from('# CANLI_EXPERT_INTAKE_FILES_PACKAGE_' + kind + ' ' + json + '\n');
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
  const restoreFiles = installOwnedFileGuard(fs, fsp, path, TMP, deny, new Map(), new Map());
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
installOwnedFileGuard(fs,fsp,path,own,deny);
syncBuiltinESMExports();
for(const fn of[()=>fetch('https://invalid.invalid'),()=>fs.writeFileSync('/unallocated-intake-fixture','x'),()=>cp.spawn('unallocated',[])])try{fn();throw new Error('NOT_ARMED');}catch(e){if(e.code!=='NATIVE_DENIAL')throw e;}
if(count!==3)throw new Error('NOT_ARMED');controls=false;process.stderr.write('EXPERT_INTAKE_NATIVE_GUARD '+JSON.stringify({denied:3})+'\\n');
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
    assert.match(stderr, /^EXPERT_INTAKE_NATIVE_GUARD \{"denied":3\}\n/); assert.doesNotMatch(stderr, /DENIED_OPERATION|NOT_ARMED/);
    return { exitCode: end.code, stdout, stderr: stderr.replace(/^EXPERT_INTAKE_NATIVE_GUARD \{"denied":3\}\n/, '') };
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
  const begin=`<!-- EXPERT_INTAKE_FILES_${label}_BEGIN -->`,end=`<!-- EXPERT_INTAKE_FILES_${label}_END -->`;
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

before(async t => {
  TMP=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'canli-expert-files-package-'));fs.chmodSync(TMP,0o700);
  let completed=false;
  try {
    expectedBytes=new Map(MEMBERS.map(name=>[name,snapshot(path.join(ROOT,name.slice(8)),L.expanded)]));
    const guard=path.join(TMP,'guard.mjs');fs.writeFileSync(guard,childGuard(),{flag:'wx',mode:0o600});
    restore=parentGuard();
    // Pure oracle imports occur only after native parent fences are armed.
    ({ prepareExpertIntake, EXPERT_INTAKE_LIMITS } = await import(pathToFileURL(path.resolve(ROOT,'../scripts/datasets/filing-facts/expert-intake.mjs')).href));
    ({ packetContent } = await import(pathToFileURL(path.resolve(ROOT,'../js/filing-facts-packet.js')).href));
    const artifact=await packOnce();
    // Save the complete bounded compressed raw diagnostic BEFORE any fallible gzip/TAR admission.
    const raw={admission:'RAW_CAPTURED_NOT_ADMITTED',compressed_bytes:artifact.compressed.length,compressed_sha256:hash(artifact.compressed),original_gzip_base64:artifact.compressed.toString('base64')};
    await diagnosticNow('RAW', raw, nativeDiagnosticWrite, { signal: t.signal });
    const entries=tarEntries(artifact.compressed);
    const rawModes={...raw,files:[...entries].map(([name,row])=>({path:name,mode:row.mode,bytes:row.bytes.length,sha256:hash(row.bytes)}))};
    await diagnosticNow('RAW_MODES', rawModes, nativeDiagnosticWrite, { signal: t.signal });
    const metadata=admit(entries);
    const consumer=path.join(TMP,'consumer');fs.mkdirSync(consumer,{mode:0o700});const nodeModules=path.join(consumer,'node_modules');fs.mkdirSync(nodeModules);
    const root=path.join(nodeModules,metadata.name);fs.mkdirSync(root);
    let charged=0;
    for(const[name,row]of entries) {charged+=row.bytes.length;assert.ok(charged<=L.expanded);const p=path.join(root,name.slice(8));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,row.bytes,{flag:'wx',mode:row.mode});fs.chmodSync(p,row.mode);}
    const binRoot=path.join(nodeModules,'.bin');fs.mkdirSync(binRoot);const bins=[];
    for(const[name,local]of Object.entries(BIN)) {const p=path.join(root,local),rawMode=entries.get('package/'+local).mode;fs.symlinkSync(p,path.join(binRoot,name));if(name==='canli-fundamentals-mcp')fs.chmodSync(p,0o755);bins.push({name,raw_mode:rawMode,fixture_mode:fs.statSync(p).mode&0o777,owned_fixture_only:true});}
    for(const p of [consumer,root])for(const n of ['.git','scripts','js'])assert.equal(fs.existsSync(path.join(p,n)),false);
    assert.equal(fs.existsSync(path.join(root,'node_modules')),false);
    // No dependency link: the supplied-file CLI's complete local import closure is sufficient.
    const module=await import(pathToFileURL(path.join(root,'src/expert-intake-files.mjs')).href);
    main=module.main;writeTerminal=module.writeTerminal;assert.deepEqual(module.EXPERT_INTAKE_FILES_LIMITS,LIMITS);
    const guide=entries.get('package/EXPERT_INTAKE_FILES.md').bytes.toString('utf8'),s=guideScenario(guide);
    assert.match(guide,new RegExp(hash(s.rawGold))); assert.equal(s.intakeSettings.packet_sha256,hash(packetContent(s.gold)));
    packed={...artifact,entries,metadata,raw,root,consumer,guard,binRoot,bins,guide,s};
    const admitted={admission:'ADMITTED',compressed_sha256:raw.compressed_sha256,files:[...entries].map(([name,row])=>({path:name,mode:row.mode,bytes:row.bytes.length,sha256:hash(row.bytes)})),bins,SDK_entries:0,external_dependency_links:0,repository_runtime_links:0};
    await diagnosticNow('ADMITTED', admitted, nativeDiagnosticWrite, { signal: t.signal });completed=true;
  } finally { if(!completed) {restore();restore=()=>{};if(TMP)fs.rmSync(TMP,{recursive:true,force:true});} }
},{timeout:25000});
after(() => {
  // Restoration and owned cleanup cannot be bypassed by a failed assertion or before hook.
  try {restore();} finally {if(TMP)fs.rmSync(TMP,{recursive:true,force:true});}
  assert.equal(packEntries,1);assert.ok(commandEntries<=3);assert.ok(closures.every(row=>row.known&&row.absent));
});
const cloneEntries=()=>new Map([...packed.entries].map(([name,row])=>[name,{mode:row.mode,bytes:Buffer.from(row.bytes)}]));
async function actualCommand(t,kind) {
  assert.ok(++commandEntries<=3);
  const f=files(t,guideScenario(packed.guide)),entry=kind==='alias'?path.join(packed.binRoot,'canli-expert-intake-files'):path.join(packed.root,'src/expert-intake-files.mjs');
  const result=await runProcess(entry,kind==='refusal'?['--out',f.out]:f.argv,{cwd:packed.consumer,workMs:L.commandMs,stdoutCap:L.stdout,stderrCap:L.stderr});
  if(kind==='refusal') {refused(result,'CLI_ARGUMENTS');assert.equal(fs.existsSync(f.out),false);} else saved(f,result);
  return result;
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
function files(t,s=scenario()) {
  const root=fs.mkdtempSync(join(TMP,'native-input-'));fs.chmodSync(root,0o700);
  const cleanupLinks = [];
  t.after(() => {
    // Remove only recorded own aliases while their targets still exist. Recursive
    // target-first cleanup would correctly be refused by the unchanged native guard.
    for (const { file, target, identity } of cleanupLinks) {
      assert.equal(fs.realpathSync(path.dirname(file)), root);
      const linked = fs.lstatSync(file, { bigint: true });
      assert.ok(linked.isSymbolicLink());
      for (const key of ['dev', 'ino', 'mode']) assert.equal(linked[key], identity[key]);
      assert.equal(fs.readlinkSync(file), target);
      const actual = fs.realpathSync(target);
      assert.ok(actual === root || actual.startsWith(root + path.sep));
      fs.unlinkSync(file); // Still passes through the armed guard; no bypass.
      assert.throws(() => fs.lstatSync(file), { code: 'ENOENT' });
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const raw=s.rawDocuments??{gold:s.rawGold,intake:bytes(s.intake),evidenceInventory:bytes(s.evidenceInventory),intakeSettings:bytes(s.intakeSettings)};
  const paths={},inputs=[];
  for(const[name,data]of Object.entries(raw)) {const p=join(root,name+'.json');paths[name]=p;inputs.push(p);fs.writeFileSync(p,data,{flag:'wx',mode:0o600});suppliedFixtureBytes+=data.length;}
  paths.evidence=s.evidence.map((raw,index)=>{const p=join(root,`evidence-${index}.bin`);fs.writeFileSync(p,raw,{flag:'wx',mode:0o600});suppliedFixtureBytes+=raw.length;inputs.push(p);return p;});
  assert.ok(suppliedFixtureBytes<L.fixture,'FINITE_SUPPLIED_BYTES');
  const out=join(root,'preparation.json'),argv=['--gold',paths.gold,'--expected-gold-sha256',hash(s.rawGold),'--intake',paths.intake,
    '--evidence-inventory',paths.evidenceInventory,'--intake-settings',paths.intakeSettings,'--out',out,...paths.evidence.flatMap(p=>['--evidence',p])];
  return {root,out,paths,inputs,argv,s,cleanupLinks};
}
function fixtureSymlink(f, target, file) {
  assert.ok(file.startsWith(f.root + path.sep));
  assert.ok(target === f.root || target.startsWith(f.root + path.sep));
  assert.equal(fs.realpathSync(path.dirname(file)), f.root);
  fs.symlinkSync(target, file);
  const identity = fs.lstatSync(file, { bigint: true });
  assert.ok(identity.isSymbolicLink()); assert.equal(fs.readlinkSync(file), target);
  f.cleanupLinks.push({ file, target, identity });
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

function loader(observation = {}, replacement = prepareExpertIntake) {
  return async () => {
    observation.loads = (observation.loads ?? 0) + 1;
    return { EXPERT_INTAKE_LIMITS, prepareExpertIntake(...args) { observation.calls = (observation.calls ?? 0) + 1;
      observation.args = args; return replacement(...args); } };
  };
}

function refused(result, code) {
  assert.equal(result.exitCode, 1); assert.equal(result.stdout, '');
  assert.match(result.stderr, /^expert-intake-files: CLI_[A-Z_]+\n$/);
  if (code) assert.equal(result.stderr, `expert-intake-files: ${code}\n`);
  assert.ok(Buffer.byteLength(result.stderr) <= LIMITS.stderr);
}

function saved(f,result) {
  assert.equal(result.exitCode,0);assert.equal(result.stderr,'');assert.ok(Buffer.byteLength(result.stdout)<=LIMITS.stdout);
  const raw=snapshot(f.out),terminal=JSON.parse(result.stdout),expected=Buffer.from(JSON.stringify(prepareExpertIntake(...coreArgs(f.s)))+'\n');
  assert.deepEqual(raw,expected);assert.equal(fs.lstatSync(f.out).mode&0o777,0o600);
  const report=JSON.parse(raw);
  assert.deepEqual(terminal,{status:'saved',report_sha256:hash(raw),report_bytes:raw.length,selected_n:3,declared_role_count:f.s.intake.roles.length,syntactic_only:true});
  assert.equal(report.coverage.selected_n,3);assert.equal(report.coverage.prepared_item_assignments,6);
  assert.equal(report.review_packets.length,2);assert.deepEqual(packetContent(report.review_packets[0].packet),packetContent(report.review_packets[1].packet));
  for(const row of report.review_packets)for(const label of row.packet.labels)for(const field of [...Object.keys(choices),'notes'])assert.equal(label[field],'');
  assert.equal(report.adjudication.item_tasks.length,3);assert.deepEqual(report.adjudication.blank_submission.decisions,[]);
  for(const value of Object.values(report.established))assert.equal(value,null);
  assert.equal(report.implementation.declared_module_sha256_verified,false);assert.equal(report.bindings.gold.original_base64,f.s.rawGold.toString('base64'));
  return report;
}

function statWith(stat, changes) { return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, changes); }

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
  else { assert.equal(observation.calls, 1); assert.deepEqual(snapshot(f.out), Buffer.from(JSON.stringify(prepareExpertIntake(...coreArgs(f.s))) + '\n')); }
}


function checksum(header) { header.fill(32, 148, 156); header.write(header.reduce((n, b) => n + b, 0).toString(8).padStart(6, '0') + '\0 ', 148, 'ascii'); return header; }
function tinyTar(rows, mutate = () => {}) {
  const chunks = [];
  rows.forEach((row, index) => { const header = Buffer.alloc(512); header.write(row.name, 0, 'ascii'); header.write('0000644\0', 100, 'ascii');
    header.write(row.bytes.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii'); header[156] = 48;
    mutate(header, index); checksum(header); chunks.push(header, row.bytes, Buffer.alloc((512 - row.bytes.length % 512) % 512)); });
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]), { mtime: 0 });
}


test('intake files package: one guarded offline pack captures RAW before exact22 seven-bin admission', () => {
  assert.equal(MEMBERS.length,24);assert.equal(Object.keys(BIN).length,8);assert.equal(imports(cloneEntries()),14);
  assert.deepEqual(admit(cloneEntries()),packed.metadata);assert.equal(packEntries,1);
  assert.equal(packed.raw.admission,'RAW_CAPTURED_NOT_ADMITTED');assert.equal(packed.raw.compressed_sha256,hash(packed.compressed));
  for(const flag of ['--offline','--ignore-scripts','--update-notifier=false','--audit=false','--fund=false'])assert.ok(packed.args.includes(flag));
  assert.equal(packed.bins[0].raw_mode,0o644);assert.ok(packed.bins.every(row=>row.fixture_mode===0o755&&row.owned_fixture_only));
  assert.equal(fs.existsSync(join(packed.root,'node_modules')),false);assert.ok(closures.every(row=>row.known&&row.absent));
});
test('intake files package: complete13 JS MJS source closure refuses missing tampered escaping computed and reexport inputs', () => {
  assert.equal(imports(cloneEntries()),14);
  const positive=cloneEntries();positive.set('package/src/constant.js',{mode:0o644,bytes:Buffer.from("export const notice = 'from supplied files';\n")});assert.equal(imports(positive),15);
  for(const source of ["export * from './absent.mjs';\n","const x=import(name);\n","import x from '../../private.mjs';\n"]){const rows=cloneEntries();rows.set('package/src/fault.js',{mode:0o644,bytes:Buffer.from(source)});assert.throws(()=>imports(rows),/REEXPORT|DYNAMIC|LOCAL_IMPORT/);}
  const missing=cloneEntries();missing.delete('package/src/expert-intake-core.mjs');assert.throws(()=>imports(missing),/LOCAL_IMPORT/);
  for(const kind of ['extra','source','mode','bin','files']){const rows=cloneEntries();if(kind==='extra')rows.set('package/private.json',{mode:0o644,bytes:bytes({private:true})});
    if(kind==='source')rows.get('package/src/expert-intake-files.mjs').bytes[70]^=1;if(kind==='mode')rows.get('package/src/expert-intake-files.mjs').mode=0o644;
    if(kind==='bin'||kind==='files'){const p=JSON.parse(rows.get('package/package.json').bytes);if(kind==='bin')p.bin['canli-expert-intake-files']='../private';else p.files.pop();rows.get('package/package.json').bytes=bytes(p);}
    assert.throws(()=>admit(rows),/MEMBERS|FIXED_SOURCE|SOURCE|MODE|FROZEN_BYTES|BIN|FILES/);}
});
test('intake files package: bounded gzip and checksum-valid raw ASCII TAR faults refuse without extraction', () => {
  const before=fs.readdirSync(packed.consumer).sort(),good=tinyTar([{name:'package/a',bytes:Buffer.from('x')}]);assert.equal(tarEntries(good).size,1);
  assert.throws(()=>tarEntries(Buffer.alloc(L.compressed+1)),/GZIP_BOUND/);assert.throws(()=>tarEntries(gzipSync(Buffer.alloc(L.expanded+512))));
  for(const offset of [8,4]){const fault=Buffer.from(good);fault[fault.length-offset]^=1;assert.throws(()=>tarEntries(fault),/GZIP_CRC|GZIP_ISIZE/);}
  for(const extra of [Buffer.from('x'),gzipSync(Buffer.alloc(0))])assert.throws(()=>tarEntries(Buffer.concat([good,extra])),/GZIP_SINGLE_MEMBER/);
  for(const offset of [0,345,100,124,156])assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.from('x')}],h=>{h[offset]|=128;})),/TAR_ASCII/);
  const sum=inflateRawSync(good.subarray(10));sum[148]|=128;assert.throws(()=>tarEntries(gzipSync(sum)),/TAR_ASCII/);
  const changed=inflateRawSync(good.subarray(10));changed[8]=98;assert.throws(()=>tarEntries(gzipSync(changed)),/TAR_CHECKSUM/); // valid package/b, wrong checksum only
  assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.alloc(0)}],h=>{h[124]=57;})),/TAR_OCTAL/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/../private',bytes:Buffer.alloc(0)}])),/TAR_PATH/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.alloc(0)},{name:'package/a',bytes:Buffer.alloc(0)}])),/TAR_DUPLICATE/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.alloc(0)}],h=>{h[156]=50;})),/TAR_REGULAR/);
  assert.throws(()=>tarEntries(tinyTar(Array.from({length:33},(_,i)=>({name:'package/'+i,bytes:Buffer.alloc(0)})))),/TAR_COUNT/);
  assert.deepEqual(fs.readdirSync(packed.consumer).sort(),before);
});
test('intake files package: diagnostic SAME frame survives short writes EAGAIN and later hook refusal', async () => {
  const record={admission:'RAW_CAPTURED_NOT_ADMITTED',original_gzip_base64:packed.compressed.toString('base64')},chunks=[];let writes=0,time=0,waits=0;
  const write=(fd,frame,offset,length)=>{assert.equal(fd,1);if(++writes===2){const e=new Error('synthetic');e.code='EAGAIN';throw e;}const n=Math.min(127,length);chunks.push(Buffer.from(frame.subarray(offset,offset+n)));return n;};
  await assert.rejects(async()=>{await diagnosticNow('RAW',record,write,{now:()=>time,wait:async ms=>{waits++;time+=ms;}});throw new Error('LATER_HOOK_REFUSAL');},/LATER_HOOK_REFUSAL/);
  assert.equal(waits,1);assert.equal(Buffer.concat(chunks).toString(),'# CANLI_EXPERT_INTAKE_FILES_PACKAGE_RAW '+JSON.stringify(record)+'\n');
  let touched=0,elapsed=0;
  assert.throws(()=>diagnosticNow('RAW',{toJSON(){elapsed=1001;return{};}},()=>{touched++;return 1;},{now:()=>elapsed}),/RAW_DIAGNOSTIC_DEADLINE/);assert.equal(touched,0);
  for(const fault of ['zero','EPIPE','abort','bound']){let count=0;const signal={aborted:fault==='abort'};
    assert.throws(()=>diagnosticNow('RAW',fault==='bound'?{s:'x'.repeat(384*1024)}:record,()=>{count++;if(fault==='EPIPE'){const e=new Error('EPIPE');e.code='EPIPE';throw e;}return 0;},{signal}),/RAW_DIAGNOSTIC|EPIPE/);
    assert.equal(count,['abort','bound'].includes(fault)?0:1);}
});
test('intake files package: four marked guide inputs independently roundtrip and bind exact final LF raw SHA', () => {
  const s=guideScenario(packed.guide);assert.equal(Object.keys(s.rawDocuments).length,4);assert.equal(hash(s.rawGold),'b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb');
  for(const raw of Object.values(s.rawDocuments)){assert.equal(raw.at(-1),10);assert.deepEqual(JSON.parse(raw),JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));}
  assert.equal(s.intakeSettings.packet_sha256,hash(packetContent(s.gold)));assert.match(packed.guide,/no whole-command deadline/);
  assert.equal(s.intake.roles.length,3);assert.equal(s.evidence.length,0);
});
test('intake files package: command entry1 executes the exact marked guide and complete core report', {timeout:12500}, async t=>{await actualCommand(t,'direct');assert.equal(commandEntries,1);});
test('intake files package: command entry2 owned absolute executable alias has identical full preparation parity', {timeout:12500}, async t=>{await actualCommand(t,'alias');assert.equal(commandEntries,2);});
test('intake files package: command entry3 refusal has known exit no raw echo and no output', {timeout:12500}, async t=>{const r=await actualCommand(t,'refusal');assert.equal(commandEntries,3);assert.equal(r.stdout,'');assert.ok(closures.every(row=>row.known&&row.absent));});
test('intake files package: duplicate unknown missing sparse proxy and accessor argv refuse before native effects', async t=>{
  const f=files(t),getter=['--gold'];Object.defineProperty(getter,1,{get(){assert.fail('no getter invocation');},enumerable:true});getter.length=12;
  for(const argv of [[...f.argv,'--gold',f.paths.gold],[...f.argv,'--unknown','private-body'],f.argv.slice(0,-1),[],new Array(12),new Proxy(f.argv,{}),getter]){
    const io=instrument(),o={};refused(await main(argv,{filesystem:io.filesystem,loadCore:loader(o)}),'CLI_ARGUMENTS');assert.equal(io.events.length,0);assert.equal(o.loads,undefined);}
});
test('intake files package: primitive64 lowercase raw SHA exact end refuses terminators and coercion', async t=>{
  const f=files(t);for(const value of [hash(f.s.rawGold)+'\n',hash(f.s.rawGold)+'\r',hash(f.s.rawGold).toUpperCase(),'a'.repeat(63)]){const argv=[...f.argv];argv[3]=value;const io=instrument();refused(await main(argv,{filesystem:io.filesystem}),'CLI_SHA');assert.equal(io.events.length,0);}
  const argv=[...f.argv];argv[3]=[hash(f.s.rawGold)];const io=instrument();refused(await main(argv,{filesystem:io.filesystem}),'CLI_ARGUMENTS');assert.equal(io.events.length,0);
  saved(f,await main(f.argv));
});
test('intake files package: relative alias-parent malformed UTF8 control and overlong paths refuse qualified context', async t=>{
  const f=files(t);for(const value of ['relative.json',f.paths.gold+'/../gold.json',f.paths.gold+'\0','/x'+String.fromCharCode(0xd800),'/'+ 'a'.repeat(4096)]){const argv=[...f.argv];argv[1]=value;const io=instrument();refused(await main(argv,{filesystem:io.filesystem}),'CLI_PATH');assert.equal(io.events.length,0);}
  const link=join(f.root,'parent-alias');fixtureSymlink(f,f.root,link);const argv=[...f.argv];argv[1]=join(link,'gold.json');const o={};refused(await main(argv,{loadCore:loader(o)}),'CLI_INPUT_CHANGED');assert.equal(o.loads,undefined);assert.equal(fs.existsSync(f.out),false);
});
test('intake files package: every input FD is admitted before first payload allocation read loader or core', async t=>{
  const f=files(t,scenario({evidence:2})),io=instrument(),o={};saved(f,await main(f.argv,{filesystem:io.filesystem,loadCore:loader(o)}));
  const first=io.events.findIndex(e=>e.operation==='readSync');for(const p of f.inputs)assert.ok(io.events.slice(0,first).some(e=>e.operation==='fstatSync'&&e.path===p));
  assert.equal(o.loads,1);assert.equal(o.calls,1);assert.equal(io.held.size,0);assert.deepEqual(o.args.map((x,i)=>i===4?x.map(hash):Buffer.isBuffer(x)?hash(x):x),coreArgs(f.s).map((x,i)=>i===4?x.map(hash):Buffer.isBuffer(x)?hash(x):x));
});
test('intake files package: each exact individual cap admits metadata and plus-one stops before any read', async t=>{
  for(const name of ['gold','intake','evidenceInventory','intakeSettings']){await sizePlan(t,scenario(),f=>({[f.paths[name]]:LIMITS[name]}),'CLI_READ',true);await sizePlan(t,scenario(),f=>({[f.paths[name]]:LIMITS[name]+1}),'CLI_INPUT_BOUND');}
});
test('intake files package:64 ordered evidence inputs enforce count individual and group before payload', async t=>{
  const s=scenario({evidence:64});await sizePlan(t,s,f=>Object.fromEntries(f.paths.evidence.map(p=>[p,4096])),'CLI_READ',true);
  await sizePlan(t,scenario({evidence:1}),f=>({[f.paths.evidence[0]]:32769}),'CLI_INPUT_BOUND');
  await sizePlan(t,scenario({evidence:9}),f=>Object.fromEntries(f.paths.evidence.map(p=>[p,32768])),'CLI_EVIDENCE_BOUND');
  const f=files(t,s),argv=[...f.argv,'--evidence',join(f.root,'65.bin')],io=instrument();refused(await main(argv,{filesystem:io.filesystem}),'CLI_ARGUMENTS');assert.equal(io.events.length,0);
});
test('intake files package: exact768KiB aggregate plus-one and legal888832 metadata plan have zero premature effects', async t=>{
  const map=(f,last)=>({[f.paths.gold]:524288,[f.paths.intake]:65536,[f.paths.evidenceInventory]:32768,[f.paths.intakeSettings]:4096,
    ...Object.fromEntries(f.paths.evidence.map((p,i)=>[p,i===4?last:32768]))});
  await sizePlan(t,scenario({evidence:5}),f=>map(f,28672),'CLI_READ',true);
  await sizePlan(t,scenario({evidence:5}),f=>map(f,28673),'CLI_TOTAL_BOUND');
  await sizePlan(t,scenario({evidence:8}),f=>({[f.paths.gold]:524288,[f.paths.intake]:65536,[f.paths.evidenceInventory]:32768,[f.paths.intakeSettings]:4096,...Object.fromEntries(f.paths.evidence.map(p=>[p,32768]))}),'CLI_TOTAL_BOUND');
});
test('intake files package: positive short reads capture exact buffers and preserve full report bindings', async t=>{
  const f=files(t,scenario({evidence:2}));let reads=0;const io=instrument({readSync(e){reads++;const[a,b,c,d,p]=e.args;return fs.readSync(a,b,c,Math.min(d,17),p);}}),o={};
  saved(f,await main(f.argv,{filesystem:io.filesystem,loadCore:loader(o)}));assert.ok(reads>f.inputs.length);assert.equal(o.calls,1);assert.equal(io.held.size,0);
});
test('intake files package: overflow sentinel zero invalid and thrown reads stop before core with all FD closure', async t=>{
  for(const kind of ['overflow','zero','invalid','throw']){const f=files(t),o={};let target=0;const io=instrument({readSync(e,n){if(e.path!==f.paths.gold)return n();target++;
    if(kind==='overflow')return e.args[4]===f.s.rawGold.length?1:n();if(kind==='zero')return 0;if(kind==='invalid')return e.args[3]+1;throw new Error('PRIVATE_PAYLOAD_PATH');}});
    refused(await main(f.argv,{filesystem:io.filesystem,loadCore:loader(o)}),'CLI_READ');assert.ok(target>0);assert.equal(o.loads,undefined);assert.equal(io.held.size,0);assert.equal(fs.existsSync(f.out),false);}
});
test('intake files package: final whole-batch sameFD and postpath guards detect earlier input changes', async t=>{
  for(const key of ['size','mtimeNs','ctimeNs','ino']){const f=files(t),o={};let captured=false,changed=0;const io=instrument({readSync(e,n){if(e.path===f.paths.intakeSettings)captured=true;return n();},fstatSync(e,n){const st=n();if(captured&&e.path===f.paths.gold){changed++;return statWith(st,{[key]:st[key]+1n});}return st;}});
    refused(await main(f.argv,{filesystem:io.filesystem,loadCore:loader(o)}),'CLI_INPUT_CHANGED');assert.ok(changed>0);assert.equal(o.loads,undefined);assert.equal(io.held.size,0);}
  const f=files(t),o={};let swap=false;const io=instrument({readSync(e,n){const result=n();if(!swap&&e.path===f.paths.intakeSettings){swap=true;fs.renameSync(f.paths.gold,f.paths.gold+'.old');fs.writeFileSync(f.paths.gold,f.s.rawGold,{flag:'wx',mode:0o600});}return result;}});
  refused(await main(f.argv,{filesystem:io.filesystem,loadCore:loader(o)}),'CLI_INPUT_CHANGED');assert.equal(swap,true);assert.equal(o.loads,undefined);assert.equal(io.held.size,0);
});
test('intake files package: symlink hardlink empty nonregular and foreign-owner inputs refuse without kernel', async t=>{
  for(const kind of ['symlink','hardlink','empty','directory','uid']){const f=files(t),p=join(f.root,'fault'),o={};const argv=[...f.argv];
    if(kind==='symlink'){fixtureSymlink(f,f.paths.gold,p);argv[1]=p;}if(kind==='hardlink'){fs.linkSync(f.paths.gold,p);argv[1]=p;}if(kind==='empty'){fs.writeFileSync(p,'',{flag:'wx'});argv[1]=p;}if(kind==='directory')argv[1]=f.root;
    const io=instrument(kind==='uid'?{fstatSync(e,n){const st=n();return e.path===f.paths.gold?statWith(st,{uid:st.uid+1n}):st;}}:{});
    const r=await main(argv,{filesystem:io.filesystem,loadCore:loader(o)});refused(r);assert.equal(o.loads,undefined);assert.equal(io.held.size,0);assert.equal(fs.existsSync(f.out),false);}
});
test('intake files package: reader close-after-close reused numeric FD is relinquished before one attempt', async t=>{await closeReuse(t,'input');});
test('intake files package: complete fullN preserves identical blank item packets and distinct adjudicator tasks', async t=>{
  const f=files(t),r=saved(f,await main(f.argv));assert.equal(r.review_packets[0].declared_handle,f.s.intake.roles[0].handle);
  assert.equal(r.review_packets[1].declared_handle,f.s.intake.roles[1].handle);assert.deepEqual(r.adjudication.item_tasks.map(x=>x.id),f.s.gold.labels.map(x=>x.id));
  assert.equal(r.coverage.prepared_completed_review_pairs_n,0);assert.equal(r.prepared_on_authenticated,false);
});
test('intake files package: all missing roles keep selectedN notes blanks worklists and established NULL', async t=>{
  const s=scenario();s.intake.roles=[];const f=files(t,s),r=saved(f,await main(f.argv));assert.deepEqual(r.coverage.missing_roles,['reviewer_a','reviewer_b','adjudicator']);
  assert.equal(r.role_worklists.length,3);assert.equal(r.coverage.declared_roles_n,0);assert.equal(r.review_packets[0].declared_handle,null);assert.equal(r.adjudication.declared_handle,null);
});
test('intake files package: opaque non UTF8 evidence retains original byte order raw hashes and mechanical declarations', async t=>{
  const f=files(t,scenario({evidence:2})),r=saved(f,await main(f.argv));assert.equal(r.evidence_inventory.length,2);assert.equal(r.coverage.evidence_provided_n,2);
  for(const raw of f.s.evidence){assert.ok(JSON.stringify(r).includes(raw.toString('base64')));assert.ok(JSON.stringify(r).includes(hash(raw)));}
  assert.equal(r.coverage.prepared_completed_review_pairs_n,0);
});
test('intake files package: declared roles conflicts source rights and evidence worklists remain unverified complete', async t=>{
  const s=scenario();s.intake.roles[0].affiliations=['SYNTHETIC SAME ORGANIZATION'];s.intake.roles[1].affiliations=['SYNTHETIC SAME ORGANIZATION'];
  const f=files(t,s),r=saved(f,await main(f.argv));assert.equal(r.source_worklists.length,3);assert.equal(r.coverage.sources_missing_declaration_n,3);
  assert.equal(r.role_worklists.length,3);for(const value of Object.values(r.established))assert.equal(value,null);assert.match(r.interpretation,/neither proves nor disproves actual independence/);
});
test('intake files package: caller whole module SHA remains declared and false verified with diagnostic fingerprint', async t=>{
  const s=scenario();s.intakeSettings.implementation_source_sha256='a'.repeat(64);const f=files(t,s),r=saved(f,await main(f.argv));
  assert.equal(r.implementation.declared_module_sha256,'a'.repeat(64));assert.equal(r.implementation.declared_module_sha256_verified,false);assert.equal(Object.hasOwn(r.implementation,'runtime_identity_verified'),false);
  assert.equal(typeof r.implementation.behavior_sha256,'string');
});
test('intake files package: changed expected raw gold or rehashed opaque evidence mismatch refuses without output', async t=>{
  const f=files(t),argv=[...f.argv];argv[3]='a'.repeat(64);refused(await main(argv),'CLI_PREPARE');assert.equal(fs.existsSync(f.out),false);
  const s=scenario({evidence:1});s.evidence[0]=Buffer.from('changed same declaration');const fault=files(t,s);refused(await main(fault.argv),'CLI_PREPARE');assert.equal(fs.existsSync(fault.out),false);
  const good=files(t);saved(good,await main(good.argv));
});
test('intake files package: private output parent ownership permissions and untouched unused0600 path are mandatory', async t=>{
  const f=files(t),o={};fs.chmodSync(f.root,0o750);refused(await main(f.argv,{loadCore:loader(o)}),'CLI_PARENT');assert.equal(o.loads,undefined);assert.equal(fs.existsSync(f.out),false);
  fs.chmodSync(f.root,0o700);saved(f,await main(f.argv));
});
test('intake files package: existing outputs symlinks input aliases and hardlinks never overwrite unlink or retry', async t=>{
  for(const kind of ['existing','symlink','alias','hardlink']){const f=files(t),argv=[...f.argv],original=Buffer.from('RETAIN PRIVATE ORIGINAL');
    if(kind==='existing')fs.writeFileSync(f.out,original,{flag:'wx',mode:0o600});if(kind==='symlink')fixtureSymlink(f,f.paths.gold,f.out);
    if(kind==='alias')argv[11]=f.paths.gold;if(kind==='hardlink')fs.linkSync(f.paths.gold,f.out);
    const io=instrument(),o={};refused(await main(argv,{filesystem:io.filesystem,loadCore:loader(o)}));assert.equal(o.loads,undefined);assert.equal(io.held.size,0);
    assert.equal(io.events.some(e=>e.operation==='writeSync'),false);if(kind==='existing')assert.deepEqual(snapshot(f.out),original);assert.deepEqual(snapshot(f.paths.gold),f.s.rawGold);}
});
test('intake files package: complete encoded2MiB limit is admitted before O_EXCL and plus-one refuses before creation', async t=>{
  const s=scenario(),base=JSON.parse(JSON.stringify(prepareExpertIntake(...coreArgs(s))));base.synthetic_padding='';const room=LIMITS.report-Buffer.byteLength(JSON.stringify(base));assert.ok(room>0);
  for(const plus of [0,1]){const f=files(t,s),report={...base,synthetic_padding:'a'.repeat(room+plus)},io=instrument(),o={};
    const r=await main(f.argv,{filesystem:io.filesystem,loadCore:loader(o,()=>report)});
    if(plus){refused(r,'CLI_REPORT_BOUND');assert.equal(fs.existsSync(f.out),false);assert.equal(io.events.some(e=>e.operation==='openSync'&&e.path===f.out),false);}
    else{assert.equal(r.exitCode,0);assert.equal(snapshot(f.out).length,LIMITS.reportFile);assert.deepEqual(JSON.parse(snapshot(f.out)),report);}assert.equal(o.calls,1);assert.equal(io.held.size,0);}
});
test('intake files package: writer positive short progress saves once and ambiguous zero or throw retains partial', async t=>{
  const f=files(t);let writes=0;const io=instrument({writeSync(e){writes++;const[a,b,c,d,p]=e.args;return fs.writeSync(a,b,c,Math.min(31,d),p);}});saved(f,await main(f.argv,{filesystem:io.filesystem}));assert.ok(writes>1);
  for(const kind of ['zero','throw']){const bad=files(t);let count=0;const o={},fault=instrument({writeSync(e,n){if(++count===1){const[a,b,c]=e.args;return fs.writeSync(a,b,c,7,0);}if(kind==='zero')return 0;throw new Error('PRIVATE_BODY_PATH');}});
    refused(await main(bad.argv,{filesystem:fault.filesystem,loadCore:loader(o)}),'CLI_WRITE');assert.equal(count,2);assert.equal(snapshot(bad.out).length,7);assert.equal(o.calls,1);assert.equal(fault.held.size,0);}
});
test('intake files package: output close-after-close numeric reuse never closes foreign descriptor or removes report', async t=>{await closeReuse(t,'output');});
test('intake files package: directory close-after-close numeric reuse retains durable report and closes no foreign FD', async t=>{await closeReuse(t,'directory');});
test('intake files package: file flush and readback content or final stat uncertainty retain output with no success', async t=>{
  for(const kind of ['flush','bytes','stat']){const f=files(t),io=instrument({fsyncSync(e,n){if(kind==='flush'&&e.path===f.out)throw new Error('synthetic fsync');return n();},
    readSync(e,n){const count=n();if(kind==='bytes'&&e.path===f.out&&count>0)e.args[1][e.args[2]]^=1;return count;},
    fstatSync(e,n){const st=n();return kind==='stat'&&e.path===f.out&&st.size>0n?statWith(st,{size:st.size+1n}):st;}});
    refused(await main(f.argv,{filesystem:io.filesystem}));assert.ok(fs.existsSync(f.out));assert.equal(io.held.size,0);}
});
test('intake files package: unchanged replacement after final FD observation hits postpath identity without false success', async t=>{
  const f=files(t);let observations=0,replaced=false;const io=instrument({lstatSync(e,n){if(e.path===f.out&&++observations===3){const raw=snapshot(f.out);fs.renameSync(f.out,f.out+'.retained');fs.writeFileSync(f.out,raw,{flag:'wx',mode:0o600});replaced=true;}return n();}});
  refused(await main(f.argv,{filesystem:io.filesystem}),'CLI_OUTPUT_CHANGED');assert.equal(replaced,true);assert.equal(io.held.size,0);assert.deepEqual(snapshot(f.out),snapshot(f.out+'.retained'));
});
test('intake files package: parent directory fsync and changed permissions refuse while retaining exact report', async t=>{
  for(const kind of ['flush','permissions']){const f=files(t);let hit=0;const io=instrument({fsyncSync(e,n){if(e.path===f.root){hit++;if(kind==='flush')throw new Error('synthetic directory uncertainty');const r=n();fs.chmodSync(f.root,0o750);return r;}return n();}});
    refused(await main(f.argv,{filesystem:io.filesystem}),kind==='flush'?'CLI_FLUSH':'CLI_PARENT');assert.equal(hit,1);assert.ok(fs.existsSync(f.out));assert.equal(io.held.size,0);fs.chmodSync(f.root,0o700);}
});
test('intake files package: loader failure mismatched protected limits and kernel errors have bounded noecho refusal', async t=>{
  for(const kind of ['load','limits','kernel']){const f=files(t),io=instrument();const loadCore=async()=>{if(kind==='load')throw new Error(f.paths.gold);return {EXPERT_INTAKE_LIMITS:kind==='limits'?{...EXPERT_INTAKE_LIMITS,totalInputBytes:999}:EXPERT_INTAKE_LIMITS,prepareExpertIntake(){throw new Error('PRIVATE_PAYLOAD');}};};
    const r=await main(f.argv,{filesystem:io.filesystem,loadCore});refused(r,kind==='kernel'?'CLI_PREPARE':'CLI_SOURCE');assert.equal(r.stderr.includes(f.root),false);assert.equal(r.stderr.includes('PRIVATE_PAYLOAD'),false);assert.equal(io.held.size,0);assert.equal(fs.existsSync(f.out),false);}
});
test('intake files package: terminal short progress and SAME offset backpressure never rerun file or core effects', async()=>{
  const text=JSON.stringify({status:'synthetic_saved',sha:'a'.repeat(64)})+'\n',chunks=[];let calls=0,time=0,waits=0;
  const write=(fd,frame,offset,length)=>{assert.equal(fd,1);if(++calls===2){const e=new Error('EWOULDBLOCK');e.code='EWOULDBLOCK';throw e;}const n=Math.min(length,7);chunks.push(Buffer.from(frame.subarray(offset,offset+n)));return n;};
  assert.equal(await writeTerminal(1,text,4096,{write,now:()=>time,wait:async ms=>{waits++;time+=ms;}}),Buffer.byteLength(text));assert.equal(waits,1);assert.equal(Buffer.concat(chunks).toString(),text);
  for(const kind of ['zero','abort','bound','deadline','EPIPE']){let count=0,time=0;const write=()=>{count++;if(kind==='EPIPE'){const e=new Error('pipe');e.code='EPIPE';throw e;}if(kind==='deadline'){const e=new Error('wait');e.code='EAGAIN';throw e;}return 0;};
    await assert.rejects(()=>writeTerminal(1,kind==='bound'?'x'.repeat(4097):text,4096,{write,signal:{aborted:kind==='abort'},now:()=>time,wait:async()=>{time=1001;}}),/CLI_STDIO/);assert.equal(count,['abort','bound'].includes(kind)?0:1);}
});
test('intake files package: native network Buffer foreign destinations aliases and both mutation paths deny before forwarding', async t=>{
  const f=files(t),start=denied,p=join(f.root,'positive');fs.writeFileSync(p,'owned positive',{flag:'wx',mode:0o600});
  const link=join(f.root,'readonly-source-alias');fixtureSymlink(f,p,link); // owned positive alias stays owned
  fs.writeFileSync(link,'owned positive');assert.equal(snapshot(p).toString(),'owned positive');
  const invalid=Buffer.concat([Buffer.from(f.root+'/'),Buffer.from([255])]);
  for(const fn of [()=>fetch('https://example.invalid'),()=>cp.spawn('not-allocated',[]),()=>fs.writeFileSync('/unallocated-intake-output','x'),()=>fs.writeFileSync(invalid,'x'),
    ()=>fs.renameSync(p,'/unallocated-intake-output'),()=>fs.copyFileSync('/unallocated-intake-input',p),()=>fs.linkSync('/unallocated-intake-input',join(f.root,'hard')),()=>fs.symlinkSync('/unallocated-intake-input',join(f.root,'sym'))])assert.throws(fn,/NATIVE_DENIAL/);
  assert.equal(denied-start,8);assert.equal(snapshot(p).toString(),'owned positive');
  const handle=await fsp.open(path.join(ROOT,'package.json'),'r');try{await assert.rejects(async()=>handle.writeFile('foreign'),/NATIVE_DENIAL/);}finally{await handle.close();}
  const target=join(f.root,'dangling-positive'),alias=join(f.root,'dangling-alias');
  fs.writeFileSync(target,'own target',{flag:'wx',mode:0o600});fixtureSymlink(f,target,alias);
  fs.unlinkSync(target);
  assert.throws(()=>fs.writeFileSync(alias,'must not follow dangling alias'),/NATIVE_DENIAL/);
  assert.throws(()=>fs.unlinkSync(alias),/NATIVE_DENIAL/);
  // Restore only this known owned target for guarded alias-first teardown.
  fs.writeFileSync(target,'own target restored',{flag:'wx',mode:0o600});
});
test('intake files package: hook assertion failure restores nested guards and cleans only owned fixture in finally', ()=>{
  const own=fs.mkdtempSync(join(TMP,'cleanup-control-'));let restored=false,removed=false,expected;
  try{const stop=installOwnedFileGuard(fs,fsp,path,own,()=>{throw new Error('NATIVE_DENIAL');});try{fs.writeFileSync(join(own,'positive'),'x',{flag:'wx'});assert.throws(()=>fs.writeFileSync('/unallocated-hook-output','x'),/NATIVE_DENIAL/);throw new Error('SYNTHETIC_HOOK_ASSERTION');}finally{stop();restored=true;}}
  catch(e){expected=e;}finally{fs.rmSync(own,{recursive:true,force:true});removed=true;}
  assert.match(expected.message,/SYNTHETIC_HOOK_ASSERTION/);assert.equal(restored,true);assert.equal(removed,true);assert.equal(fs.existsSync(own),false);
});
