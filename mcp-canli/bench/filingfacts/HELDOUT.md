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
