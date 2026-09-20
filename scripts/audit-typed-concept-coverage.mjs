// Offline triage, never an admission policy. Uses exact retained source bodies.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { selectObservations, CompanyReferenceError } from './lib/company-reference.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const units = { 'xbrli:monetaryItemType': 'USD', 'xbrli:sharesItemType': 'shares', 'dtr-types:percentItemType': 'pure' };

export function typedHistory(fact, declaration, asOf) {
  assert.ok(['instant', 'duration'].includes(declaration.period_type), 'Unsupported taxonomy period');
  const unit = units[declaration.type];
  assert.ok(unit, 'Unsupported taxonomy data type');
  let selected;
  try { selected = selectObservations(fact, declaration.period_type, asOf); }
  catch (e) {
    if (!(e instanceof CompanyReferenceError)) throw e;
    return { error: e.code, qualified: false, recent: false, rows: [], excluded_unit_rows: 0 };
  }
  const rows = selected.filter(r => r.unit === unit);
  const qualified = new Set(rows.map(r => r.end)).size >= 3 && new Set(rows.map(r => r.val)).size >= 2;
  const latest = rows.map(r => r.end).sort().at(-1);
  return { qualified, recent: qualified && Date.parse(asOf) - Date.parse(latest) <= 2 * 366 * 86400000,
    rows, excluded_unit_rows: selected.filter(r => r.unit !== unit).length };
}
export function compareHistories(left, right) {
  if (!left.qualified || !right.qualified) return null;
  const key = r => `${r.start ?? ''}|${r.end}|${r.unit}`;
  const other = new Map(right.rows.map(r => [key(r), r.val]));
  const shared = left.rows.filter(r => other.has(key(r)));
  const equal = shared.filter(r => other.get(key(r)) === r.val).length;
  return { shared: shared.length, equal, full_value_history_equal: shared.length === left.rows.length && shared.length === right.rows.length && equal === shared.length };
}
function boundFile(directory, item) {
  const p = resolve(directory, item.storage_path), rel = relative(directory, p);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Source escapes delivery');
  const bytes = readFileSync(p); assert.equal(bytes.length, item.bytes); assert.equal(sha(bytes), item.sha256);
  return bytes;
}
export function audit({ summaryPath, taxonomyPath, taxonomyReceiptPath, output }) {
  const summaryBytes = readFileSync(summaryPath), summary = JSON.parse(summaryBytes);
  const inventoryBytes = readFileSync(summary.local_full_report);
  assert.equal(sha(inventoryBytes), summary.full_report_sha256); assert.equal(inventoryBytes.length, summary.full_report_bytes);
  const inventory = JSON.parse(inventoryBytes);
  assert.equal(inventory.schema, 'canli.company-concept-coverage-inventory.v1');
  const selectorHash = sha(readFileSync(new URL('./lib/company-reference.mjs', import.meta.url)));
  const originalSelectorPath = 'artifacts/seo/corpus-local/typed-concept-review/inventory-selector.mjs';
  const originalSelector = readFileSync(originalSelectorPath);
  assert.equal(sha(originalSelector), inventory.selector_sha256, 'Original inventory selector mismatch');
  const observationBlock = source => {
    const start = source.indexOf('const date = '), end = source.indexOf('export function companyReference(');
    assert.ok(start >= 0 && end > start, 'Cannot isolate complete observation dependencies');
    return source.slice(start, end);
  };
  const block = observationBlock(originalSelector.toString());
  assert.equal(observationBlock(readFileSync(new URL('./lib/company-reference.mjs', import.meta.url), 'utf8')), block, 'Observation selector changed since inventory');
  const selectorCompatibility = {original_path:originalSelectorPath,original_sha256:sha(originalSelector),current_sha256:selectorHash,observation_and_dependency_block_sha256:sha(block),byte_identical:true};
  const receiptBytes = readFileSync(taxonomyReceiptPath), receipt = JSON.parse(receiptBytes), taxonomyBytes = readFileSync(taxonomyPath);
  assert.equal(sha(taxonomyBytes), receipt.sha256); assert.equal(taxonomyBytes.length, receipt.bytes);
  const declarations = JSON.parse(execFileSync('python3', ['-c', `import xml.etree.ElementTree as E,json,sys
r=E.parse(sys.argv[1]).getroot()
assert r.attrib['targetNamespace']==sys.argv[2]
print(json.dumps({e.attrib['name']:{'period_type':e.attrib.get('{http://www.xbrl.org/2003/instance}periodType'),'type':e.attrib.get('type'),'balance':e.attrib.get('{http://www.xbrl.org/2003/instance}balance')} for e in r.findall('{http://www.w3.org/2001/XMLSchema}element')}))`, taxonomyPath, receipt.target_namespace], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const targets = inventory.concepts.filter(c => c.current_history_companies >= 1000).sort((a,b) => a.tag.localeCompare(b.tag));
  const records = new Map(targets.map(c => {
    assert.ok(declarations[c.tag] && units[declarations[c.tag].type], `Unreviewable taxonomy declaration: ${c.tag}`);
    return [c.tag, { tag:c.tag, taxonomy:declarations[c.tag], measured_unit:units[declarations[c.tag].type],
      untyped_recent_companies:c.current_history_companies, companies_with_history:0, recent_companies:0,
      selector_error_companies:0, companies_with_excluded_unit_rows:0, examples:[], source_descriptions:[] }];
  }));
  const sourceBindings = new Map(inventory.source_bindings.map(x => [x.cik,x]));
  assert.equal(sourceBindings.size, inventory.source_companies);
  const seen = new Set();
  const pairs = [['LiabilitiesAndStockholdersEquity','Assets'],['CommonStockSharesIssued','CommonStockSharesOutstanding'],['OperatingLeaseLiability','LesseeOperatingLeaseLiabilityPaymentsDue']]
    .map(([left,right])=>({left,right,companies_with_both:0,companies_with_three_shared_ends:0,full_value_history_equal_companies:0,shared_observations:0,equal_observations:0,examples:[]}));
  for (const binding of inventory.bindings) {
    const bytes=readFileSync(binding.path);assert.equal(sha(bytes),binding.sha256);
    const delivery=JSON.parse(bytes);assert.equal(delivery.files.length,binding.companies);
    for (const item of delivery.files) {
      assert.ok(!seen.has(item.cik));seen.add(item.cik);
      const selected=JSON.parse(boundFile(dirname(binding.path),item.selected));
      const raw=gunzipSync(boundFile(dirname(binding.path),item.source),{maxOutputLength:64*1024*1024});
      const expected=sourceBindings.get(item.cik);assert.ok(expected);
      assert.equal(sha(raw),expected.source_sha256);assert.equal(selected.source_sha256,expected.source_sha256);
      assert.equal(selected.fetched_at,expected.fetched_at);assert.equal(selected.cik,item.cik);
      const body=JSON.parse(raw);assert.equal(body.cik,Number(item.cik));
      const facts=body.facts?.['us-gaap']??{}, asOf=expected.fetched_at.slice(0,10), histories=new Map();
      const history=tag=>{
        if (!histories.has(tag)) histories.set(tag, facts[tag] ? typedHistory(facts[tag],declarations[tag],asOf) : {qualified:false,recent:false,rows:[]});
        return histories.get(tag);
      };
      for (const [tag,record] of records) {
        if (!facts[tag]) continue;
        const h=history(tag);
        if(h.error) record.selector_error_companies++;
        if(h.excluded_unit_rows) record.companies_with_excluded_unit_rows++;
        if(h.qualified) record.companies_with_history++;
        if(h.recent) record.recent_companies++;
        if(h.recent && record.examples.length<3) record.examples.push({cik:item.cik,source_sha256:expected.source_sha256,reporting_ends:h.rows.length,latest_end:h.rows.map(r=>r.end).sort().at(-1)});
        const description=facts[tag].description;
        if(typeof description==='string' && record.source_descriptions.length<3 && !record.source_descriptions.some(x=>x.description===description)) record.source_descriptions.push({cik:item.cik,source_sha256:expected.source_sha256,description});
      }
      for(const pair of pairs) {
        const comparison=compareHistories(history(pair.left),history(pair.right));if(!comparison)continue;
        pair.companies_with_both++;pair.shared_observations+=comparison.shared;pair.equal_observations+=comparison.equal;
        if(comparison.shared>=3) pair.companies_with_three_shared_ends++;
        if(comparison.full_value_history_equal) pair.full_value_history_equal_companies++;
        if(pair.examples.length<5) pair.examples.push({cik:item.cik,...comparison});
      }
      if(seen.size%500===0) process.stderr.write(`Typed coverage: ${seen.size} sources\n`);
    }
  }
  assert.equal(seen.size,inventory.source_companies);
  const concepts=[...records.values()].sort((a,b)=>b.recent_companies-a.recent_companies||a.tag.localeCompare(b.tag));
  const report={schema:'canli.company-typed-concept-coverage.v1',publication_approved:false,source_companies:seen.size,
    inputs:{summary:{path:summaryPath,sha256:sha(summaryBytes)},inventory:{path:summary.local_full_report,sha256:sha(inventoryBytes)},taxonomy:{...receipt,local_path:taxonomyPath,receipt_sha256:sha(receiptBytes)},selector_sha256:selectorHash,selector_compatibility:selectorCompatibility,code_sha256:sha(readFileSync(new URL(import.meta.url)))},
    rules:{minimum_reporting_ends:3,minimum_distinct_values:2,recent_window_days:732,units_by_type:units,taxonomy_period_enforced:true},
    reviewed_concepts:concepts.length,recent_company_concept_pairs:concepts.reduce((n,c)=>n+c.recent_companies,0),concepts,comparisons:pairs,
    scope:'Offline coverage and numerical-overlap triage only. Taxonomy types do not establish source-tag scope, distinct reader value or editorial approval. Equal reported histories do not prove semantic equivalence. No new pages or publication policy.'};
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const report=audit({summaryPath:'artifacts/seo/company-concept-coverage-summary-20260920.json',taxonomyPath:'artifacts/seo/corpus-local/taxonomy/us-gaap-2026.xsd',taxonomyReceiptPath:'artifacts/seo/taxonomy-source.json',output:process.argv[2]??'artifacts/seo/company-typed-concept-coverage-20260920.json'});
  console.log(JSON.stringify({sources:report.source_companies,concepts:report.reviewed_concepts,recent_pairs:report.recent_company_concept_pairs,comparisons:report.comparisons}));
}
