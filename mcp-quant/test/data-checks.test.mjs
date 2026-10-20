// The data checks find what was planted and stay quiet on clean data.
import assert from "node:assert/strict";
import test from "node:test";

import { runTool } from "../src/registry.mjs";
import { bsm } from "../src/tools/options.mjs";

const walk = (n, seed = 1) => {
  let s = seed, p = 100;
  const out = [];
  for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; p *= 1 + ((s / 2147483647) - 0.5) * 0.02; out.push(Number(p.toFixed(4))); }
  return out;
};
const checks = (r) => Object.keys(r.counts);

test("price series: clean walk is clean; a split, a stale run and bad dates are found", () => {
  const p = walk(300);
  assert.equal(runTool("check_price_series", { prices: p }).clean, true);
  const bad = [...p];
  for (let i = 150; i < 300; i++) bad[i] = p[i] / 2;
  for (let i = 50; i < 57; i++) bad[i] = bad[49];
  bad[10] = -1;
  const dates = p.map((_, i) => new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  dates[20] = dates[19];
  const r = runTool("check_price_series", { prices: bad, dates });
  for (const k of ["suspected_split", "stale_prices", "non_positive_price", "duplicate_timestamp"]) assert.ok(checks(r).includes(k), `${k} in ${checks(r)}`);
});

test("OHLC: impossible bars are errors", () => {
  const r = runTool("check_ohlc_bars", { open: [10, 10.2, 10.1], high: [10.5, 10.1, 10.4], low: [9.8, 10.0, 10.5], close: [10.2, 10.05, 10.3], volume: [100, -5, 50] });
  for (const k of ["high_below_body", "low_above_body", "low_above_high", "negative_volume"]) assert.ok(checks(r).includes(k), k);
});

test("option chain: model prices are clean; a butterfly break and a parity break are found", () => {
  const S = 100, T = 0.5, r = 0.03, v = 0.25, strikes = [80, 90, 95, 100, 105, 110, 120];
  const quotes = strikes.flatMap((K) => ["call", "put"].map((type) => { const p = bsm({ type, spot: S, strike: K, years: T, rate: r, volatility: v }).price; return { strike: K, type, bid: Number((p - 0.02).toFixed(4)), ask: Number((p + 0.02).toFixed(4)) }; }));
  const clean = runTool("check_option_chain", { spot: S, years: T, rate: r, quotes });
  assert.equal(clean.errors, 0, JSON.stringify(clean.issues));
  const broken = quotes.map((q) => (q.strike === 100 && q.type === "call" ? { ...q, bid: q.bid + 3, ask: q.ask + 3 } : q));
  const rep = runTool("check_option_chain", { spot: S, years: T, rate: r, quotes: broken });
  for (const k of ["butterfly_arbitrage", "put_call_parity"]) assert.ok(checks(rep).includes(k), `${k} in ${checks(rep)}`);
  const vert = quotes.map((q) => (q.strike === 110 && q.type === "put" ? { ...q, bid: 1, ask: 1.05 } : q));
  assert.ok(checks(runTool("check_option_chain", { spot: S, years: T, rate: r, quotes: vert })).includes("vertical_arbitrage"));
});

test("yield curve: a kink and a negative forward are flagged", () => {
  const r = runTool("check_yield_curve", { years: [1, 2, 3, 5, 7, 10], zero_rates: [0.04, 0.041, 0.06, 0.042, 0.043, 0.02] });
  for (const k of ["kink", "negative_forward"]) assert.ok(checks(r).includes(k), k);
  assert.equal(runTool("check_yield_curve", { years: [1, 2, 3, 5], zero_rates: [0.04, 0.041, 0.042, 0.043] }).clean, true);
});

test("funding: a breach of the cap and an irregular interval are flagged", () => {
  const f = Array.from({ length: 30 }, (_, i) => 0.0001 + (i % 3) * 0.00001);
  f[12] = 0.02;
  const ts = f.map((_, i) => (1_700_000_000 + i * 8 * 3600) * 1000);
  ts[20] += 3600 * 1000;
  const r = runTool("check_funding_rates", { funding_rates: f, timestamps: ts });
  for (const k of ["beyond_cap", "irregular_interval"]) assert.ok(checks(r).includes(k), k);
});

test("cross venue: one diverging venue and one frozen venue", () => {
  const rows = Array.from({ length: 60 }, (_, t) => [100 + t * 0.1, 100 + t * 0.1 + 0.01, t === 30 ? 103 : 100 + t * 0.1 - 0.01, 100]);
  const r = runTool("check_cross_venue_prices", { venues: ["a", "b", "c", "d"], prices: rows });
  assert.ok(checks(r).includes("divergence"));
  assert.ok(r.issues.some((i) => i.check === "stale_venue" && i.where === "d"));
});

test("timestamps: duplicates, disorder, mixed offsets and future dates", () => {
  const r = runTool("check_timestamps", { timestamps: ["2024-01-02T10:00:00Z", "2024-01-02T10:00:00Z", "2024-01-01T10:00:00+02:00", "2099-01-01T00:00:00Z", "nope"], now: "2025-01-01T00:00:00Z" });
  for (const k of ["duplicate", "unsorted", "mixed_offsets", "future", "unparseable"]) assert.ok(checks(r).includes(k), k);
});

test("returns: percents and smoothing are caught", () => {
  const pct = Array.from({ length: 50 }, (_, i) => (i % 2 ? 1.2 : -0.8));
  assert.ok(checks(runTool("check_returns_series", { returns: pct })).includes("looks_like_percent"));
  const noise = walk(201).map((p, i, a) => (i ? p / a[i - 1] - 1 : 0)).slice(1);
  let x = 0;
  const smooth = noise.map((e) => (x = 0.8 * x + e));
  assert.ok(checks(runTool("check_returns_series", { returns: smooth })).includes("smoothed"));
});

test("fundamentals: a broken balance sheet and gross profit are errors", () => {
  const r = runTool("check_fundamentals", { total_assets: 1000, total_liabilities: 600, total_equity: 300, revenue: 500, cost_of_revenue: 300, gross_profit: 250 });
  for (const k of ["balance_sheet", "gross_profit"]) assert.ok(checks(r).includes(k), k);
  assert.equal(runTool("check_fundamentals", { total_assets: 1000, total_liabilities: 600, total_equity: 400 }).clean, true);
});

test("corporate actions: a 2:1 split and a dividend are recovered", () => {
  const close = [100, 101, 102, 51, 52, 52.5, 53, 52];
  const factor = [0.495, 0.495, 0.495, 0.99, 0.99, 0.99, 1, 1];
  const adjusted = close.map((c, i) => c * factor[i]);
  const r = runTool("check_corporate_actions", { close, adjusted_close: adjusted });
  assert.ok(r.events.some((e) => e.type === "split" && e.ratio === "2:1"), JSON.stringify(r.events));
  assert.ok(r.events.some((e) => e.type === "dividend" && Math.abs(e.yield_percent - 1.0101) < 0.01), JSON.stringify(r.events));
});
