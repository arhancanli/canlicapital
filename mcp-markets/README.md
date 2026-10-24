# canli-markets-mcp

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
`CANLI_KEYLESS_PRICES=0` turns the keyless source off.

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
| `verify_claims` | Is a figure in a draft answer right? Confirmed, contradicted (with the filed figure and what the wrong one matches: last year, a quarter, a unit slip, the wrong currency), or not reported (a future year, a dividend a company never paid); US and foreign filers (20-F, IFRS) in the currency they report in | XBRL company facts |

Examples: "Show Microsoft's last four years of income statements as filed", "How has Costco's
paid membership grown over five years?", "Did NVIDIA beat its revenue guidance last quarter, and
what is it guiding to now?", "What full-year EPS range is Walmart guiding to, and how has it moved
since the original guide?", "Check this paragraph's numbers before I send it."

## Beyond the US

| Tool | What it answers | Source |
| --- | --- | --- |
| `european_filings` | A European company's annual report as it tagged it: revenue, operating and net profit, EPS, assets, equity, cash, cash flows and dividends with the comparatives, in its own currency at full scale; any other tagged figure by words; the other years on file | ESEF reports (filings.xbrl.org) |
| `reference_rates` | SOFR, TGCR, BGCR, EFFR and OBFR (with percentiles and volume), the euro short-term rate and the ECB's policy rates (the rate in effect and its changes), SONIA and Bank Rate, and about forty central banks' policy rates | New York Fed, ECB, Bank of England, BIS |
| `prediction_markets` | What traders pay for an outcome (a Fed decision, a recession, an election), as a probability with bid, ask, volume and closing date, from both venues | Polymarket, Kalshi |
| `crypto_fundamentals` | A DeFi protocol's value locked (by chain, with history), the fees users pay it and the revenue it keeps; a chain's value locked; a stablecoin's supply and its change | DefiLlama |

Examples: "What did ASML report for 2025 revenue and net profit?", "Where is SOFR against the
fed funds range this month?", "When did the ECB last change its deposit rate?", "What odds do
prediction markets give a US recession this year?", "How much revenue does Aave keep from its
fees?". `bench/global/crosscheck.mjs` sets these tools against sources they do not read: ESEF
figures against the same companies' Form 20-F at the SEC, and the central banks' policy rates
against the BIS (21 of 21 agreed on 2026-10-15).

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
| `ownership_breadth` | How many institutions hold a stock, quarter by quarter: 13F filers whose holdings tables list its CUSIP, the change, and a sample of holders (Apple, Q2 2026: 6,776, up 1.9% on the quarter) | EDGAR full-text search over 13F information tables |
| `forensic_scores` | Beneish's M-score, Piotroski's F-score and Altman's Z-score in one call, every input read from the company's annual XBRL with its tag, and missing inputs named rather than guessed | SEC XBRL company facts, price at the fiscal year end |
| `funding_rates` | Crypto perpetual funding: each coin's latest eight-hour rate, the window's mean and annualized carry, the last week's, and the share of positive periods (BTC, 90 days to 2026-10-24: 5.6% a year) | OKX public data (no key) |
| `compute_prices` | Compute as a market: the on-demand hourly price of each data-centre GPU across the clouds (cheapest, median and dearest, and who offers them), every provider's offer for one model, recent list-price changes, and the Cirrun GPU Index (H100 SXM, 2026-10-24: $1.99 to $12.29 an hour, median $3.95) | Cirrun's GPU price index (no key, CC BY 4.0) |
| `federal_contracts` | What the US government obligated to a company in a fiscal year: the total, by agency and industry code, the entities it contracts under, and its largest contracts with links (Lockheed Martin, fiscal 2026: $53.2 billion from Defense) | USAspending.gov (no key) |
| `drug_pipeline` | A drug company's active clinical trials by phase, the primary completions due in the coming months (the next readouts), its late-stage trials and its FDA approvals (Vertex: 31 active trials, 16 in phase 3) | ClinicalTrials.gov and Drugs@FDA (no key) |
| `comment_letters` | What the SEC's staff questioned in a company's filings and how it answered, grouped into reviews, with the topics of the newest letters (Apple, 2024: revenue recognition, segments, MD&A) | SEC EDGAR forms UPLOAD and CORRESP |
| `shareholder_returns` | What a company has paid its owners each year: dividends per share (with its split-adjusted record: years raised in a row, 5- and 10-year growth) and in total, buybacks and shares issued, the diluted share count, the payout ratio and the share of free cash flow paid out, and the dividend and shareholder yields at the last close | SEC XBRL company facts, the last close |
| `reverse_dcf` | The free-cash-flow growth a share price implies: a DCF solved for the growth that reaches the market's enterprise value, every input from the annual XBRL with its tag, a sensitivity table and the company's own growth beside it | SEC XBRL company facts, the last close |
| `filing_drift` | How a 10-K section's language drifts over several years: each year's change from the last (the measure Cohen, Malloy and Nguyen's "Lazy Prices" found preceded weaker returns), hedging and adverse words, readability, and a theme you name, with flags (Nvidia's risk factors: export-control sentences 8, 14, 37, 48, 51 over five reports) | SEC 10-K filings, computed on your machine |
| `bank_financials` | A US bank's condition quarter by quarter from its call reports: assets, deposits and the share uninsured, loans and the share noncurrent, earnings, margin, returns and capital ratios; with no bank, the latest failures and their cost (Western Alliance, June 2026: 38% of deposits uninsured, tier 1 leverage 8.1%) | FDIC BankFind (no key) |
| `earnings_calendar` | A company's results release dates with the quarter covered and before the open or after the close, and the next one estimated from the same quarter last year; or who is due to report in a window across the market | SEC EDGAR (8-K Item 2.02) |
| `segment_revenue` | Where revenue comes from: by segment (with operating income), product and region, three years, checked against total revenue | 10-K/10-Q XBRL |
| `insider_trades` | Who inside bought or sold, at what price, under a 10b5-1 plan or not | Form 4 |
| `planned_insider_sales` | Insiders' planned sales from Form 144, filed before they sell: seller, role, shares, value, approximate sale date, how the shares were acquired, any 10b5-1 plan date, and totals by seller | Form 144 |
| `fund_holdings` | What a fund manager holds, its weights, and what it bought and sold last quarter | 13F |
| `investment_advisers` | Who an investment adviser is: registration, offices, other names, disclosure flags, Form ADV and brochures | SEC Form ADV (IAPD) |
| `large_holders` | Who owns more than 5 percent, passive (13G) or activist (13D, with its stated purpose); or the week's new activist stakes across the market | Schedules 13D and 13G |
| `private_offerings` | Who is raising private money (startups, private equity, hedge and real estate funds): amount sold, investors, exemption, people | Form D |
| `ipo_pipeline` | Companies that filed or amended a registration (S-1, F-1) in a window, labelled IPO candidate, SPAC, fund or already listed, and offerings priced (424B4) with price, shares and proceeds from the cover | EDGAR full-text search |
| `fails_to_deliver` | Shares that failed to settle for a stock over the last month, or the largest fails across the market | SEC fails-to-deliver data |
| `off_exchange_volume` | How much of a stock trades in dark pools and with other off-exchange dealers each week, and where | FINRA OTC transparency |
| `short_interest` | How heavily a stock is shorted (shares short, days to cover, share of shares outstanding), or the market's most shorted | FINRA |
| `futures_positioning` | Who is long and short in a futures market (managed money, dealers, asset managers, leveraged funds) and how crowded | CFTC Commitments of Traders |
| `executive_pay` | What executives are paid against how the company did (reported and actually-paid pay, TSR vs peers), five years; or CEO pay ranked across the market | Proxy pay-versus-performance XBRL |
| `index_constituents` | The members of the S&P 500, Nasdaq 100, Russell 2000 and other indexes, with weights | N-PORT of a tracking ETF |
| `fund_portfolio` | What a mutual fund or ETF holds (VOO, IVV, AGG): every position, exposures, a bond fund's coupon and maturity, monthly returns and money in and out | Form N-PORT |
| `economic_calendar` | When the data comes out: BLS, BEA, Census and FOMC release dates and times, the market-moving ones flagged | The agencies' own schedules |
| `fomc` | The Fed's decisions for a year (action, target range, vote and dissenters), the latest statement and the dot-plot medians | Federal Reserve |
| `treasury_yields` | The Treasury curve (nominal, real, bills) for a day or a range | US Treasury |
| `economic_series` | Any FRED series by id or words ("core inflation"), as levels, changes or year-over-year | FRED |
| `options_chain` | An option chain with IV, greeks, open interest, put/call ratios, max pain and the expected move | Cboe delayed quotes |
| `volatility_surface` | Implied volatility term structure, 25-delta skew and the smile | Cboe delayed quotes |
| `futures_curve` | The VIX futures curve (and other Cboe futures) against the index: contango or backwardation | Cboe settlements |
| `market_overview` | The market at a glance: US indices and the VIX, the eleven sectors ranked by the month, Treasury yields, the dollar and major currencies, oil, gas, gold, silver, copper, bitcoin, ether and the main markets abroad, each over a day, a week, a month, three months, the year to date and a year | Yahoo Finance chart data (no key) |
| `price_history` | Daily to monthly bars for stocks in the US and abroad, currencies, futures, indices and crypto, adjusted, with dividends and splits, as columns | Yahoo Finance (no key), or Alpaca or Tiingo (your key) for US stocks |
| `treasury_auctions` | How each Treasury auction went (yield, bid-to-cover, who bought) and which auctions come next | US Treasury Fiscal Data |
| `federal_debt` | The US debt each business day, and the average rate the Treasury pays on it | US Treasury Fiscal Data |
| `economic_outlook` | The OECD's projections for the next two years: growth, inflation, unemployment, deficits, debt, current account, rates | OECD Economic Outlook |
| `world_economy` | Any country's economy: GDP and growth, inflation, unemployment, debt, deficits, trade, reserves, for 200+ countries and regions | World Bank (CC BY 4.0) |

Examples an agent can now answer in one or two calls: "What are the new risk factors in Nvidia's
latest 10-K?", "Did any Tesla insider buy shares on the open market this year?", "What did
Berkshire Hathaway sell last quarter?", "Where is the 2s10s spread today?", "What is core PCE
inflation year over year?".

Results are columns and rows, so a series feeds straight into analysis: with
[canli-mcp](https://www.npmjs.com/package/canli-mcp), `economic_series` or `price_history` output
goes into any of its 235 quant tools in the same batch.

## Checked against the source

The tests replay real SEC, Treasury and FRED responses and check values read off the documents:
Berkshire Hathaway's 13F for the quarter ending 30 June 2026 totals $299,253,556,246 over 89
entries, exactly the figures on its cover page; Apple's 10-K risk factors come back as Item 1A
alone; a Tesla Form 4 sale reads 2,605.75 shares at $360.134.

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
