// Writes public/api/v1/company-tickers.json: ticker -> CIK for the companies in the active company
// release, so a client (the MCP company_financial_history tool) can resolve "AAPL" to the page that
// exists. Built from the SEC's own ticker file and the active admission, filtered to admitted,
// non-excluded companies. The SEC file is a local input (not uploaded), so this runs by hand after a
// release changes and its output is committed; scripts/company-tickers.test.mjs checks the output
// against the admission.
//   node scripts/build-company-tickers.mjs --sec /path/to/company_tickers.json --captured YYYY-MM-DD
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT = "public/api/v1/company-tickers.json";

export function buildTickerIndex({ secBytes, captured, activation, admission }) {
  const sec = JSON.parse(secBytes);
  const rows = Array.isArray(sec) ? sec : Object.values(sec);
  const admitted = admission.companies;
  const excluded = admission.excluded_companies ?? {};
  const tickers = {};
  for (const row of rows) {
    const cik = String(row.cik_str).padStart(10, "0");
    const ticker = String(row.ticker).toUpperCase();
    if (!admitted[cik] || excluded[cik] || !/^[A-Z0-9.\-]{1,10}$/.test(ticker)) continue;
    if (!(ticker in tickers)) tickers[ticker] = cik;
  }
  const sorted = Object.fromEntries(Object.entries(tickers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return {
    schema: "canli.company-tickers.v1",
    claim_boundary: "Maps an exchange ticker to the SEC CIK of a company in this company reference release. A ticker can be reused after a delisting; the CIK is the identity.",
    source: {
      url: "https://www.sec.gov/files/company_tickers.json",
      captured,
      sha256: createHash("sha256").update(secBytes).digest("hex"),
      entries: rows.length,
    },
    release_hash: activation.release_hash,
    admission: activation.admission.path,
    count: Object.keys(sorted).length,
    tickers: sorted,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const secPath = arg("--sec");
  const captured = arg("--captured");
  if (!secPath || !/^\d{4}-\d{2}-\d{2}$/.test(captured ?? "")) throw new Error("usage: --sec <company_tickers.json> --captured YYYY-MM-DD");
  const activation = JSON.parse(readFileSync(resolve(ROOT, "config/company-production-activation.json"), "utf8"));
  const admission = JSON.parse(readFileSync(resolve(ROOT, activation.admission.path), "utf8"));
  const index = buildTickerIndex({ secBytes: readFileSync(secPath), captured, activation, admission });
  writeFileSync(resolve(ROOT, OUTPUT), `${JSON.stringify(index)}\n`);
  console.log(`${OUTPUT}: ${index.count} tickers from ${index.source.entries} SEC rows`);
}
