// mcp-backtest/src/breadth.mjs
//
// The breadth lab: many weakly correlated sleeves from one price panel, traded as one account.
// Ported from ALPHAC's research/breadth_lab (lab.py, round2.py, round4.py, effective_bets.py,
// netting_law.py), whose rules it keeps:
//
// - A sleeve is one signal inside one group of names (an industry, say): at each rebalance the names
//   are ranked on the signal, the ranks demeaned and scaled to gross 1 within the group, and the mean
//   of the last k rebalances' weights is held (overlapping portfolios cut turnover).
// - Weights decided at a close trade at the next close and earn from the close after; costs are
//   charged on those trades, plus borrow on shorts. Each sleeve is hedged with its trailing market
//   beta and scaled to a target volatility, both measured up to the day before.
// - The book holds every sleeve at equal weight and trades the netted positions: one sleeve's sale is
//   another's purchase, so the account pays far less than the sleeves would alone. Both costs are
//   reported (the lab's netting law: about 30% of the summed standalone cost at 10,000 sleeves).
// - How many independent bets the book holds is counted, not assumed: the participation ratio
//   (trace C)^2 / sum C_ij^2 of the weekly correlation matrix (n for uncorrelated series, 1 for
//   copies), for sleeves and for each signal's family book, and ideas as clusters of family books.
//
// Pure: no files, no network. Inputs are aligned arrays; panel-io.mjs reads CSV files into them.

import { createHash } from "node:crypto";

export const BREADTH_LIMITS_TEXT = Object.freeze([
  "Prices, volumes and groups are the caller's: survivorship, splits, dividends and data errors pass straight into every sleeve.",
  "A sleeve built on many signals and groups is a search: report the number of sleeves, keep a period untouched for the test, and judge the book there, not on the years used to choose it.",
  "Costs are per name per unit traded (tiers by dollar volume when it is given, else cost_bps) plus borrow on shorts; the market hedge is assumed costless, as with a futures overlay.",
]);

const DAY_YEAR = 252;

// ---- rolling statistics over one column (NaN = missing) -------------------------------------------

function rolling(x, w, minN, fn) {
  const n = x.length, out = new Float64Array(n).fill(NaN);
  let s1 = 0, s2 = 0, s3 = 0, c = 0;
  for (let i = 0; i < n; i += 1) {
    const v = x[i];
    if (!Number.isNaN(v)) { s1 += v; s2 += v * v; s3 += v * v * v; c += 1; }
    if (i >= w) { const o = x[i - w]; if (!Number.isNaN(o)) { s1 -= o; s2 -= o * o; s3 -= o * o * o; c -= 1; } }
    if (c >= minN) out[i] = fn(s1, s2, s3, c);
  }
  return out;
}
const mean = (x, w, m) => rolling(x, w, m, (s1, _s2, _s3, c) => s1 / c);
const sum = (x, w, m) => rolling(x, w, m, (s1) => s1);
const std = (x, w, m) => rolling(x, w, m, (s1, s2, _s3, c) => (c > 1 ? Math.sqrt(Math.max(0, (s2 - (s1 * s1) / c) / (c - 1))) : NaN));
// Sample skewness with pandas' bias correction.
const skew = (x, w, m) => rolling(x, w, m, (s1, s2, s3, c) => {
  if (c < 3) return NaN;
  const mu = s1 / c, m2 = s2 / c - mu * mu, m3 = s3 / c - 3 * mu * (s2 / c) + 2 * mu ** 3;
  if (m2 <= 1e-14) return NaN;
  return (Math.sqrt(c * (c - 1)) / (c - 2)) * (m3 / m2 ** 1.5);
});
function rollMax(x, w, minN) {
  const n = x.length, out = new Float64Array(n).fill(NaN), dq = [];
  let c = 0;
  for (let i = 0; i < n; i += 1) {
    if (!Number.isNaN(x[i])) { while (dq.length && x[dq.at(-1)] <= x[i]) dq.pop(); dq.push(i); c += 1; }
    if (i >= w && !Number.isNaN(x[i - w])) c -= 1;
    while (dq.length && dq[0] <= i - w) dq.shift();
    if (c >= minN && dq.length) out[i] = x[dq[0]];
  }
  return out;
}
const shift = (x, k) => { const out = new Float64Array(x.length).fill(NaN); for (let i = k; i < x.length; i += 1) out[i] = x[i - k]; return out; };
const map2 = (a, b, f) => { const out = new Float64Array(a.length); for (let i = 0; i < a.length; i += 1) out[i] = f(a[i], b[i]); return out; };
const map1 = (a, f) => { const out = new Float64Array(a.length); for (let i = 0; i < a.length; i += 1) out[i] = f(a[i], i); return out; };

// ---- the shared daily context --------------------------------------------------------------------

export function context({ dates, tickers, prices, dollarVolume = null, minPrice = 5, minDollarVolume = 5e6, costBps = 10 }) {
  const n = dates.length;
  const r = {}, r0 = {}, ltri = {}, adv = {}, eligible = {}, cost = {};
  for (const t of tickers) {
    const p = prices[t];
    const rt = new Float64Array(n).fill(NaN);
    for (let i = 1; i < n; i += 1) if (p[i] > 0 && p[i - 1] > 0) rt[i] = p[i] / p[i - 1] - 1;
    r[t] = rt;
    r0[t] = map1(rt, (v) => (Number.isNaN(v) ? 0 : v));
    let acc = 0;
    ltri[t] = map1(r0[t], (v) => (acc += Math.log1p(Math.max(v, -0.99))));
    const dv = dollarVolume?.[t] ? map1(dollarVolume[t], (v) => (v > 0 ? v : NaN)) : null;
    adv[t] = dv ? rollMedian(dv, 63, 40) : null;
    eligible[t] = map1(p, (v, i) => (v >= minPrice && (!dv || adv[t][i] >= minDollarVolume) ? 1 : 0));
    cost[t] = dv ? map1(adv[t], (a) => (a >= 5e7 ? 0.001 : a >= 1e7 ? 0.002 : 0.004)) : null;
  }
  // The market: the equal-weighted return of the names eligible yesterday.
  const market = new Float64Array(n);
  for (let i = 1; i < n; i += 1) {
    let s = 0, c = 0;
    for (const t of tickers) if (eligible[t][i - 1] && !Number.isNaN(r[t][i])) { s += r[t][i]; c += 1; }
    market[i] = c ? s / c : 0;
  }
  return { dates, tickers, prices, dollarVolume: dollarVolume ?? null, r, r0, ltri, adv, eligible, cost, flatCost: costBps / 1e4, market, n };
}

function rollMedian(x, w, minN) {
  const out = new Float64Array(x.length).fill(NaN);
  for (let i = 0; i < x.length; i += 1) {
    const win = [];
    for (let k = Math.max(0, i - w + 1); k <= i; k += 1) if (!Number.isNaN(x[k])) win.push(x[k]);
    if (win.length >= minN) { win.sort((a, b) => a - b); const h = win.length >> 1; out[i] = win.length % 2 ? win[h] : (win[h - 1] + win[h]) / 2; }
  }
  return out;
}

// ---- signals: higher = long; each a daily series per name, sampled at the rebalance dates -------------

const ret = (c, t, a, b) => map2(shift(c.ltri[t], b), shift(c.ltri[t], a), (x, y) => Math.expm1(x - y));
function beta(c, t, w) {
  const h = w >> 1, m = c.market;
  const mr = mean(map2(c.r0[t], m, (x, y) => x * y), w, h), rm = mean(c.r0[t], w, h), mm = mean(m, w, h), m2 = mean(map1(m, (x) => x * x), w, h);
  return map1(mr, (v, i) => (v - rm[i] * mm[i]) / (m2[i] - mm[i] * mm[i]));
}
const marketMean = (c, f, w, minN) => mean(map1(c.market, f), w, minN);

// Each entry: [needs, rebalance, reference, function(c, t)]. needs: "price" or "volume".
export const SIGNALS = Object.freeze({
  mom_12_1: ["price", "M", "Jegadeesh and Titman (1993): return from 12 months to 1 month ago", (c, t) => ret(c, t, 252, 21)],
  mom_6_1: ["price", "M", "Jegadeesh and Titman (1993): return from 6 months to 1 month ago", (c, t) => ret(c, t, 126, 21)],
  mom_12_7: ["price", "M", "Novy-Marx (2012): intermediate momentum, 12 to 7 months ago", (c, t) => ret(c, t, 252, 147)],
  mom_accel: ["price", "M", "Momentum acceleration: 6-1 month return minus 12-7 month return", (c, t) => map2(ret(c, t, 126, 21), ret(c, t, 252, 147), (a, b) => a - b)],
  rev_36_12: ["price", "M", "De Bondt and Thaler (1985): long-term reversal, 36 to 12 months ago, negated", (c, t) => map1(ret(c, t, 756, 252), (v) => -v)],
  rev_1m: ["price", "M", "Jegadeesh (1990): one-month reversal, negated", (c, t) => map1(ret(c, t, 21, 0), (v) => -v)],
  rev_1w: ["price", "W", "Lehmann (1990): one-week reversal, negated, rebalanced weekly", (c, t) => map1(ret(c, t, 5, 0), (v) => -v)],
  hi52: ["price", "M", "George and Hwang (2004): nearness to the 52-week high (log)", (c, t) => map2(c.ltri[t], rollMax(c.ltri[t], 252, 200), (a, b) => a - b)],
  lowvol_63: ["price", "M", "Ang, Hodrick, Xing and Zhang (2006): low 3-month volatility", (c, t) => map1(std(c.r[t], 63, 40), (v) => -v)],
  lowbeta_252: ["price", "M", "Frazzini and Pedersen (2014): low one-year beta to the equal-weighted market", (c, t) => map1(beta(c, t, 252), (v) => -v)],
  ivol_63: ["price", "M", "Ang et al. (2006): low idiosyncratic volatility, market-model residuals over 3 months", (c, t) => {
    const b = beta(c, t, 252);
    return map1(std(map1(c.r0[t], (v, i) => v - b[i] * c.market[i]), 63, 40), (v) => -v);
  }],
  max_21: ["price", "M", "Bali, Cakici and Whitelaw (2011): low maximum daily return over a month", (c, t) => map1(rollMax(c.r[t], 21, 15), (v) => -v)],
  skew_252: ["price", "M", "Boyer, Mitton and Vorkink (2010): low one-year skewness of daily returns", (c, t) => map1(skew(c.r[t], 252, 200), (v) => -v)],
  zero_days_252: ["price", "M", "Lesmond, Ogden and Trzcinka (1999): share of zero-return days over a year", (c, t) => mean(map1(c.r[t], (v) => (Number.isNaN(v) ? NaN : v === 0 ? 1 : 0)), 252, 200)],
  updays: ["price", "M", "Da, Gurun and Warachka (2014): share of up minus down days, months 12 to 2", (c, t) => mean(shift(map1(c.r[t], (v) => (Number.isNaN(v) ? NaN : Math.sign(v))), 21), 231, 180)],
  resid_mom: ["price", "M", "Blitz, Huij and Martens (2011): residual momentum, months 12 to 2 over residual volatility", (c, t) => {
    const b = shift(beta(c, t, 252), 1);
    const e = shift(map1(c.r0[t], (v, i) => (Number.isNaN(b[i]) ? NaN : v - b[i] * c.market[i])), 21);
    return map2(sum(e, 231, 180), std(e, 231, 180), (s, sd) => s / (sd * Math.sqrt(231)));
  }],
  coskew_252: ["price", "M", "Harvey and Siddique (2000): low coskewness with the market over a year", (c, t) => {
    const w = 252, h = 126, m = c.market, r = c.r[t];
    const mm = marketMean(c, (x) => x, w, h), mv = map2(marketMean(c, (x) => x * x, w, h), mm, (a, b) => a - b * b);
    const mr = mean(r, w, h), r2 = mean(map1(r, (v) => v * v), w, h);
    const rmm = mean(map2(r, m, (v, x) => v * x * x), w, h), rm = mean(map2(r, m, (v, x) => v * x), w, h);
    return map1(rmm, (v, i) => {
      const num = v - 2 * rm[i] * mm[i] + mr[i] * (mm[i] ** 2 - mv[i]);
      return -num / (Math.sqrt(Math.max(r2[i] - mr[i] ** 2, 0)) * mv[i]);
    });
  }],
  dbeta_252: ["price", "M", "Ang, Chen and Xing (2006): downside beta, on days the market fell", (c, t) => {
    const w = 252, h = 126, d = map1(c.market, (x) => (x < 0 ? 1 : 0)), md = map2(c.market, d, (x, y) => x * y);
    const n = mean(d, w, h), erm = mean(map2(c.r0[t], md, (x, y) => x * y), w, h), er = mean(map2(c.r0[t], d, (x, y) => x * y), w, h);
    const em = mean(md, w, h), em2 = mean(map1(md, (x) => x * x), w, h);
    return map1(n, (k, i) => { const a = em[i] / k, b = em2[i] / k; return (erm[i] / k - (er[i] / k) * a) / (b - a * a); });
  }],
  lag_corr_252: ["price", "M", "Hou and Moskowitz (2005): price delay, correlation with yesterday's market", (c, t) => {
    const w = 252, h = 126, ml = shift(c.market, 1), r = c.r0[t];
    const er = mean(r, w, h), eml = mean(ml, w, h), erml = mean(map2(r, ml, (x, y) => x * y), w, h);
    const sm = map2(mean(map1(ml, (x) => x * x), w, h), eml, (a, b) => Math.sqrt(a - b * b)), sr = map2(mean(map1(r, (x) => x * x), w, h), er, (a, b) => Math.sqrt(Math.max(a - b * b, 1e-12)));
    return map1(erml, (v, i) => (v - er[i] * eml[i]) / sm[i] / sr[i]);
  }],
  season: ["price", "M", "Heston and Sadka (2008): mean return of the coming calendar month over the previous five years", (c, t) => seasonality(c, t)],
  vol_shock: ["volume", "M", "Gervais, Kaniel and Mingelgrin (2001): one-month dollar volume against the year's", (c, t) => map2(mean(c.dollarVolume[t], 21, 15), mean(c.dollarVolume[t], 252, 200), (a, b) => Math.log(a / b))],
  amihud_63: ["volume", "M", "Amihud (2002): illiquidity, |return| per dollar traded over 3 months", (c, t) => mean(map2(c.r[t], c.dollarVolume[t], (x, v) => (v > 0 ? Math.abs(x) / v : NaN)), 63, 40)],
  small_63: ["volume", "M", "Banz (1981): small size, proxied by low median dollar volume", (c, t) => map1(c.adv[t], (v) => -Math.log(v))],
  dvol_cv: ["volume", "M", "Chordia, Subrahmanyam and Anshuman (2001): steadier dollar volume", (c, t) => {
    const dv = map1(c.dollarVolume[t], (v) => (v > 0 ? v : NaN));
    return map2(std(dv, 126, 80), mean(dv, 126, 80), (s, m) => -(s / m));
  }],
});

// Mean return of the coming calendar month in each of the previous five years, known at month end.
function seasonality(c, t) {
  const month = c.dates.map((d) => d.slice(0, 7)), out = new Float64Array(c.n).fill(NaN), monthly = new Map();
  for (let i = 0; i < c.n; i += 1) monthly.set(month[i], (monthly.get(month[i]) ?? 1) * (1 + Math.max(c.r0[t][i], -0.99)));
  for (let i = 0; i < c.n; i += 1) {
    const [y, m] = month[i].split("-").map(Number), next = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
    const past = [1, 2, 3, 4, 5].map((k) => monthly.get(`${ny - k}-${String(next).padStart(2, "0")}`)).filter((v) => v !== undefined);
    if (past.length === 5) out[i] = past.reduce((a, b) => a + b - 1, 0) / 5;
  }
  return out;
}

export function signalCatalog() {
  return Object.entries(SIGNALS).map(([name, [needs, every, reference]]) => ({ name, needs, rebalance: every === "W" ? "weekly" : "monthly", reference }));
}

// ---- sleeves and the netted book -------------------------------------------------------------------

function rebalanceDays(dates, every) {
  const out = [];
  for (let i = 0; i < dates.length; i += 1) {
    const next = dates[i + 1];
    if (next === undefined) { out.push(i); continue; }
    if (every === "M" ? next.slice(0, 7) !== dates[i].slice(0, 7) : isoWeek(next) !== isoWeek(dates[i])) out.push(i);
  }
  return out;
}
function isoWeek(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  return `${d.getUTCFullYear()}-${Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 6048e5)}`;
}

// Rank-demeaned weights, gross 1 in each group with at least minNames eligible names.
function groupWeights(c, values, i, groupOf, minNames) {
  const byGroup = new Map();
  for (const t of c.tickers) {
    const v = values[t][i], g = groupOf(t);
    if (g == null || Number.isNaN(v) || !Number.isFinite(v) || !c.eligible[t][i]) continue;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push([t, v]);
  }
  const w = new Map();
  for (const [g, list] of byGroup) {
    if (list.length < minNames) continue;
    list.sort((a, b) => a[1] - b[1]);
    const ranks = new Map();
    for (let k = 0; k < list.length;) { // ties share their mean rank, as pandas' rank(pct=True)
      let j = k; while (j + 1 < list.length && list[j + 1][1] === list[k][1]) j += 1;
      for (let q = k; q <= j; q += 1) ranks.set(list[q][0], ((k + j) / 2 + 1) / list.length);
      k = j + 1;
    }
    const mu = [...ranks.values()].reduce((a, b) => a + b, 0) / list.length;
    let gross = 0;
    for (const [t] of list) gross += Math.abs(ranks.get(t) - mu);
    if (gross > 0) for (const [t] of list) w.set(t, { g, w: (ranks.get(t) - mu) / gross });
  }
  return w;
}

const statsOf = (x) => {
  const v = [...x].filter((y) => !Number.isNaN(y));
  if (v.length < 60) return { days: v.length, sharpe: null };
  const mu = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1));
  if (!(sd > 0)) return { days: v.length, sharpe: null };
  let eq = 1, peak = 1, dd = 0;
  for (const y of v) { eq *= 1 + y; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  const sr = (mu / sd) * Math.sqrt(DAY_YEAR);
  return { days: v.length, sharpe: round(sr, 3), t: round(sr * Math.sqrt(v.length / DAY_YEAR), 2), ann_return: round(mu * DAY_YEAR, 4), ann_vol: round(sd * Math.sqrt(DAY_YEAR), 4), max_drawdown: round(dd, 4) };
};
const round = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

export function runBreadth(input) {
  const { dates, tickers, groups = null, signals = null, smoothing = null, minNames = 10, targetVol = 0.1, maxLeverage = 5, borrow = 0.005, splitDate = null } = input;
  const c = context(input);
  const groupOf = groups ? (t) => groups[t] ?? null : () => "all";
  const wanted = signals ?? Object.keys(SIGNALS).filter((s) => SIGNALS[s][0] === "price" || c.dollarVolume);
  for (const s of wanted) {
    if (!SIGNALS[s]) throw new RangeError(`unknown signal ${s}; breadth_signals lists them`);
    if (SIGNALS[s][0] === "volume" && !c.dollarVolume) throw new RangeError(`${s} needs dollar_volume_file`);
  }
  const n = c.n, sleeves = [], netted = Object.fromEntries(tickers.map((t) => [t, new Float64Array(n)]));
  const standaloneCost = new Float64Array(n), active = new Float64Array(n);
  const costOf = (t, i) => (c.cost[t] ? (Number.isNaN(c.cost[t][i]) ? 0.004 : c.cost[t][i]) : c.flatCost);
  const pending = [];
  for (const s of wanted) {
    const [, every, reference, fn] = SIGNALS[s];
    const values = Object.fromEntries(tickers.map((t) => [t, fn(c, t)]));
    const k = smoothing ?? (every === "W" ? 4 : 3);
    // Held weights per name (the mean of the last k rebalances, back to gross 1 per group), and its group.
    const held = Object.fromEntries(tickers.map((t) => [t, new Float64Array(n)]));
    const recent = [];
    let last = new Map();
    const rebal = new Set(rebalanceDays(dates, every));
    for (let i = 0; i < n; i += 1) {
      if (rebal.has(i)) {
        recent.push(groupWeights(c, values, i, groupOf, minNames));
        if (recent.length > k) recent.shift();
        const avg = new Map(), gross = new Map();
        for (const wmap of recent) for (const [t, { g, w }] of wmap) { const a = avg.get(t) ?? { g, w: 0 }; a.w += w / recent.length; avg.set(t, a); }
        for (const [, { g, w }] of avg) gross.set(g, (gross.get(g) ?? 0) + Math.abs(w));
        last = new Map([...avg].map(([t, { g, w }]) => [t, { g, w: gross.get(g) > 0 ? w / gross.get(g) : 0 }]));
      }
      for (const [t, { w }] of last) held[t][i] = w;
    }
    // Per group: gross and cost series, from weights traded a day later and earning a day after that.
    const groupNames = new Map();
    for (const t of tickers) { const g = groupOf(t); if (g != null) { if (!groupNames.has(g)) groupNames.set(g, []); groupNames.get(g).push(t); } }
    for (const [g, names] of groupNames) {
      const gross = new Float64Array(n).fill(NaN), costs = new Float64Array(n), live = new Float64Array(n);
      let any = false;
      for (let i = 2; i < n; i += 1) {
        let gr = 0, short = 0, liveGross = 0, cost = 0;
        for (const t of names) {
          const lv = held[t][i - 2];
          if (lv) { gr += lv * c.r0[t][i]; liveGross += Math.abs(lv); if (lv < 0) short -= lv; }
          const traded = held[t][i - 1] - held[t][i - 2];
          if (traded) cost += Math.abs(traded) * costOf(t, i - 1);
        }
        costs[i] = cost;
        if (liveGross > 0) { gross[i] = gr - short * borrow / DAY_YEAR; live[i] = 1; any = true; }
      }
      if (!any) continue;
      // costs[i] are the trades made at close i-1, charged on day i.
      const net = map1(gross, (v, i) => (Number.isNaN(v) ? NaN : v - costs[i]));
      pending.push({ s, g, every, reference, names, held, gross, net, costs });
    }
  }
  // Hedge each sleeve with its trailing beta and scale to target volatility, both lagged a day.
  const m = c.market, mm = mean(m, 252, 126), mvar = map2(mean(map1(m, (x) => x * x), 252, 126), mm, (a, b) => a - b * b);
  for (const p of pending) {
    const raw = map1(p.net, (v) => (Number.isNaN(v) ? 0 : v)), rawMean = mean(raw, 252, 126);
    const b = map1(mean(map2(raw, m, (x, y) => x * y), 252, 126), (v, i) => (v - rawMean[i] * mm[i]) / mvar[i]);
    const hedged = map1(raw, (v, i) => (i > 0 && Number.isFinite(b[i - 1]) ? v - b[i - 1] * m[i] : NaN));
    const vol = map1(std(hedged, 126, 63), (v) => v * Math.sqrt(DAY_YEAR));
    const lev = map1(vol, (v, i) => (i > 0 && vol[i - 1] > 0 ? Math.min(targetVol / vol[i - 1], maxLeverage) : NaN));
    p.returns = map1(hedged, (v, i) => (Number.isNaN(p.net[i]) || !Number.isFinite(lev[i]) ? NaN : v * lev[i]));
    p.lev = lev;
    for (let i = 2; i < n; i += 1) {
      if (Number.isNaN(p.returns[i])) continue;
      active[i] += 1;
      standaloneCost[i] += p.costs[i] * lev[i];
      for (const t of p.names) netted[t][i - 1] += p.held[t][i - 1] * lev[i];
    }
  }
  // The book: equal weight across the sleeves live each day; the account trades the netted weights.
  // Standalone cost is each sleeve's own trades at its leverage; the netted account also pays for
  // changes in leverage, so the netting ratio errs against netting.
  const bookGross = new Float64Array(n).fill(NaN), nettedCost = new Float64Array(n), sCost = new Float64Array(n);
  for (let i = 2; i < n; i += 1) {
    if (!active[i]) continue;
    let s = 0;
    for (const p of pending) if (!Number.isNaN(p.returns[i])) s += p.returns[i] + p.costs[i] * p.lev[i];
    bookGross[i] = s / active[i];
    let nc = 0;
    for (const t of tickers) { const d = netted[t][i - 1] / active[i] - (active[i - 1] ? netted[t][i - 2] / active[i - 1] : 0); if (d) nc += Math.abs(d) * costOf(t, i - 1); }
    nettedCost[i] = nc; sCost[i] = standaloneCost[i] / active[i];
  }
  const netBook = map1(bookGross, (v, i) => v - nettedCost[i]), soloBook = map1(bookGross, (v, i) => v - sCost[i]);
  const ids = pending.map((p) => `${p.s}@${p.g}`), family = pending.map((p) => p.s);
  const bets = effectiveBets(dates, pending.map((p) => p.returns), family);
  const window = (x, after) => (splitDate ? map1(x, (v, i) => ((dates[i] > splitDate) === after ? v : NaN)) : x);
  const sumOf = (x) => [...x].reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
  return {
    sleeves: pending.length, signals: wanted.length, groups: new Set(pending.map((p) => p.g)).size,
    book: {
      netted: statsOf(netBook), standalone: statsOf(soloBook), before_costs: statsOf(bookGross),
      cost_per_year_netted: round((sumOf(nettedCost) / Math.max(1, [...active].filter(Boolean).length)) * DAY_YEAR, 4),
      cost_per_year_standalone: round((sumOf(sCost) / Math.max(1, [...active].filter(Boolean).length)) * DAY_YEAR, 4),
      netting_ratio: round(sumOf(nettedCost) / sumOf(sCost), 3),
      ...(splitDate ? { search: { netted: statsOf(window(netBook, false)) }, test: { netted: statsOf(window(netBook, true)), note: `After ${splitDate}: judge the book here only if nothing was chosen on these dates.` } } : {}),
    },
    effective_bets: bets,
    sleeve_columns: ["id", "signal", "group", "names", "sharpe_after_costs", "sharpe_before_costs_unhedged"],
    sleeve_rows: pending.map((p, j) => [ids[j], p.s, p.g, p.names.length, statsOf(p.returns).sharpe, statsOf(p.gross).sharpe]),
    series: { ids, family, returns: pending.map((p) => p.returns), book: netBook },
    specs: pending.map((p, j) => ({ id: ids[j], signal: p.s, group: p.g, rebalance: p.every === "W" ? "weekly" : "monthly", smoothing: smoothing ?? (p.every === "W" ? 4 : 3), min_names: minNames, target_vol: targetVol, reference: p.reference, spec_sha256: createHash("sha256").update(JSON.stringify([p.s, p.g, p.every, smoothing, minNames, targetVol, maxLeverage, borrow])).digest("hex") })),
  };
}

// ---- effective independent bets ---------------------------------------------------------------------

// Weekly sums (at least 3 days), then correlations over weeks both series have (at least minWeeks).
function weekly(dates, series) {
  const keys = dates.map(isoWeek), order = [...new Set(keys)];
  const at = new Map(order.map((k, i) => [k, i]));
  return series.map((x) => {
    const s = new Float64Array(order.length), c = new Uint16Array(order.length);
    for (let i = 0; i < x.length; i += 1) if (!Number.isNaN(x[i])) { s[at.get(keys[i])] += x[i]; c[at.get(keys[i])] += 1; }
    return map1(s, (v, i) => (c[i] >= 3 ? v : NaN));
  });
}
function corr(a, b, minN) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (Number.isNaN(a[i]) || Number.isNaN(b[i])) continue;
    n += 1; sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i];
  }
  if (n < minN) return NaN;
  const v = (saa - (sa * sa) / n) * (sbb - (sb * sb) / n);
  return v > 0 ? (sab - (sa * sb) / n) / Math.sqrt(v) : NaN;
}
// (trace C)^2 / sum of squared entries = (sum of eigenvalues)^2 / sum of squared eigenvalues.
function participation(cm) {
  const k = cm.length;
  let s2 = 0;
  for (let i = 0; i < k; i += 1) for (let j = 0; j < k; j += 1) { const v = i === j ? 1 : Number.isNaN(cm[i][j]) ? 0 : cm[i][j]; s2 += v * v; }
  return k ? (k * k) / s2 : 0;
}
const matrix = (ws, minWeeks) => ws.map((a, i) => ws.map((b, j) => (i === j ? 1 : j < i ? NaN : corr(a, b, minWeeks)))).map((row, i, all) => row.map((v, j) => (j < i ? all[j][i] : v)));

export function effectiveBets(dates, series, family = null, { threshold = 0.5, minWeeks = 104 } = {}) {
  const ws = weekly(dates, series), cm = matrix(ws, minWeeks), k = series.length;
  const off = [];
  for (let i = 0; i < k; i += 1) for (let j = i + 1; j < k; j += 1) if (!Number.isNaN(cm[i][j])) off.push(cm[i][j]);
  const out = { series: k, avg_pairwise_corr: off.length ? round(off.reduce((a, b) => a + b, 0) / off.length, 4) : null, effective_bets: round(participation(cm), 1) };
  if (!family) return out;
  const names = [...new Set(family)];
  const books = names.map((f) => {
    const members = series.filter((_, i) => family[i] === f);
    return map1(members[0], (_, t) => { let s = 0, c = 0; for (const x of members) if (!Number.isNaN(x[t])) { s += x[t]; c += 1; } return c ? s / c : NaN; });
  });
  const bm = matrix(weekly(dates, books), minWeeks);
  // Ideas: average linkage on |corr| of the family books, joined while the link is at least threshold.
  let clusters = names.map((_, i) => [i]);
  for (;;) {
    let best = -1, pair = null;
    for (let i = 0; i < clusters.length; i += 1) for (let j = i + 1; j < clusters.length; j += 1) {
      let s = 0, c = 0;
      for (const a of clusters[i]) for (const b of clusters[j]) { const v = Math.abs(bm[a][b]); s += Number.isNaN(v) ? 0 : v; c += 1; }
      if (s / c > best) { best = s / c; pair = [i, j]; }
    }
    if (!pair || best < threshold) break;
    clusters[pair[0]] = clusters[pair[0]].concat(clusters[pair[1]]);
    clusters.splice(pair[1], 1);
  }
  clusters = clusters.map((cl) => cl.map((i) => names[i])).sort((a, b) => b.length - a.length);
  return { ...out, families: names.length, effective_bets_families: round(participation(bm), 1), ideas: clusters.length, idea_threshold_abs_corr: threshold, idea_members: clusters };
}
