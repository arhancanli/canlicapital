# Offline Fundamentals audit client

This repository example sends three explicit local byte files to the delivered
`audit_inputs` stdio tool, checks its compact artifact and closes its owned child
before returning success. It supplies no filings, provider connection, credentials,
financial advice or orders. The default seven-tool Fundamentals server is unchanged.
The example is not part of the existing npm package files allowlist.

Use a checkout with its existing locked Fundamentals dependencies already installed.
The repository's MCP CI job installs that lock and runs the existing test wildcard.
The client uses `@modelcontextprotocol/client` **2.1.0**. It starts only
`mcp-fundamentals/src/audit-inputs-stdio.mjs` from the explicit repository root,
with the current Node executable and `shell: false`.

## Exact invocation

Each option is required once, in any order:

```sh
node mcp-fundamentals/examples/audit-inputs-client.mjs \
  --root /absolute/canonical/repository \
  --reference /absolute/owned/reference.json \
  --expected-reference-sha256 64_lowercase_hex_characters \
  --usage /absolute/owned/usage.json \
  --settings /absolute/owned/settings.json
```

Unknown, repeated and missing options, relative input paths, NUL/control characters
and paths over 4096 UTF8 bytes refuse. There is no stdin, environment data default,
URL, discovery, glob, credential option, evidence mode or output file. The root is
normalized and must identify the checkout containing this example. A temporary
symlink to the client entry has the same behavior as the direct entry. Symlinks to
input files are refused. A root path is a filesystem identity, not source authority.

Supply the expected reference SHA as a separate primitive lowercase string. The
client computes the observed SHA from the captured original buffer and compares it
before any transport effect. This binds bytes to a caller declaration; it does not
authenticate authorship or capture time. Raw whitespace is significant. Duplicate
JSON keys and malformed UTF8 refuse without repair or replacement.

## Executable synthetic recipe

Run this with an explicit absolute repository root argument. The three input files
are created in an owned temporary directory. The fixed reference SHA below was
calculated for the exact handwritten ASCII fixture plus its final newline; it is a
synthetic author pin, not independent evidence about any real filing.

```sh
node --input-type=module - /absolute/canonical/repository <<'JS'
import { mkdtempSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = realpathSync(process.argv[2]);
const directory = mkdtempSync(join(tmpdir(), 'canli-audit-example-'));
const reference = Buffer.from('{"schema":"canli.fundamentals.audit-reference.v1","companyfacts":[{"cik":123456,"facts":{"us-gaap":{"Assets":{"units":{"USD":[{"end":"2019-12-31","val":100,"accn":"0000123456-20-000001","filed":"2020-02-10","form":"10-K"}]}}}}}]}\n');
const usage = Buffer.from('[{"cik":"0000123456","taxonomy":"us-gaap","concept":"Assets","unit":"USD","start":null,"end":"2019-12-31","value":100,"used_on":"2020-03-01"}]\n');
const settings = Buffer.from('{"schema":"canli.fundamentals.audit-settings.v1","snapshot_captured_at":null,"capture_reason":"Handwritten synthetic snapshot; capture time unknown.","completeness":"partial","completeness_reason":"Only selected synthetic observations supplied.","implementation_source_sha256":null}\n');
const options = {
  root,
  reference: join(directory, 'reference.json'),
  expected_reference_sha256: '752f2a7ad3e5f1eea5283fa832bae4f11c163bd4391d2bbc7b6609bd38c2b4c2',
  usage: join(directory, 'usage.json'),
  settings: join(directory, 'settings.json'),
};
for (const [name, bytes] of Object.entries({ reference, usage, settings })) {
  writeFileSync(options[name], bytes, { mode: 0o600, flag: 'wx' });
}
const { runAuditInputsFiles } = await import(pathToFileURL(join(root, 'mcp-fundamentals/examples/audit-inputs-client.mjs')));
const terminal = await runAuditInputsFiles(options);
process.stdout.write(terminal.encoded);
process.exitCode = terminal.report.status === 'ok' ? 0 : 1;
JS
```

The fixture's expected compact result has one selected row with `status: "match"`
and `verdict: true`. This is agreement with the supplied synthetic observation,
not proof that a real company reported it or that a strategy could trade it.
The files remain in the owned temporary directory for inspection.

The injected byte interface accepts owned native `Buffer` or `Uint8Array` values:

```js
const terminal = await runAuditInputsClient(
  referenceBytes, separatelySuppliedReferenceSHA, usageBytes, settingsBytes,
  { operations, signal }
);
```

Injected operations provide `connect(options)`, `callTool(request, options)` and
`close()`. They are trusted bounded test/application adapters. `close()` must
provide `owned_pid`, `owned_child_absent: true` and an admitted evidence kind;
native fault tests use `injected_no_child`. Such an injected acknowledgement is not
proof of an external process. The built-in SDK adapter captures its actual child
object and observes that same child's exit/close. It may retain a known owned PID
on refusal when absence cannot be established.

## Admission and lifecycle bounds

| Boundary | Limit |
| --- | ---: |
| Reference bytes | 524288 |
| Usage bytes | 65536 |
| Settings bytes | 4096 |
| Three-file decoded aggregate | 573440 |
| Encoded request including fixed framing allowance | 1048576 |
| SDK transport buffer and retained reply JSON | 524288 each |
| Observed stderr bytes | 65536 |
| Successful terminal JSON | 524288 |
| Refusal terminal JSON | 2048 |
| Observed work / close reserve / total | 15000 / 5000 / 20000 ms |

All three FDs are opened with no-follow and nonblocking flags, then checked for
regular-file type and native size. Individual and aggregate admission happens
before the first payload read or allocation. Reads consume only the remaining
admitted bytes in chunks up to 65536, followed by at most one one-byte overflow
probe per file. Exact length, same-FD device/inode/mode/size/mtime/ctime and
regular-file type are checked again. Each numeric FD is relinquished before its
single close attempt; a close error refuses dispatch and is never retried. Inputs
are never unlinked. The injected byte runner likewise admits all native slots
before copying or encoding, rejects shared/proxy/subclass buffers and needs no
caller byte-length getter.

The aggregate clock begins before input capture. Work checks run after capture,
after synchronous callbacks/acknowledgements and again after queued work immediately
before connect and call dispatch. A deadline or external abort prevents the next
effect. Late results never upgrade a refusal. Close is memoized, has a separate
five-second reserve, and final encoding is admitted against that reserve and the
twenty-second total. Report timing fields ending in `before_encoding_ms` are samples
before terminal serialization; successful `encoding_budget_checked` also requires
the observation after serialization to fit. Timers and clocks are cooperative
observed bounds under trusted native synchronous code, not universal preemption.

There is one connect and one `audit_inputs` call. Explicit
`versionNegotiation: { mode: 'legacy' }` excludes the SDK's automatic probe sibling.
The protected exact `AUDIT_TOOL`, including schemas, is supplied in the **second**
argument to `client.callTool(request, { signal, timeout, toolDefinition })`. This
excludes hidden `tools/list` discovery and the SDK's header-mismatch retry path.
No sampling/elicitation handler, input auto-fulfilment, reconnect, fallback or
second server is configured. Initialize and initialized-notification frames are
the handshake, not additional audit calls.

Locked SDK 2.1.0 removes `resultType` when decoding a legacy complete reply. Only
the built-in fixed legacy adapter lifts that completed SDK return to the injected
interface's explicit `resultType: "complete"`; unexpected non-complete results
still refuse. The client does not enable modern negotiation to obtain a marker.

Stderr is drained and counted without retention or echo; overflow aborts work and
closes the owned child. The SDK's pinned default environment inherits only its
platform allowlist (`HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM`, `USER` on POSIX;
the pinned Windows OS/path/user/temp list on Windows), excluding shell-function
values. No credential/provider configuration or `NODE_OPTIONS` is passed. The
Node executable is absolute. Test preloads are explicitly injected by the test
harness before the child's imports, with no production preload option.

The client does not treat SDK `close()` returning or `transport.pid === null` as
absence proof. It captures the exact pinned transport's child object before that
reference can be cleared, memoizes SDK teardown and waits for the same child's
exit/close. This uses a reviewed 2.1.0 internal field and would need review for a
different SDK. No shell, PS, foreign-process scan or foreign signal is used. Native
cleanup can signal only the admitted SDK child. Hostile descendant and PID-reuse
guarantees are outside this cooperative boundary. Import starts no client or
payload capture; the CLI entry check only normalizes executable filesystem identity.

## What a successful artifact establishes

The client uses the delivered `AUDIT_TOOL_OUTPUT` schema and canonical
`contentHash` implementation. It requires one JSON text content matching the
structured content, a complete successful compact reply, its canonical artifact
hash, and exact reference/usage/settings length and SHA bindings. Projection,
selected-row count, usage identity/order, six-status coverage counts and null
verdict identities must agree. It preserves every selected row, including missing,
unsupported, ambiguous and same-day timing-indeterminate observations.

`complete_core_report` remains **false**. `core_report_content_hash` is a retained
companion reference; omitted raw evidence and vintage arrays are not reconstructed
or independently authenticated. An artifact hash establishes internal integrity,
not authorship or financial correctness against an untrusted replacement server.
The fixed delivered executor supplies the audit semantics; the client does not
reimplement financial calculations or derive new labels.

The core's `implementation.declared_module_sha256_verified` remains **false**.
It has no `runtime_identity_verified` field. Behavior fingerprints are diagnostics.
External exact Git/module/import pins bind reviewed source; caller declarations
and the client do not authenticate executing source. A date-only same-day filing
keeps a null verdict even when an older selected observation is diagnostic.
Full-universe coverage, source rights, expert adjudication, global availability,
calendar lookahead and split/scaling adjustment stay null; changed supplied values
do not prove a restatement cause or strategy outcome.

Refusal stdout contains one bounded stable-code JSON object and no artifact. Raw
SDK errors, input bytes, paths, environment, stderr and stacks are not echoed.
Validated data is published only after owned-child closure and finite encoding
admission; uncertainty produces refusal.

## Source and remote proof

The focused command is `npm run test:fundamentals-audit-client`. Root `verify` is
byte-for-byte unchanged; the existing Fundamentals wildcard in MCP CI includes
this test. All earlier tests, core, stdio source, default tools, package members,
versions, dependencies and locks remain unchanged.

At the initial source freeze, all 50 new named cases are **WRITTEN_UNRUN**. The
first runtime is the ordinary new-head remote CI. Forty-seven native/injected
cases exercise admission, exact bytes, full selected coverage/nulls, filesystem
faults/reused FD, rehashed response tampering, output/stderr bounds, queued and
reentrant deadline/abort behavior, late results and uncertain closure. Three SDK
entries cover actual direct and own-symlink CLI entry parity plus tool refusal.
Direct entry is exercised by the real module's top-level entry with controlled
`process.argv` in the test process; it creates no extra CLI wrapper process. Each
entry starts exactly one fixed stdio child and verifies its known PID absent.
Network/write/command guards are armed before imports and before child imports,
with positive denial controls and narrow owned temporary-fixture allowances.
No provider, network, browser, pack/install, live-site or local project job is a
test action. Fixtures stay below 12 MiB of peak native payload.

Independent SOURCE and retained-current-CI receipts are separate. A future
documentary archive requires its own literal allocation; none is assigned here.
Repository delivery does not publish the example or establish indexing, adoption,
expert rights/agreement, calibrated research or forward strategy performance.
The complete CanliCapital owner hierarchy remains ACTIVE.
