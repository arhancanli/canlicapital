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
    redeemableMinority: "RedeemableNoncontrollingInterestEquityCarryingAmount",
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
// filing may tag temporary equity, all of it or some, in a concept of its own, only by class or series, or in a
// concept this check does not read, which leaves liabilities and equity short of their total by that amount; so
// the parts are then flagged when they come to more than the total, and when they fall short of it only by about
// 999 (or 999,999) times one of them, as when that part is filed a thousand (or a million) times too small.
// Redeemable minority interests tagged as temporary equity can sit inside equity, among the minority interests
// there: when those are at least as large, the parts may add up with them counted once, inside equity.
// rounded: the figures are rounded as filed, so a total may miss the sum of its parts by their rounding.
// priorFiling: the filing the prior facts are from ({ accession, form, filed }), named beside the value a scale
// finding was compared with.
export function checkFacts(facts, { prior = [], priorFiling = null, taxonomy = "us-gaap", tolerance = 0, untagged = false, rounded = false } = {}) {
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
    const named = (tmp) => [[t.liabilities, L], ...tmp.map((x) => ["temporary equity", x]), [equityConcept, E], ...(minority === undefined ? [] : [[map.minority, minority]])];
    const gapOf = (terms) => terms.reduce((s, [, x]) => s + x, 0) - LE;
    const off = (terms) => Math.abs(gapOf(terms)) > slack([...terms.map(([, x]) => x), LE]);
    const terms = named(temporaries);
    const gap = gapOf(terms);
    // Redeemable minority interests no larger than the minority interests in equity may be among them: counted once.
    const redeemable = !v.has(whole) && map.redeemableMinority ? v.get(map.redeemableMinority) : undefined;
    const inside = redeemable !== undefined && map.minority && v.has(map.minority) && redeemable <= v.get(map.minority);
    if (!off(terms) || (inside && !off(named(temporaries.filter((x, i) => i !== temporaries.indexOf(redeemable)))))) continue;
    // A shortfall is what temporary equity the check cannot see would leave, unless it is about 999 (or 999,999) times
    // one part: that part filed a thousand (or a million) times too small.
    const slipped = gap < 0 && terms.map(([name, x]) => [name, x, [1e3, 1e6].find((k) => x > 0 && Math.abs((1 - gap / x) / k - 1) <= 0.1)]).find(([, , k]) => k);
    if (untagged && gap < 0 && !slipped) continue;
    const short = slipped ? `: short by ${-gap}, as when ${slipped[0]} ${slipped[1]} is filed ${slipped[2] === 1e3 ? "a thousand" : "a million"} times too small` : "";
    findings.push({ rule: "balance", concept: t.both, unit, period: { instant }, value: LE, detail: `${t.liabilities} ${L}${temporary ? ` plus temporary equity ${temporary}` : ""} plus ${equityConcept} ${E}${minority === undefined ? "" : ` plus ${map.minority} ${minority}`} is not ${t.both} ${LE}${at}${short}` });
  }
  for (const f of facts) if (map.nonNegative.includes(f.concept) && f.value < 0) findings.push({ rule: "sign", concept: f.concept, unit: f.unit, period: f.period, value: f.value, detail: `${f.concept} is negative: ${f.value}${where(f.period)}` });
  // Against the prior value of the same concept, unit and period, or else the latest of the same kind of period that
  // ends no later than this one (for a flow, one about as long). A scale slip multiplies a value by a thousand or a
  // million, so only a ratio within 10% of 1,000 or 1,000,000 is flagged for a balance and within 5% for a flow;
  // real changes rarely land there (holdings grown from 6 million to 4.5 billion are 753 times). On every filing of
  // five companies (Apple, Microsoft, JPMorgan, Simon Property, TSMC) this keeps slips such as shares authorized
  // filed in thousands and drops the coincidences.
  // A filing that gives the earlier period itself (an annual filing repeats last year's figures) states the change
  // from there in one document, and its own figure for that period is compared with the earlier filing's, same
  // period to same period: a slip in either filing shows there, while a real change of a thousandfold (an IPO, a
  // reverse split, a new grant) does not. So the new figure is compared across periods only when the filing does not.
  const slip = (ratio, instant) => [1e3, 1e6].find((k) => Math.abs(ratio / k - 1) <= (instant ? 0.1 : 0.05));
  const days = (period) => (Date.parse(period.end) - Date.parse(period.start)) / 864e5;
  const alike = (q, f) => isInstant(f.period) || Math.abs(days(q.period) / days(f.period) - 1) <= 0.2;
  const earlier = new Map();
  for (const q of prior) {
    const key = `${q.concept}|${q.unit}|${isInstant(q.period)}`;
    earlier.set(key, [...(earlier.get(key) ?? []), q]);
  }
  const given = new Set(facts.map((f) => `${f.concept}|${f.unit}|${JSON.stringify(f.period)}`));
  const from = priorFiling ? ` in ${priorFiling.form} ${priorFiling.accession}, filed ${priorFiling.filed}` : "";
  for (const f of facts) {
    // Not tax rates and other percentages: an effective tax rate can be a thousand times last year's when pre-tax
    // income is near zero. Exchange rates are checked, since a currency rarely moves a thousandfold between filings
    // and a rate tagged with the wrong scale (7,100 yuan to the dollar) is a slip; so are counts, since a count filed
    // in thousands is a slip.
    if (f.unit === "pure" && /Rate|Percent/.test(f.concept) && !/ExchangeRate/.test(f.concept)) continue;
    const candidates = (earlier.get(`${f.concept}|${f.unit}|${isInstant(f.period)}`) ?? []).filter((q) => endOf(q.period) <= endOf(f.period) && alike(q, f));
    const same = candidates.find((q) => JSON.stringify(q.period) === JSON.stringify(f.period));
    const p = same ?? candidates.reduce((best, q) => (!best || endOf(q.period) > endOf(best.period) ? q : best), null);
    if (!p || !p.value || !f.value || (!same && given.has(`${f.concept}|${f.unit}|${JSON.stringify(p.period)}`))) continue;
    const ratio = Math.abs(f.value / p.value);
    const instant = isInstant(f.period);
    const prior = { value: p.value, period: p.period, ...(priorFiling ? { accession: priorFiling.accession, form: priorFiling.form, filed: priorFiling.filed } : {}) };
    const found = { rule: "scale", concept: f.concept, unit: f.unit, period: f.period, value: f.value };
    if (slip(ratio, instant)) findings.push({ ...found, detail: `${f.value}${where(f.period)} is ${Math.round(ratio)} times the prior value ${p.value}${where(p.period)}${from}: check the scale`, prior });
    else if (slip(1 / ratio, instant)) findings.push({ ...found, detail: `${f.value}${where(f.period)} is 1/${Math.round(1 / ratio)} of the prior value ${p.value}${where(p.period)}${from}: check the scale`, prior });
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

// A scale flag sets two filings' figures side by side: the company's other filings, of any form, earlier or later,
// that give either figure (the same concept, unit and period) find the one out of line. A figure they give is at the
// flagged filing's scale or the earlier filing's when it is within ten times that filing's figure, since a figure
// filed again is the same, or recast by far less than the thousandfold between the two. When they were filed counts:
// a one-off slip is out of line with the filings on both sides of it, but a scale kept for years and then corrected
// is out of line only with the filings before the correction, so filings that agree with the earlier one are no
// evidence against the flagged one unless they came after it. The flagged filing is out of line when a later filing
// gives its figure at the earlier filing's scale, the earlier filing when a filing before the flagged one gives the
// earlier figure at the flagged filing's scale (another filing that gives one figure as filed says nothing against
// the other), and either only when no other filing gives a figure at the scale of the one named; otherwise neither is
// named, and where the others give both figures as filed the change may be real. Out of line is not proved wrong: a
// share count restated for a reverse split is out of line with the filings before it.
function findOutOfLine(rows, all) {
  const flags = rows.flatMap((row) => row.findings.filter((f) => f.rule === "scale").map((f) => [row, f]));
  if (!flags.length) return;
  const keyOf = (concept, unit, period) => `${concept}|${unit}|${JSON.stringify(period)}`;
  const wanted = new Set(flags.flatMap(([, f]) => [keyOf(f.concept, f.unit, f.period), keyOf(f.concept, f.unit, f.prior.period)]));
  const given = new Map();
  for (const { filing, facts } of all) {
    for (const x of facts) {
      const key = keyOf(x.concept, x.unit, x.period);
      if (wanted.has(key) && x.value) given.set(key, [...(given.get(key) ?? []), { accession: filing.accession, form: filing.form, filed: filing.filed, period: x.period, value: x.value }]);
    }
  }
  const near = (v, x) => Math.abs(Math.log10(Math.abs(v / x))) < 1;
  const byFiled = (list) => [...list].sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : 0));
  const named = (list) => {
    const filings = [...new Map(byFiled(list).map((o) => [o.accession, `${o.form} ${o.accession}`])).values()];
    return `${filings.slice(0, 3).join(", ")}${filings.length > 3 ? ` and ${filings.length - 3} more` : ""}`;
  };
  for (const [row, f] of flags) {
    const ratio = Math.abs(f.value / f.prior.value);
    const same = JSON.stringify(f.period) === JSON.stringify(f.prior.period);
    const othersAt = (period) => (given.get(keyOf(f.concept, f.unit, period)) ?? []).filter((o) => o.accession !== row.accession && o.accession !== f.prior.accession);
    // At the flagged figure's period, that figure and the same at the earlier filing's scale; at the earlier figure's
    // period, that figure and the same at the flagged filing's scale. At one period both, the two figures.
    const here = othersAt(f.period);
    const there = same ? here : othersAt(f.prior.period);
    const ours = here.filter((o) => near(o.value, f.value));
    const theirs = here.filter((o) => near(o.value, f.value / ratio));
    const priorAsFiled = same ? theirs : there.filter((o) => near(o.value, f.prior.value));
    const priorAtOurs = same ? ours : there.filter((o) => near(o.value, f.prior.value * ratio));
    const atOurs = [...ours, ...priorAtOurs];
    const atTheirs = [...theirs, ...priorAsFiled];
    const priorOut = priorAtOurs.some((o) => o.filed < row.filed) && !atTheirs.length;
    const flaggedOut = theirs.some((o) => o.filed > row.filed) && !atOurs.length;
    const others = same ? here : [...here, ...there];
    f.out_of_line = priorOut ? f.prior.accession : flaggedOut ? row.accession : null;
    f.others = byFiled(others).slice(0, 10);
    if (priorOut) f.detail += `. Other filings give these figures at this filing's scale (${named(priorAtOurs)}): the earlier filing is out of line.`;
    else if (flaggedOut) f.detail += `. Other filings give these figures at the earlier filing's scale (${named(theirs)}): this filing is out of line.`;
    else if (ours.length && priorAsFiled.length && !theirs.length && !priorAtOurs.length) f.detail += `. Other filings give both figures as filed (${named([...ours, ...priorAsFiled])}): the change may be real.`;
    else if (atOurs.length && atTheirs.length) f.detail += `. Other filings give these figures at both scales (${named(others)}).`;
    else if (atTheirs.length && atTheirs.every((o) => o.filed < row.filed)) f.detail += `. Filings before this one give these figures at the earlier filing's scale (${named(atTheirs)}): this filing slipped, or it corrects a scale they shared.`;
    else if (atOurs.length && atOurs.every((o) => o.filed > row.filed)) f.detail += `. Later filings give these figures at this filing's scale (${named(atOurs)}): the earlier filing slipped, or a new scale began with this one.`;
  }
}

// Report's checks on each of a company's filings, oldest first, each against the last filing of the same form
// before it for the scale check; `last` keeps the most recent. A scale finding names the earlier filing and, where
// the company's other filings decide it, the filing out of line (findOutOfLine). Findings point at facts to look
// at, not errors proved.
export function checkSecFilings(companyfacts, { forms = SEC_FORMS, last = 8, taxonomy } = {}) {
  const tax = taxonomy ?? secTaxonomy(companyfacts);
  mapFor(tax);
  const all = [...secFactsByFiling(companyfacts, tax).values()];
  const filings = all.filter((x) => forms.includes(x.filing.form)).sort((a, b) => (a.filing.filed === b.filing.filed ? (a.filing.accession < b.filing.accession ? -1 : 1) : a.filing.filed < b.filing.filed ? -1 : 1));
  const before = new Map();
  const rows = filings.map(({ filing, facts }) => {
    const earlier = before.get(filing.form);
    const checked = checkFacts(facts, { prior: earlier?.facts ?? [], priorFiling: earlier?.filing, taxonomy: tax, untagged: true, rounded: true });
    before.set(filing.form, { filing, facts });
    return { ...filing, facts: facts.length, ...checked };
  });
  const kept = rows.slice(-last);
  findOutOfLine(kept, all);
  const counts = {};
  for (const r of kept) for (const f of r.findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
  return { cik: companyfacts.cik ?? null, entityName: companyfacts.entityName ?? null, taxonomy: tax, filings: kept, checked: kept.length, withFindings: kept.filter((r) => !r.ok).length, counts };
}
