// Data checks before any model sees the data: price series, OHLC bars, option chains, yield curves,
// perpetual funding histories, cross-venue prices, timestamps, return series, fundamentals and
// corporate actions. Each check returns issues with where, what and how bad, and a clean flag.
// Nothing is changed or filled in; the caller decides what to do.
import { z } from "zod";

import { mean, sortedCopy, quantile } from "../math.mjs";
import { MAX_SERIES } from "../inputs.mjs";
import { impliedVol } from "./options.mjs";

const MAX_ISSUES = 200;
const positive = (what) => z.number().positive().describe(what);

function collector() {
  const issues = [], counts = {};
  return {
    add(check, severity, where, detail) { counts[check] = (counts[check] ?? 0) + 1; if (issues.length < MAX_ISSUES) issues.push({ check, severity, where, detail }); },
    done(extra = {}) {
      const errors = issues.filter((i) => i.severity === "error").length, warnings = issues.filter((i) => i.severity === "warning").length;
      return { clean: Object.keys(counts).length === 0, errors, warnings, counts, issues, truncated: Object.values(counts).reduce((s, v) => s + v, 0) > issues.length, ...extra };
    },
  };
}

const median = (x) => quantile(sortedCopy(x), 0.5);
const mad = (x) => { const m = median(x); return median(x.map((v) => Math.abs(v - m))) * 1.4826; };
const SPLITS = [2, 3, 4, 5, 10, 1.5, 20, 8];

function parseTime(s) {
  if (typeof s === "number") return { ms: s < 1e11 ? s * 1000 : s, offset: "epoch" };
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const m = /(Z|[+-]\d{2}:?\d{2})$/.exec(s);
  return { ms: t, offset: m ? m[1] : /T/.test(s) ? "none" : "date" };
}

function checkPrices(prices, dates, c, { outlierZ = 8, staleRun = 5 } = {}) {
  prices.forEach((p, i) => { if (!Number.isFinite(p)) c.add("non_finite", "error", i, `${p}`); else if (p <= 0) c.add("non_positive_price", "error", i, `${p}`); });
  const r = [];
  for (let i = 1; i < prices.length; i++) if (prices[i] > 0 && prices[i - 1] > 0) r.push([i, prices[i] / prices[i - 1] - 1]);
  const vals = r.map((x) => x[1]), m = median(vals), s = mad(vals) || 1e-12;
  for (const [i, v] of r) {
    const ratio = prices[i - 1] / prices[i];
    const split = SPLITS.find((k) => Math.abs(ratio / k - 1) < 0.03 || Math.abs(ratio * k - 1) < 0.03);
    if (split && Math.abs(v) > 0.3) c.add("suspected_split", "error", i, `price moved ${(v * 100).toFixed(1)}%, a ${ratio > 1 ? `1:${split}` : `${split}:1`} ratio; unadjusted split?`);
    else if (Math.abs(v - m) / s > outlierZ) c.add("return_outlier", "warning", i, `return ${(v * 100).toFixed(2)}% is ${(Math.abs(v - m) / s).toFixed(1)} robust SDs from typical`);
  }
  let run = 1;
  for (let i = 1; i <= prices.length; i++) {
    if (i < prices.length && prices[i] === prices[i - 1]) run++;
    else { if (run >= staleRun) c.add("stale_prices", "warning", i - run, `${run} identical prices in a row`); run = 1; }
  }
  if (dates) {
    if (dates.length !== prices.length) c.add("length_mismatch", "error", null, `${dates.length} dates for ${prices.length} prices`);
    const t = dates.map(parseTime);
    t.forEach((x, i) => { if (!x) c.add("bad_timestamp", "error", i, `${dates[i]}`); });
    const gaps = [];
    for (let i = 1; i < t.length; i++) {
      if (!t[i] || !t[i - 1]) continue;
      const d = t[i].ms - t[i - 1].ms;
      if (d === 0) c.add("duplicate_timestamp", "error", i, `${dates[i]}`);
      else if (d < 0) c.add("unsorted_timestamps", "error", i, `${dates[i]} is before ${dates[i - 1]}`);
      else gaps.push([i, d]);
    }
    if (gaps.length > 3) {
      const typical = median(gaps.map((g) => g[1]));
      for (const [i, d] of gaps) if (d > typical * 4.5 && d > 4 * 86400000) c.add("gap", "warning", i, `${(d / 86400000).toFixed(1)} days since the previous point (typical ${(typical / 86400000).toFixed(2)})`);
    }
  }
}

export const TOOLS = [
  {
    name: "check_price_series",
    title: "Check a price series",
    description: "Check a price series for errors before using it: non-positive or missing values, unadjusted splits, outlier returns, stale runs, duplicate, unsorted or gapped timestamps.",
    keywords: "data quality price series validation splits outliers stale gaps duplicates clean data check",
    input: z.object({
      prices: z.array(z.number()).min(3).max(MAX_SERIES).describe("Prices oldest first."),
      dates: z.array(z.union([z.string().max(40), z.number()])).max(MAX_SERIES).optional().describe("ISO timestamps or epoch seconds/ms per price."),
      outlier_z: z.number().positive().max(100).optional().describe("Robust z above which a return is an outlier; default 8."),
      stale_run: z.number().int().min(2).max(1000).optional().describe("Identical consecutive prices that count as stale; default 5."),
    }).strict(),
    run(a) { const c = collector(); checkPrices(a.prices, a.dates, c, { outlierZ: a.outlier_z, staleRun: a.stale_run }); return c.done({ points: a.prices.length }); },
  },
  {
    name: "check_ohlc_bars",
    title: "Check OHLC bars",
    description: "Check open-high-low-close-volume bars for impossible values: high below open/close, low above them, negative volume, zero-range bars, and extreme overnight gaps.",
    keywords: "ohlc bars validation candles high low inconsistent volume data quality",
    input: z.object({
      open: z.array(z.number()).min(2).max(MAX_SERIES).describe("Opens."), high: z.array(z.number()).min(2).max(MAX_SERIES).describe("Highs."),
      low: z.array(z.number()).min(2).max(MAX_SERIES).describe("Lows."), close: z.array(z.number()).min(2).max(MAX_SERIES).describe("Closes."),
      volume: z.array(z.number()).max(MAX_SERIES).optional().describe("Volumes."),
    }).strict(),
    run({ open: O, high: H, low: L, close: C, volume: V }) {
      const c = collector(), n = O.length;
      if (![H, L, C].every((x) => x.length === n) || (V && V.length !== n)) c.add("length_mismatch", "error", null, "arrays differ in length");
      for (let i = 0; i < n; i++) {
        if (H[i] < Math.max(O[i], C[i])) c.add("high_below_body", "error", i, `high ${H[i]} < max(open ${O[i]}, close ${C[i]})`);
        if (L[i] > Math.min(O[i], C[i])) c.add("low_above_body", "error", i, `low ${L[i]} > min(open, close)`);
        if (L[i] > H[i]) c.add("low_above_high", "error", i, `low ${L[i]} > high ${H[i]}`);
        if ([O[i], H[i], L[i], C[i]].some((v) => !(v > 0))) c.add("non_positive_price", "error", i, "a price is zero, negative or missing");
        if (H[i] === L[i] && V && V[i] > 0) c.add("zero_range_with_volume", "warning", i, "high equals low but volume traded");
        if (V && V[i] < 0) c.add("negative_volume", "error", i, `${V[i]}`);
        if (i > 0 && Math.abs(O[i] / C[i - 1] - 1) > 0.25) c.add("extreme_gap", "warning", i, `opened ${((O[i] / C[i - 1] - 1) * 100).toFixed(1)}% from the prior close`);
      }
      checkPrices(C, undefined, c);
      return c.done({ bars: n });
    },
  },
  {
    name: "check_option_chain",
    title: "Check an option chain for arbitrage and bad quotes",
    description: "Check one expiry of an option chain: crossed or negative quotes, prices outside no-arbitrage bounds, non-monotone or non-convex prices across strikes, put-call parity breaks, and quotes with no implied volatility.",
    keywords: "option chain validation arbitrage butterfly convexity vertical spread put call parity bad quotes implied volatility check",
    input: z.object({
      spot: positive("Underlying price."), years: positive("Years to expiry."),
      rate: z.number().gt(-1).lt(1).optional().describe("Continuous rate; default 0."), dividend_yield: z.number().gt(-1).lt(1).optional().describe("Continuous dividend yield; default 0."),
      quotes: z.array(z.object({ strike: positive("Strike."), type: z.enum(["call", "put"]).describe("call or put."), bid: z.number().min(0).describe("Bid."), ask: z.number().min(0).describe("Ask.") }).strict()).min(2).max(5000).describe("Quotes for one expiry."),
      tolerance: z.number().min(0).optional().describe("Price tolerance for arbitrage checks, in currency; default 0.01."),
    }).strict(),
    run({ spot: S, years: T, rate: r = 0, dividend_yield: q = 0, quotes, tolerance: tol = 0.01 }) {
      const c = collector(), dr = Math.exp(-r * T), dq = Math.exp(-q * T);
      const mids = { call: new Map(), put: new Map() }, ivs = [];
      for (const qt of quotes) {
        const where = `${qt.type} ${qt.strike}`;
        if (qt.bid > qt.ask) { c.add("crossed_quote", "error", where, `bid ${qt.bid} > ask ${qt.ask}`); continue; }
        const mid = (qt.bid + qt.ask) / 2, K = qt.strike;
        if (qt.ask > 0 && (qt.ask - qt.bid) / Math.max(mid, 1e-12) > 1) c.add("wide_spread", "warning", where, `spread is ${(((qt.ask - qt.bid) / mid) * 100).toFixed(0)}% of mid`);
        const lower = qt.type === "call" ? Math.max(0, S * dq - K * dr) : Math.max(0, K * dr - S * dq), upper = qt.type === "call" ? S * dq : K * dr;
        if (qt.ask < lower - tol) c.add("below_intrinsic", "error", where, `ask ${qt.ask} < lower bound ${lower.toFixed(4)}`);
        if (qt.bid > upper + tol) c.add("above_upper_bound", "error", where, `bid ${qt.bid} > upper bound ${upper.toFixed(4)}`);
        mids[qt.type].set(K, { mid, bid: qt.bid, ask: qt.ask });
        if (mid > lower && mid < upper) { try { ivs.push([where, impliedVol({ type: qt.type, spot: S, strike: K, years: T, rate: r, dividend_yield: q, price: mid }).implied_volatility]); } catch { c.add("no_implied_vol", "warning", where, "no volatility reproduces the mid"); } }
        else if (qt.bid > 0) c.add("no_implied_vol", "warning", where, "mid is on or outside the no-arbitrage bounds");
      }
      for (const type of ["call", "put"]) {
        const ks = [...mids[type].keys()].sort((x, y) => x - y), call = type === "call";
        for (let i = 1; i < ks.length; i++) {
          const lo = mids[type].get(ks[i - 1]), hi = mids[type].get(ks[i]), width = (ks[i] - ks[i - 1]) * dr, where = `${type} ${ks[i - 1]}-${ks[i]}`;
          // The option that must be worth more (lower-strike call, higher-strike put) bought at the ask
          // against the other sold at the bid must not lock in a credit, nor cost more than the strike gap.
          const rich = call ? lo : hi, cheap = call ? hi : lo;
          if (cheap.bid - rich.ask > tol) c.add("vertical_arbitrage", "error", where, `${type} price ${call ? "rises" : "falls"} with strike`);
          if (rich.bid - cheap.ask > width + tol) c.add("vertical_spread_too_wide", "error", where, `spread exceeds the discounted strike gap ${width.toFixed(4)}`);
        }
        for (let i = 2; i < ks.length; i++) {
          const [k1, k2, k3] = [ks[i - 2], ks[i - 1], ks[i]], l = (k3 - k2) / (k3 - k1);
          const fly = l * mids[type].get(k1).mid + (1 - l) * mids[type].get(k3).mid - mids[type].get(k2).mid;
          if (fly < -tol) c.add("butterfly_arbitrage", "error", `${type} ${k1}/${k2}/${k3}`, `mid prices are not convex in strike (butterfly ${fly.toFixed(4)})`);
        }
      }
      for (const [K, cm] of mids.call) {
        const pm = mids.put.get(K);
        if (!pm) continue;
        const parity = S * dq - K * dr, lo = cm.bid - pm.ask, hi = cm.ask - pm.bid;
        if (parity < lo - tol || parity > hi + tol) c.add("put_call_parity", "error", `strike ${K}`, `C - P range [${lo.toFixed(4)}, ${hi.toFixed(4)}] excludes S e^-qT - K e^-rT = ${parity.toFixed(4)}`);
      }
      return c.done({ quotes: quotes.length, implied_vols: ivs.slice(0, 100).map(([w, v]) => [w, v]) });
    },
  },
  {
    name: "check_yield_curve",
    title: "Check a yield curve",
    description: "Check a zero curve for problems: unsorted tenors, discount factors that rise with maturity, negative or jumpy implied forward rates, and kinks far from neighbouring points.",
    keywords: "yield curve validation zero rates forward rates negative forwards kinks discount factors term structure check",
    input: z.object({
      years: z.array(z.number().positive()).min(2).max(500).describe("Tenors in years."),
      zero_rates: z.array(z.number().gt(-0.5).lt(1)).min(2).max(500).describe("Continuously compounded zero rates."),
      max_forward_jump: z.number().positive().optional().describe("Flag forward changes between adjacent periods above this; default 0.02."),
    }).strict(),
    run({ years: t, zero_rates: z0, max_forward_jump: jump = 0.02 }) {
      const c = collector();
      if (t.length !== z0.length) c.add("length_mismatch", "error", null, "years and zero_rates differ in length");
      for (let i = 1; i < t.length; i++) if (!(t[i] > t[i - 1])) c.add("unsorted_tenors", "error", i, `${t[i]} after ${t[i - 1]}`);
      const fw = [];
      for (let i = 1; i < t.length; i++) {
        const f = (z0[i] * t[i] - z0[i - 1] * t[i - 1]) / (t[i] - t[i - 1]);
        fw.push(f);
        if (Math.exp(-z0[i] * t[i]) > Math.exp(-z0[i - 1] * t[i - 1]) && z0[i] >= 0) c.add("rising_discount_factor", "error", i, "discount factor increases with maturity at a positive rate");
        if (f < 0 && z0[i] > 0) c.add("negative_forward", "warning", i, `forward ${(f * 100).toFixed(2)}% from ${t[i - 1]}y to ${t[i]}y`);
        if (fw.length > 1 && Math.abs(f - fw.at(-2)) > jump) c.add("forward_jump", "warning", i, `forward moves ${((f - fw.at(-2)) * 1e4).toFixed(0)} bp between adjacent segments`);
      }
      for (let i = 1; i + 1 < t.length; i++) {
        const w = (t[i] - t[i - 1]) / (t[i + 1] - t[i - 1]), interp = z0[i - 1] + w * (z0[i + 1] - z0[i - 1]);
        if (Math.abs(z0[i] - interp) > jump / 2) c.add("kink", "warning", i, `${t[i]}y is ${((z0[i] - interp) * 1e4).toFixed(0)} bp off the line through its neighbours`);
      }
      return c.done({ forwards: fw });
    },
  },
  {
    name: "check_funding_rates",
    title: "Check perpetual funding data",
    description: "Check a perpetual-futures funding history: irregular intervals, rates beyond the venue's cap, outliers, and long one-sided runs, with the annualized range.",
    keywords: "funding rate data validation perpetual crypto cap outliers interval check",
    input: z.object({
      funding_rates: z.array(z.number()).min(3).max(MAX_SERIES).describe("Funding rate per interval."),
      timestamps: z.array(z.union([z.string().max(40), z.number()])).max(MAX_SERIES).optional().describe("Timestamp per rate (ISO or epoch)."),
      cap: z.number().positive().max(1).optional().describe("Venue cap per interval; default 0.0075 (0.75%)."),
      interval_hours: z.number().positive().optional().describe("Expected interval; default 8."),
    }).strict(),
    run({ funding_rates: f, timestamps, cap = 0.0075, interval_hours: h = 8 }) {
      const c = collector();
      f.forEach((v, i) => { if (!Number.isFinite(v)) c.add("non_finite", "error", i, `${v}`); else if (Math.abs(v) > cap + 1e-12) c.add("beyond_cap", "error", i, `${(v * 100).toFixed(4)}% exceeds the ${(cap * 100).toFixed(2)}% cap`); });
      const m = median(f), s = mad(f) || 1e-12;
      f.forEach((v, i) => { if (Math.abs(v - m) / s > 10 && Math.abs(v) <= cap) c.add("outlier", "warning", i, `${(v * 100).toFixed(4)}% vs typical ${(m * 100).toFixed(4)}%`); });
      let run = 1;
      for (let i = 1; i <= f.length; i++) { if (i < f.length && Math.sign(f[i]) === Math.sign(f[i - 1]) && f[i] !== 0) run++; else { if (run >= 90) c.add("one_sided_run", "info", i - run, `${run} intervals with the same sign`); run = 1; } }
      if (timestamps) {
        const t = timestamps.map(parseTime);
        for (let i = 1; i < t.length; i++) { if (!t[i] || !t[i - 1]) { c.add("bad_timestamp", "error", i, `${timestamps[i]}`); continue; } const d = (t[i].ms - t[i - 1].ms) / 3600000; if (Math.abs(d - h) > 0.05 * h) c.add("irregular_interval", "warning", i, `${d.toFixed(2)} hours since the previous funding (expected ${h})`); }
      }
      const per = 24 / h * 365;
      return c.done({ annualized_min: Math.min(...f) * per, annualized_max: Math.max(...f) * per, annualized_mean: mean(f) * per });
    },
  },
  {
    name: "check_cross_venue_prices",
    title: "Check prices across venues",
    description: "Compare the same instrument's prices across venues at the same times: deviation of each venue from the cross-venue median, venues that stop updating, and the worst divergences.",
    keywords: "cross venue prices exchanges divergence stale feed median crypto consolidated check",
    input: z.object({
      venues: z.array(z.string().max(40)).min(2).max(50).describe("Venue names."),
      prices: z.array(z.array(z.number().positive().nullable()).min(2).max(50)).min(2).max(MAX_SERIES).describe("Rows of prices per timestamp, one column per venue (null when missing)."),
      threshold_bps: z.number().positive().optional().describe("Flag deviations from the median above this; default 50 bp."),
    }).strict(),
    run({ venues, prices, threshold_bps: th = 50 }) {
      const c = collector(), V = venues.length, dev = venues.map(() => []), lastChange = new Array(V).fill(0);
      prices.forEach((row, t) => {
        if (row.length !== V) { c.add("row_length", "error", t, `${row.length} prices for ${V} venues`); return; }
        const live = row.filter((x) => x !== null);
        if (live.length < 2) return;
        const med = median(live);
        row.forEach((p, v) => {
          if (p === null) return;
          const d = (p / med - 1) * 1e4; dev[v].push(Math.abs(d));
          if (Math.abs(d) > th) c.add("divergence", "warning", `${venues[v]} @ ${t}`, `${d.toFixed(1)} bp from the median`);
          if (t > 0 && prices[t - 1][v] !== null && p !== prices[t - 1][v]) lastChange[v] = t;
        });
      });
      const T = prices.length;
      lastChange.forEach((t, v) => { if (T - 1 - t > Math.max(10, T * 0.1)) c.add("stale_venue", "warning", venues[v], `no price change for the last ${T - 1 - t} rows`); });
      return c.done({ median_abs_deviation_bps: Object.fromEntries(venues.map((v, i) => [v, dev[i].length ? median(dev[i]) : null])) });
    },
  },
  {
    name: "check_timestamps",
    title: "Check timestamps",
    description: "Check a column of timestamps: unparseable values, duplicates, out-of-order rows, mixed time-zone offsets, dates in the future and weekend entries, with the spacing distribution.",
    keywords: "timestamps validation timezone duplicates unsorted future weekend data quality",
    input: z.object({
      timestamps: z.array(z.union([z.string().max(40), z.number()])).min(2).max(MAX_SERIES).describe("ISO strings or epoch seconds/ms."),
      flag_weekends: z.boolean().optional().describe("Flag Saturday/Sunday entries (for equity data); default false."),
      now: z.string().max(40).optional().describe("Reference 'now' for future checks; default the server clock."),
    }).strict(),
    run({ timestamps: ts, flag_weekends = false, now }) {
      const c = collector(), t = ts.map(parseTime), nowMs = now ? Date.parse(now) : Date.now(), offsets = new Set();
      t.forEach((x, i) => {
        if (!x) { c.add("unparseable", "error", i, `${ts[i]}`); return; }
        offsets.add(x.offset);
        if (x.ms > nowMs) c.add("future", "error", i, `${ts[i]} is after now`);
        const dow = new Date(x.ms).getUTCDay();
        if (flag_weekends && (dow === 0 || dow === 6)) c.add("weekend", "warning", i, `${ts[i]} falls on a weekend (UTC)`);
      });
      const sp = [];
      for (let i = 1; i < t.length; i++) { if (!t[i] || !t[i - 1]) continue; const d = t[i].ms - t[i - 1].ms; if (d === 0) c.add("duplicate", "error", i, `${ts[i]}`); else if (d < 0) c.add("unsorted", "error", i, `${ts[i]} before ${ts[i - 1]}`); else sp.push(d); }
      const named = [...offsets].filter((o) => o !== "epoch" && o !== "date");
      if (named.length > 1) c.add("mixed_offsets", "warning", null, `offsets seen: ${named.join(", ")}`);
      if (offsets.has("none")) c.add("naive_times", "warning", null, "some timestamps have a time but no time-zone offset");
      const s = sortedCopy(sp);
      return c.done({ spacing_seconds: sp.length ? { min: s[0] / 1000, median: quantile(s, 0.5) / 1000, max: s[s.length - 1] / 1000 } : null });
    },
  },
  {
    name: "check_returns_series",
    title: "Check a returns series",
    description: "Check a returns series for the usual mistakes: percents instead of fractions, impossible simple returns below -100%, constant or zero-filled stretches, extreme values and smoothing (high lag-1 autocorrelation).",
    keywords: "returns validation percent fraction log returns smoothing autocorrelation stale check",
    input: z.object({ returns: z.array(z.number()).min(10).max(MAX_SERIES).describe("Returns per period.") }).strict(),
    run({ returns: r }) {
      const c = collector(), abs = r.map(Math.abs), med = median(abs);
      if (med > 0.2) c.add("looks_like_percent", "error", null, `median |return| is ${med.toFixed(3)}; 1.5 means 150%, send 0.015 for 1.5%`);
      r.forEach((v, i) => { if (!Number.isFinite(v)) c.add("non_finite", "error", i, `${v}`); else if (v <= -1) c.add("below_minus_100", "error", i, `${v}: impossible as a simple return (log return?)`); });
      let zeros = 0, worst = 0;
      for (let i = 0; i <= r.length; i++) { if (i < r.length && r[i] === 0) zeros++; else { if (zeros >= 5) c.add("zero_run", "warning", i - zeros, `${zeros} zero returns in a row (filled or stale prices?)`); worst = Math.max(worst, zeros); zeros = 0; } }
      const m = mean(r);
      let num = 0, den = 0;
      for (let i = 0; i < r.length; i++) { den += (r[i] - m) ** 2; if (i) num += (r[i] - m) * (r[i - 1] - m); }
      const rho = den > 0 ? num / den : 0;
      if (rho > 0.3) c.add("smoothed", "warning", null, `lag-1 autocorrelation ${rho.toFixed(2)}: smoothed or stale marks understate risk`);
      const md = mad(r) || 1e-12;
      r.forEach((v, i) => { if (Math.abs(v - median(r)) / md > 12) c.add("extreme", "warning", i, `${v} is ${(Math.abs(v - median(r)) / md).toFixed(0)} robust SDs out`); });
      return c.done({ lag1_autocorrelation: rho, median_abs_return: med });
    },
  },
  {
    name: "check_fundamentals",
    title: "Check financial statement identities",
    description: "Check reported fundamentals against accounting identities: assets = liabilities + equity, current within total, gross profit = revenue - cost of revenue, cash-flow sections summing to the change in cash, and EPS x shares close to net income.",
    keywords: "fundamentals validation accounting identity balance sheet income statement cash flow check xbrl",
    input: z.object({
      total_assets: z.number().optional().describe("Total assets."), total_liabilities: z.number().optional().describe("Total liabilities."), total_equity: z.number().optional().describe("Total equity (including minority interest if reported that way)."),
      current_assets: z.number().optional().describe("Current assets."), current_liabilities: z.number().optional().describe("Current liabilities."),
      revenue: z.number().optional().describe("Revenue."), cost_of_revenue: z.number().optional().describe("Cost of revenue."), gross_profit: z.number().optional().describe("Gross profit."),
      net_income: z.number().optional().describe("Net income."), eps: z.number().optional().describe("Earnings per share."), shares: z.number().optional().describe("Weighted average shares."),
      operating_cash_flow: z.number().optional().describe("Cash from operations."), investing_cash_flow: z.number().optional().describe("Cash from investing."), financing_cash_flow: z.number().optional().describe("Cash from financing."),
      change_in_cash: z.number().optional().describe("Change in cash (including FX effects if reported in the sum)."),
      tolerance: z.number().min(0).max(0.5).optional().describe("Relative tolerance; default 0.005."),
    }).strict(),
    run(a) {
      const c = collector(), tol = a.tolerance ?? 0.005, has = (...k) => k.every((x) => a[x] !== undefined);
      const near = (x, y) => Math.abs(x - y) <= tol * Math.max(Math.abs(x), Math.abs(y), 1);
      let checked = 0;
      if (has("total_assets", "total_liabilities", "total_equity")) { checked++; if (!near(a.total_assets, a.total_liabilities + a.total_equity)) c.add("balance_sheet", "error", null, `assets ${a.total_assets} vs liabilities + equity ${a.total_liabilities + a.total_equity}`); }
      if (has("current_assets", "total_assets")) { checked++; if (a.current_assets > a.total_assets * (1 + tol)) c.add("current_exceeds_total", "error", null, "current assets exceed total assets"); }
      if (has("current_liabilities", "total_liabilities")) { checked++; if (a.current_liabilities > a.total_liabilities * (1 + tol)) c.add("current_exceeds_total", "error", null, "current liabilities exceed total liabilities"); }
      if (has("revenue", "cost_of_revenue", "gross_profit")) { checked++; if (!near(a.gross_profit, a.revenue - a.cost_of_revenue)) c.add("gross_profit", "error", null, `gross profit ${a.gross_profit} vs revenue - cost ${a.revenue - a.cost_of_revenue}`); }
      if (has("eps", "shares", "net_income")) { checked++; if (!(Math.abs(a.eps * a.shares - a.net_income) <= 0.03 * Math.max(Math.abs(a.net_income), 1))) c.add("eps", "warning", null, `EPS x shares = ${a.eps * a.shares} vs net income ${a.net_income} (preferred dividends or share-count basis?)`); }
      if (has("operating_cash_flow", "investing_cash_flow", "financing_cash_flow", "change_in_cash")) { checked++; const s = a.operating_cash_flow + a.investing_cash_flow + a.financing_cash_flow; if (!near(s, a.change_in_cash) && Math.abs(s - a.change_in_cash) > tol * Math.abs(a.operating_cash_flow)) c.add("cash_flow", "warning", null, `sections sum to ${s}, change in cash ${a.change_in_cash} (FX effect?)`); }
      if (has("revenue") && a.revenue < 0) c.add("negative_revenue", "warning", null, `${a.revenue}`);
      return c.done({ identities_checked: checked });
    },
  },
  {
    name: "check_corporate_actions",
    title: "Detect corporate actions from raw and adjusted prices",
    description: "Detect splits and dividends by comparing raw and adjusted close series: each change in the adjustment factor, classified as a split (ratio) or a dividend (percent), with mismatches flagged.",
    keywords: "corporate actions splits dividends adjusted prices adjustment factor detection",
    input: z.object({
      close: z.array(z.number().positive()).min(3).max(MAX_SERIES).describe("Raw closes, oldest first."),
      adjusted_close: z.array(z.number().positive()).min(3).max(MAX_SERIES).describe("Adjusted closes."),
      dates: z.array(z.string().max(40)).max(MAX_SERIES).optional().describe("Dates, for labels."),
    }).strict(),
    run({ close: C, adjusted_close: A, dates }) {
      const c = collector(), events = [];
      if (C.length !== A.length) c.add("length_mismatch", "error", null, "close and adjusted_close differ in length");
      const f = C.map((x, i) => A[i] / x);
      for (let i = 1; i < f.length; i++) {
        const ch = f[i] / f[i - 1];
        if (Math.abs(ch - 1) < 1e-6) continue;
        const where = dates ? dates[i] : i;
        // A forward k:1 split doubles (k-tuples) the factor; a 1:k reverse split divides it by k.
        const fwd = SPLITS.find((k) => Math.abs(ch / k - 1) < 0.01), rev = SPLITS.find((k) => Math.abs(ch * k - 1) < 0.01), split = fwd ?? rev;
        if (fwd) events.push({ where, type: "split", ratio: `${fwd}:1` });
        else if (rev) events.push({ where, type: "reverse_split", ratio: `1:${rev}` });
        else if (ch > 1 && ch < 1.25) events.push({ where, type: "dividend", yield_percent: (ch - 1) * 100 });
        else c.add("unexplained_adjustment", "warning", where, `adjustment factor changed by ${((ch - 1) * 100).toFixed(2)}%`);
        const rawMove = C[i] / C[i - 1] - 1, adjMove = A[i] / A[i - 1] - 1;
        if (split && Math.abs(rawMove) < 0.2) c.add("split_not_in_raw", "warning", where, "factor shows a split but raw prices did not jump");
        if (Math.abs(adjMove) > 0.4) c.add("adjusted_jump", "warning", where, `adjusted price still moves ${(adjMove * 100).toFixed(0)}%`);
      }
      return c.done({ events });
    },
  },
];
