# Changelog

## Unreleased

- `price_history` covers currencies (EUR/USD), futures (crude oil, gold, Treasury futures),
  indices and yields (S&P 500, VIX, 10 year yield), crypto (bitcoin) and stocks listed abroad
  (SAP.DE, 7203.T, SHEL.L, 0700.HK), by symbol or plain name, and says what each price means
  (pence in London, futures rolls, index levels). Bars stamped after the window asked for are left
  out.
- `segment_revenue`: revenue by business segment (with operating income), by product or service and
  by region, for up to three years, from the XBRL of the latest 10-K or 10-Q, with the company's
  own labels (from its label linkbase, or its schema when the labels are embedded there) and each
  breakdown's sum checked against total revenue.
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
- `large_holders`: who owns more than 5 percent of a company, from structured Schedules 13D and
  13G (shares, percent of class, voting power, passive or activist, a 13D's stated purpose), each
  holder's latest filing first; filings the company itself made about other companies are left
  out. With no company, the newest 13D stakes across the market.
- `fund_portfolio`: what a US mutual fund or ETF holds, from its own Form N-PORT: every position
  with value and weight, exposure by asset type, issuer, country and currency, a bond fund's
  coupon and maturity profile, monthly returns, the money that came in and went out each month,
  and what changed since the previous quarter. A 13,000-position bond fund (AGG) reads in about
  three seconds; unit investment trusts such as SPY are told apart and explained.
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
