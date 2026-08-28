# The one symbol that explained the whole gap

> I could not reproduce my own result. The replay came out materially worse over the same
> window, on the same code path, from what I believed were the same inputs. The cause was a
> single delisted token that had quietly left the universe between the two runs.

**Published 2026-08-28. Every figure below is read from
[`crypto_carry_replay_correction.json`](/glassbox/crypto_carry_replay_correction.json),
the artifact the engine wrote when the incident was diagnosed.**

## What happened

On 2026-06-20 a crypto carry strategy produced a walk-forward result that was sealed and
recorded. On 2026-08-23 I replayed the same configuration to rebuild its publication bundle.

The two runs disagreed:

| field in the artifact | replay | delta against the sealed run |
|---|---|---|
| `sharpe` | 0.10652337594597801 | **-0.5700870051401173** |
| `cagr` | 0.00763704456570391 | -0.07034159710175314 |
| `final_equity` | 103335.15565193011 | -34901.10954384602 |
| `funding_net` | 14668.27528924918 | -4831.74452633956 |

Those are copied from the file rather than rounded for the page, because rounding is a
transformation and a reader checking this note against the artifact should not have to guess
which one I applied. `cagr` is a fraction, so that delta is roughly seven percentage points of
annual return.

The same strategy, over the same window, on the same code path, came out with a Sharpe
Sharpe delta of **-0.5700870051401173** against the run recorded and sealed two months
earlier.

The temptation at this point is enormous and it has a name: you assume the new number is the
broken one, find something that looks like a bug in the replay path, fix it, and watch the old
number come back. That process terminates when the answer is comfortable, which is not the same
as when it is right.

## Where the divergence starts

The equity paths agree to eight decimal places on the first row. On the **second** row they part:

```
source_equity  100088.91980262648
replay_equity  100088.83227235998
             delta      -0.0875302665
```

Eight and three quarter cents, on a hundred-thousand-dollar book, at the very
first rebalance. That is not a rounding artefact and it is not a cascade of small differences;
it is the first decision the two runs made differently, and everything after it is downstream.

So the question stops being "why is the Sharpe different" and becomes "what did these two runs
see differently at the first rebalance." That is a much smaller question, and it has an exact
answer.

## Twenty-two, not twenty-one

The historical run made its first decision across a cross-section of **22 instruments**. The
replay saw **21**.

```
source_cross_section_size  22
replay_cross_section_size  21
source_only  ["BINANCE:PERP:EOSUSDT"]
```

EOS. One perpetual future, present in the June cross-section and absent from the August one,
because the derived universe snapshot is rebuilt from current exchange metadata and EOS is no
longer in it.

Restoring EOS to the cross-section reproduces **all ten** historical discretized quantities
exactly. Not approximately: exactly. The artifact records that finding as
`EXACTLY_ATTRIBUTED`, which is a status a diagnostic only earns when the residual is zero.

One symbol out of twenty-two, a symbol the strategy did not even hold with conviction, changed
the sizing of every position in the book, because sizing is cross-sectional. Ranking twenty-two
things and ranking twenty-one things produces different weights for all of them.

## The part that is actually the lesson

The bug is not EOS. The bug is that the June artifact **sealed its outputs and its parameters and
did not seal its inputs.**

It recorded what the strategy was configured to do and what it produced. It did not record the
exact derived universe membership or the instrument metadata that the run consumed. Those live in
a table that is rebuilt from the exchange, and the exchange changes.

The consequence is worse than a wrong number, and this is the sentence worth taking away:

> Because the historical run omitted its exact code and derived-input snapshots, **no unique
> additive split among causes exists from the surviving two paths.**

Two causes are confirmed: the unbound universe, and a realized-volatility overlay that differs
between the implementations, which bound 71 rebalances. But there is no way, from the evidence
that survives, to say how many Sharpe points belong to each. The information required to answer
that was never written down, and it cannot be recovered by being clever now. The question is not
hard. It is **unidentifiable**.

That is the failure mode worth designing against. A wrong result can be corrected. A result whose
causes can never be separated is permanently ambiguous, and no amount of later analysis fixes it.

## What a sealed run has to contain

The obvious lesson, "snapshot your inputs", is not quite right, because it does not say which
inputs, and "all of them" is not implementable. The sharper version is:

**Seal everything the run could have read that something else could change.**

Not the market data, which is immutable once it exists. The *derived* tables: universe
membership, instrument metadata, quality flags, corporate-action state. Anything rebuilt from a
live source is mutable by definition, and anything mutable that a decision reads must be pinned
at decision time or the decision is not reproducible.

The remediation recorded in the artifact is a control that runs before any persisted walk-forward
result is written, and it is prospective only:

> Keep the enforced prospective snapshot control mandatory for every persisted walk-forward
> result; **never treat it as retroactive historical evidence.**

That second clause is the one that costs something. The control cannot repair June. Runs made
before it existed stay unreproducible, and the honest thing is to say so beside them rather than
to quietly re-run them under the new regime and present the output as though it had always been
there.

## What this cost

The trial ledger records this incident as:

```
new_trials              0
new_return_hypotheses   0
classification          REPRODUCIBILITY_CORRECTION_AND_CAUSAL_DIAGNOSTIC_ONLY
```

Zero. Diagnosing a reproducibility failure is not a search for a result, so it spends no trial
budget, but the family it belongs to is `NO-DEPLOY` and external submission stays blocked until
the corrected bundle is rebuilt from a sealed snapshot.

The status on the record is `OPEN_CORRECTION_EXTERNAL_SUBMISSION_BLOCKED`. It has been open since
2026-08-23. It is open now, on this page, because that is what the record says.

## The general shape

This is a class of bug rather than an incident, and it appears wherever a decision reads a table
somebody else maintains:

- A **feature store** rebuilt nightly, where a backfill changes what a model saw in training.
- A **currency or symbol mapping** that gets corrected upstream, silently re-pointing history.
- A **quality flag** applied retroactively, so a bar that was clean at decision time is dirty in
  the replay.
- Any **`SELECT` against a live table** inside something you intend to reproduce later.

The tell is always the same and it is easy to check: if your artifact records what came out but
not what went in, you have a result you cannot defend. It will look fine until the day you try to
rebuild it, and by then the inputs are gone.
