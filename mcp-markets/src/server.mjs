#!/usr/bin/env node
// canli-markets-mcp: public market data for agents, from the sources themselves. SEC EDGAR
// (filings and their sections, full-text search, insider trades, 13F holdings), the US Treasury
// yield curves and FRED economic series need no key; prices use the user's own Alpaca or Tiingo
// key. Every request goes from this machine straight to the source; nothing passes through Canli
// Capital, and every result names the URL it came from.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { createSession } from "./sources.mjs";
import * as T from "./tools.mjs";

export const SERVER_NAME = "canli-markets-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SERVER_INSTRUCTIONS = "Market data from the public sources themselves. Companies: company_profile, list_filings, then read_filing (section \"risk factors\", \"md&a\" and so on for a 10-K or 10-Q; document \"EX-99.1\" for an 8-K press release); search_filings finds words across all filings. Ownership: insider_trades (Form 4) and fund_holdings (13F). Rates and the economy: treasury_yields and economic_series (FRED). Prices: price_history, with the user's Alpaca or Tiingo key. Every result has its source URL; cite it.";
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME, version: SERVER_VERSION, title: "Canli Markets",
  websiteUrl: "https://canlicapital.com/developers",
  icons: [{ src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] }, { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
});

export const TOOL_DESCRIPTIONS = Object.freeze({
  company_profile: "A company's or fund's SEC profile by ticker, CIK or name: tickers, exchange, industry (SIC), fiscal year end, state, address, former names, and its latest 10-K, 10-Q, 8-K and 13F.",
  list_filings: "A company's SEC filings, newest first, filtered by form type (10-K, 10-Q, 8-K, DEF 14A, S-1, 4, 13F-HR...) and dates, with links. Use read_filing to read one.",
  read_filing: "The text of an SEC filing: the latest of a form, or one by accession. For a 10-K or 10-Q, section returns one item (\"risk factors\", \"md&a\", \"business\", \"market risk\", \"legal proceedings\", or a number such as \"1A\"); without it the result lists the items and their lengths. document reads an exhibit, such as an 8-K's press release (\"EX-99.1\"). Long text pages with offset.",
  search_filings: "Full-text search across all SEC filings since 2001 (EDGAR full-text search): which companies mention a phrase, filtered by form, filer and dates. Quote phrases.",
  insider_trades: "Insider transactions at a company from its Form 4 filings: who (officers, directors, 10% owners), what (open-market buys and sales, option exercises, tax withholding, gifts), shares, price, value, holdings after, and 10b5-1 plan flags, with a buy/sell summary. Default: the last 90 days.",
  fund_holdings: "A fund manager's 13F holdings for a quarter (latest by default): positions by value with portfolio weights, the total checked against the filing's cover page, and what changed since the previous quarter (new, exited, added, reduced).",
  treasury_yields: "US Treasury daily yields from the Treasury itself: the par yield curve (1 month to 30 years), real (TIPS) yields or bill rates, for the latest day, a date, or a date range. In percent.",
  economic_series: "Any FRED economic series (inflation, unemployment, GDP, payrolls, rates, credit spreads, oil, FX, money supply, recession indicators) by id or plain words, as dates and values, optionally as changes or year-over-year rates. Feed values straight into analysis tools.",
  price_history: "Daily, weekly, monthly or hourly price bars (open, high, low, close, volume), adjusted for splits and dividends by default, as columns ready for analysis tools. Needs the user's free Alpaca or Tiingo key in the environment.",
});

const opt = (t) => t.optional();
const table = { columns: opt(z.array(z.string())), rows: opt(z.array(z.unknown())) };
const common = { source: opt(z.string()), limits: opt(z.array(z.string())) };
export const OUTPUT_SCHEMAS = Object.freeze({
  company_profile: z.looseObject({ cik: opt(z.number()), name: opt(z.string().nullable()), ticker: opt(z.string().nullable()), latest: opt(z.looseObject({})), ...common }).describe("The filer's identity and its latest periodic filings."),
  list_filings: z.looseObject({ matched: opt(z.number()), ...table, ...common }).describe("rows are filings, newest first, in the order of columns."),
  read_filing: z.looseObject({ filing: opt(z.looseObject({})), text: opt(z.string()), total_chars: opt(z.number()), next_offset: opt(z.number()), sections: opt(z.looseObject({})), documents: opt(z.looseObject({})), url: opt(z.string()), ...common }).describe("text is the filing (or section) from offset; next_offset continues it; sections lists a 10-K or 10-Q's items."),
  search_filings: z.looseObject({ total: opt(z.number()), ...table, ...common }).describe("rows are matching documents in the order of columns; total counts all matches."),
  insider_trades: z.looseObject({ summary: opt(z.looseObject({})), ...table, ...common }).describe("rows are Form 4 transactions, newest first; summary totals open-market purchases and sales."),
  fund_holdings: z.looseObject({ period: opt(z.string()), total_value: opt(z.number()), matches_cover_page: opt(z.boolean()), changes_since: opt(z.looseObject({})), ...table, ...common }).describe("rows are positions by value with weights; changes_since compares with the previous quarter."),
  treasury_yields: z.looseObject({ curve: opt(z.string()), units: opt(z.string()), ...table, ...common }).describe("rows are days (oldest first) with a yield per tenor in columns, in percent."),
  economic_series: z.looseObject({ series: opt(z.string()), title: opt(z.string().nullable()), latest: opt(z.unknown()), dates: opt(z.array(z.string())), values: opt(z.array(z.number().nullable())), ...common }).describe("dates and values are the observations, oldest first."),
  price_history: z.looseObject({ symbol: opt(z.string()), dates: opt(z.array(z.string())), close: opt(z.array(z.number())), ...common }).describe("dates, open, high, low, close and volume are aligned columns, oldest first."),
});

const TITLES = { company_profile: "Company profile", list_filings: "List filings", read_filing: "Read a filing", search_filings: "Search filings", insider_trades: "Insider trades", fund_holdings: "Fund holdings (13F)", treasury_yields: "Treasury yields", economic_series: "Economic series (FRED)", price_history: "Price history" };
export const TOOLS = Object.freeze({
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
        const result = await run(session, args);
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
