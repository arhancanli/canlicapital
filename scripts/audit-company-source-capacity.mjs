import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {CONCEPTS} from './lib/company-reference.mjs';
import {EXTENDED_CONCEPTS} from './lib/company-extended-concepts.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bindings=[];
function read(path) {
 const bytes=readFileSync(path);bindings.push({path,sha256:hash(bytes),bytes:bytes.length});return JSON.parse(bytes);
}
const discovery=read('artifacts/seo/corpus-local/next-1000/company_tickers.json');
const selection=read('artifacts/seo/company-third-batch-selection.json');
assert.equal(bindings[0].sha256,selection.discovery_sha256);
const discovered=new Set(Object.values(discovery).map(x=>String(x.cik_str).padStart(10,'0')));
assert.equal(discovered.size,selection.discovery_unique_ciks);
const root='artifacts/seo/corpus-local/company-three-cohort-delivery-v3';
const delivery=read(`${root}/delivery.json`);
const release=read('artifacts/seo/company-three-cohort-release-v3.json');
const admitted=new Set(delivery.files.map(x=>x.cik));
assert.equal(admitted.size,delivery.files.length);assert.equal(admitted.size,release.companies);
const attempted=new Set();
for(const cohort of ['fresh-review','next-1000','third-1000']){
 for(const cik of read(`artifacts/seo/corpus-local/${cohort}/ciks.json`)) attempted.add(cik);
}
const tags=new Set(Object.keys({...CONCEPTS,...EXTENDED_CONCEPTS}));
let histories=0;
for(const file of delivery.files){
 const bytes=readFileSync(resolve(root,file.selected.storage_path));
 assert.equal(hash(bytes),file.selected.sha256);
 const selected=JSON.parse(bytes);
 assert.equal(selected.cik,file.cik);
 for(const concept of selected.concepts) assert(tags.has(concept.tag));
 histories+=selected.concepts.length;
}
assert.equal(histories,release.histories);
const unqueued=[...discovered].filter(cik=>!admitted.has(cik)&&!attempted.has(cik));
assert.equal(unqueued.length,selection.remaining_unqueued_after_batch);
const knownUniverse=new Set([...discovered,...admitted]);
const directories=n=>Math.ceil(n/50);
const modelPagesPerCompany=1+tags.size;
const theoretical=knownUniverse.size*modelPagesPerCompany+directories(knownUniverse.size);
const bounded=admitted.size+histories+unqueued.length*modelPagesPerCompany+directories(admitted.size+unqueued.length);
const goal=read('config/search-growth-goal.json');
const report={schema:'canli.company-source-capacity.v1',selection_policy:delivery.selection_policy,bindings,
 source_counts:{discovered:discovered.size,admitted:admitted.size,admitted_outside_discovery:[...admitted].filter(x=>!discovered.has(x)).length,attempted_but_not_admitted:[...attempted].filter(x=>!admitted.has(x)).length,unqueued:unqueued.length},
 current:{companies:admitted.size,histories,directories:directories(admitted.size),candidate_urls:admitted.size+histories+directories(admitted.size)},
 fixed_model:{concepts:tags.size,maximum_pages_per_company:modelPagesPerCompany,directory_page_size:50},
 upper_bounds:{all_known_entities_with_all_concepts:theoretical,retaining_current_selected_histories_and_prior_nonadmissions:bounded},
 minimum_goal:goal.minimum_indexed_pages,target_goal:goal.target_indexed_pages,
 shortfall_before_other_content_families:{minimum:goal.minimum_indexed_pages-bounded,target:goal.target_indexed_pages-bounded},
 claim_boundary:'Structural candidate-URL upper bounds, not forecast eligibility, useful pages, deployment, indexing or demand. Remaining entities are optimistically assigned every supported concept. Current rejected candidates stay excluded in the constrained bound. Other content families are not counted; no keyword, unit or year permutations are added.'};
const output=process.argv[2]??'artifacts/seo/company-source-capacity-20260920.json';
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({counts:report.source_counts,current:report.current,model:report.fixed_model,bounds:report.upper_bounds,gap:report.shortfall_before_other_content_families},null,2));
