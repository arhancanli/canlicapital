# Persistent CanliCapital goal

This folder is the continuity record requested by the owner on 19 September 2026.
The session goal is active. On 20 September 2026 the owner assigned all implementation
and review to Codex directly; Hermes delegation is stopped. Current task ledger:
`EXECUTION_LEDGER.md`. This folder does not claim the goal has been achieved.

Read in order before each phase and after every chat compaction:

1. `REQUIREMENTS.md`: all owner objectives and claim boundaries.
2. `STATUS.md`: current phase, exact outstanding work, blockers and next action.
3. `PHASES.md`: sequence and evidence required to finish a phase.
4. `LOG.md`: current chronological changes, test results and decisions, with links
   to preserved earlier logs when historical details are needed.

On a restart, verify the current branch, dirty files, PR state and relevant evidence.
Do not assume a command finished, a PR merged or production changed because it was
planned. Update the records after verification. Status records describe material
transitions, not continuous telemetry or proof that background work is running.

Working locations:

- Website: `/Users/arhancanli/canlicapital-expansion-20260919`, branch `fix/company-storage-write-reconciliation-20260920`. PR22 merged as4337d655; bounded create reconciliation continues here. Production publisher uses the separate clean canlicapital-production-20260920 checkout at9608542c.
- Engine goal evidence: `/Users/arhancanli/alphac-goals-review-20260919`, branch `fix/owner-goal-evidence-20260919`, PR https://github.com/arhancanli/alphac/pull/68.
- Engine dependency update: `/Users/arhancanli/alphac-security-20260919`, branch `fix/security-dependencies-20260919`, PR https://github.com/arhancanli/alphac/pull/69.
- SEC collector quality: `/Users/arhancanli/alphac-source-quality-20260919`, branch `fix/sec-companyfacts-source-quality`; PR https://github.com/arhancanli/alphac/pull/70. Tests use the security worktree's existing Python environment; do not commit a .venv symlink.
- Original website and engine worktrees contain existing work and runtime state. Keep changes isolated; do not overwrite other agents' or the owner's work.
- Engine integration verification: `/Users/arhancanli/alphac-integration-20260920`, branch `integration/owner-goals-20260920`. PR https://github.com/arhancanli/alphac/pull/71 merged as0aff241a on September20 after all six CIjobs passed. The merged tree matches the reviewed candidate; running-engine activation remains pending.
