# Changelog

## 0.8.0

Found by reading 21 third-quarter releases filed on 2026-10-29, each keyed from its text first.

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
