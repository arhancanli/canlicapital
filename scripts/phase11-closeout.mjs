// Revoke only this run's test key; preserve synthetic evidence and all other data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {sha256Hex} from '../api/_lib/canonical.js';
const backend=JSON.parse(readFileSync('.vercel/phase10-private.json'));
const state=JSON.parse(readFileSync('.vercel/phase11-private.json'));
assert.equal(backend.projectRef,'gdqrwikuqzxioxhequtc');
assert.equal(backend.url,'https://gdqrwikuqzxioxhequtc.supabase.co');
assert.equal(state.base,'https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app');
assert.equal(state.label,'phase11-controlled-20260910');
assert.match(state.keyId,/^[0-9a-f-]{36}$/);
const headers={apikey:backend.serviceKey,Authorization:'Bearer '+backend.serviceKey,'Content-Type':'application/json'};
const filter=`id=eq.${state.keyId}&key_hash=eq.${sha256Hex(state.key)}&label=eq.${state.label}`;
const endpoint=backend.url+'/rest/v1/api_keys?'+filter+'&select=id,revoked_at';
let r=await fetch(endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);let rows=await r.json();assert.equal(rows.length,1,'Exactly one known synthetic key required');
if(!rows[0].revoked_at){
 r=await fetch(endpoint,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({revoked_at:new Date().toISOString()}),redirect:'error',signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200);rows=await r.json();assert.equal(rows.length,1);assert.ok(rows[0].revoked_at);
}
const revokedAt=rows[0].revoked_at;
r=await fetch(state.base+'/api/v1/validate/breadth',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.key},body:JSON.stringify({sleeve_sharpe:0.5,average_pairwise_correlation:0.05}),redirect:'error',signal:AbortSignal.timeout(30000)});
assert.equal(r.status,401);assert.equal((await r.json()).error.code,'unauthorized');
const counts={};
for(const name of ['api_keys','receipts','waitlist']){
 r=await fetch(backend.url+'/rest/v1/'+name+'?select=id',{headers,redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);counts[name]=(await r.json()).length;
}
assert.deepEqual(counts,{api_keys:1,receipts:4,waitlist:1});
const report={checkedAt:new Date().toISOString(),keyId:state.keyId,revokedAt,revokedKeyRejected:true,counts,recordsDeleted:0,passed:true};
writeFileSync('artifacts/qa/phase11-integration/closeout.json',JSON.stringify(report,null,2)+'\n');console.log(report);
