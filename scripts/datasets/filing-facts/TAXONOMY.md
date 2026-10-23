# FilingFacts error taxonomy (v1)

Accuracy says how often a model is right. This says how it is wrong. `taxonomy.mjs` places every
scored answer in exactly one class and checks every wrong number against the company's whole
reported XBRL history (one SEC companyfacts capture per company):

| Class | Meaning |
| --- | --- |
| `superseded_version` | A value another filing reported for the same item and period (before or after a revision). |
| `other_period` | A value the company reported for the same item in another period (for a change, ratio or net-assets item, the same formula re-derived at another period). |
| `other_item` | A value the company reported for a different line item (plain values only). |
| `sign_flip`, `scale_slip`, `percent_slip` | Right digits, wrong sign, thousands/millions/billions, or percent vs fraction. |
| `near_miss` | Within 2% (1 point for a percent, 0.002 for a ratio), matching no reported value. |
| `unsupported` | A number no value in the company's reported history supports. |
| `invented_from_other_period`, `invented_unsupported` | A number on a question whose figure the filings do not report. |

The rest are `correct`, `correct_abstention`, `false_abstention`, `no_answer` and `request_failed`.
Matching uses the scorer's own tolerances. The class order is the precedence.

## The placebo

Searching a whole history can match by coincidence. Every wrong number is therefore also checked
against a randomly paired item of the same template from a different company (seed `20261007`).
Pairing each answer with its decoy gives an exact one-sided McNemar test on the discordant pairs:
the answers that match only their real company against those that match only the decoy.

## Run it

```
node scripts/datasets/filing-facts/taxonomy.mjs public/datasets/filing-facts/v0/filing-facts-v0.jsonl \
  public/datasets/filing-facts/v0/runs/2026-10-07 <sources-dir> \
  public/datasets/filing-facts/v0/error-taxonomy/2026-10-07.json
```

`<sources-dir>` holds `<cik>.raw.json.gz` per company; their SHA-256 values are recorded in the output.

## Pre-registration for the second day of runs

The classes, tolerances, placebo and tests below were fixed in this commit, after the first day's
runs (`runs/2026-10-07`, seven runs) and before any second-day run had been scored. The first day
informed the design, so it is exploratory. The second day's runs are the confirmation set. Every
hypothesis is tested on that set alone, pooling the closed-book runs, and is reported whatever it
shows.

- **H1.** Among wrong numbers on answerable items in closed-book runs, more than half are
  `unsupported`. The test is a one-sided exact binomial against 0.5, at alpha 0.05.
- **H2.** Wrong numbers match their own company's reported history more often than a decoy's.
  The test is a one-sided exact McNemar test on pooled discordant pairs, at alpha 0.05.
- **H3.** For every model run in both arms on the second day, the tool arm gives fewer
  `unsupported` plus `invented_*` answers per item than the closed arm. This is reported per model
  as a count, with no pooled test.

First-day values, for reference only: in the closed-book runs, 213 of 294 wrong numbers were
`unsupported`. 69 matched some reported value. The discordant pairs were 44 real-only against 13
decoy-only.

## Pre-registration for the extension runs (2026-10-23)

Fixed in this commit, before any extension run had been made. The runs, in the order the script
makes them (`eval.mjs`, sampling seed `20261023` for the v1 sets, `20260926` for v0 as before):

- **v0 set:** the paper's 150 v0 items. Gemma 4 12B (Q4_0, run locally through Ollama, thinking
  off, temperature 0), closed-book and with the tool.
- **Restatement set:** 60 v1 restatement items (`filing-facts-v1-restatement.jsonl`, SHA-256
  `0a5a2121...98c5`). Closed-book: Gemma 4 12B, gpt-4.1, gpt-4o, gpt-5.4, gpt-4.1-mini,
  gpt-5.4-mini, o4-mini. With the tool: Gemma 4 12B, gpt-5.4-mini.
- **Fresh set:** 75 v1 fresh items, 15 per v0 template (`filing-facts-v1-fresh-core.jsonl`, the
  fresh split without its restatement items, SHA-256 `59580491...76da`). Closed-book: the same
  seven models. With the tool: Gemma 4 12B, gpt-4.1-mini, o4-mini, gpt-5.4-mini.

OpenAI runs stay inside the free data-sharing allowance; a run whose estimate would pass 90% of
its pool is skipped, and skipped runs are reported. The taxonomy is run once per set with the
unchanged placebo seed. `confirm-extension.mjs` (this commit) computes every test, at alpha 0.05,
reported whatever it shows:

- **H1'.** Pooling the closed-book runs on the v0 and fresh sets, more than half of wrong numbers
  are `unsupported` (one-sided exact binomial against 0.5).
- **H2'.** Pooling every closed-book extension run, wrong numbers match their own company's
  history more often than a decoy's (one-sided exact McNemar).
- **H3'.** For every model and set with both arms, the tool arm gives fewer `unsupported` plus
  `invented_*` answers per item (a count per model and set, no pooled test).
- **H4.** On restatement items, pooled closed-book answers equal to the revised figure
  (`superseded_version`) outnumber those equal to the first-reported one (`correct`) (one-sided
  exact binomial on the two counts).
- **H5.** For models run closed-book on both v0 (any day) and the fresh set, correct numbers per
  answerable item are higher on v0 than on the fresh set (one-sided Fisher exact, pooled).

Exploratory, with no test: tool-arm accuracy on answerable fresh items against v0.

**Amendment 1 (2026-10-23, before any extension run had completed).** (a) The OpenAI runs could
not be made: the first request returned `credit_balance_exhausted`, so nothing was billed and no
OpenAI run exists. The extension is Gemma 4 12B alone; every test above is computed on its runs,
and H5 compares its fresh run with its own v0 run. (b) Gemma's first v0 run was stopped unfinished
and discarded: another job on the machine loads the same model at a 16,384-token context, and the
32,768-token default reloaded the model on every request. Gemma now runs through Ollama's native
endpoint at 16,384 tokens; a turn whose prompt reaches 95% of that is logged, and the count is
reported with the results.

**Results (2026-10-23, runs finished 12:02 UTC from commit 96a487b7).** As printed by
`confirm-extension.mjs`, Gemma 4 12B only:

- H1': 112 of 142 wrong numbers unsupported (79%), p = 1.25e-12. Supported. (v0 83/107, fresh 29/35.)
- H2': own company only 29, decoy only 15, p = 0.024. Supported.
- H3': unsupported plus invented, closed against tool: v0 105/150 against 16/150, restatement 33/60
  against 1/60, fresh 39/75 against 7/75. Supported in every set; but the tool arm reached the
  six-turn limit on 100, 40 and 40 items, mostly after calling the tool with a guessed ticker that it
  does not know and repeating the call.
- H4: revised 0, first-reported 0 closed-book; the test cannot be computed. Not supported.
- H5: v0 1/120 against fresh 0/60 correct, p = 0.67. Not supported.
- Exploratory: tool arm, 18 of 60 answerable fresh items correct.
- Turns that reached 95% of the 16,384-token context: tool arm 10, 1 and 10 (v0, restatement,
  fresh); closed-book none.

## Pre-registration for the large-company and name-lookup runs (2026-10-24)

Fixed in this commit, before any of these runs was made. Two reviewer concerns motivate it: the v0
companies are mostly small, so closed-book models answer almost nothing correctly; and Gemma 4 12B's
tool runs mostly ended at the six-turn limit, often after it guessed an unknown ticker.

- **Large set.** 60 large, widely covered US companies, listed before any item was made
  (`tickers.txt`: AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO BRK-B LLY JPM V UNH XOM WMT MA PG JNJ HD
  COST ORCL ABBV MRK KO PEP CVX BAC ADBE CRM NFLX AMD CSCO MCD TMO INTC IBM QCOM TXN AMGN CAT GS MS
  WFC C AXP BA HON GE DIS NKE MMM UPS LOW SBUX PFE T VZ CMCSA SHW TRV). Each company's published
  reference record and the SEC companyfacts snapshot it cites (hash checked) were fetched on
  2026-10-23; `generate.mjs --per-company 5 --seed 20261024` made 262 items, all accepted by the
  checker (`filing-facts-large.jsonl`, SHA-256 `df535e43...3e`). Runs sample 30 per template with
  seed 20261024.
- **Name lookup.** `company_financial_history` now also takes a company name, resolved through the
  release's published name index (exact match after removing case, punctuation and legal form, then
  a unique match on the start of the name; several matches are listed, never guessed). Commit
  a2c4c5b2.
- **Runs**, all Gemma 4 12B through Ollama as in Amendment 1 (16,384-token context, thinking off,
  temperature 0): large set closed-book; large set with the ticker-only tool (code d61b857c);
  large set with the name-lookup tool (this branch); the 150 v0 items with the name-lookup tool.
  Earlier Gemma runs (v0 closed-book and ticker-only tool) are reused from the 2026-10-23 extension.

`confirm-large.mjs` (this commit) computes every test at alpha 0.05 and reports it whatever it shows:

- **H6.** Closed-book correct numbers per answerable item are higher on the large set than on v0
  (one-sided Fisher exact).
- **H7.** Closed-book wrong numbers that equal a reported value (superseded version, other period,
  other line item, sign, scale or percent slip) are a larger share on the large set than on v0
  (one-sided Fisher exact): when a model knows a company, its wrong numbers are more often real
  figures misplaced.
- **H1''.** On the large set, closed-book, more than half of wrong numbers are `unsupported`
  (one-sided exact binomial against 0.5).
- **H2''.** On the large set, closed-book, wrong numbers match their own company's history more
  often than a decoy's (one-sided exact McNemar).
- **H8.** Paired by item and pooled over v0 and the large set, fewer items reach the six-turn limit
  with the name-lookup tool than with the ticker-only tool (one-sided exact McNemar).
- **H9.** Paired the same way, more answerable items are correct with the name-lookup tool
  (one-sided exact McNemar).

A run that fails for a reason outside the model (machine, Ollama, network) is rerun from the start
and the failure reported. Turns that reach 95% of the context are counted and reported.

## Pre-registration for the DeepSeek runs (2026-10-23)

Fixed in this commit, before any of these runs was made. The extension and large-company rounds
ran one small open-weight model, because the OpenAI and Anthropic accounts had no usable credit
that day. This round adds a stronger hosted model that the owner funded for the papers: DeepSeek's
`deepseek-flash` (served as DeepSeek-V4.1-Flash-1017), through DeepSeek's OpenAI-compatible API with
thinking off, temperature 0 and a 3,000-token answer cap, the same prompts and the same six-turn
limit. The tool arm uses the name-lookup tool (commit a2c4c5b2). Only items already published in
this release, or built from public filings in the rounds above, are sent; no held-out item is.

- **Runs, in this order** (`run_deepseek.sh`, this commit): closed-book on v0 (150 items, seed
  20260926), the large set (150, seed 20261024), the restatement set (60, seed 20261023) and the fresh
  set (75, seed 20261023); then the same four with the tool. The samples are the ones the earlier
  rounds used.
- **Then, only if the balance allows,** `deepseek-v4-pro` closed-book on the same four sets, as a
  secondary replication of the closed-book tests.
- **Spend.** The account held USD 5.65. Before each run the script reads the balance and skips the
  run if it is below USD 0.40 for a closed-book run or USD 1.20 for a tool run (about twice the
  estimate from earlier runs' token counts at USD 0.30 per million input and USD 1.20 per million
  output tokens). Skipped runs are reported. A run that fails for a reason outside the model
  (network, provider error) is rerun from the start and the failure reported.

`confirm-deepseek.mjs` (this commit) computes every test on `deepseek-flash` at alpha 0.05 and
reports it whatever it shows:

- **D1.** Closed-book, v0, fresh and large sets pooled: more than half of wrong numbers are
  `unsupported` (one-sided exact binomial against 0.5).
- **D2.** Closed-book, all four sets pooled: wrong numbers match their own company's history more
  often than a decoy's (one-sided exact McNemar).
- **D3.** Unsupported plus `invented_*` answers per item are fewer with the tool than closed-book,
  pooled over the four sets (one-sided Fisher exact), with the count per set reported.
- **D4.** On restatement items, closed-book answers equal to the revised figure outnumber those equal
  to the first-reported one (one-sided exact binomial on the two counts). This is H4 on a stronger
  model; Gemma 4 12B gave neither.
- **D5.** Closed-book correct numbers per answerable item are higher on v0 than on the fresh set
  (one-sided Fisher exact). This is H5 on a stronger model.
- **D6.** Closed-book correct numbers per answerable item are higher on the large set than on v0
  (one-sided Fisher exact). This is H6.
- **D7.** Closed-book wrong numbers that equal a reported value are a larger share on the large set
  than on v0 (one-sided Fisher exact). This is H7.

Reported with no test: tool-arm accuracy on answerable items and the number of tool runs that
reached the six-turn limit, per set. If `deepseek-v4-pro` runs, D1, D2 and D4 to D7 are computed
again on it and labelled secondary.

**Results (2026-10-23, runs 17:35-17:46 UTC from commit c77019e1).** Every planned run was made
(balance USD 5.65 before, 5.37 after); none failed or was skipped. As printed by
`confirm-deepseek.mjs`, on `deepseek-flash`:

- D1: 114 of 153 wrong numbers unsupported (75%), p = 5.1e-10. Supported.
- D2: own company only 24, decoy only 11, p = 0.020. Supported.
- D3: unsupported plus invented, closed against tool: v0 57/150 against 2/150, large 49/150 against
  2/150, restatement 16/60 against 0/60, fresh 17/75 against 5/75; pooled 139/435 against 9/435,
  p = 1.9e-36. Supported.
- D4: revised 0, first-reported 1. Not supported.
- D5: v0 3/120 against fresh 0/60 correct, p = 0.29. Not supported.
- D6: large 24/120 against v0 3/120 correct, p = 9.1e-6. Supported.
- D7: large 16/64 against v0 14/73 matching a reported value, p = 0.27. Not supported.
- Reported: with the tool, answerable items correct v0 118/120, large 117/120, fresh 60/60,
  restatement 2/60 (the tool returns only the latest-filed value, so the model abstained on 57 of
  60 first-reported questions); no run reached the six-turn limit and no request failed.
- Secondary, `deepseek-v4-pro` closed-book: D1 142/223 (p = 2.7e-5), D2 50 against 19
  (p = 1.2e-4), D5 9/120 against 0/60 (p = 0.023), D6 31/120 against 9/120 (p = 1.0e-4) supported;
  D4 (0 against 2) and D7 (24/80 against 26/102, p = 0.30) not supported.

## Limits

- A match shows where a number could have come from. It does not show that the model looked it up.
- A value reported only in filings outside the capture cannot be matched, so some `unsupported`
  numbers may have a source this check does not see.
- 150 items per run, from one stratified sample, one prompt and one day per model.
