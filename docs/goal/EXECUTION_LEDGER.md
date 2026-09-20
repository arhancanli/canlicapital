# Direct execution ledger

Updated2026-09-20. Codex owns implementation, verification and continuity.
Hermes is stopped by owner instruction. Overall goals remain active/unachieved.

Authority: REQUIREMENTS.md (all goals), STATUS.md (current facts), PHASES.md
(exit evidence), LOG.md (historical transitions). This ledger tracks work only.

| Task | State | Acceptance/evidence |
|---|---|---|
|T01 Halt Hermes and repair verification |Locally verified |362 tests and complete audits; no old gates removed |
|T02 Permanent source-integrity regressions |Locally verified |Real fixtures, stale/omitted failure rejection, prior manifest unchanged |
|T03 Consolidate continuity |Complete locally |Current STATUS separate from archived history; all objectives preserved |
|T04 New-cohort staging |Locally verified |23,568 pages/1,706 downloads replayed;54 browser checks;147 exclusions retained |
|T04c Third1,000 cohort |Locally verified; editorial review open |766 companies,234 verified exclusions;21,471 staged URLs/1,532 downloads;full HTTP+66browser checks pass;six exceptional pairs inspected against original filings |
|T04b Combined-cohort construction |Locally verified |54,424 pages/3,936downloads across1,968companies;fullHTTP+66browser checks;6,713qualityflags retained |
|T05 Editorial/source/intent quality |Disclosures verified; editorial review ongoing |338 matching-history pages and24 constant-unit pages explained;six unusual matching pairs inspected against original filings;373tests,66browser checks,fullHTTP replay; no publication approval |
|T06 Storage and release |Runtime plan and local restore verified; access pending |6,249objects/828,366,117bytes plan;new12,952-file archive independently restored/replayed;remote retention and hosted verification pending |
|T07 Search indexing and adoption |Outcomes unestablished; MCP reliability verified |48package tests and new CI job; public service reachable,12total validations un-attributed; Search Console and genuine adoption evidence pending |
|T07b Key revocation |381website+48MCP tests; complete CI35491496322 passes |Bearer-only, no quota charge, idempotent timestamp, shared row lock; production migration not applied |
|T08 Governed engine outcomes |Evidence inspected; outcomes unestablished |Five returns/four sleeves; report hashes verified; three PRs pass; activation projection verified; spin-off evidence integrity repaired |

Each transition records changed files, exact validation, failures and remaining
limits. Plans/local/staged/live/indexed/forward outcomes remain separate. Never
report completion from a tool wrapper success or unrelated failure. Retain failed
experiments and verify real artifacts before carrying a prior status forward.
