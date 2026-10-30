// Three accounting screens in one call, every input read from the company's own annual XBRL for its
// last two fiscal years: Beneish's M-score (earnings manipulation), Piotroski's F-score (financial
// strength) and Altman's Z-score (distress; its market value of equity from the share price at the
// fiscal year end). Each input names its tag, and a screen whose inputs are missing says which.
import { z } from "zod";

import { factBook, marketValue as listedValue, usdPer } from "./listing.mjs";
import { getJson, resolveEntity, submissions } from "./sources.mjs";
import { priceHistory } from "./tools.mjs";

export const forensicInput = z.object({ company: z.string().min(1).max(120).describe("Ticker, CIK or name.") }).strict();

const ANNUAL = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000;
const TAGS = {
  sales: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
  cogs: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
  receivables: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
  current_assets: ["AssetsCurrent"], current_liabilities: ["LiabilitiesCurrent"], total_assets: ["Assets"], total_liabilities: ["Liabilities"],
  ppe: ["PropertyPlantAndEquipmentNet"], securities: ["MarketableSecuritiesNoncurrent", "LongTermInvestments", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent"],
  depreciation: ["Depreciation", "DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment"],
  sga: ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"],
  net_income: ["NetIncomeLoss", "ProfitLoss"], cfo: ["NetCashProvidedByUsedInOperatingActivities"],
  long_term_debt: ["LongTermDebtNoncurrent", "LongTermDebt"], retained_earnings: ["RetainedEarningsAccumulatedDeficit"],
  equity_total: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "StockholdersEquity"],
  ebit: ["OperatingIncomeLoss"], shares: ["CommonStockSharesOutstanding", "WeightedAverageNumberOfDilutedSharesOutstanding"],
};
// The same inputs in the IFRS taxonomy.
const IFRS_TAGS = {
  sales: ["Revenue", "RevenueFromContractsWithCustomers"],
  cogs: ["CostOfSales"],
  receivables: ["TradeAndOtherCurrentReceivables", "CurrentTradeReceivables", "TradeReceivables"],
  current_assets: ["CurrentAssets"], current_liabilities: ["CurrentLiabilities"], total_assets: ["Assets"], total_liabilities: ["Liabilities"],
  ppe: ["PropertyPlantAndEquipment"], securities: ["NoncurrentFinancialAssets", "OtherNoncurrentFinancialAssets"],
  depreciation: ["DepreciationAndAmortisationExpense", "DepreciationExpense", "AdjustmentsForDepreciationAndAmortisationExpense", "AdjustmentsForDepreciationExpense"],
  sga: ["SellingGeneralAndAdministrativeExpense", "AdministrativeExpense", "GeneralAndAdministrativeExpense"],
  net_income: ["ProfitLoss"], cfo: ["CashFlowsFromUsedInOperatingActivities"],
  long_term_debt: ["NoncurrentPortionOfNoncurrentBorrowings", "LongtermBorrowings", "NoncurrentBorrowings"], retained_earnings: ["RetainedEarnings"],
  equity_total: ["Equity"],
  ebit: ["ProfitLossFromOperatingActivities"], shares: ["NumberOfSharesOutstanding", "WeightedAverageShares"],
};
const FLOW = new Set(["sales", "cogs", "depreciation", "sga", "net_income", "cfo", "ebit"]);

function value(facts, name, end, tags = TAGS, currency = "USD") {
  for (const tag of tags[name]) {
    const unit = name === "shares" ? "shares" : currency;
    const flow = FLOW.has(name) || tag.startsWith("WeightedAverage");
    const rows = (facts[tag]?.units?.[unit] ?? []).filter((x) => x.end === end && ANNUAL.has(x.form) && (flow ? x.start && days(x.end, x.start) >= 350 && days(x.end, x.start) <= 380 : !x.start));
    if (rows.length) return { tag, val: rows.sort((p, q) => (p.filed < q.filed ? 1 : -1))[0].val };
  }
  return null;
}

const round = (x, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const need = (o, keys) => keys.filter((k) => o[k] == null);

// Beneish (1999), eight variables; above -1.78 flags a likely manipulator in his sample.
export function beneish(t, p) {
  const miss = [...need(t, ["sales", "receivables", "cogs", "current_assets", "ppe", "total_assets", "depreciation", "sga", "net_income", "cfo", "current_liabilities", "long_term_debt"]).map((k) => `${k} (this year)`),
    ...need(p, ["sales", "receivables", "cogs", "current_assets", "ppe", "total_assets", "depreciation", "sga", "current_liabilities", "long_term_debt"]).map((k) => `${k} (prior year)`)];
  if (miss.length) return { missing: miss };
  const sec = (o) => o.securities ?? 0;
  const dsri = (t.receivables / t.sales) / (p.receivables / p.sales);
  const gmi = ((p.sales - p.cogs) / p.sales) / ((t.sales - t.cogs) / t.sales);
  const aqi = (1 - (t.current_assets + t.ppe + sec(t)) / t.total_assets) / (1 - (p.current_assets + p.ppe + sec(p)) / p.total_assets);
  const sgi = t.sales / p.sales;
  const depi = (p.depreciation / (p.depreciation + p.ppe)) / (t.depreciation / (t.depreciation + t.ppe));
  const sgai = (t.sga / t.sales) / (p.sga / p.sales);
  const lvgi = ((t.current_liabilities + t.long_term_debt) / t.total_assets) / ((p.current_liabilities + p.long_term_debt) / p.total_assets);
  const tata = (t.net_income - t.cfo) / t.total_assets;
  const m = -4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi + 0.115 * depi - 0.172 * sgai + 4.679 * tata - 0.327 * lvgi;
  return { m_score: round(m), flag: m > -1.78 ? "above -1.78: the profile of a likely manipulator in Beneish's sample" : "below -1.78", indices: { dsri: round(dsri), gmi: round(gmi), aqi: round(aqi), sgi: round(sgi), depi: round(depi), sgai: round(sgai), lvgi: round(lvgi), tata: round(tata, 4) } };
}

// Piotroski (2000), nine binary signals.
export function piotroski(t, p) {
  const miss = [...need(t, ["net_income", "cfo", "total_assets", "current_assets", "current_liabilities", "sales", "cogs", "shares"]).map((k) => `${k} (this year)`),
    ...need(p, ["net_income", "total_assets", "current_assets", "current_liabilities", "sales", "cogs", "shares"]).map((k) => `${k} (prior year)`)];
  if (miss.length) return { missing: miss };
  const lev = (o) => (o.long_term_debt ?? 0) / o.total_assets;
  const s = {
    roa_positive: t.net_income / t.total_assets > 0, cfo_positive: t.cfo > 0,
    roa_up: t.net_income / t.total_assets > p.net_income / p.total_assets, cfo_above_net_income: t.cfo > t.net_income,
    leverage_down: lev(t) < lev(p), current_ratio_up: t.current_assets / t.current_liabilities > p.current_assets / p.current_liabilities,
    no_new_shares: t.shares <= p.shares, gross_margin_up: (t.sales - t.cogs) / t.sales > (p.sales - p.cogs) / p.sales,
    asset_turnover_up: t.sales / t.total_assets > p.sales / p.total_assets,
  };
  return { f_score: Object.values(s).filter(Boolean).length, signals: s, reading: "8-9 strong, 0-2 weak (Piotroski's value-stock sample)" };
}

// Altman (1968) Z for public manufacturers; the zones are his.
export function altman(t, marketValue) {
  const miss = need({ ...t, market_value_of_equity: marketValue }, ["current_assets", "current_liabilities", "total_assets", "retained_earnings", "ebit", "total_liabilities", "sales", "market_value_of_equity"]);
  if (miss.length) return { missing: miss };
  const z = 1.2 * ((t.current_assets - t.current_liabilities) / t.total_assets) + 1.4 * (t.retained_earnings / t.total_assets) + 3.3 * (t.ebit / t.total_assets) + 0.6 * (marketValue / t.total_liabilities) + 1.0 * (t.sales / t.total_assets);
  return { z_score: round(z, 2), zone: z > 2.99 ? "safe (above 2.99)" : z >= 1.81 ? "grey (1.81 to 2.99)" : "distress (below 1.81)", note: "The 1968 model was fitted on manufacturers; for banks, insurers and many service firms it misreads." };
}

export async function forensicScores(session, args) {
  const a = forensicInput.parse(args);
  const e = await resolveEntity(session, a.company);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`;
  const cf = await getJson(session, url, { maxBytes: 96 * 1024 * 1024 });
  const book = factBook(cf), f = book.facts, TAGS_USED = book.taxonomy === "ifrs-full" ? IFRS_TAGS : TAGS;
  const sub = await submissions(session, e.cik);
  // Banks, brokers and insurers have no current assets, cost of sales or working capital in the sense
  // these models read: their scores would be noise, and their debt is not "none" when untagged.
  const sic = Number(sub.sic);
  const financial = sic >= 6000 && sic <= 6411;
  const ends = [...new Set((f.Assets?.units?.[book.currency] ?? []).filter((x) => ANNUAL.has(x.form) && x.fp === "FY" && !x.start).map((x) => x.end))].sort().reverse();
  const end = ends[0], prior = ends.find((x) => days(end, x) > 300 && days(end, x) < 430);
  if (!end || !prior) throw new Error(`${cf.entityName ?? a.company} has fewer than two annual balance sheets in its XBRL.`);
  // Inputs a company leaves untagged: liabilities as assets less equity; long-term debt as none.
  const read = (at) => {
    const out = {}, tags = {};
    for (const k of Object.keys(TAGS_USED)) { const v = value(f, k, at, TAGS_USED, book.currency); out[k] = v?.val ?? null; tags[k] = v?.tag ?? null; }
    if (out.total_liabilities == null && out.total_assets != null) {
      const eq = value({ ...f }, "equity_total", at, TAGS_USED, book.currency);
      if (eq) { out.total_liabilities = out.total_assets - eq.val; tags.total_liabilities = `Assets - ${eq.tag}`; }
    }
    if (out.long_term_debt == null && !financial) { out.long_term_debt = 0; tags.long_term_debt = "not tagged: taken as 0"; }
    return { out, tags };
  };
  const t = read(end), p = read(prior);
  let marketValue = null, price = null;
  if (e.ticker && t.out.shares) {
    const px = await priceHistory(session, { symbol: e.ticker, start: new Date(Date.parse(end) - 10 * 86400000).toISOString().slice(0, 10), end, adjusted: false }).catch(() => null);
    price = px?.close?.at(-1) ?? null;
    // Altman sets market value against the filing's figures, so it is put in the filing's currency.
    if (price) {
      const [mv, fx] = await Promise.all([listedValue(session, e.cik, sub, price, t.out.shares, { book }), usdPer(session, book.currency)]);
      if (mv.market_cap && fx?.rate) marketValue = mv.market_cap / fx.rate;
    }
  }
  const notFor = { not_applicable: `This model was built on non-financial companies; ${sub.sicDescription ?? "this industry"} does not have the line items it reads.` };
  return {
    company: { cik: e.cik, name: cf.entityName ?? e.name, ticker: e.ticker ?? null, ...(book.currency !== "USD" || book.taxonomy === "ifrs-full" ? { accounts: { standard: book.taxonomy === "ifrs-full" ? "IFRS" : "US GAAP", currency: book.currency } } : {}) }, fiscal_year_end: end, prior_year_end: prior,
    beneish: financial ? notFor : beneish(t.out, p.out), piotroski: financial ? notFor : piotroski(t.out, p.out), altman: financial ? notFor : altman(t.out, marketValue),
    inputs: { columns: ["input", "this_year", "prior_year", "tag"], rows: Object.keys(TAGS_USED).filter((k) => k !== "equity_total").map((k) => [k, t.out[k], p.out[k], t.tags[k] ?? p.tags[k]]) },
    ...(price ? { market_value: { price_at_year_end: price, shares: t.out.shares, value: marketValue } } : {}),
    sources: [url],
    meaning: "Each screen as its author published it, computed from the company's annual XBRL. A screen's missing inputs are named rather than guessed. These are screens from studies of past samples, not verdicts on a company.",
    limits: ["Companies tag line items differently; a substitute tag (listed in inputs) can shift a ratio.", "Not investment advice."],
  };
}
