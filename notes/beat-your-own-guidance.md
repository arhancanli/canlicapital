# Will a company beat its own guidance?

> A model of where a company's next EPS or revenue lands against the range it guided to: its own record blended
> with the market's. Tested quarter by quarter on S&P 500 press releases, each quarter predicted only from what was
> filed before it, it beat the market-wide rate for both EPS and revenue, with intervals clear of zero.

**Short title:** Will a company beat its own guidance?

**Published 2026-11-08. Every result below is read from
[`validation.json`](/glassbox/research/beat-probability-v1/validation.json); the guidance lines are the dataset
behind [How often do companies beat their guidance?](/notes/how-often-companies-beat-their-guidance).**

## What it predicts

Companies that guide give a range for next quarter's EPS or revenue. Most then land above it: across the quarters
read, EPS came in above the range 318 times, within it 136 times and below it 41 times. The question that matters is
company by company: does this one usually clear its range, or is it a company that lands inside it?

The model answers with three chances (above, within, below) from the company's own guided quarters, blended with
the market's rate: its own count plus four quarters' worth at the market's rate, a weight fixed before testing. A
company with a long record is read mostly from it; a company with two quarters mostly from the market.

## How it was tested

Walk-forward on 2,334 guidance lines from the press releases of the 500 companies in VOO, up to 12 quarters each:
every quarter was predicted only from what the company had filed before it. The score is the Brier score over the
three outcomes (lower is better), and the interval comes from resampling companies.

| | Quarters scored | Companies | Market's rate | Own record only | The blend |
|---|---|---|---|---|---|
| EPS | 356 | 56 | 0.494 | 0.429 | 0.408 |
| Revenue | 278 | 42 | 0.528 | 0.495 | 0.469 |

- **EPS:** the blend improves on the market's rate by 0.0865, with a 95% interval from 0.0457 to 0.1318.
- **Revenue:** by 0.059, from 0.0093 to 0.1146.
- **Where it is off:** its chances of landing above run a little low. Of the quarters it gave about 71% for EPS,
  79% landed above.
- **What it does not show:** 56 and 42 companies over about three years is little, and the market's rate comes
  from the same years. Only guidance given in press releases counts.

## Use it

It is `beat_probability` in canli-mcp's next release, on your machine with no account and no key: a ticker and
eps or revenue, and an optional date to see the model as it stood then. It is not a forecast of the share price
and not advice.
