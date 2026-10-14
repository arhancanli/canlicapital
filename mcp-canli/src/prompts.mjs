// Workflows across the packs, offered as MCP prompts (slash commands in Claude Desktop and Claude
// Code). Each names the tools and arguments to run in one batched run_tool call, so a model answers
// in a turn or two, and says what to write from the results. Prompts cost nothing in a request's
// context until one is chosen. test/prompts.test.mjs checks every call against its tool's schema.
import { z } from "zod";

const TICKER = z.string().min(1).max(12).regex(/^[A-Za-z0-9.\-^=/]+$/, "a ticker such as AAPL").describe("A ticker, e.g. AAPL.");
const json = (v) => JSON.stringify(v);
const batch = (calls) => `In one run_tool call, run these together:\n${json({ calls })}`;
const SOURCES = "Give each figure's source URL from the results, say which figures are estimates, and say where a tool returned nothing rather than filling the gap.";

export const PROMPTS = Object.freeze({
  company_brief: {
    title: "Company brief",
    description: "A company's financials, its latest 8-K news with press-release headlines, its latest results against its guidance, its next earnings date, insider trades, short interest and the options market's expected move, from the filings and exchanges themselves.",
    args: { ticker: TICKER },
    calls: ({ ticker }) => [
      { name: "company_report", arguments: { company: ticker } },
      { name: "company_events", arguments: { company: ticker, limit: 8 } },
      { name: "earnings_calendar", arguments: { company: ticker, quarters: 4 } },
      { name: "earnings_release", arguments: { company: ticker } },
      { name: "insider_trades", arguments: { company: ticker } },
      { name: "short_interest", arguments: { symbol: ticker } },
      { name: "options_chain", arguments: { symbol: ticker } },
    ],
    ask: (a) => `Brief me on ${a.ticker} with canli-mcp. ${batch(PROMPTS.company_brief.calls(a))}\nThen write the brief in plain words: the business and its latest financials; what it announced recently (8-K headlines, with dates); its latest results against the guidance it gave for them, and what it guides to now; when it next reports results; insider buying or selling; short interest and days to cover; the move the options market prices in. ${SOURCES}`,
  },
  earnings_preview: {
    title: "Earnings preview",
    description: "Before a company reports: when (estimated from its own filing history, before the open or after the close), what it guided for the quarter and whether it met its last guidance, the move the options market prices in, how the stock reacted to past results, and where its revenue comes from.",
    args: { ticker: TICKER },
    calls: ({ ticker }) => [
      { name: "earnings_calendar", arguments: { company: ticker } },
      { name: "options_chain", arguments: { symbol: ticker } },
      { name: "event_study", arguments: { symbol: ticker, event_type: "earnings" } },
      { name: "company_events", arguments: { company: ticker, event: "earnings", limit: 4 } },
      { name: "earnings_release", arguments: { company: ticker } },
      { name: "segment_revenue", arguments: { company: ticker } },
    ],
    ask: (a) => `Prepare an earnings preview for ${a.ticker} with canli-mcp. ${batch(PROMPTS.earnings_preview.calls(a))}\nThen write: the expected date and its window (an estimate from the company's own history, not an announcement), and whether it usually reports before the open or after the close; what the company guided for the quarter it is about to report (from its last release, as ranges with the sentence quoted) and whether it met its previous guidance; the expected move from the at-the-money straddle against the average past reaction from the event study; what the last results releases said (headlines); and which segments drive revenue. ${SOURCES}`,
  },
  macro_snapshot: {
    title: "US macro snapshot",
    description: "Where the US economy and rates stand: the Fed's latest decision and projections, the key releases of the next two weeks, inflation, core PCE and unemployment over the last year, the Treasury curve and the VIX futures curve.",
    args: {},
    calls: () => [
      { name: "fomc", arguments: {} },
      { name: "economic_calendar", arguments: { key_only: true } },
      { name: "economic_series", arguments: { series: "CPIAUCSL", transform: "yoy", last: 13 } },
      { name: "economic_series", arguments: { series: "PCEPILFE", transform: "yoy", last: 13 } },
      { name: "economic_series", arguments: { series: "UNRATE", last: 13 } },
      { name: "treasury_yields", arguments: {} },
      { name: "futures_curve", arguments: { product: "vix" } },
    ],
    ask: (a) => `Give me a US macro snapshot with canli-mcp. ${batch(PROMPTS.macro_snapshot.calls(a))}\nThen write: the Fed's latest decision, vote and the median projections; what is due in the next two weeks; inflation (CPI and core PCE, year on year) and unemployment over the last year; the shape of the Treasury curve; and whether the VIX futures are in contango or backwardation. ${SOURCES}`,
  },
  ownership: {
    title: "Who owns and trades a stock",
    description: "A company's 5% holders and activists (13D/13G), its insiders' buying and selling (Form 4), and its short interest, each from the filing or FINRA report itself.",
    args: { ticker: TICKER },
    calls: ({ ticker }) => [
      { name: "large_holders", arguments: { company: ticker } },
      { name: "insider_trades", arguments: { company: ticker } },
      { name: "short_interest", arguments: { symbol: ticker } },
    ],
    ask: (a) => `Show me who owns and trades ${a.ticker} with canli-mcp. ${batch(PROMPTS.ownership.calls(a))}\nThen write: the largest holders and any activist stake (13D) with dates; whether insiders have been buying or selling, separating open-market trades from grants and tax withholding; and the short interest trend. ${SOURCES}`,
  },
  financial_history: {
    title: "Financials as filed",
    description: "A company's income statement, balance sheet and cash flows for four years exactly as it filed them, with what a later filing restated or a split changed shown beside the first-reported figures.",
    args: { ticker: TICKER },
    calls: ({ ticker }) => [
      { name: "financial_statements", arguments: { company: ticker, filings: 2 } },
    ],
    ask: (a) => `Show me ${a.ticker}'s financials as filed with canli-mcp. ${batch(PROMPTS.financial_history.calls(a))}\nThen write: revenue, operating income, net income and diluted EPS for each year, with growth; cash from operations and capital spending; and the balance sheet's cash, debt and equity. Name the units from each statement's units field (\"$ in Millions\"), and say plainly where a line was restated or a split changed per-share figures (the revised and other_basis tables). ${SOURCES}`,
  },
  fact_check: {
    title: "Fact-check a draft",
    description: "Check every reported figure in a draft about a company against its filings: confirmed, contradicted (with the filed figure and what the wrong one matches), or not reported, before the draft is used.",
    args: { ticker: TICKER, draft: z.string().min(10).max(6000).describe("The draft answer whose figures to check.") },
    calls: ({ ticker, draft }) => [
      { name: "verify_claims", arguments: { company: ticker, text: draft } },
    ],
    ask: (a) => `Fact-check this draft about ${a.ticker} with canli-mcp before it is used. ${batch(PROMPTS.fact_check.calls(a))}\nThen give the draft back corrected: keep confirmed figures; replace each contradicted one with the filed figure, saying what the wrong one was (another year, a quarter, a unit slip); remove or mark claims the filings do not report; and list figures that could not be checked (non-GAAP, guidance, segment data) so they can be checked another way. Cite each figure's source URL.`,
  },
  backtest_check: {
    title: "Is my backtest real?",
    description: "Audit a strategy's daily returns for overfitting: deflated Sharpe for the number of variants tried, the minimum track record, and what to run next (leakage and placebo checks).",
    args: { returns_file: z.string().min(1).max(500).describe("A CSV of the strategy's daily returns, one column."), trials: z.string().regex(/^\d{1,6}$/, "a whole number").optional().describe("How many variants were tried before this one; default 1.") },
    calls: ({ returns_file, trials }) => [
      { name: "audit_backtest", arguments: { returns_file, periods_per_year: 252, effective_independent_trials: Number(trials ?? 1) } },
    ],
    ask: (a) => `Check whether the backtest in ${a.returns_file} is real with canli-mcp. ${batch(PROMPTS.backtest_check.calls(a))}\nThen explain the verdict in plain words: the Sharpe ratio after deflating for ${a.trials ?? 1} variant(s) tried, how long a track record it needs, and what could still be wrong. Then run check_leakage and placebo_test (action "plan") and say what each would test. These are statistical checks on the returns given, not a guarantee.`,
  },
});

// Only the workflows whose every tool is in an enabled pack (CANLI_PACKS, CANLI_OFFLINE) of this build.
export function availablePrompts(byName, packs) {
  return Object.entries(PROMPTS).filter(([, p]) => p.calls(Object.fromEntries(Object.keys(p.args).map((k) => [k, "X"]))).every((c) => packs.includes(byName.get(c.name)?.pack)));
}

export function registerPrompts(server, byName, packs) {
  for (const [name, p] of availablePrompts(byName, packs)) {
    server.registerPrompt(name, { title: p.title, description: p.description, argsSchema: p.args }, (args) => ({
      messages: [{ role: "user", content: { type: "text", text: p.ask(args ?? {}) } }],
    }));
  }
}
