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

## Limits

- A match shows where a number could have come from. It does not show that the model looked it up.
- A value reported only in filings outside the capture cannot be matched, so some `unsupported`
  numbers may have a source this check does not see.
- 150 items per run, from one stratified sample, one prompt and one day per model.
