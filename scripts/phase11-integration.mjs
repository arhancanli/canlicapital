// User-approved controlled writes. Fixed preview targets; no production redirects.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {MANIFEST} from '../api/_lib/manifest.js';
import {canonical,contentId,sha256Hex} from '../api/_lib/canonical.js';
const base='https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app';
const backend=JSON.parse(readFileSync('.vercel/phase10-private.json'));
assert.equal(backend.projectRef,'gdqrwikuqzxioxhequtc');
assert.equal(backend.url,'https://gdqrwikuqzxioxhequtc.supabase.co');
const out='artifacts/qa/phase11-integration',privateFile='.vercel/phase11-private.json';
mkdirSync(out,{recursive:true});
if(existsSync(privateFile))throw Error('A controlled run has already started. Inspect its report; do not issue another key blindly.');
const state={base,label:'phase11-controlled-20260910',email:'phase11-20260910@example.invalid',keyIssueAttempted:false};
const report={base,projectRef:backend.projectRef,startedAt:new Date().toISOString(),steps:[],receipts:[],emailSent:false};
const save=()=>{writeFileSync(privateFile,JSON.stringify(state),{mode:0o600});writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');};
const ok=(name,details={})=>{report.steps.push({name,passed:true,...details});save();console.log({passed:name});};
async function http(path,{body,key,raw,method='GET'}={}){
 assert.ok(path.startsWith('/api/'));
 const response=await fetch(base+path,{method,redirect:'error',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:raw??(body===undefined?undefined:JSON.stringify(body)),signal:AbortSignal.timeout(30000)});
 const text=await response.text();let data;
 if(response.headers.get('content-type')?.includes('json'))data=JSON.parse(text);
 return {status:response.status,headers:response.headers,data,text};
}
async function table(name,query='select=*'){
 assert.ok(['api_keys','api_usage_daily','api_key_issuance','receipts','waitlist'].includes(name));
 const r=await fetch(backend.url+'/rest/v1/'+name+'?'+query,{redirect:'error',headers:{apikey:backend.serviceKey,Authorization:'Bearer '+backend.serviceKey},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,`Preview ${name} read failed`);return r.json();
}
async function counts(){return Object.fromEntries(await Promise.all(['api_keys','receipts','waitlist'].map(async name=>[name,(await table(name,'select=id')).length])));}
try{
 report.before=await counts();assert.deepEqual(report.before,{api_keys:0,receipts:0,waitlist:0},'Expected empty isolated test backend');
 let r=await http('/api/v1/validate/status');assert.equal(r.status,200);assert.equal(r.data.data.store_reachable,true);ok('healthy isolated empty-store preflight');
 r=await http('/api/v1/keys',{method:'POST',raw:'{not json'});assert.equal(r.status,400);assert.equal(r.data.error.code,'invalid_json');ok('malformed key JSON rejected');
 r=await http('/api/v1/validate/breadth',{method:'POST',body:{}});assert.equal(r.status,401);ok('missing authorization rejected');
 r=await http('/api/v1/validate/breadth',{method:'POST',body:{},key:'ck_live_phase11_unknown'});assert.equal(r.status,401);ok('unknown key rejected');
 state.keyIssueAttempted=true;save();
 r=await http('/api/v1/keys',{method:'POST',body:{label:state.label}});assert.equal(r.status,201,'Key issuance failed');
 assert.ok(typeof r.data.data.key==='string'&&r.data.data.key.startsWith('ck_live_'),'Expected issued key');state.key=r.data.data.key;save();
 const keys=await table('api_keys','select=id,key_hash,label,revoked_at');assert.equal(keys.length,1);assert.equal(keys[0].label,state.label);assert.equal(keys[0].key_hash,sha256Hex(state.key));state.keyId=keys[0].id;save();ok('one preview key issued; only matching hash stored');
 const validators=MANIFEST.filter(m=>m.keyed);
 for(const m of validators){
  r=await http(m.path,{method:'POST',body:m.requestExample,key:state.key});assert.equal(r.status,200,m.path);assert.equal(r.data.data.receipt_stored,true);assert.equal(r.data.claim_class,'USER_SUBMITTED_SCENARIO');
  const {receipt_stored,...output}=r.data.data;
  const endpoint=m.path.replace('/api/v1/','');const bindings=Object.fromEntries(r.data.sources.map(s=>[s.path,s.sha256]));
  const input_sha256='sha256:'+sha256Hex(canonical(m.requestExample));
  const id=contentId({endpoint,input_sha256,output,bindings});
  assert.equal(r.data.receipt.id,id);assert.equal(r.data.receipt.input_sha256,input_sha256);assert.equal(r.data.receipt.output_sha256,'sha256:'+sha256Hex(canonical(output)));
  assert.equal(r.data.receipt.url,base+'/api/v1/receipts/'+id);
  const {compute}=await import('../api/v1/validate/'+m.path.split('/').pop()+'.js');assert.deepEqual(output,JSON.parse(JSON.stringify(compute(m.requestExample))));
  const rec=await http('/api/v1/receipts/'+id);assert.equal(rec.status,200);assert.deepEqual(rec.data.data.output,output);assert.equal(rec.data.data.badge_url,base+'/api/v1/receipts/'+id+'/badge.svg');
  assert.equal(rec.data.data.embed_markdown,`[![Canli receipt](${base}/api/v1/receipts/${id}/badge.svg)](${base}/api/v1/receipts/${id})`);
  const badge=await http('/api/v1/receipts/'+id+'/badge.svg');assert.equal(badge.status,200);assert.match(badge.headers.get('content-type'),/image\/svg\+xml/);assert.equal(badge.headers.get('set-cookie'),null);
  for(const word of ['verified','approved','passed','certified','profitable'])assert.ok(!badge.text.toLowerCase().includes(word),'Badge must not endorse performance');
  report.receipts.push({endpoint:m.path,id,url:r.data.receipt.url,localComputationMatched:true,hashesMatched:true});ok(m.path+' persisted receipt and badge verified');
 }
 const first=validators[0];r=await http(first.path,{method:'POST',body:first.requestExample,key:state.key});assert.equal(r.status,200);assert.equal(r.data.receipt.id,report.receipts[0].id);assert.equal((await table('receipts','select=id')).length,4);ok('repeat validation reuses immutable receipt');
 r=await http('/api/v1/validate/breadth',{method:'POST',body:{sleeve_sharpe:-1,average_pairwise_correlation:0},key:state.key});assert.equal(r.status,422);ok('invalid scenario rejected without receipt');
 r=await http('/api/waitlist',{method:'POST',body:{email:'invalid'}});assert.equal(r.status,400);ok('invalid signup rejected');
 r=await http('/api/waitlist',{method:'POST',body:{email:'phase11-honeypot@example.invalid',company:'synthetic bot'}});assert.equal(r.status,200);assert.equal((await table('waitlist','select=id')).length,0);ok('honeypot accepted silently without storage');
 for(let i=0;i<2;i++){r=await http('/api/waitlist',{method:'POST',body:{email:state.email}});assert.equal(r.status,200);assert.equal(r.data.ok,true);}
 const signups=await table('waitlist','select=id,email');assert.equal(signups.length,1);assert.equal(signups[0].email,state.email);ok('synthetic signup persisted; duplicate creates no extra row');
 r=await http('/api/v1/validate/status');assert.equal(r.status,200);report.usage=r.data.data.usage;assert.equal(report.usage.validations_total,6);assert.equal(report.usage.keys_issued_today,1);
 report.after=await counts();assert.deepEqual(report.after,{api_keys:1,receipts:4,waitlist:1});ok('final usage and exact storage counts reconciled');
 report.completedAt=new Date().toISOString();report.passed=true;save();
}catch(e){report.passed=false;report.error=String(e.message).replaceAll(state.key||'NO_KEY_TO_REDACT','[REDACTED]');save();console.error({failed:true,reason:report.error});process.exitCode=1;}
