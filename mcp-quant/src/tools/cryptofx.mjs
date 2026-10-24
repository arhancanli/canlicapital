// Crypto and FX: perpetual funding and futures basis carry, isolated-margin liquidation prices, FX
// forwards by covered interest parity, cross rates and triangular arbitrage, pip values, carry-trade
// returns and AMM impermanent loss (constant product and concentrated ranges).
import { z } from "zod";

import { mean } from "../math.mjs";

const positive = (what) => z.number().positive().describe(what);
const quote = z.object({ bid: positive("Bid."), ask: positive("Ask.") }).strict();

export const TOOLS = [
  {
    name: "funding_rate_carry",
    title: "Perpetual funding rate carry",
    description: "Annualize perpetual-futures funding rates (simple APR and compounded APY) and compute the funding a position pays or earns over a holding period; accepts one rate or a history.",
    keywords: "funding rate perpetual perp swap annualized apr apy carry basis trade crypto",
    input: z.object({
      funding_rates: z.array(z.number().gt(-1).lt(1)).min(1).max(1000000).describe("Funding rate per interval, e.g. [0.0001, 0.00008] for 0.01% and 0.008% per 8 hours."),
      interval_hours: positive("Hours between fundings; default 8.").optional(),
      notional: positive("Position notional, for the payment.").optional(),
      side: z.enum(["long", "short"]).optional().describe("Longs pay positive funding; default long."),
      days: positive("Holding period in days, for the projected payment; default 30.").optional(),
    }).strict(),
    run({ funding_rates: f, interval_hours: h = 8, notional, side = "long", days = 30 }) {
      const per = 24 / h, avg = mean(f), apr = avg * per * 365, apy = (1 + avg) ** (per * 365) - 1;
      const sign = side === "long" ? -1 : 1, n = days * per;
      return { average_rate: avg, apr, apy, realized_compounded: f.reduce((s, r) => s * (1 + r), 1) - 1, intervals: f.length, projected_pnl: notional === undefined ? undefined : sign * notional * avg * n, positive_share: f.filter((r) => r > 0).length / f.length };
    },
  },
  {
    name: "futures_basis",
    title: "Futures basis and implied rate",
    description: "Compute a dated future's basis to spot, its annualized carry (simple and compounded) and the implied financing rate, for cash-and-carry trades.",
    keywords: "futures basis cash and carry contango backwardation implied rate annualized calendar spread",
    input: z.object({ spot: positive("Spot price."), future: positive("Futures price."), days: positive("Days to expiry."), funding_rate: z.number().gt(-1).lt(5).optional().describe("Your annual financing cost, to compare; default 0.") }).strict(),
    run({ spot, future, days, funding_rate = 0 }) {
      const b = future / spot - 1, t = days / 365;
      return { basis: future - spot, basis_percent: b * 100, annualized_simple: b / t, annualized_compounded: (future / spot) ** (1 / t) - 1, implied_continuous_rate: Math.log(future / spot) / t, net_carry_simple: b / t - funding_rate, structure: future > spot ? "contango" : future < spot ? "backwardation" : "flat" };
    },
  },
  {
    name: "liquidation_price",
    title: "Isolated-margin liquidation price",
    description: "Estimate a leveraged position's liquidation price under isolated margin: initial margin = 1/leverage, liquidated when equity falls to the maintenance rate (exchange formulas add fees and tiers).",
    keywords: "liquidation price leverage isolated margin perpetual futures maintenance margin crypto",
    input: z.object({ entry: positive("Entry price."), leverage: z.number().min(1).max(500).describe("Leverage, e.g. 10."), side: z.enum(["long", "short"]).describe("long or short."), maintenance_margin_rate: z.number().min(0).lt(1).optional().describe("Maintenance margin rate, e.g. 0.005; default 0.005.") }).strict(),
    run({ entry, leverage: L, side, maintenance_margin_rate: m = 0.005 }) {
      const p = side === "long" ? entry * (1 - 1 / L) / (1 - m) : entry * (1 + 1 / L) / (1 + m);
      return { liquidation_price: p, distance_percent: Math.abs(p / entry - 1) * 100, initial_margin_rate: 1 / L, formula: side === "long" ? "entry (1 - 1/L) / (1 - mmr)" : "entry (1 + 1/L) / (1 + mmr)" };
    },
  },
  {
    name: "fx_forward",
    title: "FX forward by covered interest parity",
    description: "Price an FX forward from spot and the two currencies' money-market rates (covered interest parity, ACT/360 or ACT/365), with forward points in pips, or back out the implied rate from a quoted forward.",
    keywords: "fx forward covered interest parity forward points pips swap implied yield currency hedge",
    input: z.object({
      spot: positive("Spot rate, quoted as quote currency per base currency, e.g. EURUSD 1.08."),
      base_rate: z.number().gt(-1).lt(5).describe("Annual money-market rate of the base currency (EUR in EURUSD)."),
      quote_rate: z.number().gt(-1).lt(5).optional().describe("Annual rate of the quote currency (USD in EURUSD); or send forward to imply it."),
      days: positive("Days to delivery."),
      forward: positive("A quoted forward, to imply the quote-currency rate.").optional(),
      basis_days: z.union([z.literal(360), z.literal(365)]).optional().describe("Day basis for both rates; default 360."),
      pip: positive("Pip size; default 0.0001.").optional(),
    }).strict(),
    run({ spot, base_rate: rb, quote_rate: rq, days, forward, basis_days: B = 360, pip = 0.0001 }) {
      const t = days / B;
      if (rq === undefined && forward === undefined) throw new Error("Send quote_rate, or forward to imply it.");
      const fwd = forward ?? spot * (1 + rq * t) / (1 + rb * t);
      const implied = forward === undefined ? undefined : ((forward / spot) * (1 + rb * t) - 1) / t;
      return { forward: fwd, forward_points_pips: (fwd - spot) / pip, annualized_forward_premium: (fwd / spot - 1) / (days / 365), implied_quote_rate: implied };
    },
  },
  {
    name: "fx_cross_rate",
    title: "FX cross rate with bid and ask",
    description: "Derive a cross rate's bid and ask from two quotes against a common currency (e.g. EURJPY from EURUSD and USDJPY), handling which side each leg is quoted on.",
    keywords: "fx cross rate bid ask currency pair triangulation eurjpy",
    input: z.object({
      leg1: quote.describe("First pair's quote, e.g. EURUSD."), leg1_pair: z.string().regex(/^[A-Z]{3}[A-Z]{3}$/).describe("First pair, e.g. EURUSD."),
      leg2: quote.describe("Second pair's quote, e.g. USDJPY."), leg2_pair: z.string().regex(/^[A-Z]{3}[A-Z]{3}$/).describe("Second pair, e.g. USDJPY."),
      target: z.string().regex(/^[A-Z]{3}[A-Z]{3}$/).describe("Wanted pair, e.g. EURJPY."),
    }).strict(),
    run({ leg1, leg1_pair, leg2, leg2_pair, target }) {
      // Each pair as a directed edge: base -> quote at bid (sell base) and ask (buy base).
      const edges = [[leg1_pair, leg1], [leg2_pair, leg2]];
      const rate = (from, to) => {
        for (const [p, q] of edges) {
          if (p.slice(0, 3) === from && p.slice(3) === to) return { bid: q.bid, ask: q.ask };
          if (p.slice(3) === from && p.slice(0, 3) === to) return { bid: 1 / q.ask, ask: 1 / q.bid };
        }
        return null;
      };
      const base = target.slice(0, 3), quoteCcy = target.slice(3);
      const ccys = new Set([leg1_pair.slice(0, 3), leg1_pair.slice(3), leg2_pair.slice(0, 3), leg2_pair.slice(3)]);
      for (const via of ccys) {
        if (via === base || via === quoteCcy) continue;
        const a = rate(base, via), b = rate(via, quoteCcy);
        if (a && b) return { pair: target, via, bid: a.bid * b.bid, ask: a.ask * b.ask, mid: (a.bid * b.bid + a.ask * b.ask) / 2, spread: a.ask * b.ask - a.bid * b.bid };
      }
      throw new Error(`Cannot build ${target} from ${leg1_pair} and ${leg2_pair}; they need one common currency.`);
    },
  },
  {
    name: "triangular_arbitrage",
    title: "Triangular arbitrage check",
    description: "Check three currency (or crypto) quotes for triangular arbitrage after spreads and fees: the return of each direction around the triangle.",
    keywords: "triangular arbitrage fx crypto three pairs cycle profit fees",
    input: z.object({
      pairs: z.array(z.object({ pair: z.string().regex(/^[A-Z0-9]{2,6}\/[A-Z0-9]{2,6}$/).describe("BASE/QUOTE, e.g. BTC/USDT."), bid: positive("Bid."), ask: positive("Ask.") }).strict()).length(3).describe("Three pairs forming a triangle."),
      fee_rate: z.number().min(0).max(0.1).optional().describe("Fee per trade as a fraction, e.g. 0.001; default 0."),
    }).strict(),
    run({ pairs, fee_rate: fee = 0 }) {
      const conv = (from, to) => {
        for (const p of pairs) {
          const [b, q] = p.pair.split("/");
          if (b === from && q === to) return p.bid * (1 - fee);
          if (q === from && b === to) return (1 / p.ask) * (1 - fee);
        }
        return null;
      };
      const ccys = [...new Set(pairs.flatMap((p) => p.pair.split("/")))];
      if (ccys.length !== 3) throw new Error("The three pairs must involve exactly three assets.");
      const [a, b, c] = ccys, cycle = (x, y, w) => { const r1 = conv(x, y), r2 = conv(y, w), r3 = conv(w, x); return r1 && r2 && r3 ? r1 * r2 * r3 - 1 : null; };
      const fwd = cycle(a, b, c), rev = cycle(a, c, b);
      return { cycles: [{ path: `${a}->${b}->${c}->${a}`, return: fwd }, { path: `${a}->${c}->${b}->${a}`, return: rev }], arbitrage: (fwd ?? -1) > 0 || (rev ?? -1) > 0 };
    },
  },
  {
    name: "pip_value",
    title: "FX pip value and position size",
    description: "Compute the value of one pip for a lot size in the account currency, and the lot size that risks a given amount over a stop distance in pips.",
    keywords: "pip value lot size forex position size stop pips account currency",
    input: z.object({
      price: positive("Current rate of the traded pair."),
      units: positive("Position size in base-currency units, e.g. 100000 for a standard lot.").optional(),
      pip: positive("Pip size; default 0.0001 (0.01 for JPY pairs).").optional(),
      quote_to_account: positive("Rate converting the quote currency into the account currency; default 1 (quote = account).").optional(),
      risk_amount: positive("Account-currency amount to risk, for sizing.").optional(),
      stop_pips: positive("Stop distance in pips, for sizing.").optional(),
    }).strict(),
    run({ price, units = 100000, pip = 0.0001, quote_to_account: q = 1, risk_amount, stop_pips }) {
      const per = units * pip * q;
      const size = risk_amount && stop_pips ? risk_amount / (stop_pips * pip * q) : undefined;
      return { pip_value: per, pip_value_per_unit: pip * q, units_for_risk: size, standard_lots_for_risk: size === undefined ? undefined : size / 100000, notional_in_quote: units * price };
    },
  },
  {
    name: "carry_trade_return",
    title: "Currency carry trade return",
    description: "Decompose a carry trade's return into the interest differential and the spot move, and find the break-even depreciation of the high-yield currency.",
    keywords: "carry trade interest rate differential fx return break even depreciation uncovered interest parity",
    input: z.object({
      funding_rate: z.number().gt(-1).lt(5).describe("Annual rate of the currency borrowed."),
      investment_rate: z.number().gt(-1).lt(5).describe("Annual rate of the currency held."),
      spot_start: positive("Spot at the start, in units of the funding currency per unit of the investment currency (e.g. JPY per USD when borrowing yen to hold dollars)."),
      spot_end: positive("Spot at the end, same quoting."),
      days: positive("Holding days."),
    }).strict(),
    run({ funding_rate: rf, investment_rate: ri, spot_start: s0, spot_end: s1, days }) {
      const t = days / 365, fx = s1 / s0 - 1, total = (1 + ri * t) * (s1 / s0) - (1 + rf * t);
      return { interest_differential: (ri - rf) * t, fx_return: fx, total_return: total, annualized: total / t, break_even_fx_move: (1 + rf * t) / (1 + ri * t) - 1 };
    },
  },
  {
    name: "impermanent_loss",
    title: "AMM impermanent loss",
    description: "Compute impermanent (divergence) loss of a liquidity position versus holding, for a constant-product pool or a concentrated range (Uniswap v3 style), given the price change.",
    keywords: "impermanent loss divergence loss amm liquidity pool uniswap v3 concentrated liquidity defi",
    input: z.object({
      price_ratio: positive("New price / entry price of the volatile asset, e.g. 1.5."),
      range_lower: positive("Lower bound of a concentrated range, as a multiple of entry price, e.g. 0.8.").optional(),
      range_upper: positive("Upper bound, e.g. 1.25.").optional(),
      fees_earned: z.number().min(0).optional().describe("Fees earned as a fraction of the deposit, to net against; default 0."),
    }).strict(),
    run({ price_ratio: k, range_lower: pa, range_upper: pb, fees_earned = 0 }) {
      let il;
      if (pa === undefined && pb === undefined) il = 2 * Math.sqrt(k) / (1 + k) - 1;
      else {
        if (!(pa < 1 && pb > 1)) throw new Error("The range must contain the entry price (range_lower < 1 < range_upper).");
        // Value of a v3 position with liquidity 1 at entry price 1, against holding the initial amounts.
        const sa = Math.sqrt(pa), sb = Math.sqrt(pb), x0 = 1 - 1 / sb, y0 = 1 - sa;
        const sp = Math.sqrt(Math.min(Math.max(k, pa), pb)), x = 1 / sp - 1 / sb, y = sp - sa;
        il = (x * k + y) / (x0 * k + y0) - 1;
      }
      return { impermanent_loss: il, net_of_fees: il + fees_earned, hodl_value_ratio: pa === undefined ? (1 + k) / 2 : undefined };
    },
  },
];
