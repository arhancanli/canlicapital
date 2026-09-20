# Batch accounting-context review

Use the captured filing, statement headings, units, periods and relevant notes to
make each decision. Numerical agreement alone is insufficient. Keep uncertainty
in both the retained report and the reader-facing note. Presentation-only review
must use its separate status; never infer absence of dilution from equal numbers.

The current registration file is `config/company-basic-diluted-batch1-reviews.json`.
Each entry binds one report decision to its exact report hash, issuer, disposition,
observation count and review status. A root report uses `decision_index: null`;
a report containing several decisions uses an explicit zero-based index.

For an additional review:

1. Retain a new source-bound context report with the exact observations, source
   hash, batch-target hash, primary evidence and limited conclusion. Preserve old
   reports. Replay the new report from captured inputs.
2. Add a source-bound filing note and captured-source regression where reader
   context is needed. Preserve reported values, dates and currencies.
3. Register only the exact reviewed decision. Compute its hash from retained
   bytes. Do not register pending decisions or policy-held observations.
4. Run `node scripts/reconcile-basic-diluted-scope.mjs OUTPUT.json.gz` to a new,
   dated output. This reads the tracked compressed primary report and verifies
   numerical closure, report hashes, target/source bindings and the exact partition.
5. Compare the new ledger with the previous checkpoint: only the newly reviewed
   observations or explicitly changed policy holds may differ. Preserve the old
   output; never overwrite evidence to make a check pass. Update the corpus
   regression baseline deliberately when approved statuses actually change.
6. Run the scope-ledger and renderer tests, update STATUS/LOG and submit the
   source evidence, notes, registry change and new ledger together.

Current policy is cumulative v22. A new exclusion policy requires explicit selector,
reconciler and full-corpus transition verification. This registry does not activate
production or approve full histories, issuers or the corpus. The initial registered
output exactly matches every row and count in the frozen v6ledger. Historical
version-specific scripts remain available for their original reproductions; do not
copy another one for each future review batch.

For filings with fully inspected statement and disclosure requirements, retain a
versioned `canli.reviewed-share-context-spec.v1` JSON file. Replay it using
`scripts/review-share-context-spec.py SPEC.json OUTPUT.json`. The spec pins the
primary/source hashes, exact periods, observation count, table, required text,
share scale and reader explanation. It records a completed review, not a rule
that automatically approves new filings with matching keywords. The first such
spec is `config/company-loss-context-batch2-20260920.json`.

Batch3uses `scripts/review-share-context-spec-v2.py`: it also checks leaf table
cells for narrative disclosure. The original helper remains unchanged for prior
reproduction. FuelCell’s direct table-cell footnote required this extension;
absence from the original helper’s paragraph-only extraction was not evidence
that the filing lacked a dilution explanation.

Batch5uses replay v3with an optional explicit `supporting_table_indexes` list.
Plug Power’s2025diluted-share fact appears only in its EPSnote table, while other
facts also appear in the main statement. Every allowed table is retained in the
report; matching elsewhere in the filing is insufficient. V1/V2remain frozen.

Batch6uses replay v4to include text held directly in leaf spans and inline-XBRL
continuations. MacroGenics places its dilution paragraph in a continuation beside
an embedded table, so leaf paragraph/division extraction omitted it. The original
source was inspected before adding that narrowly bound review requirement.


Batch2 acquisition (September21) is separate from the closed batch1 registry.
`prepare-basic-diluted-capture-batch-v2.py` pins the frozen v22 delivery manifest,
checks exact selected observations and retained primary URL/body bindings, and
selects the next100missing filings (87companies/800observations). Target receipt:
`artifacts/seo/company-basic-diluted-capture-batch2-targets-20260921.json`.
Do not register batch2 outcomes through the batch1-only reconciler. First complete
acquisition, bind exact inputs with `prepare-captured-basic-diluted-review.py`,
compare numerically with the existing offline reviewer, and preserve unresolved
items. Context/scope decisions require inspected statement and disclosure evidence.
Neither acquisition nor numerical agreement approves the company or full history.
