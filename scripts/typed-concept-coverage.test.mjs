import test from 'node:test';
import assert from 'node:assert/strict';
import { typedHistory, compareHistories, audit } from './audit-typed-concept-coverage.mjs';
const asOf='2026-09-20';
const rows=[2023,2024,2025].map((y,i)=>({start:`${y}-01-01`,end:`${y}-12-31`,filed:`${y+1}-02-01`,form:'10-K',accn:`0000000001-${String(y+1).slice(-2)}-000001`,val:i+1}));
const declaration={period_type:'duration',type:'dtr-types:percentItemType'};
test('taxonomy percentage histories use pure units and annual durations only',()=>{
 const h=typedHistory({units:{pure:rows,USD:rows}},declaration,asOf);
 assert.equal(h.qualified,true);assert.equal(h.recent,true);assert.equal(h.rows.length,3);assert.equal(h.excluded_unit_rows,3);
 assert.equal(typedHistory({units:{USD:rows}},declaration,asOf).qualified,false);
 assert.equal(typedHistory({units:{pure:rows.map(({start,...r})=>r)}},declaration,asOf).qualified,false);
});
test('typed coverage still rejects constants, future-only completion and conflicts',()=>{
 assert.equal(typedHistory({units:{pure:rows.map(r=>({...r,val:0}))}},declaration,asOf).qualified,false);
 assert.equal(typedHistory({units:{pure:rows}},declaration,'2025-06-01').qualified,false);
 const h=typedHistory({units:{pure:[...rows,{...rows[0],val:100}]}},declaration,asOf);
 assert.equal(h.qualified,false);assert.equal(h.error,'CONFLICTING_FACTS');
 assert.throws(()=>typedHistory({units:{pure:rows}},{...declaration,type:'unknown'},asOf));
});
test('instant type excludes duration facts and stale history is not recent',()=>{
 const d={period_type:'instant',type:'xbrli:sharesItemType'};
 assert.equal(typedHistory({units:{shares:rows}},d,asOf).qualified,false);
 const h=typedHistory({units:{shares:rows.map(({start,...r})=>r)}},d,asOf);
 assert.equal(h.qualified,true);assert.equal(h.recent,true);
 assert.equal(typedHistory({units:{shares:rows.map(({start,...r})=>r)}},d,'2030-09-20').recent,false);
});
test('numerical overlap requires aligned periods and full-history equality is stronger',()=>{
 const h=typedHistory({units:{pure:rows}},declaration,asOf);
 assert.deepEqual(compareHistories(h,h),{shared:3,equal:3,full_value_history_equal:true});
 const changed={...h,rows:h.rows.map((r,i)=>({...r,val:r.val+(i===0?1:0)}))};
 assert.deepEqual(compareHistories(h,changed),{shared:3,equal:2,full_value_history_equal:false});
 const shifted={...h,rows:h.rows.map(r=>({...r,start:'2020-01-01'}))};
 assert.deepEqual(compareHistories(h,shifted),{shared:0,equal:0,full_value_history_equal:false});
 assert.equal(compareHistories(h,{qualified:false}),null);
});

test('changed inventory bytes fail before taxonomy or company sources are opened', async t => {
 const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 const root=mkdtempSync(join(tmpdir(),'canli-typed-input-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const inventory=join(root,'inventory.json'),summary=join(root,'summary.json');
 writeFileSync(inventory,'{}');
 writeFileSync(summary,JSON.stringify({local_full_report:inventory,full_report_sha256:'0'.repeat(64),full_report_bytes:2}));
 assert.throws(()=>audit({summaryPath:summary,taxonomyPath:'must-not-open',taxonomyReceiptPath:'must-not-open',output:join(root,'output.json')}),{code:'ERR_ASSERTION'});
});
