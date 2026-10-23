# Changelog

## Unreleased

- The breadth lab: `breadth_signals` (24 cross-sectional signals with their sources),
  `breadth_book` (a sleeve for every signal in every group of names from your price panel, hedged
  and scaled, traded as one netted account; the book netted and standalone, the netting ratio,
  effective bets and ideas, and every sleeve's returns written as a dataset with its specs) and
  `effective_bets` (independent bets in any set of return series).
- `price_panel`: a price panel from free sources for the breadth lab or `backtest_signal`: the
  tickers you name or an index fund's current holdings, daily adjusted closes and dollar volume, and
  each company's Fama-French industry from its SEC SIC code (QQQ's 100 largest: 93 matched, 70 s).
- Annotation: `annotation_packet` (figures, or every figure in a draft such as an AI's answer,
  checked by machine against the filings and written as blind CSV packets for people to label), `annotation_agreement` (Cohen's kappa between people and
  against the machine) and `annotation_gold` (a gold JSONL set with a datasheet and hashes).

## 0.1.2

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
