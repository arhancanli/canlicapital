// Captures the real responses the tests replay (node scripts/capture-fixtures.mjs). Large
// documents are stored gzipped; submissions are cut to the filings the tests use.
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIR = new URL("../test/fixtures/", import.meta.url);
mkdirSync(DIR, { recursive: true });
const UA = { "User-Agent": "Canli Capital canli-markets-mcp (+https://canlicapital.com/developers)" };
const manifest = {};
let n = 0;
async function grab(url, { ua = UA, trim } = {}) {
  await new Promise((r) => setTimeout(r, 200));
  const res = await fetch(url, { headers: url.includes("sec.gov") ? ua : { "User-Agent": "canli-markets-mcp" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  let text = await res.text();
  if (trim) text = trim(text);
  const file = `f${String(++n).padStart(2, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(text, { level: 9 }));
  manifest[url] = file;
  return text;
}
const trimSubmissions = (keep) => (t) => {
  const d = JSON.parse(t), r = d.filings.recent, idx = [];
  r.form.forEach((f, i) => { if (keep(f, r.filingDate[i])) idx.push(i); });
  for (const k of Object.keys(r)) r[k] = idx.map((i) => r[k][i]);
  d.filings.files = [];
  return JSON.stringify(d);
};
const tickers = JSON.parse(await (await fetch("https://www.sec.gov/files/company_tickers.json", { headers: UA })).text());
const small = Object.fromEntries(Object.entries(tickers).filter(([, v]) => ["AAPL", "NVDA", "TSLA", "BRK-B", "MSFT"].includes(v.ticker)));
writeFileSync(new URL("f00.gz", DIR), gzipSync(JSON.stringify(small)));
manifest["https://www.sec.gov/files/company_tickers.json"] = "f00.gz";

await grab("https://data.sec.gov/submissions/CIK0000320193.json", { trim: trimSubmissions((f) => ["10-K", "10-Q", "8-K"].includes(f)) });
await grab("https://data.sec.gov/submissions/CIK0001318605.json", { trim: trimSubmissions((f, d) => ["4", "8-K", "10-Q"].includes(f) && d >= "2026-05-01") });
await grab("https://data.sec.gov/submissions/CIK0001067983.json", { trim: trimSubmissions((f) => f === "13F-HR") });
await grab("https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm");
const tsla = JSON.parse(await (await fetch("https://data.sec.gov/submissions/CIK0001318605.json", { headers: UA })).text()).filings.recent;
for (let i = 0; i < tsla.form.length; i++) {
  if (tsla.form[i] === "4" && tsla.filingDate[i] >= "2026-05-01") await grab(`https://www.sec.gov/Archives/edgar/data/1318605/${tsla.accessionNumber[i].replace(/-/g, "")}/${tsla.primaryDocument[i].replace(/^xsl[^/]*\//, "")}`);
}
await grab("https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/0001628280-26-064366-index.htm");
await grab("https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/exhibit991111111.htm");
for (const acc of ["0001193125-26-352200", "0001193125-26-226661"]) {
  const base = `https://www.sec.gov/Archives/edgar/data/1067983/${acc.replace(/-/g, "")}`;
  const idx = await grab(`${base}/${acc}-index.htm`);
  const xml = [...idx.matchAll(/href="[^"]*\/([^"/]+\.xml)"/g)].map((m) => m[1]).filter((x) => x !== "primary_doc.xml");
  for (const x of new Set(xml)) await grab(`${base}/${x}`);
  await grab(`${base}/primary_doc.xml`);
}
await grab("https://efts.sec.gov/LATEST/search-index?keysTyped=Berkshire%20Hathaway");
await grab("https://efts.sec.gov/LATEST/search-index?q=%22agentic+AI%22&forms=10-K&dateRange=custom&startdt=2026-01-01&enddt=2026-10-09");
await grab("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv");
await grab("https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL&cosd=2024-01-01");
await grab("https://fred.stlouisfed.org/series/CPIAUCSL", { trim: (t) => t.match(/<title>[^<]*<\/title>/)[0] });
await grab("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?period1=1735689600&period2=1791503999&interval=1d&events=div%2Csplit&includeAdjustedClose=true");
writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
console.log(Object.keys(manifest).length, "responses captured");
