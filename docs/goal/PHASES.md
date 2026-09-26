# Phases and exit evidence

| Phase | Scope | Status | Exit evidence |
| --- | --- | --- | --- |
| 0 | Review earlier work, inventory production and preserve owner objectives | Initial review complete; continuity folder added | Recorded baseline, isolated worktrees, source-linked goals |
| 1 | Source-selection correctness, bulk corpus audit and durable candidate catalog | Five cohorts rebuilt under v22; batch1 1,148 reviewed / 28 withheld, broader scope open | Production selector reused; rejected/conflicting inputs tested; atomic catalog; real corpus size reported without extrapolation |
| 2 | Relevant search-intent map and technical SEO release gates | Technical checkpoint passes local and remote checks; query/field measurement open | Canonical intent ownership, useful metadata, source-backed structured data, duplicate/crawl checks, CI enforcement and browser/performance evidence |
| 3 | Serving and discovery at corpus scale | Production serving live since 2026-09-21: function routes, bundled activation and admission, storage 10,360/10,360, sitemap index of 77,622 URLs; hosted preview and live checks passed | Durable catalog/storage, cached rendering, real 404s, bounded directories/sitemaps, measured load/cost/freshness and failure behavior |
| 4 | Release verified initial expansion and establish search measurements | v22 released 2026-09-21 (PR170); v23 2026-09-22 (PR178); v25 2026-09-23 (PR195); v26 2026-09-23 (PR201); v27 released 2026-09-23 (PR205, 3915e039): 916,208 admitted company URLs indexable including 391,891 filing pages and 6,672 historical filers; IndexNow accepted 102,521 | Passing release checks, verified production behavior, Search Console evidence, measured crawl/index exclusions |
| 5 | Grow useful corpus toward 10k, 100k, 300k, 800k and 1m indexed pages | Baseline 262 indexed as of September 14; 916,471 URLs live and submitted (v27, every eligible archive entity captured); next families quantified in NEXT_FAMILIES_PROPOSAL.md (owner decision pending) | Source and editorial gates at each stage, actual indexed counts and quality monitoring by family |
| 6 | Developer platform/API/MCP, on-site promotion and repository growth | On-site entry points and contributor guidance implemented; adoption measurement open | Open-source provenance, scoped key handling, consistent API/MCP contracts, tested examples, clear repository/MCP/key calls to action, contributor/release materials and evidence receipts |
| 7 | Engine security/reproduction, cost completeness, risk and qualified sleeves | PR71 merged after six CIjobs passed; latest verified forward evidence six current-epoch returns/four sleeves, immature; research outcomes and runtime activation pending | Honest preserved environments, CI, measured costs, governed trials, distinct admitted mechanisms and forward evidence |

Phases can overlap when independent, but read STATUS before each transition and
record why work moved. Long-lived indexing and forward-performance outcomes remain
open after implementation phases finish. Do not mark the overall goal complete on
code delivery alone.
