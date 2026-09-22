# Filing page family proposal (drafted September 22, 2026)

Status: proposal, not implemented. Counts come from the retained SEC source
bytes of the v24 delivery (6,391 companies, policy extended-v23, 72 published
concepts). They are capacity, not admitted pages or indexing.

## Reader task

"What did this company report in this specific filing?" A reader who has a
10-K or 10-Q in mind (a fiscal year, a quarter, an amendment) wants the values
that filing tagged, on one page, with the periods that filing covered. The
company history pages answer a different question (how one measure moved over
time, latest-filed value per period). The filing page is the cross-section.

## Identity

`/companies/{cik}/filings/{accession}` with the accession in SEC form
(`0000320193-25-000079`). One page per accession. The page links to the SEC
filing index (`https://www.sec.gov/Archives/edgar/data/{cik}/{accession without
dashes}/`) and to the company overview. Amendments (10-K/A, 10-Q/A) are their own
pages, labelled as amendments, never merged into the original.

## Content, all from the captured companyfacts bytes

- Form, filed date, fiscal year and period as tagged by the filer.
- A table of every published concept the filing reported: concept label, period
  (instant date or start to end), value, unit. Duration facts in a 10-K include
  the annual period and often quarters; a 10-Q includes the quarter and year to
  date. All periods the filing tagged are shown, marked by length, so the page
  is "as reported in this filing", not the selected latest-filed series.
- Provenance: the companyfacts source URL and SHA-256 already bound to the
  company record; the filing page is a view over the same bytes.
- The record's claim boundary and a filing-specific note: values are as tagged
  in this filing and may have been restated later; the history page shows the
  latest-filed value per period.
- No narrative, no derived ratios, no text from the filing document.

## Editorial rules

- A filing page requires at least 8 distinct published concepts in that filing;
  below that the cross-section is too thin to be useful and stays unbuilt.
- Forms limited to 10-K, 10-Q, 20-F, 40-F and their amendments (the same set the
  selector accepts).
- Filings whose facts conflict within the same period and unit (the selector's
  CONFLICTING_FACTS condition) are withheld pending review.
- Pages inherit the company's admission: a withheld company has no indexable
  filing pages; the filing family gets its own quality flags (very old filings
  marked historical, amendments marked).
- Existing review holds apply: an observation excluded by an editorial decision
  is excluded on the filing page too, with the same reason.

## Capacity from the v24 sources

| Measure | Count |
| --- | ---: |
| Filings of accepted forms with any published concept | 258,392 |
| Filings with at least 8 published concepts (proposed page rule) | 257,029 |
| Filings with at least 20 published concepts | 238,666 |
| Companies with at least one qualifying filing | 6,383 of 6,391 |
| Qualifying filings per company: median / p90 / max | 44 / 65 / 78 |
| By form: 10-Q / 10-K / 20-F / 10-Q/A / 10-K/A / 40-F | 186,089 / 60,688 / 4,112 / 3,707 / 2,206 / 227 |
| Facts on those pages | 25,001,832 |

Under the clean-set style rule (withheld companies excluded, amendments and very
old filings flagged), roughly 230,000 filing pages would be indexable. Together
with the v24 histories that is about 475,000 indexable URLs, with 800,000 still
requiring the flagged-page reviews and further families.

## Implementation path

1. `scripts/lib/company-filings.mjs`: derive filing cross-sections from a
   captured source under a named policy (`filings-v1`), with the 8-concept rule,
   the form set, the conflict withhold and the editorial-hold inheritance.
2. Renderer template for the filing page, sharing the company page assets and
   the provenance block; tests for a 10-K, a 10-Q and an amendment fixture.
3. Catalog: a per-company filing index object (accession, form, filed, fiscal
   year and period, concept count) so the function can list and serve filing
   pages without reading the whole source; the source snapshot stays the single
   download.
4. Function routes `/companies/{cik}/filings` (index page, noindex until admitted)
   and `/companies/{cik}/filings/{accession}`; discovery sitemaps gain a filing
   family; the admission file gains a filing section keyed by accession.
5. Selected-quality audit for filings; admission builder rule; local HTTP audit;
   storage upload of the new objects; hosted readiness; browser audit; activation.

Rough scale: about 230,000 new indexable pages, one release cycle plus renderer
work (two to three days), and roughly 0.5 GB of new catalog objects (the sources
are already stored).

## Not proposed

Full-text of filings, MD&A or footnote extraction (a different source and a
different rights review), per-segment or per-member breakdowns, and any page
built from fewer than 8 concepts.

## Storage layout decision (September 22, 2026)

Measured over the v24 delivery with `scripts/lib/company-filings.mjs` (policy
filings-v1): 257,357 filing pages across 6,391 companies, none withheld, 1,366
thin (`artifacts/seo/company-filings-size-measurement-v24-20260922.json`).

| Measure | Value |
| --- | ---: |
| Per-company filings document, JSON: median / p90 / max | 674 KB / 1.34 MB / 1.83 MB |
| Companies whose document exceeds the 1 MiB record limit | 1,708 |
| Per-filing document: median / max | 17.7 KB / 58.5 KB |
| Whole family, uncompressed | 4.50 GB |

Decision: one gzip object per company (`canli.company-filings.v1`, served as
`application/gzip`), read by a dedicated reader that inflates under a 4 MiB
cap, referenced from its own filings catalog tree (same node schema, separate
root bound in the release). One object per filing would mean 257,357 uploads at
the observed two seconds each, which is days; per-company objects are 6,391
uploads and roughly 0.5 GB compressed. A filing page reads one object.

