// Research tools: screens and the company report against real SEC frames and filings (replayed,
// cut to 20 companies); the event study against synthetic prices whose abnormal returns are known;
// mentions_trend's buckets; retries of momentary server errors.
import assert from "node:assert/strict";
import test from "node:test";

import * as R from "../src/research.mjs";
import { createSession, getText } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = (fetchImpl) => createSession({ fetchImpl: fetchImpl ?? replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
const col = (r, name) => r.columns.indexOf(name);

test("screen_companies: ranks the market, holds out a tagging slip, and lists its sources", async () => {
  const r = await R.screenCompanies(session(), { filters: [{ metric: "revenue", op: ">", value: 1e10 }], sort_by: "net_margin", limit: 5 });
  assert.equal(r.period, "FY2025 (calendar frame CY2025)");
  assert.equal(r.rows[0][col(r, "ticker")], "NVDA");
  for (const row of r.rows) assert.ok(row[col(r, "revenue")] > 1e10);
  const margins = r.rows.map((row) => row[col(r, "net_margin")]);
  assert.deepEqual(margins, [...margins].sort((a, b) => b - a));
  // Medline tagged 2025 net income as $1,157,000,000,000: held out, with the reason.
  assert.ok(r.held_out.rows.some((h) => h[0] === "MDLN" && /3 times assets/.test(h[3])));
  assert.ok(!r.rows.some((row) => row[0] === "MDLN"));
  const kept = await R.screenCompanies(session(), { filters: [{ metric: "revenue", op: ">", value: 1e10 }], sort_by: "net_margin", limit: 5, include_suspect: true });
  assert.equal(kept.rows[0][0], "MDLN");
  assert.ok(r.sources.every((u) => u.startsWith("https://data.sec.gov/api/xbrl/frames/")));
});

test("screen_companies: R&D takes the larger of the filer's R&D tags; growth uses the prior-year frame", async () => {
  const s = session();
  const rd = await R.screenCompanies(s, { filters: [{ metric: "revenue", op: ">", value: 5e10 }], sort_by: "rd_intensity", limit: 20 });
  const jnj = rd.rows.find((row) => row[0] === "JNJ");
  assert.ok(Math.abs(jnj[col(rd, "rd_intensity")] - 14665e6 / jnj[col(rd, "revenue")]) < 1e-6, JSON.stringify(jnj));
  const g = await R.screenCompanies(s, { filters: [{ metric: "revenue_growth", op: ">", value: 0.5 }, { metric: "revenue", op: ">", value: 1e9 }], limit: 5 });
  assert.equal(g.rows[0][0], "QXO");
  assert.ok(g.rows[0][col(g, "revenue_growth")] > 100);
  assert.ok(g.sources.some((u) => u.includes("/CY2024.json")));
  await assert.rejects(R.screenCompanies(s, { sort_by: "pe" }), /Valuation metrics need a price/);
  await assert.rejects(R.screenCompanies(s, { period: "2025" }), /not like FY2025/);
});

test("screen_companies valuation: price, market cap, P/E and P/S agree with each other", async () => {
  const r = await R.screenCompanies(session(), { filters: [{ metric: "revenue", op: ">", value: 1e11 }], limit: 3, valuation: true });
  const v = r.valuation, c = (name) => v.columns.indexOf(name);
  assert.equal(v.rows.length, 3);
  for (const row of v.rows) {
    const rev = r.rows.find((x) => x[0] === row[0])[col(r, "revenue")];
    assert.ok(row[c("price")] > 0 && row[c("price_date")] <= "2026-10-09");
    if (row[c("market_cap")] && row[c("ps")]) assert.ok(Math.abs(row[c("ps")] * rev / row[c("market_cap")] - 1) < 0.01, JSON.stringify(row));
  }
});

test("company_report: Apple's fiscal 2025 from its 10-K facts, valuation from the latest close", async () => {
  const r = await R.companyReport(session(), { company: "AAPL" });
  const f = r.financials, last = f.rows.at(-1), c = (name) => f.columns.indexOf(name);
  assert.equal(last[c("fiscal_year_end")], "2025-09-27");
  assert.equal(last[c("revenue")], 416161000000);
  assert.equal(last[c("eps_diluted")], 7.46);
  assert.ok(Math.abs(last[c("revenue_growth")] - (416161 / 391035 - 1)) < 1e-6);
  assert.equal(f.rows.length, 5);
  assert.equal(r.market.price, 340.42);
  assert.equal(r.market.pe, Math.round((340.42 / 7.46) * 100) / 100);
  assert.equal(r.market.market_cap, Math.round(340.42 * r.market.shares_outstanding));
  assert.ok(r.market.beta_1y_vs_spy > 0 && r.market.volatility_1y > 0 && r.market.max_drawdown_1y <= 0);
  assert.ok(r.recent_filings.rows.length > 0);
});

// Synthetic prices: the market follows a fixed wave, the stock 1.4 times it plus small noise, and
// +5% on each event day; the study must find beta near 1.4 and abnormal returns near 5%.
function syntheticChart(url) {
  const u = new URL(url), sym = decodeURIComponent(u.pathname.split("/").pop());
  const p1 = Number(u.searchParams.get("period1")), p2 = Number(u.searchParams.get("period2"));
  const jumps = new Set(["2025-03-03", "2025-06-02", "2025-09-02"]);
  const ts = [], close = [];
  let m = 100, s = 50, i = 0;
  for (let t = Date.UTC(2023, 0, 2, 13, 30) / 1000; t <= p2; t += 86400) {
    const d = new Date(t * 1000), wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    i++;
    const mr = 0.004 * Math.sin(0.7 * i) + 0.003 * Math.cos(1.3 * i);
    const date = d.toISOString().slice(0, 10);
    const sr = 0.0003 + 1.4 * mr + 0.002 * Math.sin(2.1 * i + 1) + (jumps.has(date) ? 0.05 : 0);
    m *= 1 + mr; s *= 1 + sr;
    if (t < p1) continue;
    ts.push(t); close.push(sym === "SPY" ? m : s);
  }
  return { chart: { result: [{ meta: { currency: "USD", gmtoffset: -14400, exchangeName: "X" }, timestamp: ts, indicators: { quote: [{ open: close, high: close, low: close, close, volume: close.map(() => 1000) }], adjclose: [{ adjclose: close }] }, events: {} }], error: null } };
}
const chartFetch = async (url) => (url.includes("query1.finance.yahoo.com/v8/finance/chart/") ? new Response(JSON.stringify(syntheticChart(url)), { status: 200 }) : new Response("not here", { status: 404 }));

test("event_study: recovers a known 5% abnormal return and the market beta", async () => {
  const r = await R.eventStudy(session(chartFetch), { symbol: "TEST", events: ["2025-03-01", "2025-06-02", "2025-09-02"], window: [0, 0] });
  const ev = r.events, c = (name) => ev.columns.indexOf(name);
  // 2025-03-01 is a Saturday: day 0 is Monday 2025-03-03.
  assert.deepEqual(ev.rows.map((x) => x[c("day0")]), ["2025-03-03", "2025-06-02", "2025-09-02"]);
  for (const x of ev.rows) {
    assert.ok(Math.abs(x[c("car")] - 0.05) < 0.006, `car ${x[c("car")]}`);
    assert.ok(Math.abs(x[c("beta")] - 1.4) < 0.15, `beta ${x[c("beta")]}`);
  }
  assert.ok(Math.abs(r.summary.mean_car - 0.05) < 0.005);
  assert.ok(r.summary.p_value < 0.01 && r.summary.positive_share === 1);
  const wide = await R.eventStudy(session(chartFetch), { symbol: "TEST", events: ["2025-06-02"], window: [-2, 3], model: "market_adjusted" });
  assert.equal(wide.average_path.rows.length, 6);
  assert.equal(wide.summary.t_stat, null);
  await assert.rejects(R.eventStudy(session(chartFetch), { symbol: "TEST" }), /Give events/);
});

test("tTwoSided matches scipy's Student t to 1e-9", () => {
  for (const [t, df, p] of [[2.0, 10, 0.0733880347707], [-2.5, 7, 0.0409922185858], [4.2, 120, 5.15474667081e-5], [8.0, 3, 0.00407657758779]]) assert.ok(Math.abs(R.tTwoSided(t, df) - p) / p < 1e-9, `${t} ${df}`);
});

test("mentions_trend: calendar quarters, counts per quarter, capped counts marked", async () => {
  const calls = [];
  const fake = async (url) => {
    const u = new URL(url); calls.push(u);
    const q = Number(u.searchParams.get("startdt").slice(5, 7));
    const value = q === 10 ? 10000 : q * 10;
    return new Response(JSON.stringify({ hits: { total: { value, relation: q === 10 ? "gte" : "eq" }, hits: [{ _source: { ciks: ["0000000001"] } }] } }), { status: 200 });
  };
  const r = await R.mentionsTrend(session(fake), { query: "tariffs", start: "2025-02-15", end: "2025-12-31" });
  assert.deepEqual(r.rows.map((x) => x[0]), ["2025Q1", "2025Q2", "2025Q3", "2025Q4"]);
  assert.deepEqual(r.rows.map((x) => [x[1], x[2]]), [["2025-02-15", "2025-03-31"], ["2025-04-01", "2025-06-30"], ["2025-07-01", "2025-09-30"], ["2025-10-01", "2025-12-31"]]);
  assert.deepEqual(r.rows.map((x) => x[3]), [20, 40, 70, 10000]);
  assert.equal(r.rows[3][4], true);
  assert.equal(calls[0].searchParams.get("forms"), "10-K,10-Q");
  await assert.rejects(R.mentionsTrend(session(fake), { query: "x", start: "2000-01-01", end: "2026-01-01", by: "month" }), /too many/);
});

test("server errors are retried twice, then reported", async () => {
  let n = 0;
  const flaky = async () => (++n === 1 ? new Response("busy", { status: 500 }) : new Response("ok", { status: 200 }));
  assert.equal(await getText(session(flaky), "https://efts.sec.gov/LATEST/search-index?q=x"), "ok");
  assert.equal(n, 2);
  let m = 0;
  const down = async () => { m++; return new Response("down", { status: 503 }); };
  await assert.rejects(getText(session(down), "https://efts.sec.gov/LATEST/search-index?q=y"), /returned HTTP 503/);
  assert.equal(m, 3);
  let k = 0;
  const missing = async () => { k++; return new Response("no", { status: 404 }); };
  await assert.rejects(getText(session(missing), "https://data.sec.gov/x.json"), /was not found/);
  assert.equal(k, 1);
});

test("choose: within a group the larger tag, and growth compares a tag with itself (BlackRock 2024-25)", () => {
  const rev = R.METRICS.revenue;
  const y2024 = { Revenues: { val: 12794e6 }, RevenueFromContractWithCustomerExcludingAssessedTax: { val: 20407e6 } };
  const y2025 = { RevenueFromContractWithCustomerExcludingAssessedTax: { val: 24216e6 } };
  assert.equal(R.choose(rev, y2024).val, 20407e6);
  const now = R.choose(rev, y2025);
  assert.equal(now.tag, "RevenueFromContractWithCustomerExcludingAssessedTax");
  assert.equal(R.choose(rev, y2024, now.tag).val, 20407e6);
  // The tax-inclusive tag only when nothing else is reported.
  assert.equal(R.choose(rev, { RevenueFromContractWithCustomerIncludingAssessedTax: { val: 80e9 }, Revenues: { val: 37e9 } }).val, 37e9);
  assert.equal(R.choose(rev, { RevenueFromContractWithCustomerIncludingAssessedTax: { val: 80e9 } }).val, 80e9);
  assert.equal(R.choose(rev, {}), null);
  // A tag exactly 1,000 times another is a scale slip, not a larger line (Tigo Energy, 2025).
  assert.equal(R.choose(rev, { Revenues: { val: 103536000 }, RevenueFromContractWithCustomerExcludingAssessedTax: { val: 103536000000 } }).val, 103536000);
  // A real 134-fold gap keeps the larger (J&J's R&D tags, 2025).
  assert.equal(R.choose(R.METRICS.rd_expense, { ResearchAndDevelopmentExpense: { val: 109e6 }, ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost: { val: 14665e6 } }).val, 14665e6);
});
