#!/usr/bin/env node
// canli-markets-mcp: public market data for agents, from the sources themselves. SEC EDGAR
// (filings and their sections, full-text search, insider trades, 13F holdings), the US Treasury
// yield curves, FRED economic series and prices need no key; prices use the user's own Alpaca or
// Tiingo key when one is set. Every request goes from this machine straight to the source; nothing passes through Canli
// Capital, and every result names the URL it came from.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { createSession, evidenceScope } from "./sources.mjs";
import * as R from "./research.mjs";
import * as T from "./tools.mjs";

export const SERVER_NAME = "canli-markets-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SERVER_INSTRUCTIONS = "Market data and research from the public sources themselves. Across the market: screen_companies ranks every US-listed company on fundamentals, company_report gives one company's financials, valuation, risk, insiders and filings in one call, event_study measures price reactions to earnings or insider trades, mentions_trend counts a phrase in filings over time. Companies: company_profile, list_filings, then read_filing (section \"risk factors\", \"md&a\" and so on for a 10-K or 10-Q; document \"EX-99.1\" for an 8-K press release); search_filings finds words across all filings. Ownership: insider_trades (Form 4) and fund_holdings (13F). Rates and the economy: treasury_yields and economic_series (FRED). Prices: price_history (no key needed; the user's Alpaca or Tiingo key is used when set). Every result has its source URL; cite it.";
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME, version: SERVER_VERSION, title: "Canli Markets",
  websiteUrl: "https://canlicapital.com/developers",
  icons: [{ src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] }, { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
});

export const TOOL_DESCRIPTIONS = Object.freeze({
  company_profile: "A company's or fund's SEC profile by ticker, CIK or name: tickers, exchange, industry (SIC), fiscal year end, state, address, former names, and its latest 10-K, 10-Q, 8-K and 13F.",
  list_filings: "A company's SEC filings, newest first, filtered by form type (10-K, 10-Q, 8-K, DEF 14A, S-1, 4, 13F-HR...) and dates, with links. Use read_filing to read one.",
  read_filing: "The text of an SEC filing: the latest of a form, or one by accession. For a 10-K or 10-Q, section returns one item (\"risk factors\", \"md&a\", \"business\", \"market risk\", \"legal proceedings\", or a number such as \"1A\"); without it the result lists the items and their lengths. document reads an exhibit, such as an 8-K's press release (\"EX-99.1\"). find returns only the passages with given words (\"employees\", \"buyback\"), the fastest way to a fact in a long filing; otherwise long text pages with offset.",
  search_filings: "Full-text search across all SEC filings since 2001 (EDGAR full-text search): which companies mention a phrase, filtered by form, filer and dates. Quote phrases.",
  insider_trades: "Insider transactions at a company from its Form 4 filings: who (officers, directors, 10% owners), what (open-market buys and sales, option exercises, tax withholding, gifts), shares, price, value, holdings after, and 10b5-1 plan flags, with a buy/sell summary. Default: the last 90 days.",
  fund_holdings: "A fund manager's 13F holdings for a quarter (latest by default): positions by value with portfolio weights, the total checked against the filing's cover page, and what changed since the previous quarter (new, exited, added, reduced).",
  treasury_yields: "US Treasury daily yields from the Treasury itself: the par yield curve (1 month to 30 years), real (TIPS) yields or bill rates, for the latest day, a date, or a date range. In percent.",
  economic_series: "Any FRED economic series (inflation, unemployment, GDP, payrolls, rates, credit spreads, oil, FX, money supply, recession indicators) by id or plain words, as dates and values, optionally as changes or year-over-year rates. Feed values straight into analysis tools.",
  screen_companies: "Screen every US-listed company (thousands, from SEC XBRL frames) on fundamentals: revenue, growth, margins, ROE, ROA, free cash flow, R&D intensity, leverage and more, with filters, ranking and optional valuation (price, market cap, P/E, P/S, FCF yield) for the results. Implausible figures (tagging slips) are held out and listed apart.",
  company_report: "One company in one call: profile, five fiscal years of financials (revenue, growth, margins, net income, EPS, cash flow, ROE, leverage), price and risk over a year (return, volatility, drawdown, beta), valuation (market cap, P/E, P/S, FCF yield), insider buying and selling, and recent filings, each from its source.",
  event_study: "How a stock's price reacted to events: earnings releases (8-K item 2.02), insider purchases or sales (Form 4), any 8-K, or given dates. Abnormal returns against a market model, cumulative abnormal return per event and on average, with a t test across events.",
  mentions_trend: "How often a word or phrase appears in SEC filings over time (by month, quarter or year), across all filers or one company, from EDGAR full-text search: for themes such as \"tariffs\", \"agentic AI\" or \"going concern\".",
  price_history: "Daily, weekly, monthly or hourly price bars (open, high, low, close, volume) for stocks and ETFs, adjusted for splits and dividends by default, with dividends, splits and the window's total return, as columns ready for analysis tools (returns: true adds daily returns). No key needed; uses the user's Alpaca or Tiingo key when one is set.",
});

// Words people use for each tool that its description may not contain; combined servers that
// search tools (canli-mcp's find_tool) index them.
export const TOOL_KEYWORDS = Object.freeze({
  company_profile: "company info lookup sector industry sic fiscal year exchange address cik ticker",
  list_filings: "filings list history edgar 10-k 10-q 8-k proxy def 14a s-1 annual quarterly reports",
  read_filing: "10-k 10-q annual report quarterly report risk factors md&a business section text 8-k press release earnings exhibit",
  search_filings: "full text search mention mentions keyword phrase across filings companies edgar",
  insider_trades: "insider insiders buying selling buy sell form 4 executives directors ceo cfo officers stock sales purchases",
  fund_holdings: "13f hedge fund institutional investor holdings portfolio positions manager owns own bought sold stake",
  treasury_yields: "treasury yield curve rates government bonds 10 year 2 year 30 year tips real yields bills",
  economic_series: "macro economic economy data indicator fred unemployment jobs inflation cpi pce gdp payrolls fed funds rate spread oil dollar money supply recession",
  price_history: "stock stocks price prices quote ohlc bars daily weekly historical close adjusted chart ticker shares equity data",
  screen_companies: "screen screener rank ranking filter find which companies stocks all market universe highest lowest top best grew grow growing fastest growth margin profitable roe valuation cheapest largest fundamentals",
  company_report: "report full complete overview tear sheet summary dossier fundamentals financials valuation risk snapshot everything about a company due diligence",
  event_study: "event study earnings reaction announcement abnormal return car stock move after earnings insider buy sell market model significance",
  mentions_trend: "trend mentions count counts frequency word phrase theme topic over time how often per quarter rising",
});

const opt = (t) => t.optional();
const table = { columns: opt(z.array(z.string())), rows: opt(z.array(z.unknown())) };
const common = { source: opt(z.string()), limits: opt(z.array(z.string())) };
export const OUTPUT_SCHEMAS = Object.freeze({
  company_profile: z.looseObject({ cik: opt(z.number()), name: opt(z.string().nullable()), ticker: opt(z.string().nullable()), latest_10k: opt(z.unknown()), latest_10q: opt(z.unknown()), ...common }).describe("The filer's identity; latest_10k, latest_10q, latest_8k and latest_13f give each latest filing's date, period, accession and url."),
  list_filings: z.looseObject({ matched: opt(z.number()), ...table, ...common }).describe("rows are filings, newest first, in the order of columns."),
  read_filing: z.looseObject({ filing: opt(z.looseObject({})), text: opt(z.string()), total_chars: opt(z.number()), next_offset: opt(z.number()), sections: opt(z.looseObject({})), documents: opt(z.looseObject({})), url: opt(z.string()), ...common }).describe("text is the filing (or section) from offset; next_offset continues it; sections lists a 10-K or 10-Q's items."),
  search_filings: z.looseObject({ total: opt(z.number()), ...table, ...common }).describe("rows are matching documents in the order of columns; total counts all matches."),
  insider_trades: z.looseObject({ summary: opt(z.looseObject({})), ...table, ...common }).describe("rows are Form 4 transactions, newest first; summary totals open-market purchases and sales."),
  fund_holdings: z.looseObject({ period: opt(z.string()), total_value: opt(z.number()), entries_total: opt(z.number()), positions_total: opt(z.number()), matches_cover_page: opt(z.boolean()), changes_since: opt(z.looseObject({})), ...table, ...common }).describe("rows are positions by value with weights; changes_since compares with the previous quarter."),
  treasury_yields: z.looseObject({ curve: opt(z.string()), units: opt(z.string()), yields: opt(z.looseObject({})), spreads_points: opt(z.looseObject({})), ...table, ...common }).describe("For one day, yields by tenor and spreads in percentage points; rows are days (oldest first) with a yield per tenor in columns, in percent."),
  economic_series: z.looseObject({ series: opt(z.string()), title: opt(z.string().nullable()), latest: opt(z.unknown()), dates: opt(z.array(z.string())), values: opt(z.array(z.number().nullable())), ...common }).describe("dates and values are the observations, oldest first."),
  screen_companies: z.looseObject({ period: opt(z.string()), universe: opt(z.number()), matched: opt(z.number()), ...table, valuation: opt(z.looseObject({})), held_out: opt(z.looseObject({})), definitions: opt(z.looseObject({})), sources: opt(z.array(z.string())), limits: opt(z.array(z.string())) }).describe("rows are the ranked companies in the order of columns (ratios and growth as fractions); held_out lists companies whose figures failed a plausibility check."),
  company_report: z.looseObject({ company: opt(z.looseObject({})), financials: opt(z.looseObject({})), market: opt(z.looseObject({})), insiders_180d: opt(z.looseObject({})), recent_filings: opt(z.looseObject({})), sources: opt(z.array(z.string())), limits: opt(z.array(z.string())) }).describe("financials has one row per fiscal year; market has price, risk and valuation; insiders_180d sums open-market trades."),
  event_study: z.looseObject({ summary: opt(z.looseObject({})), average_path: opt(z.looseObject({})), events: opt(z.looseObject({})), limits: opt(z.array(z.string())) }).describe("summary has the mean and median cumulative abnormal return (fractions), the t statistic and p-value across events; events has one row per event."),
  mentions_trend: z.looseObject({ ...table, change: opt(z.unknown()), sources: opt(z.array(z.string())), limits: opt(z.array(z.string())) }).describe("rows are periods with the number of filing documents containing the words."),
  price_history: z.looseObject({ symbol: opt(z.string()), change: opt(z.looseObject({})), dates: opt(z.array(z.string())), close: opt(z.array(z.number())), ...common }).describe("dates, open, high, low, close and volume are aligned columns, oldest first; change.total_return is the window's return with dividends reinvested (a fraction)."),
});

const TITLES = { screen_companies: "Screen companies", company_report: "Company report", event_study: "Event study", mentions_trend: "Mentions over time", company_profile: "Company profile", list_filings: "List filings", read_filing: "Read a filing", search_filings: "Search filings", insider_trades: "Insider trades", fund_holdings: "Fund holdings (13F)", treasury_yields: "Treasury yields", economic_series: "Economic series (FRED)", price_history: "Price history" };
export const TOOLS = Object.freeze({
  screen_companies: [R.screenInput, R.screenCompanies], company_report: [R.reportInput, R.companyReport], event_study: [R.eventInput, R.eventStudy], mentions_trend: [R.trendInput, R.mentionsTrend],
  company_profile: [T.profileInput, T.companyProfile], list_filings: [T.listInput, T.listFilings], read_filing: [T.readInput, T.readFiling],
  search_filings: [T.searchInput, T.searchFilings], insider_trades: [T.insiderInput, T.insiderTrades], fund_holdings: [T.holdingsInput, T.fundHoldings],
  treasury_yields: [T.treasuryInput, T.treasuryYields], economic_series: [T.fredInput, T.economicSeries], price_history: [T.priceInput, T.priceHistory],
});
const ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const issues = (err) => (err?.issues ? err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") : String(err?.message ?? err));

export function registerTools(server, session) {
  for (const [name, [input, run]] of Object.entries(TOOLS)) {
    server.registerTool(name, { title: TITLES[name], description: TOOL_DESCRIPTIONS[name], inputSchema: input, outputSchema: OUTPUT_SCHEMAS[name], annotations: { title: TITLES[name], ...ANNOTATIONS } }, async (args) => {
      try {
        const seen = new Map();
        const result = await evidenceScope.run(seen, () => run(session, args));
        // The documents behind this answer: URL, the first 16 hex digits of the SHA-256 of the exact
        // bytes received, and when. Re-fetch a URL and hash it to check a figure later.
        if (seen.size && result && typeof result === "object" && !Array.isArray(result)) {
          result.evidence = { documents: seen.size, columns: ["url", "sha256_16", "retrieved_at"], rows: [...seen].slice(0, 12).map(([url, r]) => [url, r.sha256.slice(0, 16), r.retrieved_at]) };
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: `${name}: ${issues(err)}` }] };
      }
    });
  }
}

const isMain = (() => {
  try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

if (isMain) {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server, createSession());
  await server.connect(new StdioServerTransport());
}
