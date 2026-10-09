// Captures the real responses the research tests replay, added to test/fixtures/manifest.json
// (node scripts/capture-research-fixtures.mjs). Frames are cut to 20 companies so the fixtures stay
// small; URLs come from the same helpers the code uses, at the tests' clock (2026-10-09 12:00 UTC).
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { frameUrl, METRICS } from "../src/research.mjs";
import { yahooChartUrl } from "../src/tools.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
const SEC = { "User-Agent": "Canli Capital canli-markets-mcp (+https://canlicapital.com/developers)" };
const NOW = Date.parse("2026-10-09T12:00:00Z");
const day = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);
const CIKS = new Set([1045810, 789019, 320193, 200406, 2046386, 1018724, 1652044, 1326801, 1403161, 1141391, 104169, 1236275, 1769628, 50863, 310158, 59478, 1730168, 78003, 34088, 19617]);
let n = Object.keys(manifest).length;
async function grab(url, trim) {
  if (manifest[url]) return;
  await new Promise((r) => setTimeout(r, 150));
  const res = await fetch(url, { headers: /sec\.gov\//.test(new URL(url).host + "/") ? SEC : { "User-Agent": "canli-markets-mcp" } });
  if (res.status === 404) { console.log("404 (left out):", url); return; }
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  let text = await res.text();
  if (trim) text = trim(text);
  const file = `r${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(text, { level: 9 }));
  manifest[url] = file;
}
const trimFrame = (t) => { const d = JSON.parse(t); d.data = d.data.filter((r) => CIKS.has(r.cik)); return JSON.stringify(d); };
await grab("https://www.sec.gov/files/company_tickers_exchange.json", (t) => { const d = JSON.parse(t); d.data = d.data.filter((r) => CIKS.has(r[0])); return JSON.stringify(d); });
const frames = [];
for (const [name, def] of Object.entries(METRICS)) for (const tag of def.tags) for (const f of def.kind === "instant" ? ["CY2025Q4I"] : ["CY2025", "CY2024"]) frames.push(frameUrl("us-gaap", tag, def.unit, f));
for (const f of ["CY2025Q4I", "CY2026Q1I", "CY2026Q2I"]) frames.push(frameUrl("dei", "EntityCommonStockSharesOutstanding", "shares", f));
frames.push(frameUrl("us-gaap", "WeightedAverageNumberOfDilutedSharesOutstanding", "shares", "CY2025"));
for (const u of frames) await grab(u, trimFrame);
// Valuation closes for every company in the set; a year of AAPL and SPY for the report.
const tickers = JSON.parse(await (await fetch("https://www.sec.gov/files/company_tickers_exchange.json", { headers: SEC })).text()).data.filter((r) => CIKS.has(r[0]));
const seen = new Set();
for (const [, , t] of tickers) if (!seen.has(t)) { seen.add(t); await grab(yahooChartUrl(t, day(10), day(0))); }
for (const t of ["AAPL", "SPY"]) await grab(yahooChartUrl(t, day(372), day(0)));
// Apple's XBRL history, cut to the concepts the report reads.
await grab("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json", (t) => {
  const d = JSON.parse(t), keep = new Set(Object.values(METRICS).flatMap((m) => m.tags));
  d.facts = { "us-gaap": Object.fromEntries(Object.entries(d.facts["us-gaap"]).filter(([k]) => keep.has(k))), dei: { EntityCommonStockSharesOutstanding: d.facts.dei.EntityCommonStockSharesOutstanding } };
  return JSON.stringify(d);
});
writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
console.log(Object.keys(manifest).length, "responses in the manifest");
