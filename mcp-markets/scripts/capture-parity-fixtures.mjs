// Captures what factor_returns, treasury_cash, federal_budget and crypto_options read (node
// scripts/capture-parity-fixtures.mjs). Each tool runs once against the live sources with the tests' clock
// (test/replay.mjs's NOW), and every response it reads goes into test/fixtures/manifest.json as p###.gz
// (a zip archive as p###.bin.gz), under the exact URL the tool asked for, so the tests replay the same
// requests. Responses already captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { congressTrades } from "../src/congress.mjs";
import { cryptoMarkets } from "../src/coingecko.mjs";
import { cryptoOptions } from "../src/deribit.mjs";
import { factorReturns } from "../src/factors.mjs";
import { federalBudget, treasuryCash } from "../src/fiscal.mjs";
import { marketCalendar } from "../src/nasdaq.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Object.values(manifest).filter((f) => /^p\d/.test(f)).length;

async function recording(url, init = {}) {
  if (manifest[url]) {
    const body = readFileSync(new URL(manifest[url], DIR));
    const { gunzipSync } = await import("node:zlib");
    return new Response(manifest[url].endsWith(".bin.gz") ? gunzipSync(body) : gunzipSync(body).toString("utf8"), { status: 200 });
  }
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (res.ok) {
    const file = `p${String(++n).padStart(3, "0")}${/\.(zip|pdf)$/.test(new URL(url).pathname) ? ".bin.gz" : ".gz"}`;
    writeFileSync(new URL(file, DIR), gzipSync(bytes, { level: 9 }));
    manifest[url] = file;
  }
  return new Response(bytes, { status: res.status });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {} });
for (const args of [{}, { model: "carhart", start: "2025-01", end: "2025-06" }, { model: "ff5", frequency: "annual", start: "2020" }]) await factorReturns(session, args);
await treasuryCash(session, { flows: true });
await treasuryCash(session, { start: "2021-12-28", end: "2022-06-03" });
await federalBudget(session, {});
await federalBudget(session, { statement: "2026-03" });
await cryptoOptions(session, { currency: "BTC" });
await cryptoOptions(session, { currency: "BTC", view: "chain" });
await cryptoOptions(session, { currency: "SOL" });
// The House's 2026 index and three members' newest reports: a bond bought jointly, a spouse's stock trades
// with tickers, and a spouse's municipal bonds.
for (const member of ["beyer", "mcguire", "mike kelly"]) await congressTrades(session, { member, reports: 1 });
// Nasdaq's calendars for 5 November 2026: earnings and ex-dividend dates, and the splits listed then.
for (const kind of ["earnings", "dividends", "splits"]) await marketCalendar(session, { kind, date: "2026-11-05" });
// CoinGecko: the five largest coins with the whole market, and two coins asked for by symbol and by id.
await cryptoMarkets(session, { limit: 5 });
await cryptoMarkets(session, { coins: ["eth", "solana"] });
writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
console.log(Object.keys(manifest).length, "responses in the manifest");
