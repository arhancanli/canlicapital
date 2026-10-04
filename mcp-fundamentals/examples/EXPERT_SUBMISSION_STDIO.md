# Offline expert-submission audit over stdio

This repository example exposes one tool, `filingfacts_audit_expert_submissions`,
around the delivered `reconcileExpertSubmissions` utility. It accepts exact
supplied bytes and returns the **complete** public audit report in both
`structuredContent` and one JSON text block. It prepares no new labels,
qualification decisions, rights admission or adjudication decisions.

The example is opt-in and Unreleased. Run it from an unpacked repository with
the locked MCP dependencies already available:

```sh
node mcp-fundamentals/examples/expert-submission-stdio.mjs
```

The root `filingfacts:expert-submission-stdio` script launches the same file.
The normal seven-tool Fundamentals server, package version, package bin/files,
hosted API and released examples retain their existing contracts. Importing this
module creates no server or child process. Direct execution and an absolute
symlink resolve to the same real-file entry identity. No CLI flags or filesystem
input paths are accepted. The protocol identity is
`canli-expert-submission-stdio-example`, version `0.0.0`.

## Supplied byte contract

All nine fields are required. Additional fields are refused.

| Field | Form | Decoded maximum |
| --- | --- | ---: |
| `gold_base64` | Primitive canonical base64 string | 524,288 bytes |
| `expected_gold_raw_sha256` | Separate primitive 64-character lowercase hex SHA256 | — |
| `intake_base64` | Primitive canonical base64 string | 65,536 bytes |
| `evidence_inventory_base64` | Primitive canonical base64 string | 32,768 bytes |
| `evidence_base64` | Ordered dense array, at most 64 strings | 32,768 bytes each; 262,144 combined |
| `intake_settings_base64` | Primitive canonical base64 string | 4,096 bytes |
| `submission_inventory_base64` | Primitive canonical base64 string | 16,384 bytes |
| `submission_base64` | Ordered dense array, at most two strings | 2,097,152 bytes each |
| `audit_settings_base64` | Primitive canonical base64 string | 4,096 bytes |

Base64 uses the standard alphabet, canonical padding and padding bits. Whitespace,
URL-safe alternatives, boxed strings, coercible SHA arrays and terminator suffixes
are refused. Direct JavaScript entry also refuses argument proxies/getters,
sparse/accessor arrays and foreign prototypes. Empty byte strings and empty
arrays are valid encoded forms; the unchanged kernel still requires a valid
complete supplied contract and may refuse them.

The adapter computes every encoded and decoded length, count and grouped total
before the first decode or kernel call. Gold, intake, evidence inventory,
evidence and intake settings together must fit 786,432 bytes. The entire batch
must fit 4,194,304 bytes. Evidence must independently fit 262,144 bytes.
Admitted buffers are owned copies; the kernel hashes and parses those same
captured bytes. Original packet bytes are never trimmed, repaired, recanonicalized,
fetched, reread from a path or reassigned to a different role.

The nine inputs map directly to the protected kernel's nine positional inputs.
For the JSON schemas of the decoded packets, see
[EXPERT_SUBMISSION_AUDIT.md](../../scripts/datasets/filing-facts/EXPERT_SUBMISSION_AUDIT.md)
and [EXPERT_INTAKE.md](../../scripts/datasets/filing-facts/EXPERT_INTAKE.md).
The caller supplies submission/evidence inventory ordering and original raw SHA
pins. Updating a raw SHA does not make a foreign packet or role valid.

## Complete report and unknown outcomes

A successful result has schema `canli.filing-facts-expert-submission-audit.v1`.
The exact core report retains preparation packets, original base64/hash bindings,
both roles, every selected row, missing roles/fields/pairs and required notes,
field eligibility, syntactic agreement, adjudication worklists, limits and
interpretation. Neither absent files nor incomplete returns reduce selected-N.
There is no compact view, pagination, filtering or truncation.

The text is exactly `JSON.stringify` of the public report also returned in
`structuredContent`. The adapter verifies the existing canonical `content_hash`
against the report without its hash, and verifies public JSON roundtrip equality.
Object prototypes and freezing do not change the public JSON oracle.

The core's `declared_module_sha256_verified:false` and
`dependency_source_pins_verified:false` remain literal. Caller-declared source
SHAs and behavior fingerprints are diagnostics; they do not authenticate the
executing module, imported dependencies or supplied documents. External signed
source manifests and independent source review provide their separate source
binding. No source file is read or self-hashed during the audit.

Authenticated humans, task expertise, independence, source-use rights, verified
expert agreement and adjudication remain unknown/null. The report creates zero
adjudication decisions. Synthetic fixtures and mechanically complete declarations
establish no real human review, admission, release, indexing, adoption or trading
outcome.

## Actual frame and clock policy

All limits count UTF8 bytes:

| Boundary | Maximum |
| --- | ---: |
| Whole received JSONRPC request, including LF | 6,291,456 bytes |
| Complete unchanged core report | 6,291,456 bytes |
| Complete tool-result object, including escaped JSON text and structured copy | 19,922,944 bytes |
| Whole serialized response, including envelope, ID and LF | 20,971,520 bytes |
| Stable tool refusal | 2,048 bytes |
| Captured child diagnostic stderr | 8,192 bytes |
| Reflected string RPC ID | 128 UTF8 bytes |

Numeric IDs must be safe integers. Invalid IDs close without reflection. The
server admits its native read buffer before copying an overflowing chunk, uses
fatal UTF8 decoding and closes on malformed or unterminated frames. It supports
at most 16 pending request IDs and refuses duplicate pending IDs. This is a
bounded persistent stdio session, not an external process census.
Memoized transport closure also destroys its owned input stream; merely pausing
that pipe can leave a child alive after malformed input. The parent still
observes the captured child's terminal state and PID absence separately.

Report size is separate from actual wire size: JSON escaping and the two public
copies both count. Oversized batches/results fail whole; no fields are removed
to fit. Tool failures have `isError:true` and one constant bounded refusal JSON
text block. They omit report `structuredContent`. Protocol/SDK validation errors
are replaced with a fixed no-echo JSONRPC error. Raw arguments, paths, exception
messages, stacks and environment values are never included in refusals.

Each accepted RPC request receives one absolute monotonic 15-second work window
at receive admission, which also bounds queued time before handler entry.
The handler observes that same clock through capture, core execution, public
projection and serialization. The production native writer serializes the exact
locked `JSON.stringify(message) + '\n'` frame and admits its actual UTF8 length,
then checks the same absolute clock, sticky abort/close/exit state immediately
before its captured stdout writer. Event setup precedes this final check. A
failed/late scope cannot be revived by a timer, second response or retry.

A write uses one Promise and one native write, with one drain wait if required.
Errors, close and abort settle the wait without rewriting the frame. Refusals
also require final write admission; an expired request may close without a
response. Synchronous work and OS operations have observed boundary checks,
rather than a promise of hard preemption. The server persists until client
close/EOF; these per-request bounds do not impose a total lifetime on a user's
unrelated persistent session.

For a finite client workflow, use one absolute clock before connect, 15 seconds
for work/validation, 5 seconds for closure and 20 seconds observed total. Configure
the client response read buffer to the same 20 MiB cap and bound its actual
request sender to 6 MiB. Capture the owned child object/PID before close; one
memoized close promise or a nullable transport PID getter alone does not prove
child absence.

## Executable fictional workflow

The following starts one owned example child and calls the tool once. It uses
the locked client `2.1.0` with explicit legacy negotiation and the exact listed
tool definition in the **second** `callTool` options argument, preventing an
implicit tool lookup/header retry or protocol-probe sibling. The fictional packet
has one immutable row and both review returns absent; it establishes no labels
or expert facts.

From `mcp-fundamentals` with its existing locked dependencies available:

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { reconcileExpertSubmissions } from '../scripts/datasets/filing-facts/expert-submission-audit.mjs';
import { packetDigest } from '../scripts/datasets/filing-facts/agreement.mjs';
import { contentHash } from '../scripts/canonical-json.mjs';
import { EXPERT_STDIO_LIMITS as L, EXPERT_TOOL, createWorkScope,
  createExpertNativeWriter } from './examples/expert-submission-stdio.mjs';

const bytes = value => Buffer.from(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const gold = { schema: 'canli.filing-facts-gold-packet.v0',
  guidelines: 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md',
  judgements: { question_clear: ['yes','no'],
    answer_matches_filing: ['yes','no','cannot_find'], citation_correct: ['yes','no'] },
  annotator: '', labels: [{ id: 'synthetic-only', template: 'lookup',
    company: 'SYNTHETIC SOFTWARE FIXTURE', question: 'Synthetic value?',
    answer: '1 synthetic USD', filings: ['https://www.sec.gov/Archives/edgar/data/0/synthetic/'],
    question_clear: '', answer_matches_filing: '', citation_correct: '', notes: '' }] };
const packet = packetDigest(gold), goldBytes = bytes(gold);
const inputs = [goldBytes, hash(goldBytes),
  bytes({ schema: 'canli.filing-facts-expert-intake.v1', packet_sha256: packet, roles: [], sources: [] }),
  bytes({ schema: 'canli.filing-facts-expert-evidence.v1', evidence: [] }), [],
  bytes({ schema: 'canli.filing-facts-expert-settings.v1', packet_sha256: packet,
    prepared_on: '2026-10-04', required_uses: ['human_review'], implementation_source_sha256: null }),
  bytes({ schema: 'canli.filing-facts-expert-submission-inventory.v1', packet_sha256: packet, submissions: [] }), [],
  bytes({ schema: 'canli.filing-facts-expert-submission-settings.v1',
    packet_sha256: packet, implementation_source_sha256: null })];
const b64 = value => value.toString('base64');
const args = { gold_base64: b64(inputs[0]), expected_gold_raw_sha256: inputs[1],
  intake_base64: b64(inputs[2]), evidence_inventory_base64: b64(inputs[3]),
  evidence_base64: inputs[4].map(b64), intake_settings_base64: b64(inputs[5]),
  submission_inventory_base64: b64(inputs[6]), submission_base64: inputs[7].map(b64),
  audit_settings_base64: b64(inputs[8]) };
const expected = JSON.parse(JSON.stringify(reconcileExpertSubmissions(...inputs)));
const scope = createWorkScope(), started = scope.started;
const transport = new StdioClientTransport({ command: process.execPath,
  args: [resolve('examples/expert-submission-stdio.mjs')], stderr: 'pipe',
  maxBufferSize: L.responseFrameBytes });
const client = new Client({ name: 'synthetic-example', version: '0.0.0' },
  { versionNegotiation: { mode: 'legacy' }, inputRequired: { autoFulfill: false } });
let child, pid, terminal = false, closePromise, stderrBytes = 0, timer;
const abort = new AbortController(); scope.bindSignal(abort.signal);
transport.stderr.on('data', chunk => {
  stderrBytes += chunk.length;
  if (stderrBytes > L.stderrBytes) abort.abort();
});
const start = transport.start.bind(transport);
transport.start = async () => {
  scope.observe(); await start(); scope.observe();
  child = transport._process; pid = child?.pid;
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  child.once('exit', () => { terminal = true; });
  const writer = createExpertNativeWriter(child.stdin, { frameBytes: L.requestFrameBytes });
  transport.send = message => writer.send(message, scope);
};
const closeOnce = () => closePromise ??= Promise.resolve(client.close());
const bounded = async (promise, ms) => {
  let deadline;
  try { return await Promise.race([Promise.resolve(promise),
    new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('WORKFLOW_BOUND')), Math.max(1, ms)); })]); }
  finally { clearTimeout(deadline); }
};
let result, workEnd, closeStart;
try {
  timer = setTimeout(() => abort.abort(), L.workMs);
  await bounded(client.connect(transport), scope.remaining()); scope.observe();
  const listed = await bounded(client.listTools(), scope.remaining()); scope.observe();
  assert.equal(listed.tools.length, 1);
  assert.deepEqual(listed.tools[0], JSON.parse(JSON.stringify(EXPERT_TOOL)));
  const outcome = await bounded(client.callTool({ name: EXPERT_TOOL.name, arguments: args },
    { toolDefinition: listed.tools[0], signal: abort.signal, timeout: Math.max(1, scope.remaining()) }), scope.remaining());
  scope.observe();
  assert.ok(!Object.hasOwn(outcome, 'resultType') || outcome.resultType === 'complete');
  result = outcome; // Locked legacy callTool returns the complete result itself.
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.deepEqual(result.structuredContent, expected);
  assert.equal(expected.content_hash, contentHash(expected, createHash));
  assert.equal(expected.coverage.selected_n, 1);
  assert.equal(expected.implementation.declared_module_sha256_verified, false);
  scope.observe();
} finally {
  clearTimeout(timer); workEnd = performance.now(); closeStart = workEnd; abort.abort();
  await bounded(closeOnce(), Math.min(L.closureMs, L.totalMs - (closeStart - started)));
  if (child && !terminal && child.exitCode === null && child.signalCode === null)
    await bounded(new Promise(resolve => child.once('exit', resolve)),
      Math.min(L.closureMs - (performance.now() - closeStart), L.totalMs - (performance.now() - started)));
  assert.ok(child && (terminal || child.exitCode !== null || child.signalCode !== null));
  let absent = false;
  try { process.kill(pid, 0); } catch (error) { absent = error.code === 'ESRCH'; }
  assert.equal(absent, true);
  const ended = performance.now();
  assert.ok(workEnd - started <= L.workMs && ended - closeStart <= L.closureMs && ended - started <= L.totalMs);
  assert.ok(stderrBytes <= L.stderrBytes); scope.dispose();
}
console.log(JSON.stringify({ schema: expected.schema, selected_n: expected.coverage.selected_n,
  human_review_verified: null, expert_adjudication: null, child_absent: true }));
JS
```

The locked SDK's captured `_process` object is used only for owned-child closure
observation; it is a version-specific interface. Keep the corresponding locks
when reproducing this example. The summary is emitted after the timing/closure
observations; those observations do not guarantee OS preemption or bound later
unrelated work.

## Verification and source status

The new test file has three bounded actual SDK-child entries in total: one direct
roundtrip, one absolute-symlink roundtrip, and one malformed-frame closure.
All other refusal, byte admission, full-report, clock, serialization, backpressure,
UTF8, frame, diagnostics and memory-SDK controls use native fixtures without
additional child launches. Private fixture snapshots use one bounded regular FD
and relinquish descriptor ownership before one close.

`test:expert-submission-stdio` is the focused serial command. The existing
Fundamentals wildcard CI discovers this test file; root verify is unchanged.
Fixture names are written source until exact frozen-head remote logs establish
their actual outcomes. Signed source and independent retained-CI receipts are
separate gates. This guide asserts no npm/site release, current adoption,
verified expert work, search indexing or strategy outcome.
