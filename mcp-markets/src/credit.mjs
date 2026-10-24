// A company's debt as its own annual reports tag it: what it owes and when it falls due (the
// maturity ladder from the debt note), its lease payments, cash against debt, and what the debt
// costs it (interest, coverage, leverage), with the tag behind every figure.
import { z } from "zod";

import { getJson, resolveEntity } from "./sources.mjs";

export const debtInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  years: z.number().int().min(1).max(10).optional().describe("Annual history of total debt and cash to show; default 5."),
}).strict();

const ANNUAL = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000;

// The latest-filed annual value of a tag for a period end (a duration of about a year, or an instant).
function at(facts, tag, end, { duration = false } = {}) {
  const rows = facts[tag]?.units?.USD ?? [];
  const hits = rows.filter((x) => x.end === end && ANNUAL.has(x.form) && (!duration || (x.start && days(x.end, x.start) >= 350 && days(x.end, x.start) <= 380)) && (duration || !x.start));
  if (!hits.length) return null;
  const v = hits.sort((p, q) => (p.filed < q.filed ? 1 : -1))[0];
  return { tag, val: v.val, filed: v.filed, accn: v.accn };
}
const first = (facts, tags, end, opts) => { for (const t of tags) { const v = at(facts, t, end, opts); if (v) return v; } return null; };
const round = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

const LADDER = [["next_12_months", "InNextTwelveMonths"], ["year_2", "InYearTwo"], ["year_3", "InYearThree"], ["year_4", "InYearFour"], ["year_5", "InYearFive"], ["after_year_5", "AfterYearFive"]];
const LEASES = [["next_12_months", "NextTwelveMonths"], ["year_2", "YearTwo"], ["year_3", "YearThree"], ["year_4", "YearFour"], ["year_5", "YearFive"], ["after_year_5", "AfterYearFive"]];

export async function debtProfile(session, args) {
  const a = debtInput.parse(args);
  const e = await resolveEntity(session, a.company);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`;
  const cf = await getJson(session, url, { maxBytes: 96 * 1024 * 1024 });
  return profileFromFacts(cf, { entity: e, url, years: a.years ?? 5, company: a.company });
}

// The profile from a companyfacts document (pure, for tests).
export function profileFromFacts(cf, { entity: e = {}, url = null, years = 5, company = null } = {}) {
  const a = { years, company };
  const f = cf.facts?.["us-gaap"] ?? {};
  // Annual balance-sheet dates the company reported debt or cash at, newest first.
  const ends = [...new Set(["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtCurrent", "CashAndCashEquivalentsAtCarryingValue"]
    .flatMap((t) => (f[t]?.units?.USD ?? []).filter((x) => ANNUAL.has(x.form) && !x.start && x.fp === "FY").map((x) => x.end)))].sort().reverse();
  if (!ends.length) throw new Error(`${cf.entityName ?? a.company} tags no debt or cash in an annual report's XBRL.`);
  const debtAt = (end) => {
    const total = at(f, "LongTermDebt", end), cur = first(f, ["LongTermDebtCurrent", "DebtCurrent"], end), non = first(f, ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"], end);
    const cp = at(f, "CommercialPaper", end), stb = at(f, "ShortTermBorrowings", end);
    const longTerm = total ?? (cur || non ? { tag: [cur?.tag, non?.tag].filter(Boolean).join(" + "), val: (cur?.val ?? 0) + (non?.val ?? 0) } : null);
    const val = longTerm || cp || stb ? (longTerm?.val ?? 0) + (cp?.val ?? 0) + (stb?.val ?? 0) : null;
    return { val, parts: { long_term: longTerm, current_portion: cur, noncurrent: non, commercial_paper: cp, short_term_borrowings: stb } };
  };
  const end = ends[0];
  const d = debtAt(end);
  const cash = first(f, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], end);
  const securities = at(f, "MarketableSecuritiesCurrent", end);
  const interest = first(f, ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestAndDebtExpense", "InterestPaidNet", "InterestPaid"], end, { duration: true });
  const ebit = at(f, "OperatingIncomeLoss", end, { duration: true });
  const da = first(f, ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"], end, { duration: true });
  const ladder = Object.fromEntries(LADDER.map(([k, s]) => [k, at(f, `LongTermDebtMaturitiesRepaymentsOfPrincipal${s}`, end)?.val ?? null]));
  const leases = Object.fromEntries(LEASES.map(([k, s]) => [k, at(f, `LesseeOperatingLeaseLiabilityPaymentsDue${s}`, end)?.val ?? null]));
  const ladderTotal = Object.values(ladder).reduce((s, v) => s + (v ?? 0), 0);
  const prior = ends.find((x) => days(end, x) > 300 && days(end, x) < 430);
  const avgDebt = prior && debtAt(prior).val ? (d.val + debtAt(prior).val) / 2 : d.val;
  const ebitda = ebit && da ? ebit.val + da.val : null;
  const netDebt = d.val != null ? d.val - (cash?.val ?? 0) - (securities?.val ?? 0) : null;
  const history = ends.slice(0, a.years ?? 5).map((x) => { const y = debtAt(x); return [x, y.val, first(f, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], x)?.val ?? null]; });
  return {
    company: { cik: e.cik, name: cf.entityName ?? e.name, ticker: e.ticker ?? null },
    as_of: end,
    debt: { total: d.val, ...Object.fromEntries(Object.entries(d.parts).map(([k, v]) => [k, v ? v.val : null])) },
    cash_and_equivalents: cash?.val ?? null, current_marketable_securities: securities?.val ?? null, net_debt: netDebt,
    maturities: { ...ladder, ladder_total: ladderTotal || null, due_within_2_years_share: d.parts.long_term?.val && ladderTotal ? round(((ladder.next_12_months ?? 0) + (ladder.year_2 ?? 0)) / ladderTotal) : null },
    operating_lease_payments: Object.values(leases).some((v) => v != null) ? leases : null,
    cost_and_cover: {
      interest_expense: interest?.val ?? null, interest_tag: interest?.tag ?? null,
      implied_interest_rate: interest && avgDebt ? round(interest.val / avgDebt) : null,
      operating_income: ebit?.val ?? null, ebitda,
      interest_coverage: interest?.val && ebit ? round(ebit.val / interest.val, 2) : null,
      debt_to_ebitda: ebitda && d.val != null ? round(d.val / ebitda, 2) : null,
      net_debt_to_ebitda: ebitda && netDebt != null ? round(netDebt / ebitda, 2) : null,
    },
    history: { columns: ["end", "total_debt", "cash"], rows: history },
    tags: Object.fromEntries([...Object.entries(d.parts).map(([k, v]) => [k, v?.tag ?? null]), ["cash", cash?.tag ?? null], ["depreciation", da?.tag ?? null]]),
    ...(d.val == null ? { note: "No standard (us-gaap) debt tag at this year-end: the company tags its debt with its own extension, which SEC's company facts leave out. filing_tables with find \"debt\" reads the debt note from the filing itself." } : {}),
    source: url,
    meaning: "Figures from the company's annual reports as tagged in XBRL, at its latest annual balance-sheet date. total debt = long-term debt (current and noncurrent) + commercial paper + short-term borrowings. maturities are the principal the debt note says falls due in each year. implied_interest_rate = interest expense / average total debt of the last two year-ends; interest_coverage = operating income / interest expense.",
    limits: ["Companies tag debt differently: a missing tag means not tagged, not no debt. Finance leases, guarantees and off-balance-sheet debt are not included unless the company tags them as debt.", "Interest from interest paid (a cash figure) differs from interest expense; interest_tag says which was used.", "Not investment advice."],
  };
}
