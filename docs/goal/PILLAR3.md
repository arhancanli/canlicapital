# Pillar 3: the data refinery (plan v1, 2026-09-26)

## Continuation verified 2026-10-01

V0 is already public under CC BY 4.0: 1,882 machine-checked items across 402 companies,
five templates, and a blank 50-item gold packet. Its annotation browser and guidelines exist.
The historical approval/delivery list below describes the earlier plan; v0 release/license
are no longer pending. Restatements, human review, expert recruitment and broader refinery
coverage remain outstanding. The historical 916,000 figure refers to site URLs, not filers.

Codex continuation strengthens agreement coverage and adds explicit adjudication export.
No actual human labels are invented: missing submissions remain pending. MASTER_PLAN.md
keeps this pillar's full expert-network, regulatory-filing, regime and order-book ambitions
alongside every MCP, engine, indexing and adoption objective.

Owner vision: the definitive source of high-fidelity financial annotation and fine-tuning data for
banks, AI labs and funds; multi-hop financial reasoning without hallucination; an elite human
annotation network. Owner order 2026-09-26: step 3 after MCP and indexing.

## Constraint that decides the first product

Vendor market data cannot be resold (Bybit 6.9, Binance clause 25; 0/16 sleeves have external
publication clearance). SEC filings are US public domain, and canlicapital already ingests XBRL facts
for ~916,000 filers with point-in-time provenance (value, period end, accession, form, filed date).
So the first product is built on SEC XBRL facts.

## First product: filing-facts reasoning set (working name "Canli FilingFacts")

Every item is generated from XBRL facts and its answer is recomputed by an independent checker;
every item cites the accession(s) it depends on. Templates:

| template | tests | ground truth |
|---|---|---|
| lookup | read one value as reported in a named filing | the fact |
| change | two periods, difference and percent change | two facts + arithmetic |
| ratio | margin / leverage across two concepts, same period | two facts + arithmetic |
| identity | does assets - liabilities equal equity (within 1%)? | three facts |
| restatement | first-reported vs later-reported value for the same period | same concept+end, two accessions |
| unanswerable | a period/concept absent from the company's XBRL facts | absence, stated as "not in its XBRL filings" |

Rules: instants only from instant frames (…I); durations only annual (fp FY, 10-K, frame CYyyyy),
so no quarter/YTD ambiguity; questions name the source and units; unanswerable items say what
source was searched (XBRL filings), never claim global absence.

## Prior art (2026-09-26 search), honest novelty

FinRank (1,185 manual QA, 22 companies), HC-RAG Multi-Doc-2025 (2,327 QA, 87 S&P 500), VeriFin
(XBRL calculation linkbases verify claims), FinTagging (tagging), SECQUE (analyst questions),
FinExam-10K. Not found together elsewhere: machine-verified answers with accession citations across
all filers, restatement (point-in-time) items, unanswerable items, and regeneration from filings
filed after a model's training cutoff (contamination-resistant evaluation).

## Human layer (the vision's annotation network, started small)

- Annotator guidelines + a gold packet: each item checked against the filing document itself
  (question clear? answer matches the filing? citation right?).
- Two independent annotators per gold item; agreement (Cohen's kappa, exact-match rate) scored by
  script; disagreements adjudicated.
- Until annotators exist, the owner can label a first 50-item gold set; no item is called "human
  verified" unless a human verified it.

## Deliverables, in order

1. Generator + independent checker + tests (canlicapital `scripts/datasets/filing-facts/`).
2. v0 sample: ~2,000 items over ~400 companies from the live company release; datasheet.
3. Baseline: gpt-5.4-mini closed-book and with the MCP tool, by template (shows where models fail).
4. Gold packet + guidelines + agreement scorer.
5. Public sample page on canlicapital.com (needs owner OK for external release and license choice).

Owner decisions pending: data license (CC BY 4.0 suggested), external release (Hugging Face), annotator
recruitment/payment.
