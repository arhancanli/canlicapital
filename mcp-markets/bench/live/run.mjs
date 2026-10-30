// Live check of the newer tools against their real sources, with no AI and no keys: each must
// answer and its answer must pass a check that holds whatever the day's data are. Prints PASS or
// FAIL per check; the nightly watch runs it and alerts on a FAIL.
//   node bench/live/run.mjs
import { dividendHistory } from "../../src/dividends.mjs";
import { legalEntity, securityIdentifiers } from "../../src/identifiers.mjs";
import { consumerComplaints, enforcementActions, federalRules, productRecalls, sanctionsCheck } from "../../src/records.mjs";
import { creditCycle, worldYields } from "../../src/world.mjs";
import { filingDiff } from "../../src/diff.mjs";
import { explainMove } from "../../src/explain.mjs";
import { latestFilings } from "../../src/latest.mjs";
import { news } from "../../src/news.mjs";
import { screenCompanies } from "../../src/research.mjs";
import { createSession } from "../../src/sources.mjs";
import { portfolioXray } from "../../src/xray.mjs";
import { comps } from "../../src/comps.mjs";
import { federalContracts } from "../../src/contracts.mjs";
import { commentLetters } from "../../src/letters.mjs";
import { drugPipeline } from "../../src/pipeline.mjs";
import { reverseDcf } from "../../src/valuation.mjs";
import { bankFinancials } from "../../src/banks.mjs";
import { filingDrift } from "../../src/drift.mjs";
import { ipoPipeline } from "../../src/ipos.mjs";
import { plannedInsiderSales } from "../../src/planned.mjs";
import { debtProfile } from "../../src/credit.mjs";
import { ownershipBreadth } from "../../src/breadth.mjs";
import { forensicScores } from "../../src/forensic.mjs";
import { fundingRates } from "../../src/funding.mjs";
import { computePrices } from "../../src/compute.mjs";
import { shareholderReturns } from "../../src/payouts.mjs";
import { marketOverview } from "../../src/overview.mjs";

const s = createSession();
const day = (k) => new Date(Date.now() - k * 86400000).toISOString().slice(0, 10);
// The last weekday before yesterday: a day with a close.
const lastSession = (() => { for (let k = 2; k < 9; k += 1) { const d = new Date(Date.now() - k * 86400000); if (d.getUTCDay() % 6) return d.toISOString().slice(0, 10); } return day(3); })();
const CHECKS = [
  ["latest_filings", () => latestFilings(s, { forms: ["8-K"], limit: 50 }), (r) => r.rows.length > 0 && r.rows.every((x) => x[1].startsWith("8-K"))],
  ["filing_diff", () => filingDiff(s, { company: "AAPL" }), (r) => r.summary.new_paragraphs > 20 && r.summary.unchanged > 0 && r.older.filed < r.newer.filed],
  ["news", () => news(s, { company: "MSFT", days: 3, tone: false }), (r) => Array.isArray(r.articles.rows)],
  ["explain_move", () => explainMove(s, { symbol: "MSFT", date: lastSession, news: false }), (r) => Number.isFinite(r.move.return) && Number.isFinite(r.move.z_score)],
  ["portfolio_xray", () => portfolioXray(s, { holdings: [{ symbol: "IVV", weight: 1 }, { symbol: "AAPL", weight: 1 }], top: 5 }), (r) => r.positions_after_look_through > 400 && r.rows[0][1] > 0.05],
  ["comps", () => comps(s, { company: "NVDA", peers: 5 }), (r) => r.rows.length >= 4 && r.rows[0][0] === "NVDA" && r.company.sic === "3674"],
  ["debt_profile", () => debtProfile(s, { company: "T" }), (r) => r.debt.total > 5e10 && r.maturities.ladder_total > 0 && r.cost_and_cover.interest_coverage > 0],
  ["ownership_breadth", () => ownershipBreadth(s, { company: "AAPL", quarters: 2 }), (r) => r.cusip === "037833100" && r.rows[1][3] > 3000],
  ["forensic_scores", () => forensicScores(s, { company: "CAT" }), (r) => Number.isFinite(r.beneish.m_score) && Number.isInteger(r.piotroski.f_score) && Number.isFinite(r.altman.z_score)],
  ["federal_contracts", () => federalContracts(s, { company: "LMT", limit: 3 }), (r) => r.obligated_total > 1e10 && r.agencies.rows[0][0] === "Department of Defense" && r.largest_contracts.rows.length === 3],
  ["drug_pipeline", () => drugPipeline(s, { company: "VRTX" }), (r) => r.active_trials >= 10 && r.by_phase.some(([p]) => p === "Phase 3") && r.fda_approvals.rows.length >= 5],
  ["enforcement_actions", () => enforcementActions(s, {}), (r) => r.matched >= 25 && /^20\d\d-/.test(r.rows[0][0])],
  ["consumer_complaints", () => consumerComplaints(s, { company: "Wells Fargo" }), (r) => r.company === "WELLS FARGO & COMPANY" && r.complaints > 100000],
  ["product_recalls", () => productRecalls(s, { company: "Pfizer", vehicle: { make: "ford", model: "f-150", year: 2023 } }), (r) => r.fda.totals.drug > 100 && r.nhtsa.recalls > 0],
  ["sanctions_check", () => sanctionsCheck(s, { name: "Banco Nacional de Cuba" }), (r) => r.rows[0]?.[0] === 306 && r.list_entries_read > 10000],
  ["federal_rules", () => federalRules(s, { agency: "sec", type: "rule", limit: 3 }), (r) => r.matched > 100 && r.rows.length === 3],
  ["security_identifiers", () => securityIdentifiers(s, { id: "US0378331005" }), (r) => r.rows.some((x) => x[2] === "AAPL" && x[0] === "BBG000B9XRY4")],
  ["legal_entity", () => legalEntity(s, { name: "Apple Inc." }), (r) => r.lei === "HWUPKR0MPOU8FGXBT394"],
  ["world_yields", () => worldYields(s, {}), (r) => ["us", "euro", "uk", "japan", "canada"].every((k) => !r.curves[k].error) && r.rows.find((x) => x[0] === "10Y").slice(1).every((v) => v === null || (v > 0 && v < 25))],
  ["credit_cycle", () => creditCycle(s, { countries: ["US"], quarters: 2 }), (r) => r.latest.rows[0][2] > 50],
  ["dividend_history", () => dividendHistory(s, { symbol: "AAPL", years: 15 }), (r) => r.splits.rows.some(([d, x]) => d === "2020-08-31" && x === "4:1")],
  ["comment_letters", () => commentLetters(s, { company: "AAPL", read: 2 }), (r) => r.staff_letters >= 1 && r.company_replies >= 1 && r.recent.rows.length >= 1],
  ["reverse_dcf", () => reverseDcf(s, { company: "MSFT" }), (r) => typeof r.implied_growth === "number" && r.implied_growth > -0.2 && r.implied_growth < 0.6 && r.sensitivity.rows.length >= 3],
  ["bank_financials", () => bankFinancials(s, { company: "WAL", quarters: 4 }), (r) => r.bank.cert === 57512 && r.rows.length === 4 && r.rows.every((x) => x[1] > 1e7)],
  ["bank_failures", () => bankFinancials(s, { failures: 3 }), (r) => r.failures.rows.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(r.failures.rows[0][3])],
  ["filing_drift", () => filingDrift(s, { company: "NVDA", years: 3, theme: "export" }), (r) => r.rows.length === 3 && r.rows[0][2] > 5000 && r.rows[0][4] != null],
  ["planned_insider_sales", () => plannedInsiderSales(s, { company: "NVDA", days: 365, limit: 5 }), (r) => r.notices >= 1 && r.rows.every((x) => x[1] && x[4] > 0)],
  ["ipo_pipeline", () => ipoPipeline(s, { days: 30, priced: 5 }), (r) => r.registrations.rows.length >= 1 && r.priced.rows.length >= 1],
  ["compute_prices", () => computePrices(s, { gpu: "H100" }), (r) => r.rows.length >= 3 && r.rows.every((x) => x[2] > 0) && r.index.level > 0],
  ["shareholder_returns", () => shareholderReturns(s, { company: "KO", years: 5 }), (r) => r.rows.length === 5 && r.rows.every((x) => x[1] > 0 && x[2] > 0) && r.dividends.raised_years_in_a_row >= 10 && r.yields?.dividend_yield > 0],
  ["market_overview", () => marketOverview(s, {}), (r) => r.sectors.length === 11 && r.us.length >= 5 && r.rates.every((x) => x[3] > 0 && x[3] < 20) && (r.missing ?? []).length <= 2],
  ["ownership_breadth_by_name", () => ownershipBreadth(s, { company: "COST", quarters: 2, holders: 1 }), (r) => r.cusip === "22160K105" && r.rows[0][3] > 1000],
  ["funding_rates", () => fundingRates(s, { coins: ["BTC", "ETH"], days: 7 }), (r) => r.rows.length === 2 && r.rows.every((x) => x[7] >= 15)],
  ["screen_window", () => screenCompanies(s, { fiscal_year_end: [day(500), day(120)], filters: [{ metric: "revenue", op: ">", value: 1e11 }], limit: 50 }), (r) => r.matched >= 10 && r.rows.every((x) => x[4] >= day(500) && x[4] <= day(120))],
];
let failed = 0;
for (const [name, run, ok] of CHECKS) {
  const t0 = Date.now();
  try {
    const r = await run();
    const pass = ok(r);
    if (!pass) failed += 1;
    console.log(`${pass ? "PASS" : "FAIL"} ${name} ${Date.now() - t0}ms`);
  } catch (err) { failed += 1; console.log(`FAIL ${name} ${Date.now() - t0}ms ${String(err.message).slice(0, 200)}`); }
}
process.exitCode = failed ? 1 : 0;
