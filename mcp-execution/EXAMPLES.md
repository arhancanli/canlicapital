# Offline paper-journal example

This repository example connects `size_position`, `check_orders` and the local
`journal` tool in one finite scenario. It supplies synthetic prices, a synthetic
fill and a mark. Every recorded amount comes from that fixture or the delivered
tools. Nothing is submitted to a venue. The package remains private and unreleased;
these example files are for the repository, not an installed npm package.

## Run through local stdio

Use the repository's locked development dependencies and a supported local POSIX
filesystem. Prepare an **existing**, owned directory with mode `0700`. For writes,
the caller must also prepare its Ed25519 PEM `journal.key`, a regular owned file
with mode `0600` and no symlink or extra hard link. See
[JOURNAL_STORAGE.md](./JOURNAL_STORAGE.md). The example never generates, reads,
prints, uploads or repairs a key; the existing server reads it locally.

Use a fresh home for this example. An existing journal causes the write workflow
to stop. Keep the home separate from any real account or broker credentials.
If you provide `limits.json`, prepare your own small regular JSON file; the
example does not create or change limits or a `KILL` sentinel.

From the repository root, after installing its locked development dependencies:

```sh
npm ci --prefix mcp-execution
node mcp-execution/examples/paper-journal.mjs --home /absolute/private/example-home
```

The default runs only sizing and checks, returning `writes_disabled` if they pass.
It needs no key and creates no journal. To explicitly enable the synthetic writes:

```sh
node mcp-execution/examples/paper-journal.mjs --home /absolute/private/example-home --write
```

The command prints one bounded JSON receipt. Keep it privately if you need the
operation requests for later review. It is not a durable capture service: a process
interruption can prevent receipt output. The delivered store's journal and any
pending lock remain the local persistence evidence. No receipt file is created by
the example itself. Declined/stopped runs exit with status 1; completed and
`writes_disabled` runs exit with status 0. SIGINT/SIGTERM request cancellation.

The default fixture opens USD10,000 with no positions and sizes one `SYNTH` buy
from a stated 10% budget at USD100. It supplies a fill of ten units at USD100.25,
an explicit USD1 fee, and a USD101 mark. Its dates and identifiers are fixture
labels. The resulting account is self-reported `local_sim` evidence, with irregular
observations and an unreported Sharpe. These values are not market observations or
investment advice. Limits in the caller's file can tighten the fixture and cause
the example to decline or stop.

## Inject a local call interface

```js
import { runPaperJournal, SYNTHETIC_SCENARIO } from './mcp-execution/examples/paper-journal.mjs';

const result = await runPaperJournal({
  scenario: SYNTHETIC_SCENARIO,
  write: true,
  signal: controller.signal,
  callTool: (request, { signal, timeoutMs }) => localClientCall(request, { signal, timeoutMs }),
});
```

The interface receives immutable `{name, arguments}` requests and must return the
delivered local MCP envelope: one JSON text block equal to `structuredContent`,
and the optional boolean `isError`. It is a trusted callback. Supplying it does
not sandbox its code or establish that it uses only a local server. The provided
stdio adapter starts the fixed repository server through local pipes, with the
existing client dependency; it has no endpoint or provider/broker interface.

The supported scenario is deliberately small: one supplied US-equity buy from
an explicitly flat USD account, one supplied partial or complete fill, one mark,
and irregular observation periods. The account, sizing and check inputs must
agree about opening equity, book and symbol price. A fill cannot exceed the sized
order. It must have an explicit finite fee; an absent/null fee stays unknown and
stops before initialization. A missing commission schedule remains disclosed as
not modelled by `check_orders`; it is separate from that supplied fill fee.

The runner snapshots bounded plain JSON before its first call. Accessors,
unsupported fields, unpaired Unicode, nonfinite numbers, excessive depth or
oversized data refuse. It neither chooses a market price nor changes a supplied
fill to match sizing. Change fixture values and operation prefix explicitly for
another scenario; do not use this example as a broker execution engine.

## Calls, receipts and stopping

Successful write runs dispatch at most **11 tool calls**, in order:

1. Size and check the supplied order.
2. Read the journal head and require no existing journal.
3. Initialize the account, then append decision, check, order, fill and mark.
4. Verify the entire journal, then request a signed inline account export.

The default/default-denied path makes two calls. A declined order creates no
order or fill entry. A skipped pre-trade check, kill switch, rejection, malformed
reply, typed error or head mismatch stops the workflow. A receipt must match the
original operation ID and canonical request hash, expected sequence and advancing
prefix/head. A replay acknowledgement cannot advance the scenario. Verification
and export must bind the last acknowledged head and complete journal prefix.
The export's artifact digest and public-key signature are checked; financial
reconstruction remains the delivered export tool's work.

`requests` preserves each original write request, including its supplied timestamp,
payload and original `expected_head`. `pending_request` distinguishes whether an
unacknowledged write was dispatched; `pending_export` does the same for an export,
which can create a private artifact in the server. No tool error message, signing
key or raw diagnostic is copied into the result. Successful prefixes and earlier
receipts remain visible on a later failure.

There are **no retries**. A timeout, cancelled call, `JOURNAL_STORE_BUSY`,
`JOURNAL_STORE_REFUSED` or `JOURNAL_STORE_UNCERTAIN` never starts follow-up work.
Retain the original request, journal and any lock for manual review. Never replace
the expected head, delete a pending lock or rerun this scenario as an automatic
recovery procedure. A normal rerun stops on an existing journal. The stdio client
is given explicit delivered tool definitions, which also bypass its implicit
cache discovery and `HEADER_MISMATCH` retry path. Initialization/capability
handshakes are protocol traffic, separate from the 11 explicit tool calls.

The injected runner defaults to a 30,000ms deadline for validation and calls.
The stdio demonstration declares a 30,000ms total window: up to25,000ms for
validation, dependency loading, connection and calls, reserving5,000ms for one
SDK close attempt. The policy can be tightened, never enlarged; the stdio total
must exceed the shutdown reserve. Cancellation reaches the call's native
AbortSignal. The runner checks the clock again before dispatch and after capture.
SDK connection closure is attempted once even after a failure. Failed/timed-out
closure produces `STDIO_CLOSE_UNCERTAIN` rather than a completed workflow.

Timers and cancellation are cooperative. A trusted synchronous callback, blocked
filesystem operation, event-loop stall, OS suspension or between-check replacement
can defeat a nominal wall-time window. In stdio mode SDK shutdown can terminate
its own child, but this cannot undo already written files or establish persistence.
A late result cannot change the frozen returned report or dispatch another call.
An abort-ignoring trusted callback can still have its own side effects; its pending
request remains unknown. No universal runtime or power-loss guarantee is made.

Inputs are capped at32KiB, each reply at128KiB, and the output at192KiB, with
depth/node bounds. Journal storage retains its separate8MiB/64KiB limits. A large
file-backed export is refused by this small example; any created export remains
available for manual review. No alternate export path is followed automatically.

Signatures are self-attestation, not broker authenticity, independent review,
trusted timestamps or proof that no alternative journal exists. Fee-only account
reconstruction does not establish full costs, intraperiod risk or forward results.
Actual indexing, expert annotation, adoption and ALPHAC qualification remain
separate outcomes.

## Validation

`test/paper-journal-example.test.mjs` is included by the existing package test
wildcard. Written cases cover the actual local stdio/command roundtrip, default
write denial, limits/KILL, missing fees, malformed bindings, busy/uncertain or
conflicting operations, head/export tampering, finite calls, cancellation/late
completion and input/clock refusals. Use the existing CI route against the signed
source; no current pass count is claimed before its logs are retained.
