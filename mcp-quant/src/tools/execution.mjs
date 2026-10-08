// Execution and market microstructure: Almgren-Chriss optimal liquidation, square-root impact,
// implementation shortfall, schedule splitting, spread and illiquidity estimators from public data,
// Kyle's lambda and order-book walk-throughs. Prices in currency units; volumes in shares.
import { z } from "zod";

import { leastSquares, mean, sum } from "../math.mjs";
import { MAX_SERIES } from "../inputs.mjs";

const positive = (what) => z.number().positive().describe(what);
const series = (what, min = 3) => z.array(z.number()).min(min).max(MAX_SERIES).describe(what);
const level = z.tuple([z.number().positive(), z.number().positive()]).describe("[price, size]");

function almgrenChriss({ shares: X, periods: N, period_length: tau = 1, volatility: sigma, temporary_impact: eta, permanent_impact: gamma = 0, fixed_cost: eps = 0, risk_aversion: lam }) {
  const etaT = eta * (1 - gamma * tau / (2 * eta));
  if (!(etaT > 0)) throw new Error("temporary_impact is too small relative to permanent_impact x period_length / 2.");
  const kt2 = lam * sigma * sigma / etaT;
  const kappa = kt2 === 0 ? 0 : Math.acosh(kt2 * tau * tau / 2 + 1) / tau, T = N * tau;
  const x = Array.from({ length: N + 1 }, (_, j) => (kappa === 0 ? X * (1 - j / N) : X * Math.sinh(kappa * (T - j * tau)) / Math.sinh(kappa * T)));
  const n = x.slice(1).map((v, k) => x[k] - v);
  const cost = 0.5 * gamma * X * X + eps * sum(n.map(Math.abs)) + etaT / tau * sum(n.map((v) => v * v));
  const variance = sigma * sigma * tau * sum(x.slice(1).map((v) => v * v));
  return { kappa, holdings: x, trades: n, expected_cost: cost, cost_variance: variance, cost_std: Math.sqrt(variance), half_life_periods: kappa > 0 ? Math.log(2) / (kappa * tau) : null };
}

function walkBook(levels, size) {
  let left = size, cost = 0, worst = null;
  for (const [p, q] of levels) { const take = Math.min(left, q); cost += take * p; left -= take; worst = p; if (left <= 0) break; }
  return { filled: size - left, average_price: size - left > 0 ? cost / (size - left) : null, worst_price: worst, unfilled: left };
}

export const TOOLS = [
  {
    name: "almgren_chriss_schedule",
    title: "Almgren-Chriss optimal execution",
    description: "Compute the Almgren-Chriss optimal liquidation schedule for a block: holdings and trades per period, expected impact cost and its standard deviation for a given risk aversion.",
    keywords: "almgren chriss optimal execution liquidation schedule market impact risk aversion trajectory",
    input: z.object({
      shares: positive("Shares to sell (or buy), e.g. 1000000."),
      periods: z.number().int().min(1).max(10000).describe("Number of trading intervals, e.g. 10."),
      period_length: positive("Length of each interval in the units of volatility (e.g. days); default 1.").optional(),
      volatility: positive("Price volatility per unit time in currency, e.g. 0.95 ($/share/sqrt(day))."),
      temporary_impact: positive("Temporary impact eta: price concession per (share per unit time), e.g. 2.5e-6."),
      permanent_impact: z.number().min(0).optional().describe("Permanent impact gamma per share, e.g. 2.5e-7; default 0."),
      fixed_cost: z.number().min(0).optional().describe("Fixed cost per share (half spread + fees), e.g. 0.0625; default 0."),
      risk_aversion: z.number().min(0).describe("Lambda, e.g. 1e-6; 0 gives the straight-line (TWAP) schedule."),
    }).strict(),
    run: (a) => almgrenChriss(a),
  },
  {
    name: "market_impact_estimate",
    title: "Square-root market impact",
    description: "Estimate the cost of an order with the square-root impact law (cost = Y x volatility x sqrt(order / daily volume)) plus half the spread, in basis points and currency.",
    keywords: "market impact square root law trading cost slippage estimate participation adv",
    input: z.object({
      order_shares: positive("Order size in shares."),
      daily_volume: positive("Average daily volume in shares."),
      daily_volatility: positive("Daily return volatility, e.g. 0.02."),
      price: positive("Price per share."),
      spread_bps: z.number().min(0).max(10000).optional().describe("Quoted spread in basis points; default 0."),
      coefficient: z.number().positive().max(10).optional().describe("Y, the impact coefficient; default 1 (typical range 0.5-1)."),
    }).strict(),
    run({ order_shares: Q, daily_volume: V, daily_volatility: s, price, spread_bps = 0, coefficient: Y = 1 }) {
      const impact = Y * s * Math.sqrt(Q / V) * 1e4, total = impact + spread_bps / 2;
      return { participation_of_adv: Q / V, impact_bps: impact, half_spread_bps: spread_bps / 2, total_bps: total, total_cost: total / 1e4 * Q * price, warning: Q / V > 0.1 ? "Above 10% of daily volume the square-root law is extrapolating; split the order across days." : undefined };
    },
  },
  {
    name: "implementation_shortfall",
    title: "Implementation shortfall",
    description: "Measure an executed order's implementation shortfall against the decision price, split into delay, execution (impact), opportunity cost of unfilled shares and fees.",
    keywords: "implementation shortfall perold transaction cost analysis tca slippage arrival price delay opportunity cost",
    input: z.object({
      side: z.enum(["buy", "sell"]).describe("buy or sell."),
      order_shares: positive("Shares the decision called for."),
      decision_price: positive("Price when the decision was made."),
      arrival_price: positive("Price when the order reached the market."),
      fills: z.array(level).min(0).max(100000).describe("Executions as [price, shares]."),
      final_price: positive("Price at the end of the horizon, for unfilled shares."),
      fees: z.number().min(0).optional().describe("Total explicit fees in currency; default 0."),
    }).strict(),
    run({ side, order_shares: Q, decision_price: Pd, arrival_price: Pa, fills, final_price: Pf, fees = 0 }) {
      const s = side === "buy" ? 1 : -1, filled = sum(fills.map((f) => f[1]));
      if (filled > Q * (1 + 1e-12)) throw new Error("Fills exceed the order size.");
      const avg = filled > 0 ? sum(fills.map(([p, q]) => p * q)) / filled : null;
      const delay = s * (Pa - Pd) * filled, execution = filled > 0 ? s * (avg - Pa) * filled : 0, opp = s * (Pf - Pd) * (Q - filled);
      const total = delay + execution + opp + fees, paper = Q * Pd;
      return { filled_shares: filled, fill_rate: filled / Q, average_fill_price: avg, delay_cost: delay, execution_cost: execution, opportunity_cost: opp, fees, total_shortfall: total, shortfall_bps: total / paper * 1e4, execution_bps_vs_arrival: filled > 0 ? s * (avg / Pa - 1) * 1e4 : null };
    },
  },
  {
    name: "execution_schedule",
    title: "TWAP / VWAP order schedule",
    description: "Split an order across time buckets evenly (TWAP) or by an expected volume profile (VWAP), capped at a maximum participation rate, with what cannot be done within the horizon.",
    keywords: "twap vwap schedule order slicing volume profile participation algorithm child orders",
    input: z.object({
      order_shares: positive("Total shares."),
      bucket_volumes: z.array(z.number().min(0)).min(1).max(10000).describe("Expected market volume per bucket (for VWAP) or any equal numbers (TWAP)."),
      max_participation: z.number().gt(0).max(1).optional().describe("Cap per bucket as a share of its volume, e.g. 0.1; default none."),
      method: z.enum(["vwap", "twap"]).optional().describe("Default vwap."),
    }).strict(),
    run({ order_shares: Q, bucket_volumes: v, max_participation: cap, method = "vwap" }) {
      const tot = sum(v), k = v.length;
      let plan = v.map((x) => (method === "twap" ? Q / k : tot > 0 ? Q * x / tot : Q / k));
      if (cap !== undefined) {
        // Cap each bucket and push the excess into later buckets with room.
        let carry = 0;
        plan = plan.map((x, i) => { const want = x + carry, room = cap * v[i]; const take = Math.min(want, room); carry = want - take; return take; });
        return { schedule: plan, participation: plan.map((x, i) => (v[i] > 0 ? x / v[i] : null)), unscheduled_shares: carry };
      }
      return { schedule: plan, participation: plan.map((x, i) => (v[i] > 0 ? x / v[i] : null)), unscheduled_shares: 0 };
    },
  },
  {
    name: "spread_estimators",
    title: "Bid-ask spread from prices (Roll, Corwin-Schultz)",
    description: "Estimate the effective bid-ask spread from trade prices alone (Roll 1984) and from daily highs and lows (Corwin-Schultz 2012) when quotes are not available.",
    keywords: "bid ask spread estimator roll corwin schultz high low effective spread liquidity",
    input: z.object({ close: series("Closing prices, oldest first."), high: series("Daily highs.").optional(), low: series("Daily lows.").optional() }).strict(),
    run({ close: c, high: h, low: l }) {
      const dp = c.slice(1).map((v, i) => v - c[i]), a = dp.slice(1), b = dp.slice(0, -1), ma = mean(a), mb = mean(b);
      const cv = sum(a.map((v, i) => (v - ma) * (b[i] - mb))) / (a.length - 1);
      const roll = cv < 0 ? 2 * Math.sqrt(-cv) : null;
      let cs = null;
      if (h && l) {
        if (h.length !== c.length || l.length !== c.length) throw new Error("high, low and close need the same length.");
        const k = 3 - 2 * Math.SQRT2, est = [];
        for (let t = 0; t + 1 < h.length; t++) {
          const beta = Math.log(h[t] / l[t]) ** 2 + Math.log(h[t + 1] / l[t + 1]) ** 2;
          const gamma = Math.log(Math.max(h[t], h[t + 1]) / Math.min(l[t], l[t + 1])) ** 2;
          const alpha = (Math.sqrt(2 * beta) - Math.sqrt(beta)) / k - Math.sqrt(gamma / k);
          est.push(Math.max(0, 2 * (Math.exp(alpha) - 1) / (1 + Math.exp(alpha))));
        }
        cs = mean(est);
      }
      return { roll_spread: roll, roll_spread_relative: roll === null ? null : roll / mean(c), corwin_schultz_spread_relative: cs, note: roll === null ? "Roll's estimator is undefined when price changes are positively autocorrelated." : undefined };
    },
  },
  {
    name: "liquidity_measures",
    title: "Amihud illiquidity and Kyle's lambda",
    description: "Measure price impact per unit of trading: Amihud illiquidity (|return| per currency traded) and Kyle's lambda (price change per signed volume, by regression).",
    keywords: "amihud illiquidity kyle lambda price impact liquidity measure signed volume",
    input: z.object({
      returns: series("Periodic returns."),
      dollar_volume: series("Traded value per period (price x volume)."),
      price_changes: series("Price changes per period, for Kyle's lambda.").optional(),
      signed_volume: series("Signed volume per period (buys minus sells), for Kyle's lambda.").optional(),
    }).strict(),
    run({ returns: r, dollar_volume: dv, price_changes: dp, signed_volume: sv }) {
      if (r.length !== dv.length) throw new Error("returns and dollar_volume need the same length.");
      const am = mean(r.map((x, i) => (dv[i] > 0 ? Math.abs(x) / dv[i] : 0)).filter((_, i) => dv[i] > 0)) * 1e6;
      let lambda = null;
      if (dp && sv) { if (dp.length !== sv.length) throw new Error("price_changes and signed_volume need the same length."); lambda = leastSquares(sv.map((v) => [1, v]), dp).coef[1]; }
      return { amihud_per_million: am, kyle_lambda: lambda };
    },
  },
  {
    name: "order_book_analysis",
    title: "Order book walk and microprice",
    description: "Analyze an order book snapshot: mid, spread, microprice, depth imbalance, and the average fill price and slippage of a market order of a given size walking the book.",
    keywords: "order book depth microprice imbalance slippage walk the book market order level 2",
    input: z.object({
      bids: z.array(level).min(1).max(5000).describe("Bid levels as [price, size], best first."),
      asks: z.array(level).min(1).max(5000).describe("Ask levels as [price, size], best first."),
      order_size: positive("Size of a market order to simulate.").optional(),
      side: z.enum(["buy", "sell"]).optional().describe("Side of the simulated order; default buy."),
    }).strict(),
    run({ bids, asks, order_size, side = "buy" }) {
      const [bb, bq] = bids[0], [ba, aq] = asks[0];
      if (!(ba > bb)) throw new Error("The best ask must be above the best bid.");
      const mid = (bb + ba) / 2, bidDepth = sum(bids.map((l) => l[1])), askDepth = sum(asks.map((l) => l[1]));
      const out = { mid, spread: ba - bb, spread_bps: (ba - bb) / mid * 1e4, microprice: (bb * aq + ba * bq) / (bq + aq), top_imbalance: (bq - aq) / (bq + aq), depth_imbalance: (bidDepth - askDepth) / (bidDepth + askDepth), bid_depth: bidDepth, ask_depth: askDepth };
      if (order_size !== undefined) {
        const w = walkBook(side === "buy" ? asks : bids, order_size);
        Object.assign(out, { fill: w, slippage_bps_vs_mid: w.average_price === null ? null : (side === "buy" ? 1 : -1) * (w.average_price / mid - 1) * 1e4 });
      }
      return out;
    },
  },
];
