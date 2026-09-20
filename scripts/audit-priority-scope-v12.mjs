// Reconcile policy withdrawals and exact historical review credit; no runtime claim.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {companyReference,verifyCompanyReference} from './lib/company-reference.mjs';
import {EDITORIAL_EXCLUSIONS_V12} from './lib/company-editorial-v12.mjs';
const sha = raw => createHash('sha256').update(raw).digest('hex');
const inputs = {}, base = 'artifacts/seo/';
function read(name) {
  const raw=readFileSync(base+name); inputs[name]=sha(raw); return JSON.parse(raw);
}
function key(item) {
  return item.cik+'|'+JSON.stringify(Object.fromEntries(Object.entries(item.selected).sort(([a],[b])=>a.localeCompare(b))));
}
const original=read('company-priority-scope-coverage-v3-20260920.json');
const prior=read('company-priority-scope-v11-20260920.json');
assert.equal(prior.input_sha256[base+'company-priority-scope-coverage-v3-20260920.json'],inputs['company-priority-scope-coverage-v3-20260920.json']);
const supplement=read('company-nika-techcom-loss-context-20260920.json');
assert.equal(supplement.v11_scope_ledger_sha256,inputs['company-priority-scope-v11-20260920.json']);
const hno=read('company-hno-operating-scope-20260920.json');
const decision=EDITORIAL_EXCLUSIONS_V12.find(d=>d.cik===hno.cik&&d.tag==='OperatingIncomeLoss');
assert(decision); assert.equal(decision.source_sha256,hno.source_sha256);
const fixture=readFileSync('scripts/fixtures/editorial/hno-reviewed-source.json.gz');
inputs['scripts/fixtures/editorial/hno-reviewed-source.json.gz']=sha(fixture);
const raw=gunzipSync(fixture); assert.equal(sha(raw),decision.source_sha256);
const after=companyReference(raw,{fetchedAt:'2026-09-20T07:54:29.633Z',expectedCik:decision.cik,selectionPolicy:'extended-v12'});
verifyCompanyReference(after,raw); assert(!after.concepts.some(c=>c.tag===decision.tag));
const pending=new Map(prior.pending.map(item=>[key(item),item]));
const reviewed=new Map(original.reviewed.filter(item=>!item.withdrawn_in_v10).map(item=>[key(item),item]));
const withdrawn=original.reviewed.filter(item=>item.withdrawn_in_v10).map(item=>({...item,withdrawal_policy:'extended-v10',had_prior_review:true}));
withdrawn.push(...prior.withdrawn_without_review_credit.map(item=>({...item,withdrawal_policy:'extended-v11',had_prior_review:false})));
const hnoKeys=new Set();
for(const check of hno.checks) {
  const item={cik:hno.cik,selected:{...check.selected,tag:decision.tag}};
  const k=key(item); assert(!hnoKeys.has(k)); hnoKeys.add(k);
  assert(Number(pending.has(k))+Number(reviewed.has(k))===1);
  const hadReview=reviewed.has(k), previous=pending.get(k)??reviewed.get(k);
  withdrawn.push({...previous,withdrawal_policy:'extended-v12',had_prior_review:hadReview,reason:decision.reason});
  pending.delete(k);reviewed.delete(k);
}
assert.equal(hnoKeys.size,4);
for(const item of supplement.reviewed) {
  const k=key(item);assert(pending.has(k));assert(!reviewed.has(k));
  reviewed.set(k,{...item,scope_reports:['company-nika-techcom-loss-context-20260920.json']});pending.delete(k);
}
assert.equal(supplement.reviewed.length,24);
assert.equal(reviewed.size,189);assert.equal(pending.size,413);assert.equal(withdrawn.length,8);
let addedReviews = 24;
for (const name of process.argv.slice(3)) {
  const extra = read(name);
  const priorRaw = readFileSync(base+'company-priority-scope-v12-20260920.json');
  assert.equal(extra.v12_scope_ledger_sha256,sha(priorRaw));
  for (const item of extra.reviewed) {
    const k=key(item); assert(pending.has(k)); assert(!reviewed.has(k));
    reviewed.set(k,{...item,scope_reports:[name]}); pending.delete(k); addedReviews++;
  }
}
const all=[...reviewed.keys(),...pending.keys(),...withdrawn.map(key)];
const baseline=[...original.reviewed,...original.pending].map(key);
assert.equal(new Set(all).size,610);assert.deepEqual([...all].sort(),baseline.sort());
const result={schema:'canli.priority-scope-v12.v1',publication_approved:false,input_sha256:inputs,
  code_sha256:sha(readFileSync(new URL(import.meta.url))),original_priority_observations:610,
  active_reviewed_observations:reviewed.size,active_observations_needing_scope_review:pending.size,
  withdrawn_observations:withdrawn.length,new_review_credit:addedReviews,
  reviewed:[...reviewed.values()],pending:[...pending.values()],withdrawn,
  scope:'Exact partition of the original610priority observations under merged v12policy. HNO withdrawal verified by actual captured-source selector replay; full v12corpus is not rebuilt. Prior reviews and withdrawals are preserved, not counted twice. Recorded interpretations are not machine-certified. Other flags and basic/diluted groups remain outside this queue; no publication admission.'};
writeFileSync(process.argv[2]??base+'company-priority-scope-v12-20260920.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({reviewed:reviewed.size,pending:pending.size,withdrawn:withdrawn.length}));
