// reference_rates, european_filings, prediction_markets and crypto_fundamentals on captured
// responses from the publishers (New York Fed, ECB, Bank of England, BIS, filings.xbrl.org,
// Polymarket, Kalshi, DefiLlama; captured 2026-10-15), plus the pure parts on hand-built input.
import assert from "node:assert/strict";
import test from "node:test";

import { cryptoFundamentals, cryptoInput, resolveProtocol } from "../src/crypto.mjs";
import { annual, europeanFilings, matchFilers, nameWords, periodOf, plainFacts, unitOf } from "../src/esef.mjs";
import { predictionMarkets, probability } from "../src/predictions.mjs";
import { parseCsv, referenceRates, resolveRate } from "../src/rates.mjs";
import { createSession, NotFound } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
const col = (t, name) => t.columns.indexOf(name);

test("reference rates from the central banks: SOFR with its percentiles, fed funds by name, oldest first", async () => {
  const s = session();
  const sofr = await referenceRates(s, { rate: "sofr", start: "2026-09-01", end: "2026-10-08" });
  assert.equal(sofr.rate.publisher, "Federal Reserve Bank of New York");
  assert.deepEqual(sofr.columns.slice(0, 7), ["date", "rate", "percentile_1", "percentile_25", "percentile_75", "percentile_99", "volume_usd_billion"]);
  assert.ok(sofr.rows.length > 20 && sofr.rows.every((r, i) => i === 0 || r[0] > sofr.rows[i - 1][0]), "dates ascend");
  assert.ok(sofr.rows.every((r) => r[2] <= r[1] + 1e-9 && r[1] <= r[5] + 1e-9), "the rate sits inside its 1st and 99th percentiles");
  assert.deepEqual(sofr.latest, { date: sofr.rows.at(-1)[0], rate: sofr.rows.at(-1)[1] });
  const effr = await referenceRates(s, { rate: "fed funds", start: "2026-09-01", end: "2026-10-08" });
  assert.equal(effr.rate.id, "effr");
  assert.ok(effr.rows.every((r) => r[col(effr, "target_from")] < r[col(effr, "target_to")] && r[1] >= r[col(effr, "target_from")] && r[1] <= r[col(effr, "target_to")]), "EFFR inside the Fed's target range");
});

test("the euro short-term rate, the ECB's rate in effect and its changes, SONIA, and a policy rate from the BIS", async () => {
  const s = session();
  const estr = await referenceRates(s, { rate: "estr", start: "2026-09-01", end: "2026-10-08" });
  assert.equal(estr.rate.publisher, "European Central Bank");
  assert.ok(estr.rows.length > 20 && estr.rows.every((r) => typeof r[1] === "number"));
  const dfr = await referenceRates(s, { rate: "ecb_deposit", start: "2026-01-01", end: "2026-10-08" });
  assert.match(dfr.rows[0][2], /^in effect since \d{4}-\d{2}-\d{2}$/, "the first row is the rate in effect on the first day");
  assert.equal(dfr.rows[0][0], "2026-01-01");
  assert.ok(dfr.rows.slice(1).every((r) => r[2] === "change"));
  const sonia = await referenceRates(s, { rate: "sonia", start: "2026-09-01", end: "2026-10-08" });
  assert.equal(sonia.rate.publisher, "Bank of England");
  assert.ok(sonia.rows.length > 20 && /^\d{4}-\d{2}-\d{2}$/.test(sonia.rows[0][0]));
  const jp = await referenceRates(s, { rate: "policy:JP", start: "2026-07-01", end: "2026-10-06" });
  assert.equal(jp.rate.id, "policy:JP");
  assert.match(jp.rate.name, /Japan/);
  assert.equal(resolveRate("Brazil's policy rate").id, "policy:BR");
  assert.equal(resolveRate("policy: euro area").id, "policy:XM");
  assert.throws(() => resolveRate("libor"), NotFound);
  assert.throws(() => resolveRate("policy:atlantis"), /No central bank policy rate/);
});

test("CSV as the publishers write it: quotes, commas and line breaks inside fields", () => {
  assert.deepEqual(parseCsv("A,B\r\n\"x, y\",\"he said \"\"hi\"\"\"\n\"two\nlines\",3\n"), [{ A: "x, y", B: "he said \"hi\"" }, { A: "two\nlines", B: "3" }]);
});

test("an ESEF report's own figures: ASML's 2025 revenue under the concept it used, periods as days, the comparatives", async () => {
  const r = await europeanFilings(session(), { company: "724500Y6DUVHQD6OXN27", year: 2025 });
  assert.equal(r.company.name, "ASML Holding N.V.");
  assert.equal(r.filing.period_end, "2025-12-31");
  const facts = r.facts, at = (m) => facts.rows.filter((x) => x[0] === m);
  assert.deepEqual(at("revenue")[0].slice(1, 5), ["ifrs-full:RevenueFromContractsWithCustomers", "2025-01-01 to 2025-12-31", 32667300000, "EUR"]);
  assert.deepEqual(at("net_income").map((x) => x[2]), ["2025-01-01 to 2025-12-31", "2024-01-01 to 2024-12-31", "2023-01-01 to 2023-12-31"], "the year, then its comparatives");
  assert.equal(at("total_assets")[0][2], "2025-12-31", "an instant at 2026-01-01T00:00 is the end of 2025-12-31");
  assert.equal(at("eps_basic")[0][4], "EUR per share");
  assert.ok(r.other_years.includes("2024-12-31"));
  const words = await europeanFilings(session(), { company: "724500Y6DUVHQD6OXN27", year: 2025, words: "net system sales" });
  assert.ok(words.found.rows.length && words.found.rows.every((x) => x[0] === "asml:NetSystemSales"));
  const total = await europeanFilings(session(), { company: "529900S21EQ1BO4ESM68", year: 2024 });
  assert.equal(total.company.name, "TotalEnergies SE");
  assert.equal(total.facts.rows.find((x) => x[0] === "revenue")[4], "USD", "reported in the currency the company tagged");
});

test("names, periods, units and the annual report among interim ones", () => {
  assert.deepEqual(nameWords("NOVO NORDISK A/S"), ["novo", "nordisk"]);
  assert.deepEqual(nameWords("Nestlé S.A."), ["nestle"]);
  const list = [{ lei: "1", name: "Novo Nordisk Fonden" }, { lei: "2", name: "NOVO NORDISK A/S" }, { lei: "3", name: "ASML Holding N.V." }].map((f) => ({ ...f, words: nameWords(f.name) }));
  assert.equal(matchFilers(list, "Novo Nordisk")[0].lei, "2", "the company before its foundation");
  assert.equal(matchFilers(list, "asml")[0].extra, 0, "Holding and N.V. are not extra words");
  assert.equal(periodOf("2025-01-01T00:00:00/2026-01-01T00:00:00"), "2025-01-01 to 2025-12-31");
  assert.equal(periodOf("2026-01-01T00:00:00"), "2025-12-31");
  assert.equal(unitOf("iso4217:DKK/xbrli:shares"), "DKK per share");
  const filings = ["2026-06-30", "2025-12-31", "2025-09-30", "2025-06-30", "2024-12-31", "2024-09-30"].map((p) => ({ period_end: p }));
  assert.equal(annual(filings).period_end, "2025-12-31", "not the newer half-year report");
  const facts = plainFacts({ facts: { a: { value: "5", dimensions: { concept: "ifrs-full:Revenue", period: "2025-01-01T00:00:00/2026-01-01T00:00:00", unit: "iso4217:EUR" } }, b: { value: "5", dimensions: { concept: "ifrs-full:Revenue", period: "2025-01-01T00:00:00/2026-01-01T00:00:00", unit: "iso4217:EUR" } }, c: { value: "2", dimensions: { concept: "ifrs-full:Revenue", period: "2025-01-01T00:00:00/2026-01-01T00:00:00", unit: "iso4217:EUR", "ifrs-full:SegmentsAxis": "x" } } } });
  assert.equal(facts.length, 1, "a repeated fact once; a segment's figure is not the total");
});

test("prediction markets: a probability from the bid and ask, else the last trade; both venues searched", async () => {
  assert.equal(probability(0.4, 0.5, 0.3), 0.45);
  assert.equal(probability(null, null, 0.3), 0.3);
  assert.equal(probability(0.6, 0.5, 0.3), 0.3, "a crossed quote is not used");
  const r = await predictionMarkets(session(), { query: "recession", limit: 3 });
  assert.ok(r.rows.some((x) => x[0] === "Polymarket") && r.rows.some((x) => x[0] === "Kalshi"));
  assert.ok(r.rows.every((x) => x[4] === null || (x[4] >= 0 && x[4] <= 1)));
  assert.ok(r.events.length >= 2 && r.sources.length === 2);
  const k = await predictionMarkets(session(), { query: "fed rate cut", limit: 3, venue: "kalshi" });
  assert.ok(k.rows.length && k.rows.every((x) => x[0] === "Kalshi"));
  // Kalshi's volume is contracts, not dollars (it was labelled volume_usd until 2026-10-15).
  assert.ok(k.events.length && k.events.every((e) => "volume_contracts" in e && !("volume_usd" in e)));
  assert.ok(r.events.filter((e) => e.venue === "Polymarket").every((e) => "volume_usd" in e && !("volume_contracts" in e)));
  assert.ok(k.limits.some((l) => /contracts traded/.test(l)));
});

test("crypto fundamentals: a protocol by slug with its fees and revenue, a stablecoin's supply, one subject a call", async () => {
  const lido = await cryptoFundamentals(session(), { protocol: "lido", days: 30 });
  assert.equal(lido.protocol.name, "Lido");
  assert.ok(lido.tvl.usd > 1e9 && lido.dates.length === 30 && lido.values.length === 30);
  assert.ok(lido.fees_usd.last_30d >= lido.fees_usd.last_7d && lido.revenue_usd.last_30d <= lido.fees_usd.last_30d, "revenue is the part of fees kept");
  const usdc = await cryptoFundamentals(session(), { stablecoin: "USDC" });
  assert.equal(usdc.stablecoin.symbol, "USDC");
  assert.ok(usdc.circulating.amount > 1e9 && usdc.circulating.by_chain.rows.length);
  assert.equal(cryptoInput.safeParse({ protocol: "aave", chain: "Ethereum" }).success, false);
  const list = [{ slug: "aave-v3", name: "Aave V3", tvl: 2, parentProtocol: "parent#aave" }, { slug: "aave-v2", name: "Aave V2", tvl: 1, parentProtocol: "parent#aave" }];
  assert.deepEqual(resolveProtocol(list, "aave"), { slug: "aave", name: null, parent: true, alternatives: ["aave-v3", "aave-v2"] });
});
