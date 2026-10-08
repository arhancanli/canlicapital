# Changelog

## Unreleased

## 0.1.0

First release: 216 tools in 17 toolsets (performance, options, exotics, rates, tvm, valuation,
portfolio, risk, returns, econometrics, indicators, execution, sizing, crypto_fx, strategies,
sleeves, data_checks), reached through three discovery tools (`find_tool`, `describe_tool`,
`run_tool`) or listed directly with `CANLI_TOOLSETS`.

- A library of 399 strategy sleeves in 18 families, each with a fixed rule, references and a spec
  hash, and tools that run them all on your prices with the corrections a many-strategy search
  needs: deflated Sharpe (raw and effective trials), Hansen's SPA, Romano-Wolf StepM, CSCV
  probability of backtest overfitting, walk-forward selection, clustering and regime maps.
  `run_sleeve` and `combine_sleeves` return target weights by symbol for a paper rebalance.
- 18 strategy recipes on one costed, drift-aware engine with no lookahead.
- 424 reference cases against QuantLib, statsmodels, arch, TA-Lib, numpy-financial, scikit-learn,
  empyrical, scipy and pandas; planted-defect tests for the data checks; no-lookahead and warm-up
  checks on every sleeve.
- Ten workflow prompts, five resources, and opt-in calculation receipts.
