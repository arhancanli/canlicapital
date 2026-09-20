import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {companyReference,verifyCompanyReference} from './lib/company-reference.mjs';
import {EDITORIAL_OBSERVATION_EXCLUSIONS_V13} from './lib/company-editorial-v13.mjs';
const base='artifacts/seo/',inputs={};
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=name=>{const raw=readFileSync(base+name);inputs[name]=hash(raw);return JSON.parse(raw);};
const key=r=>r.cik+'|'+JSON.stringify(Object.fromEntries(Object.entries(r.selected).sort(([a],[b])=>a.localeCompare(b))));
const prior=read('company-priority-scope-v12-batch3-20260920.json');
const reviewed=new Map(prior.reviewed.map(r=>[key(r),r]));
const pending=new Map(prior.pending.map(r=>[key(r),r]));
const withdrawn=[...prior.withdrawn];
const extra=read('company-techcom-historical-context-20260920.json');
assert.equal(extra.v12_scope_ledger_sha256,hash(readFileSync(base+'company-priority-scope-v12-20260920.json')));
assert.equal(extra.reviewed.length,42);
for(const row of extra.reviewed){const k=key(row);assert(pending.has(k));assert(!reviewed.has(k));pending.delete(k);reviewed.set(k,{...row,scope_reports:['company-techcom-historical-context-20260920.json']});}
const raw=gunzipSync(readFileSync('scripts/fixtures/editorial/atlantica-reviewed-source.json.gz'));
const record=companyReference(raw,{fetchedAt:'2026-09-20T05:18:35.368Z',expectedCik:'0001062506',selectionPolicy:'extended-v13'});
verifyCompanyReference(record,raw);
const decisions=EDITORIAL_OBSERVATION_EXCLUSIONS_V13.filter(d=>d.cik==='0001062506');assert.equal(decisions.length,2);
for(const d of decisions){
 assert.equal(hash(raw),d.source_sha256);
 const matches=[...pending.entries()].filter(([,r])=>r.cik===d.cik&&r.selected.tag===d.tag&&Object.entries(d.observation).every(([k,v])=>r.selected[k]===v));
 assert.equal(matches.length,1);const [k,row]=matches[0];pending.delete(k);
 assert(!record.concepts.find(c=>c.tag===d.tag).observations.some(r=>r.end===d.observation.end));
 withdrawn.push({...row,withdrawal_policy:'extended-v13',had_prior_review:false,reason:d.reason});
}
const reopened=[];
for(const [k,row] of reviewed){
 if(row.cik==='0001481443'&&row.selected.end==='2025-12-31'&&['Liabilities','LiabilitiesCurrent'].includes(row.selected.tag)){
  assert(!pending.has(k));reviewed.delete(k);
  const next={...row,reopened_reason:extra.follow_up,prior_scope_reports:row.scope_reports};
  delete next.scope_reports;pending.set(k,next);reopened.push(next);
 }
}
assert.equal(reopened.length,2);
assert.equal(reviewed.size,351);assert.equal(pending.size,249);assert.equal(withdrawn.length,10);
let newCredit=42;
for(const name of process.argv.slice(3)){
 const supplement=read(name);
 assert.equal(supplement.v13_scope_ledger_sha256,hash(readFileSync(base+'company-priority-scope-v13-20260920.json')));
 for(const row of supplement.reviewed){
  const k=key(row);assert(pending.has(k));assert(!reviewed.has(k));
  pending.delete(k);reviewed.set(k,{...row,scope_reports:[name]});newCredit++;
 }
}
const before=[...prior.reviewed,...prior.pending,...prior.withdrawn].map(key).sort();
const after=[...reviewed.keys(),...pending.keys(),...withdrawn.map(key)].sort();
assert.equal(new Set(after).size,610);assert.deepEqual(after,before);
const result={schema:'canli.priority-scope-v13.v1',publication_approved:false,input_sha256:inputs,
 code_sha256:hash(readFileSync(new URL(import.meta.url))),source_sha256:hash(raw),
 original_priority_observations:610,active_reviewed_observations:reviewed.size,active_observations_needing_scope_review:pending.size,withdrawn_observations:withdrawn.length,
 new_review_credit:newCredit,reopened_observations:reopened,reviewed:[...reviewed.values()],pending:[...pending.values()],withdrawn,
 scope:'Exact original610key partition. Two Atlantica policy withdrawals verified using actual source replay; two previously reviewed TECHCOM2025liability rows reopened for1USDcomponent discrepancy without assuming rounding.Historical reviews credited only from exact pending keys. Full corpus not rebuilt; other flags remain open; no publication admission.'};
writeFileSync(process.argv[2]??base+'company-priority-scope-v13-20260920.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({reviewed:reviewed.size,pending:pending.size,withdrawn:withdrawn.length,reopened:reopened.length}));
