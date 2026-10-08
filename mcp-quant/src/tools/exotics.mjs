// Exotic options and volatility models in closed or semi-closed form: barriers (Reiner-Rubinstein),
// geometric Asians (Kemna-Vorst), Heston stochastic volatility (characteristic function), SABR
// implied volatility (Hagan), spread (Kirk) and exchange (Margrabe) options, floating lookbacks,
// simple choosers and Merton jump diffusion. Rates and yields continuous; time in years.
import { z } from "zod";

import { normCdf as N } from "../math.mjs";
import { bsm } from "./options.mjs";

const kind = z.enum(["call", "put"]).describe("call or put.");
const S = z.number().positive().describe("Spot price, e.g. 100.");
const K = z.number().positive().describe("Strike, e.g. 100.");
const T = z.number().positive().max(50).describe("Years to expiry.");
const r = z.number().gt(-1).lt(1).optional().describe("Risk-free rate, continuous; default 0.");
const q = z.number().gt(-1).lt(1).optional().describe("Dividend yield, continuous; default 0.");
const vol = z.number().positive().max(10).describe("Annual volatility, e.g. 0.2.");

function barrier({ type, barrier_type, spot: s, strike: k, barrier: h, rebate = 0, years: t, rate = 0, dividend_yield = 0, volatility: v }) {
  const down = barrier_type.startsWith("down"), knockIn = barrier_type.endsWith("in");
  if (down ? s <= h : s >= h) throw new Error(`Spot ${s} is already ${down ? "at or below" : "at or above"} the barrier ${h}; the option has ${knockIn ? "knocked in (price it as vanilla)" : "knocked out"}.`);
  const b = rate - dividend_yield, sq = v * Math.sqrt(t), mu = (b - v * v / 2) / (v * v), lam = Math.sqrt(mu * mu + 2 * rate / (v * v));
  const phi = type === "call" ? 1 : -1, eta = down ? 1 : -1;
  const x1 = Math.log(s / k) / sq + (1 + mu) * sq, x2 = Math.log(s / h) / sq + (1 + mu) * sq;
  const y1 = Math.log(h * h / (s * k)) / sq + (1 + mu) * sq, y2 = Math.log(h / s) / sq + (1 + mu) * sq, zz = Math.log(h / s) / sq + lam * sq;
  const ebr = Math.exp((b - rate) * t), er = Math.exp(-rate * t), hs = h / s;
  const A = phi * s * ebr * N(phi * x1) - phi * k * er * N(phi * x1 - phi * sq);
  const B = phi * s * ebr * N(phi * x2) - phi * k * er * N(phi * x2 - phi * sq);
  const C = phi * s * ebr * hs ** (2 * (mu + 1)) * N(eta * y1) - phi * k * er * hs ** (2 * mu) * N(eta * y1 - eta * sq);
  const D = phi * s * ebr * hs ** (2 * (mu + 1)) * N(eta * y2) - phi * k * er * hs ** (2 * mu) * N(eta * y2 - eta * sq);
  const E = rebate * er * (N(eta * x2 - eta * sq) - hs ** (2 * mu) * N(eta * y2 - eta * sq));
  const F = rebate * (hs ** (mu + lam) * N(eta * zz) + hs ** (mu - lam) * N(eta * zz - 2 * eta * lam * sq));
  const above = k > h, call = type === "call";
  const table = {
    "down_in.call": above ? C + E : A - B + D + E, "up_in.call": above ? A + E : B - C + D + E,
    "down_in.put": above ? B - C + D + E : A + E, "up_in.put": above ? A - B + D + E : C + E,
    "down_out.call": above ? A - C + F : B - D + F, "up_out.call": above ? F : A - B + C - D + F,
    "down_out.put": above ? A - B + C - D + F : F, "up_out.put": above ? B - D + F : A - C + F,
  };
  const price = table[`${barrier_type}.${call ? "call" : "put"}`];
  const vanilla = bsm({ type, spot: s, strike: k, years: t, rate, dividend_yield, volatility: v }).price;
  return { price, vanilla_price: vanilla, barrier_discount: vanilla > 0 ? 1 - price / vanilla : null, monitoring: "continuous" };
}

// ---------------------------------------------------------------------------------------------
// Heston by the characteristic function ("little trap" form), Gauss-Legendre on panels
// ---------------------------------------------------------------------------------------------
const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im), sub = (a, b) => cx(a.re - b.re, a.im - b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const cexp = (a) => { const e = Math.exp(a.re); return cx(e * Math.cos(a.im), e * Math.sin(a.im)); };
const clog = (a) => cx(Math.log(Math.hypot(a.re, a.im)), Math.atan2(a.im, a.re));
const csqrt = (a) => { const m = Math.hypot(a.re, a.im), re = Math.sqrt((m + a.re) / 2), im = Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (m - a.re) / 2)); return cx(re, im); };

let GL;
function gaussLegendre(n = 32) {
  if (GL) return GL;
  const x = [], w = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      pp = n * (z * p1 - p2) / (z * z - 1);
      const z1 = z; z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-16) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * pp * pp));
  }
  GL = { x, w };
  return GL;
}

function hestonP(j, { spot, strike, years: t, rate = 0, dividend_yield = 0, v0, kappa, theta, sigma, rho }) {
  const u = j === 1 ? 0.5 : -0.5, b = j === 1 ? kappa - rho * sigma : kappa, x = Math.log(spot), lk = Math.log(strike);
  const integrand = (ph) => {
    const iph = cx(0, ph), rsi = cx(-b, rho * sigma * ph); // rho sigma phi i - b
    const d = csqrt(sub(mul(rsi, rsi), cx(sigma * sigma * (-ph * ph), sigma * sigma * 2 * u * ph)));
    const bm = sub(cx(b, -rho * sigma * ph), d); // b - rho sigma phi i - d
    const bp = add(cx(b, -rho * sigma * ph), d);
    const g = div(bm, bp), edt = cexp(cx(-d.re * t, -d.im * t)), one = cx(1);
    const Cterm = add(cx(0, (rate - dividend_yield) * ph * t), mul(cx(kappa * theta / (sigma * sigma)), sub(mul(bm, cx(t)), mul(cx(2), clog(div(sub(one, mul(g, edt)), sub(one, g)))))));
    const Dterm = mul(div(bm, cx(sigma * sigma)), div(sub(one, edt), sub(one, mul(g, edt))));
    const f = cexp(add(add(Cterm, mul(Dterm, cx(v0))), cx(0, ph * x)));
    const val = div(mul(cexp(cx(0, -ph * lk)), f), iph);
    return val.re;
  };
  const { x: gx, w: gw } = gaussLegendre();
  let total = 0, lo = 0;
  for (let panel = 0; panel < 400; panel++) {
    const hi = lo + (panel < 20 ? 0.5 : panel < 60 ? 2 : 10), mid = (lo + hi) / 2, half = (hi - lo) / 2;
    let s = 0; for (let i = 0; i < gx.length; i++) s += gw[i] * integrand(mid + half * gx[i]);
    s *= half; total += s; lo = hi;
    if (panel > 30 && Math.abs(s) < 1e-15) break;
  }
  return 0.5 + total / Math.PI;
}

function heston(a) {
  const dq = Math.exp(-(a.dividend_yield ?? 0) * a.years), dr = Math.exp(-(a.rate ?? 0) * a.years);
  const P1 = hestonP(1, a), P2 = hestonP(2, a), call = a.spot * dq * P1 - a.strike * dr * P2;
  const price = a.type === "call" ? call : call - a.spot * dq + a.strike * dr;
  return { price, prob_itm: a.type === "call" ? P2 : 1 - P2, delta: a.type === "call" ? dq * P1 : dq * (P1 - 1), feller_condition: 2 * a.kappa * a.theta > a.sigma * a.sigma };
}

function sabr({ forward: f, strike: k, years: t, alpha: al, beta: be, nu, rho }) {
  const omb = 1 - be, fk = f * k, lfk = Math.log(f / k);
  const corr = 1 + (omb * omb / 24 * al * al / fk ** omb + rho * be * nu * al / (4 * fk ** (omb / 2)) + (2 - 3 * rho * rho) / 24 * nu * nu) * t;
  if (Math.abs(lfk) < 1e-12) return al / f ** omb * corr;
  const zz = nu / al * fk ** (omb / 2) * lfk, xz = Math.log((Math.sqrt(1 - 2 * rho * zz + zz * zz) + zz - rho) / (1 - rho));
  return al / (fk ** (omb / 2) * (1 + omb * omb / 24 * lfk * lfk + omb ** 4 / 1920 * lfk ** 4)) * (zz / xz) * corr;
}

export const TOOLS = [
  {
    name: "barrier_option",
    title: "Barrier option (knock-in, knock-out)",
    description: "Price a continuously monitored single-barrier option (down/up, in/out, call/put, with rebate) in closed form (Reiner-Rubinstein), with the vanilla price and the barrier discount.",
    keywords: "barrier option knock out knock in down and out up and in reiner rubinstein rebate exotic",
    input: z.object({ type: kind, barrier_type: z.enum(["down_in", "down_out", "up_in", "up_out"]).describe("down_in, down_out, up_in or up_out."), spot: S, strike: K, barrier: z.number().positive().describe("Barrier level."), rebate: z.number().min(0).optional().describe("Cash rebate (paid at expiry if never knocked in; at the hit if knocked out); default 0."), years: T, rate: r, dividend_yield: q, volatility: vol }).strict(),
    run: (a) => barrier(a),
  },
  {
    name: "asian_option_geometric",
    title: "Geometric average Asian option",
    description: "Price a continuously averaged geometric-average-price Asian option in closed form (Kemna-Vorst); a lower bound and control variate for the arithmetic Asian.",
    keywords: "asian option average price geometric kemna vorst exotic commodity",
    input: z.object({ type: kind, spot: S, strike: K, years: T, rate: r, dividend_yield: q, volatility: vol }).strict(),
    run({ type, spot: s, strike: k, years: t, rate = 0, dividend_yield = 0, volatility: v }) {
      const b = rate - dividend_yield, bA = 0.5 * (b - v * v / 6), vA = v / Math.sqrt(3), sq = vA * Math.sqrt(t);
      const d1 = (Math.log(s / k) + (bA + vA * vA / 2) * t) / sq, d2 = d1 - sq, e1 = Math.exp((bA - rate) * t), er = Math.exp(-rate * t);
      return { price: type === "call" ? s * e1 * N(d1) - k * er * N(d2) : k * er * N(-d2) - s * e1 * N(-d1), effective_volatility: vA, effective_carry: bA };
    },
  },
  {
    name: "heston_option",
    title: "Heston stochastic volatility option",
    description: "Price a European option under the Heston stochastic-volatility model by Fourier integration of its characteristic function, with delta, in-the-money probability and the Feller condition.",
    keywords: "heston stochastic volatility model option price characteristic function smile skew vol of vol",
    input: z.object({
      type: kind, spot: S, strike: K, years: T, rate: r, dividend_yield: q,
      v0: z.number().positive().max(5).describe("Initial variance, e.g. 0.04 (20% vol)."),
      kappa: z.number().positive().max(50).describe("Mean-reversion speed of variance, e.g. 1.5."),
      theta: z.number().positive().max(5).describe("Long-run variance, e.g. 0.04."),
      sigma: z.number().positive().max(5).describe("Volatility of variance, e.g. 0.5."),
      rho: z.number().gt(-1).lt(1).describe("Correlation of spot and variance shocks, e.g. -0.7."),
    }).strict(),
    run: (a) => heston(a),
  },
  {
    name: "sabr_volatility",
    title: "SABR implied volatility",
    description: "Compute the Black implied volatility of a strike under the SABR model (Hagan et al. 2002) from alpha, beta, nu and rho, optionally across several strikes for a smile.",
    keywords: "sabr model implied volatility smile hagan rates swaption alpha beta nu rho",
    input: z.object({
      forward: z.number().positive().describe("Forward, e.g. 0.03."),
      strikes: z.array(z.number().positive()).min(1).max(500).describe("Strikes, e.g. [0.02, 0.03, 0.04]."),
      years: T,
      alpha: z.number().positive().describe("Alpha (vol level)."),
      beta: z.number().min(0).max(1).describe("Beta (0 normal-like, 1 lognormal)."),
      nu: z.number().min(0).max(10).describe("Vol of vol."),
      rho: z.number().gt(-1).lt(1).describe("Correlation."),
    }).strict(),
    run: (a) => ({ columns: ["strike", "implied_volatility"], rows: a.strikes.map((k) => [k, sabr({ ...a, strike: k })]) }),
  },
  {
    name: "spread_option",
    title: "Spread option (Kirk)",
    description: "Price a European option on the spread between two futures (F1 - F2 - K) with Kirk's approximation, as used for crack and spark spreads.",
    keywords: "spread option kirk approximation crack spread spark spread two assets correlation commodity",
    input: z.object({ type: kind, forward1: z.number().positive().describe("First futures price."), forward2: z.number().positive().describe("Second futures price."), strike: z.number().describe("Spread strike (can be 0)."), years: T, rate: r, volatility1: vol, volatility2: vol, correlation: z.number().min(-1).max(1).describe("Correlation of the two futures.") }).strict(),
    run({ type, forward1: f1, forward2: f2, strike: k, years: t, rate = 0, volatility1: v1, volatility2: v2, correlation: rho }) {
      if (!(f2 + k > 0)) throw new Error("Kirk's approximation needs forward2 + strike > 0.");
      const w = f2 / (f2 + k), F = f1 / (f2 + k), v = Math.sqrt(v1 * v1 - 2 * rho * v1 * v2 * w + v2 * v2 * w * w), sq = v * Math.sqrt(t);
      const d1 = (Math.log(F) + sq * sq / 2) / sq, d2 = d1 - sq, df = Math.exp(-rate * t);
      return { price: type === "call" ? df * (f2 + k) * (F * N(d1) - N(d2)) : df * (f2 + k) * (N(-d2) - F * N(-d1)), effective_volatility: v };
    },
  },
  {
    name: "exchange_option",
    title: "Exchange option (Margrabe)",
    description: "Price the option to exchange one asset for another, max(Q1 S1 - Q2 S2, 0), in closed form (Margrabe), with dividend yields on both.",
    keywords: "exchange option margrabe outperformance option two assets swap one for another",
    input: z.object({ spot1: S, spot2: S, quantity1: z.number().positive().optional().describe("Units of asset 1 received; default 1."), quantity2: z.number().positive().optional().describe("Units of asset 2 given; default 1."), years: T, dividend_yield1: q, dividend_yield2: q, volatility1: vol, volatility2: vol, correlation: z.number().min(-1).max(1).describe("Correlation.") }).strict(),
    run({ spot1, spot2, quantity1: q1 = 1, quantity2: q2 = 1, years: t, dividend_yield1: d1y = 0, dividend_yield2: d2y = 0, volatility1: v1, volatility2: v2, correlation: rho }) {
      const v = Math.sqrt(v1 * v1 + v2 * v2 - 2 * rho * v1 * v2), sq = v * Math.sqrt(t), a = q1 * spot1, b = q2 * spot2;
      const d1 = (Math.log(a / b) + (d2y - d1y + v * v / 2) * t) / sq, d2 = d1 - sq;
      return { price: a * Math.exp(-d1y * t) * N(d1) - b * Math.exp(-d2y * t) * N(d2), effective_volatility: v };
    },
  },
  {
    name: "lookback_option",
    title: "Floating-strike lookback option",
    description: "Price a continuously monitored floating-strike lookback option (Goldman-Sosin-Gatto): a call pays the final price minus the minimum, a put the maximum minus the final price.",
    keywords: "lookback option floating strike minimum maximum goldman sosin gatto exotic",
    input: z.object({ type: kind, spot: S, extreme: z.number().positive().optional().describe("Running minimum (call) or maximum (put) so far; default spot (new option)."), years: T, rate: r, dividend_yield: q, volatility: vol }).strict(),
    run({ type, spot: s, extreme, years: t, rate = 0, dividend_yield = 0, volatility: v }) {
      const b = rate - dividend_yield;
      if (Math.abs(b) < 1e-10) throw new Error("This closed form needs rate different from dividend_yield.");
      const m = extreme ?? s, sq = v * Math.sqrt(t), er = Math.exp(-rate * t), ebr = Math.exp((b - rate) * t);
      const a1 = (Math.log(s / m) + (b + v * v / 2) * t) / sq, a2 = a1 - sq, k = v * v / (2 * b);
      const price = type === "call"
        ? s * ebr * N(a1) - m * er * N(a2) + s * er * k * ((s / m) ** (-2 * b / (v * v)) * N(-a1 + 2 * b * Math.sqrt(t) / v) - Math.exp(b * t) * N(-a1))
        : m * er * N(-a2) - s * ebr * N(-a1) + s * er * k * (-((s / m) ** (-2 * b / (v * v))) * N(a1 - 2 * b * Math.sqrt(t) / v) + Math.exp(b * t) * N(a1));
      return { price };
    },
  },
  {
    name: "chooser_option",
    title: "Simple chooser option",
    description: "Price a simple chooser option, which lets the holder decide at a choice date whether it is a call or a put with the same strike and expiry (Rubinstein).",
    keywords: "chooser option as you like it call or put choice date rubinstein exotic",
    input: z.object({ spot: S, strike: K, years: T, choice_years: z.number().positive().describe("Years until the choice, before expiry."), rate: r, dividend_yield: q, volatility: vol }).strict(),
    run({ spot: s, strike: k, years: t, choice_years: tc, rate = 0, dividend_yield = 0, volatility: v }) {
      if (!(tc < t)) throw new Error("choice_years must be before expiry.");
      const b = rate - dividend_yield, d = (Math.log(s / k) + (b + v * v / 2) * t) / (v * Math.sqrt(t)), y = (Math.log(s / k) + b * t + v * v * tc / 2) / (v * Math.sqrt(tc));
      const ebr = Math.exp((b - rate) * t), er = Math.exp(-rate * t);
      return { price: s * ebr * N(d) - k * er * N(d - v * Math.sqrt(t)) - s * ebr * N(-y) + k * er * N(-y + v * Math.sqrt(tc)) };
    },
  },
  {
    name: "jump_diffusion_option",
    title: "Merton jump-diffusion option",
    description: "Price a European option under Merton's jump-diffusion model (lognormal jumps) as a Poisson-weighted sum of Black-Scholes prices.",
    keywords: "merton jump diffusion option jumps crash risk poisson lognormal skew",
    input: z.object({
      type: kind, spot: S, strike: K, years: T, rate: r, dividend_yield: q, volatility: vol,
      jump_intensity: z.number().min(0).max(100).describe("Jumps per year, e.g. 0.5."),
      jump_mean: z.number().min(-5).max(5).describe("Mean of log jump size, e.g. -0.1."),
      jump_volatility: z.number().min(0).max(5).describe("Volatility of log jump size, e.g. 0.15."),
    }).strict(),
    run({ type, spot: s, strike: k, years: t, rate = 0, dividend_yield = 0, volatility: v, jump_intensity: lam, jump_mean: m, jump_volatility: d }) {
      const kbar = Math.exp(m + d * d / 2) - 1, lp = lam * (1 + kbar) * t;
      let price = 0, weight = Math.exp(-lp), n = 0;
      for (; n < 500; n++) {
        if (n > 0) weight *= lp / n;
        const vn = Math.sqrt(v * v + n * d * d / t), rn = rate - lam * kbar + n * Math.log(1 + kbar) / t;
        price += weight * bsm({ type, spot: s, strike: k, years: t, rate: rn, dividend_yield, volatility: vn }).price * Math.exp((rn - rate) * t);
        if (n > lp && weight < 1e-17) break;
      }
      return { price, expected_jump: kbar, terms: n + 1 };
    },
  },
];
