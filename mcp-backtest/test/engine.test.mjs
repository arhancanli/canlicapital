import test from "node:test";
import assert from "node:assert/strict";

import { describe as stats, rebalanceIndices, runBacktest } from "../src/engine.mjs";

// Deterministic market: N tickers, D business days of Gaussian returns.
function market({ tickers = 40, days = 760, seed = 7 } = {}) {
  let s = seed;
  const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const gauss = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  const dates = [];
  const d = new Date(Date.UTC(2020, 0, 1));
  while (dates.length < days) { if (d.getUTCDay() % 6) dates.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  const names = Array.from({ length: tickers }, (_, i) => `T${String(i).padStart(2, "0")}`);
  const rets = Object.fromEntries(names.map((t) => [t, Array.from({ length: days }, () => 0.015 * gauss())]));
  return { dates, names, rets, gauss };
}
const pricesFrom = (dates, names, rets) => Object.fromEntries(names.map((t) => {
  const p = [100];
  for (let i = 1; i < dates.length; i += 1) p.push(p[i - 1] * (1 + rets[t][i]));
  return [t, p];
}));

test("a perfect-foresight signal, dated when its information is actually known, earns nothing", () => {
  const { dates, names, rets } = market();
  const prices = pricesFrom(dates, names, rets);
  // signal row i = the return from day i-1 to day i: it is only known at day i, and is dated so.
  const signals = Object.fromEntries(names.map((t) => [t, rets[t].map((r, i) => (i === 0 ? null : r))]));
  const res = runBacktest({ dates, tickers: names, prices, signalDates: dates, signals, rebalance: 1, lagDays: 1, costBps: 0 });
  const st = stats(res);
  assert.ok(Math.abs(st.sharpe_annualized) < 1.2, `Sharpe ${st.sharpe_annualized}`);
  for (const u of res.used) assert.ok(u.signal_date < u.trade_date);
});

test("the same information misdated to before it was knowable would look like a fortune: dating is what the engine trusts", () => {
  const { dates, names, rets } = market();
  const prices = pricesFrom(dates, names, rets);
  // Wrong on purpose: next day's return placed on today's row (lookahead in the input).
  const signals = Object.fromEntries(names.map((t) => [t, rets[t].map((_, i) => (i + 2 < dates.length ? rets[t][i + 2] : null))]));
  const st = stats(runBacktest({ dates, tickers: names, prices, signalDates: dates, signals, rebalance: 1, lagDays: 1, costBps: 0 }));
  assert.ok(st.sharpe_annualized > 10, "a misdated signal is the caller's lookahead; the README tells callers to date signals by availability");
});

test("a planted, honestly dated edge is found, and costs reduce it", () => {
  const { dates, names, rets, gauss } = market({ seed: 11 });
  // A persistent characteristic: half the names drift up 6 bp a day; the signal says which, with noise.
  const quality = Object.fromEntries(names.map((t, i) => [t, i % 2 ? 1 : -1]));
  for (const t of names) for (let i = 1; i < dates.length; i += 1) rets[t][i] += 0.0006 * quality[t];
  const prices = pricesFrom(dates, names, rets);
  const signals = Object.fromEntries(names.map((t) => [t, dates.map(() => quality[t] + 0.5 * gauss())]));
  const free = stats(runBacktest({ dates, tickers: names, prices, signalDates: dates, signals, rebalance: "monthly", costBps: 0 }));
  const costly = stats(runBacktest({ dates, tickers: names, prices, signalDates: dates, signals, rebalance: "monthly", costBps: 50 }));
  assert.ok(free.sharpe_annualized > 2, `Sharpe ${free.sharpe_annualized}`);
  assert.ok(costly.total_return < free.total_return);
  assert.ok(costly.cost_paid > 0 && free.cost_paid === 0);
});

test("lag_days below 1 is refused, and a missing price is counted, not filled", () => {
  const { dates, names, rets } = market({ tickers: 12, days: 120 });
  const prices = pricesFrom(dates, names, rets);
  const signals = Object.fromEntries(names.map((t, i) => [t, dates.map(() => i)]));
  assert.throws(() => runBacktest({ dates, tickers: names, prices, signalDates: dates, signals, lagDays: 0 }), /lag_days must be a whole number of at least 1/);
  prices[names.at(-1)][60] = null; // top-ranked name, always held
  const st = stats(runBacktest({ dates, tickers: names, prices, signalDates: dates, signals, minNames: 5, quantile: 0.25 }));
  assert.ok(st.missing_price_days >= 1);
});

test("monthly rebalances fall on the first trading day of each month", () => {
  assert.deepEqual(rebalanceIndices(["2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02", "2024-03-01"], "monthly"), [0, 2, 4]);
  assert.throws(() => rebalanceIndices(["2024-01-01"], "daily"), /weekly, monthly, quarterly/);
});
