# Changelog

## Unreleased

- `price_history` covers currencies (EUR/USD), futures (crude oil, gold, Treasury futures),
  indices and yields (S&P 500, VIX, 10 year yield), crypto (bitcoin) and stocks listed abroad
  (SAP.DE, 7203.T, SHEL.L, 0700.HK), by symbol or plain name, and says what each price means
  (pence in London, futures rolls, index levels). Bars stamped after the window asked for are left
  out.
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
