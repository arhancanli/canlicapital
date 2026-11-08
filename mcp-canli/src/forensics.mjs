// mcp-canli/src/forensics.mjs
//
// backtest_forensics: one call that reads a backtest's returns for every common way a backtest misleads, each with
// its evidence and what would clear it. The search behind it (luck and overfitting, from audit_backtest), factor
// exposure sold as skill (a regression on the Fama-French five factors and momentum), lookahead in the weights
// (lookahead_check), smoothing and tail risk (autocorrelation and skew), a few days carrying the result, an edge that
// fades, numbers too good for real trading, and how it compares with the Lab's million strategies over the same months.
// Flags are reasons to look, not verdicts; a clean report does not make a strategy good.
import { z } from "zod";

export const FORENSICS_LIMITS = "Flags are reasons to look, not verdicts, and a clean report does not make a strategy good. It reads the returns (and weights) given, not the code, so survivorship, a universe chosen with hindsight or revised data can leave no trace here; check_leakage and placebo_test test the pipeline itself.";

export const FORENSICS_TOOL = Object.freeze({
  name: "backtest_forensics", pack: "desk", toolset: "desk", title: "Every common way a backtest misleads, checked in one call",
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  input: z.object({
    returns: z.array(z.number().finite()).min(60).max(200000).describe("The strategy's daily returns, as fractions."),
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(60).max(200000).describe("The date of each return."),
    trials_tried: z.number().int().min(1).max(10000000).optional().describe("How many strategies or settings were tried to find this one, if known."),
    variants: z.array(z.array(z.number().finite())).max(199).optional().describe("The other variants tried, each a return series as long as returns, for the overfitting check."),
    weights: z.array(z.union([z.number(), z.null()])).optional().describe("Target weights per day, with prices, for the lookahead check."),
    prices: z.array(z.number().positive()).optional(),
    factors: z.boolean().optional().describe("Regress on the Fama-French five factors and momentum (reads French's library); default true."),
  }).strict(),
  description: "Read a backtest's daily returns for every common way a backtest misleads, each with evidence and what would clear it: the search behind it (deflated Sharpe, overfitting), factor exposure sold as skill (alpha after the Fama-French five factors and momentum), lookahead in the weights, smoothing and selling tail risk, a few days carrying the result, an edge that fades, numbers too good for real trading, and, with the Lab built, near-copies and the luck bar among a million strategies over the same months. Flags are reasons to look, not verdicts.",
  keywords: "backtest lie detector forensics audit too good to be true overfitting lookahead factor exposure alpha smoothing tail risk concentration decay red flags due diligence",
  args: "returns: number[], dates: string[], trials_tried?: integer, variants?: number[][], weights?: number[], prices?: number[], factors?: boolean",
});

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
const sharpe = (xs) => { const s = sd(xs); return s > 0 ? (mean(xs) / s) * Math.sqrt(252) : 0; };
const r3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(3)));

// The shape checks, computed here.
export function shapeChecks(r) {
  const n = r.length, m = mean(r), s = sd(r), sr = sharpe(r);
  const skew = r.reduce((a, x) => a + ((x - m) / s) ** 3, 0) / n, kurt = r.reduce((a, x) => a + ((x - m) / s) ** 4, 0) / n - 3;
  let num = 0, den = 0;
  for (let i = 0; i < n; i += 1) { den += (r[i] - m) ** 2; if (i) num += (r[i] - m) * (r[i - 1] - m); }
  const rho = den > 0 ? num / den : 0, adjusted = sr * Math.sqrt(Math.max(0, (1 - rho) / (1 + rho)));
  const logs = r.map((x) => Math.log1p(Math.max(x, -0.999))), total = logs.reduce((a, x) => a + x, 0);
  const top = Math.max(1, Math.floor(n / 100)), best = [...logs].sort((a, b) => b - a).slice(0, top).reduce((a, x) => a + x, 0);
  // Most strategies lose money without their best 1% of days; what matters is best days far above what normal returns
  // with the same mean and volatility give (the top 1% of a normal averages its mean plus 2.665 sd).
  const lm = mean(logs), ls = sd(logs), normalBest = top * (lm + 2.665 * ls), lumpy = best > 1.5 * normalBest && total - best <= 0;
  const half = Math.floor(n / 2), first = sharpe(r.slice(0, half)), second = sharpe(r.slice(half));
  const up = r.filter((x) => x > 0).length / n;
  return {
    smoothing_and_tails: {
      evidence: { lag1_autocorrelation: r3(rho), sharpe: r3(sr), sharpe_if_autocorrelation_removed: r3(adjusted), skew: r3(skew), excess_kurtosis: r3(kurt) },
      flag: rho > 0.1 || (skew < -1 && sr > 1),
      finding: rho > 0.1 ? `Daily returns are autocorrelated (${rho.toFixed(2)}): smoothed or stale prices make a Sharpe look higher than it is; about ${adjusted.toFixed(2)} without it.` : skew < -1 && sr > 1 ? `A high Sharpe with skew ${skew.toFixed(2)}: the shape of a strategy that collects small gains and gives them back in rare large losses.` : "No sign of smoothing, and no strongly negative skew.",
      clears_it: "Returns from tradable prices at the times traded; the drawdowns in the worst stretches of the sample stated plainly.",
    },
    concentration: {
      evidence: { days: n, best_one_percent_days: top, their_log_return: r3(best), as_normal_returns_would_give: r3(normalBest), log_return_without_them: r3(total - best) },
      flag: lumpy,
      finding: lumpy ? `The best ${top} days carry the whole result, and they are ${(best / normalBest).toFixed(1)} times what returns of the same mean and volatility would put there: a few outsized days, not a steady edge.` : `The best ${top} days are about what returns of this mean and volatility give${total - best <= 0 ? " (without them it loses money, as most strategies with a modest Sharpe do)" : ""}.`,
      clears_it: "A reason the result rests on so few days, and those days known in advance to the rule, not found after.",
    },
    decay: {
      evidence: { sharpe_first_half: r3(first), sharpe_second_half: r3(second) },
      flag: first > 0.5 && second < first / 3,
      finding: first > 0.5 && second < first / 3 ? `Sharpe ${first.toFixed(2)} in the first half and ${second.toFixed(2)} in the second: the edge fades, as published or crowded ones do.` : "No sharp fall from the first half to the second.",
      clears_it: "A forward record from today (track_commit), since the second half was seen when the strategy was chosen.",
    },
    too_good: {
      evidence: { sharpe: r3(sr), share_of_days_up: r3(up) },
      flag: sr > 3 || up > 0.7,
      finding: sr > 3 || up > 0.7 ? `A Sharpe of ${sr.toFixed(2)} with ${(up * 100).toFixed(0)}% of days up is rare in real trading at any size; costs, fills, capacity or the data are the usual reasons.` : "Within what real strategies show.",
      clears_it: "Costs and fills checked (check_feasibility), the price data's source named, and capacity stated.",
    },
  };
}

// ctx: { call(name, args), lab: () => the Lab or throws, sessionTrials: number, runOriginality }.
export async function runForensics(ctx, args) {
  const a = FORENSICS_TOOL.input.parse(args ?? {});
  if (a.returns.length !== a.dates.length) throw new Error(`returns has ${a.returns.length} values and dates ${a.dates.length}.`);
  if (a.variants?.some((v) => v.length !== a.returns.length)) throw new Error("Each variant must be as long as returns.");
  if ((a.weights === undefined) !== (a.prices === undefined)) throw new Error("The lookahead check needs weights and prices together.");
  const tried = Math.max(a.trials_tried ?? 1, ctx.sessionTrials ?? 0);
  const safe = (p) => p.then((r) => ({ r }), (e) => ({ error: String(e?.message ?? e).slice(0, 300) }));
  const [audit, factors, look] = await Promise.all([
    // audit_backtest takes the variants as one row per period, this strategy first among the columns.
    safe(ctx.call("audit_backtest", { returns: a.returns, periods_per_year: 252, ...(a.variants?.length ? { variants: a.returns.map((x, t) => [x, ...a.variants.map((v) => v[t])]) } : {}), ...(tried > 1 ? { effective_independent_trials: tried } : {}) })),
    a.factors === false ? Promise.resolve(null) : safe(ctx.call("factor_returns", { model: "ff5_momentum", frequency: "daily", start: a.dates[0], end: a.dates.at(-1) })),
    a.weights ? safe(ctx.call("lookahead_check", { prices: a.prices, weights: a.weights })) : Promise.resolve(null),
  ]);
  const checks = {};

  if (audit.error) checks.search = { flag: null, finding: `Not checked: ${audit.error}` };
  else {
    const h = audit.r.headline ?? {}, dsr = audit.r.checks?.deflated_sharpe?.data?.result?.deflated_sharpe_ratio ?? audit.r.checks?.deflated_sharpe?.data?.deflated_sharpe_ratio ?? null;
    const pbo = audit.r.checks?.overfitting?.data?.pbo ?? null;
    checks.search = {
      evidence: { trials_counted: tried, headline_test: h.test ?? null, headline_p: r3(h.p_value ?? h.p), deflated_sharpe: r3(dsr), overfitting_probability: r3(pbo) },
      flag: (typeof (h.p_value ?? h.p) === "number" && (h.p_value ?? h.p) > 0.05) || (typeof pbo === "number" && pbo >= 0.5),
      finding: tried === 1 && !a.variants ? "Counted as the only strategy tried. If others were tried, give trials_tried or variants: the count is what decides this check." : `Judged against ${tried} tries${a.variants ? ` and ${a.variants.length} variants` : ""}.`,
      fix_next: audit.r.fix_next ?? null,
      clears_it: "A hypothesis registered before the data (preregister) and one test on years kept aside (holdout_set, holdout_test).",
    };
  }

  if (factors === null) checks.factor_exposure = { flag: null, finding: "Not run (factors: false)." };
  else if (factors.error) checks.factor_exposure = { flag: null, finding: `Not checked: ${factors.error}` };
  else {
    const cols = factors.r.columns, at = new Map(factors.r.rows.map((row) => [row[0], row]));
    const names = ["Mkt-RF", "SMB", "HML", "RMW", "CMA", "Mom"].filter((c) => cols.includes(c));
    const ys = [], xs = [];
    a.dates.forEach((d, i) => { const row = at.get(d); if (!row) return; ys.push(a.returns[i] - row[cols.indexOf("RF")]); xs.push(names.map((c) => row[cols.indexOf(c)])); });
    if (ys.length < 60) checks.factor_exposure = { flag: null, finding: `Only ${ys.length} of the days match French's daily factors (published through ${factors.r.data_through ?? "a recent month"}).` };
    else {
      const reg = await safe(ctx.call("factor_regression", { returns: ys, factors: xs, factor_names: names, periods_per_year: 252 }));
      if (reg.error) checks.factor_exposure = { flag: null, finding: `Not checked: ${reg.error}` };
      else {
        const betas = Object.fromEntries(reg.r.rows.filter((row) => row[0] !== "alpha").map((row) => [row[0], r3(row[1])]));
        const t = reg.r.alpha_t, raw = sharpe(ys);
        checks.factor_exposure = {
          evidence: { days: ys.length, alpha_annual: r3(reg.r.alpha_annual), alpha_t: r3(t), r_squared: r3(reg.r.r_squared), betas, standard_errors: reg.r.standard_errors },
          flag: raw > 0.5 && !(t >= 2),
          finding: t >= 2 ? `An alpha of ${(reg.r.alpha_annual * 100).toFixed(1)}% a year (t ${t.toFixed(1)}) is left after the five factors and momentum.` : `After the five factors and momentum the alpha's t is ${Number(t).toFixed(1)}: the excess return is ${raw > 0.5 ? "mostly" : "largely"} what those exposures earn, available far more cheaply.`,
          clears_it: "Alpha with a t of 2 or more (3 for a new factor, after Harvey, Liu and Zhu) after these factors, out of sample.",
        };
      }
    }
  }

  if (look === null) checks.lookahead = { flag: null, finding: "Not checked: give weights and prices." };
  else if (look.error) checks.lookahead = { flag: null, finding: `Not checked: ${look.error}` };
  else checks.lookahead = { evidence: { by_lag: look.r.rows }, flag: Boolean(look.r.lookahead_pattern), finding: look.r.verdict, clears_it: "check_leakage on the code that made the weights." };

  Object.assign(checks, shapeChecks(a.returns));

  let lab;
  try { lab = ctx.lab(); } catch (e) { checks.originality = { flag: null, finding: String(e.message).replace("The Lab is not built on this machine.", "Not checked: the Lab is not built on this machine.") }; }
  if (lab) {
    try {
      const o = ctx.runOriginality(lab, { returns: a.returns, dates: a.dates, nearest: 3 });
      const pct = o.rank.percentile;
      checks.originality = {
        evidence: { lab_strategies_compared: o.compared, corr_0_7_or_more: o.near_copies.at_least_0_7, nearest: o.nearest.rows, percentile_among_same_months: pct ?? null, lab_best_same_months: o.rank.lab_best_same_months ?? null },
        flag: o.near_copies.at_least_0_9 > 0,
        finding: o.reading,
        clears_it: "A reason it is not one of the simple rules it resembles, or a result above the best of them.",
      };
    } catch (e) { checks.originality = { flag: null, finding: `Not checked: ${e.message}` }; }
  }

  const flags = Object.entries(checks).filter(([, c]) => c.flag === true).map(([k]) => k);
  const notChecked = Object.entries(checks).filter(([, c]) => c.flag === null).map(([k]) => k);
  return {
    flags, ...(notChecked.length ? { not_checked: notChecked } : {}),
    reading: flags.length ? `${flags.length} reason${flags.length === 1 ? "" : "s"} to look closer: ${flags.join(", ")}.` : `No flag raised by the ${Object.keys(checks).length - notChecked.length} checks that ran.`,
    checks,
    believable_next: "Register the hypothesis (preregister), test once on years kept aside (holdout_test), and from today commit each day's positions before the day (track_commit): a record nobody can have fitted.",
    limits: FORENSICS_LIMITS,
  };
}
