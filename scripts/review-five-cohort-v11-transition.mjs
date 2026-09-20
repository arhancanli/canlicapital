import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EDITORIAL_OBSERVATION_EXCLUSIONS_V11} from './lib/company-editorial-v11.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const root='artifacts/seo/corpus-local/';
const oldDirectory=root+'company-five-cohort-delivery-v10';
const beforeRaw=readFileSync(oldDirectory+'/delivery.json');
assert.equal(hash(beforeRaw),'d92baf65e00228fe351a398035f8fd4f103b6a98a7c1bba00108f2569110a6d0');
const before=JSON.parse(beforeRaw), originals=new Map(before.files.map(f=>[f.cik,f]));
const cohorts=['first-delivery-v11','next-1000-delivery-v11','third-1000-delivery-v11','fourth-1000-delivery-v11','fifth-1000-delivery-v11'];
const decision=EDITORIAL_OBSERVATION_EXCLUSIONS_V11.find(d=>d.cik==='0001127475');
const seen=new Set(),inputs=[],changes=[];let oldCount=0,newCount=0;
function record(directory,file){const raw=readFileSync(directory+'/'+file.selected.storage_path);assert.equal(hash(raw),file.selected.sha256);assert.equal(raw.length,file.selected.bytes);return JSON.parse(raw);}
for(const cohort of cohorts){
 const directory=root+cohort,raw=readFileSync(directory+'/delivery.json'),manifest=JSON.parse(raw);
 assert.equal(manifest.selection_policy,'extended-v11');inputs.push({directory,manifest_sha256:hash(raw)});
 for(const nextFile of manifest.files){
  assert(!seen.has(nextFile.cik));seen.add(nextFile.cik);
  const oldFile=originals.get(nextFile.cik);assert(oldFile);assert.deepEqual(nextFile.source,oldFile.source);assert.equal(nextFile.source_sha256,oldFile.source_sha256);
  const old=record(oldDirectory,oldFile),next=record(directory,nextFile),expected=structuredClone(old);
  oldCount+=old.concepts.length;newCount+=next.concepts.length;expected.selection_policy='extended-v11';
  if(nextFile.cik===decision.cik){
   assert.equal(old.source_sha256,decision.source_sha256);
   const concept=expected.concepts.find(c=>c.tag===decision.tag);assert(concept);
   const matches=row=>Object.entries(decision.observation).every(([key,value])=>row[key]===value);
   assert.equal(concept.observations.filter(matches).length,1);
   concept.observations=concept.observations.filter(row=>!matches(row));
   expected.editorial_exclusions=[...(expected.editorial_exclusions??[]),{tag:decision.tag,observation:{...decision.observation},reason:decision.reason,filing_url:decision.filing_url}];
   changes.push({cik:nextFile.cik,tag:decision.tag,removed_observations:1,removed_histories:0});
   assert.deepEqual(next.concepts.find(c=>c.tag==='Revenues'),old.concepts.find(c=>c.tag==='Revenues'));
  }
  assert.deepEqual(next,expected);
 }
}
assert.equal(seen.size,originals.size);assert.equal(changes.length,1);assert.equal(oldCount,newCount);
const result={schema:'canli.five-cohort-v11-transition.v1',publication_approved:false,previous_manifest_sha256:hash(beforeRaw),code_sha256:hash(readFileSync(new URL(import.meta.url))),inputs,companies:seen.size,previous_histories:oldCount,current_histories:newCount,changes,scope:'Exact comparison of every selected record and source descriptor; only policy metadata and the reviewed DBMM observation exclusion change. No combined release, publication or indexing claim.'};
writeFileSync('artifacts/seo/company-five-cohort-v11-transition-20260920.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
