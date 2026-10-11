# Changelog

## Unreleased

- Fix: a NUL character in `prices_file`, `signal_file` or `out_file` reached the file system, which
  throws a TypeError. It now fails argument validation with the reason.
- Fix: a factor named like a built-in property ("constructor") read Object's constructor out of the
  factor table; it is now an unknown factor, with the list of known ones. Both were found by
  canli-mcp's `bench/robustness.mjs`.

## 0.1.1

- Installable on its own. 0.1.0 was published with `canli-validation-mcp` declared as
  `file:../mcp`, a path that exists only inside this repository, so a standalone install could not
  load the server. 0.1.1 depends on the published `canli-validation-mcp@^0.14.0`. No code changes.

## 0.1.0 (2026-10-07)

- First release. `pit_factor`: point-in-time factors from SEC filings (roa, gross_margin,
  operating_margin, revenue_growth, asset_growth, accruals, level:<measure>) using only what had been
  filed by each date. `backtest_signal`: cross-sectional backtest of any signal on your own prices,
  trading only on signal rows at least lag_days old (checked at every rebalance), costs on the
  actual trades, and every run recorded in canli-validation-mcp's trial ledger when ledger is given.
  `list_factors`.
