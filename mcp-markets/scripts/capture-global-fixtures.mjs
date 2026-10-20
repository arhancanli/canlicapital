// Captures the real responses the tests of reference_rates, european_filings, prediction_markets
// and crypto_fundamentals replay (node scripts/capture-global-fixtures.mjs): every request each test
// call makes, stored in test/fixtures/manifest.json as g###.gz. Responses already captured are
// served from the manifest, so a later run fetches only what is new. Calls pin their dates, so
// the replayed URLs do not depend on the clock.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { createSession } from "../src/sources.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Object.values(manifest).filter((f) => f.startsWith("g")).length;
const NOW = Date.parse("2026-10-09T12:00:00Z");

function store(url, text) {
  const file = `g${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(text, { level: 9 }));
  manifest[url] = file;
}

async function record(run, args) {
  const fetchImpl = async (url, init) => {
    if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))).toString("utf8"), { status: 200 });
    await new Promise((r) => setTimeout(r, 250));
    const res = await fetch(url, init);
    const text = await res.text();
    if (res.ok) store(url, text);
    return new Response(text, { status: res.status });
  };
  return run(createSession({ fetchImpl, now: () => NOW }), args);
}

export const RATE_CALLS = [
  { rate: "sofr", start: "2026-09-01", end: "2026-10-08" },
  { rate: "fed funds", start: "2026-09-01", end: "2026-10-08" },
  { rate: "estr", start: "2026-09-01", end: "2026-10-08" },
  { rate: "ecb_deposit", start: "2026-01-01", end: "2026-10-08" },
  { rate: "sonia", start: "2026-09-01", end: "2026-10-08" },
  { rate: "policy:JP", start: "2026-07-01", end: "2026-10-06" },
];
export const ESEF_CALLS = [
  { company: "724500Y6DUVHQD6OXN27", year: 2025 },
  { company: "724500Y6DUVHQD6OXN27", year: 2025, words: "net system sales" },
  { company: "529900S21EQ1BO4ESM68", year: 2024 },
];
export const PREDICTION_CALLS = [
  { query: "recession", limit: 3 },
  { query: "fed rate cut", limit: 3, venue: "kalshi" },
];
export const CRYPTO_CALLS = [
  { protocol: "lido", days: 30 },
  { stablecoin: "USDC" },
];

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { referenceRates } = await import("../src/rates.mjs");
  for (const args of RATE_CALLS) await record(referenceRates, args);
  const { europeanFilings } = await import("../src/esef.mjs");
  for (const args of ESEF_CALLS) await record(europeanFilings, args);
  const { predictionMarkets } = await import("../src/predictions.mjs");
  for (const args of PREDICTION_CALLS) await record(predictionMarkets, args);
  const { cryptoFundamentals } = await import("../src/crypto.mjs");
  for (const args of CRYPTO_CALLS) await record(cryptoFundamentals, args);
  writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
  console.log(n, "global responses in the manifest");
}
