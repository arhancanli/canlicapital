// verify_claims: check the figures in a draft answer against the company's own filings before
// they reach a reader. Each claim (a measure, a period, a value) is looked up in SEC's XBRL
// company-concept facts for the period as the company labels it: fiscal year N is the year its
// 10-K for fiscal N reports, a quarter the one its 10-Q for that quarter reports. The verdict
// carries the filed figure and its source; a number that does not match is checked against what
// it might be instead (another year, a quarter, a thousandfold slip, the figure before a
// restatement), because that is how wrong figures usually arise.
import { z } from "zod";

import { measureOf, periodOf, quarterOf, resultsFromText, sentences, unglue } from "./guidance.mjs";
import { getJson, NotFound, pad10, resolveEntity } from "./sources.mjs";

const SCALE = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };

// Measures checked against GAAP facts: their concepts (first with facts for the period wins), whether
// they are flows over a period or balances at a date, and their unit.
const FACTS = Object.freeze({
  revenue: { concepts: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax", "RevenuesNetOfInterestExpense"], unit: "USD" },
  net_income: { concepts: ["NetIncomeLoss", "ProfitLoss"], unit: "USD" },
  eps: { concepts: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"], unit: "USD/shares" },
  eps_basic: { concepts: ["EarningsPerShareBasic", "EarningsPerShareBasicAndDiluted"], unit: "USD/shares" },
  operating_income: { concepts: ["OperatingIncomeLoss"], unit: "USD" },
  gross_profit: { concepts: ["GrossProfit"], unit: "USD" },
  pretax_income: { concepts: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"], unit: "USD" },
  operating_expenses: { concepts: ["OperatingExpenses", "CostsAndExpenses"], unit: "USD" },
  rnd: { concepts: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"], unit: "USD" },
  operating_cash_flow: { concepts: ["NetCashProvidedByUsedInOperatingActivities"], unit: "USD" },
  capex: { concepts: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], unit: "USD" },
  income_tax: { concepts: ["IncomeTaxExpenseBenefit"], unit: "USD" },
  dividends_per_share: { concepts: ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"], unit: "USD/shares" },
  total_assets: { concepts: ["Assets"], unit: "USD", instant: true },
  total_liabilities: { concepts: ["Liabilities"], unit: "USD", instant: true },
  equity: { concepts: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], unit: "USD", instant: true },
  cash: { concepts: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], unit: "USD", instant: true },
  long_term_debt: { concepts: ["LongTermDebtNoncurrent", "LongTermDebt"], unit: "USD", instant: true },
});
// Ratios of two facts, in percent.
const RATIOS = Object.freeze({ gross_margin: ["gross_profit", "revenue"], operating_margin: ["operating_income", "revenue"], net_margin: ["net_income", "revenue"], pretax_margin: ["pretax_income", "revenue"] });
// Differences of two facts.
const DIFFERENCES = Object.freeze({ free_cash_flow: ["operating_cash_flow", "capex"] });

// A claim's measure from its words; "basic EPS" is told apart from diluted.
export function claimMeasure(text) {
  if (/\bbasic (?:eps|earnings per share)\b/i.test(String(text ?? ""))) return "eps_basic";
  return measureOf(text);
}

// A claimed period as the company labels it: { fy, fp: "FY" | "Q1".."Q4" } or { instant }.
export function claimPeriod(text) {
  const t = String(text ?? "").trim();
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const q = quarterOf(t);
  if (q && q.year) return { fy: q.year, fp: `Q${q.quarter}` };
  const fy = t.match(/\b(?:fiscal(?: year)?|fy)\s*['’]?(\d{4}|\d{2})\b/i) ?? t.match(/^(?:calendar(?: year)?\s*)?(\d{4})$/i) ?? t.match(/\b(?:in|for|during)\s+(\d{4})\b/i);
  if (fy) return { fy: fy[1].length === 2 ? 2000 + Number(fy[1]) : Number(fy[1]), fp: "FY" };
  if (iso) return { instant: iso[1] };
  const year = t.match(/\b(19|20)\d{2}\b/);
  return year ? { fy: Number(year[0]), fp: "FY" } : null;
}

const decimalsOf = (v) => (String(v).split(".")[1] ?? "").length;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
const round = (x, d = 6) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

// The facts of one concept, cached per session. SEC's company-concept endpoint answers some
// companies with an empty units object ({"USD":{}}) for concepts their companyfacts file holds
// (Coca-Cola's Revenues and NetIncomeLoss, 2026-10-14), so an empty or malformed answer falls back
// to the company's full facts file.
async function conceptFacts(session, cik, concept, unit) {
  let rows = null;
  try {
    const d = await getJson(session, `https://data.sec.gov/api/xbrl/companyconcept/CIK${pad10(cik)}/us-gaap/${concept}.json`, { maxBytes: 16 * 1024 * 1024 });
    rows = d?.units?.[unit];
  } catch (err) {
    if (!(err instanceof NotFound)) throw err;
  }
  if (Array.isArray(rows) && rows.length) return rows;
  // A concept the endpoint does not have (404) is not in the facts file either.
  if (rows === undefined || rows === null) return [];
  try {
    const all = await getJson(session, `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(cik)}.json`, { maxBytes: 96 * 1024 * 1024 });
    const r = all?.facts?.["us-gaap"]?.[concept]?.units?.[unit];
    return Array.isArray(r) ? r : [];
  } catch (err) {
    if (err instanceof NotFound) return [];
    throw err;
  }
}

// The fact for a period as the company labels it: from the filing for that fiscal year and period,
// the fact covering it (a year, a quarter, or the balance at its end), with the latest value filed
// later for the same dates.
function factFor(rows, period, instant) {
  const forms = period.fp === "FY" ? /^10-K/ : /^10-Q/;
  const span = (r) => (r.start ? days(r.start, r.end) : null);
  const fits = (r) => (instant ? !r.start : period.fp === "FY" ? span(r) >= 350 && span(r) <= 380 : span(r) >= 80 && span(r) <= 100);
  const own = rows.filter((r) => r.fy === period.fy && r.fp === period.fp && forms.test(r.form ?? "") && fits(r));
  if (!own.length) return null;
  const end = own.reduce((m, r) => (r.end > m ? r.end : m), "");
  const first = own.filter((r) => r.end === end).sort((a, b) => a.filed.localeCompare(b.filed))[0];
  const same = rows.filter((r) => r.end === end && (r.start ?? null) === (first.start ?? null)).sort((a, b) => b.filed.localeCompare(a.filed));
  return { first, latest: same[0] ?? first };
}

// A fourth quarter has no 10-Q: it is the 10-K's year less the nine months the third-quarter
// 10-Q reports (a flow); a balance at its end is the year-end balance.
function fourthQuarter(rows, fy, instant) {
  const year = factFor(rows, { fy, fp: "FY" }, instant);
  if (!year || instant) return year && { ...year, derived: "the balance at the fiscal year end (10-K)" };
  const nine = rows.filter((r) => r.fy === fy && r.fp === "Q3" && /^10-Q/.test(r.form ?? "") && r.start === year.latest.start && days(r.start, r.end) >= 260 && days(r.start, r.end) <= 280).sort((a, b) => b.filed.localeCompare(a.filed))[0];
  if (!nine) return null;
  const val = year.latest.val - nine.val;
  const fact = { ...year.latest, start: nine.end, val, derived: true };
  return { first: { ...fact, val: year.first.val - nine.val }, latest: fact, derived: `the fiscal year (10-K) less the first nine months (10-Q filed ${nine.filed})` };
}

async function lookup(session, cik, measure, period) {
  const spec = FACTS[measure];
  for (const concept of spec.concepts) {
    const rows = await conceptFacts(session, cik, concept, spec.unit);
    if (!rows.length) continue;
    const f = period.fp === "Q4" ? fourthQuarter(rows, period.fy, spec.instant) : factFor(rows, period, spec.instant);
    if (f) return { ...f, concept: `us-gaap:${concept}`, rows };
  }
  return null;
}

// The newest fiscal year and quarter a company has reported a measure for, to say so when a claim
// is about a period not reported (yet, or ever).
async function latestReported(session, cik, measure) {
  const spec = FACTS[FACTS[measure] ? measure : (RATIOS[measure] ?? DIFFERENCES[measure])[0]];
  for (const concept of spec.concepts) {
    const rows = await conceptFacts(session, cik, concept, spec.unit);
    const tenK = rows.filter((r) => /^10-K/.test(r.form ?? "") && r.fp === "FY");
    if (tenK.length) { const r = tenK.reduce((m, x) => (x.end > m.end ? x : m)); return { fy: r.fy, end: r.end, concept }; }
  }
  return null;
}

const sourceOf = (cik, accn) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}/${accn}-index.htm`;
const scaleOf = (unit) => { const m = String(unit ?? "").toLowerCase().match(/thousand|million|billion|trillion/); return m ? SCALE[m[0]] : 1; };
const label = (period) => (period.instant ? period.instant : period.fp === "FY" ? `fiscal ${period.fy}` : `${period.fp} of fiscal ${period.fy}`);

// What a wrong figure does match: another year, a quarter of the year, a thousandfold slip.
async function explain(session, cik, measure, period, claimed, tolerance, used) {
  const near = (v) => Math.abs(v - claimed) <= tolerance;
  const spec = FACTS[measure];
  if (!spec) return null;
  // The concept the lookup used first, then the others (a company that changed concepts reports
  // the other years under another one).
  const order = [used, ...spec.concepts.map((c) => `us-gaap:${c}`).filter((c) => c !== used)].filter(Boolean);
  for (const name of order) {
    const rows = await conceptFacts(session, cik, name.replace(/^us-gaap:/, ""), spec.unit);
    if (!rows.length) continue;
    for (const fy of [period.fy - 1, period.fy + 1, period.fy - 2]) {
      const f = factFor(rows, { ...period, fy }, spec.instant);
      if (f && (near(f.latest.val) || near(f.first.val))) return `matches ${label({ ...period, fy })} instead`;
    }
    if (period.fp === "FY" && !spec.instant) {
      for (const q of ["Q1", "Q2", "Q3"]) {
        const f = factFor(rows, { fy: period.fy, fp: q }, false);
        if (f && near(f.latest.val)) return `matches ${q} of fiscal ${period.fy} (a quarter, not the year)`;
      }
    }
    const f = factFor(rows, period, spec.instant);
    if (f) for (const k of [1e3, 1e6, 1e-3, 1e-6]) if (Math.abs(f.latest.val * k - claimed) <= tolerance * Math.max(1, k)) return `matches the filed figure times ${k}: a slip of units`;
  }
  return null;
}

// One claim checked: { measure, period, value, unit, quote? } -> a verdict row.
async function check(session, cik, claim) {
  const { measure, period, value, unit } = claim;
  const base = { claim: claim.quote ?? `${measure} ${label(period ?? { fy: "?", fp: "FY" })} ${value}${unit ? ` ${unit}` : ""}`, measure, period: period ? label(period) : null, claimed: value, unit: unit ?? null };
  if (claim.basis && claim.basis !== "GAAP") return { ...base, verdict: "not checkable", note: `${claim.basis} figures are the company's own measures, not in its XBRL statements; earnings_release reads them from the release.` };
  if (!measure || !(FACTS[measure] || RATIOS[measure] || DIFFERENCES[measure])) return { ...base, verdict: "not checkable", note: `${measure ?? "this measure"} is not one this tool checks: ${[...Object.keys(FACTS), ...Object.keys(RATIOS), ...Object.keys(DIFFERENCES)].join(", ")}.` };
  if (!period) return { ...base, verdict: "not checkable", note: "No period named: give a fiscal year (\"fiscal 2025\"), a quarter (\"Q3 2026\") or a date." };
  if (period.instant) return { ...base, verdict: "not checkable", note: "Give the fiscal year whose end the balance is at (\"fiscal 2025\"); a bare date is not matched to a filing." };
  const tolerance = 0.5 * 10 ** -(claim.decimals ?? decimalsOf(value));
  // Ratios in percent, differences in the claim's scale.
  if (RATIOS[measure] || DIFFERENCES[measure]) {
    const [a, b] = RATIOS[measure] ?? DIFFERENCES[measure];
    const [fa, fb] = await Promise.all([lookup(session, cik, a, period), lookup(session, cik, b, period)]);
    if (!fa || !fb) return { ...base, verdict: "not reported", ...(await notReported(session, cik, measure, period)) };
    const filed = RATIOS[measure] ? (fa.latest.val / fb.latest.val) * 100 : (fa.latest.val - fb.latest.val) / scaleOf(unit);
    const ok = Math.abs(filed - value) <= tolerance + 1e-9;
    return { ...base, verdict: ok ? "confirmed" : "contradicted", filed: round(filed, 4), difference: round(value - filed, 4), how: RATIOS[measure] ? `${fa.concept} / ${fb.concept} x 100` : `${fa.concept} - ${fb.concept}`, source: sourceOf(cik, fa.latest.accn) };
  }
  // Growth over the prior year.
  if (claim.change === "growth") {
    const prior = period.fp === "FY" ? { fy: period.fy - 1, fp: "FY" } : { fy: period.fy - 1, fp: period.fp };
    const [now, then] = await Promise.all([lookup(session, cik, measure, period), lookup(session, cik, measure, prior)]);
    if (!now || !then) return { ...base, verdict: "not reported", ...(await notReported(session, cik, measure, now ? prior : period)) };
    const filed = (now.latest.val / then.latest.val - 1) * 100;
    const ok = Math.abs(filed - value) <= tolerance + 1e-9;
    return { ...base, verdict: ok ? "confirmed" : "contradicted", filed: round(filed, 4), difference: round(value - filed, 4), how: `${now.concept} ${label(period)} over ${label(prior)}, minus 1, x 100`, source: sourceOf(cik, now.latest.accn) };
  }
  const f = await lookup(session, cik, measure, period);
  if (!f) return { ...base, verdict: "not reported", ...(await notReported(session, cik, measure, period)) };
  const scale = FACTS[measure].unit === "USD/shares" ? 1 : scaleOf(unit);
  const claimed = value * scale, tol = tolerance * scale;
  const latest = f.latest.val, first = f.first.val;
  const shown = (v) => round(v / scale, 6);
  const derived = f.derived ? `derived: ${f.derived}` : null;
  if (Math.abs(latest - claimed) <= tol) {
    return { ...base, verdict: "confirmed", filed: shown(latest), ...(first !== latest ? { note: [`first reported as ${shown(first)} (${f.first.form} filed ${f.first.filed}); revised since`, derived].filter(Boolean).join("; ") } : derived ? { note: derived } : {}), concept: f.concept, period_end: f.latest.end, source: sourceOf(cik, f.latest.accn) };
  }
  if (Math.abs(first - claimed) <= tol) {
    return { ...base, verdict: "confirmed as first reported", filed: shown(latest), first_reported: shown(first), note: `matches the figure first reported in the ${f.first.form} filed ${f.first.filed}; a later filing revised it to ${shown(latest)}`, concept: f.concept, period_end: f.latest.end, source: sourceOf(cik, f.first.accn) };
  }
  const why = await explain(session, cik, measure, period, claimed, tol, f.concept);
  return { ...base, verdict: "contradicted", filed: shown(latest), difference: round(value - shown(latest), 6), ...(why ? { note: why } : {}), concept: f.concept, period_end: f.latest.end, source: sourceOf(cik, f.latest.accn) };
}

async function notReported(session, cik, measure, period) {
  const latest = await latestReported(session, cik, measure);
  if (!latest) return { note: `The company's filings carry no ${measure.replace(/_/g, " ")} under the GAAP concepts this tool reads; the premise may be wrong (a measure it does not report), or it reports it under its own name.` };
  return { note: `No ${measure.replace(/_/g, " ")} is reported for ${label(period)}: the latest annual figure is for fiscal ${latest.fy} (the year ending ${latest.end}). A claim about a later period is not a reported figure.` };
}

export const verifyInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name: the company the claims are about."),
  claims: z.array(z.object({
    measure: z.string().min(2).max(80).describe("What the figure is: revenue, net income, diluted EPS, operating income, gross profit, operating margin, net margin, free cash flow, total assets, cash, long-term debt, R&D, dividends per share..."),
    period: z.string().min(2).max(60).describe("The period as the company labels it: \"fiscal 2025\", \"FY2025\", \"Q3 2026\", \"third quarter of fiscal 2026\"."),
    value: z.number().describe("The claimed figure, as written: 416.2 with unit \"USD billion\"; margins and growth in percent."),
    unit: z.string().max(30).optional().describe("\"USD billion\", \"USD million\", \"USD\", \"USD per share\", \"%\"."),
    growth: z.boolean().optional().describe("The value is growth over the prior year, in percent."),
    basis: z.enum(["GAAP", "non-GAAP", "adjusted"]).optional().describe("Adjusted and non-GAAP figures are not in the XBRL statements and are not checked here."),
  }).strict()).min(1).max(25).optional().describe("Claims to check, each a measure, period and value."),
  text: z.string().min(10).max(6000).optional().describe("Or a draft answer about the company: every figure in it with a measure and a period is checked."),
}).strict();

export async function verifyClaims(session, args) {
  const a = verifyInput.parse(args);
  if (!a.claims && !a.text) throw new Error("Pass claims (measure, period, value) or the text of a draft answer.");
  const e = await resolveEntity(session, a.company);
  const claims = [];
  for (const c of a.claims ?? []) claims.push({ measure: claimMeasure(c.measure), period: claimPeriod(c.period), value: c.value, unit: c.unit ?? (/eps|per share/i.test(c.measure) ? "USD per share" : /margin|growth/i.test(c.measure) || c.growth ? "%" : null), basis: c.basis ?? (/adjusted|non-gaap/i.test(c.measure) ? "adjusted" : null), change: c.growth || /growth|grew|increase/i.test(c.measure) ? "growth" : null, quote: `${c.measure}, ${c.period}: ${c.value}${c.unit ? ` ${c.unit}` : ""}` });
  if (a.text) {
    // A sentence that names no period is about the last one named before it.
    let last = null;
    for (const s of sentences(unglue(a.text).replace(/\n+/g, " "))) {
      const named = periodOf(s);
      const period = named ? claimPeriod(named) : last;
      if (named && period) last = period;
      for (const r of resultsFromText(s)) {
        if (r.change === "change") continue;
        claims.push({ measure: r.measure, period, value: r.value, decimals: r.decimals, unit: r.unit, basis: r.basis === "GAAP" || r.basis === "GAAP and non-GAAP" ? null : r.basis, change: r.change === "growth" ? "growth" : null, quote: s.trim() });
      }
    }
    if (!claims.length) throw new Error("No figure with a measure in the text; pass claims (measure, period, value) instead.");
  }
  const rows = [];
  for (const c of claims.slice(0, 25)) rows.push(await check(session, e.cik, c));
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  return {
    company: { cik: e.cik, name: e.name ?? null, ticker: e.ticker ?? null },
    summary: { claims: rows.length, confirmed: count("confirmed") + count("confirmed as first reported"), contradicted: count("contradicted"), not_reported: count("not reported"), not_checkable: count("not checkable") },
    columns: ["claim", "measure", "period", "claimed", "unit", "verdict", "filed", "difference", "note", "source"],
    rows: rows.map((r) => [r.claim, r.measure, r.period, r.claimed, r.unit, r.verdict, r.filed ?? null, r.difference ?? null, r.note ?? r.how ?? null, r.source ?? null]),
    note: "Confirmed means the filed figure rounds to the claim at the claim's own precision (416.2 billion: within 0.05 billion). Fiscal years and quarters are as the company labels them in its 10-K and 10-Q.",
    limits: [
      "Checked against the GAAP figures companies tag in XBRL (SEC company-concept data); non-GAAP and adjusted figures, guidance and segment figures are not checked here.",
      "A claim's measure and period are read from its words; read each row's measure and period before relying on a verdict.",
    ],
  };
}
