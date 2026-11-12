# How often companies beat their own guidance

> We set what S&P 500 companies said they would report against what they then reported, quarter by quarter, from their own press releases. Given a range, they landed above it far more often than below it: revenue 170 times against 13, earnings per share 259 times against 24.

**Sources:** sp500-guidance-2026-11-02.json

**Published 2026-11-02. Every figure is in [the saved run](/glassbox/sp500-guidance-2026-11-02.json), with a row for all 500 companies and a link to each release.**

## What we ran

Many companies tell investors what to expect next quarter, such as revenue in a given range. The next release says what happened, and the headline says the company beat or missed. We wanted to know how much a beat tells you.

We took the 500 companies held by VOO, an S&P 500 fund, and ran the free `guidance_record` tool from [canli-mcp](/mcp-servers) on each one, reading up to 12 quarterly releases. It sets each guide against the next release, and matches the measure, the basis (adjusted against adjusted, GAAP against GAAP) and the unit.

Only 140 of the 498 companies we could read had a figure in their releases that could be matched. Many give guidance on the call or not at all. Apple has no line here, for example. To keep one quarter from counting as a record, the totals use companies with at least 4 guided quarters: 47 for revenue and 54 for earnings per share.

## What came back

Where the guide was a range:

| Measure | Guided quarters | Above the range | Within it | Below it |
|---|---|---|---|---|
| Revenue | 341 | 170 (49.9%) | 158 (46.3%) | 13 (3.8%) |
| Earnings per share | 414 | 259 (62.6%) | 131 (31.6%) | 24 (5.8%) |

Some companies guide to one figure instead, which a result rarely meets exactly, so we count those apart. Revenue came in above a single figure 58 times and below it 4 times. Earnings per share came in above 43 times and below 9 times.

With both kinds together, revenue landed above the guide 55.7% of the time and below it 4.2%, over 409 quarters. Earnings per share landed above 64.8% of the time and below 7.1%, over 466 quarters.

Most of these companies never fell short at all in what we read: 37 of the 47 on revenue and 35 of the 54 on earnings per share.

## Why it matters

If you read company news: a beat is the usual result for a company that guides, so on its own it says little. A company that nearly always beats may simply set its range low. A miss is the rarer event.

If you test trading ideas: a guide is the company's own choice of number. A result above it is not the same as a result above what other people expected, and this study does not measure what the share price did next.

## What went wrong, and the limits

Reading this by rules is harder than it looks. We read random samples by hand before publishing, and each one found mistakes in our own reader. It took a range broken across two lines as one figure at Coherent, a full-year guide as a quarter's at Hershey, last year's figure as the guide at Ecolab, and sales volumes in tonnes as revenue at Mosaic. It also set organic growth against total growth at Zebra. All of these are fixed in the version used here.

In the last sample, 29 of 30 lines were right. The wrong one, at Equinix, read a breakdown of revenue by currency as growth, and that is fixed too. We did not read every line, so expect a small share of the rest to be wrong, and open the link behind any line you rely on.

This covers guidance stated in the release itself, not on a call. It covers companies in the index today, so ones that fell out after bad years are missing, and it reads 12 releases at most. For each company and measure it counts the basis and unit guided most often, one line a quarter. It does not say why a company landed where it did.

Two names returned nothing, because we looked them up by the fund's older names: the SEC now lists Hartford as Hartford Insurance Group and Equity Residential as Vivmark Residential.

This is a record of what was said and what came, not a forecast and not a view on any company.

## Run it yourself

[canli-mcp](/mcp-servers) is free and needs no API key or account. Run `npx -y canli-mcp`, connect it to your AI assistant and ask how often a company has beaten its own guidance. It will use `guidance_record`.
