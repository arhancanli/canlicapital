// Input pieces every toolset shares, so the same argument means the same thing in every tool.
import { z } from "zod";

export const MAX_SERIES = 200000;

export const returnsArg = z.array(z.number()).min(2).max(MAX_SERIES).describe("Periodic simple returns, e.g. [0.01, -0.004] for +1% then -0.4%.");
export const pricesArg = z.array(z.number().positive()).min(3).max(MAX_SERIES + 1).describe("Prices oldest first, instead of returns.");
export const ppyArg = z.number().positive().max(100000).optional().describe("Periods per year: 252 daily (default), 52 weekly, 12 monthly.");
export const rfArg = z.number().gt(-1).lt(10).optional().describe("Annual risk-free rate, e.g. 0.04; default 0.");
export const benchmarkArg = z.array(z.number()).min(2).max(MAX_SERIES).describe("Benchmark returns, same periods and length as returns.");
export const confidenceArg = z.number().gt(0.5).lt(1).optional().describe("Confidence level; default 0.95.");
export const datesArg = z.array(z.string().max(40)).max(MAX_SERIES + 1).optional().describe("A label per period (e.g. ISO dates), to name periods in the result.");

export const seriesFields = { returns: returnsArg.optional(), prices: pricesArg.optional(), periods_per_year: ppyArg };

// Resolves returns from either returns or prices; refuses both, neither, or a non-finite value.
export function seriesFrom(args, label = "returns") {
  const { returns, prices } = args;
  if ((returns === undefined) === (prices === undefined)) throw new Error(`Send exactly one of returns or prices for ${label}.`);
  let r;
  if (returns !== undefined) r = returns;
  else {
    r = new Array(prices.length - 1);
    for (let i = 1; i < prices.length; i++) r[i - 1] = prices[i] / prices[i - 1] - 1;
  }
  for (let i = 0; i < r.length; i++) {
    if (!Number.isFinite(r[i])) throw new Error(`${label}[${i}] is not a finite number.`);
    if (r[i] <= -1) throw new Error(`${label}[${i}] is ${r[i]}: a simple return cannot be -100% or lower. Send simple returns, not log returns or percents.`);
  }
  if (r.length >= 20 && r.every((v) => Math.abs(v) >= 1 || v === 0) && r.some((v) => Math.abs(v) > 1)) {
    throw new Error(`${label} look like percents (e.g. 1.5 for 1.5%); send fractions (0.015).`);
  }
  return r;
}

export const ppyOf = (args) => args.periods_per_year ?? 252;

// Per-period rate equivalent to an annual rate, compounded.
export const perPeriod = (annual, ppy) => (1 + (annual ?? 0)) ** (1 / ppy) - 1;

export function sameLength(a, b, names = ["returns", "benchmark"]) {
  if (a.length !== b.length) throw new Error(`${names[0]} has ${a.length} periods and ${names[1]} has ${b.length}; send the same periods for both.`);
}
