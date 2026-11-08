// Walk-forward validation of beat_probability v1 (canli-mcp): each guided quarter of the S&P 500 guidance dataset of
// 2 November 2026 is predicted from what was filed before it, as the tool predicts, and scored against what happened.
// Three forecasts: the market-wide base rate known then, the company's own record, and the blend (the company's
// counts plus K pseudo-quarters at the base rate). K = 4 is fixed here, not tuned. Brier score over the three outcomes
// (above, within, below the guided range); the gain over the base rate with a 95% interval from resampling companies.
// Run: node scripts/research/beat-probability/validate.mjs > config/research/beat-probability-v1/validation.json
import { readFileSync } from "node:fs";

const DIR = new URL("../../../config/research/beat-probability-v1/", import.meta.url);
const OUT = ["above the range", "within the range", "below the range"], K = 4, MIN_OWN = 2, MIN_BASE = 50, BOOT = 5000;
const csv = readFileSync(new URL("guidance_lines-2026-11-02.csv", DIR), "utf8").trim().split("\n");
const head = csv[0].split(","), col = (n) => head.indexOf(n);
// URLs and units have no commas; the company names that do are quoted.
const parse = (line) => { const out = []; let cur = "", q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
const rows = csv.slice(1).map(parse).filter((r) => OUT.includes(r[col("position")]));
let seed = 1;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

const result = { model: "beat_probability v1", dataset: "guidance_lines-2026-11-02.csv (2,334 guidance lines from the press releases of the 500 companies in VOO, up to 12 quarters each)", k: K, min_own_quarters: MIN_OWN, measures: {} };
for (const measure of ["eps", "revenue"]) {
  const seen = new Set(), list = rows.filter((r) => r[col("measure")] === measure).sort((a, b) => (a[col("filed")] < b[col("filed")] ? -1 : a[col("filed")] > b[col("filed")] ? 1 : 0)).filter((r) => { const k = `${r[col("company")]}|${r[col("quarter")]}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const hist = new Map(), glob = [0, 0, 0], per = new Map(), sums = { base: 0, own: 0, blend: 0 }, cal = [];
  let n = 0, total = 0;
  for (const r of list) {
    const y = OUT.indexOf(r[col("position")]), company = r[col("company")], own = hist.get(company) ?? [0, 0, 0];
    const owned = own[0] + own[1] + own[2];
    if (owned >= MIN_OWN && total >= MIN_BASE) {
      const base = glob.map((g) => (g + 1) / (total + 3)), raw = own.map((c) => (c + 0.5) / (owned + 1.5)), blend = own.map((c, i) => (c + K * base[i]) / (owned + K));
      const brier = (p) => p.reduce((s, x, i) => s + (x - (i === y ? 1 : 0)) ** 2, 0);
      sums.base += brier(base); sums.own += brier(raw); sums.blend += brier(blend); n += 1;
      if (!per.has(company)) per.set(company, []);
      per.get(company).push(brier(base) - brier(blend));
      cal.push([blend[0], y === 0 ? 1 : 0]);
    }
    own[y] += 1; hist.set(company, own); glob[y] += 1; total += 1;
  }
  const companies = [...per.keys()], gains = [];
  for (let b = 0; b < BOOT; b += 1) { let s = 0, m = 0; for (let j = 0; j < companies.length; j += 1) { const d = per.get(companies[Math.floor(rand() * companies.length)]); s += d.reduce((a, x) => a + x, 0); m += d.length; } gains.push(s / m); }
  gains.sort((a, b) => a - b);
  const bins = [0, 1, 2, 3, 4].map((k) => cal.filter(([p]) => Math.min(4, Math.floor(p * 5)) === k)).filter((v) => v.length).map((v) => ({ predicted: +(v.reduce((s, [p]) => s + p, 0) / v.length).toFixed(3), observed: +(v.reduce((s, [, y]) => s + y, 0) / v.length).toFixed(3), quarters: v.length }));
  const r4 = (x) => +x.toFixed(4);
  result.measures[measure] = {
    quarters_scored: n, companies: companies.length,
    brier: { base_rate: r4(sums.base / n), own_record: r4(sums.own / n), blend: r4(sums.blend / n) },
    gain_over_base_rate: { mean: r4((sums.base - sums.blend) / n), ci95_by_company: [r4(gains[Math.floor(BOOT * 0.025)]), r4(gains[Math.floor(BOOT * 0.975)])] },
    calibration_of_p_above: bins,
    base_rate_all: { above: glob[0], within: glob[1], below: glob[2] },
  };
}
process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
