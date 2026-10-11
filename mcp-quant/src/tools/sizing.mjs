// Position sizing and trade risk: fixed-fractional sizing from a stop, volatility targeting, optimal f,
// trade expectancy and break-even win rates, probability of a drawdown under drifted Brownian motion,
// leverage and margin, and VaR-budget position limits.
import { z } from "zod";

import { normCdf, normInv, std, sum } from "../math.mjs";
import { seriesFields, seriesFrom } from "../inputs.mjs";

const positive = (what) => z.number().positive().describe(what);

// Golden-section maximization on [a, b].
function goldenMax(f, a, b, tol = 1e-12) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  while (b - a > tol * (Math.abs(a) + Math.abs(b) + 1e-12)) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

export const TOOLS = [
  {
    name: "position_size_from_stop",
    title: "Position size from a stop loss",
    description: "Size a trade so that hitting the stop loses a fixed fraction of equity: shares, notional, capital at risk and leverage, optionally capped by a maximum position weight.",
    keywords: "position sizing stop loss fixed fractional risk per trade shares how many shares",
    input: z.object({
      equity: positive("Account equity."),
      risk_fraction: z.number().gt(0).max(1).describe("Fraction of equity to risk, e.g. 0.01 for 1%."),
      entry: positive("Entry price."),
      stop: positive("Stop price (below entry for longs, above for shorts)."),
      max_weight: z.number().gt(0).max(100).optional().describe("Cap on notional / equity, e.g. 0.2; default none."),
      lot_size: z.number().int().min(1).optional().describe("Round down to this lot; default 1."),
    }).strict(),
    run({ equity, risk_fraction, entry, stop, max_weight, lot_size = 1 }) {
      const perShare = Math.abs(entry - stop);
      if (perShare === 0) throw new Error("entry and stop are equal; risk per share is zero.");
      let shares = equity * risk_fraction / perShare;
      let capped = false;
      if (max_weight !== undefined && shares * entry > max_weight * equity) { shares = max_weight * equity / entry; capped = true; }
      shares = Math.floor(shares / lot_size) * lot_size;
      return { side: stop < entry ? "long" : "short", shares, notional: shares * entry, capital_at_risk: shares * perShare, risk_fraction_actual: shares * perShare / equity, leverage: shares * entry / equity, capped_by_max_weight: capped, stop_distance_percent: perShare / entry * 100 };
    },
  },
  {
    name: "volatility_target_size",
    title: "Volatility-targeted position",
    description: "Scale a position so its expected volatility matches a target: the weight (leverage) from the asset's volatility, shares for a given equity, optionally capped.",
    keywords: "volatility targeting vol target position scaling leverage risk budget",
    input: z.object({
      ...seriesFields,
      asset_volatility: positive("Annual volatility of the asset, if not giving returns.").optional(),
      target_volatility: positive("Annual target, e.g. 0.1."),
      equity: positive("Account equity, for shares.").optional(),
      price: positive("Asset price, for shares.").optional(),
      max_leverage: positive("Cap on the weight; default 3.").optional(),
    }).strict(),
    run(a) {
      let vol = a.asset_volatility;
      if (vol === undefined) vol = std(seriesFrom(a)) * Math.sqrt(a.periods_per_year ?? 252);
      const raw = a.target_volatility / vol, cap = a.max_leverage ?? 3, w = Math.min(raw, cap);
      return { asset_volatility: vol, weight: w, uncapped_weight: raw, capped: raw > cap, notional: a.equity ? w * a.equity : undefined, shares: a.equity && a.price ? Math.floor(w * a.equity / a.price) : undefined };
    },
  },
  {
    name: "optimal_f",
    title: "Optimal f (Ralph Vince)",
    description: "Find the fraction f of the largest loss to risk per trade that maximizes terminal wealth over a list of trade results (Vince's optimal f), with the geometric mean and the f-based position size.",
    keywords: "optimal f ralph vince terminal wealth relative twr fixed fraction trade results geometric",
    input: z.object({ trades: z.array(z.number()).min(2).max(100000).describe("Profit or loss per trade, in currency per unit traded."), equity: positive("Equity, for the units-per-trade size.").optional() }).strict(),
    run({ trades, equity }) {
      const worst = Math.min(...trades);
      if (!(worst < 0)) throw new Error("Optimal f needs at least one losing trade.");
      if (!(sum(trades) > 0)) throw new Error("The trades lose money in total; optimal f is 0.");
      const L = -worst, twr = (f) => trades.reduce((s, t) => s + Math.log(1 + f * t / L), 0);
      const f = goldenMax(twr, 0, 1 - 1e-12);
      return { optimal_f: f, terminal_wealth_relative: Math.exp(twr(f)), geometric_mean_per_trade: Math.exp(twr(f) / trades.length), largest_loss: L, dollars_per_unit: L / f, units: equity ? equity * f / L : undefined, warning: "Optimal f maximizes growth on these trades only; it is far too aggressive out of sample. Most traders use a fraction of it." };
    },
  },
  {
    name: "trade_expectancy",
    title: "Trade expectancy and break-even win rate",
    description: "Compute a trading rule's expectancy per trade after costs, the break-even win rate for its payoff, and the payoff needed at its win rate.",
    keywords: "expectancy win rate payoff ratio break even edge reward risk trading costs",
    input: z.object({
      win_rate: z.number().min(0).max(1).describe("Share of winning trades, e.g. 0.45."),
      average_win: positive("Average winning trade."),
      average_loss: positive("Average losing trade (as a positive number)."),
      cost_per_trade: z.number().min(0).optional().describe("Round-trip cost per trade; default 0."),
    }).strict(),
    run({ win_rate: p, average_win: w, average_loss: l, cost_per_trade: c = 0 }) {
      const e = p * w - (1 - p) * l - c;
      return { expectancy: e, expectancy_r: e / l, payoff_ratio: w / l, break_even_win_rate: (l + c) / (w + l), required_payoff_at_win_rate: p > 0 ? ((1 - p) * l + c) / (p * l) : null, profit_factor: (1 - p) * l > 0 ? p * w / ((1 - p) * l) : null };
    },
  },
  {
    name: "drawdown_probability",
    title: "Probability of a drawdown",
    description: "Estimate the probability that a strategy with a given return and volatility ever falls a given fraction below its starting equity (drifted Brownian motion, continuous), and within a horizon.",
    keywords: "risk of ruin drawdown probability brownian motion ever lose percent account",
    input: z.object({
      annual_return: z.number().gt(-1).lt(10).describe("Expected annual arithmetic return, e.g. 0.1."),
      annual_volatility: positive("Annual volatility, e.g. 0.2."),
      drawdown: z.number().gt(0).lt(1).describe("Loss from the start, e.g. 0.3 for 30%."),
      years: positive("Horizon in years for the finite-horizon probability; default 1.").optional(),
    }).strict(),
    run({ annual_return: mu, annual_volatility: s, drawdown: D, years: T = 1 }) {
      const m = mu - s * s / 2, x = -Math.log(1 - D);
      const ever = m <= 0 ? 1 : Math.exp(-2 * m * x / (s * s));
      // First-passage probability of a Brownian motion with drift m below -x by time T.
      const within = normCdf((-x - m * T) / (s * Math.sqrt(T))) + Math.exp(-2 * m * x / (s * s)) * normCdf((-x + m * T) / (s * Math.sqrt(T)));
      return { log_drift: m, probability_ever: ever, probability_within_horizon: within, horizon_years: T };
    },
  },
  {
    name: "leverage_and_margin",
    title: "Leverage, margin and liquidation distance",
    description: "Compute leverage, initial and maintenance margin, free margin, and the adverse price move that triggers a margin call for a leveraged position.",
    keywords: "leverage margin call maintenance margin initial margin liquidation distance futures cfd",
    input: z.object({
      notional: positive("Position notional value."),
      equity: positive("Account equity backing it."),
      initial_margin_rate: z.number().gt(0).max(1).describe("Initial margin as a share of notional, e.g. 0.1."),
      maintenance_margin_rate: z.number().gt(0).max(1).describe("Maintenance margin as a share of notional, e.g. 0.05."),
    }).strict(),
    run({ notional: N, equity: E, initial_margin_rate: im, maintenance_margin_rate: mm }) {
      // Margin call when E - N d < mm N (1 - d) for a long; solve d.
      const d = (E - mm * N) / (N * (1 - mm));
      return { leverage: N / E, initial_margin: im * N, maintenance_margin: mm * N, free_margin: E - im * N, can_open: E >= im * N, adverse_move_to_margin_call: d, already_in_call: d <= 0 };
    },
  },
  {
    name: "var_position_limit",
    title: "Position limit from a VaR budget",
    description: "Find the largest position whose one-day (or n-day) parametric value at risk stays within a budget, given the asset's volatility.",
    keywords: "var limit position limit risk budget value at risk maximum position",
    input: z.object({
      var_budget: positive("Maximum acceptable VaR in currency."),
      annual_volatility: positive("Asset annual volatility."),
      confidence: z.number().gt(0.5).lt(1).optional().describe("Default 0.99."),
      days: positive("Horizon in trading days; default 1.").optional(),
      price: positive("Price, for shares.").optional(),
    }).strict(),
    run({ var_budget: B, annual_volatility: s, confidence: c = 0.99, days = 1, price }) {
      const z = normInv(c), hv = s * Math.sqrt(days / 252), max = B / (z * hv);
      return { max_notional: max, max_shares: price ? Math.floor(max / price) : undefined, horizon_volatility: hv, z };
    },
  },
];

