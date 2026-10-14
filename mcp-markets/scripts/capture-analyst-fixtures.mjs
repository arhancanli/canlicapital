// Captures the real SEC responses the analyst-tool tests replay (node scripts/capture-analyst-fixtures.mjs):
// rendered XBRL reports (FilingSummary.xml and R pages) for the statement parser, and every request
// financial_statements, filing_tables and earnings_release make for the test calls. Added to
// test/fixtures/manifest.json as a###.gz; responses already captured are served from it, so a
// later run fetches only what is new. Tool runs use the tests' clock (2026-10-09 12:00 UTC).
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { createSession } from "../src/sources.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
const SEC = { "User-Agent": "Canli Capital canli-markets-mcp (+https://canlicapital.com/developers)" };
let n = Object.values(manifest).filter((f) => f.startsWith("a")).length;
const NOW = Date.parse("2026-10-09T12:00:00Z");

function store(url, text) {
  const file = `a${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(text, { level: 9 }));
  manifest[url] = file;
}

// One URL as received (trim cuts a very long document to the part a test reads).
export async function grab(url, trim) {
  if (manifest[url]) return;
  await new Promise((r) => setTimeout(r, 200));
  const res = await fetch(url, { headers: SEC });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const text = await res.text();
  store(url, trim ? trim(text) : text);
}

// Every request a tool call makes, by running it.
export async function record(run, args) {
  const fetchImpl = async (url, init) => {
    if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))).toString("utf8"), { status: 200 });
    const res = await fetch(url, init);
    const text = await res.text();
    if (res.ok) store(url, text);
    return new Response(text, { status: res.status });
  };
  const started = Date.now();
  return run(createSession({ fetchImpl, now: () => NOW + (Date.now() - started) }), args);
}

const ARCHIVES = "https://www.sec.gov/Archives/edgar/data";
// The statement parser's pages: Microsoft's 10-K (June year, $ in millions), Costco's 10-Q
// (12 and 36 weeks, rendered as 3 and 8 months; an equity statement; counts in their own units;
// dividends per share), Coca-Cola's equity statement (eight component columns) and JPMorgan's
// income statement (a bank).
const PAGES = [
  `${ARCHIVES}/789019/000119312526323660/FilingSummary.xml`,
  `${ARCHIVES}/789019/000119312526323660/R2.htm`,
  `${ARCHIVES}/789019/000119312526323660/R4.htm`,
  `${ARCHIVES}/789019/000119312526323660/R6.htm`,
  `${ARCHIVES}/909832/000090983226000051/FilingSummary.xml`,
  `${ARCHIVES}/909832/000090983226000051/R2.htm`,
  `${ARCHIVES}/909832/000090983226000051/R6.htm`,
  `${ARCHIVES}/909832/000090983226000051/R26.htm`,
  `${ARCHIVES}/909832/000090983226000051/R33.htm`,
  `${ARCHIVES}/21344/000162828026010047/R8.htm`,
  `${ARCHIVES}/19617/000162828026008131/R3.htm`,
];

// financial_statements: two Microsoft 10-Ks joined, two Costco 10-Qs, NVIDIA across its 2024 split
// (earnings per share restated tenfold), Coca-Cola's equity statement.
export const STATEMENT_CALLS = [
  { company: "MSFT", filings: 2 },
  { company: "909832", statement: "income", period: "quarterly", filings: 2 },
  { company: "NVDA", statement: "income", filings: 2, fiscal_year: 2025 },
  { company: "21344", statement: "equity", fiscal_year: 2025 },
];

// filing_tables: Costco's paid members through three 10-Ks (an MD&A table the XBRL does not
// tag), Walmart's results release (guidance tables), Microsoft's 10-K (an XBRL detail report with a
// footnote, and the list of every table).
export const TABLE_CALLS = [
  { company: "909832", find: "paid members", filings: 3 },
  { company: "104169", form: "8-K", find: "guidance", accession: "0000104169-26-000145" },
  { company: "MSFT", find: "geographic revenue" },
  { company: "MSFT" },
];

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  for (const url of PAGES) await grab(url);
  const { financialStatements } = await import("../src/statements.mjs");
  for (const args of STATEMENT_CALLS) await record(financialStatements, args);
  const { filingTables } = await import("../src/filing-tables.mjs");
  for (const args of TABLE_CALLS) await record(filingTables, args);
  writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
  console.log(n, "analyst responses in the manifest");
}
