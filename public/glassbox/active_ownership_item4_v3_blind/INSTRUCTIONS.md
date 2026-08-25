# Independent blind review instructions

Review all 48 rows without consulting parser outputs, aggregate results, prices, or returns.

## Before labeling

- Keep this extracted directory intact. Do not edit `manifest.json`, `reviewer_labels.csv`,
  `reviewer_attestation.json`, `review.html`, `verify_review.py`, or any file under `documents/`.
- Run `python3 verify_review.py`. Continue only if it prints `PACKET_VALID`.
- Copy `reviewer_labels.csv` to `completed_labels.csv` and `reviewer_attestation.json` to
  `completed_attestation.json`. Edit only those two copies.
- For a guided offline workspace, open `review.html`. It autosaves locally, captures selected
  source text, and downloads the two completed files in the governed schemas. It performs no
  network request unless you explicitly open an official SEC filing link.

## Frozen labeling rubric

- Mark `human_specific_active_intent=true` only when the filing states that the reporting person or
  group has taken, committed to, or is presently pursuing a specific action intended to influence
  issuer governance, control, capital allocation, or a strategic transaction. Examples include an
  actual nomination, proposal, demand, agreement, delivered communication, or stated present plan.
- Mark it `false` for passive ownership, transaction history alone, generic monitoring, or
  boilerplate saying the filer may communicate, review alternatives, or act in the future without
  a specific current action.
- Base the decision only on the supplied filing text and, if necessary, the linked official SEC
  submission. Do not search for outcomes, prices, returns, parser results, or later filings.
- Copy one representative source sentence verbatim. For a negative row, copy the sentence most
  relevant to the negative decision. Use `[ITEM 4 UNRESOLVED]` only when extraction is unresolved.
- Record one unambiguous aggregate ownership percentage explicitly reported for the reporting
  person or group as a plain number without a percent sign. Do not infer, sum, average, or choose
  among conflicting percentages. Enter exactly `unresolved` when one aggregate percentage cannot
  be established from the filing.
- Use `human_notes` for ambiguity or document-location notes; do not put labels in that field.

## Completing and returning the review

- Read `documents/<packet_id>.txt` and, where needed for cover-page/Item 5 ownership, the linked
  official SEC submission.
- Complete all 48 rows in `completed_labels.csv`. Do not reorder, add, or remove rows and do not
  change the frozen identity or source columns.
- Fill `reviewer_name`, `reviewer_role`, and timezone-aware ISO 8601 `completed_at` in
  `completed_attestation.json`; copy `content_hash` from `manifest.json` into
  `packet_manifest_content_hash`; and set every independence boolean to `true`. Preserve the blank
  template.
- Run `python3 verify_review.py --completed completed_labels.csv --attestation
  completed_attestation.json`. Return the two completed files only if it prints
  `REVIEW_RETURN_VALID`; the output also gives both file hashes.
- Return exactly `completed_labels.csv` and `completed_attestation.json` to Arhan Canli. The
  researcher, not the reviewer, performs the governed import and frozen scoring run.

The packet intentionally contains no machine classification, matched sentence, ownership candidate,
market price, return, or portfolio output.
