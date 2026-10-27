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

## Round 6 (planned before any run, 2026-10-24)

After round 5: run_tool also runs find_tool and describe_tool (a regression the rival rerun found),
the instructions make verify_claims a check for drafts, and new tools are in the catalog
(latest_filings, filing_diff, news, explain_move, portfolio_xray, price_panel, the breadth lab and
annotation), which a search can now return. Check that plain questions did not suffer: v0 items
outside every earlier sample, 40 per template, seed 20261129 (200 items); arms canli-mcp 0.6.0 and
this branch at 910c0ad5, refreshed to cad93efa (comps, capex under both tags) before its arm started; reported as in rounds 4 and 5.

## Round 6 results (2026-10-24 00:57 Dubai)

v0 (200 items): 0.6.0 0.865 (answerable 140/160, unanswerable 33/40, 13 at the limit, 13,437 tokens
an item); branch 0.920 (150/160, 34/40, none at the limit, 11,096 tokens). Paired: right only with
the branch 20, only with 0.6.0 9, one-sided exact McNemar p = 0.031. Rounds 5 and 6 together (400
items, none seen before): branch 0.925 against 0.868, 34 against 11.

Round 6 misses, read one by one: most are the model's choices (a quarter-end instead of the fiscal
year, a sibling tag on "not reported" items, a figure it knew belonged to another filer) or a
presented sign copied from a statement (Merck's capital expenditures as -4,388 million). Two are
FilingFacts v0 answer keys built on a filer's own tagging slip, where the model's answer is the
sensible one: Crexendo's diluted shares (a later 10-K tags 20,275,691,000 for 20,275,691, so the key's
change is 116,290%) and Zions Bancorporation's "net margin" of 1.96 (its Revenues tag holds only some
fee income). They are kept as scored, as the benchmark defines them.

## Round 7 (planned before any run, 2026-10-24 ~03:15 Dubai)

Since round 6 the catalog gained comps, debt_profile, ownership_breadth, forensic_scores and
funding_rates, and price_panel and annotation from a draft in the backtest pack (332 tools): a
check that a larger catalog does not cost plain questions. v0 items outside every earlier sample,
40 per template, seed 20261130 (200 items); arms canli-mcp 0.6.0 and this branch at 08cdd461;
reported as in rounds 4 to 6. (Committed locally first; pushed after the CI run in progress.)

## Round 7 results (2026-10-24 ~04:00 Dubai)

v0 (200 items): 0.6.0 0.870 (answerable 141/160, unanswerable 33/40, 13 at the limit, 13,021 tokens
an item); branch 0.935 (149/160, 38/40, 2 at the limit, 11,350 tokens). Paired: right only with the
branch 19, only with 0.6.0 6, one-sided exact McNemar p = 0.007. The larger catalog (332 tools) did
not cost plain questions. Rounds 5 to 7 together (600 items, none seen before): branch 0.928 against
0.868, 53 against 17.

## Round 8 (planned before any run, 2026-10-24 ~16:30 Dubai)

Since round 7 the flagship was released as 0.7.1, and this branch (0.8.0) adds nine markets tools
(federal contracts, drug pipelines, comment letters, a reverse DCF from filings, bank call reports,
filing drift, planned insider sales, the IPO pipeline; compute prices comes with markets 0.7.1 and
is not in this arm), seven prompts, the policy file and audit log (off here), plugins (none here)
and the federal_contracts search words. A check that plain questions keep their level against the
published release: v0 items outside every earlier sample, 40 per template, seed 20261131 (200
items, from `v0-heldout8.jsonl`: `v0-heldout7.jsonl` less round 7's 200); arms canli-mcp 0.7.1 as
published and this branch at c1d2612a (its own node_modules: markets 0.7.0, backtest 0.2.0, paper
0.1.1); deepseek-flash, same eval and limits; reported as in rounds 4 to 7.

## Round 8 results (2026-10-24 ~15:01 Dubai)

v0 (200 items): canli-mcp 0.7.1 0.920 (answerable 146/160, unanswerable 38/40, 4 at the limit,
11,267 tokens an item); branch 0.920 (146/160, 38/40, 3 at the limit, 11,621 tokens). Paired: right
only with the branch 3, only with 0.7.1 3 (p = 0.66). The 0.8.0 additions cost plain questions
nothing. DeepSeek cost: USD 0.10 for both arms.

The branch's misses, read one by one: a balance on a date that is not a year end (Booking's
receivables on 2018-01-01, its opening balance after ASC 606; Mitek's at a transition date), which
history left out because a 10-Q reported it first: fixed in canli-fundamentals-mcp 0.7.1
(`other_dates`; Booking then gives the key's 16.83%). "Long-term debt" read as the noncurrent part
(PriceSmart): `long_term_debt` now names the total. The rest are the model's choices (net income
with noncontrolling interests, a combined basic-and-diluted share count for "basic", a presented
sign) or answer keys built on a filer's tagging (Cousins' taxes paid in thousands tagged as USD).
