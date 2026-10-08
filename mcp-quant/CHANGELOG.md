# Changelog

## Unreleased

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
- 461 reference cases against QuantLib, statsmodels, arch, TA-Lib, numpy-financial, scikit-learn,
  empyrical, scipy, pandas and dcor; planted-defect tests for the data checks; no-lookahead and warm-up
  checks on every sleeve.
- Eleven workflow prompts, six resources, and opt-in calculation receipts.
