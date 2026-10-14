# Analyst questions for the filings tools

87 questions an analyst asks of filings, run through `financial_statements`, `filing_tables`,
`earnings_release` and `verify_claims` live against SEC EDGAR, each checked against a truth built
without the tools.

```bash
python3 -I bench/analyst/truth.py   # truths: SEC companyfacts XBRL, the raw 10-K HTML, the releases' words
node bench/analyst/run.mjs          # runs every question; writes results-YYYY-MM-DD.json
```

## What the truths are

| type | truth from | independent of the tool because |
| --- | --- | --- |
| statement, trend | SEC's companyfacts API: the value the company's latest 10-K reports for the concept and period | a different SEC product from the rendered R pages the tool reads |
| kpi, segment | the raw 10-K HTML, read by `truth.py`'s own row reader | a separate parser, written for this |
| guidance, reconciliation, beat or miss | the release's own words, quoted in `questions.json` (`source_quote`) | read by hand, the way an analyst would |
| verify | claims built from companyfacts by a separate script: true figures, last year's figure for this year, unit slips, a quarter for the year, future years, dividends from companies that pay none, a non-GAAP figure | the expected verdict and diagnosis are set by the script, not the tool |

A question passes when the tool's answer holds every expected figure: a value in any scale the
page uses, a range as one row with both ends, a beat or miss as the comparison row with the
expected position. This is tool level: no model reads the answers.

## Sets and results (2026-10-14, Node 24)

| set | what it is | first run | after the fixes |
| --- | --- | --- | --- |
| dev | companies and releases the tools were built on | 21 of 21 | 21 of 21 |
| fresh | releases never used while building, keyed before the first run | 26 of 32 | 32 of 32 |
| fresh-2 | releases added after the fixes, run once, not tuned on | | 9 of 9 |
| verify | claims for `verify_claims` on companies it was not built on | 15 of 19 | 19 of 19 |
| trap | false premises: a year not reported, a company that does not exist, a table no filing has, a release that does not exist, a dividend never paid; pass = a refusal or an empty answer, never a figure | 6 of 6 | 6 of 6 |

The fresh run found four general gaps, fixed in the tools: a guidance table introduced by a
sentence ("Cisco expects to achieve the following results:") or named by a heading row inside it;
"+/-" written in its own table cell; "expectations" and "annual" as words of guidance; and a
result stated twice, rounded and exact, where the exact one should be compared. After those
fixes the fresh set is no longer held out, so fresh-2 checks that they generalize.
`results-2026-10-14-first-run.json` keeps the first run.

The verify set's first run found two defects: SEC's company-concept endpoint answers some
companies with an empty units object (`{"USD":{}}` for Coca-Cola's Revenues and NetIncomeLoss on
2026-10-14) where its companyfacts file has the facts, which crashed the tool (now it falls back
to the facts file); and the diagnosis of a wrong figure looked in another concept than the one
the figure came from (now it starts from that one).

Median time per call 0.7 s; median answer 4,600 characters.

## Limits

- The question set is ours, and its guidance questions are the ones whose answers could be keyed
  cleanly from the release text; tables that need a person to read them were left out. It shows
  that the tools return the right figures, not how often a model answering with them is right.
- The independent test of that is the Vals.ai Finance Agent Benchmark's public questions
  (github.com/vals-ai/finance-agent): none of its companies or periods is used here, and none of
  its 44 unread questions has been looked at.
- Live runs depend on EDGAR at the time; truths are rebuilt with `truth.py`.
