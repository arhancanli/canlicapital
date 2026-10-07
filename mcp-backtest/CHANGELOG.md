# Changelog

## Unreleased

## 0.1.0 (2026-10-07)

- First release. `pit_factor`: point-in-time factors from SEC filings (roa, gross_margin,
  operating_margin, revenue_growth, asset_growth, accruals, level:<measure>) using only what had been
  filed by each date. `backtest_signal`: cross-sectional backtest of any signal on your own prices,
  trading only on signal rows at least lag_days old (checked at every rebalance), costs on the
  actual trades, and every run recorded in canli-validation-mcp's trial ledger when ledger is given.
  `list_factors`.
