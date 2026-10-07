// Options and derivatives: European pricing under Black-Scholes-Merton (continuous dividend yield),
// Black-76 on futures and Bachelier (normal) models, implied volatility, American options on a
// Cox-Ross-Rubinstein tree, cash-or-nothing digitals, multi-leg payoffs and put-call parity.
// Rates and yields are annual, continuously compounded; time is in years; volatility annual.
import { z } from "zod";

import { normCdf, normPdf } from "../math.mjs";

const kind = z.enum(["call", "put"]).describe("call or put.");
const S = z.number().positive().describe("Spot price of the underlying, e.g. 100.");
const K = z.number().positive().describe("Strike, e.g. 105.");
const T = z.number().positive().max(100).describe("Years to expiry, e.g. 0.25 for three months.");
const r = z.number().gt(-1).lt(1).optional().describe("Risk-free rate, continuous, e.g. 0.04; default 0.");
const q = z.number().gt(-1).lt(1).optional().describe("Dividend yield (or foreign rate for FX), continuous; default 0.");
const vol = z.number().positive().max(20).describe("Annual volatility, e.g. 0.2 for 20%.");

// Black-Scholes-Merton price and Greeks. vega and rho per 1.00 change (divide by 100 for per point);
// theta per year (divide by 365 for per calendar day).
export function bsm({ type, spot, strike, years, rate = 0, dividend_yield = 0, volatility }) {
  const sq = volatility * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate - dividend_yield + 0.5 * volatility * volatility) * years) / sq;
  const d2 = d1 - sq;
  const dq = Math.exp(-dividend_yield * years), dr = Math.exp(-rate * years);
  const pdf = normPdf(d1);
  const call = type === "call";
  const price = call ? spot * dq * normCdf(d1) - strike * dr * normCdf(d2) : strike * dr * normCdf(-d2) - spot * dq * normCdf(-d1);
  const delta = call ? dq * normCdf(d1) : -dq * normCdf(-d1);
  const gamma = dq * pdf / (spot * sq);
  const vega = spot * dq * pdf * Math.sqrt(years);
  const theta = call
    ? -spot * dq * pdf * volatility / (2 * Math.sqrt(years)) - rate * strike * dr * normCdf(d2) + dividend_yield * spot * dq * normCdf(d1)
    : -spot * dq * pdf * volatility / (2 * Math.sqrt(years)) + rate * strike * dr * normCdf(-d2) - dividend_yield * spot * dq * normCdf(-d1);
  const rho = call ? strike * years * dr * normCdf(d2) : -strike * years * dr * normCdf(-d2);
  const vanna = -dq * pdf * d2 / volatility;
  const volga = vega * d1 * d2 / volatility;
  const charm = call
    ? dividend_yield * dq * normCdf(d1) - dq * pdf * (2 * (rate - dividend_yield) * years - d2 * sq) / (2 * years * sq)
    : -dividend_yield * dq * normCdf(-d1) - dq * pdf * (2 * (rate - dividend_yield) * years - d2 * sq) / (2 * years * sq);
  const speed = -gamma / spot * (d1 / sq + 1);
  return { price, delta, gamma, vega, theta, rho, vanna, volga, charm, speed, d1, d2, prob_itm: call ? normCdf(d2) : normCdf(-d2) };
}

function black76({ type, forward, strike, years, rate = 0, volatility }) {
  const sq = volatility * Math.sqrt(years);
  const d1 = (Math.log(forward / strike) + 0.5 * volatility * volatility * years) / sq, d2 = d1 - sq;
  const df = Math.exp(-rate * years), call = type === "call";
  const price = df * (call ? forward * normCdf(d1) - strike * normCdf(d2) : strike * normCdf(-d2) - forward * normCdf(-d1));
  return { price, delta: df * (call ? normCdf(d1) : -normCdf(-d1)), gamma: df * normPdf(d1) / (forward * sq), vega: df * forward * normPdf(d1) * Math.sqrt(years), d1, d2 };
}

function bachelier({ type, forward, strike, years, rate = 0, normal_volatility }) {
  const sq = normal_volatility * Math.sqrt(years), d = (forward - strike) / sq, df = Math.exp(-rate * years), call = type === "call";
  const price = df * (call ? (forward - strike) * normCdf(d) + sq * normPdf(d) : (strike - forward) * normCdf(-d) + sq * normPdf(d));
  return { price, delta: df * (call ? normCdf(d) : -normCdf(-d)), gamma: df * normPdf(d) / sq, vega: df * Math.sqrt(years) * normPdf(d), d };
}

// Implied volatility by safeguarded Newton (bisection fallback) on the BSM price.
export function impliedVol(a) {
  const { type, spot, strike, years, rate = 0, dividend_yield = 0, price } = a;
  const dq = Math.exp(-dividend_yield * years), dr = Math.exp(-rate * years);
  const lower = type === "call" ? Math.max(0, spot * dq - strike * dr) : Math.max(0, strike * dr - spot * dq);
  const upper = type === "call" ? spot * dq : strike * dr;
  if (!(price > lower) || !(price < upper)) throw new Error(`price ${price} is outside the no-arbitrage bounds (${lower}, ${upper}) for this ${type}; no volatility gives it.`);
  let lo = 1e-6, hi = 10, v = Math.sqrt((2 * Math.abs(Math.log(spot / strike) + (rate - dividend_yield) * years)) / years) || 0.2;
  if (!(v > lo && v < hi)) v = 0.2;
  for (let i = 0; i < 100; i++) {
    const p = bsm({ type, spot, strike, years, rate, dividend_yield, volatility: v });
    const diff = p.price - price;
    if (Math.abs(diff) < 1e-12 * Math.max(1, price)) return { implied_volatility: v, iterations: i };
    if (diff > 0) hi = v; else lo = v;
    let next = v - diff / p.vega;
    if (!(next > lo && next < hi) || p.vega < 1e-12) next = 0.5 * (lo + hi);
    if (Math.abs(next - v) < 1e-15) return { implied_volatility: next, iterations: i };
    v = next;
  }
  return { implied_volatility: v, iterations: 100 };
}

// Cox-Ross-Rubinstein binomial tree, European or American exercise. With bbs, the last step uses the
// closed-form Black-Scholes value instead of the payoff (binomial Black-Scholes, Broadie and
// Detemple 1996), which removes the tree's odd-even oscillation.
export function crr({ type, spot, strike, years, rate = 0, dividend_yield = 0, volatility, steps = 500, american = true, bbs = false }) {
  const dt = years / steps, u = Math.exp(volatility * Math.sqrt(dt)), d = 1 / u;
  const p = (Math.exp((rate - dividend_yield) * dt) - d) / (u - d), disc = Math.exp(-rate * dt);
  if (!(p > 0 && p < 1)) throw new Error("The tree's risk-neutral probability falls outside 0 to 1; use more steps.");
  const call = type === "call";
  const exercise = (s) => Math.max(0, call ? s - strike : strike - s);
  let n0 = steps;
  const v = new Float64Array(steps + 1);
  if (bbs) {
    n0 = steps - 1;
    for (let i = 0; i <= n0; i++) {
      const s = spot * u ** (n0 - 2 * i);
      const euro = bsm({ type, spot: s, strike, years: dt, rate, dividend_yield, volatility }).price;
      v[i] = american ? Math.max(euro, exercise(s)) : euro;
    }
  } else {
    for (let i = 0; i <= steps; i++) v[i] = exercise(spot * u ** (steps - 2 * i));
  }
  for (let n = n0 - 1; n >= 0; n--) {
    for (let i = 0; i <= n; i++) {
      let cont = disc * (p * v[i] + (1 - p) * v[i + 1]);
      if (american) cont = Math.max(cont, exercise(spot * u ** (n - 2 * i)));
      v[i] = cont;
    }
  }
  return v[0];
}

// Binomial Black-Scholes with Richardson extrapolation (BBSR): 2 V(2n) - V(n).
export function americanPrice(a) {
  const n = a.steps ?? 1000;
  return 2 * crr({ ...a, steps: 2 * n, bbs: true }) - crr({ ...a, steps: n, bbs: true });
}

const bsInput = z.object({ type: kind, spot: S, strike: K, years: T, rate: r, dividend_yield: q, volatility: vol }).strict();

export const TOOLS = [
  {
    name: "black_scholes",
    title: "Black-Scholes price and Greeks",
    description: "Price a European option under Black-Scholes-Merton with a dividend yield, with delta, gamma, vega, theta, rho, vanna, volga, charm, speed and the risk-neutral probability of finishing in the money.",
    keywords: "black scholes merton bsm option price greeks delta gamma vega theta rho european",
    input: bsInput,
    run: (a) => ({ ...bsm(a), units: "vega and rho per 1.00 (x0.01 per point); theta per year (/365 per day); charm per year." }),
  },
  {
    name: "implied_volatility",
    title: "Implied volatility",
    description: "Solve for the Black-Scholes-Merton implied volatility of a European option from its price, refusing prices outside no-arbitrage bounds.",
    keywords: "implied volatility iv solve option price invert",
    input: z.object({ type: kind, spot: S, strike: K, years: T, rate: r, dividend_yield: q, price: z.number().positive().describe("Option price, e.g. 4.25.") }).strict(),
    run: (a) => impliedVol(a),
  },
  {
    name: "black76",
    title: "Black-76 (options on futures)",
    description: "Price a European option on a futures or forward with Black-76, with delta, gamma and vega; also used for caps, floors and swaptions on a forward rate.",
    keywords: "black 76 futures forward option commodity cap floor swaption",
    input: z.object({ type: kind, forward: z.number().positive().describe("Futures or forward price, e.g. 80."), strike: K, years: T, rate: r, volatility: vol }).strict(),
    run: (a) => black76(a),
  },
  {
    name: "bachelier",
    title: "Bachelier (normal model)",
    description: "Price a European option under the Bachelier normal model, which allows negative forwards (rates, spreads), with delta, gamma and vega.",
    keywords: "bachelier normal model negative rates spread option",
    input: z.object({ type: kind, forward: z.number().describe("Forward level; may be negative, e.g. 0.015."), strike: z.number().describe("Strike, e.g. 0.02."), years: T, rate: r, normal_volatility: z.number().positive().describe("Absolute annual volatility, e.g. 0.008 for 80 bp.") }).strict(),
    run: (a) => bachelier(a),
  },
  {
    name: "american_option",
    title: "American option (binomial tree)",
    description: "Price an American option with a dividend yield (binomial Black-Scholes with Richardson extrapolation), with the European price and the early-exercise premium.",
    keywords: "american option binomial tree crr early exercise",
    input: z.object({ type: kind, spot: S, strike: K, years: T, rate: r, dividend_yield: q, volatility: vol, steps: z.number().int().min(10).max(5000).optional().describe("Tree steps; default 1000.") }).strict(),
    run(a) {
      const am = americanPrice(a);
      const eu = bsm(a).price;
      return { price: am, european_price: eu, early_exercise_premium: Math.max(0, am - eu), steps: a.steps ?? 1000, method: "binomial Black-Scholes with Richardson extrapolation (Broadie and Detemple 1996) on a CRR tree of steps and 2 x steps; european_price closed-form." };
    },
  },
  {
    name: "digital_option",
    title: "Digital (binary) option",
    description: "Price a European cash-or-nothing or asset-or-nothing digital option under Black-Scholes-Merton, with delta.",
    keywords: "digital binary cash or nothing asset or nothing",
    input: z.object({ type: kind, payout: z.enum(["cash", "asset"]).optional().describe("cash (default) pays 1 per unit; asset pays the underlying."), spot: S, strike: K, years: T, rate: r, dividend_yield: q, volatility: vol }).strict(),
    run(a) {
      const { d1, d2 } = bsm(a), call = a.type === "call", rr = a.rate ?? 0, qq = a.dividend_yield ?? 0;
      const sq = a.volatility * Math.sqrt(a.years);
      if ((a.payout ?? "cash") === "cash") {
        const df = Math.exp(-rr * a.years);
        return { price: df * normCdf(call ? d2 : -d2), delta: (call ? 1 : -1) * df * normPdf(d2) / (a.spot * sq) };
      }
      const dq = Math.exp(-qq * a.years);
      return { price: a.spot * dq * normCdf(call ? d1 : -d1), delta: dq * normCdf(call ? d1 : -d1) + (call ? 1 : -1) * dq * normPdf(d1) / sq };
    },
  },
  {
    name: "put_call_parity",
    title: "Put-call parity check",
    description: "Check put-call parity for a European pair: the parity gap, the implied forward and the implied rate-minus-yield, to spot mispricing or stale quotes.",
    keywords: "put call parity arbitrage forward conversion reversal",
    input: z.object({ call: z.number().nonnegative().describe("Call price."), put: z.number().nonnegative().describe("Put price."), spot: S, strike: K, years: T, rate: r, dividend_yield: q }).strict(),
    run(a) {
      const dr = Math.exp(-(a.rate ?? 0) * a.years), dq = Math.exp(-(a.dividend_yield ?? 0) * a.years);
      const gap = a.call - a.put - (a.spot * dq - a.strike * dr);
      const fwd = (a.call - a.put) / dr + a.strike;
      return { parity_gap: gap, implied_forward: fwd, implied_carry: Math.log(fwd / a.spot) / a.years, meaning: "parity_gap = C - P - (S e^-qT - K e^-rT); positive means the call is rich relative to the put." };
    },
  },
  {
    name: "option_strategy_payoff",
    title: "Multi-leg strategy payoff",
    description: "Evaluate a multi-leg options position at expiry (calls, puts, underlying): net premium, payoff and profit at chosen prices, breakevens, and maximum profit and loss.",
    keywords: "strategy payoff spread straddle strangle butterfly condor collar covered call breakeven expiry",
    input: z.object({
      legs: z.array(z.object({
        type: z.enum(["call", "put", "underlying"]).describe("Leg type."),
        strike: z.number().positive().optional().describe("Strike, for options."),
        quantity: z.number().describe("Signed: +1 long, -1 short."),
        premium: z.number().nonnegative().optional().describe("Price paid or received per unit; for underlying, the entry price."),
      }).strict()).min(1).max(20).describe("Legs, e.g. [{type:'call',strike:100,quantity:1,premium:5},{type:'call',strike:110,quantity:-1,premium:2}]."),
      prices: z.array(z.number().nonnegative()).max(200).optional().describe("Expiry prices to evaluate; default a grid around the strikes."),
    }).strict(),
    run(a) {
      const legs = a.legs;
      for (const l of legs) if (l.type !== "underlying" && l.strike === undefined) throw new Error("Every option leg needs a strike.");
      const pay = (s) => legs.reduce((t, l) => t + l.quantity * (l.type === "call" ? Math.max(0, s - l.strike) : l.type === "put" ? Math.max(0, l.strike - s) : s), 0);
      const cost = legs.reduce((t, l) => t + l.quantity * (l.premium ?? 0), 0);
      const profit = (s) => pay(s) - cost;
      const kinks = [...new Set(legs.filter((l) => l.strike !== undefined).map((l) => l.strike))].sort((x, y) => x - y);
      const top = (kinks[kinks.length - 1] ?? Math.max(...legs.map((l) => l.premium ?? 1))) * 2;
      const pts = [0, ...kinks, top];
      // Breakevens: sign changes of profit between kink points (profit is piecewise linear).
      const be = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const x0 = pts[i], x1 = pts[i + 1], y0 = profit(x0), y1 = profit(x1);
        if (y0 === 0) be.push(x0);
        if ((y0 < 0 && y1 > 0) || (y0 > 0 && y1 < 0)) be.push(x0 + (x1 - x0) * (-y0) / (y1 - y0));
      }
      const slope = legs.reduce((t, l) => t + l.quantity * (l.type === "put" ? 0 : 1), 0);
      const vals = pts.map(profit);
      const grid = a.prices ?? Array.from({ length: 11 }, (_, i) => top * i / 10);
      return {
        net_premium: cost, breakevens: [...new Set(be.map((x) => Number(x.toPrecision(12))))],
        max_profit: slope > 0 ? "unbounded" : Math.max(...vals), max_loss: slope < 0 ? "unbounded" : Math.min(...vals),
        columns: ["price", "payoff", "profit"], rows: grid.map((s) => [s, pay(s), profit(s)]),
        meaning: "At expiry, per unit of quantity; net_premium > 0 is a debit. Unbounded when the position keeps gaining or losing as the price rises.",
      };
    },
  },
  {
    name: "option_portfolio_greeks",
    title: "Portfolio Greeks",
    description: "Aggregate Black-Scholes-Merton Greeks across many option positions on one underlying: net delta, gamma, vega, theta, rho and the dollar delta and gamma.",
    keywords: "portfolio greeks aggregate book risk delta hedge",
    input: z.object({
      spot: S, rate: r, dividend_yield: q,
      positions: z.array(z.object({ type: kind, strike: K, years: T, volatility: vol, quantity: z.number().describe("Signed contracts or units."), multiplier: z.number().positive().optional().describe("Contract multiplier; default 1 (100 for US equity options).") }).strict()).min(1).max(500).describe("Option positions."),
    }).strict(),
    run(a) {
      const tot = { value: 0, delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
      for (const p of a.positions) {
        const g = bsm({ type: p.type, spot: a.spot, strike: p.strike, years: p.years, rate: a.rate, dividend_yield: a.dividend_yield, volatility: p.volatility });
        const m = p.quantity * (p.multiplier ?? 1);
        tot.value += m * g.price; tot.delta += m * g.delta; tot.gamma += m * g.gamma; tot.vega += m * g.vega; tot.theta += m * g.theta; tot.rho += m * g.rho;
      }
      return { ...tot, dollar_delta: tot.delta * a.spot, dollar_gamma_1pct: 0.5 * tot.gamma * (0.01 * a.spot) ** 2, hedge_units_of_underlying: -tot.delta, units: "Greeks summed in underlying units x multiplier; vega and rho per 1.00, theta per year." };
    },
  },
  {
    name: "volatility_conversions",
    title: "Volatility conversions",
    description: "Convert volatility between periods and forms: annual to daily, weekly or monthly, the expected move over a horizon, and lognormal to approximate normal (basis point) volatility.",
    keywords: "volatility convert annualize daily expected move straddle normal lognormal bp",
    input: z.object({
      annual_volatility: vol,
      level: z.number().positive().optional().describe("Price or rate level, for expected move and normal volatility, e.g. 100."),
      days: z.number().positive().max(10000).optional().describe("Horizon in trading days; default 1."),
      trading_days: z.number().positive().optional().describe("Trading days per year; default 252."),
    }).strict(),
    run(a) {
      const n = a.trading_days ?? 252, d = a.days ?? 1, s = a.annual_volatility;
      const out = { daily: s / Math.sqrt(n), weekly: s / Math.sqrt(52), monthly: s / Math.sqrt(12), over_horizon: s * Math.sqrt(d / n) };
      if (a.level !== undefined) {
        out.expected_move_1sd = a.level * s * Math.sqrt(d / n);
        out.straddle_approx = 0.8 * a.level * s * Math.sqrt(d / n);
        out.normal_volatility_approx = a.level * s;
      }
      return { ...out, method: "square-root-of-time scaling; straddle ~ 0.8 x level x vol x sqrt(t); normal vol ~ level x lognormal vol (at the money)." };
    },
  },
];

