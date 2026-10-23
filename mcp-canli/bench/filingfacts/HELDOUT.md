# FilingFacts held-out check of the flagship (planned 2026-10-23, before any run)

On the FilingFacts samples used in the paper's DeepSeek round, the published flagship (canli-mcp
0.6.0) answered restatement questions far better than the validation server's company tool
(56/60 against 2/60) but plain questions worse (v0 105/120 against 118/120, large 103/120 against
117/120, fresh 53/60 against 60/60). Reading its failures on those samples led to four changes on
this branch: the history tool shows the other vintage (latest beside a first report, and the
reverse) and the change from a year earlier; statements carry money_scale and shares_scale and
say that presented signs can differ from the tagged fact; a company name shared by several filers
names the others; the server instructions name the commonest tools so run_tool can be called
without a search.

Because those samples found the problems, they cannot test the fixes. This check uses items no
earlier run saw: the v0 and large-company items outside every sample of the DeepSeek round
(`filing-facts-heldout-20261023/{v0,large}-heldout.jsonl`), sampled with seed 20261124, 20 per
template from v0 (100 items) and 11 per template from the large set (55 items). Three tool arms
run on the same items with deepseek-flash through `scripts/datasets/filing-facts/eval.mjs` (commit
9739a73a, thinking off, temperature 0, six-turn limit): the validation company tool, canli-mcp
0.6.0 as published, and this branch's flagship (`--server flagship` with CANLI_FLAGSHIP_SERVER set
to a copy of 0.6.0 whose canli-mcp, canli-fundamentals-mcp and canli-markets-mcp sources are this
branch's). Reported whatever it shows: answerable items correct per arm, paired counts of items one
arm gets right and the other wrong, and runs at the six-turn limit.

## Round 1 results (2026-10-23 18:25 UTC)

Answerable and unanswerable items together, accuracy: v0 (100 items) validation tool 0.99,
canli-mcp 0.6.0 0.90, this branch 0.92; large (55) 0.964, 0.891, 0.909. The branch closes little of
the gap. Its v0 misses: three runs at the six-turn limit (questions needing two measures took
several calls), one cash-flow sign copied from a statement as presented, two unanswerable items
answered with a sibling tag's figure, one figure from another basis, one ratio from another line.

## Round 2 (planned before any run)

After round 1: history takes `concepts` (two to six measures in one call) and the flagship's
instructions say so. New items again, none used in any earlier run: v0 items outside every sample
so far, 20 per template with seed 20261125 (100 items), and fresh-core items outside the DeepSeek
round's sample, 10 per template with seed 20261125 (50 items). Same three arms, model and limits.

## Round 2 results (2026-10-23 18:40 UTC)

Answerable items right: v0 (80) validation 79, 0.6.0 71, branch 76; fresh (40) 40, 30, 36. Overall
accuracy v0 0.99, 0.88, 0.88 (the branch loses on unanswerable items what it gains on answerable
ones); fresh 1.00, 0.75, 0.90. The fresh split has no unanswerable items left outside earlier
samples, so it has 40 items, not 50. The branch's unanswerable misses: five runs at the six-turn
limit on years before XBRL (2005 to 2008), searching for a period the data does not cover; three
answers from a sibling tag or a rendered statement, figures that are in the filing but not under the
tag the question names.

## Round 3 (planned before any run)

After round 2: history and its several-concepts form state the span the data covers (`covers`), so a
period outside it is plainly not reported; screen_companies takes a fiscal-year-end window (commit
56ef55e8, found on the rival frontier set). New v0 items outside every earlier sample, 20 per
template, seed 20261126 (100 items); the same three arms, model and limits.
