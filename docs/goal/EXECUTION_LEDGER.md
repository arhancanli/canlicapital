# Direct execution ledger

Updated September 21, 2026. Codex implements directly; Hermes delegation is stopped.
The full goal remains active and unachieved. Read STATUS.md for exact hashes,
process handles and the latest checkpoint. Earlier ledger preserved in
[history/EXECUTION_LEDGER-20260921-before-scope-v19-refresh.md](history/EXECUTION_LEDGER-20260921-before-scope-v19-refresh.md).

| Work | Verified state | Next required outcome |
| --- | --- | --- |
| Expansion | Released 2026-09-21 (PR170): of 90,732 v22 URLs, 77,359 are admitted and indexable (3,308 overviews, 73,984 unflagged histories, 67 directories); 13,373 are served noindex (12,959 flagged histories; 414 pages of 15 companies with pending scope review). | Measure indexing by family; review flagged histories and pending companies for later admission; grow beyond v22. |
| Release checks | Scope-v29 HTTP passed90,732 pages/6,646 downloads; browser passed1,392 cases/1,540 exact note-source checks. Archive reproduced45 reports. Clean hosted preview passed32 browser cases but last readiness failed seven download checks. | Validate later scope-v30/31 notes, finish storage, hosted downloads, cloud-load/cost and failure gates. |
| Storage transfer | Recovery79720 completed: 10,360/10,360 verified objects, 0 failures. Production reads these objects through the bundled activation. | Monitor availability; separate off-site evidence backup remains open. |
| Evidence retention | Full v22 runtime and batch1/scope supplements restored locally. Latest sealed batch2 scope-v29 archive54731 restored all45 reports from745 files, including all eleven pending reports. | Offsite backup, ongoing maintenance and coverage for subsequent changes. Local restore is not independent certification. |
| Editorial review | Batch1: 1,148 reviewed (130 presentation-only), 28 withdrawn, none pending. Batch2: 672 reviewed (104 presentation-only), 128 pending, none withdrawn. Twelve discrepancy/hidden-mapping/reconciliation reports remain pending, including The9 profitable-year loss explanation. | Resolve or retain unresolved scope honestly; continue broader source/usefulness review. |
| Indexing and SEO | Live sitemap index with stable children (site 263, companies 50,000 + 27,359 = 77,622 URLs), verified September 21 as Googlebot. IndexNow submits deltas only. Last confirmed Google indexing: 262 pages as of September 14. | Search Console resubmission by the owner, then crawl/index measurement by family; at least 800,000 actually indexed canonical pages, targeting one million. |
| Relevant content coverage | Last recorded inventory: 8,031 discovered issuers and 104 intent owners. Staged, not live: v23 (156,714 admissible), v25 = expanded concepts + filing family (556,677 admissible, 256,726 filing pages); flag decision of September 22 applied. Existing coverage cannot support the indexing goal alone. | Expand useful, distinct, supportable source/content families and relevant search intents. |
| Developer platform | MCP 0.2.0 published to npm and the official registry (PR183); 191 npm downloads 2026-09-15 to 2026-09-21; canlicapital 0 stars, alphac 0 stars on September 22 (`developer-adoption-20260922.json`). | Substantive releases; weekly star and download measurement. |
| Engine implementation | PR71 and PR72 merged; running checkout fast-forwarded to 025dd27 on September 21 with the live-change gate green (553aff51). PR73 (test counts) open. | Merge PR73; nightly publish regenerates audits; health check expected green on the next run. |
| Strategy outcomes | September21 local maturity report and all12 source hashes verified: six current-epoch returns/four sleeves; immature, no Sharpe estimate. | Combined net forward Sharpe above 2, at least 14 economically distinct qualified sleeves, and realized maximum drawdown at most 10%. |
| Continuity | REQUIREMENTS.md preserves every owner objective; STATUS.md records the current checkpoint; LOG.md retains transitions and failures. | Keep these records consistent with files, PRs and live process evidence. |

Evidence references: current batch2 archive receipt is
`artifacts/seo/company-batch2-evidence-archive-scope-v29-20260921.json`;
developer baseline is `artifacts/seo/developer-adoption-baseline-20260921.json`.
No repository activity, archive, local test, staged URL or submitted sitemap is
counted as a newly indexed page or achieved strategy outcome.
