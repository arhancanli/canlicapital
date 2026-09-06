# Drafts

Everything in this folder is a **proposal**, not a publication. Nothing here is
posted, tweeted, emailed, or deployed by any script in this repository. A file
lands here only because `npm run draft:weekly` or `npm run draft:monthly` was
run; a human then reads it, edits it, or deletes it. There is no automation
anywhere in this repo that takes a file from `drafts/` and puts it in front of
a reader.

## What generates these

`scripts/draft-recurring-post.mjs` reads this repo's own published glass-box
artifacts (the kill log, the trial ledger, the signed transparency chain, the
OpenTimestamps anchors, the paper-trading state, the program status, and the
site's own paper-evidence conformance record) and turns them into Markdown.

- `weekly` writes `drafts/YYYY-MM-DD-what-died-this-week.md`: what changed in
  the last seven days in the kill/trial record, the transparency list, the
  signed chain, and the OpenTimestamps anchors, plus a read of product-usage
  arrivals if that instrumentation is present in this checkout. If nothing
  changed, the draft says so in one line and stops.
- `monthly` writes `drafts/YYYY-MM-the-record-so-far.md`: the record's length
  in days, the chain's size, its anchors, the sleeves and their paper state,
  corrections issued, trials counted, and a verbatim quote of what the site's
  own record says it does **not** establish.

## The rules these drafts are held to

- Every numeral carries its source artifact in a trailing bracket, e.g.
  `63 distinct days [public/glassbox/transparency_log.json]`, so the owner can
  check it against the file it came from before publishing anything.
- A withdrawn number may appear only inside a sentence that retracts it. A
  self-check against `config/retracted-claims.txt` refuses to write a draft
  that states a blocked figure bare.
- No em dashes.
- No performance claims and no forecasts. These drafts report process facts:
  counts, dates, weights, capital kind, and the record's own disclaimers, not
  Sharpe ratios or return figures asserted as evidence of anything.
- Every draft states once, plainly, that the record is paper: no real capital
  is deployed.

## Publishing

This folder is never built into the site. Nothing in `vite.config.js` scans,
copies, or serves `drafts/`; it is Markdown for a human to read locally, not
an input to the build.
