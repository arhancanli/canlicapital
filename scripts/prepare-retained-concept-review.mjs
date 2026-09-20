import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { typedHistory } from './audit-typed-concept-coverage.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=process.cwd();
const tags=['OperatingLeaseRightOfUseAsset','OperatingLeaseLiability','InterestPaidNet','ComprehensiveIncomeNetOfTax','AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment','PropertyPlantAndEquipmentGross'];
const typedPath='artifacts/seo/company-typed-concept-coverage-20260920.json', typedBytes=readFileSync(typedPath),typed=JSON.parse(typedBytes);
assert.equal(sha(typedBytes),'9718793aab1c96da4c9d52cd265147ded07ecd20f77664288dda33ba9bdbd849');
const invBytes=readFileSync(typed.inputs.inventory.path);assert.equal(sha(invBytes),typed.inputs.inventory.sha256);const inv=JSON.parse(invBytes);
const receipts=new Map(),receiptBindings=[];
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=resolve(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&e.name.endsWith('-primary.receipt.json')){
 const m=/^(\d{10})-(\d{10}-\d{2}-\d{6})-primary.receipt.json$/.exec(e.name);if(!m)continue;
 const b=readFileSync(p),r=JSON.parse(b);receiptBindings.push({path:relative(root,p),sha256:sha(b),status:r.status});
 if(r.status!==200)continue;
 const bodyPath=r.body_path??relative(root,p.replace(/\.receipt\.json$/,'.response'));
 const body=readFileSync(resolve(root,bodyPath));assert.equal(body.length,r.bytes);assert.equal(sha(body),r.sha256);
 const url=new URL(r.url);assert.equal(url.hostname,'www.sec.gov');assert.equal(url.protocol,'https:');
 assert.ok(url.pathname.startsWith(`/Archives/edgar/data/${Number(m[1])}/${m[2].replaceAll('-','')}/`));
 const key=`${m[1]}|${m[2]}`;if(receipts.has(key))assert.equal(receipts.get(key).receipt.sha256,r.sha256,'Conflicting retained filing copies');
 else receipts.set(key,{cik:m[1],accession:m[2],receipt_path:relative(root,p),receipt_sha256:sha(b),body_path:bodyPath,receipt:r});
}}}
walk(resolve('artifacts/seo/corpus-local'));
const sourceBindings=new Map(inv.source_bindings.map(x=>[x.cik,x])),filings=new Map();
function bound(dir,desc){const b=readFileSync(resolve(dir,desc.storage_path));assert.equal(b.length,desc.bytes);assert.equal(sha(b),desc.sha256);return b;}
for(const binding of inv.bindings){const b=readFileSync(binding.path);assert.equal(sha(b),binding.sha256);const d=JSON.parse(b);
 for(const item of d.files){if(![...receipts.values()].some(r=>r.cik===item.cik))continue;
 const selected=JSON.parse(bound(dirname(binding.path),item.selected)),raw=gunzipSync(bound(dirname(binding.path),item.source),{maxOutputLength:64*1024*1024});
 const expected=sourceBindings.get(item.cik);assert.ok(expected);assert.equal(sha(raw),expected.source_sha256);assert.equal(selected.source_sha256,expected.source_sha256);assert.equal(selected.fetched_at,expected.fetched_at);assert.equal(selected.cik,item.cik);
 const body=JSON.parse(raw);assert.equal(body.cik,Number(item.cik));
 for(const tag of tags){const fact=body.facts?.['us-gaap']?.[tag];if(!fact)continue;
 const h=typedHistory(fact,typed.concepts.find(c=>c.tag===tag).taxonomy,selected.fetched_at.slice(0,10));if(!h.qualified)continue;
 for(const row of h.rows){const key=`${item.cik}|${row.accn}`,r=receipts.get(key);if(!r)continue;
 if(!filings.has(key))filings.set(key,{...r,source_sha256:expected.source_sha256,source_capture_at:expected.fetched_at,name:body.entityName,observations:[]});
 filings.get(key).observations.push({tag,...row});
 }
 }
 }
}
const ordered=[...filings.values()].sort((a,b)=>a.cik.localeCompare(b.cik)||a.accession.localeCompare(b.accession));for(const f of ordered)f.observations.sort((a,b)=>a.tag.localeCompare(b.tag)||a.end.localeCompare(b.end));
const report={schema:'canli.retained-concept-filing-targets.v1',publication_approved:false,inputs:{typed_report:{path:typedPath,sha256:sha(typedBytes)},inventory:typed.inputs.inventory,receipt_bindings:receiptBindings.sort((a,b)=>a.path.localeCompare(b.path))},tags,filings:ordered,observation_count:ordered.reduce((n,f)=>n+f.observations.length,0),code_sha256:sha(readFileSync(new URL(import.meta.url))),scope:'Convenience sample of already-captured primary filings intersecting six candidate concepts. Includes historical selected observations. Does not establish representative issuer coverage, all-history correctness or admission. No requests or retries.'};
writeFileSync('artifacts/seo/company-retained-concept-targets-20260920.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({filings:ordered.length,companies:new Set(ordered.map(f=>f.cik)).size,observations:report.observation_count}));
