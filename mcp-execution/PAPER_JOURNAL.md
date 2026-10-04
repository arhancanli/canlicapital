# Private paper-journal package consumer

This private, unreleased `canli-execution-mcp` artifact includes
`canli-paper-journal`, its package-local server and this guide. It is an offline
software fixture. Nothing here places an order or establishes forward performance.
The repository example and its recorded evidence remain in [EXAMPLES.md](./EXAMPLES.md).

With an already prepared, owned private directory and the artifact's locked
dependencies available, the command is:

```sh
canli-paper-journal --home /absolute/private/example-home
```

The default makes two local calls, sizing and pre-trade checks. It creates no
journal or key. Add `--write` only to run the fixed synthetic account through the
unchanged journal tool. Prepare the home and Ed25519 key separately: the existing
server requires an owned directory with mode 0700 and a regular, single-link
`journal.key` with mode 0600. The consumer never generates, reads, repairs, prints
or uploads that key. The unchanged server owns key admission and persistence.

The package also exposes a programmatic command interface. This exact marked
snippet is the default consumer used by the new artifact fixture; it starts one
package-local server and emits one complete terminal report through `emit`.

<!-- paper-package-workflow:start -->
```js
import { paperJournalCommand } from 'canli-execution-mcp/src/paper-journal.mjs';
export async function guideRun(home, emit) {
  return paperJournalCommand(['--home', home], { emit });
}
```
<!-- paper-package-workflow:end -->

`runPaperJournalStdio({home, write: true})` returns the same full report without
terminal emission. `runPaperJournal` is the preserved trusted injected interface;
it starts no process. Importing any of these interfaces starts no client or child,
prepares no home, and writes or emits nothing. Trusted native fixture injection
reports `injected_no_child`, which establishes no OS process absence.

The preserved fixture opens with USD 10,000, buys 10 units at 100.25 with a supplied
USD 1 fee, then marks at 101. A completed write has six signed entries: config,
decision, check, order, fill and mark. Its closing equity is 10,006.5. Those numbers
are supplied synthetic data with `local_sim` identity. Frequency is irregular and
Sharpe stays null. Missing fees remain unknown; metadata alone is not a fee amount.
Signing is self-attestation. Provider authenticity, full costs, a trusted clock,
independent review and forward performance remain unknown.

The report retains requests, acknowledged receipts, pending requests and pending
export identity. The record signature and the unsigned metrics/series are checked
against the supplied sole fill, mark and account. Existing journal, replay, busy,
missing acknowledgement, changed head, malformed export and persistence uncertainty
stop progress. No automatic retry, lock breaking, state erasure or repair follows.
Keep the original report and files for manual review after an uncertain write.

One absolute cooperative clock starts before argument/home/scenario capture and
lazy SDK import. Work is at most 25 seconds, observed closure at most 5 seconds,
and observed total at most 30 seconds. Callers may tighten the total. Timers cannot
preempt arbitrary synchronous work. The package fixes Node to `process.execPath`
and the server to its own `src/server.mjs`, uses explicit locked SDK 2.1 legacy
negotiation and supplies the exact tool definition in the second `callTool` options
argument. There is one child, at most 11 tool calls, no discovery/list, header retry,
reconnect, input auto-fulfilment or fallback server.

Each native send uses the locked `JSON.stringify(message) + "\n"` frame. After
actual UTF-8 admission it freshly checks the same absolute clock, sticky abort,
closed and owned-exit state immediately before the captured stdin write. The SDK
Promise/backpressure/one-drain contract is retained. Cumulative stderr is drained
and counted without echo. Success requires that the retained same child object was
observed born, exited and closed; SDK close resolution or a cleared PID alone is
insufficient. A memoized close promise is published before callbacks can reenter.
This observes the admitted same child, not descendants, PID reuse or global idle.

| Admission | Bytes |
| --- | ---: |
| Actual outgoing JSON-RPC frame including LF | 65,536 |
| Incoming transport frame | 524,288 |
| Preserved captured tool reply | 131,072 |
| Complete terminal report including LF | 196,609 |
| Cumulative stderr, drained without retention | 65,536 |
| Fixed last-resort refusal | 2,048 |

The original input, planning, export, retained-control and output reservations are
unchanged. A final clock check follows serialization and precedes terminal emission.
The report's timing snapshot is taken before terminal encoding; it is not a latency
benchmark or a claim about effects after the captured stdout call. Finalization
cannot turn an earlier failure into success or discard pending controls to fit a cap.

The package files union includes both guides. The original server and all mirrored
cores are unchanged. Only the already locked client 2.1 dependency classification
is promoted to runtime; versions, resolved URLs, integrity and dependency edges
remain fixed. The private package version remains 0.1.0. These sources do not prove
a registry release or an actual npm install.

New finite tests are WRITTEN_UNRUN until this exact source receives existing remote
CI. The artifact fixture performs one offline, script-free guarded pack, checks all
28 regular members and the JS/MJS import closure against source pins before unpack,
and records `RAW_CAPTURED_NOT_ADMITTED` separately from `ADMITTED` at the same TGZ
hash. It rejects malformed ASCII/octal/checksum/TAR paths, links, extensions, extra
members and gzip overflow/trailing data. Compressed/expanded/native bounds are
2/8/16 MiB. The raw server mode 0644 is preserved; only the owned extracted fixture
may normalize its two bin targets to 0755, recording that distinction.

At most three new SDK child entries use the admitted artifact plus the remote job's
existing exact locked dependency tree. This dependency link is disclosed as a test
fixture, not npm installation. The entries cover this guide's default/no-key case,
the synthetic signed roundtrip and a typed refusal. Native injected faults cover
all other boundaries. Network/filesystem/spawn guards precede imports; child guard
preloads belong only to the fixture and are not accepted production options.

Source and retained-current-CI review gates are separate. Archive allocation,
final documentary source/current-CI gates, ordinary merge, actual custody, release
and publication remain separate future steps. Actual indexing, adoption, human
expertise, independence, rights and qualified strategy outcomes remain unknown/null.
