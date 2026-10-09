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
  const t = calls.find((c) => c.url.includes("treasury.gov"));
  assert.equal(t.headers["User-Agent"], PLAIN_USER_AGENT);
  const range = await T.treasuryYields(s, { start: "2026-10-01", end: "2026-10-08" });
  assert.ok(range.rows.length >= 5 && range.rows[0][0] === "2026-10-01");
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

test("inputs are checked before any request", async () => {
  const { s, calls } = session();
  await assert.rejects(T.readFiling(s, { accession: "12345" }));
  await assert.rejects(T.insiderTrades(s, { company: "TSLA", since: "Sept 1" }));
  await assert.rejects(T.priceHistory(s, { symbol: "AAPL; rm -rf" }));
  assert.equal(calls.length, 0);
});
