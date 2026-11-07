// Synthetic crises from a portfolio's own history: calm and stress regimes found from the portfolio's trailing
// volatility, a two-state Markov chain for how often stress starts and how long it lasts, and a block bootstrap of
// real days within each regime, so volatility clustering and the higher correlation of stress days are kept.
// Two sets of paths: ordinary years (the chain as estimated) and crisis years (a stress spell as long as the
// longest in the data, forced in at a random date). Optional shocks push stress days' correlation and volatility
// beyond anything in the sample. The method of ALPHAC's drawdown-control study; no generative model, so every
// simulated day is a real day (or a stated transformation of one) and the result can be checked.
import { z } from "zod";

import { mulberry32, quantile } from "../math.mjs";

const MAX_ASSETS = 100;
const BUDGET = 1e8; // paths x horizon x assets

const pct = (sorted, q) => quantile(sorted, q);

function maxDrawdownOf(path) {
  let peak = 1, v = 1, worst = 0;
  for (const r of path) { v *= 1 + r; if (v > peak) peak = v; const dd = 1 - v / peak; if (dd > worst) worst = dd; }
  return worst;
}

function worstWindow(path, w) {
  if (path.length < w) return null;
  let logSum = 0, worst = Infinity;
  const lg = path.map((r) => Math.log1p(r));
  for (let t = 0; t < lg.length; t++) { logSum += lg[t]; if (t >= w) logSum -= lg[t - w]; if (t >= w - 1 && logSum < worst) worst = logSum; }
  return Math.expm1(worst);
}

function avgPairwiseCorrelation(rows, days) {
  const n = rows[0].length;
  if (n < 2 || days.length < 3) return null;
  const means = new Array(n).fill(0);
  for (const t of days) for (let i = 0; i < n; i++) means[i] += rows[t][i] / days.length;
  const sd = new Array(n).fill(0);
  for (const t of days) for (let i = 0; i < n; i++) sd[i] += (rows[t][i] - means[i]) ** 2;
  let total = 0, pairs = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!sd[i] || !sd[j]) continue;
    let c = 0;
    for (const t of days) c += (rows[t][i] - means[i]) * (rows[t][j] - means[j]);
    total += c / Math.sqrt(sd[i] * sd[j]); pairs += 1;
  }
  return pairs ? total / pairs : null;
}

const annualVol = (x) => {
  if (x.length < 2) return null;
  const m = x.reduce((s, v) => s + v, 0) / x.length;
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1) * 252);
};

export const TOOLS = [
  {
    name: "crisis_scenarios",
    title: "Synthetic crisis scenarios",
    description: "Generate thousands of synthetic years, ordinary and with a crisis forced in, from a portfolio's own daily history: calm and stress regimes from trailing volatility, a Markov chain for how often stress starts and how long it lasts, and a block bootstrap of real days within each regime (keeping volatility clustering and stress-day correlation). Optional shocks raise stress-day correlation and volatility beyond the sample. Returns the distribution of maximum drawdown, the chance of losing 10%, 20% or 30% from a peak, the spread of one-year returns and the worst month, beside the history's own figures.",
    keywords: "crisis scenarios synthetic crash stress testing monte carlo drawdown distribution regime switching block bootstrap tail risk correlation breakdown what if crash simulate crises",
    input: z.object({
      returns: z.array(z.array(z.number()).min(1).max(MAX_ASSETS)).min(126).max(20000).describe("Daily simple returns, one row per day (oldest first), one column per asset, e.g. [[0.01, -0.002], [-0.004, 0.01], ...]; at least 126 days."),
      assets: z.array(z.string().max(60)).max(MAX_ASSETS).optional().describe("Asset names, one per column."),
      weights: z.array(z.number().min(-10).max(10)).min(1).max(MAX_ASSETS).optional().describe("Portfolio weight of each asset (fractions of capital; shorts negative); default equal weights summing to 1."),
      paths: z.number().int().min(100).max(20000).optional().describe("Simulated years per set; default 2000."),
      horizon_days: z.number().int().min(21).max(2520).optional().describe("Days in each simulated path; default 252 (one year)."),
      block: z.number().int().min(1).max(126).optional().describe("Mean block length in days for the bootstrap; default 10."),
      stress_share: z.number().gt(0).lt(0.5).optional().describe("Share of days called stress: those whose trailing volatility is in this top share; default 0.1."),
      vol_window: z.number().int().min(5).max(126).optional().describe("Trailing window for the volatility that defines stress; default 21 days."),
      crisis_days: z.number().int().min(5).max(2520).optional().describe("Length of the forced crisis in the crisis set; default the longest stress spell in the data."),
      correlation_shock: z.number().min(0).max(1).optional().describe("On stress days, move each asset's return this far toward the day's cross-asset average (0 none, 1 all assets move together); default 0."),
      vol_multiplier: z.number().min(0.5).max(5).optional().describe("Scale stress days' returns by this factor; default 1."),
      seed: z.number().int().min(0).max(4294967295).optional().describe("Default 7."),
    }).strict(),
    run(a) {
      const rows = a.returns, T = rows.length, N = rows[0].length;
      for (let t = 0; t < T; t++) {
        if (rows[t].length !== N) throw new Error(`returns row ${t} has ${rows[t].length} values; row 0 has ${N}. Send one column per asset on every day.`);
        for (let i = 0; i < N; i++) {
          const v = rows[t][i];
          if (!Number.isFinite(v)) throw new Error(`returns[${t}][${i}] is not a finite number.`);
          if (v <= -1) throw new Error(`returns[${t}][${i}] is ${v}: a simple return cannot be -100% or lower. Send simple returns, not log returns or percents.`);
        }
      }
      if (a.assets && a.assets.length !== N) throw new Error(`assets has ${a.assets.length} names for ${N} columns.`);
      const w = a.weights ?? new Array(N).fill(1 / N);
      if (w.length !== N) throw new Error(`weights has ${w.length} values for ${N} assets.`);
      const paths = a.paths ?? 2000, H = a.horizon_days ?? 252, block = a.block ?? 10, share = a.stress_share ?? 0.1;
      const W = a.vol_window ?? 21, lambda = a.correlation_shock ?? 0, k = a.vol_multiplier ?? 1, seed = a.seed ?? 7;
      if (2 * paths * H * N > BUDGET) throw new Error(`2 sets x paths x horizon_days x assets = ${2 * paths * H * N} exceeds the ${BUDGET} budget; lower paths to ${Math.floor(BUDGET / (2 * H * N))} or fewer.`);

      // Portfolio returns and the regime of each day, from trailing volatility (expanding at the start).
      const port = rows.map((r) => r.reduce((s, v, i) => s + v * w[i], 0));
      if (port.every((v) => v === port[0])) throw new Error("The portfolio's returns never change: there is no risk to simulate.");
      const trailing = port.map((_, t) => {
        const lo = Math.max(0, t - W + 1), x = port.slice(lo, t + 1);
        if (x.length < 5) return null;
        const m = x.reduce((s, v) => s + v, 0) / x.length;
        return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
      });
      const known = trailing.filter((v) => v !== null).sort((x, y) => x - y);
      const cut = pct(Float64Array.from(known), 1 - share);
      const stress = trailing.map((v) => v !== null && v >= cut && v > 0);
      const calmDays = [], stressDays = [];
      stress.forEach((s, t) => (s ? stressDays : calmDays).push(t));
      if (stressDays.length < 5 || calmDays.length < 5) throw new Error(`Only ${stressDays.length} stress and ${calmDays.length} calm days were found; send a longer or more varied history.`);

      // Stress spells and the chain's transition probabilities.
      const spells = [];
      let run = 0, cs = 0, cc = 0, sc = 0, ss = 0;
      for (let t = 0; t < T; t++) {
        if (stress[t]) run += 1; else if (run) { spells.push(run); run = 0; }
        if (t + 1 < T) { if (stress[t]) { if (stress[t + 1]) ss++; else sc++; } else if (stress[t + 1]) cs++; else cc++; }
      }
      if (run) spells.push(run);
      const pEnter = cs / Math.max(1, cs + cc), pExit = sc / Math.max(1, sc + ss);
      const crisisDays = Math.min(H, a.crisis_days ?? Math.max(...spells));

      // Day transformation on stress days: toward the cross-asset average, then scaled.
      const dayReturn = (t, state) => {
        const r = rows[t];
        if (state !== 1 || (lambda === 0 && k === 1)) return port[t];
        const m = r.reduce((s, v) => s + v, 0) / N;
        let p = 0;
        for (let i = 0; i < N; i++) p += Math.max(-0.999999, k * ((1 - lambda) * r[i] + lambda * m)) * w[i];
        return p;
      };

      const rand = mulberry32(seed);
      const pools = [calmDays, stressDays];
      const simulate = (forceCrisis) => {
        const out = new Float64Array(H);
        const start = forceCrisis ? Math.floor(rand() * (H - crisisDays + 1)) : -1;
        let state = rand() < stressDays.length / T ? 1 : 0, cur = -1;
        for (let t = 0; t < H; t++) {
          const forced = forceCrisis && t >= start && t < start + crisisDays;
          const prev = state;
          if (forced) state = 1;
          else if (t > 0) state = state === 1 ? (rand() < pExit ? 0 : 1) : (rand() < pEnter ? 1 : 0);
          const pool = pools[state];
          const next = cur + 1;
          if (cur < 0 || state !== prev || rand() < 1 / block || next >= T || stress[next] !== (state === 1)) cur = pool[Math.floor(rand() * pool.length)];
          else cur = next;
          out[t] = dayReturn(cur, state);
        }
        return out;
      };

      const summarise = (forceCrisis) => {
        const dd = new Float64Array(paths), tot = new Float64Array(paths), month = new Float64Array(paths);
        let over10 = 0, over20 = 0, over30 = 0;
        for (let p = 0; p < paths; p++) {
          const path = simulate(forceCrisis);
          dd[p] = maxDrawdownOf(path);
          tot[p] = path.reduce((v, r) => v * (1 + r), 1) - 1;
          month[p] = worstWindow(path, 21) ?? 0;
          if (dd[p] > 0.1) over10++; if (dd[p] > 0.2) over20++; if (dd[p] > 0.3) over30++;
        }
        dd.sort(); tot.sort(); month.sort();
        return {
          max_drawdown_median: pct(dd, 0.5), max_drawdown_p90: pct(dd, 0.9), max_drawdown_p95: pct(dd, 0.95), max_drawdown_p99: pct(dd, 0.99), max_drawdown_worst: dd[paths - 1],
          chance_drawdown_over_10pct: over10 / paths, chance_drawdown_over_20pct: over20 / paths, chance_drawdown_over_30pct: over30 / paths,
          total_return_p5: pct(tot, 0.05), total_return_median: pct(tot, 0.5), total_return_p95: pct(tot, 0.95),
          worst_month_median: pct(month, 0.5), worst_month_p5: pct(month, 0.05),
        };
      };
      const ordinary = summarise(false), crisis = summarise(true);
      const measures = Object.keys(ordinary);

      // The history itself, over its whole length and its worst horizon-long window.
      let worstWindowDd = 0;
      for (let s = 0; s + H <= T; s += Math.max(1, Math.floor(H / 12))) worstWindowDd = Math.max(worstWindowDd, maxDrawdownOf(port.slice(s, s + H)));
      const stressReturns = stressDays.map((t) => port[t]), calmReturns = calmDays.map((t) => port[t]);
      return {
        regimes: {
          days: T, calm_days: calmDays.length, stress_days: stressDays.length, stress_spells: spells.length,
          longest_stress_spell_days: Math.max(...spells), mean_stress_spell_days: spells.reduce((s, v) => s + v, 0) / spells.length,
          chance_stress_starts_per_day: pEnter, chance_stress_ends_per_day: pExit,
          annual_volatility_calm: annualVol(calmReturns), annual_volatility_stress: annualVol(stressReturns),
          average_pairwise_correlation_calm: avgPairwiseCorrelation(rows, calmDays), average_pairwise_correlation_stress: avgPairwiseCorrelation(rows, stressDays),
        },
        history: { max_drawdown_whole_sample: maxDrawdownOf(port), worst_max_drawdown_in_any_horizon_window: T >= H ? worstWindowDd : null, worst_month: worstWindow(port, 21) },
        columns: ["measure", "ordinary_years", "crisis_years"],
        rows: measures.map((m) => [m, ordinary[m], crisis[m]]),
        settings: { paths, horizon_days: H, block, stress_share: share, vol_window: W, crisis_days: crisisDays, correlation_shock: lambda, vol_multiplier: k, seed, weights: a.assets ? Object.fromEntries(a.assets.map((n, i) => [n, w[i]])) : w },
        method: "Regimes: a day is stress when the portfolio's trailing volatility is in the top stress_share of the sample. Ordinary years follow the two-state Markov chain estimated from those days; crisis years force one stress spell of crisis_days at a uniformly random start. Within a regime, days are drawn in blocks of consecutive real days of the same regime (mean length block), so clustering and the cross-asset correlation of stress days are kept. correlation_shock and vol_multiplier transform stress days only. mulberry32(seed): the same inputs give the same answer.",
        limits: [
          "Every simulated day is a historical day of the same regime (or its stated transformation): a crisis worse than any day in the sample needs vol_multiplier or correlation_shock.",
          "Weights are held constant every day (daily rebalancing); no costs, leverage limits or margin calls.",
          "The regimes come from the portfolio's own volatility, not from economic events; a short history gives few stress spells and a rough chain.",
          "Not investment advice.",
        ],
      };
    },
  },
];
