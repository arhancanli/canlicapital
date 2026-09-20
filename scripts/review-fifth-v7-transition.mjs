// Verify the entire frozen cohort transition, including all unchanged histories.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EDITORIAL_EXCLUSIONS_V6} from './lib/company-editorial-v6.mjs';
import {EDITORIAL_EXCLUSIONS_V7} from './lib/company-editorial-v7.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const root='artifacts/seo/corpus-local/fifth-1000-delivery-';
const beforeBytes=readFileSync(root+'v6/delivery.json'),afterBytes=readFileSync(root+'v7/delivery.json');
const before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes);
assert.equal(before.selection_policy,'extended-v6');assert.equal(after.selection_policy,'extended-v7');
assert.deepEqual(after.files.map(f=>f.cik),before.files.map(f=>f.cik));
assert.equal(new Set(before.files.map(f=>f.cik)).size,before.files.length);
const additions=EDITORIAL_EXCLUSIONS_V7.filter(d=>!EDITORIAL_EXCLUSIONS_V6.some(o=>o.cik===d.cik&&o.tag===d.tag));
assert.equal(additions.length,1);
function record(item,version){
 const bytes=readFileSync(root+version+'/'+item.selected.storage_path);
 assert.equal(bytes.length,item.selected.bytes);assert.equal(hash(bytes),item.selected.sha256);
 return JSON.parse(bytes);
}
let previousHistories=0,currentHistories=0;const changes=[];
for(let i=0;i<before.files.length;i++){
 const a=before.files[i],b=after.files[i];assert.equal(a.source_sha256,b.source_sha256);assert.deepEqual(a.source,b.source);
 const old=record(a,'v6'),next=record(b,'v7'),expected=structuredClone(old);
 expected.selection_policy='extended-v7';previousHistories+=old.concepts.length;currentHistories+=next.concepts.length;
 for(const decision of additions.filter(d=>d.cik===a.cik)){
  assert.equal(a.source_sha256,decision.source_sha256);
  assert(expected.concepts.some(c=>c.tag===decision.tag));
  expected.concepts=expected.concepts.filter(c=>c.tag!==decision.tag);
  expected.editorial_exclusions=[...(expected.editorial_exclusions??[]),{tag:decision.tag,reason:decision.reason,filing_url:decision.filing_url}];
  changes.push({cik:a.cik,tag:decision.tag,source_sha256:a.source_sha256});
 }
 assert.deepEqual(next,expected);
}
assert.equal(changes.length,1);assert.equal(previousHistories-currentHistories,1);
const report={schema:'canli.company-policy-transition-review.v1',publication_approved:false,
 before_manifest_sha256:hash(beforeBytes),after_manifest_sha256:hash(afterBytes),
 companies:before.files.length,previous_histories:previousHistories,current_histories:currentHistories,
 changes,all_other_selected_fields_unchanged:true,original_source_descriptors_unchanged:true,
 scope:'Exact local v6-to-v7 cohort transition only; not editorial approval of remaining histories or an indexing claim.',
 code_sha256:hash(readFileSync(new URL(import.meta.url)))};
writeFileSync('artifacts/seo/company-fifth-v7-cohort-transition.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({companies:report.companies,previousHistories,currentHistories,changes}));
