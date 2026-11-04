# Changelog

## 0.15.0

- `world_series`: a country's economy from the office or central bank that publishes it, in one shape. Inflation, core inflation, unemployment, GDP growth, the policy rate, the 10-year yield, the exchange rate, industrial production, retail sales, wages, house prices, the OECD's composite leading indicator, consumer confidence, business confidence (official surveys: the EU's economic sentiment indicator, the Bank of Japan's Tankan, the Philadelphia Fed's for the US), government debt, money supply and central banks' total assets (the Fed, the Eurosystem, the Bank of Japan), for 70 countries and the euro area. Each country is read at its own statistics office or central bank where that has an open service: Statistics Canada, the ONS, the ABS, IBGE, Statistics Norway and Sweden, Eurostat for EU members, and the Fed, the Bank of Canada, the Bank of England, the ECB, the Bundesbank, the Bank of Japan, Japan's Ministry of Finance, the RBA, Banco Central do Brasil, the Riksbank, Norges Bank, the SNB and the Bank of Israel. Otherwise the OECD's, the IMF's or the BIS's compilation of the country's official figures is read, and the answer names who compiled it. Up to 30 countries side by side, or a group (G7, G20, EU, euro area members, BRICS, Nordics, ASEAN, Latin America), are read in one request per publisher: the G20's inflation takes nine requests, not twenty. Any series at those 24 publishers can be asked for by its own code (`statcan:2062815`, `eurostat:une_rt_m?geo=DE&...`, `imf:CPI/IND...`, `boj:FM01/STRDCLUCON`). `check: true` reads the same figure from a second official publisher and compares the latest period both report, for one country or for every country in a table at once: the G20's inflation against the IMF's and the BIS's compilations takes about three seconds, and 18 of the 20 agree within 0.15 points (France's harmonised index and the UK's CPI are the two that differ, by definition). Quotes are turned over where one publisher gives dollars per unit and the other units per dollar, and daily rates are averaged against monthly averages. US inflation from the BLS's own index matches the IMF's to 0.0001 points; Norway's from Statistics Norway's index matches to 0.00002. A policy rate comes with its recent moves (up to eight). `measure: "all"` gives one country's every measure in one call, each from its own publisher with the figure a year earlier, and with `check: true` each measure set against a second official publisher (Brazil's nine in about 3.5 s). A figure whose latest observation is more than eighteen months old is marked stale; Russia's GDP stops in 2021, for example.
- `treasury_holders`: who holds US Treasury securities, from the Treasury's TIC system with no key. The major foreign holders by country at the last thirteen month ends, each with its change on a year, its share of all foreign holdings and its rank, the total and what foreign official institutions hold (bills against notes and bonds), or one country month by month. August 2026: Japan $1,068 billion (down $116 billion on a year), the UK $1,010 billion (up $108 billion), mainland China $591 billion (down $109 billion). With the Treasury's caution that custodial holdings are counted under the custodian's country.
- `crop_outlook`: the USDA's World Agricultural Supply and Demand Estimates, read from each month's report at the USDA's publication service (ESMIS), with no key. The world balance sheet of wheat, corn, coarse grains, rice, cotton, soybeans, soybean meal or soybean oil, by country: beginning stocks, production, imports, use, exports and ending stocks for the last two market years and this year's projection. Last month's projection sits beside this month's, with the revision between them. In October 2026 world corn ending stocks for 2026/27 were raised from 272.10 to 280.44 million tons. One country, every country at once, or any month's report. For the United States, the report's own balance sheets with the season-average farm price, for corn, wheat, soybeans, soybean meal and oil, rice, cotton, sorghum, barley, oats and feed grains, the US meats (beef, pork, broilers, turkey, red meat and poultry, two projection years each), eggs and dairy prices (cheese, butter, nonfat dry milk, whey, Class III and IV milk), each line with its unit (US corn: 2026/27 ending stocks 1,567 to 1,849 million bushels, the price $4.80 to $4.70). Checked against the report's text version. Beside the projection, the USDA's own record of that month's projections against the final estimates since 1981/82, from the report's reliability pages: world wheat production has come within 1.6% two years in three and within 2.8% nine in ten, while US soybean ending stocks have missed by 42.5% at the root mean square.
- `economic_series` as it was published on a past date: `as_of` reads any FRED series from ALFRED, FRED's archive of past releases, so only what had been released by that day appears, at the values then shown. `revisions: true` sets each value then against today's: payrolls for July 2025 read 159,539 thousand on 1 September 2025 and 158,542 thousand now, a revision of 997 thousand. The unemployment rate as known on 1 April 2020 ends in February at 3.5%. Point-in-time macro is what a backtest of an economic signal needs; no other finance MCP server serves it.
- Built to 2026's changes at the sources. Eurostat's HICP moved to ECOICOP 2 (`prc_hicp_minr`) in February, Statistics Sweden moved to `KPI2020M`, Statistics Norway moved to table 14710 (an index only, so its change on a year is computed), and the ABS's monthly CPI is now its headline.
- `release_check`: a quarter's results press release set against the 10-Q or 10-K filed after it. Every figure in the release's tables is looked for among the report's inline XBRL facts for the same period: it agrees within the rounding either document shows, it changed, or it has no counterpart in the report (non-GAAP measures, operating metrics). A changed figure comes with the release's value, the filed value, the difference and percentage, the concept the report tags on its line, and how that line was found: the same line, where the figure's other period agrees, or the line with its label between lines that agree; a label alone is never enough. Lines the report adds are listed too. Vicor's first quarter of 2024 shows the $17.2 million litigation charge booked after its release turning $2.6 million of net income into a $14.5 million loss; Cumberland Pharmaceuticals' third quarter of 2022 shows the balance sheet adjustment its 10-Q describes; Apple's and Microsoft's latest releases agree with their reports figure for figure.
- `audit_signals`: what auditors and companies say when something is wrong, from SEC filings with no key. Going-concern doubt: every 10-K and 10-Q whose own words say there is substantial doubt about the company's ability to continue as a going concern, as a timeline of first raised, still raised and lifted (a report saying its plans alleviated the doubt is lifted, never raised; a policy, a risk that might come or another company's doubt is not counted), quoting the sentence and saying when the auditor's report states it; across the market, the companies whose latest 10-K or 10-Q newly raised it in a window, found by EDGAR full-text search. LiveWire Group first raised it in its 10-Q of 4 November 2026; Star Gold's 10-K of 22 July 2026 says the doubt it raised was alleviated. Auditor changes from 8-K Item 4.01: the firm that left and the one engaged, resigned or dismissed only as the filing says, and whether it reports disagreements or reportable events (Mannatech dismissed BDO on 15 October 2026 and engaged CBIZ). And the critical audit matters named in the auditor's report of the latest 10-K.
- `world_yields`: the Bank of England's dates are written with English month names on every system. Newer ICU builds write September as "Sept", which the Bank refuses, so the UK curve failed whenever its window began in September.

## 0.14.1

- `financial_cycle` and `scenario_risk` answer through MCP. In 0.14.0 their `source` was a list where the output schema declares a string, so the server answered every call to them with a validation error. `source` is now a string and the URLs are in `sources`, as other tools keep them, and the stdio test calls each new tool through the server.
- `bond_offerings`: the bonds a company sold, tranche by tranche, from the SEC filings that priced them. Each final term sheet gives amount, coupon, maturity, price, yield, the spread over the benchmark Treasury (mid-swaps for euro bonds, the index for floating notes), the benchmark's yield and the CUSIP; the XBRL fee tables of final prospectus supplements confirm amounts and prices and add deals priced without a term sheet, such as a financing arm's medium-term notes. Five term sheet layouts are read, including one cell per tranche and one row per tranche. Every fixed-rate dollar yield is recomputed from its price (a short first coupon paid for its days), and every benchmark yield plus spread is compared with the stated yield. A tranche whose figures disagree with its own title has them left out, not shown wrong. Deals are grouped by pricing day and totalled by year and currency. Apple since 2019: 33 tranches in eight deals, including a euro deal priced over mid-swaps, every check passing.
- Filings that write the euro sign as Windows code 128 now read as € in every tool that reads filing text.

## 0.14.0

- Five new tools where the incumbents led, each from public sources with no key. `scenario_risk`: a portfolio's own holdings under a macro shock or a past crisis, the way institutional risk systems run scenarios. Each holding's weekly returns are regressed on eight factors (US stocks, the 2- and 10-year Treasury yields, the Baa-Aaa corporate spread, oil, the broad dollar, gold and the VIX). A shock to some factors moves the others by their mean given it, under the factors' covariance in the same years, with a 90% range over a horizon in weeks. A crisis from crisis_replay's catalog (the 2008 bank crisis, the 2020 crash, the 2022 rate shock and eight more) replays the factors' actual moves beside each holding's actual return then, and `model_check` says how far off the model was; a factor with no data then (the dollar index before 2006) is estimated from the others. Twelve broad funds through six crises: the median miss is 2.3 points per holding (scripts/check-scenario-replays.mjs).
- `trade_ticks`: every trade on a Kraken crypto market from any past moment, to the microsecond, with price, size, the taker's side and the order type, the window's VWAP, buying against selling, market-order share, the largest trades and one-minute bars built from the ticks. Up to 10,000 trades a call. `next_since` is Kraken's own nanosecond cursor, so a read continued from it equals one longer read: fills of one order share a timestamp, which a time cannot split.
- `trade_flows`: what countries buy from and sell to each other by product, from UN Comtrade: every partner ranked by share in a year, or one partner year by year with its share of the total, in dollars and kilograms, products by HS code or plain words. Taiwan, which reports to no UN body and appears in other countries' customs as "Other Asia, nes", is named (30.6% of US chip imports in 2025, 13.1% in 2021). Trade filed with no partner is counted as `unattributed_share` and flagged above 10%: Germany files 96 to 98% of its natural gas imports with no partner, so Russia's 0.2% there is a confidentiality artifact.
- `standardized_financials`: a company's three statements in one 26-line template whether it files US GAAP or IFRS, with 14 ratios computed as company_report computes them. Each figure says which tag it came from, or the arithmetic that made it where the company tagged none (gross profit, SG&A, EBITDA, free cash flow, total liabilities). IFRS debt is read as debt_profile reads it, so bonds count beside loans. Up to five companies side by side; `in_usd` converts flows at each fiscal year's average rate and balances at its year-end close.
- `financial_cycle`: house prices (real and nominal), debt service ratios of households and companies, credit to households, companies and government as a share of GDP, and real and nominal effective exchange rates, from the Bank for International Settlements, for up to eight countries side by side; a measure a country lacks is listed.

## 0.13.0

- Four new tools, each from its publisher with no key. `treasury_cash`: the Treasury General Account each business day since 2005 from the Daily Treasury Statement, read across the three names the statement has given it, with the last day's largest deposits and withdrawals. `federal_budget`: the Monthly Treasury Statement's receipts, outlays and deficit, the fiscal year to date against the same months a year earlier. `factor_returns`: the Fama-French three- and five-factor models and momentum from Kenneth French's data library, monthly, daily or by year, as fractions. `crypto_options`: Deribit's option term structure (at-the-money volatility, open interest, put/call ratio, volume) with DVOL, or one expiry's chain in dollars, for BTC, ETH and the coins it lists in USDC.
- `unusual_options`: unusual options activity from the Cboe delayed quotes options_chain reads. It lists contracts whose volume is at least as many times their open interest as asked (new positions more likely than closing ones), ranked by the premium that changed hands, with expiry, strike, IV, delta and distance from the price, and the day's call and put premium. The answer says what the quotes cannot show: who bought, and whether a trade opened or closed a position.
- `company_emissions`: a company's greenhouse-gas emissions from its US facilities, as they reported them to EPA's Greenhouse Gas Reporting Program, read from Envirofacts with no key. It gives direct (scope 1) tonnes of CO2e, the company's share where a facility has several owners, the split by gas (biogenic CO2 shown apart, as EPA does), the largest facilities, and a trend over up to five years. Exxon in 2023: 64 facilities, 45.2 million tonnes, 38.9 million by ownership share, down from 55.3 million in 2022.
- `crypto_markets`: the crypto market from CoinGecko's public API. It gives coins ranked by market value with price, volume, the change over a day, a week and a month, supply and the distance from the all-time high, and the whole market's value with bitcoin's and ether's shares. It also answers for coins named by symbol or CoinGecko id, where a name that is a coin's id is not mixed with other coins that use it as a symbol.
- `price_history` takes minute bars: `1Min` for the last 30 days, and `5Min`, `15Min` and `30Min` for the last 60, on the keyless source. Alpaca keys give them over its own history, and Tiingo stays daily. The default window for minute bars is the last five days. Bars within a day are stamped in the exchange's own time zone bar by bar: the chart's single offset is today's, which put bars before a daylight-saving change an hour off.
- `etf_profile`: what an ETF or mutual fund costs and holds, from Yahoo Finance's fund profile. It gives the expense ratio beside its category's average, turnover, total assets, yield, year-to-date and five-year returns, beta, inception, the top holdings, the mix of stocks, bonds and cash, and sector weights. fund_portfolio still reads every holding from the fund's own N-PORT filing.
- `market_calendar`: the whole market's schedule from Nasdaq's public calendars. It gives who reports earnings on given days (before the open or after the close, consensus EPS and number of estimates, last year's EPS), who goes ex-dividend (amount, record and payment dates), and the splits coming up. With `kind: "ipos"` it lists a month's IPOs (priced, expected, filed and withdrawn, with price, shares and value); ipo_pipeline reads the same companies' SEC filings. It filters by tickers or market value, largest companies first. earnings_calendar still answers for one company from its own past reports.
- `congress_trades`: trades by members of the House from their periodic transaction reports. The Clerk's yearly index finds the reports (by member, state, district, or the newest filed), and each PDF is read into its transactions: owner, asset and ticker, purchase or sale, trade date, date notified and the amount range, across names and amounts that wrap onto a second line. A report filed on paper is a scanned image and is listed with its link. A small PDF text reader (pdf.mjs) does the reading: Flate streams, two-byte and one-byte fonts through their ToUnicode maps, form XObjects, positions through the transformation matrices. The answer states the Ethics in Government Act's limits on using these reports.
- `analyst_history`: a stock's analyst record from Yahoo Finance, as stock_snapshot reads it: every upgrade, downgrade, initiation and price-target change by firm over any window (or one firm's), the last four quarters' EPS against the consensus, how the EPS consensus moved over 90 days with the analysts raising and lowering it, and the buy, hold and sell counts month by month. A vendor's aggregates, and the answer says so.
- `market_movers`: today's biggest US gainers, losers and most traded stocks, or Yahoo Finance's ready-made lists (small-cap gainers, most shorted, undervalued growth, growth technology, aggressive small caps, undervalued large caps), with price, change, volume, average volume and market value.
- `market_hours`: the US stock market's calendar, with no network. Open, pre-market, after-hours or closed now; the next open and close in Eastern time and UTC; a year's holidays and 1 p.m. early closes; whether a date trades; trading days between two dates. From NYSE's rules (a Saturday holiday moves to Friday except New Year's Day) and its unscheduled closures since 2000 (9/11, Hurricane Sandy, the days of mourning). It gives 252 trading days for 2024 and 250 for 2025, as NYSE published.
- The stdio test no longer reads the disk cache of the machine it runs on (CANLI_DISK_CACHE=0), so a cache filled by real use cannot change its answers.

- `source_check`: whether the documents behind an answer are still the bytes it was read from. Each evidence row, or a canli-mcp receipt's source, is read again past every cache and reported as the same, changed since, or unreachable. Only documents from the hosts this pack reads are fetched; a test holds every address in the source to that list. An address carrying a key, a query sent as a POST, or a row with no hash is named and not fetched. A Canli reference snapshot is checked by the hash of the JSON inside it. `getText` takes `fresh` for this.
- New tool: `filing_check`, every number in a 10-K or 10-Q read twice: as a person reads the document and as machines read its inline XBRL. It lists each figure tagged at a scale other than the unit its words or table state ("in millions", "shares in thousands", "$3.8 billion", "48,700 shares", a per-share amount, a rate with %), each fact tagged twice with values further apart than their rounding, each sum in the filing's own calculation linkbase that its lines do not add up to, and each fact SEC's company facts hold differently or not at all for the filing. Each finding names the concept, period and unit, what is shown and what is tagged, what it was compared with, the table or heading it sits under and a link to the figure; counts say what was checked, so a clean result can be told from one where nothing was. A filing not in inline XBRL gets an error that says so and names `figure_trace` and `financial_statements`. Up to five filings of a form at once.
- Filings lists carry SEC's flag for inline XBRL, so a filing without it is answered before its document is fetched.
- New tool: `buybacks`, a company's share repurchases by fiscal year or quarter from its own XBRL: the cash it paid, the shares it bought and the value it recorded for them, the average price, its program's authorized and remaining amounts where it tagged them, and the change in shares outstanding. Every figure names the filing it came from, and a figure the company does not tag is said to be untagged, not estimated. A quarter that the reports give only year to date is worked out from them, and a stock split between two reports is allowed for.

## 0.12.0

From a test against other finance MCP servers on the newest models. New tools:

- `stock_snapshot`: what a quote page shows and no primary source publishes, from Yahoo Finance: analysts' price targets, ratings and estimates, market cap and valuation ratios, 52-week range, short interest, holder percentages, next earnings date. Labeled as a vendor's aggregates.
- `technical_indicators`: moving averages, RSI, MACD, Bollinger Bands and ATR for a symbol in one call.

Foreign companies read wrong or not at all in `financial_statements`:

- A filing that shows a year in two currencies (TSMC in NT$ and US$, PDD, Alibaba, JD, HDFC Bank) came back with those rows blank. The translated column now stands apart, marked with its currency, and `currency` names the main one.
- `money_scale` read 1 for every filing not in dollars, so a value "in millions" of euros or yen looked like a full amount. It now reads any currency's sign.
- A single statement for income and comprehensive income returned no income statement (Novo Nordisk, TSMC, AstraZeneca, PDD, Infosys).
- `filing_tables` looked for a 10-K when named a 20-F's accession, and now reads the form from the accession or files the company actually makes.

Also:

- `reference_rates` has the ECB's euro exchange reference rates (`fx:GBP`).
- `read_filing` with `find` counts how often each word appears, since its passages stop at twelve.
- `event_study` takes `last` and is steered to `event_type` for filing dates.
- An accession that names no filing beside a `fiscal_year` no longer stops `financial_statements`: the year decides and the answer says so. Alone, the error lists the real ones. Clients that force every optional field send these.
- Wide equity statements show up to 24 columns.

## 0.11.1

New tool: `exposure_map`, who depends on a company, from what others say in their annual reports.

`earnings_release` set some guides against the wrong results, found when a run over the S&P 500 said Eaton had missed its EPS guide 12 times in 13:

- A year's guide in a table column headed "Year ended December 31, 2026" was read as the quarter's: Eaton's $10.88 to $11.33 against a quarter's $3.15.
- A part's guide in a table was read as the total's: Qualcomm's QCT revenues of $7.9B to $8.5B against total revenue of $9.9B.
- A result too far from a dollar range to be the same thing is now not placed at all.
- A guide that names no basis is not called a miss when the adjusted result lands elsewhere: Gen Digital's EPS guide of $0.68 to $0.70 against a diluted $0.36 and a non-GAAP figure inside the range.
- "Excluding special items" now reads as adjusted, and "fiscal 2025" as a year.
- "GAAP diluted EPS and non-GAAP diluted EPS of $0.45 and $0.64, respectively" goes one figure each. Last year's figure after "compared with" and a "Previous Range" column are not read as the guide.
- `guidance_record` counts one line a quarter for each measure, and a line that was not placed counts for nothing.

- `shipping_activity` asks PortWatch less: every chokepoint in two queries, and one chokepoint in one. It took 18.8 seconds on the hosted server. PortWatch and Wikipedia answers are now kept on disk for six hours.
- `portfolio_xray` adds up its holdings in `xray-merge.mjs`, which imports nothing, so the look-through page can run the same code in a browser. `openHolding` opens one holding.

## 0.11.0

New tools: `filing_memory`, `filing_sentiment`, `guidance_record`, `what_happened_next`, `shipping_activity`, `page_attention`, `latest_price`.

- `filing_memory` searches every annual report a company has on EDGAR. It reads them once, ranks paragraphs with BM25 on your machine, and counts mentions by a rule it states. Apple's 25 reports took 5.5 seconds the first time and under half a second after that. A local embedding model can rank by meaning too; on six test questions word search alone failed where the wording differed, and either supplied synonyms or embeddings fixed most of it, each winning on different ones.
- Optional local models, installed only by `canli-mcp models install` and never by a tool. No vector database: at a few thousand paragraphs a company, a file of plain floats is as fast.
- The filings feed was answered from the ten-minute cache, so `canli-mcp watch --every 60` saw new filings only every ten minutes against the two it claimed. It is now read on each poll.
- Windows quotes and dashes in older filings (numeric entities 145 to 151) now read as quotes and dashes.
- `verify_claims` says what a loose sentence is missing: this company, one period, or both.

## 0.10.1

verify_claims: on 0.10.0, 12 of 24 settled answers on 284 real sentences were wrong: 11 of 12 "contradicted" and 1 of 12 confirmations. Most read someone else's figure as this company's.

- A sentence calls a figure wrong only if it names the company and one period of its own. Otherwise, a figure that does not match comes back as not checkable, with the filed figure beside it. A match is still confirmed.
- The name nearest before a figure decides whose it is, so another company's figure in the sentence is left out.
- Figures for one country ("in the U.S.", "abroad") and for a rolling twelve months ("TTM", "past 12 months") are not read.

- `company_report` read the year's revenue from the wrong column when a 10-K shows the four quarters beside the year: Lennox's fiscal 2025 came out as $1.195 billion, its fourth quarter, with a 77.6% fall, against $5.195 billion filed. Found by running `triangulate` across the S&P 500.

## 0.10.0

Two new tools, and verify_claims fixed against claims people wrote in public posts.

- `figure_trace`: a reported figure followed down the filing's own calculation, each line's value, every sum recomputed, what it feeds into and how the filing splits it. It shows the filing agrees with itself, not that the figures are right.
- `token_check`: what an ERC-20 token's contract can do (mint, pause, blacklist, upgrade, fees), its proxy, owner, supply and source verification, and an unlock schedule you give set against it. If the code cannot be read it says the powers are unknown. A clean reading never means safe.

verify_claims: on 0.9.0, 14 of 29 settled answers on 64 real sentences were wrong, every one a false "contradicted"; all 12 confirmations were right.

- A sentence's period reaches all its figures; "Q3 fiscal 2026" and calendar quarters are read.
- Years ending early in the calendar year are checked under either label.
- Parts are not read as the whole ("of which", product names, "Oracle Cloud's"); a company's name or ticker is not read as a part.
- A figure cut short rather than rounded agrees, within 1%. Margins and revenue are checked on any revenue line the company tags.
- No fourth-quarter per-share figure, a list of companies, a second value for one measure or a quarter with no year is judged.

## 0.9.0

verify_claims reads claims as people say them, not only as press releases word them.

- New wording: "earned $9 per share", "made $416 billion in revenue", "lost $18.8 billion", "has $90 billion in cash",
  "profit fell 46%", "a 30% profit margin", "spent $34 billion on R&D".
- Hedges count: "about" is within 5%, "over" and "under" are read as bounds.
- "Last year" and "last quarter" are resolved; no period at all means the latest annual report. The row's note says so.
- "Profit" matching another line of the accounts is named as that line. A cash or debt figure off the one tagged line
  is not called wrong, because each sits on several lines.
- A second figure in a sentence is no longer dropped. A year before a full stop is read.
- Fixed: a part of the business ("Cloud revenue") was judged against the whole company's revenue. It now comes back
  not checkable. Another company's figure, someone else's money ("Tim Cook earned") and the future are not read.
- summary.figures_not_read counts the figures left unread.

## 0.8.4

- Exxon Mobil's statements, filings, segments and everything else read from its filing record work again: the ticker
  moved to a new holding company with no 10-K yet, and the record now continues from the old filer.
- Northern Trust's revenue reads $8.09 billion, not $5.02 billion: a bank's fee line no longer corrects its total.
- NXP's statements keep their scale when the title has no dash before the units.
- company_report names the tag behind its latest revenue, net income and cash.

## 0.8.3

Found by checking the S&P 500 against its own statements (3,112 figures, 49 lines flagged).

- A name no longer finds the wrong company. "DR Horton Inc" had resolved to an individual filer, "T Rowe Price Group" to
  an ETF and "Equity Residential" to a small LLC. Names match listed companies first, in any word order, and a name
  that fits nothing says so with the closest matches.
- `company_report` takes the latest year's revenue from the income statement when the XBRL tag is another measure:
  Republic Services' $16.6 billion, not $19.0 billion gross. American Express reads $72.2 billion, not $41.3 billion.
- `financial_statements` reads "€ in Millions, $ in Millions": NXP's figures had come back with no scale.

## 0.8.2

- Foreign issuers' results: `earnings_release` and `earnings_calendar` read Form 6-K, which has no item numbers, by
  recognising a results release from how its documents open. TSMC, ASML, SAP, Shell, Alibaba and Novo Nordisk read.
- A figure in NT$, HK$, A$, C$, S$, R$, RMB, won or rupees keeps its currency: TSMC's NT$29.43 had read as US dollars.

## 0.8.1

Wrong figures, found by asking analysts' questions across the market.

- Net income. Since the 2025 reports many 10-Ks tag only the common-stockholders line or `ProfitLoss`, and
  `NetIncomeLoss` comes from the proxy's pay table, sometimes in rounded units. `company_report` showed no net income
  for Booking, and screens read Arista's $3.5114 billion as 3,511. The line is now followed through its tags, and a
  figure a thousand or a million times smaller than another of the same line is passed over. `verify_claims` no longer
  calls a true claim about such a company "not reported".
- P/E survives a stock split the last annual EPS predates: Booking's read 0.91 and now reads 20.92.
- Share counts tagged in thousands (Camtek, Nova) are caught against diluted shares or profit over EPS.
- Berkshire's market value counts its A-share equivalents at 1,500 B shares each. Exxon Mobil's history is read from
  its old filer until its new holding company has an annual report.
- `screen_companies` filters and ranks on P/E, P/S, FCF yield and market cap across the whole market in seconds, at
  20 prices a request. Figures no company could have are held out by name instead of ranking first.

## 0.8.0

Foreign filers read properly. `company_report` showed TSMC at USD 11.2 trillion: a depositary share's price times
ordinary shares. Market value, P/E, P/S, FCF yield, short interest and yields now use the ratio from the 20-F (36 of
39 right against the banks' published ratios, 3 unread and left blank, none wrong; `bench/listing/run.mjs`) and the
filing's currency, with share counts checked against profit over EPS. `company_report`, `reverse_dcf`,
`forensic_scores` and `comps` read IFRS; `comps` takes `companies`, named peers from any country.

- `european_filings` was down: its source caps page size at 1,000 now, so it reads pages.
- Event studies and the earnings calendar took Tesla's deliveries, filed under Item 2.02, for earnings. Now one
  release a quarter.
- Banks, brokers and insurers get "not applicable" from the accounting screens rather than a list of missing inputs.
- `news` answers from Yahoo Finance's headlines when GDELT is over its limit, instead of waiting over a minute.
- Fund-report names resolve: "TJX Cos Inc/The", "Lowe's Cos Inc", "Charles Schwab Corp/The".
- Public SEC, FRED and Treasury data stays on disk between sessions (`~/.cache/canli-markets`, 512 MB at most;
  `CANLI_DISK_CACHE=0` turns it off): `company_report` on a new session went from 7.6 s to 0.6 s, and a source that is
  down is answered from an older copy, dated. Prices, news and keyed requests are never written.

Ten new tools, 74 in all, each from the body that keeps the record and without a key:

- Public records: `enforcement_actions` (SEC litigation releases and administrative proceedings),
  `consumer_complaints` (CFPB), `product_recalls` (FDA drugs, devices and food; NHTSA vehicles),
  `sanctions_check` (the Treasury's SDN list and aliases), `federal_rules` (Federal Register, with comment
  deadlines). `bank_financials` lists failures by year and state.
- Identity: `security_identifiers` (ticker, ISIN, CUSIP, SEDOL and FIGI through OpenFIGI; check digits
  tested first) and `legal_entity` (the Global LEI register: legal name, jurisdiction, parents, children).
- World: `world_yields` (US, euro area, UK, Japan and Canada side by side, each curve's date and basis
  stated) and `credit_cycle` (the BIS credit-to-GDP gap).
- `dividend_history`: payments, totals by year, trailing yield, growth, streak and splits.
- With prices off, as on the hosted server, `market_overview` says so instead of answering with empty
  lists, and the price tools' message tells a hosted user to run the local server.
- Names match only when every word of the name is in the record, so a near miss is refused. Each tool
  says what it cannot show: an empty sanctions answer is not clearance, complaints are unverified and
  not adjusted for size, enforcement feeds reach back only so far.

And `earnings_release`, read against 21 third-quarter releases filed on 2026-10-29, each keyed from its
text first:

- `earnings_release` with no accession read a quarter's first 8-K, so FMC's preliminary 8-K of
  2026-10-15 was served instead of its results of 2026-10-29, and an accession named in the same
  quarter was replaced by the first. It now reads the one asked for, else the newest.
- Guidance a release gave and the tool missed: an "Updated Outlook for the Fiscal Year Ending ..."
  heading (Floor & Decor, all of it), two periods in one heading with lines under each (DXC), a
  footnote left of an outlook table's labels (Lockheed Martin), ranges in rows above the first plain
  number (Sandisk's margin and expenses), "raised ... to a range of" (Veralto).
- Wrong figures it gave: "negative $350 million to negative $150 million" came back positive and
  split; "(3.5)% to (2.0)%" as positive or not at all; "14.5 percent and 15.5 percent" for two years
  as one range; `Net interest expense $230M` in an assumptions column as EPS of $230 (Ingersoll Rand).
- What is not guidance is no longer listed as guidance: the prior range it replaced, results set
  against the outlook ("$11.4 million above the high end of the outlook"), the size of an impact,
  "expected to contribute", a sentence that opens by reporting, footnotes. A table with a column for
  each date the outlook was given keeps the latest (Digital Realty). "2026 Outlook | 2025 Actual"
  leaves out the actuals.
- `results` adds what a release states only in a comparison table (revenue, EPS, FFO), with the
  column read and the prior year's beside it in the quote. New measures: FFO, AFFO, NOI, RevPAR, EBIT,
  EBIT margin, net interest income and margin, combined ratio, book value per share, assets under
  management. A range's period is the one named nearest it; a table's letterhead address is not the
  headline.
- Measured: `bench/analyst` 119 of 119. The new sets: fresh-4 would have scored 7 of 12 on its first run under this strict scoring, then 12
  of 12; fresh-5, keyed before running and run once after the fixes, 6 of 6.

## 0.7.4

- `treasury_yields` over several years lines each maturity up by name. The Treasury added the 4-month
  bill in 2022 and the 6-week in 2025, so a range across those years had shorter rows under the newest
  year's headings (a 2021 row's 10-year yield sat under "7 Yr"). Columns are now every maturity in any
  year asked for, in maturity order, with null where a year did not publish one.

## 0.7.3

- `news` and `explain_move` search for a company by its plain name when its SEC name ends in "/NEW"
  (Costco Wholesale was searched as "Costco Wholesale CORP /NEW" and found nothing).

## 0.7.2

- `market_overview`: the market at a glance in one call: US indices and the VIX, the eleven S&P sectors
  ranked by the month, Treasury yields, the dollar and major currencies, oil, gas, gold, silver and copper,
  bitcoin and ether, and the main markets in Europe and Asia, each over a day, a week, a month, three
  months, the year to date and a year (yields in percentage points). A market that fails is listed as
  missing. 64 tools.
- `shareholder_returns`: what a company has paid its shareholders, year by year from its annual XBRL:
  dividends per share and in total, buybacks and shares issued for cash, the diluted share count, the
  payout ratio and the share of free cash flow paid out; the dividend's record on split-adjusted figures
  (years raised in a row, 5- and 10-year growth; a split shows in older 10-Ks as a cut otherwise); and the
  dividend and shareholder yields at the last close.
- `ownership_breadth` finds the CUSIP from a company's name in many more cases: 13F tables shorten
  issuer names ("COSTCO WHSL CORP NEW", "BANK OF AMER CORP"), write "&" as "&amp;", and some filers
  slip, so names now match word by word with abbreviations, the CUSIP check digit is checked, the
  company's own 13F and old text filings are skipped, three tables vote, and among several CUSIPs
  (share classes, or a CUSIP that changed) the one most filers list is counted, the others shown.
  A CUSIP new in recent quarters is flagged rather than read as a jump in ownership.
- `news` tries GDELT three times, each after a longer wait, before reporting its rate limit.

## 0.7.1

- `compute_prices`: compute as a market. The on-demand hourly price of each data-centre GPU (B200,
  H200, H100, A100, L40S...) across the clouds and GPU marketplaces, every provider's offer for one
  model, recent list-price changes, and the Cirrun GPU Index, a daily chained index of those prices
  (cirrun.com, no key, CC BY 4.0). 62 tools.

## 0.7.0

- `ipo_pipeline`: S-1/F-1 registrations (IPO candidates, SPACs, funds, listed filers) and priced IPOs
  with price, shares and proceeds from the prospectus cover.
- `planned_insider_sales`: Form 144 notices, filed before an insider sells, with totals by seller.
- `federal_contracts`: the US government's obligations to a company in a fiscal year, by agency and
  industry code, with its recipient entities and largest contracts, from USAspending.gov (no key).
- `drug_pipeline`: a drug company's active trials by phase, readouts due, late-stage trials and FDA
  approvals, from ClinicalTrials.gov and Drugs@FDA (no key). A sponsor that lists trials under
  another name (ModernaTX for Moderna) is found by full text, kept only when its name begins with the
  company's.
- `comment_letters`: SEC comment letters and replies grouped into reviews, with the topics of the
  newest letters and excerpts.
- `bank_financials`: a US bank's quarterly call-report condition from the FDIC (uninsured deposits,
  noncurrent loans, capital ratios, margin, returns), or the latest bank failures and their cost.
- `filing_drift`: a 10-K section followed over several years: change from the year before (Lazy
  Prices), hedging and adverse words, readability, a named theme's share and rewording, and flags.
- `read_filing` (and `filing_diff`, `filing_drift`): a 10-K that heads its items with a
  cross-reference index (Intel's, at the end of the document) is read from the section in the body,
  found by its repeated page title, instead of the one-line index entry.
- `reverse_dcf`: the free-cash-flow growth a share price implies, with a sensitivity table, the
  company's own growth, and every input's tag; `base: "average_3y"` smooths an unusual year.

## 0.6.0

- `latest_filings`: what has just been filed across every company, from EDGAR's live feed, by form,
  8-K event, filer name and time.
- `filing_diff`: what changed in a 10-K's (or 10-Q's) risk factors, MD&A or any item since the last
  one: new, dropped and changed paragraphs, the sentences changed, and the words whose use rose most
  (Apple 2025: court, remedies and enforcement, from 0 to 4 or 5 mentions).
- `news`: the world's press on a company or topic from GDELT's open index, with the daily tone of
  the coverage and a date window; no key.
- `explain_move`: a day's return against the market, its z-score from a one-year market model, and
  the filings and headlines around the day (NVIDIA 2026-08-27: +7.6% abnormal, z 4.3, its earnings
  8-K the evening before).
- `portfolio_xray`: a portfolio's ETFs and funds opened into their latest N-PORT positions and added
  to the stocks held directly: real exposure per company, overlap between funds, effective positions.
- `funding_rates`: crypto perpetual funding on OKX, no key: latest rate, annualized carry over a
  window and the last week, and the share of positive periods.
- `forensic_scores`: Beneish's M-score, Piotroski's F-score and Altman's Z-score from the company's
  own annual XBRL in one call, each input with its tag.
- `ownership_breadth`: how many 13F filers hold a stock each quarter (its CUSIP found from a 13F
  table that names it), with the change; a fall in breadth predicted lower returns in the literature.
- `debt_profile`: total and net debt, the maturity ladder from the debt note, lease payments, and
  what the debt costs (implied rate, coverage, debt to EBITDA), from the company's annual XBRL.
- `comps`: a comparable-companies table, the company beside its listed peers under the same SEC
  industry code, nearest in revenue, with the peers' median and the company's rank on each measure.
- `screen_companies` reads capital spending under both tags companies use (Amazon reports
  productive assets), and takes `fiscal_year_end`, a window of fiscal-year ends, so each company is ranked
  on its own fiscal year with balance-sheet figures at that year's end.
- `financial_statements` gives each statement's `money_scale` and `shares_scale`, and says that a
  line shown negated has the opposite sign in its XBRL fact.
- `event_study` says how day 0 is chosen.

- `earnings_release` reads outlook tables whose footnote sits left of the labels (Lockheed Martin's
  2026 outlook came back with no guidance), takes "in millions" from a table's own title row, and no
  longer lists a results column ("2025 Actual") beside the outlook as guidance. Found by 14 new
  questions on Q3 2026 releases, keyed before the first run (12 of 14, now 14 of 14).
- `verify_claims` checks foreign companies: IFRS and US GAAP facts from 20-F and 40-F annual
  reports and tagged 6-K quarters, in the currency the company reports in (Novo Nordisk in DKK,
  TSMC in TWD and in its US-dollar translation, ASML's US GAAP in euros). Before, every foreign
  filer came back "not reported". A figure in a currency the company does not report in is called a
  conversion instead of judged; the filed number under the wrong currency is contradicted.
- `verify_claims` reads periods as people write them: a plain year ("in 2025", "2025 revenue"),
  "FY'25", and a span by its end date ("three months ended June 28, 2025", matched by its dates).
  A net income that is the profit including non-controlling interests is named as that line.
- Figures in draft text: a short sentence ending in a glued scale ("net income was €9.6bn.") is
  read instead of taken for a heading, and NT$, HK$, C$ and A$ are no longer read as US dollars.
- `economic_series`: "jobless rate" is the unemployment rate (UNRATE), not weekly claims, and
  "employment rate" the employment-population ratio (new entry, EMRATIO). A rate asked for where
  only a count matches ("initial claims rate") is refused, naming the nearest count; a Treasury
  yield with no maturity ("treasury yield") lists the maturities instead of returning the 3-month
  bill. Reported by izgorodin on dev.to.
- `prediction_markets`: Kalshi's event volume is contracts traded (`volume_contracts`), not
  dollars; it was labelled `volume_usd`.

## 0.5.0

Beyond the US, from the publishers themselves: four tools, no key.

- New tool `european_filings`: a European company's annual financial report in the European Single
  Electronic Format, the tagged report issuers on EU and EEA regulated markets file, from XBRL
  International's filings.xbrl.org. The company by name (matched against the repository's ~7,400
  filers, legal forms and generic words ignored; a filer with no report is passed over and said) or
  by LEI; the latest annual report by default, not a newer interim one; the report's own tagged
  totals for revenue, operating and net profit, EPS, assets, equity, cash, cash flows and
  dividends, each from the IFRS concept the company used (ASML's revenue is
  RevenueFromContractsWithCustomers), with the comparatives and periods as days; `words` finds any
  other tagged figure (asml:NetSystemSales).
- New tool `reference_rates`: SOFR, TGCR, BGCR, EFFR (with the Fed's target range) and OBFR from
  the New York Fed with percentiles and volume; the euro short-term rate and the ECB's deposit,
  refinancing and marginal lending rates (published as change dates: the rate in effect on the
  first day, then each change); SONIA and Bank Rate from the Bank of England; and about forty
  central banks' policy rates as the BIS collects them (`policy:JP`, `policy:Brazil`).
- New tool `prediction_markets`: what traders on Polymarket and Kalshi pay for an outcome, found
  by words: a probability (the middle of bid and ask, else the last trade), bid, ask, volume and
  closing date, with each event's resolution rules.
- New tool `crypto_fundamentals`: from DefiLlama, a DeFi protocol's value locked (now, by chain,
  and its history), the fees users pay it and the revenue it keeps; a chain's value locked; a
  stablecoin's supply and its change by chain.
- Checked against sources these tools do not read (`bench/global/crosscheck.mjs`, 2026-10-15):
  ESEF revenue and net profit equal the same companies' Form 20-F facts at the SEC (TotalEnergies,
  Novo Nordisk and Shell, 2024 and 2025: 12 of 12), and the ECB's, the Bank of England's and the
  Fed's rates agree with the policy rates the BIS collects (9 of 9).
- `earnings_release` lists a guide once: a table's point figure that is the midpoint of a range
  the text states for the same measure, basis and quarter (NVIDIA's "74.0%" beside "74.0%, plus or
  minus 50 basis points") is that range restated, not a second guide.
- `verify_claims` shows its rounding rule on the result's own first figure ("391.0 billion: within
  0.05 billion"), not a fixed example from another company.

## 0.4.0

Four tools for the work an analyst does with filings, and for checking the answer. Every figure keeps where it came from: the
rendered XBRL page or document, and for text the sentence or table row itself.

- New tool `financial_statements`: income statement, balance sheet, cash flow, comprehensive income
  and equity statement exactly as the company filed them, read from SEC's rendered XBRL reports
  (FilingSummary.xml and its R pages): the company's own labels and order, each line's XBRL concept,
  values as the page shows them with the page's units, never rescaled.
  - `filings` joins up to six 10-Ks or 10-Qs by period, newest figure first. A line a newer filing
    changed is listed in `revised` with its first-reported figure; an older filing's other periods
    on such a line go to `other_basis` instead of the table, so a row never mixes bases. Two 10-Ks
    across NVIDIA's 2024 split say: "consistent with a 10-for-1 stock split after it was filed".
  - Rows under a breakdown member ("Product", "Service and Other") keep their member, and join by
    concept and member, so a breakdown listed in another order lands on the right line.
- New tool `filing_tables`: the table that holds a figure, by words. A 10-K or 10-Q is searched in
  its XBRL detail reports and in the tables of its document (MD&A figures the XBRL does not tag:
  members, stores, average revenue per user); an 8-K, in its press release. All words must be in
  a table, and tables where they come together outrank tables where they are scattered.
  `filings` follows the same words through earlier filings: Costco's paid members through three
  10-Ks, 65,800 to 84,100 thousand.
  - Document tables: a figure's pieces ("$", "1,234", ")", "%") are joined, self-closing spacer
    cells are read, headers are placed over the figures they span, percentages keep their sign.
- New tool `earnings_release`: a quarter's results press release (8-K Item 2.02). Results and
  guidance with each figure parsed into a range (low, high, midpoint, unit) with its measure,
  basis (GAAP, non-GAAP, adjusted, constant currency), period and quote. "Plus or minus 2%" and
  "plus or minus 50 basis points" become ranges; "approximately" is marked; "flat to 2.0%" starts at
  zero; "X and Y, respectively" is two values; a decline is negative growth; "low single digits"
  stays words.
  - The previous release's guidance for the same quarter is set against these results (above,
    within or below the range, and in basis points for rates). A result stated more coarsely than
    the guide ("$2.4 billion" against "$2.450 billion to $2.475 billion") is not placed.
  - Results name the part of the business they belong to (`section`: NVIDIA's "Data Center", whose
    bullets say only "revenue was $89.0 billion"; "Walmart U.S. eCommerce") and what a change is
    measured against (`versus`: year over year or quarter over quarter). Only the company's own
    results answer its guidance: not a part's, not growth from the previous quarter, not the full
    year's against a quarter's guide.
  - Not read as results: last year's figures ("$2.92 compared to $3.10", "versus $41.46 billion
    for the prior quarter and $11.32 billion for the same period last year"), guidance and its
    assumptions, impacts and headwinds ("affected sales by $1.5 billion", "80 bps headwind"),
    shares of revenue, and "About" and outlook sections. A rate's change in basis points is the
    margin's ("gross profit rate up 96 bps"), a margin in dollars the profit, "an increase of $1.4
    billion" a change, and "local currency" a constant-currency basis.
- New tool `verify_claims`: checks a draft answer's figures against the company's own filings
  before they are used. Claims are given as measure, period and value, or found in a draft
  paragraph about the company, and looked up in SEC's XBRL company-concept facts for the period as
  the company labels it (Home Depot's fiscal 2025 ends in February 2026). Verdicts: confirmed at
  the claim's own precision; contradicted, with the filed figure and what the claimed one matches
  instead (another year, a quarter of the year, a thousandfold slip, the figure first reported
  before a restatement); not reported, for periods and measures the filings do not have (a year
  not yet reported, a dividend from a company that pays none); not checkable, for non-GAAP
  figures. Margins and growth are computed from two facts; a fourth quarter is the year less the
  first nine months. Where SEC's company-concept endpoint answers with an empty units object, the
  company's facts file is read instead.
- The server's instructions ask agents to check reported figures with `verify_claims` before
  answering.
- `read_filing` and `filing_tables` cache a document's text and its parsed tables apart.

## 0.3.0

- Fix: `event_study` took filing times from the submissions file's `acceptanceDateTime`, which is
  labelled UTC but is not reliable. Measured 2026-10-11 on 450 filings from 25 companies' files:
  - each file was either right for every filing in it, or shifted by one US Eastern offset (+4 h
    in daylight time, +5 h in standard time);
  - the same filing read differently in two files (Apple's and its director's);
  - the shifted files were the ones rebuilt since early October 2026;
  - edgartools#1501 also saw files that give Eastern time labelled UTC.

  Day 0 turns on the 16:00 close, so a filing could land on the wrong day. With today's +1 shift
  that happens only to afternoon filings: 1 of 31 JPMorgan 8-Ks since 2025, and none of 55 NVIDIA
  insider sales. In a file that labels Eastern time as UTC, every release after the close would
  fall on its own day.

  Event times are now calibrated per file against the filing index page's "Accepted" time (the
  newest and oldest event; 2 extra requests). If the two disagree, each event is read from its own
  index page. The result says which was done (`event_times`).

- New tool `earnings_calendar`: earnings dates from the companies' own 8-Ks under Item 2.02 (results
  of operations).
  - For a company: its recent results releases, the quarter each covered (from its 10-Q and 10-K
    period ends), and whether each came before the open or after the close. The time is EDGAR's
    acceptance time from the filing index, in Eastern time; the submissions API's
    `acceptanceDateTime` is not used (see the `event_study` fix below).
  - The next release is estimated 52 weeks after the one that followed the same quarter a year
    earlier, with a window from how far the company's dates have moved year on year, and marked
    upcoming, due now or late.
  - Across the market: the companies that reported in the same weeks last year, with this year's
    implied date, marked reported once they have (within three weeks).
  - Estimates, not announcements. Checked live: Apple 2026-10-29 after the close, NVIDIA 2026-11-18
    after the close, Walmart 2026-11-19 before the open, JPMorgan 2026-10-13 before the open.
- `company_events` gives each 8-K the headline of the press release attached to it (an EX-99
  exhibit), for example "Apple reports third quarter results", "Pfizer Announces Chief Financial
  Officer Transition" or "Bank of America Increases Common Stock Dividend 14% to $0.32 Per Share".
  The headline is the first line of real text after EDGAR's document header and the boilerplate; it
  is never the company's letterhead, and an exhibit that opens with financial statements has none.
  These are news headlines from the companies themselves, not a news wire. Reading them adds up to
  two requests per filing; `excerpts: false` skips both.
- Fix: a ticker that is not in the SEC's file of listed companies went to EDGAR's name search, which
  matches prefixes, so "VOO" (an ETF) was Vooy, Inc. Mutual fund and ETF tickers now resolve through
  the SEC's fund ticker file to the trust that registers them (VOO is Vanguard Index Funds). A
  ticker in neither file is refused rather than guessed. If the fund file cannot be read, names are
  searched as before.

## 0.2.1

The first 0.2 release on npm: 0.2.0's tools, and a fix for answers that were wrong without warning.
0.2.0 was tagged but never reached npm (the publish was refused before upload).

- Fix: `economic_series`, `world_economy` and `economic_outlook` took plain words to the series that
  shared at least half of them, so one generic word was enough. "silver price", "copper price" and
  "bitcoin price" returned US CPI. "japan inflation" returned US inflation, and "uk unemployment
  rate" US unemployment. "wage growth" and "employment growth" returned GDP growth, and "house
  prices" consumer inflation. In the OECD outlook, "exchange rate" returned the unemployment rate.
  Now every specific word must be among the entry's own words; words that only say what kind of
  number ("rate", "growth") or when ("this year", "since 2020") are not required. A request that
  names nothing listed is refused, with where to look instead: price_history for commodities,
  currencies, crypto and stocks, world_economy for other countries, or a FRED id.
- Fix: "gold price" pointed at FRED's LBMA gold series, which FRED withdrew in 2022, so it failed.
  Gold is `price_history`'s (COMEX gold futures).
- Fix: company names went straight to EDGAR's entity search, which knows every filer. "facebook"
  was Denny Hill/Facebook LLC, "jp morgan" JP Morgan AG, "jpmorgan chase" a JPMorgan entity that
  is not the listed company, and "google" an old Google Inc. with no filings since. A name is now
  looked for first among listed companies: the largest whose registered name starts with it, with
  the others that matched listed. Then come names people use for them (Google is Alphabet,
  Facebook is Meta), and then EDGAR's search. Fund managers known by a short name go to the filer
  of their 13Fs: Vanguard, Fidelity (FMR), Citadel Advisors, D. E. Shaw, Bridgewater, Renaissance,
  Two Sigma, Millennium, Point72, Elliott, Pershing Square, Tiger Global, Soros, ARK, Baupost and
  Lone Pine.
- A company's ticker is its common shares (F, not F-PD; GOOGL, not GOOGM).
- Fix: lookup tables read inherited properties. "constructor" as a symbol or market crashed
  `price_history` and `futures_positioning` with a TypeError, and gave `options_chain` and
  `index_constituents` messages naming "function Object()". Lookups now read only their own entries.
- `economic_series` knows more series by name. All were checked live on FRED on 2026-10-11:
  - prices: PPI, Michigan inflation expectations, 5-year breakeven inflation;
  - jobs and income: continuing claims, the quits rate, average hourly earnings, labour force
    participation, personal income and spending, real disposable income, the saving rate;
  - output and trade: corporate profits, the trade balance, federal debt to GDP;
  - rates and credit: the 1-year Treasury, the bank prime rate, the 15-year mortgage rate, consumer
    credit, bank loans;
  - conditions: the Chicago and St. Louis Fed financial-conditions indexes;
  - energy: gasoline and Henry Hub natural gas prices;
  - money and housing: M1, durable goods orders, building permits, new home sales.

  A series id inside the words ("unemployment rate (UNRATE)") is read as that id.
- `world_economy` knows youth unemployment, military spending, life expectancy and remittances by
  name.

## 0.2.0

From 13 tools to 34: the parts of finance 0.1.0 could not answer, each from the publisher's own data
with no key. Measured against OpenBB, EdgarTools and the Yahoo Finance MCP on 53 finance questions
(canli-mcp's `bench/rivals/coverage.mjs`), the servers this package joins in canli-mcp now answer 49.

- `options_chain`, `volatility_surface` and `futures_curve` from Cboe's public delayed data: chains
  with Cboe's IV and greeks by strike, put/call ratios, max pain and the move the at-the-money
  straddle prices in; ATM term structure, 25-delta risk reversal and butterfly, and the smile at
  fixed moneyness; and Cboe futures curves (VIX against the index) from its daily settlements.
  `CANLI_KEYLESS_OPTIONS=0` turns the source off.

- `price_history` covers currencies (EUR/USD), futures (crude oil, gold, Treasury futures),
  indices and yields (S&P 500, VIX, 10 year yield), crypto (bitcoin) and stocks listed abroad
  (SAP.DE, 7203.T, SHEL.L, 0700.HK), by symbol or plain name, and says what each price means
  (pence in London, futures rolls, index levels). Bars stamped after the window asked for are left
  out.
- `segment_revenue`: revenue by business segment (with operating income), by product or service and
  by region, for up to three years, from the XBRL of the latest 10-K or 10-Q, with the company's
  own labels (from its label linkbase, or its schema when the labels are embedded there) and each
  breakdown's sum checked against total revenue.
- `economic_calendar`: the US economic calendar from the agencies' own schedules (BLS and BEA
  iCalendar files, the Census Bureau's schedule page, the Fed's FOMC calendar), in US Eastern time,
  with the market-moving releases flagged; when the Census page has turned to next year, the gap is
  said.
- `fomc`: the Federal Reserve's decisions for a year from its own calendar and statements (held and
  scheduled meetings, action, change, target range, vote, dissenters with their reasons), the
  latest statement, and the median projections from the latest Summary of Economic Projections
  with the previous ones. Notation votes are labelled as such.
- `index_constituents`: an index's members and weights (S&P 500, Nasdaq 100, Russell 1000, 2000 and
  3000, S&P 400 and 600, MSCI EAFE and others) from the latest N-PORT of an ETF that tracks it,
  rescaled to add to 1; the Dow, whose ETF is a unit investment trust, says why it cannot.
- `executive_pay`: the pay-versus-performance table every proxy has tagged in XBRL since 2023, read
  from the proxy itself (the CEO's reported and actually paid pay, the other executives' averages,
  TSR against peers, net income, the company's chosen measure and its name, five years), or CEO pay
  ranked across the market from SEC's frames. A filing whose other executives average over $100
  million is held out as tagged in thousands; a CEO figure over $300 million stays, flagged to
  confirm.
- `short_interest`: FINRA's consolidated short interest, twice a month: shares short, change,
  average daily volume and days to cover, and the share of shares outstanding from the company's
  latest SEC cover page; or the market ranked by days to cover, change or size, among stocks
  trading at least a million shares a day.
- `fails_to_deliver`: the SEC's fails-to-deliver data (NSCC balances) for a stock over the latest
  half-month files, with prices and values, or the largest fails across the market. The files are
  zip archives, read with a small built-in reader (stored and deflated entries, size-checked).
- `off_exchange_volume`: FINRA's OTC transparency data for a stock, weekly: shares and trades in dark
  pools (ATSs) and with other off-exchange dealers, and the largest of each in the latest week.
- `futures_positioning`: the CFTC's Commitments of Traders by market name (gold, crude oil, corn,
  S&P 500, 10 year note, euro, bitcoin): each trader group's long, short and net contracts, weekly
  changes, and where the speculators' net position sits in its range. A name search prefers a
  contract that is still reported, and an old report says so.
- Sources that take queries only in a request body (FINRA) are read with a POST; cache and evidence
  key it by the exact query.
- `private_offerings`: private raises from Form D (startups, private equity, hedge, venture and
  real estate funds): amount offered and sold, investors, minimum investment, exemption, industry
  and the people behind each issuer, for one issuer or the newest across the market, filtered by
  industry or amount sold.
- `company_events`: company news from Form 8-K, by item (earnings, material agreements, completed
  deals, executive changes, restatements, auditor changes, bankruptcies, cyber incidents,
  restructurings, delisting notices), for one company or, by event, across the market, each with
  the opening of what the filing says under the item. Search hits on exhibits give way to the 8-K
  itself, and only filings that carry the item are kept.
- `investment_advisers`: firms from the SEC's Form ADV database (IAPD) by name or CRD: SEC file
  number, status, disclosure flag, offices, then the best match in full (registration and since
  when, other names, relying advisers, latest ADV date, links to its Form ADV and brochures).
- `large_holders`: who owns more than 5 percent of a company, from structured Schedules 13D and
  13G (shares, percent of class, voting power, passive or activist, a 13D's stated purpose), each
  holder's latest filing first; filings the company itself made about other companies are left
  out. With no company, the newest 13D stakes across the market.
- `fund_portfolio`: what a US mutual fund or ETF holds, from its own Form N-PORT: every position
  with value and weight, exposure by asset type, issuer, country and currency, a bond fund's
  coupon and maturity profile, monthly returns, the money that came in and went out each month,
  and what changed since the previous quarter. A 13,000-position bond fund (AGG) reads in about
  three seconds; unit investment trusts such as SPY are told apart and explained.
- `economic_outlook`: the OECD Economic Outlook's projections for the next two years and estimates
  for the two before, for 50+ economies, the euro area, the OECD and the world (GDP growth,
  inflation, core inflation, unemployment, budget balance, government debt, current account, short-
  and long-term rates), the euro area on its harmonised index. Requests to the OECD are spaced and
  made one at a time, since its service throttles bursts and overlapping requests.
- `world_economy`: any of the World Bank's World Development Indicators for 200+ countries and
  regions (GDP and growth, inflation, unemployment, government debt and deficits, the current
  account, trade, reserves), by plain words or code, as a year-by-country table.
- `treasury_auctions`: results of Treasury bill, note, bond, TIPS and FRN auctions (clearing rate,
  bid-to-cover, size, indirect, direct and dealer shares, which add up to the competitive amount
  accepted) and the auctions announced next, from Treasury Fiscal Data.
- `federal_debt`: Debt to the Penny each business day (held by the public plus intragovernmental
  equals the total, to the cent) and the average interest rate on each type of security.

## 0.1.0

First release: public market data and market-wide research from the sources themselves, 13 tools.

- Research across the market: `screen_companies` (every US-listed company on fundamentals from
  SEC XBRL frames, plausibility checks, valuation for the shortlist), `company_report` (one call),
  `event_study` (abnormal returns around earnings, insider trades or dates, with a t test) and
  `mentions_trend` (a phrase in filings over time).
- `evidence` on every result: the documents read, with SHA-256 and retrieval time.
- Momentary server errors are retried twice.

- SEC EDGAR, no key: `company_profile`, `list_filings`, `read_filing` (10-K and 10-Q items such as
  risk factors or MD&A on their own; exhibits such as an 8-K's press release; paging),
  `search_filings` (EDGAR full-text search since 2001), `insider_trades` (Form 4, with a buy/sell
  summary and 10b5-1 flags) and `fund_holdings` (13F, totals checked against the cover page,
  changes since the previous quarter).
- US Treasury yield curves (nominal, real, bills) and FRED series, no key; series by id or by
  plain words, with changes and year-over-year rates.
- `price_history` with no key (Yahoo Finance's public chart data, for personal use; dividends and
  splits included), or with your own Alpaca or Tiingo key, which is preferred when set.
- Every result names its source URL; SEC requests stay under SEC's rate limit.
