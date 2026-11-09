# canli-markets-mcp

[![npm](https://img.shields.io/npm/v/canli-markets-mcp)](https://www.npmjs.com/package/canli-markets-mcp) [![npm downloads](https://img.shields.io/npm/dw/canli-markets-mcp)](https://www.npmjs.com/package/canli-markets-mcp) [![License: MIT](https://img.shields.io/badge/License-MIT-blue)](https://github.com/arhancanli/canlicapital/blob/main/LICENSE)

Public market data for AI agents, read from the sources themselves: SEC EDGAR, the US Treasury,
FRED, the World Bank, the New York Fed, the ECB, the Bank of England and the BIS, European companies'
ESEF reports, prediction markets, DeFi data and prices for stocks, currencies, futures, indices and
crypto, with no key and no account. Every
request goes from your machine straight to the source, and every result names the URL it came
from, so an agent can cite it.

```json
{ "mcpServers": { "canli-markets": { "command": "npx", "args": ["-y", "canli-markets-mcp"] } } }
```

Set `SEC_USER_AGENT` to your name and email (`"Jane Doe jane@example.com"`), as SEC's fair-access
policy asks. Prices need no key: they come from Yahoo Finance's public chart data, which is
unofficial and for personal use under Yahoo's terms. To use your own account instead, set
`ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY` (paper keys work) or `TIINGO_API_KEY`;
`CANLI_KEYLESS_PRICES=0` turns the keyless source off, and with it every other read of Yahoo's data
(`stock_snapshot`, `analyst_history`, `market_movers`, `etf_profile`).

**[canli-markets-mcp on canlicapital.com](https://canlicapital.com/mcp-servers/markets)** · [All Canli Capital MCP servers](https://canlicapital.com/mcp-servers). Free, MIT-licensed. For every server behind one install, use [canli-mcp](https://www.npmjs.com/package/canli-mcp).

## Research across the whole market

Other finance servers answer one company at a time. These answer questions about the market:

| Tool | What it answers | Source |
| --- | --- | --- |
| `screen_companies` | Rank every US-listed company (about 3,800 with FY2025 data) on revenue, growth, margins, ROE, ROA, free cash flow, R&D intensity or leverage, with filters and valuation for the shortlist | SEC XBRL frames, prices |
| `company_report` | Everything about one company in one call: five years of financials, valuation, a year of price and risk, insider buying and selling, recent filings | SEC, prices |
| `event_study` | How the stock reacted to earnings releases, insider purchases or sales, or any dates: abnormal returns against a market model, with a t test across events | SEC filing times, prices |
| `mentions_trend` | How often filings mention a phrase, by month, quarter or year | EDGAR full-text search |

Examples: "Which large companies grew revenue fastest in 2025, and what do they trade at?", "Rank
companies over $50 billion of revenue by R&D intensity", "Does NVIDIA's stock rise after its
earnings releases?", "How fast are filings adopting the phrase 'agentic AI'?".

Figures no real company reports (one 2026 filing tagged $1.157 billion of net income as $1,157
billion) are held out of rankings and listed apart, with the reason.

Every result also carries `evidence`: the documents read, with the SHA-256 of the exact bytes
received and when, so any figure can be checked against the same document later.

## An analyst's filings

| Tool | What it answers | Source |
| --- | --- | --- |
| `financial_statements` | The income statement, balance sheet, cash flow and equity statement exactly as filed, several years joined; what a later filing restated, and what a split changed, beside the first-reported figure | 10-K/10-Q rendered XBRL reports |
| `filing_tables` | The table that holds a figure, by words, in one filing or followed through several (members, stores, ARPU, segment and region detail, non-GAAP reconciliations, guidance tables) | 10-K/10-Q/8-K documents and XBRL reports |
| `earnings_release` | A results press release: the results, the guidance as ranges, and last quarter's guidance against this quarter's results | 8-K Item 2.02, exhibit 99 |
| `release_check` | A results press release set against the 10-Q or 10-K filed after it: the figures that changed (release and filed values, difference, the XBRL concept and how the line was matched), release figures with no counterpart, and lines the report adds (Vicor's Q1 2024: net income of $2.6 million in the release, a $14.5 million loss in the 10-Q after a $17.2 million litigation charge) | 8-K Item 2.02 exhibit 99, 10-Q/10-K inline XBRL |
| `filing_check` | Every number in a 10-K or 10-Q read twice, as a person reads the document and as machines read its inline XBRL: figures tagged at a scale other than the unit stated for them, a fact tagged twice with different values, sums in the filing's own calculation that do not add up, and facts SEC's company facts hold differently or not at all, each with a link to the figure and counts of what was checked (Microsoft's FY2026 10-K: "up to 48,700 shares" tagged as 48.7 billion shares) | 10-K/10-Q inline XBRL and calculation linkbase, XBRL company facts |
| `source_check` | Whether the documents behind an answer are still the bytes it was read from: each evidence row (or a canli-mcp receipt's source) read again past every cache, as the same, changed since, or unreachable. Only documents from the sources this server reads are fetched. |
| `verify_claims` | Is a figure in a draft answer right? Confirmed, contradicted (with the filed figure and what the wrong one matches: last year, a quarter, a unit slip, the wrong currency), or not reported (a future year, a dividend a company never paid); US and foreign filers (20-F, IFRS) in the currency they report in | XBRL company facts |

Examples: "Show Microsoft's last four years of income statements as filed", "How has Costco's
paid membership grown over five years?", "Did NVIDIA beat its revenue guidance last quarter, and
what is it guiding to now?", "What full-year EPS range is Walmart guiding to, and how has it moved
since the original guide?", "Check this paragraph's numbers before I send it.", "Does anything in
Parsons' latest 10-Q read differently to a machine than to a person?"

## Beyond the US

| Tool | What it answers | Source |
| --- | --- | --- |
| `european_filings` | A European company's annual report as it tagged it: revenue, operating and net profit, EPS, assets, equity, cash, cash flows and dividends with the comparatives, in its own currency at full scale; any other tagged figure by words; the other years on file | ESEF reports (filings.xbrl.org) |
| `reference_rates` | The ECB's euro exchange reference rates (`fx:GBP`), SOFR, TGCR, BGCR, EFFR and OBFR (with percentiles and volume), the euro short-term rate and the ECB's policy rates (the rate in effect and its changes), SONIA and Bank Rate, and about forty central banks' policy rates | New York Fed, ECB, Bank of England, BIS |
| `prediction_markets` | What traders pay for an outcome (a Fed decision, a recession, an election), as a probability with bid, ask, volume and closing date, from both venues | Polymarket, Kalshi |
| `crypto_fundamentals` | A DeFi protocol's value locked (by chain, with history), the fees users pay it and the revenue it keeps; a chain's value locked; a stablecoin's supply and its change | DefiLlama |

Examples: "What did ASML report for 2025 revenue and net profit?", "Where is SOFR against the
fed funds range this month?", "When did the ECB last change its deposit rate?", "What odds do
prediction markets give a US recession this year?", "How much revenue does Aave keep from its
fees?". `bench/global/crosscheck.mjs` sets these tools against sources they do not read: ESEF
figures against the same companies' Form 20-F at the SEC, and the central banks' policy rates
against the BIS (21 of 21 agreed on 2026-10-15).

## Every country's economy, from the office that publishes it

`world_series` reads a country's figures where they are published: Statistics Canada, the ONS,
the ABS, IBGE, Statistics Norway and Sweden, Eurostat for EU members, the Fed (through FRED), the
Bank of Canada, Bank of England, ECB, Bundesbank, Bank of Japan, Japan's Ministry of Finance, the
RBA, Banco Central do Brasil, the Riksbank, Norges Bank, the SNB and the Bank of Israel. Where a
country has no open service of its own, it reads the OECD's, IMF's or BIS's compilation of that
country's official figures, and the answer says who compiled it. Sixteen measures for 70 countries
and the euro area, with no key:
- inflation, core inflation, unemployment and GDP growth;
- the policy rate, with its recent moves, the 10-year yield and the exchange rate;
- industrial production, retail sales and wages;
- the OECD's leading indicator, consumer and business confidence;
- government debt, money supply and house prices.

- One country, every measure: `{"country": "Brazil", "measure": "all"}`.
- Up to 30 countries side by side, read in one request per publisher: `{"countries": ["G20"], "measure": "inflation"}`.
- Checked against a second official publisher: `{"countries": ["G20"], "measure": "inflation", "check": true}` answers in about three seconds. 18 of the 20 agreed within 0.15 points on 2026-11-04; France's harmonised index and the UK's CPI differ from the IMF's by definition, and the answer says so.
- Any series by its publisher's own code: `{"series": "statcan:2062815"}`, `{"series": "boj:FM01/STRDCLUCON"}`, `{"series": "eurostat:une_rt_m?geo=DE&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT"}`.

`economic_series` reads any FRED series as it was published on a past date (`as_of`, from
ALFRED), with each value then against today's (`revisions`). Payrolls for July 2025 were
159,539 thousand as published on 1 September 2025, and are 158,542 thousand now.

Examples: "What is inflation in Brazil, and does the IMF agree?", "Compare the G7's policy rates",
"Japan's economy at a glance", "Which euro area country has the highest 10-year yield?", "What did
payrolls look like before the benchmark revision?".

## Tools

| Tool | What it answers | Source |
| --- | --- | --- |
| `company_profile` | Who is this company or fund: tickers, industry, fiscal year, latest 10-K/10-Q/8-K/13F | SEC |
| `list_filings` | What has it filed: by form and date, with links | SEC |
| `read_filing` | What does the filing say: one 10-K/10-Q item ("risk factors", "md&a"), an 8-K press release (`EX-99.1`), paged | SEC |
| `search_filings` | Which filings mention a phrase, since 2001 | EDGAR full-text search |
| `company_events` | A company's news from its 8-Ks (earnings, deals, executive changes, restatements, bankruptcies, cyber incidents): the headline of the press release attached, and the filing's own words; or one kind of event across the market | Form 8-K |
| `latest_filings` | What has just been filed, across every company: newest first by acceptance time, by form (8-K, 10-K, 4, SC 13D, S-1), 8-K event and filer name; the last few business days | EDGAR latest-filings feed |
| `filing_diff` | What changed in a 10-K (or 10-Q) against the one before, section by section: new and dropped paragraphs, the sentences changed in the rest, and the words whose use rose or fell most (Apple 2025: court, remedies, enforcement from 0 to 4 or 5) | SEC EDGAR filings |
| `news` | News about a company or a topic from the world's press: articles newest first with outlet and country, and the daily average tone of the coverage | GDELT Project (open index, no key) |
| `explain_move` | Why a stock moved on a day: its return against the market and how rare it was for the stock (z-score from a one-year market model), the SEC filings around the day and the press's headlines (NVIDIA 2026-08-27: +7.6% abnormal, z 4.3, its earnings 8-K the evening before) | Price provider, SEC EDGAR, GDELT |
| `portfolio_xray` | A portfolio seen through its funds: each ETF or fund opened into its latest N-PORT positions and added to the stocks held directly, for the real exposure to each company, the overlap between funds and the effective number of positions | SEC Form N-PORT |
| `comps` | A comparable-companies table: the company beside its listed peers under the same SEC industry code, the nearest in revenue, on growth, margins, ROE, R&D intensity and FCF margin, with the peers' median and the company's rank on each | SEC XBRL frames and EDGAR's company list by SIC |
| `debt_profile` | A company's debt from its annual reports: total and net debt, the maturity ladder from its debt note, lease payments, interest expense, implied rate, coverage and debt to EBITDA, with five years of debt and cash (AT&T 2025: $134.7 billion, 5.3% implied, covered 3.6 times) | SEC XBRL company facts |
| `bond_offerings` | The bonds a company sold, tranche by tranche: amount, coupon, maturity, price, yield, spread over Treasuries (mid-swaps for euro bonds, the index for floating notes), benchmark and CUSIP from each final term sheet, with fee tables confirming amounts and every dollar yield recomputed from its price (Microsoft, January 2017: seven tranches, $17 billion) | SEC EDGAR term sheets and prospectus fee tables |
| `ownership_breadth` | How many institutions hold a stock, quarter by quarter: 13F filers whose holdings tables list its CUSIP, the change, and a sample of holders (Apple, Q2 2026: 6,776, up 1.9% on the quarter) | EDGAR full-text search over 13F information tables |
| `forensic_scores` | Beneish's M-score, Piotroski's F-score and Altman's Z-score in one call, every input read from the company's annual XBRL with its tag, and missing inputs named rather than guessed | SEC XBRL company facts, price at the fiscal year end |
| `default_risk` | A Canli model: the chance a company reports a bankruptcy within a year of its latest 10-K, from that report's figures, ranked among the year's reports, with Ohlson's O and Altman's Z'' beside it and the walk-forward test's results (where Ohlson's O did better included) | SEC XBRL company facts and submissions |
| `audit_signals` | What auditors and companies say when something is wrong: each 10-K and 10-Q that states substantial doubt about the company's ability to continue as a going concern, as a timeline (first raised, still raised, lifted), or across the market the companies whose latest report newly raised it; auditor changes from 8-K Item 4.01 (who left, who came, resigned or dismissed, disagreements and reportable events); the latest 10-K's critical audit matters. Every row quotes the filing (LiveWire Group's 10-Q of 4 November 2026: "These conditions and events raise substantial doubt about the Company's ability to continue as a going concern.") | 10-K/10-Q text, 8-K Item 4.01, EDGAR full-text search |
| `funding_rates` | Crypto perpetual funding: each coin's latest eight-hour rate, the window's mean and annualized carry, the last week's, and the share of positive periods (BTC, 90 days to 2026-10-24: 5.6% a year) | OKX public data (no key) |
| `compute_prices` | Compute as a market: the on-demand hourly price of each data-centre GPU across the clouds (cheapest, median and dearest, and who offers them), every provider's offer for one model, recent list-price changes, and the Cirrun GPU Index (H100 SXM, 2026-10-24: $1.99 to $12.29 an hour, median $3.95) | Cirrun's GPU price index (no key, CC BY 4.0) |
| `federal_contracts` | What the US government obligated to a company in a fiscal year: the total, by agency and industry code, the entities it contracts under, and its largest contracts with links (Lockheed Martin, fiscal 2026: $53.2 billion from Defense) | USAspending.gov (no key) |
| `drug_pipeline` | A drug company's active clinical trials by phase, the primary completions due in the coming months (the next readouts), its late-stage trials and its FDA approvals (Vertex: 31 active trials, 16 in phase 3) | ClinicalTrials.gov and Drugs@FDA (no key) |
| `enforcement_actions` | The SEC's latest litigation releases and administrative proceedings, across the market or for one company or person. |
| `consumer_complaints` | Complaints to the CFPB about a bank, lender or credit bureau: totals, the last 12 months, products, issues, and how often it answered in time. Unverified and not adjusted for size. |
| `product_recalls` | A firm's FDA recalls of drugs, devices and food with class and reason, and a vehicle's NHTSA recalls. |
| `sanctions_check` | The Treasury's SDN list and aliases by whole words. Not a compliance screening: no match is not clearance. |
| `federal_rules` | Federal Register rules, proposed rules and notices by words and agency, with comment deadlines; can list only those still open. |
| `security_identifiers` | One security's FIGIs, listings and type from a ticker, ISIN, CUSIP, SEDOL or FIGI; check digits tested first. |
| `legal_entity` | The Global LEI register: legal name, jurisdiction, status, former names, parents and children, worldwide. |
| `world_yields` | US, euro area, UK, Japan and Canada government yields by maturity, with each curve's date, basis and slope, and 10-year spreads to the US. |
| `credit_cycle` | The BIS credit-to-GDP ratio, trend and gap by country. |
| `dividend_history` | Payments by ex-date, totals by year, trailing yield, five-year growth, the streak of rising totals and splits. |
| `comment_letters` | What the SEC's staff questioned in a company's filings and how it answered, grouped into reviews, with the topics of the newest letters (Apple, 2024: revenue recognition, segments, MD&A) | SEC EDGAR forms UPLOAD and CORRESP |
| `shareholder_returns` | What a company has paid its owners each year: dividends per share (with its split-adjusted record: years raised in a row, 5- and 10-year growth) and in total, buybacks and shares issued, the diluted share count, the payout ratio and the share of free cash flow paid out, and the dividend and shareholder yields at the last close | SEC XBRL company facts, the last close |
| `buybacks` | A company's share repurchases by fiscal year or quarter: cash paid, shares bought and the value recorded for them, the average price, the program's authorized and remaining amounts where tagged, and the change in shares outstanding, each figure with the filing it came from and untagged figures named, not estimated (Apple, FY2025: 402 million shares for $89.3 billion, $222.14 a share; shares outstanding down 2.3%) | SEC XBRL company facts |
| `reverse_dcf` | The free-cash-flow growth a share price implies: a DCF solved for the growth that reaches the market's enterprise value, every input from the annual XBRL with its tag, a sensitivity table and the company's own growth beside it | SEC XBRL company facts, the last close |
| `filing_memory` | Everything one company has said about a subject across every annual report it has on EDGAR, back to the 1990s where they exist: the best passages with links, how often it came up each year, and optionally how that moved with a margin, tested against chance. Runs on your machine; no key. |
| `filing_sentiment` | The tone of a filing or any text, sentence by sentence, from FinBERT on your machine. Needs `canli-mcp models install`. The model is licensed for non-commercial use. |
| `stock_snapshot` | What a quote page shows and no primary source publishes, from Yahoo Finance: analysts' price targets, ratings and estimates, market cap and valuation ratios, 52-week range, short interest, holder percentages, next earnings date. Labeled as a vendor's aggregates. |
| `technical_indicators` | Moving averages, RSI, MACD, Bollinger Bands and ATR for a symbol in one call, from its daily prices. |
| `exposure_map` | Who depends on a company, from what others say in their annual reports: each filer that names it, with the passage, and whether it reads as a supplier, customer or competitor. |
| `guidance_record` | A management team's record against its own guidance, quarter by quarter: above, within or below its range, from its own press releases. |
| `what_happened_next` | Every past time a market or stock fell, rose or sat this far below its high: each case, what followed, and how that compares with an ordinary day. A record, not a forecast. |
| `shipping_activity` | Ships through the world's straits, canals and ports, from the IMF's PortWatch, estimated from satellite tracking. No key. |
| `page_attention` | Daily Wikipedia page views for a company or subject: public attention. No key. |
| `latest_price` | The latest price of a stock, ETF, index, currency or crypto pair, with its time. No key; can run late. |
| `filing_drift` | How a 10-K section's language drifts over several years: each year's change from the last (the measure Cohen, Malloy and Nguyen's "Lazy Prices" found preceded weaker returns), hedging and adverse words, readability, and a theme you name, with flags (Nvidia's risk factors: export-control sentences 8, 14, 37, 48, 51 over five reports) | SEC 10-K filings, computed on your machine |
| `bank_financials` | A US bank's condition quarter by quarter from its call reports: assets, deposits and the share uninsured, loans and the share noncurrent, earnings, margin, returns and capital ratios; with no bank, the latest failures and their cost (Western Alliance, June 2026: 38% of deposits uninsured, tier 1 leverage 8.1%) | FDIC BankFind (no key) |
| `earnings_calendar` | A company's results release dates with the quarter covered and before the open or after the close, and the next one estimated from the same quarter last year; or who is due to report in a window across the market | SEC EDGAR (8-K Item 2.02) |
| `earnings_move` | The move options price for a company's next results (the straddle of the first expiration after them, and the results' own move backed out of the expirations either side) beside its shares' reactions to its last eight releases | Cboe delayed quotes, SEC EDGAR, Yahoo Finance closes (no key) |
| `earnings_season` | How the S&P 500's reporting season is going: how many companies reported, the share that beat, matched or missed the consensus EPS and the median surprise, the ten largest, the biggest beats and misses, by sector, who is due | Nasdaq's calendar (Zacks' consensus), State Street holdings (no key) |
| `figure_trace` | How a figure is built, from the filing: the lines its XBRL calculation adds up, each sum recomputed, what it feeds into, and how it splits. Shows the filing agrees with itself, not that it is right. |
| `segment_revenue` | Where revenue comes from: by segment (with operating income), product and region, three years, checked against total revenue | 10-K/10-Q XBRL |
| `token_check` | What an ERC-20 contract can do (mint, pause, blacklist, upgrade, fees), proxy, owner, supply, and an unlock schedule you give set against it. A clean reading never means safe. |
| `insider_trades` | Who inside bought or sold, at what price, under a 10b5-1 plan or not | Form 4 |
| `planned_insider_sales` | Insiders' planned sales from Form 144, filed before they sell: seller, role, shares, value, approximate sale date, how the shares were acquired, any 10b5-1 plan date, and totals by seller | Form 144 |
| `fund_holdings` | What a fund manager holds, its weights, and what it bought and sold last quarter | 13F |
| `investment_advisers` | Who an investment adviser is: registration, offices, other names, disclosure flags, Form ADV and brochures | SEC Form ADV (IAPD) |
| `large_holders` | Who owns more than 5 percent, passive (13G) or activist (13D, with its stated purpose); or the week's new activist stakes across the market | Schedules 13D and 13G |
| `private_offerings` | Who is raising private money (startups, private equity, hedge and real estate funds): amount sold, investors, exemption, people | Form D |
| `lockup_calendar` | When insiders' shares from recent IPOs may be sold: across the market the lock-ups ending in a window, or one company's terms, each with the length its final prospectus states, the date it counts from (the prospectus date or the closing the cover expects) and the expiry computed from it, dated staged releases, early ends (an earnings release, the share price, a blackout period) quoted, shares locked up and shares sold, and later filings that say it was waived (Cerebras: 180 days after its prospectus of 13 May 2026, so 9 November, or sooner after its earnings release, with six dated releases before) | Final prospectuses (424B4, 424B1), EDGAR full-text search |
| `ipo_pipeline` | Companies that filed or amended a registration (S-1, F-1) in a window, labelled IPO candidate, SPAC, fund or already listed, and offerings priced (424B4) with price, shares and proceeds from the cover | EDGAR full-text search |
| `fails_to_deliver` | Shares that failed to settle for a stock over the last month, or the largest fails across the market | SEC fails-to-deliver data |
| `off_exchange_volume` | How much of a stock trades in dark pools and with other off-exchange dealers each week, and where | FINRA OTC transparency |
| `short_interest` | How heavily a stock is shorted (shares short, days to cover, share of shares outstanding), or the market's most shorted | FINRA |
| `portfolio_rules` | Where your holdings stand against the lines that bring a filing or cap concentration: over 5% of a class (13D or 13G), over 10% (Section 16), $100 million in 13(f) securities (13F), the 75-5-10 and RIC diversification tests, and days to exit | Companies' cover pages (SEC), FINRA volume |
| `futures_positioning` | Who is long and short in a futures market (managed money, dealers, asset managers, leveraged funds) and how crowded | CFTC Commitments of Traders |
| `executive_pay` | What executives are paid against how the company did (reported and actually-paid pay, TSR vs peers), five years; or CEO pay ranked across the market | Proxy pay-versus-performance XBRL |
| `index_constituents` | The members of the S&P 500, S&P 400, the Dow, the Nasdaq 100, Russell 2000, the Select Sectors and other indexes, with weights | State Street's daily holdings of SPY, MDY, DIA and the sector SPDRs; otherwise the N-PORT of a tracking ETF |
| `fund_portfolio` | What a mutual fund or ETF holds (VOO, IVV, AGG): every position, exposures, a bond fund's coupon and maturity, monthly returns and money in and out, and a check on the report itself: the positions' values against the net assets, and total assets less liabilities against them | Form N-PORT |
| `economic_calendar` | When the data comes out: BLS, BEA, Census and FOMC release dates and times, the market-moving ones flagged | The agencies' own schedules |
| `fomc` | The Fed's decisions for a year (action, target range, vote and dissenters), the latest statement and the dot-plot medians | Federal Reserve |
| `treasury_yields` | The Treasury curve (nominal, real, bills) for a day or a range | US Treasury |
| `economic_series` | Any FRED series by id or words ("core inflation"), as levels, changes or year-over-year | FRED |
| `options_chain` | An option chain with IV, greeks, open interest, put/call ratios, max pain and the expected move | Cboe delayed quotes |
| `volatility_surface` | Implied volatility term structure, 25-delta skew and the smile | Cboe delayed quotes |
| `futures_curve` | The VIX futures curve (and other Cboe futures) against the index: contango or backwardation | Cboe settlements |
| `market_overview` | The market at a glance: US indices and the VIX, the eleven sectors ranked by the month, Treasury yields, the dollar and major currencies, oil, gas, gold, silver, copper, bitcoin, ether and the main markets abroad, each over a day, a week, a month, three months, the year to date and a year | Yahoo Finance chart data (no key) |
| `market_breadth` | How many of the S&P 500's (or the S&P 400's, the Dow's, or one sector's) members take part: the share above their 50- and 200-day averages, risers and fallers, 52-week highs and lows, the median distance from the high, the average member against the index, recent sessions, by sector | State Street holdings, Yahoo Finance closes (no key) |
| `price_history` | One-minute to monthly bars (minute bars for the last 30 to 60 days) for stocks in the US and abroad, currencies, futures, indices and crypto, adjusted, with dividends and splits, as columns | Yahoo Finance (no key), or Alpaca or Tiingo (your key) for US stocks |
| `treasury_auctions` | How each Treasury auction went (yield, bid-to-cover, who bought) and which auctions come next | US Treasury Fiscal Data |
| `federal_debt` | The US debt each business day, and the average rate the Treasury pays on it | US Treasury Fiscal Data |
| `treasury_cash` | The Treasury's cash at the Fed each business day since 2005 (the TGA), and the day's largest deposits and withdrawals | Daily Treasury Statement (Fiscal Data) |
| `federal_budget` | Receipts, outlays and the deficit each month, this fiscal year against the same months of the last | Monthly Treasury Statement (Fiscal Data) |
| `factor_returns` | The Fama-French factors (market, size, value, profitability, investment, momentum, the T-bill rate), monthly since 1926, daily or by year, as fractions | Kenneth French's data library |
| `scenario_risk` | A portfolio's holdings under a macro shock (stocks, yields, credit, oil, the dollar, gold, the VIX; the factors not shocked follow history) or a past crisis replayed beside what each holding actually did | Yahoo Finance chart data, FRED |
| `trade_ticks` | Every trade on a crypto market from any past moment, tick by tick, with VWAP, buying against selling, the largest trades and one-minute bars | Kraken's public trade history |
| `trade_flows` | Who a country buys a product from (or sells it to) and each partner's share, or one partner year by year; names Taiwan and the trade with no partner named | UN Comtrade |
| `standardized_financials` | A company's three statements in one template whether it files US GAAP or IFRS, each figure's tag or derivation shown, with ratios; up to five companies side by side, optionally in US dollars | SEC XBRL (10-K, 20-F, 40-F) |
| `financial_cycle` | House prices, debt service ratios, credit to households, companies and government, and effective exchange rates, country by country | Bank for International Settlements |
| `unusual_options` | Contracts trading far beyond their open interest, largest premium first, and the day's call and put premium | Cboe delayed quotes |
| `company_emissions` | A company's US greenhouse-gas emissions, facility by facility, by gas, with its ownership share and a trend | EPA's Greenhouse Gas Reporting Program |
| `crypto_markets` | Coins ranked by market value with price, volume, changes, supply and distance from the high, and the whole market's value and bitcoin's share | CoinGecko (no key) |
| `etf_profile` | What an ETF or fund costs and holds: expense ratio against its category, assets, yield, returns, top holdings, allocation, sectors | Yahoo Finance's fund profile |
| `market_calendar` | Who reports earnings on given days (with the consensus EPS), who goes ex-dividend, the splits coming up, and a month's IPOs, across the market | Nasdaq's public calendars |
| `congress_trades` | Trades by members of the House: owner, asset and ticker, purchase or sale, dates and amount range, by member, state, district or ticker | The Clerk's periodic transaction reports, read from their PDFs |
| `analyst_history` | Every upgrade, downgrade and price-target change by firm, earnings surprises, how the consensus moved, ratings month by month | Yahoo Finance (a vendor's aggregates, labeled so) |
| `market_movers` | Today's biggest gainers, losers and most traded US stocks, and Yahoo's ready-made lists (most shorted, small-cap gainers...) | Yahoo Finance (no key) |
| `market_hours` | Is the market open now, the next open and close, a year's holidays and early closes, trading days between two dates | NYSE's rules, computed (no network) |
| `crypto_options` | Crypto options: each expiry's at-the-money volatility, open interest and put/call ratio, with DVOL, or one expiry's chain in dollars | Deribit public data (no key) |
| `economic_outlook` | The OECD's projections for the next two years: growth, inflation, unemployment, deficits, debt, current account, rates | OECD Economic Outlook |
| `treasury_holders` | Who holds US Treasuries: the major foreign holders by country at the last thirteen month ends, each with its change on a year, share and rank, and foreign official holdings by bills and notes | Treasury TIC system (no key) |
| `labor_market` | The US jobs picture in one answer: payroll gains and their three-month average, unemployment and U-6, participation, prime-age employment, wages, hours, JOLTS openings, quits and layoffs, openings per unemployed person, jobless claims | BLS, Labor Department via FRED (no key) |
| `central_bank_speeches` | Central bankers' latest speeches everywhere with speaker, role and bank; one bank's or speaker's; or one speech in brief excerpts on policy | BIS central bankers' speeches (no key) |
| `commodity_prices` | World commodity prices monthly since 1960: energy, metals, grains, oilseeds, beverages, sugar, cotton, timber, fertilizers, with changes and records and the sector indexes; or one commodity month by month | World Bank Pink Sheet (no key) |
| `fed_speeches` | The Fed Board's latest speeches, testimony and monetary policy releases with speaker, date, venue and link; one member's; or one speech's passages on policy, quoted | Federal Reserve feeds (no key) |
| `inflation_breakdown` | CPI by component: all items and core beside food, energy, gasoline, core goods, used cars, core services, shelter, rent, owners' equivalent rent, medical care and transportation services, on the month, over three months and on a year | BLS CPI via FRED (no key) |
| `state_economy` | A US state beside the nation (unemployment, payroll jobs, the Philadelphia Fed's activity index, house prices, real GDP, each with its change on a year), or every state and DC ranked | BLS, FHFA, BEA and Philadelphia Fed via FRED (no key) |
| `recession_watch` | The recession indicators against their lines: the New York Fed's yield-curve model (reproduced exactly, month by month), the Sahm rule, the 10y-2y curve, jobless claims, the Chauvet-Piger probability, GDPNow, the Fed Board's excess bond premium model | FRED, Fed Board (no key) |
| `financial_conditions` | How tight financial conditions are and how much stress markets show: the OFR's daily stress index by category and region, the NFCI and its parts, the St. Louis and Kansas City Feds' indexes, corporate spreads by rating, Moody's Baa spread, the Fed Board's excess bond premium and the VIX, each with its changes and its percentile in its own history | OFR, Fed Board, FRED (no key) |
| `options_sentiment` | The total, equity, index, ETF, VIX and SPX put/call ratios of the latest trading day with volumes, and the main ratios day by day with 10- and 20-day averages | Cboe daily market statistics (no key) |
| `margin_debt` | Margin debt each month since 1997 with its change on a month and a year, the record and the free credit balances | FINRA margin statistics (no key) |
| `consumer_expectations` | What households expect, monthly: inflation over one, three and five years, home prices, gas, food, rent, earnings, income, spending, and the chances of losing a job, of higher unemployment, of missing a debt payment and of higher stock prices | New York Fed Survey of Consumer Expectations (no key) |
| `gdp_nowcast` | The Atlanta Fed's GDPNow for this quarter: the latest nowcast and each update with the releases behind it, what each part of spending adds, the BEA's latest estimates, and the model's record against the advance estimates | Atlanta Fed GDPNow workbook (no key) |
| `housing_market` | The US housing market, nationally or by metro: Zillow's typical home value with its changes and distance from the peak, Realtor.com's listings (price, active and new listings, days on market, price cuts, pending sales) against a year earlier, the 30-year mortgage rate; or the largest metros ranked by rising or falling values | Zillow Home Value Index, Realtor.com, Freddie Mac via FRED (no key) |
| `reserve_currencies` | What the world's central banks hold their reserves in: each currency's share of the reported reserves and its value in dollars at the latest quarter, the change in share on a year and ten years, and the shares quarter by quarter | IMF COFER (no key) |
| `job_postings` | Labour demand day by day: Indeed's job postings against February 2020 in eleven economies, with the change over four weeks, a quarter and a year and the distance from the peak; by occupational sector or by state, province or region, ranked; or every economy side by side | Indeed Hiring Lab (CC BY 4.0, no key) |
| `rate_expectations` | What fed funds futures price for each coming FOMC meeting: the rate implied after it, the chances of no change, a hike or a cut, and of each target range, by CME FedWatch's method, with the contracts behind it | Fed's meeting calendar, CBOT 30-day fed funds futures (Yahoo), FRED (no key) |
| `inflation_nowcast` | The Cleveland Fed's daily nowcast of CPI, core CPI, PCE and core PCE for the months and quarter not yet published (month over month, year over year, quarter annualized), one month's nowcast day by day, and the nowcast's record against what was published | Federal Reserve Bank of Cleveland (no key) |
| `fed_liquidity` | The Fed's footprint in the money markets: the overnight reverse repo facility's take-up and the standing repo facility's lending each day (its test trades apart), the Fed's securities week by week with the pace they change by type, and total assets, reserves, the TGA and net liquidity, each with changes over a week, four weeks and a year | New York Fed markets API, the Fed's H.4.1 via FRED (no key) |
| `money_markets` | The money markets' plumbing: overnight repo by segment (SOFR, TGCR, BGCR, tri-party, GCF, cleared bilateral) with volumes and spreads to interest on reserves and the reverse repo rate; what money market funds hold and whom their repo is with; primary dealers' Treasury positions by maturity | OFR, New York Fed, FRED (no key) |
| `energy_report` | The week in US oil and gas: crude (commercial, Cushing, the SPR), gasoline, distillate, jet fuel and propane stocks with the change on the week and the year and against the five-year average and range for the week; refinery runs and utilization; production, imports, exports and products supplied over four weeks; natural gas in storage by region against a year ago and the five-year average; one stock week by week against its five-year range | EIA weekly petroleum and natural gas storage reports and weekly history (no key) |
| `crop_outlook` | The USDA's world supply and demand estimates (WASDE) for wheat, corn, coarse grains, rice, cotton, soybeans, meal and oil: stocks, production, trade and use by country for two market years and this year's projection, last month's beside it and the revision | USDA WASDE reports (ESMIS, no key) |
| `world_series` | A country's inflation, core inflation, unemployment, GDP growth, policy rate (with its moves), 10-year yield, exchange rate, industrial production, retail sales, wages, house prices, the OECD's leading indicator, consumer or business confidence, government debt, money supply or central bank assets from the office or central bank that publishes it, for 70 countries and the euro area, one or up to 30 side by side (G7, G20, EU); any series by its publisher's own code; `check: true` compares a second official publisher | Statistics Canada, ONS, ABS, IBGE, Statistics Norway and Sweden, Eurostat, the Fed (FRED), Bank of Canada, Bank of England, ECB, Bundesbank, Bank of Japan, Ministry of Finance Japan, RBA, Banco Central do Brasil, Riksbank, Norges Bank, SNB, Bank of Israel; the IMF, OECD and BIS for countries without an open national service (no key) |
| `world_economy` | Any country's economy: GDP and growth, inflation, unemployment, debt, deficits, trade, reserves, for 200+ countries and regions | World Bank (CC BY 4.0) |

Examples an agent can now answer in one or two calls: "What are the new risk factors in Nvidia's
latest 10-K?", "Did any Tesla insider buy shares on the open market this year?", "What did
Berkshire Hathaway sell last quarter?", "Where is the 2s10s spread today?", "What is core PCE
inflation year over year?".

Results are columns and rows, so a series feeds straight into analysis: with
[canli-mcp](https://www.npmjs.com/package/canli-mcp), `economic_series` or `price_history` output
goes into any of its 236 quant tools in the same batch, and `factor_returns` into a factor regression.

## Checked against the source

The tests replay real SEC, Treasury and FRED responses and check values read off the documents:
Berkshire Hathaway's 13F for the quarter ending 30 June 2026 totals $299,253,556,246 over 89
entries, exactly the figures on its cover page; Apple's 10-K risk factors come back as Item 1A
alone; a Tesla Form 4 sale reads 2,605.75 shares at $360.134. `filing_check` reads all 762 tagged
figures of Apple's June 2026 10-Q exactly as SEC's own extraction of its XBRL holds them, finds nothing
in it to flag, and finds the 48,700 shares in Microsoft's FY2026 10-K tagged a million times too large.
alone; a Tesla Form 4 sale reads 2,605.75 shares at $360.134. Apple's fiscal 2025 buybacks come
back as its 10-K states them: 402 million shares for $89.3 billion, $90,711 million paid in cash.

## Limits

- Filings are shown as filed; nothing is edited or verified.
- Form 4 is due two business days after a trade; Form 5 filings are not read.
- A 13F lists long US-listed equity and option positions at quarter end, filed up to 45 days
  later; it omits shorts, cash and confidential positions. Amendments are not merged.
- FRED revises recent values of many series; some series are copyrighted by their sources.
- Keyless prices are Yahoo Finance's unofficial chart data, for personal use; they can change or
  stop without notice. Alpaca's free IEX feed reports IEX volume only.
- Not investment advice.

See [SECURITY.md](SECURITY.md) for exactly what is sent where.
