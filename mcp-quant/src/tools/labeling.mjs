// Data annotation: labels and annotations computed on the caller's own data, for research and for
// training models without leakage. Event sampling (CUSUM filter), triple-barrier, fixed-horizon,
// trend-scanning and meta labels, sample weights for overlapping labels, purged and embargoed
// cross-validation splits (Lopez de Prado, Advances in Financial Machine Learning, chapters 2-4
// and 7), and a per-period annotator that marks outliers, stale prices, gaps, drawdown episodes,
// new highs and volatility regimes.
//
// Every label is a function of prices up to the label's own end, and the tools say which periods a
// label looks forward over, so a model trained on them can be purged and embargoed correctly.
import { z } from "zod";

import { leastSquares, mean, quantile, std } from "../math.mjs";
import { MAX_SERIES } from "../inputs.mjs";

const pricesArg = z.array(z.number().positive()).min(20).max(MAX_SERIES).describe("Prices oldest first.");
const eventsArg = z.array(z.number().int().min(0).max(MAX_SERIES)).max(MAX_SERIES).optional().describe("Periods (0-based) to label; default every period that has volatility and room for the horizon.");
const spanArg = z.number().int().min(2).max(1000).optional().describe("Span of the exponentially weighted volatility of returns; default 100.");

// pandas' ewm(span, adjust=True).std() with the bias correction, for every period (NaN at 0).
export function ewmStd(x, span) {
  const a = 2 / (span + 1), out = new Array(x.length).fill(NaN);
  let sw = 0, sw2 = 0, mu = 0, s = 0;
  for (let t = 0; t < x.length; t++) {
    // Reweight the old observations by (1 - a), then add x[t] with weight 1 (Welford-style update).
    sw *= 1 - a; sw2 *= (1 - a) ** 2; s *= 1 - a;
    const w = 1, old = mu;
    sw += w; sw2 += w * w;
    mu = old + (w / sw) * (x[t] - old);
    s += w * (x[t] - old) * (x[t] - mu);
    const denom = sw * sw - sw2;
    out[t] = denom > 0 ? Math.sqrt(Math.max(0, (s / sw) * (sw * sw) / denom)) : NaN;
  }
  return out;
}

const returnsOf = (p) => p.map((x, t) => (t === 0 ? NaN : x / p[t - 1] - 1));
function dailyVol(p, span) { const r = returnsOf(p).slice(1), v = ewmStd(r, span); return [NaN, ...v]; }

function tripleBarrier(p, { events, pt, sl, maxHold, vol, side, minRet, verticalZero }) {
  const rows = [];
  for (const t0 of events) {
    const trgt = vol[t0];
    if (!(trgt > 0) || trgt < minRet || t0 >= p.length - 1) continue;
    const t1max = Math.min(p.length - 1, t0 + maxHold), sd = side ? side[t0] : 1;
    if (side && !(sd === 1 || sd === -1)) continue;
    let touch = t1max, kind = "vertical";
    for (let t = t0 + 1; t <= t1max; t++) {
      const r = (p[t] / p[t0] - 1) * sd;
      if (pt > 0 && r >= pt * trgt) { touch = t; kind = "profit_take"; break; }
      if (sl > 0 && r <= -sl * trgt) { touch = t; kind = "stop_loss"; break; }
    }
    const ret = (p[touch] / p[t0] - 1) * sd;
    let label;
    if (side) label = ret > 0 ? 1 : 0;
    else label = kind === "vertical" && verticalZero ? 0 : Math.sign(ret);
    rows.push([t0, touch, ret, label, kind, trgt]);
  }
  return rows;
}

const counts = (labels) => labels.reduce((m, l) => ({ ...m, [l]: (m[l] ?? 0) + 1 }), {});

export const TOOLS = [
  {
    name: "cusum_filter_events",
    title: "Sample events with a CUSUM filter",
    description: "Sample the periods worth labeling with the symmetric CUSUM filter on log prices: an event fires when the cumulative up or down move since the last event exceeds a threshold (fixed, or a multiple of recent volatility), so labels concentrate on meaningful moves instead of every bar.",
    keywords: "cusum filter event sampling events labels machine learning lopez de prado downsampling structural moves",
    input: z.object({
      prices: pricesArg,
      threshold: z.number().positive().max(1).optional().describe("Fixed log-move threshold, e.g. 0.02."),
      volatility_multiple: z.number().positive().max(20).optional().describe("Threshold as this multiple of the EWMA return volatility at each period (used when threshold is not given; default 2)."),
      vol_span: spanArg,
    }).strict(),
    run(a) {
      const p = a.prices, lp = p.map(Math.log), vol = a.threshold ? null : dailyVol(p, a.vol_span ?? 100), k = a.volatility_multiple ?? 2;
      const ev = [];
      let sp = 0, sn = 0;
      for (let t = 1; t < p.length; t++) {
        const h = a.threshold ?? k * vol[t - 1];
        if (!(h > 0)) continue;
        const d = lp[t] - lp[t - 1];
        sp = Math.max(0, sp + d); sn = Math.min(0, sn + d);
        if (sn < -h) { sn = 0; ev.push([t, -1]); } else if (sp > h) { sp = 0; ev.push([t, 1]); }
      }
      return { events: ev.length, share_of_periods: ev.length / p.length, up_events: ev.filter((e) => e[1] > 0).length, down_events: ev.filter((e) => e[1] < 0).length, columns: ["period", "direction"], rows: ev, threshold: a.threshold ? { fixed: a.threshold } : { volatility_multiple: k, vol_span: a.vol_span ?? 100, note: "Each period uses the volatility known at the previous close." }, next: "Pass the event periods to triple_barrier_labels as events." };
    },
  },
  {
    name: "triple_barrier_labels",
    title: "Triple-barrier labels",
    description: "Label events with the triple-barrier method: a profit-take and a stop-loss set as multiples of recent volatility, and a time limit; each label is which barrier was touched first (+1, -1, or the sign at the time limit), with the touch period so overlapping labels can be purged. With a side per period it produces meta-labels (1 = the bet paid).",
    keywords: "triple barrier labeling meta labeling labels machine learning profit take stop loss vertical barrier lopez de prado training data",
    input: z.object({
      prices: pricesArg, events: eventsArg,
      profit_take: z.number().min(0).max(50).optional().describe("Upper barrier in multiples of volatility (0 disables); default 1."),
      stop_loss: z.number().min(0).max(50).optional().describe("Lower barrier in multiples of volatility (0 disables); default 1."),
      max_holding: z.number().int().min(1).max(5000).optional().describe("Vertical barrier: periods after the event; default 20."),
      vol_span: spanArg,
      min_return: z.number().min(0).max(1).optional().describe("Skip events whose volatility target is below this; default 0."),
      side: z.array(z.number().int().min(-1).max(1)).max(MAX_SERIES).optional().describe("A primary model's side per period (1 long, -1 short, 0 none), same length as prices; turns the output into meta-labels."),
      vertical_label: z.enum(["sign", "zero"]).optional().describe("Label at the time limit: sign of the return (default) or 0."),
      include_rows: z.boolean().optional().describe("Return one row per label (default true)."),
    }).strict(),
    run(a) {
      const p = a.prices, vol = dailyVol(p, a.vol_span ?? 100);
      if (a.side && a.side.length !== p.length) throw new Error(`side has ${a.side.length} values for ${p.length} prices.`);
      const events = a.events ?? p.map((_, t) => t);
      const rows = tripleBarrier(p, { events, pt: a.profit_take ?? 1, sl: a.stop_loss ?? 1, maxHold: a.max_holding ?? 20, vol, side: a.side, minRet: a.min_return ?? 0, verticalZero: a.vertical_label === "zero" });
      const kinds = counts(rows.map((r) => r[4]));
      return {
        labeled: rows.length, label_counts: counts(rows.map((r) => r[3])), barrier_counts: kinds, mean_holding: rows.length ? mean(rows.map((r) => r[1] - r[0])) : null,
        meta_labels: Boolean(a.side),
        columns: ["event_period", "touch_period", "return", "label", "barrier", "volatility_target"], rows: a.include_rows === false ? undefined : rows,
        leakage_note: "Each label uses prices from event_period to touch_period. When cross-validating, purge training labels that overlap a test label's span and embargo the periods right after it (purged_cv_splits).",
      };
    },
  },
  {
    name: "fixed_horizon_labels",
    title: "Fixed-horizon labels",
    description: "Label each period by its forward return over a fixed horizon: +1 above a threshold, -1 below minus the threshold, 0 between; the threshold can be fixed or scaled by recent volatility. Includes the class balance and the forward span each label covers.",
    keywords: "fixed horizon labels forward return classification labels threshold machine learning target",
    input: z.object({
      prices: pricesArg,
      horizon: z.number().int().min(1).max(5000).optional().describe("Periods ahead; default 5."),
      threshold: z.number().min(0).max(1).optional().describe("Fixed return threshold; default 0 (pure sign)."),
      volatility_multiple: z.number().positive().max(20).optional().describe("Use this multiple of EWMA volatility times sqrt(horizon) as the threshold instead."),
      vol_span: spanArg,
      include_labels: z.boolean().optional().describe("Return the label per period (default true)."),
    }).strict(),
    run(a) {
      const p = a.prices, h = a.horizon ?? 5, vol = a.volatility_multiple ? dailyVol(p, a.vol_span ?? 100) : null;
      const labels = p.map((x, t) => {
        if (t + h >= p.length) return null;
        const thr = vol ? a.volatility_multiple * vol[t] * Math.sqrt(h) : a.threshold ?? 0;
        if (!(thr >= 0)) return null;
        const r = p[t + h] / x - 1;
        return r > thr ? 1 : r < -thr ? -1 : 0;
      });
      const ok = labels.filter((l) => l !== null);
      return { labeled: ok.length, label_counts: counts(ok), horizon: h, labels: a.include_labels === false ? undefined : labels, leakage_note: `Label t uses prices up to t + ${h}; purge and embargo at least ${h} periods around test folds.` };
    },
  },
  {
    name: "trend_scanning_labels",
    title: "Trend-scanning labels",
    description: "Label each period by the strongest forward trend: regress prices on time over every forward window in a range, keep the window with the largest |t-statistic| of the slope, and label by its sign with the t-statistic as confidence (Lopez de Prado's trend scanning).",
    keywords: "trend scanning labels t statistic slope forward window labeling machine learning trend label confidence",
    input: z.object({
      prices: pricesArg,
      min_window: z.number().int().min(3).max(1000).optional().describe("Shortest forward window; default 5."),
      max_window: z.number().int().min(4).max(2000).optional().describe("Longest forward window; default 20."),
      step: z.number().int().min(1).max(100).optional().describe("Window step; default 1."),
      include_rows: z.boolean().optional().describe("Return one row per period (default true)."),
    }).strict(),
    run(a) {
      const p = a.prices, lo = a.min_window ?? 5, hi = a.max_window ?? 20, st = a.step ?? 1;
      if (!(lo < hi)) throw new Error("min_window must be below max_window.");
      const rows = [];
      for (let t = 0; t + lo <= p.length; t++) {
        let best = null;
        for (let L = lo; L <= hi && t + L <= p.length; L += st) {
          const y = p.slice(t, t + L), X = y.map((_, i) => [1, i]), fit = leastSquares(X, y);
          const s2 = fit.resid.reduce((s, e) => s + e * e, 0) / (L - 2), se = Math.sqrt(s2 * fit.xtxInv[1][1]);
          const tv = se > 0 ? fit.coef[1] / se : 0;
          if (!best || Math.abs(tv) > Math.abs(best[1])) best = [L, tv];
        }
        rows.push([t, t + best[0] - 1, best[1], Math.sign(best[1])]);
      }
      return { labeled: rows.length, label_counts: counts(rows.map((r) => r[3])), columns: ["period", "window_end", "t_value", "label"], rows: a.include_rows === false ? undefined : rows, leakage_note: "Label t looks forward to window_end; purge accordingly." };
    },
  },
  {
    name: "sample_weights",
    title: "Weights for overlapping labels",
    description: "Weight labels whose spans overlap so a model does not over-count the same information: concurrency per period, each label's average uniqueness, return-attribution weights, and optional time decay (Lopez de Prado, chapter 4).",
    keywords: "sample weights uniqueness concurrency overlapping labels return attribution time decay machine learning sequential bootstrap",
    input: z.object({
      prices: pricesArg,
      spans: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).min(1).max(MAX_SERIES).describe("[start, end] period of each label, e.g. triple_barrier_labels' event and touch periods."),
      decay: z.number().min(-1).max(1).optional().describe("Time decay of the oldest label's weight relative to the newest: 1 none (default), 0 linear to zero, negative drops the oldest share."),
    }).strict(),
    run(a) {
      const p = a.prices, n = p.length, spans = a.spans;
      for (const [s, e] of spans) if (!(s <= e && e < n)) throw new Error(`span [${s}, ${e}] must satisfy start <= end < ${n}.`);
      const conc = new Array(n).fill(0);
      for (const [s, e] of spans) for (let t = s; t <= e; t++) conc[t]++;
      const ret = returnsOf(p);
      const uniq = spans.map(([s, e]) => { let u = 0; for (let t = s; t <= e; t++) u += 1 / conc[t]; return u / (e - s + 1); });
      const attr = spans.map(([s, e]) => { let w = 0; for (let t = s + 1; t <= e; t++) w += Math.log(1 + ret[t]) / conc[t]; return Math.abs(w); });
      const tot = attr.reduce((s, x) => s + x, 0), attrN = attr.map((w) => (tot > 0 ? w * spans.length / tot : 0));
      const c = a.decay ?? 1, order = spans.map((_, i) => i).sort((x, y) => spans[x][1] - spans[y][1] || x - y), cum = new Array(spans.length);
      let acc = 0; for (const i of order) { acc += uniq[i]; cum[i] = acc; }
      const last = acc, slope = c >= 0 ? (1 - c) / last : 1 / ((c + 1) * last), inter = 1 - slope * last;
      const decayW = cum.map((x) => Math.max(0, inter + slope * x));
      return {
        labels: spans.length, mean_uniqueness: mean(uniq), max_concurrency: Math.max(...conc), mean_concurrency: mean(conc.filter((x) => x > 0)),
        columns: ["start", "end", "uniqueness", "return_attribution_weight", "time_decay_factor"], rows: spans.map(([s, e], i) => [s, e, uniq[i], attrN[i], decayW[i]]),
        note: "Multiply return-attribution weights by the time-decay factor for the final sample weight. Mean uniqueness well below 1 means heavy overlap: bag with max_samples near it.",
      };
    },
  },
  {
    name: "purged_cv_splits",
    title: "Purged, embargoed cross-validation",
    description: "Build k-fold cross-validation splits for labels that span time without leakage: training labels whose spans overlap a test fold are purged, and labels starting just after a test fold are embargoed. Reports what each fold removed, and optionally the indices.",
    keywords: "purged k fold cross validation embargo leakage time series cv overlapping labels machine learning finance",
    input: z.object({
      spans: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).min(4).max(MAX_SERIES).describe("[start, end] period of each label, in time order of start."),
      folds: z.number().int().min(2).max(50).optional().describe("Default 5."),
      embargo_periods: z.number().int().min(0).max(10000).optional().describe("Periods after each test fold whose labels are dropped from training; default 1% of the time span."),
      include_indices: z.boolean().optional().describe("Return train and test label indices per fold (default false)."),
    }).strict(),
    run(a) {
      const S = a.spans, m = S.length, k = a.folds ?? 5;
      for (let i = 1; i < m; i++) if (S[i][0] < S[i - 1][0]) throw new Error("spans must be sorted by start.");
      if (m < k) throw new Error(`Need at least ${k} labels for ${k} folds.`);
      const span = Math.max(...S.map((s) => s[1])) - S[0][0] + 1, emb = a.embargo_periods ?? Math.floor(0.01 * span);
      const out = [];
      for (let f = 0; f < k; f++) {
        const lo = Math.floor(f * m / k), hi = Math.floor((f + 1) * m / k), test = [];
        for (let i = lo; i < hi; i++) test.push(i);
        const t0 = S[lo][0], t1 = Math.max(...test.map((i) => S[i][1]));
        const train = [], purged = [], embargoed = [];
        for (let i = 0; i < m; i++) {
          if (i >= lo && i < hi) continue;
          const [s, e] = S[i];
          if (s <= t1 && e >= t0) purged.push(i);
          else if (s > t1 && s <= t1 + emb) embargoed.push(i);
          else train.push(i);
        }
        out.push({ fold: f, test: test.length, train: train.length, purged: purged.length, embargoed: embargoed.length, test_span: [t0, t1], ...(a.include_indices ? { test_indices: test, train_indices: train } : {}) });
      }
      return { folds: k, labels: m, embargo_periods: emb, splits: out, note: "Purged: training labels whose span overlaps the test fold's span. Embargoed: labels starting within embargo_periods after the test fold ends." };
    },
  },
  {
    name: "annotate_price_series",
    title: "Annotate a price series",
    description: "Annotate every period of a price series and list the notable ones: robust-z outlier moves, stale (repeated) prices, gaps (jumps across a period), drawdown episodes with peak, trough and recovery, new all-time highs, and the causal volatility regime (calm, normal, turbulent). Gives per-period tags for joining onto your own data.",
    keywords: "annotate annotation data labeling price series tags outliers stale prices drawdown episodes regimes new highs events data annotator",
    input: z.object({
      prices: pricesArg,
      outlier_z: z.number().positive().max(50).optional().describe("Robust z-score (median and MAD of returns) above which a move is an outlier; default 5."),
      stale_run: z.number().int().min(2).max(1000).optional().describe("Identical consecutive prices that count as stale; default 3."),
      vol_lookback: z.number().int().min(5).max(1000).optional().describe("Trailing periods for the volatility regime; default 63."),
      min_drawdown: z.number().gt(0).lt(1).optional().describe("Smallest drawdown recorded as an episode; default 0.1."),
      include_tags: z.boolean().optional().describe("Return the tag list per period (default false)."),
    }).strict(),
    run(a) {
      const p = a.prices, n = p.length, r = returnsOf(p), zc = a.outlier_z ?? 5, sr = a.stale_run ?? 3, vl = a.vol_lookback ?? 63, md = a.min_drawdown ?? 0.1;
      const tags = Array.from({ length: n }, () => []), events = [];
      const rr = r.slice(1), sorted = Float64Array.from(rr).sort(), med = quantile(sorted, 0.5);
      const mad = quantile(Float64Array.from(rr.map((x) => Math.abs(x - med))).sort(), 0.5) * 1.4826;
      for (let t = 1; t < n; t++) {
        const zz = mad > 0 ? (r[t] - med) / mad : 0;
        if (Math.abs(zz) > zc) { tags[t].push(zz > 0 ? "outlier_up" : "outlier_down"); events.push([t, zz > 0 ? "outlier_up" : "outlier_down", r[t]]); }
      }
      for (let t = 0; t < n;) { let j = t; while (j + 1 < n && p[j + 1] === p[t]) j++; if (j - t + 1 >= sr) { for (let q = t; q <= j; q++) tags[q].push("stale"); events.push([t, "stale_run", j - t + 1]); } t = j + 1; }
      let peak = p[0], peakT = 0, trough = p[0], troughT = 0, inDD = false, ath = p[0];
      for (let t = 1; t < n; t++) {
        if (p[t] > ath) { ath = p[t]; tags[t].push("new_high"); }
        if (p[t] >= peak) {
          if (inDD && trough / peak - 1 <= -md) events.push([peakT, "drawdown", { trough_period: troughT, recovery_period: t, depth: trough / peak - 1 }]);
          peak = p[t]; peakT = t; trough = p[t]; troughT = t; inDD = false;
        } else { inDD = true; if (p[t] < trough) { trough = p[t]; troughT = t; } if (p[t] / peak - 1 <= -md) tags[t].push("in_drawdown"); }
      }
      if (inDD && trough / peak - 1 <= -md) events.push([peakT, "drawdown", { trough_period: troughT, recovery_period: null, depth: trough / peak - 1 }]);
      // Causal volatility regime: trailing volatility against terciles of the trailing volatilities seen so far.
      const vols = [];
      const regime = new Array(n).fill(null);
      for (let t = vl; t < n; t++) {
        const v = std(r.slice(t - vl + 1, t + 1));
        vols.push(v);
        if (vols.length >= 20) { const s = Float64Array.from(vols).sort(), c1 = quantile(s, 1 / 3), c2 = quantile(s, 2 / 3); regime[t] = v <= c1 ? "calm" : v <= c2 ? "normal" : "turbulent"; tags[t].push(`vol_${regime[t]}`); }
      }
      events.sort((x, y) => x[0] - y[0]);
      const regCount = counts(regime.filter(Boolean));
      return {
        periods: n, event_count: events.length, columns: ["period", "type", "detail"], events: events.slice(0, 500),
        summary: { outliers: events.filter((e) => e[1].startsWith("outlier")).length, stale_runs: events.filter((e) => e[1] === "stale_run").length, drawdown_episodes: events.filter((e) => e[1] === "drawdown").length, new_highs: tags.filter((t) => t.includes("new_high")).length, volatility_regimes: regCount },
        tags: a.include_tags ? tags : undefined,
        note: "Regimes are causal: each period compares its trailing volatility with what had been seen up to then, so tags can feed a model without lookahead. Outliers use the whole sample's median and MAD; drawdown episodes are known only after their trough.",
      };
    },
  },
];
