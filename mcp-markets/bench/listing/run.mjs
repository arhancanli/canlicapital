// Ordinary shares per listed share, read from each company's latest 20-F, against the ratios its
// depositary bank publishes. Passing means right or "not read": a wrong ratio is a failure, because it
// puts the market value off by that multiple.
//
//   node bench/listing/run.mjs
import { listedShareRatio } from "../../src/listing.mjs";
import { createSession, resolveEntity, submissions } from "../../src/sources.mjs";

const TRUTH = { TSM: 5, TM: 10, BABA: 8, BP: 6, SHEL: 2, HSBC: 5, PDD: 4, NVO: 1, SAP: 1, UL: 1, SNY: 2, NTES: 5, JD: 2, BIDU: 8, SONY: 1, HDB: 3, IBN: 2, INFY: 1, MUFG: 1, HMC: 3, RIO: 1, BTI: 1, FUTU: 8, GSK: 2, DEO: 4, AZN: 1, VALE: 1, PBR: 2, ITUB: 1, LI: 2, NIO: 1, TCOM: 1, SE: 1, ARM: 1, ASML: 1, STLA: 1, TD: 1, SHOP: 1, AAPL: 1 };
const session = createSession();
let right = 0, wrong = 0, unread = 0;
for (const [symbol, want] of Object.entries(TRUTH)) {
  const { cik } = await resolveEntity(session, symbol);
  const r = await listedShareRatio(session, cik, await submissions(session, cik));
  const got = r?.shares_per_listed_share ?? null;
  if (got === want) right += 1; else if (got == null) unread += 1; else wrong += 1;
  console.log(`${got === want ? "PASS" : got == null ? "UNREAD" : "FAIL"} ${symbol} want ${want} got ${got}`);
}
console.log(JSON.stringify({ right, unread, wrong, of: Object.keys(TRUTH).length }));
process.exit(wrong ? 1 : 0);
