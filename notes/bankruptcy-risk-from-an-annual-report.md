# Reading bankruptcy risk from an annual report

> A model that reads only a company's latest annual report, tested year by year on reports it had never seen,
> ranked the next year's bankruptcies better than Ohlson's O-score and Altman's Z'' across all US filers. Among
> companies with at least $10 million of assets, Ohlson's O-score did better, and the tool says so in every answer.

**Short title:** Bankruptcy risk from an annual report

**Published 2026-11-08. The features, the penalty, the test years and the resampling were fixed and committed
before the first run. Every result below is read from
[`validation.json`](/glassbox/research/default-risk-v1/validation.json); the four companies' runs are in
[`default-risk-cases-2026-11-08.json`](/glassbox/default-risk-cases-2026-11-08.json).**

## What it predicts

The chance that a company reports a bankruptcy, an 8-K under Item 1.03, within a year of filing its annual report
(10-K), from that report's own figures: profit, operating earnings, debt, working capital, retained earnings, operating cash
flow, cash, sales, interest, long-term debt, the current ratio, the change in profit, size, negative equity and two years of
losses. The labels are every Item 1.03 8-K found by the SEC's full-text search; the figures are the SEC's company
facts. No price, no rating and no analyst enters it, so it works for any company that files a 10-K.

## How it was tested

Walk-forward, from 2014 to 2025: for each year, the model was fitted only on reports whose outcome was already known,
then scored on that year's reports. A company's later reports never helped predict its earlier ones. Intervals come
from resampling companies, so a company with many reports cannot make the result look surer than it is.

## What it found

| Reports every benchmark can score | The model | Ohlson's O | Altman's Z'' | Leverage alone |
|---|---|---|---|---|
| All filers (45,510 reports, 440 bankruptcies) | 0.79 | 0.73 | 0.72 | 0.73 |
| At least $10 million of assets (37,247 reports, 388 bankruptcies) | 0.81 | 0.83 | 0.82 | 0.79 |

The numbers are the area under the ROC curve: the chance that a report followed by a bankruptcy is ranked riskier
than one that was not.

- **Across all filers** the model ranks better than each benchmark, by 0.06 to 0.07, with intervals clear of zero.
  Over all 71,130 reports scored (11,808 companies, 553 bankruptcies) its area is 0.78, and the riskiest tenth of
  reports held 46% of the bankruptcies.
- **Among companies with at least $10 million of assets** Ohlson's O-score ranks better by 0.025, with an interval
  that stays clear of zero, and Altman's Z'' is level with the model. The likely reason: the smallest filers often
  stop filing rather than report a bankruptcy, so the model learns more about shells than about the companies most
  people ask about. The tool shows both benchmark scores beside its own in every answer.
- **Its chances hold up at the risky end and fail at the safe end.** In the riskiest tenth of reports it gave 3.6%
  on average and 3.5% went bankrupt; in the next tenth, 1.2% against 1.5%. In the tenth it called safest it gave
  0.02% and 0.37% went bankrupt, more than in any of the four tenths above it: the model misreads some of the
  reports it scores lowest, so a very low chance from it is not reassurance.

## Four companies that later filed

The tool's answers for four companies, each as of a day before its bankruptcy 8-K. These runs use the final model,
which was fitted on reports up to November 2025 and so has already seen these bankruptcies: they show what the tool
says, and the walk-forward test above is the evidence of how well it predicts.

| Company | Report read | Chance within a year | Riskier than this share of 2025's 10-Ks |
|---|---|---|---|
| Rite Aid | 2023-05-01 | 16.6% | 99% |
| WeWork | 2023-03-29 | 9.1% | 99% |
| Bed Bath & Beyond | 2022-04-21 | 4.3% | 97% |
| Spirit Airlines | 2024-02-09 | 3.0% | 94% |

Bed Bath & Beyond's report gave an Altman Z'' of 6.0, which that score reads as safe.

## Use it

It is `default_risk`, in canli-markets-mcp's next release and then in [canli-mcp](/mcp-servers), with no account and
no key: give a ticker, a CIK or a name, and an optional date to see the answer as it stood then. It is a model of filings, not a credit
rating and not advice.
