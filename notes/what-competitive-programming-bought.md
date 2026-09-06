# What competitive programming actually bought me, and what it did not

> There are no segment trees in this trading engine. I want to explain why that is the right
> answer, and what the contest habit did pay for instead, because the honest version of this
> story is more useful than the flattering one.

**Short title:** What competitive programming bought me

**Published 2026-08-27. Code links go to the published extractions; the measurement at the end
is reproducible from the snippet given.**

## The flattering version

The tempting thing to write is that competitive programming gave me a toolkit of exotic data
structures, and that a backtest engine is where they finally paid off. Segment trees for range
queries over time. A Fenwick tree for rolling aggregates. Union-find for grouping correlated
instruments.

That would be a nice story. Here is the actual inventory of the engine's source tree:

- `bisect`, in two files;
- `deque`, in one;
- no segment tree, no Fenwick tree, no union-find, no explicit priority queue.

Knowing when a structure is not the answer is most of what the training is for. A segment tree
buys you `O(log n)` range updates **interleaved with** queries, online, in arbitrary order. My
range updates are not interleaved with queries and they are not online. They arrive as a batch
of intervals, all known in advance, and are consumed as one dense array afterwards. That is the
case where you paint the intervals and skip the tree entirely.

Reaching for the sophisticated structure there would cost a log factor, several hundred lines,
and a new place for an off-by-one to live. The contest instinct that actually matters is
recognising which problem you have, and the answer here is "offline range assignment", not
"dynamic range query".

## What it did buy, one: the boundary is where the bug is

This engine is full of "what was true at time t" questions. Trading calendars are the sharpest
case, because the naive answer is arithmetic and the arithmetic is wrong.

The naive next bar after timestamp `ts` is `ts + tf.ms`. Add a day to Friday and you get
Saturday, a session that does not exist. Nothing raises. You get a phantom bar, your strategy
"trades" on it, and your backtest quietly earns returns on a day the exchange was shut.

The real answer is a predecessor and a successor query over the sorted array of session opens:

```python
# last session open at or before ts
idx = bisect.bisect_right(opens, ts) - 1
if idx < 0:
    raise ValueError(f"ts {ts} precedes the first XNYS session {opens[0]}; widen the horizon")
return opens[idx]

# first session open strictly after ts
idx = bisect.bisect_right(opens, ts)
if idx >= len(opens):
    raise ValueError(f"ts {ts} is at or past the last cached session; widen the horizon")
return opens[idx]
```

Three details, all of them contest reflexes:

**`bisect_right` minus one, not `bisect_left`.** For "at or before", `bisect_right` puts you
past every element equal to `ts`, so stepping back once lands on `ts` itself when it is a
session open. `bisect_left` minus one would skip it and silently return the *previous* session
whenever you ask about a real trading day. Both are one-liners. One is wrong in a way that only
shows up on exact matches, which is to say on the boundary.

**The empty-side guards raise; they do not clamp.** `idx < 0` means the question is outside the
cached horizon. Returning `opens[0]` there would be an answer, and it would be a lie: the caller
asked about 1994 and would receive a 1997 session as though it were the truth. Clamping is how
a range error turns into a plausible number. The contest version of this is returning `0` for an
out-of-range query and watching the judge disagree on test 14 with no idea why.

**The interval is half-open.** `[effective_from, effective_to)` throughout, everywhere, without
exception. Which brings me to the second thing.

## What it did buy, two: consistency between two implementations of the same predicate

Universe membership is stored as intervals. "Was instrument `i` in the universe at time `t`?"

There are two implementations of that predicate in the codebase, and they must agree exactly:

- `membership_asof(t, i)`, the scalar version, used for point queries;
- `_membership_mask(...)`, which produces the whole boolean grid at once for research panels.

If those two disagree on a single boundary, a backtest and its own diagnostics report different
universes and nobody notices until a number cannot be reproduced. The scalar version defines the
predicate as `effective_from <= t` and (`effective_to` is null or `> t`). The vectorised version
has to reproduce that exactly, which it does by using `side="left"` on **both** searches:

```python
lo = int(np.searchsorted(ts_grid, eff_from, side="left"))
hi = ts_grid.size if eff_to is None else int(np.searchsorted(ts_grid, eff_to, side="left"))
if lo < hi:
    member[lo:hi, j] = True
```

`side="left"` at `lo` includes a grid point landing exactly on `effective_from`. `side="left"` at
`hi` excludes one landing exactly on `effective_to`, and Python's own half-open slice
`member[lo:hi]` then does the rest. The half-openness of the interval and the half-openness of
the slice line up, so the boundary case needs no special handling at all.

Instruments with no interval stay `False` everywhere, and consumers reindex with
`fill_value=False`, so a coverage gap is a non-member rather than a silent `True`. Fail closed at
the edge: the same instinct as raising instead of clamping.

## What it did buy, three: seeing the rewrite immediately

The naive way to build that grid is the obvious way. For every `(t, i)` cell, call
`membership_asof(t, i)`. It is correct, it is readable, and on a research panel it is unusable.

The rewrite is the one every contest teaches: **stop asking per element, start assigning per
interval.** Instead of one point query per cell, do two binary searches per interval and one
vectorised slice assignment. The cost stops scaling with the number of cells you are asking
about and starts scaling with the number of intervals you actually have, which is smaller by
orders of magnitude.

Measured on a grid the size of this project's equity panel, 7,500 sessions by 3,000
instruments, 22.5 million cells, 9,000 membership intervals:

| approach | time |
|---|---:|
| per-cell point query (1% sample, extrapolated) | 3.9 s |
| two searches per interval, then paint | **0.022 s** |

About **180x**, and the gap widens as the panel grows, because one side scales with cells and
the other with intervals. That is the whole trick, and it is the same trick as a difference
array in a contest problem: the work belongs on the edges of the ranges, not on the points
inside them.

The comment in the source says it more bluntly than I would have: *one `searchsorted` pair per
interval, NEVER a per-row `membership_asof` sweep*.

## The part that transfers, and the part that does not

What does not transfer: the exotic structures, mostly. Real systems are dominated by input and
output, by data that does not fit the shape you want, and by correctness constraints that make
the clever version unmaintainable. I have written far more code deciding *what is knowable at
time t* than optimising anything.

What transfers, and I did not expect how much:

1. **Suspicion of the boundary.** Every time I have found a genuine bug in this engine, it lived
   at an edge: the first bar, the last session, the exact-equality case, the empty set. Contests
   train you to test `n = 1` before anything else.
2. **Half-open intervals, always.** Not because they are elegant, but because mixing conventions
   between two functions that implement the same predicate is a bug you cannot see in either
   function alone.
3. **Failing loudly at the edge of the domain.** Clamping produces plausible answers, and a
   plausible wrong answer survives review.
4. **Knowing the structure you are choosing not to use.** "No segment tree here, because the
   updates are offline" is a decision. Never having heard of one is not.

The engine has no clever data structures in it. That is the result of the training, not the
absence of it.

*Code: [`core/calendar.py`](https://github.com/arhancanli/canli-pit-lake/blob/main/src/alphaforge/core/calendar.py)
and [`data/universe/store.py`](https://github.com/arhancanli/canli-pit-lake/blob/main/src/alphaforge/data/universe/store.py)
in `canli-pit-lake`. Both are byte-identical to the engine behind the public record, and CI
proves it on every push.*
