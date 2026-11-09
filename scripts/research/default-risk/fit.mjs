// The model default_risk v1 serves (mcp-markets/src/default-risk-v1.json): the validated design fitted once more on
// every report whose year has passed (filed by 2025-11-07), with the same penalty; the reference distribution is the
// fitted chance on every report filed in 2025; the validation is validation.json's, as validate.mjs wrote it.
// Run: node scripts/research/default-risk/fit.mjs panel.csv
import { readFileSync, writeFileSync } from "node:fs";

import { design, FEATURES, fit, predict, vectorOf } from "../../../mcp-markets/src/default-risk.mjs";
import { loadRows } from "./validate.mjs";

const rows = loadRows(process.argv[2]), train = rows.filter((r) => r.filed <= "2025-11-07");
const d = design(train), w = fit(train.map((r) => vectorOf(d, r.q)), train.map((r) => r.y));
const ref = rows.filter((r) => r.filed.startsWith("2025")).map((r) => predict(w, vectorOf(d, r.q))).sort((a, b) => a - b);
const cut = Array.from({ length: 99 }, (_, i) => Number(ref[Math.floor(((i + 1) / 100) * ref.length)].toPrecision(6)));
const v = JSON.parse(readFileSync(new URL("../../../config/research/default-risk-v1/validation.json", import.meta.url), "utf8"));
const c = (k) => v[k].on_reports_every_benchmark_can_score, round = (x) => Number(x.toPrecision(8));
const summary = (k) => ({ reports: v[k].reports, companies: v[k].companies, bankruptcies: v[k].bankruptcies, auc: v[k].auc.model, share_of_bankruptcies_in_riskiest_tenth: v[k].share_of_bankruptcies_in_riskiest_tenth, against_benchmarks: { reports: c(k).reports, auc: c(k).auc, gain_over: c(k).gain_over } });
const out = {
  version: "default_risk v1",
  fitted_on: { reports: train.length, companies: new Set(train.map((r) => r.cik)).size, bankruptcies: train.reduce((s, r) => s + r.y, 0), filed: [train.reduce((m, r) => (r.filed < m ? r.filed : m), "9999"), "2025-11-07"] },
  design: { features: FEATURES, caps: Object.fromEntries(Object.entries(d.caps).map(([k, [a, b]]) => [k, [round(a), round(b)]])), median: Object.fromEntries(Object.entries(d.median).map(([k, x]) => [k, round(x)])), flags: d.flags, mean: d.mean.map(round), sd: d.sd.map(round) },
  weights: w.map(round),
  reference: { year: 2025, of: `the ${ref.length} annual reports (10-K) filed in 2025`, base_rate: Number((train.reduce((s, r) => s + r.y, 0) / train.length).toFixed(5)), cutpoints: cut },
  validation: {
    method: "walk-forward by filing year, 2014 to 2025: each year's model fitted only on reports whose following year had ended before that year began; label an Item 1.03 8-K within 365 days of the report; AUC with 95% intervals from resampling companies; design fixed before the first run (commit f8707c79)",
    all_reports: summary("all_reports"), assets_at_least_10m: summary("assets_at_least_10m"),
    benchmarks: { ohlson_o: { all_reports: c("all_reports").auc.ohlson_o, assets_at_least_10m: c("assets_at_least_10m").auc.ohlson_o }, altman_z_double_prime: { all_reports: c("all_reports").auc.altman_z_double_prime, assets_at_least_10m: c("assets_at_least_10m").auc.altman_z_double_prime } },
    finding: "Across all annual reports the model ranked the year's bankruptcies better than Ohlson's O and Altman's Z'' (AUC 0.79 against 0.73 and 0.72, intervals clear of zero). Among companies with at least $10M of assets it did not: Ohlson's O ranked them better (0.83 against 0.81, interval clear of zero) and Altman's Z'' tied. Its chances were calibrated: in every tenth the predicted and the realised rates were close.",
  },
};
writeFileSync(new URL("../../../mcp-markets/src/default-risk-v1.json", import.meta.url), `${JSON.stringify(out)}\n`);
console.log(JSON.stringify({ fitted_on: out.fitted_on, base_rate: out.reference.base_rate, median_cut: cut[49], top_tenth_cut: cut[89] }));
