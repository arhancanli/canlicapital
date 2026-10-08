// The sleeve library as tools: browse the 399 pre-defined sleeves, run any of them on your prices,
// and run them all at once with the corrections a many-strategy search needs.
//
// Every sleeve runs through the same costed, drift-aware engine as the backtest tools. Statistics
// across sleeves are computed on a common window that starts once every included sleeve can trade,
// so long-lookback sleeves are not compared on their idle warm-up.
//
// Multiple-testing machinery (all deterministic for a given seed):
// - Deflated Sharpe ratio for the best sleeve, with the raw count of sleeves and with the effective
//   number of independent sleeves (K^2 / sum of squared pairwise correlations).
// - White's Reality Check against a benchmark (unstudentized, as arch computes it), and Hansen's SPA
//   test and Romano-Wolf StepM re-studentized in every resample: each bootstrap mean is divided by
//   that resample's own standard deviation (Romano and Wolf 2005). The Null Zoo benchmark measured
//   the fixed-variance studentization, which reuses one variance estimate, rejecting 9.4% of
//   skill-less searches at block length 8 and 13.5% at 22 under AR(1) at a nominal 5%;
//   re-studentizing brought it to 6.6%. The default mean block length is round(n^(1/3)).
// - Probability of backtest overfitting by combinatorially symmetric cross-validation (CSCV).
// The bootstrap draws come from mulberry32(seed), so anyone can regenerate them.
import { z } from "zod";

import { correlation, mean, moments, mulberry32, normCdf, normInv, quantile, std, variance } from "../math.mjs";
import { MAX_SERIES, ppyArg } from "../inputs.mjs";
import { FAMILY_INFO, SLEEVES, SLEEVE_BY_ID } from "../sleeves.mjs";
import { RECIPES, runEngine, statsOf } from "./strategies.mjs";

const FAMILIES = Object.keys(FAMILY_INFO);
const MAX_ASSETS = 50;

const pricesIn = z.union([
  z.array(z.number().positive()).min(60).max(MAX_SERIES),
  z.array(z.array(z.number().positive()).min(1).max(MAX_ASSETS)).min(60).max(MAX_SERIES),
]).describe("Prices oldest first: one array for a single asset, or one row per period with a column per asset (daily bars assumed by the sleeve parameters).");
const engineArgs = {
  cost_bps: z.number().min(0).max(1000).optional().describe("Cost in basis points per unit of turnover; default 5."),
  periods_per_year: ppyArg,
  risk_free: z.number().gt(-1).lt(1).optional().describe("Annual rate earned on uninvested cash; default 0."),
  asset: z.number().int().min(0).max(MAX_ASSETS - 1).optional().describe("Column traded by single-asset sleeves; default 0."),
  pair: z.tuple([z.number().int().min(0).max(MAX_ASSETS - 1), z.number().int().min(0).max(MAX_ASSETS - 1)]).optional().describe("Columns [y, x] for pair sleeves; default [0, 1]."),
  symbols: z.array(z.string().min(1).max(20)).max(MAX_ASSETS).optional().describe("A name per column, e.g. [\"SPY\", \"TLT\"], to label target weights."),
};
const selectArgs = {
  families: z.array(z.enum(FAMILIES)).max(FAMILIES.length).optional().describe("Only these families; default all."),
  ids: z.array(z.string().max(60)).max(400).optional().describe("Only these sleeve ids; default all that fit the data."),
  min_evaluation: z.number().int().min(60).max(MAX_SERIES).optional().describe("Fewest periods every sleeve is evaluated on; sleeves needing longer warm-ups are dropped. Default 252."),
};

function matrixOf(prices) {
  const P = typeof prices[0] === "number" ? prices.map((x) => [x]) : prices;
  const N = P[0].length;
  P.forEach((r, t) => { if (r.length !== N) throw new Error(`prices row ${t} has ${r.length} columns, row 0 has ${N}.`); });
  return P;
}

function checkColumns(a, N) {
  if ((a.asset ?? 0) >= N) throw new Error(`asset ${a.asset} is not a column of ${N}.`);
  const [y, x] = a.pair ?? [0, 1];
  if (N >= 2 && (y >= N || x >= N || y === x)) throw new Error(`pair must be two different columns below ${N}.`);
  if (a.symbols && a.symbols.length !== N) throw new Error(`symbols has ${a.symbols.length} names for ${N} columns.`);
}

// Why a sleeve cannot run on this data, or null when it can.
function unfit(s, N, T, minEval) {
  if (s.data !== "single" && N < 2) return "needs at least two columns";
  if (s.recipe === "min_variance_rebalance" && s.params.lookback <= N) return `lookback ${s.params.lookback} must exceed ${N} assets`;
  if (s.warmup > T - 1 - minEval) return `warm-up of ${s.warmup} periods leaves fewer than ${minEval} to evaluate`;
  return null;
}

// Runs one sleeve; returns net returns, the asset columns it trades, and the target as of the last close.
function runSleeve(s, P, a) {
  const N = P[0].length, ppy = a.periods_per_year ?? 252;
  const cols = s.data === "single" ? [a.asset ?? 0] : s.data === "pair" ? (a.pair ?? [0, 1]) : [...Array(N).keys()];
  const sub = P.map((r) => cols.map((i) => r[i]));
  const prices = s.data === "single" ? sub.map((r) => r[0]) : sub;
  const b = RECIPES[s.recipe].build({ prices, ...s.params, periods_per_year: ppy });
  const eng = runEngine(b.P, b.targets, { cost_bps: a.cost_bps ?? 5, periods_per_year: ppy, risk_free: a.risk_free ?? 0 });
  const last = b.targets[b.targets.length - 1] ?? eng.final_weights;
  return { net: eng.net, gross: eng.gross, turnovers: eng.turnovers, cols, target: last, rule: b.rule };
}

const labelTarget = (cols, w, N, symbols) => {
  const out = {};
  cols.forEach((c, j) => { const k = symbols ? symbols[c] : `col${c}`; out[k] = (out[k] ?? 0) + w[j]; });
  for (const k of Object.keys(out)) if (Math.abs(out[k]) < 1e-12) out[k] = 0;
  return out;
};

function selectSleeves(a, N, T) {
  const minEval = a.min_evaluation ?? 252;
  let pool = SLEEVES;
  if (a.ids) {
    const missing = a.ids.filter((id) => !SLEEVE_BY_ID.has(id));
    if (missing.length) throw new Error(`No sleeve ${missing.slice(0, 3).join(", ")}. list_sleeves shows the ids.`);
    pool = a.ids.map((id) => SLEEVE_BY_ID.get(id));
  }
  if (a.families) pool = pool.filter((s) => a.families.includes(s.family));
  const skipped = [], chosen = [];
  for (const s of pool) { const why = unfit(s, N, T, minEval); if (why) skipped.push([s.id, why]); else chosen.push(s); }
  if (chosen.length < 2) throw new Error(`Only ${chosen.length} sleeve(s) fit ${T} periods x ${N} column(s)${skipped.length ? ` (e.g. ${skipped[0][0]}: ${skipped[0][1]})` : ""}; send more history or columns.`);
  const W = Math.max(...chosen.map((s) => s.warmup));
  return { chosen, skipped, W };
}

// All chosen sleeves on the common window [W, T-1): returns R[k] (net returns), and the benchmark.
function runAll(P, a, chosen, W) {
  const runs = chosen.map((s) => runSleeve(s, P, a));
  const R = runs.map((r) => r.net.slice(W));
  const N = P[0].length, ppy = a.periods_per_year ?? 252;
  let B;
  if ((a.benchmark ?? "buy_and_hold") === "cash") { const rfp = (1 + (a.risk_free ?? 0)) ** (1 / ppy) - 1; B = new Array(R[0].length).fill(rfp); }
  else B = runEngine(P, P.map((_, t) => (t === 0 ? new Array(N).fill(1 / N) : null)), { cost_bps: 0, periods_per_year: ppy, risk_free: a.risk_free ?? 0 }).net.slice(W);
  return { runs, R, B };
}

const perSharpe = (x) => { const sd = std(x); return sd > 0 ? mean(x) / sd : 0; };

// Deflated Sharpe ratio of a return series given the variance of per-period Sharpes across trials.
function deflated(ret, trials, sharpeVar) {
  const n = ret.length, sr = perSharpe(ret), m = moments(ret), k4 = m.excess_kurtosis + 3, EG = 0.5772156649015329;
  const star = trials > 1 ? Math.sqrt(sharpeVar) * ((1 - EG) * normInv(1 - 1 / trials) + EG * normInv(1 - 1 / (trials * Math.E))) : 0;
  return { star, dsr: normCdf((sr - star) * Math.sqrt(n - 1) / Math.sqrt(1 - m.skew * sr + (k4 - 1) / 4 * sr * sr)) };
}

// Pairwise correlations from z-scores computed once (series with zero variance must be removed first).
function corrMatrix(R) {
  const K = R.length, n = R[0].length;
  const z = R.map((x) => { const m = mean(x), s = std(x, 0); return Float64Array.from(x, (v) => (v - m) / s); });
  const C = Array.from({ length: K }, () => new Float64Array(K));
  for (let i = 0; i < K; i++) {
    C[i][i] = 1;
    const zi = z[i];
    for (let j = i + 1; j < K; j++) { const zj = z[j]; let c = 0; for (let t = 0; t < n; t++) c += zi[t] * zj[t]; C[i][j] = C[j][i] = c / n; }
  }
  return C;
}

// Effective number of independent series: K^2 / sum_ij rho_ij^2 (the participation ratio of the
// correlation matrix's eigenvalues). Series with zero variance are left out.
function effectiveTrials(R, C) {
  const live = C ? R : R.filter((x) => std(x) > 0), K = live.length;
  if (K < 2) return K;
  const M = C ?? corrMatrix(live);
  let s2 = 0;
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) s2 += M[i][j] * M[i][j];
  return (K * K) / s2;
}

// Stationary bootstrap (Politis and Romano 1994) as a list of [start, length] runs over n positions,
// drawn from mulberry32(seed): at each step one uniform decides a new block (probability 1/block),
// and a second picks its start.
export function bootstrapRuns(n, block, rand) {
  const p = 1 / block, runs = [];
  let start = 0, len = 0, idx = 0;
  for (let t = 0; t < n; t++) {
    const u = rand();
    if (t === 0 || u < p) {
      if (t > 0) runs.push([start, len]);
      idx = Math.floor(rand() * n); start = idx; len = 1;
    } else { idx = (idx + 1) % n; len++; }
  }
  runs.push([start, len]);
  return runs;
}

const runSum = (S, n, start, len) => {
  let total = Math.floor(len / n) * S[n], rem = len % n;
  if (start + rem <= n) total += S[start + rem] - S[start];
  else total += S[n] - S[start] + S[start + rem - n];
  return total;
};

// Joint tests on d[k] = sleeve - benchmark, with one stationary bootstrap shared by all sleeves.
function jointTests(R, B, { reps, block, seed, size }) {
  const n = B.length, cols = [], keep = [];
  R.forEach((x, k) => { const d = x.map((v, t) => v - B[t]); if (std(d) > 0) { cols.push(d); keep.push(k); } });
  const K = cols.length;
  if (K === 0) return null;
  const m = cols.map(mean), sd = cols.map((c) => std(c)), rn = Math.sqrt(n), tObs = m.map((v, k) => rn * v / sd[k]);
  const thr = sd.map((v) => -v * Math.sqrt(2 * Math.log(Math.log(n)) / n));
  const centers = [m.map((v) => Math.max(v, 0)), m.map((v, k) => (v >= thr[k] ? v : 0)), m];
  const pref = (c, sq) => { const s = new Float64Array(n + 1); for (let t = 0; t < n; t++) s[t + 1] = s[t] + (sq ? c[t] * c[t] : c[t]); return s; };
  const S1 = cols.map((c) => pref(c, false)), S2 = cols.map((c) => pref(c, true));
  const rand = mulberry32(seed), rc = new Float64Array(reps).fill(-Infinity), spa = [0, 1, 2].map(() => new Float64Array(reps).fill(0));
  const tStar = Array.from({ length: K }, () => new Float64Array(reps));
  for (let r = 0; r < reps; r++) {
    const runs = bootstrapRuns(n, block, rand);
    for (let k = 0; k < K; k++) {
      let s1 = 0, s2 = 0;
      for (const [st, len] of runs) { s1 += runSum(S1[k], n, st, len); s2 += runSum(S2[k], n, st, len); }
      const mb = s1 / n, sdb = Math.sqrt(Math.max(0, (s2 - s1 * s1 / n) / (n - 1)));
      if (mb - m[k] > rc[r]) rc[r] = mb - m[k];
      for (let j = 0; j < 3; j++) { const v = sdb > 0 ? rn * (mb - centers[j][k]) / sdb : 0; if (v > spa[j][r]) spa[j][r] = v; }
      tStar[k][r] = sdb > 0 ? rn * (mb - m[k]) / sdb : -Infinity;
    }
  }
  const obsRC = Math.max(...m), obsSPA = Math.max(0, ...tObs);
  let rcCount = 0; for (let r = 0; r < reps; r++) if (rc[r] > obsRC) rcCount++;
  const pv = spa.map((sims) => { let c = 0; for (let r = 0; r < reps; r++) if (sims[r] >= obsSPA) c++; return c / reps; });
  // StepM: reject every sleeve whose t-statistic beats the (1 - size) quantile of the largest
  // re-studentized resample among those not yet rejected; repeat until nothing new is rejected.
  const superior = [];
  let active = [...Array(K).keys()];
  while (active.length) {
    const mx = new Float64Array(reps).fill(-Infinity);
    for (const k of active) for (let r = 0; r < reps; r++) if (tStar[k][r] > mx[r]) mx[r] = tStar[k][r];
    const crit = quantile(mx.sort(), 1 - size), better = active.filter((k) => tObs[k] > crit);
    if (!better.length) break;
    superior.push(...better);
    active = active.filter((k) => !better.includes(k));
  }
  return { tested: K, statistic: obsSPA, p_values: { lower: pv[0], consistent: pv[1], upper: pv[2] }, reality_check: rcCount / reps, superior: superior.map((k) => keep[k]).sort((x, y) => x - y) };
}

// Combinatorially symmetric cross-validation (Bailey, Borwein, Lopez de Prado and Zhu 2017).
function* combinations(n, k) {
  const c = [...Array(k).keys()];
  for (;;) {
    yield c;
    let i = k - 1;
    while (i >= 0 && c[i] === n - k + i) i--;
    if (i < 0) return;
    c[i]++;
    for (let j = i + 1; j < k; j++) c[j] = c[j - 1] + 1;
  }
}

function pbo(R, S) {
  const K = R.length, n = R[0].length, m = Math.floor(n / S), off = n - S * m, half = S / 2;
  const sums = R.map((x) => { const s = new Float64Array(S), q = new Float64Array(S); for (let c = 0; c < S; c++) for (let t = off + c * m; t < off + (c + 1) * m; t++) { s[c] += x[t]; q[c] += x[t] * x[t]; } return [s, q]; });
  const sharpeOf = (k, chunks) => { let s = 0, q = 0; for (const c of chunks) { s += sums[k][0][c]; q += sums[k][1][c]; } const len = chunks.length * m, mu = s / len, v = (q - s * s / len) / (len - 1); return v > 0 ? mu / Math.sqrt(v) : 0; };
  const logits = [], isB = [], oosB = [];
  for (const IS of combinations(S, half)) {
    const OOS = [...Array(S).keys()].filter((c) => !IS.includes(c));
    let best = 0, bestV = -Infinity;
    for (let k = 0; k < K; k++) { const v = sharpeOf(k, IS); if (v > bestV) { bestV = v; best = k; } }
    const oos = Array.from({ length: K }, (_, k) => sharpeOf(k, OOS)), mine = oos[best];
    let less = 0, eq = 0; for (let k = 0; k < K; k++) { if (oos[k] < mine) less++; else if (oos[k] === mine && k !== best) eq++; }
    const w = (1 + less + 0.5 * eq) / (K + 1);
    logits.push(Math.log(w / (1 - w))); isB.push(bestV); oosB.push(mine);
  }
  const mx = mean(isB), my = mean(oosB);
  let sxy = 0, sxx = 0; for (let i = 0; i < isB.length; i++) { sxy += (isB[i] - mx) * (oosB[i] - my); sxx += (isB[i] - mx) ** 2; }
  return { probability: logits.filter((l) => l <= 0).length / logits.length, splits: S, combinations: logits.length, median_logit: quantile(Float64Array.from(logits).sort(), 0.5), probability_oos_loss: oosB.filter((v) => v < 0).length / oosB.length, degradation_slope: sxx > 0 ? sxy / sxx : null };
}

function familyTable(rows) {
  const by = {};
  for (const r of rows) (by[r.family] ??= []).push(r);
  return Object.entries(by).map(([f, rs]) => { const sh = rs.map((r) => r.sharpe).sort((x, y) => x - y); const best = rs.reduce((b, r) => (r.sharpe > b.sharpe ? r : b)); return [f, rs.length, quantile(Float64Array.from(sh), 0.5), best.id, best.sharpe]; }).sort((x, y) => y[2] - x[2]);
}

const listRow = (s) => [s.id, s.family, s.data, s.rule];

export const TOOLS = [
  {
    name: "list_sleeves",
    title: "List strategy sleeves",
    description: `Browse the library of ${SLEEVES.length} pre-defined strategy sleeves (${FAMILIES.length} families: trend, momentum, reversion, volatility, allocation, pairs). Each is a fixed rule with a spec hash; filter by family, data shape or words.`,
    keywords: "sleeves strategy library catalog list browse families trend momentum mean reversion allocation pairs",
    input: z.object({
      query: z.string().max(200).optional().describe("Words to match in the id or rule, e.g. \"momentum 252\"."),
      family: z.enum(FAMILIES).optional().describe("Only this family."),
      data: z.enum(["single", "universe", "pair"]).optional().describe("single: one asset; universe: several columns; pair: two columns."),
      limit: z.number().int().min(1).max(400).optional().describe("Default 50."),
      offset: z.number().int().min(0).max(400).optional().describe("Skip this many; default 0."),
    }).strict(),
    run(a) {
      const q = String(a.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const hits = SLEEVES.filter((s) => (!a.family || s.family === a.family) && (!a.data || s.data === a.data) && q.every((w) => `${s.id} ${s.family} ${s.rule}`.toLowerCase().includes(w)));
      const off = a.offset ?? 0, lim = a.limit ?? 50;
      return { total: hits.length, library: SLEEVES.length, families: Object.fromEntries(Object.entries(FAMILY_INFO).map(([k, f]) => [k, f.sleeves])), columns: ["id", "family", "data", "rule"], rows: hits.slice(off, off + lim).map(listRow), next: "describe_sleeve for the rationale and references; run_sleeve on your prices; sleeve_tournament to run them all with multiple-testing corrections." };
    },
  },
  {
    name: "describe_sleeve",
    title: "Describe a sleeve",
    description: "One sleeve's exact rule, parameters, warm-up, rationale, published references, known risks and spec SHA-256.",
    keywords: "sleeve rule rationale references spec hash parameters strategy details",
    input: z.object({ id: z.string().max(60).describe("Sleeve id from list_sleeves, e.g. tsmom-252-vt10-long.") }).strict(),
    run({ id }) {
      const s = SLEEVE_BY_ID.get(id);
      if (!s) throw new Error(`No sleeve ${id}. list_sleeves shows the ids.`);
      const f = FAMILY_INFO[s.family];
      return { id: s.id, family: s.family, title: s.title, data: s.data, rule: s.rule, params: s.params, warmup_periods: s.warmup, rationale: f.rationale, references: f.references, risks: f.risks, spec_sha256: s.spec_sha256, spec_version: s.spec_version, same_as: { tool: `backtest_${s.recipe}`, arguments: s.params }, note: "A definition, not a track record: run it on your data, and count every sleeve you looked at when judging the best one." };
    },
  },
  {
    name: "run_sleeve",
    title: "Run a sleeve on your prices",
    description: "Backtest one library sleeve on your prices with costs and no lookahead: CAGR, Sharpe, drawdown, turnover, cost drag, and the target weights as of the latest close (ready for a paper rebalance).",
    keywords: "run sleeve backtest strategy target weights signal latest positions paper trading",
    input: z.object({ id: z.string().max(60).describe("Sleeve id from list_sleeves."), prices: pricesIn, ...engineArgs }).strict(),
    run(a) {
      const s = SLEEVE_BY_ID.get(a.id);
      if (!s) throw new Error(`No sleeve ${a.id}. list_sleeves shows the ids.`);
      const P = matrixOf(a.prices), N = P[0].length, T = P.length, ppy = a.periods_per_year ?? 252;
      checkColumns(a, N);
      const why = unfit(s, N, T, 20);
      if (why) throw new Error(`${s.id} ${why}.`);
      const r = runSleeve(s, P, a), st = statsOf(r.net, ppy), live = r.net.slice(s.warmup), sl = statsOf(live, ppy);
      return {
        id: s.id, rule: r.rule, spec_sha256: s.spec_sha256,
        full_period: st, after_warmup: { ...sl, warmup_periods: s.warmup },
        annual_turnover: mean(r.turnovers) * ppy, cost_drag_annual: (mean(r.gross) - mean(r.net)) * ppy,
        target_weights: labelTarget(r.cols, r.target, N, a.symbols),
        caution: "One sleeve out of a library of many. If you picked it after looking at others, use sleeve_tournament so the comparison counts every sleeve tried.",
      };
    },
  },
  {
    name: "sleeve_tournament",
    title: "Run every sleeve, corrected for multiple testing",
    description: "Run all library sleeves that fit your prices (up to 399) on a common window and rank them, then correct for the search: deflated Sharpe (raw and effective number of trials), White's Reality Check, re-studentized Hansen SPA and Romano-Wolf StepM against a benchmark, and the probability of backtest overfitting (CSCV).",
    keywords: "which work survive best all sleeve tournament run all strategies leaderboard multiple testing spa reality check stepm romano wolf pbo cscv deflated sharpe data snooping",
    input: z.object({
      prices: pricesIn, ...engineArgs, ...selectArgs,
      benchmark: z.enum(["buy_and_hold", "cash"]).optional().describe("What a sleeve must beat: equal-weight buy and hold of the columns (default) or cash at risk_free."),
      reps: z.number().int().min(100).max(5000).optional().describe("Bootstrap repetitions for the Reality Check, SPA and StepM; default 1000."),
      block: z.number().int().min(1).max(1000).optional().describe("Mean bootstrap block length; default round(periods^(1/3)). Long blocks make every block-bootstrap test liberal."),
      seed: z.number().int().min(0).max(4294967295).optional().describe("Bootstrap seed; default 7."),
      splits: z.number().int().min(4).max(16).multipleOf(2).optional().describe("CSCV splits (even); default 16, or fewer for short histories."),
      top: z.number().int().min(1).max(400).optional().describe("Leaderboard rows to return; default 15."),
    }).strict(),
    run(a) {
      const P = matrixOf(a.prices), N = P[0].length, T = P.length, ppy = a.periods_per_year ?? 252;
      checkColumns(a, N);
      const { chosen, skipped, W } = selectSleeves(a, N, T);
      const { runs, R, B } = runAll(P, a, chosen, W);
      const n = B.length;
      const rows = chosen.map((s, k) => { const st = statsOf(R[k], ppy); return { id: s.id, family: s.family, sharpe: st.sharpe ?? 0, cagr: st.cagr, max_drawdown: st.max_drawdown, turnover: mean(runs[k].turnovers.slice(W)) * ppy, k }; });
      const order = [...rows].sort((x, y) => y.sharpe - x.sharpe || x.k - y.k);
      const best = order[0], K = chosen.length, Keff = effectiveTrials(R);
      const sv = variance(R.map(perSharpe)), dRaw = deflated(R[best.k], K, sv), dEff = deflated(R[best.k], Keff, sv);
      const S = a.splits ?? (n >= 16 * 40 ? 16 : Math.max(4, 2 * Math.floor(n / 80))), block = a.block ?? Math.max(1, Math.round(n ** (1 / 3)));
      const spa = jointTests(R, B, { reps: a.reps ?? 1000, block, seed: a.seed ?? 7, size: 0.05 });
      const cv = pbo(R, S), bs = statsOf(B, ppy);
      const superior = spa ? spa.superior.map((k) => chosen[k].id) : [];
      const verdict = [
        `${K} sleeves ran on ${n} common periods (effective independent sleeves ${Keff.toFixed(1)}).`,
        `Best sleeve ${best.id}: deflated Sharpe probability ${dRaw.dsr.toFixed(3)} counting all ${K} sleeves, ${dEff.dsr.toFixed(3)} counting ${Keff.toFixed(1)} independent bets${dEff.dsr > 0.95 ? (dRaw.dsr > 0.95 ? "; it survives both." : "; it survives only the effective count, which can be too lenient (the raw count is the conservative bound).") : "; it does not survive deflation, so its Sharpe is what the best of this many tries shows by luck."}`,
        "Deflation asks whether the Sharpe ratio is above zero; SPA and StepM ask whether a sleeve beats the benchmark, so a long-only sleeve in a rising market can pass the first and fail the second.",
        spa ? (spa.p_values.consistent < 0.05 ? `SPA rejects "no sleeve beats the benchmark" (p ${spa.p_values.consistent}; Reality Check p ${spa.reality_check}); StepM keeps ${superior.length} sleeve(s).` : `SPA cannot reject that no sleeve beats the benchmark (p ${spa.p_values.consistent}; Reality Check p ${spa.reality_check}).`) : "No sleeve differs from the benchmark.",
        `Probability of backtest overfitting ${cv.probability.toFixed(2)}${cv.probability > 0.5 ? ": picking the in-sample winner did worse than a random pick more often than not" : ""}.`,
      ].join(" ");
      return {
        periods: T, columns: N, evaluation: { from_period: W, periods: n, note: "Every sleeve is scored on the same window, after the longest warm-up included." },
        sleeves_run: K, sleeves_skipped: skipped.length, skipped_examples: skipped.slice(0, 5),
        benchmark: { kind: a.benchmark ?? "buy_and_hold", cagr: bs.cagr, sharpe: bs.sharpe, max_drawdown: bs.max_drawdown },
        columns_leaderboard: ["id", "family", "sharpe", "cagr", "max_drawdown", "annual_turnover"],
        leaderboard: order.slice(0, a.top ?? 15).map((r) => [r.id, r.family, r.sharpe, r.cagr, r.max_drawdown, r.turnover]),
        worst: order.slice(-3).map((r) => [r.id, r.sharpe]),
        columns_families: ["family", "sleeves", "median_sharpe", "best_id", "best_sharpe"], families: familyTable(rows),
        multiple_testing: {
          trials: K, effective_trials: Keff,
          best: { id: best.id, sharpe: best.sharpe, deflated_sharpe_probability: dRaw.dsr, deflated_sharpe_probability_effective: dEff.dsr, expected_max_sharpe_under_null: dRaw.star * Math.sqrt(ppy), expected_max_sharpe_under_null_effective: dEff.star * Math.sqrt(ppy) },
          reality_check: spa ? { p_value: spa.reality_check } : null,
          spa: spa ? { sleeves_tested: spa.tested, statistic: spa.statistic, p_values: spa.p_values, studentization: "re-estimated in every resample", block, reps: a.reps ?? 1000, seed: a.seed ?? 7, bootstrap: "stationary, mulberry32(seed)" } : null,
          stepm: { family_wise_error: 0.05, superior },
          pbo: cv,
        },
        verdict,
      };
    },
  },
  {
    name: "sleeve_walk_forward",
    title: "Walk-forward sleeve selection",
    description: "Test the selection process itself: at each refit pick the top sleeves by trailing Sharpe, hold them for the next window, repeat. Compares the out-of-sample result with what the picks showed in sample, with holding every sleeve, and with the benchmark.",
    keywords: "walk forward out of sample selection sleeve rotation decay in sample vs out of sample strategy selection",
    input: z.object({
      prices: pricesIn, ...engineArgs, ...selectArgs,
      train: z.number().int().min(20).max(5000).optional().describe("Trailing periods used to rank sleeves; default 252."),
      refit: z.number().int().min(1).max(1000).optional().describe("Periods each pick is held before re-ranking; default 63."),
      top_k: z.number().int().min(1).max(50).optional().describe("Sleeves held after each ranking, equally weighted; default 5."),
      benchmark: z.enum(["buy_and_hold", "cash"]).optional().describe("Default buy_and_hold."),
    }).strict(),
    run(a) {
      const P = matrixOf(a.prices), N = P[0].length, T = P.length, ppy = a.periods_per_year ?? 252, train = a.train ?? 252, refit = a.refit ?? 63, kTop = a.top_k ?? 5;
      checkColumns(a, N);
      const { chosen, W } = selectSleeves({ ...a, min_evaluation: Math.max(a.min_evaluation ?? 0, train + refit) }, N, T);
      const { R, B } = runAll(P, a, chosen, W);
      const n = B.length, oos = [], all = [], bench = [], isSharpes = [], oosSharpes = [], picks = [];
      for (let s = train; s < n; s += refit) {
        const scores = R.map((x, k) => [perSharpe(x.slice(s - train, s)), k]).sort((p, q) => q[0] - p[0] || p[1] - q[1]).slice(0, Math.min(kTop, R.length));
        const end = Math.min(n, s + refit), seg = [];
        for (let t = s; t < end; t++) { const v = mean(scores.map(([, k]) => R[k][t])); oos.push(v); seg.push(v); all.push(mean(R.map((x) => x[t]))); bench.push(B[t]); }
        isSharpes.push(mean(scores.map(([v]) => v)) * Math.sqrt(ppy));
        if (seg.length > 1) oosSharpes.push(perSharpe(seg) * Math.sqrt(ppy));
        picks.push([s + W, scores.map(([, k]) => chosen[k].id)]);
      }
      const so = statsOf(oos, ppy), sa = statsOf(all, ppy), sb = statsOf(bench, ppy);
      return {
        sleeves: chosen.length, refits: picks.length, out_of_sample_periods: oos.length,
        columns: ["strategy", "cagr", "sharpe", "volatility", "max_drawdown"],
        rows: [["selected top sleeves", so.cagr, so.sharpe, so.volatility, so.max_drawdown], ["all sleeves equally", sa.cagr, sa.sharpe, sa.volatility, sa.max_drawdown], ["benchmark", sb.cagr, sb.sharpe, sb.volatility, sb.max_drawdown]],
        selection_decay: { mean_in_sample_sharpe_of_picks: mean(isSharpes), mean_out_of_sample_sharpe_of_picks: oosSharpes.length ? mean(oosSharpes) : null, note: "The gap between the two is how much of the picks' in-sample Sharpe was luck." },
        recent_picks: picks.slice(-3).map(([t, ids]) => ({ from_period: t, sleeves: ids })),
        note: "Blends are equal weights across the picked sleeves' net returns, rebalanced each period with no extra cost.",
      };
    },
  },
  {
    name: "combine_sleeves",
    title: "Combine sleeves into one book",
    description: "Blend chosen sleeves (equal or trailing inverse-volatility weights, no lookahead) into one book: its statistics, each sleeve's, their correlations, the diversification ratio, and the book's combined asset target weights as of the latest close.",
    keywords: "combine sleeves blend portfolio of strategies multi strategy book allocation correlation diversification target weights",
    input: z.object({
      ids: z.array(z.string().max(60)).min(2).max(20).describe("Sleeve ids to combine."),
      prices: pricesIn, ...engineArgs,
      weighting: z.enum(["equal", "inverse_vol"]).optional().describe("Sleeve weights: equal (default) or inverse trailing volatility."),
      vol_lookback: z.number().int().min(5).max(1000).optional().describe("Trailing periods for inverse_vol; default 63."),
      rebalance_every: z.number().int().min(1).max(1000).optional().describe("Re-weight sleeves every this many periods; default 21."),
    }).strict(),
    run(a) {
      const P = matrixOf(a.prices), N = P[0].length, T = P.length, ppy = a.periods_per_year ?? 252, vl = a.vol_lookback ?? 63, k = a.rebalance_every ?? 21, iv = (a.weighting ?? "equal") === "inverse_vol";
      checkColumns(a, N);
      const { chosen, W } = selectSleeves({ ids: a.ids, min_evaluation: 60 + (iv ? vl : 0) }, N, T);
      const runs = chosen.map((s) => runSleeve(s, P, a)), R = runs.map((r) => r.net.slice(W)), n = R[0].length, start = iv ? vl : 0;
      let w = new Array(R.length).fill(1 / R.length);
      const book = [];
      for (let t = start; t < n; t++) {
        if (iv && (t - start) % k === 0) { const inv = R.map((x) => { const s = std(x.slice(t - vl, t)); return s > 0 ? 1 / s : 0; }), tot = inv.reduce((s, x) => s + x, 0); w = inv.map((x) => (tot > 0 ? x / tot : 1 / R.length)); }
        let v = 0; for (let j = 0; j < R.length; j++) v += w[j] * R[j][t]; book.push(v);
      }
      const seg = R.map((x) => x.slice(start)), sb = statsOf(book, ppy), vols = seg.map((x) => std(x));
      const corr = seg.map((x, i) => seg.map((y, j) => (i === j ? 1 : vols[i] > 0 && vols[j] > 0 ? correlation(x, y) : 0)));
      const target = {};
      runs.forEach((r, j) => { for (const [kk, v] of Object.entries(labelTarget(r.cols, r.target, N, a.symbols))) target[kk] = (target[kk] ?? 0) + w[j] * v; });
      return {
        book: { ...sb, diversification_ratio: std(book) > 0 ? w.reduce((s, x, j) => s + x * vols[j], 0) / std(book) : null },
        columns: ["id", "weight", "cagr", "sharpe", "max_drawdown"], rows: chosen.map((s, j) => { const st = statsOf(seg[j], ppy); return [s.id, w[j], st.cagr, st.sharpe, st.max_drawdown]; }),
        correlation: corr, evaluation: { from_period: W + start, periods: book.length },
        target_weights: target,
        next: "Pass target_weights to a paper rebalance (canli-paper-trading-mcp rebalance_paper_account) to trade this book on a paper account.",
      };
    },
  },
  {
    name: "sleeve_clusters",
    title: "Cluster sleeves by behavior",
    description: "Group the sleeves that ran on your prices by return correlation (average linkage on sqrt((1 - rho) / 2)), to see how many genuinely different bets the library makes on this data and the best sleeve of each group.",
    keywords: "sleeve clusters correlation hierarchical clustering redundancy distinct strategies effective number diversification",
    input: z.object({
      prices: pricesIn, ...engineArgs, ...selectArgs,
      threshold: z.number().gt(0).lt(1).optional().describe("Cut the tree at this distance; default 0.5 (about correlation 0.5)."),
    }).strict(),
    run(a) {
      const P = matrixOf(a.prices), N = P[0].length, T = P.length, ppy = a.periods_per_year ?? 252, cut = a.threshold ?? 0.5;
      checkColumns(a, N);
      const { chosen: all, W } = selectSleeves(a, N, T);
      const { R: allR } = runAll(P, a, all, W);
      const live = allR.map((x, k) => [x, k]).filter(([x]) => std(x) > 0), R = live.map(([x]) => x), chosen = live.map(([, k]) => all[k]), K = R.length;
      const C = corrMatrix(R), D = C.map((r, i) => Array.from(r, (c, j) => (i === j ? 0 : Math.sqrt(Math.max(0, (1 - c) / 2)))));
      // Agglomerative average linkage; clusters merge while the closest pair is within the cut.
      let clusters = chosen.map((_, i) => [i]);
      const dist = D.map((r) => [...r]);
      let ids = clusters.map((_, i) => i);
      for (;;) {
        let bi = -1, bj = -1, bd = Infinity;
        for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) { const d = dist[ids[x]][ids[y]]; if (d < bd) { bd = d; bi = x; bj = y; } }
        if (bi < 0 || bd > cut) break;
        const I = ids[bi], J = ids[bj], ni = clusters[I].length, nj = clusters[J].length;
        for (const L of ids) if (L !== I && L !== J) { const d = (ni * dist[I][L] + nj * dist[J][L]) / (ni + nj); dist[I][L] = d; dist[L][I] = d; }
        clusters[I] = [...clusters[I], ...clusters[J]];
        ids = ids.filter((x) => x !== J);
      }
      const sharpe = R.map((x) => statsOf(x, ppy).sharpe ?? 0);
      const groups = ids.map((I) => clusters[I].sort((x, y) => x - y)).sort((x, y) => y.length - x.length || x[0] - y[0]);
      return {
        sleeves: K, clusters: groups.length, effective_trials: effectiveTrials(R, C), threshold: cut,
        columns: ["size", "best_id", "best_sharpe", "families", "members"],
        rows: groups.map((g) => { const b = g.reduce((p, q) => (sharpe[q] > sharpe[p] ? q : p)); return [g.length, chosen[b].id, sharpe[b], [...new Set(g.map((i) => chosen[i].family))], g.slice(0, 12).map((i) => chosen[i].id)]; }),
        note: "Count clusters, not sleeves, when you judge how many independent ideas were tried.",
      };
    },
  },
  {
    name: "sleeve_regime_map",
    title: "Sleeve performance by market regime",
    description: "Score every sleeve that fits your prices in each regime of the benchmark: calm, normal and turbulent volatility (terciles of trailing volatility) and up or down trend (above or below its moving average). Finds sleeves that held up in every regime.",
    keywords: "regime analysis volatility regime trend regime bull bear sleeve performance conditional robustness all weather",
    input: z.object({
      prices: pricesIn, ...engineArgs, ...selectArgs,
      vol_lookback: z.number().int().min(5).max(1000).optional().describe("Trailing periods for the benchmark's volatility; default 63."),
      trend_lookback: z.number().int().min(5).max(1000).optional().describe("Moving average for the trend regime; default 200."),
      top: z.number().int().min(1).max(100).optional().describe("Sleeves to list per regime; default 5."),
    }).strict(),
    run(a) {
      const P = matrixOf(a.prices), N = P[0].length, T = P.length, ppy = a.periods_per_year ?? 252, vl = a.vol_lookback ?? 63, tl = a.trend_lookback ?? 200, top = a.top ?? 5;
      checkColumns(a, N);
      const { chosen, W } = selectSleeves(a, N, T);
      const { R } = runAll(P, a, chosen, W);
      // Benchmark level: equal-weight buy and hold of the columns, from the first period.
      const bh = runEngine(P, P.map((_, t) => (t === 0 ? new Array(N).fill(1 / N) : null)), { cost_bps: 0, periods_per_year: ppy }).net;
      const level = [1]; for (const r of bh) level.push(level[level.length - 1] * (1 + r));
      const n = R[0].length, vol = [], up = [];
      // Return index i (period i -> i+1) is labeled by what was known at close i.
      for (let j = 0; j < n; j++) {
        const i = j + W;
        vol.push(i >= vl ? std(bh.slice(i - vl, i)) : null);
        let s = 0; if (i >= tl - 1) { for (let q = i - tl + 1; q <= i; q++) s += level[q]; up.push(level[i] > s / tl); } else up.push(null);
      }
      const vs = Float64Array.from(vol.filter((v) => v !== null)).sort(), c1 = quantile(vs, 1 / 3), c2 = quantile(vs, 2 / 3);
      const regimes = {
        calm: vol.map((v) => v !== null && v <= c1), normal: vol.map((v) => v !== null && v > c1 && v <= c2), turbulent: vol.map((v) => v !== null && v > c2),
        uptrend: up.map((u) => u === true), downtrend: up.map((u) => u === false),
      };
      const names = Object.keys(regimes), table = {};
      const score = chosen.map((s, k) => names.map((nm) => { const x = R[k].filter((_, t) => regimes[nm][t]); return x.length > 2 && std(x) > 0 ? mean(x) / std(x) * Math.sqrt(ppy) : null; }));
      names.forEach((nm, j) => { const order = chosen.map((s, k) => [score[k][j], k]).filter(([v]) => v !== null).sort((p, q) => q[0] - p[0] || p[1] - q[1]); table[nm] = { periods: regimes[nm].filter(Boolean).length, median_sharpe: order.length ? quantile(Float64Array.from(order.map(([v]) => v)).sort(), 0.5) : null, top: order.slice(0, top).map(([v, k]) => [chosen[k].id, v]) }; });
      const robust = chosen.map((s, k) => [s.id, Math.min(...score[k].map((v) => (v === null ? -Infinity : v)))]).filter(([, m]) => m > 0).sort((p, q) => q[1] - p[1]);
      return { sleeves: chosen.length, evaluation_periods: n, regimes: table, positive_in_every_regime: { count: robust.length, top: robust.slice(0, top) }, note: "Regime cut-offs use the whole sample, so this describes the past; it is not a trading signal." };
    },
  },
];
