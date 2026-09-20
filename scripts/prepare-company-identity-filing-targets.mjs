import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {selectObservations,CONCEPTS} from './lib/company-reference.mjs';
const input=readFileSync('artifacts/seo/company-identity-exclusions-20260920.json');
const rows=[];
for(const c of JSON.parse(input).cases.filter(c=>c.review_state==='IDENTITY_AND_FILING_SCOPE_REVIEW_REQUIRED')){
 const raw=gunzipSync(readFileSync(`artifacts/seo/corpus-local/${c.cohort}/${c.source_sha256}.json.gz`),{maxOutputLength:64*1024*1024});
 if(createHash('sha256').update(raw).digest('hex')!==c.source_sha256)throw Error('Source mismatch');
 const source=JSON.parse(raw);
 for(const h of c.core_history_diagnostics){
  for(const o of selectObservations(source.facts['us-gaap'][h.tag],CONCEPTS[h.tag].kind,c.fetched_at.slice(0,10)).filter(o=>o.accn===h.latest_selected_accession))rows.push({cik:c.cik,source_sha256:c.source_sha256,tag:h.tag,...o});
 }
}
writeFileSync(process.argv[2]??'artifacts/seo/company-identity-filing-targets-20260920.json',JSON.stringify({schema:'canli.identity-filing-targets.v1',input_sha256:createHash('sha256').update(input).digest('hex'),scope:'Latest selected core accessions only; diagnostic observations, not approved company records',rows},null,2)+'\n');
console.log('targets',rows.length);
