// mcp-books/src/report.mjs
//
// Canli Report: a book's statements as XBRL facts, and checks that catch before filing the errors found in
// filed reports: totals that do not add up, signs the wrong way round, a value about a thousand times its
// prior value (a scale slip), the same fact given two values. Concepts are mapped for the starting chart of
// accounts in chart.mjs; an account with no concept is listed as unmapped, never guessed. A draft for review:
// check each concept against the taxonomy year you file under before filing.
import { balanceSheet, fromMinor, incomeStatement, isDate, state } from "./ledger.mjs";

// [concept, negate]: accumulated depreciation is a credit balance reported as a positive amount in US GAAP.
const MAPS = {
  "us-gaap": {
    accounts: {
      1000: "CashAndCashEquivalentsAtCarryingValue",
      1100: "AccountsReceivableNetCurrent",
      1150: "OtherAssetsCurrent",
      1200: "InventoryNet",
      1500: "PropertyPlantAndEquipmentGross",
      1590: ["AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment", true],
      2000: "AccountsPayableCurrent",
      2100: "SalesAndExciseTaxPayableCurrent",
      2200: "AccruedLiabilitiesCurrent",
      2300: "AccruedIncomeTaxesCurrent",
      2500: "LongTermDebt",
      3000: "CommonStockValue",
      3100: "RetainedEarningsAccumulatedDeficit",
      4000: "Revenues",
      4100: "OtherNonoperatingIncomeExpense",
      5000: "CostOfRevenue",
      6000: "LaborAndRelatedExpense",
      6100: "OperatingLeaseCost",
      6200: "OtherCostAndExpenseOperating",
      6300: "OtherCostAndExpenseOperating",
      6400: "Depreciation",
      6500: "OtherCostAndExpenseOperating",
      6900: "IncomeTaxExpenseBenefit",
    },
    totals: { assets: "Assets", liabilities: "Liabilities", equity: "StockholdersEquity", both: "LiabilitiesAndStockholdersEquity", retained: "RetainedEarningsAccumulatedDeficit", net: "NetIncomeLoss" },
    // In a filing, liabilities and equity add up with the minority interests in equity and any temporary
    // (mezzanine) equity between them: each total if it is tagged, otherwise its parts.
    equityWithMinority: "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    minority: "MinorityInterest",
    temporary: ["TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests", ["TemporaryEquityCarryingAmountAttributableToParent", "RedeemableNoncontrollingInterestEquityCarryingAmount"]],
    // Not Revenues: a commodity pool's, an investment firm's or a bank's can be below zero in the filing itself,
    // net of trading or investment losses.
    nonNegative: ["Assets", "Liabilities", "CashAndCashEquivalentsAtCarryingValue"],
  },
  "ifrs-full": {
    accounts: {
      1000: "CashAndCashEquivalents",
      1100: "TradeAndOtherCurrentReceivables",
      1150: "TradeAndOtherCurrentReceivables",
      1200: "Inventories",
      1500: "PropertyPlantAndEquipment",
      1590: "PropertyPlantAndEquipment",
      2000: "TradeAndOtherCurrentPayables",
      2100: "TradeAndOtherCurrentPayables",
      2200: "TradeAndOtherCurrentPayables",
      2300: "CurrentTaxLiabilities",
      2500: "Borrowings",
      3000: "IssuedCapital",
      3100: "RetainedEarnings",
      4000: "Revenue",
      4100: "OtherIncome",
      5000: "CostOfSales",
      6000: "EmployeeBenefitsExpense",
      6100: "OtherExpenseByNature",
      6200: "OtherExpenseByNature",
      6300: "OtherExpenseByNature",
      6400: "DepreciationExpense",
      6500: "OtherExpenseByNature",
      6900: "IncomeTaxExpenseContinuingOperations",
    },
    totals: { assets: "Assets", liabilities: "Liabilities", equity: "Equity", both: "EquityAndLiabilities", retained: "RetainedEarnings", net: "ProfitLoss" },
    nonNegative: ["Assets", "Liabilities", "Revenue", "CashAndCashEquivalents"],
  },
};
export const TAXONOMIES = Object.keys(MAPS);

const mapFor = (taxonomy) => {
  const map = MAPS[taxonomy];
  if (!map) throw new Error(`taxonomy must be one of ${TAXONOMIES.join(", ")}`);
  return map;
};

// Balance-sheet facts at asOf and income-statement facts for [from, to], in the currency's smallest unit.
// Earnings not yet closed into equity count in retained earnings, as on a filed balance sheet.
export function toFacts(book, { asOf, from, to, taxonomy = "us-gaap" } = {}) {
  const map = mapFor(taxonomy);
  for (const [name, d] of Object.entries({ asOf, from, to })) if (!isDate(d)) throw new Error(`${name} must be a real date in the form 2026-01-31`);
  const s = state(book);
  const bs = balanceSheet(book, { asOf });
  const is = incomeStatement(book, { from, to });
  const instant = { instant: asOf };
  const duration = { start: from, end: to };
  const facts = new Map();
  const unmapped = [];
  const add = (concept, value, period) => {
    const key = `${concept}|${JSON.stringify(period)}`;
    facts.set(key, { concept, period, value: (facts.get(key)?.value ?? 0) + value });
  };
  for (const [rows, period] of [[[...bs.assets, ...bs.liabilities, ...bs.equity], instant], [[...is.income, ...is.expenses], duration]]) {
    for (const row of rows) {
      const target = map.accounts[row.code];
      if (!target) {
        unmapped.push(row.code);
        continue;
      }
      const [concept, negate] = Array.isArray(target) ? target : [target, false];
      add(concept, negate ? -row.amount : row.amount, period);
    }
  }
  const t = map.totals;
  add(t.retained, bs.earningsToDate, instant);
  add(t.assets, bs.totalAssets, instant);
  add(t.liabilities, bs.totalLiabilities, instant);
  add(t.equity, bs.totalEquity + bs.earningsToDate, instant);
  add(t.both, bs.totalLiabilitiesAndEquity, instant);
  add(t.net, is.netIncome, duration);
  return { taxonomy, currency: s.currency, facts: [...facts.values()].map((f) => ({ ...f, unit: s.currency, text: fromMinor(f.value, s.currency) })), unmapped };
}

const isInstant = (period) => period?.instant !== undefined;
const endOf = (period) => (isInstant(period) ? period.instant : period?.end ?? "");
const where = (period) => (!period ? "" : isInstant(period) ? ` at ${period.instant}` : ` for ${period.start} to ${period.end}`);

// Checks on facts from any source, this book or a filing read elsewhere: each finding names its rule, the
// concept and the numbers. The totals are checked period by period and unit by unit, since a filing also carries
// last year's figures. prior: the last period's or the last filing's facts, for the scale check. untagged: a
// filing may tag temporary equity in a concept of its own, or only by class or series, which leaves liabilities
// and equity short of their total by that amount, so the parts are then flagged only when they come to more than
// the total or when the temporary equity is tagged, and a shortfall is said to be what such tags would leave.
// rounded: the figures are rounded as filed, so a total may miss the sum of its parts by their rounding.
export function checkFacts(facts, { prior = [], taxonomy = "us-gaap", tolerance = 0, untagged = false, rounded = false } = {}) {
  const map = mapFor(taxonomy);
  const t = map.totals;
  const findings = [];
  const groups = new Map();
  for (const f of facts) {
    const key = `${f.concept}|${JSON.stringify(f.period)}|${f.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  for (const list of groups.values()) {
    if (new Set(list.map((f) => f.value)).size > 1) findings.push({ rule: "duplicate", concept: list[0].concept, unit: list[0].unit, period: list[0].period, value: null, detail: `the same fact is given ${list.length} values${where(list[0].period)}: ${list.map((f) => f.value).join(", ")}` });
  }
  // The first value of each concept at each date and unit.
  const instants = new Map();
  for (const f of facts) {
    if (!isInstant(f.period)) continue;
    const key = `${f.period.instant}|${f.unit}`;
    if (!instants.has(key)) instants.set(key, new Map());
    if (!instants.get(key).has(f.concept)) instants.get(key).set(f.concept, f.value);
  }
  // A filed figure is rounded, to thousands say, by up to half its unit, so a total may miss the sum of its parts by
  // half a unit for each figure. The unit is read from the figures: for each, the largest power of ten, up to a
  // billion, that divides it (a figure filed in thousands ends in 000), and the smallest of these in the sum, since a
  // figure in thousands can end in 000000 by chance.
  const unitOf = (x) => {
    let u = 1;
    while (u < 1e9 && x % (u * 10) === 0) u *= 10;
    return u;
  };
  const slack = (terms) => (rounded ? Math.max(tolerance, (terms.length * Math.min(...terms.map(unitOf))) / 2) : tolerance);
  for (const [key, v] of instants) {
    const [instant, unit] = key.split("|");
    const at = ` at ${instant}`;
    const [A, L, LE] = [v.get(t.assets), v.get(t.liabilities), v.get(t.both)];
    const withMinority = map.equityWithMinority && v.has(map.equityWithMinority);
    const equityConcept = withMinority ? map.equityWithMinority : t.equity;
    const E = v.get(equityConcept);
    const minority = !withMinority && map.minority && v.has(map.minority) ? v.get(map.minority) : undefined;
    const [whole, parts = []] = map.temporary ?? [];
    const tagged = v.has(whole) || parts.some((c) => v.has(c));
    // One amount can be tagged as two of the parts (redeemable minority interests as both): it counts once.
    const temporaries = v.has(whole) ? [v.get(whole)] : [...new Set(parts.filter((c) => v.has(c)).map((c) => v.get(c)))];
    const temporary = temporaries.reduce((s, x) => s + x, 0);
    if (A !== undefined && LE !== undefined && Math.abs(A - LE) > slack([A, LE])) findings.push({ rule: "balance", concept: t.assets, unit, period: { instant }, value: A, detail: `${t.assets} ${A} is not ${t.both} ${LE}${at}` });
    if (L === undefined || E === undefined || LE === undefined) continue;
    const terms = [L, ...temporaries, E, ...(minority === undefined ? [] : [minority])];
    const gap = terms.reduce((s, x) => s + x, 0) - LE;
    if (Math.abs(gap) > slack([...terms, LE]) && (!untagged || tagged || gap > 0)) {
      const short = untagged && gap < 0 ? `: short by ${-gap}, as when temporary equity is tagged only by class or series` : "";
      findings.push({ rule: "balance", concept: t.both, unit, period: { instant }, value: LE, detail: `${t.liabilities} ${L}${temporary ? ` plus temporary equity ${temporary}` : ""} plus ${equityConcept} ${E}${minority === undefined ? "" : ` plus ${map.minority} ${minority}`} is not ${t.both} ${LE}${at}${short}` });
    }
  }
  for (const f of facts) if (map.nonNegative.includes(f.concept) && f.value < 0) findings.push({ rule: "sign", concept: f.concept, unit: f.unit, period: f.period, value: f.value, detail: `${f.concept} is negative: ${f.value}${where(f.period)}` });
  // Against the prior value of the same concept, unit and period, or else the latest of the same kind of period that
  // ends no later than this one (for a flow, one about as long). A scale slip multiplies a value by a thousand or a
  // million, so only a ratio within 10% of 1,000 or 1,000,000 is flagged for a balance and within 5% for a flow;
  // real changes rarely land there (holdings grown from 6 million to 4.5 billion are 753 times). On every filing of
  // five companies (Apple, Microsoft, JPMorgan, Simon Property, TSMC) this keeps slips such as shares authorized
  // filed in thousands and drops the coincidences.
  const slip = (ratio, instant) => [1e3, 1e6].find((k) => Math.abs(ratio / k - 1) <= (instant ? 0.1 : 0.05));
  const days = (period) => (Date.parse(period.end) - Date.parse(period.start)) / 864e5;
  const alike = (q, f) => isInstant(f.period) || Math.abs(days(q.period) / days(f.period) - 1) <= 0.2;
  const earlier = new Map();
  for (const q of prior) {
    const key = `${q.concept}|${q.unit}|${isInstant(q.period)}`;
    earlier.set(key, [...(earlier.get(key) ?? []), q]);
  }
  for (const f of facts) {
    // Not tax rates and other percentages: an effective tax rate can be a thousand times last year's when pre-tax
    // income is near zero. Exchange rates are checked, since a currency rarely moves a thousandfold between filings
    // and a rate tagged with the wrong scale (7,100 yuan to the dollar) is a slip; so are counts, since a count filed
    // in thousands is a slip.
    if (f.unit === "pure" && /Rate|Percent/.test(f.concept) && !/ExchangeRate/.test(f.concept)) continue;
    const candidates = (earlier.get(`${f.concept}|${f.unit}|${isInstant(f.period)}`) ?? []).filter((q) => endOf(q.period) <= endOf(f.period) && alike(q, f));
    const same = candidates.find((q) => JSON.stringify(q.period) === JSON.stringify(f.period));
    const p = same ?? candidates.reduce((best, q) => (!best || endOf(q.period) > endOf(best.period) ? q : best), null);
    if (!p || !p.value || !f.value) continue;
    const ratio = Math.abs(f.value / p.value);
    const instant = isInstant(f.period);
    const prior = { value: p.value, period: p.period };
    const found = { rule: "scale", concept: f.concept, unit: f.unit, period: f.period, value: f.value };
    if (slip(ratio, instant)) findings.push({ ...found, detail: `${f.value}${where(f.period)} is ${Math.round(ratio)} times the prior value ${p.value}${where(p.period)}: check the scale`, prior });
    else if (slip(1 / ratio, instant)) findings.push({ ...found, detail: `${f.value}${where(f.period)} is 1/${Math.round(1 / ratio)} of the prior value ${p.value}${where(p.period)}: check the scale`, prior });
  }
  return { ok: !findings.length, findings };
}

// SEC filings, as data.sec.gov serves a company's XBRL facts (api/xbrl/companyfacts/CIK##########.json) and
// canli-fundamentals-mcp reads them. Values are as filed, in whole units (dollars, not cents).
export const SEC_FORMS = ["10-K", "10-Q", "20-F", "40-F"];

function secFactsByFiling(companyfacts, taxonomy) {
  const byFiling = new Map();
  for (const [concept, body] of Object.entries(companyfacts?.facts?.[taxonomy] ?? {})) {
    for (const [unit, list] of Object.entries(body?.units ?? {})) {
      for (const f of list) {
        if (!byFiling.has(f.accn)) byFiling.set(f.accn, { filing: { accession: f.accn, form: f.form, fy: f.fy, fp: f.fp, filed: f.filed }, facts: [] });
        byFiling.get(f.accn).facts.push({ concept, unit, value: f.val, period: f.start ? { start: f.start, end: f.end } : { instant: f.end } });
      }
    }
  }
  return byFiling;
}

// The taxonomy a company's facts are in: us-gaap when it files in it, otherwise ifrs-full.
export function secTaxonomy(companyfacts) {
  const tax = companyfacts?.facts?.["us-gaap"] ? "us-gaap" : companyfacts?.facts?.["ifrs-full"] ? "ifrs-full" : null;
  if (!tax) throw new Error("The file has no us-gaap or ifrs-full facts: give the companyfacts JSON from data.sec.gov");
  return tax;
}

// Report's checks on each of a company's filings, oldest first, each against the last filing of the same form
// before it for the scale check; `last` keeps the most recent. Findings point at facts to look at, not errors
// proved.
export function checkSecFilings(companyfacts, { forms = SEC_FORMS, last = 8, taxonomy } = {}) {
  const tax = taxonomy ?? secTaxonomy(companyfacts);
  mapFor(tax);
  const filings = [...secFactsByFiling(companyfacts, tax).values()].filter((x) => forms.includes(x.filing.form)).sort((a, b) => (a.filing.filed === b.filing.filed ? (a.filing.accession < b.filing.accession ? -1 : 1) : a.filing.filed < b.filing.filed ? -1 : 1));
  const before = new Map();
  const rows = filings.map(({ filing, facts }) => {
    const checked = checkFacts(facts, { prior: before.get(filing.form) ?? [], taxonomy: tax, untagged: true, rounded: true });
    before.set(filing.form, facts);
    return { ...filing, facts: facts.length, ...checked };
  });
  const kept = rows.slice(-last);
  const counts = {};
  for (const r of kept) for (const f of r.findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
  return { cik: companyfacts.cik ?? null, entityName: companyfacts.entityName ?? null, taxonomy: tax, filings: kept, checked: kept.length, withFindings: kept.filter((r) => !r.ok).length, counts };
}
