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
import { reconcileExpertSubmissions } from '../../scripts/datasets/filing-facts/expert-submission-audit.mjs';
import { packetContent } from '../../js/filing-facts-packet.js';

// Synthetic supplied files only. No additional SDK entry or authenticated person.
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const L = Object.freeze({ compressed: 262144, expanded: 2097152, members: 32, npmOutput: 65536,
  packMs: 20000, commandMs: 10000, closeMs: 2500, stdout: 4096, stderr: 8192, fixture: 24 * 1024 * 1024 });
const LIMITS = Object.freeze({ gold: 524288, intake: 65536, evidenceInventory: 32768, intakeSettings: 4096,
  evidence: 32768, evidenceTotal: 262144, intakeTotal: 786432, submissionInventory: 16384,
  auditSettings: 4096, submission: 2097152, evidenceCount: 64, submissionCount: 2, inputCount: 72,
  inputTotal: 4194304, report: 6291456, reportFile: 6291457, path: 4096, stdout: 4096, stderr: 1024 });
const bytes = value => Buffer.from(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const sha = hash;
const clone = value => JSON.parse(JSON.stringify(value));
const choices = { question_clear: ['yes', 'no'], answer_matches_filing: ['yes', 'no', 'cannot_find'], citation_correct: ['yes', 'no'] };
let TMP, packed, main, restore = () => {}, suppliedFixtureBytes = 0, commandEntries = 0, packEntries = 0, denied = 0;
const nativeSpawn = cp.spawn.bind(cp);
const nativeDiagnosticWrite = fs.writeSync.bind(fs);
const closures = [];
const SOURCE_PINS = Object.freeze({"src/expert-submission-client.mjs": "1a7db19f98996e2de79dc56d4cbdf804fbc23ed3a0e5d08ad9e7faa423611e47", "src/audit-inputs-client.mjs": "95fe942b1278768b4c938d82054d2d472eb3411c5587bdd8be4067b1dc0bc9b7", "src/audit-inputs-core.mjs": "e612ba0e44d12fd275b3e1dc0a2331bfe6fb005b4da8075e46ae009c5e299059", "src/audit-inputs-stdio.mjs": "537673fc03d0954ae480b239b8b481d11e14d763f1d0c07a985bb7d8fbd5b5c0", "src/canonical-json.mjs": "881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b", "src/expert-agreement.mjs": "80732bf61e1cef9bd3ff06cf831307675546f4789f8336f1668d5fd637a7b4ef", "src/expert-intake-core.mjs": "5095379afe5ca5be2c2fc8dc2fac191025c454f87e135d036b307f84bb57d545", "src/expert-submission-audit-core.mjs": "4040abc8f142d77571117979b73790be5a7ddb9bbf8fe6eee2fcb686ea9099f3", "src/expert-submission-files.mjs": "a5ed0b30f5338d3ed560f7fbc7cbb0e78966a56da188b72a8515ab077c4ea22d", "src/expert-submission-stdio.mjs": "56075a5daaa61bffbace0551aefe1220c372854ddca295b6adddd62abef65208", "src/filing-facts-packet.mjs": "74f2b353c0bf48d6e409d25925a6d691cf105a6f50aafdf561efbbbe679023c8", "src/server.mjs": "dd856068821d05648eb5f3ff6f2e2996cc165de2c9b6f1d24f506fbc29382d38"});
const BIN = Object.freeze({ 'canli-fundamentals-mcp': 'src/server.mjs', 'canli-fundamentals-audit': 'src/audit-inputs-stdio.mjs',
  'canli-expert-submission-audit': 'src/expert-submission-stdio.mjs', 'canli-fundamentals-audit-files': 'src/audit-inputs-client.mjs',
  'canli-expert-submission-files': 'src/expert-submission-files.mjs', 'canli-expert-submission-client': 'src/expert-submission-client.mjs' });
const FILES = Object.freeze(['src', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md']);
const MEMBERS = Object.freeze(['LICENSE', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md', 'package.json', ...Object.keys(SOURCE_PINS)].map(p => 'package/' + p).sort());
const MODES = Object.freeze(Object.fromEntries(MEMBERS.map(name => [name, Object.values(BIN).filter(p => p !== 'src/server.mjs').includes(name.slice(8)) ? 0o755 : 0o644])));
const absent = pid => { assert.ok(Number.isSafeInteger(pid) && pid > 1); try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } };
const bounded = (promise, ms) => { let timer; return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OWNED_BOUND')), ms); })]).finally(() => clearTimeout(timer)); };

function diagnosticNow(kind, record, write = nativeDiagnosticWrite) {
  const json = JSON.stringify(record);
  assert.ok(Buffer.byteLength(json) <= 384 * 1024, 'RAW_DIAGNOSTIC_BOUND');
  assert.ok(['RAW', 'RAW_MODES', 'ADMITTED'].includes(kind));
  const frame = Buffer.from('# CANLI_EXPERT_FILES_PACKAGE_' + kind + ' ' + json + '\n');
  // The captured native stdout writer completes before a later hook can refuse or clean TMP.
  for (let offset = 0; offset < frame.length;) {
    const wrote = write(1, frame, offset, frame.length - offset);
    assert.ok(Number.isSafeInteger(wrote) && wrote > 0 && wrote <= frame.length - offset, 'RAW_DIAGNOSTIC_WRITE');
    offset += wrote;
  }
  return frame.length;
}

function parentGuard() {
  const changes = [], ownedFDs = new Set([1, 2]);
  const inside = p => {
    if (Buffer.isBuffer(p)) {
      const raw = p;
      try { p = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(p); } catch { return false; }
      if (!Buffer.from(p, 'utf8').equals(raw)) return false;
    }
    return typeof p === 'string' && (path.resolve(p) === TMP || path.resolve(p).startsWith(TMP + path.sep));
  };
  const deny = () => { denied++; const error = new Error('NATIVE_DENIAL'); error.code = 'NATIVE_DENIAL'; throw error; };
  const set = (object, name, fn) => { changes.push([object, name, object[name]]); object[name] = fn; };
  const writable = f => typeof f === 'number' ? !!(f & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) : f !== undefined && !['r', 'rs'].includes(f);
  set(globalThis, 'fetch', deny);
  for (const [object, names] of [[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],[tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]]) for (const name of names) set(object, name, deny);
  set(net.Socket.prototype, 'connect', deny); set(net.Server.prototype, 'listen', deny);
  for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) set(cp, name, deny);
  const double = new Set(['rename','renameSync','copyFile','copyFileSync','cp','cpSync','link','linkSync','symlink','symlinkSync']);
  for (const object of [fs, fsp]) for (const name of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','mkdtemp','mkdtempSync','rename','renameSync','rm','rmSync','unlink','unlinkSync','truncate','truncateSync','createWriteStream','copyFile','copyFileSync','cp','cpSync','symlink','symlinkSync','link','linkSync','chmod','chmodSync','chown','chownSync']) {
    const original = object[name]; if (!original) continue;
    set(object, name, (...args) => { if (!inside(args[0]) || (double.has(name) && !inside(args[1]))) deny(); return original(...args); });
  }
  for (const name of ['openSync','open']) { const original = fs[name]; set(fs, name, (p, f, ...rest) => {
    const writing = writable(f); if (writing && !inside(p)) deny();
    if (name === 'openSync') { const fd = original(p, f, ...rest); if (writing) ownedFDs.add(fd); return fd; }
    const callback = rest.pop(); return original(p, f, ...rest, (error, fd) => { if (!error && writing) ownedFDs.add(fd); callback(error, fd); });
  }); }
  const open = fsp.open; set(fsp, 'open', async (p, f, ...rest) => { if (writable(f) && !inside(p)) deny(); return open(p, f, ...rest); });
  for (const name of ['close','closeSync']) { const original = fs[name]; set(fs, name, (fd, ...rest) => { ownedFDs.delete(fd); return original(fd, ...rest); }); }
  for (const name of ['write','writeSync','writev','writevSync']) { const original = fs[name]; set(fs, name, (fd, ...rest) => { if (!ownedFDs.has(fd)) deny(); return original(fd, ...rest); }); }
  syncBuiltinESMExports();
  return () => { for (const [object, name, original] of changes.reverse()) object[name] = original; syncBuiltinESMExports(); };
}

function childGuard() { return `
import fs from 'node:fs'; import fsp from 'node:fs/promises'; import path from 'node:path'; import cp from 'node:child_process';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram'; import dns from 'node:dns'; import {syncBuiltinESMExports} from 'node:module';
const own=${JSON.stringify(TMP)}, ownedFDs=new Set([1,2]); let count=0,controls=true;
const inside=p=>{if(Buffer.isBuffer(p)){const raw=p;try{p=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(p);}catch{return false;}if(!Buffer.from(p,'utf8').equals(raw))return false;}return typeof p==='string'&&(path.resolve(p)===own||path.resolve(p).startsWith(own+path.sep));};
const deny=()=>{count++;if(!controls)process.stderr.write('DENIED_OPERATION\\n');const e=new Error('NATIVE_DENIAL');e.code='NATIVE_DENIAL';throw e;};
globalThis.fetch=deny;
for(const[o,ns]of[[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],[tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]])for(const n of ns)o[n]=deny;
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;
for(const n of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[n]=deny;
const double=new Set(['rename','renameSync','copyFile','copyFileSync','cp','cpSync','link','linkSync','symlink','symlinkSync']);
for(const o of[fs,fsp])for(const n of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','mkdtemp','mkdtempSync','rename','renameSync','rm','rmSync','unlink','unlinkSync','truncate','truncateSync','createWriteStream','copyFile','copyFileSync','cp','cpSync','symlink','symlinkSync','link','linkSync','chmod','chmodSync','chown','chownSync']){const original=o[n];if(original)o[n]=(...args)=>{if(!inside(args[0])||(double.has(n)&&!inside(args[1])))deny();return original(...args);};}
const writable=f=>typeof f==='number'?!!(f&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND)):f!==undefined&&!['r','rs'].includes(f);
for(const n of ['openSync','open']){const original=fs[n];fs[n]=(p,f,...rest)=>{const write=writable(f);if(write&&!inside(p))deny();if(n==='openSync'){const fd=original(p,f,...rest);if(write)ownedFDs.add(fd);return fd;}const callback=rest.pop();return original(p,f,...rest,(e,fd)=>{if(!e&&write)ownedFDs.add(fd);callback(e,fd);});};}
const open=fsp.open;fsp.open=async(p,f,...rest)=>{if(writable(f)&&!inside(p))deny();return open(p,f,...rest);};
for(const n of ['close','closeSync']){const original=fs[n];fs[n]=(fd,...rest)=>{ownedFDs.delete(fd);return original(fd,...rest);};}
for(const n of ['write','writeSync','writev','writevSync']){const original=fs[n];fs[n]=(fd,...rest)=>ownedFDs.has(fd)?original(fd,...rest):deny();}
syncBuiltinESMExports();
for(const fn of[()=>fetch('https://invalid.invalid'),()=>fs.writeFileSync('/unallocated-expert-file-fixture','x'),()=>cp.spawn('unallocated',[])])try{fn();throw new Error('NOT_ARMED');}catch(e){if(e.code!=='NATIVE_DENIAL')throw e;}
if(count!==3)throw new Error('NOT_ARMED');controls=false;process.stderr.write('EXPERT_FILES_NATIVE_GUARD '+JSON.stringify({denied:3})+'\\n');
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
    assert.match(stderr, /^EXPERT_FILES_NATIVE_GUARD \{"denied":3\}\n/); assert.doesNotMatch(stderr, /DENIED_OPERATION|NOT_ARMED/);
    return { exitCode: end.code, stdout, stderr: stderr.replace(/^EXPERT_FILES_NATIVE_GUARD \{"denied":3\}\n/, '') };
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
  assert.deepEqual([...entries.keys()].sort(),MEMBERS,'MEMBERS'); assert.equal(imports(entries),12,'JS_COUNT');
  for(const[name,row]of entries) { assert.equal(row.mode,MODES[name],'MODE'); if(SOURCE_PINS[name.slice(8)])assert.equal(hash(row.bytes),SOURCE_PINS[name.slice(8)],'SOURCE'); assert.deepEqual(row.bytes,expectedBytes.get(name),'FROZEN_BYTES'); }
  const metadata=JSON.parse(entries.get('package/package.json').bytes);
  assert.deepEqual(metadata.bin,BIN,'BIN'); assert.deepEqual(metadata.files,FILES,'FILES');
  assert.equal(metadata.name,'canli-fundamentals-mcp'); assert.equal(metadata.version,'0.5.0'); assert.equal(metadata.private,false);
  assert.deepEqual(metadata.dependencies,{'@modelcontextprotocol/server':'2.1.0',zod:'4.6.5','@modelcontextprotocol/client':'2.1.0'});
  return metadata;
}
function marked(guide,label) {
  const begin=`<!-- EXPERT_FILES_${label}_BEGIN -->`,end=`<!-- EXPERT_FILES_${label}_END -->`;
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
before(async t => {
  TMP=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'canli-expert-files-package-'));fs.chmodSync(TMP,0o700);
  let completed=false;
  try {
    expectedBytes=new Map(MEMBERS.map(name=>[name,snapshot(path.join(ROOT,name.slice(8)),L.expanded)]));
    const guard=path.join(TMP,'guard.mjs');fs.writeFileSync(guard,childGuard(),{flag:'wx',mode:0o600});
    restore=parentGuard();
    const artifact=await packOnce();
    // Save the complete bounded compressed raw diagnostic BEFORE any fallible gzip/TAR admission.
    const raw={admission:'RAW_CAPTURED_NOT_ADMITTED',compressed_bytes:artifact.compressed.length,compressed_sha256:hash(artifact.compressed),original_gzip_base64:artifact.compressed.toString('base64')};
    diagnosticNow('RAW', raw);
    const entries=tarEntries(artifact.compressed);
    const rawModes={...raw,files:[...entries].map(([name,row])=>({path:name,mode:row.mode,bytes:row.bytes.length,sha256:hash(row.bytes)}))};
    diagnosticNow('RAW_MODES', rawModes);
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
    const module=await import(pathToFileURL(path.join(root,'src/expert-submission-files.mjs')).href);
    main=module.main;assert.deepEqual(module.EXPERT_SUBMISSION_CLI_LIMITS,LIMITS);
    const guide=entries.get('package/EXPERT_SUBMISSION_FILES.md').bytes.toString('utf8'),s=guideScenario(guide);
    assert.match(guide,new RegExp(hash(s.rawGold))); assert.equal(s.intakeSettings.packet_sha256,hash(packetContent(s.gold)));
    packed={...artifact,entries,metadata,raw,root,consumer,guard,binRoot,bins,guide,s};
    const admitted={admission:'ADMITTED',compressed_sha256:raw.compressed_sha256,files:[...entries].map(([name,row])=>({path:name,mode:row.mode,bytes:row.bytes.length,sha256:hash(row.bytes)})),bins,SDK_entries:0,external_dependency_links:0,repository_runtime_links:0};
    diagnosticNow('ADMITTED', admitted);completed=true;
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
  const f=files(t,guideScenario(packed.guide)),entry=kind==='alias'?path.join(packed.binRoot,'canli-expert-submission-files'):path.join(packed.root,'src/expert-submission-files.mjs');
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
  else { assert.equal(observation.calls, 1); assert.deepEqual(snapshot(f.out), Buffer.from(JSON.stringify(reconcileExpertSubmissions(...coreArgs(f.s))) + '\n')); }
}


function checksum(header) { header.fill(32, 148, 156); header.write(header.reduce((n, b) => n + b, 0).toString(8).padStart(6, '0') + '\0 ', 148, 'ascii'); return header; }
function tinyTar(rows, mutate = () => {}) {
  const chunks = [];
  rows.forEach((row, index) => { const header = Buffer.alloc(512); header.write(row.name, 0, 'ascii'); header.write('0000644\0', 100, 'ascii');
    header.write(row.bytes.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii'); header[156] = 48;
    mutate(header, index); checksum(header); chunks.push(header, row.bytes, Buffer.alloc((512 - row.bytes.length % 512) % 512)); });
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]), { mtime: 0 });
}

test('expert files package: one offline artifact admits exact18 bodies five bins raw modes and full metadata', () => {
  assert.equal(MEMBERS.length,20);assert.equal(Object.keys(BIN).length,6);assert.deepEqual(admit(cloneEntries()),packed.metadata);
  assert.equal(packed.raw.admission,'RAW_CAPTURED_NOT_ADMITTED');assert.equal(packed.raw.compressed_sha256,hash(packed.compressed));
  for(const flag of ['--offline','--ignore-scripts','--update-notifier=false','--audit=false','--fund=false'])assert.ok(packed.args.includes(flag));
  assert.equal(packed.bins[0].raw_mode,0o644);assert.ok(packed.bins.every(row=>row.fixture_mode===0o755&&row.owned_fixture_only));
  const gzip = tinyTar([{name:'package/a',bytes:Buffer.from('synthetic raw capture')}]);
  const raw = {admission:'RAW_CAPTURED_NOT_ADMITTED',compressed_bytes:gzip.length,compressed_sha256:hash(gzip),original_gzip_base64:gzip.toString('base64')};
  const chunks = []; let writes = 0;
  const sink = (fd, frame, offset, length) => {assert.equal(fd,1);writes++;const n=Math.min(length,31);chunks.push(Buffer.from(frame.subarray(offset,offset+n)));return n;};
  assert.throws(() => {diagnosticNow('RAW',raw,sink);throw new Error('SIMULATED_BEFORE_HOOK_REFUSAL');},/SIMULATED_BEFORE_HOOK_REFUSAL/);
  assert.ok(writes>1);const saved=Buffer.concat(chunks).toString('utf8');
  assert.equal(saved,'# CANLI_EXPERT_FILES_PACKAGE_RAW '+JSON.stringify(raw)+'\n');
  assert.deepEqual(Buffer.from(JSON.parse(saved.slice('# CANLI_EXPERT_FILES_PACKAGE_RAW '.length)).original_gzip_base64,'base64'),gzip);
  let refusedWrites=0;assert.throws(() => diagnosticNow('RAW',{over:'x'.repeat(384*1024)},() => {refusedWrites++;return 1;}),/RAW_DIAGNOSTIC_BOUND/);assert.equal(refusedWrites,0);
  let stopped=0;assert.throws(() => diagnosticNow('RAW',raw,() => {stopped++;return 0;}),/RAW_DIAGNOSTIC_WRITE/);assert.equal(stopped,1);
});
test('expert files package: only shebang and one literal core relocation invert the entire delivered CLI', () => {
  let source=packed.entries.get('package/src/expert-submission-files.mjs').bytes.toString();assert.ok(source.startsWith('#!/usr/bin/env node\n'));source=source.slice(20);
  assert.equal(source.split("import('./expert-submission-audit-core.mjs')").length,2);source=source.replace("import('./expert-submission-audit-core.mjs')","import('./expert-submission-audit.mjs')");
  const original=snapshot(path.resolve(ROOT,'../scripts/datasets/filing-facts/expert-submission-cli.mjs'));assert.deepEqual(Buffer.from(source),original);assert.equal(hash(original),'d8f35d72e842244558ccbd1b42ec7c2e9fc07da1b790cdb843422e53c5d513d7');
  assert.equal(packed.entries.get('package/src/server.mjs').mode,0o644);assert.equal(packed.entries.get('package/src/expert-submission-files.mjs').mode,0o755);
});
test('expert files package: all eleven JS MJS imports admit constant from-text and refuse reexports escape or computed loading', () => {
  assert.equal(imports(cloneEntries()),12);
  const positive=cloneEntries();positive.set('package/src/constant.js',{mode:0o644,bytes:Buffer.from("export const notice = 'from supplied files';\n")});assert.equal(imports(positive),13);
  for(const source of ["export * from './absent.mjs';\n","const x = import(name);\n","const x = import('./absent.mjs');\n","import x from '../../private.mjs';\n"]) {const rows=cloneEntries();rows.set('package/src/fault.js',{mode:0o644,bytes:Buffer.from(source)});assert.throws(()=>imports(rows),/REEXPORT|DYNAMIC|LOCAL_IMPORT/);}
  const missing=cloneEntries();missing.delete('package/src/expert-submission-audit-core.mjs');assert.throws(()=>imports(missing),/LOCAL_IMPORT/);
});
test('expert files package: missing extra tampered wrong-mode members and changed fifth bin or files refuse before extraction', () => {
  const before=fs.readdirSync(packed.consumer).sort();
  for(const kind of ['missing','extra','bytes','mode','bin','files']) {const rows=cloneEntries();
    if(kind==='missing')rows.delete('package/EXPERT_SUBMISSION_FILES.md');if(kind==='extra')rows.set('package/private.json',{mode:0o644,bytes:bytes({secret:true})});
    if(kind==='bytes')rows.get('package/src/expert-submission-files.mjs').bytes[50]^=1;if(kind==='mode')rows.get('package/src/expert-submission-files.mjs').mode=0o644;
    if(kind==='bin'||kind==='files') {const metadata=JSON.parse(rows.get('package/package.json').bytes);if(kind==='bin')metadata.bin['canli-expert-submission-files']='../private.mjs';else metadata.files.pop();rows.get('package/package.json').bytes=bytes(metadata);}
    assert.throws(()=>admit(rows),/MEMBERS|SOURCE|MODE|FROZEN_BYTES|BIN|FILES/);
  } assert.deepEqual(fs.readdirSync(packed.consumer).sort(),before);
});
test('expert files package: gzip CRC ISIZE trailing and concatenated streams refuse before writes', () => {
  const before=fs.readdirSync(packed.consumer).sort();
  for(const offset of [8,4]) {const fault=Buffer.from(packed.compressed);fault[fault.length-offset]^=1;assert.throws(()=>tarEntries(fault),/GZIP_CRC|GZIP_ISIZE/);}
  for(const extra of [Buffer.from('x'),gzipSync(Buffer.alloc(0))])assert.throws(()=>tarEntries(Buffer.concat([packed.compressed,extra])),/GZIP_SINGLE_MEMBER/);
  assert.deepEqual(fs.readdirSync(packed.consumer).sort(),before);
});
test('expert files package: compressed expanded and member capacities are enforced before extraction', () => {
  const before=fs.readdirSync(packed.consumer).sort();assert.throws(()=>tarEntries(Buffer.alloc(L.compressed+1)),/GZIP_BOUND/);
  assert.throws(()=>tarEntries(gzipSync(Buffer.alloc(L.expanded+512))));
  assert.throws(()=>tarEntries(tinyTar(Array.from({length:33},(_,i)=>({name:'package/item-'+i,bytes:Buffer.alloc(0)})))),/TAR_COUNT/);
  assert.deepEqual(fs.readdirSync(packed.consumer).sort(),before);
});
test('expert files package: checksum-valid highbit octal path duplicate and link faults hit raw TAR admission before any write', () => {
  const good=tinyTar([{name:'package/a',bytes:Buffer.from('x')}]);assert.equal(tarEntries(good).size,1);
  for(const offset of [0,345,100,124,156])assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.from('x')}],h=>{h[offset]|=128;})),/TAR_ASCII/);
  const sum=inflateRawSync(good.subarray(10));sum[148]|=128;assert.throws(()=>tarEntries(gzipSync(sum)),/TAR_ASCII/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.from('x')}],h=>{h[124]=57;})),/TAR_OCTAL/);
  const crc=inflateRawSync(good.subarray(10));crc[8]=98;assert.throws(()=>tarEntries(gzipSync(crc)),/TAR_CHECKSUM/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/../private',bytes:Buffer.alloc(0)}])),/TAR_PATH/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.alloc(0)},{name:'package/a',bytes:Buffer.alloc(0)}])),/TAR_DUPLICATE/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.alloc(0)}],h=>{h[156]=50;})),/TAR_REGULAR/);
  assert.throws(()=>tarEntries(tinyTar([{name:'package/a',bytes:Buffer.alloc(0)}],h=>{h.write('elsewhere',157);})),/TAR_LINK/);
});
test('expert files package: marked guide inputs bind raw gold separately and expose fullN missing roles null outcomes without dependency links', () => {
  const s=guideScenario(packed.guide);assert.match(packed.guide,new RegExp(hash(s.rawGold)));assert.equal(s.intakeSettings.packet_sha256,hash(packetContent(s.gold)));
  const report=reconcileExpertSubmissions(...coreArgs(s));assert.equal(report.coverage.selected_n,3);assert.equal(report.coverage.required_item_assignments_n,6);assert.deepEqual(report.coverage.absent_role_submissions,['reviewer_a','reviewer_b']);
  for(const v of Object.values(report.established))assert.equal(v,null);assert.equal(report.implementation.declared_module_sha256_verified,false);
  assert.equal(fs.existsSync(path.join(packed.root,'node_modules')),false);assert.equal(fs.existsSync(path.join(packed.root,'scripts')),false);assert.equal(fs.existsSync(path.join(packed.root,'.git')),false);
});
test('expert files package: caught network foreign-write and unknown-child controls never delegate and guards stay armed', () => {
  const before=denied;for(const fn of [()=>fetch('https://invalid.invalid'),()=>fs.writeFileSync('/unallocated-expert-files-native-control','x'),()=>cp.spawn('unallocated',[])])assert.throws(fn,e=>e.code==='NATIVE_DENIAL');assert.equal(denied,before+3);
  for (const name of [Buffer.from('/unallocated-expert-files-buffer-control'), Buffer.from([0xff]), Buffer.from('\ufeff' + path.join(TMP, 'foreign-bom-buffer-control'))]) assert.throws(() => fs.writeFileSync(name, 'x'), e => e.code === 'NATIVE_DENIAL');
  assert.equal(denied, before + 6);
  const own = Buffer.from(path.join(TMP, 'owned-buffer-control'));
  fs.writeFileSync(own, 'owned synthetic cleanup path', { flag: 'wx', mode: 0o600 });
  fs.unlinkSync(own); assert.equal(denied, before + 6);
});
test('expert files package: command entry1 direct packaged guide saves the byteexact full unchanged core report with known owned exit', {timeout:15000}, async t => {const result=await actualCommand(t,'direct');assert.equal(commandEntries,1);assert.equal(JSON.parse(result.stdout).selected_n,3);});
test('expert files package: command entry2 installed-style absolute owned symlink produces exact direct report parity', {timeout:15000}, async t => {const result=await actualCommand(t,'alias');assert.equal(commandEntries,2);assert.equal(JSON.parse(result.stdout).syntactic_only,true);});
test('expert files package: command entry3 malformed arguments refuse with bounded noecho and no output or successful status', {timeout:15000}, async t => {const result=await actualCommand(t,'refusal');assert.equal(commandEntries,3);assert.equal(result.stdout,'');});

test('expert files native: two absent reviewer files retain full selected-N and explicit missing roles in the exact private API report', async t => {
  const f = files(t), report = saved(f, await main(f.argv));
  assert.deepEqual(report.coverage.absent_role_submissions, ['reviewer_a', 'reviewer_b']);
  assert.equal(report.coverage.complete_syntactic_pairs_n, 0);
  assert.ok(report.adjudication.item_tasks.every(row => row.missing_submissions.length === 2));
});

test('expert files native: two blank exports stay present-but-incomplete instead of becoming absent files or verified agreement', async t => {
  const f = files(t, scenario({ returned: 2, blank: true })), report = saved(f, await main(f.argv));
  assert.equal(report.coverage.role_submissions_provided_n, 2); assert.equal(report.coverage.complete_syntactic_pairs_n, 0);
  assert.ok(report.role_coverage.every(row => row.submission_status === 'partial_syntactic_submission'));
});

test('expert files native: partial judgements missing notes and disagreements survive with all three selected pairs and no adjudication', async t => {
  const s = scenario({ returned: 2 }), r = JSON.parse(s.submission[0]);
  r.labels[0].question_clear = ''; r.labels[1].answer_matches_filing = 'cannot_find'; r.labels[1].notes = '';
  putReturn(s, 0, bytes(r)); const f = files(t, s), report = saved(f, await main(f.argv));
  assert.equal(report.coverage.complete_syntactic_pairs_n, 1);
  assert.deepEqual(report.adjudication.item_tasks[1].missing_fields, [{ role: 'reviewer_a', fields: ['notes'] }]);
  assert.equal(report.adjudication.item_tasks[1].syntactic_disagreements[0].field, 'answer_matches_filing');
});

test('expert files native: complete fictional agreement preserves exact full-N and every unknown human expert independence and rights outcome', async t => {
  const f = files(t, scenario({ returned: 2, evidence: 2 })), report = saved(f, await main(f.argv));
  assert.equal(report.coverage.complete_syntactic_pairs_n, 3);
  assert.equal(report.syntactic_agreement.complete_item_pairs_result.items, 3);
  for (const row of report.preparation.evidence_inventory) assert.equal(row.document_authenticity, null);
});

test('expert files native: all original descriptors close before one lazy core load and one nine-buffer reconciliation call', async t => {
  const f = files(t, scenario({ returned: 2, evidence: 64 })), io = instrument(), observation = {};
  const loadCore = async () => {
    assert.deepEqual([...io.held.values()], [f.root]); return loader(observation)();
  };
  saved(f, await main(f.argv, { filesystem: io.filesystem, loadCore }));
  assert.equal(observation.loads, 1); assert.equal(observation.calls, 1); assert.equal(observation.args.length, 9);
  assert.deepEqual(observation.args, coreArgs(f.s)); assert.equal(io.held.size, 0);
  const firstRead = io.events.findIndex(row => row.operation === 'readSync');
  assert.equal(io.events.slice(0, firstRead).filter(row => row.operation === 'openSync' && f.inputs.includes(row.path)).length, 72);
  assert.deepEqual(io.events.filter(row => row.operation === 'openSync' && (row.args[1] & fs.constants.O_CREAT)).map(row => row.path), [f.out]);
});

test('expert files native: expected gold hash requires a primitive exact lowercase64 before any filesystem operation', async t => {
  const f = files(t);
  for (const bad of ['0'.repeat(63), '0'.repeat(65), 'A'.repeat(64), '0'.repeat(64) + '\n', [hash(f.s.rawGold)]]) {
    const argv = [...f.argv]; argv[3] = bad; const io = instrument(); refused(await main(argv, io)); assert.equal(io.events.length, 0);
  }
  saved(f, await main(f.argv));
});

test('expert files native: unknown duplicate missing-value scalar flags positional extras and accessor argv refuse before native IO', async t => {
  const f = files(t);
  const accessor = [...f.argv]; Object.defineProperty(accessor, '1', { get() { assert.fail('argv accessor must not execute'); } });
  for (const argv of [[...f.argv, '--unknown', '/x'], [...f.argv, '--gold', f.paths.gold], f.argv.slice(0, -1),
    [...f.argv, 'extra', 'value'], accessor, new Proxy(f.argv, { get() { assert.fail('argv proxy must not execute'); } })]) {
    const io = instrument(); refused(await main(argv, io), 'CLI_ARGUMENTS'); assert.equal(io.events.length, 0);
  }
});

test('expert files native: sixty-fifth evidence and third submission refuse count before any input open', async t => {
  const f = files(t);
  for (const [flag, count] of [['--evidence', 65], ['--submission', 3]]) {
    const argv = [...f.argv, ...Array.from({ length: count }, (_, i) => [flag, join(f.root, `extra-${i}`)]).flat()];
    const io = instrument(); refused(await main(argv, io), 'CLI_COUNT'); assert.equal(io.events.length, 0);
  }
});

test('expert files native: every individual file cap-plus-one refuses before payload read core load or output creation', async t => {
  for (const name of ['gold', 'intake', 'evidenceInventory', 'intakeSettings', 'submissionInventory', 'auditSettings', 'evidence', 'submission']) {
    await sizePlan(t, scenario({ evidence: 1, returned: 1 }), f => ({
      [Array.isArray(f.paths[name]) ? f.paths[name][0] : f.paths[name]]: LIMITS[name] + 1,
    }), 'CLI_INPUT_BOUND');
  }
});

test('expert files native: all evidence cap exactly256KiB reaches the bounded read but cap-plus-one refuses before any read', async t => {
  const plan = (f, over) => Object.fromEntries(f.paths.evidence.map((file, index) => [file,
    index < 8 ? LIMITS.evidence : over ? 1 : f.s.evidence[index].length]));
  await sizePlan(t, scenario({ evidence: 8 }), f => plan(f, false), 'CLI_READ', true);
  await sizePlan(t, scenario({ evidence: 9 }), f => plan(f, true), 'CLI_EVIDENCE_BOUND');
});

test('expert files native: intake-prefix768KiB boundary includes all four original documents and evidence before any payload read', async t => {
  const sizes = (f, over) => ({ [f.paths.gold]: LIMITS.gold, [f.paths.intake]: LIMITS.intake,
    [f.paths.evidenceInventory]: LIMITS.evidenceInventory, [f.paths.intakeSettings]: LIMITS.intakeSettings,
    ...Object.fromEntries(f.paths.evidence.map((file, index) => [file, index < 4 ? LIMITS.evidence : 28 * 1024 + over])) });
  await sizePlan(t, scenario({ evidence: 5 }), f => sizes(f, 0), 'CLI_READ', true);
  await sizePlan(t, scenario({ evidence: 5 }), f => sizes(f, 1), 'CLI_INTAKE_BOUND');
});

test('expert files native: all-input4MiB boundary counts both individually bounded submissions and all six metadata files', async t => {
  const plan = (f, over) => {
    const metadata = ['gold', 'intake', 'evidenceInventory', 'intakeSettings', 'submissionInventory', 'auditSettings']
      .reduce((sum, name) => sum + fs.lstatSync(f.paths[name]).size, 0);
    return { [f.paths.submission[0]]: LIMITS.submission,
      [f.paths.submission[1]]: LIMITS.inputTotal - metadata - LIMITS.submission + over };
  };
  await sizePlan(t, scenario({ returned: 2 }), f => plan(f, 0), 'CLI_READ', true);
  await sizePlan(t, scenario({ returned: 2 }), f => plan(f, 1), 'CLI_TOTAL_BOUND');
});

test('expert files native: input symlink and real directory refuse FD-first no-follow admission without following contents', async t => {
  const f = files(t), link = join(f.root, 'input-alias.json'); fs.symlinkSync(f.paths.gold, link);
  for (const file of [link, f.root]) {
    const argv = [...f.argv]; argv[1] = file; const io = instrument(); refused(await main(argv, io));
    const open = io.events.find(row => row.operation === 'openSync'); assert.ok(open.args[1] & fs.constants.O_NOFOLLOW);
    assert.ok(open.args[1] & fs.constants.O_NONBLOCK); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0);
    assert.equal(io.held.size, 0);
  }
});

test('expert files native: synthetic FIFO socket device and unknown-owned types refuse before body allocation with nonblocking flags', async t => {
  for (const change of [{ isFile: () => false, isFIFO: () => true }, { isFile: () => false, isSocket: () => true },
    { isFile: () => false, isCharacterDevice: () => true }, { uid: BigInt(process.getuid()) + 1n }]) {
    const f = files(t), io = instrument({ fstatSync(event, native) { const st = native();
      return event.path === f.paths.gold ? statWith(st, change) : st; } });
    refused(await main(f.argv, io), 'CLI_INPUT_BOUND'); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0);
    assert.ok(io.events[0].args[1] & fs.constants.O_NONBLOCK); assert.equal(io.held.size, 0);
  }
});

test('expert files native: hard-linked input and existing output inode aliases refuse without reading or creating an output', async t => {
  const f = files(t), alias = join(f.root, 'hard-link.json'); fs.linkSync(f.paths.gold, alias);
  const argv = [...f.argv]; argv[5] = alias; const io = instrument(); refused(await main(argv, io), 'CLI_ALIAS');
  assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0); assert.equal(io.held.size, 0);
  fs.linkSync(f.paths.gold, f.out); const second = instrument(); refused(await main(f.argv, second), 'CLI_ALIAS');
  assert.equal(second.events.filter(row => row.operation === 'readSync').length, 0); assert.deepEqual(snapshot(f.out), f.s.rawGold);
});

test('expert files native: nonprivate missing and symlinked output parents refuse without mkdir chmod or input body reads', async t => {
  const f = files(t), shared = join(f.root, 'shared'), link = join(f.root, 'parent-link');
  fs.mkdirSync(shared, { mode: 0o755 }); fs.chmodSync(shared, 0o755); fs.symlinkSync(f.root, link);
  for (const parent of [shared, join(f.root, 'missing'), link]) {
    const argv = [...f.argv]; argv[15] = join(parent, 'out.json'); const io = instrument();
    refused(await main(argv, io), 'CLI_PARENT'); assert.equal(io.events.filter(row => row.operation === 'readSync').length, 0);
    assert.equal(io.held.size, 0);
  }
});

test('expert files native: uncertain native output creation and existing-name race refuse without overwrite or auto-cleanup', async t => {
  const f = files(t), marker = Buffer.from('SYNTHETIC output-name race'); let created = false;
  const io = instrument({ openSync(event, native) {
    if (event.path === f.out) { assert.ok(event.args[1] & fs.constants.O_EXCL); assert.ok(event.args[1] & fs.constants.O_NOFOLLOW);
      created = true; fs.writeFileSync(f.out, marker, { flag: 'wx', mode: 0o600 }); }
    return native();
  } });
  refused(await main(f.argv, io), 'CLI_OUTPUT'); assert.equal(created, true); assert.deepEqual(snapshot(f.out), marker);
  assert.equal(io.events.filter(row => row.operation === 'writeSync').length, 0); assert.equal(io.held.size, 0);
});

test('expert files native: real short reads and writes advance exactly while original buffers and readback remain byte-exact', async t => {
  const f = files(t, scenario({ returned: 2 })); let shortenedReads = 0, shortenedWrites = 0;
  const io = instrument({
    readSync(event) { const [fd, buffer, offset, length, position] = event.args;
      if (length > 7) shortenedReads++; return fs.readSync(fd, buffer, offset, Math.min(length, 7), position); },
    writeSync(event) { const [fd, buffer, offset, length, position] = event.args;
      if (length > 11) shortenedWrites++; return fs.writeSync(fd, buffer, offset, Math.min(length, 11), position); },
  });
  saved(f, await main(f.argv, io)); assert.ok(shortenedReads > 0 && shortenedWrites > 0); assert.equal(io.held.size, 0);
});

test('expert files native: the one overflow byte detects growth and is never silently included in a successful raw binding', async t => {
  const f = files(t), size = f.s.rawGold.length; let overflow = 0;
  const io = instrument({ readSync(event, native) { if (event.path === f.paths.gold && event.args[4] === size) {
    overflow++; return 1; } return native(); } });
  refused(await main(f.argv, io), 'CLI_READ'); assert.equal(overflow, 1); assert.equal(fs.existsSync(f.out), false);
});

test('expert files native: same-FD size mtime and ctime changes after capture refuse before core import', async t => {
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

test('expert files native: replacing the input path after opening its original FD refuses postpath identity before core', async t => {
  const f = files(t); let replaced = false;
  const io = instrument({ readSync(event, native) {
    const result = native(); if (event.path === f.paths.gold && !replaced) {
      replaced = true; fs.renameSync(f.paths.gold, join(f.root, 'original-gold.json'));
      fs.writeFileSync(f.paths.gold, f.s.rawGold, { flag: 'wx', mode: 0o600 });
    } return result;
  } });
  refused(await main(f.argv, io), 'CLI_INPUT_CHANGED'); assert.equal(replaced, true); assert.equal(fs.existsSync(f.out), false);
});

test('expert files native: serialized core-report cap includes all JSON overhead and refuses before output creation', async t => {
  const f = files(t), io = instrument(), observation = {};
  const result = await main(f.argv, { filesystem: io.filesystem,
    loadCore: loader(observation, () => ({ coverage: { selected_n: 3, role_submissions_provided_n: 0 }, payload: 'x'.repeat(LIMITS.report) })) });
  refused(result, 'CLI_REPORT_BOUND'); assert.equal(observation.calls, 1); assert.equal(fs.existsSync(f.out), false);
  assert.equal(io.events.filter(row => row.operation === 'writeSync').length, 0); assert.equal(io.held.size, 0);
  const positive = files(t), report = { coverage: { selected_n: 3, role_submissions_provided_n: 0 }, payload: '' };
  report.payload = 'x'.repeat(LIMITS.report - Buffer.byteLength(JSON.stringify(report)));
  const accepted = await main(positive.argv, { loadCore: loader({}, () => report) });
  assert.equal(accepted.exitCode, 0); const raw = snapshot(positive.out);
  assert.equal(raw.length, LIMITS.reportFile); assert.equal(raw.at(-1), 10);
  assert.deepEqual(raw, Buffer.from(JSON.stringify(report) + '\n'));
});

test('expert files native: write failure after real partial progress retains exactly those private bytes without unlink or retry', async t => {
  const f = files(t); let calls = 0;
  const io = instrument({ writeSync(event) {
    calls++; if (calls > 1) return 0;
    const [fd, buffer, offset, , position] = event.args; return fs.writeSync(fd, buffer, offset, 13, position);
  } });
  refused(await main(f.argv, io), 'CLI_WRITE'); assert.equal(calls, 2);
  assert.deepEqual(snapshot(f.out), Buffer.from(JSON.stringify(reconcileExpertSubmissions(...coreArgs(f.s))) + '\n').subarray(0, 13));
});

test('expert files native: file fsync failure retains complete private output but forbids directory fsync and terminal success', async t => {
  const f = files(t); let fileFlushes = 0, directoryFlushes = 0;
  const io = instrument({ fsyncSync(event, native) {
    if (event.path === f.out) { fileFlushes++; throw new Error('uncertain file durability'); }
    directoryFlushes++; return native();
  } });
  refused(await main(f.argv, io), 'CLI_FLUSH'); assert.equal(fileFlushes, 1); assert.equal(directoryFlushes, 0);
  assert.ok(snapshot(f.out).length > 0); assert.equal(io.held.size, 0);
});

test('expert files native: directory fsync failure after known file close retains output and forbids successful terminal status', async t => {
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

test('expert files native: readback byte corruption zero count and overflow refuse with complete private file retained', async t => {
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

test('expert files native: post-write output pathname replacement refuses even when saved FD readback bytes still match', async t => {
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

test('expert files native: both input and output close after real numeric FD reuse are attempted once and preserve the foreign FD', async t => { await closeReuse(t, 'input'); await closeReuse(t, 'output'); });
