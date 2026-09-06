# The arithmetic of not fooling yourself

> A Sharpe ratio of 1.14 with a p-value of 0.017. Publishable, on the face of it. Whether it
> means anything depends entirely on a number that does not appear in it: how many things you
> tried before this one.

**Published 2026-08-27. Every figure below is printed by
[`benchmarks/validation_throughput.py`](https://github.com/arhancanli/canli-backtest/blob/main/benchmarks/validation_throughput.py)
in `canli-backtest`. Run it and you get these numbers.**

## The problem, stated precisely

Take a strategy with 1,260 daily returns, about five years. It has an annualised Sharpe ratio
of **+1.139**.

The first correction anyone should apply is for sample size and shape. A Sharpe estimated from
1,260 observations is a random variable, and returns are not Gaussian. Bailey and Lopez de
Prado's **Probabilistic Sharpe Ratio** does this. For an observed per-period Sharpe `SR`
against a benchmark `SR*`, over `T` observations, with sample skewness `g3` and non-excess
sample kurtosis `g4`:

```
PSR(SR*) = Phi(z)

                 (SR - SR*) * sqrt(T - 1)
    z = -----------------------------------------
          sqrt( 1 - g3*SR + ((g4 - 1)/4)*SR^2 )
```

`Phi` is the standard normal CDF. Against `SR* = 0`, our series gives **PSR = 0.9828**. Read
naively: a 98.3 percent chance the true Sharpe exceeds zero. Under 2 percent chance this is
noise.

That number is correct and it is close to useless, because it answers the question "is this one
series distinguishable from zero" when the question that matters is "is the *best of everything
I tried* distinguishable from zero."

## Why the benchmark must not be zero

If you run `N` strategy variants that genuinely have no edge, their estimated Sharpe ratios
still scatter. The maximum of `N` draws from that scatter is not zero. It is a positive number
that grows with `N`, and it grows whether or not any variant has an edge.

So the honest benchmark is not zero. It is the Sharpe that the *luckiest of N nothing-strategies*
would be expected to produce. Using the expected maximum of `N` draws with cross-trial Sharpe
variance `V[SR]`:

```
SR* = sqrt(V[SR]) * ( (1 - g) * Q(1 - 1/N)  +  g * Q(1 - 1/(N*e)) )

    Q = Phi^-1, the normal quantile function
    g = 0.5772156649, the Euler-Mascheroni constant
    e = exp(1)
```

The **Deflated Sharpe Ratio** is simply the PSR evaluated against that benchmark instead of
zero: `DSR = PSR(SR*)`.

## The demonstration

One return series. Unchanged. The only thing that moves is how many trials you admit to,
against a trial family whose per-period Sharpes scatter with standard deviation 0.02:

| trials `N` | expected max Sharpe `SR*` | DSR |
|---:|---:|---:|
| 2 | 0.01040 | **0.9596** |
| 10 | 0.03149 | 0.8408 |
| 50 | 0.04553 | 0.6914 |
| 200 | 0.05531 | 0.5608 |
| 1000 | 0.06510 | 0.4230 |

Nothing about the strategy changed between the first row and the last. No new data arrived. No
parameter moved. This project's deployment gate is `DSR >= 0.95`, so read against that gate,
the same Sharpe of 1.14 is **admissible if you tried two things and inadmissible if you tried
ten**.

That is the entire argument for a trial ledger. The denominator is not paperwork. It is half of
the result.

## The trap I fell into while writing this

The first version of this note, and the README that shipped with the repository, used
`sr_trials_variance = 0.04` and reported that the same Sharpe deflates to **0.000** at 200
trials. I published that. It is wrong, and the way it is wrong is more instructive than the
correct version.

`V[SR]` is the variance of Sharpe *across the trial family*, in the same **per-period** units as
the series. Our series has a per-period Sharpe of 0.0385. A variance of 0.04 is a standard
deviation of 0.2, roughly twenty times the thing being measured. At that scale `SR*` already
exceeds the observed Sharpe at `N = 2`, so the deflated ratio collapses immediately and stays
collapsed. The trial count changes nothing.

So the sentence "it deflates to zero once you count 200 trials" credited the trial count for
work the variance parameter was doing. The arithmetic was right. The attribution was wrong.

And it was wrong in the specific direction that flatters the argument. I was using the example
to say *counting your trials is what separates an edge from luck*, and I demonstrated it with a
parameter setting under which the trial count is irrelevant. A reader who checked would have
found a worked example that argues against its own thesis while appearing to confirm it.

The retraction is in the repository README, and the withdrawn 0.000 is still quoted inside it,
because a number you cannot search for is a number nobody can check.

**The general form of the mistake: a unit error in a parameter that is not the subject of the
sentence.** Nothing checks it. The types agree, the function returns, the value is plausible,
and the conclusion is unaffected in direction so it never looks wrong. The only defence I know
is to sweep the parameter you claim is driving the result and confirm it actually drives it. If
the answer barely moves across the sweep, your headline is about something else.

## The second instrument: does the winner survive?

Deflation asks whether one Sharpe survives the search that produced it. **Probability of
Backtest Overfitting** asks a sharper question: does in-sample rank predict out-of-sample rank
at all?

Combinatorially Symmetric Cross-Validation (Bailey, Borwein, Lopez de Prado, Zhu, 2017). Given
a `T x N` matrix of per-period returns, one column per configuration:

1. Split the `T` rows into `S` contiguous equal blocks (`S` even, default 16). Drop the
   remainder so every block is exactly `T // S` rows.
2. For each way of choosing `S/2` blocks as in-sample, form the IS matrix from those and the
   OOS matrix from the complement. That is `C(16, 8) = 12,870` splits; the implementation
   samples 5,000 of them with a fixed seed rather than enumerating all.
3. Take the in-sample winner `n* = argmax_n SR_IS(n)`.
4. Find `n*`'s rank among all `N` configurations **out of sample**, ranked ascending, and take
   the logit of its relative rank.

PBO is the fraction of splits where the in-sample winner lands in the bottom half out of sample.

The test in the benchmark runs it on **100 configurations of pure noise**, so the in-sample
winner is always luck by construction. A correct implementation must return approximately 0.5.
It returns **0.569**.

That number is doing double duty. It is a performance measurement and it is a correctness
assertion, in the same run. If the implementation ever started finding structure in noise, that
figure would move before the timing did, and a benchmark that only measured speed would stay
green while computing nonsense.

## What it costs

PBO over 2,000 observations and 100 configurations, 5,000 sampled splits: **1.6 seconds**. A
deflated Sharpe on 1,260 daily returns: about **300 microseconds**.

The point is not that these are fast. It is that at 300 microseconds there is no resource
argument for running the honest test only on the candidate you already like. The reason people
skip it is not compute.

## Three rules I would keep

1. **The benchmark is never zero.** If you selected the thing you are testing, the null it must
   beat is the best of what you searched.
2. **Sweep the parameter you are crediting.** If the conclusion does not move across it, the
   conclusion is about something else, and you are about to publish a confident misattribution.
3. **Make the benchmark assert behaviour.** A correctness check that runs on every performance
   run is nearly free and catches the class of bug where the answer is fast and wrong.

*Implementation:
[`dsr.py`](https://github.com/arhancanli/canli-backtest/blob/main/src/alphaforge/validation/dsr.py)
and
[`pbo.py`](https://github.com/arhancanli/canli-backtest/blob/main/src/alphaforge/validation/pbo.py).
Both are byte-identical to the engine that produces the public record, and CI proves it on every
push. You can also run the deflation in the browser on
[the calculator](/tools/deflated-sharpe), or watch it happen to you in
[the Selection Risk Lab](/tools/selection-risk), which lets you search a series that provably has
no edge and then deflates whatever you find against your own search.*
