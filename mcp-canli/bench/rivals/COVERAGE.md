# Coverage: which finance questions each server has a tool for

Checked by `node bench/rivals/coverage.mjs` against each server's own tool list: canli-mcp's `src/index.json` and the rivals' `tools/list` taken 2026-10-11 (`rivals-tools-2026-10-11.json`; versions pinned in `env/`). Every tool named below exists, or the script fails. "yes" means a keyless tool for the question exists; it does not mean the answer is right, which the head-to-head benchmark (REPORT.md) measures: canli-mcp 79% against the best rival's 54% on the questions every server finished.

| | canli-mcp | OpenBB | EdgarTools | Yahoo Finance MCP |
|---|---|---|---|---|
| Questions with a keyless tool (of 53) | 49 | 39 | 11 | 13 |
| Tools listed | 306 behind 3 (find_tool, describe_tool, run_tool) | 1056 | 13 | 9 |
| Tokens of tool definitions per request (REPORT.md) | 859 | 432,001 (2,171 in discovery mode) | 3,801 | 2,205 |

| Area | Question | canli-mcp | OpenBB | EdgarTools | Yahoo | Note |
|---|---|---|---|---|---|---|
| Companies | Multi-year financial statements | yes | yes | yes | yes |  |
| Companies | Financials as first reported, and what was restated | yes | · | · | · | Point-in-time figures, as an investor could have known them. |
| Companies | One section of a 10-K or 10-Q (risk factors, MD&A) | yes | yes | yes | · |  |
| Companies | Search the text of every filing | yes | yes | yes | · |  |
| Companies | Screen every listed company on fundamentals | yes | yes | yes | · |  |
| Companies | Revenue by segment | yes | yes | yes | · |  |
| Companies | Executive pay, and pay versus performance | yes | yes | yes | · |  |
| Companies | A company's events from its 8-Ks (deals, executive changes, restatements) | yes | · | yes | · | canli reads each 8-K item; EdgarTools lists recent filings. |
| Companies | One kind of event across the market (restatements, bankruptcies, cyber incidents) | yes | · | · | · |  |
| Companies | News headlines | · | yes | · | yes | Not primary sources; canli reads the companies' own 8-Ks instead. |
| Companies | Analyst estimates, price targets, recommendations | · | yes | · | yes | No primary source publishes these. |
| Companies | Upcoming earnings dates | · | yes | · | · |  |
| Companies | Dividends and splits | yes | yes | · | yes |  |
| Companies | How the stock reacted to events (event study) | yes | · | · | · |  |
| Companies | How often filings mention a theme over time | yes | · | yes | · |  |
| Ownership | Insider buying and selling (Form 4) | yes | yes | yes | yes |  |
| Ownership | A fund manager's 13F holdings and changes | yes | yes | yes | yes |  |
| Ownership | 5 percent holders and activists (13D/13G) | yes | yes | · | · |  |
| Ownership | New activist stakes across the market | yes | · | · | · |  |
| Ownership | Short interest | yes | yes | · | · |  |
| Ownership | Fails to deliver | yes | yes | · | · |  |
| Ownership | Dark pool and OTC volume | yes | yes | · | · |  |
| Funds | What a mutual fund or ETF holds | yes | yes | yes | · |  |
| Funds | Fund flows and monthly returns | yes | yes | · | · |  |
| Funds | Private raises by startups and funds (Form D) | yes | · | · | · |  |
| Funds | Investment advisers (Form ADV) | yes | yes | · | · |  |
| Markets | US stock and ETF prices | yes | yes | · | yes |  |
| Markets | Stocks listed outside the US | yes | yes | · | yes | OpenBB: Canada only (TMX). Yahoo: any Yahoo symbol. |
| Markets | Currency pairs | yes | yes | · | yes |  |
| Markets | Futures prices | yes | yes | · | yes |  |
| Markets | Futures curves (term structure) | yes | yes | · | · |  |
| Markets | Crypto prices | yes | yes | · | yes |  |
| Markets | Index levels | yes | yes | · | yes |  |
| Markets | Index constituents | yes | yes | · | · |  |
| Markets | Options chains with implied volatility and greeks | yes | yes | · | yes | canli: Cboe's delayed data, approved by the owner 2026-10-11 (PR #450). |
| Markets | Volatility smile, surface and term structure | yes | yes | · | · |  |
| Rates | Treasury yield curve | yes | yes | · | · |  |
| Rates | Treasury auctions, results and upcoming | yes | yes | · | · |  |
| Rates | The federal debt | yes | yes | · | · |  |
| Rates | Corporate bond prices | · | yes | · | · |  |
| Rates | Futures positioning (CFTC Commitments of Traders) | yes | with a key | · | · |  |
| Economy | US economic series (inflation, jobs, GDP) | yes | with a key | · | · |  |
| Economy | Any country's economy | yes | yes | · | · |  |
| Economy | Economic forecasts | yes | yes | · | · |  |
| Economy | Central bank decisions and documents (FOMC) | yes | yes | · | · |  |
| Economy | Economic calendar | yes | yes | · | · |  |
| Analytics | Performance and risk (Sharpe, drawdown, VaR) | yes | · | · | · |  |
| Analytics | Option pricing and greeks from inputs | yes | yes | · | · |  |
| Analytics | Portfolio construction (min variance, risk parity, Black-Litterman) | yes | · | · | · |  |
| Analytics | Factor returns | yes | yes | · | · | canli: its own point-in-time factors; OpenBB: Ken French's data library. |
| Analytics | Strategy backtests | yes | · | · | · |  |
| Analytics | Is a backtest overfit (deflated Sharpe, PBO, reality check) | yes | · | · | · |  |
| Trading | Paper trading behind pre-trade checks | yes | · | · | · |  |

"with a key": OpenBB's only tools for the question come from providers that declare credentials in their own package (FRED, BLS and EIA an API key, CFTC an app token).

Only canli-mcp: financials as first reported, and what was restated; one kind of event across the market (restatements, bankruptcies, cyber incidents); how the stock reacted to events (event study); new activist stakes across the market; private raises by startups and funds (form d); futures positioning (cftc commitments of traders); us economic series (inflation, jobs, gdp); performance and risk (sharpe, drawdown, var); portfolio construction (min variance, risk parity, black-litterman); strategy backtests; is a backtest overfit (deflated sharpe, pbo, reality check); paper trading behind pre-trade checks.

canli-mcp has no tool yet: news headlines; analyst estimates, price targets, recommendations; upcoming earnings dates; corporate bond prices.
