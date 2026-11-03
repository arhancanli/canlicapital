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
    nonNegative: ["Assets", "Liabilities", "Revenues", "CashAndCashEquivalentsAtCarryingValue"],
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

// Checks on facts from any source, this book or a filing read elsewhere: each finding names its rule, the
// concept and the numbers. prior: last period's facts, for the scale check.
export function checkFacts(facts, { prior = [], taxonomy = "us-gaap", tolerance = 0 } = {}) {
  const map = mapFor(taxonomy);
  const t = map.totals;
  const findings = [];
  const groups = new Map();
  for (const f of facts) {
    const key = `${f.concept}|${JSON.stringify(f.period)}|${f.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  for (const list of groups.values()) {
    if (new Set(list.map((f) => f.value)).size > 1) findings.push({ rule: "duplicate", concept: list[0].concept, detail: `the same fact is given ${list.length} values: ${list.map((f) => f.value).join(", ")}` });
  }
  const value = (concept) => facts.find((f) => f.concept === concept)?.value;
  const [A, L, E, LE] = [value(t.assets), value(t.liabilities), value(t.equity), value(t.both)];
  if (A !== undefined && LE !== undefined && Math.abs(A - LE) > tolerance) findings.push({ rule: "balance", concept: t.assets, detail: `${t.assets} ${A} is not ${t.both} ${LE}` });
  if (L !== undefined && E !== undefined && LE !== undefined && Math.abs(L + E - LE) > tolerance) findings.push({ rule: "balance", concept: t.both, detail: `${t.liabilities} ${L} plus ${t.equity} ${E} is not ${t.both} ${LE}` });
  for (const concept of map.nonNegative) {
    const v = value(concept);
    if (v !== undefined && v < 0) findings.push({ rule: "sign", concept, detail: `${concept} is negative: ${v}` });
  }
  for (const f of facts) {
    const p = prior.find((q) => q.concept === f.concept && q.unit === f.unit);
    if (!p || !p.value || !f.value) continue;
    const ratio = Math.abs(f.value / p.value);
    if (ratio >= 900) findings.push({ rule: "scale", concept: f.concept, detail: `${f.value} is ${Math.round(ratio)} times the prior value ${p.value}: check the scale` });
    else if (ratio <= 1 / 900) findings.push({ rule: "scale", concept: f.concept, detail: `${f.value} is 1/${Math.round(1 / ratio)} of the prior value ${p.value}: check the scale` });
  }
  return { ok: !findings.length, findings };
}
