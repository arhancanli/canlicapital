// Writes public/api/v1/company-names.json: every company in the active company release with its name
// and its current tickers, so a client (the canli-fundamentals-mcp find_company tool) can resolve a
// company by name as well as by ticker or CIK. Names come from the release's own catalog (each leaf
// carries the company's name), walked from the admission's catalog root with every object's hash
// checked. Tickers are exactly those of the published ticker index (public/api/v1/company-tickers.json),
// grouped by CIK. The SEC's ticker rows whose CIK the release does not cover are kept as `outside`, so
// a client can say where a ticker points instead of only refusing it (XOM now names a new holding
// company, CIK 2115436, while Exxon Mobil's filings are under CIK 34088).
//
// The catalog objects and the SEC file are local inputs (not uploaded), so this runs by hand after a
// release changes and its output is committed; scripts/company-names.test.mjs checks the output against
// the admission and the ticker index.
//   node scripts/build-company-names.mjs --objects <catalog objects dir> --sec <company_tickers.json>
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { catalogHash, validateCatalogNode } from "../api/_lib/company-catalog.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT = "public/api/v1/company-names.json";
export const TICKERS = "public/api/v1/company-tickers.json";

// Every leaf name in the catalog under rootHash, keyed by CIK. readObject(hash) returns the bytes of
// the object named by that hash; a missing object or a hash mismatch throws.
export function catalogNames(rootHash, readObject) {
  const names = {};
  const walk = (hash) => {
    const bytes = readObject(hash);
    if (catalogHash(bytes) !== hash) throw new Error(`catalog object ${hash} does not match its hash`);
    const node = validateCatalogNode(JSON.parse(bytes.toString("utf8")));
    for (const entry of node.entries) {
      if (node.level) walk(entry.hash);
      else names[entry.first] = entry.name.trim();
    }
  };
  walk(rootHash);
  return names;
}

export function buildCompanyNames({ names, tickerIndex, secBytes, admission, activation }) {
  if (tickerIndex.release_hash !== activation.release_hash) throw new Error(`${TICKERS} is bound to another release; rebuild it first`);
  const secSha = catalogHash(secBytes);
  if (secSha !== tickerIndex.source.sha256) throw new Error(`the SEC file (${secSha}) is not the one ${TICKERS} was built from (${tickerIndex.source.sha256})`);
  const excluded = admission.excluded_companies ?? {};
  const covered = Object.keys(admission.companies).filter((cik) => !excluded[cik]).sort();
  const tickersByCik = {};
  for (const [ticker, cik] of Object.entries(tickerIndex.tickers)) (tickersByCik[cik] ??= []).push(ticker);
  const rows = covered.map((cik) => {
    const name = names[cik];
    if (!name) throw new Error(`the catalog has no name for CIK ${cik}`);
    return [Number(cik), name, (tickersByCik[cik] ?? []).sort()];
  });
  const sec = JSON.parse(secBytes);
  const outside = {};
  for (const row of Array.isArray(sec) ? sec : Object.values(sec)) {
    const cik = String(row.cik_str).padStart(10, "0");
    const ticker = String(row.ticker).toUpperCase();
    if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker) || (admission.companies[cik] && !excluded[cik]) || ticker in outside) continue;
    outside[ticker] = [ticker, Number(cik), String(row.title).trim()];
  }
  return {
    schema: "canli.company-names.v1",
    claim_boundary: "Names are the company names in this company reference release. Tickers are the SEC's ticker file on the captured date: a company that no longer trades has none, and a ticker can be reused after a delisting, so the CIK is the identity. outside lists tickers the SEC assigns to companies this release does not cover.",
    release_hash: activation.release_hash,
    admission: activation.admission.path,
    catalog_root: admission.catalog_root,
    source: tickerIndex.source,
    count: rows.length,
    columns: ["cik", "name", "tickers"],
    rows,
    outside: { columns: ["ticker", "cik", "name"], rows: Object.values(outside).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const objects = arg("--objects");
  const secPath = arg("--sec");
  if (!objects || !secPath) throw new Error("usage: --objects <catalog objects dir> --sec <company_tickers.json>");
  const activation = JSON.parse(readFileSync(resolve(ROOT, "config/company-production-activation.json"), "utf8"));
  const admission = JSON.parse(readFileSync(resolve(ROOT, activation.admission.path), "utf8"));
  const tickerIndex = JSON.parse(readFileSync(resolve(ROOT, TICKERS), "utf8"));
  const names = catalogNames(admission.catalog_root, (hash) => readFileSync(join(objects, `${hash}.json`)));
  const index = buildCompanyNames({ names, tickerIndex, secBytes: readFileSync(secPath), admission, activation });
  writeFileSync(resolve(ROOT, OUTPUT), `${JSON.stringify(index)}\n`);
  console.log(`${OUTPUT}: ${index.count} companies (${index.rows.filter((r) => r[2].length).length} with tickers), ${index.outside.rows.length} tickers outside the release`);
}
