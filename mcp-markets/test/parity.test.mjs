// factor_returns, treasury_cash, federal_budget and crypto_options on responses captured from Kenneth
// French's library, Fiscal Data and Deribit (scripts/capture-parity-fixtures.mjs), replayed with no network.
import assert from "node:assert/strict";
import test from "node:test";

import { cryptoOptions, parseInstrument } from "../src/deribit.mjs";
import { factorReturns, parseLibrary } from "../src/factors.mjs";
import { federalBudget, treasuryCash } from "../src/fiscal.mjs";
import { createSession } from "../src/sources.mjs";
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
