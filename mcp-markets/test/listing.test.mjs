import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ifrsDebtRows } from "../src/credit.mjs";
import { resultsFromText } from "../src/guidance.mjs";
import { asDollarShaped, factBook, isScaleSlip, priceToEarnings, ratioFromText } from "../src/listing.mjs";
import { createDiskCache, freshFor } from "../src/disk-cache.mjs";
import { releasesFrom, saysResults } from "../src/earnings.mjs";
import { choose, latestPrices, METRICS } from "../src/research.mjs";
import { splitTitle } from "../src/reports.mjs";
import { unitScale } from "../src/statements.mjs";
import { createSession, getText } from "../src/sources.mjs";

const named = "American Depositary Shares. American Depositary Shares. American Depositary Shares. ";

test("ratioFromText reads the ratio in the forms 20-Fs state it, and refuses to guess", () => {
  assert.equal(ratioFromText(`${named}Each ADS represents five (5) common shares.`).shares_per_listed_share, 5);
  assert.equal(ratioFromText(`${named}American Depositary Shares, each representing eight Ordinary Shares`).shares_per_listed_share, 8);
  assert.equal(ratioFromText(`${named}one American Depositary Share represents 10 shares of common stock`).shares_per_listed_share, 10);
  assert.equal(ratioFromText("Ordinary shares listed in New York as registry shares.").shares_per_listed_share, 1, "no depositary shares named");
  assert.equal(ratioFromText(`${named}The depositary holds them.`), null, "depositary shares named, no ratio stated");
  assert.equal(ratioFromText(`${named}Each ADS represents five shares. Each ADS represents two shares.`), null, "a tie is no answer");
});

test("the disk cache keeps public data between sessions, serves it fresh, and falls back when a source is down", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-disk-"));
  const url = "https://www.sec.gov/Archives/edgar/data/1/a/x.htm", key = url;
  const disk = createDiskCache({ dir });
  const now = Date.now();
  await disk.write(key, { at: now, text: "filing text", record: { sha256: "a", bytes: 11, retrieved_at: new Date(now).toISOString() } });
  let calls = 0;
  const session = createSession({ fetchImpl: async () => { calls += 1; throw new Error("no network"); }, env: {} });
  session.disk = disk;
  assert.equal(await getText(session, url), "filing text");
  assert.equal(calls, 0, "fresh on disk: no request");
  assert.equal(freshFor("https://query1.finance.yahoo.com/v8/finance/chart/AAPL"), 0, "prices are never kept");
  const stale = "https://data.sec.gov/submissions/CIK0000000001.json";
  await disk.write(stale, { at: now - 86400000, text: "{\"old\":true}", record: { sha256: "b", bytes: 12, retrieved_at: new Date(now - 86400000).toISOString() } });
  const quick = createSession({ fetchImpl: async () => { throw new Error("no network"); }, env: {}, sleep: async () => {} });
  quick.disk = disk;
  assert.equal(await getText(quick, stale), "{\"old\":true}", "a source that is down is answered from the older copy");
  rmSync(dir, { recursive: true, force: true });
});

test("a dollar translation in a 20-F does not stand in for the reporting currency", () => {
  const assets = { units: { TWD: [{ filed: "2025-04-17", end: "2024-12-31", val: 6000 }, { filed: "2024-04-01", end: "2023-12-31", val: 5000 }], USD: [{ filed: "2025-04-17", end: "2024-12-31", val: 200 }] } };
  const book = factBook({ facts: { "ifrs-full": { Assets: assets, CashAndCashEquivalents: { units: { TWD: [{ end: "2024-12-31", val: 2000 }], USD: [{ end: "2017-12-31", val: 1 }] } } } } });
  assert.equal(book.currency, "TWD");
  assert.deepEqual(asDollarShaped(book, { Cash: ["CashAndCashEquivalents"] }).Cash.units.USD, [{ end: "2024-12-31", val: 2000 }]);
});

test("IFRS debt: the filer's total where it gives one, else loans, bonds and the current portion", () => {
  const row = (val) => ({ units: { TWD: [{ end: "2024-12-31", val, form: "20-F", filed: "2025-04-17", fp: "FY" }] } });
  const tsmc = { currency: "TWD", facts: { LongtermBorrowings: row(31), NoncurrentPortionOfNoncurrentBondsIssued: row(926), CurrentPortionOfLongtermBorrowings: row(59), CurrentBondsIssuedAndCurrentPortionOfNoncurrentBondsIssued: row(57) } };
  assert.equal(ifrsDebtRows(tsmc)[0].val, 31 + 926 + 59, "the current bonds are inside the current portion");
  assert.equal(ifrsDebtRows({ currency: "TWD", facts: { Borrowings: row(100), LongtermBorrowings: row(90) } })[0].val, 100);
});

test("P/E survives a stock split that the last annual EPS predates, and a share count tagged in thousands is caught", () => {
  assert.equal(priceToEarnings({ price_per_share: 100, eps: 5, market_cap: 2000, net_income: 100 }), 20, "agreeing: price over EPS");
  assert.equal(priceToEarnings({ price_per_share: 150, eps: 165, market_cap: 113e9, net_income: 5.4e9 }), 113e9 / 5.4e9, "EPS from before a 25-for-1 split");
  assert.equal(priceToEarnings({ price_per_share: 100, eps: 5, market_cap: null, net_income: null }), 20);
  assert.equal(priceToEarnings({ price_per_share: 100, eps: -1, market_cap: 2000, net_income: -50 }), null, "no earnings, no P/E");
  assert.equal(priceToEarnings({ price_per_share: 120, eps: 2, market_cap: 5.7e9, net_income: 98000 }), 60, "profit in the proxy's thousands: the price stands");
  assert.ok(isScaleSlip(50000, 50e6));
  assert.ok(isScaleSlip(50e9, 50e6));
  assert.equal(isScaleSlip(50e6, 45e6), false);
  assert.equal(isScaleSlip(25e7, 1e7), false, "a 25-for-1 split is not a scale slip");
});

test("net income: a proxy's rounded figure gives way to the same line in dollars, and the first tag is kept otherwise", () => {
  const def = METRICS.net_income;
  assert.equal(choose(def, { NetIncomeLoss: { val: 3511 }, NetIncomeLossAvailableToCommonStockholdersBasic: { val: 3511400000 } }).val, 3511400000, "Arista");
  assert.equal(choose(def, { NetIncomeLoss: { val: 27900 }, ProfitLoss: { val: 27891000 } }).val, 27891000, "J.Jill");
  assert.equal(choose(def, { NetIncomeLoss: { val: 100 }, NetIncomeLossAvailableToCommonStockholdersBasic: { val: 90 }, ProfitLoss: { val: 110 } }).tag, "NetIncomeLoss", "preferred dividends and minorities are not a slip");
  assert.equal(choose(def, { NetIncomeLossAvailableToCommonStockholdersBasic: { val: 5404 } }).val, 5404, "only that line in the 10-K: Booking");
});

test("a 6-K is a results release when it opens by saying so, and not when it is a monthly sales report or a notice", () => {
  for (const yes of ["TSMC Reports Third Quarter EPS of NT$29", "ASML 2026 third-quarter results", "Financial Statements US GAAP Q2 2026", "filed a quarterly statement with Deutsche Boerse AG", "Alibaba Group Announces June Quarter 2026 Results", "Financial report for the period 1 January 2026 to 30 September 2026"]) assert.ok(saysResults(`<p>${yes}</p>`), yes);
  for (const no of ["TSMC September 2026 Revenue Report", "Notice of annual general meeting", "Transactions in own shares", "Shell plc Third Quarter 2026 Interim Dividend"]) assert.equal(saysResults(`<p>${no}</p>`), false, no);
});

test("a figure in New Taiwan dollars is not a figure in US dollars", () => {
  const rows = resultsFromText("Net income was NT$763.06 billion and diluted earnings per share were NT$29.43. Hong Kong revenue was HK$12 billion. Costs were $5 billion.");
  const units = rows.map((r) => r.unit).join(" | ");
  assert.match(units, /TWD/);
  assert.doesNotMatch(rows.filter((r) => r.value === 763.06).map((r) => r.unit).join(), /USD/);
});

test("units in a title with no currency code: NXP's two currencies", () => {
  assert.equal(splitTitle("CONSOLIDATED BALANCE SHEETS - € in Millions, $ in Millions").units, "€ in Millions, $ in Millions");
  assert.equal(unitScale(splitTitle("CONSOLIDATED BALANCE SHEETS - € in Millions, $ in Millions").units, "\\$"), 1e6);
});

test("latestPrices reads many tickers in batches, and leaves out what fails", async () => {
  const seen = [];
  const session = createSession({ env: {}, sleep: async () => {}, fetchImpl: async (url) => {
    seen.push(String(url));
    const symbols = decodeURIComponent(String(url).match(/symbols=([^&]+)/)[1]).split(",");
    return new Response(JSON.stringify({ spark: { result: symbols.filter((s) => s !== "GONE").map((s) => ({ symbol: s, response: [{ meta: { regularMarketPrice: 10, regularMarketTime: 1793304001 } }] })) } }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  const tickers = [...Array.from({ length: 45 }, (_, i) => `T${i}`), "GONE"];
  const p = await latestPrices(session, tickers);
  assert.equal(seen.length, 3, "20 to a request");
  assert.equal(p.size, 45);
  assert.equal(p.get("T3").price, 10);
  assert.equal(p.has("GONE"), false);
  await assert.rejects(latestPrices(createSession({ env: { CANLI_KEYLESS_PRICES: "0" }, fetchImpl: async () => { throw new Error("none"); } }), ["A"]), /prices/);
});

test("a company moved under a new holding company reads its XBRL from the old filer", async () => {
  const seen = [];
  const session = createSession({ env: {}, fetchImpl: async (url) => { seen.push(String(url)); return new Response("{}", { status: 200 }); } });
  await getText(session, "https://data.sec.gov/api/xbrl/companyfacts/CIK0002115436.json");
  assert.match(seen[0], /CIK0000034088/);
  await getText(session, "https://data.sec.gov/submissions/CIK0002115436.json");
  assert.match(seen[1], /submissions\/CIK0002115436/, "its filings stay its own");
});

test("factBook takes the taxonomy of the latest balance sheet and its currency", () => {
  const row = (filed, end = "2025-12-31") => ({ filed, end, val: 1 });
  assert.deepEqual((({ taxonomy, currency }) => ({ taxonomy, currency }))(factBook({ facts: { "ifrs-full": { Assets: { units: { TWD: [row("2025-04-17")] } } } } })), { taxonomy: "ifrs-full", currency: "TWD" });
  const moved = factBook({ facts: { "us-gaap": { Assets: { units: { USD: [row("2020-06-01", "2020-03-31")] } } }, "ifrs-full": { Assets: { units: { JPY: [row("2026-06-01")] } } } } });
  assert.equal(moved.taxonomy, "ifrs-full");
  assert.equal(factBook({ facts: { "us-gaap": { Assets: { units: { USD: [row("2026-02-01")] } } } } }).currency, "USD");
});

test("an interim Item 2.02 8-K is not a quarter's results: Tesla's deliveries", () => {
  const k = (filingDate, accessionNumber) => ({ form: "8-K", items: "2.02,9.01", filingDate, accessionNumber, primaryDocument: "x.htm" });
  const q = (filingDate) => ({ form: "10-Q", items: "", filingDate, accessionNumber: `q-${filingDate}`, primaryDocument: "q.htm" });
  const rel = releasesFrom([k("2025-04-02", "deliveries-q1"), k("2025-04-22", "q1"), q("2025-04-23"), k("2025-07-02", "deliveries-q2"), k("2025-07-23", "q2"), q("2025-07-24"), k("2025-10-02", "deliveries-q3")]);
  assert.deepEqual(rel.map((r) => r.accession), ["q1", "q2"], "20 days apart, 21 days apart, and an early one with the quarter's report yet to come");
  assert.deepEqual(rel.map((r) => r.date), ["2025-04-22", "2025-07-23"]);
});
