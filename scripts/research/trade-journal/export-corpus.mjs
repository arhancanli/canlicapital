// Synthetic signed accounting cases; no broker, credentials or performance observations.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { genesisLine, nextLine } from '../../../js/trade-journal-core.js';
import { keyFromSeed } from './corpus.mjs';
const KEY = keyFromSeed('canli journal export synthetic accounting corpus v1');
const START = Date.UTC(2026, 0, 1);
const FREQUENCIES = ['DAILY', 'HOURLY', 'WEEKLY', 'MONTHLY', 'IRREGULAR'];
const PPY = { DAILY: 365, HOURLY: 8760, WEEKLY: 52, MONTHLY: 12 };
function random(seed) { let s=seed>>>0; return n=>{ s^=s<<13; s^=s>>>17; s^=s<<5; return (s>>>0)%n; }; }
const iso = t => new Date(t).toISOString();

export function accountingCases(count=1000) {
  const cases=[];
  for(let i=0;i<count;i++) {
    const r=random(i+913),frequency=FREQUENCIES[i%5],venue=['local_sim','alpaca_paper','mixed'][i%3];
    const account={schema:'canli.trade-journal.account.v0',strategy_id:`synthetic-${i}`,session_id:`label-${i%7}`,identity_kind:['CANDIDATE','SLEEVE','BOOK'][i%3],currency:'USD',venue,initial_cash:10000+r(10000)/100,initial_positions:[{symbol:'X',qty:(r(201)-100)/10,price:100.25},{symbol:'Y',qty:(r(101)-50)/10,price:50.125}],frequency,...(PPY[frequency]?{periods_per_year:PPY[frequency]}:{})};
    const events=[],marks=[];
    let previous=START;
    const periods=4+r(7);
    for(let j=1;j<=periods;j++) {
      const next=frequency==='MONTHLY'?Date.UTC(2026,j,1):START+j*(frequency==='HOURLY'?3600000:frequency==='WEEKLY'?7*86400000:86400000)+(frequency==='IRREGULAR'?j*j*1000:0);
      const tick=previous+1000;
      const symbol=r(2)?'X':'Y',side=r(2)?'buy':'sell',partial=(i+j)%7===0,qty=partial?0.3:(1+r(10000))/1000,order=`o-${j}`,orderVenue=venue==='mixed'?(j%2?'local_sim':'alpaca_paper'):venue;
      events.push(['order',{client_order_id:order,symbol,side,qty,type:j%3===0?'limit':'market',...(j%3===0?{limit_price:110}:{}),venue:orderVenue},iso(tick)]);
      const fills=partial?[0.1,0.2]:[qty];
      for(let k=0;k<fills.length;k++)events.push(['fill',{client_order_id:order,fill_id:`f-${j}-${k}`,symbol,side,qty:fills[k],price:(50000+r(200000))/1000,fee:(r(36)-5)/100,venue:orderVenue,filled_at:iso(tick+1000+k*1000)},iso(tick+1000+k*1000)]);
      if(j===2)events.push(['reconcile',{status:'AGREE'},iso(tick+4000)]);
      events.push(['mark',{marks:{X:(80000+r(50000))/1000,Y:(30000+r(40000))/1000},source:`synthetic-${j%3}`},iso(next)]);
      marks.push(events.length);previous=next;
    }
    if(i%4===0) {
      const target=events.findIndex(e=>e[0]==='fill')+1;
      events.push(['correction',{corrects_seq:target,reason:'synthetic fee correction',replacement:{fee:-0.01}},iso(previous+1000)]);
    }
    if(i%9===0)events.push(['correction',{corrects_seq:marks.at(-1),reason:'synthetic mark correction',replacement:{marks:{X:101.375,Y:49.125}}},iso(previous+2000)]);
    let from=0,to=events.length;
    if(i%3===0)from=marks[0];
    if(i%7===0)to=marks.at(-1);
    if(i%17===0)to=marks[2];
    cases.push({name:`case-${String(i).padStart(4,'0')}`,account,events,options:{from,to,generated_at:'2026-12-01T00:00:00.000Z'},features:{frequency,venue,partial_fills:events.filter(e=>e[0]==='fill').length>periods,correction:events.some(e=>e[0]==='correction'),window:from!==0||to!==events.length}});
  }
  // Deliberate insolvency and recovery remain in the corpus; no return/loss is dropped.
  for(const i of [0,1,2,3,4]) {
    const c=cases[i];c.account={...c.account,venue:'local_sim',frequency:'DAILY',periods_per_year:365,initial_cash:10100,initial_positions:[{symbol:'X',qty:-100,price:100}]};
    c.events=[104,110,90,95].map((price,j)=>['mark',{marks:{X:price},source:'synthetic-insolvency'},iso(START+(j+1)*86400000)]);
    c.options={from:0,to:4,generated_at:'2026-12-01T00:00:00.000Z'};c.features={insolvency:true,frequency:'DAILY',venue:'local_sim',window:false,correction:false,partial_fills:false};
  }
  return cases;
}
export function caseJournal(c) {
  const lines=[genesisLine({privateKey:KEY,ts:iso(START),payload:{account:c.account,software:'synthetic accounting corpus'}})];
  for(const [kind,payload,ts] of c.events)lines.push(nextLine({last:lines.at(-1),kind,payload,ts,privateKey:KEY}));
  return Buffer.from(lines.join('\n')+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2])throw Error('Usage: node export-corpus.mjs OUTPUT_DIR');
  const dir=resolve(process.argv[2]);mkdirSync(dir,{recursive:true});const cases=accountingCases();
  for(const c of cases)writeFileSync(resolve(dir,c.name+'.jsonl'),caseJournal(c));
  writeFileSync(resolve(dir,'cases.json'),JSON.stringify(cases.map(({events,account,...metadata})=>metadata))+'\n');
  console.log(`Wrote ${cases.length} signed synthetic journals and explicit window metadata`);
}
