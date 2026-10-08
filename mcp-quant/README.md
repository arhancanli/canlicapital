# canli-quant-mcp

235 quant finance tools in one MCP server: performance and risk, options and exotics, fixed income,
portfolio construction, econometrics, technical indicators, execution, sizing, crypto and FX,
valuation, strategy backtests, a library of 399 strategy sleeves, data checks, and data annotation
and ML labeling. Every tool
computes on the data you send, and every tool's results are checked in the test suite against an
independent implementation (QuantLib, statsmodels, arch, TA-Lib, numpy-financial, scikit-learn,
empyrical, scipy, pandas, dcor): 461 reference cases, plus planted-defect tests for the data checks.

Local stdio, no key, no account, no network calls: your data never leaves your machine (see
[Privacy](#privacy), enforced by tests).

## Three tools in context, 235 behind them

Listing 238 tools directly costs **83,944 tokens** of context (o200k) on every request. By default
this server lists three, **680 tokens**:

| tool | what it does |
|---|---|
| `find_tool` | Search the catalog in plain words ("cornish fisher var", "barrier option", "kpss"). |
| `describe_tool` | One tool's description and exact input schema. |
| `run_tool` | Run any tool by name. `receipt: true` adds a calculation receipt. |

`find_tool` ranks with BM25 over each tool's name, title, keywords and description, with stemming
and finance abbreviations (cvar, npv, irr, ytm...). On 110 test requests it returns the right tool
first 94% of the time and in the top three 99% (`test/search.test.mjs`), so a model rarely needs a
second search. `run_tool` takes `digits` (3-10 significant figures; default 10) to cut output tokens
when full precision is not needed: 9-19% fewer tokens at 4-6 digits on the results we measured.

Measured on an Apple-silicon laptop (Node 24): connect and initialize 140 ms; a typical tool call
0.26 ms median over stdio; `find_tool` 1 ms; a full 399-sleeve tournament on 1,200 days of six
assets about 2 s.

The tool list is byte-identical across launches, so providers can cache it. To list toolsets
directly instead, set `CANLI_TOOLSETS` to a comma-separated list (e.g. `performance,options`, 8,053
tokens for performance alone) or `all`.

## Quick start

```bash
npx -y canli-quant-mcp
```

Claude Code:

```bash
claude mcp add canli-quant -- npx -y canli-quant-mcp
```

Claude Desktop, Cursor or any MCP client:

```json
{ "mcpServers": { "canli-quant": { "command": "npx", "args": ["-y", "canli-quant-mcp"] } } }
```

Then ask, for example:

- *"Here are my strategy's daily returns. I tried 40 variants. Does the edge survive deflation?"*
- *"Price a 6-month down-and-out call, strike 100, barrier 90, vol 25%, and compare it with the vanilla."*
- *"Is this spread mean-reverting? Run ADF, KPSS and the variance ratio, then backtest it with costs."*
- *"Check this option chain for arbitrage before I fit a surface to it."*
- *"Which of the 399 sleeves hold up on these ETF prices after correcting for trying them all?"*
- *"Is this market in a calm or a turbulent regime right now, and how long do regimes last?"*

## Toolsets

| toolset | tools | checked against |
|---|---|---|
| `performance` | 23 | numpy, scipy, statsmodels and empyrical-reloaded |
| `options` | 12 | QuantLib (analytic engines; finite differences for American options); an independent implementation of the CBOE VIX method; the lognormal density for Breeden-Litzenberger |
| `indicators` | 30 | TA-Lib's C library, bar for bar; pandas for indicators TA-Lib lacks |
| `econometrics` | 27 | statsmodels (OLS, HAC, ADF, KPSS, Engle-Granger and Johansen cointegration, Granger, ARCH LM, Markov switching, recursive least squares and CUSUM), arch (GARCH, variance ratio), scipy and dcor (rank and distance correlation) |
| `exotics` | 9 | QuantLib (barrier, Asian, Heston, SABR, Kirk, Margrabe, lookback and chooser engines) |
| `rates` | 15 | QuantLib bonds and short-rate models; numpy and scipy for curves and swaps; scipy fsolve for Merton |
| `risk` | 7 | numpy and scipy re-derivations; scipy's generalized Pareto likelihood for EVT |
| `returns` | 4 | pandas resampling and closed forms |
| `portfolio` | 15 | numpy closed forms, scipy SLSQP, scikit-learn Ledoit-Wolf, the HRP paper's code |
| `execution` | 7 | closed forms (Almgren-Chriss kappa solved numerically), statsmodels OLS |
| `sizing` | 7 | scipy and closed forms |
| `crypto_fx` | 9 | closed forms and simulated pool reserves |
| `strategies` | 20 | an independent pandas implementation of every recipe and of the costed engine |
| `sleeves` | 8 | an independent numpy and pandas port of every recipe and the engine; arch's Reality Check and an independent re-studentized SPA and StepM on the same bootstrap draws; scipy average linkage; numpy CSCV; plus no-lookahead and warm-up checks on every sleeve |
| `data_checks` | 10 | planted-defect tests: each check must find what was planted and stay quiet on clean data |
| `labeling` | 7 | pandas ports of the snippets in Advances in Financial Machine Learning (ewm volatility, CUSUM filter, triple barrier, uniqueness, purged k-fold) and statsmodels OLS t-values |
| `tvm` | 15 | numpy-financial and closed forms |
| `valuation` | 10 | published formulas re-derived independently |

## Workflows (prompts)

Prompts chain the tools for common jobs: `analyze_strategy`, `audit_backtest`, `value_company`,
`price_option`, `test_mean_reversion`, `build_portfolio`, `analyze_trade_log`, `sleeve_tournament`,
`build_sleeve_book`, `label_dataset`, `check_dataset`.

Resources: `canli-quant://catalog` (every tool), `canli-quant://methods` (what each toolset is
checked against), `canli-quant://tools/{name}` (one tool's schema), `canli-quant://sleeves` (the sleeve
library), `canli-quant://sleeves/{id}` (one sleeve's spec) and `canli-quant://privacy`.

## Sleeve library

399 strategy sleeves in 18 families, each a published idea with its usual parameters swept on a
plain grid: moving-average crossovers, time-series momentum, multi-horizon trend, channel
breakouts, MACD, z-score and RSI reversion, volatility targeting, cross-sectional momentum, dual
momentum, risk parity, equal weight, minimum variance, low volatility, short-term reversal,
trend-filtered allocation, 52-week-high momentum and pairs. Every sleeve has a fixed rule, a stated
warm-up, references, known risks and a SHA-256 of its spec. None was picked because it backtested
well: they are definitions, not track records.

Running many strategies and keeping the best is how backtests overfit, so the tools that run many
sleeves at once correct for it:

| tool | what it answers |
|---|---|
| `sleeve_tournament` | Which sleeves lead on your prices, and does the best survive the deflated Sharpe ratio (counting all sleeves and the effective number of independent ones), White's Reality Check, Hansen's SPA test and Romano-Wolf StepM (re-studentized in every resample) and the probability of backtest overfitting (CSCV)? |
| `sleeve_walk_forward` | If you had kept picking the top sleeves by trailing Sharpe, what would you have earned out of sample, and how much of their in-sample Sharpe was luck? |
| `sleeve_clusters` | How many genuinely different bets do the sleeves make on this data? |
| `sleeve_regime_map` | Which sleeves held up in calm, turbulent, rising and falling markets? |
| `combine_sleeves` | What does a book of chosen sleeves look like, and what asset weights does it want as of the latest close? |

The tests check that no sleeve looks ahead (rewriting future prices never changes an earlier
target), that none trades before its warm-up, and that the tournament's statistics match arch's Reality Check and an independent re-studentized SPA
and StepM on the same bootstrap draws, scipy's clustering and an independent numpy CSCV.
`run_sleeve` and `combine_sleeves` return `target_weights` by symbol, which a paper broker such as
canli-paper-trading-mcp can rebalance to.

## Data annotation and ML labels

The `labeling` toolset annotates your own data and turns it into training labels without leakage:

| tool | what it does |
|---|---|
| `annotate_price_series` | Tags every period: outlier moves, stale prices, drawdown episodes, new highs, causal volatility regime. |
| `cusum_filter_events` | Picks the periods worth labeling (CUSUM filter on log prices). |
| `triple_barrier_labels` | Labels by which of a volatility-scaled profit-take, stop-loss or time limit is hit first; with a side, meta-labels. |
| `fixed_horizon_labels` | Labels by the forward return over a horizon, with a fixed or volatility-scaled dead zone. |
| `trend_scanning_labels` | Labels by the strongest forward trend's t-statistic. |
| `sample_weights` | Uniqueness, return-attribution and time-decay weights for overlapping labels. |
| `purged_cv_splits` | K-fold splits that purge overlapping labels and embargo the periods after each test fold. |

Each label says which future periods it used, so purging and embargoing are exact. The methods follow
Lopez de Prado's *Advances in Financial Machine Learning*, checked against pandas ports of its code.

## Privacy

Your data stays on your machine. The server is a local stdio process with no network code, writes
nothing to disk, logs nothing, starts no processes, and keeps arguments only for the duration of a
call. `test/privacy.test.mjs` holds the code to that with a static scan of every source file and by
running the server under Node's permission model, with reads limited to its own package and
writes, child processes and workers denied. For the same lockdown in use:

```bash
npm i -g canli-quant-mcp
node --permission --allow-fs-read="$(npm root -g)/canli-quant-mcp" "$(npm root -g)/canli-quant-mcp/src/server.mjs"
```

`canli-quant://privacy` states the guarantees from inside the server. Calculation receipts carry
hashes, never the data.

## Calculation receipts

`run_tool` with `receipt: true` returns the SHA-256 of the tool name and arguments, the SHA-256 of
the result, and the server version. Anyone can run the same tool with the same arguments on that
version and compare the output hash. Results are deterministic: no clock, no network, and the only
randomness is the sleeve bootstrap, drawn from a stated seed.

## Conventions

- Returns are simple fractions (0.01 = 1%), oldest first. Tools refuse returns of -100% or below and
  series that look like percents.
- Rates are annual; options use continuous compounding; bond yields compound at the coupon frequency.
- Results are rounded to 10 significant figures.
- Strategy backtests decide weights at the close of period t and earn period t+1's return; weights
  drift between rebalances and costs are charged on turnover.

## All tools

<details><summary><b>performance</b>: Performance and risk (23)</summary>

| tool | what it does |
|---|---|
| `return_stats` | Summarize a return series: periods, annualized geometric return (CAGR) and volatility, Sharpe, max drawdown, skew, excess kurtosis, best and worst period, share positive. |
| `sharpe_ratio` | Compute the annualized Sharpe ratio with its standard error and 95% interval, under iid normal returns (Lo 2002) and allowing skew and fat tails (Mertens 2002). For the probability it beats luck across many trials, use canli-validation-mcp. |
| `sortino_ratio` | Compute the annualized Sortino ratio: mean return above a target over downside deviation below it, with the downside deviation itself. |
| `max_drawdown` | Find the maximum drawdown and the worst drawdown episodes: depth, peak, trough, recovery and length in periods, plus time under water. |
| `calmar_ratio` | Compute the Calmar ratio: annualized geometric return over the absolute maximum drawdown of the whole series. |
| `omega_ratio` | Compute the Omega ratio at a threshold: the sum of gains above it over the sum of losses below it. |
| `value_at_risk` | Estimate value at risk as a positive loss fraction: historical, Gaussian and Cornish-Fisher (skew and kurtosis adjusted), over one or more periods. |
| `expected_shortfall` | Estimate expected shortfall (CVaR): the average loss beyond value at risk, historical and Gaussian, as a positive loss fraction. |
| `capm_regression` | Regress excess returns on benchmark excess returns: beta, alpha (annualized), their t-stats and p-values, R-squared, correlation and residual (idiosyncratic) volatility. |
| `information_ratio` | Compute active return, tracking error and the information ratio of a strategy against its benchmark, annualized. |
| `treynor_ratio` | Compute the Treynor ratio: annualized excess return per unit of beta to the benchmark. |
| `m2_measure` | Compute Modigliani's M-squared: the return the strategy would have earned levered to the benchmark's volatility, and its difference from the benchmark. |
| `capture_ratios` | Compute up-market and down-market capture: the strategy's annualized return in benchmark up periods and down periods, relative to the benchmark's. |
| `ulcer_index` | Compute the Ulcer index (root-mean-square drawdown), the Martin (ulcer performance) ratio, and the pain index and pain ratio (mean drawdown). |
| `drawdown_at_risk` | Estimate drawdown at risk (a drawdown quantile across periods) and conditional drawdown at risk (the mean drawdown beyond it), as positive fractions. |
| `tail_ratio` | Compute the tail ratio (95th percentile return over the absolute 5th) and the Rachev ratio (mean of the best tail over the mean loss of the worst tail). |
| `gain_to_pain` | Compute Schwager's gain-to-pain ratio: the sum of returns over the absolute sum of losing returns. |
| `trade_stats` | Summarize closed-trade results: win rate, profit factor, payoff ratio, expectancy, largest win and loss, and longest winning and losing streaks. |
| `kelly_fraction` | Compute the growth-optimal (Kelly) fraction: from a return series (continuous, (mean - rf) / variance), or from a win probability and payoff odds. Also gives half Kelly. |
| `autocorrelation` | Test a return series for serial correlation: autocorrelations at each lag and the Ljung-Box Q statistic with its p-value. |
| `normality_test` | Test whether returns are normal with the Jarque-Bera test, with skew and excess kurtosis. |
| `autocorrelation_adjusted_sharpe` | Annualize a Sharpe ratio allowing for serial correlation (Lo 2002): smoothed or autocorrelated returns overstate the usual sqrt(time) Sharpe. |
| `rolling_sharpe` | Summarize the rolling Sharpe ratio over a window: latest, min, max, median and the share of windows below zero; shows whether performance is stable or decaying. |

</details>

<details><summary><b>options</b>: Options and derivatives (12)</summary>

| tool | what it does |
|---|---|
| `black_scholes` | Price a European option under Black-Scholes-Merton with a dividend yield, with delta, gamma, vega, theta, rho, vanna, volga, charm, speed and the risk-neutral probability of finishing in the money. |
| `implied_volatility` | Solve for the Black-Scholes-Merton implied volatility of a European option from its price, refusing prices outside no-arbitrage bounds. |
| `black76` | Price a European option on a futures or forward with Black-76, with delta, gamma and vega; also used for caps, floors and swaptions on a forward rate. |
| `bachelier` | Price a European option under the Bachelier normal model, which allows negative forwards (rates, spreads), with delta, gamma and vega. |
| `american_option` | Price an American option with a dividend yield (binomial Black-Scholes with Richardson extrapolation), with the European price and the early-exercise premium. |
| `digital_option` | Price a European cash-or-nothing or asset-or-nothing digital option under Black-Scholes-Merton, with delta. |
| `put_call_parity` | Check put-call parity for a European pair: the parity gap, the implied forward and the implied rate-minus-yield, to spot mispricing or stale quotes. |
| `option_strategy_payoff` | Evaluate a multi-leg options position at expiry (calls, puts, underlying): net premium, payoff and profit at chosen prices, breakevens, and maximum profit and loss. |
| `option_portfolio_greeks` | Aggregate Black-Scholes-Merton Greeks across many option positions on one underlying: net delta, gamma, vega, theta, rho and the dollar delta and gamma. |
| `volatility_conversions` | Convert volatility between periods and forms: annual to daily, weekly or monthly, the expected move over a horizon, and lognormal to approximate normal (basis point) volatility. |
| `vix_style_index` | Compute a VIX-style model-free implied volatility from option chains with the CBOE method: forward from put-call parity, out-of-the-money strips with the two-zero-bid cutoff, per-expiry variance, and interpolation to a constant maturity (30 days by default). |
| `risk_neutral_density` | Recover the market's risk-neutral distribution from call prices across strikes (Breeden-Litzenberger): density and cumulative probability at each strike, its mean, volatility, skewness and kurtosis, probabilities beyond chosen levels, and strikes where the density is negative (butterfly arbitrage). |

</details>

<details><summary><b>indicators</b>: Technical indicators (30)</summary>

| tool | what it does |
|---|---|
| `sma` | Compute the simple moving average of closing prices over a lookback. |
| `ema` | Compute the exponential moving average (seeded with the simple average, as TA-Lib does). |
| `wma` | Compute the linearly weighted moving average (latest price weighted most). |
| `dema` | Compute the double exponential moving average (2 EMA - EMA of EMA), which lags less than an EMA. |
| `tema` | Compute the triple exponential moving average (3 EMA - 3 EMA2 + EMA3). |
| `hull_moving_average` | Compute the Hull moving average, WMA(2 WMA(n/2) - WMA(n), sqrt n), a fast, smooth trend line. |
| `kama` | Compute Kaufman's adaptive moving average, which speeds up in trends and slows in noise (efficiency ratio, fast 2, slow 30). |
| `rsi` | Compute Wilder's relative strength index (0-100): above 70 often read as overbought, below 30 as oversold. |
| `macd` | Compute MACD (fast EMA - slow EMA), its signal line and histogram, as TA-Lib does. |
| `bollinger_bands` | Compute Bollinger Bands: a moving average with bands k population standard deviations above and below, plus %B and bandwidth. |
| `stochastic` | Compute the slow stochastic oscillator: %K (smoothed position of the close in the high-low range) and %D. |
| `williams_r` | Compute Williams %R (-100 to 0): where the close sits in the recent high-low range. |
| `cci` | Compute the commodity channel index: typical price's distance from its average in units of mean absolute deviation. |
| `atr` | Compute Wilder's average true range and its percent of price (NATR), the standard volatility measure for stops and sizing. |
| `adx` | Compute Wilder's ADX trend strength with +DI and -DI (TA-Lib's smoothing): ADX above 25 is usually read as trending. |
| `obv` | Compute on-balance volume, the running sum of volume signed by the close's direction. |
| `money_flow_index` | Compute the money flow index (volume-weighted RSI, 0-100) from typical price and volume. |
| `rate_of_change` | Compute rate of change (percent change over n bars) and momentum (price difference over n bars). |
| `trix` | Compute TRIX, the one-bar percent change of a triple-smoothed EMA, a filtered momentum oscillator. |
| `aroon` | Compute Aroon up and down (0-100: how recently the highest high and lowest low occurred) and the Aroon oscillator. |
| `chande_momentum` | Compute the Chande momentum oscillator (-100 to 100) with Wilder smoothing, as TA-Lib does. |
| `ultimate_oscillator` | Compute Williams' ultimate oscillator, blending buying pressure over three horizons (7, 14, 28 by default). |
| `accumulation_distribution` | Compute the Chaikin accumulation/distribution line and the Chaikin oscillator (fast EMA - slow EMA of the line). |
| `donchian_channels` | Compute Donchian channels: the highest high and lowest low over a lookback and their midpoint (breakout systems). |
| `keltner_channels` | Compute Keltner channels: an EMA of the close with bands a multiple of ATR above and below. |
| `vwap` | Compute the cumulative volume-weighted average price from typical price, or a rolling VWAP over a window. |
| `ichimoku_cloud` | Compute the Ichimoku lines: conversion (tenkan), base (kijun), leading spans A and B (shown at the bar they are computed, not shifted forward) and lagging span. |
| `rolling_zscore` | Compute each price's z-score against its rolling mean and sample standard deviation, the basic mean-reversion signal. |
| `stochastic_rsi` | Compute the stochastic RSI: where RSI sits in its own recent range (%K, unsmoothed by default as in TA-Lib) and its moving average %D. |
| `parabolic_sar` | Compute Wilder's parabolic stop-and-reverse trailing stop with its trend direction (acceleration 0.02 step, 0.2 max by default). |

</details>

<details><summary><b>econometrics</b>: Statistics and econometrics (27)</summary>

| tool | what it does |
|---|---|
| `linear_regression` | Fit ordinary least squares of y on several regressors with classical, heteroskedasticity-robust (HC1) or Newey-West HAC standard errors, R-squared, F-test and AIC. |
| `factor_regression` | Regress a strategy's excess returns on factor returns (e.g. Fama-French market, size, value, momentum) with Newey-West errors: annualized alpha, its t-stat, factor betas and R-squared. |
| `adf_test` | Test a price, spread or rate series for a unit root (non-stationarity) with the Augmented Dickey-Fuller test: statistic, MacKinnon p-value, critical values and the AIC-chosen lag. |
| `kpss_test` | Test the null that a series is level- or trend-stationary with the KPSS test (Hobijn lag rule), complementing ADF; p-values are table-interpolated within 0.01-0.10. |
| `variance_ratio_test` | Test the random-walk hypothesis on prices with the Lo-MacKinlay variance ratio at one or more horizons (overlapping, de-biased, heteroskedasticity-robust): above 1 means trending, below 1 mean-reverting. |
| `cointegration_test` | Test whether two or more price series are cointegrated (Engle-Granger): hedge ratios, ADF on the residual spread with MacKinnon p-value and critical values, and the spread's half-life. |
| `mean_reversion_fit` | Fit an AR(1) / Ornstein-Uhlenbeck model to a spread or price series: half-life, mean, speed of reversion, equilibrium volatility and the current z-score. |
| `garch_volatility` | Fit a GARCH(1,1) model with constant mean by maximum likelihood: omega, alpha, beta, persistence, long-run volatility, volatility half-life and the next-period volatility forecast. |
| `ewma_volatility` | Compute exponentially weighted volatility (RiskMetrics, lambda 0.94 by default): the current annualized estimate and optionally the full series. |
| `range_volatility` | Estimate volatility from open, high, low and close prices with close-to-close, Parkinson, Garman-Klass, Rogers-Satchell and Yang-Zhang estimators, annualized. |
| `probabilistic_sharpe_ratio` | Compute the probability that the true Sharpe ratio exceeds a benchmark given the track record's length, skewness and kurtosis (Bailey and López de Prado), and the minimum track record length needed. |
| `deflated_sharpe_ratio` | Deflate a backtest's Sharpe ratio for the number of strategies tried (Bailey and López de Prado 2014): the expected maximum Sharpe under the null and the probability the result beats it. |
| `pca_factors` | Run principal component analysis on asset returns (correlation or covariance): explained variance per component, cumulative share and each component's loadings. |
| `rolling_beta` | Compute a rolling-window beta (and correlation) of returns against a benchmark: latest, average, minimum and maximum, optionally the full series. |
| `granger_causality` | Test whether past values of x help predict y beyond y's own past (Granger causality), with the F-test at each lag up to a maximum. |
| `arch_effects_test` | Test demeaned returns for volatility clustering with Engle's ARCH Lagrange multiplier test: LM statistic, chi-squared p-value, and the F version. |
| `mean_return_test` | Test whether a strategy's mean return differs from zero (or a target) with a one-sample t-test and a Newey-West t-statistic robust to autocorrelation. |
| `compare_sharpe_ratios` | Test whether two strategies' Sharpe ratios differ (Jobson-Korkie with Memmel's correction) using their returns over the same periods. |
| `welch_t_test` | Test whether two samples (e.g. returns in two regimes, before and after a change) have different means, without assuming equal variances (Welch). |
| `markov_regime_switching` | Fit a Hamilton Markov-switching model with a mean and volatility per regime (2 or 3 regimes) by maximum likelihood: regime means and volatilities, transition probabilities, expected durations, the current regime probabilities and how much time was spent in each. |
| `johansen_cointegration` | Test how many cointegrating relationships tie several price series together (Johansen trace and maximum-eigenvalue tests with Osterwald-Lenum critical values), with the rank chosen at 5% and the normalized cointegrating vectors. |
| `recursive_stability_test` | Check whether a regression's coefficients stayed stable over time: recursive least squares coefficient paths, and the CUSUM and CUSUM-of-squares tests of Brown, Durbin and Evans with 5% bounds and the first period each one crosses. |
| `chow_break_test` | Test for a structural break in a regression at a known period (Chow F-test), or scan every candidate break inside a trimmed range for the largest F statistic and where it falls. |
| `har_rv_forecast` | Fit Corsi's heterogeneous autoregressive (HAR) model of realized variance on its daily, weekly and monthly averages, with Newey-West errors, and forecast variance and volatility over the next horizon. |
| `realized_volatility_measures` | From intraday returns per day, compute realized variance, bipower variation, the jump component and the Barndorff-Nielsen-Shephard jump test (tripower quarticity), realized semivariances, realized skewness and kurtosis, and the daily series for HAR forecasts. |
| `dependence_measures` | Measure how two series move together: Pearson, Spearman and Kendall correlations with p-values, distance correlation (catches nonlinear dependence), and empirical lower and upper tail dependence (do they crash together?). |
| `bootstrap_confidence_interval` | Put a confidence interval on a performance statistic (Sharpe, Sortino, CAGR, volatility, max drawdown, Calmar, mean) with the stationary block bootstrap, which keeps autocorrelation and volatility clustering; also gives the bootstrap standard error and the share of resamples at or below zero. |

</details>

<details><summary><b>exotics</b>: Exotic options and volatility models (9)</summary>

| tool | what it does |
|---|---|
| `barrier_option` | Price a continuously monitored single-barrier option (down/up, in/out, call/put, with rebate) in closed form (Reiner-Rubinstein), with the vanilla price and the barrier discount. |
| `asian_option_geometric` | Price a continuously averaged geometric-average-price Asian option in closed form (Kemna-Vorst); a lower bound and control variate for the arithmetic Asian. |
| `heston_option` | Price a European option under the Heston stochastic-volatility model by Fourier integration of its characteristic function, with delta, in-the-money probability and the Feller condition. |
| `sabr_volatility` | Compute the Black implied volatility of a strike under the SABR model (Hagan et al. 2002) from alpha, beta, nu and rho, optionally across several strikes for a smile. |
| `spread_option` | Price a European option on the spread between two futures (F1 - F2 - K) with Kirk's approximation, as used for crack and spark spreads. |
| `exchange_option` | Price the option to exchange one asset for another, max(Q1 S1 - Q2 S2, 0), in closed form (Margrabe), with dividend yields on both. |
| `lookback_option` | Price a continuously monitored floating-strike lookback option (Goldman-Sosin-Gatto): a call pays the final price minus the minimum, a put the maximum minus the final price. |
| `chooser_option` | Price a simple chooser option, which lets the holder decide at a choice date whether it is a call or a put with the same strike and expiry (Rubinstein). |
| `jump_diffusion_option` | Price a European option under Merton's jump-diffusion model (lognormal jumps) as a Poisson-weighted sum of Black-Scholes prices. |

</details>

<details><summary><b>rates</b>: Fixed income and rates (15)</summary>

| tool | what it does |
|---|---|
| `bond_price` | Price a fixed-rate bond from its yield on real dates and a day count: clean and dirty price, accrued interest, Macaulay and modified duration, convexity and DV01. |
| `bond_yield` | Solve a fixed-rate bond's yield to maturity from its clean price, with duration, convexity and DV01 at that yield. |
| `zero_coupon_bond` | Price a zero-coupon bond from its yield or solve the yield from its price, under annual, periodic or continuous compounding, with duration and convexity. |
| `bootstrap_zero_curve` | Bootstrap discount factors, zero rates (continuous and periodic) and period forward rates from par yields, interpolating par yields linearly onto the coupon grid. |
| `forward_rate` | Compute the forward rate between two maturities implied by their zero rates, under continuous, periodic or simple compounding, with the forward discount factor. |
| `nelson_siegel_fit` | Fit a Nelson-Siegel curve (level, slope, curvature, decay tau) to observed yields by least squares, with fitted yields and RMSE; tau is searched when not given. |
| `interest_rate_swap` | Value a spot-starting fixed-for-floating swap on a zero curve (single curve): par swap rate, value to the fixed payer, fixed-leg annuity and DV01s. |
| `forward_rate_agreement` | Value a forward rate agreement on a zero curve: the simple forward rate for the period and the value to the party that pays the fixed rate. |
| `z_spread` | Solve a fixed-rate bond's z-spread: the constant spread over a continuously compounded zero curve that reprices its cash flows to the market dirty price. |
| `credit_hazard_rate` | Convert a credit spread and recovery rate into a constant hazard rate (credit triangle), survival and default probabilities over a horizon, and the reverse. |
| `short_rate_bond_price` | Price a zero-coupon bond and its yield under the Vasicek or Cox-Ingersoll-Ross short-rate model in closed form. |
| `treasury_bill_yields` | Convert a T-bill's price or bank discount rate into the discount yield, bond-equivalent (investment) yield, money-market yield and effective annual yield. |
| `key_rate_durations` | Measure a fixed-rate bond's sensitivity to each pillar of a zero curve: bump one pillar by 1 bp (triangular bump, linear in between) and reprice, giving key rate DV01s and durations that sum to the parallel figure. |
| `breakeven_inflation` | Compute breakeven inflation from a nominal and a real (inflation-linked) yield of the same maturity, exactly (Fisher) and approximately, and the real yield implied by an inflation view. |
| `merton_credit_risk` | Back out a firm's asset value and asset volatility from its equity value and equity volatility with Merton's model (equity as a call on assets), then the distance to default, default probability, the implied credit spread and the value of the debt. |

</details>

<details><summary><b>risk</b>: Portfolio risk and stress (7)</summary>

| tool | what it does |
|---|---|
| `portfolio_var` | Compute a positions portfolio's historical and parametric (normal) value at risk and expected shortfall from asset return history, with each position's contribution and the diversification benefit. |
| `stress_test` | Apply named scenarios (a return shock per position, or a market shock passed through each position's beta) to a portfolio and report the P&L of each scenario and the worst position. |
| `option_scenario_grid` | Revalue a book of European options and stock under a grid of spot moves and volatility shifts (full Black-Scholes revaluation), with P&L per cell and the book's current Greeks. |
| `exposure_and_hedge` | Summarize a long/short book's gross, net and beta-adjusted exposure and size an index hedge (futures contracts or ETF shares) that neutralizes the beta. |
| `concentration_metrics` | Measure how concentrated a portfolio is: Herfindahl index, effective number of positions, largest and top-k shares, and the Gini coefficient of weights. |
| `liquidation_horizon` | Estimate how many days each position takes to exit at a maximum share of average daily volume, and how much of the book can be liquidated within 1, 5 and 20 days. |
| `extreme_value_tail` | Model the loss tail with extreme value theory: fit a generalized Pareto distribution to losses beyond a high threshold (peaks over threshold) and estimate value at risk and expected shortfall far into the tail, with the Hill tail index. |

</details>

<details><summary><b>returns</b>: Returns transforms and attribution (4)</summary>

| tool | what it does |
|---|---|
| `convert_returns` | Convert between prices, simple returns and log returns, or rebase a price series to start at 100; returns the converted series. |
| `resample_returns` | Compound periodic returns into calendar weeks (ISO), months, quarters or years using their dates. |
| `monthly_returns_table` | Build the year-by-month return table from periodic returns and dates, with each year's compounded total, the best and worst months and the share of positive months. |
| `brinson_attribution` | Attribute active return to allocation, selection and interaction effects by segment (Brinson-Fachler) from portfolio and benchmark weights and returns. |

</details>

<details><summary><b>portfolio</b>: Portfolio construction and risk (15)</summary>

| tool | what it does |
|---|---|
| `portfolio_risk` | Decompose a portfolio's volatility into each asset's risk contribution, with marginal risk, diversification ratio, effective number of assets, parametric VaR and ex-ante tracking error to a benchmark. |
| `min_variance_portfolio` | Find the fully invested minimum-variance portfolio, long-only with an optional weight cap (exact active-set solution) or unconstrained (closed form). |
| `max_sharpe_portfolio` | Find the portfolio with the highest Sharpe ratio, long-only (exact) or unconstrained (closed form tangency), with its expected return, volatility and Sharpe. |
| `mean_variance_portfolio` | Find the minimum-variance portfolio that reaches a target expected return, or the utility-maximizing portfolio for a risk aversion, long-only or unconstrained. |
| `risk_parity_portfolio` | Find long-only weights where every asset contributes equally (or by a given budget) to portfolio volatility, solved by Newton's method. |
| `inverse_volatility_weights` | Weight assets in proportion to the inverse of their volatility (or variance), the simple risk-balancing heuristic. |
| `hierarchical_risk_parity` | Allocate with López de Prado's hierarchical risk parity: single-linkage clustering on correlation distance, quasi-diagonal ordering and recursive bisection. |
| `efficient_frontier` | Trace the efficient frontier: minimum volatility at evenly spaced target returns from the minimum-variance portfolio to the highest-return asset, with weights. |
| `black_litterman` | Blend market-implied equilibrium returns with your views (absolute or relative, with confidence) into Black-Litterman posterior returns and the unconstrained optimal weights. |
| `covariance_shrinkage` | Estimate a well-conditioned covariance matrix by Ledoit-Wolf shrinkage toward a scaled identity, with the shrinkage intensity and condition numbers before and after. |
| `correlation_matrix` | Compute Pearson or Spearman rank correlations between assets, with the average pairwise correlation and the largest eigenvalue's share (how much one factor drives everything). |
| `rebalance_trades` | Turn current holdings and target weights into the share trades that rebalance the portfolio, with turnover, optional no-trade bands, and cash left over. |
| `kelly_portfolio` | Compute growth-optimal (Kelly) weights across assets, inverse covariance times excess returns, with half-Kelly and the implied leverage and growth rate. |
| `max_diversification_portfolio` | Find the long-only portfolio with the highest diversification ratio (weighted average volatility over portfolio volatility), Choueifaty and Coignard's most-diversified portfolio. |
| `index_tracking_portfolio` | Find long-only weights in a subset of assets that minimize ex-ante tracking error to a benchmark's weights, with an optional per-asset cap. |

</details>

<details><summary><b>execution</b>: Execution and microstructure (7)</summary>

| tool | what it does |
|---|---|
| `almgren_chriss_schedule` | Compute the Almgren-Chriss optimal liquidation schedule for a block: holdings and trades per period, expected impact cost and its standard deviation for a given risk aversion. |
| `market_impact_estimate` | Estimate the cost of an order with the square-root impact law (cost = Y x volatility x sqrt(order / daily volume)) plus half the spread, in basis points and currency. |
| `implementation_shortfall` | Measure an executed order's implementation shortfall against the decision price, split into delay, execution (impact), opportunity cost of unfilled shares and fees. |
| `execution_schedule` | Split an order across time buckets evenly (TWAP) or by an expected volume profile (VWAP), capped at a maximum participation rate, with what cannot be done within the horizon. |
| `spread_estimators` | Estimate the effective bid-ask spread from trade prices alone (Roll 1984) and from daily highs and lows (Corwin-Schultz 2012) when quotes are not available. |
| `liquidity_measures` | Measure price impact per unit of trading: Amihud illiquidity (\|return\| per currency traded) and Kyle's lambda (price change per signed volume, by regression). |
| `order_book_analysis` | Analyze an order book snapshot: mid, spread, microprice, depth imbalance, and the average fill price and slippage of a market order of a given size walking the book. |

</details>

<details><summary><b>sizing</b>: Position sizing and trade risk (7)</summary>

| tool | what it does |
|---|---|
| `position_size_from_stop` | Size a trade so that hitting the stop loses a fixed fraction of equity: shares, notional, capital at risk and leverage, optionally capped by a maximum position weight. |
| `volatility_target_size` | Scale a position so its expected volatility matches a target: the weight (leverage) from the asset's volatility, shares for a given equity, optionally capped. |
| `optimal_f` | Find the fraction f of the largest loss to risk per trade that maximizes terminal wealth over a list of trade results (Vince's optimal f), with the geometric mean and the f-based position size. |
| `trade_expectancy` | Compute a trading rule's expectancy per trade after costs, the break-even win rate for its payoff, and the payoff needed at its win rate. |
| `drawdown_probability` | Estimate the probability that a strategy with a given return and volatility ever falls a given fraction below its starting equity (drifted Brownian motion, continuous), and within a horizon. |
| `leverage_and_margin` | Compute leverage, initial and maintenance margin, free margin, and the adverse price move that triggers a margin call for a leveraged position. |
| `var_position_limit` | Find the largest position whose one-day (or n-day) parametric value at risk stays within a budget, given the asset's volatility. |

</details>

<details><summary><b>crypto_fx</b>: Crypto and FX (9)</summary>

| tool | what it does |
|---|---|
| `funding_rate_carry` | Annualize perpetual-futures funding rates (simple APR and compounded APY) and compute the funding a position pays or earns over a holding period; accepts one rate or a history. |
| `futures_basis` | Compute a dated future's basis to spot, its annualized carry (simple and compounded) and the implied financing rate, for cash-and-carry trades. |
| `liquidation_price` | Estimate a leveraged position's liquidation price under isolated margin: initial margin = 1/leverage, liquidated when equity falls to the maintenance rate (exchange formulas add fees and tiers). |
| `fx_forward` | Price an FX forward from spot and the two currencies' money-market rates (covered interest parity, ACT/360 or ACT/365), with forward points in pips, or back out the implied rate from a quoted forward. |
| `fx_cross_rate` | Derive a cross rate's bid and ask from two quotes against a common currency (e.g. EURJPY from EURUSD and USDJPY), handling which side each leg is quoted on. |
| `triangular_arbitrage` | Check three currency (or crypto) quotes for triangular arbitrage after spreads and fees: the return of each direction around the triangle. |
| `pip_value` | Compute the value of one pip for a lot size in the account currency, and the lot size that risks a given amount over a stop distance in pips. |
| `carry_trade_return` | Decompose a carry trade's return into the interest differential and the spot move, and find the break-even depreciation of the high-yield currency. |
| `impermanent_loss` | Compute impermanent (divergence) loss of a liquidity position versus holding, for a constant-product pool or a concentrated range (Uniswap v3 style), given the price change. |

</details>

<details><summary><b>strategies</b>: Strategy backtests (20)</summary>

| tool | what it does |
|---|---|
| `backtest_ma_crossover` | Backtest a fast/slow moving-average crossover on your prices with costs and no lookahead: CAGR, Sharpe, drawdown, turnover, cost drag and buy-and-hold for comparison. |
| `backtest_time_series_momentum` | Backtest time-series (absolute) momentum: hold the asset when its trailing return is positive, optionally volatility-targeted, with costs and no lookahead. |
| `backtest_breakout` | Backtest a Donchian channel breakout (turtle-style entries on new highs, exits on shorter lows) with costs and no lookahead. |
| `backtest_zscore_reversion` | Backtest mean reversion on a rolling z-score of price: buy stretched lows (and short stretched highs), exit near the mean, with costs. |
| `backtest_rsi_reversion` | Backtest a classic RSI oversold strategy: buy when RSI is below a threshold, sell when it recovers, with costs and no lookahead. |
| `backtest_volatility_target` | Backtest holding an asset scaled to a constant volatility target with trailing realized volatility, leverage cap and rebalance frequency. |
| `backtest_cross_sectional_momentum` | Backtest cross-sectional (relative) momentum across a universe: periodically hold the top assets by trailing return (skipping the latest month), optionally short the bottom. |
| `backtest_dual_momentum` | Backtest dual momentum (Antonacci): hold the best-performing risky asset when it beats cash or a safe asset, otherwise move to safety. |
| `backtest_risk_parity_rebalance` | Backtest a multi-asset inverse-volatility (naive risk parity) portfolio rebalanced periodically, optionally scaled to a volatility target. |
| `backtest_trend_ensemble` | Backtest a multi-horizon trend signal: the average of time-series momentum signs over several lookbacks, optionally volatility-targeted, with costs and no lookahead. |
| `backtest_macd_trend` | Backtest the MACD line against its signal line (long above, flat or short below) with costs and no lookahead. |
| `backtest_equal_weight_rebalance` | Backtest equal weights across a universe rebalanced on a fixed schedule; the 1/N benchmark that optimized portfolios must beat. |
| `backtest_min_variance_rebalance` | Backtest the long-only minimum-variance portfolio re-estimated from trailing sample covariance on a fixed schedule, with costs. |
| `backtest_low_volatility` | Backtest holding the lowest-volatility fraction of a universe, re-ranked on a schedule, with costs and no lookahead. |
| `backtest_short_term_reversal` | Backtest buying the recent biggest losers in a universe (and optionally shorting the winners), re-ranked on a schedule, with costs. |
| `backtest_trend_filter_allocation` | Backtest tactical asset allocation where each asset is held only while above its moving average (Faber-style), equal or inverse-volatility weighted. |
| `backtest_high_proximity` | Backtest holding the assets trading closest to their trailing high (George-Hwang 52-week-high momentum), re-ranked on a schedule. |
| `backtest_pairs_trading` | Backtest a pairs trade on two price series: rolling hedge ratio, z-score of the residual spread, market-neutral entries and exits, with costs. |
| `backtest_weights` | Backtest any strategy from your own target weights per period (decided at each close, applied to the next period) with the same costed, drift-aware engine; null rows mean hold. |
| `strategy_sweep` | Run one strategy recipe over a parameter grid (up to 400 variants), rank the variants by Sharpe, and deflate the best one for the number tried, so tuning cannot pass off luck as skill. |

</details>

<details><summary><b>sleeves</b>: Strategy sleeve library (8)</summary>

| tool | what it does |
|---|---|
| `list_sleeves` | Browse the library of 399 pre-defined strategy sleeves (18 families: trend, momentum, reversion, volatility, allocation, pairs). Each is a fixed rule with a spec hash; filter by family, data shape or words. |
| `describe_sleeve` | One sleeve's exact rule, parameters, warm-up, rationale, published references, known risks and spec SHA-256. |
| `run_sleeve` | Backtest one library sleeve on your prices with costs and no lookahead: CAGR, Sharpe, drawdown, turnover, cost drag, and the target weights as of the latest close (ready for a paper rebalance). |
| `sleeve_tournament` | Run all library sleeves that fit your prices (up to 399) on a common window and rank them, then correct for the search: deflated Sharpe (raw and effective number of trials), White's Reality Check, re-studentized Hansen SPA and Romano-Wolf StepM against a benchmark, and the probability of backtest overfitting (CSCV). |
| `sleeve_walk_forward` | Test the selection process itself: at each refit pick the top sleeves by trailing Sharpe, hold them for the next window, repeat. Compares the out-of-sample result with what the picks showed in sample, with holding every sleeve, and with the benchmark. |
| `combine_sleeves` | Blend chosen sleeves (equal or trailing inverse-volatility weights, no lookahead) into one book: its statistics, each sleeve's, their correlations, the diversification ratio, and the book's combined asset target weights as of the latest close. |
| `sleeve_clusters` | Group the sleeves that ran on your prices by return correlation (average linkage on sqrt((1 - rho) / 2)), to see how many genuinely different bets the library makes on this data and the best sleeve of each group. |
| `sleeve_regime_map` | Score every sleeve that fits your prices in each regime of the benchmark: calm, normal and turbulent volatility (terciles of trailing volatility) and up or down trend (above or below its moving average). Finds sleeves that held up in every regime. |

</details>

<details><summary><b>data_checks</b>: Data quality checks (10)</summary>

| tool | what it does |
|---|---|
| `check_price_series` | Check a price series for errors before using it: non-positive or missing values, unadjusted splits, outlier returns, stale runs, duplicate, unsorted or gapped timestamps. |
| `check_ohlc_bars` | Check open-high-low-close-volume bars for impossible values: high below open/close, low above them, negative volume, zero-range bars, and extreme overnight gaps. |
| `check_option_chain` | Check one expiry of an option chain: crossed or negative quotes, prices outside no-arbitrage bounds, non-monotone or non-convex prices across strikes, put-call parity breaks, and quotes with no implied volatility. |
| `check_yield_curve` | Check a zero curve for problems: unsorted tenors, discount factors that rise with maturity, negative or jumpy implied forward rates, and kinks far from neighbouring points. |
| `check_funding_rates` | Check a perpetual-futures funding history: irregular intervals, rates beyond the venue's cap, outliers, and long one-sided runs, with the annualized range. |
| `check_cross_venue_prices` | Compare the same instrument's prices across venues at the same times: deviation of each venue from the cross-venue median, venues that stop updating, and the worst divergences. |
| `check_timestamps` | Check a column of timestamps: unparseable values, duplicates, out-of-order rows, mixed time-zone offsets, dates in the future and weekend entries, with the spacing distribution. |
| `check_returns_series` | Check a returns series for the usual mistakes: percents instead of fractions, impossible simple returns below -100%, constant or zero-filled stretches, extreme values and smoothing (high lag-1 autocorrelation). |
| `check_fundamentals` | Check reported fundamentals against accounting identities: assets = liabilities + equity, current within total, gross profit = revenue - cost of revenue, cash-flow sections summing to the change in cash, and EPS x shares close to net income. |
| `check_corporate_actions` | Detect splits and dividends by comparing raw and adjusted close series: each change in the adjustment factor, classified as a split (ratio) or a dividend (percent), with mismatches flagged. |

</details>

<details><summary><b>labeling</b>: Data annotation and ML labels (7)</summary>

| tool | what it does |
|---|---|
| `cusum_filter_events` | Sample the periods worth labeling with the symmetric CUSUM filter on log prices: an event fires when the cumulative up or down move since the last event exceeds a threshold (fixed, or a multiple of recent volatility), so labels concentrate on meaningful moves instead of every bar. |
| `triple_barrier_labels` | Label events with the triple-barrier method: a profit-take and a stop-loss set as multiples of recent volatility, and a time limit; each label is which barrier was touched first (+1, -1, or the sign at the time limit), with the touch period so overlapping labels can be purged. With a side per period it produces meta-labels (1 = the bet paid). |
| `fixed_horizon_labels` | Label each period by its forward return over a fixed horizon: +1 above a threshold, -1 below minus the threshold, 0 between; the threshold can be fixed or scaled by recent volatility. Includes the class balance and the forward span each label covers. |
| `trend_scanning_labels` | Label each period by the strongest forward trend: regress prices on time over every forward window in a range, keep the window with the largest \|t-statistic\| of the slope, and label by its sign with the t-statistic as confidence (Lopez de Prado's trend scanning). |
| `sample_weights` | Weight labels whose spans overlap so a model does not over-count the same information: concurrency per period, each label's average uniqueness, return-attribution weights, and optional time decay (Lopez de Prado, chapter 4). |
| `purged_cv_splits` | Build k-fold cross-validation splits for labels that span time without leakage: training labels whose spans overlap a test fold are purged, and labels starting just after a test fold are embargoed. Reports what each fold removed, and optionally the indices. |
| `annotate_price_series` | Annotate every period of a price series and list the notable ones: robust-z outlier moves, stale (repeated) prices, gaps (jumps across a period), drawdown episodes with peak, trough and recovery, new all-time highs, and the causal volatility regime (calm, normal, turbulent). Gives per-period tags for joining onto your own data. |

</details>

<details><summary><b>tvm</b>: Time value and corporate finance (15)</summary>

| tool | what it does |
|---|---|
| `net_present_value` | Compute the NPV of periodic cash flows (first at time 0), with the profitability index, discounted payback and the IRR when one exists. |
| `internal_rate_of_return` | Solve the IRR of periodic cash flows, warning when sign changes allow several IRRs, with the NPV profile at a few rates. |
| `modified_irr` | Compute the MIRR: negative flows discounted at a finance rate, positive flows compounded at a reinvestment rate, one unambiguous return. |
| `xnpv_xirr` | Compute NPV and IRR for cash flows on irregular dates (ACT/365 from the first date), as spreadsheet XNPV and XIRR do. |
| `time_value_solver` | Solve for any one of rate, number of periods, payment, present value or future value given the other four (loans, savings, annuities), payments at period end or start. |
| `amortization_schedule` | Build a level-payment loan schedule: payment, interest and principal per period, remaining balance, and total interest. |
| `rate_conversion` | Convert a nominal rate between compounding frequencies, to effective annual and continuous rates, and remove inflation (exact Fisher real rate). |
| `growing_annuity` | Value a growing annuity (present and future value) or a growing perpetuity whose first payment arrives in one period. |
| `payback_period` | Compute simple and discounted payback periods, interpolated within the period that recovers the investment. |
| `equivalent_annual_annuity` | Convert a project's NPV into an equivalent level annual amount, to compare projects with different lives. |
| `wacc` | Compute WACC from market values and costs of equity, debt and preferred, with after-tax cost of debt; cost of equity can come from CAPM. |
| `levered_beta` | Unlever an observed equity beta to an asset beta and relever it at a target debt-to-equity ratio (Hamada), for comparable-company cost of equity. |
| `break_even` | Compute break-even units and revenue, contribution margin, margin of safety and degree of operating leverage from price, variable cost and fixed costs. |
| `loan_true_cost` | Find a loan's true annual cost when upfront fees reduce the cash received: the payment, the nominal APR and effective annual rate implied by the fees, and the total cost. |
| `retirement_projection` | Project a savings balance with yearly contributions growing with salary, then sustainable inflation-adjusted withdrawals; reports the balance at retirement, how long withdrawals last and the safe level spending. |

</details>

<details><summary><b>valuation</b>: Valuation and fundamental scores (10)</summary>

| tool | what it does |
|---|---|
| `dcf_valuation` | Value a business from forecast free cash flows with a Gordon-growth or exit-multiple terminal value: enterprise and equity value, per-share value and a discount-rate by growth sensitivity grid. |
| `reverse_dcf` | Solve the free-cash-flow growth rate the current share price implies over a forecast horizon, given a discount rate and terminal growth. |
| `dividend_discount_model` | Value a share with the Gordon growth, two-stage or H-model dividend discount model, or back out the required return the price implies (Gordon). |
| `residual_income_valuation` | Value equity as book value plus discounted residual income (earnings above the cost of equity on opening book), with clean-surplus book values and a terminal value. |
| `enterprise_value_multiples` | Build enterprise value from market cap, debt, preferred, minority interest and cash, then EV/EBITDA, EV/EBIT, EV/sales, P/E, P/B, earnings yield and FCF yield. |
| `altman_z_score` | Compute the Altman Z-score bankruptcy predictor (public manufacturing, private-firm Z', or non-manufacturing Z'') with its five ratios and zone. |
| `piotroski_f_score` | Score a company's financial strength 0-9 from two years of statements: profitability, leverage and liquidity, and operating efficiency signals, each shown. |
| `beneish_m_score` | Compute the eight-variable Beneish M-score earnings-manipulation screen from two years of statements, with every index; above -1.78 flags likely manipulation. |
| `dupont_analysis` | Decompose return on equity into margin, asset turnover and leverage (three-step), and into tax burden, interest burden, operating margin, turnover and leverage (five-step). |
| `graham_valuation` | Compute Benjamin Graham's number (sqrt 22.5 x EPS x book value per share) and his revised growth formula value, with margin of safety against a price. |

</details>

## What a result does not establish

A number from a correct formula on bad inputs is still wrong. Run the `data_checks` tools on
unfamiliar data first. A backtest of one parameter set says little if many were tried: count them,
and use `strategy_sweep`, `sleeve_tournament` or `deflated_sharpe_ratio`. A sleeve that survives
every correction on one history is still a backtest: forward results are the evidence. Closed-form models (Black-Scholes, Heston,
SABR, Kirk) carry their assumptions; the result names the model.

## Development

```bash
npm ci && npm test
```

Reference fixtures are regenerated by the Python scripts in `scripts/reference/` (each script's
docstring gives its exact `uv run` command). The tests never call Python; they compare against the
committed fixtures.

## Related

- [canli-validation-mcp](https://www.npmjs.com/package/canli-validation-mcp): backtest overfitting
  tests (deflated Sharpe, CSCV/PBO, White's Reality Check, Hansen's SPA) with a trial ledger.
- [canli-backtest-mcp](https://www.npmjs.com/package/canli-backtest-mcp): point-in-time factor
  backtests from SEC filings.

MIT licence.
