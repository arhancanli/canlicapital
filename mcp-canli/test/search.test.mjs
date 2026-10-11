// find_tool across every pack: plain requests must find a right tool first, or at worst in the top
// three. Where two packs answer the same question, either tool counts.
import assert from "node:assert/strict";
import test from "node:test";

import { ENTRIES } from "../src/server.mjs";
import { buildIndex, search } from "../src/search.mjs";

const INDEX = buildIndex(ENTRIES);
const PACKS = ["quant", "validation", "fundamentals", "research", "backtest", "markets", "paper"];
const Q = [
  ["did my backtest overfit after trying 40 variants", ["validate_deflated_sharpe", "deflated_sharpe_ratio"]],
  ["probability of backtest overfitting cscv", ["validate_overfitting"]],
  ["data snooping test on all the variants i tried", ["validate_reality_check"]],
  ["how many years of track record do i need", ["validate_track_record"]],
  ["haircut sharpe harvey liu", ["validate_haircut_sharpe"]],
  ["audit my strategy returns", ["audit_backtest"]],
  ["does my signal look ahead", ["check_leakage"]],
  ["run my pipeline on noise placebo", ["placebo_test"]],
  ["will my strategy survive a crash bootstrap drawdown", ["strategy_stress_test"]],
  ["can my broker handle this many orders", ["check_feasibility"]],
  ["summarize this long price series", ["summarize_series"]],
  ["what had apple reported as of march 2019", ["known_as_of"]],
  ["restated revenue numbers", ["restatements"]],
  ["every filing behind one number revision history", ["vintages"]],
  ["find the cik for a company", ["find_company"]],
  ["net income for many companies on one date", ["cross_section"]],
  ["canli research papers on momentum", ["search_research"]],
  ["how many hypotheses have you tried", ["trial_ledger"]],
  ["live paper trading record", ["live_record"]],
  ["build a value factor from sec filings without lookahead", ["pit_factor"]],
  ["backtest my signal csv against prices", ["backtest_signal"]],
  ["my alpaca paper account balance", ["paper_account"]],
  ["rebalance my paper account to target weights", ["rebalance_to_weights"]],
  ["price a european call", ["black_scholes"]],
  ["value at risk of my portfolio", ["value_at_risk", "portfolio_var"]],
  ["detect bull and bear regimes", ["markov_regime_switching"]],
  ["which of the 399 sleeves work on my data", ["sleeve_tournament"]],
  ["triple barrier labels for machine learning", ["triple_barrier_labels"]],
  ["portfolio scenario stress test shocks", ["stress_test"]],
  ["bond yield to maturity", ["bond_yield"]],
  ["risk factors in nvidia's latest 10-k", ["read_filing"]],
  ["did any insiders sell tesla stock", ["insider_trades"]],
  ["what does berkshire hathaway own 13f", ["fund_holdings"]],
  ["10 year treasury yield today", ["treasury_yields", "economic_series"]],
  ["core inflation year over year", ["economic_series"]],
  ["daily stock prices for aapl", ["price_history"]],
  ["which companies mention tariffs in their filings", ["search_filings"]],
  ["list a company's 8-k filings", ["list_filings"]],
  ["what industry is a company in and when does its fiscal year end", ["company_profile"]],
  ["unemployment rate data", ["economic_series"]],
  ["apple fiscal year 2025 total net sales revenue", ["history", "known_as_of"]],
  ["microsoft net income for fiscal 2025", ["history", "known_as_of"]],
  ["nvidia diluted earnings per share last fiscal year", ["history", "known_as_of"]],
  ["how many employees does nvidia have according to its 10-k", ["read_filing"]],
  ["sharpe ratio of spy in 2025 from prices", ["sharpe_ratio", "price_history"]],
  ["which companies grew revenue fastest last year", ["screen_companies"]],
  ["rank large companies by profit margin", ["screen_companies"]],
  ["give me a full report on microsoft", ["company_report"]],
  ["how does the stock react after earnings", ["event_study"]],
  ["how often do filings mention tariffs over time", ["mentions_trend"]],
];

test("cross-pack requests: a right tool first in at least 45 of 50, in the top three in all 50", () => {
  let top1 = 0, top3 = 0;
  const misses = [];
  for (const [q, want] of Q) {
    const r = search(INDEX, q, { packs: PACKS, limit: 3 }).map((t) => t.name);
    if (want.includes(r[0])) top1++;
    if (r.some((n) => want.includes(n))) top3++; else misses.push(`${q} -> ${r.join(", ")}`);
  }
  console.log(JSON.stringify({ top1, top3, misses }));
  assert.ok(top1 >= 45 && top3 === Q.length, JSON.stringify({ top1, top3, misses }));
});

test("form names keep their number, \"news\" stays news, and a one-word tool name in a question is just a word", async () => {
  const { tokens } = await import("../src/search.mjs");
  assert.ok(tokens("latest 8-K news").includes("8k"));
  assert.ok(tokens("the 10-Q").includes("10q"));
  assert.ok(tokens("company news").includes("news"));
  // "history" is also a tool's name; a question about exchange-rate history is not a request for it.
  const r = search(INDEX, "euro dollar exchange rate history", { limit: 3 }).map((t) => t.name);
  assert.notEqual(r[0], "history");
  assert.equal(search(INDEX, "history", { limit: 1 })[0].name, "history", "the whole query naming a tool still picks it");
});

// The markets tools added in 0.3.0, asked the way people ask. Measured 37 of 37 first when added.
const MARKETS_Q = [
  ["how heavily shorted is gamestop", ["short_interest"]], ["days to cover for tesla", ["short_interest"]], ["most shorted stocks", ["short_interest"]],
  ["dark pool volume for apple", ["off_exchange_volume"]], ["how much of nvda trades off exchange", ["off_exchange_volume"]],
  ["fails to deliver gme", ["fails_to_deliver"]], ["hedge fund positioning in gold futures", ["futures_positioning"]], ["commitments of traders crude oil", ["futures_positioning"]],
  ["what does voo hold", ["fund_portfolio", "index_constituents"]], ["top holdings of the ark innovation etf", ["fund_portfolio"]], ["etf inflows and outflows ivv", ["fund_portfolio"]],
  ["s&p 500 constituents and weights", ["index_constituents"]], ["which companies are in the nasdaq 100", ["index_constituents"]],
  ["who owns more than 5% of coca cola", ["large_holders"]], ["new activist stakes this week", ["large_holders"]],
  ["ceo pay versus performance nvidia", ["executive_pay"]], ["highest paid ceos", ["executive_pay"]],
  ["apple revenue by product", ["segment_revenue"]], ["microsoft revenue by segment", ["segment_revenue"]], ["how much revenue from china", ["segment_revenue"]],
  ["when is the next cpi release", ["economic_calendar"]], ["economic data this week", ["economic_calendar"]],
  ["did the fed raise rates and who dissented", ["fomc"]], ["fed dot plot projections", ["fomc"]],
  ["oecd gdp forecast for germany", ["economic_outlook"]], ["inflation forecast next year euro area", ["economic_outlook"]], ["inflation in turkey over the last ten years", ["world_economy"]],
  ["10 year treasury auction bid to cover", ["treasury_auctions"]], ["us national debt today", ["federal_debt"]],
  ["startups raising money form d", ["private_offerings"]], ["is bridgewater a registered investment adviser", ["investment_advisers"]],
  ["latest 8-k news for tesla", ["company_events"]], ["which companies restated earnings this month", ["company_events"]], ["ceo resignations announced", ["company_events"]],
  ["euro dollar exchange rate history", ["price_history"]], ["gold price over the last year", ["price_history"]], ["bitcoin price chart", ["price_history"]],
];

test("markets requests: a right tool first in at least 35 of 37, in the top three in all 37", () => {
  let top1 = 0, top3 = 0;
  const misses = [];
  for (const [q, want] of MARKETS_Q) {
    const r = search(INDEX, q, { limit: 3 }).map((t) => t.name);
    if (want.includes(r[0])) top1++;
    if (r.some((n) => want.includes(n))) top3++; else misses.push(`${q} -> ${r.join(", ")}`);
  }
  console.log(JSON.stringify({ top1, top3, misses }));
  assert.ok(top1 >= 35 && top3 === MARKETS_Q.length, JSON.stringify({ top1, top3, misses }));
});

// Everyday requests across finance, in two sets of 48: the first written before the 0.3.0 search
// changes (they were then tuned on it: 34 first before, 43 after), the second written after them and
// measured once, untuned (46 first; 0.2.1 found 25). A new held-out set is needed to measure the next
// change.
const EVERYDAY_Q = [
  ["us inflation rate", ["economic_series"]],
  ["inflation rate", ["economic_series","world_economy"]],
  ["unemployment rate", ["economic_series","world_economy"]],
  ["30 year mortgage rates", ["economic_series"]],
  ["current fed funds rate", ["fomc","economic_series"]],
  ["us gdp growth last quarter", ["economic_series"]],
  ["yield curve inversion 2s10s", ["treasury_yields","check_yield_curve"]],
  ["2 year treasury yield history", ["treasury_yields","economic_series"]],
  ["how much did the treasury sell in bills this week", ["treasury_auctions"]],
  ["china gdp growth since 2000", ["world_economy"]],
  ["japan debt to gdp", ["world_economy","economic_outlook"]],
  ["when does the fed meet next", ["fomc","economic_calendar"]],
  ["jobs report date", ["economic_calendar"]],
  ["tesla stock prices last month", ["price_history"]],
  ["historical prices for the s&p 500 index", ["price_history"]],
  ["usd jpy exchange rates", ["price_history"]],
  ["crude oil futures prices", ["price_history","futures_curve"]],
  ["vix futures term structure", ["futures_curve"]],
  ["implied volatility of apple options", ["options_chain","volatility_surface","implied_volatility"]],
  ["put call ratio for spy", ["options_chain"]],
  ["volatility smile skew for qqq", ["volatility_surface"]],
  ["short squeeze candidates short interest", ["short_interest"]],
  ["nvidia annual report", ["read_filing","list_filings"]],
  ["amazon net sales by year", ["history","known_as_of","company_report"]],
  ["insider buying at meta", ["insider_trades"]],
  ["who are apple's largest shareholders", ["large_holders"]],
  ["ceo compensation at tesla", ["executive_pay"]],
  ["tesla 8-k filings", ["list_filings","company_events"]],
  ["compare profit margins across banks", ["screen_companies","cross_section"]],
  ["revenue by region for nike", ["segment_revenue"]],
  ["what does vanguard total stock market etf hold", ["fund_portfolio"]],
  ["hedge fund 13f holdings of renaissance", ["fund_holdings"]],
  ["companies that recently raised venture funding", ["private_offerings"]],
  ["maximum drawdown of my returns", ["max_drawdown"]],
  ["correlation between my assets", ["correlation_matrix"]],
  ["optimize portfolio weights for max sharpe", ["max_sharpe_portfolio"]],
  ["garch volatility forecast", ["garch_volatility"]],
  ["beta of a stock against the market", ["capm_regression","rolling_beta","levered_beta"]],
  ["price an american put option", ["american_option"]],
  ["bond duration and convexity", ["bond_price","bond_yield","key_rate_durations"]],
  ["rsi indicator for my prices", ["rsi"]],
  ["is my backtest overfit", ["validate_overfitting","validate_deflated_sharpe","deflated_sharpe_ratio"]],
  ["test pairs trading cointegration", ["cointegration_test","johansen_cointegration"]],
  ["monthly returns table", ["monthly_returns_table"]],
  ["kelly bet size", ["kelly_fraction","kelly_portfolio"]],
  ["place a paper trade buy 10 shares of aapl", ["preview_paper_orders","send_paper_orders"]],
  ["my paper positions", ["paper_account"]],
  ["canli research on value investing", ["search_research"]],
  ["what is the current cpi", ["economic_series"]],
  ["chart of the 10 year yield since 2020", ["treasury_yields","economic_series"]],
  ["are we in a recession", ["economic_series","economic_outlook"]],
  ["eurozone unemployment forecast", ["economic_outlook"]],
  ["brazil inflation history", ["world_economy"]],
  ["next fomc meeting date", ["fomc","economic_calendar"]],
  ["upcoming economic releases", ["economic_calendar"]],
  ["apple share price history", ["price_history"]],
  ["btc usd daily closes", ["price_history"]],
  ["spy option chain", ["options_chain"]],
  ["term structure of implied volatility for tsla", ["volatility_surface"]],
  ["how many shares of amc are sold short", ["short_interest"]],
  ["cot report for euro futures", ["futures_positioning"]],
  ["what stocks does blackrock hold in its 13f", ["fund_holdings"]],
  ["holdings of the qqq etf", ["fund_portfolio","index_constituents"]],
  ["list of dow jones stocks", ["index_constituents"]],
  ["who owns 10% of tesla", ["large_holders","insider_trades"]],
  ["executive salaries at microsoft", ["executive_pay"]],
  ["microsoft cloud revenue segment", ["segment_revenue"]],
  ["find 10-k risk factors for amazon", ["read_filing"]],
  ["search sec filings for artificial intelligence", ["search_filings"]],
  ["companies with the highest return on equity", ["screen_companies"]],
  ["apple earnings per share history", ["history","known_as_of"]],
  ["did the company restate its numbers", ["restatements"]],
  ["how did stocks react to earnings announcements on average", ["event_study"]],
  ["sortino ratio of my portfolio", ["sortino_ratio"]],
  ["value at risk 99% historical simulation", ["value_at_risk","portfolio_var"]],
  ["efficient frontier for these assets", ["efficient_frontier"]],
  ["black scholes call price", ["black_scholes"]],
  ["option greeks delta gamma", ["black_scholes","option_portfolio_greeks"]],
  ["macd crossover signal", ["macd","backtest_macd_trend"]],
  ["bollinger bands", ["bollinger_bands"]],
  ["yield to maturity of a bond", ["bond_yield"]],
  ["forward rate between two years", ["forward_rate"]],
  ["risk parity weights", ["risk_parity_portfolio"]],
  ["is the sharpe ratio significant after many trials", ["validate_deflated_sharpe","deflated_sharpe_ratio","validate_haircut_sharpe"]],
  ["check my returns for lookahead bias", ["check_leakage"]],
  ["how long a track record to prove skill", ["validate_track_record"]],
  ["momentum factor backtest without look-ahead", ["pit_factor","backtest_cross_sectional_momentum","backtest_time_series_momentum"]],
  ["buy spy in my alpaca paper account", ["preview_paper_orders","send_paper_orders"]],
  ["canli's published research", ["search_research","list_topics"]],
  ["dark pool trading share", ["off_exchange_volume"]],
  ["failed settlements naked shorting", ["fails_to_deliver"]],
  ["regulation d offerings filed this month", ["private_offerings"]],
  ["registered investment advisor lookup", ["investment_advisers"]],
  ["treasury auction results", ["treasury_auctions"]],
  ["how big is the national debt", ["federal_debt"]],
  ["world bank gdp per capita india", ["world_economy"]],
];

test("everyday requests: a right tool first in at least 86 of 96, in the top three in at least 94", () => {
  let top1 = 0, top3 = 0;
  const misses = [];
  for (const [q, want] of EVERYDAY_Q) {
    const r = search(INDEX, q, { limit: 3 }).map((t) => t.name);
    if (want.includes(r[0])) top1++;
    if (r.some((n) => want.includes(n))) top3++; else misses.push(`${q} -> ${r.join(", ")}`);
  }
  console.log(JSON.stringify({ top1, top3, misses }));
  assert.ok(top1 >= 86 && top3 >= 94, JSON.stringify({ top1, top3, misses }));
});

test("a request word that is a built-in property name (\"constructor\") is an ordinary word", () => {
  for (const q of ["constructor", "portfolio constructor", "__proto__ value"]) assert.doesNotThrow(() => search(INDEX, q, { limit: 3 }), q);
});
