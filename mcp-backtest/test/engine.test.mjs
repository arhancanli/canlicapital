import test from "node:test";
import assert from "node:assert/strict";

import { crisisReplay, describe as stats, rebalanceIndices, runBacktest } from "../src/engine.mjs";

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

// A market where one signal ranks names steadily, so every rebalance trades the same way.
function liquidityRun({ capital, volume = 1e9, extra = {} } = {}) {
  const { dates, names, rets } = market({ tickers: 20, days: 300 });
  const prices = pricesFrom(dates, names, rets);
  const signals = Object.fromEntries(names.map((t, i) => [t, dates.map((_, d) => (i + d) % 20)]));
  const dollarVolumes = Object.fromEntries(names.map((t) => [t, dates.map(() => (typeof volume === "function" ? volume(t) : volume))]));
  return runBacktest({ dates, tickers: names, prices, signalDates: dates, signals, side: "long_only", costBps: 0, ...(capital ? { capital, dollarVolumes } : {}), ...extra });
}

test("without capital the run is unchanged and has no liquidity record", () => {
  const r = liquidityRun();
  assert.equal(r.liquidity, undefined);
  assert.ok(r.nav > 0);
});

test("impact grows with size as the square root of participation", () => {
  const small = liquidityRun({ capital: 1e5 }).liquidity;
  const big = liquidityRun({ capital: 1e7 }).liquidity;
  assert.equal(big.clipped_orders, 0);
  assert.ok(big.impact_paid > small.impact_paid * 5, `${big.impact_paid} vs ${small.impact_paid}`);
  assert.ok(big.impact_paid < small.impact_paid * 15, `${big.impact_paid} vs ${small.impact_paid}`);
});

test("an order cannot fill more than the cap on the day's volume, however large the capital", () => {
  const r = liquidityRun({ capital: 1e9, volume: 1e6 });
  assert.ok(r.liquidity.clipped_orders > 0);
  assert.ok(r.liquidity.fill_ratio < 0.2, `filled ${r.liquidity.fill_ratio}`);
  assert.ok(r.liquidity.worst.wanted_participation > 1);
  assert.equal(r.liquidity.verdict, "too_big");
  assert.ok(r.liquidity.filled_participation_max <= 0.1 + 1e-12);
});

test("a name with no volume history cannot be traded at all", () => {
  const r = liquidityRun({ capital: 1e6, volume: (t) => (t === "T03" ? null : 1e9) });
  assert.ok(r.liquidity.blocked_orders > 0);
  assert.ok(r.liquidity.fill_ratio < 1);
});

test("liquidity reads only days before the trade: a volume spike on the trade day does not help", () => {
  const { dates, names, rets } = market({ tickers: 20, days: 300 });
  const prices = pricesFrom(dates, names, rets);
  const signals = Object.fromEntries(names.map((t, i) => [t, dates.map((_, d) => (i + d) % 20)]));
  const flat = Object.fromEntries(names.map((t) => [t, dates.map(() => 1e6)]));
  const later = Object.fromEntries(names.map((t) => [t, dates.map(() => 1e6)]));
  const base = { dates, tickers: names, prices, signalDates: dates, signals, side: "long_only", costBps: 0, capital: 1e6, rebalance: 50 };
  const a = runBacktest({ ...base, dollarVolumes: flat });
  const trade = dates.indexOf(a.used[1].trade_date);
  for (const t of names) later[t][trade] = 1e15;
  const b = runBacktest({ ...base, dollarVolumes: later });
  assert.equal(a.used[1].trade_date, b.used[1].trade_date);
  assert.equal(b.returns[trade - 1], a.returns[trade - 1]);
});

test("capital needs volume, and the limits are checked", () => {
  const { dates, names, rets } = market({ tickers: 20, days: 100 });
  const base = { dates, tickers: names, prices: pricesFrom(dates, names, rets), signalDates: dates, signals: Object.fromEntries(names.map((t, i) => [t, dates.map(() => i)])) };
  assert.throws(() => runBacktest({ ...base, capital: 1e6 }), /dollar volume/);
  assert.throws(() => runBacktest({ ...base, capital: -1, dollarVolumes: {} }), /capital/);
  assert.throws(() => runBacktest({ ...base, capital: 1e6, dollarVolumes: Object.fromEntries(names.map((t) => [t, dates.map(() => 1e9)])), maxParticipation: 2 }), /participation/);
});

test("crisis replay: a crash inside the run is measured, and a crisis outside it is untested, not passed", () => {
  const dates = [], returns = [];
  const d = new Date(Date.UTC(2019, 0, 1));
  while (d.getUTCFullYear() < 2021) {
    if (d.getUTCDay() % 6) { const iso = d.toISOString().slice(0, 10); dates.push(iso); returns.push(iso >= "2020-02-19" && iso <= "2020-03-23" ? -0.03 : 0.0005); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const r = crisisReplay({ dates, returns });
  const covid = r.tested.find((c) => c.id === "pandemic_crash");
  assert.ok(covid.drawdown > 0.5 && covid.drawdown < 0.6, `${covid.drawdown}`);
  assert.equal(covid.ruptured, true);
  assert.equal(r.verdict, "ruptured");
  assert.ok(r.untested.some((c) => c.id === "bank_crisis"));
  assert.equal(crisisReplay({ dates, returns, limit: 0.9 }).verdict, "survived_tested");
  const calm = crisisReplay({ dates: dates.filter((x) => x < "2019-06-01"), returns: returns.slice(0, 100) });
  assert.equal(calm.verdict, "untested");
  assert.equal(calm.tested.length, 0);
});
