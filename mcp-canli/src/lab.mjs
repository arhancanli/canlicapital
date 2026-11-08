// mcp-canli/src/lab.mjs
//
// The Lab's tools: a result set against about a million mechanical strategies on public data (local/lab.mjs builds
// them with `canli-mcp lab build`). originality_check finds the strategies your returns most resemble, and where your
// Sharpe ranks among all of them over the same months; the best of them over those months is the luck bar that
// real, simple rules set, not a formula's. lab_search finds strategies by family, series, Sharpe, or low correlation
// with your book; lab_strategy shows one. Reads only: the Lab's files are on this machine.
import { closeSync, fstatSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

export const LAB_LIMITS = "The Lab's strategies run on Kenneth French's portfolio and factor returns: not investable, with a flat cost of 5 basis points per unit of turnover. They are a reference for what simple rules on public data could have earned, counted in full; resembling one is not proof of copying, and beating them is not a forecast.";
const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const seriesInput = {
  returns: z.array(z.number().finite().nullable()).min(24).max(200000).describe("Your strategy's returns, daily or monthly, as fractions."),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/)).min(24).max(200000).describe("The date of each return: YYYY-MM-DD for daily, YYYY-MM for monthly."),
};

export const LAB_TOOLS = Object.freeze([
  { name: "originality_check", pack: "desk", toolset: "desk", title: "Your strategy against a million counted strategies", annotations: RO,
    input: z.object({ ...seriesInput, nearest: z.number().int().min(1).max(50).optional().describe("How many nearest strategies to list, default 10.") }).strict(),
    description: "Set a strategy's returns against every strategy in the Lab (about a million rules on public portfolio and factor data, built on this machine): the nearest ones by correlation of monthly returns, how many are near-copies, and where your Sharpe ranks among all strategies covering the same months, with the best of them as the luck bar simple rules reached. Daily returns are compounded into months; at least 24 shared months are needed.",
    keywords: "originality novelty is my strategy new nearest strategies correlation duplicate copy crowded factor exposure luck bar percentile beat million strategies lab",
    args: "returns: number[], dates: string[], nearest?: integer" },
  { name: "lab_search", pack: "desk", toolset: "desk", title: "Search the Lab's strategies", annotations: RO,
    input: z.object({
      family: z.enum(["tsmom", "ma_cross", "breakout", "zscore_reversion", "rsi_reversion", "vol_target", "tsmom_vol_target"]).optional(),
      series: z.string().max(80).optional().describe("Text in the series name, such as 49_Industry, Europe or Mom."),
      rebalance: z.enum(["daily", "monthly"]).optional(),
      min_sharpe: z.number().optional(), min_years: z.number().min(0).max(100).optional(),
      uncorrelated_with: z.object(seriesInput).strict().optional().describe("Keep only strategies whose monthly correlation with these returns is within max_abs_corr."),
      max_abs_corr: z.number().min(0).max(1).optional().describe("Default 0.2, with uncorrelated_with."),
      sort: z.enum(["sharpe", "max_drawdown", "ann_return"]).optional(), limit: z.number().int().min(1).max(200).optional(),
    }).strict(),
    description: "Find strategies in the Lab by rule family, series, rebalancing, Sharpe and history length, or those nearly uncorrelated with your own returns (diversifiers for a book). Each row has its id, rule, series and statistics; lab_strategy shows one in full. Remember how many the Lab holds when reading the best of them.",
    keywords: "lab search strategies diversifier uncorrelated low correlation filter family momentum trend reversion volatility",
    args: "family?, series?, rebalance?, min_sharpe?, min_years?, uncorrelated_with?: {returns, dates}, max_abs_corr?, sort?, limit?" },
  { name: "lab_strategy", pack: "desk", toolset: "desk", title: "One strategy of the Lab", annotations: RO,
    input: z.object({ id: z.number().int().min(0) }).strict(),
    description: "One Lab strategy by its id: its series, rule and settings, statistics and monthly returns, and how to rebuild it exactly from the same files.",
    keywords: "lab strategy detail monthly returns rule settings id",
    args: "id: integer" },
  { name: "lab_status", pack: "desk", toolset: "desk", title: "The Lab's size and data", annotations: RO,
    input: z.object({}).strict(),
    description: "Whether the Lab is built on this machine, and if so how many strategies, series and rule variants it holds, its effective number of independent strategies, its data files with their hashes and when it was built.",
    keywords: "lab status size count strategies built data",
    args: "" },
]);

const exists = (p) => { try { statSync(p); return true; } catch { return false; } };
const monthKey = (d) => { const [y, m] = d.split("-").map(Number); return y * 12 + m - 1; };
const monthName = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;

// Daily or monthly returns into monthly ones, keyed by month index; at least 24.
export function toMonthly(returns, dates) {
  if (returns.length !== dates.length) throw new Error(`returns has ${returns.length} values and dates ${dates.length}.`);
  const acc = new Map();
  returns.forEach((r, i) => { if (r === null || !Number.isFinite(r)) return; const k = monthKey(dates[i]); acc.set(k, (acc.get(k) ?? 1) * (1 + r)); });
  const keys = [...acc.keys()].sort((a, b) => a - b);
  if (keys.length < 24) throw new Error(`Only ${keys.length} months of returns; at least 24 are needed.`);
  const first = keys[0], values = new Float64Array(keys.at(-1) - first + 1).fill(NaN);
  for (const k of keys) values[k - first] = acc.get(k) - 1;
  return { first, values };
}

export function openLab(dir) {
  if (!exists(join(dir, "manifest.json"))) throw new Error(`The Lab is not built on this machine. Build it once: npx -y canli-mcp lab build (downloads Kenneth French's daily files and runs about a million strategies; about 1.2 GB, minutes with --shards).`);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const offsets = new Uint32Array(readFileSync(join(dir, "offsets.u32")).buffer.slice(0));
  const statsBuf = readFileSync(join(dir, "stats.f32")), stats = new Float32Array(statsBuf.buffer, statsBuf.byteOffset, statsBuf.length / 4);
  const S = manifest.stats.length, V = manifest.variants, file = join(dir, "monthly.i16");
  const stat = (id, name) => stats[id * S + manifest.stats.indexOf(name)];
  const spec = (id) => {
    const series = manifest.series[Math.floor(id / V)], k = id % V, rule = manifest.rules[Math.floor(k / manifest.rebalance.length)];
    return { id, series: series.id, ...rule, rebalance: manifest.rebalance[k % manifest.rebalance.length], lag_days: manifest.lag_days, cost_bps: manifest.cost_bps };
  };
  const label = (id) => { const s = spec(id); const { id: _i, series, family, mode, rebalance, lag_days: _l, cost_bps: _c, ...p } = s; return `${family} ${Object.entries(p).map(([a, b]) => `${a}=${b}`).join(" ")} ${mode} ${rebalance} on ${series}`; };
  const statsOf = (id) => Object.fromEntries(manifest.stats.map((n) => [n, Number(stat(id, n).toFixed(n === "days" ? 0 : 4))]));
  const monthly = (id) => {
    const at = offsets[id * 3], count = offsets[id * 3 + 2], buf = Buffer.alloc(count * 2), fd = openSync(file, "r");
    try { readSync(fd, buf, 0, buf.length, at * 2); } finally { closeSync(fd); }
    return { first: offsets[id * 3 + 1], values: Array.from(new Int16Array(buf.buffer, buf.byteOffset, count), (x) => (x === manifest.missing ? null : x / 10000)) };
  };
  // Every strategy's monthly block in file order, read in chunks: visit(id, first, int16 view).
  const order = (() => { const ids = new Uint32Array(manifest.strategies); for (let i = 0; i < ids.length; i += 1) ids[i] = i; return ids.sort((a, b) => offsets[a * 3] - offsets[b * 3]); })();
  const scan = (visit) => {
    const fd = openSync(file, "r"), size = fstatSync(fd).size, chunk = 64 * 1024 * 1024;
    let buf = Buffer.alloc(0), base = 0;
    try {
      for (const id of order) {
        const at = offsets[id * 3] * 2, len = offsets[id * 3 + 2] * 2;
        if (at < base || at + len > base + buf.length) {
          const n = Math.min(Math.max(chunk, len), size - at);
          buf = Buffer.alloc(n);
          readSync(fd, buf, 0, n, at);
          base = at;
        }
        visit(id, offsets[id * 3 + 1], new Int16Array(buf.buffer, buf.byteOffset + (at - base), len / 2));
      }
    } finally { closeSync(fd); }
  };
  return { manifest, spec, label, statsOf, monthly, scan, stat };
}

// Correlation and Sharpe of each Lab strategy over the months it shares with u, in one pass.
function overlapPass(lab, u, visit) {
  const missing = lab.manifest.missing, uEnd = u.first + u.values.length;
  lab.scan((id, first, view) => {
    const a = Math.max(first, u.first), b = Math.min(first + view.length, uEnd);
    if (b - a < 24) return;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let k = a; k < b; k += 1) {
      const raw = view[k - first], y = u.values[k - u.first];
      if (raw === missing || !Number.isFinite(y)) continue;
      const x = raw / 10000;
      n += 1; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    if (n < 24) return;
    const vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
    const corr = vx > 0 && vy > 0 ? (sxy - (sx * sy) / n) / Math.sqrt(vx * vy) : 0;
    const sharpe = vx > 0 ? ((sx / n) / Math.sqrt(vx / (n - 1))) * Math.sqrt(12) : 0;
    visit(id, corr, sharpe, n);
  });
}

const r4 = (x) => Number(x.toFixed(4));

export function runOriginality(lab, args) {
  const a = LAB_TOOLS[0].input.parse(args ?? {});
  const u = toMonthly(a.returns, a.dates);
  const ok = [...u.values].filter(Number.isFinite), mean = ok.reduce((s, x) => s + x, 0) / ok.length;
  const sd = Math.sqrt(ok.reduce((s, x) => s + (x - mean) ** 2, 0) / (ok.length - 1)), mine = sd > 0 ? (mean / sd) * Math.sqrt(12) : 0;
  const want = a.nearest ?? 10, near = [];
  let compared = 0, c50 = 0, c70 = 0, c90 = 0, full = 0, beaten = 0, best = -Infinity, bestId = null;
  overlapPass(lab, u, (id, corr, sharpe, n) => {
    compared += 1;
    const ac = Math.abs(corr);
    if (ac >= 0.5) c50 += 1; if (ac >= 0.7) c70 += 1; if (ac >= 0.9) c90 += 1;
    if (near.length < want || ac > Math.abs(near.at(-1).corr)) { near.push({ id, corr, sharpe, n }); near.sort((x, y) => Math.abs(y.corr) - Math.abs(x.corr)); if (near.length > want) near.pop(); }
    // Ranked only against strategies that cover nearly all your months.
    if (n >= 0.9 * ok.length) { full += 1; if (sharpe < mine) beaten += 1; if (sharpe > best) { best = sharpe; bestId = id; } }
  });
  if (!compared) throw new Error("No Lab strategy shares 24 months with these returns; the Lab's data run to the latest month French has published.");
  return {
    months: ok.length, first_month: monthName(u.first), last_month: monthName(u.first + u.values.length - 1), sharpe_monthly_annualized: r4(mine),
    compared, lab_strategies: lab.manifest.strategies,
    near_copies: { abs_corr_at_least_0_5: c50, at_least_0_7: c70, at_least_0_9: c90 },
    nearest: { columns: ["id", "corr", "lab_sharpe_same_months", "shared_months", "strategy"], rows: near.map((x) => [x.id, r4(x.corr), r4(x.sharpe), x.n, lab.label(x.id)]) },
    rank: full ? { against: full, beats: beaten, percentile: r4((100 * beaten) / full), lab_best_same_months: { sharpe: r4(best), id: bestId, strategy: lab.label(bestId) } } : { against: 0, note: "No Lab strategy covers 90% of these months." },
    reading: `Over ${ok.length} months your Sharpe is ${mine.toFixed(2)}${full ? `; it beats ${((100 * beaten) / full).toFixed(1)}% of the ${full} Lab strategies covering the same months, whose best reached ${best.toFixed(2)}: that is what the best of ${full} simple rules showed, skill or not` : ""}. ${c70} strategies have a monthly correlation of 0.7 or more with yours.`,
    limits: LAB_LIMITS,
  };
}

export function runLabSearch(lab, args) {
  const a = LAB_TOOLS[1].input.parse(args ?? {});
  const V = lab.manifest.variants, N = lab.manifest.strategies, maxCorr = a.max_abs_corr ?? 0.2;
  let corrOf = null;
  if (a.uncorrelated_with) {
    corrOf = new Map();
    overlapPass(lab, toMonthly(a.uncorrelated_with.returns, a.uncorrelated_with.dates), (id, corr) => corrOf.set(id, corr));
  }
  const key = a.sort ?? "sharpe", hits = [];
  let matched = 0;
  for (let id = 0; id < N; id += 1) {
    const s = lab.spec(id);
    if (a.family && s.family !== a.family) continue;
    if (a.rebalance && s.rebalance !== a.rebalance) continue;
    if (a.series && !s.series.toLowerCase().includes(a.series.toLowerCase())) continue;
    const sharpe = lab.stat(id, "sharpe");
    if (!Number.isFinite(sharpe)) continue;
    if (a.min_sharpe !== undefined && sharpe < a.min_sharpe) continue;
    if (a.min_years !== undefined && lab.stat(id, "days") / 252 < a.min_years) continue;
    if (corrOf && !(corrOf.has(id) && Math.abs(corrOf.get(id)) <= maxCorr)) continue;
    matched += 1;
    hits.push([id, lab.stat(id, key)]);
  }
  hits.sort((x, y) => (key === "max_drawdown" ? y[1] - x[1] : y[1] - x[1]));
  const rows = hits.slice(0, a.limit ?? 20).map(([id]) => { const st = lab.statsOf(id); return [id, lab.label(id), st.sharpe, st.ann_return, st.max_drawdown, Number((st.days / 252).toFixed(1)), ...(corrOf ? [r4(corrOf.get(id))] : [])]; });
  return { matched, of: N, columns: ["id", "strategy", "sharpe", "ann_return", "max_drawdown", "years", ...(corrOf ? ["corr_with_yours"] : [])], rows, caution: `The best of ${matched} strategies is chosen from ${matched}: read its Sharpe against that many tries.`, limits: LAB_LIMITS };
}

export function runLabStrategy(lab, args) {
  const { id } = LAB_TOOLS[2].input.parse(args ?? {});
  if (id >= lab.manifest.strategies) throw new Error(`The Lab holds ids 0 to ${lab.manifest.strategies - 1}.`);
  const m = lab.monthly(id);
  return { ...lab.spec(id), label: lab.label(id), stats: lab.statsOf(id), monthly: { first_month: monthName(m.first), returns: m.values }, rebuild: "Same files (lab_status lists their hashes), same rule: positions from information to each close, entered at the next close, 5 bps per unit of turnover; local/lab.mjs runDaily.", limits: LAB_LIMITS };
}

export function runLabStatus(dir) {
  if (!exists(join(dir, "manifest.json"))) return { built: false, how: "npx -y canli-mcp lab build (downloads Kenneth French's daily files from his data library and runs every strategy on this machine; add --shards 8 to use more cores)." };
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  return { built: true, built_at: m.built_at, strategies: m.strategies, series: m.series.length, variants_per_series: m.variants, families: [...new Set(m.rules.map((r) => r.family))], rebalance: m.rebalance, ...(m.effective ? { effective: m.effective } : {}), data: { library: m.data.library, files: m.data.files.length, first_day: Math.min(...m.series.map((s) => s.first_day)), last_day: Math.max(...m.series.map((s) => s.last_day)) }, limits: LAB_LIMITS };
}
