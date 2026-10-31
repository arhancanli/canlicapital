// verify_claims: check the figures in a draft answer against the company's own filings before
// they reach a reader. Each claim (a measure, a period, a value) is looked up in the XBRL facts SEC
// publishes for the company: US GAAP concepts first, then IFRS (foreign companies filing 20-F, and
// those that moved from one to the other), in the currency the company reports in. A period is read
// as the company labels it: fiscal year N is the year its annual report for fiscal N (10-K, 20-F or
// 40-F) reports, a quarter the one its 10-Q (or a tagged 6-K) for that quarter reports; a year written
// plainly ("in 2025", "2025 revenue") is that fiscal year, and "three months ended June 28, 2025" is
// matched by its dates. The verdict carries the filed figure and its source; a number that does not
// match is checked against what it might be instead (another year, a quarter, another tagged line, a
// thousandfold slip, the figure before a restatement), because that is how wrong figures usually
// arise. A figure in a currency the company does not report in is a conversion, and is called one.
import { z } from "zod";

import { figuresIn, measureOf, periodOf, quarterOf, resultsFromText, sentences, unglue } from "./guidance.mjs";
import { notResults, plainClaimsIn, plainYear } from "./plainclaims.mjs";
import { getJson, NotFound, pad10, resolveEntity } from "./sources.mjs";

const SCALE = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };

// Measures checked against tagged facts: their US GAAP concepts, then their IFRS ones (the first with
// a fact for the period wins), whether they are balances at a date, and whether they are per share.
const FACTS = Object.freeze({
  revenue: { concepts: ["RevenueFromContractWithCustomerExcludingAssessedTax", "RevenuesNetOfInterestExpense", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax", "RevenuesNetOfInterestExpense"], ifrs: ["Revenue", "RevenueFromContractsWithCustomers"] },
  net_income: { concepts: ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"], ifrs: ["ProfitLossAttributableToOwnersOfParent", "ProfitLoss"] },
  eps: { concepts: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"], ifrs: ["DilutedEarningsLossPerShare"], perShare: true },
  eps_basic: { concepts: ["EarningsPerShareBasic", "EarningsPerShareBasicAndDiluted"], ifrs: ["BasicEarningsLossPerShare"], perShare: true },
  operating_income: { concepts: ["OperatingIncomeLoss"], ifrs: ["ProfitLossFromOperatingActivities"] },
  gross_profit: { concepts: ["GrossProfit"], ifrs: ["GrossProfit"] },
  pretax_income: { concepts: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"], ifrs: ["ProfitLossBeforeTax"] },
  operating_expenses: { concepts: ["OperatingExpenses", "CostsAndExpenses"], ifrs: [] },
  rnd: { concepts: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"], ifrs: ["ResearchAndDevelopmentExpense"] },
  operating_cash_flow: { concepts: ["NetCashProvidedByUsedInOperatingActivities"], ifrs: ["CashFlowsFromUsedInOperatingActivities"] },
  capex: { concepts: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], ifrs: ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"] },
  income_tax: { concepts: ["IncomeTaxExpenseBenefit"], ifrs: ["IncomeTaxExpenseContinuingOperations"] },
  dividends_per_share: { concepts: ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"], ifrs: ["DividendsRecognisedAsDistributionsToOwnersPerShare"], perShare: true },
  total_assets: { concepts: ["Assets"], ifrs: ["Assets"], instant: true },
  total_liabilities: { concepts: ["Liabilities"], ifrs: ["Liabilities"], instant: true },
  equity: { concepts: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], ifrs: ["EquityAttributableToOwnersOfParent", "Equity"], instant: true },
  cash: { concepts: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], ifrs: ["CashAndCashEquivalents"], instant: true },
  long_term_debt: { concepts: ["LongTermDebtNoncurrent", "LongTermDebt"], ifrs: ["LongtermBorrowings"], instant: true },
});
const conceptsOf = (spec) => [...spec.concepts.map((c) => `us-gaap:${c}`), ...spec.ifrs.map((c) => `ifrs-full:${c}`)];
// Ratios of two facts, in percent.
const RATIOS = Object.freeze({ gross_margin: ["gross_profit", "revenue"], operating_margin: ["operating_income", "revenue"], net_margin: ["net_income", "revenue"], pretax_margin: ["pretax_income", "revenue"] });
// Differences of two facts.
const DIFFERENCES = Object.freeze({ free_cash_flow: ["operating_cash_flow", "capex"] });

// A claim's measure from its words; "basic EPS" is told apart from diluted.
export function claimMeasure(text) {
  if (/\bbasic (?:eps|earnings per share)\b/i.test(String(text ?? ""))) return "eps_basic";
  return measureOf(text);
}

const MONTH = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
const MONTHS = { three: 3, six: 6, nine: 9, twelve: 12, 3: 3, 6: 6, 9: 9, 12: 12 };

// A claimed period as the company labels it: { fy, fp: "FY" | "Q1".."Q4" }, a span given by its
// dates ({ end, months }: "three months ended June 28, 2025") or { instant }.
export function claimPeriod(text) {
  const t = String(text ?? "").trim();
  const span = t.match(/\b(three|six|nine|twelve|3|6|9|12) months? end(?:ed|ing) (?:on )?(january|february|march|april|may|june|july|august|september|october|november|december) (\d{1,2}),? (\d{4})\b/i);
  if (span) return { end: `${span[4]}-${MONTH[span[2].toLowerCase()]}-${span[3].padStart(2, "0")}`, months: MONTHS[span[1].toLowerCase()] };
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const q = quarterOf(t);
  if (q && q.year) return { fy: q.year, fp: `Q${q.quarter}` };
  const fy = t.match(/\b(?:fiscal(?: year)?|fy)\s*['’]?(\d{4}|\d{2})\b/i) ?? t.match(/^(?:calendar(?: year)?\s*)?(\d{4})$/i) ?? t.match(/\b(?:in|for|during)\s+(\d{4})\b/i);
  if (fy) return { fy: fy[1].length === 2 ? 2000 + Number(fy[1]) : Number(fy[1]), fp: "FY" };
  if (iso) return { instant: iso[1] };
  const year = t.match(/\b(19|20)\d{2}\b/);
  return year ? { fy: Number(year[0]), fp: "FY" } : null;
}

// A claim's currency, from its unit: an ISO code or a symbol. Dollars other than the US's are
// written as codes before the figures are read (NT$ is TWD, not USD).
const CODES = /\b(USD|EUR|GBP|JPY|CHF|DKK|SEK|NOK|TWD|CNY|RMB|HKD|KRW|INR|CAD|AUD|NZD|SGD|BRL|MXN|ZAR|ILS)\b/;
const DOLLARS = { NT: "TWD", HK: "HKD", C: "CAD", CA: "CAD", A: "AUD", AU: "AUD", S: "SGD", NZ: "NZD" };
export function currencyOf(unit) {
  const u = String(unit ?? "");
  const code = u.match(new RegExp(CODES.source, "i"));
  if (code) return code[1].toUpperCase() === "RMB" ? "CNY" : code[1].toUpperCase();
  const sym = u.match(/US\$|[$€£¥]/);
  return sym ? { $: "USD", "US$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY" }[sym[0]] : null;
}

const decimalsOf = (v) => (String(v).split(".")[1] ?? "").length;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
const round = (x, d = 6) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

// A concept's facts by unit, cached per session. SEC's company-concept endpoint answers some
// companies with an empty units object ({"USD":{}}) for concepts their companyfacts file holds
// (Coca-Cola's Revenues and NetIncomeLoss, 2026-10-14), so an answer with no facts in it falls back
// to the company's full facts file.
async function conceptUnits(session, cik, name) {
  const [taxonomy, concept] = name.split(":");
  let units = null;
  try {
    const d = await getJson(session, `https://data.sec.gov/api/xbrl/companyconcept/CIK${pad10(cik)}/${taxonomy}/${concept}.json`, { maxBytes: 16 * 1024 * 1024 });
    units = d?.units && typeof d.units === "object" ? d.units : null;
  } catch (err) {
    if (!(err instanceof NotFound)) throw err;
  }
  // A concept the endpoint does not have (404) is not in the facts file either.
  if (!units) return {};
  if (Object.values(units).some((r) => Array.isArray(r) && r.length)) return units;
  try {
    const all = await getJson(session, `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(cik)}.json`, { maxBytes: 96 * 1024 * 1024 });
    return all?.facts?.[taxonomy]?.[concept]?.units ?? {};
  } catch (err) {
    if (err instanceof NotFound) return {};
    throw err;
  }
}

// The units to read a concept in, in order: the claim's currency when the company tags it, then the
// currency most of its facts use, the one it reports in (a convenience translation, like TSMC's US
// dollars beside its NT dollars, has fewer).
function unitsFor(units, perShare, want) {
  const ok = Object.keys(units).filter((u) => (perShare ? /^[A-Z]{3}\/shares$/ : /^[A-Z]{3}$/).test(u) && Array.isArray(units[u]) && units[u].length);
  if (!ok.length) return [];
  const main = ok.reduce((m, u) => (units[u].length > units[m].length ? u : m));
  const wanted = want ? ok.find((u) => u.slice(0, 3) === want) : null;
  return [...new Set([wanted, main].filter(Boolean))].map((u) => ({ rows: units[u], currency: u.slice(0, 3), main: main.slice(0, 3) }));
}

const ANNUAL = /^(?:10-K|20-F|40-F)/, INTERIM = /^(?:10-Q|6-K)/;
// How many days a span of months covers (a 52/53-week year included).
const SPANS = { 3: [80, 100], 6: [170, 190], 9: [260, 280], 12: [350, 380] };

// The fact for a period as the company labels it: from the report for that fiscal year and period,
// the fact covering it (a year, a quarter, or the balance at its end), with the latest value filed
// later for the same dates. A span given by its dates is matched by them instead.
function factFor(rows, period, instant) {
  if (period.end) return factEnding(rows, period, instant);
  const forms = period.fp === "FY" ? ANNUAL : INTERIM;
  const span = (r) => (r.start ? days(r.start, r.end) : null);
  const fits = (r) => (instant ? !r.start : period.fp === "FY" ? span(r) >= 350 && span(r) <= 380 : span(r) >= 80 && span(r) <= 100);
  const own = rows.filter((r) => r.fy === period.fy && r.fp === period.fp && forms.test(r.form ?? "") && fits(r));
  if (!own.length) return null;
  const end = own.reduce((m, r) => (r.end > m ? r.end : m), "");
  const first = own.filter((r) => r.end === end).sort((a, b) => a.filed.localeCompare(b.filed))[0];
  const same = rows.filter((r) => r.end === end && (r.start ?? null) === (first.start ?? null)).sort((a, b) => b.filed.localeCompare(a.filed));
  return { first, latest: same[0] ?? first };
}

// The fact ending on a span's last day and covering its months, from whichever report carries it;
// a span a year away (near) may end a few days off, as 52/53-week years do.
function factEnding(rows, period, instant) {
  const [lo, hi] = SPANS[period.months] ?? [0, 0];
  const off = (r) => Math.abs(days(r.end, period.end));
  const fits = (r) => off(r) <= (period.near ?? 0) && (instant ? !r.start : Boolean(r.start) && days(r.start, r.end) >= lo && days(r.start, r.end) <= hi);
  const all = rows.filter(fits);
  if (!all.length) return null;
  const end = all.reduce((m, r) => (off(r) < off(m) ? r : m)).end;
  const same = all.filter((r) => r.end === end).sort((a, b) => a.filed.localeCompare(b.filed));
  return { first: same[0], latest: same[same.length - 1] };
}

// A fourth quarter has no quarterly report: it is the annual report's year less the nine months the
// third-quarter report gives (a flow); a balance at its end is the year-end balance.
function fourthQuarter(rows, fy, instant) {
  const year = factFor(rows, { fy, fp: "FY" }, instant);
  if (!year || instant) return year && { ...year, derived: `the balance at the fiscal year end (${year.latest.form})` };
  const nine = rows.filter((r) => r.fy === fy && r.fp === "Q3" && INTERIM.test(r.form ?? "") && r.start === year.latest.start && days(r.start, r.end) >= 260 && days(r.start, r.end) <= 280).sort((a, b) => b.filed.localeCompare(a.filed))[0];
  if (!nine) return null;
  const val = year.latest.val - nine.val;
  const fact = { ...year.latest, start: nine.end, val, derived: true };
  return { first: { ...fact, val: year.first.val - nine.val }, latest: fact, derived: `the fiscal year (${year.latest.form}) less the first nine months (${nine.form} filed ${nine.filed})` };
}

// The fact for a measure and period: the first concept with one, in the claim's currency when the
// company tags it, else in the currency it reports in.
async function lookup(session, cik, measure, period, want) {
  const spec = FACTS[measure];
  for (const name of conceptsOf(spec)) {
    for (const unit of unitsFor(await conceptUnits(session, cik, name), spec.perShare, want)) {
      const f = period.fp === "Q4" ? fourthQuarter(unit.rows, period.fy, spec.instant) : factFor(unit.rows, period, spec.instant);
      if (f) return { ...f, concept: name, currency: unit.currency, main: unit.main };
    }
  }
  return null;
}

// The newest fiscal year a company has reported a measure for, to say so when a claim is about a
// period not reported (yet, or ever).
async function latestReported(session, cik, measure) {
  const spec = FACTS[FACTS[measure] ? measure : (RATIOS[measure] ?? DIFFERENCES[measure])[0]];
  for (const name of conceptsOf(spec)) {
    for (const unit of unitsFor(await conceptUnits(session, cik, name), spec.perShare, null)) {
      const annual = unit.rows.filter((r) => ANNUAL.test(r.form ?? "") && r.fp === "FY");
      if (annual.length) { const r = annual.reduce((m, x) => (x.end > m.end ? x : m)); return { fy: r.fy, end: r.end, concept: name }; }
    }
  }
  return null;
}

const sourceOf = (cik, accn) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}/${accn}-index.htm`;
const scaleWord = (unit) => String(unit ?? "").toLowerCase().match(/thousand|million|billion|trillion/)?.[0] ?? null;
const scaleOf = (unit) => (scaleWord(unit) ? SCALE[scaleWord(unit)] : 1);
const SPAN_WORDS = { 3: "three", 6: "six", 9: "nine", 12: "twelve" };
const label = (period) => (period.instant ? period.instant : period.end ? `the ${SPAN_WORDS[period.months]} months ended ${period.end}` : period.fp === "FY" ? `fiscal ${period.fy}` : `${period.fp} of fiscal ${period.fy}`);
// The same period some years away: the fiscal label, or the span ending about then.
function shifted(period, years) {
  if (!period.end) return { ...period, fy: period.fy + years };
  const d = new Date(`${period.end}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return { end: d.toISOString().slice(0, 10), months: period.months, near: 7 };
}
const LINES = { "ifrs-full:ProfitLoss": "profit including non-controlling interests", "us-gaap:ProfitLoss": "profit including non-controlling interests" };

// What a wrong figure does match: another year, a quarter of the year, another tagged line for the
// same period, a thousandfold slip.
async function explain(session, cik, measure, period, claimed, tolerance, used, currency) {
  const near = (v) => Math.abs(v - claimed) <= tolerance;
  const spec = FACTS[measure];
  if (!spec) return null;
  // The concept the lookup used first, then the others (a company that changed concepts reports
  // the other years under another one), all in the currency the lookup used.
  const order = [used, ...conceptsOf(spec).filter((c) => c !== used)].filter(Boolean);
  for (const name of order) {
    const unit = unitsFor(await conceptUnits(session, cik, name), spec.perShare, currency).find((u) => u.currency === currency);
    if (!unit) continue;
    const rows = unit.rows;
    if (name !== used) {
      const f = factFor(rows, period, spec.instant);
      if (f && (near(f.latest.val) || near(f.first.val))) return `matches ${name}${LINES[name] ? ` (${LINES[name]})` : ""} for ${label(period)} instead, a different line from ${used}`;
    }
    for (const k of [-1, 1, -2]) {
      const other = shifted(period, k);
      const f = factFor(rows, other, spec.instant);
      if (f && (near(f.latest.val) || near(f.first.val))) return `matches ${other.end ? label({ end: f.latest.end, months: other.months }) : label(other)} instead`;
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
  const { measure, value, unit } = claim;
  const read = claim.period || !claim.assume ? { period: claim.period ?? null } : await assumedPeriod(session, cik, measure, claim.assume);
  const period = read.period;
  const row = await checkRead(session, cik, { ...claim, period });
  // "Last year" can be either fiscal label: Nvidia's fiscal 2026 is nearly all of calendar 2025.
  if (claim.assume === "last year" && period && row.verdict === "contradicted") {
    const later = { fy: period.fy + 1, fp: "FY" };
    const other = await checkRead(session, cik, { ...claim, period: later });
    if (other.verdict === "confirmed") return { ...other, note: [`"Last year" read as fiscal ${later.fy}.`, other.note].filter(Boolean).join(" ") };
  }
  return read.note ? { ...row, note: [read.note, row.note].filter(Boolean).join(" ") } : row;
}

// The period a sentence means when it names none: "last year" is the last calendar year's fiscal
// label, "last quarter" the latest quarter reported, and no period at all the latest annual report.
async function assumedPeriod(session, cik, measure, assume) {
  const key = FACTS[measure] ? measure : (RATIOS[measure] ?? DIFFERENCES[measure])?.[0];
  if (!key) return { period: null };
  if (assume === "last year") { const fy = new Date(session.now()).getUTCFullYear() - 1; return { period: { fy, fp: "FY" }, note: `"Last year" read as fiscal ${fy}.` }; }
  if (assume === "last quarter") {
    const q = await latestQuarter(session, cik, key);
    return q ? { period: q, note: `"Last quarter" read as ${label(q)}, the latest reported.` } : { period: null };
  }
  const latest = await latestReported(session, cik, key);
  return latest ? { period: { fy: latest.fy, fp: "FY" }, note: `No year named: read against the latest annual report, fiscal ${latest.fy}.` } : { period: null };
}

// The latest quarter a company has reported a measure for; a year-end newer than any 10-Q is its Q4.
async function latestQuarter(session, cik, measure) {
  const spec = FACTS[measure];
  for (const name of conceptsOf(spec)) {
    for (const unit of unitsFor(await conceptUnits(session, cik, name), spec.perShare, null)) {
      const quarters = unit.rows.filter((r) => INTERIM.test(r.form ?? "") && /^Q[1-3]$/.test(r.fp ?? "") && (spec.instant ? !r.start : r.start && days(r.start, r.end) >= 80 && days(r.start, r.end) <= 100));
      const years = unit.rows.filter((r) => ANNUAL.test(r.form ?? "") && r.fp === "FY");
      if (!quarters.length && !years.length) continue;
      const q = quarters.length ? quarters.reduce((m, x) => (x.end > m.end ? x : m)) : null;
      const y = years.length ? years.reduce((m, x) => (x.end > m.end ? x : m)) : null;
      return y && (!q || y.end > q.end) ? { fy: y.fy, fp: "Q4" } : { fy: q.fy, fp: q.fp };
    }
  }
  return null;
}

// A claimed figure against a filed one: within its rounding, or as hedged ("about", "over", "under").
function agrees(filed, claimed, tol, bound) {
  if (bound === "over") return filed >= claimed - tol;
  if (bound === "under") return filed <= claimed + tol;
  if (bound === "about") return Math.abs(filed - claimed) <= Math.max(tol, Math.abs(filed) * 0.05);
  return Math.abs(filed - claimed) <= tol;
}
const HEDGED = { about: "Read as about the figure, within 5%.", over: "Read as more than the figure.", under: "Read as less than the figure." };
// How far a figure that does not match is from the filed one, when it is a near miss.
const closeNote = (filed, claimed) => { const off = Math.abs((claimed - filed) / filed) * 100; return filed && off <= 5 ? `Close: ${off < 1 ? "under 1" : Math.round(off)}% from the filed figure.` : null; };
const OTHER_PROFITS = { operating_income: "operating income", gross_profit: "gross profit", pretax_income: "profit before tax" };

async function checkRead(session, cik, claim) {
  const { measure, period, value, unit } = claim;
  const base = { claim: claim.quote ?? `${measure} ${label(period ?? { fy: "?", fp: "FY" })} ${value}${unit ? ` ${unit}` : ""}`, measure, period: period ? label(period) : null, claimed: value, unit: unit ?? null };
  if (claim.part) return { ...base, verdict: "not checkable", note: `This reads as ${claim.part}, one part of the business. Figures for parts are not in the statements checked here; segment_revenue reads them.` };
  if (claim.basis && claim.basis !== "GAAP") return { ...base, verdict: "not checkable", note: `${claim.basis} figures are the company's own measures, not in its XBRL statements; earnings_release reads them from the release.` };
  if (!measure || !(FACTS[measure] || RATIOS[measure] || DIFFERENCES[measure])) return { ...base, verdict: "not checkable", note: `${measure ?? "this measure"} is not one this tool checks: ${[...Object.keys(FACTS), ...Object.keys(RATIOS), ...Object.keys(DIFFERENCES)].join(", ")}.` };
  if (!period) return { ...base, verdict: "not checkable", note: "No period named: give a fiscal year (\"fiscal 2025\" or \"2025\"), a quarter (\"Q3 2026\"), or a span with its end date (\"three months ended June 28, 2025\")." };
  if (period.instant) return { ...base, verdict: "not checkable", note: "Give the fiscal year whose end the balance is at (\"fiscal 2025\"); a bare date is not matched to a filing." };
  const tolerance = 0.5 * 10 ** -(claim.decimals ?? decimalsOf(value));
  const want = currencyOf(unit);
  // Ratios in percent, differences in the claim's scale.
  if (RATIOS[measure] || DIFFERENCES[measure]) {
    const [a, b] = RATIOS[measure] ?? DIFFERENCES[measure];
    const [fa, fb] = await Promise.all([lookup(session, cik, a, period, want), lookup(session, cik, b, period, want)]);
    if (!fa || !fb) return { ...base, verdict: "not reported", ...(await notReported(session, cik, measure, period)) };
    if (DIFFERENCES[measure] && want && fa.currency !== want) return { ...base, verdict: "not checkable", note: `the company reports in ${fa.currency}; a ${want} figure is a conversion at an exchange rate the claim does not give` };
    const filed = RATIOS[measure] ? (fa.latest.val / fb.latest.val) * 100 : (fa.latest.val - fb.latest.val) / scaleOf(unit);
    const ok = agrees(filed, value, tolerance + 1e-9, claim.bound);
    return { ...base, verdict: ok ? "confirmed" : "contradicted", filed: round(filed, 4), difference: round(value - filed, 4), ...(claim.bound ? { note: HEDGED[claim.bound] } : {}), how: RATIOS[measure] ? `${fa.concept} / ${fb.concept} x 100` : `${fa.concept} - ${fb.concept}`, source: sourceOf(cik, fa.latest.accn) };
  }
  // Growth over the prior year, in whatever currency both years are in.
  if (claim.change === "growth") {
    const prior = shifted(period, -1);
    const [now, then] = await Promise.all([lookup(session, cik, measure, period, null), lookup(session, cik, measure, prior, null)]);
    if (!now || !then) return { ...base, verdict: "not reported", ...(await notReported(session, cik, measure, now ? prior : period)) };
    const filed = (now.latest.val / then.latest.val - 1) * 100;
    const ok = agrees(filed, value, tolerance + 1e-9, claim.bound);
    return { ...base, verdict: ok ? "confirmed" : "contradicted", filed: round(filed, 4), difference: round(value - filed, 4), ...(claim.bound ? { note: HEDGED[claim.bound] } : {}), how: `${now.concept} ${label(period)} over ${label(then.latest.end && prior.end ? { end: then.latest.end, months: prior.months } : prior)}, minus 1, x 100`, source: sourceOf(cik, now.latest.accn) };
  }
  const f = await lookup(session, cik, measure, period, want);
  if (!f) return { ...base, verdict: "not reported", ...(await notReported(session, cik, measure, period)) };
  if (FACTS[measure].perShare && !unit) base.unit = `${f.currency} per share`;
  const scale = FACTS[measure].perShare ? 1 : scaleOf(unit);
  const claimed = value * scale, tol = tolerance * scale;
  const latest = f.latest.val, first = f.first.val;
  const shown = (v) => round(v / scale, 6);
  const where = { concept: f.concept, period_end: f.latest.end };
  // A figure in a currency the company does not tag is a conversion: only the filed number under
  // the wrong currency is judged.
  if (want && f.currency !== want) {
    if (Math.abs(latest - claimed) <= tol || Math.abs(first - claimed) <= tol) return { ...base, verdict: "contradicted", filed: shown(latest), note: `the number is the filed figure in ${f.currency}, not ${want}: the currency is wrong`, ...where, source: sourceOf(cik, f.latest.accn) };
    return { ...base, verdict: "not checkable", filed: shown(latest), note: `the company reports in ${f.currency} (${f.currency} ${shown(latest)}${scaleWord(unit) ? ` ${scaleWord(unit)}` : ""} filed); a ${want} figure is a conversion at an exchange rate the claim does not give`, ...where, source: sourceOf(cik, f.latest.accn) };
  }
  const currency = f.currency !== f.main ? `the ${f.currency} figure the filing gives beside its ${f.main} one (a convenience translation)` : !want && f.currency !== "USD" ? `in ${f.currency}, the currency the company reports in` : null;
  const derived = f.derived ? `derived: ${f.derived}` : null;
  if (agrees(latest, claimed, tol, claim.bound)) {
    const notes = [claim.bound ? HEDGED[claim.bound] : null, first !== latest ? `first reported as ${shown(first)} (${f.first.form} filed ${f.first.filed}); revised since` : null, derived, currency].filter(Boolean);
    return { ...base, verdict: "confirmed", filed: shown(latest), ...(notes.length ? { note: notes.join("; ") } : {}), ...where, source: sourceOf(cik, f.latest.accn) };
  }
  if (Math.abs(first - claimed) <= tol) {
    return { ...base, verdict: "confirmed as first reported", filed: shown(latest), first_reported: shown(first), note: [`matches the figure first reported in the ${f.first.form} filed ${f.first.filed}; a later filing revised it to ${shown(latest)}`, currency].filter(Boolean).join("; "), ...where, source: sourceOf(cik, f.first.accn) };
  }
  // "Profit" can mean several lines: a figure matching another of them is that line, not a wrong figure.
  if (claim.loose === "profit") {
    for (const [other, words] of Object.entries(OTHER_PROFITS)) {
      const o = await lookup(session, cik, other, period, want);
      if (o && o.currency === f.currency && agrees(o.latest.val, claimed, tol, claim.bound)) return { ...base, measure: other, verdict: "confirmed", filed: shown(o.latest.val), note: `That is ${words}. Net income, what "profit" usually means, was ${shown(latest)}.`, concept: o.concept, period_end: o.latest.end, source: sourceOf(cik, o.latest.accn) };
    }
  }
  // Cash and debt each sit on several lines, so a figure off this one is not shown to be wrong.
  if (claim.loose === "cash" || claim.loose === "debt") {
    const words = claim.loose === "cash" ? "cash and cash equivalents alone; marketable securities are separate" : "long-term debt alone; debt due within a year is separate";
    return { ...base, verdict: "not checkable", filed: shown(latest), note: `The filing gives ${shown(latest)} for ${words}, so this figure may count more than that line.`, ...where, source: sourceOf(cik, f.latest.accn) };
  }
  const matched = await explain(session, cik, measure, period, claimed, tol, f.concept, f.currency);
  const notes = [matched, claim.bound ? HEDGED[claim.bound] : matched ? null : closeNote(latest, claimed), currency].filter(Boolean);
  return { ...base, verdict: "contradicted", filed: shown(latest), difference: round(value - shown(latest), 6), ...(notes.length ? { note: notes.join("; ") } : {}), ...where, source: sourceOf(cik, f.latest.accn) };
}

async function notReported(session, cik, measure, period) {
  const latest = await latestReported(session, cik, measure);
  if (!latest) return { note: `The company's filings carry no ${measure.replace(/_/g, " ")} under the US GAAP or IFRS concepts this tool reads; the premise may be wrong (a measure it does not report), or it reports it under its own name.` };
  return { note: `No ${measure.replace(/_/g, " ")} is reported for ${label(period)}: the latest annual figure is for fiscal ${latest.fy} (the year ending ${latest.end}). A claim about a later period is not a reported figure.` };
}

export const verifyInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL, NVO, TSM), CIK (320193) or name: the company the claims are about. Foreign companies filing 20-F or 40-F are checked too, in the currency they report in."),
  claims: z.array(z.object({
    measure: z.string().min(2).max(80).describe("What the figure is: revenue, net income, diluted EPS, operating income, gross profit, operating margin, net margin, free cash flow, total assets, cash, long-term debt, R&D, dividends per share..."),
    period: z.string().min(2).max(60).describe("The period as the company labels it: \"fiscal 2025\", \"FY2025\", \"2025\", \"Q3 2026\", \"third quarter of fiscal 2026\", or a span by its end date: \"three months ended June 28, 2025\"."),
    value: z.number().describe("The claimed figure, as written: 416.2 with unit \"USD billion\"; margins and growth in percent."),
    unit: z.string().max(30).optional().describe("\"USD billion\", \"EUR million\", \"DKK billion\", \"USD per share\", \"%\". A currency the company does not report in is a conversion and is not judged."),
    growth: z.boolean().optional().describe("The value is growth over the prior year, in percent."),
    basis: z.enum(["GAAP", "non-GAAP", "adjusted"]).optional().describe("Adjusted and non-GAAP figures are not in the XBRL statements and are not checked here."),
  }).strict()).min(1).max(25).optional().describe("Claims to check, each a measure, period and value."),
  text: z.string().min(10).max(6000).optional().describe("Or a draft answer about the company: every figure in it with a measure and a period is checked."),
}).strict();

// The rounding rule shown on this result's own first figure: 331.8 billion is confirmed by a filed
// figure within 0.05 billion of it.
function precisionExample(rows, claims) {
  const i = rows.findIndex((x) => typeof x.claimed === "number" && Number.isFinite(x.claimed));
  if (i < 0) return "";
  const r = rows[i], d = claims[i]?.decimals ?? decimalsOf(r.claimed);
  const unit = String(r.unit ?? "").replace(/^(?:[A-Z]{3}|[€£¥$])\s*/, "").trim();
  const tail = unit === "%" ? { claim: "%", half: " points" } : unit ? { claim: ` ${unit}`, half: ` ${unit}` } : { claim: "", half: "" };
  return ` (${r.claimed.toFixed(d)}${tail.claim}: within ${Number((0.5 / 10 ** d).toFixed(d + 1))}${tail.half})`;
}

// What a release's reading calls a part of the business, unless it is only the company or the period:
// "Apple's 2025 revenue" and "FY'25 net income" are the whole company's, "Cloud revenue" is not.
function partOf(section, name) {
  const own = String(name ?? "").toLowerCase().split(/[^a-z0-9&-]+/);
  const left = String(section ?? "").split(/\s+/).filter((w) => {
    const word = w.toLowerCase().replace(/['’]s$/, "").replace(/[^a-z0-9&'’-]/g, "");
    return word && !own.includes(word) && !/^(?:fy['’]?\d{2,4}|q[1-4]|(?:19|20)\d{2}|fiscal|year|quarter|its|their|the|our|annual|total|full-year)$/.test(word);
  });
  return left.length ? left.join(" ") : undefined;
}

// A draft's figures as claims, each sentence read two ways: as a release words its results, and as
// people say them. A figure both read is one claim, with what the plain reading adds. `unread` counts
// the figures in the text that neither reading could name.
export function claimsFromText(raw, name = null) {
  const claims = [];
  let last = null, unread = 0;
  const text = unglue(raw).replace(/\n+/g, " ").replace(/\b(NT|HK|CA|C|AU|A|NZ|S)\$\s?/g, (m, p) => `${DOLLARS[p]} `);
  for (const s of sentences(text)) {
    // A sentence that names no period is about the last one named before it.
    const named = periodOf(s);
    let period = named ? claimPeriod(named) : null;
    if (!period) { const plain = plainYear(s); period = plain ? claimPeriod(plain) : null; }
    if (period) last = period; else period = last;
    // A currency written as a code ("DKK 309.1 billion") is the sentence's when it names only one.
    const codes = [...new Set([...s.matchAll(new RegExp(CODES.source, "g"))].map((m) => m[1]))];
    const coded = (u) => (codes.length === 1 && !currencyOf(u) && !/%|bps|points/.test(u ?? "") ? `${codes[0]}${u ? ` ${u}` : ""}` : u);
    const plain = plainClaimsIn(s, { name, parts: true });
    const elsewhere = notResults(s);
    const here = [];
    for (const r of resultsFromText(s)) {
      if (r.change === "change" || elsewhere.includes(Math.abs(r.value))) continue;
      here.push({ measure: r.measure, period, value: r.value, decimals: r.decimals, unit: coded(r.unit), basis: r.basis === "GAAP" || r.basis === "GAAP and non-GAAP" ? null : r.basis, change: r.change === "growth" ? "growth" : null, part: partOf(r.section, name), quote: s.trim() });
    }
    for (const p of plain) {
      const same = here.find((c) => Math.abs(c.value) === Math.abs(p.value));
      if (same) {
        Object.assign(same, { measure: p.part || !p.loose ? same.measure : p.measure, value: p.value }, p.bound ? { bound: p.bound } : {}, p.loose ? { loose: p.loose } : {}, p.when ? { assume: p.when } : {}, p.part ? { part: p.part } : {});
      } else here.push({ measure: p.measure, period, value: p.value, decimals: p.decimals, unit: coded(p.unit), basis: p.basis ?? null, change: p.change ?? null, bound: p.bound, loose: p.loose, part: p.part, assume: p.when, quote: s.trim() });
    }
    // A relative period is this sentence's own; none at all falls to the latest annual report.
    for (const c of here) {
      if (c.assume && !named && !plainYear(s)) c.period = null;
      else if (!c.assume && !c.period) c.assume = "latest";
      if (c.period) delete c.assume;
    }
    // A figure a sentence holds with no name on it, leaving out those compared against.
    const figures = figuresIn(s).filter((f) => !/\b(?:compared (?:to|with)|versus|vs\.?|from|against)\s*(?:about |around |roughly )?$/i.test(s.slice(Math.max(0, f.at - 30), f.at)));
    unread += Math.max(0, figures.length - here.length);
    claims.push(...here);
  }
  return { claims, unread };
}

export async function verifyClaims(session, args) {
  const a = verifyInput.parse(args);
  if (!a.claims && !a.text) throw new Error("Pass claims (measure, period, value) or the text of a draft answer.");
  const e = await resolveEntity(session, a.company);
  const claims = [];
  for (const c of a.claims ?? []) claims.push({ measure: claimMeasure(c.measure), period: claimPeriod(c.period), value: c.value, unit: c.unit ?? (/margin|growth/i.test(c.measure) || c.growth ? "%" : null), basis: c.basis ?? (/adjusted|non-gaap/i.test(c.measure) ? "adjusted" : null), change: c.growth || /growth|grew|increase/i.test(c.measure) ? "growth" : null, quote: `${c.measure}, ${c.period}: ${c.value}${c.unit ? ` ${c.unit}` : ""}` });
  let unread = 0;
  if (a.text) {
    const read = claimsFromText(a.text, e.name);
    claims.push(...read.claims);
    unread = read.unread;
    if (!claims.length) throw new Error("No figure with a measure in the text; pass claims (measure, period, value) instead.");
  }
  const rows = [];
  for (const c of claims.slice(0, 25)) rows.push(await check(session, e.cik, c));
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  return {
    company: { cik: e.cik, name: e.name ?? null, ticker: e.ticker ?? null },
    summary: { claims: rows.length, confirmed: count("confirmed") + count("confirmed as first reported"), contradicted: count("contradicted"), not_reported: count("not reported"), not_checkable: count("not checkable"), ...(unread ? { figures_not_read: unread } : {}) },
    columns: ["claim", "measure", "period", "claimed", "unit", "verdict", "filed", "difference", "note", "source"],
    rows: rows.map((r) => [r.claim, r.measure, r.period, r.claimed, r.unit, r.verdict, r.filed ?? null, r.difference ?? null, r.note ?? r.how ?? null, r.source ?? null]),
    note: `Confirmed means the filed figure rounds to the claim at the claim's own precision${precisionExample(rows, claims)}. Fiscal years and quarters are as the company labels them in its annual and quarterly reports; a year written plainly ("in 2025") is that fiscal year. Filed figures are in the currency the claim names, or else the one the company reports in (each row's note says when that is not US dollars).`,
    limits: [
      "Checked against the US GAAP and IFRS figures companies tag in their SEC filings (10-K, 10-Q, 20-F, 40-F, and 6-K reports that carry tags); non-GAAP and adjusted figures, guidance and segment figures are not checked here.",
      "A figure converted to another currency is not judged: the company's own figure is shown beside it.",
      "A claim's measure and period are read from its words; read each row's measure and period before relying on a verdict.",
    ],
  };
}
