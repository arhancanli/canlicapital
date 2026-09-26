# Luck-equivalent trials: how many skill-less strategies it takes to reach a Sharpe by luck

**Short title:** Luck-equivalent trials
**Author:** Arhan Canli
**Declared:** 2026-09-26, with its calibration study published beside it.

A backtest's Sharpe ratio means little until you know how many strategies were tried to find it.
Luck-equivalent trials answers the reviewer's question in the unit a research log records: how many
independent, skill-less strategies would a search have had to try for its best to reach this Sharpe
by luck alone?

## The statistic

Under the null of no skill and normal returns, a Sharpe ratio's t-statistic (the per-period Sharpe
times the square root of the number of observations) follows a Student t distribution with one
fewer degree of freedom than there are observations. One skill-less trial therefore reaches the
observed Sharpe with a known probability p. The best of N independent skill-less trials reaches it
with probability 1 - (1 - p)^N, so the N at which that probability equals a chosen level q is
ln(1 - q) / ln(1 - p). The statistic reports that N at even odds and at the five percent level, the
N whose expected best (the deflated Sharpe ratio's benchmark) matches the observation, and, given a
trial count, the chance that the best of that many reached the Sharpe by luck.

Each piece is a known result. What is new is the statistic, stated in trials, with its calibration
measured and its failure cases published.

## Calibration

Rejection rate at the 5.0% level when every strategy is skill-less, from
[`/glassbox/research/luck-trials-size-study.json`](/glassbox/research/luck-trials-size-study.json)
(searches of 20 strategies over 252 periods, 1000 searches per
cell, fixed seeds). A calibrated statistic rejects at the level.

| Returns | Student t null (shipped) | Non-normal standard error (deflated Sharpe convention) | Bootstrap of the best trial's returns |
|---|---|---|---|
| normal | 0.035 | 0.036 | 0.038 |
| Fat tails (Student t) | 0.043 | 0.060 | 0.060 |
| skew plus 1 3 | 0.018 | 0.057 | 0.041 |
| skew minus 1 3 | 0.108 | 0.049 | 0.064 |
| skew plus 3 7 | 0.004 | 0.088 | 0.046 |
| skew minus 3 7 | 0.208 | 0.068 | 0.091 |

No method is calibrated for every return shape. The Student t null holds for normal and fat-tailed
returns but is too generous to negatively skewed strategies; the non-normal standard error fixes
negative skew and fails under fat tails; a bootstrap of the best trial's returns is closest overall
but inherits the selection that made that trial the best.

## Autocorrelation

On the Null Zoo ([`/research/null-zoo-v0`](/research/null-zoo-v0)), autocorrelated returns
make a skill-less search look skilled: at the same level the statistic rejected 0.200
of searches. Correcting the Sharpe for the returns' own autocorrelation as Lo (2002) does brings it
to 0.059, and costs nothing where there is no autocorrelation (0.059
before, 0.061 after). The API and the MCP tool accept the autocorrelation.

## Use it

`POST /api/v1/validate/luck-trials` with a free key, or the `validate_luck_trials` tool in the
`canli-validation-mcp` server on npm. Every result is stored as a signed receipt.

## Evidence boundary

The statistic counts independent trials; correlated trials count as fewer, and the caller must
estimate how many. It assumes no skill under the null and says nothing about whether a strategy
will make money. Its calibration is measured on the return shapes above and no others.
