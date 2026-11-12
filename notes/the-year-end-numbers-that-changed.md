# The year-end numbers that changed later

> We read 500 companies held by an S&P 500 fund three separate ways and looked for figures that disagree. Six companies had a year-end number that a later filing changed. None of those filings describes fixing a mistake. Here is what each one did.

**Sources:** sp500-audit-2026-11-02.json

**Published 2026-11-02. Every figure is in [the saved audit](/glassbox/sp500-audit-2026-11-02.json), with a link to each SEC filing and a row for all 500 companies.**

## What we ran

A company's annual report states its cash, assets and equity on the last day of its year. Most people assume those numbers then stay fixed. We wanted to see how often they don't, and whether our own tools read them correctly.

We took the 500 companies held by VOO, an S&P 500 fund, and ran the free `triangulate` tool from [canli-mcp](/mcp-servers) on each one. It reaches each figure by separate code from separate SEC files: the statement in the latest annual report, the filing's data tags, and the SEC's running history of reported values.

It compared 3,250 figures. Nine disagreed, at six companies. Another 21 were one line read under two labels, such as cash with and without restricted cash, where both can be right.

## What each one was

We opened the later filing behind all nine.

| Company | Figure | Annual report | Later report |
|---|---|---|---|
| Aptiv | Cash | $1.85 billion | $1.58 billion |
| Becton Dickinson | Cash | $641 million | $567 million |
| eBay | Assets | $17.61 billion | $17.44 billion |
| eBay | Equity | $4.62 billion | $4.48 billion |
| Zoetis | Assets | $15.47 billion | $15.49 billion |
| Zoetis | Equity | $3.33 billion | $3.42 billion |
| Zoetis | Cash | $2.31 billion | $2.45 billion |
| W. R. Berkley | Assets | $44.07 billion | $43.93 billion |
| Carnival | Equity | $12.28 billion | $12.27 billion |

Here is what happened in each case:

- [Aptiv](https://www.sec.gov/Archives/edgar/data/1521332/000152133226000061/aptv-20260630.htm) separated its Versigent business on April 1, 2026. The later report shows Versigent as a discontinued operation in every period.
- [Becton Dickinson](https://www.sec.gov/Archives/edgar/data/10795/000001079526000026/bdx-20260331.htm) spun off its Biosciences and Diagnostic Solutions business on February 9, 2026, with the same treatment.
- [eBay](https://www.sec.gov/Archives/edgar/data/1065088/000106508826000093/ebay-20260331.htm) adopted a new accounting standard on website software costs, ASU 2025-06, and applied it to past periods.
- [Zoetis](https://www.sec.gov/Archives/edgar/data/1555280/000155528026000024/zts-20260331.htm) stopped reporting subsidiaries outside the U.S. one month behind the rest of the company, and recast earlier periods to match.
- [W. R. Berkley](https://www.sec.gov/Archives/edgar/data/11544/000001154426000011/wrb-20260331.htm) lists two income-tax assets in its annual report, $2.7 million and $141.5 million, that are gone from the later report. Together they equal the whole gap. We found no sentence explaining it, so that link is our arithmetic, not their words.
- [Carnival](https://www.sec.gov/Archives/edgar/data/815097/000081509726000037/ccl-20260228.htm)'s total did not change. The later report splits out $14 million of noncontrolling interest.

We searched each later report for restatement and error language and found none about these figures.

## What an accounting professor added

**Updated 2026-11-06.** Preeti Choudhary, Professor of Accounting at the University of Arizona, studies immaterial error corrections. She read these cases after we published and explained them:

- A spin-off, or a business reported as discontinued, requires the earlier periods to be reclassified. That fits Aptiv and Becton Dickinson.
- A new accounting standard often does not have to be applied to past periods, but a company may choose to. It is permitted, though not common, and eBay did it.
- Carnival may have had a new noncontrolling interest this year, which then has to be shown separately for the earlier years too.
- W. R. Berkley's change looks like one that needs an explanation, especially if it is material.

She suspects the same check would find more of these differences among smaller companies, where accounting quality may be lower. That is our next run.

## Why it matters

If you read company numbers: a figure can change after it is published, and that is often no scandal. A spin-off or a new accounting rule can rewrite the past. Check which filing a number came from, and its date.

If you test trading ideas: a data source that keeps only the newest value hands your test numbers nobody had at the time. From February to August 2026, every Aptiv filing put its year-end cash at $1.85 billion. A test of a decision made in March should use that figure, not the $1.58 billion that came later.

## What went wrong, and the limits

The first run flagged a seventh company, Lennox. That one was our bug: we read its fourth-quarter revenue column as the full year. It is fixed, and Lennox shows no disagreement in this run.

Four names returned no figures, so they were not compared. The SEC now lists Hartford as Hartford Insurance Group and Equity Residential as Vivmark Residential, and we looked them up by the fund's older names. The SEC's company facts did not hold Clorox's latest annual report, and Honeywell Aerospace has not yet filed one.

This covers the latest annual report only, and seven headline figures for each company: revenue, net income, diluted earnings per share, operating income, assets, equity and cash. Agreement means the separate readings match within rounding. It cannot catch a number that is wrong the same way in all of them.

## Run it yourself

[canli-mcp](/mcp-servers) is free and needs no API key or account. Run `npx -y canli-mcp`, connect it to your AI assistant and ask it to cross-check a company's latest annual report with `triangulate`.
