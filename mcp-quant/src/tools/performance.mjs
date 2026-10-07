// Performance and risk: everything computed from a return series (and, for relative measures, a
// benchmark). Definitions follow the common references (empyrical, Bacon's "Practical Portfolio
// Performance Measurement", Lo 2002, Cornish-Fisher 1938); each result names its method.
import { z } from "zod";

import { chi2Sf, correlation, maxOf, mean, minOf, moments, normCdf, normInv, normPdf, olsSimple, quantile, sortedCopy, std, sum, tPValue } from "../math.mjs";
import { benchmarkArg, confidenceArg, datesArg, perPeriod, ppyOf, rfArg, sameLength, seriesFields, seriesFrom } from "../inputs.mjs";

// ---- shared computations ----------------------------------------------------------------------

export function cagr(r, ppy) {
  let logw = 0;
  for (const v of r) logw += Math.log1p(v);
  return Math.expm1(logw * ppy / r.length);
}

export function drawdownPath(r) {
  const dd = new Float64Array(r.length);
  let w = 1, peak = 1;
  for (let i = 0; i < r.length; i++) {
    w *= 1 + r[i];
    if (w > peak) peak = w;
    dd[i] = w / peak - 1;
  }
  return dd;
}

// Each distinct drawdown episode: start (last peak index, -1 = before the first period), trough,
// recovery (null if not recovered), depth.
export function drawdownEpisodes(r) {
  const out = [];
  let w = 1, peak = 1, peakIdx = -1, cur = null;
  for (let i = 0; i < r.length; i++) {
    w *= 1 + r[i];
    if (w >= peak) {
      if (cur) { cur.recovery = i; out.push(cur); cur = null; }
      peak = w; peakIdx = i;
    } else {
      const depth = w / peak - 1;
      if (!cur) cur = { peak: peakIdx, trough: i, recovery: null, depth };
      else if (depth < cur.depth) { cur.depth = depth; cur.trough = i; }
    }
  }
  if (cur) out.push(cur);
  return out;
}

const withSeries = (extra = {}) => z.object({ ...seriesFields, ...extra }).strict();
const relInput = (extra = {}) => z.object({ ...seriesFields, benchmark: benchmarkArg, ...extra }).strict();

function excessOver(r, rfAnnual, ppy) {
  const rf = perPeriod(rfAnnual, ppy);
  return rf === 0 ? r : r.map((v) => v - rf);
}

function sharpeParts(r, ppy, rfAnnual) {
  const ex = excessOver(r, rfAnnual, ppy);
  const s = std(ex);
  if (!(s > 0)) throw new Error("The returns have zero variance, so the Sharpe ratio is undefined.");
  return { ex, srp: mean(ex) / s };
}

const label = (dates, i) => (i === null || i === undefined ? null : i < 0 ? "start" : dates ? (dates[i] ?? i) : i);

// ---- tools --------------------------------------------------------------------------------------

export const TOOLS = [
  {
    name: "return_stats",
    title: "Return statistics",
    description: "Summarize a return series: periods, annualized geometric return (CAGR) and volatility, Sharpe, max drawdown, skew, excess kurtosis, best and worst period, share positive.",
    keywords: "summary describe cagr volatility overview",
    input: withSeries({ risk_free: rfArg }),
    run(a) {
      const r = seriesFrom(a), ppy = ppyOf(a), m = moments(r);
      const dd = drawdownPath(r);
      let worst = Infinity, best = -Infinity, pos = 0;
      for (const v of r) { if (v < worst) worst = v; if (v > best) best = v; if (v > 0) pos++; }
      const s = std(r);
      return {
        periods: r.length, years: r.length / ppy,
        cagr: cagr(r, ppy), total_return: Math.expm1(r.reduce((x, v) => x + Math.log1p(v), 0)),
        volatility: s * Math.sqrt(ppy),
        sharpe: s > 0 ? sharpeParts(r, ppy, a.risk_free).srp * Math.sqrt(ppy) : null,
        max_drawdown: Math.min(0, minOf(dd)),
        skew: m.skew, excess_kurtosis: m.excess_kurtosis,
        best: best, worst: worst, positive_share: pos / r.length,
        method: "cagr geometric; volatility sample std x sqrt(periods_per_year); sharpe on per-period excess returns x sqrt(periods_per_year); skew and kurtosis population (scipy default).",
      };
    },
  },
  {
    name: "sharpe_ratio",
    title: "Sharpe ratio with standard error",
    description: "Compute the annualized Sharpe ratio with its standard error and 95% interval, under iid normal returns (Lo 2002) and allowing skew and fat tails (Mertens 2002). For the probability it beats luck across many trials, use canli-validation-mcp.",
    keywords: "sharpe risk-adjusted lo mertens confidence interval",
    input: withSeries({ risk_free: rfArg }),
    run(a) {
      const r = seriesFrom(a), ppy = ppyOf(a), n = r.length;
      const { ex, srp } = sharpeParts(r, ppy, a.risk_free);
      const m = moments(ex);
      const seLo = Math.sqrt((1 + 0.5 * srp * srp) / n);
      const seMe = Math.sqrt(Math.max(0, 1 + 0.5 * srp * srp - m.skew * srp + (m.excess_kurtosis / 4) * srp * srp) / n);
      const k = Math.sqrt(ppy), z = normInv(0.975);
      return {
        sharpe: srp * k, sharpe_per_period: srp,
        se_iid_normal: seLo * k, se_non_normal: seMe * k,
        ci95_non_normal: [(srp - z * seMe) * k, (srp + z * seMe) * k],
        t_stat: srp / seMe, p_value_sharpe_le_0: 1 - normCdf(srp / seMe),
        periods: n,
        method: "per-period excess returns over (1+rf)^(1/ppy)-1; annualized by sqrt(periods_per_year); Mertens SE uses population skew and excess kurtosis.",
      };
    },
  },
  {
    name: "sortino_ratio",
    title: "Sortino ratio",
    description: "Compute the annualized Sortino ratio: mean return above a target over downside deviation below it, with the downside deviation itself.",
    keywords: "sortino downside deviation target mar",
    input: withSeries({ target: z.number().gt(-1).lt(10).optional().describe("Annual target (minimum acceptable) return; default 0.") }),
    run(a) {
      const r = seriesFrom(a), ppy = ppyOf(a);
      const ex = excessOver(r, a.target, ppy);
      let dsq = 0;
      for (const v of ex) if (v < 0) dsq += v * v;
      const dd = Math.sqrt(dsq / ex.length) * Math.sqrt(ppy);
      return { sortino: dd > 0 ? (mean(ex) * ppy) / dd : null, downside_deviation: dd, method: "empyrical: mean(r - target) x ppy / (sqrt(mean(min(r - target, 0)^2)) x sqrt(ppy)), target per period compounded." };
    },
  },
  {
    name: "max_drawdown",
    title: "Drawdowns",
    description: "Find the maximum drawdown and the worst drawdown episodes: depth, peak, trough, recovery and length in periods, plus time under water.",
    keywords: "drawdown peak trough recovery underwater episodes",
    input: withSeries({ top: z.number().int().min(1).max(50).optional().describe("Episodes to list, deepest first; default 5."), dates: datesArg }),
    run(a) {
      const r = seriesFrom(a), dates = a.dates;
      const eps = drawdownEpisodes(r).sort((x, y) => x.depth - y.depth);
      const dd = drawdownPath(r);
      let under = 0;
      for (const v of dd) if (v < 0) under++;
      return {
        max_drawdown: eps.length ? eps[0].depth : 0,
        episodes: eps.slice(0, a.top ?? 5).map((e) => ({
          depth: e.depth, peak: label(dates, e.peak), trough: label(dates, e.trough), recovery: label(dates, e.recovery),
          to_trough: e.trough - e.peak, to_recover: e.recovery === null ? null : e.recovery - e.trough,
        })),
        current_drawdown: dd[dd.length - 1], share_of_periods_under_water: under / r.length, episode_count: eps.length,
        method: "Wealth compounds from 1; a peak is the running maximum including the starting 1. Lengths are in periods.",
      };
    },
  },
  {
    name: "calmar_ratio",
    title: "Calmar ratio",
    description: "Compute the Calmar ratio: annualized geometric return over the absolute maximum drawdown of the whole series.",
    keywords: "calmar drawdown return mar ratio",
    input: withSeries(),
    run(a) {
      const r = seriesFrom(a), ppy = ppyOf(a);
      const mdd = Math.min(0, minOf(drawdownPath(r))), g = cagr(r, ppy);
      return { calmar: mdd < 0 ? g / -mdd : null, cagr: g, max_drawdown: mdd };
    },
  },
  {
    name: "omega_ratio",
    title: "Omega ratio",
    description: "Compute the Omega ratio at a threshold: the sum of gains above it over the sum of losses below it.",
    keywords: "omega gain loss threshold",
    input: withSeries({ threshold: z.number().gt(-1).lt(10).optional().describe("Annual threshold return; default 0.") }),
    run(a) {
      const r = seriesFrom(a), t = perPeriod(a.threshold, ppyOf(a));
      let up = 0, down = 0;
      for (const v of r) { const d = v - t; if (d > 0) up += d; else down -= d; }
      return { omega: down > 0 ? up / down : null, threshold_per_period: t };
    },
  },
  {
    name: "value_at_risk",
    title: "Value at risk",
    description: "Estimate value at risk as a positive loss fraction: historical, Gaussian and Cornish-Fisher (skew and kurtosis adjusted), over one or more periods.",
    keywords: "var value-at-risk cornish-fisher parametric historical tail loss",
    input: withSeries({ confidence: confidenceArg, horizon: z.number().int().min(1).max(1000).optional().describe("Periods ahead; default 1.") }),
    run(a) {
      const r = seriesFrom(a), c = a.confidence ?? 0.95, h = a.horizon ?? 1;
      const hist = histReturns(r, h);
      const q = quantile(sortedCopy(hist), 1 - c);
      const mu = mean(r), s = std(r), m = moments(r), z = normInv(1 - c);
      const S = m.skew, K = m.excess_kurtosis;
      const zcf = z + (z * z - 1) * S / 6 + (z ** 3 - 3 * z) * K / 24 - (2 * z ** 3 - 5 * z) * S * S / 36;
      return {
        confidence: c, horizon: h,
        historical: -q,
        gaussian: -(mu * h + s * Math.sqrt(h) * z),
        cornish_fisher: -(mu * h + s * Math.sqrt(h) * zcf),
        method: "historical: numpy linear quantile of returns (overlapping compounded windows when horizon > 1); parametric: mean x h + std x sqrt(h) x z, Cornish-Fisher z from population skew and excess kurtosis.",
      };
    },
  },
  {
    name: "expected_shortfall",
    title: "Expected shortfall (CVaR)",
    description: "Estimate expected shortfall (CVaR): the average loss beyond value at risk, historical and Gaussian, as a positive loss fraction.",
    keywords: "cvar expected shortfall conditional var tail",
    input: withSeries({ confidence: confidenceArg, horizon: z.number().int().min(1).max(1000).optional().describe("Periods ahead; default 1.") }),
    run(a) {
      const r = seriesFrom(a), c = a.confidence ?? 0.95, h = a.horizon ?? 1;
      const hist = histReturns(r, h);
      const q = quantile(sortedCopy(hist), 1 - c);
      const tail = hist.filter((v) => v <= q);
      const mu = mean(r) * h, s = std(r) * Math.sqrt(h), z = normInv(1 - c);
      return { confidence: c, horizon: h, historical: -mean(tail), gaussian: -(mu - s * normPdf(z) / (1 - c)), var_historical: -q, tail_periods: tail.length };
    },
  },
  {
    name: "capm_regression",
    title: "Alpha and beta (CAPM)",
    description: "Regress excess returns on benchmark excess returns: beta, alpha (annualized), their t-stats and p-values, R-squared, correlation and residual (idiosyncratic) volatility.",
    keywords: "alpha beta capm regression market jensen",
    input: relInput({ risk_free: rfArg }),
    run(a) {
      const r = seriesFrom(a), b = seriesFrom({ returns: a.benchmark }, "benchmark"), ppy = ppyOf(a);
      sameLength(r, b);
      const y = excessOver(r, a.risk_free, ppy), x = excessOver(b, a.risk_free, ppy);
      const o = olsSimple(x, y);
      return {
        beta: o.beta, alpha_annual: o.alpha * ppy, alpha_per_period: o.alpha,
        t_alpha: o.t_alpha, p_alpha: tTwoSided(o.t_alpha, o.df), t_beta: o.t_beta, p_beta: tTwoSided(o.t_beta, o.df),
        r_squared: o.r2, correlation: correlation(r, b), residual_volatility: o.residual_std * Math.sqrt(ppy),
        method: "OLS with an intercept on per-period excess returns; alpha_annual = alpha x periods_per_year; classical (non-robust) standard errors.",
      };
    },
  },
  {
    name: "information_ratio",
    title: "Information ratio and tracking error",
    description: "Compute active return, tracking error and the information ratio of a strategy against its benchmark, annualized.",
    keywords: "information ratio tracking error active return benchmark relative",
    input: relInput(),
    run(a) {
      const r = seriesFrom(a), b = seriesFrom({ returns: a.benchmark }, "benchmark"), ppy = ppyOf(a);
      sameLength(r, b);
      const act = r.map((v, i) => v - b[i]), te = std(act) * Math.sqrt(ppy);
      return { information_ratio: te > 0 ? (mean(act) * ppy) / te : null, tracking_error: te, active_return_annual: mean(act) * ppy, active_cagr_difference: cagr(r, ppy) - cagr(b, ppy) };
    },
  },
  {
    name: "treynor_ratio",
    title: "Treynor ratio",
    description: "Compute the Treynor ratio: annualized excess return per unit of beta to the benchmark.",
    keywords: "treynor beta systematic risk",
    input: relInput({ risk_free: rfArg }),
    run(a) {
      const r = seriesFrom(a), b = seriesFrom({ returns: a.benchmark }, "benchmark"), ppy = ppyOf(a);
      sameLength(r, b);
      const o = olsSimple(excessOver(b, a.risk_free, ppy), excessOver(r, a.risk_free, ppy));
      const ex = cagr(r, ppy) - (a.risk_free ?? 0);
      return { treynor: o.beta !== 0 ? ex / o.beta : null, beta: o.beta, excess_cagr: ex };
    },
  },
  {
    name: "m2_measure",
    title: "Modigliani M-squared",
    description: "Compute Modigliani's M-squared: the return the strategy would have earned levered to the benchmark's volatility, and its difference from the benchmark.",
    keywords: "m2 modigliani risk-adjusted return",
    input: relInput({ risk_free: rfArg }),
    run(a) {
      const r = seriesFrom(a), b = seriesFrom({ returns: a.benchmark }, "benchmark"), ppy = ppyOf(a);
      sameLength(r, b);
      const { srp } = sharpeParts(r, ppy, a.risk_free);
      const rf = a.risk_free ?? 0, bv = std(b) * Math.sqrt(ppy);
      const m2 = srp * Math.sqrt(ppy) * bv + rf;
      return { m2, benchmark_return: mean(b) * ppy, m2_minus_benchmark: m2 - mean(b) * ppy, method: "Sharpe (annualized) x benchmark volatility + rf; benchmark return arithmetic annualized." };
    },
  },
  {
    name: "capture_ratios",
    title: "Up and down capture",
    description: "Compute up-market and down-market capture: the strategy's annualized return in benchmark up periods and down periods, relative to the benchmark's.",
    keywords: "upside downside capture ratio",
    input: relInput(),
    run(a) {
      const r = seriesFrom(a), b = seriesFrom({ returns: a.benchmark }, "benchmark"), ppy = ppyOf(a);
      sameLength(r, b);
      const pick = (f) => [r.filter((_, i) => f(b[i])), b.filter((v) => f(v))];
      const [ru, bu] = pick((v) => v > 0), [rd, bd] = pick((v) => v < 0);
      const up = bu.length ? cagr(ru, ppy) / cagr(bu, ppy) : null, down = bd.length ? cagr(rd, ppy) / cagr(bd, ppy) : null;
      return { up_capture: up, down_capture: down, capture_ratio: up !== null && down ? up / down : null, up_periods: bu.length, down_periods: bd.length, method: "empyrical: annualized geometric return over the selected periods, strategy over benchmark." };
    },
  },
  {
    name: "ulcer_index",
    title: "Ulcer index and Martin ratio",
    description: "Compute the Ulcer index (root-mean-square drawdown), the Martin (ulcer performance) ratio, and the pain index and pain ratio (mean drawdown).",
    keywords: "ulcer martin pain index drawdown depth duration",
    input: withSeries({ risk_free: rfArg }),
    run(a) {
      const r = seriesFrom(a), ppy = ppyOf(a), dd = drawdownPath(r);
      let sq = 0, ab = 0;
      for (const v of dd) { sq += v * v; ab -= v; }
      const ui = Math.sqrt(sq / dd.length), pain = ab / dd.length, ex = cagr(r, ppy) - (a.risk_free ?? 0);
      return { ulcer_index: ui, martin_ratio: ui > 0 ? ex / ui : null, pain_index: pain, pain_ratio: pain > 0 ? ex / pain : null };
    },
  },
  {
    name: "drawdown_at_risk",
    title: "Conditional drawdown at risk",
    description: "Estimate drawdown at risk (a drawdown quantile across periods) and conditional drawdown at risk (the mean drawdown beyond it), as positive fractions.",
    keywords: "cdar dar conditional drawdown at risk",
    input: withSeries({ confidence: confidenceArg }),
    run(a) {
      const r = seriesFrom(a), c = a.confidence ?? 0.95;
      const depth = Array.from(drawdownPath(r), (v) => -v);
      const dar = quantile(sortedCopy(depth), c);
      const beyond = depth.filter((v) => v >= dar);
      return { confidence: c, drawdown_at_risk: dar, conditional_drawdown_at_risk: mean(beyond) };
    },
  },
  {
    name: "tail_ratio",
    title: "Tail and Rachev ratios",
    description: "Compute the tail ratio (95th percentile return over the absolute 5th) and the Rachev ratio (mean of the best tail over the mean loss of the worst tail).",
    keywords: "tail ratio rachev skew asymmetry",
    input: withSeries({ tail: z.number().gt(0).lt(0.5).optional().describe("Tail share for Rachev; default 0.05.") }),
    run(a) {
      const r = seriesFrom(a), s = sortedCopy(r), t = a.tail ?? 0.05;
      const lo = quantile(s, t), hi = quantile(s, 1 - t);
      const gains = r.filter((v) => v >= hi), losses = r.filter((v) => v <= lo);
      return { tail_ratio: Math.abs(quantile(s, 0.95)) / Math.abs(quantile(s, 0.05)), rachev: -mean(losses) !== 0 ? mean(gains) / -mean(losses) : null, tail: t };
    },
  },
  {
    name: "gain_to_pain",
    title: "Gain-to-pain ratio",
    description: "Compute Schwager's gain-to-pain ratio: the sum of returns over the absolute sum of losing returns.",
    keywords: "gain pain schwager",
    input: withSeries(),
    run(a) {
      const r = seriesFrom(a);
      let loss = 0;
      for (const v of r) if (v < 0) loss -= v;
      return { gain_to_pain: loss > 0 ? sum(r) / loss : null };
    },
  },
  {
    name: "trade_stats",
    title: "Trade statistics",
    description: "Summarize closed-trade results: win rate, profit factor, payoff ratio, expectancy, largest win and loss, and longest winning and losing streaks.",
    keywords: "trades win rate profit factor payoff expectancy streak",
    input: z.object({ pnl: z.array(z.number()).min(1).max(1000000).describe("Each closed trade's profit or loss, in money or return; oldest first.") }).strict(),
    run(a) {
      const p = a.pnl;
      let w = 0, l = 0, gw = 0, gl = 0, run = 0, maxW = 0, maxL = 0;
      for (const v of p) {
        if (v > 0) { w++; gw += v; run = run > 0 ? run + 1 : 1; maxW = Math.max(maxW, run); }
        else if (v < 0) { l++; gl -= v; run = run < 0 ? run - 1 : -1; maxL = Math.max(maxL, -run); }
        else run = 0;
      }
      return {
        trades: p.length, win_rate: w / p.length, profit_factor: gl > 0 ? gw / gl : null,
        payoff_ratio: w && l ? (gw / w) / (gl / l) : null, expectancy: sum(p) / p.length,
        avg_win: w ? gw / w : null, avg_loss: l ? -gl / l : null,
        largest_win: maxOf(p), largest_loss: minOf(p), longest_win_streak: maxW, longest_loss_streak: maxL,
      };
    },
  },
  {
    name: "kelly_fraction",
    title: "Kelly fraction",
    description: "Compute the growth-optimal (Kelly) fraction: from a return series (continuous, (mean - rf) / variance), or from a win probability and payoff odds. Also gives half Kelly.",
    keywords: "kelly sizing optimal fraction leverage bet",
    input: z.object({
      ...seriesFields,
      risk_free: rfArg,
      win_probability: z.number().gt(0).lt(1).optional().describe("Instead of returns: chance a bet wins."),
      payoff: z.number().positive().optional().describe("With win_probability: amount won per 1 risked."),
    }).strict(),
    run(a) {
      if (a.win_probability !== undefined || a.payoff !== undefined) {
        if (a.win_probability === undefined || a.payoff === undefined) throw new Error("Send both win_probability and payoff, or a return series.");
        const f = a.win_probability - (1 - a.win_probability) / a.payoff;
        return { kelly: f, half_kelly: f / 2, method: "discrete: p - (1 - p) / b" };
      }
      const r = seriesFrom(a), ppy = ppyOf(a);
      const ex = excessOver(r, a.risk_free, ppy), v = std(r) ** 2;
      const f = mean(ex) / v;
      return { kelly: f, half_kelly: f / 2, growth_at_kelly_annual: (mean(ex) * f - 0.5 * v * f * f) * ppy, method: "continuous: mean(excess) / variance per period; growth = (mu f - sigma^2 f^2 / 2) x ppy" };
    },
  },
  {
    name: "autocorrelation",
    title: "Autocorrelation and Ljung-Box",
    description: "Test a return series for serial correlation: autocorrelations at each lag and the Ljung-Box Q statistic with its p-value.",
    keywords: "autocorrelation acf ljung-box serial correlation independence",
    input: withSeries({ lags: z.number().int().min(1).max(500).optional().describe("Lags to test; default 10.") }),
    run(a) {
      const r = seriesFrom(a), L = Math.min(a.lags ?? 10, r.length - 2);
      const acf = acfOf(r, L), n = r.length;
      let q = 0;
      for (let k = 1; k <= L; k++) q += acf[k - 1] ** 2 / (n - k);
      q *= n * (n + 2);
      return { lags: L, acf, ljung_box_q: q, p_value: chi2Sf(q, L), significance_band_95: 1.96 / Math.sqrt(n) };
    },
  },
  {
    name: "normality_test",
    title: "Normality (Jarque-Bera)",
    description: "Test whether returns are normal with the Jarque-Bera test, with skew and excess kurtosis.",
    keywords: "jarque-bera normal distribution fat tails skew kurtosis",
    input: withSeries(),
    run(a) {
      const r = seriesFrom(a), m = moments(r), n = r.length;
      const jb = (n / 6) * (m.skew ** 2 + m.excess_kurtosis ** 2 / 4);
      return { jarque_bera: jb, p_value: chi2Sf(jb, 2), skew: m.skew, excess_kurtosis: m.excess_kurtosis };
    },
  },
  {
    name: "autocorrelation_adjusted_sharpe",
    title: "Sharpe adjusted for autocorrelation",
    description: "Annualize a Sharpe ratio allowing for serial correlation (Lo 2002): smoothed or autocorrelated returns overstate the usual sqrt(time) Sharpe.",
    keywords: "lo 2002 autocorrelation sharpe annualization smoothing hedge fund",
    input: withSeries({ risk_free: rfArg, max_lag: z.number().int().min(1).max(500).optional().describe("Autocorrelations used; default min(periods_per_year - 1, periods / 4, 24).") }),
    run(a) {
      const r = seriesFrom(a), q = ppyOf(a);
      const { ex, srp } = sharpeParts(r, q, a.risk_free);
      const L = Math.max(1, Math.min(a.max_lag ?? 24, q - 1, Math.floor(ex.length / 4)));
      const rho = acfOf(ex, L);
      let s = q;
      for (let k = 1; k <= Math.min(L, q - 1); k++) s += 2 * (q - k) * rho[k - 1];
      if (!(s > 0)) throw new Error("The autocorrelations imply a non-positive variance of annual returns; try a smaller max_lag.");
      return { sharpe_adjusted: srp * q / Math.sqrt(s), sharpe_sqrt_time: srp * Math.sqrt(q), lags_used: L, method: "Lo (2002) eq. 17: SR x q / sqrt(q + 2 sum_{k=1}^{L} (q - k) rho_k); lags beyond L taken as 0." };
    },
  },
  {
    name: "rolling_sharpe",
    title: "Rolling Sharpe summary",
    description: "Summarize the rolling Sharpe ratio over a window: latest, min, max, median and the share of windows below zero; shows whether performance is stable or decaying.",
    keywords: "rolling window sharpe stability decay",
    input: withSeries({ window: z.number().int().min(5).max(100000).optional().describe("Periods per window; default periods_per_year."), risk_free: rfArg }),
    run(a) {
      const r = seriesFrom(a), ppy = ppyOf(a), w = a.window ?? Math.round(ppy);
      if (w > r.length) throw new Error(`window ${w} is longer than the ${r.length} periods sent.`);
      const ex = excessOver(r, a.risk_free, ppy), k = Math.sqrt(ppy);
      const out = [];
      let s1 = 0, s2 = 0;
      for (let i = 0; i < ex.length; i++) {
        s1 += ex[i]; s2 += ex[i] * ex[i];
        if (i >= w) { s1 -= ex[i - w]; s2 -= ex[i - w] ** 2; }
        if (i >= w - 1) {
          const m = s1 / w, v = (s2 - w * m * m) / (w - 1);
          out.push(v > 0 ? (m / Math.sqrt(v)) * k : NaN);
        }
      }
      const ok = out.filter(Number.isFinite), s = sortedCopy(ok);
      return { window: w, windows: out.length, latest: out[out.length - 1], min: s[0], median: quantile(s, 0.5), max: s[s.length - 1], share_below_zero: ok.filter((v) => v < 0).length / ok.length };
    },
  },
];

// ---- helpers ------------------------------------------------------------------------------------

function histReturns(r, h) {
  if (h === 1) return Array.from(r);
  if (h >= r.length) throw new Error(`horizon ${h} needs more than ${r.length} periods.`);
  const out = [];
  for (let i = 0; i + h <= r.length; i++) {
    let lw = 0;
    for (let j = i; j < i + h; j++) lw += Math.log1p(r[j]);
    out.push(Math.expm1(lw));
  }
  return out;
}

export function acfOf(x, L) {
  const m = mean(x);
  let d = 0;
  for (const v of x) d += (v - m) ** 2;
  const out = [];
  for (let k = 1; k <= L; k++) {
    let s = 0;
    for (let t = k; t < x.length; t++) s += (x[t] - m) * (x[t - k] - m);
    out.push(s / d);
  }
  return out;
}

const tTwoSided = (t, df) => tPValue(t, df);
