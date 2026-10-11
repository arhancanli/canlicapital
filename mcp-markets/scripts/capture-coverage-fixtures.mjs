// Captures the real responses the coverage tests replay (node scripts/capture-coverage-fixtures.mjs):
// markets beyond US stocks, and the sources added with them. Added to test/fixtures/manifest.json;
// URLs come from the same helpers the code uses, and windows end before the tests' clock
// (2026-10-09 12:00 UTC), so a capture taken later reproduces the same requests.
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import * as F from "../src/funds.mjs";
import * as G from "../src/global.mjs";
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

// The rest are recorded by running the tools themselves at the tests' clock, so the requests are
// exactly the ones the code makes.
const NOW = Date.parse("2026-10-09T12:00:00Z");
async function record(run, args) {
  const fetchImpl = async (url, init) => {
    const res = await fetch(url, init);
    const text = await res.text();
    if (res.ok && !manifest[url]) {
      const file = `c${String(++n).padStart(3, "0")}.gz`;
      writeFileSync(new URL(file, DIR), gzipSync(text, { level: 9 }));
      manifest[url] = file;
    }
    return new Response(text, { status: res.status });
  };
  await run(createSession({ fetchImpl, now: () => NOW }), args);
}
await record(G.worldEconomy, { indicator: "inflation", countries: ["United States", "euro area", "China", "Japan", "turkey"] });
await record(G.treasuryAuctions, { security: "10-year", limit: 6 });
await record(G.treasuryAuctions, { security: "13-week bill", limit: 3 });
await record(G.treasuryAuctions, { upcoming: true, limit: 5 });
await record(G.federalDebt, {});
// Funds: SEC's fund ticker table cut to the funds the tests use, then IVV (equities) and TLT
// (Treasury bonds), each with the previous public report for the comparison.
await grab("https://www.sec.gov/files/company_tickers_mf.json", (t) => { const d = JSON.parse(t); d.data = d.data.filter((r) => ["IVV", "TLT", "AGG", "VOO", "QQQ"].includes(r[3])); return JSON.stringify(d); });
await record(F.fundPortfolio, { fund: "IVV", top: 3 });
await record(F.fundPortfolio, { fund: "TLT", top: 2 });

writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
console.log(n, "coverage responses in the manifest");
