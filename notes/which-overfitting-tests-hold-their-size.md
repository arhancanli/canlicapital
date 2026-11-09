# Which backtest overfitting tests can you trust?

> A test that promises 5% false alarms should give about 5% on markets with nothing to find. On 20 strategies
> over 504 days, in nine kinds of simulated market, White's Reality Check stayed between 4.5% and 6.4%.
> Hansen's SPA test, the usual upgrade, reached 12.6% on negatively skewed returns, and Romano and Wolf's StepM
> matched it. The deflated Sharpe ratio at its usual 0.95 mark almost never raised one, and caught a real edge
> 9.4% of the time.

**Short title:** Which overfitting tests hold their size

**Published 2026-11-08. The design, the pass mark and the rule for choosing a test were registered before each
run, in [`null-zoo-v1-prereg.json`](/glassbox/research/null-zoo-v1-prereg.json) and
[`null-zoo-v1b-prereg.json`](/glassbox/research/null-zoo-v1b-prereg.json). The table below is read from the
confirmation run, [`null-zoo-v1b-evaluation.json`](/glassbox/research/null-zoo-v1b-evaluation.json); the first
run is [`null-zoo-v1-evaluation.json`](/glassbox/research/null-zoo-v1-evaluation.json).**

## The question

A search tries many strategies and keeps the best. Several tests promise to say whether the best one beat the
others by more than luck: White's Reality Check, Hansen's SPA test, Romano and Wolf's StepM, Bonferroni-style
haircuts, the deflated Sharpe ratio. Each promises a false-alarm rate, its size: at a nominal 5%, it should call
a skill-less search skilled about one time in twenty. Papers prove that for large samples. A researcher has two
years of daily returns and a grid of 20 rules, so the Null Zoo measures it there.

## How it was measured

- **The search:** 20 strategies over 504 trading days, at most one of them with a real edge: a true annual
  Sharpe ratio of 0 (no skill), 1, 2 or 3.
- **Nine kinds of market:** independent normal returns, fat tails, negative skew, positive skew, volatility
  clustering, autocorrelated returns, two volatility regimes, strategies sharing one common factor, and four
  clusters of five strongly correlated strategies.
- **10,000 searches in each cell**, from a fixed seed, so a 5% rate is measured with a standard error of about
  0.2 percentage points.
- **The pass mark, fixed before the run:** a false-alarm rate of at most 6% on every one of the nine markets, and
  at least 45% of searches with a Sharpe 2 strategy called skilled, on normal returns. The ceiling is a test told in advance which
  strategy has the edge: no honest test of the best of 20 can beat it.

## What it found

| Test | False alarms at a nominal 5%, across the nine markets | Worst market | Real edge found (Sharpe 2) |
|---|---|---|---|
| White's Reality Check | 4.5% to 6.4% | Autocorrelated | 53% |
| Hansen's SPA (consistent) | 4.3% to 12.6% | Negative skew | 57% |
| Romano and Wolf's StepM | 4.3% to 12.6% | Negative skew | 57% |
| Luck-equivalent trials, Lo-corrected | 3.2% to 8.8% | Negative skew | 53% |
| Luck-equivalent trials | 3.1% to 19.6% | Autocorrelated | 52% |
| Bonferroni haircut | 1.3% to 12.4% | Autocorrelated | 43% |
| Deflated Sharpe ratio at 0.95 | 0.02% to 1.7% | Correlated strategies | 9.4% |
| The ceiling (told which strategy has the edge) | 4.5% to 5.9% | | 88% |

- **SPA is oversized at this sample size.** Hansen's test was built to be more powerful than White's, and it is,
  by about three points, but it buys them with false alarms: 7.7% on plain normal returns, 9.1% on autocorrelated
  ones and 12.6% on negatively skewed ones, the shape of option-selling and carry returns. It
  missed the 6% mark on eight of the nine markets, seven in the first run. StepM uses the same studentized
  statistic and moved with it, case by case.
- **The Reality Check kept its promise.** Its worst rate was 6.4%, on autocorrelated returns, just over the mark;
  everywhere else it stayed between 4.5% and 5.7%, in both runs.
- **Without the other variants**, Lo's correction for autocorrelation is what keeps luck-equivalent trials honest:
  uncorrected, autocorrelated returns raised false alarms to 19.6%. Negative skew still pushes it to 8.8%.
- **The deflated Sharpe ratio is very cautious as a pass mark.** At 0.95 it raised a false alarm in at most 1.7%
  of searches, and found a strategy with a true Sharpe of 2 in 9.4%. It is a probability to read, not a gate.

## Why there were two runs

The first run's registration named only the SPA tests as candidates for a search with all its variants. The
Reality Check was measured but not named, and it was the one that held. Choosing it from that run would have been
choosing after seeing the results, so a second run was registered first, on fresh seeds, with the Reality Check
named first. It held again, and only then became the headline. A result found outside the registered list needs
its own registered confirmation before anything uses it.

## Use it

`audit_backtest` in [canli-mcp](/mcp-servers) leads with the test this study chose: the Reality Check when you send
every variant the search tried, Lo-corrected luck-equivalent trials when you send one series. It then quotes the
false-alarm rate measured on the market most like your returns, by a rule fixed before the run, so no answer can
quote the friendliest one. `validate_reality_check` gives the SPA test, the Reality Check and StepM side by side.
All run on your machine, with no account and no key. How luck-equivalent trials work is in
[Luck-equivalent trials](/research/luck-equivalent-trials), and the first Null Zoo in
[the Null Zoo](/research/null-zoo-v0).

These are simulations of one size of search and sample. The SPA test is guaranteed for large samples, and longer
ones were not measured here; the table is for searches like the one described.
