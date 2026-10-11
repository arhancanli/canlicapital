// Captures the real responses the coverage tests replay (node scripts/capture-coverage-fixtures.mjs):
// markets beyond US stocks, and the sources added with them. Added to test/fixtures/manifest.json;
// URLs come from the same helpers the code uses, and windows end before the tests' clock
// (2026-10-09 12:00 UTC), so a capture taken later reproduces the same requests.
import { readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateRawSync, gunzipSync, gzipSync } from "node:zlib";

import * as CB from "../src/centralbank.mjs";
import * as E from "../src/events.mjs";
import * as F from "../src/funds.mjs";
import * as G from "../src/global.mjs";
import * as O from "../src/ownership.mjs";
import * as Pos from "../src/positioning.mjs";
import * as Pay from "../src/pay.mjs";
import * as P from "../src/private.mjs";
import * as Seg from "../src/segments.mjs";
import { createSession } from "../src/sources.mjs";
import { yahooChartUrl } from "../src/tools.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
const SEC = { "User-Agent": "Canli Capital canli-markets-mcp (+https://canlicapital.com/developers)" };
let n = Object.values(manifest).filter((f) => f.startsWith("c")).length;
export async function grab(url, trim) {
  if (manifest[url]) return;
  await new Promise((r) => setTimeout(r, 200));
  const res = await fetch(url, { headers: ["www.sec.gov", "data.sec.gov", "efts.sec.gov"].includes(new URL(url).host) ? SEC : { "User-Agent": "canli-markets-mcp" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  let text = await res.text();
  if (trim) text = trim(text);
  const file = `c${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(text, { level: 9 }));
  manifest[url] = file;
}

// Markets beyond US stocks: a currency pair, a future, an index, a stock listed abroad in pence,
// another in euros, and a crypto pair.
for (const symbol of ["EURUSD=X", "CL=F", "^GSPC", "SHEL.L", "SAP.DE", "BTC-USD"]) await grab(yahooChartUrl(symbol, "2026-09-01", "2026-10-08"));

// A zip archive holding one text file, deflated: SEC's fails-to-deliver files are cut to a few
// securities and packed again, so the fixture is a real file's rows in the format the code reads.
function zipOne(name, text) {
  const data = Buffer.from(text, "utf8"), packed = deflateRawSync(data), fname = Buffer.from(name), crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fname.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fname.length, 28);
  const cdOffset = local.length + fname.length + packed.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + fname.length, 12); end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, fname, packed, central, fname, end]);
}
async function grabZip(url, keep) {
  if (manifest[url]) return;
  const res = await fetch(url, { headers: SEC });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { unzipFirst } = await import("../src/sources.mjs");
  const lines = unzipFirst(bytes).split(/\r?\n/);
  const text = [lines[0], ...lines.slice(1).filter((l) => keep.has(l.split("|")[2]))].join("\n") + "\n";
  const file = `c${String(++n).padStart(3, "0")}.bin.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(zipOne(url.split("/").pop().replace(".zip", ".txt"), text), { level: 9 }));
  manifest[url] = file;
}

// The rest are recorded by running the tools themselves at the tests' clock, so the requests are
// exactly the ones the code makes.
const NOW = Date.parse("2026-10-09T12:00:00Z");
// A response already in the manifest is served from it, as the tests will, so the tool takes the
// same path here as under replay (Apple's submissions fixture is cut to 10-K, 10-Q and 8-K).
async function record(run, args) {
  const fetchImpl = async (url, init) => {
    const key = init?.method && init.method !== "GET" ? `${init.method} ${url} ${init.body ?? ""}` : url;
    if (manifest[key]) { const body = gunzipSync(readFileSync(new URL(manifest[key], DIR))); return new Response(manifest[key].endsWith(".bin.gz") ? body : body.toString("utf8"), { status: 200 }); }
    const res = await fetch(url, init);
    const text = await res.text();
    if (res.ok && !manifest[key]) {
      const file = `c${String(++n).padStart(3, "0")}.gz`;
      writeFileSync(new URL(file, DIR), gzipSync(text, { level: 9 }));
      manifest[key] = file;
    }
    return new Response(text, { status: res.status });
  };
  // The clock starts at the tests' time and runs, so SEC requests are still spaced 125 ms apart.
  const started = Date.now();
  await run(createSession({ fetchImpl, now: () => NOW + (Date.now() - started) }), args);
}
await record(G.worldEconomy, { indicator: "inflation", countries: ["United States", "euro area", "China", "Japan", "turkey"] });
await record(G.treasuryAuctions, { security: "10-year", limit: 6 });
await record(G.treasuryAuctions, { security: "13-week bill", limit: 3 });
await record(G.treasuryAuctions, { upcoming: true, limit: 5 });
await record(G.federalDebt, {});
// The OECD's projections for the US, the euro area, China, Japan and the world.
await record(G.economicOutlook, { countries: ["United States", "euro area", "China", "Japan", "world"] });
// Funds: SEC's fund ticker table cut to the funds the tests use, then IVV (equities) and TLT
// (Treasury bonds), each with the previous public report for the comparison.
await grab("https://www.sec.gov/files/company_tickers_mf.json", (t) => { const d = JSON.parse(t); d.data = d.data.filter((r) => ["IVV", "TLT", "AGG", "VOO", "QQQ"].includes(r[3])); return JSON.stringify(d); });
await record(F.fundPortfolio, { fund: "IVV", top: 3 });
await record(F.fundPortfolio, { fund: "TLT", top: 2 });
// Large holders: Coca-Cola by CIK (13G and 13D, structured and earlier text filings), and the
// week's new 13D stakes across the market.
await record(O.largeHolders, { company: "21344" });
await record(O.largeHolders, { limit: 3 });
// 8-K events: the month's restatements across the market, and Apple's executive changes.
await record(E.companyEvents, { event: "restatement", limit: 3 });
await record(E.companyEvents, { company: "AAPL", event: "executive_change", since: "2025-01-01", limit: 3 });
// Form D: the newest private offerings, those that sold at least $10 million, and one fund by CIK.
await record(P.privateOfferings, { limit: 3 });
await record(P.privateOfferings, { min_sold: 10000000, limit: 2 });
await record(P.privateOfferings, { company: "2159753" });
// Positioning: GameStop's short interest and the market's longest days to cover (FINRA), and the
// Commitments of Traders for gold, 10-year notes and, by name search, lumber (CFTC).
await record(Pos.shortInterest, { symbol: "GME" });
await record(Pos.shortInterest, { limit: 5 });
await record(Pos.futuresPositioning, { market: "gold" });
await record(Pos.futuresPositioning, { market: "10 year note", weeks: 26 });
await record(Pos.futuresPositioning, { market: "lumber", weeks: 4 });
// Executive pay: NVIDIA's pay-versus-performance table from its proxy, and the market's 2025 CEO
// pay from SEC's frames, cut to the 30 largest packages and NVIDIA so the fixtures stay small.
await record(Pay.executivePay, { company: "NVDA" });
const PAY_FRAMES = ["PeoTotalCompAmt", "PeoActuallyPaidCompAmt", "NonPeoNeoAvgTotalCompAmt", "TotalShareholderRtnAmt"].map((t) => `https://data.sec.gov/api/xbrl/frames/ecd/${t}/USD/CY2025.json`);
const top = JSON.parse(await (await fetch(PAY_FRAMES[0], { headers: SEC })).text()).data.sort((a, b) => b.val - a.val).slice(0, 30).map((r) => r.cik);
const keep = new Set([...top, 1045810]);
for (const url of PAY_FRAMES) await grab(url, (t) => { const d = JSON.parse(t); d.data = d.data.filter((r) => keep.has(r.cik)); return JSON.stringify(d); });
await record(Pay.executivePay, { limit: 6 });
// The Fed: 2026's meetings, statements and the September projections.
await record(CB.fomc, {});
// Off-exchange volume: Apple's last six weeks of dark pool and OTC trading (FINRA).
await record(Pos.offExchangeVolume, { symbol: "AAPL", weeks: 6 });
// Revenue by segment, product and region from Apple's fiscal 2025 10-K XBRL and its label linkbase.
await record(Seg.segmentRevenue, { company: "AAPL" });
// Fails to deliver: the two latest half-month files, cut to GameStop and the largest ETFs.
{
  const page = await (await fetch("https://www.sec.gov/data/foiadocsfailsdatahtm", { headers: SEC })).text();
  const zips = [...new Set([...page.matchAll(/href="(\/files\/data\/fails-deliver-data\/cnsfails\d{6}[ab]\.zip)"/g)].map((m) => m[1]))].sort().reverse().slice(0, 2);
  for (const z of zips) await grabZip(`https://www.sec.gov${z}`, new Set(["GME", "QQQ", "SPY", "IWM", "LQD"]));
  await record(Pos.failsToDeliver, { symbol: "GME" });
  await record(Pos.failsToDeliver, { limit: 5 });
}

writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
console.log(n, "coverage responses in the manifest");
