# Coverage: which finance questions each server has a tool for

Checked by `node bench/rivals/coverage.mjs` against each server's own tool list: canli-mcp's `src/index.json` and the rivals' `tools/list` taken 2026-10-11 (`rivals-tools-2026-10-11.json`; versions pinned in `env/`). Every tool named below exists, or the script fails. "yes" means a keyless tool for the question exists; it does not mean the answer is right, which the head-to-head benchmark (REPORT.md) measures: canli-mcp 79% against the best rival's 54% on the questions every server finished.

| | canli-mcp | OpenBB | EdgarTools | Yahoo Finance MCP |
|---|---|---|---|---|
| Questions with a keyless tool (of 53) | 40 (20 released, 20 in PR #447) | 39 | 11 | 13 |
| Tools listed | 285 behind 3 (find_tool, describe_tool, run_tool) | 1056 | 13 | 9 |
| Tokens of tool definitions per request (REPORT.md) | 859 | 432,001 (2,171 in discovery mode) | 3,801 | 2,205 |

| Area | Question | canli-mcp | OpenBB | EdgarTools | Yahoo | Note |
|---|---|---|---|---|---|---|
| Companies | Multi-year financial statements | yes | yes | yes | yes |  |
| Companies | Financials as first reported, and what was restated | yes | · | · | · | Point-in-time figures, as an investor could have known them. |
| Companies | One section of a 10-K or 10-Q (risk factors, MD&A) | yes | yes | yes | · |  |
| Companies | Search the text of every filing | yes | yes | yes | · |  |
| Companies | Screen every listed company on fundamentals | yes | yes | yes | · |  |
| Companies | Revenue by segment | · | yes | yes | · |  |
| Companies | Executive pay, and pay versus performance | yes (PR #447) | yes | yes | · |  |
| Companies | A company's events from its 8-Ks (deals, executive changes, restatements) | yes (PR #447) | · | yes | · | canli reads each 8-K item; EdgarTools lists recent filings. |
| Companies | One kind of event across the market (restatements, bankruptcies, cyber incidents) | yes (PR #447) | · | · | · |  |
| Companies | News headlines | · | yes | · | yes | Not primary sources; canli reads the companies' own 8-Ks instead. |
| Companies | Analyst estimates, price targets, recommendations | · | yes | · | yes | No primary source publishes these. |
| Companies | Upcoming earnings dates | · | yes | · | · |  |
| Companies | Dividends and splits | yes | yes | · | yes |  |
| Companies | How the stock reacted to events (event study) | yes | · | · | · |  |
| Companies | How often filings mention a theme over time | yes | · | yes | · |  |
| Ownership | Insider buying and selling (Form 4) | yes | yes | yes | yes |  |
| Ownership | A fund manager's 13F holdings and changes | yes | yes | yes | yes |  |
| Ownership | 5 percent holders and activists (13D/13G) | yes (PR #447) | yes | · | · |  |
| Ownership | New activist stakes across the market | yes (PR #447) | · | · | · |  |
| Ownership | Short interest | yes (PR #447) | yes | · | · |  |
| Ownership | Fails to deliver | · | yes | · | · |  |
| Ownership | Dark pool and OTC volume | · | yes | · | · |  |
| Funds | What a mutual fund or ETF holds | yes (PR #447) | yes | yes | · |  |
| Funds | Fund flows and monthly returns | yes (PR #447) | yes | · | · |  |
| Funds | Private raises by startups and funds (Form D) | yes (PR #447) | · | · | · |  |
| Funds | Investment advisers (Form ADV) | · | yes | · | · |  |
| Markets | US stock and ETF prices | yes | yes | · | yes |  |
| Markets | Stocks listed outside the US | yes (PR #447) | yes | · | yes | OpenBB: Canada only (TMX). Yahoo: any Yahoo symbol. |
| Markets | Currency pairs | yes (PR #447) | yes | · | yes |  |
| Markets | Futures prices | yes (PR #447) | yes | · | yes |  |
| Markets | Futures curves (term structure) | · | yes | · | · |  |
| Markets | Crypto prices | yes (PR #447) | yes | · | yes |  |
| Markets | Index levels | yes (PR #447) | yes | · | yes |  |
| Markets | Index constituents | yes (PR #447) | yes | · | · |  |
| Markets | Options chains with implied volatility and greeks | · | yes | · | yes | canli: Cboe's delayed chains work but await the owner's licensing decision. |
| Markets | Volatility smile, surface and term structure | · | yes | · | · |  |
| Rates | Treasury yield curve | yes | yes | · | · |  |
| Rates | Treasury auctions, results and upcoming | yes (PR #447) | yes | · | · |  |
| Rates | The federal debt | yes (PR #447) | yes | · | · |  |
| Rates | Corporate bond prices | · | yes | · | · |  |
| Rates | Futures positioning (CFTC Commitments of Traders) | yes (PR #447) | with a key | · | · |  |
| Economy | US economic series (inflation, jobs, GDP) | yes | with a key | · | · |  |
| Economy | Any country's economy | yes (PR #447) | yes | · | · |  |
| Economy | Economic forecasts | · | yes | · | · |  |
| Economy | Central bank decisions and documents (FOMC) | yes (PR #447) | yes | · | · |  |
| Economy | Economic calendar | · | yes | · | · |  |
| Analytics | Performance and risk (Sharpe, drawdown, VaR) | yes | · | · | · |  |
| Analytics | Option pricing and greeks from inputs | yes | yes | · | · |  |
| Analytics | Portfolio construction (min variance, risk parity, Black-Litterman) | yes | · | · | · |  |
| Analytics | Factor returns | yes | yes | · | · | canli: its own point-in-time factors; OpenBB: Ken French's data library. |
| Analytics | Strategy backtests | yes | · | · | · |  |
| Analytics | Is a backtest overfit (deflated Sharpe, PBO, reality check) | yes | · | · | · |  |
| Trading | Paper trading behind pre-trade checks | yes | · | · | · |  |

"with a key": OpenBB's only tools for the question come from providers that declare credentials in their own package (FRED, BLS and EIA an API key, CFTC an app token).

Only canli-mcp: financials as first reported, and what was restated; one kind of event across the market (restatements, bankruptcies, cyber incidents); how the stock reacted to events (event study); new activist stakes across the market; private raises by startups and funds (form d); futures positioning (cftc commitments of traders); us economic series (inflation, jobs, gdp); performance and risk (sharpe, drawdown, var); portfolio construction (min variance, risk parity, black-litterman); strategy backtests; is a backtest overfit (deflated sharpe, pbo, reality check); paper trading behind pre-trade checks.

canli-mcp has no tool yet: revenue by segment; news headlines; analyst estimates, price targets, recommendations; upcoming earnings dates; fails to deliver; dark pool and otc volume; investment advisers (form adv); futures curves (term structure); options chains with implied volatility and greeks; volatility smile, surface and term structure; corporate bond prices; economic forecasts; economic calendar.
