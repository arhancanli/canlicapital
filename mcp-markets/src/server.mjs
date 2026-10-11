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
import * as CB from "./centralbank.mjs";
import * as E from "./events.mjs";
import * as F from "./funds.mjs";
import * as G from "./global.mjs";
import * as O from "./ownership.mjs";
import * as Pos from "./positioning.mjs";
import * as Pay from "./pay.mjs";
import * as P from "./private.mjs";
import * as Seg from "./segments.mjs";
import * as R from "./research.mjs";
import * as T from "./tools.mjs";

export const SERVER_NAME = "canli-markets-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SERVER_INSTRUCTIONS = "Market data and research from the public sources themselves. Across the market: screen_companies ranks every US-listed company on fundamentals, company_report gives one company's financials, segment_revenue its revenue by segment, product and region, valuation, risk, insiders and filings in one call, event_study measures price reactions to earnings or insider trades, mentions_trend counts a phrase in filings over time. Companies: company_profile, list_filings, then read_filing (section \"risk factors\", \"md&a\" and so on for a 10-K or 10-Q; document \"EX-99.1\" for an 8-K press release); search_filings finds words across all filings; executive_pay reads a proxy's pay-versus-performance table; company_events gives a company's 8-K news (or, by event, the whole market's: restatements, bankruptcies, cyber incidents). Ownership: insider_trades (Form 4) and fund_holdings (a manager's 13F); large_holders (13D/13G: 5 percent holders and activists); funds: fund_portfolio (what a mutual fund or ETF holds, its flows and returns, from N-PORT); private markets: private_offerings (Form D raises by startups and funds); positioning: short_interest, off_exchange_volume (FINRA dark pools), fails_to_deliver (SEC) and futures_positioning (CFTC Commitments of Traders). Rates and the economy: fomc (the Fed's decisions, votes and projections), treasury_yields, treasury_auctions, federal_debt, economic_series (FRED) and world_economy (World Bank, every country). Prices: price_history for stocks in the US and abroad, currencies, futures, indices and crypto (no key needed; the user's Alpaca or Tiingo key is used for US stocks when set). Every result has its source URL; cite it.";
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
  fund_portfolio: "What a US mutual fund or ETF holds, from its own SEC Form N-PORT (VOO, IVV, QQQ, AGG, FXAIX): every position with value and weight, exposure by asset type, issuer, country and currency, a bond fund's coupon and maturity profile, its monthly returns, the money that came in and went out each month, and what changed since the previous quarter.",
  large_holders: "Who owns more than 5 percent of a company, from Schedules 13D and 13G: each holder's latest stake (shares, percent of class, voting power), whether it is passive (13G) or may seek to influence control (13D, with its stated purpose); or, with no company, the newest 13D stakes across the whole market.",
  company_events: "Company news from the source: the events companies must report on Form 8-K (earnings, deals, executive changes, restatements, auditor changes, bankruptcies, cyber incidents, layoffs, delisting notices), for one company or, by event, across the whole market, each with the opening of what the filing says.",
  private_offerings: "Private markets from Form D, filed when startups and funds sell securities without registering: amount offered and sold, number of investors, minimum investment, exemption (Rule 506(b) or 506(c)), industry, fund type and the people behind it, for one issuer or across the market (newest first, filtered by industry or amount sold).",
  fails_to_deliver: "Shares that failed to settle, from the SEC's fails-to-deliver data (NSCC): a stock's outstanding fail balance on each settlement date over the latest half-month files, with prices and dollar values, or the securities with the largest fails across the market.",
  off_exchange_volume: "How much of a US stock trades away from the exchanges, from FINRA's OTC transparency data: weekly shares and trades in dark pools (ATSs) and with other off-exchange dealers, and the largest dark pools and dealers in the latest week.",
  short_interest: "Short interest in US stocks from FINRA, twice a month: shares short, the change, average daily volume and days to cover over several reports, and the share of shares outstanding from the company's latest SEC cover page; or, with no stock, the market ranked by days to cover, change or size.",
  futures_positioning: "Who holds what in a futures market, from the CFTC's weekly Commitments of Traders: long, short and net positions of producers, swap dealers, managed money and others (or dealers, asset managers and leveraged funds for financial futures), with weekly changes and where the speculators sit in their range, by market name (gold, crude oil, 10 year note, euro, bitcoin).",
  executive_pay: "What a company's executives are paid against how it did, from the pay-versus-performance table in its proxy: the CEO's reported pay and the pay actually earned, the other executives' averages, shareholder return against peers, net income and the company's chosen measure, five years; or every company's CEO pay ranked, with mis-scaled filings held out.",
  fomc: "The Federal Reserve's rate decisions from its own record: each FOMC meeting of a year (held and scheduled), the action, change and target range, the vote with dissenters and their reasons, links to statements and minutes, the latest statement, and the median projections (dot plot) for GDP, unemployment, inflation and the federal funds rate.",
  index_constituents: "The members of a stock index (S&P 500, Nasdaq 100, Russell 2000, S&P 400, MSCI EAFE) with their weights, read from the N-PORT of an ETF that tracks it, with the report date, the number of members and how concentrated the top ten are.",
  segment_revenue: "Where a company's revenue comes from, read from the XBRL of its latest 10-K (or 10-Q): revenue and operating income by business segment, revenue by product or service and by region, for up to three years, with the company's own labels and each breakdown checked against total revenue.",
  treasury_yields: "US Treasury daily yields from the Treasury itself: the par yield curve (1 month to 30 years), real (TIPS) yields or bill rates, for the latest day, a date, or a date range. In percent.",
  economic_series: "Any FRED economic series (inflation, unemployment, GDP, payrolls, rates, credit spreads, oil, FX, money supply, recession indicators) by id or plain words, as dates and values, optionally as changes or year-over-year rates. Feed values straight into analysis tools.",
  screen_companies: "Screen every US-listed company (thousands, from SEC XBRL frames) on fundamentals: revenue, growth, margins, ROE, ROA, free cash flow, R&D intensity, leverage and more, with filters, ranking and optional valuation (price, market cap, P/E, P/S, FCF yield) for the results. Implausible figures (tagging slips) are held out and listed apart.",
  company_report: "One company in one call: profile, five fiscal years of financials (revenue, growth, margins, net income, EPS, cash flow, ROE, leverage), price and risk over a year (return, volatility, drawdown, beta), valuation (market cap, P/E, P/S, FCF yield), insider buying and selling, and recent filings, each from its source.",
  event_study: "How a stock's price reacted to events: earnings releases (8-K item 2.02), insider purchases or sales (Form 4), any 8-K, or given dates. Abnormal returns against a market model, cumulative abnormal return per event and on average, with a t test across events.",
  mentions_trend: "How often a word or phrase appears in SEC filings over time (by month, quarter or year), across all filers or one company, from EDGAR full-text search: for themes such as \"tariffs\", \"agentic AI\" or \"going concern\".",
  world_economy: "Any country's or region's economy from the World Bank's World Development Indicators (200+ countries, the euro area, the world, income groups): GDP and growth, inflation, unemployment, government debt and deficits, the current account, trade, reserves, interest rates, population and more, by plain words or indicator code, as a year-by-country table with each country's latest value.",
  treasury_auctions: "US Treasury auction results, or the auctions announced next, from the Treasury itself: bills, notes, bonds, TIPS and FRNs by term (\"10-year\", \"13-week bill\"), with the rate each cleared at, coupon, bid-to-cover, size and the shares taken by indirect bidders (foreign and other), direct bidders and primary dealers, plus averages to compare the latest auction with recent ones.",
  federal_debt: "The US federal debt each business day from the Treasury's Debt to the Penny (total, held by the public, intragovernmental) over any window since 1993, its change over the window, and the average interest rate the Treasury pays on each type of security.",
  price_history: "Price bars (open, high, low, close, volume), daily to hourly, for US stocks and ETFs, stocks listed abroad (SAP.DE, 7203.T), currency pairs (EUR/USD), futures (crude oil, gold), indices and yields (S&P 500, VIX, 10 year yield) and crypto (bitcoin), by symbol or plain name. Stocks adjust for splits and dividends by default, with dividends, splits and the total return; returns: true adds daily returns. No key needed; uses the user's Alpaca or Tiingo key for US stocks when set.",
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
  fund_portfolio: "etf etfs mutual fund funds holdings constituents portfolio composition what does it hold exposure top holdings weights bond fund maturity coupon flows inflows outflows creations redemptions n-port index fund vanguard ishares fidelity invesco",
  large_holders: "activist activists 13d 13g beneficial owner owners 5 percent stake stakes major shareholders blockholders largest holders who owns control proxy fight hostile",
  company_events: "news events announcement announced 8-k current report ceo cfo resign resignation departure appointed hired fired merger acquisition deal agreement bankruptcy chapter 11 restatement restated auditor cyber hack breach layoffs restructuring impairment delisting earnings release guidance",
  private_offerings: "private placement placements form d raise raised fundraising funding round startup startups venture capital vc private equity hedge fund real estate syndication reg d 506b 506c accredited investors",
  fails_to_deliver: "fails to deliver ftd failed settlement naked short selling short squeeze reg sho threshold securities settlement fails nscc",
  off_exchange_volume: "dark pool dark pools ats off exchange otc volume internalization wholesalers citadel virtu where does it trade hidden liquidity block trades",
  short_interest: "short interest shorted short sellers short squeeze days to cover short ratio percent of float most shorted bearish bets finra",
  futures_positioning: "cot commitments of traders cftc positioning futures speculators hedge funds managed money leveraged funds net long net short crowded trade commercials hedgers commodities",
  executive_pay: "executive compensation ceo pay salary bonus stock awards pay versus performance compensation actually paid proxy def 14a highest paid ceos tsr shareholder return",
  fomc: "fed federal reserve fomc rate decision interest rate hike cut hold pause target range federal funds statement minutes dot plot projections dissent powell monetary policy",
  index_constituents: "index constituents members components holdings weights s&p 500 nasdaq 100 russell 2000 which companies are in the index largest weights concentration",
  segment_revenue: "segment segments revenue breakdown by segment product line products services geography region country mix how much of revenue comes from business units divisions operating income by segment",
  treasury_yields: "treasury yield curve rates government bonds 10 year 2 year 30 year tips real yields bills",
  economic_series: "macro economic economy data indicator fred unemployment jobs inflation cpi pce gdp payrolls fed funds rate spread oil dollar money supply recession",
  price_history: "stock stocks price prices quote ohlc bars daily weekly historical close adjusted chart ticker shares equity data fx forex currency currencies exchange rate eur usd jpy gbp futures commodity commodities oil crude brent gold silver copper natural gas wheat index indices s&p 500 nasdaq dow vix nikkei dax ftse yield crypto bitcoin ethereum international foreign london tokyo frankfurt hong kong",
  world_economy: "world global international country countries economy macro gdp growth inflation unemployment debt deficit current account trade exports imports reserves population emerging markets europe china japan india germany uk compare comparison world bank",
  treasury_auctions: "treasury auction auctions bid to cover tail indirect bidders foreign demand primary dealers direct bidders bills notes bonds tips frn supply refunding upcoming results high yield",
  federal_debt: "national debt federal debt us government debt deficit debt to the penny public debt outstanding interest cost average interest rate treasury borrowing",
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
  fund_portfolio: z.looseObject({ fund: opt(z.looseObject({})), period: opt(z.string()), net_assets: opt(z.number().nullable()), positions: opt(z.number()), exposure: opt(z.looseObject({})), bonds: opt(z.looseObject({})), monthly_returns: opt(z.looseObject({})), flows: opt(z.looseObject({})), changes_since: opt(z.looseObject({})), ...table, ...common }).describe("rows are the largest positions by value, weights as fractions of net assets; exposure sums weights by asset type, issuer, country and currency; flows are dollars in and out each month."),
  large_holders: z.looseObject({ company: opt(z.looseObject({})), purposes_13d: opt(z.array(z.unknown())), earlier_text_filings: opt(z.looseObject({})), ...table, ...common }).describe("rows are holders (latest filing each, largest stake first) or, across the market, filings; percent_of_class is a fraction."),
  company_events: z.looseObject({ company: opt(z.looseObject({})), event: opt(z.looseObject({})), counts: opt(z.looseObject({})), ...table, ...common }).describe("rows are 8-K filings, newest first: items are the 8-K item numbers, events their names, excerpt the opening of the filing's text under the item."),
  private_offerings: z.looseObject({ issuer: opt(z.looseObject({})), people: opt(z.array(z.unknown())), ...table, ...common }).describe("rows are Form D offerings, newest first, in the order of columns; sold and offered are dollars (offered may be indefinite)."),
  fails_to_deliver: z.looseObject({ symbol: opt(z.string()), largest: opt(z.looseObject({})), files: opt(z.array(z.string())), ...table, ...common }).describe("rows are settlement dates with the outstanding fail balance (one stock) or securities ranked by their largest balance by value (the market)."),
  off_exchange_volume: z.looseObject({ symbol: opt(z.string()), latest_week: opt(z.looseObject({})), ...table, ...common }).describe("rows are weeks, oldest first, with ATS (dark pool) and other OTC shares and trades; latest_week lists the largest venues."),
  short_interest: z.looseObject({ latest: opt(z.looseObject({})), settlement_date: opt(z.string()), ...table, ...common }).describe("rows are settlement dates (one stock) or stocks (the market), in the order of columns; change_pct and pct_of_shares_outstanding are fractions."),
  futures_positioning: z.looseObject({ market: opt(z.looseObject({})), latest: opt(z.looseObject({})), speculators: opt(z.looseObject({})), ...table, ...common }).describe("latest has each trader group's long, short and net contracts; rows are weekly reports, oldest first, with each group's net position."),
  executive_pay: z.looseObject({ company: opt(z.looseObject({})), proxy: opt(z.looseObject({})), held_out: opt(z.looseObject({})), ...table, ...common }).describe("rows are fiscal years (one company, newest first) or companies (the market, ranked), in the order of columns; pay in dollars, TSR as the value of $100."),
  fomc: z.looseObject({ year: opt(z.number()), latest_statement: opt(z.looseObject({})), projections: opt(z.looseObject({})), ...table, ...common }).describe("rows are the year's meetings in date order, in the order of columns: target range in percent, change in basis points; projections has the median paths."),
  index_constituents: z.looseObject({ index: opt(z.string()), through: opt(z.looseObject({})), members: opt(z.number()), top_10_weight: opt(z.number().nullable()), ...table, ...common }).describe("rows are the index's members by weight (weights as fractions adding to 1)."),
  segment_revenue: z.looseObject({ company: opt(z.looseObject({})), filing: opt(z.looseObject({})), total_revenue: opt(z.looseObject({})), segments: opt(z.looseObject({})), products_and_services: opt(z.looseObject({})), regions: opt(z.looseObject({})), ...common }).describe("each breakdown has rows of members with revenue (and operating income) per period in the order of columns, and latest_sum_vs_total, the members' sum over total revenue."),
  treasury_yields: z.looseObject({ curve: opt(z.string()), units: opt(z.string()), yields: opt(z.looseObject({})), spreads_points: opt(z.looseObject({})), ...table, ...common }).describe("For one day, yields by tenor and spreads in percentage points; rows are days (oldest first) with a yield per tenor in columns, in percent."),
  economic_series: z.looseObject({ series: opt(z.string()), title: opt(z.string().nullable()), latest: opt(z.unknown()), dates: opt(z.array(z.string())), values: opt(z.array(z.number().nullable())), ...common }).describe("dates and values are the observations, oldest first."),
  screen_companies: z.looseObject({ period: opt(z.string()), universe: opt(z.number()), matched: opt(z.number()), ...table, valuation: opt(z.looseObject({})), held_out: opt(z.looseObject({})), definitions: opt(z.looseObject({})), sources: opt(z.array(z.string())), limits: opt(z.array(z.string())) }).describe("rows are the ranked companies in the order of columns (ratios and growth as fractions); held_out lists companies whose figures failed a plausibility check."),
  company_report: z.looseObject({ company: opt(z.looseObject({})), financials: opt(z.looseObject({})), market: opt(z.looseObject({})), insiders_180d: opt(z.looseObject({})), recent_filings: opt(z.looseObject({})), sources: opt(z.array(z.string())), limits: opt(z.array(z.string())) }).describe("financials has one row per fiscal year; market has price, risk and valuation; insiders_180d sums open-market trades."),
  event_study: z.looseObject({ summary: opt(z.looseObject({})), average_path: opt(z.looseObject({})), events: opt(z.looseObject({})), limits: opt(z.array(z.string())) }).describe("summary has the mean and median cumulative abnormal return (fractions), the t statistic and p-value across events; events has one row per event."),
  mentions_trend: z.looseObject({ ...table, change: opt(z.unknown()), sources: opt(z.array(z.string())), limits: opt(z.array(z.string())) }).describe("rows are periods with the number of filing documents containing the words."),
  world_economy: z.looseObject({ indicator: opt(z.looseObject({})), countries: opt(z.looseObject({})), latest: opt(z.looseObject({})), ...table, ...common }).describe("rows are years (oldest first) with one value per country in the order of columns; latest has each country's most recent year and value."),
  treasury_auctions: z.looseObject({ rate_is: opt(z.string()), averages: opt(z.looseObject({})), ...table, ...common }).describe("rows are auctions in the order of columns, newest first (soonest first when upcoming); shares are fractions of the competitive amount accepted."),
  federal_debt: z.looseObject({ latest: opt(z.looseObject({})), change: opt(z.looseObject({})), average_interest_rates: opt(z.looseObject({})), ...table, ...common }).describe("rows are days (or month ends) with the debt in US dollars; average_interest_rates is the latest month, in percent."),
  price_history: z.looseObject({ symbol: opt(z.string()), change: opt(z.looseObject({})), dates: opt(z.array(z.string())), close: opt(z.array(z.number())), ...common }).describe("dates, open, high, low, close and volume are aligned columns, oldest first; change.total_return is the window's return with dividends reinvested (a fraction)."),
});

const TITLES = { screen_companies: "Screen companies", company_report: "Company report", event_study: "Event study", mentions_trend: "Mentions over time", company_profile: "Company profile", list_filings: "List filings", read_filing: "Read a filing", search_filings: "Search filings", insider_trades: "Insider trades", fund_holdings: "Fund holdings (13F)", fund_portfolio: "Fund or ETF portfolio (N-PORT)", large_holders: "Large holders (13D/13G)", company_events: "Company events (8-K)", private_offerings: "Private offerings (Form D)", short_interest: "Short interest (FINRA)", off_exchange_volume: "Dark pool and OTC volume (FINRA)", fails_to_deliver: "Fails to deliver (SEC)", executive_pay: "Executive pay vs performance", fomc: "Fed rate decisions (FOMC)", index_constituents: "Index constituents", segment_revenue: "Revenue by segment", futures_positioning: "Futures positioning (CFTC COT)", treasury_yields: "Treasury yields", economic_series: "Economic series (FRED)", world_economy: "World economy (World Bank)", treasury_auctions: "Treasury auctions", federal_debt: "US federal debt", price_history: "Price history" };
export const TOOLS = Object.freeze({
  screen_companies: [R.screenInput, R.screenCompanies], company_report: [R.reportInput, R.companyReport], event_study: [R.eventInput, R.eventStudy], mentions_trend: [R.trendInput, R.mentionsTrend],
  company_profile: [T.profileInput, T.companyProfile], list_filings: [T.listInput, T.listFilings], read_filing: [T.readInput, T.readFiling],
  search_filings: [T.searchInput, T.searchFilings], insider_trades: [T.insiderInput, T.insiderTrades], fund_holdings: [T.holdingsInput, T.fundHoldings],
  treasury_yields: [T.treasuryInput, T.treasuryYields], economic_series: [T.fredInput, T.economicSeries], price_history: [T.priceInput, T.priceHistory],
  fund_portfolio: [F.portfolioInput, F.fundPortfolio], segment_revenue: [Seg.segmentInput, Seg.segmentRevenue], index_constituents: [F.indexInput, F.indexConstituents], fomc: [CB.fomcInput, CB.fomc], executive_pay: [Pay.payInput, Pay.executivePay], short_interest: [Pos.shortInput, Pos.shortInterest], off_exchange_volume: [Pos.offExchangeInput, Pos.offExchangeVolume], fails_to_deliver: [Pos.ftdInput, Pos.failsToDeliver], futures_positioning: [Pos.cotInput, Pos.futuresPositioning], private_offerings: [P.offeringsInput, P.privateOfferings], company_events: [E.eventsInput, E.companyEvents], large_holders: [O.holdersInput, O.largeHolders], world_economy: [G.worldInput, G.worldEconomy], treasury_auctions: [G.auctionInput, G.treasuryAuctions], federal_debt: [G.debtInput, G.federalDebt],
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
