# Phase 11 — controlled preview integration

Completed 10 September 2026. Approved scope: synthetic API-key, validation and signup-storage tests, with no emails sent. This phase did not authorize production promotion.

## Target and outcome

- Preview: https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app
- Isolated Supabase project: `gdqrwikuqzxioxhequtc` (`canlicapital-preview`).
- All 15 integration steps passed. Actual macOS Safari signup checks and test-key revocation also passed.
- No application code changes, deployment, purchases, production writes, trading or marketing were performed in this phase.

## Verified behavior

The four validators—deflated Sharpe, overfitting, paper evidence and breadth—returned results matching the local computations for their synthetic example inputs. Canonical input/output hashes and receipt identities matched. Stored receipts, badge URLs and embeds remained on the preview origin. SVG badges loaded without cookies or performance-endorsement language.

Repeating a validation reused its receipt. Malformed key requests, missing or unknown credentials, and invalid validation inputs returned their expected errors. Invalid email input was rejected; honeypot submissions silently stored nothing. A valid signup followed by duplicate submissions retained exactly one row.

The browser-testing skill guided a real Safari form check: invalid input caused no network submission, and typing/clicking a duplicate synthetic signup produced one successful preview request and the visible confirmation. The form reset and submit button recovered. The captured confirmation was visually inspected.

Usage reconciled to six quota-counted validation calls: four initial successes, one repeat and one invalid authenticated input. This is not an exhaustive quota or load test.

## Retained test state

| Record | Final state |
| --- | --- |
| API key | One test-key row, revoked; subsequent use returned 401 |
| Receipts | Four synthetic receipts retained |
| Signup | One retained row: `phase11-20260910@example.invalid` |

No records were deleted. No emails were sent. The key was revoked using an exact ID, hash and test-label match in the isolated project. Secret values are excluded from reports and retained only in ignored, permission-restricted private files. Do not rerun issuance: the integration runner guards against an existing run.

Phase 10's empty-store counts describe its earlier checkpoint; the preview is now intentionally populated with the synthetic records above. Production data was not accessed or changed.

## Evidence

- [Integration report](../artifacts/qa/phase11-integration/report.json)
- [Safari results](../artifacts/qa/phase11-integration/safari.json)
- [Safari confirmation screenshot](../artifacts/qa/phase11-integration/safari-signup.png)
- [Revocation and final counts](../artifacts/qa/phase11-integration/closeout.json)
- Runners: `scripts/phase11-integration.mjs`, `scripts/phase11-safari.py`, `scripts/phase11-closeout.mjs`.

## Limits and next approval

These are controlled functional checks, not whole-site visual acceptance. Earlier build and regression results were not rerun or relabeled as Phase 11 results. No new Figma or media work occurred. Email delivery, sustained load, exhaustive quota exhaustion, real-user data and production integrations were not tested.

The next proposed phase is final site-wide visual review and launch checks, subject to user approval. Production promotion remains a separate authorization. The single deployment retains its isolated runtime configuration; a future deployment must explicitly supply that configuration rather than assume project-level preview variables exist.
