# External proof: someone else's questions

Phase 5 of the MCP plan: canli-mcp measured on question sets we did not write, against the same model
with no tools and with the rival servers, graded the same way for every arm.

| Set | Questions | Graded by | Licence |
|---|---|---|---|
| `vals` | Vals.ai Finance Agent Benchmark, public set: 50 questions in 9 types, each with a rubric (facts the answer must state, and the reference answer it must not contradict) | rubric judge | MIT |
| `financebench` | Patronus AI's FinanceBench open-source sample: 150 questions with reference answers | reference judge | no licence file in the repository: check the dataset card before publishing transcripts |
| `dev` | 3 synthetic questions in `dev.json` (Apple, Novo Nordisk, Shell; figures checked against SEC filings on 2026-10-15) | either | ours |

Both external files are fetched at pinned commits on every run and checked against pinned SHA-256s
(`datasets.mjs`); a changed file stops the run. Nothing is written to disk but the results.

## The rule that keeps the result honest

Six of the 50 Vals questions were read on 2026-10-14 while planning (US Steel and Nippon Steel, Netflix
revenue per member, TJX's pretax margin against guidance, AMD's guidance range, BBSI's board nominees,
Amazon, Meta and Alphabet capex). The other 44 have never been read and are the final exam: the runner
was built and tested on `dev` only, it prints ids and question types but never a question, and nothing
is tuned on any Vals or FinanceBench result. Report the first full run, whatever it shows.

## Running

```bash
cd mcp-canli/bench/rivals && npm ci
node --test external/*.test.mjs                                   # no keys, no network
node external/run.mjs --set dev --model mock --judge mock --arms none,canli
# Paid: keys in ~/.config/canli/anthropic_benchmark_key and openai_benchmark_key.
node external/run.mjs --set vals --model claude-sonnet-5-5 --judge claude-sonnet-5-5 \
  --arms none,canli,openbb,edgartools+yahoo --budget-usd 60
node external/report.mjs --set vals
```

- Arms: `none` (the model alone) and every arm in `../arms.mjs` (canli-mcp from this checkout, OpenBB,
  EdgarTools, Yahoo Finance; the rivals run from ~/canli-bench-rivals, as `../arms.mjs` says).
- Same for every arm: Vals' prompt (answer as of the set's date, reasoning and calculations, two
  decimal places, sources), temperature 0, at most 50 turns (Vals' default), tool results capped at
  30,000 characters.
- Money: `--budget-usd` is required for a paid run; `results/spend.json` keeps the running total
  across runs and the guard stops before the next answer once it is reached (exit 4). A single answer
  stops at `--max-question-usd` (default 3). An account out of credit stops the run (exit 3). Prices
  are in `prices.mjs`; check them against the providers' pages before a paid run.
- Resume: a rerun skips every answer already graded in `results/<set>.jsonl`.
- The canli arm runs canli-mcp from this checkout with the canli-markets-mcp release it links to
  (each result records both); run the proof after the release it is meant to measure.

## Grading

One judge model for every arm. A Vals answer passes when it states every "correctness" fact and nothing
it asserts contradicts the "contradiction" item, which holds the full reference answer: the operators
in Vals' public rubrics. Vals grades on its own platform, so these numbers are ours, not Vals' leaderboard;
every report says so. A FinanceBench answer passes when its result matches the reference.
