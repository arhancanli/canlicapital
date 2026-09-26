# Filing-facts annotation guidelines (v0)

You check items that were generated from SEC XBRL data, against the filing itself. You are not
asked to solve the question. You are asked whether it is clear, whether its stated answer is what
the filing says, and whether its citation points at the right filing. Work alone: do not compare
labels with another annotator until both packets are submitted.

## For each item

1. Open each link in `filings`. It is the SEC folder of the filing the item cites. Open the main
   document (the 10-K, 20-F or 40-F) and find the financial statement that reports the concept for
   the period in the question: the balance sheet for balances "as of" a date, the income statement
   or cash flow statement for a fiscal year.
2. **question_clear**: `yes` if a careful analyst would know exactly which number is asked for
   (which company, concept, period and unit). Otherwise `no`, with a note saying what is ambiguous.
3. **answer_matches_filing**:
   - `yes` if the stated answer equals what the filing reports, after the filing's own scaling
     ("in thousands", "in millions"). For a percent change or ratio, recompute it from the two
     reported numbers; agreement to the stated decimals is `yes`.
   - For a "not reported" answer: `yes` if the company's XBRL filings do not report that concept
     for that period (it may appear in older, untagged filings; that does not make the answer wrong,
     because the question asks about the XBRL-tagged filings).
   - `no` if the filing reports a different number, with the number you found in the note.
   - `cannot_find` if you cannot locate the figure after a reasonable search (note where you looked).
4. **citation_correct**: `yes` if the linked filing is the one the question names (form, filing
   date, accession) and it reports the cited figure.
5. **notes**: anything a reviewer should know: restated figures, a different line-item name, a
   units problem, an unclear period.

## What not to do

- Do not use a search engine, a data vendor or an AI model to decide an answer. The filing is the
  only source.
- Do not fix the item. Report what you see; adjudication decides.

## After both packets are in

`node scripts/datasets/filing-facts/agreement.mjs a.json b.json` reports raw agreement and Cohen's
kappa per judgement, and lists every disagreement for a third person to adjudicate. An item enters
the gold set only when adjudication says its answer matches the filing.
