# FilingFacts first and later reported candidates (v1)

This is a small candidate-generation tool, separate from the published v0 dataset,
evaluation and annotation browser. It compares two eligible reports of the same
exact USD/us-gaap interval in a captured SEC companyfacts response. Every output
is an unreviewed machine candidate. A value difference does not establish an
accounting restatement or its cause, and no person has verified these items.

The initial evidence packet has 14 candidates, two per company, from seven
already archived representative sources with an explicit `2026-09-18` filed-date
cutoff. Node checks and a separate Python implementation reproduce their values,
filing selection and arithmetic. It is an implementation sample, not a held-out
model benchmark, a representative corpus estimate or adjudicated human gold.

## Source and reuse scope

The source audit is in
`artifacts/goal/filingfacts-v1-source-audit-20261001.json`. Each company has one
captured response from September 19, 2026. The selected record's hash binds its
metadata; the uncompressed response hash binds the facts. Those checks do not
independently authenticate SEC authorship, time-attest capture metadata or prove
complete filing history. Earliest means earliest eligible observation **present
in this snapshot**, never first-ever reporting. Dates provide no intraday ordering.

The [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
describes companyfacts as aggregated standard-taxonomy, entity-wide facts from
submissions. The [Copyright Office's explanation](https://www.copyright.gov/help/faq/faq-protect.html)
distinguishes facts from potentially protected expression. Our scope decision
uses selected numeric facts and identifiers with newly authored questions. It
copies no filing prose, exhibits or logos, adds no raw snapshot redistribution,
and assumes no blanket public-domain status for every company filing. Code uses
the repository license; the authored sample questions use the existing FilingFacts
CC BY 4.0 attribution convention. Source links and company/accession identifiers
must remain with redistributed samples.

## Qualification and refusal rules

The policy is versioned as `canli.filing-facts-annual-source-policy.v1`. It keeps
USD/us-gaap rows from 10-K or 10-K/A filings with `fp: FY` and an exact inclusive
duration of 335 through 395 days. `fp` is filing context, not the fiscal year of
the compared observation. Exact start/end dates identify the observation; no
concept aliases, currencies, quarter/YTD or instant periods are combined. This
initial policy also requires safe integer USD values and a safe integer difference.
Fractional or larger amounts need a separate decimal policy, not silent rounding.

Eligible rows satisfy `filed <= as_of`; the cutoff must be a real date no later
than the capture date in the record. This is a date-filtered snapshot question,
not an intraday-availability or backtest decision-time guarantee. A later distinct
filed date and a changed endpoint value are required. Equal endpoints with an
intermediate change are counted as reverted, separately from unchanged groups.

Repeated identical rows within an accession count once. Conflicting values or
metadata for one accession refuse the entire group. Different values on the same
filed date also refuse the group because the snapshot has no acceptance timestamps
to order them. Invalid qualifying source rows refuse the group. Excluded row
counts and rejected group counts have separate denominators in the summary.

The answer contains the earliest and later values, `later - earliest`, and
`100 * (later - earliest) / abs(earliest)`. Percentages use binary64 arithmetic
without display rounding. A zero earliest value produces `null` with
`percent_difference_status: zero_earliest`; it never becomes zero percent.

## Reproduce and inspect

Run on Node 22. The generator reads local regular files only, verifies hashes and
company metadata, and independently checks every selected output by rereading the
archives. It refuses to overwrite an existing output or summary. No network,
model, submission, cloud, annotation or broker action is part of these commands.

```sh
node scripts/datasets/filing-facts/v1/generate.mjs public/company-data public/company-data/sources /tmp/new-first-later.jsonl 2026-09-18 2
node scripts/datasets/filing-facts/v1/check.mjs /tmp/new-first-later.jsonl public/company-data public/company-data/sources
python3 scripts/datasets/filing-facts/v1/oracle.py /tmp/new-first-later.jsonl public/company-data public/company-data/sources
node --test scripts/datasets/filing-facts/v1/first-later.test.mjs
```

The Node checker imports neither generator selection nor arithmetic. The Python
oracle imports no JavaScript implementation and independently recomputes the
selected source values and endpoints; it is a numerical oracle, not a schema or
expert-review certificate. Synthetic tests cover exact-period separation, date
cutoffs, accession conflicts, same-day ambiguity, zero/negative values, reversals,
unsafe arithmetic, source corruption and tampered self-hashed answers. Failures,
the real-source packet and exact verification logs are retained under
`artifacts/qa/filingfacts-v1-20261001/`.

Human source-document review, cause/basis adjudication, broader/decimal/quarter
policies, genuinely held-out model evaluation and a separately verified public
v1 release remain outstanding. All existing v0 files and public results remain
unchanged; this tool does not fill the 50-item gold packet.
