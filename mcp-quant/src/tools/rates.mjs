// Fixed income and rates: fixed-rate bonds on real dates and day counts, zero-coupon bonds, curve
// bootstrapping, forward rates, Nelson-Siegel fitting, swaps, FRAs, z-spreads, credit hazard rates,
// short-rate model bond prices and Treasury bill yields.
//
// Bond yields compound at the coupon frequency; discounting follows the cash flows' accrual periods
// (QuantLib's convention), so prices on irregular day counts match it. Zero curves are continuously
// compounded, linear in the zero rate between pillars and flat beyond them.
import { z } from "zod";

import { bracketRoot, leastSquares } from "../math.mjs";
import { couponSchedule, dayCountArg, formatDate, isoDate, parseDate, yearFraction } from "../dates.mjs";

const freqArg = z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12)]).optional().describe("Coupons per year: 1, 2 (default), 4 or 12.");
const couponArg = z.number().min(0).max(1).describe("Annual coupon rate, e.g. 0.05 for 5%.");
const faceArg = z.number().positive().optional().describe("Face value; default 100, so prices read per 100.");
const bondDates = {
  settlement: isoDate.describe("Settlement date, YYYY-MM-DD."),
  maturity: isoDate.describe("Maturity date, YYYY-MM-DD."),
};
const curveArg = z.object({
  years: z.array(z.number().positive().max(100)).min(1).max(200).describe("Pillar times in years, increasing, e.g. [0.5, 1, 2, 5, 10]."),
  zero_rates: z.array(z.number().gt(-0.5).lt(1)).min(1).max(200).describe("Continuously compounded zero rates at those pillars, e.g. [0.04, 0.041, ...]."),
}).strict().describe("A zero curve: continuously compounded zero rates at pillar times, linear between pillars, flat outside.");

function curveOf({ years, zero_rates }) {
  if (years.length !== zero_rates.length) throw new Error(`curve has ${years.length} years and ${zero_rates.length} zero_rates; send one rate per pillar.`);
  for (let i = 1; i < years.length; i++) if (!(years[i] > years[i - 1])) throw new Error("curve.years must be strictly increasing.");
  const zr = (t) => {
    if (t <= years[0]) return zero_rates[0];
    if (t >= years.at(-1)) return zero_rates.at(-1);
    let i = 1; while (years[i] < t) i++;
    const w = (t - years[i - 1]) / (years[i] - years[i - 1]);
    return zero_rates[i - 1] + w * (zero_rates[i] - zero_rates[i - 1]);
  };
  return { zr, df: (t) => Math.exp(-zr(t) * t) };
}

// Cash flows of a fixed-rate bond from settlement: accrual fractions, amounts and payment dates.
function bondFlows(a) {
  const freq = a.frequency ?? 2, dc = a.day_count ?? "30/360", face = a.face ?? 100;
  const settle = parseDate(a.settlement, "settlement"), maturity = parseDate(a.maturity, "maturity");
  const dates = couponSchedule(settle, maturity, freq);
  const flows = [];
  for (let j = 1; j < dates.length; j++) {
    const s = dates[j - 1], e = dates[j];
    const amount = face * a.coupon_rate * yearFraction(dc, s, e, s, e, freq) + (j === dates.length - 1 ? face : 0);
    // Accrual fraction of the discounting interval: settlement to the first coupon, then each full period.
    const tau = j === 1 ? yearFraction(dc, settle, e, s, e, freq) : yearFraction(dc, s, e, s, e, freq);
    flows.push({ date: e, amount, tau });
  }
  const accrued = face * a.coupon_rate * yearFraction(dc, dates[0], settle, dates[0], dates[1], freq);
  return { flows, accrued, freq, face, settle };
}

function priceFromYield({ flows, freq }, y) {
  let df = 1, T = 0, dirty = 0, dur = 0, conv = 0;
  const g = 1 + y / freq;
  if (!(g > 0)) throw new Error("yield must be above -frequency (e.g. > -2 for semiannual).");
  for (const f of flows) {
    df *= g ** (-freq * f.tau);
    T += f.tau;
    const pv = f.amount * df;
    dirty += pv; dur += T * pv; conv += T * (T + 1 / freq) * pv;
  }
  return { dirty, macaulay: dur / dirty, modified: dur / dirty / g, convexity: conv / dirty / (g * g) };
}

function bondReport(b, y) {
  const p = priceFromYield(b, y);
  return {
    clean_price: p.dirty - b.accrued, dirty_price: p.dirty, accrued_interest: b.accrued, yield: y,
    macaulay_duration: p.macaulay, modified_duration: p.modified, convexity: p.convexity,
    dv01: p.modified * p.dirty * 1e-4,
    next_coupon: formatDate(b.flows[0].date), coupons_remaining: b.flows.length,
    method: "Compounded at the coupon frequency over each accrual period; prices per face; DV01 = modified duration x dirty price x 1bp.",
  };
}

const bondCore = { ...bondDates, coupon_rate: couponArg, frequency: freqArg, day_count: dayCountArg, face: faceArg };

function bootstrap({ years, par_yields, frequency = 2 }) {
  if (years.length !== par_yields.length) throw new Error(`years has ${years.length} entries and par_yields ${par_yields.length}.`);
  for (let i = 1; i < years.length; i++) if (!(years[i] > years[i - 1])) throw new Error("years must be strictly increasing.");
  const step = 1 / frequency, n = Math.round(years.at(-1) * frequency);
  if (Math.abs(n * step - years.at(-1)) > 1e-9) throw new Error(`The last tenor ${years.at(-1)} is not a whole number of ${frequency}-per-year periods.`);
  const par = (t) => {
    if (t <= years[0]) return par_yields[0];
    let i = 1; while (years[i] < t - 1e-12) i++;
    const w = (t - years[i - 1]) / (years[i] - years[i - 1]);
    return par_yields[i - 1] + w * (par_yields[i] - par_yields[i - 1]);
  };
  const rows = [];
  let annuity = 0;
  for (let k = 1; k <= n; k++) {
    const t = k * step, c = par(t) / frequency;
    const df = (1 - c * annuity) / (1 + c);
    if (!(df > 0)) throw new Error(`The par yields imply a non-positive discount factor at ${t} years.`);
    annuity += df;
    const prev = rows.length ? rows.at(-1).discount_factor : 1;
    rows.push({ years: t, par_yield: par(t), discount_factor: df, zero_rate_continuous: -Math.log(df) / t, zero_rate_periodic: frequency * (df ** (-1 / (frequency * t)) - 1), forward_rate_periodic: frequency * (prev / df - 1) });
  }
  return rows;
}

function nsLoadings(t, tau) {
  const x = t / tau, e = Math.exp(-x), l1 = (1 - e) / x;
  return [1, l1, l1 - e];
}

function nelsonSiegel({ years, yields, tau }) {
  if (years.length !== yields.length) throw new Error(`years has ${years.length} entries and yields ${yields.length}.`);
  const fit = (t) => {
    const ls = leastSquares(years.map((m) => nsLoadings(m, t)), yields);
    return { ...ls, sse: ls.resid.reduce((s, v) => s + v * v, 0), tau: t };
  };
  let best;
  if (tau !== undefined) best = fit(tau);
  else for (let i = 0; i <= 400; i++) { const f = fit(0.05 * 400 ** (i / 400)); if (!best || f.sse < best.sse) best = f; }
  const [b0, b1, b2] = best.coef;
  return { beta0: b0, beta1: b1, beta2: b2, tau: best.tau, rmse: Math.sqrt(best.sse / years.length), fitted: years.map((m) => b0 + b1 * nsLoadings(m, best.tau)[1] + b2 * nsLoadings(m, best.tau)[2]), method: tau === undefined ? "Nelson-Siegel by least squares, tau chosen from a 401-point log grid on [0.05, 20] years by minimum squared error." : "Nelson-Siegel by least squares at the given tau." };
}

export const TOOLS = [
  {
    name: "bond_price",
    title: "Bond price, duration and convexity",
    description: "Price a fixed-rate bond from its yield on real dates and a day count: clean and dirty price, accrued interest, Macaulay and modified duration, convexity and DV01.",
    keywords: "bond price yield clean dirty accrued interest duration macaulay modified convexity dv01 pv01 fixed income treasury corporate",
    input: z.object({ ...bondCore, yield: z.number().gt(-1).lt(5).describe("Yield to maturity, compounded at the coupon frequency, e.g. 0.045.") }).strict(),
    run: (a) => bondReport(bondFlows(a), a.yield),
  },
  {
    name: "bond_yield",
    title: "Bond yield to maturity",
    description: "Solve a fixed-rate bond's yield to maturity from its clean price, with duration, convexity and DV01 at that yield.",
    keywords: "yield to maturity ytm bond price solve fixed income treasury corporate",
    input: z.object({ ...bondCore, clean_price: z.number().positive().describe("Clean price per face, e.g. 98.75.") }).strict(),
    run(a) {
      const b = bondFlows(a), target = a.clean_price + b.accrued;
      const y = bracketRoot((y) => priceFromYield(b, y).dirty - target, 0, 0.1, { min: -b.freq + 1e-9, max: 10 });
      return bondReport(b, y);
    },
  },
  {
    name: "zero_coupon_bond",
    title: "Zero-coupon bond price and yield",
    description: "Price a zero-coupon bond from its yield or solve the yield from its price, under annual, periodic or continuous compounding, with duration and convexity.",
    keywords: "zero coupon bond strip discount bond price yield compounding",
    input: z.object({
      years: z.number().positive().max(100).describe("Years to maturity, e.g. 5."),
      face: faceArg,
      yield: z.number().gt(-1).lt(5).optional().describe("Yield; send yield or price."),
      price: z.number().positive().optional().describe("Price; send yield or price."),
      compounding: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12), z.literal("continuous")]).optional().describe("Times per year, or continuous; default 1."),
    }).strict(),
    run({ years, face = 100, yield: y, price, compounding = 1 }) {
      if ((y === undefined) === (price === undefined)) throw new Error("Send exactly one of yield or price.");
      const cont = compounding === "continuous";
      if (y === undefined) y = cont ? -Math.log(price / face) / years : compounding * ((face / price) ** (1 / (compounding * years)) - 1);
      else price = cont ? face * Math.exp(-y * years) : face * (1 + y / compounding) ** (-compounding * years);
      const g = cont ? 1 : 1 + y / compounding;
      return { price, yield: y, macaulay_duration: years, modified_duration: years / g, convexity: cont ? years * years : years * (years + 1 / compounding) / (g * g), dv01: years / g * price * 1e-4 };
    },
  },
  {
    name: "bootstrap_zero_curve",
    title: "Bootstrap a zero curve from par yields",
    description: "Bootstrap discount factors, zero rates (continuous and periodic) and period forward rates from par yields, interpolating par yields linearly onto the coupon grid.",
    keywords: "bootstrap zero curve par yield discount factors spot rates forward curve term structure",
    input: z.object({
      years: z.array(z.number().positive().max(100)).min(1).max(100).describe("Par tenors in years, increasing, e.g. [0.5, 1, 2, 3, 5, 7, 10]."),
      par_yields: z.array(z.number().gt(-0.2).lt(1)).min(1).max(100).describe("Par yields at those tenors, e.g. [0.05, 0.049, ...]."),
      frequency: freqArg,
    }).strict(),
    run: (a) => ({ columns: ["years", "par_yield", "discount_factor", "zero_rate_continuous", "zero_rate_periodic", "forward_rate_periodic"], rows: bootstrap(a).map((r) => [r.years, r.par_yield, r.discount_factor, r.zero_rate_continuous, r.zero_rate_periodic, r.forward_rate_periodic]) }),
  },
  {
    name: "forward_rate",
    title: "Forward rate between two dates",
    description: "Compute the forward rate between two maturities implied by their zero rates, under continuous, periodic or simple compounding, with the forward discount factor.",
    keywords: "forward rate implied zero rates term structure no arbitrage",
    input: z.object({
      t1: z.number().min(0).max(100).describe("Start in years, e.g. 1."),
      t2: z.number().positive().max(100).describe("End in years, after t1, e.g. 2."),
      zero_rate_1: z.number().gt(-0.5).lt(1).describe("Zero rate to t1, in the chosen compounding."),
      zero_rate_2: z.number().gt(-0.5).lt(1).describe("Zero rate to t2, in the chosen compounding."),
      compounding: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12), z.literal("continuous"), z.literal("simple")]).optional().describe("Compounding of the inputs and output; default continuous."),
    }).strict(),
    run({ t1, t2, zero_rate_1: r1, zero_rate_2: r2, compounding = "continuous" }) {
      if (!(t2 > t1)) throw new Error("t2 must be after t1.");
      const df = (r, t) => compounding === "continuous" ? Math.exp(-r * t) : compounding === "simple" ? 1 / (1 + r * t) : (1 + r / compounding) ** (-compounding * t);
      const fdf = df(r2, t2) / df(r1, t1), tau = t2 - t1;
      const fwd = compounding === "continuous" ? -Math.log(fdf) / tau : compounding === "simple" ? (1 / fdf - 1) / tau : compounding * (fdf ** (-1 / (compounding * tau)) - 1);
      return { forward_rate: fwd, forward_discount_factor: fdf };
    },
  },
  {
    name: "nelson_siegel_fit",
    title: "Nelson-Siegel yield curve fit",
    description: "Fit a Nelson-Siegel curve (level, slope, curvature, decay tau) to observed yields by least squares, with fitted yields and RMSE; tau is searched when not given.",
    keywords: "nelson siegel yield curve fit term structure level slope curvature smoothing",
    input: z.object({
      years: z.array(z.number().positive().max(100)).min(4).max(200).describe("Maturities in years."),
      yields: z.array(z.number().gt(-0.5).lt(1)).min(4).max(200).describe("Observed yields at those maturities."),
      tau: z.number().min(0.01).max(50).optional().describe("Decay in years; searched when omitted."),
    }).strict(),
    run: (a) => nelsonSiegel(a),
  },
  {
    name: "interest_rate_swap",
    title: "Interest rate swap value and par rate",
    description: "Value a spot-starting fixed-for-floating swap on a zero curve (single curve): par swap rate, value to the fixed payer, fixed-leg annuity and DV01s.",
    keywords: "interest rate swap irs par swap rate pv dv01 fixed float annuity",
    input: z.object({
      curve: curveArg,
      years: z.number().positive().max(60).describe("Swap tenor in years, a whole number of fixed periods, e.g. 5."),
      fixed_rate: z.number().gt(-0.2).lt(1).describe("Fixed rate, e.g. 0.042."),
      notional: z.number().positive().optional().describe("Default 1,000,000."),
      fixed_frequency: freqArg,
    }).strict(),
    run({ curve, years, fixed_rate, notional = 1e6, fixed_frequency = 2 }) {
      const n = Math.round(years * fixed_frequency);
      if (Math.abs(n / fixed_frequency - years) > 1e-9) throw new Error(`years ${years} is not a whole number of fixed periods.`);
      const value = (shift) => {
        const c = curveOf({ years: curve.years, zero_rates: curve.zero_rates.map((r) => r + shift) });
        let ann = 0; for (let k = 1; k <= n; k++) ann += c.df(k / fixed_frequency) / fixed_frequency;
        const fl = 1 - c.df(years);
        return { ann, fl, pv: notional * (fl - fixed_rate * ann) };
      };
      const base = value(0), up = value(1e-4), dn = value(-1e-4);
      return { par_rate: base.fl / base.ann, value_pay_fixed: base.pv, value_receive_fixed: -base.pv, annuity: base.ann, dv01_fixed_rate: notional * base.ann * 1e-4, dv01_curve_parallel: (dn.pv - up.pv) / 2, method: "Single-curve: floating leg = 1 - DF(T); curve DV01 by +/-1bp parallel shift of zero rates, central difference (value to the fixed payer falls as rates fall)." };
    },
  },
  {
    name: "forward_rate_agreement",
    title: "Forward rate agreement value",
    description: "Value a forward rate agreement on a zero curve: the simple forward rate for the period and the value to the party that pays the fixed rate.",
    keywords: "fra forward rate agreement simple forward libor sofr value",
    input: z.object({
      curve: curveArg,
      start: z.number().min(0).max(60).describe("Period start in years."),
      end: z.number().positive().max(60).describe("Period end in years."),
      fixed_rate: z.number().gt(-0.2).lt(1).describe("Contract rate, simple, e.g. 0.045."),
      notional: z.number().positive().optional().describe("Default 1,000,000."),
    }).strict(),
    run({ curve, start, end, fixed_rate, notional = 1e6 }) {
      if (!(end > start)) throw new Error("end must be after start.");
      const c = curveOf(curve), tau = end - start, d1 = c.df(start), d2 = c.df(end);
      const fwd = (d1 / d2 - 1) / tau;
      return { forward_rate: fwd, value_pay_fixed: notional * tau * (fwd - fixed_rate) * d2, discount_factor_end: d2 };
    },
  },
  {
    name: "z_spread",
    title: "Z-spread over a zero curve",
    description: "Solve a fixed-rate bond's z-spread: the constant spread over a continuously compounded zero curve that reprices its cash flows to the market dirty price.",
    keywords: "z spread zero volatility spread credit spread bond curve oas",
    input: z.object({ ...bondCore, clean_price: z.number().positive().describe("Clean price per face."), curve: curveArg }).strict(),
    run(a) {
      const b = bondFlows(a), c = curveOf(a.curve), target = a.clean_price + b.accrued;
      const ts = b.flows.map((f) => (f.date.serial - b.settle.serial) / 365);
      const pv = (s) => b.flows.reduce((acc, f, i) => acc + f.amount * Math.exp(-(c.zr(ts[i]) + s) * ts[i]), 0);
      const s = bracketRoot((s) => pv(s) - target, -0.01, 0.05, { min: -0.5, max: 5 });
      return { z_spread: s, z_spread_bp: s * 1e4, dirty_price: target, method: "Cash-flow times ACT/365F from settlement; continuous compounding." };
    },
  },
  {
    name: "credit_hazard_rate",
    title: "Hazard rate and default probability from a spread",
    description: "Convert a credit spread and recovery rate into a constant hazard rate (credit triangle), survival and default probabilities over a horizon, and the reverse.",
    keywords: "credit default swap cds spread hazard rate default probability recovery survival credit triangle",
    input: z.object({
      spread: z.number().min(0).max(1).optional().describe("Annual credit spread, e.g. 0.012 for 120 bp; or send hazard_rate."),
      hazard_rate: z.number().min(0).max(5).optional().describe("Annual hazard rate; or send spread."),
      recovery: z.number().min(0).lt(1).optional().describe("Recovery rate; default 0.4."),
      years: z.number().positive().max(100).optional().describe("Horizon for probabilities; default 5."),
    }).strict(),
    run({ spread, hazard_rate, recovery = 0.4, years = 5 }) {
      if ((spread === undefined) === (hazard_rate === undefined)) throw new Error("Send exactly one of spread or hazard_rate.");
      const h = hazard_rate ?? spread / (1 - recovery), s = spread ?? hazard_rate * (1 - recovery);
      return { hazard_rate: h, spread: s, survival_probability: Math.exp(-h * years), default_probability: 1 - Math.exp(-h * years), annual_default_probability: 1 - Math.exp(-h), expected_loss: (1 - Math.exp(-h * years)) * (1 - recovery), method: "Credit triangle: hazard = spread / (1 - recovery); survival = exp(-hazard x years)." };
    },
  },
  {
    name: "short_rate_bond_price",
    title: "Vasicek or CIR zero-coupon bond",
    description: "Price a zero-coupon bond and its yield under the Vasicek or Cox-Ingersoll-Ross short-rate model in closed form.",
    keywords: "vasicek cir cox ingersoll ross short rate model zero coupon bond affine term structure mean reversion",
    input: z.object({
      model: z.enum(["vasicek", "cir"]).describe("vasicek or cir."),
      short_rate: z.number().gt(-0.5).lt(1).describe("Current short rate r0, e.g. 0.03."),
      mean_reversion: z.number().positive().max(50).describe("Speed a, e.g. 0.1."),
      long_run_rate: z.number().gt(-0.5).lt(1).describe("Long-run level b (theta), e.g. 0.05."),
      volatility: z.number().positive().max(2).describe("Short-rate volatility sigma, e.g. 0.01."),
      years: z.number().positive().max(100).describe("Maturity in years."),
    }).strict(),
    run({ model, short_rate: r, mean_reversion: a, long_run_rate: b, volatility: s, years: T }) {
      let A, B;
      if (model === "vasicek") {
        B = (1 - Math.exp(-a * T)) / a;
        A = Math.exp((b - s * s / (2 * a * a)) * (B - T) - s * s * B * B / (4 * a));
      } else {
        if (r < 0) throw new Error("CIR needs a non-negative short rate.");
        const h = Math.sqrt(a * a + 2 * s * s), den = 2 * h + (a + h) * (Math.exp(h * T) - 1);
        A = (2 * h * Math.exp((a + h) * T / 2) / den) ** (2 * a * b / (s * s));
        B = 2 * (Math.exp(h * T) - 1) / den;
      }
      const price = A * Math.exp(-B * r);
      return { price, yield_continuous: -Math.log(price) / T, A, B, feller_condition: model === "cir" ? 2 * a * b >= s * s : undefined };
    },
  },
  {
    name: "treasury_bill_yields",
    title: "Treasury bill yields",
    description: "Convert a T-bill's price or bank discount rate into the discount yield, bond-equivalent (investment) yield, money-market yield and effective annual yield.",
    keywords: "treasury bill t-bill discount yield bond equivalent yield money market yield cd",
    input: z.object({
      days: z.number().int().min(1).max(366).describe("Days to maturity, e.g. 91."),
      price: z.number().positive().optional().describe("Price per 100 face; or send discount_rate."),
      discount_rate: z.number().gt(-0.5).lt(1).optional().describe("Bank discount rate, e.g. 0.05; or send price."),
    }).strict(),
    run({ days, price, discount_rate }) {
      if ((price === undefined) === (discount_rate === undefined)) throw new Error("Send exactly one of price or discount_rate.");
      const P = price ?? 100 * (1 - discount_rate * days / 360), hpr = 100 / P - 1;
      let bey = hpr * 365 / days;
      if (days > 182) { const t = days / 365, a = t / 2 - 0.25, c = 1 - 100 / P; bey = (-t + Math.sqrt(t * t - 4 * a * c)) / (2 * a); }
      return { price: P, discount_yield: (100 - P) / 100 * 360 / days, bond_equivalent_yield: bey, money_market_yield: hpr * 360 / days, effective_annual_yield: (100 / P) ** (365 / days) - 1, holding_period_return: hpr, method: "Bond-equivalent yield uses the Treasury's semiannual formula beyond 182 days." };
    },
  },
];
