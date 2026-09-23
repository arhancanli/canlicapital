# Historical filers proposal (drafted September 22, 2026)

Status: owner go on September 22, 2026; step 1 merged (PR #198); v26 staged from
slices 01–04 (3,810 companies, 813,892 admissible URLs) and v27 from slices 05–09
(2,552 companies, 916,208 admissible URLs). Counts come from the SEC bulk companyfacts archive of 2026-09-19
(`sec-bulk/capacity-20260919.json`) and a discovery run over it without the
two-year filing floor (`artifacts/seo/sec-bulk-discovery-historical-summary-20260922.json`,
slices retained under `corpus-local/discovery-historical/`). Estimates are marked
as such and derive from v25's measured ratios.

## Why this is the next family

The bulk archive holds 20,390 entities, 16,546 with US-GAAP facts from the
accepted forms. Only 7,281 filed in the two years before the snapshot; the v23
discovery rule (`filed_on_or_after` 2024-09-19) kept the rest out. v25 covers
6,391 companies. Under the September 22 flag decision (option C) a history that
ended more than two years before capture is admissible because its page states so;
the remaining reason to exclude an entity that stopped filing is gone, provided
the overview and filing index state the same condition at company level.

Discovery without the floor (latest filing on or after 2009-01-01, at least 4 of
the 72 published concepts, same forms, same exclusions of delivered and previously
queued CIKs: 7,363 excluded as known): 8,800 eligible entities in 9 slices, ranked
by concept coverage.

| Slice | Entities | Published concepts present | Latest filing |
| --- | ---: | ---: | --- |
| discovery-slice-01.json | 1,000 | 69–54 | 2013-02-21 to 2024-08-23 |
| discovery-slice-02.json | 1,000 | 54–49 | 2011-02-28 to 2024-09-17 |
| discovery-slice-03.json | 1,000 | 49–44 | 2010-11-05 to 2024-08-30 |
| discovery-slice-04.json | 1,000 | 44–40 | 2010-07-28 to 2024-08-29 |
| discovery-slice-05.json | 1,000 | 40–35 | 2009-08-07 to 2024-08-19 |
| discovery-slice-06.json | 1,000 | 35–30 | 2009-11-06 to 2024-09-13 |
| discovery-slice-07.json | 1,000 | 30–24 | 2009-08-06 to 2024-08-19 |
| discovery-slice-08.json | 1,000 | 24–18 | 2010-08-04 to 2024-09-05 |
| discovery-slice-09.json | 800 | 18–4 | 2011-05-12 to 2026-09-03 |

## Reader task

"What did this company report while it filed with the SEC?" A reader searching a
former issuer, an acquired company or a delisted filer wants the reported record
with its dates, not a current profile. The page family is the same as today's
(overview, histories, filing index, filing pages); what changes is that the
company's last filing date is stated on the overview and the filing index, and the
directory entry carries it.

## Editorial rules (additions to COMPANY_EDITORIAL_POLICY.md)

- A company whose latest accepted filing is more than two years before capture is
  a historical filer. Its overview opens with the last filing date and says that
  no later filing is in the record; the filing index says the same. No claim about
  the company's current status is made.
- Histories keep the existing notices; option C applies unchanged.
- Everything else (identity, coverage, conflicts, holds, quality flags, the
  15-company pending-review withhold) applies as it does to active filers.

## Capacity (estimate, not admission)

v25 measured 46.4 histories and 40.3 filing pages per company. Historical filers
have fewer concepts (coverage ranges above) and shorter series. Using concept
presence per slice at its midpoint and a one-fifth discount for series the
selector will not keep: about 262,640 histories; using the archive-wide median of
18 filings per company: about 158,400 filing pages. With overviews, filing indexes
and directory pages that is roughly 438,816 candidate URLs for all 8,800 entities,
on top of v25's 567,082. At v25's admitted share (98%) that is about 430,764
admissible URLs, which would put the site near 987,441 admitted company URLs
against the 800,000 goal. These are candidate counts; qualification, review and
indexing decide what counts.

## Proposed path

1. Renderer: company-level historical notice on the overview and filing index,
   directory label with the last filing date; tests with a historical fixture.
   Discovery: an explicit `--historical` mode (floor 2009-01-01) recorded in the
   summary instead of a moved snapshot date.
2. v26: capture slices 01–04 (4,000 entities with at least 40 published
   concepts) through the existing queue, review, staging and combination steps
   (about 1.1 hours of SEC API capture at one request per second), then the
   filings build, release, verification, admission and the same upload and hosted
   checks as v25.
3. v27: the remaining slices, after v26's indexing evidence.

## Not proposed

Entities without US-GAAP facts (3,844 in the archive), IFRS-only entities
(622), a current-status claim for any company, or changing the 8-concept
filing rule.
