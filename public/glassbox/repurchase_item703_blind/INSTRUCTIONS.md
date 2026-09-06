# Independent blind Item 703 review

Review all 60 documents without opening any parser output, return data, market prices, aggregate
machine result, or prior label. The packet is deterministically shuffled.

For each `packet_id`, open `documents/<packet_id>.html` and complete `reviewer_labels.csv`:

- `has_item703_table`: exactly `true` or `false`.
- `expected_month_rows`: count the monthly repurchase rows; use `0` when no Item 703 table exists.
- `expected_total_row`: exactly `true` or `false` for a total row.
- `label_notes`: concise source-based ambiguity notes; do not record a return opinion.

Do not reorder, add, or remove rows. After review, remove only the `packet_id` column or leave it
in place (the seal ignores extra columns), copy the completed values into the frozen `labels.csv`,
and complete `reviewer_attestation.json`. Then run
`uv run python scripts/seal_repurchase_item703_labels.py --attestation <completed-attestation>`
before any parser evaluation. Every independence flag may be set to `true` only after the review.
