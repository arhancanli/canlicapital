# Current state

Updated 2026-09-20. Overall owner goal: **ACTIVE, NOT ACHIEVED**.
Codex leads implementation; Hermes remains stopped. REQUIREMENTS.md preserves all
objectives. Previous checkpoint detail is retained in
history/STATUS-20260920-before-capacity-review.md and LOG.md.

## Measured counts

| Measure | Current evidence |
| --- | --- |
| Google-reported indexed pages | 262 as of September 14; export September 20. Aggregate, not URL-level canonical proof. |
| Not indexed | 40: 32 noindex, 3 redirects, 3 discovered, 2 crawled. |
| Live sitemap | 263 URLs, checked September 20. |
| Static local build | 690 HTML pages: 327 indexable, 363 noindex. |
| Company candidate | 1,968 companies + 52,408 histories + 40 directories = 54,416 URLs; 3,936 downloads. |
| Owner indexing minimum / target | 800,000 / 1,000,000 actually indexed canonical pages. |
| Intent map | 104 owners, 147 query hypotheses, 223 unassigned static pages. |
| Engine snapshot | Five daily returns, four sleeves; September 20 at 06:27 UTC; IMMATURE_RECORD_TOO_SHORT. |

Static and company counts overlap through pilot pages. Staged, served, submitted
and confirmed indexed counts remain separate. Google aggregate coverage does not
identify the exact indexed canonical set.

## Content quality and source capacity

Extended-v3 corrects eight source-scope errors while preserving original SEC bytes
and v1/v2 reproducibility. Earlier releases are not publishable as-is. Current
release: 05cd9ff3582accff5277d49c1eb1eba7e55af8efe68fee1b2200219a88eb9f05.
All 33 constant-history cases have latest-selected-accession comparisons; these
are not proof of all-history correctness or usefulness. There are 6,705 overlapping
quality flags. Full editorial and intent review remains open. See
COMPANY_EDITORIAL_POLICY.md and SEARCH_INTENT_REVIEW.md.

The capacity audit reconciles 8,031 discovered CIKs, 5,687 unqueued entities and
34 concepts. Retaining current selections and exclusions, even assigning every
remaining company all concepts gives at most 253,575 candidate URLs. Current
discovery alone cannot reach 800,000. Broader sources and useful content families
must be validated; the goal is unchanged. See SOURCE_CAPACITY.md. A SEC bulk archive
HEAD request returned 403; no retry or body download occurred.

Retained issuer discovery adds 56 unattempted identity candidates after removing
four already-staged CIKs and holding back five prior acquisitions. No new pages
or eligibility claims. Seven cached bodies match recorded hashes; three use a
string CIK and need schema review. All 37 retained bindings verify, and replay is
identical. This new material is outside the earlier v3 archive. See SOURCE_CAPACITY.md.

Identity audit reproduces all 106 INVALID_ENTITY exclusions from captured bytes.
Ten named records with matching CIK text have at least four qualifying core
histories. Their 13 latest core filings are now captured: all cover CIKs and all
137 selected observations match, enforcing context identity and units. The 26
source responses verify. No CIK normalization or policy change; old exclusions
and release remain unchanged. Versioned exception design is pending. These new
filing bodies are outside the sealed archive. The 13 selector tests passed. See COMPANY_IDENTITY_REVIEW.md. Parent/subsidiary name
conflicts mean numeric-string conversion alone is not an acceptance rule.

## Delivery and retention

Local v3 HTTP replay checks all 54,416 pages and 3,936 downloads with exact sitemaps,
zero failures and a four-link bound from /companies. Browser verification covers
114 checks across 19 sample routes. These are not hosted capacity measurements.
Runtime plan: 6,249 objects / 828,340,450 bytes; no upload performed.

V3 archive: 13,183 files / 1,695,528,960 bytes;
SHA256 27d5ffe86251571d767106e0ab06f81b420da4d4fe841f412a48bcba627ea76f.
Isolated restore replays three queues, 381 exclusions and exact runtime objects.
Remote destination/access, offsite retention and hosted preview remain unresolved.
The storage question is pending; permission and access are not assumed.

## Evidence and verification

Website refresh aee1ff55 imported 53 changed/added source files, excluded seven agent
state files and rebuilt dependent outputs. All 163 content hashes and two signatures
reproduce. The transparency verifier passes 1,060 entries; the prior 953 entries
remain unchanged. See EVIDENCE_REFRESH.md. Production was not updated by this work.

Live checks confirmed no persistent HTTP, canonical or noindex defect. The audit
misclassified failed raw downloads as missing noindex; that bug is fixed. Failures
and successful rechecks are retained. The five Google discovered/crawled exclusions
still need URL-level exports. See INDEXING_BASELINE.md. Browser tab/export access
works; assistive access is denied, Apple Events JavaScript disabled and screenshot
capture unavailable. No settings were bypassed.

Website 4e169847 passed CI35496483722; the prior full local build/verify passed
6 + 384 tests and final audits. Engine PR68 ce93d8c fixes nested agent-state copying;
13 focused tests and Ruff pass, and full CI35494803169 now passes all six jobs.
PR69/70 previously passed; verify their current state before release.

## Platform and governed engine

API/MCP onboarding, provenance, error handling and key revocation are implemented
and tested. MCP has 48 passing tests at the last checkpoint; the PostgreSQL
revocation race contract passes CI. Production migration is not applied; MCP 0.1.1
is not published. Real adoption remains unestablished. The 12 public validations
previously observed are unattributed, not proof of independent use.

Targets remain combined NET FORWARD Sharpe >2, at least 14 economically distinct
qualified sleeves and realized maximum drawdown <=10%. Five returns and four
sleeves do not establish them; forward Sharpe remains withheld. Synthetic Hermes
prototypes remain UNAPPROVED. Independent blind labels and owner-reserved protocol
decisions cannot be automated away. No broker orders or unauthorized activation.

## Next work

1. Review editorial quality and expand source coverage without artificial variants.
2. Resolve storage access, verify a hosted candidate and prepare a concrete release.
3. Inspect Google's five excluded URLs when category exports arrive; measure actual
   indexing after publication against the dated 262-page baseline.
4. Verify engine CI and research gates; pursue qualified mechanisms within contracts.
5. Complete developer release readiness and measure genuine adoption.

No PR was merged, provider created, production migration applied or broker order
issued by this work. The goal remains active. See EXECUTION_LEDGER.md.
