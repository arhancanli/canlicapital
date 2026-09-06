/** Presentation-only metadata for source documents that are intentionally immutable.
 *
 * Scientific source files normally declare their own short search title. A hash-bound paper
 * cannot be edited after its final closure without invalidating that closure, so any later
 * presentation alias belongs here. The renderer uses these values for `<title>` only; the H1,
 * Open Graph title, citation title, JSON-LD headline, Markdown, and BibTeX keep the paper's exact
 * authored title.
 */
export const IMMUTABLE_PAPER_SHORT_TITLES = Object.freeze({
  "crypto-carry-portable-v1": "Crypto carry: sealed historical simulation",
});

export const IMMUTABLE_PAPER_SOURCES = Object.freeze({
  "crypto-carry-portable-v1": Object.freeze([
    "prospective_trial_record.json",
    "crypto_carry_portable_v1_result.json",
    "crypto_carry_portable_v1_admission_closure.json",
    "trial-packets/da5f5f47f99f9bd2.json",
    "sleeve_admission_contract.json",
    "crypto_carry_selected_walkforward.json",
    "crypto_carry_current_replay_receipt.json",
  ]),
});
