// Which finance questions each server can answer with a tool, checked against the tools each one
// actually lists: canli-mcp's src/index.json (0.3.0 has every markets tool counted here),
// and the rivals' tools/list snapshot in rivals-tools-2026-10-11.json. Any tool named here that a
// server does not list fails the script, so the map cannot claim what is not there.
//   node bench/rivals/coverage.mjs        writes bench/rivals/COVERAGE.md
// A tool listed means the server has a tool for that question, without an API key. It does not
// mean the tool answers it correctly: the benchmark (REPORT.md) measures that.
import { readFileSync, writeFileSync } from "node:fs";

const HERE = new URL(".", import.meta.url);
const index = JSON.parse(readFileSync(new URL("../../src/index.json", HERE), "utf8"));
const rivals = JSON.parse(readFileSync(new URL("rivals-tools-2026-10-11.json", HERE), "utf8"));

// OpenBB providers that declare credentials in their own package (openbb_<provider>/__init__.py,
// credentials=[...] in the installed openbb 5.0.0): an API key for FRED, BLS and EIA, an app token
// for CFTC. Their tools count as "with a key", not as keyless coverage.
export const OPENBB_KEYED = Object.freeze(["fred_", "bls_", "eia_", "cftc_"]);

// Tools counted here that no released canli-mcp has yet (none since 0.3.0).
export const PENDING = Object.freeze([]);

// [area, question, canli, openbb, edgartools, yahoo, note].
export const QUESTIONS = Object.freeze([
  ["Companies", "Multi-year financial statements", ["company_report", "history"], ["sec_income_statement", "sec_balance_sheet", "sec_cash_flow", "nasdaq_equity_fundamental_income"], ["edgar_company"], ["get_financial_statement"]],
  ["Companies", "Financials as first reported, and what was restated", ["known_as_of", "restatements", "vintages"], [], [], [], "Point-in-time figures, as an investor could have known them."],
  ["Companies", "One section of a 10-K or 10-Q (risk factors, MD&A)", ["read_filing"], ["sec_risk_factors", "sec_management_discussion_analysis", "sec_legal_proceedings"], ["edgar_read"], []],
  ["Companies", "Search the text of every filing", ["search_filings"], ["sec_full_text_search"], ["edgar_text_search"], []],
  ["Companies", "Screen every listed company on fundamentals", ["screen_companies", "cross_section"], ["nasdaq_equity_screener", "tmx_equity_screener"], ["edgar_screen"], []],
  ["Companies", "Revenue by segment", ["segment_revenue"], ["sec_segment_revenue"], ["edgar_notes"], []],
  ["Companies", "Executive pay, and pay versus performance", ["executive_pay"], ["sec_executive_compensation", "sec_pay_versus_performance"], ["edgar_proxy"], []],
  ["Companies", "A company's events from its 8-Ks (deals, executive changes, restatements)", ["company_events"], [], ["edgar_monitor"], [], "canli reads each 8-K item; EdgarTools lists recent filings."],
  ["Companies", "One kind of event across the market (restatements, bankruptcies, cyber incidents)", ["company_events"], [], [], []],
  ["Companies", "News headlines", [], ["news_company"], [], ["get_yahoo_finance_news"], "Not primary sources; canli reads the companies' own 8-Ks instead."],
  ["Companies", "Analyst estimates, price targets, recommendations", [], ["nasdaq_equity_estimates_consensus", "nasdaq_equity_estimates_price_target", "tmx_equity_estimates_consensus"], [], ["get_recommendations"], "No primary source publishes these."],
  ["Companies", "Upcoming earnings dates", [], ["nasdaq_equity_calendar_earnings", "tmx_equity_calendar_earnings"], [], []],
  ["Companies", "Dividends and splits", ["price_history"], ["nasdaq_equity_calendar_dividend", "nasdaq_equity_fundamental_dividends", "tmx_equity_fundamental_dividends"], [], ["get_stock_actions"]],
  ["Companies", "How the stock reacted to events (event study)", ["event_study"], [], [], []],
  ["Companies", "How often filings mention a theme over time", ["mentions_trend"], [], ["edgar_trends"], []],
  ["Ownership", "Insider buying and selling (Form 4)", ["insider_trades"], ["sec_insider_trading", "nasdaq_equity_ownership_insider_trading"], ["edgar_ownership"], ["get_holder_info"]],
  ["Ownership", "A fund manager's 13F holdings and changes", ["fund_holdings"], ["sec_form_13f"], ["edgar_fund"], ["get_holder_info"]],
  ["Ownership", "5 percent holders and activists (13D/13G)", ["large_holders"], ["sec_beneficial_ownership"], [], []],
  ["Ownership", "New activist stakes across the market", ["large_holders"], [], [], []],
  ["Ownership", "Short interest", ["short_interest"], ["finra_equity_shorts_short_interest", "nasdaq_equity_ownership_short_interest"], [], []],
  ["Ownership", "Fails to deliver", ["fails_to_deliver"], ["sec_equity_ftd"], [], []],
  ["Ownership", "Dark pool and OTC volume", ["off_exchange_volume"], ["finra_equity_darkpool_otc"], [], []],
  ["Funds", "What a mutual fund or ETF holds", ["fund_portfolio"], ["sec_nport_disclosure", "nasdaq_etf_holdings", "tmx_etf_holdings"], ["edgar_fund"], []],
  ["Funds", "Fund flows and monthly returns", ["fund_portfolio"], ["sec_nport_fund_metrics"], [], []],
  ["Funds", "Private raises by startups and funds (Form D)", ["private_offerings"], [], [], []],
  ["Funds", "Investment advisers (Form ADV)", ["investment_advisers"], ["sec_adviser_firms", "sec_adviser_individuals"], [], []],
  ["Markets", "US stock and ETF prices", ["price_history"], ["nasdaq_equity_historical", "cboe_equity_historical"], [], ["get_historical_stock_prices"]],
  ["Markets", "Stocks listed outside the US", ["price_history"], ["tmx_equity_historical"], [], ["get_historical_stock_prices"], "OpenBB: Canada only (TMX). Yahoo: any Yahoo symbol."],
  ["Markets", "Currency pairs", ["price_history"], ["ecb_exchange_rates", "ecb_reference_rates"], [], ["get_historical_stock_prices"]],
  ["Markets", "Futures prices", ["price_history"], ["cboe_futures_curve", "deribit_futures_historical"], [], ["get_historical_stock_prices"]],
  ["Markets", "Futures curves (term structure)", ["futures_curve"], ["cboe_futures_curve", "deribit_futures_curve"], [], []],
  ["Markets", "Crypto prices", ["price_history"], ["nasdaq_crypto_historical", "deribit_index_historical"], [], ["get_historical_stock_prices"]],
  ["Markets", "Index levels", ["price_history"], ["cboe_index_historical", "nasdaq_index_historical", "tmx_index_historical"], [], ["get_historical_stock_prices"]],
  ["Markets", "Index constituents", ["index_constituents"], ["cboe_index_constituents", "tmx_index_constituents"], [], []],
  ["Markets", "Options chains with implied volatility and greeks", ["options_chain"], ["cboe_options_chains", "nasdaq_options_chains", "deribit_options_chains"], [], ["get_option_chain"], "canli: Cboe's delayed data, approved by the owner 2026-10-11 (PR #450)."],
  ["Markets", "Volatility smile, surface and term structure", ["volatility_surface"], ["cboe_options_smile", "cboe_options_surface", "cboe_options_term_structure"], [], []],
  ["Rates", "Treasury yield curve", ["treasury_yields"], ["federal_reserve_yield_curve", "federal_reserve_treasury_rates"], [], []],
  ["Rates", "Treasury auctions, results and upcoming", ["treasury_auctions"], ["ustreasury_auction_results", "ustreasury_upcoming_auctions"], [], []],
  ["Rates", "The federal debt", ["federal_debt"], ["ustreasury_debt_to_penny"], [], []],
  ["Rates", "Corporate bond prices", [], ["finra_fixedincome_bond_prices"], [], []],
  ["Rates", "Futures positioning (CFTC Commitments of Traders)", ["futures_positioning"], ["cftc_cot"], [], []],
  ["Economy", "US economic series (inflation, jobs, GDP)", ["economic_series"], ["bls_cpi_by_category", "fred_economy_fred_series"], [], []],
  ["Economy", "Any country's economy", ["world_economy"], ["imf_indicators", "oecd_indicators"], [], []],
  ["Economy", "Economic forecasts", ["economic_outlook", "fomc"], ["oecd_gdp_forecast"], [], []],
  ["Economy", "Central bank decisions and documents (FOMC)", ["fomc"], ["federal_reserve_fomc_documents"], [], []],
  ["Economy", "Economic calendar", ["economic_calendar"], ["nasdaq_economy_calendar", "ecb_calendar"], [], []],
  ["Analytics", "Performance and risk (Sharpe, drawdown, VaR)", ["sharpe_ratio", "max_drawdown", "value_at_risk"], [], [], []],
  ["Analytics", "Option pricing and greeks from inputs", ["black_scholes", "implied_volatility", "option_portfolio_greeks"], ["cboe_options_payoff"], [], []],
  ["Analytics", "Portfolio construction (min variance, risk parity, Black-Litterman)", ["min_variance_portfolio", "risk_parity_portfolio", "black_litterman"], [], [], []],
  ["Analytics", "Factor returns", ["pit_factor", "factor_regression"], ["famafrench_factors"], [], [], "canli: its own point-in-time factors; OpenBB: Ken French's data library."],
  ["Analytics", "Strategy backtests", ["backtest_signal", "backtest_time_series_momentum", "sleeve_tournament"], [], [], []],
  ["Analytics", "Is a backtest overfit (deflated Sharpe, PBO, reality check)", ["validate_deflated_sharpe", "validate_overfitting", "validate_reality_check"], [], [], []],
  ["Trading", "Paper trading behind pre-trade checks", ["preview_paper_orders", "send_paper_orders"], [], [], []],
]);

const canliTools = new Set(index.tools.map((t) => t[0]));
const listed = Object.fromEntries(Object.entries(rivals.servers).map(([k, v]) => [k, new Set(v.tools.map((t) => t[0]))]));
const missing = [];
for (const [, q, canli, openbb, edgar, yahoo] of QUESTIONS) {
  for (const t of canli) if (!canliTools.has(t) && !PENDING.includes(t)) missing.push(`canli-mcp has no ${t} (${q})`);
  for (const [server, tools] of [["openbb", openbb], ["edgartools", edgar], ["yahoo", yahoo]]) for (const t of tools) if (!listed[server].has(t)) missing.push(`${server} has no ${t} (${q})`);
}
if (missing.length) { console.error(missing.join("\n")); process.exit(1); }

const keyed = (t) => OPENBB_KEYED.some((p) => t.startsWith(p));
const keyless = (tools) => tools.filter((t) => !keyed(t));
const mark = (tools, pending = false) => (!tools.length ? "·" : !keyless(tools).length ? "with a key" : tools.some((t) => PENDING.includes(t)) && pending ? "yes (unreleased)" : "yes");
const count = (i, released) => QUESTIONS.filter((q) => keyless(q[i]).length && (!released || !q[i].some((t) => PENDING.includes(t)))).length;
const lines = [
  "# Coverage: which finance questions each server has a tool for",
  "",
  `Checked by \`node bench/rivals/coverage.mjs\` against each server's own tool list: canli-mcp's \`src/index.json\` and the rivals' \`tools/list\` taken ${rivals.listed_at.slice(0, 10)} (\`rivals-tools-2026-10-11.json\`; versions pinned in \`env/\`). Every tool named below exists, or the script fails. "yes" means a keyless tool for the question exists; it does not mean the answer is right, which the head-to-head benchmark (REPORT.md) measures: canli-mcp 79% against the best rival's 54% on the questions every server finished.`,
  "",
  `| | canli-mcp | OpenBB | EdgarTools | Yahoo Finance MCP |`,
  `|---|---|---|---|---|`,
  `| Questions with a keyless tool (of ${QUESTIONS.length}) | ${count(2, false)}${count(2, true) < count(2, false) ? ` (${count(2, true)} released)` : ""} | ${count(3)} | ${count(4)} | ${count(5)} |`,
  `| Tools listed | ${index.tools.length} behind 3 (find_tool, describe_tool, run_tool) | ${rivals.servers.openbb.count} | ${rivals.servers.edgartools.count} | ${rivals.servers.yahoo.count} |`,
  `| Tokens of tool definitions per request (REPORT.md) | 859 | 432,001 (2,171 in discovery mode) | 3,801 | 2,205 |`,
  "",
  "| Area | Question | canli-mcp | OpenBB | EdgarTools | Yahoo | Note |",
  "|---|---|---|---|---|---|---|",
  ...QUESTIONS.map(([area, q, c, o, e, y, note]) => `| ${area} | ${q} | ${mark(c, true)} | ${mark(o)} | ${mark(e)} | ${mark(y)} | ${note ?? ""} |`),
  "",
  "\"with a key\": OpenBB's only tools for the question come from providers that declare credentials in their own package (FRED, BLS and EIA an API key, CFTC an app token).",
  "",
  `Only canli-mcp: ${QUESTIONS.filter((q) => q[2].length && !keyless(q[3]).length && !q[4].length && !q[5].length).map((q) => q[1].toLowerCase()).join("; ")}.`,
  "",
  `canli-mcp has no tool yet: ${QUESTIONS.filter((q) => !q[2].length).map((q) => q[1].toLowerCase()).join("; ")}.`,
  "",
];
writeFileSync(new URL("COVERAGE.md", HERE), lines.join("\n"));
console.log(`COVERAGE.md: canli-mcp ${count(2, false)}/${QUESTIONS.length} (${count(2, true)} released), OpenBB ${count(3)}, EdgarTools ${count(4)}, Yahoo ${count(5)}`);
