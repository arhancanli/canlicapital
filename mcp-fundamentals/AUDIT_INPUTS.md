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


Initial signed1ff passed all29new cases once in MCP, within97fundamentals,
root6+1044+9 and execution139, with allseven checks on remoteNode22.23.3.
Both independent source and retained-CI gates passed. The immutable evidence
archive is [fundamentals-audit-stdio-20261002](../docs/goal/evidence/fundamentals-audit-stdio-20261002/README.md),
allocated by PRIMARY as exactly79members. It preserves initial943eightfailures,
separate45727/9e28/1ff29successes,32rawcaptures,foursources,fixes andreviews.
Its README is the unchanged historical preview snapshot; the finalized manifest
and allocation original record installed membership and authority. Final source,
archive, new-headCI and independent extensions remain separate pending gates.
Repository-only Unreleased scope, finite caps, selected-N and unknowns are unchanged;
actual source rights, human expertise/labels, indexing and strategy outcomes remain
unverified. No local project runtime or publication occurred.


## Portable opt-in package command (Unreleased)

PR363's repository example was delivered as b3b5f45b with29actual remote cases,
all seven checks and79 preserved evidence files. Its earlier pending records above
remain historical. This separate candidate prepares `canli-fundamentals-audit` for
the next substantial fundamentals release; it is not currently published to npm.
The default command and hosted server continue to expose seven tools.

The actual candidate tarball includes `src/audit-inputs-stdio.mjs`,
`src/audit-inputs-core.mjs`, `src/canonical-json.mjs` and this contract. No repository
`../../scripts` import is required by that command. The canonical file is an exact
9481-byte copy of the protected root helper, SHA256
`881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b`.
Core whole-source SHA changes from
`40ac2b1e5321cb453a71797888138f38570a4d6057d197461d681237506bff36` to
`e612ba0e44d12fd275b3e1dc0a2331bfe6fb005b4da8075e46ae009c5e299059`
solely because its canonical import becomes `./canonical-json.mjs`. Its function
bodies, limits, scoring, raw bindings and declared-source-hash semantics stay exact.

The original repository adapter is still SHA256
`de1deacff44907249640e8c6dfe4a0df9ec38dc27aed4a299e8ffed0146a421c`.
The packaged adapter is separately bound as SHA256
`537673fc03d0954ae480b239b8b481d11e14d763f1d0c07a985bb7d8fbd5b5c0`: two
local import paths, the descriptive comment/tool description, server name/title
and introductory instruction identify the opt-in command. Its protocol identifier
version remains0.0.0, distinct from package0.5.0. All fingerprinted functions,
schemas, capacity limits, error text and CLI realpath identity remain exact.
The behavior fingerprint is not a whole-module hash or authentication of a caller
supplied module hash. Inherited errors retain their previous contract wording;
this same AUDIT_INPUTS.md is now included in the artifact.

Once the independently reviewed candidate tarball has been installed privately,
use its absolute bin path in the MCP client configuration:

```json
{
  "mcpServers": {
    "fundamentals-audit": {
      "command": "/absolute/private-install/node_modules/.bin/canli-fundamentals-audit",
      "args": []
    }
  }
}
```

Node and the existing pinned SDK dependencies are required. No data-fetching,
listening network server or persistent source storage is needed for this command.
Supply canonical padded base64 for the exact reference, usage and explicit settings
bytes, plus a separate exact64-character lowercase reference SHA256. Detail defaults
to the complete-row compact view; `evidence` returns the exact complete core report
within its separate fixed cap. Every selected row and null outcome stays visible.
Input/refusal/projection/whole-output policies in this contract also apply here.

The following self-contained function takes an initialized SDK client and Node's
`createHash`, uses only synthetic supplied bytes, and deliberately compares a later
value90 with the earlier eligible100. It works with the packaged command's listed
`audit_inputs` tool; it does not require repository modules or downloaded facts.

<!-- audit-package-workflow:start -->
```js
async function packageAuditWorkflow(client, createHash) {
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
<!-- audit-package-workflow:end -->

Packaging verification is first run by existing remote CI. It performs exactly one
`npm pack --offline --ignore-scripts` with an owned destination/cache and empty
explicit npm configurations; an armed network sentinel covers that npm child.
Its independently checked actual tarball is bounded to256KiB compressed/2MiB
expanded/32members before fixture writes, with regular files, safe unique paths,
checksums, complete exact membership, bin modes/shebang and pinned source closure.
Missing or changed canonical bytes, outside runtime imports, changed declared bins
or extra private files fail the packaging audit. This custody check does not
authenticate an actor who rewrites the checker and its pins.

The temporary SDK fixture has no Git checkout/root scripts and launches the actual
packed command through an installed-bin-style owned symlink. The sole declared
external link is to the CI job's already installed exact SDK2.1.0/Zod4.6.5
dependencies, never to repository runtime source. No dependency installation or
registry call occurs in this packaging test. Parent fixture/cache writes are
separate from the audit child's no-network/no-write sentinel. Positive controls
prove the child guard refuses even caught fetch and file-write attempts.

The npm child has a20s deadline and combined64KiB output cap. Each SDK child has a
10s lifetime timer, one close invocation with a3s wait bound, followed by observed
owned PID absence within2.5s. Calls are counted against actual tools/call dispatches
so an implicit SDK retry fails the fixture. Failures are preserved, including
callback and protocol faults. These observations are not a hostile-process sandbox
or universal real-time/reaping guarantee. Written fixtures and source proof are
not reported as passed until exact remote logs and both independent reviews exist.

Actual source rights, complete universe coverage, human expertise/independence,
labels, indexing, adoption and qualified financial outcomes remain unknown. Package
preparation is distinct from a version bump, hosted activation or npm publication;
PRIMARY retains those release steps.


Initial package candidate88c4e7f1 failed its first remote MCP setup: all20new
cases were hook failures, with0new passes; the97prior fundamentals cases passed,
root6+1044+9 passed, execution139 was unrun, and six of seven checks passed.
The armed npm network sentinel recorded a caught request even though `npm pack`
exited0. No tarball admission or packaged SDK behavior is claimed from that run.
All original logs/API captures and the failed signed source remain preserved.

The source-supported diagnosis is npm's optional update notifier: the deliberately
minimal subprocess environment omitted CI, and official bundled npm10.9.9 source
checks the notifier opt-out or CI detection before starting its background request.
The denied operation has no captured call-site stack, so this remains a diagnosis
to verify on the corrected head. The fixture now supplies CI=true and explicit
`--update-notifier=false --audit=false --fund=false` alongside offline/ignore-scripts.
The network sentinel stays armed; another denied attempt still fails the setup.

The first actual-tarball fixture also emits one bounded
`CANLI_AUDIT_PACKAGE_TARBALL` diagnostic: original gzip bytes as canonical base64,
compressed length/SHA256, each regular member's path/mode/length/SHA256 and the
explicit sole dependency-link disclosure. Its360KiB record cap contains the
existing256KiB compressed tarball cap. Independent reviewers can recover the
actual original artifact from retained CI, bounded-decode it and compare every
member with the signed source. This records an actual candidate artifact, not a
published package, and contains no credentials or private capacity records.
All20fixture names and existing runtime input/output/lifecycle limits are retained;
new-head remote CI and both independent gates remain required.


Independent source review of initial88 also found P2
`CC-364-TAR-HEADER-ASCII-COERCION`: Node Buffer ASCII conversion can clear a raw
header byte's high bit, admitting a different byte sequence under the expected
path or numeric value. That counterexample was source reasoning, not a reviewer
execution. The parser now rejects every non-ASCII byte in each admitted header
text/numeric field before conversion. A21st actual-tar fixture mutates name, mode,
size, checksum, type and prefix bytes with valid recomputed checksum/gzip, and
requires refusal before any fixture file appears. The original20names are intact.
Runtime policy/schema/core/defaultseven are unchanged. Corrected21-case remote
evidence and independent final reviews remain pending.


Corrected candidate e073e704 also failed remote package setup. All21 new cases
were hook failures with0 new passes;97 prior fundamentals cases and root
6+1044+9 passed, execution139 remained unrun, and six of seven checks passed.
The original YAML block reports PACKAGE_MODE actual0644 versus expected0755
without naming the member. The protected default server has frozen Git mode
100644; attributing that unnamed failure to it is a source-supported inference.
There was no denied network marker in this log. All8 original captures832855B
and the failed receipt5c3c34a3 remain retained, alongside the initial88 failure.

Raw archive permission admission now follows the frozen source: default
src/server.mjs0644, opt-in src/audit-inputs-stdio.mjs0755, all other admitted
members0644. npm10.9.9 bin-links source separately makes installed bin targets
executable. This test models that step only for the owned temporary default
server copy, choosing0755; it does not run npm install or chmod repository files.
The original tar bytes and decoded modes remain intact. An added22nd fixture
rejects altered modes before writes and checks the disclosed raw/installed modes
and unchanged bytes. All21 prior names are preserved;22 cases are WRITTEN until
the new head's actual remote CI passes.

The before hook records a bounded CANLI_AUDIT_PACKAGE_TARBALL_RAW diagnostic
after strict bounded tar decoding but BEFORE package source/mode admission or
fixture writes. It marks RAW_CAPTURED_NOT_ADMITTED and retains the original
gzip as canonical base64, compressed length/SHA256 and decoded member pins.
A separate CANLI_AUDIT_PACKAGE_TARBALL v2 record marks ADMITTED only after the
package fixture passes, binds the same original gzip SHA and member pins, and
discloses the owned fixture bin permission normalization and sole existing SDK
dependency link. A raw record alone establishes neither admission nor SDK behavior.
Both records keep the360KiB record bound and256KiB compressed tarball cap.

SDK fixtures now execute the owned .bin symlink directly through its existing
shebang, with the unchanged no-network/no-write guard supplied through
NODE_OPTIONS before imports. The default command's temporary target alone is
normalized to0755; the opt-in target is already executable in the raw tar contract.
This directly checks command execution in the Git-free fixture. Existing fullN,
nulls, fingerprints, input/output bounds, hidden-retry refusal, one-close deadline
and actual PID-absence checks remain required. No hostile-process sandbox,
published package, install, or universal wall-clock guarantee is claimed.
