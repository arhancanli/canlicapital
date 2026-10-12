# Changelog

## Unreleased

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
