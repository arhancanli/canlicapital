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

## Round 3 results (2026-10-23 18:54 UTC)

v0 (100 items): validation tool 0.98 (answerable 78/80, unanswerable 20/20, no turn limit); 0.6.0
0.85 (72/80, 13/20, 9 at the limit); branch 0.84 (68/80, 16/20, 7 at the limit). Across rounds 2 and
3 the branch is no better than 0.6.0 on plain v0 items; single runs of 80 answerable items move by
about four either way. Most remaining failures are runs at the six-turn limit on items that need two
measures, where the model reaches the data only through find_tool and run_tool.

## Round 4 (planned before any run)

After round 3: the flagship lists history and financial_statements as tools of their own beside the
three discovery tools (`CANLI_FRONT`, default those two; empty restores three). Larger sample to
see past run-to-run noise: v0 items outside every earlier sample, 40 per template, seed 20261127
(200 items). Arms: canli-mcp 0.6.0 and this branch (the validation tool is left out: 0.98 to 0.99
in all three rounds). Reported: accuracy, answerable and unanswerable items right, runs at the
limit, and items one arm gets right and the other wrong.

## Round 4 results (2026-10-23 19:07 UTC)

v0 (200 items): 0.6.0 0.870 (answerable 142/160, unanswerable 32/40, 6 at the limit, 12,923 tokens
an item); branch with front tools 0.885 (142/160, 35/40, 2 at the limit, 10,394 tokens). Paired:
right only with the branch 10, only with 0.6.0 7 (one-sided p = 0.31). Fewer runs at the limit and
a fifth fewer tokens; no clear gain in accuracy. The branch's answerable misses: answers built on
the first-reported value where the item's answer is the latest filing's (history's default was
first_reported), and balance-sheet questions "as of" a period end answered through the as_of
argument, which is a filing date, so an earlier balance sheet came back.

## Round 5 (planned before any run)

After round 4: history defaults to the latest value (first_reported stays one argument away, and
each row still shows the other version), and when as_of equals a period end filed later, the
result says so. v0 items outside every earlier sample, 40 per template, seed 20261128 (200 items);
arms canli-mcp 0.6.0 and this branch; reported as in round 4.

## Round 5 results (2026-10-23 19:19 UTC)

v0 (200 items): 0.6.0 0.870 (answerable 142/160, unanswerable 32/40, 10 at the limit, 13,055 tokens
an item); branch 0.930 (150/160, 36/40, 2 at the limit, 11,311 tokens). Paired: right only with the
branch 14, only with 0.6.0 2, one-sided exact McNemar p = 0.0021. The first round where the branch
is clearly better than the published flagship; the validation server's single company tool still
scored 0.98 to 0.99 in rounds 1 to 3.
