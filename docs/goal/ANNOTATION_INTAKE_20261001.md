# FilingFacts annotation intake, 2026-10-01

The browser previously crashed on saved out-of-range indices or null answers, lost keyboard
focus after choosing a radio answer, and copied negative judgements without their required
source note. Its drafts and compact submissions did not bind the reviewed questions.

The new workspace stores a draft for each canonical packet SHA-256. Matching drafts restore
validated known fields. Legacy, foreign and damaged work stays visible as an exact recovery
download; original bytes are retained before a current draft can replace them. An unchanged
recovery is reused on reload. Storage failures are shown and unsaved memory work can download.

Download my draft retains partial work. Copy completed reviews requires a reviewer name and
all three judgements, with a note for every negative or cannot-find answer. Both exports carry
the same immutable packet digest used by the offline review tools. The copy and full draft
retain the same canonical coverage denominator and complete-pair statistics; the full draft
also retains incomplete fields. Names remain self-declared and no expert labels are created.

The packet content helper is shared by the browser and `agreement.mjs`. The v0 fingerprint
remains `15c595ed8109dd324dffeddd104d2f72154ef3710b9d64a0fb7eac7ddc95b7ee`.
All five published v0 files are unchanged. The page now describes the actual gold-export rule:
two independent complete named submissions and a distinct adjudicator's source-backed decision.

Signed implementation: `6904d60b95fd988c4b543a46ba626daf8d18e10c`. Node 22.23.2 build and
verification pass: 23 focused, 795 main and six prechecks, 699 page audits with no errors or
warnings, unchanged canonical/indexability partition and passing clean Git-free deployment
snapshot. Built Chromium 148.0.7778.96 passes 15 synthetic recovery, keyboard, export and narrow
viewport cases with zero page errors or external requests. Actual review and live delivery
remain separate milestones. All owner goals stay active.

Measured receipts and retained failures: [quality artifact](../../artifacts/goal/annotation-intake-quality-20261001.json),
[browser cases](../../artifacts/qa/annotation-intake-20261001/browser.json),
[baseline](../../artifacts/qa/annotation-intake-20261001/browser-before.json) and
[verification corrections](../../artifacts/qa/annotation-intake-20261001/verification-failures.json).
The quality artifact lists hashes for exact compressed build, verification and source-check logs.

Reproduce from the repository:

```sh
npm ci
npm run build
npm run verify
node scripts/validate-deploy-snapshot.mjs .
```

For browser checks, start `npm run preview`, then run
`python3 scripts/annotate.browser.py --base-url http://localhost:4173` in another terminal.
Python Playwright and Chromium are required. The browser script uses synthetic labels and a
clipboard test fixture, makes real local downloads and never submits anything externally.
