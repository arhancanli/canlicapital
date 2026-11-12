// A portfolio run through thousands of worlds that did not happen. Each world is a resampled stretch of
// real market history (whole blocks of days, so calm and panic stay clustered and assets stay correlated)
// with real crises dropped in at a random moment and a random severity, alone or together: the 2008 bank
// crisis on top of the 2022 chip slump is a world nobody has seen, built from days that did occur. No shock
// size here is invented, unless the caller writes one. These are stress scenarios, never forecasts.
import { z } from "zod";

const FACTORS = ["SPY", "XLF", "SMH", "TLT", "HYG", "GLD", "USO", "UUP"];
export const EPISODES = Object.freeze({
  bank_crisis: { from: "2008-09-02", to: "2009-03-09", what: "the 2008-09 bank crisis" },
  regional_bank_run: { from: "2023-03-01", to: "2023-03-24", what: "the March 2023 regional bank run" },
  compute_bust: { from: "2022-01-03", to: "2022-10-14", what: "the 2022 fall in chip and compute stocks" },
  inflation_shock: { from: "2022-01-03", to: "2022-06-16", what: "the 2022 inflation and rate shock" },
  pandemic_crash: { from: "2020-02-19", to: "2020-03-23", what: "the February-March 2020 crash" },
  taper_tantrum: { from: "2013-05-22", to: "2013-09-05", what: "the 2013 taper tantrum in bonds" },
  oil_collapse: { from: "2014-06-20", to: "2016-02-11", what: "the 2014-16 oil collapse" },
  dollar_surge: { from: "2014-07-01", to: "2015-03-13", what: "the 2014-15 surge in the dollar" },
});

export const worldsInput = z.object({
  holdings: z.array(z.object({ symbol: z.string().min(1).max(12), weight: z.number() }).strict()).min(1).max(50).describe("What is held: symbol and weight (shorts negative). Weights should add to about 1."),
  scenarios: z.array(z.string().max(120)).max(12).optional().describe(`Which crises to drop in. Names: ${Object.keys(EPISODES).join(", ")}. Join with + for several at once: "bank_crisis+compute_bust". Default: each one alone.`),
  custom: z.array(z.object({ name: z.string().max(40), moves: z.record(z.string(), z.number().min(-0.95).max(3)), days: z.number().int().min(1).max(252) }).strict()).max(6).optional().describe(`Your own shocks: total moves over days on these markets: ${FACTORS.join(", ")}. For example {name:"chip embargo", moves:{SMH:-0.4,SPY:-0.12}, days:30}. These sizes are your assumption, and the result says so.`),
  worlds: z.number().int().min(200).max(20000).optional().describe("Worlds per scenario; default 2000."),
  horizon_days: z.number().int().min(20).max(756).optional().describe("Trading days each world lasts; default 252."),
  seed: z.number().int().optional().describe("The same seed gives the same worlds; default 1."),
}).strict();

export const WORLDS_TOOL = Object.freeze({
  name: "stress_worlds", pack: "desk", toolset: "desk", title: "Stress a portfolio across thousands of synthetic worlds", input: worldsInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "Run a portfolio through thousands of synthetic worlds: real market history resampled in blocks, with real crises (2008 banks, 2022 chips, 2020 crash, others) dropped in at random times and severities, alone or combined, or your own shocks. Gives each scenario's range of returns, tail loss and drawdown, the holdings that hurt most and how far the answer can be trusted. Scenarios, not forecasts.",
  keywords: "stress test scenario simulation synthetic macro monte carlo crisis what if tail risk drawdown antifragile banking crisis compute shock portfolio resilience worlds",
  args: "holdings: {symbol,weight}[], scenarios?: string[], custom?: {name,moves,days}[], worlds?: integer, horizon_days?: integer, seed?: integer",
});

// A small seeded generator (mulberry32): the same seed always gives the same worlds.
export function rng(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const quantile = (sorted, q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null);

// Daily simple returns by date from a price_history answer.
function dailyReturns(p) {
  const out = new Map(), d = p?.dates ?? [], c = p?.close ?? [];
  for (let i = 1; i < c.length; i += 1) if (c[i] > 0 && c[i - 1] > 0) out.set(d[i], c[i] / c[i - 1] - 1);
  return out;
}

// Least squares with a light ridge, so a short or collinear history stays stable.
export function regress(X, y, ridge = 1e-8) {
  const k = X[0].length, A = Array.from({ length: k }, () => new Float64Array(k + 1));
  for (let t = 0; t < X.length; t += 1) for (let i = 0; i < k; i += 1) { A[i][k] += X[t][i] * y[t]; for (let j = 0; j < k; j += 1) A[i][j] += X[t][i] * X[t][j]; }
  for (let i = 0; i < k; i += 1) A[i][i] += ridge * X.length;
  for (let i = 0; i < k; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < k; r += 1) if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r;
    [A[i], A[pivot]] = [A[pivot], A[i]];
    const d = A[i][i] || 1e-12;
    for (let r = 0; r < k; r += 1) { if (r === i) continue; const f = A[r][i] / d; for (let j = i; j <= k; j += 1) A[r][j] -= f * A[i][j]; }
  }
  return Array.from({ length: k }, (_, i) => A[i][k] / (A[i][i] || 1e-12));
}

// One scenario: worlds of block-resampled days, with its crises written over their stretch of days.
export function simulate({ factorDays, weights, betas, residuals, shocks, worlds, horizon, seed }) {
  const random = rng(seed), nF = factorDays[0].length, nH = weights.length, totals = new Float64Array(worlds), drawdowns = new Float64Array(worlds), blame = new Float64Array(nH);
  const f = new Float64Array(nF);
  for (let w = 0; w < worlds; w += 1) {
    let at = Math.floor(random() * factorDays.length), own = Math.floor(random() * residuals[0].length);
    // Each crisis lands at its own random moment with its own severity.
    const placed = shocks.map((s) => ({ s, start: Math.floor(random() * Math.max(1, horizon - Math.min(s.path.length, horizon) + 1)), scale: Math.min(1.5, Math.max(0.5, Math.exp(0.25 * Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())))) }));
    let value = 1, peak = 1, deepest = 0;
    for (let t = 0; t < horizon; t += 1) {
      // Mean block of 20 days: a new block starts with probability 1/20.
      if (random() < 0.05) { at = Math.floor(random() * factorDays.length); own = Math.floor(random() * residuals[0].length); }
      const base = factorDays[(at + t) % factorDays.length];
      let hit = false;
      for (let j = 0; j < nF; j += 1) f[j] = 0;
      for (const p of placed) {
        const k = t - p.start;
        if (k >= 0 && k < p.s.path.length) { hit = true; for (let j = 0; j < nF; j += 1) f[j] += p.s.path[k][j] * p.scale; }
      }
      if (!hit) for (let j = 0; j < nF; j += 1) f[j] = base[j];
      let day = 0;
      for (let h = 0; h < nH; h += 1) {
        let r = residuals[h][(own + t) % residuals[h].length];
        for (let j = 0; j < nF; j += 1) r += betas[h][j] * f[j];
        r = Math.max(r, -0.95);
        day += weights[h] * r;
        blame[h] += weights[h] * r;
      }
      value *= 1 + Math.max(day, -0.99);
      if (value > peak) peak = value;
      if (value / peak - 1 < deepest) deepest = value / peak - 1;
    }
    totals[w] = value - 1;
    drawdowns[w] = deepest;
  }
  return { totals, drawdowns, blame: Array.from(blame, (x) => x / worlds) };
}

function summarise(run) {
  const t = Float64Array.from(run.totals).sort(), d = Float64Array.from(run.drawdowns).sort();
  const tail = t.subarray(0, Math.max(1, Math.floor(t.length * 0.05)));
  const half = (start) => { const s = Float64Array.from(run.totals.filter((_, i) => i % 2 === start)).sort(); return quantile(s, 0.05); };
  return { median: quantile(t, 0.5), p5: quantile(t, 0.05), p25: quantile(t, 0.25), p75: quantile(t, 0.75), p95: quantile(t, 0.95), tail_mean_5pct: tail.reduce((a, b) => a + b, 0) / tail.length, chance_of_losing_20pct: t.filter((x) => x < -0.2).length / t.length, median_drawdown: quantile(d, 0.5), bad_drawdown_p5: quantile(d, 0.05), noise: Math.abs(half(0) - half(1)) };
}

export async function runWorlds(ctx, args) {
  const a = worldsInput.parse(args);
  const began = Date.now(), worlds = a.worlds ?? 2000, horizon = a.horizon_days ?? 252, seed = a.seed ?? 1;
  const today = new Date().toISOString().slice(0, 10);
  const symbols = a.holdings.map((h) => h.symbol.toUpperCase());
  const sum = a.holdings.reduce((t, h) => t + h.weight, 0);
  const prices = await Promise.all([...FACTORS, ...symbols].map((s) => ctx.call("price_history", { symbol: s, start: "2007-04-11", end: today, interval: "1Day" }).then(dailyReturns, (e) => ({ error: e.message, symbol: s }))));
  const bad = prices.filter((p) => p.error);
  if (bad.length) throw new Error(`stress_worlds needs daily prices, and ${bad.map((b) => b.symbol).join(", ")} had none (${String(bad[0].error).slice(0, 140)}). On the hosted server, run the local one: npx -y canli-mcp.`);
  const factors = prices.slice(0, FACTORS.length), own = prices.slice(FACTORS.length);
  const days = [...factors[0].keys()].filter((d) => factors.every((f) => f.has(d))).sort();
  if (days.length < 500) throw new Error("stress_worlds needs at least 500 days of market history; the price source gave too few.");
  const row = (d) => FACTORS.map((_, j) => factors[j].get(d));
  const factorDays = days.map(row);
  // Each holding against the markets, over its own last five years (or all it has).
  const fits = symbols.map((s, h) => {
    const shared = days.filter((d) => own[h].has(d)).slice(-1260);
    if (shared.length < 60) throw new Error(`${s} has only ${shared.length} days of prices alongside the markets; stress_worlds needs at least 60.`);
    const X = shared.map(row), y = shared.map((d) => own[h].get(d));
    const beta = regress(X, y), fitted = X.map((x) => x.reduce((t, v, j) => t + v * beta[j], 0));
    const res = Float64Array.from(y, (v, i) => v - fitted[i]), my = y.reduce((p, q) => p + q, 0) / y.length;
    const ssr = res.reduce((p, q) => p + q * q, 0), sst = y.reduce((p, q) => p + (q - my) ** 2, 0);
    return { beta, res, r2: sst ? 1 - ssr / sst : 0, days: shared.length };
  });
  // Scenarios: real episodes as their real paths across every market at once, or the caller's own.
  const episodeShock = (name) => {
    const e = EPISODES[name];
    if (!e) throw new Error(`stress_worlds: no scenario "${name}". Names: ${Object.keys(EPISODES).join(", ")}; custom ones go in custom.`);
    const path = days.filter((d) => d >= e.from && d <= e.to).map(row);
    if (!path.length) throw new Error(`stress_worlds: the price history does not reach ${e.what}.`);
    return { path, what: e.what };
  };
  const list = [];
  for (const spec of a.scenarios ?? Object.keys(EPISODES)) { const parts = spec.split("+").map((x) => x.trim()); list.push({ name: spec, shocks: parts.map(episodeShock), assumed: false }); }
  for (const c of a.custom ?? []) {
    for (const k of Object.keys(c.moves)) if (!FACTORS.includes(k)) throw new Error(`stress_worlds: custom moves go on ${FACTORS.join(", ")}, not ${k}.`);
    const daily = FACTORS.map((f) => (1 + (c.moves[f] ?? 0)) ** (1 / c.days) - 1);
    list.push({ name: c.name, shocks: [{ path: Array.from({ length: c.days }, () => daily), what: "your own assumption" }], assumed: true });
  }
  const shared = { factorDays, weights: a.holdings.map((h) => h.weight), betas: fits.map((f) => f.beta), residuals: fits.map((f) => f.res), worlds, horizon };
  const baseline = simulate({ ...shared, shocks: [], seed });
  const base = summarise(baseline);
  const results = list.map((s, i) => { const run = simulate({ ...shared, shocks: s.shocks, seed: seed + i + 1 }); return { s, sum: summarise(run), run }; });
  results.sort((x, y) => x.sum.tail_mean_5pct - y.sum.tail_mean_5pct);
  const line = (name, m) => [name, r4(m.median), r4(m.p5), r4(m.p95), r4(m.tail_mean_5pct), r4(m.chance_of_losing_20pct), r4(m.median_drawdown), r4(m.bad_drawdown_p5)];
  return {
    worlds_per_scenario: worlds, horizon_days: horizon, seed, weights_add_to: r4(sum),
    columns: ["scenario", "median_return", "p5_return", "p95_return", "average_of_worst_5pct", "chance_of_losing_20pct", "median_drawdown", "bad_drawdown_p5"],
    rows: [line("no crisis added", base), ...results.map((r) => line(r.s.name, r.sum))],
    worst: results[0] ? { scenario: results[0].s.name, is: results[0].s.shocks.map((x) => x.what).join(" and "), hurts_most: results[0].run.blame.map((b, h) => [symbols[h], r4(b)]).sort((x, y) => x[1] - y[1]).slice(0, 5), hurts_most_columns: ["holding", "contribution_to_return"] } : null,
    fit: { columns: ["holding", "days_fitted", "share_of_moves_explained_by_markets"], rows: symbols.map((s, h) => [s, fits[h].days, r4(fits[h].r2)]) },
    precision: { p5_noise: r4(Math.max(base.noise, ...results.map((r) => r.sum.noise))), note: "How far the p5 column moved between two halves of the worlds. Differences between scenarios smaller than this are noise; raise worlds." },
    ...(Math.abs(sum - 1) > 0.05 ? { note: `Weights add to ${r4(sum)}, so the rest is treated as cash earning nothing.` } : {}),
    ...(list.some((s) => s.assumed) ? { assumed: "Scenarios under custom have sizes you chose: they say what happens if you are right, and nothing about how likely that is." } : {}),
    history_from: days[0], market_proxies: FACTORS, elapsed_ms: Date.now() - began,
    meaning: "Each world resamples real days in blocks and writes each crisis's real day-by-day path across all markets at a random moment, at 0.5 to 1.5 times its size. Holdings move by their fitted link to these markets plus their own resampled surprises. No edge is assumed beyond history's drift.",
    limits: ["Scenarios, not forecasts: they show what a portfolio does in such a world, and not how likely that world is.", "A holding's link to markets is fitted on recent years and can break in a crisis; a low share_of_moves_explained means its risk is poorly captured.", "Prices are one source's adjusted closes; costs, taxes, liquidity and forced selling are left out.", "Not investment advice."],
  };
}
