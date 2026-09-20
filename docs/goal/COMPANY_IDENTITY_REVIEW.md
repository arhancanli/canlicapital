# Company identity exclusions

The retained-cache review prompted an audit of all INVALID_ENTITY outcomes in the
three completed website capture queues. This is a review aid, not a new policy,
an eligibility decision or a release change.

Reproduce with `node scripts/audit-company-identity-exclusions.mjs`. The script
checks complete unique queue identities, capture schema/URL/CIK, original body
hash and size, and reproduces every old exclusion through extended-v3. A second
run produced byte-identical output. The unchanged selector's 13 tests pass.

## Findings

There are 106 exclusions; 102 contain digit-only CIK strings numerically matching
the requested identity. Their representation alone does not establish eligibility.
The mutually exclusive review categories are:

| Category | Count |
| --- | ---: |
| Missing or empty entity name | 45 |
| Named matching CIK text, fewer than four qualifying core histories | 48 |
| Named matching CIK text, at least four qualifying core histories | 10 |
| Named response with missing or unsupported CIK | 3 |

Core-history diagnostics reuse the existing observation selector for the nine
core concepts. They do not apply the 25 extended concepts or constitute the full
editorial policy. The 48 cases are not automatically final exclusions under any
future policy. No raw JSON is normalized, rewritten or converted into a candidate
company record.

The ten priority cases are Rand Capital (0000081955), Nitches (0000772263),
King Resources (0000774415), Longevity Diversified (0000787496), Princeton Capital
(0000845385), Equus Total Return (0000878932), Sentinel Holdings (0000889353),
Invech Holdings (0001009919), Eline Entertainment (0001043150) and TAP Real Estate
Technologies (0001119190). Original names, capture dates, source hashes and selected
filing accessions are in `artifacts/seo/company-identity-exclusions-20260920.json`.

## Why numeric conversion is not enough

The captured response for CIK0000007323 names ENTERGY CORPORATION; the pinned ticker
discovery names ENTERGY ARKANSAS, LLC. Its facts include accessions beginning
0000065984. Shared/group filings, renamed entities and third-party filing agents
require interpretation, so neither a name disagreement nor an accession prefix
alone proves wrong identity. This case demonstrates the need for filing entity and
context review before accepting text CIKs. It does not justify automatic rejection
of every shared filing, nor automatic admission of every numeric string.

The initial audit queued original filing identity and selected fact contexts for
the ten priority cases; the completed comparison is recorded below. Next, propose
an explicit, versioned identity policy if supported by the remaining scope review.
Any new policy must retain original bytes, preserve prior policy replay and refuse
missing names, malformed/zero/out-of-range identifiers and mismatched entities.
Do not silently change the v3 release or revisit rejected network requests.

The initial exclusion audit made no network request. Neither that audit nor the
filing review involved broker operations, return-data reads or page publication.
The 54,416-URL candidate and measured 262-page indexing baseline are unchanged.

## Filing verification completed — 2026-09-20

Captured the original filing indexes and primary documents for all 13 distinct
latest-selected core accessions across the ten priority companies. All 26 HTTP
responses are 200; original body hashes and byte lengths independently verify.
Each filing's cover CIK matches the requested company. The fact comparison also
requires the context's entity identifier to match, excludes dimensional and nil
facts, and checks period, currency unit, value, scale and sign.

All **137 selected core observations match**. Target regeneration reproduces its
JSON exactly. Comparison replay is byte-identical. The comparator verifies the
shared review-input hash, rejects duplicate or missing filing coverage, accounts
for every target row and reads cover identifiers directly from captured bytes.
This verifies the inspected observations and identity representation;
it does not establish all-history accuracy, all extended concepts, semantic scope
of every measure, independent investment evidence or publication readiness.

Retained scripts and reports:

- `capture-company-identity-filings.py` and
  `company-identity-filing-review-20260920.json`: capture receipts, cover identities
  and context identifiers. Original responses are in ignored `identity-filings`.
- `prepare-company-identity-filing-targets.mjs` and
  `company-identity-filing-targets-20260920.json`: diagnostic observations rebuilt
  from exact original company-facts bytes.
- `compare-company-identity-filings.py` and
  `company-identity-inline-comparison-20260920.json`: 137 comparisons with source
  hashes, context references and matching table rows.

No network request was retried after an access denial. These are distinct filing
resources, not retries of the denied bulk archive. The capture completes without
403/429 responses. Previously captured source bytes and release objects are unchanged.
At this capture checkpoint the new bodies were not sealed; the later supplement
and its verified restore are recorded below.

The evidence supports considering a versioned, exact-source identity exception
for these ten captures. Such a change must preserve old exclusion replay, bind the
reviewed raw bytes and reject altered source bytes pending renewed review. It has
not been implemented or activated. No general numeric-string coercion is approved.

## Semantic review: Princeton revenue is a portfolio-company measure

Further inspection of the surrounding filing text found that the three matching
Princeton `Revenues` observations for 2020–2022 describe Advantis Certified Staffing
Solutions, Inc. The filing labels the table as summarized financial information
for an unconsolidated controlled portfolio company. The amounts are USD6,935,000,
USD8,182,000 and USD8,757,000 respectively. They use Princeton CIK contexts without
dimensions, illustrating why numerical and context identity checks are insufficient.

Disposition: **exclude this concept before any identity admission** for source
SHA256 `2fd640d381fe94c711e1a297ae1dbfec8d4dc8e4e95bb65ea0ceba94f1bc0854`.
Do not replace these observations with a different revenue tag or inferred values.
The existing INVALID_ENTITY exclusion already prevents this company from entering
the current release. No selector, policy or release pointer changed.

`scripts/review-princeton-revenue-scope.py` verifies the original primary body and
extracts the surrounding passage and table into
`artifacts/seo/princeton-revenue-scope-20260920.json`. This is a manual semantic
disposition with reproducible source evidence, not automated semantic validation
or full-history approval. Admission design must incorporate this finding; the
137 numerical matches must never be represented as 137 approved company measures.

## Local evidence supplement and restore

`corpus-local/identity-review-evidence-20260920.tar` contains 77 files and
26,521,600 bytes. SHA256:
`b48b199b8d459e42641cd8e444e73d5d05f4aa4443a40855f81c287779e3a853`.
It preserves ten original compressed company-facts sources, all 26 filing/index
bodies and receipts, five reports, and the exact scripts and local module closure.
The manifest records Python, BeautifulSoup and Node versions; those runtimes and
third-party packages are not bundled. This is local retention, not an offsite backup.

The builder uses the existing archive verifier to check every member and restores
into a separate temporary workspace. It regenerates targets, numeric comparisons
and the Princeton disposition from archived bytes, requiring identical output
hashes. The capture report is retained and hash-verified, not refetched or rebuilt;
the original 106-case exclusion audit is an input and is not rerun. Temporary files
are removed. No network capture command is invoked during replay.

Replay with:

```sh
python3 scripts/package_identity_evidence.py replay \
  artifacts/seo/corpus-local/identity-review-evidence-20260920.tar \
  --sha256 b48b199b8d459e42641cd8e444e73d5d05f4aa4443a40855f81c287779e3a853
```

The result is retained in `company-identity-evidence-restore-20260920.json`.
This supplement neither replaces the v3 archive nor includes the separate retained
issuer-discovery review. The saved repository revision identifies report provenance;
the new packaging script's own bytes are included and hash-bound in the manifest.

## Fifth completed cohort

All102identity exclusions still reproduce from their captured bytes.101sources
have string CIKs matching the requested number; this does not authorize conversion
or admission.12lack a usable name. Of the remaining cases,47have fewer than four
core histories and43require identity/filing-scope review.21of those43exactly match
a discovery name and22do not; neither outcome alone proves filing scope.

`company-fifth-identity-exclusions-20260920.json` binds capture/discovery inputs.
The audit now accepts explicit cohort names, rejects traversal/duplicates and
reproduces the original three-cohort report byte-for-byte with default arguments.
No source value, selection policy or exclusion was changed.
