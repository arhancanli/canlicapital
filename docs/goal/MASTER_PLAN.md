# CanliCapital goal structure

Reconciled 2026-10-01 from the owner's Claude messages, VISION.md, REQUIREMENTS.md,
MCP_NEXT_MAJORS_PLAN.md, MCP_TRADING_DESIGN.md and the actual repository and live servers.
The goal is active. This is an execution map; ambitions are not measured achievements.

## 1. MCP infrastructure for agentic finance

Each server must have a distinct useful workflow, accurate results, compact stable tool lists,
low measured latency, low token cost, understandable errors, independent checks and working
examples. Keep improving existing servers while expanding the family. The owner's requests
for the biggest finance/quant family and scores above 9 remain targets, never claims.

| Server | Purpose and next substantial work | Verified checkpoint (2026-10-01) |
| --- | --- | --- |
| Validation | Calibrated audit, counted research trials, return/trade reconciliation, costs, leakage checks and useful remediation | Hosted/npm 0.10.1, 15 tools |
| Fundamentals | First-reported financial data; complete quarters/TTM, survivorship-aware universe, statements, factors and input audit | Hosted 0.5.0, 7 tools; npm 0.1.0 |
| Research | Find prior trials/papers, explain failures, preflight ideas, check feasibility and artifact integrity | Hosted 0.2.0, 6 tools; npm 0.1.0 |
| Execution | User-stated sizing and limits, pre-trade costs, post-trade shortfall, signed journals and paper execution | Private/unreleased 0.1.0 source, 4 tools including local shortfall; #339 merged; not on npm |
| Backtest | Local point-in-time backtests, validation and evidence receipts | Future family member; inspect canli-backtest/canli-pit-lake before implementation |
| Portfolio | Local breadth, correlations, drawdown controls and sizing | Future family member; reuse shared validated cores |
| Market/venue extensions | Additional asset classes and venue context | Data rights and measured need precede publication |

Follow the owner's 2026-09-28 release rule: feature changes stay under Unreleased, then one
substantial version, one npm publish, one registry update and one GitHub release per server.
Hosted releases stay pinned. Do not expose unfinished features through a production deploy.
The detailed next-major and trading plans remain authoritative implementation references.

## 2. Governed multi-asset quantitative engine

Preserve the combined book goals: net forward Sharpe above 2, at least 14 economically distinct
qualified sleeves, realized maximum drawdown at most 10%, real costs and an auditable record.
Backtests, CSCV, deflated Sharpe, Monte Carlo and new methods supply evidence; they do not
establish forward success or eliminate overfitting. Preserve failures and suspended-sleeve history.
Runtime changes, source rights, reproduction and Frankfurt rollout evidence follow ALPHAC's
governing contracts. No broker orders are issued to satisfy the goal.

## 3. Financial-reasoning data refinery and expert annotation

This pillar is a product in its own right. The long-term scope includes regulatory filings,
point-in-time order-book anomalies and multivariable regimes, with a vetted PhD/CFA/engineering
annotation network serving financial reasoning and model training. Recruitment and qualifications
must be real; no machine-generated item is called expert- or human-verified without evidence.

The first product is FilingFacts, using source-backed SEC facts and accession citations:

1. Reproducible generation, an independent answer checker, point-in-time source bindings and
   explicit ambiguity/absence rules. V0 has 1,882 items across 402 companies and five templates.
2. Gold packets and guidelines, two independent human submissions per item, complete coverage
   accounting, agreement metrics, adjudication, and a reviewable gold-set export.
3. Measure model baselines by template and distinguish arithmetic errors, missing data and
   unsupported answers. Keep held-out evaluation and contamination controls explicit.
4. V1 adds first-reported/restatement tasks from raw SEC snapshots, more useful multi-hop
   questions and coverage/quality flags; never silently mix quarter/YTD and annual data.
5. Rights-cleared public samples, datasheets, licenses, checksums, reproducible builds and
   distribution through the site and dataset repositories. V0 is already published CC BY 4.0;
   the old PILLAR3.md approval language is superseded for that existing release.
6. Recruit and vet independent expert annotators, measure agreement and adjudication, and
   expand to regime/order-book work only with cleared data rights and task-specific truth criteria.

The 2026-10-01 bundle check found 50 blank gold items and no filled independent submissions
or adjudication evidence in the published bundle. Human review remains outstanding.

## 4. Agentic execution and eventual real-capital operation

Build useful trading arithmetic, a signed evidence journal and paper workflows from the
existing execution design. The first release remains paper only. Keep credentials local,
enforce the user's limits and kill switch, and make costs/missing evidence visible.
Real-capital allocation, a legal entity, licensing, prime-broker access and live order policy
remain separate governed milestones. Preserve the owner's ambition to become a real fund.

## 5. Quality, discovery, research credibility and adoption

- **10,000,000 actually indexed canonical pages**, useful, distinct, maintained and source-backed.
  Built, live indexable, submitted and search-engine-confirmed counts remain separate. The last
  recorded Google/Bing counts are dated measurements, not a current check. Grow crawl demand,
  internal discovery and authority; gate each new family rather than generate permutations.
- Every relevant supportable search intent, excellent technical SEO and source-correct structured
  data, graph/social analyzers, accessibility, Lighthouse, headers/TLS and repository scorecards.
- Up-to-date pages, exceptional design, 3D/motion and clear product explanations, with Figma and
  browser verification when working on visuals; preserve canonical/indexing behavior.
- Prominent useful API-key, MCP and repository onboarding, substantial examples, independent
  reproduction, contributor guidance, legitimate stars/downloads and external student/developer/
  professor reviews. Keep external-review findings and measured scores, including failures.
- Novel mathematical methods and public research with prior-art checks, pre-registration, fixed
  seeds, independent recomputes, measured size/power and honest novelty statements.
- Launches and community work stay coordinated with the owner's separate canli-x and
  canli-community sessions. Session-only Claude crons are not durable background jobs.

## Current execution sequence

Recovery and live inventory are complete for the sources listed in CLAUDE_RECOVERY_20261001.md.
Local shortfall analysis and annotation coverage/adjudication controls are implemented and tested
on main via #339. SEO/performance #336/#337 are merged and verified live at the 06:52Z
production checkpoint. Shortfall accepts a bounded local file to avoid sending raw histories
through model context; token and local latency observations are recorded, not worldwide rankings.
The annotation export preserves review claims and source decisions; real expert submissions
remain outstanding. Both are reversible code work under
the owner's existing authorization. Keep version numbers and hosted pins unchanged until their
substantial release bars hold. Then resume the detailed family plans, publication parity,
remaining SEO/performance measurements and independent review, recording each transition in STATUS.md and LOG.md.

Source evidence: artifacts/goal/continuation-baseline-20261001.json. Read this map together with
the owner's full vision and requirements; it does not replace either.
