# Offline expert-submission audit

`canli-expert-submission-audit` is an opt-in stdio command in this **Unreleased
repository candidate**. It is not yet included in the published `0.5.0` package.
It exposes one tool, `filingfacts_audit_expert_submissions`. The default
`canli-fundamentals-mcp` command and the separate `canli-fundamentals-audit`
command retain their existing behavior.

The command reconciles supplied immutable packets and returned review files.
It neither fetches sources nor verifies that a reviewer is a consenting,
qualified, independent human. Rights, identities, expert agreement, adjudication,
dataset admission and release remain unknown. It creates no labels or decisions.

The request has exactly `name` and `arguments`. Arguments have exactly these nine
keys. Raw key admission happens before SDK projection; extra keys, including an
own `__proto__`, refuse the request. Base64 must be canonical, padded where needed.
Expected SHA256 is a separate primitive string of exactly 64 lowercase hex digits.

| Argument | Decoded input and maximum bytes |
| --- | --- |
| `gold_base64` | `canli.filing-facts-gold-packet.v0`, 524288 |
| `expected_gold_raw_sha256` | SHA256 of the exact supplied gold bytes |
| `intake_base64` | `canli.filing-facts-expert-intake.v1`, 65536 |
| `evidence_inventory_base64` | `canli.filing-facts-expert-evidence.v1`, 32768 |
| `evidence_base64` | Ordered array, at most 64 buffers of 32768 bytes; 262144 combined |
| `intake_settings_base64` | `canli.filing-facts-expert-settings.v1`, 4096 |
| `submission_inventory_base64` | `canli.filing-facts-expert-submission-inventory.v1`, 16384 |
| `submission_base64` | Ordered array, at most two returned packets of 2097152 bytes each |
| `audit_settings_base64` | `canli.filing-facts-expert-submission-settings.v1`, 4096 |

Intake inputs together are limited to 786432 bytes; all decoded inputs together
to 4194304 bytes. Types, counts, individual and aggregate lengths are admitted
before decoding. Inventory entries bind each supplied buffer's order, exact byte
count and SHA256. Supplied packet references and source-use evidence must match;
the command does not repair mismatches or fill absent reviews with zeros.

The response preserves the complete core report in `structuredContent` and the
exact `JSON.stringify(report)` in its sole text block. It retains the full selected
denominator, both roles, missing fields and notes, tasks, raw-byte bindings and
null established outcomes. A report is not a compact view or a public dataset.
Use only authorized private inputs: reports retain their original byte bindings.
The report's `content_hash` is checked against its complete canonical content.

Whole request and full report each have a 6291456-byte cap. The complete tool
result, including escaped text and duplicated structured content, is capped at
19922944 bytes. The whole JSONRPC response including ID, envelope and newline is
capped at 20971520 bytes. Refusals are at most 2048 bytes and do not echo inputs;
stderr is at most 8192 bytes. String IDs are at most 128 UTF8 bytes.

Work uses one absolute 15-second clock. After exact serialization and UTF8 byte
admission, the same clock and sticky abort/closed/exit state are checked immediately
before the captured native writer. Closure has five seconds; observed work plus
closure must not exceed 20 seconds. A resolved client close alone does not prove
child absence. Keep the captured child identity and terminal observation.

The relocated modules preserve the delivered implementation through reversible
import changes. External full-file source pins and review bind those copies.
`declared_module_sha256_verified` and `dependency_source_pins_verified` remain
literal `false`; behavior fingerprints are diagnostic and cannot authenticate
executing code, documents or expert outcomes.

## Self-contained synthetic SDK workflow

This example constructs all packets in memory, with no repository files,
credentials, real gold or network access. The consumer needs the separately
pinned `@modelcontextprotocol/client` **2.1.0** and its locked dependencies. It is
not a new production dependency and the command does not install it.

Save the marked code as `expert-workflow.mjs` in a consumer project containing the
admitted package and locked client. Call its exported `runExpertWorkflow` with the
absolute installed `.bin/canli-expert-submission-audit` path. Importing the workflow
does not launch a process. One call launches one child, negotiates legacy mode,
makes one audit request with an explicit tool definition in the second options
argument, and observes that same child's closure. No tool discovery or hidden retry
is requested. `guard` is an optional absolute pre-import guard used by offline CI;
it does not change the package command or create a second process.

<!-- expert-package-workflow:start -->
```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { packetDigest } from 'canli-fundamentals-mcp/src/expert-agreement.mjs';
import { reconcileExpertSubmissions } from 'canli-fundamentals-mcp/src/expert-submission-audit-core.mjs';
import { contentHash } from 'canli-fundamentals-mcp/src/canonical-json.mjs';
import { EXPERT_STDIO_LIMITS as L, EXPERT_TOOL, createWorkScope,
  createExpertNativeWriter } from 'canli-fundamentals-mcp/src/expert-submission-stdio.mjs';

export function syntheticInputs() {
  const bytes = value => Buffer.from(JSON.stringify(value));
  const hash = value => createHash('sha256').update(value).digest('hex');
  const gold = { schema: 'canli.filing-facts-gold-packet.v0',
    guidelines: 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md',
    judgements: { question_clear: ['yes', 'no'],
      answer_matches_filing: ['yes', 'no', 'cannot_find'], citation_correct: ['yes', 'no'] },
    annotator: '', labels: Array.from({ length: 3 }, (_, i) => ({
      id: 'synthetic-package-' + i, template: 'lookup', company: 'SYNTHETIC SOFTWARE FIXTURE',
      question: 'Synthetic value ' + i + '?', answer: '1 synthetic USD',
      filings: ['https://www.sec.gov/Archives/edgar/data/0/synthetic-package-' + i + '/'],
      question_clear: '', answer_matches_filing: '', citation_correct: '', notes: '' })) };
  const packet = packetDigest(gold), rawGold = bytes(gold);
  return [rawGold, hash(rawGold),
    bytes({ schema: 'canli.filing-facts-expert-intake.v1', packet_sha256: packet, roles: [], sources: [] }),
    bytes({ schema: 'canli.filing-facts-expert-evidence.v1', evidence: [] }), [],
    bytes({ schema: 'canli.filing-facts-expert-settings.v1', packet_sha256: packet,
      prepared_on: '2026-10-04', required_uses: ['human_review'], implementation_source_sha256: null }),
    bytes({ schema: 'canli.filing-facts-expert-submission-inventory.v1', packet_sha256: packet, submissions: [] }), [],
    bytes({ schema: 'canli.filing-facts-expert-submission-settings.v1', packet_sha256: packet,
      implementation_source_sha256: null })];
}
export function wireInputs(inputs = syntheticInputs()) {
  const b64 = bytes => bytes.toString('base64');
  return { gold_base64: b64(inputs[0]), expected_gold_raw_sha256: inputs[1],
    intake_base64: b64(inputs[2]), evidence_inventory_base64: b64(inputs[3]),
    evidence_base64: inputs[4].map(b64), intake_settings_base64: b64(inputs[5]),
    submission_inventory_base64: b64(inputs[6]), submission_base64: inputs[7].map(b64),
    audit_settings_base64: b64(inputs[8]) };
}
export async function runExpertWorkflow({ entry, cwd = process.cwd(), guard,
  onStart = () => {}, onClosed = () => {} }) {
  const inputs = syntheticInputs(), args = wireInputs(inputs);
  const expected = JSON.parse(JSON.stringify(reconcileExpertSubmissions(...inputs)));
  const scope = createWorkScope(), started = scope.started, abort = new AbortController();
  scope.bindSignal(abort.signal);
  const transport = new StdioClientTransport({ command: entry, args: [], cwd, stderr: 'pipe',
    maxBufferSize: L.responseFrameBytes, env: { PATH: process.env.PATH,
      ...(guard ? { NODE_OPTIONS: '--import=' + JSON.stringify(guard) } : {}) } });
  const client = new Client({ name: 'synthetic-packaged-expert', version: '0.0.0' },
    { versionNegotiation: { mode: 'legacy' }, inputRequired: { autoFulfill: false } });
  let child, pid, terminal = false, closing, closeCalls = 0, stderr = '', stderrOverflow = false, timer;
  const wire = [], bounded = async (promise, ms) => {
    let limit;
    try { return await Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
      limit = setTimeout(() => reject(new Error('WORKFLOW_BOUND')), Math.max(1, ms));
    })]); } finally { clearTimeout(limit); }
  };
  transport.stderr.on('data', chunk => {
    if (Buffer.byteLength(stderr) + chunk.length > L.stderrBytes) { stderrOverflow = true; abort.abort(); return; }
    stderr += chunk.toString();
    if (stderr.includes('DENIED_OPERATION')) abort.abort();
  });
  const start = transport.start.bind(transport);
  transport.start = async () => {
    scope.observe(); await start();
    child = transport._process; pid = child?.pid;
    assert.ok(child && Number.isSafeInteger(pid) && pid > 1);
    child.once('exit', () => { terminal = true; }); scope.observe();
    const writer = createExpertNativeWriter(child.stdin, { frameBytes: L.requestFrameBytes,
      serialize: message => { const json = JSON.stringify(message); wire.push(json); return json; } });
    transport.send = message => writer.send(message, scope);
    onStart({ child, pid }); scope.observe();
  };
  const closeOnce = () => {
    if (!closing) { closeCalls++; closing = Promise.resolve(client.close()); }
    return closing;
  };
  let outcome, workEnd, closeStart;
  try {
    timer = setTimeout(() => abort.abort(), L.workMs);
    await bounded(client.connect(transport), scope.remaining()); scope.observe();
    outcome = await bounded(client.callTool({ name: EXPERT_TOOL.name, arguments: args }, {
      toolDefinition: EXPERT_TOOL, signal: abort.signal, timeout: Math.max(1, scope.remaining()),
    }), scope.remaining()); scope.observe();
    assert.equal(outcome.isError, undefined);
    assert.equal(outcome.content.length, 1);
    assert.equal(outcome.content[0].text, JSON.stringify(outcome.structuredContent));
    assert.deepEqual(outcome.structuredContent, expected);
    assert.equal(expected.content_hash, contentHash(expected, createHash));
    assert.equal(expected.coverage.selected_n, 3);
    for (const value of Object.values(expected.established)) assert.equal(value, null);
    assert.equal(expected.implementation.declared_module_sha256_verified, false);
    assert.equal(expected.implementation.dependency_source_pins_verified, false);
    const requests = wire.map(text => JSON.parse(text));
    assert.equal(requests.filter(row => row.method === 'initialize').length, 1);
    assert.equal(requests.filter(row => row.method === 'tools/call').length, 1);
    assert.equal(requests.filter(row => row.method === 'tools/list' || row.method === 'server/discover').length, 0);
    scope.observe(); assert.equal(stderrOverflow, false); assert.doesNotMatch(stderr, /DENIED_OPERATION/);
  } finally {
    clearTimeout(timer); workEnd = performance.now(); closeStart = workEnd; abort.abort();
    await bounded(closeOnce(), Math.min(L.closureMs, L.totalMs - (closeStart - started)));
    if (child && !terminal && child.exitCode === null && child.signalCode === null)
      await bounded(new Promise(resolve => child.once('exit', resolve)),
        Math.min(L.closureMs - (performance.now() - closeStart), L.totalMs - (performance.now() - started)));
    assert.ok(child && (terminal || child.exitCode !== null || child.signalCode !== null));
    let absent = false;
    try { process.kill(pid, 0); } catch (error) { absent = error.code === 'ESRCH'; }
    assert.equal(absent, true); assert.equal(closeCalls, 1);
    const ended = performance.now();
    assert.ok(workEnd - started <= L.workMs && ended - closeStart <= L.closureMs && ended - started <= L.totalMs);
    assert.equal(stderrOverflow, false); assert.ok(Buffer.byteLength(stderr) <= L.stderrBytes); assert.doesNotMatch(stderr, /DENIED_OPERATION/);
    scope.dispose(); onClosed({ pid, absent, closeCalls, terminal: true, calls: wire.filter(text => JSON.parse(text).method === 'tools/call').length });
  }
  return outcome.structuredContent;
}
```
<!-- expert-package-workflow:end -->

For example, from that consumer project:

```js
import { resolve } from 'node:path';
import { runExpertWorkflow } from './expert-workflow.mjs';
const report = await runExpertWorkflow({ entry: resolve('node_modules/.bin/canli-expert-submission-audit') });
console.log(JSON.stringify({ selected_n: report.coverage.selected_n, verified_expert_agreement: null }));
```

The fixture uses three blank synthetic rows and no submissions. The result keeps
six required item assignments, both absent reviewer roles and all missing fields.
It demonstrates software behavior only. Runtime focus, real humans, actual rights,
expert labels, adoption and indexing are not measured by this workflow.
