# Launch kit and deposit plan, 2026-09-06 (drafts for owner approval; nothing sent, nothing deposited)

Owner directive: the free developer key is the product. Adoption, trust and brand are the goal;
revenue is not near-term. Every line below keeps the house voice: this project does not lie,
every number traces to an artifact, every response says what it cannot be used to claim, nothing
is a forecast or an admission. Outward actions (posting, depositing) happen only on the owner's
explicit yes, one action at a time.

## 1. Where the papers can go (derived from the repo's own governance)

**Blocked today, sleeve by sleeve:** all 16 sleeve result papers under `publication/*/` (each
`bundle_manifest.json` says `BUNDLE_INCOMPLETE`). `docs/design/EXTERNAL_SUBMISSION_PLAN.md` in the
engine repo: "This is a local preparation queue. It proves no submission, acceptance, DOI, peer
review, citation, external review, or independent replication." Per-sleeve blockers are named in
`artifacts/publication/repository_submission_worksheets.json` (author technical audit, data licence
review, clean-environment replay, fresh-context reader review, two external domain reviews,
independent replication, Zenodo owner confirmations). Crypto carry additionally carries
`OPEN_MATERIAL_REPLAY_CORRECTION` (sealed run Sharpe 0.6766 vs exact-timestamp replay 0.1065; the
paper preserves both and blocks submission while the correction is open).

**Depositable now (no return claim):**
- the open standard `canli.paper-evidence.v0` (`standards/paper-evidence/schema.json`) and its
  validator (`js/paper-evidence-core.js`, `api/v1/validate/paper-evidence.js`);
- notes `deflating-a-sharpe-ratio.md` (synthetic example from the open engine's benchmark) and
  `seventy-files.md` (a parity post-mortem, no returns);
- the two public engine repos, `arhancanli/canli-backtest` and `arhancanli/canli-pit-lake`
  (MIT, `CITATION.cff` present, AI-assistance disclosure present).

**Ambiguous, hold:** `notes/one-symbol.md` prints crypto carry's real replay Sharpe, the exact
figure the paper is blocked from claiming externally; `publication/evidence-architecture/v0.1.0/`
(the arXiv methodology draft) embeds the book's case-study equity curve.

**Venues, ranked for reaching developers:**
1. Zenodo: schema + validator as a software record; the two clean notes as a preprint-typed record.
   Labels the standard requires: PREPRINT, NOT PEER REVIEWED, RESEARCH SIMULATION or ALPACA PAPER
   where applicable. Gives a versioned DOI a student can cite in a competition entry today.
2. GitHub: both repos already citable; add the Zenodo DOI to `CITATION.cff` once minted.
3. arXiv q-fin.CP (cross-list q-fin.PM, cs.SE): only the methodology draft, only after the
   case-study curve is removed or reframed, and after endorsement for a first submission.
4. SSRN: excluded by `EXTERNAL_RESEARCH_PUBLICATION_STANDARD.md`. Papers with Code and Hugging
   Face: not relevant to these documents.

**Owner decisions before any deposit:** authorship and affiliation on each record; the licence
per record (`license_selection` is null in every worksheet; MIT for code, CC BY 4.0 or CC0 for
prose); Zenodo visibility and publication date; the AI-assistance disclosure line (a draft exists
in the READMEs and in `submission_metadata.json`, awaiting explicit approval).

**What a session prepares without posting:** the Zenodo deposit packages (files, metadata,
keywords, abstract), the `CITATION.cff` update text, and the deposit gate below.

**Deposit gate (same rule as the retracted-claims blocklist):** no method document may state a
specific sleeve's Sharpe, CAGR, drawdown or equity curve unless that exact figure is linked, in the
same paragraph, to its `BUNDLE_INCOMPLETE` bundle and blocker list. A bare number is a performance
claim regardless of the prose around it. Implement as a check over the deposit package before
upload, reusing `scripts/check_retracted_claims.py`'s rule format.

## 2. Distribution drafts (approve, edit, or reject each)

**Show HN** (title 77 chars): "Show HN: A free API that runs your backtest through deflated
Sharpe and CSCV." Body: "I built a small API that runs your own return series through deflated
Sharpe (Bailey and Lopez de Prado) and CSCV probability of backtest overfitting. No signup, a free
key from one POST request, snippets in curl, Python and JS that run unedited. Every response
returns the formula version, the inputs you gave it, and a plain sentence about what the number
does not establish, for example that the service never saw your data source, costs, or lookahead.
It also returns a receipt URL that recomputes deterministically, so someone other than you can
check the claim. This is not a signal service or a trading recommendation, and selection bias
diagnostics are calibration tools, not truth machines; the docs say so before the code does. I
run a public paper-traded portfolio on the same arithmetic (canlicapital.com/open), so the API is
the gate my own numbers have to pass, not a demo of one."

**r/algotrading**: "Free API to run your backtest's Sharpe through deflation and CSCV before you
trust it." Body: a keyless-to-read API that takes a return series and effective trial count and
returns Probabilistic and Deflated Sharpe plus CSCV overfitting probability, formula version
included, receipt URL anyone can recompute, no email for a key, unedited curl/Python/JS at
canlicapital.com/developers; my own paper book runs the same checks and publishes the ones it
failed.

**r/quant**: "An open reporting standard for paper-trading evidence, plus a free validator API."
Body: drafted `canli.paper-evidence.v0`, a schema that forces fields most paper-trading reports
omit (capital type, trial count, costs, corrections, what the record does not establish); shipped
a validator and a free API returning the same envelope; it is a proposal with no independent
implementation yet; looking for people who report paper results to try to break the schema;
standard at canlicapital.com/standards/paper-evidence.

**Open-source backtesting communities** (one note each, integration point named):
- VectorBT: a documented post-backtest recipe piping `portfolio.returns()` and the trial count
  into the deflated-sharpe endpoint right after `.stats()`.
- Backtrader: a `bt.Analyzer` subclass collecting the equity curve in `stop()` and posting it,
  documented beside Backtrader's own SharpeRatio analyzer.
- freqtrade: a docs page or companion script that posts the exported backtest JSON to the
  validator before a strategy moves to dry-run.

## 3. Product features that make adoption compound (build on approval)

- **Receipt badge**: `GET /api/v1/receipts/{id}/badge.svg`, embeddable in a README, linking to
  `receipt.url`. Shows the receipt id and formula version only. Must not say verified, approved,
  passed or profitable; no pass/fail checkmark (DSR is not pass/fail); alt text carries the sample
  size or trial count, a limits fact.
- **MCP server**: the four validators as MCP tools (stdio for local agents, streamable HTTP for
  hosted), a `get_key` tool wrapping the free-key flow, every tool returning the full envelope so
  an agent cannot drop the boundary language. A separate audience: coding-agent users.
- **Client library**: not now. The snippets already run unedited; a wrapper that returns only the
  number and drops `limits` and `receipt.url` is the exact failure the envelope exists to prevent.

## 4. Measuring arrival instead of assuming it

- The usage count on the status endpoint must say what it counts (every call, or unique key and
  input-hash pairs) in the field's description.
- Capture the `Referer` host at key issuance beside the key hash (today the client hash is IP-only).
- Give each integration snippet its own default `label`, so a breakdown by label is a source
  breakdown with no tracking parameter.
- Log badge fetches separately from receipt-page views: a badge fetched from a README is the only
  signal a channel got embedded rather than clicked once.
- Record the trailing baseline of key issuance and validations by referer and label BEFORE the
  first post, so the launch has a same-period control. Report unique new keys and unique
  (key, day) validating pairs, never raw call counts.
