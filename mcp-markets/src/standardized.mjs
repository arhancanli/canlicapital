// standardized_financials: a company's income statement, balance sheet and cash flow in one template, whether
// it files US GAAP or IFRS, so companies compare line for line, with each figure's source shown: the concept
// the company tagged, or the arithmetic that made it (gross profit as revenue less cost of revenue when no
// gross profit is tagged). Fiscal years from its 10-Ks, 20-Fs and 40-Fs at SEC, restatements applied, with
// the ratios company_report uses. Several companies side by side, optionally in US dollars at each year's rates.
import { z } from "zod";

import { ifrsDebtRows } from "./credit.mjs";
import { factBook } from "./listing.mjs";
import { annual, choose, IFRS_METRICS, METRICS } from "./research.mjs";
import { getJson, NotFound, resolveEntity } from "./sources.mjs";
import { priceHistory } from "./tools.mjs";

const D = "duration", I = "instant";
const def = (kind, unit, groups, extra = {}) => ({ kind, unit, groups, tags: groups.flat(), ...extra });
const one = (...tags) => tags.map((t) => [t]);

// Each line: its label, then its US GAAP and IFRS concepts in priority groups (as research.mjs reads them),
// and the arithmetic used when a company tags none of them.
export const TEMPLATE = Object.freeze([
  ["revenue", "Revenue", def(D, "USD", METRICS.revenue.groups), def(D, "USD", IFRS_METRICS.revenue.groups)],
  ["cost_of_revenue", "Cost of revenue", def(D, "USD", [["CostOfRevenue", "CostOfGoodsAndServicesSold"], ["CostOfGoodsSold"]]), def(D, "USD", one("CostOfSales"))],
  ["gross_profit", "Gross profit", def(D, "USD", one("GrossProfit")), def(D, "USD", one("GrossProfit")), { derive: ["revenue", -1, "cost_of_revenue"], how: "revenue less cost of revenue" }],
  ["rd_expense", "Research and development", def(D, "USD", METRICS.rd_expense.groups), def(D, "USD", one("ResearchAndDevelopmentExpense"))],
  ["sga_expense", "Selling, general and administrative", def(D, "USD", one("SellingGeneralAndAdministrativeExpense")), def(D, "USD", one("SellingGeneralAndAdministrativeExpense")), { deriveTags: ["SellingExpense", "AdministrativeExpense"], how: "selling expense plus administrative expense" }],
  ["operating_income", "Operating income", def(D, "USD", METRICS.operating_income.groups), def(D, "USD", IFRS_METRICS.operating_income.groups)],
  ["interest_expense", "Interest expense", def(D, "USD", [["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestAndDebtExpense"]]), def(D, "USD", [["FinanceCosts", "InterestExpense"]])],
  ["pretax_income", "Income before tax", def(D, "USD", one("IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments")), def(D, "USD", one("ProfitLossBeforeTax"))],
  ["income_tax", "Income tax", def(D, "USD", one("IncomeTaxExpenseBenefit")), def(D, "USD", one("IncomeTaxExpenseContinuingOperations"))],
  ["net_income", "Net income to owners", METRICS.net_income, def(D, "USD", IFRS_METRICS.net_income.groups)],
  ["depreciation_amortization", "Depreciation and amortization", def(D, "USD", [["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization"], ["Depreciation"]]), def(D, "USD", [["DepreciationAndAmortisationExpense", "AdjustmentsForDepreciationAndAmortisationExpense"], ["DepreciationExpense"]])],
  ["ebitda", "EBITDA", null, null, { derive: ["operating_income", 1, "depreciation_amortization"], how: "operating income plus depreciation and amortization" }],
  ["eps_diluted", "Diluted EPS", def(D, "USD/shares", METRICS.eps_diluted.groups), def(D, "USD/shares", IFRS_METRICS.eps_diluted.groups), { perShare: true }],
  ["shares_diluted", "Diluted shares (weighted)", def(D, "shares", one("WeightedAverageNumberOfDilutedSharesOutstanding")), def(D, "shares", one("AdjustedWeightedAverageShares", "WeightedAverageShares")), { count: true }],
  ["cash", "Cash and equivalents", def(I, "USD", one("CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents")), def(I, "USD", one("CashAndCashEquivalents"))],
  ["current_assets", "Current assets", def(I, "USD", one("AssetsCurrent")), def(I, "USD", one("CurrentAssets"))],
  ["total_assets", "Total assets", def(I, "USD", one("Assets")), def(I, "USD", one("Assets"))],
  ["current_liabilities", "Current liabilities", def(I, "USD", one("LiabilitiesCurrent")), def(I, "USD", one("CurrentLiabilities"))],
  ["total_liabilities", "Total liabilities", def(I, "USD", one("Liabilities")), def(I, "USD", one("Liabilities")), { deriveTags: ["LiabilitiesAndStockholdersEquity", "-StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], deriveTagsIfrs: ["EquityAndLiabilities", "-Equity"], how: "total liabilities and equity less total equity" }],
  // Long-term debt with its current portion in both standards: IFRS read as debt_profile reads it (Borrowings,
  // or loans, bonds and the current portion added up), since a filer's bonds sit apart from its loans.
  ["long_term_debt", "Long-term debt, with its current portion", def(I, "USD", [["LongTermDebt"], ["LongTermDebtNoncurrent"]]), null, { ifrsDebt: true }],
  ["equity", "Equity to owners", def(I, "USD", METRICS.equity.groups), def(I, "USD", IFRS_METRICS.equity.groups)],
  ["operating_cash_flow", "Operating cash flow", def(D, "USD", METRICS.operating_cash_flow.groups), def(D, "USD", IFRS_METRICS.operating_cash_flow.groups)],
  ["capex", "Capital spending", def(D, "USD", METRICS.capex.groups), def(D, "USD", IFRS_METRICS.capex.groups)],
  ["free_cash_flow", "Free cash flow", null, null, { derive: ["operating_cash_flow", -1, "capex"], how: "operating cash flow less capital spending" }],
  ["dividends_paid", "Dividends paid", def(D, "USD", [["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"]]), def(D, "USD", [["DividendsPaidClassifiedAsFinancingActivities", "DividendsPaid"]])],
  ["buybacks", "Share repurchases", def(D, "USD", one("PaymentsForRepurchaseOfCommonStock")), def(D, "USD", one("PaymentsToAcquireOrRedeemEntitysShares"))],
]);

const pos = (x) => x != null && x > 0;
const div = (a, b) => (a != null && pos(b) ? a / b : null);
// Ratios, unitless so they compare across currencies; the margins, returns and FCF as company_report has them.
export const RATIOS = Object.freeze([
  ["revenue_growth", (m, p) => (p && pos(p.revenue) && m.revenue != null ? m.revenue / p.revenue - 1 : null)],
  ["gross_margin", (m) => div(m.gross_profit, m.revenue)],
  ["operating_margin", (m) => div(m.operating_income, m.revenue)],
  ["ebitda_margin", (m) => div(m.ebitda, m.revenue)],
  ["net_margin", (m) => div(m.net_income, m.revenue)],
  ["fcf_margin", (m) => div(m.free_cash_flow, m.revenue)],
  ["rd_intensity", (m) => div(m.rd_expense, m.revenue)],
  ["roe", (m) => div(m.net_income, m.equity)],
  ["roa", (m) => div(m.net_income, m.total_assets)],
  ["effective_tax_rate", (m) => div(m.income_tax, m.pretax_income)],
  ["interest_coverage", (m) => div(m.operating_income, m.interest_expense)],
  ["long_term_debt_to_ebitda", (m) => div(m.long_term_debt, m.ebitda)],
  ["current_ratio", (m) => div(m.current_assets, m.current_liabilities)],
  ["payout_ratio", (m) => div((m.dividends_paid ?? 0) + (m.buybacks ?? 0) || null, m.net_income)],
]);

export const standardizedInput = z.object({
  companies: z.array(z.string().min(1).max(120)).min(1).max(5).describe("One company for its years, or up to five side by side (latest fiscal year each): tickers (AAPL, TSM), CIKs or names."),
  years: z.number().int().min(1).max(10).optional().describe("Fiscal years for one company. Default 5."),
  in_usd: z.boolean().optional().describe("Convert a non-dollar filer's amounts to US dollars: flows at the fiscal year's average rate, balances at its year-end rate (the local server, which reads prices). Default false."),
}).strict();

const round = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const amount = (x) => (x == null || !Number.isFinite(x) ? null : Math.abs(x) >= 1000 ? Math.round(x) : Math.round(x * 100) / 100);

// A value per line and fiscal year end, with where it came from.
export function standardize(book) {
  const ifrs = book.taxonomy === "ifrs-full", prefix = ifrs ? "ifrs-full" : "us-gaap";
  const per = new Map();
  const put = (end, key, val, how) => { if (!per.has(end)) per.set(end, { values: {}, how: {} }); const y = per.get(end); y.values[key] = val; y.how[key] = how; };
  const raw = (tag, kind, end) => {
    const rows = book.facts?.[tag]?.units?.[book.currency] ?? [];
    let hit = null;
    for (const x of rows) {
      if (!/^(10-K|20-F|40-F)/.test(x.form ?? "") || x.end !== end) continue;
      if (kind === D && (!x.start || (Date.parse(x.end) - Date.parse(x.start)) / 86400000 < 330)) continue;
      if (!hit || x.filed > hit.filed) hit = x;
    }
    return hit?.val ?? null;
  };
  for (const [key, , us, fr, extra = {}] of TEMPLATE) {
    if (ifrs && extra.ifrsDebt) {
      const whole = new Set((book.facts.Borrowings?.units?.[book.currency] ?? []).map((x) => x.end));
      for (const r of ifrsDebtRows(book)) put(r.end, key, r.val, whole.has(r.end) ? "ifrs-full:Borrowings" : "derived: long-term loans, bonds and their current portion");
      continue;
    }
    const d = ifrs ? fr : us;
    if (!d) continue;
    for (const [end, year] of annual(book.facts, d, book.currency)) {
      const c = choose(d, year.byTag);
      if (c?.val != null) put(end, key, c.val, `${prefix}:${c.tag}${c.restated ? " (restated)" : ""}`);
    }
  }
  const ends = [...per.keys()].sort();
  // Lines the company did not tag, made from others where the arithmetic is plain.
  for (const end of ends) {
    const y = per.get(end);
    for (const [key, , us, , extra = {}] of TEMPLATE) {
      if (y.values[key] != null) continue;
      const kind = (us ?? { kind: D }).kind;
      if (extra.derive) {
        const [a, sign, b] = extra.derive;
        if (y.values[a] != null && y.values[b] != null) put(end, key, y.values[a] + sign * y.values[b], `derived: ${extra.how}`);
        else if (key === "free_cash_flow" && y.values.operating_cash_flow != null && y.values.capex == null) put(end, key, y.values.operating_cash_flow, "derived: operating cash flow (no capital spending tagged)");
      } else if (extra.deriveTags || extra.deriveTagsIfrs) {
        const tags = (ifrs ? extra.deriveTagsIfrs : null) ?? extra.deriveTags;
        const vals = tags.map((t) => { const neg = t.startsWith("-"); const v = raw(neg ? t.slice(1) : t, kind, end); return v == null ? null : neg ? -v : v; });
        if (vals.every((v) => v != null)) put(end, key, vals.reduce((s, v) => s + v, 0), `derived: ${extra.how}`);
      }
    }
  }
  return { per, ends };
}

// Dollars per unit of the filer's currency over its fiscal years: the year's average and its last close.
async function fxRates(session, currency, ends) {
  if (currency === "USD") return null;
  const first = new Date(Date.parse(ends[0]) - 372 * 86400000).toISOString().slice(0, 10);
  const p = await priceHistory(session, { symbol: `${currency}USD=X`, start: first, end: ends.at(-1) });
  const out = new Map();
  for (const end of ends) {
    const from = new Date(Date.parse(end) - 365 * 86400000).toISOString().slice(0, 10);
    const inYear = p.dates.map((d, i) => [d, p.close[i]]).filter(([d, v]) => d > from && d <= end && v > 0);
    if (inYear.length) out.set(end, { average: inYear.reduce((s, [, v]) => s + v, 0) / inYear.length, close: inYear.at(-1)[1] });
  }
  return { rates: out, pair: `${currency}USD`, source: p.source };
}

async function loadCompany(session, name) {
  const e = await resolveEntity(session, name);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`;
  const cf = await getJson(session, url, { maxBytes: 64 * 1024 * 1024 }).catch((err) => {
    if (err instanceof NotFound) throw new NotFound(`${e.name ?? name} has no XBRL financial data at SEC (a company that files no 10-K, 20-F or 40-F, or files on paper).`);
    throw err;
  });
  const book = factBook(cf);
  return { e, cf, book, url, ...standardize(book) };
}

function convert(values, rates, end) {
  const r = rates?.get(end);
  if (!r) return null;
  const out = {};
  for (const [key, , us, , extra = {}] of TEMPLATE) {
    const v = values[key];
    if (v == null || extra.count) { out[key] = v ?? null; continue; }
    const kind = (us ?? { kind: D }).kind;
    out[key] = v * (kind === I ? r.close : r.average);
  }
  return out;
}

export async function standardizedFinancials(session, args) {
  const a = standardizedInput.parse(args);
  const loaded = await Promise.all(a.companies.map((c) => loadCompany(session, c)));
  const fx = a.in_usd ? await Promise.all(loaded.map((c) => (c.book.currency === "USD" || !c.ends.length ? null : fxRates(session, c.book.currency, c.ends).catch(() => "unavailable")))) : loaded.map(() => null);
  const label = (c) => c.e.ticker ?? c.cf?.entityName ?? c.e.name;
  const accounts = (c, i) => ({ name: c.cf?.entityName ?? c.e.name, ticker: c.e.ticker ?? null, cik: c.e.cik, standard: c.book.taxonomy === "ifrs-full" ? "IFRS" : "US GAAP", currency: a.in_usd && fx[i] && fx[i] !== "unavailable" ? "USD" : c.book.currency, reported_in: c.book.currency });
  const valuesAt = (c, i, end) => {
    const v = c.per.get(end)?.values ?? {};
    if (!a.in_usd || !fx[i] || fx[i] === "unavailable") return v;
    return convert(v, fx[i].rates, end) ?? v;
  };
  for (const c of loaded) if (!c.ends.length) throw new NotFound(`${label(c)}'s XBRL facts hold no fiscal year of the template's lines.`);
  const limits = [
    "Each company's own tagged figures from its annual reports at SEC (10-K, 20-F, 40-F), the latest filing's value for each year; a line it did not tag is made from other lines only where the arithmetic is plain, and says so.",
    "US GAAP and IFRS differ underneath one template: leases, development costs and what counts as operating income are not the same, so compare ratios with that in mind.",
    "Not investment advice.",
  ];
  const unavailable = loaded.filter((_, i) => fx[i] === "unavailable").map(label);
  const fxNote = a.in_usd ? { usd_rates: Object.fromEntries(loaded.map((c, i) => [label(c), fx[i] && fx[i] !== "unavailable" ? `${fx[i].pair}: flows at each fiscal year's average, balances at its year-end close` : c.book.currency === "USD" ? "reports in US dollars" : "rates unavailable here (the hosted server reads no prices): amounts in the reporting currency"])) } : {};

  if (loaded.length === 1) {
    const c = loaded[0], ends = c.ends.slice(-(a.years ?? 5));
    // Amounts to the unit (EPS keeps its cents); ratios from the reporting currency, the year before included.
    const rows = TEMPLATE.map(([key, labelText]) => [key, labelText, ...ends.map((end) => (key === "eps_diluted" ? round(valuesAt(c, 0, end)[key], 4) : amount(valuesAt(c, 0, end)[key])))]);
    const prev = (end) => c.per.get(c.ends[c.ends.indexOf(end) - 1])?.values;
    const ratios = RATIOS.map(([key, f]) => [key, ...ends.map((end) => round(f(c.per.get(end)?.values ?? {}, prev(end))))]);
    const missing = TEMPLATE.filter(([key]) => ends.every((end) => c.per.get(end)?.values[key] == null)).map(([key]) => key);
    return {
      company: accounts(c, 0), fiscal_years: ends,
      statements: { columns: ["line", "label", ...ends], rows },
      how: { columns: ["line", ...ends], rows: TEMPLATE.map(([key]) => [key, ...ends.map((end) => c.per.get(end)?.how[key] ?? null)]) },
      ratios: { columns: ["ratio", ...ends], rows: ratios },
      ...(missing.length ? { not_reported: missing } : {}),
      ...fxNote, ...(unavailable.length ? { caution: `No exchange rates here for ${unavailable.join(", ")}; amounts stay in the reporting currency.` } : {}),
      source: c.url, limits,
    };
  }

  const latest = loaded.map((c) => c.ends.at(-1));
  return {
    companies: loaded.map(accounts),
    fiscal_years: Object.fromEntries(loaded.map((c, i) => [label(c), latest[i]])),
    compare: { columns: ["line", "label", ...loaded.map(label)], rows: TEMPLATE.map(([key, labelText]) => [key, labelText, ...loaded.map((c, i) => (key === "eps_diluted" ? round(valuesAt(c, i, latest[i])[key], 4) : amount(valuesAt(c, i, latest[i])[key])))]) },
    how: { columns: ["line", ...loaded.map(label)], rows: TEMPLATE.map(([key]) => [key, ...loaded.map((c, i) => c.per.get(latest[i])?.how[key] ?? null)]) },
    ratios: { columns: ["ratio", ...loaded.map(label)], rows: RATIOS.map(([key, f]) => [key, ...loaded.map((c, i) => round(f(c.per.get(latest[i])?.values ?? {}, c.per.get(c.ends.at(-2))?.values)))]) },
    ...fxNote, ...(unavailable.length ? { caution: `No exchange rates here for ${unavailable.join(", ")}; amounts stay in the reporting currency.` } : {}),
    ...(!a.in_usd && new Set(loaded.map((c) => c.book.currency)).size > 1 ? { currencies_differ: "Amounts are in each company's reporting currency; ratios compare as they are, or set in_usd for amounts." } : {}),
    source: loaded.map((c) => c.url), limits,
  };
}
