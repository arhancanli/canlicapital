// The tools against real SEC, Treasury and FRED responses (test/fixtures, captured by
// scripts/capture-fixtures.mjs). Expected values are read off the filings themselves.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession, DEFAULT_USER_AGENT, PLAIN_USER_AGENT } from "../src/sources.mjs";
import * as T from "../src/tools.mjs";
import { NOW, replayFetch } from "./replay.mjs";

function session(extra, env = {}) {
  const r = replayFetch(extra);
  const s = createSession({ fetchImpl: r.fetchImpl, env, now: () => NOW, sleep: async () => {} });
  return { s, calls: r.calls };
}

test("company_profile: Apple by ticker, with its fiscal year end and latest filings", async () => {
  const { s } = session();
  const p = await T.companyProfile(s, { company: "aapl" });
  assert.equal(p.cik, 320193);
  assert.equal(p.ticker, "AAPL");
  assert.equal(p.fiscal_year_end, "09-26");
  assert.equal(p.latest_10k.accession, "0000320193-25-000079");
  assert.match(p.latest_10k.url, /aapl-20250927\.htm$/);
});

test("read_filing: Apple's 10-K items, and Item 1A on its own", async () => {
  const { s } = session();
  const all = await T.readFiling(s, { company: "AAPL", max_chars: 1000 });
  const items = new Map(all.sections.rows.map((r) => [r[0], r]));
  for (const k of ["1", "1A", "1C", "7", "7A", "8", "9A", "16"]) assert.ok(items.has(k), `item ${k}`);
  assert.ok(items.get("1A")[2] > 50000 && items.get("7")[2] > 10000);
  const risk = await T.readFiling(s, { company: "AAPL", section: "risk factors", max_chars: 2000 });
  assert.equal(risk.section.item, "1A");
  assert.match(risk.text, /^Item 1A\. Risk Factors\n/);
  assert.equal(risk.next_offset, 2000);
  assert.ok(!/Item 1B\. Unresolved/.test(risk.text));
  const more = await T.readFiling(s, { company: "AAPL", section: "1A", offset: risk.total_chars - 300 });
  assert.equal(more.next_offset, undefined);
  for (const q of ["income statement", "8 Financial Statements and Supplementary Data", "Item 8"]) assert.equal((await T.readFiling(s, { company: "AAPL", section: q, max_chars: 500 })).section.item, "8", q);
  const mda = await T.readFiling(s, { company: "AAPL", section: "md&a", max_chars: 500 });
  assert.equal(mda.section.item, "7");
  await assert.rejects(T.readFiling(s, { company: "AAPL", section: "nothing like this" }), /No item matching/);
  const emp = await T.readFiling(s, { company: "AAPL", find: "full-time employees" });
  assert.match(emp.matches[0].text, /approximately [\d,]+ full-time equivalent employees/);
  assert.equal(emp.text, undefined);
  const full = await T.readFiling(s, { company: "AAPL", max_chars: 100000 });
  const again = await T.readFiling(s, { company: "AAPL", offset: emp.matches[0].offset, max_chars: 600 });
  assert.equal(again.text, full.text.slice(emp.matches[0].offset, emp.matches[0].offset + 600));
  for (let i = 1; i < emp.matches.length; i++) assert.ok(emp.matches[i].offset >= emp.matches[i - 1].offset + emp.matches[i - 1].text.length);
  const none = await T.readFiling(s, { company: "AAPL", section: "1A", find: "zebra unicorn" });
  assert.match(none.matches, /no passage/);
});

test("read_filing: an 8-K's press release by exhibit type, with the filing's documents listed", async () => {
  const { s } = session();
  const r = await T.readFiling(s, { company: "TSLA", form: "8-K", document: "EX-99.1" });
  assert.equal(r.filing.accession, "0001628280-26-064366");
  assert.match(r.text, /delivered over 486,000 vehicles/);
  assert.ok(r.documents.rows.some((d) => d[1] === "EX-99.1"));
});

test("insider_trades: Tesla's CFO sale, read from the Form 4", async () => {
  const { s } = session();
  const r = await T.insiderTrades(s, { company: "TSLA", since: "2026-09-01", codes: ["S"] });
  const sale = r.rows.find((x) => x[0] === "2026-09-08");
  const col = Object.fromEntries(r.columns.map((c, i) => [c, sale[i]]));
  assert.equal(col.insider, "Taneja Vaibhav");
  assert.equal(col.role, "Chief Financial Officer");
  assert.equal(col.shares, 2605.75);
  assert.equal(col.price, 360.134);
  assert.equal(col.acq_disp, "D");
  assert.equal(r.summary.open_market_purchases.transactions, 0);
  assert.ok(r.rows.every((x) => x[3] === "S"));
});

test("fund_holdings: Berkshire's 13F by name; totals match the cover page; quarter-on-quarter changes", async () => {
  const { s } = session();
  const r = await T.fundHoldings(s, { manager: "Berkshire Hathaway", top: 5 });
  assert.equal(r.manager.cik, 1067983);
  assert.equal(r.period, "2026-06-30");
  assert.equal(r.total_value, 299253556246);
  assert.equal(r.entries_total, 89);
  assert.equal(r.positions_total, 29);
  assert.equal(r.rows_shown, 5);
  assert.equal(r.matches_cover_page, true);
  assert.equal(r.rows[0][0], "APPLE INC");
  assert.ok(Math.abs(r.rows.reduce((s2, x) => s2 + x[6], 0) - r.rows.reduce((s2, x) => s2 + x[4], 0) / r.total_value) < 1e-3);
  assert.equal(r.changes_since.period, "2026-03-31");
  assert.equal(r.changes_since.counts.new, 1);
  assert.equal(r.changes_since.counts.exited, 1);
  assert.ok(r.changes_since.rows.some((c) => c[0] === "exited" && /CONSTELLATION/.test(c[1])));
});

test("search_filings: EDGAR full-text search with forms and dates", async () => {
  const { s } = session();
  const r = await T.searchFilings(s, { query: "\"agentic AI\"", forms: ["10-K"], since: "2026-01-01", limit: 3 });
  assert.ok(r.total > 100);
  assert.equal(r.rows.length, 3);
  assert.ok(r.rows.every((x) => x[1] === "10-K" && x[0] >= "2026-01-01" && /^https:\/\/www\.sec\.gov\/Archives\//.test(x[6])));
});

test("treasury_yields: the latest par curve, from the Treasury, with a plain User-Agent", async () => {
  const { s, calls } = session();
  const r = await T.treasuryYields(s, {});
  assert.equal(r.date, "2026-10-08");
  const ten = r.columns.indexOf("10 Yr");
  assert.equal(r.rows[0][ten], 5.22);
  assert.equal(r.yields["10 Yr"], 5.22);
  assert.equal(r.yields["2 Yr"], 4.75);
  assert.equal(r.spreads_points["10Y-2Y"], 0.47);
  const t = calls.find((c) => new URL(c.url).host === "home.treasury.gov");
  assert.equal(t.headers["User-Agent"], PLAIN_USER_AGENT);
  const range = await T.treasuryYields(s, { start: "2026-10-01", end: "2026-10-08" });
  assert.ok(range.rows.length >= 5 && range.rows[0][0] === "2026-10-01");
});

test("treasury_yields: years with different maturities join by name, in maturity order", () => {
  const newer = { header: ["Date", "1 Mo", "1.5 Month", "2 Mo", "4 Mo", "10 Yr"], rows: [["2025-03-03", 4.3, 4.31, 4.32, 4.33, 4.2]] };
  const older = { header: ["Date", "1 Mo", "2 Mo", "10 Yr", "30 Yr"], rows: [["2021-10-01", 0.08, 0.04, 1.48, 2.04]] };
  const { names, rows } = T.joinYears([newer, older]);
  assert.deepEqual(names, ["1 Mo", "1.5 Month", "2 Mo", "4 Mo", "10 Yr", "30 Yr"]);
  assert.deepEqual(rows[0], ["2021-10-01", 0.08, null, 0.04, null, 1.48, 2.04]);
  assert.deepEqual(rows[1], ["2025-03-03", 4.3, 4.31, 4.32, 4.33, 4.2, null]);
});

test("economic_series: CPI year over year from words; values line up with dates", async () => {
  const { s } = session();
  const r = await T.economicSeries(s, { series: "cpi inflation", transform: "yoy", start: "2025-01-01" });
  assert.equal(r.series, "CPIAUCSL");
  assert.match(r.title, /Consumer Price Index/);
  assert.equal(r.dates.length, r.values.length);
  assert.equal(r.dates[0], "2025-01-01");
  assert.ok(r.values.every((v) => v > -0.05 && v < 0.15));
});

test("price_history: keyless from Yahoo, adjusted, with dividends; off with CANLI_KEYLESS_PRICES=0", async () => {
  const { s } = session();
  const r = await T.priceHistory(s, { symbol: "AAPL", start: "2025-01-01", end: "2026-10-08" });
  assert.equal(r.source, "Yahoo Finance chart data (no key)");
  assert.equal(r.dates.at(-1), "2026-10-08");
  assert.equal(r.close.at(-1), 340.42);
  assert.ok(r.count > 400 && r.close.length === r.count && r.open.length === r.count);
  assert.ok(r.dividends.length >= 6 && r.dividends.every(([d, a]) => d >= "2025-01-01" && a > 0));
  // Before the last dividend, adjusted closes sit below the split-adjusted closes.
  const raw = await T.priceHistory(s, { symbol: "AAPL", start: "2025-01-01", end: "2026-10-08", adjusted: false });
  assert.ok(r.close[0] < raw.close[0] && r.close.at(-1) === raw.close.at(-1));
  assert.ok(r.high.every((h, i) => h >= r.low[i]));
  // Total return from dividend-adjusted closes, whether or not adjusted bars were asked for.
  assert.ok(Math.abs(r.change.total_return - (r.close.at(-1) / r.close[0] - 1)) < 1e-6);
  assert.equal(raw.change.total_return, r.change.total_return);
  assert.ok(raw.change.price_return < raw.change.total_return);
  const wr = await T.priceHistory(s, { symbol: "AAPL", start: "2025-01-01", end: "2026-10-08", returns: true });
  assert.equal(wr.returns.length, wr.count - 1);
  assert.equal(wr.returns_dates[0], wr.dates[1]);
  assert.ok(Math.abs(wr.returns[0] - (wr.close[1] / wr.close[0] - 1)) < 1e-9);
  const off = session({}, { CANLI_KEYLESS_PRICES: "0" });
  await assert.rejects(T.priceHistory(off.s, { symbol: "AAPL" }), /CANLI_KEYLESS_PRICES=0/);
});

test("price_history as traded: NVIDIA around its 10-for-1 split, every price, volume and dividend as it was; changes from split-adjusted closes", async () => {
  const { s, calls } = session();
  const w = { symbol: "NVDA", start: "2024-03-01", end: "2024-06-14" };
  const traded = await T.priceHistory(s, { ...w, adjustment: "none", returns: true });
  const splits = await T.priceHistory(s, { ...w, adjustment: "splits", returns: true });
  const all = await T.priceHistory(s, w);
  const at = (r, d, k = "close") => r[k][r.dates.indexOf(d)];
  assert.deepEqual([traded.adjusted, traded.adjustment, splits.adjusted, splits.adjustment, all.adjusted, all.adjustment], [false, "none", false, "splits", true, "all"]);
  assert.deepEqual(traded.splits, [["2024-06-10", "10:1"]]);
  assert.equal(traded.later_splits, undefined, "no split after the window, read up to today");
  assert.ok(calls.some((c) => c.url.includes("interval=1mo")), "the splits after the window were asked for");
  // The Friday before the split traded at $1,208.88 on 41.2 million shares; Yahoo keeps it as 120.888 on 412 million.
  assert.deepEqual([at(traded, "2024-06-07"), at(splits, "2024-06-07"), at(all, "2024-06-07")], [1208.88, 120.888, 120.5443]);
  assert.deepEqual([at(traded, "2024-06-07", "volume"), at(splits, "2024-06-07", "volume")], [41238600, 412386000]);
  assert.deepEqual([at(traded, "2024-06-10"), at(splits, "2024-06-10")], [121.79, 121.79]);
  assert.deepEqual(traded.dividends, [["2024-03-05", 0.04], ["2024-06-11", 0.01]], "March's dividend as paid, before the split");
  // A split is not a loss: price changes and returns come from the split-adjusted closes either way.
  assert.deepEqual([traded.change.price_return, splits.change.price_return], [0.60283912, 0.60283912]);
  assert.deepEqual(traded.returns, splits.returns);
  assert.equal(traded.returns[traded.returns_dates.indexOf("2024-06-10")], 0.0074614519);
  assert.equal((await T.priceHistory(s, { ...w, adjusted: false })).adjustment, "none", "adjusted: false is as traded on every source");
  await assert.rejects(T.priceHistory(s, { ...w, adjusted: false, adjustment: "all" }), /disagree/);
});

test("price_history with Tiingo: as traded, or split-adjusted from Tiingo's split factors", async () => {
  // A 2-for-1 split on 10 June: Tiingo gives prices as traded with the split's factor on its date.
  const day = (date, o, h, l, c, v, splitFactor = 1) => ({ date: `${date}T00:00:00.000Z`, open: o, high: h, low: l, close: c, volume: v, adjOpen: null, adjHigh: null, adjLow: null, adjClose: null, adjVolume: null, splitFactor });
  const url = "https://api.tiingo.com/tiingo/daily/XYZ/prices?startDate=2024-06-06&endDate=2024-06-10&resampleFreq=daily";
  const { s } = session({ [url]: [day("2024-06-06", 100, 102, 99, 101, 1000), day("2024-06-07", 101, 104, 100, 103, 1200), day("2024-06-10", 52, 53, 51, 52.5, 2600, 2)] }, { TIINGO_API_KEY: "k" });
  const w = { symbol: "XYZ", start: "2024-06-06", end: "2024-06-10" };
  const traded = await T.priceHistory(s, { ...w, adjustment: "none", returns: true });
  assert.deepEqual([traded.close, traded.volume], [[101, 103, 52.5], [1000, 1200, 2600]]);
  assert.deepEqual([traded.change.price_return, traded.returns], [0.03960396, [0.0198019802, 0.0194174757]], "from 50.5, 51.5 and 52.5: the split is not a loss");
  const split = await T.priceHistory(s, { ...w, adjustment: "splits" });
  assert.deepEqual([split.close, split.open, split.volume], [[50.5, 51.5, 52.5], [50, 50.5, 52], [2000, 2400, 2600]]);
  assert.equal(split.change.price_return, traded.change.price_return);
});

test("price_history: with Alpaca keys the key stays in headers", async () => {
  const { s } = session();
  void s;
  const url = "https://data.alpaca.markets/v2/stocks/bars?symbols=AAPL&timeframe=1Day&start=2026-10-01&end=2026-10-03&adjustment=all&feed=iex&limit=10000&sort=asc";
  const bars = { bars: { AAPL: [{ t: "2026-10-01T04:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }, { t: "2026-10-02T04:00:00Z", o: 1.5, h: 2.5, l: 1, c: 2, v: 20 }] }, next_page_token: null };
  const k = session({ [url]: bars }, { ALPACA_PAPER_KEY_ID: "PKSECRETID", ALPACA_PAPER_SECRET_KEY: "SECRETVALUE" });
  const r = await T.priceHistory(k.s, { symbol: "aapl", start: "2026-10-01", end: "2026-10-03" });
  assert.deepEqual(r.close, [1.5, 2]);
  assert.deepEqual(r.dates, ["2026-10-01", "2026-10-02"]);
  assert.ok(!k.calls[0].url.includes("SECRET"));
  assert.equal(k.calls[0].headers["APCA-API-SECRET-KEY"], "SECRETVALUE");
  const bad = session({}, { TIINGO_API_KEY: "TOKSECRET" });
  await assert.rejects(T.priceHistory(bad.s, { symbol: "AAPL" }), (e) => !e.message.includes("TOKSECRET"));
});

test("SEC requests carry the identifying User-Agent and are spaced at least 125 ms apart", async () => {
  const waits = [];
  let clock = NOW;
  const r = replayFetch();
  const s = createSession({ fetchImpl: r.fetchImpl, env: {}, now: () => clock, sleep: async (ms) => { waits.push(ms); } });
  await Promise.all([T.companyProfile(s, { company: "AAPL" }), T.companyProfile(s, { company: "TSLA" }), T.companyProfile(s, { company: "BRK-B" })]);
  assert.ok(r.calls.every((c) => c.headers["User-Agent"] === DEFAULT_USER_AGENT));
  assert.ok(waits.length >= 2 && waits.every((w) => w >= 125 && w % 125 === 0), JSON.stringify(waits));
  void clock;
});

test("SEC_USER_AGENT replaces the default for SEC", async () => {
  const r = replayFetch();
  const s = createSession({ fetchImpl: r.fetchImpl, env: { SEC_USER_AGENT: "Jane Doe jane@example.com" }, now: () => NOW, sleep: async () => {} });
  await T.companyProfile(s, { company: "AAPL" });
  assert.ok(r.calls.every((c) => c.headers["User-Agent"] === "Jane Doe jane@example.com"));
});

test("html: a row of thousands of empty cells is cleaned in linear time (it once backtracked exponentially)", async () => {
  const { htmlToText } = await import("../src/html.mjs");
  const t0 = Date.now();
  assert.equal(htmlToText(`<table><tr>${"<td> </td>".repeat(5000)}<td>x</td><td></td><td>y</td></tr></table>`), "x | y");
  assert.ok(!/[<>]/.test(htmlToText("<p>a <scr<script>x</script>ipt>alert(1)</scr</script>ipt> b</p>")));
  assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
});

test("inputs are checked before any request", async () => {
  const { s, calls } = session();
  await assert.rejects(T.readFiling(s, { accession: "12345" }));
  await assert.rejects(T.insiderTrades(s, { company: "TSLA", since: "Sept 1" }));
  await assert.rejects(T.priceHistory(s, { symbol: "AAPL; rm -rf" }));
  assert.equal(calls.length, 0);
});
