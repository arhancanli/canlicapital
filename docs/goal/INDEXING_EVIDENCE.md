# Offline indexing observation evidence

`scripts/lib/indexing-evidence.mjs` checks explicitly supplied observation metadata
and original raw bytes. It copies each input once, hashes those owned buffers before
parsing, and retains their exact bytes as base64 in an immutable report. It validates
the declared property, dates, metric class and coverage. It does not authenticate
Google/Bing authorship, extract real provider workbook formats, verify URL truth or
establish admission of useful canonical pages.

Every accepted report labels authorship and manual normalization as self-attested.
Current Google/Bing counts, current indexed pages, distinct admitted canonical count,
qualified target progress, indexed-minimum satisfaction and family indexed share
remain **null**. Supplying an `independently_verified` flag cannot change that:
unsupported fields/statuses are refused. The existing `seo-inventory.mjs` indexed
minimum refusal and all historical baselines remain unchanged.

The dated262 observation has data dated September14 and an export dated September20.
A later intake or observation time does not refresh its data. The old normalized
baseline references a workbook digest/length; this checker cannot manufacture the
absent workbook. Retain that baseline unchanged. A missing raw source can be recorded
with unavailable extraction, null metrics and explicit reasons, but a hash reference
alone is not a captured source.

| Metric kind | Internal report kind | Supplied values | Meaning |
| --- | --- | --- | --- |
| `aggregate_indexing` | `property_indexing_aggregate` | `indexed`, `notIndexed` | Dated provider-reported aggregate observation; no exact canonical set |
| `url_inspection` | `url_inspection` | `inspected` plus diagnostic rows | Observations for the supplied URLs; no sample extrapolation |
| `search_performance` | `search_performance` | `impressions`, `clicks` plus rows | Performance in the supplied scope/window; not indexed-page counts |
| `technical_eligibility` | `technical_eligibility` | `eligible`, `ineligible` | Declared technical eligibility; not inclusion by a search engine |
| `sitemap_inventory` | `sitemap_inventory` | `urls` | Inventory/discovery; not indexing |
| `notification_submission` | `url_notification` | `submitted`, `accepted` | Notifications/acceptance; not indexing |

Report kinds/version`v1` are this contract's semantic identifiers, **not** official
provider interfaces or supported provider export schemas. Aggregate indexing,
inspection and performance allow provider`google` or`bing`; technical and sitemap
observations use`local`; notifications allow`bing` or`local`. Domain-property syntax
`sc-domain:example.com` is supported for Google declarations. URL-prefix properties
use an exact normalized HTTPS URL. A separately supplied expected property must match
the metadata exactly; domain and URL-prefix properties are distinct. URL rows must
belong to that declared property; a foreign or alias canonical remains a mismatch.

The library API is synchronous and offline:

```js
import { checkIndexingEvidence } from './scripts/lib/indexing-evidence.mjs';

// Caller supplies original buffers and an explicit UTC reference clock.
const report = checkIndexingEvidence(
  metadataBytes,
  originalRawBytes, // null only for explicitly unavailable raw/extraction
  'sc-domain:canlicapital.com',
  '2026-10-02T02:00:00.000Z',
);
```

Inputs are native `Buffer` or `Uint8Array` values. The API reads intrinsic typed-array
slots, copies into owned memory and rejects subclasses, proxies, shared backing
memory and ordinary objects. It does not execute caller getters, iterators, `toJSON`,
species or callbacks. The explicit reference time is a caller clock, not provider
attestation or an automatic freshness qualification. Unknown values remain null
with reasons. Counts require nonnegative safe integers; strings, booleans, fractions,
negative zero, nonfinite and unsafe values are refused. UTC timestamps use
`YYYY-MM-DDTHH:mm:ss[.sss]Z`; dates use`YYYY-MM-DD`. Invalid calendars, future
observations relative to the reference, data/update dates after observation and
conflicting date windows are refused.

The strict metadata object has exactly these fields. Every listed nested field is
required even when its value is null; additional fields and duplicate JSON keys are
refused.

| Field | Contract |
| --- | --- |
| `schema` | `canli.indexing-evidence-input.v1` |
| `provider`, `property`, `metricKind` | The exact declared provider/property and one metric class above |
| `report` | `{kind, version: "v1", title}`; title retains the supplied report label |
| `observedAt` | Supplied observation UTC; distinct from actual data dates |
| `data` | `{date, windowStart, windowEnd, updatedAt, unavailableReason}`; dates/windows/update can be null; paired windows must be ordered and consistent |
| `scope` | `{kind, filter, family, selection, unavailableReason}`; kind`property`/`family`/`selected_urls`; selection`aggregate`/`complete_export`/`purposive`/`unknown`; family is required only for family scope |
| `capture` | `{method, authorship: "self_attested", implementation}`; method`manual_export`/`manual_transcription`/`synthetic_fixture` |
| `capture.implementation` | `{name, version, sha256, unavailableReason}`; missing implementation identity stays null/reasoned; supplied pins are declarations, not independently verified code |
| `source` | `{format, sha256, bytes, unavailableReason}`; format`utf8_json`/`utf8_text`/`opaque`; hash/length must match the captured raw buffer before extraction |
| `extraction` | `{method, review, reviewer, unavailableReason}`; method`synthetic_json_v1`/`normalized_manual`/`unavailable`; review`not_reviewed`/`self_attested` with a supplied reviewer label only for the latter |
| `coverage` | `{status, rowsReported, totalRows, pagesCaptured, totalPages, rowLimit, limitReached, hasMore, sampling, unavailableReason}`; status`complete`/`partial`/`unknown`, sampling`none`/`purposive`/`unknown` |
| `metrics` | Exactly the class's value keys plus`unavailableReason`; each value is a count or null |
| `rows` | Inspection or performance rows only; other classes require`[]` |
| `canonicalSet` | `{manifestSha256, unavailableReason}`; supplied manifest reference remains self-attested, not independently checked admission |

Unavailable data/update time, filter/selection, implementation identity, raw binding,
extraction, counts, canonical manifest or partial/unknown coverage requires an explicit
nonempty reason. A known raw binding uses a lowercase64-digit SHA256 and exact length;
missing raw must use unavailable extraction/null metrics/no rows with reasons. An
available raw source cannot simultaneously be declared unavailable.

Inspection rows are`{url, canonical, indexed, admitted, unavailableReason}`. The three
status/canonical fields can be null only with a reason. `admitted` is a supplied claim;
neither that flag nor a supplied manifest digest verifies useful-page admission.
Performance rows are`{url, impressions, clicks, unavailableReason}`. Counts can be
null with a reason. Declared complete performance row totals must equal the supplied
aggregate; inspection count and declared returned-row count must match retained rows.

Coverage describes the **declared captured report**, not independently established
site coverage. `rowLimit` is the declared overall export limit across captured pages;
null means unknown/unbounded by the declared interface, with an unavailable reason.
The checker itself always imposes512 rows. Contradictory totals/pages are refused.
Declared completeness requires known equal totals/pages, no continuation or row-limit
hit, no sampling/unknown metric or row statuses and no duplicate URLs/canonicals, canonical mismatch
or unknown row status. Reaching the declared row limit is conservatively incomplete
even when `hasMore` is false. Selected/purposive rows cannot be complete site/family
evidence. A row summary counts retained/duplicate/mismatched/unknown rows and distinct
**declared** positive admitted-canonical candidates; it never promotes that diagnostic
count to established indexing, useful canonical coverage or the qualified target.

`normalized_manual` retains the exact raw workbook/text/JSON while keeping its supplied
normalized values and review label explicitly self-attested. Opaque binary input is
not decoded. A supported text/JSON declaration must pass strict UTF-8/JSON validation,
but this does not extract provider fields. Unsupported binary extraction uses
`unavailable`, null metrics and an unknown/partial coverage reason. No spreadsheet
library, generic number scraping or provider parser is added.

The only automatic extraction is deliberately synthetic: `synthetic_json_v1`
requires capture method`synthetic_fixture`, format`utf8_json` and this exact raw shape:

```json
{"schema":"canli.synthetic-indexing-source.v1","payload":{}}
```

`payload` must contain exactly `provider`, `property`, `report`, `metricKind`,
`observedAt`, `data`, `scope`, `coverage`, `metrics`, `rows` and`canonicalSet`, with
values identical to the metadata. The empty illustration above is refused. This
fixture contract verifies extraction/binding reproducibly without implying a real
provider schema, provider run or measured indexing result.

Bounds are128KiB metadata,2MiB raw,4MiB report,512 rows per array, nesting depth12,
16,384 parsed value nodes and4,096 UTF-16 units per JSON string. Bounds apply before
unbounded parsing/traversal. Invalid UTF-8, unpaired Unicode and duplicate keys are
refused; valid Unicode is preserved. Source bytes are never sanitized, truncated,
refetched or silently replaced. The frozen result retains exact original metadata
and source as base64 plus hashes/lengths. A refusal throws an`IndexingEvidenceError`
with a bounded code and no raw content in its message.

The optional CLI requires five explicit flags; it has no default input/output,
discovery, recursive directories or publication:

```sh
node scripts/lib/indexing-evidence.mjs \
  --metadata /absolute/existing/observation.json \
  --raw /absolute/existing/original-export.bin \
  --property sc-domain:canlicapital.com \
  --as-of 2026-10-02T02:00:00.000Z \
  --output /absolute/existing/new-private-report.json
```

Use explicit `--raw unavailable` for the unavailable-source contract. Inputs are
read-only, bounded regular files admitted through nonblocking/no-follow descriptors.
The reader checks descriptor identity, size and change times before/after the one
capture. Paths must be absolute and normalized, with existing non-aliased parents.
The output is exclusive mode0600; existing outputs, symlinks and input aliases are
refused. No directories are created and no failed output is unlinked. Write/fsync/
close failure leaves uncertain output for manual inspection and produces no success
receipt. Descriptor ownership is relinquished before its single close attempt;
an ambiguous close is never retried on a potentially reused descriptor number.
An unsuccessful close may leave a descriptor open until process termination.
Terminal output contains only a report digest/length and unknown-count
receipt, or a refusal code; it does not echo input content, property/filter/path
strings or credentials. The private artifact intentionally retains the explicitly
supplied original reports. No tokens, cookies, credentials, browser sessions,
environment secrets, API/client endpoints or network calls are read or acquired.

These are synchronous offline checks. They cannot force a deadline on blocking OS
operations, guarantee a power-loss transaction, detect every filesystem substitution
between checks or authenticate a self-authored source. No hidden retry or recovery
resubmission exists. New provider capture/authentication, independent extraction,
freshness qualification, representative canonical sampling and actual admission
remain separately allocated work.

Meaningful synthetic API and actual CLI fault cases are registered under
`npm run test:indexing-evidence` and the existing`npm run verify`. They remain
**32 named source cases** at the first signed0210c110 checkpoint. Its first remote
Node22.23.3 run executed all32:30 passed and2 fault-fixture assertions failed within
957 root cases (955 passed/2 failed) plus6 prechecks. Notification checks did not
run after the failure; the other six CI checks passed. The original failed output
is retained byte-exact. One fixture had overwritten its malformed hash during
construction; the other intercepted a module-load read before the intended input
descriptor capture. Corrections target those fixtures while preserving checker
code. Corrected-head existing remote CI and independent source reviews remain
required; earlier passes do not establish the new head. No local project job or
inherited capacity grant accompanies this phase.

Corrected signedff6f80c1 subsequently passed all32 actual new cases within957 root
cases, plus6 prechecks,9 notifications and139 execution cases, with all seven checks
passing. Primary static review7a69477c foundCC-360-CLOSE-RETRY-FD-REUSE: an ambiguous
close could have retried a descriptor number reused by an unrelated file. Both
read/write paths now relinquish ownership before one close attempt. Two new actual
CLI close-after-close/reuse regressions are **WRITTEN**, making34 named source cases;
this corrected implementation requires its own signed pin, exact remote CI and
independent source review. The earlier32-pass run remains evidence forff6, not this
new head, and the original0210 failures stay preserved.

This contract addresses the offline intake part ofCC-INDEX-INGEST-GUARD and raw
binding requirements ofCC-INDEX-RAW-PROVENANCE. CC-INDEX-FRESH-AGGREGATE,
authenticated capture and useful canonical coverage remain open. All owner goals
remain active: the four Sovereign pillars, efficient useful MCP/API/developer
adoption, rights-cleared expert refinery, governed ALPHAC outcomes, paper then
lawful capital,10M actually indexed useful source-backed canonicals, relevant
search intents/SEO/design/analyzers/graphs and independently reviewed research.
