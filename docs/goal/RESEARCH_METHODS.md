# Research methods program (owner, 2026-09-26)

Owner: "invent things from scratch, baselines for testing, mathematical things in the quant and
finance world, which will help us when we get peer reviewed or launch research papers."

House rules: check prior art before claiming novelty; state exactly what is new; pre-register the
claim; validate by Monte Carlo with fixed seeds (size and power); ship the reference implementation
with tests in CI, as an API validator and an MCP tool; publish the paper with code and signed receipts.

| # | Method | Prior art (2026-09-26 search) | Honest novelty |
|---|---|---|---|
| 1 | Luck-equivalent trials: N_q = ln(1-q) / ln Phi(z), z = SR / se(SR) with the non-normal standard error; and N_E solving E[max of N] = z | DSR (Bailey and Lopez de Prado 2014), Harvey and Liu (2015) multiple testing; no named reviewer statistic found | A new, named, closed-form reviewer statistic assembled from known results, with calibration and tooling |
| 2 | Null Zoo: open, versioned benchmark of synthetic strategy families with known ground truth (fat tails, autocorrelation, regimes, correlated trials, injected lookahead) scoring validators' size and power | Arian, Norouzi, Seco (2024, Knowledge-Based Systems) synthetic comparison of cross-validation methods | Open, versioned, receipt-signed benchmark of the validators themselves; extends and cites Arian et al. |
| 3 | Deflated drawdown: null distribution of the best-of-N strategy's maximum drawdown | Expected max drawdown of one fund (Magdon-Ismail et al.); no best-of-N version found | Possibly novel; deeper literature review before any claim |
| 4 | Placebo-lag lookahead test with size control | Folklore shift test; LLM lookahead tests (2025-2026) | Modest: a formal test with calibrated size |

Order: 1 now; 2 next (it is the substrate that scores every other method); 3 after its literature review; 4 later.

## Method 1 result (2026-09-26): luck-equivalent trials, PR #274

Built as the Student t null of the Sharpe's t-statistic (exact under normal returns), Sidak
best-of-N, N_q = ln(1-q)/ln(1-p1), plus the expected-max count. Size study with fixed seeds:
`scripts/research/luck-trials-size-study.mjs` -> `config/research/luck-trials-size-study.json`
(1,000 searches of 20 strategies per cell, T = 60 and 252; Student t null vs the DSR-style
non-normal standard error vs a bootstrap of the best strategy's returns).

Finding, publishable in itself: no method is calibrated everywhere. At T = 252 and nominal 5%, the
Student t null rejects 0.035 (normal), 0.043 (t4), 0.108 (skew -1.3), 0.208 (skew -3.7). The
DSR-style SE fixes negative skew (0.049, 0.068) but over-rejects under t4 (0.060) and positive skew
(0.088 at +3.7). The bootstrap is closest overall but fails under t4 at T = 60 (0.095), because the
best strategy's own sample is selection-biased. Next research step: a selection-aware calibration
(e.g. a skew-adaptive choice between the null and the DSR SE, or a bootstrap of all trials when
they are available). Measure it with the Null Zoo (method 2), which this study seeds.

## Method 2 result (2026-09-26): Null Zoo v0, PR #275

Eight families (iid, t4, skew ±1.3, GARCH, AR(1) 0.2, regimes, correlated trials 0.5), 20 trials x
504 days, 2,000 searches per cell, size plus power at true Sharpe 2. Output
`config/research/null-zoo-v0.json`; instrument tests with 6/6 generator mutations caught.
Findings: (1) AR 0.2 breaks every best-of-N test (luck 0.200, haircut 0.132, bootstrap 0.171 at
nominal 0.05); Lo correction with sample rho -> 0.059 and free elsewhere, now in the product as
optional `autocorrelation`. (2) DSR >= 0.95 has size ~0 and power 0.09 vs 0.53 for luck trials:
estimate, not a 5% test. (3) Negative skew is still luck trials' weak case (0.088).
Next: skew-aware calibration, and an effective-trials estimate for correlated searches.
