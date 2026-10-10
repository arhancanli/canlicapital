# Changelog

## Unreleased

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
