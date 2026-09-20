# CanliCapital supervision ledger

Updated: 2026-09-20. Owner: Arhan Canli. Supervisor: Codex. Engineer: Hermes.
Overall outcome: ACTIVE, NOT ACHIEVED. This ledger tracks review, not indexing or performance.

## Authority and reading order

1. REQUIREMENTS.md: owner objectives and measurement boundaries.
2. STATUS.md: current verified state and next action; dated sections are historical.
3. This ledger: current task, acceptance criteria, review results.
4. PHASES.md: scope and exit evidence; LOG.md: append-only material history.
5. HERMES_REVIEW_REQUEST.md: engineer submission, never approval by itself.

Owner's latest steering: ask Hermes for its known goals, delegate code writing to
Hermes, keep Codex leading/reviewing, conserve tokens without lowering standards,
and keep documentation exceptionally clear. Do not mine old sessions unnecessarily.

## Full objective map

| Objective | Completion evidence | State |
|---|---|---|
| 800,000 actually indexed canonical pages, target 1,000,000 | Search-engine measurement | Unknown indexed count; staged counts are separate |
| Useful distinct source-backed accessible maintained content | Source replay, editorial review, browser checks | Ongoing; no volume substitution |
| Exceptional technical SEO and relevant intent coverage | Technical audits and measured crawl/search evidence | Ongoing; no rankings promised |
| Open-source glass-box platform, API keys and MCP | Working integration tests, examples and provenance | Ongoing |
| Developer/repository adoption | Genuine usage/contribution evidence | Unestablished |
| Combined net forward Sharpe >2 | Governed forward-evidence contract | Unestablished; synthetic results inadmissible |
| At least14 economically distinct qualified sleeves | Governed admission and distinction evidence | Current count requires fresh verification |
| Realized combined max drawdown <=10%, complete cost disclosure | Forward marks, drawdown and cost contracts | Unestablished |

## Current task

S02 — permanent regression for external-review bypass.
Engineer: Hermes. Status: CHANGES REQUESTED. Scope: tests and factual handoff only.
Acceptance: valid source fixture; sibling capture/output directories; prior manifest
staged successfully; stale external report cannot conceal HTTP500 or omitted
exclusion; exact expected-error assertion; previous manifest byte-identical;
existing coverage retained; focused tests pass from project root. No production
logic change needed. Codex independently reruns and inspects tests before acceptance.

| ID | Work | Review state | Evidence / issue |
|---|---|---|---|
| S01 | Remove external-review staging bypass | Specific fix verified locally | Independent HTTP500 regression;14 focused tests pass; CODEX_SUPERVISION.md |
| S02 | Permanent regression and factual handoff | Changes requested | First command hit path guard; second wrong cwd; subsequent patch did not match. None prove completion |
| S03 | Reconcile current documentation | Queued, after S02 | Remove stale current claims; preserve history, all objectives and evidence |
| S04 | Fresh next-cohort source review and verified staging | Queued | Saved review853 candidates/147 exclusions/0 errors; fresh cause inspection needed |
| S05 | Algorithm prototype remediation and evidence audit | Queued | Synthetic inputs, P&L/drawdown defects, readiness unproved |

## Working protocol

One bounded implementation task at a time by default. Hermes reports task ID,
changed paths, exact commands/exit codes, evidence paths and unresolved issues in
<=250 words. Tool success is not file-change proof; reread and inspect git diff.
Tests failing for unrelated reasons are failures. Existing tests must remain.
Codex accepts only inspected work and independent checks appropriate to its risk.
No repeated full-suite runs absent new code or unresolved risk. No unnecessary
agent fanout. Original captures and failed results stay intact. Active supervision
does not imply a production release or trading decision.

## Next documentation checkpoint

Hermes should consolidate STATUS into current verified facts, next tasks and
blockers with explicit dates and links; historical detail remains in LOG. Preserve
all owner requirements. Mark outdated assertions superseded rather than silently
rewriting history. CODEX_SUPERVISION retains detailed review history; this ledger
is the short operational entry point. No unverified agent-completion claims.
