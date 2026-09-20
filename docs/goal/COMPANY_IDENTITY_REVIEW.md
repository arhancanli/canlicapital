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

Next: inspect the original filing identity and selected fact contexts for the ten
priority cases, then propose an explicit, versioned identity policy if supported.
Any new policy must retain original bytes, preserve prior policy replay and refuse
missing names, malformed/zero/out-of-range identifiers and mismatched entities.
Do not silently change the v3 release or revisit rejected network requests.

No network request, broker operation, return-data read or page publication occurred.
The 54,416-URL candidate and measured 262-page indexing baseline are unchanged.
