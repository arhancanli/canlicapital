# Audit explicitly supplied fundamentals vintages

`src/audit-inputs-core.mjs` is an Unreleased, offline prerequisite for the future
`audit_inputs` capability. A developer supplies the financial rows their backtest
used and a pinned reference snapshot. The core reports which exact observations
were filed strictly before each usage cutoff, whether the used value agrees with
the selected observation, and where the supplied evidence cannot support a verdict.

This import currently requires the repository checkout: it uses the existing
`scripts/canonical-json.mjs` convention. The released fundamentals server does
not import it. It adds no listed MCP tool, hosted endpoint, package version,
dependency, data fetch, filesystem CLI or persistent store.

## Runnable import example

Save this code as `audit-example.mjs` in the repository root and run it with Node
22. It creates only synthetic bytes in memory. The expected reference digest is
computed here because the fixture is created in the example; an actual audit
should use the separately obtained digest of the intended supplied snapshot.

<!-- executable-import-example -->
```js
import { createHash } from 'node:crypto';
import { auditInputs } from './mcp-fundamentals/src/audit-inputs-core.mjs';

const encode = value => Buffer.from(JSON.stringify(value));
const referenceBytes = encode({
  schema: 'canli.fundamentals.audit-reference.v1',
  companyfacts: [{
    cik: 123456,
    facts: { 'us-gaap': { Assets: { units: { USD: [
      { end: '2019-12-31', val: 100, accn: '0000123456-20-000001',
        filed: '2020-02-10', form: '10-K' },
      { end: '2019-12-31', val: 90, accn: '0000123456-21-000002',
        filed: '2021-02-10', form: '10-K' },
    ] } } } },
  }],
});
const expectedSha256 = createHash('sha256').update(referenceBytes).digest('hex');
const usageBytes = encode([{
  cik: '0000123456', taxonomy: 'us-gaap', concept: 'Assets', unit: 'USD',
  start: null, end: '2019-12-31', value: 90, used_on: '2020-03-01',
}]);
const settingsBytes = encode({
  schema: 'canli.fundamentals.audit-settings.v1',
  snapshot_captured_at: '2022-01-01T00:00:00Z', capture_reason: null,
  completeness: 'partial', completeness_reason: 'Selected synthetic vintages only.',
  implementation_source_sha256: null,
});
export const report = auditInputs(referenceBytes, expectedSha256, usageBytes, settingsBytes);
export const summary = {
  selected_n: report.coverage.selected_n,
  status: report.rows[0].status,
  selected_value: report.rows[0].selected?.value ?? null,
  used_value: report.rows[0].usage.value,
  later_only_value_observed: report.rows[0].later_only_value_observed,
};
console.log(JSON.stringify(summary));
```

The result has `selected_n: 1`, `status: "mismatch"`, `selected_value: 100`,
`used_value: 90` and `later_only_value_observed: true`. The later supplied value
is diagnostic; the core never selects it at the earlier cutoff. Changing the used
value to `100` produces a match. These handwritten fixtures establish neither
real source availability nor release accuracy calibration.

## Four explicit inputs

```text
auditInputs(referenceBytes, expectedSha256, usageBytes, settingsBytes)
```

All three byte inputs must be native `Buffer` or native `Uint8Array`. Shared
backing stores, proxies, subclasses, objects, strings and implicit serializers
are refused. The core copies the actual typed-array slots, including a view's
offset, without invoking caller getters, iteration or `toJSON`. The lowercase
64-character expected SHA256 must be a primitive string. The reference digest
must match the same owned bytes that are parsed. No hash coercion or second
reference read occurs.

Every byte input is JSON with strict duplicate-key, UTF8, Unicode and finite
capacity checks. The reference and settings envelopes are closed schemas, and
usage rows must contain exactly their eight documented fields. No fields have
implicit values except the explicitly documented optional source metadata.

### Supplied reference

The example's reference envelope contains `schema` and `companyfacts`, an array
of selected SEC-style companyfacts objects. This is an owned input contract; it
does not authenticate SEC authorship or promise compatibility with arbitrary
vendor exports.

| Object | Required | Optional |
| --- | --- | --- |
| Envelope | `schema: "canli.fundamentals.audit-reference.v1"`, `companyfacts` | None |
| Company | `cik`, `facts` | `entityName` |
| Concept in `facts[taxonomy][concept]` | `units` | `label`, `description` |
| Observation in `units[unit]` | `end`, `val`, `accn`, `filed`, `form` | `start`, `fy`, `fp`, `frame` |

A source CIK may be a ten-digit nonzero string or an integer from 1 through
9,999,999,999, explicitly normalized to that string. Duplicate company CIKs
are refused. Concept and taxonomy keys are exact identifiers. Units are exact
opaque strings, including `USD/shares`; the core does not interpret a scale,
currency conversion or split convention from their labels.

Source `start` may be absent or null for an instant observation. `end`, `filed`
and nonnull `start` are actual calendar dates in `YYYY-MM-DD`, with year at least
1900. `start <= end <= filed` is required. An observation filed after the declared
snapshot capture day is contradictory and refused. Filing timestamps and trading
calendars are absent from this contract. An accession has the literal shape
`0000123456-20-000001`; its shape does not verify a filing or its chronology.
Optional `fy` is null or a calendar-year integer; `fp` and `frame` are null or
bounded strings. Optional labels, descriptions and entity names are bounded text.

The supported periodic forms are `10-K`, `10-K/A`, `10-Q`, `10-Q/A`, `20-F`,
`20-F/A`, `40-F` and `40-F/A`. Other forms remain visible as unsupported
observations. Supported usage taxonomies are `us-gaap`, `ifrs-full` and `dei`.
No alias lookup, taxonomy mapping or economic interpretation is applied.

### Usage rows and numerical domain

`usageBytes` encodes a nonempty array. Each row contains exactly `cik`, `taxonomy`,
`concept`, `unit`, `start`, `end`, `value` and `used_on`. CIK is always an explicit
ten-digit nonzero string. `start` is an explicit date or null; it distinguishes
instant and duration observations. The period must end on or before the cutoff
day. A quarter and a year-to-date period with the same end date are different
identities. A concept alias, absent unit or unspecified split convention cannot
yield a derived value.

`used_on` is either a calendar date or a UTC instant ending in `Z`, with seconds
and optionally exactly three millisecond digits. Offsets, local time, invalid
calendar dates and implicit current-time defaults are refused. Even an explicit
usage timestamp cannot supply the missing intraday filing timestamp.

`value` and source `val` must be JSON numbers. Negative losses, explicit zero
and fractions are supported. Their magnitude must be at most
`Number.MAX_SAFE_INTEGER`; nonfinite values, numeric strings, booleans, null and
negative zero are refused. Each raw decimal token must retain its mathematical
decimal value when parsed and re-emitted by JavaScript. Thus `0.1` and `100.00`
are supported, while `0.10000000000000001`, `9007199254740991.1` and `1e-400`
are refused rather than silently rounded. This is a bounded double precision
contract, without tolerance-based matching or arithmetic deltas.

### Settings declarations

The settings object contains exactly these fields:

| Field | Meaning |
| --- | --- |
| `schema` | `"canli.fundamentals.audit-settings.v1"` |
| `snapshot_captured_at` | Explicit UTC instant or null |
| `capture_reason` | Nonempty bounded reason if capture is null; otherwise null |
| `completeness` | `"unknown"`, `"partial"` or `"declared_complete"` |
| `completeness_reason` | Nonempty bounded reason for unknown/partial; otherwise null |
| `implementation_source_sha256` | Caller-declared lowercase whole-module SHA256 or null |

Capture time and completeness are declarations. `declared_complete` never
establishes actual source completeness, full-universe coverage or survivorship.
The caller may independently pin the module's exact file bytes and supply that
digest. The pure core does not read its own file or authenticate the declaration;
`declared_module_sha256_verified` therefore remains false, with an explicit reason.
Without a supplied module digest, that binding remains null.

## Selection and unknowns

Every row matches the complete CIK/taxonomy/concept/unit/start/end identity.
Supported matching observations fall into strictly earlier, same-day and later
filing-date buckets. Only strictly earlier observations can be selected. The
latest earlier filing date must contain one distinct observation; distinct
accessions, forms or values tied on that date stay ambiguous. Accession sort order
is only presentation order. Exact duplicate observations remain visible and may
collapse to one selection identity. An unambiguous later prior filing can resolve
an older ambiguous date.

| Status | Verdict | Meaning |
| --- | --- | --- |
| `match` | true | Used value equals the uniquely selected earlier supplied observation |
| `mismatch` | false | Used value differs from that observation |
| `missing` | null | Required company, concept, period or earlier observation is absent |
| `unsupported` | null | Usage taxonomy, exact unit or available form is unsupported |
| `ambiguous` | null | Multiple distinct latest earlier observations prevent selection |
| `timing_indeterminate` | null | Same-day date-only filing prevents an intraday availability verdict |

Every null selection has `selected_reason`. A successful selection retains its
value, accession and filed date. On same-day uncertainty a unique strictly earlier
selection may remain visible as a diagnostic, while the overall verdict stays
null. It is never presented as proof that the same-day filing was unavailable.

`earliest_supplied_periodic_filed` and `used_before_earliest_supplied_filing`
refer only to matching observations in the supplied snapshot. They cannot prove
global first-ever availability or trading-calendar lookahead. A
`later_only_value_observed` result means the used value appears in later supplied
observations and in no earlier supplied observation; it is null when same-day
timing could change that conclusion. Changed values set an observation diagnostic,
while `formal_restatement_cause` remains null even for an amended filing form.

Coverage retains every selected usage row, including missing, ambiguous,
unsupported and indeterminate rows. `selected_n` is the complete denominator;
`verdict_supported_n` and `verdict_unknown_n` distinguish evidence support.
Missing values are never zero-filled. Full-universe, survivorship, rights, expert
adjudication, release calibration, global availability, trading-calendar and
split/scaling claims remain null. These counts do not establish a backtest's
causal correctness or the future major release's recall/false-positive targets.

## Finite capture and report limits

Limits are fixed before input capture and exported as frozen `AUDIT_INPUTS_LIMITS`.
There is no caller option to widen them or silently truncate an accepted batch.

| Resource | Maximum |
| --- | --- |
| Reference original bytes | 512 KiB |
| Usage original bytes | 64 KiB |
| Settings original bytes | 4 KiB |
| Companies | 32 |
| Selected usage rows | 64 |
| Source observations across all companies | 2,048 |
| Returned matching observations across the batch | 4,096 |
| Entries in any JSON array | 2,048 |
| JSON nesting depth, root at zero | 16 |
| JSON value nodes | 65,536 |
| Decoded string length | 1,024 UTF16 code units |
| Numeric token length | 128 characters |
| Serialized complete report | 4 MiB |

Additional semantic text limits are 64 units for taxonomy and unit, 128 for
concept, 512 for reasons, 16 for form, and 64 for fiscal-period/frame metadata.
Combined observation expansion counts all matching supported and unsupported
rows. If several usage rows together exceed that limit, the entire batch is
refused; no row, candidate or denominator is dropped to make it fit. The final
serialized report ceiling is checked before returning any report.

Each report retains all three exact original byte inputs as base64, their lengths
and SHA256 digests. The reference binding states that it matches the separate
expected digest; authorship and declarations remain unverified. The behavior
fingerprint binds the core's own functions, fixed limits/schema/form/taxonomy
policies and canonical helper functions. The independently frozen canonical
dependency's whole-byte SHA256 is recorded. This fingerprint is reproducible
under the documented untampered Node intrinsics, and is separate from a
caller-declared whole-module digest; comments or other nonbehavioral module-byte
changes require an updated external whole-file pin.

The `content_hash` uses the existing sorted-key/Python-compatible canonical
convention, excluding itself. Public `JSON.stringify`/parse roundtrips preserve
the hash. The returned report and every object/array descendant are frozen;
later caller-buffer mutations cannot change its retained evidence or verdicts.

Invalid input throws bounded `AuditInputsError` with a stable `code`, without
echoing raw source contents. Malformed or contradictory batches produce no
partial report. Callers can distinguish byte/hash/schema/calendar/numeric/capacity
refusals from a valid report containing unknown source coverage.

## Validation status

The focused registration is `npm run test:fundamentals-audit-inputs`. The same
fixtures are included in the existing root verification suite. They cover original
versus later-value counterexamples, full-N unknowns, cutoff/ties/date-only cases,
units/periods, every-byte reference tampering, strict parsing and numerical limits,
native byte ownership, aggregate bounds, deterministic public JSON and the
executable example above. Source freeze, independently retained existing remote
CI and both independent reviews are separate gates. Written fixtures alone are
not runtime evidence. No local project execution is authorized by this guide's
implementation phase.


## Verified predecessor checkpoint

Signed source `317ebf77` passed all 36 distinct named cases once in each existing
remote root and fundamentals suite on Node 22.23.3: root 6+997+9, fundamentals
68 and execution 139, with all seven CI checks successful. Both independent
source and retained-CI reviews accepted that exact tree and their scoped limits.

The [immutable predecessor archive](../docs/goal/evidence/fundamentals-audit-inputs-20261002/README.md)
contains 26 TOTAL files including README and manifest, 3,374,200 ORIGINAL bytes
and 866,171 stored bytes. It preserves the raw logs, four original product text
snapshots, independent reviews and both metadata-reader corrections; 13 external
catalogue pins are explicitly separate from portable archive members. The final
source/archive extension, exact new-head CI and actual repository delivery are
separate gates whose proofs stay external. No later head or numerical outcome is
accepted by this dated predecessor checkpoint.


## Repository stdio MCP example (Unreleased)

The separate `examples/audit-inputs-stdio.mjs` program exposes one read-only
`audit_inputs` tool over stdin/stdout. It calls this delivered audit core unchanged.
It requires a complete CanliCapital repository checkout: the core's canonical
helper is in `scripts/`, outside the published npm package. It is a repository
example, not a new published command, hosted endpoint or eighth default tool.

From the repository checkout, install the existing pinned dependencies with
`npm ci --prefix mcp-fundamentals`. A stdio client's configuration can use:

```json
{
  "mcpServers": {
    "canli-fundamentals-audit-example": {
      "command": "node",
      "args": ["/absolute/path/canlicapital/mcp-fundamentals/examples/audit-inputs-stdio.mjs"]
    }
  }
}
```

Use an absolute checkout path and Node 20.10 or newer. The server's stdout contains
only MCP protocol messages. It has no listener, fetch, cache, provider call or
persistent write. Its local example identifier is `0.0.0`; the package release
version remains unchanged. No network/source rights or calibration is inferred.

A client first initializes and lists tools, then supplies `reference_base64`,
`expected_reference_sha256`, `usage_base64` and `settings_base64`. Each base64
string carries the exact original bytes, including whitespace, key ordering and
numeric literals. The separate reference pin must come from the caller's trusted
manifest; a matching hash alone does not authenticate source authorship. Read
files in the client when needed. Do not parse and reserialize a source before
encoding it, repair malformed base64, or invent omitted settings.

The optional `detail` selects `compact` (default) or `evidence`. Compact retains
every selected usage row, exact concept/unit/period, selected source identity,
status, verdict and reason, all scalar uncertainty diagnostics and full-N
coverage. It omits the three original-base64 blobs and four per-row vintage
arrays, whose observed counts remain visible. `projection.omitted` names those
omissions. `projection.core_report_content_hash` binds the complete core report;
the compact audit has its own schema and does not pretend to be that full report.
The outer `content_hash` binds the exact selected view. Evidence returns the
complete core report unchanged, including exact original input bytes.

Both views retain raw input SHA256/length bindings and the core's implementation
behavior hash. Caller-declared whole-module hashes remain unverified. A separate
adapter behavior fingerprint binds its functions, schemas and finite policy; it
is not a verified whole-file hash. Signed repository source review remains the
whole-file binding. JSON text and `structuredContent` represent identical data.
No measured token saving or latency comparison is claimed from output size.

| Boundary | Maximum |
| --- | ---: |
| Decoded reference / usage / settings | 512 KiB / 64 KiB / 4 KiB |
| Sum of all three decoded inputs | 560 KiB |
| Encoded input | `4 * ceil(decoded maximum / 3)` ASCII characters each |
| SDK inbound read buffer, before JSON parsing | 1 MiB |
| Compact / evidence structured JSON | 64 KiB / 2 MiB |
| Compact / evidence complete tool result, including escaped text copy | 256 KiB / 6 MiB |
| Entire outbound JSON-RPC frame, including protocol envelope | 7 MiB + 4 KiB |

All encoded and decoded lengths, padding bits and the three-input aggregate are
checked before allocating decoded buffers. The exact owned buffers then reach
the unchanged core; its 64-row, source, Unicode, numeric and other limits still
apply. Output caps reject the whole valid batch without dropping rows or source
evidence. A valid large batch can exceed a view's output cap; use a smaller
explicitly selected batch and retain that changed denominator in your own audit.

Refusals use `isError: true` and a bounded JSON error with a stable code.
`ARGUMENTS`, `EXPECTED_SHA`, `DETAIL`, `BASE64`, `INPUT_BOUND` and
`AGGREGATE_BOUND` describe transport admission. `CORE_` codes preserve the core's
refusal class, such as `CORE_REFERENCE_SHA`, `CORE_DUPLICATE_KEY` or
`CORE_NUMBER_PRECISION`; `OUTPUT_BOUND` refuses complete output. Errors never
echo raw reference, usage or settings contents. Malformed/oversized protocol
frames can close the transport before a request ID is available; stderr uses
only the bounded `TRANSPORT` notice. SDK tool results pass through its negotiated
codec; neither schema validation nor error reporting requires a provider.

The following synthetic workflow runs after SDK initialization. It deliberately
uses a later value before that later filing; the result is `mismatch` against the
original observation, not an automatic claim about global first availability.

<!-- audit-stdio-workflow:start -->
```js
async function auditWorkflow(client, createHash) {
  const reference = Buffer.from('{"schema":"canli.fundamentals.audit-reference.v1","companyfacts":[{"cik":123456,"facts":{"us-gaap":{"Assets":{"units":{"USD":[{"end":"2019-12-31","val":100,"accn":"0000123456-20-000001","filed":"2020-02-10","form":"10-K"},{"end":"2019-12-31","val":90,"accn":"0000123456-21-000002","filed":"2021-02-10","form":"10-K"}]}}}}}]}');
  const usage = Buffer.from('[{"cik":"0000123456","taxonomy":"us-gaap","concept":"Assets","unit":"USD","start":null,"end":"2019-12-31","value":90,"used_on":"2020-03-01"}]');
  const settings = Buffer.from('{"schema":"canli.fundamentals.audit-settings.v1","snapshot_captured_at":null,"capture_reason":"Synthetic snapshot only.","completeness":"partial","completeness_reason":"Only supplied observations.","implementation_source_sha256":null}');
  // Synthetic example pin. For real supplied files, use a separately trusted pin.
  const expected = createHash('sha256').update(reference).digest('hex');
  await client.listTools();
  const response = await client.callTool({ name: 'audit_inputs', arguments: {
    reference_base64: reference.toString('base64'),
    expected_reference_sha256: expected,
    usage_base64: usage.toString('base64'),
    settings_base64: settings.toString('base64'),
    detail: 'compact',
  } });
  if (response.isError) throw new Error(response.structuredContent.error.code);
  return response.structuredContent;
}
```
<!-- audit-stdio-workflow:end -->

To run that function, save it in a client script inside `mcp-fundamentals/`,
then import `createHash` from `node:crypto`, `Client` from
`@modelcontextprotocol/client`, and `StdioClientTransport` from
`@modelcontextprotocol/client/stdio`. Create a client with a name and version,
connect a transport using `process.execPath` and the absolute example path,
call `auditWorkflow(client, createHash)`, and close the client once in `finally`.
This completes that client script after the function above:

```js
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
const client = new Client({ name: 'my-local-audit', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./examples/audit-inputs-stdio.mjs', import.meta.url))],
  maxBufferSize: 8 * 1024 * 1024,
});
try {
  await client.connect(transport);
  console.log(JSON.stringify(await auditWorkflow(client, createHash), null, 2));
} finally {
  await client.close();
}
```

Run your saved client script with Node. The returned row selects accession
`0000123456-20-000001`, value 100; its verdict
is false and `later_only_value_observed` is true. Same-day, ambiguous, missing
and unsupported rows retain null verdicts. No reviewer, source-rights, trading
calendar, survivorship or release admission is established.

The focused registration is `npm run test:fundamentals-audit-stdio` after the
package dependencies are installed. Existing remote MCP CI discovers this test
through `test/*.test.mjs`; root verify is unchanged. The tests exercise actual
SDK initialize/list/call/close, exact evidence/text parity and the workflow above,
all six full-N outcomes, strict input/output bounds and safe refusal recovery.
An isolated preload guard denies unexpected network access and persistent file
writes, with separate positive controls proving both denials. Every SDK child
has a finite test deadline and an actual owned-PID absence check after one close.
These are written fixtures until their original remote logs establish execution.
Independent source and exact-current-CI gates precede repository delivery.


Initial remote943b reported18of26newstdio passes and eight failures. Original
logs remain preserved. Five publicJSON prototype comparisons, stable BASE64/UTF8
code validation and an undersized evidence-overflow fixture are corrected; full
base64 end-match now has a before-allocation regression. The finite policy and
complete selected-N are unchanged. Twenty-seven corrected cases await their own
new-head remote CI and independent reviews; no local project execution occurred.


Corrected signed457 subsequently passed all27new cases in the existing remote
MCP job, within95fundamentals cases; root6+1044+9 and allseven checks passed.
Its exact original logs/API captures and the eight initial943failures are retained.
Independent static review also identified a trailing-line-terminator hash cue:
the first adapter checks allowed it before the unchanged core rejected it.
The separate expected hash now requires exactly64lowercase hexadecimal characters
in both advertised schema and native admission, before any base64 decoding.
One added no-allocation and actual-stdio refusal/recovery regression brings the
next written candidate to28cases; its own CI and independent reviews are pending.
No policy, core, released tools or package versions changed.


The exact-hash candidate9e then passed all28new fixtures within96fundamentals
cases, root6+1044+9 and allseven remote checks. Its eight original captures and
the prior failed and successful heads remain separate immutable evidence.
Primary static review found the CLI entry compared lexical paths, which can
skip startup when launched through an absolute symlink or filesystem alias.
The entry now resolves the real paths of both launch identities, reading only
that metadata. The pure audit function and its core remain unchanged. One new
SDK fixture launches through an owned temporary symlink and observes initialize,
list, call, one close and actual owned-child absence under the same finite guard.
All28prior fixture names remain;29cases are written for the next candidate,
whose own CI and both independent exact-head gates are pending.
