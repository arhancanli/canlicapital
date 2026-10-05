# Supplied-byte expert intake MCP preparation

`canli-expert-intake-prepare` is a package-portable opt-in, repository **Unreleased**
command. The unchanged default server still advertises seven tools. Package
version `0.5.0` and this source guide establish no registry publication or actual
installation. Node >=20.10 and the package's locked SDK2.1 dependencies are required.

The one `filingfacts_prepare_expert_intake` tool calls the unchanged local
`prepareExpertIntake` once. It returns the complete preparation report: two blank
reviewer packets with identical immutable item content and a separate adjudicator
worklist. Supplied handles and opaque evidence remain unverified. Every selected
item remains in the denominator; authenticated humans, expertise, independence,
rights, labels and admission outcomes remain NULL.

## Complete synthetic inputs

The four marked JSON buffers below include exactly one final LF. All names and
example.invalid sources are fictional software fixtures. No evidence files or
review submissions are present. The separate raw gold SHA256 is
`b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb`;
packet-content SHA256 is `b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264`.
They bind different byte/content conventions. These inputs and the workflow are
WRITTEN_UNRUN until the exact source's existing automatic remote CI runs entry1.

### gold.json

<!-- EXPERT_INTAKE_STDIO_GOLD_BEGIN -->
```json
{
  "schema": "canli.filing-facts-gold-packet.v0",
  "guidelines": "scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md",
  "judgements": {
    "question_clear": [
      "yes",
      "no"
    ],
    "answer_matches_filing": [
      "yes",
      "no",
      "cannot_find"
    ],
    "citation_correct": [
      "yes",
      "no"
    ]
  },
  "annotator": "",
  "labels": [
    {
      "id": "software-fixture-0",
      "template": "lookup",
      "company": "SYNTHETIC SOFTWARE FIXTURE",
      "question": "Synthetic question 0?",
      "answer": "0 fictional units",
      "filings": [
        "https://example.invalid/software-fixture/0"
      ],
      "question_clear": "",
      "answer_matches_filing": "",
      "citation_correct": "",
      "notes": ""
    },
    {
      "id": "software-fixture-1",
      "template": "lookup",
      "company": "SYNTHETIC SOFTWARE FIXTURE",
      "question": "Synthetic question 1?",
      "answer": "1 fictional units",
      "filings": [
        "https://example.invalid/software-fixture/1"
      ],
      "question_clear": "",
      "answer_matches_filing": "",
      "citation_correct": "",
      "notes": ""
    },
    {
      "id": "software-fixture-2",
      "template": "lookup",
      "company": "SYNTHETIC SOFTWARE FIXTURE",
      "question": "Synthetic question 2?",
      "answer": "2 fictional units",
      "filings": [
        "https://example.invalid/software-fixture/2"
      ],
      "question_clear": "",
      "answer_matches_filing": "",
      "citation_correct": "",
      "notes": ""
    }
  ]
}
```
<!-- EXPERT_INTAKE_STDIO_GOLD_END -->

### intake.json

<!-- EXPERT_INTAKE_STDIO_INTAKE_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-intake.v1",
  "packet_sha256": "b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264",
  "roles": [
    {
      "role": "reviewer_a",
      "handle": "synthetic-reviewer_a",
      "aliases": [],
      "affiliations": null,
      "conflicts": null,
      "identity_evidence_ids": [],
      "independence_evidence_ids": [],
      "qualifications": []
    },
    {
      "role": "reviewer_b",
      "handle": "synthetic-reviewer_b",
      "aliases": [],
      "affiliations": null,
      "conflicts": null,
      "identity_evidence_ids": [],
      "independence_evidence_ids": [],
      "qualifications": []
    },
    {
      "role": "adjudicator",
      "handle": "synthetic-adjudicator",
      "aliases": [],
      "affiliations": null,
      "conflicts": null,
      "identity_evidence_ids": [],
      "independence_evidence_ids": [],
      "qualifications": []
    }
  ],
  "sources": []
}
```
<!-- EXPERT_INTAKE_STDIO_INTAKE_END -->

### evidence-inventory.json

<!-- EXPERT_INTAKE_STDIO_EVIDENCE_INVENTORY_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-evidence.v1",
  "evidence": []
}
```
<!-- EXPERT_INTAKE_STDIO_EVIDENCE_INVENTORY_END -->

### intake-settings.json

<!-- EXPERT_INTAKE_STDIO_INTAKE_SETTINGS_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-settings.v1",
  "packet_sha256": "b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264",
  "prepared_on": "2026-10-05",
  "required_uses": [
    "human_review"
  ],
  "implementation_source_sha256": null
}
```
<!-- EXPERT_INTAKE_STDIO_INTAKE_SETTINGS_END -->

## One installed-package workflow

The following module uses only the installed package and locked Client2.1. It
imports the exact advertised tool definition, chooses explicit legacy negotiation,
and passes the definition in callTool's SECOND options argument. There is one child
and one audit call, with no tool discovery, probe sibling or hidden retry.
Its native writer checks the same absolute clock after final UTF8 serialization.

<!-- EXPERT_INTAKE_STDIO_WORKFLOW_BEGIN -->
```js
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  INTAKE_TOOL, INTAKE_STDIO_LIMITS, createWorkScope, observeOriginalPromise,
  createIntakeNativeWriter,
} from 'canli-fundamentals-mcp/src/expert-intake-stdio.mjs';

const bounded = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('OWNED_CLOSE_BOUND')), Math.max(1, ms));
  })]).finally(() => clearTimeout(timer));
};
export function knownOwnedAbsent(pid, probe = value => process.kill(value, 0)) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;
  try { probe(pid); return false; }
  catch (error) { if (error.code === 'ESRCH') return true; throw new Error('OWNED_ABSENCE_UNKNOWN'); }
}

export async function prepareIntakeOnce(args, { command, env, signal } = {}) {
  const packageRoot = dirname(createRequire(import.meta.url).resolve('canli-fundamentals-mcp/package.json'));
  const abort = new AbortController(); const scope = createWorkScope({ signal: abort.signal });
  if (signal) scope.bindSignal(signal);
  const started = scope.started; let child, pid = null, terminal, writer, closePromise;
  let observedExit = false, closeCalls = 0, stderrBytes = 0, stderrText = '', workEnd;
  const wire = [];
  const transport = new StdioClientTransport({ command: command ?? join(packageRoot, 'src/expert-intake-stdio.mjs'), args: [],
    env: env ?? { PATH: process.env.PATH, CI: 'true' }, stderr: 'pipe', maxBufferSize: INTAKE_STDIO_LIMITS.responseFrameBytes });
  const client = new Client({ name: 'synthetic-expert-intake-consumer', version: '0.0.0' }, {
    versionNegotiation: { mode: 'legacy' }, inputRequired: { autoFulfill: false },
  });
  const closeOnce = () => {
    if (!closePromise) {
      let complete, failed;
      closePromise = new Promise((resolve, reject) => { complete = resolve; failed = reject; });
      observeOriginalPromise(closePromise);
      try {
        closeCalls++;
        const original = client.close(); observeOriginalPromise(original);
        original.then(complete, failed);
      } catch { failed(new Error('OWNED_CLOSE')); }
    }
    return closePromise;
  };
  const nativeStart = transport.start.bind(transport);
  transport.start = () => {
    scope.observe();
    const original = nativeStart();
    observeOriginalPromise(original, { rejected: () => { scope.fail('START'); } });
    // Both original outcomes are owned before any post-callback clock or child field.
    scope.observe();
    observeOriginalPromise(original, { resolved: () => {
      try {
        scope.observe(); child = transport._process; pid = transport.pid;
        if (!child || !Number.isSafeInteger(pid) || pid <= 1) throw new Error('OWNED_PID_UNKNOWN');
        terminal = new Promise((resolve, reject) => {
          child.once('exit', (code, signal) => { observedExit = true; resolve({ code, signal }); });
          child.once('error', reject);
        }); observeOriginalPromise(terminal);
        const nativeWrite = child.stdin.write.bind(child.stdin);
        child.stdin.write = (frame, ...rest) => { wire.push(Buffer.from(frame)); return nativeWrite(frame, ...rest); };
        writer = createIntakeNativeWriter(child.stdin, { frameBytes: INTAKE_STDIO_LIMITS.requestFrameBytes });
        transport.stderr.on('data', bytes => {
          stderrBytes += bytes.length;
          if (stderrBytes > INTAKE_STDIO_LIMITS.stderrBytes) { scope.fail('STDERR_BOUND'); abort.abort(); return; }
          stderrText += bytes.toString('utf8');
        });
        scope.observe();
      } catch { scope.fail('START'); }
    } });
    return original;
  };
  transport.send = message => {
    try { scope.observe(); if (!writer) throw new Error('START'); return writer.send(message, scope); }
    catch { return Promise.reject(new Error('OWNED_SEND_REFUSED')); }
  };
  const timer = setTimeout(() => { scope.fail('DEADLINE'); abort.abort(); }, scope.remaining());
  let outcome, closure;
  try {
    const connecting = client.connect(transport); observeOriginalPromise(connecting); scope.observe(); await connecting; scope.observe();
    const original = client.callTool({ name: INTAKE_TOOL.name, arguments: args }, {
      toolDefinition: INTAKE_TOOL, signal: abort.signal, timeout: scope.remaining(),
    }); observeOriginalPromise(original); scope.observe(); outcome = await original; scope.observe();
    if (!outcome.isError) {
      if (!outcome.structuredContent || outcome.content?.length !== 1 || outcome.content[0].type !== 'text' ||
          JSON.stringify(outcome.structuredContent) !== outcome.content[0].text) throw new Error('COMPLETE_REPORT_REQUIRED');
    }
  } finally {
    workEnd = performance.now(); clearTimeout(timer); abort.abort();
    const closeStarted = performance.now();
    await bounded(closeOnce(), Math.min(INTAKE_STDIO_LIMITS.closureMs, INTAKE_STDIO_LIMITS.totalMs - (closeStarted - started)));
    if (terminal && !observedExit && child.exitCode === null && child.signalCode === null) {
      await bounded(terminal, Math.min(INTAKE_STDIO_LIMITS.closureMs - (performance.now() - closeStarted), INTAKE_STDIO_LIMITS.totalMs - (performance.now() - started)));
    }
    const ended = performance.now(); scope.dispose();
    const absent = knownOwnedAbsent(pid);
    if (!child || !(observedExit || child.exitCode !== null || child.signalCode !== null) || absent !== true ||
        workEnd - started > INTAKE_STDIO_LIMITS.workMs || ended - closeStarted > INTAKE_STDIO_LIMITS.closureMs ||
        ended - started > INTAKE_STDIO_LIMITS.totalMs || stderrBytes > INTAKE_STDIO_LIMITS.stderrBytes) throw new Error('OWNED_CLOSURE_UNKNOWN');
    closure = { pid, absent, close_calls: closeCalls, work_ms: workEnd - started, close_ms: ended - closeStarted, total_ms: ended - started };
  }
  return { outcome, closure, request_methods: wire.map(frame => JSON.parse(frame).method), stderr: stderrText };
}

const raw = {
  gold: Buffer.from("{\n  \"schema\": \"canli.filing-facts-gold-packet.v0\",\n  \"guidelines\": \"scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md\",\n  \"judgements\": {\n    \"question_clear\": [\n      \"yes\",\n      \"no\"\n    ],\n    \"answer_matches_filing\": [\n      \"yes\",\n      \"no\",\n      \"cannot_find\"\n    ],\n    \"citation_correct\": [\n      \"yes\",\n      \"no\"\n    ]\n  },\n  \"annotator\": \"\",\n  \"labels\": [\n    {\n      \"id\": \"software-fixture-0\",\n      \"template\": \"lookup\",\n      \"company\": \"SYNTHETIC SOFTWARE FIXTURE\",\n      \"question\": \"Synthetic question 0?\",\n      \"answer\": \"0 fictional units\",\n      \"filings\": [\n        \"https://example.invalid/software-fixture/0\"\n      ],\n      \"question_clear\": \"\",\n      \"answer_matches_filing\": \"\",\n      \"citation_correct\": \"\",\n      \"notes\": \"\"\n    },\n    {\n      \"id\": \"software-fixture-1\",\n      \"template\": \"lookup\",\n      \"company\": \"SYNTHETIC SOFTWARE FIXTURE\",\n      \"question\": \"Synthetic question 1?\",\n      \"answer\": \"1 fictional units\",\n      \"filings\": [\n        \"https://example.invalid/software-fixture/1\"\n      ],\n      \"question_clear\": \"\",\n      \"answer_matches_filing\": \"\",\n      \"citation_correct\": \"\",\n      \"notes\": \"\"\n    },\n    {\n      \"id\": \"software-fixture-2\",\n      \"template\": \"lookup\",\n      \"company\": \"SYNTHETIC SOFTWARE FIXTURE\",\n      \"question\": \"Synthetic question 2?\",\n      \"answer\": \"2 fictional units\",\n      \"filings\": [\n        \"https://example.invalid/software-fixture/2\"\n      ],\n      \"question_clear\": \"\",\n      \"answer_matches_filing\": \"\",\n      \"citation_correct\": \"\",\n      \"notes\": \"\"\n    }\n  ]\n}\n", 'utf8'),
  intake: Buffer.from("{\n  \"schema\": \"canli.filing-facts-expert-intake.v1\",\n  \"packet_sha256\": \"b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264\",\n  \"roles\": [\n    {\n      \"role\": \"reviewer_a\",\n      \"handle\": \"synthetic-reviewer_a\",\n      \"aliases\": [],\n      \"affiliations\": null,\n      \"conflicts\": null,\n      \"identity_evidence_ids\": [],\n      \"independence_evidence_ids\": [],\n      \"qualifications\": []\n    },\n    {\n      \"role\": \"reviewer_b\",\n      \"handle\": \"synthetic-reviewer_b\",\n      \"aliases\": [],\n      \"affiliations\": null,\n      \"conflicts\": null,\n      \"identity_evidence_ids\": [],\n      \"independence_evidence_ids\": [],\n      \"qualifications\": []\n    },\n    {\n      \"role\": \"adjudicator\",\n      \"handle\": \"synthetic-adjudicator\",\n      \"aliases\": [],\n      \"affiliations\": null,\n      \"conflicts\": null,\n      \"identity_evidence_ids\": [],\n      \"independence_evidence_ids\": [],\n      \"qualifications\": []\n    }\n  ],\n  \"sources\": []\n}\n", 'utf8'),
  evidence_inventory: Buffer.from("{\n  \"schema\": \"canli.filing-facts-expert-evidence.v1\",\n  \"evidence\": []\n}\n", 'utf8'),
  intake_settings: Buffer.from("{\n  \"schema\": \"canli.filing-facts-expert-settings.v1\",\n  \"packet_sha256\": \"b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264\",\n  \"prepared_on\": \"2026-10-05\",\n  \"required_uses\": [\n    \"human_review\"\n  ],\n  \"implementation_source_sha256\": null\n}\n", 'utf8')
};
export const syntheticArguments = {
  gold_base64: raw.gold.toString('base64'), expected_gold_raw_sha256: createHash('sha256').update(raw.gold).digest('hex'),
  intake_base64: raw.intake.toString('base64'), evidence_inventory_base64: raw.evidence_inventory.toString('base64'),
  evidence_base64: [], intake_settings_base64: raw.intake_settings.toString('base64'),
};
```
<!-- EXPERT_INTAKE_STDIO_WORKFLOW_END -->

Save that complete module as `prepare-example.mjs` in an owned consumer project.
Invoke `prepareIntakeOnce(syntheticArguments)` once from your caller. Keep the full
`outcome.structuredContent` privately and check `outcome.isError` before using it.
The identical full JSON is also in `outcome.content[0].text`. Display only small
coverage/status summaries; do not publish supplied raw bindings or opaque evidence.
The bounded refusal contains stable codes and no caller input/path/error echo.
Caller exceptions should receive a constant message without printing SDK stacks.
The guide workflow shares remote fixture entry1; it is not a fourth child entry.

## Admission, clocks and claim limits

Original tools/call params contain exactly name and arguments. The original
argument object contains exactly the six advertised keys. Original own unknown
and __proto__ keys refuse BEFORE locked SDK/Zod projection. Primitive tokens and
0..64 dense evidence entries pass canonical base64/pad-bit/count/individual/group
and entire768KiB admission before any first decode or kernel call. Four mandatory
nonempty buffers have maxima524288/65536/32768/4096 bytes. Each opaque evidence
buffer is at most32768 and the evidence group at most262144; legal individual
maxima cannot override the independent786432-byte aggregate.

The full report JSON is at most2097152 UTF8 bytes. It is retained completely as
both structuredContent and JSON text. Requests including LF are at most2097152,
actual projected tool results7340032, and actual complete response frames including
LF8388608. Escaping and duplicated content are charged; no truncation or compact
projection is accepted. Refusals<=2048 and cumulative stderr<=8192 are no-echo.

Each original request starts one native absolute15000ms work epoch before frame
parsing/admission. Schema/projection/serialization use that epoch. After encoded
byte and event admission, the final clock/sticky-abort/closed/exit check immediately
precedes one captured native write. False writes wait bounded drain; they never
resend. Synchronous work is observed on return, not hard-preempted. The caller's
separate workflow epoch begins before startup, with5000ms closure and20000ms
observed total. Original Promise outcomes are owned before later child fields;
closure is memoized and success requires the known owned child's terminal state
and captured PID absence. Unknown PID never means absence or global idle.

The direct supplied-file CLI's lack of a whole-command deadline is unchanged;
its behavior does not establish this SDK workflow's15/5/20 observations. Source
SHA declarations remain unverified and behavior fingerprints diagnostic. No source
fetch, network/provider, recruitment, human labeling, packet dispatch, rights or
admission decision occurs in this preparation endpoint. Actual npm install,
publication, browser/a11y, adoption, indexing and owner outcomes remain separate.
