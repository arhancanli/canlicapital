// Portfolio risk on positions: historical and parametric VaR and expected shortfall with per-position
// contributions, scenario stress tests, option books revalued on a spot-by-volatility grid,
// beta-adjusted exposure and hedges, concentration and liquidation horizons.
import { z } from "zod";

import { mean, normInv, normPdf, sortedCopy, quantile } from "../math.mjs";
import { MAX_SERIES } from "../inputs.mjs";
import { bsm } from "./options.mjs";

const values = z.array(z.number()).min(1).max(500).describe("Position values in currency (negative for shorts), one per asset.");
const names = z.array(z.string().max(60)).max(500).optional().describe("Position names.");
const label = (nm, v) => Object.fromEntries(v.map((x, i) => [nm?.[i] ?? `position_${i + 1}`, x]));

export const TOOLS = [
  {
    name: "portfolio_var",
    title: "Portfolio VaR and expected shortfall",
    description: "Compute a positions portfolio's historical and parametric (normal) value at risk and expected shortfall from asset return history, with each position's contribution and the diversification benefit.",
    keywords: "portfolio var value at risk expected shortfall cvar component contribution historical parametric diversification positions",
    input: z.object({
      positions: values,
      returns: z.array(z.array(z.number()).min(1).max(500)).min(20).max(MAX_SERIES).describe("Asset returns history, one row per period, one column per position."),
      confidence: z.number().gt(0.5).lt(1).optional().describe("Default 0.99."),
      horizon: z.number().int().min(1).max(250).optional().describe("Horizon in periods (square-root scaling); default 1."),
      names,
    }).strict(),
    run({ positions: w, returns: R, confidence: c = 0.99, horizon: h = 1, names: nm }) {
      const n = w.length;
      R.forEach((row, i) => { if (row.length !== n) throw new Error(`returns row ${i} has ${row.length} columns for ${n} positions.`); });
      const pnl = R.map((row) => row.reduce((s, r, i) => s + r * w[i], 0)), sh = Math.sqrt(h);
      const sorted = sortedCopy(pnl), cut = quantile(sorted, 1 - c), tail = R.map((row, t) => [row, pnl[t]]).filter(([, p]) => p <= cut);
      const hvar = -cut * sh, hes = -mean(tail.map(([, p]) => p)) * sh;
      const contribES = w.map((wi, i) => -mean(tail.map(([row]) => row[i] * wi)) * sh);
      const cols = Array.from({ length: n }, (_, i) => R.map((r) => r[i])), mus = cols.map(mean);
      const cov = cols.map((x, i) => cols.map((y, j) => { let s = 0; for (let t = 0; t < x.length; t++) s += (x[t] - mus[i]) * (y[t] - mus[j]); return s / (x.length - 1); }));
      const covW = cov.map((row) => row.reduce((s, v, j) => s + v * w[j], 0)), sd = Math.sqrt(w.reduce((s, wi, i) => s + wi * covW[i], 0)), z = normInv(c);
      const mu = w.reduce((s, wi, i) => s + wi * mus[i], 0);
      const pvar = (z * sd - mu) * sh, pes = (sd * normPdf(z) / (1 - c) - mu) * sh;
      const standalone = w.map((wi, i) => z * Math.abs(wi) * Math.sqrt(cov[i][i]) * sh);
      return {
        historical_var: hvar, historical_es: hes, parametric_var: pvar, parametric_es: pes,
        es_contribution: label(nm, contribES), parametric_var_contribution: label(nm, w.map((wi, i) => wi * covW[i] / sd * z * sh)),
        sum_of_standalone_var: standalone.reduce((s, v) => s + v, 0), diversification_benefit: standalone.reduce((s, v) => s + v, 0) - z * sd * sh,
        tail_scenarios: tail.length, method: "Historical: empirical quantile of portfolio P&L (linear interpolation); contributions are each position's average P&L in the tail. Parametric: normal with sample mean and covariance; Euler contributions.",
      };
    },
  },
  {
    name: "stress_test",
    title: "Scenario stress test",
    description: "Apply named scenarios (a return shock per position, or a market shock passed through each position's beta) to a portfolio and report the P&L of each scenario and the worst position.",
    keywords: "stress test scenario analysis shock what if crash market drop beta pnl",
    input: z.object({
      positions: values, names,
      betas: z.array(z.number()).max(500).optional().describe("Beta of each position to the market, for market_shock scenarios."),
      scenarios: z.array(z.object({
        name: z.string().max(80).describe("Scenario name, e.g. \"2008-style crash\"."),
        shocks: z.array(z.number().min(-1)).max(500).optional().describe("Return of each position in the scenario."),
        market_shock: z.number().min(-1).max(5).optional().describe("Market return; each position moves beta x shock."),
      }).strict()).min(1).max(100).describe("Scenarios to apply."),
    }).strict(),
    run({ positions: w, names: nm, betas, scenarios }) {
      const total = w.reduce((s, v) => s + Math.abs(v), 0);
      return { columns: ["scenario", "pnl", "pnl_percent_of_gross", "worst_position", "worst_pnl"], rows: scenarios.map((sc) => {
        let shocks = sc.shocks;
        if (!shocks) { if (sc.market_shock === undefined || !betas) throw new Error(`Scenario ${sc.name}: send shocks, or market_shock with betas.`); shocks = betas.map((b) => b * sc.market_shock); }
        if (shocks.length !== w.length) throw new Error(`Scenario ${sc.name} has ${shocks.length} shocks for ${w.length} positions.`);
        const p = w.map((v, i) => v * shocks[i]), worst = p.indexOf(Math.min(...p)), pnl = p.reduce((s, v) => s + v, 0);
        return [sc.name, pnl, total ? pnl / total * 100 : null, nm?.[worst] ?? `position_${worst + 1}`, p[worst]];
      }) };
    },
  },
  {
    name: "option_scenario_grid",
    title: "Option book scenario grid",
    description: "Revalue a book of European options and stock under a grid of spot moves and volatility shifts (full Black-Scholes revaluation), with P&L per cell and the book's current Greeks.",
    keywords: "option scenario grid pnl matrix spot vol shock revaluation risk report greeks book",
    input: z.object({
      spot: z.number().positive().describe("Current underlying price."),
      rate: z.number().gt(-1).lt(1).optional().describe("Rate; default 0."), dividend_yield: z.number().gt(-1).lt(1).optional().describe("Dividend yield; default 0."),
      legs: z.array(z.object({ type: z.enum(["call", "put", "stock"]).describe("call, put or stock."), quantity: z.number().describe("Signed quantity (contracts x multiplier, or shares)."), strike: z.number().positive().optional().describe("Strike (options)."), years: z.number().positive().optional().describe("Years to expiry (options)."), volatility: z.number().positive().optional().describe("Implied volatility (options).") }).strict()).min(1).max(200).describe("Positions."),
      spot_moves: z.array(z.number().min(-0.99).max(5)).min(1).max(41).optional().describe("Relative spot moves; default [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2]."),
      vol_shifts: z.array(z.number().min(-1).max(5)).min(1).max(21).optional().describe("Absolute volatility shifts; default [-0.1, 0, 0.1]."),
      days_forward: z.number().min(0).max(3650).optional().describe("Days of time decay to apply; default 0."),
    }).strict(),
    run({ spot, rate = 0, dividend_yield = 0, legs, spot_moves = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2], vol_shifts = [-0.1, 0, 0.1], days_forward = 0 }) {
      const value = (s, dv, dt) => legs.reduce((acc, l) => {
        if (l.type === "stock") return acc + l.quantity * s;
        if (l.strike === undefined || l.years === undefined || l.volatility === undefined) throw new Error("Option legs need strike, years and volatility.");
        const t = l.years - dt;
        if (t <= 1e-9) return acc + l.quantity * Math.max(0, l.type === "call" ? s - l.strike : l.strike - s);
        return acc + l.quantity * bsm({ type: l.type, spot: s, strike: l.strike, years: t, rate, dividend_yield, volatility: Math.max(1e-4, l.volatility + dv) }).price;
      }, 0);
      const base = value(spot, 0, 0), dt = days_forward / 365;
      const greeks = legs.reduce((g, l) => {
        if (l.type === "stock") { g.delta += l.quantity; return g; }
        const x = bsm({ type: l.type, spot, strike: l.strike, years: l.years, rate, dividend_yield, volatility: l.volatility });
        g.delta += l.quantity * x.delta; g.gamma += l.quantity * x.gamma; g.vega += l.quantity * x.vega / 100; g.theta += l.quantity * x.theta / 365;
        return g;
      }, { delta: 0, gamma: 0, vega: 0, theta: 0 });
      return { value: base, greeks: { ...greeks, units: "delta in shares, gamma per 1.00 spot, vega per vol point, theta per calendar day" }, rows_spot_move: spot_moves, columns_vol_shift: vol_shifts, pnl: spot_moves.map((m) => vol_shifts.map((dv) => value(spot * (1 + m), dv, dt) - base)) };
    },
  },
  {
    name: "exposure_and_hedge",
    title: "Gross, net and beta-adjusted exposure",
    description: "Summarize a long/short book's gross, net and beta-adjusted exposure and size an index hedge (futures contracts or ETF shares) that neutralizes the beta.",
    keywords: "gross exposure net exposure beta adjusted hedge ratio index futures long short book",
    input: z.object({
      positions: values, betas: z.array(z.number()).min(1).max(500).describe("Beta of each position."),
      equity: z.number().positive().optional().describe("Capital, for exposures as percent."),
      hedge_price: z.number().positive().optional().describe("Price of the hedge instrument (futures level or ETF price)."),
      hedge_multiplier: z.number().positive().optional().describe("Contract multiplier; default 1 (ETF shares)."),
      hedge_beta: z.number().positive().optional().describe("Beta of the hedge instrument; default 1."),
    }).strict(),
    run({ positions: w, betas: b, equity, hedge_price, hedge_multiplier = 1, hedge_beta = 1 }) {
      if (b.length !== w.length) throw new Error("betas need one per position.");
      const gross = w.reduce((s, v) => s + Math.abs(v), 0), net = w.reduce((s, v) => s + v, 0), long = w.filter((v) => v > 0).reduce((s, v) => s + v, 0), bnet = w.reduce((s, v, i) => s + v * b[i], 0);
      const hedgeNotional = -bnet / hedge_beta;
      return { gross, net, long, short: long - net, beta_adjusted_net: bnet, gross_percent: equity ? gross / equity * 100 : undefined, net_percent: equity ? net / equity * 100 : undefined, hedge_notional: hedgeNotional, hedge_units: hedge_price ? hedgeNotional / (hedge_price * hedge_multiplier) : undefined };
    },
  },
  {
    name: "concentration_metrics",
    title: "Concentration metrics",
    description: "Measure how concentrated a portfolio is: Herfindahl index, effective number of positions, largest and top-k shares, and the Gini coefficient of weights.",
    keywords: "concentration herfindahl hhi effective number gini top holdings diversification",
    input: z.object({ weights: z.array(z.number()).min(1).max(10000).describe("Position weights or values (absolute values are used)."), top_k: z.number().int().min(1).max(100).optional().describe("Default 10.") }).strict(),
    run({ weights, top_k = 10 }) {
      const a = weights.map(Math.abs), s = a.reduce((x, y) => x + y, 0);
      if (!(s > 0)) throw new Error("Weights sum to zero.");
      const p = a.map((x) => x / s), sorted = [...p].sort((x, y) => y - x), hhi = p.reduce((x, y) => x + y * y, 0), n = p.length;
      const asc = [...p].sort((x, y) => x - y);
      const gini = n > 1 ? (2 * asc.reduce((acc, x, i) => acc + (i + 1) * x, 0)) / n - (n + 1) / n : 0;
      return { herfindahl: hhi, effective_positions: 1 / hhi, largest_share: sorted[0], top_k_share: sorted.slice(0, top_k).reduce((x, y) => x + y, 0), gini };
    },
  },
  {
    name: "liquidation_horizon",
    title: "Liquidation horizon",
    description: "Estimate how many days each position takes to exit at a maximum share of average daily volume, and how much of the book can be liquidated within 1, 5 and 20 days.",
    keywords: "liquidity horizon days to liquidate adv participation exit risk fund liquidity",
    input: z.object({
      shares: z.array(z.number()).min(1).max(5000).describe("Shares held per position (absolute value used)."),
      prices: z.array(z.number().positive()).min(1).max(5000).describe("Price per position."),
      adv: z.array(z.number().positive()).min(1).max(5000).describe("Average daily volume in shares per position."),
      participation: z.number().gt(0).max(1).optional().describe("Maximum share of daily volume; default 0.2."),
      names,
    }).strict(),
    run({ shares, prices, adv, participation: p = 0.2, names: nm }) {
      const n = shares.length;
      if (prices.length !== n || adv.length !== n) throw new Error("shares, prices and adv need one entry per position.");
      const days = shares.map((s, i) => Math.abs(s) / (p * adv[i])), val = shares.map((s, i) => Math.abs(s) * prices[i]), tot = val.reduce((a, b) => a + b, 0);
      const within = (d) => val.reduce((acc, v, i) => acc + v * Math.min(1, d / days[i]), 0) / tot;
      return { days_to_liquidate: label(nm, days), max_days: Math.max(...days), liquid_within_1_day: within(1), liquid_within_5_days: within(5), liquid_within_20_days: within(20) };
    },
  },
];
