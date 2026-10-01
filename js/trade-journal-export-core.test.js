import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { genesisLine, nextLine } from './trade-journal-core.js';
import { exportJournal, journalBindings, signJournalExport, ACCOUNT_PROFILE } from './trade-journal-export-core.js';
import { conformance } from './paper-evidence-core.js';
import { keyFromSeed } from '../scripts/research/trade-journal/corpus.mjs';
const KEY=keyFromSeed('synthetic export tests'), PEM=KEY.export({format:'pem',type:'pkcs8'});
const SCHEMA=JSON.parse(readFileSync(new URL('../standards/paper-evidence/schema.json',import.meta.url)));
const ACCOUNT={schema:ACCOUNT_PROFILE,strategy_id:'synthetic',venue:'local_sim',currency:'USD',initial_cash:1000,initial_positions:[],frequency:'DAILY',periods_per_year:365};
const GENERATED='2026-01-05T00:00:00.000Z';
const EVENTS=[
 ['order',{client_order_id:'o1',symbol:'X',side:'buy',qty:2,type:'market',venue:'local_sim'},'2026-01-01T01:00:00.000Z'],
 ['fill',{client_order_id:'o1',fill_id:'f1',symbol:'X',side:'buy',qty:2,price:100,fee:1},'2026-01-01T01:01:00.000Z'],
 ['mark',{marks:{X:110},source:'synthetic'},'2026-01-02T00:00:00.000Z'],
 ['order',{client_order_id:'o2',symbol:'X',side:'sell',qty:1,type:'market',venue:'local_sim'},'2026-01-02T01:00:00.000Z'],
 ['fill',{client_order_id:'o2',fill_id:'f2',symbol:'X',side:'sell',qty:1,price:120,fee:0.5},'2026-01-02T01:01:00.000Z'],
 ['mark',{marks:{X:115},source:'synthetic'},'2026-01-03T00:00:00.000Z'],
 ['mark',{marks:{X:90},source:'synthetic'},'2026-01-04T00:00:00.000Z'],
];
function journal(events=EVENTS,account=ACCOUNT,genesis={}) {
 const lines=[genesisLine({privateKey:KEY,ts:'2026-01-01T00:00:00.000Z',payload:{account,...genesis}})];
 for(const [kind,payload,ts] of events)lines.push(nextLine({last:lines.at(-1),kind,payload,ts,privateKey:KEY}));
 return Buffer.from(lines.join('\n')+'\n');
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-12,`${a} != ${b}`);
test('cash, fees, mark returns, turnover and drawdown match hand accounting',()=>{
 const bytes=journal(),b=exportJournal(bytes,{generated_at:GENERATED});
 assert.deepEqual(b.series.map(r=>r.equity),[1019,1033.5,1008.5]);
 assert.equal(b.metrics.fees_usd,1.5);assert.equal(b.metrics.traded_notional_usd,320);
 near(b.metrics.cumulative_return,0.0085);near(b.metrics.max_drawdown,25/1033.5);
 near(b.series[0].turnover,0.2);near(b.series[1].turnover,120/1019);
 assert.equal(b.record.returns.sharpe_reportable,false);assert.equal(b.record.returns.sharpe_annualised,null);
 assert.equal(b.record.provenance.signed,false);assert.equal(b.record.selection.trials_counted,false);
 assert.equal(conformance(b.record,SCHEMA).valid,true);
 assert.equal(journalBindings(b.record,bytes).all_match,true);
});
test('a mark starts a selected window with carried holdings and earlier costs in opening equity',()=>{
 const b=exportJournal(journal(),{from:3,to:6,generated_at:GENERATED});
 assert.equal(b.metrics.opening_equity,1019);assert.equal(b.metrics.closing_equity,1033.5);
 assert.equal(b.metrics.fees_usd,0.5);assert.equal(b.metrics.fill_count,1);near(b.metrics.cumulative_return,14.5/1019);
 assert.equal(b.series.length,1);
});
test('source bytes and recomputed claims both bind; detached signing must match the journal key',()=>{
 const bytes=journal(),b=exportJournal(bytes,{generated_at:GENERATED});const signed=signJournalExport(b,PEM);
 assert.equal(journalBindings(signed.record,bytes,signed.signature).all_match,true);
 assert.equal(journalBindings(signed.record,bytes).record_signature_valid,false);
 const altered=structuredClone(b.record);altered.returns.cumulative+=0.01;
 const result=journalBindings(altered,bytes);assert.equal(result.chain_valid,true);assert.equal(result.recomputed_matches.returns,false);assert.equal(result.all_match,false);
 const corrupt=Buffer.from(bytes);corrupt[200]^=1;assert.equal(journalBindings(b.record,corrupt).chain_valid,false);
 assert.throws(()=>signJournalExport(b,keyFromSeed('other synthetic').export({format:'pem',type:'pkcs8'})),/does not match genesis/);
});
test('unknown fees, incomplete valuations, overfills, wrong scope and unresolved reconciliation refuse export',()=>{
 const changes=[
  [e=>{delete e[1][1].fee;},/fill fee/],
  [e=>{e[2][1].marks={};},/missing mark/],
  [e=>{e[1][1].qty=3;},/exceeds/],
  [e=>{e[1][1].strategy_id='other';},/differs/],
  [e=>{e.push(['reconcile',{status:'DIVERGENT',orders:0,fills:0},'2026-01-04T01:00:00.000Z']);},/unresolved/],
  [e=>{e[4][1].fill_id='f1';},/duplicate fill/],
 ];
 for(const [mutate,reason] of changes){const e=structuredClone(EVENTS);mutate(e);assert.throws(()=>exportJournal(journal(e)),reason);}
 assert.throws(()=>exportJournal(journal(EVENTS.slice(0,2))),/mark/);
 assert.throws(()=>exportJournal(journal(EVENTS.slice(0,5))),/subsequent valuation/);
 assert.throws(()=>exportJournal(journal(EVENTS,ACCOUNT,{cashflows:[]})),/unsupported financial/);
});
test('corrections cannot hide bad unused marks or attach another event kind to an order',()=>{
 const e=structuredClone(EVENTS);e.push(['correction',{corrects_seq:7,reason:'correct mark',replacement:{marks:{X:90,Y:0}}},'2026-01-04T01:00:00.000Z']);
 assert.throws(()=>exportJournal(journal(e)),/mark Y/);
 e.at(-1)[1]={corrects_seq:1,reason:'bad scope',replacement:{fill_id:'f3'}};
 assert.throws(()=>exportJournal(journal(e)),/unsupported members/);
});
test('decimal partial fills totaling 0.3 do not become a binary overfill',()=>{
 const e=structuredClone(EVENTS.slice(0,3));e[0][1].qty=0.3;e[1][1].qty=0.1;e.splice(2,0,['fill',{...e[1][1],fill_id:'f-extra',qty:0.2,fee:0},'2026-01-01T01:02:00.000Z']);
 const b=exportJournal(journal(e),{generated_at:GENERATED});assert.equal(b.metrics.fill_count,2);assert.equal(b.metrics.closing_equity,1002);
});
test('missing or duplicate period buckets are irregular, without filling gaps with zeros',()=>{
 for(const ts of ['2026-01-02T02:00:00.000Z','2026-01-04T00:00:00.000Z']) {
  const e=structuredClone(EVENTS);e[5][2]=ts;e[6][2]='2026-01-05T00:00:00.000Z';
  const b=exportJournal(journal(e),{generated_at:'2026-01-06T00:00:00.000Z'});
  assert.equal(b.record.period.frequency,'IRREGULAR');assert.equal(b.series.length,3);
  assert.equal(b.record.returns.annualised,null);assert.equal(b.record.returns.sharpe_annualised,null);assert.equal(b.metrics.turnover_annualised,null);
 }
});
test('a selected prefix ignores later accounting corrections but verifies their signed bytes',()=>{
 const e=structuredClone(EVENTS);e.push(['correction',{corrects_seq:2,reason:'later fee correction',replacement:{fee:10}},'2026-01-04T01:00:00.000Z']);
 const bytes=journal(e),earlier=exportJournal(bytes,{to:7,generated_at:GENERATED}),later=exportJournal(bytes,{generated_at:GENERATED});
 assert.equal(earlier.metrics.fees_usd,1.5);assert.equal(later.metrics.fees_usd,10.5);
 assert.equal(earlier.record.corrections.count,0);assert.equal(later.record.corrections.count,1);
 const corrupt=Buffer.from(bytes);corrupt[corrupt.length-10]^=1;
 assert.throws(()=>exportJournal(corrupt,{to:7,generated_at:GENERATED}),/invalid journal/);
});
test('export time cannot precede the selected entries; unselected future entries still receive integrity checks',()=>{
 const bytes=journal(),generated_at='2026-01-03T12:00:00.000Z';
 assert.throws(()=>exportJournal(bytes,{generated_at}),/precedes a selected journal entry/);
 assert.equal(exportJournal(bytes,{to:6,generated_at}).series.length,2);
});
test('nonfinite derived minimum-track-record duration refuses before serialization',()=>{
 const account={...ACCOUNT,initial_positions:[{symbol:'X',qty:1,price:100}],periods_per_year:1e-309};
 const events=[110,115,120].map((price,i)=>['mark',{marks:{X:price},source:'synthetic overflow regression'},`2026-01-0${i+2}T00:00:00.000Z`]);
 assert.throws(()=>exportJournal(journal(events,account),{generated_at:GENERATED}),/minimum track record.*nonfinite/);
});
