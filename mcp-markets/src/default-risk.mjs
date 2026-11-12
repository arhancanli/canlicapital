// default_risk, a Canli model: the chance a company reports a bankruptcy (an 8-K under Item 1.03) within a year of its
// latest annual report, from that report's own figures. The figures are read here exactly as the model was trained
// and validated on them (scripts/research/default-risk: panel.mjs and validate.mjs import this file), and the fitted
// model with its validation is default-risk-v1.json (fit.mjs). Altman's Z'' and Ohlson's O are given beside it as
// cross-checks, with how each ranked in the same test.
import { readFileSync } from "node:fs";

import { z } from "zod";

import { getJson, resolveEntity, submissions } from "./sources.mjs";

// Each figure: the us-gaap concepts tried in order (the first the report used wins).
export const CONCEPTS = {
  total_assets: ["Assets"],
  total_liabilities: ["Liabilities"],
  liabilities_and_equity: ["LiabilitiesAndStockholdersEquity"],
  current_assets: ["AssetsCurrent"],
  current_liabilities: ["LiabilitiesCurrent"],
  retained_earnings: ["RetainedEarningsAccumulatedDeficit"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"],
  net_income: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  operating_income: ["OperatingIncomeLoss"],
  operating_cash_flow: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"],
  interest_expense: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestPaidNet", "InterestPaid"],
  long_term_debt: ["LongTermDebtNoncurrent", "LongTermDebt"],
};
const FLOWS = new Set(["net_income", "operating_income", "operating_cash_flow", "revenue", "interest_expense"]);
export const FIGURES = Object.keys(CONCEPTS);
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

// Every original 10-K in a companyfacts document, oldest first: its accession, filing day, own fiscal year end (the
// latest Assets balance it reports) and the figures it gave for that year, each with the concept it was read from.
export function reportsOf(json, cik = json.cik) {
  const gaap = json.facts?.["us-gaap"];
  if (!gaap?.Assets) return [];
  const usd = (c) => gaap[c]?.units?.USD ?? [];
  const reports = new Map();
  for (const f of usd("Assets")) {
    if (f.form !== "10-K") continue;
    const r = reports.get(f.accn);
    if (!r) reports.set(f.accn, { accn: f.accn, filed: f.filed, end: f.end });
    else if (f.end > r.end) r.end = f.end;
  }
  const out = [];
  for (const r of reports.values()) {
    if (days(r.end, r.filed) > 400 || days(r.end, r.filed) < 0) continue;
    const row = { cik: Number(cik), accn: r.accn, filed: r.filed, fy_end: r.end, tags: {} };
    for (const field of FIGURES) {
      row[field] = null;
      for (const c of CONCEPTS[field]) {
        const hit = usd(c).find((f) => f.accn === r.accn && f.end === r.end && (FLOWS.has(field) ? f.start && Math.abs(days(f.start, f.end) - 365) <= 20 : !f.start));
        if (hit) { row[field] = hit.val; row.tags[field] = c; break; }
      }
    }
    row.net_income_prior = null;
    for (const c of CONCEPTS.net_income) {
      const hit = usd(c).find((f) => f.accn === r.accn && f.start && Math.abs(days(f.end, r.end) - 365) <= 20 && Math.abs(days(f.start, f.end) - 365) <= 20);
      if (hit) { row.net_income_prior = hit.val; row.tags.net_income_prior = c; break; }
    }
    out.push(row);
  }
  return out.sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : 0));
}

export const FEATURES = ["ni_ta", "tl_ta", "wc_ta", "re_ta", "cfo_ta", "cash_ta", "ebit_ta", "sales_ta", "int_ta", "ltd_ta", "cl_ca", "chin", "log_ta", "neg_equity", "two_losses"];
const div = (a, b) => (a === null || b === null || !b ? null : a / b);
// The ratios from one report's figures (null where a figure is missing).
export function ratios(r) {
  const ta = r.total_assets, tl = r.total_liabilities ?? (r.liabilities_and_equity !== null && r.equity !== null ? r.liabilities_and_equity - r.equity : null);
  const ni = r.net_income, nip = r.net_income_prior;
  return {
    ni_ta: div(ni, ta), tl_ta: div(tl, ta), wc_ta: r.current_assets !== null && r.current_liabilities !== null ? div(r.current_assets - r.current_liabilities, ta) : null,
    re_ta: div(r.retained_earnings, ta), cfo_ta: div(r.operating_cash_flow, ta), cash_ta: div(r.cash, ta), ebit_ta: div(r.operating_income, ta),
    sales_ta: div(r.revenue, ta), int_ta: div(r.interest_expense, ta), ltd_ta: div(r.long_term_debt, ta),
    cl_ca: div(r.current_liabilities, r.current_assets), chin: ni !== null && nip !== null && Math.abs(ni) + Math.abs(nip) > 0 ? (ni - nip) / (Math.abs(ni) + Math.abs(nip)) : null,
    log_ta: ta > 0 ? Math.log(ta / 1e6) : null, neg_equity: tl === null ? null : tl > ta ? 1 : 0, two_losses: ni !== null && nip !== null ? (ni < 0 && nip < 0 ? 1 : 0) : null,
    tl, bv_tl: r.equity !== null && tl ? r.equity / tl : null, ffo_tl: div(r.operating_cash_flow, tl),
  };
}
// Altman Z'' (1995, book equity) and Ohlson O (1980; funds from operations read as operating cash flow, size as log
// total assets in millions), each with its published weights, signed so that higher is riskier; null if an input is
// missing.
export function zDoublePrime(q) { return [q.wc_ta, q.re_ta, q.ebit_ta, q.bv_tl].some((x) => x === null) ? null : -(6.56 * q.wc_ta + 3.26 * q.re_ta + 6.72 * q.ebit_ta + 1.05 * q.bv_tl); }
export function ohlsonO(q) { return [q.log_ta, q.tl_ta, q.wc_ta, q.cl_ca, q.neg_equity, q.ni_ta, q.ffo_tl, q.two_losses, q.chin].some((x) => x === null) ? null : -1.32 - 0.407 * q.log_ta + 6.03 * q.tl_ta - 1.43 * q.wc_ta + 0.0757 * q.cl_ca - 1.72 * q.neg_equity - 2.37 * q.ni_ta - 1.83 * q.ffo_tl + 0.285 * q.two_losses - 0.521 * q.chin; }

// The design read from training reports: each ratio capped at its 1st and 99th percentiles, a missing ratio set to the
// median with a flag, then standardised.
export function design(rows) {
  const d = { caps: {}, median: {}, mean: {}, sd: {}, flags: [] };
  for (const f of FEATURES) {
    const v = rows.map((r) => r.q[f]).filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
    const at = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    d.caps[f] = [at(0.01), at(0.99)]; d.median[f] = at(0.5);
    if (v.length < rows.length) d.flags.push(f);
  }
  const raw = rows.map((r) => vectorRaw(d, r.q));
  const k = FEATURES.length + d.flags.length;
  d.mean = Array.from({ length: k }, (_, j) => raw.reduce((s, x) => s + x[j], 0) / raw.length);
  d.sd = Array.from({ length: k }, (_, j) => Math.sqrt(raw.reduce((s, x) => s + (x[j] - d.mean[j]) ** 2, 0) / raw.length) || 1);
  return d;
}
function vectorRaw(d, q) {
  const x = FEATURES.map((f) => { const v = q[f]; return v === null || !Number.isFinite(v) ? d.median[f] : Math.min(d.caps[f][1], Math.max(d.caps[f][0], v)); });
  for (const f of d.flags) x.push(q[f] === null || !Number.isFinite(q[f]) ? 1 : 0);
  return x;
}
export const vectorOf = (d, q) => vectorRaw(d, q).map((v, j) => (v - d.mean[j]) / d.sd[j]);
function solve(A, b) { // Cholesky, A symmetric positive definite.
  const n = b.length, L = A.map((r) => r.map(() => 0));
  for (let i = 0; i < n; i += 1) for (let j = 0; j <= i; j += 1) { let s = A[i][j]; for (let k = 0; k < j; k += 1) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j]; }
  const y = Array(n).fill(0), x = Array(n).fill(0);
  for (let i = 0; i < n; i += 1) { let s = b[i]; for (let k = 0; k < i; k += 1) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i -= 1) { let s = y[i]; for (let k = i + 1; k < n; k += 1) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}
// Logistic regression by Newton's method, an L2 penalty on every weight but the intercept.
export function fit(X, y, lambda = 1) {
  const k = X[0].length + 1; let w = Array(k).fill(0);
  w[0] = Math.log((y.reduce((s, v) => s + v, 0) + 0.5) / (y.length - y.reduce((s, v) => s + v, 0) + 0.5));
  for (let it = 0; it < 50; it += 1) {
    const g = Array(k).fill(0), H = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < X.length; i += 1) {
      const xi = [1, ...X[i]]; let s = 0; for (let j = 0; j < k; j += 1) s += w[j] * xi[j];
      const p = 1 / (1 + Math.exp(-s)), r = p - y[i], h = p * (1 - p);
      for (let a = 0; a < k; a += 1) { g[a] += r * xi[a]; const ha = h * xi[a]; for (let b = 0; b <= a; b += 1) H[a][b] += ha * xi[b]; }
    }
    for (let a = 1; a < k; a += 1) { g[a] += lambda * w[a]; H[a][a] += lambda; }
    for (let a = 0; a < k; a += 1) for (let b = a + 1; b < k; b += 1) H[a][b] = H[b][a];
    const step = solve(H, g); w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return w;
}
export const predict = (w, x) => 1 / (1 + Math.exp(-(w[0] + x.reduce((s, v, j) => s + v * w[j + 1], 0))));

let MODEL;
export const model = () => (MODEL ??= JSON.parse(readFileSync(new URL("./default-risk-v1.json", import.meta.url), "utf8")));

export const defaultRiskInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Read the latest annual report filed before this day: the model as it would have read the company then."),
}).strict();

const LIMITS = [
  "A model of whether a company files an Item 1.03 8-K (bankruptcy or receivership) within a year, from its last annual report's figures alone: no share price, no debt prices, nothing filed since that report.",
  "The label is a reported bankruptcy, not every default: a company that stops filing without reporting one counts as no event, and a missed coupon settled out of court is not seen.",
  "Among companies with at least $10M of assets, both benchmarks ranked the test years' bankruptcies better than this model on the reports all three can score: Ohlson's O (AUC 0.83) and Altman's Z'' (0.82) against 0.81. Both are returned.",
  "Fitted and tested on US GAAP 10-Ks filed from 2009 to 2025; for banks and insurers the ratios mean something else. Not investment advice.",
];

export async function defaultRisk(session, args) {
  const a = defaultRiskInput.parse(args ?? {}), m = model();
  const e = await resolveEntity(session, a.company);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`;
  const cf = await getJson(session, url, { maxBytes: 96 * 1024 * 1024 });
  const reports = reportsOf(cf, e.cik).filter((r) => !a.as_of || r.filed < a.as_of);
  const r = reports.at(-1);
  if (!r) throw new Error(`${cf.entityName ?? a.company} has no original 10-K with US GAAP figures${a.as_of ? ` filed before ${a.as_of}` : ""}: the model reads only those.`);
  const sub = await submissions(session, e.cik).catch(() => null);
  const sic = Number(sub?.sic), financial = sic >= 6000 && sic <= 6411;
  const q = ratios(r), p = predict(m.weights, vectorOf(m.design, q));
  const cuts = m.reference.cutpoints, riskier = cuts.filter((c) => c < p).length / (cuts.length + 1);
  const zz = zDoublePrime(q), o = ohlsonO(q), pct = (x) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;
  const stale = days(r.filed, a.as_of ?? new Date().toISOString().slice(0, 10)) > 400;
  const name = cf.entityName ?? e.name, r4 = (x) => (x === null ? null : Number(x.toFixed(4)));
  return {
    company: { cik: e.cik, name, ticker: e.ticker ?? null }, ...(a.as_of ? { as_of: a.as_of } : {}),
    report: { form: "10-K", accession: r.accn, filed: r.filed, fiscal_year_end: r.fy_end, url: `https://www.sec.gov/Archives/edgar/data/${e.cik}/${r.accn.replace(/-/g, "")}/` },
    chance_of_bankruptcy_filing_within_a_year: r4(p),
    riskier_than: { share: r4(riskier), of: m.reference.of },
    reading: `From its 10-K filed ${r.filed}, the model gives ${name} about a ${pct(p)} chance of reporting a bankruptcy within a year of that filing, against ${pct(m.reference.base_rate)} for the average annual report; that is riskier than ${(riskier * 100).toFixed(0)}% of the annual reports filed in ${m.reference.year}.${stale ? " That report is over 400 days old, so the year it speaks for has passed." : ""}${financial ? ` ${sub.sicDescription ?? "This is a financial company"}: the ratios mean something else for banks and insurers.` : ""}`,
    cross_checks: {
      ohlson_o: { score: r4(o), meaning: "Ohlson (1980), published weights; higher is riskier.", auc_in_validation: m.validation.benchmarks.ohlson_o },
      altman_z_double_prime: { score: zz === null ? null : r4(-zz), meaning: "Altman Z'' (1995, book equity); lower is riskier, under 1.1 is his distress zone.", auc_in_validation: m.validation.benchmarks.altman_z_double_prime },
    },
    inputs: { columns: ["figure", "value", "concept"], rows: [...FIGURES, "net_income_prior"].map((f) => [f, r[f], r.tags[f] ?? null]) },
    ratios: Object.fromEntries(FEATURES.map((f) => [f, r4(q[f])])),
    model: { version: m.version, fitted_on: m.fitted_on, validation: m.validation },
    sources: [url, ...(sub ? [`https://data.sec.gov/submissions/CIK${String(e.cik).padStart(10, "0")}.json`] : [])],
    limits: LIMITS,
  };
}
