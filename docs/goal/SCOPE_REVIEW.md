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


The batch2 registry is `config/company-basic-diluted-batch2-reviews.json`. Its
input descriptors pin acquisition targets, completed capture, bound comparison
targets, compressed primary comparison, legacy input/capture and final numerical
comparison. Run `node scripts/reconcile-basic-diluted-batch.mjs REGISTRY NEW_OUTPUT.json.gz`
to produce a separate ledger. The initial output is
`artifacts/seo/company-basic-diluted-batch2-scope-initial-20260921.json.gz`.
It has800pending observations and no reviewed/withdrawn rows. Preserve this baseline.

The runner checks the exact observation partition including metadata and every
link in the evidence hash chain. Subsequent reports must bind `target_sha256` to
the original acquisition target and the exact source hash; registration uses the
same explicit decision fields as batch1. Pending and hold-required dispositions
cannot be registered as approved. A checked number is not a reviewed accounting
interpretation. The Theriva pending report therefore cannot advance this ledger.


Batch2 first registered context decisions (September21):24reviewed/776pending,
with original800pending ledger retained. Spec company-share-context-batch2-first-
20260921.json uses the new v6 replay runner (spec schema v2), explicit target hash,
confined capture directory and per-decision receipt hashes. V1 specs/v5 runner stay
unchanged. Exact source fixtures, periods, primary statement tables, scale tags and
full reviewed disclosures support Aspira and two Sangamo filings. Reader notes retain
participating-warrant loss allocation and Sangamo noncontrolling loss/share units.
Theriva unresolved discrepancies remain pending. No whole-corpus approval.

Second batch2 context report adds32observations,56reviewed/744pending overall.
Kyntra and LifeMD retain total profit separately from continuing losses used for
dilution; historical reverse-split basis, preferred dividends, noncontrolling
interest and already-included vested awards are explicit. Crisp July fiscal/name
context retained. Ledger scope-v3 preserves all800row metadata and previous24
decisions; only32pending states/evidence links change. Reports replay exactly.

Third batch2 report adds32observations,88reviewed/712pending overall. Olenox
retrospective split basis and deemed dividends, Silver Bull rounded-zero loss,
Eloxx split basis and Rockwell preferred accretion receive exact source-bound notes.
Scope-v4 changes only32pending states/evidence links; all800numerical rows and
prior56decisions unchanged. Original reports/ledgers retained.

Fourth batch2 report adds32observations,120reviewed/680pending overall, including
8Inhibitor presentation-only rows: equal reported denominators do not establish
the dilution cause. Precipio/AppTech dollar-only headings preserve full share counts;
Modular prefunded warrants already included in basic shares. Scope-v5 preserves
all800rows and prior88decisions, changing only32states/evidence links.

Fifth batch2 report adds16Curis observations;136reviewed/664pending overall,
8presentation-only unchanged. Community Redevelopment2021numerator differs
between main net-loss subtotal and EPS note; dedicated reproducible report stays
pending and provides diagnostic arithmetic only. Plug diluted tags need explicit
visible-statement mapping. The strict v6table gate remains unchanged.
