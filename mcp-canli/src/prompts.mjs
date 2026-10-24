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
    description: "Where the US economy and rates stand: the Fed's latest decision and projections, what Polymarket and Kalshi traders price for its next decisions, SOFR against the Fed's range, the key releases of the next two weeks, inflation, core PCE and unemployment over the last year, the Treasury curve and the VIX futures curve.",
    args: {},
    calls: () => [
      { name: "fomc", arguments: {} },
      { name: "prediction_markets", arguments: { query: "fed decision", limit: 2 } },
      { name: "reference_rates", arguments: { rate: "sofr" } },
      { name: "economic_calendar", arguments: { key_only: true } },
      { name: "economic_series", arguments: { series: "CPIAUCSL", transform: "yoy", last: 13 } },
      { name: "economic_series", arguments: { series: "PCEPILFE", transform: "yoy", last: 13 } },
      { name: "economic_series", arguments: { series: "UNRATE", last: 13 } },
      { name: "treasury_yields", arguments: {} },
      { name: "futures_curve", arguments: { product: "vix" } },
    ],
    ask: (a) => `Give me a US macro snapshot with canli-mcp. ${batch(PROMPTS.macro_snapshot.calls(a))}\nThen write: the Fed's latest decision, vote and the median projections; what prediction-market traders pay for each outcome of the next decisions (traders' prices, not forecasts, with the volume behind them); where SOFR sits against the Fed's target range; what is due in the next two weeks; inflation (CPI and core PCE, year on year) and unemployment over the last year; the shape of the Treasury curve; and whether the VIX futures are in contango or backwardation. ${SOURCES}`,
  },
  global_rates: {
    title: "Rates around the world",
    description: "The Fed's, the ECB's, the Bank of England's and the Bank of Japan's policy rates, the overnight rates banks pay beside them (SOFR, the euro short-term rate, SONIA) and the US Treasury curve, each from the central bank or the BIS itself.",
    args: {},
    calls: () => [
      { name: "reference_rates", arguments: { rate: "effr" } },
      { name: "reference_rates", arguments: { rate: "sofr" } },
      { name: "reference_rates", arguments: { rate: "ecb_deposit" } },
      { name: "reference_rates", arguments: { rate: "estr" } },
      { name: "reference_rates", arguments: { rate: "bank_rate" } },
      { name: "reference_rates", arguments: { rate: "sonia" } },
      { name: "reference_rates", arguments: { rate: "policy:JP" } },
      { name: "treasury_yields", arguments: {} },
    ],
    ask: (a) => `Show me rates around the world with canli-mcp. ${batch(PROMPTS.global_rates.calls(a))}\nThen write: each central bank's policy rate now, with the date and size of its last change (a rate's first row says since when it has been in effect); where each overnight rate sits against its central bank's rate (SOFR and the effective fed funds rate against the Fed's target range, the euro short-term rate against the ECB's deposit rate, SONIA against Bank Rate); and the shape of the US Treasury curve. Name each publisher, and say where a rate's latest date lags the others. ${SOURCES}`,
  },
  european_company: {
    title: "A European company's annual report",
    description: "A European listed company's latest annual financial report as it filed it in the European Single Electronic Format: revenue, operating and net profit, EPS, assets, equity, cash flows and dividends beside the prior years, in its own currency, linked to the report.",
    args: { company: z.string().min(2).max(120).describe("The company's name (Novo Nordisk, ASML, TotalEnergies) or its LEI.") },
    calls: ({ company }) => [
      { name: "european_filings", arguments: { company } },
    ],
    ask: (a) => `Show me ${a.company}'s latest annual report with canli-mcp. ${batch(PROMPTS.european_company.calls(a))}\nThen write: which company and report this is (the period it covers and when it was added); revenue, operating profit, net profit and EPS for the year against the prior years, with growth; cash from operations, total assets and equity; and dividends. Use the currency the company tagged, at the scale given, and link the report and its viewer. If the name matched a company other than the one meant (also_matched, passed over), say so. ${SOURCES}`,
  },
  defi_snapshot: {
    title: "DeFi and stablecoins",
    description: "The supply of the two largest stablecoins and its change, the value locked on Ethereum and Solana, and a DeFi protocol's value locked, fees and revenue, from DefiLlama's open data.",
    args: { protocol: z.string().min(2).max(80).regex(/^[A-Za-z0-9 .\-]+$/, "a protocol's name, such as aave or lido").optional().describe("A DeFi protocol to look at as well, e.g. lido or uniswap; default aave.") },
    calls: ({ protocol }) => [
      { name: "crypto_fundamentals", arguments: { stablecoin: "USDT" } },
      { name: "crypto_fundamentals", arguments: { stablecoin: "USDC" } },
      { name: "crypto_fundamentals", arguments: { chain: "Ethereum", days: 90 } },
      { name: "crypto_fundamentals", arguments: { chain: "Solana", days: 90 } },
      { name: "crypto_fundamentals", arguments: { protocol: protocol ?? "aave", days: 90 } },
    ],
    ask: (a) => `Give me a DeFi and stablecoin snapshot with canli-mcp. ${batch(PROMPTS.defi_snapshot.calls(a))}\nThen write: the stablecoins' supply and its change over a day, a week and a month (money arriving in or leaving crypto); the value locked on Ethereum and on Solana and how it moved over 90 days; and ${a.protocol ?? "aave"}'s value locked, the fees its users paid and the revenue it kept over the last 30 days and year. Say these are DefiLlama's measures, which value deposits at market prices. ${SOURCES}`,
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
  filing_changes: {
    title: "What changed in the 10-K",
    description: "What a company changed in its latest annual report against the one before: new, dropped and rewritten risk factors and MD&A paragraphs, and the words whose use rose most.",
    args: { ticker: TICKER },
    calls: ({ ticker }) => [
      { name: "filing_diff", arguments: { company: ticker, section: "risk factors" } },
      { name: "filing_diff", arguments: { company: ticker, section: "md&a" } },
    ],
    ask: (a) => `Show me what ${a.ticker} changed in its latest 10-K with canli-mcp. ${batch(PROMPTS.filing_changes.calls(a))}\nThen write: the risks it added, dropped and rewrote (quoting the changed sentences), what changed in how management describes the business and results, and the words whose use rose most, with the two filings' dates. Say plainly where a section could not be matched. ${SOURCES}`,
  },
  why_it_moved: {
    title: "Why did the stock move?",
    description: "A day's move against the market, how unusual it was from a one-year market model, and the filings and news around it.",
    args: { ticker: TICKER, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD").describe("The trading day of the move, e.g. 2026-10-23.") },
    calls: ({ ticker, date }) => [
      { name: "explain_move", arguments: { symbol: ticker, date } },
    ],
    ask: (a) => `Explain ${a.ticker}'s move on ${a.date} with canli-mcp. ${batch(PROMPTS.why_it_moved.calls(a))}\nThen write: the day's return, the market's, and the move beyond the market with how unusual it was (its z-score); the filings and headlines around the day with their times; and which of them plausibly explains the move, saying plainly when nothing does. ${SOURCES}`,
  },
  portfolio_xray: {
    title: "Portfolio X-ray",
    description: "What a portfolio of stocks and funds really holds: the look-through positions across every fund, the overlap between the funds, and the largest exposures.",
    args: { holdings: z.string().min(2).max(600).regex(/^[A-Za-z0-9.\- ]+:\s*\d+(\.\d+)?(\s*,\s*[A-Za-z0-9.\- ]+:\s*\d+(\.\d+)?)*$/, "symbol:weight pairs, e.g. VOO:60, QQQ:30, AAPL:10").describe("Symbols and weights (or values), e.g. VOO:60, QQQ:30, AAPL:10.") },
    calls: ({ holdings }) => [
      { name: "portfolio_xray", arguments: { holdings: String(holdings).split(",").map((x) => x.split(":")).map(([s, w]) => ({ symbol: s.trim().toUpperCase(), weight: Number(w) || 1 })) } },
    ],
    ask: (a) => `X-ray this portfolio with canli-mcp: ${a.holdings}. ${batch(PROMPTS.portfolio_xray.calls(a))}\nThen write: the largest look-through positions with their weights, how much the funds overlap with each other, and anything concentrated that the fund names hide. Name the date of each fund's holdings report. ${SOURCES}`,
  },
  peers_and_red_flags: {
    title: "Peers and red flags",
    description: "A company against its industry peers, its debt and borrowing, how many institutions hold it quarter by quarter, and three accounting screens (Beneish, Piotroski, Altman) with every input named.",
    args: { ticker: TICKER },
    calls: ({ ticker }) => [
      { name: "comps", arguments: { company: ticker } },
      { name: "debt_profile", arguments: { company: ticker } },
      { name: "ownership_breadth", arguments: { company: ticker } },
      { name: "forensic_scores", arguments: { company: ticker } },
    ],
    ask: (a) => `Compare ${a.ticker} with its peers and check it for red flags with canli-mcp. ${batch(PROMPTS.peers_and_red_flags.calls(a))}\nThen write: where it ranks against its peers on growth, margins and valuation; its debt, maturities and implied borrowing cost; whether institutions are adding or leaving it; and each accounting screen's reading with the inputs behind it. These are screens from past studies, not verdicts. ${SOURCES}`,
  },
  human_check: {
    title: "Check an AI answer with people",
    description: "Turn a draft about a company into a blind labelling packet: every figure as an item people check against the filings, with guidelines and an answer key, so the agreement between them can be measured.",
    args: { company: z.string().min(1).max(120).describe("The company the draft is about (ticker or name)."), draft: z.string().min(10).max(6000).describe("The draft whose figures people should check.") },
    calls: ({ company, draft }) => [
      { name: "annotation_packet", arguments: { task: "draft-check", text: draft, company } },
    ],
    ask: (a) => `Make a human check of this draft about ${a.company} with canli-mcp. ${batch(PROMPTS.human_check.calls(a))}\nThen say where the packet's files are, how many figures it holds, how to hand the blind sheets to two or more people, and that annotation_agreement measures their agreement once they return them, and annotation_gold turns the agreed labels into a gold set.`,
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
