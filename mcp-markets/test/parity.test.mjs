// factor_returns, treasury_cash, federal_budget and crypto_options on responses captured from Kenneth
// French's library, Fiscal Data and Deribit (scripts/capture-parity-fixtures.mjs), replayed with no network.
import assert from "node:assert/strict";
import test from "node:test";

import { cryptoMarkets } from "../src/coingecko.mjs";
import { cryptoOptions, parseInstrument } from "../src/deribit.mjs";
import { factorReturns, parseLibrary } from "../src/factors.mjs";
import { congressTrades, parseIndex } from "../src/congress.mjs";
import { federalBudget, treasuryCash } from "../src/fiscal.mjs";
import { marketCalendar } from "../src/nasdaq.mjs";
import { calendar, easter, marketHours } from "../src/hours.mjs";
import { createSession } from "../src/sources.mjs";
import { priceHistory } from "../src/tools.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {} });

test("the library's CSV: monthly and annual sections, percent to fractions, missing values as null", () => {
  const p = parseLibrary("This file was created by CMPT using the 202609 CRSP database.\n\n,Mkt-RF,SMB,HML,RF\n192607,   2.89,  -2.42,  -2.75,   0.22\n192608, -99.99, 1, 2, 0.25\n\n Annual Factors: January-December \n,Mkt-RF,SMB,HML,RF\n  2025,  13.30, -10.79,   8.71,   4.25\n");
  assert.equal(p.through, "2026-09");
  assert.deepEqual(p.monthly.get("1926-07"), { "Mkt-RF": 0.0289, SMB: -0.0242, HML: -0.0275, RF: 0.0022 });
  assert.equal(p.monthly.get("1926-08")["Mkt-RF"], null);
  assert.deepEqual(p.annual.get("2025"), { "Mkt-RF": 0.133, SMB: -0.1079, HML: 0.0871, RF: 0.0425 });
});

test("factor_returns: ten years of monthly ff3 by default, carhart joins momentum, ff5 by year", async () => {
  const s = session();
  const ff3 = await factorReturns(s, {});
  assert.deepEqual(ff3.columns, ["period", "Mkt-RF", "SMB", "HML", "RF"]);
  assert.equal(ff3.count, 121);
  assert.deepEqual(ff3.rows.at(-1), ["2026-09", -0.0107, -0.0316, -0.0155, 0.0031]);
  assert.equal(ff3.data_through, "2026-09");
  const carhart = await factorReturns(s, { model: "carhart", start: "2025-01", end: "2025-06" });
  assert.deepEqual(carhart.columns, ["period", "Mkt-RF", "SMB", "HML", "RF", "Mom"], "momentum adds only its own column");
  assert.deepEqual(carhart.rows[2], ["2025-03", -0.0639, -0.0272, 0.0287, 0.0034, -0.0264]);
  assert.equal(carhart.rows.length, 6);
  const ff5 = await factorReturns(s, { model: "ff5", frequency: "annual", start: "2020" });
  assert.deepEqual(ff5.rows.at(-1), ["2025", 0.133, -0.0931, 0.0871, -0.1085, -0.0533, 0.0425]);
  await assert.rejects(factorReturns(s, { start: "1900-01", end: "1910-01" }), /No monthly ff3 factors between 1900-01 and 1910-01; the library runs from 1926-07/);
});

test("treasury_cash: the TGA each day under all three of its names, and the day's largest flows", async () => {
  const s = session();
  const c = await treasuryCash(s, { flows: true });
  assert.deepEqual(c.latest, { date: "2026-10-09", balance: 872526 });
  assert.deepEqual(c.change, { from: "2026-07-13", to: "2026-10-09", balance: 122244 });
  assert.equal(c.units, "millions of US dollars");
  assert.deepEqual(c.flows.deposits[0], ["Taxes - Withheld Individual/FICA", 9600, 91424, 91424]);
  assert.ok(c.flows.deposits.every((r) => r[0] !== "null"), "the statement's unlabelled totals are left out");
  const across = await treasuryCash(s, { start: "2021-12-28", end: "2022-06-03" });
  assert.deepEqual(across.rows[0], ["2021-12-28", 268208], "the Treasury General Account (TGA), closing");
  assert.deepEqual(across.rows.find((r) => r[0] === "2022-06-01"), ["2022-06-01", 780575], "the TGA Closing Balance line");
  assert.equal(across.rows.length, 111, "every business day, none lost where the names change");
});

test("federal_budget: this fiscal year against the same months of the last", async () => {
  const s = session();
  const b = await federalBudget(s, {});
  assert.equal(b.statement, "2026-09");
  assert.deepEqual(b.year_to_date, { months: 12, receipts: 5403326758960.81, outlays: 7395799983313.23, deficit: 1992473224352.42 }, "the statement's own year-to-date line");
  assert.equal(b.change.deficit, 217104034534.07);
  assert.deepEqual(b.rows.find((r) => r[0] === "2026-04"), ["2026-04", 2026, 837342690993.51, 622318555795.74, -215024135197.77], "April's surplus is negative");
  const mar = await federalBudget(s, { statement: "2026-03" });
  assert.equal(mar.year_to_date.months, 6);
  assert.equal(mar.same_months_last_year.months, 6, "a part year against the same part of the year before");
  assert.equal(mar.same_months_last_year.deficit, 1307130216693.3);
});

test("crypto_options: the term structure with DVOL, one expiry's chain in dollars, and linear options in USDC", async () => {
  assert.deepEqual(parseInstrument("XRP_USDC-13NOV26-2d5-C"), { base: "XRP_USDC", expiry: "2026-11-13", strike: 2.5, type: "call" });
  assert.equal(parseInstrument("BTC-PERPETUAL"), null);
  const s = session();
  const btc = await cryptoOptions(s, { currency: "btc" });
  assert.equal(btc.rows.length, 12);
  assert.deepEqual(btc.rows[0], ["2026-11-05", 26.8, 78180.36, 78000, 36.33, 1897.7, 2063.6, 1.087, 892382]);
  assert.equal(btc.dvol.latest, 36.39);
  const chain = await cryptoOptions(s, { currency: "BTC", view: "chain" });
  assert.equal(chain.expiry, "2026-11-05", "the nearest expiry at least a day away");
  assert.deepEqual(chain.rows.find((r) => r[0] === 80000), [80000, 46.91, 62.54, 34.31, 249.7, 1719.97, 2032.69, 34.31, 0]);
  const sol = await cryptoOptions(s, { currency: "SOL" });
  assert.equal(sol.settled_in, "USDC");
  assert.equal(sol.dvol, undefined, "DVOL is published for BTC and ETH");
  await assert.rejects(cryptoOptions(s, { currency: "BTC", view: "chain", expiry: "2026-11-10" }), /No BTC options expire on 2026-11-10\. Expiries listed: 2026-11-05, 2026-11-06/);
});

test("market_hours: NYSE's holidays and early closes as it published them, the clock across daylight saving, and trading days", () => {
  const at = (iso) => ({ now: () => Date.parse(iso) });
  const days = (y) => [...calendar(y).closed.keys()].filter((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())).sort();
  assert.deepEqual(days(2024), ["2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27", "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25"]);
  assert.deepEqual(days(2025), ["2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25"], "with the day of mourning for President Carter");
  assert.deepEqual([...calendar(2024).early.keys()].sort(), ["2024-07-03", "2024-11-29", "2024-12-24"]);
  assert.deepEqual([...calendar(2026).early.keys()].sort(), ["2026-11-27", "2026-12-24"], "3 July 2026 is the observed holiday, so no early close");
  assert.ok(!days(2022).includes("2021-12-31") && days(2022)[0] === "2022-01-17", "New Year's Day on a Saturday is not moved to Friday");
  assert.equal(easter(2027), "2027-03-28");
  const r = marketHours(at("2026-03-09T13:00:00Z"), { year: 2024, start: "2024-01-01", end: "2024-12-31", date: "2026-07-03" });
  assert.equal(r.now.status, "pre-market");
  assert.deepEqual(r.now.next_open, { eastern: "2026-03-09 09:30", utc: "2026-03-09T13:30:00.000Z" }, "the day after daylight saving starts");
  assert.equal(r.trading_days.count, 252);
  assert.deepEqual(r.date, { date: "2026-07-03", trading_day: false, reason: "Independence Day" });
  assert.equal(marketHours(at("2026-12-24T17:59:00Z"), {}).now.next_close.eastern, "2026-12-24 13:00");
  assert.match(marketHours(at("2026-11-07T15:00:00Z"), {}).now.status, /closed \(Saturday\)/);
  assert.equal(marketHours(at("2026-11-04T21:30:00Z"), {}).now.status, "after-hours");
});

test("congress_trades: the House index, each report's trades with ticker, owner, dates and amount range, across wrapped lines", async () => {
  const idx = parseIndex("Prefix\tLast\tFirst\tSuffix\tFilingType\tStateDst\tYear\tFilingDate\tDocID\r\nHon.\tBeyer\tDonald\tJr\tP\tVA08\t2026\t11/1/2026\t20035743\r\n");
  assert.deepEqual(idx[0], { name: "Hon. Donald Beyer Jr", district: "VA08", type: "P", filed: "2026-11-01", doc: "20035743", year: "2026" });
  const s = session();
  const beyer = await congressTrades(s, { member: "beyer", reports: 1 });
  assert.deepEqual(beyer.reports.rows[0], ["2026-11-01", "Hon. Donald Sternoff Beyer Jr", "VA08", "20035743", 1, "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035743.pdf"]);
  assert.deepEqual(beyer.transactions.rows[0].slice(3, 12), ["joint", "California CMNTY VAR 11/01/54", null, "GS", "purchase", "2026-10-07", "2026-11-01", 15001, 50000], "the amount's two halves on two lines");
  const mcguire = await congressTrades(s, { member: "mcguire", reports: 1 });
  assert.equal(mcguire.transactions.rows.length, 4);
  assert.deepEqual(mcguire.transactions.rows[0].slice(3, 12), ["spouse", "Broadcom Inc. - Common Stock (AVGO)", "AVGO", "ST", "partial sale", "2026-09-24", "2026-10-02", 1001, 15000]);
  const kelly = await congressTrades(s, { member: "mike kelly", reports: 1 });
  assert.equal(kelly.transactions.rows[1][4], "California Cmnty Choice Fing A Sustainabl 5% due 9/1/36", "an asset's name continued on the next line");
  assert.deepEqual(kelly.transactions.rows[1].slice(10, 12), [50001, 100000]);
  const mu = await congressTrades(s, { member: "mcguire", ticker: "mu", reports: 1 });
  assert.deepEqual(mu.transactions.rows.map((t) => t[8]), ["2026-09-24", "2026-09-25", "2026-10-01"]);
  await assert.rejects(congressTrades(s, { member: "nobody at all" }), /No periodic transaction reports filed in 2026 by a member named like "nobody at all"/);
  assert.match(beyer.limits.join(" "), /unlawful to obtain or use these reports for a commercial purpose/);
});

test("market_calendar: Nasdaq's earnings, ex-dividend and split calendars, largest companies first, negatives read as negatives", async () => {
  const s = session();
  const big = await marketCalendar(s, { kind: "earnings", date: "2026-11-05", min_market_cap: 1e11 });
  assert.equal(big.count, 8);
  assert.deepEqual(big.rows[0], ["2026-11-05", "before the open", "COP", "ConocoPhillips", 176404398000, "Sep/2026", 3.06, 8, 1.61, "2025-11-06"]);
  const all = await marketCalendar(s, { kind: "earnings", date: "2026-11-05", limit: 500 });
  assert.equal(all.count, 613);
  assert.equal(all.truncated_to, 500);
  assert.deepEqual(all.rows.find((r) => r[2] === "NTRA").slice(6, 9), [-0.17, 4, -0.64], "a loss in parentheses is negative");
  const div = await marketCalendar(s, { kind: "dividends", date: "2026-11-05" });
  assert.deepEqual(div.rows[0], ["2026-11-05", "BMRC", "Bank of Marin Bancorp Common Stock", 0.25, 1, "2026-11-05", "2026-11-12", "2026-10-22"]);
  const splits = await marketCalendar(s, { kind: "splits", date: "2026-11-05" });
  assert.deepEqual(splits.rows.find((r) => r[0] === "SNDK"), ["SNDK", "Sandisk Corporation", "8:1", "2026-11-20"]);
  await assert.rejects(marketCalendar(s, { kind: "earnings", date: "2026-11-05", symbols: ["ZZZZ"] }), /None of ZZZZ is on Nasdaq's earnings calendar/);
});

test("price_history minute bars: stamped in the exchange's time on both sides of a daylight-saving change, and refused beyond what the source keeps", async () => {
  const at = Date.parse("2026-11-04T15:00:00Z");
  const chart = { chart: { result: [{ meta: { gmtoffset: -18000, exchangeTimezoneName: "America/New_York", currency: "USD", exchangeName: "NMS", instrumentType: "EQUITY" }, timestamp: [Date.parse("2026-10-30T13:30:00Z") / 1000, Date.parse("2026-11-02T14:30:00Z") / 1000], indicators: { quote: [{ open: [1, 2], high: [1, 2], low: [1, 2], close: [1, 2], volume: [10, 20] }], adjclose: [{ adjclose: [1, 2] }] } }], error: null } };
  const urls = [];
  const s = createSession({ fetchImpl: async (url) => { urls.push(String(url)); return new Response(JSON.stringify(chart)); }, now: () => at, env: {} });
  const r = await priceHistory(s, { symbol: "AAPL", interval: "5Min" });
  assert.deepEqual(r.dates, ["2026-10-30T09:30", "2026-11-02T09:30"], "09:30 in New York on Friday (daylight time) and Monday (standard time)");
  assert.match(urls[0], /interval=5m/);
  await assert.rejects(priceHistory(s, { symbol: "AAPL", interval: "1Min", start: "2026-09-01" }), /1Min bars go back 30 days on the keyless source; start on or after 2026-10-06/);
});

test("crypto_markets: the largest coins with the whole market, and coins named by symbol or id without a namesake's", async () => {
  const s = session();
  const top = await cryptoMarkets(s, { limit: 5 });
  assert.deepEqual(top.market, { total_value_usd: 2642537424592.25, change_24h_pct: -1.19, bitcoin_share_pct: 59.36, ether_share_pct: 10.69, coins_tracked: 22757 });
  assert.deepEqual(top.rows.map((r) => r[1]), ["BTC", "ETH", "USDT", "BNB", "XRP"]);
  assert.deepEqual(top.rows[0].slice(0, 3), [1, "BTC", "Bitcoin"]);
  const named = await cryptoMarkets(s, { coins: ["eth", "solana"] });
  assert.deepEqual(named.rows.map((r) => r[14]), ["ethereum", "solana"], "solana is the coin, not another whose symbol is SOLANA");
});
