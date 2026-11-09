// Walk-forward validation of default_risk v1 (canli-mcp): the chance a company reports a bankruptcy (an 8-K under Item
// 1.03) within 365 days of filing its annual report, from that report's figures alone. Everything below was fixed
// before the first run and is not tuned on the results:
// - Sample: each original 10-K in panel.csv (built by panel.mjs from the SEC's companyfacts archive) with positive total
//   assets, leaving out reports filed within 365 days after one of the company's own Item 1.03 8-Ks (already bankrupt).
// - Label: an Item 1.03 8-K by the same CIK filed in the 365 days after the report (bankruptcy_8k.csv, labels.mjs).
// - Walk-forward by filing year, 2014 to 2025 (to 2025-11-07, so every label's year has passed): the model for year Y is
//   fit only on reports whose 365 days ended before 1 January of Y, so no outcome it learns from was known after.
// - Model: logistic regression with an L2 penalty of 1 on standardised features (the intercept unpenalised); ratios
//   capped at the training set's 1st and 99th percentiles; a missing figure takes the training median and sets its flag.
// - Benchmarks with their published, fixed weights: Altman's Z'' (1995, book equity: the filings-only Z) and Ohlson's O
//   (1980; funds from operations read as operating cash flow, size as log total assets in millions), and leverage alone.
// - Scores: AUC pooled over the test years, each year's AUC, the share of bankruptcies in each year's riskiest tenth,
//   Brier and log loss against the training base rate, calibration by tenth; 95% intervals for the AUC gains from
//   resampling companies (2,000 resamples). The same on reports of companies with at least $10M of assets.
// The ratios, benchmarks and fit are canli-markets' default-risk.mjs, the code the tool runs.
// Run: node scripts/research/default-risk/validate.mjs panel.csv > config/research/default-risk-v1/validation.json
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { design, FEATURES, fit, ohlsonO, predict, ratios, vectorOf, zDoublePrime } from "../../../mcp-markets/src/default-risk.mjs";

const LAMBDA = 1, FIRST = 2014, LAST = 2025, CUTOFF = "2025-11-07", BOOT = 2000;
const num = (x) => (x === "" || x === undefined || x === null ? null : Number(x));

// AUC by ranks (ties shared), on [score, label] pairs.
export function auc(pairs) {
  const s = [...pairs].sort((a, b) => a[0] - b[0]); let rank = 0, pos = 0, sumPos = 0;
  for (let i = 0; i < s.length;) { let j = i; while (j < s.length && s[j][0] === s[i][0]) j += 1; const avg = (i + 1 + j) / 2; for (let t = i; t < j; t += 1) if (s[t][1]) { pos += 1; sumPos += avg; } rank = j; i = j; }
  const neg = s.length - pos; return pos && neg ? (sumPos - (pos * (pos + 1)) / 2) / (pos * neg) : null;
}

// The sample: each report with positive assets, its label, and its ratios; reports filed within a year after the
// company's own Item 1.03 8-K are left out.
export function loadRows(panelPath) {
  const LAB = new URL("../../../config/research/default-risk-v1/bankruptcy_8k.csv", import.meta.url);
  const events = new Map();
  for (const line of readFileSync(LAB, "utf8").trim().split("\n").slice(1)) { const [cik, filed] = line.split(","); (events.get(Number(cik)) ?? events.set(Number(cik), []).get(Number(cik))).push(filed); }
  const text = readFileSync(panelPath, "utf8").trim().split("\n"), head = text[0].split(",");
  const dayMs = 86400000, after = (a, b) => (Date.parse(b) - Date.parse(a)) / dayMs;
  const rows = [];
  for (const line of text.slice(1)) {
    const v = line.split(","), r = Object.fromEntries(head.map((h, i) => [h, i < 4 ? v[i] : num(v[i])]));
    if (!(r.total_assets > 0)) continue;
    const ev = events.get(Number(r.cik)) ?? [];
    if (ev.some((d) => after(d, r.filed) >= 0 && after(d, r.filed) <= 365)) continue;
    rows.push({ cik: Number(r.cik), filed: r.filed, ta: r.total_assets, y: ev.some((d) => after(r.filed, d) > 0 && after(r.filed, d) <= 365) ? 1 : 0, q: ratios(r) });
  }
  return rows;
}

if (process.argv[2] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = loadRows(process.argv[2]), dayMs = 86400000, after = (a, b) => (Date.parse(b) - Date.parse(a)) / dayMs;
  const tested = [], coefs = {};
  for (let Y = FIRST; Y <= LAST; Y += 1) {
    const start = `${Y}-01-01`, train = rows.filter((r) => after(r.filed, start) > 365), test = rows.filter((r) => r.filed.startsWith(String(Y)) && r.filed <= CUTOFF);
    const d = design(train), w = fit(train.map((r) => vectorOf(d, r.q)), train.map((r) => r.y)), base = train.reduce((s, r) => s + r.y, 0) / train.length;
    coefs[Y] = { train_reports: train.length, train_bankruptcies: train.reduce((s, r) => s + r.y, 0), intercept: w[0], weights: Object.fromEntries([...FEATURES, ...d.flags.map((f) => `${f}_missing`)].map((f, j) => [f, Number(w[j + 1].toFixed(4))])) };
    for (const r of test) tested.push({ ...r, year: Y, p: predict(w, vectorOf(d, r.q)), base, z: zDoublePrime(r.q), o: ohlsonO(r.q), lev: r.q.tl_ta });
  }
  let seed = 7; const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const r4 = (x) => (x === null ? null : Number(x.toFixed(4)));
  function report(set) {
    const common = set.filter((r) => r.z !== null && r.o !== null && r.lev !== null);
    const aucOf = (rs, key) => auc(rs.map((r) => [r[key], r.y]));
    const brier = (rs, key) => rs.reduce((s, r) => s + (r[key] - r.y) ** 2, 0) / rs.length, ll = (rs, key) => -rs.reduce((s, r) => s + Math.log(Math.max(1e-12, r.y ? r[key] : 1 - r[key])), 0) / rs.length;
    const tenth = (rs) => { let hit = 0, all = 0; for (let Y = FIRST; Y <= LAST; Y += 1) { const ys = rs.filter((r) => r.year === Y).sort((a, b) => b.p - a.p); const top = ys.slice(0, Math.ceil(ys.length / 10)); hit += top.reduce((s, r) => s + r.y, 0); all += ys.reduce((s, r) => s + r.y, 0); } return all ? hit / all : null; };
    const byCo = new Map(); for (const r of common) (byCo.get(r.cik) ?? byCo.set(r.cik, []).get(r.cik)).push(r);
    const cos = [...byCo.values()], gains = { z: [], o: [], lev: [] };
    for (let b = 0; b < BOOT; b += 1) {
      const s = []; for (let i = 0; i < cos.length; i += 1) s.push(...cos[Math.floor(rand() * cos.length)]);
      const m = aucOf(s, "p"); for (const k of ["z", "o", "lev"]) gains[k].push(m - aucOf(s, k));
    }
    const ci = (a) => { const s = a.filter((x) => x !== null && !Number.isNaN(x)).sort((x, y) => x - y); return [r4(s[Math.floor(0.025 * s.length)]), r4(s[Math.floor(0.975 * s.length)])]; };
    const cal = []; const sorted = [...set].sort((a, b) => a.p - b.p);
    for (let t = 0; t < 10; t += 1) { const part = sorted.slice(Math.floor((t * sorted.length) / 10), Math.floor(((t + 1) * sorted.length) / 10)); cal.push([t + 1, part.length, r4(part.reduce((s, r) => s + r.p, 0) / part.length), r4(part.reduce((s, r) => s + r.y, 0) / part.length)]); }
    return {
      reports: set.length, companies: new Set(set.map((r) => r.cik)).size, bankruptcies: set.reduce((s, r) => s + r.y, 0),
      auc: { model: r4(aucOf(set, "p")) },
      on_reports_every_benchmark_can_score: { reports: common.length, bankruptcies: common.reduce((s, r) => s + r.y, 0), auc: { model: r4(aucOf(common, "p")), altman_z_double_prime: r4(aucOf(common, "z")), ohlson_o: r4(aucOf(common, "o")), leverage_alone: r4(aucOf(common, "lev")) },
        gain_over: { altman_z_double_prime: { mean: r4(aucOf(common, "p") - aucOf(common, "z")), ci95_by_company: ci(gains.z) }, ohlson_o: { mean: r4(aucOf(common, "p") - aucOf(common, "o")), ci95_by_company: ci(gains.o) }, leverage_alone: { mean: r4(aucOf(common, "p") - aucOf(common, "lev")), ci95_by_company: ci(gains.lev) } } },
      share_of_bankruptcies_in_riskiest_tenth: r4(tenth(set)),
      brier: { model: r4(brier(set, "p")), base_rate: r4(brier(set, "base")) }, log_loss: { model: r4(ll(set, "p")), base_rate: r4(ll(set, "base")) },
      by_year: Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i).map((Y) => { const ys = set.filter((r) => r.year === Y); return [Y, ys.length, ys.reduce((s, r) => s + r.y, 0), r4(aucOf(ys, "p"))]; }),
      calibration_by_tenth: { columns: ["tenth", "reports", "predicted", "happened"], rows: cal },
    };
  }
  console.log(JSON.stringify({
    model: "default_risk v1", data: { panel: "panel.mjs on the SEC companyfacts archive downloaded 2026-11-08", labels: "bankruptcy_8k.csv: Item 1.03 8-Ks, 2009 to 2026-11-07, from EDGAR full-text search" },
    fixed_before_running: { features: FEATURES, l2_penalty: LAMBDA, test_years: [FIRST, LAST], cutoff: CUTOFF, resamples: BOOT },
    all_reports: report(tested), assets_at_least_10m: report(tested.filter((r) => r.ta >= 1e7)),
    final_fit_years: coefs,
  }, null, 1));
}
