# FilingFacts v0: financial reasoning items verified from SEC XBRL data

**Short title:** FilingFacts v0 dataset
**Author:** Arhan Canli
**Declared:** 2026-09-26, with its build and evaluation records published beside it.
**License:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

FilingFacts is a set of 1,882 questions about the annual SEC filings of 402 companies.
Every answer is computed from the company's XBRL facts, re-derived by an independent checker, and
cited to the accession number of each filing it depends on, so a model's answer can be scored
against the filing rather than against another model.

## What is in it

| template | asks for | hops | items |
|---|---|---|---|
| change | the percent change of one concept between two fiscal years or balance dates | 2 | 402 |
| lookup | one value as reported in a named annual filing | 1 | 402 |
| net_assets | total assets minus total liabilities at one balance date | 2 | 338 |
| ratio | a ratio of two concepts for the same period (margin, leverage, cash share) | 2 | 402 |
| unanswerable | a period before the concept's earliest annual XBRL fact; the right answer is that the XBRL filings do not report it | 1 | 338 |

The items cite 3,024 facts from filings made between 2009-11-20 and 2026-09-11,
for periods ending between 1988-01-14 and 2026-06-30. Figures on this page are read from
[`/glassbox/datasets/filing-facts-v0.json`](/glassbox/datasets/filing-facts-v0.json).

Rules: only annual-report facts (fiscal period FY on 10-K, 20-F, 40-F and their amendments), so a
question never mixes a quarter with a year; one value per concept, period end and unit; a period
whose annual filings disagree on the value is dropped as ambiguous; an unanswerable item claims
absence only from the company's XBRL filings.

## Baseline: gpt-5.4-mini, 150 items, closed book and with a tool

| | closed book | with canli-validation-mcp's company tool |
|---|---|---|
| accuracy, all items | 19.3% | 68.0% |
| accuracy on answerable items | 0.8% | 65.8% |
| numbers given on answerable items that were wrong | 98.7% (76 numbers) | 17.7% (96 numbers) |
| answerable items the model called "not reported" | 36.7% | 14.2% |
| unanswerable items answered "not reported" | 93.3% | 76.7% |
| unanswerable items answered with an invented number | 0.0% | 0.0% |
| mean tokens per item | 187 | 3,833 |

By template (accuracy, closed book then with the tool): change 0.0% and 40.0%; lookup 0.0% and 80.0%; net_assets 0.0% and 73.3%; ratio 3.3% and 70.0%; unanswerable 93.3% and 76.7%.

Accuracy on all items rewards a model that answers "not reported" to everything, because the
unanswerable items then score. The behaviour rows separate knowing that data is absent from
declining to answer.

## Download

| file | contents | size |
|---|---|---|
| [filing-facts-v0.jsonl](/datasets/filing-facts/v0/filing-facts-v0.jsonl) | the items, one JSON object per line | 1,624 KB |
| [ff-eval-closed.json](/datasets/filing-facts/v0/ff-eval-closed.json) | closed-book baseline, every run | 32 KB |
| [ff-eval-mcp.json](/datasets/filing-facts/v0/ff-eval-mcp.json) | baseline with the company tool, every run | 32 KB |
| [gold-packet-v0.json](/datasets/filing-facts/v0/gold-packet-v0.json) | the gold packet annotators fill in | 28 KB |

Checksums: [SHA256SUMS](/datasets/filing-facts/v0/SHA256SUMS). The generator, the independent checker and
the evaluation harness are in [`scripts/datasets/filing-facts/`](https://github.com/arhancanli/canlicapital/tree/main/scripts/datasets/filing-facts), so
anyone can rebuild the items from the public company data, including from filings made after a
model's training cutoff.

## License and citation

The items are released under CC BY 4.0. The underlying SEC filings are US public domain.
Cite as: Arhan Canli (2026), FilingFacts v0: financial reasoning items verified from
SEC XBRL data, Canli Capital, https://canlicapital.com/research/filing-facts-v0.

## Help verify it

No item has been verified by a person yet (0 of 1,882). The gold packet holds
50 items stratified by template; [the annotation guidelines](https://github.com/arhancanli/canlicapital/blob/main/scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md)
say how to check each one against the filing itself. Two annotators fill copies independently, and
`agreement.mjs` reports raw agreement and Cohen's kappa for each judgement.

## Evidence boundary

The answers are checked against XBRL facts, not against the filings' rendered text, so a filer's
tagging error becomes the dataset's answer. The baseline covers one model on a fixed sample and
says nothing about other models. Restatement items (first-reported versus later-reported values)
are planned for a later version.
