// Strategy recipes backtested on the caller's prices with one engine and no lookahead: a target
// weight decided at the close of period t earns period t+1's return. Between rebalances weights
// drift with prices. Costs are charged on turnover (sum of absolute weight changes against the
// drifted weights) at cost_bps per unit. Cash earns the risk-free rate (default 0).
//
// Every recipe states its rule; strategy_sweep runs a recipe over a parameter grid and deflates the
// best Sharpe ratio for the number of variants tried, so a sweep cannot quietly overfit.
import { z } from "zod";

import { mean, normCdf, normInv, std, variance, moments } from "../math.mjs";
import { MAX_SERIES, ppyArg } from "../inputs.mjs";

const pricesArg = z.array(z.number().positive()).min(30).max(MAX_SERIES).describe("Prices oldest first (daily closes by default).");
const matrixArg = z.array(z.array(z.number().positive()).min(2).max(200)).min(30).max(MAX_SERIES).describe("Prices, one row per period, one column per asset.");
const costArg = z.number().min(0).max(1000).optional().describe("Cost in basis points per unit of turnover (one-way); default 5.");
const common = { cost_bps: costArg, periods_per_year: ppyArg, risk_free: z.number().gt(-1).lt(1).optional().describe("Annual rate earned on cash; default 0."), long_only: z.boolean().optional().describe("Long-only (true) or long-short (false); default true.") };
const int = (d, lo = 1, hi = 5000) => z.number().int().min(lo).max(hi).optional().describe(`Default ${d}.`);

// ---------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------

// P: rows of prices (T x N). targets[t]: array of N weights decided at close t, or null to hold.
export function runEngine(P, targets, { cost_bps = 5, periods_per_year: ppy = 252, risk_free = 0 } = {}) {
  const T = P.length, N = P[0].length, rfp = (1 + risk_free) ** (1 / ppy) - 1, c = cost_bps / 1e4;
  let w = new Array(N).fill(0);
  const net = [], gross = [], turnovers = [], exposures = [];
  let trades = 0;
  for (let t = 0; t < T - 1; t++) {
    const tgt = targets[t];
    let to = 0;
    if (tgt) {
      for (let i = 0; i < N; i++) { const d = Math.abs(tgt[i] - w[i]); to += d; if (d > 1e-12) trades++; }
      w = [...tgt];
    }
    const r = P[t + 1].map((p, i) => p / P[t][i] - 1);
    const invested = w.reduce((s, x) => s + x, 0);
    const g = w.reduce((s, x, i) => s + x * r[i], 0) + (1 - invested) * rfp;
    gross.push(g); net.push(g - c * to); turnovers.push(to); exposures.push(w.reduce((s, x) => s + Math.abs(x), 0));
    // Drift weights with the period's returns.
    const growth = 1 + g;
    w = w.map((x, i) => (growth > 0 ? x * (1 + r[i]) / growth : 0));
  }
  return { net, gross, turnovers, exposures, trades };
}

export function statsOf(rets, ppy) {
  const n = rets.length;
  let eq = 1, peak = 1, mdd = 0;
  for (const r of rets) { eq *= 1 + r; if (eq > peak) peak = eq; mdd = Math.min(mdd, eq / peak - 1); }
  const sd = std(rets), m = mean(rets);
  return { total_return: eq - 1, cagr: eq > 0 ? eq ** (ppy / n) - 1 : -1, volatility: sd * Math.sqrt(ppy), sharpe: sd > 0 ? m / sd * Math.sqrt(ppy) : null, max_drawdown: mdd, periods: n };
}

function report(P, targets, a, rule, params) {
  const ppy = a.periods_per_year ?? 252, eng = runEngine(P, targets, a);
  const s = statsOf(eng.net, ppy), N = P[0].length;
  const bench = runEngine(P, P.map((_, t) => (t === 0 ? new Array(N).fill(1 / N) : null)), { ...a, cost_bps: 0 });
  const b = statsOf(bench.net, ppy);
  return {
    rule, parameters: params, ...s,
    calmar: s.max_drawdown < 0 ? s.cagr / -s.max_drawdown : null,
    annual_turnover: mean(eng.turnovers) * ppy, average_exposure: mean(eng.exposures), weight_changes: eng.trades,
    cost_drag_annual: (mean(eng.gross) - mean(eng.net)) * ppy,
    buy_and_hold: { cagr: b.cagr, sharpe: b.sharpe, max_drawdown: b.max_drawdown, note: N > 1 ? "Equal weights at the start, never rebalanced." : undefined },
    returns_tail: eng.net.slice(-5),
    caution: "One backtest of one parameter set. If you tried others, count them and use strategy_sweep or deflated_sharpe_ratio.",
    _net: eng.net,
  };
}

const strip = (r) => { const { _net, ...rest } = r; return rest; };
const single = (p) => p.map((x) => [x]);

// Rolling helpers on a single price array.
const smaAt = (p, n, t) => { if (t < n - 1) return null; let s = 0; for (let i = t - n + 1; i <= t; i++) s += p[i]; return s / n; };
function rollingStd(rets, n, t) { if (t < n) return null; const w = rets.slice(t - n + 1, t + 1); return std(w); }
const simpleRets = (p) => p.map((x, t) => (t === 0 ? 0 : x / p[t - 1] - 1));

function rsiSeries(c, n) {
  const out = new Array(c.length).fill(null);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n; out[n] = g + l === 0 ? 50 : 100 * g / (g + l);
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; out[i] = g + l === 0 ? 50 : 100 * g / (g + l); }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Recipes: each returns { targets, rule, params } for the engine
// ---------------------------------------------------------------------------------------------
export const RECIPES = {
  ma_crossover: {
    input: { prices: pricesArg, fast: int(50, 1, 2000), slow: int(200, 2, 5000) },
    build(a) {
      const f = a.fast ?? 50, s = a.slow ?? 200, lo = a.long_only ?? true, p = a.prices;
      if (!(f < s)) throw new Error("fast must be shorter than slow.");
      return { P: single(p), params: { fast: f, slow: s }, rule: `Long when SMA(${f}) > SMA(${s}), else ${lo ? "flat" : "short"}.`, targets: p.map((_, t) => { const a1 = smaAt(p, f, t), b1 = smaAt(p, s, t); return [a1 === null || b1 === null ? 0 : a1 > b1 ? 1 : lo ? 0 : -1]; }) };
    },
  },
  time_series_momentum: {
    input: { prices: pricesArg, lookback: int(252), vol_target: z.number().positive().max(2).optional().describe("Scale to this annual volatility, e.g. 0.15; default none."), vol_lookback: int(63, 2), max_leverage: z.number().positive().max(10).optional().describe("Cap with vol targeting; default 2.") },
    build(a) {
      const L = a.lookback ?? 252, lo = a.long_only ?? true, p = a.prices, r = simpleRets(p), vl = a.vol_lookback ?? 63, ppy = a.periods_per_year ?? 252;
      return { P: single(p), params: { lookback: L, vol_target: a.vol_target ?? null }, rule: `Sign of the ${L}-period return${lo ? ", long or flat" : ""}${a.vol_target ? `, scaled to ${a.vol_target} volatility over ${vl} periods` : ""}.`, targets: p.map((x, t) => {
        if (t < L) return [0];
        let s = Math.sign(x / p[t - L] - 1); if (lo) s = Math.max(0, s);
        if (a.vol_target && s !== 0) { const sd = rollingStd(r, vl, t); if (sd === null || sd === 0) return [0]; s *= Math.min(a.max_leverage ?? 2, a.vol_target / (sd * Math.sqrt(ppy))); }
        return [s];
      }) };
    },
  },
  breakout: {
    input: { prices: pricesArg, entry: int(20, 2), exit: int(10, 2) },
    build(a) {
      const n = a.entry ?? 20, m = a.exit ?? 10, lo = a.long_only ?? true, p = a.prices;
      let pos = 0;
      const targets = p.map((x, t) => {
        if (t >= n) { const hi = Math.max(...p.slice(t - n, t)), low = Math.min(...p.slice(t - n, t)); if (x > hi) pos = 1; else if (x < low && !lo) pos = -1; }
        if (t >= m) { const ex = p.slice(t - m, t); if (pos === 1 && x < Math.min(...ex)) pos = 0; else if (pos === -1 && x > Math.max(...ex)) pos = 0; }
        return [pos];
      });
      return { P: single(p), params: { entry: n, exit: m }, rule: `Enter long above the prior ${n}-period high${lo ? "" : " (short below the low)"}; exit on a break of the prior ${m}-period low (high).`, targets };
    },
  },
  zscore_reversion: {
    input: { prices: pricesArg, window: int(20, 3), entry_z: z.number().positive().max(10).optional().describe("Enter at |z| above this; default 2."), exit_z: z.number().min(0).max(10).optional().describe("Exit when |z| falls below this; default 0.5.") },
    build(a) {
      const w = a.window ?? 20, ez = a.entry_z ?? 2, xz = a.exit_z ?? 0.5, lo = a.long_only ?? true, p = a.prices;
      let pos = 0;
      const targets = p.map((x, t) => {
        if (t < w - 1) return [0];
        const win = p.slice(t - w + 1, t + 1), sd = std(win), zz = sd === 0 ? 0 : (x - mean(win)) / sd;
        if (pos === 1 && zz >= -xz) pos = 0; else if (pos === -1 && zz <= xz) pos = 0;
        if (pos === 0) { if (zz < -ez) pos = 1; else if (zz > ez && !lo) pos = -1; }
        return [pos];
      });
      return { P: single(p), params: { window: w, entry_z: ez, exit_z: xz }, rule: `Buy when the ${w}-period z-score is below -${ez}${lo ? "" : ", short above +" + ez}; exit when it recovers inside ±${xz}.`, targets };
    },
  },
  rsi_reversion: {
    input: { prices: pricesArg, period: int(14, 2), lower: z.number().min(0).max(100).optional().describe("Buy below this RSI; default 30."), exit_level: z.number().min(0).max(100).optional().describe("Sell above this RSI; default 50.") },
    build(a) {
      const n = a.period ?? 14, lower = a.lower ?? 30, ex = a.exit_level ?? 50, rsi = rsiSeries(a.prices, n);
      let pos = 0;
      return { P: single(a.prices), params: { period: n, lower, exit_level: ex }, rule: `Long when RSI(${n}) < ${lower}; flat when RSI > ${ex}.`, targets: rsi.map((v) => { if (v !== null) { if (pos === 0 && v < lower) pos = 1; else if (pos === 1 && v > ex) pos = 0; } return [pos]; }) };
    },
  },
  volatility_target: {
    input: { prices: pricesArg, target: z.number().positive().max(2).optional().describe("Annual volatility target; default 0.1."), lookback: int(63, 2), max_leverage: z.number().positive().max(10).optional().describe("Default 2."), rebalance_every: int(1) },
    build(a) {
      const tv = a.target ?? 0.1, L = a.lookback ?? 63, cap = a.max_leverage ?? 2, k = a.rebalance_every ?? 1, ppy = a.periods_per_year ?? 252, r = simpleRets(a.prices);
      return { P: single(a.prices), params: { target: tv, lookback: L, rebalance_every: k }, rule: `Hold the asset scaled to ${tv} annual volatility (trailing ${L} periods), capped at ${cap}x, rebalanced every ${k} period(s).`, targets: a.prices.map((_, t) => { if (t < L) return [0]; if ((t - L) % k !== 0) return null; const sd = rollingStd(r, L, t); return [sd > 0 ? Math.min(cap, tv / (sd * Math.sqrt(ppy))) : 0]; }) };
    },
  },
  cross_sectional_momentum: {
    input: { prices: matrixArg, lookback: int(252), skip: int(21, 0), top: int(3), rebalance_every: int(21) },
    build(a) {
      const P = a.prices, N = P[0].length, L = a.lookback ?? 252, sk = a.skip ?? 21, top = Math.min(a.top ?? 3, Math.floor(N / 2) || 1), k = a.rebalance_every ?? 21, lo = a.long_only ?? true;
      if (!(sk < L)) throw new Error("skip must be shorter than lookback.");
      return { P, params: { lookback: L, skip: sk, top, rebalance_every: k }, rule: `Every ${k} periods rank assets by return from t-${L} to t-${sk}; hold the top ${top} equally${lo ? "" : ` and short the bottom ${top}`}.`, targets: P.map((row, t) => {
        if (t < L) return t === 0 ? new Array(N).fill(0) : null;
        if ((t - L) % k !== 0) return null;
        const score = row.map((_, i) => P[t - sk][i] / P[t - L][i] - 1), order = score.map((s, i) => [s, i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
        const w = new Array(N).fill(0);
        order.slice(0, top).forEach(([, i]) => { w[i] = (lo ? 1 : 0.5) / top; });
        if (!lo) order.slice(-top).forEach(([, i]) => { w[i] = -0.5 / top; });
        return w;
      }) };
    },
  },
  dual_momentum: {
    input: { prices: matrixArg, lookback: int(252), rebalance_every: int(21), safe_asset: z.number().int().min(0).max(199).optional().describe("Column of the safe asset (bonds/cash) to hold when nothing beats it; default none (cash).") },
    build(a) {
      const P = a.prices, N = P[0].length, L = a.lookback ?? 252, k = a.rebalance_every ?? 21, safe = a.safe_asset;
      return { P, params: { lookback: L, rebalance_every: k, safe_asset: safe ?? null }, rule: `Every ${k} periods hold the risky asset with the best ${L}-period return if that return beats ${safe === undefined ? "zero" : "the safe asset's"}; otherwise ${safe === undefined ? "cash" : "the safe asset"}.`, targets: P.map((row, t) => {
        if (t < L) return t === 0 ? new Array(N).fill(0) : null;
        if ((t - L) % k !== 0) return null;
        const ret = row.map((x, i) => x / P[t - L][i] - 1);
        let best = -1;
        for (let i = 0; i < N; i++) if (i !== safe && (best < 0 || ret[i] > ret[best])) best = i;
        const hurdle = safe === undefined ? 0 : ret[safe], w = new Array(N).fill(0);
        if (ret[best] > hurdle) w[best] = 1; else if (safe !== undefined) w[safe] = 1;
        return w;
      }) };
    },
  },
  risk_parity_rebalance: {
    input: { prices: matrixArg, lookback: int(63, 2), rebalance_every: int(21), target_volatility: z.number().positive().max(2).optional().describe("Scale the whole book to this annual volatility (diagonal estimate); default none."), max_leverage: z.number().positive().max(10).optional().describe("Default 2.") },
    build(a) {
      const P = a.prices, N = P[0].length, L = a.lookback ?? 63, k = a.rebalance_every ?? 21, ppy = a.periods_per_year ?? 252;
      const R = P.map((row, t) => row.map((x, i) => (t === 0 ? 0 : x / P[t - 1][i] - 1)));
      return { P, params: { lookback: L, rebalance_every: k, target_volatility: a.target_volatility ?? null }, rule: `Every ${k} periods weight assets by inverse ${L}-period volatility${a.target_volatility ? `, scaled to ${a.target_volatility} volatility` : ""}.`, targets: P.map((_, t) => {
        if (t < L) return t === 0 ? new Array(N).fill(0) : null;
        if ((t - L) % k !== 0) return null;
        const sd = Array.from({ length: N }, (_, i) => std(R.slice(t - L + 1, t + 1).map((r) => r[i])));
        const iv = sd.map((s) => (s > 0 ? 1 / s : 0)), tot = iv.reduce((s, x) => s + x, 0);
        let w = iv.map((x) => x / tot);
        if (a.target_volatility) {
          const cols = Array.from({ length: N }, (_, i) => R.slice(t - L + 1, t + 1).map((r) => r[i]));
          let v = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const mi = mean(cols[i]), mj = mean(cols[j]); let c = 0; for (let q = 0; q < L; q++) c += (cols[i][q] - mi) * (cols[j][q] - mj); v += w[i] * w[j] * c / (L - 1); }
          const scale = Math.min(a.max_leverage ?? 2, a.target_volatility / Math.sqrt(v * ppy));
          w = w.map((x) => x * scale);
        }
        return w;
      }) };
    },
  },
  pairs_trading: {
    input: { prices: z.array(z.tuple([z.number().positive(), z.number().positive()])).min(30).max(MAX_SERIES).describe("Pairs of prices [y, x] per period, oldest first."), window: int(60, 10), entry_z: z.number().positive().max(10).optional().describe("Default 2."), exit_z: z.number().min(0).max(10).optional().describe("Default 0.5.") },
    build(a) {
      const P = a.prices, w = a.window ?? 60, ez = a.entry_z ?? 2, xz = a.exit_z ?? 0.5, ly = P.map((r) => Math.log(r[0])), lx = P.map((r) => Math.log(r[1]));
      let pos = 0;
      const targets = P.map((_, t) => {
        if (t < w - 1) return [0, 0];
        const ys = ly.slice(t - w + 1, t + 1), xs = lx.slice(t - w + 1, t + 1), mx = mean(xs), my = mean(ys);
        let sxy = 0, sxx = 0; for (let i = 0; i < w; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
        const beta = sxy / sxx, alpha = my - beta * mx, spread = ys.map((y, i) => y - alpha - beta * xs[i]), sd = std(spread), zz = sd === 0 ? 0 : spread[w - 1] / sd;
        if (pos === 1 && zz >= -xz) pos = 0; else if (pos === -1 && zz <= xz) pos = 0;
        if (pos === 0) { if (zz < -ez) pos = 1; else if (zz > ez) pos = -1; }
        const g = 1 + Math.abs(beta);
        return [pos / g, -pos * beta / g];
      });
      return { P, params: { window: w, entry_z: ez, exit_z: xz }, rule: `Rolling ${w}-period OLS of log y on log x; trade the residual z-score: long the spread below -${ez}, short above +${ez}, exit inside ±${xz}; legs sized 1 : -beta, gross 1.`, targets };
    },
  },
};

function sweep(recipe, base, grid, ppy) {
  const keys = Object.keys(grid), combos = keys.reduce((acc, k) => acc.flatMap((c) => grid[k].map((v) => ({ ...c, [k]: v }))), [{}]);
  if (combos.length > 400) throw new Error(`The grid has ${combos.length} combinations; keep it to 400 or fewer.`);
  const rows = [];
  for (const c of combos) {
    try { const b = RECIPES[recipe].build({ ...base, ...c }); const r = report(b.P, b.targets, { ...base, ...c }, b.rule, b.params); rows.push({ params: c, sharpe: r.sharpe, cagr: r.cagr, max_drawdown: r.max_drawdown, annual_turnover: r.annual_turnover, net: r._net }); }
    catch (e) { rows.push({ params: c, error: e.message }); }
  }
  const ok = rows.filter((r) => r.sharpe !== null && r.sharpe !== undefined);
  ok.sort((x, y) => y.sharpe - x.sharpe);
  const best = ok[0];
  let deflation;
  if (best && ok.length > 1) {
    const ret = best.net, n = ret.length, sr = mean(ret) / std(ret), m = moments(ret), k4 = m.excess_kurtosis + 3;
    const vPer = variance(ok.map((r) => r.sharpe)) / ppy, Nn = ok.length, EG = 0.5772156649015329;
    const srStar = Math.sqrt(vPer) * ((1 - EG) * normInv(1 - 1 / Nn) + EG * normInv(1 - 1 / (Nn * Math.E)));
    const dsr = normCdf((sr - srStar) * Math.sqrt(n - 1) / Math.sqrt(1 - m.skew * sr + (k4 - 1) / 4 * sr * sr));
    deflation = { trials: Nn, expected_max_sharpe_under_null: srStar * Math.sqrt(ppy), deflated_sharpe_probability: dsr, verdict: dsr > 0.95 ? "The best variant survives deflation for the number tried." : "The best variant does not survive deflation: its Sharpe is what the best of this many tries would show by luck." };
  }
  return { recipe, combinations: combos.length, columns: ["params", "sharpe", "cagr", "max_drawdown", "annual_turnover"], rows: ok.map((r) => [r.params, r.sharpe, r.cagr, r.max_drawdown, r.annual_turnover]).slice(0, 50), errors: rows.filter((r) => r.error).slice(0, 5).map((r) => ({ params: r.params, error: r.error })), best: best ? { params: best.params, sharpe: best.sharpe } : null, deflation };
}

const recipeTool = (name, title, description, keywords) => ({
  name: `backtest_${name}`, title, description, keywords,
  input: z.object({ ...RECIPES[name].input, ...common }).strict(),
  run(a) { const b = RECIPES[name].build(a); return strip(report(b.P, b.targets, a, b.rule, b.params)); },
});

export const TOOLS = [
  recipeTool("ma_crossover", "Backtest a moving-average crossover", "Backtest a fast/slow moving-average crossover on your prices with costs and no lookahead: CAGR, Sharpe, drawdown, turnover, cost drag and buy-and-hold for comparison.", "moving average crossover golden cross trend following backtest sma"),
  recipeTool("time_series_momentum", "Backtest time-series momentum", "Backtest time-series (absolute) momentum: hold the asset when its trailing return is positive, optionally volatility-targeted, with costs and no lookahead.", "time series momentum trend following absolute momentum managed futures volatility targeting backtest"),
  recipeTool("breakout", "Backtest a channel breakout", "Backtest a Donchian channel breakout (turtle-style entries on new highs, exits on shorter lows) with costs and no lookahead.", "breakout donchian channel turtle trend following backtest new high"),
  recipeTool("zscore_reversion", "Backtest z-score mean reversion", "Backtest mean reversion on a rolling z-score of price: buy stretched lows (and short stretched highs), exit near the mean, with costs.", "mean reversion z score bollinger reversal backtest oversold"),
  recipeTool("rsi_reversion", "Backtest RSI mean reversion", "Backtest a classic RSI oversold strategy: buy when RSI is below a threshold, sell when it recovers, with costs and no lookahead.", "rsi oversold mean reversion short term reversal backtest connors"),
  recipeTool("volatility_target", "Backtest volatility targeting", "Backtest holding an asset scaled to a constant volatility target with trailing realized volatility, leverage cap and rebalance frequency.", "volatility targeting vol scaling risk management leverage backtest"),
  recipeTool("cross_sectional_momentum", "Backtest cross-sectional momentum", "Backtest cross-sectional (relative) momentum across a universe: periodically hold the top assets by trailing return (skipping the latest month), optionally short the bottom.", "cross sectional momentum relative strength rotation ranking universe backtest jegadeesh titman"),
  recipeTool("dual_momentum", "Backtest dual momentum", "Backtest dual momentum (Antonacci): hold the best-performing risky asset when it beats cash or a safe asset, otherwise move to safety.", "dual momentum antonacci absolute relative momentum rotation gem backtest"),
  recipeTool("risk_parity_rebalance", "Backtest inverse-volatility risk parity", "Backtest a multi-asset inverse-volatility (naive risk parity) portfolio rebalanced periodically, optionally scaled to a volatility target.", "risk parity inverse volatility multi asset all weather rebalancing backtest"),
  recipeTool("pairs_trading", "Backtest pairs trading", "Backtest a pairs trade on two price series: rolling hedge ratio, z-score of the residual spread, market-neutral entries and exits, with costs.", "pairs trading statistical arbitrage spread cointegration hedge ratio market neutral backtest"),
  {
    name: "backtest_weights",
    title: "Backtest your own target weights",
    description: "Backtest any strategy from your own target weights per period (decided at each close, applied to the next period) with the same costed, drift-aware engine; null rows mean hold.",
    keywords: "custom backtest target weights signals portfolio engine positions costs turnover",
    input: z.object({
      prices: matrixArg,
      weights: z.array(z.union([z.array(z.number().min(-10).max(10)).min(1).max(200), z.null()])).min(30).max(MAX_SERIES).describe("Target weights per period (same rows as prices), or null to let weights drift."),
      ...common,
    }).strict(),
    run(a) {
      if (a.weights.length !== a.prices.length) throw new Error(`weights has ${a.weights.length} rows and prices ${a.prices.length}.`);
      const N = a.prices[0].length;
      a.weights.forEach((w, t) => { if (w && w.length !== N) throw new Error(`weights row ${t} has ${w.length} entries for ${N} assets.`); });
      return strip(report(a.prices, a.weights, a, "Your target weights, applied from the next period.", {}));
    },
  },
  {
    name: "strategy_sweep",
    title: "Parameter sweep with deflated Sharpe",
    description: "Run one strategy recipe over a parameter grid (up to 400 variants), rank the variants by Sharpe, and deflate the best one for the number tried, so tuning cannot pass off luck as skill.",
    keywords: "parameter sweep grid search optimization overfitting deflated sharpe multiple testing backtest robustness",
    input: z.object({
      recipe: z.enum(Object.keys(RECIPES)).describe("Which recipe, e.g. ma_crossover."),
      arguments: z.record(z.string(), z.unknown()).describe("Fixed arguments for the recipe, including prices."),
      grid: z.record(z.string(), z.array(z.union([z.number(), z.boolean()])).min(1).max(100)).describe("Parameter values to try, e.g. {\"fast\": [20, 50], \"slow\": [100, 200]}."),
    }).strict(),
    run({ recipe, arguments: args, grid }) {
      const parsed = z.object({ ...RECIPES[recipe].input, ...common }).strict().safeParse(args);
      if (!parsed.success) throw new Error(`arguments: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      for (const k of Object.keys(grid)) if (!(k in RECIPES[recipe].input) && !(k in common)) throw new Error(`grid key ${k} is not a parameter of ${recipe}.`);
      return sweep(recipe, parsed.data, grid, parsed.data.periods_per_year ?? 252);
    },
  },
];
