# Do factor-timing claims beat a placebo?

> Four published factor-timing claims, retested with placebos that keep a market's volatility clustering.
> Volatility-managed factors kept their in-sample verdict under every block length. Industry momentum kept it
> only with the shortest blocks, and cross-sectional factor momentum lost it. No verdict after the papers'
> samples changed.

**Short title:** Factor timing against a placebo

**Published 2026-11-08. The design, the decision rules and the predictions were registered and pushed before the
run, in [`placebo-v2r2-prereg.json`](/glassbox/research/placebo-v2r2-prereg.json); every verdict below is read from
[`placebo-v2r2-evaluation.json`](/glassbox/research/placebo-v2r2-evaluation.json). The first round is
[`placebo-v2-evaluation.json`](/glassbox/research/placebo-v2-evaluation.json).**

## The question

A factor-timing paper tests a rule, often one of several it could have chosen, on decades of factor returns. A
t-test on the winner ignores that search. A placebo test does not: it reruns the whole search, every rule in the
grid, on the same returns put in a random order, many times, and asks how often the real winner's result is beaten
by chance. This study does that for four claims:

- **Time-series factor momentum** (Ehsani and Linnainmaa; Gupta and Kelly): a factor that rose over the past months
  keeps rising.
- **Cross-sectional factor momentum** (Ehsani and Linnainmaa; Arnott, Kalesnik and Linnainmaa): the factors that did
  best recently beat the ones that did worst.
- **Volatility-managed factors** (Moreira and Muir): scaling a factor down when its recent volatility is high raises
  its Sharpe ratio.
- **Industry momentum** (Moskowitz and Grinblatt): the industries that rose most keep rising.

Each claim is tested on the papers' own sample and on the months after it, on Kenneth French's factors and
industries. The wording rule was set beforehand: we do not say a published paper is wrong; we report which claims
keep a p-value below 5% once a plausible search is counted.

## What the second round changed

A plain shuffle breaks every link between one month and the next, including the clustering of volatility that real
returns have, so a rule that only exploits clustering can look like timing skill. The second round shuffles whole
blocks of 3, 6 or 12 months instead, which keeps short-range clustering, with 999 placebos per test. It also runs
White's Reality Check, Hansen's SPA test and Romano and Wolf's StepM on the same grids, measures how much power each
method has against timing effects of stated sizes, and repeats factor momentum on the Open Source Asset Pricing
long-short portfolios rather than the handful of French-library factors.

## What it found

| Claim | First round, in sample | Blocks of 3 months | Blocks of 6 | Blocks of 12 |
|---|---|---|---|---|
| Volatility-managed factors | below 5% | below | below | below |
| Industry momentum | below 5% | below | not below | not below |
| Cross-sectional factor momentum | below 5% | not below | not below | not below |
| Time-series factor momentum | not below | not below | not below | not below |

- **Volatility-managed factors** are the one in-sample result that survives at every block length.
- **Industry momentum** survives only with the shortest blocks, and the evaluation marks that verdict as showing
  time-series structure rather than the claim itself.
- **Cross-sectional factor momentum** loses its first-round verdict at every block length. On the Open Source
  Asset Pricing factors neither factor-momentum claim beats its placebos in sample.
- **After the papers' samples**, no claim's verdict changed: none was below 5% in the first round, and none is now.

## What did not work

The registration predicted that block permutation would bring the test's false-positive rate back to its nominal
level in simulated markets with clustered volatility. It largely did not, and the evaluation file reports the rates
cell by cell. The power runs also show that the tests after the papers' samples have little power against timing
effects of the sizes tested, so a claim that is "not below" there is weak evidence against it, not evidence that
it is false. One change was made during the run and is dated in the file: four of the 30 industry portfolios are
identical to their 12-industry counterparts, so the simulator copies each twin instead of drawing it.

## Use it

The placebo test is `placebo_test` in [canli-mcp](/mcp-servers), on your machine, with no account and no key. The
first round's method and its size study are in [Would your backtest beat a placebo?](/notes/would-it-beat-a-placebo).
