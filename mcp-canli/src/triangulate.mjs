// One company's headline figures reached by separate roads: the statement as the company rendered it, the
// report built from SEC's XBRL facts, and the point-in-time history. Figures that come through every road the
// same can be trusted; any disagreement is a filer's slip or a reading error, and either way worth knowing.
import { z } from "zod";

export const triangulateInput = z.object({ company: z.string().min(1).max(120).describe("Ticker, CIK or name.") }).strict();

export const TRIANGULATE_TOOL = Object.freeze({
  name: "triangulate", pack: "desk", toolset: "desk", title: "Check a company's figures by separate roads", input: triangulateInput,
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "Reach a company's latest annual revenue, net income, EPS, operating income, assets, equity and cash by three separate roads (the statement as filed, the XBRL facts and the point-in-time history) and say where they disagree, and by how much. Run it before relying on a figure, or across an index with swarm to find every filing whose numbers do not line up.",
  keywords: "cross check verify reconcile disagree trust audit data quality triangulate second source tagging error same figure three sources",
  args: "company: string",
});

const G = (...t) => t.flatMap((x) => [`us-gaap:${x}`]);
const MEASURES = [
  { key: "revenue", statement: "income", history: "revenue", report: "revenue", tags: [...G("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax", "RevenuesNetOfInterestExpense"), "ifrs-full:Revenue", "ifrs-full:RevenueFromContractsWithCustomers"] },
  { key: "net_income", statement: "income", history: "net_income", report: "net_income", tags: [...G("NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"), "ifrs-full:ProfitLossAttributableToOwnersOfParent", "ifrs-full:ProfitLoss"] },
  { key: "eps_diluted", statement: "income", history: "eps_diluted", report: "eps_diluted", perShare: true, tags: [...G("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"), "ifrs-full:DilutedEarningsLossPerShare"] },
  { key: "operating_income", statement: "income", history: "operating_income", tags: [...G("OperatingIncomeLoss"), "ifrs-full:ProfitLossFromOperatingActivities"] },
  { key: "assets", statement: "balance_sheet", history: "assets", tags: [...G("Assets"), "ifrs-full:Assets"] },
  { key: "equity", statement: "balance_sheet", history: "equity", tags: [...G("StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"), "ifrs-full:EquityAttributableToOwnersOfParent", "ifrs-full:Equity"] },
  { key: "cash", statement: "balance_sheet", history: "cash", report: "cash", tags: [...G("CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"), "ifrs-full:CashAndCashEquivalents"] },
];

const endOf = (label) => String(label).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;

// A measure's latest value on a rendered statement, in full amounts.
export function fromStatement(table, m) {
  if (!table?.rows?.length) return null;
  // A filing by several registrants runs their statements together, the parent first (Southern, Entergy).
  // The parent's ends where a line that closes a statement comes round again.
  const closing = table.rows.findIndex((r, i) => /:(Revenues|Assets|OperatingRevenues|RevenueFromContractWithCustomerExcludingAssessedTax)$/.test(String(r[1])) && typeof r[2] === "number" && table.rows.slice(0, i).some((u) => u[1] === r[1]));
  const rows = closing > 0 ? table.rows.slice(0, closing) : table.rows;
  const column = table.columns.findIndex((c, i) => i >= 2 && endOf(c) && (m.statement === "balance_sheet" || /^12 months/.test(c)));
  if (column < 0) return null;
  // Every line of the measure on the statement: net income before and after preferred dividends are both the
  // company's own, and either may be the one the other roads carry.
  const lines = m.tags.flatMap((tag) => rows.filter((r) => r[1] === tag && typeof r[column] === "number").slice(0, 1).map((r) => ({ tag, value: m.perShare ? r[column] : r[column] * (table.money_scale ?? 1) })));
  return lines.length ? { value: lines[0].value, tag: lines[0].tag, end: endOf(table.columns[column]), lines } : null;
}

// How two figures for one line stand: the same within rounding, apart by a whole scale, or just apart. A
// statement in millions rounds to half a million, so the tolerance follows its units.
export function compare(a, b, { perShare, scale = 1 } = {}) {
  if (a == null || b == null) return null;
  const slack = perShare ? 0.011 : Math.max(Math.abs(a), Math.abs(b)) * 0.001 + scale;
  if (Math.abs(a - b) <= slack) return "agree";
  if (a && b) {
    const r = Math.abs(a / b);
    for (const k of [1e3, 1e6, 1e9]) if (Math.abs(r / k - 1) < 0.01 || Math.abs((1 / r) / k - 1) < 0.01) return `apart by a factor of ${k.toLocaleString("en-US")}`;
  }
  if (a && Math.abs(a + b) <= slack) return "opposite signs";
  return `apart by ${(Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) * 100).toFixed(1)}%`;
}

export async function runTriangulate(ctx, args) {
  const a = triangulateInput.parse(args);
  const attempt = (name, input) => ctx.call(name, input).catch(() => null);
  // One company on every road: the ticker the report resolved, since each road reads names its own way.
  const report = await attempt("company_report", { company: a.company, years: 2 });
  const who = report?.company?.ticker ?? a.company;
  const [statements, ...histories] = await Promise.all([
    attempt("financial_statements", { company: who, statement: "core", period: "annual", filings: 1 }),
    ...MEASURES.map((m) => attempt("history", { company: who, concept: m.history, periods: "annual", limit: 3 })),
  ]);
  const reportRow = (end) => {
    const f = report?.financials;
    const r = f?.rows?.find((x) => x[0] === end);
    return r ? Object.fromEntries(f.columns.map((c, i) => [c, r[i]])) : null;
  };
  const rows = [], problems = [];
  let end = null;
  MEASURES.forEach((m, i) => {
    const s = fromStatement(statements?.[m.statement], m);
    end = end ?? s?.end ?? null;
    const at = s?.end ?? end;
    const hist = histories[i]?.rows?.find((x) => x[0] === at)?.[2] ?? null;
    const rep = m.report && at ? reportRow(at)?.[m.report] ?? null : null;
    const scale = s && !m.perShare ? statements[m.statement].money_scale ?? 1 : 1;
    // Agreement with any of the statement's lines for the measure counts.
    const against = (other) => { const v = compare(s?.value, other, { perShare: m.perShare, scale }); return v && v !== "agree" && s.lines.some((l) => compare(l.value, other, { perShare: m.perShare, scale }) === "agree") ? "agree" : v; };
    const verdicts = [["facts", against(rep)], ["history", against(hist)]];
    if (s == null) verdicts.push(["facts and history", compare(rep, hist, { perShare: m.perShare })]);
    const off = verdicts.filter(([, v]) => v && v !== "agree");
    const roads = [s?.value, rep, hist].filter((v) => v != null).length;
    rows.push([m.key, s?.value ?? null, rep, hist, roads, roads < 2 ? "one road only" : off.length ? off.map(([w, v]) => `${w}: ${v}`).join("; ") : "agree"]);
    if (off.length) problems.push(`${m.key} (${off.map(([w, v]) => `${w} ${v}`).join(", ")})`);
  });
  const checked = rows.filter((r) => r[4] >= 2).length;
  return {
    company: report?.company ? { name: report.company.name, ticker: report.company.ticker, cik: report.company.cik } : { asked: a.company },
    fiscal_year_end: end,
    filing: statements?.filings?.rows?.[0] ? { form: statements.filings.rows[0][1], filed: statements.filings.rows[0][2], index: statements.filings.rows[0][4] } : null,
    checked, agreements: checked - problems.length, disagreements: problems.length, disagreement_text: problems.join("; ") || null,
    columns: ["measure", "statement_as_filed", "xbrl_facts", "point_in_time_history", "roads", "reading"], rows,
    meaning: "Each figure reached by separate code from separate SEC files. Agreement is within the statement's rounding. A disagreement is a filer's tagging slip, a restatement, a measure defined differently, or a reading error here: open the filing to see which.",
    limits: ["The roads share one origin, the company's own filing: this finds inconsistency, not fraud or error in what the company reports.", "History comes from Canli Capital's dated company reference, which can lag a recent filing; its absence is shown, not counted against the figure.", "Not investment advice."],
  };
}
