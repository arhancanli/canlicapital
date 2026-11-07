# Changelog

## Unreleased

- `conditional_forecast_test`: the Giacomini-White (2006) test of conditional predictive ability. The loss differential is interacted with instruments known when the forecast was made (a constant and the loss differential tau periods earlier, or a constant alone for the unconditional test); the Wald statistic uses the uncentred Newey-West matrix with tau - 1 lags and is compared with chi-squared. It tests forecasting methods, estimation included, and its decision rule says in what share of periods each forecast is predicted to do better. Checked against an independent numpy implementation (three cases).
- `model_confidence_set`: the Hansen, Lunde and Nason (2011) model confidence set from several forecasts (or a loss matrix): models are eliminated while the stationary-bootstrap test of equal accuracy rejects, with the R (largest pairwise t) or max statistic; each model's mean loss, MCS p-value and elimination step, and the set at the chosen confidence (default 0.9). The bootstrap uses mulberry32(seed), so results reproduce exactly; checked against an independent numpy implementation drawing the same indices (two cases).
- `forecast_accuracy_test`: is forecast A really better than forecast B? The Diebold-Mariano test on squared or absolute errors, h steps ahead, with the Harvey-Leybourne-Newbold small-sample correction (Student's t on T - 1 degrees of freedom), and which forecast is better, if either is. Checked against an independent numpy and scipy implementation of the published formulas (scripts/reference/forecast.py): the true AR(1) forecast against a random walk gives DM -3.55, p 0.0005; two near-identical forecasts give no difference.

## 0.3.0

- `lookahead_check`: target weights checked for lookahead from the weights alone. Their return is lined up with the period each was decided for, one, two and five periods late, and one period early (the return that had just happened). Weights computed with their own period's outcome show an edge all in that period, gone a period later and unexplained by the last return; the verdict reads so when that holds beyond about two standard errors of the Sharpe ratio. On simulated data it flags weights that peek every day and one day in seven, and not momentum, reversal or weights with no edge. It reads the weights, not the code behind them: hindsight in the universe, revised data or survivorship can leave no such pattern.
- Sweeps count every try. `strategy_sweep` and `sleeve_tournament` return `every_trial`: every variant's annualized Sharpe, best first, with the periods it was measured on and `periods_per_year`. The table still shows the top 50 variants (or the leaderboard), but a server that counts what a session tried, such as canli-mcp's luck count, can now count all 400 variants of a grid and all 399 sleeves of a tournament, not the best alone.
- `strategy_sweep` gives the probability of backtest overfitting by combinatorially symmetric cross-validation (Bailey, Borwein, Lopez de Prado and Zhu 2017), over the variants' net returns: how often the best variant on half the sample landed in the bottom half on the other half, with the median logit, the probability of an out-of-sample loss and the degradation slope. It is computed on the whole sample, where a variant with a longer lookback is flat for longer at the start; there is none for one variant or under 40 periods. The CSCV code `sleeve_tournament` uses moved to `src/cscv.mjs`, unchanged.

## 0.2.0

- Backtests can return their path: `curve: true` adds the equity curve (from 1) against buy-and-hold,
  the drawdown from the running peak and the exposure at each close (at most 1,000 rows, evenly
  thinned, the last kept), and every weight change as a trade with its price (the last 1,000).
  `dates` labels both. The default answer is unchanged, and strategy_sweep never builds curves.

## 0.1.3

- zod 4.6.7 (a high advisory in earlier zod: memory exhaustion on oversized constrained collections). No code change.

## Unreleased

## 0.1.2

This cumulative npm candidate includes the statistical and input corrections recorded under
0.1.1 below. The 0.1.1 source archive stays available; it will not be published separately to npm.

- Non-finite computed results now return a tool error naming their fields and values before JSON
  serialization or success receipt creation. Previously NaN and Infinity appeared as null with no
  diagnostic. Both discovery and directly listed tools use the same result check. Ordinary finite
  answers and legitimate null warm-up positions retain their existing representation.

## 0.1.1 (signed source release; not published to npm)

- Fix: an asset whose returns never change made `covariance_shrinkage`, `correlation_matrix` and
  the portfolio optimizers (`max_sharpe_portfolio`, `min_variance_portfolio` and the others built
  on the same estimates) answer with NaN. They now refuse and name the asset ("CASH has no
  variance").
- Fix: `put_call_parity` gave NaN for `implied_carry` when the quotes put the implied forward at or
  below zero. It now gives null with a note to check the quotes for staleness. Both were found by
  canli-mcp's `bench/robustness.mjs`.
- Fix: `digits` also rounded whole numbers, so `digits: 4` turned 227,917,808 into 227,900,000.
  It now trims fractions only; whole numbers and the integer part of large values stay exact.


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
