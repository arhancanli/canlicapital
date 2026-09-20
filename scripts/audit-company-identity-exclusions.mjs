import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {companyReference,selectObservations,CONCEPTS} from './lib/company-reference.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const bindings=[];
function read(path){const b=readFileSync(path);bindings.push({path,sha256:hash(b),bytes:b.length});return JSON.parse(b);}
const discovery=read('artifacts/seo/corpus-local/next-1000/company_tickers.json');
const names=new Map();
for(const row of Object.values(discovery)){
 const cik=String(row.cik_str).padStart(10,'0');if(!names.has(cik))names.set(cik,new Set());names.get(cik).add(row.title);
}
const cases=[];
for(const cohort of ['fresh-review','next-1000','third-1000']){
 const root=`artifacts/seo/corpus-local/${cohort}`;
 const queue=read(`${root}/ciks.json`),progress=read(`${root}/refresh.json`);
 assert(progress.finished_at&&!progress.stopped);assert.equal(progress.results.length,queue.length);
 assert.equal(new Set(queue).size,queue.length);assert.equal(new Set(progress.results.map(r=>r.cik)).size,queue.length);
 assert.deepEqual(new Set(progress.results.map(r=>r.cik)),new Set(queue));
 for(const result of progress.results.filter(r=>r.reason==='INVALID_ENTITY')){
  const cik=result.cik,receipt=read(`${root}/${cik}.capture.json`);
  assert.equal(receipt.schema,'canli.sec-capture.v1');assert.equal(receipt.cik,cik);assert.equal(receipt.url,`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  const raw=gunzipSync(readFileSync(`${root}/${receipt.sha256}.json.gz`),{maxOutputLength:64*1024*1024});
  assert.equal(hash(raw),receipt.sha256);assert.equal(raw.length,receipt.bytes);
  assert.throws(()=>companyReference(raw,{fetchedAt:receipt.fetched_at,expectedCik:cik,selectionPolicy:'extended-v3'}),e=>e.code==='INVALID_ENTITY');
  const source=JSON.parse(raw),named=typeof source.entityName==='string'&&Boolean(source.entityName.trim());
  const stringCikMatches=typeof source.cik==='string'&&/^\d{1,10}$/.test(source.cik)&&Number(source.cik)===Number(cik);
  const histories=[];
  if(named&&stringCikMatches){
   for(const [tag,definition] of Object.entries(CONCEPTS)){
    const fact=source.facts?.['us-gaap']?.[tag];if(!fact)continue;
    const obs=selectObservations(fact,definition.kind,receipt.fetched_at.slice(0,10));
    if(new Set(obs.map(r=>r.end)).size<3)continue;
    const latest=obs.reduce((a,b)=>a.filed>b.filed?a:b);
    histories.push({tag,reporting_dates:new Set(obs.map(r=>r.end)).size,latest_selected_accession:latest.accn,latest_selected_filed:latest.filed});
   }
  }
  const sourceNames=[...(names.get(cik)??[])];
  cases.push({cohort,cik,source_sha256:receipt.sha256,fetched_at:receipt.fetched_at,source_cik:source.cik??null,entity_name:source.entityName??null,discovery_names:sourceNames,string_cik_matches_requested_identity:stringCikMatches,nonempty_name:named,name_exactly_matches_discovery:sourceNames.includes(source.entityName),core_history_diagnostics:histories,review_state:!named?'MISSING_ENTITY_NAME':!stringCikMatches?'MISSING_OR_UNSUPPORTED_CIK':histories.length<4?'CORE_HISTORY_BELOW_FOUR_NOT_FULL_POLICY_REVIEW':'IDENTITY_AND_FILING_SCOPE_REVIEW_REQUIRED'});
 }
}
const states={};for(const c of cases)states[c.review_state]=(states[c.review_state]??0)+1;
const r={schema:'canli.company-identity-exclusion-audit.v1',bindings,counts:{cases:cases.length,string_cik_matches:cases.filter(c=>c.string_cik_matches_requested_identity).length,states},cases,publication_approved:false,selector_changed:false,claim_boundary:'All exclusions still reproduce. Core-history diagnostics do not create company records, replace CIK values or apply the extended selector. Exact name disagreement can reflect renaming or shared filings and is a review flag, not proof of wrong identity. Matching CIK text alone does not establish filing entity scope.'};
writeFileSync(process.argv[2]??'artifacts/seo/company-identity-exclusions-20260920.json',JSON.stringify(r,null,2)+'\n');
console.log(JSON.stringify(r.counts,null,2));
