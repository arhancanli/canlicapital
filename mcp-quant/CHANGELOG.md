# Changelog

## Unreleased

- Fix: `digits` also rounded whole numbers, so `digits: 4` turned 227,917,808 into 227,900,000.
  It now trims fractions only; whole numbers and the integer part of large values stay exact.

## 0.1.1

- `deflated_sharpe_ratio` and `probabilistic_sharpe_ratio` also take summary numbers (`sharpe_annual`,
  `observations`, `skew`, `kurtosis`) and refuse fewer than 20 returns or zero variance, instead of
  returning a probability from too little data. Found by watching a model call them in an agent
  evaluation.
- `sleeve_tournament`: Hansen's SPA and Romano-Wolf StepM are now re-studentized in every resample,
  the default mean block length is round(n^(1/3)) instead of floor(sqrt(n)), and White's Reality
  Check is reported alongside. The 0.1.0 version held one variance estimate fixed across resamples,
  which the Null Zoo benchmark measured rejecting 13.5% of skill-less AR(1) searches at a nominal
  5% with long blocks; on our planted-trend test data it kept 24 sleeves where the corrected test
  keeps 4.

- `sleeve_tournament` verdict: no longer calls the effective-trials deflation "the fairer one"; on
  data with no edge it nearly passes a long-only winner. The verdict now says the raw count is the
  conservative bound and that deflation (Sharpe above zero) and SPA/StepM (beats the benchmark)
  answer different questions.

## 0.1.0

First release: 235 tools in 18 toolsets (performance, options, exotics, rates, tvm, valuation,
portfolio, risk, returns, econometrics, indicators, execution, sizing, crypto_fx, strategies,
sleeves, data_checks, labeling), reached through three discovery tools (`find_tool`, `describe_tool`,
`run_tool`) or listed directly with `CANLI_TOOLSETS`.

- A library of 399 strategy sleeves in 18 families, each with a fixed rule, references and a spec
  hash, and tools that run them all on your prices with the corrections a many-strategy search
  needs: deflated Sharpe (raw and effective trials), Hansen's SPA, Romano-Wolf StepM, CSCV
  probability of backtest overfitting, walk-forward selection, clustering and regime maps.
  `run_sleeve` and `combine_sleeves` return target weights by symbol for a paper rebalance.
- 18 strategy recipes on one costed, drift-aware engine with no lookahead.
- Deeper analytics: Markov regime switching, Johansen cointegration, CUSUM parameter stability,
  Chow breaks, HAR volatility forecasts, realized volatility with jump tests, rank, distance and
  tail dependence, block-bootstrap confidence intervals, extreme value tails, a VIX-method
  implied volatility, risk-neutral densities and Merton credit risk.
- Data annotation and ML labels: a per-period annotator, CUSUM event sampling, triple-barrier,
  meta, fixed-horizon and trend-scanning labels, sample weights, and purged, embargoed CV splits.
- Privacy enforced by tests: no network, disk writes, logging, processes or workers; runs under
  Node's permission model.
- 465 reference cases against QuantLib, statsmodels, arch, TA-Lib, numpy-financial, scikit-learn,
  empyrical, scipy, pandas and dcor; planted-defect tests for the data checks; no-lookahead and warm-up
  checks on every sleeve.
- Eleven workflow prompts, six resources, and opt-in calculation receipts.
- BM25 tool search (94% right first, 99% in the top three on 110 test requests) and a `digits`
  option on `run_tool` for shorter outputs.
