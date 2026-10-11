// Company names to SEC filers, offline, against a small ticker file in the SEC's own order (largest
// first, common shares before other classes). Before 0.2.1 names went straight to EDGAR's entity
// search: "facebook" was Denny Hill/Facebook LLC, "jp morgan" JP Morgan AG and "google" an old Google
// Inc. with no ticker.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession, resolveEntity } from "../src/sources.mjs";

const ROWS = [
  [1045810, "NVDA", "NVIDIA CORP"], [320193, "AAPL", "Apple Inc."], [1652044, "GOOGL", "Alphabet Inc."], [1326801, "META", "Meta Platforms, Inc."],
  [1067983, "BRK-B", "BERKSHIRE HATHAWAY INC"], [19617, "JPM", "JPMORGAN CHASE & CO"], [2115436, "XOM", "ExxonMobil Holdings Corp"], [37996, "F", "FORD MOTOR CO"],
  [1652044, "GOOG", "Alphabet Inc."], [80424, "PG", "PROCTER & GAMBLE Co"], [732717, "T", "AT&T INC."], [1744489, "DIS", "Walt Disney Co"],
  [1418121, "APLE", "Apple Hospitality REIT, Inc."], [5981, "AVD", "AMERICAN VANGUARD CORP"], [1746119, "VGES", "Vanguard Green Investment Ltd"],
  [1341317, "BWB", "Bridgewater Bancshares Inc"], [37996, "F-PD", "FORD MOTOR CO"],
];
const TABLE = Object.fromEntries(ROWS.map(([cik_str, ticker, title], i) => [String(i), { cik_str, ticker, title }]));

function offline() {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(String(url));
    if (String(url).endsWith("/files/company_tickers.json")) return new Response(JSON.stringify(TABLE), { headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ hits: { hits: [] } }), { headers: { "content-type": "application/json" } });
  };
  return { s: createSession({ fetchImpl, sleep: async () => {} }), asked };
}

test("names: the listed company whose registered name starts with them, largest first, common shares", async () => {
  const want = {
    apple: ["AAPL", 320193], "apple hospitality": ["APLE", 1418121], google: ["GOOGL", 1652044], facebook: ["META", 1326801],
    "jp morgan": ["JPM", 19617], "jpmorgan chase": ["JPM", 19617], exxon: ["XOM", 2115436], ford: ["F", 37996], "Ford Motor Company": ["F", 37996],
    "p&g": ["PG", 80424], "at&t": ["T", 732717], berkshire: ["BRK-B", 1067983],
  };
  for (const [q, [ticker, cik]] of Object.entries(want)) {
    const { s, asked } = offline();
    const r = await resolveEntity(s, q);
    assert.deepEqual([r.ticker, r.cik], [ticker, cik], q);
    assert.ok(!asked.some((u) => new URL(u).hostname === "efts.sec.gov"), `${q} needed no EDGAR search`);
  }
  const { s } = offline();
  assert.deepEqual((await resolveEntity(s, "apple")).other_matches.map((o) => o.ticker), ["APLE"], "the others that matched are listed");
});

test("names: fund managers by the filer of their 13Fs, not a listed company that shares a word", async () => {
  const want = { vanguard: 102909, fidelity: 315066, citadel: 1423053, "D. E. Shaw": 1009207, bridgewater: 1350694, renaissance: 1037389, "two sigma": 1179392, elliott: 1791786 };
  for (const [q, cik] of Object.entries(want)) {
    const { s } = offline();
    const r = await resolveEntity(s, q);
    assert.equal(r.cik, cik, q);
    assert.equal(r.ticker, null, q);
  }
});

test("names: a name inside another listed name is left to EDGAR's search", async () => {
  const { s, asked } = offline();
  await assert.rejects(resolveEntity(s, "disney land"), /No SEC filer matches/);
  assert.ok(asked.some((u) => new URL(u).hostname === "efts.sec.gov"));
  const { s: s2 } = offline();
  await assert.rejects(resolveEntity(s2, "american vanguardia"), /No SEC filer matches/, "not American Vanguard");
  // Names are looked up as the table's own keys, never as inherited properties.
  for (const q of ["constructor", "__proto__", "to string"]) {
    const { s: s3 } = offline();
    await assert.rejects(resolveEntity(s3, q), /No SEC filer matches/, q);
  }
});

test("lookup tables answer only their own entries: \"constructor\" is not a market, index, event or country", async () => {
  const { resolveSymbol } = await import("../src/tools.mjs");
  const { cboeSymbol } = await import("../src/options.mjs");
  const { eventCode } = await import("../src/events.mjs");
  const { matchCountry } = await import("../src/global.mjs");
  for (const q of ["constructor", "__proto__"]) {
    assert.equal(resolveSymbol(q).symbol, q.toUpperCase(), "taken as a ticker, not a named market");
    assert.equal(resolveSymbol(q).resolved_from, undefined);
    assert.throws(() => cboeSymbol(q), /not a ticker or an index/);
    assert.throws(() => eventCode(q), /Unknown 8-K event/);
    assert.throws(() => matchCountry([{ id: "USA", iso2: "US", name: "United States" }], q), /no country or region/);
  }
});
