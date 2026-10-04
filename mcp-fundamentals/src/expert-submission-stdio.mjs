#!/usr/bin/env node
import { types, TextDecoder } from 'node:util';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { reconcileExpertSubmissions, ExpertSubmissionAuditError, EXPERT_SUBMISSION_REPORT_SCHEMA } from './expert-submission-audit-core.mjs';
import { canonicalJson, contentHash } from './canonical-json.mjs';

// Packaged opt-in command. No default-server registration or import-time launch.
export const EXPERT_STDIO_LIMITS = Object.freeze({
  goldBytes: 524288, intakeBytes: 65536, evidenceInventoryBytes: 32768,
  evidenceBytes: 32768, evidenceCount: 64, evidenceTotalBytes: 262144,
  intakeSettingsBytes: 4096, intakeTotalBytes: 786432,
  submissionInventoryBytes: 16384, submissionBytes: 2097152, submissionCount: 2,
  auditSettingsBytes: 4096, totalInputBytes: 4194304,
  requestFrameBytes: 6291456, reportBytes: 6291456,
  toolResultBytes: 19922944, responseFrameBytes: 20971520,
  refusalBytes: 2048, stderrBytes: 8192, stringIdBytes: 128,
  workMs: 15000, closureMs: 5000, totalMs: 20000,
});
const FIELDS = Object.freeze([
  'gold_base64', 'expected_gold_raw_sha256', 'intake_base64', 'evidence_inventory_base64',
  'evidence_base64', 'intake_settings_base64', 'submission_inventory_base64',
  'submission_base64', 'audit_settings_base64',
]);
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encodedCap = bytes => Math.ceil(bytes / 3) * 4;
const encoded = maximum => z.string().max(encodedCap(maximum)).describe('Canonical base64 of exact supplied bytes, including padding where required; never fetched or repaired.');
export const EXPERT_TOOL_INPUT = z.object({
  gold_base64: encoded(EXPERT_STDIO_LIMITS.goldBytes),
  expected_gold_raw_sha256: z.string().length(64).regex(/^[a-f0-9]{64}$/).describe('Separate primitive lowercase SHA256 of the original gold bytes.'),
  intake_base64: encoded(EXPERT_STDIO_LIMITS.intakeBytes),
  evidence_inventory_base64: encoded(EXPERT_STDIO_LIMITS.evidenceInventoryBytes),
  evidence_base64: z.array(encoded(EXPERT_STDIO_LIMITS.evidenceBytes)).max(EXPERT_STDIO_LIMITS.evidenceCount),
  intake_settings_base64: encoded(EXPERT_STDIO_LIMITS.intakeSettingsBytes),
  submission_inventory_base64: encoded(EXPERT_STDIO_LIMITS.submissionInventoryBytes),
  submission_base64: z.array(encoded(EXPERT_STDIO_LIMITS.submissionBytes)).max(EXPERT_STDIO_LIMITS.submissionCount),
  audit_settings_base64: encoded(EXPERT_STDIO_LIMITS.auditSettingsBytes),
}).strict();
export const EXPERT_TOOL_OUTPUT = z.object({
  schema: z.literal(EXPERT_SUBMISSION_REPORT_SCHEMA),
  implementation: z.object({
    declared_module_sha256_verified: z.literal(false),
    dependency_source_pins_verified: z.literal(false),
  }).passthrough(),
  preparation: z.record(z.string(), z.unknown()),
  packet_sha256: z.string().length(64).regex(/^[a-f0-9]{64}$/),
  expected_gold_raw_sha256: z.string().length(64).regex(/^[a-f0-9]{64}$/),
  bindings: z.record(z.string(), z.unknown()),
  settings: z.record(z.string(), z.unknown()),
  limits: z.record(z.string(), z.unknown()),
  total_captured_input_bytes: z.number().int().nonnegative().max(EXPERT_STDIO_LIMITS.totalInputBytes),
  submissions: z.array(z.record(z.string(), z.unknown())).length(2),
  role_coverage: z.array(z.record(z.string(), z.unknown())).length(2),
  coverage: z.record(z.string(), z.unknown()),
  syntactic_agreement: z.record(z.string(), z.unknown()),
  adjudication: z.record(z.string(), z.unknown()),
  established: z.record(z.string(), z.unknown()),
  interpretation: z.string(),
  content_hash: z.string().length(71).regex(/^sha256:[a-f0-9]{64}$/),
}).passthrough();
const INPUT_SCHEMA = z.toJSONSchema(EXPERT_TOOL_INPUT);
const OUTPUT_SCHEMA = z.toJSONSchema(EXPERT_TOOL_OUTPUT);
export const EXPERT_TOOL = Object.freeze({
  name: 'filingfacts_audit_expert_submissions',
  title: 'Audit supplied expert-review submissions',
  description: 'Reconcile exact supplied gold, preparation, evidence and fictional or privately supplied review packets. Returns the complete immutable-row audit and missing work. Byte consistency is separate from verified humans, expertise, independence, rights and adjudication. Offline opt-in package command; no fetching or decisions.',
  inputSchema: INPUT_SCHEMA, outputSchema: OUTPUT_SCHEMA,
  annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }),
});

export class ExpertStdioError extends Error {
  constructor(code) { super('Expert submission stdio refused (' + code + ').'); this.name = 'ExpertStdioError'; this.code = code; }
}
function refuse(code) { throw new ExpertStdioError(code); }
const nativeClock = () => performance.now();
const nativeDecode = text => Buffer.from(text, 'base64');
const nativeSerialize = value => JSON.stringify(value);

/** One sticky absolute clock. Internal test injection is never a wire field. */
export function createWorkScope({ clock = nativeClock, signal } = {}) {
  const started = clock(); let previous = started; let failure = null; let closed = false; let exited = false;
  const listeners = new Set(); const signals = new Set(); const abortListeners = new Map();
  function fail(code) {
    if (failure === null) {
      failure = code;
      for (const listener of [...listeners]) listener(new ExpertStdioError(failure));
    }
  }
  function observe() {
    const now = clock();
    if (!Number.isFinite(now) || !Number.isFinite(started) || now < previous) fail('CLOCK');
    previous = now;
    if (closed) fail('CLOSED');
    if (exited) fail('EXITED');
    if ([...signals].some(value => value.aborted)) fail('ABORTED');
    if (now - started >= EXPERT_STDIO_LIMITS.workMs) fail('DEADLINE');
    if (failure !== null) refuse(failure);
    return now;
  }
  function bindSignal(value) {
    if (value && !signals.has(value)) {
      signals.add(value);
      const listener = () => fail('ABORTED');
      value.addEventListener('abort', listener, { once: true }); abortListeners.set(value, listener);
    }
    observe();
  }
  if (signal) bindSignal(signal);
  return {
    started, observe, bindSignal, fail,
    close() { closed = true; fail('CLOSED'); },
    exit() { exited = true; fail('EXITED'); },
    remaining() { return Math.max(0, started + EXPERT_STDIO_LIMITS.workMs - observe()); },
    onFailure(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { for (const [value, listener] of abortListeners) value.removeEventListener('abort', listener); abortListeners.clear(); signals.clear(); },
    get failure() { return failure; },
  };
}

function argumentsRecord(value) {
  if (!value || types.isProxy(value) || typeof value !== 'object' || Array.isArray(value)) refuse('ARGUMENTS');
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) refuse('ARGUMENTS');
  const descriptors = Object.getOwnPropertyDescriptors(value); const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== FIELDS.length || keys.some(key => typeof key !== 'string' || !FIELDS.includes(key))) refuse('ARGUMENTS');
  const result = Object.create(null);
  for (const key of FIELDS) {
    const row = descriptors[key];
    if (!row || !Object.hasOwn(row, 'value') || !row.enumerable) refuse('ARGUMENTS');
    result[key] = row.value;
  }
  const sha = result.expected_gold_raw_sha256;
  if (typeof sha !== 'string' || sha.length !== 64 || !/^[a-f0-9]{64}$/.test(sha)) refuse('EXPECTED_SHA');
  return result;
}
function denseArray(value, maximum) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse('ARRAY');
  const count = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (count > maximum) refuse('COUNT_BOUND');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== count + 1) refuse('ARRAY');
  const copy = [];
  for (let index = 0; index < count; index++) {
    const row = descriptors[index];
    if (!row || !Object.hasOwn(row, 'value') || !row.enumerable) refuse('ARRAY');
    copy.push(row.value);
  }
  return copy;
}
function base64Length(value, maximum) {
  if (typeof value !== 'string') refuse('BASE64_TYPE');
  if (value.length > encodedCap(maximum)) refuse('INPUT_BOUND');
  if (value === '') return 0;
  const match = /^[A-Za-z0-9+/]+={0,2}$/.exec(value);
  if (value.length % 4 !== 0 || !match || match[0].length !== value.length) refuse('BASE64');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const last = ALPHABET.indexOf(value[value.length - padding - 1]);
  if ((padding === 2 && (last & 15) !== 0) || (padding === 1 && (last & 3) !== 0)) refuse('BASE64');
  const bytes = value.length / 4 * 3 - padding;
  if (bytes > maximum) refuse('INPUT_BOUND');
  return bytes;
}
/** All types, counts, encoded lengths and groups admitted before the first decode. */
export function captureExpertArguments(value, { decode = nativeDecode, observe = () => {} } = {}) {
  observe(); const args = argumentsRecord(value);
  args.evidence_base64 = denseArray(args.evidence_base64, EXPERT_STDIO_LIMITS.evidenceCount);
  args.submission_base64 = denseArray(args.submission_base64, EXPERT_STDIO_LIMITS.submissionCount);
  const singles = [
    ['gold_base64', EXPERT_STDIO_LIMITS.goldBytes],
    ['intake_base64', EXPERT_STDIO_LIMITS.intakeBytes],
    ['evidence_inventory_base64', EXPERT_STDIO_LIMITS.evidenceInventoryBytes],
    ['intake_settings_base64', EXPERT_STDIO_LIMITS.intakeSettingsBytes],
    ['submission_inventory_base64', EXPERT_STDIO_LIMITS.submissionInventoryBytes],
    ['audit_settings_base64', EXPERT_STDIO_LIMITS.auditSettingsBytes],
  ];
  const rows = singles.map(([key, cap]) => ({ key, text: args[key], bytes: base64Length(args[key], cap) }));
  const evidence = args.evidence_base64.map(text => ({ text, bytes: base64Length(text, EXPERT_STDIO_LIMITS.evidenceBytes) }));
  const submissions = args.submission_base64.map(text => ({ text, bytes: base64Length(text, EXPERT_STDIO_LIMITS.submissionBytes) }));
  const evidenceBytes = evidence.reduce((sum, row) => sum + row.bytes, 0);
  const intakeBytes = rows.slice(0, 4).reduce((sum, row) => sum + row.bytes, 0) + evidenceBytes;
  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0) + evidenceBytes + submissions.reduce((sum, row) => sum + row.bytes, 0);
  if (evidenceBytes > EXPERT_STDIO_LIMITS.evidenceTotalBytes) refuse('EVIDENCE_TOTAL_BOUND');
  if (intakeBytes > EXPERT_STDIO_LIMITS.intakeTotalBytes) refuse('INTAKE_TOTAL_BOUND');
  if (totalBytes > EXPERT_STDIO_LIMITS.totalInputBytes) refuse('TOTAL_INPUT_BOUND');
  if (!EXPERT_TOOL_INPUT.safeParse(args).success) refuse('ARGUMENTS');
  function owned(row) {
    observe(); const buffer = decode(row.text);
    if (!Buffer.isBuffer(buffer) || Object.getPrototypeOf(buffer) !== Buffer.prototype || types.isSharedArrayBuffer(buffer.buffer)) refuse('DECODE');
    if (buffer.length !== row.bytes || buffer.toString('base64') !== row.text) refuse('DECODE');
    observe(); return buffer;
  }
  const buffers = rows.map(owned); const evidenceBuffers = evidence.map(owned); const submissionBuffers = submissions.map(owned);
  observe();
  return {
    totalBytes,
    kernelArguments: [buffers[0], args.expected_gold_raw_sha256, buffers[1], buffers[2],
      evidenceBuffers, buffers[3], buffers[4], submissionBuffers, buffers[5]],
  };
}

function toolResult(report, text, isError = false) {
  return { resultType: 'complete', content: [{ type: 'text', text }], ...(report ? { structuredContent: report } : {}), ...(isError ? { isError: true } : {}) };
}
export function expertRefusal(code) {
  const stable = typeof code === 'string' && code.length <= 64 && /^[A-Z0-9_]+$/.test(code) ? code : 'INTERNAL';
  const data = { schema: 'canli.expert-submission-stdio-refusal.v1', status: 'refused', error: {
    code: stable, message: 'Expert submission audit refused (' + stable + ').',
    next_step: 'Supply a complete corrected bounded batch using the packaged EXPERT_SUBMISSIONS.md contract. No input is echoed.',
  } };
  const result = toolResult(null, JSON.stringify(data), true);
  if (Buffer.byteLength(JSON.stringify(result)) > EXPERT_STDIO_LIMITS.refusalBytes) refuse('REFUSAL_BOUND');
  return result;
}
export function executeExpertSubmission(value, { kernel = reconcileExpertSubmissions, decode = nativeDecode, scope = createWorkScope() } = {}) {
  try {
    scope.observe();
    const captured = captureExpertArguments(value, { decode, observe: scope.observe });
    scope.observe(); const report = kernel(...captured.kernelArguments); scope.observe();
    if (!EXPERT_TOOL_OUTPUT.safeParse(report).success) refuse('OUTPUT_SCHEMA');
    const text = JSON.stringify(report); scope.observe();
    if (Buffer.byteLength(text) > EXPERT_STDIO_LIMITS.reportBytes) refuse('REPORT_BOUND');
    if (report.content_hash !== contentHash(report, createHash)) refuse('CONTENT_HASH');
    const publicReport = JSON.parse(text); scope.observe();
    if (canonicalJson(report) !== canonicalJson(publicReport)) refuse('PUBLIC_JSON');
    const response = toolResult(publicReport, text);
    if (Buffer.byteLength(JSON.stringify(response)) > EXPERT_STDIO_LIMITS.toolResultBytes) refuse('TOOL_RESULT_BOUND');
    scope.observe(); return response;
  } catch (error) {
    // Late/aborted work stays sticky; transport final admission then closes without a success.
    if (error instanceof ExpertStdioError) return expertRefusal(error.code);
    if (error instanceof ExpertSubmissionAuditError) return expertRefusal('CORE_' + error.code);
    return expertRefusal('INTERNAL');
  }
}

function validId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (typeof value !== 'string' || Buffer.byteLength(value) > EXPERT_STDIO_LIMITS.stringIdBytes) return false;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
/** Fatal UTF8 and complete frame+LF admission precede parse and SDK schema projection. */
export class ExpertFrameBuffer {
  constructor(onMessage = () => {}) { this.buffer = Buffer.alloc(0); this.onMessage = onMessage; }
  append(chunk) {
    if (!Buffer.isBuffer(chunk) || Object.getPrototypeOf(chunk) !== Buffer.prototype || types.isSharedArrayBuffer(chunk.buffer)) refuse('FRAME_BYTES');
    if (this.buffer.length + chunk.length > EXPERT_STDIO_LIMITS.requestFrameBytes) { this.clear(); refuse('FRAME_INPUT_BOUND'); }
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
  }
  readMessage() {
    const index = this.buffer.indexOf(10); if (index < 0) return null;
    const line = this.buffer.subarray(0, index); this.buffer = this.buffer.subarray(index + 1);
    let message;
    try { message = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(line)); }
    catch { this.clear(); refuse('FRAME_PARSE'); }
    if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || message.method.length > 128 ||
      Object.keys(message).some(key => !['jsonrpc', 'id', 'method', 'params'].includes(key)) ||
      (Object.hasOwn(message, 'id') && !validId(message.id)) ||
      (Object.hasOwn(message, 'params') && (!message.params || Array.isArray(message.params) || typeof message.params !== 'object'))) {
      this.clear(); refuse('FRAME_SHAPE');
    }
    this.onMessage(message); return message;
  }
  finish() { if (this.buffer.length) { this.clear(); refuse('FRAME_UNTERMINATED'); } }
  clear() { this.buffer = Buffer.alloc(0); }
}

/** SAME sender used by production and native fixtures. One captured write, no retry. */
export function createExpertNativeWriter(output, { serialize = nativeSerialize, frameBytes = EXPERT_STDIO_LIMITS.responseFrameBytes } = {}) {
  if (!Number.isSafeInteger(frameBytes) || frameBytes < 1 || frameBytes > EXPERT_STDIO_LIMITS.responseFrameBytes) refuse('FRAME_POLICY');
  const nativeWrite = output.write.bind(output);
  return {
    send(message, scope, { tool = false } = {}) {
      try {
        scope.observe();
        if (Object.hasOwn(message, 'id') && !validId(message.id)) refuse('FRAME_ID');
        // Bound the actual duplicated/escaped tool object as well as its whole envelope.
        if (tool && Buffer.byteLength(serialize(message.result)) > EXPERT_STDIO_LIMITS.toolResultBytes) refuse('TOOL_RESULT_BOUND');
        const json = serialize(message);
        if (typeof json !== 'string') refuse('SERIALIZE');
        const frame = json + '\n';
        if (Buffer.byteLength(frame) > frameBytes) refuse('FRAME_OUTPUT_BOUND');
        const encodedFrame = Buffer.from(frame, 'utf8');
        return new Promise((resolve, reject) => {
          let settled = false; let timer; let removeFailure = () => {};
          const clean = () => { output.off('error', onError); output.off('close', onClose); output.off('drain', onDrain); clearTimeout(timer); removeFailure(); };
          const finish = error => {
            if (settled) return;
            settled = true; clean(); if (error) reject(error); else resolve();
          };
          const onError = () => { scope.fail('WRITE'); finish(new ExpertStdioError('WRITE')); };
          const onClose = () => { scope.close(); finish(new ExpertStdioError('CLOSED')); };
          const onDrain = () => { try { scope.observe(); finish(); } catch (error) { finish(error); } };
          removeFailure = scope.onFailure(finish);
          output.once('error', onError);
          output.once('close', onClose);
          try {
            // Exact serialized bytes, encoded cap and event setup are complete.
            // No callback, await or second serialization occurs between this check and write.
            scope.observe();
            const accepted = nativeWrite(encodedFrame);
            if (settled) return;
            if (accepted) finish();
            else {
              output.once('drain', onDrain);
              timer = setTimeout(() => { scope.fail('DEADLINE'); finish(new ExpertStdioError('DEADLINE')); }, scope.remaining());
            }
          } catch (error) { scope.fail(error instanceof ExpertStdioError ? error.code : 'WRITE'); finish(new ExpertStdioError(scope.failure)); }
        });
      } catch (error) {
        scope.fail(error instanceof ExpertStdioError ? error.code : 'SERIALIZE');
        return Promise.reject(new ExpertStdioError(scope.failure));
      }
    },
  };
}

/** Captured constant diagnostics: never SDK exception text, input, paths or stacks. */
export function createExpertDiagnostics(output, overflow = () => {}) {
  const write = output.write.bind(output); let bytes = 0; let failed = false;
  return {
    emit() {
      if (failed) return false;
      const text = 'Expert submission stdio refused (TRANSPORT).\n'; const size = Buffer.byteLength(text);
      if (bytes + size > EXPERT_STDIO_LIMITS.stderrBytes) { failed = true; overflow(); return false; }
      bytes += size;
      try { write(text); return true; } catch { failed = true; overflow(); return false; }
    },
    get bytes() { return bytes; }, get failed() { return failed; },
  };
}

export class ExpertSubmissionTransport extends StdioServerTransport {
  constructor(input, output, { clock = nativeClock, serialize = nativeSerialize, diagnostic = () => {} } = {}) {
    super(input, output, { maxBufferSize: EXPERT_STDIO_LIMITS.requestFrameBytes });
    this.clock = clock; this.diagnostic = diagnostic; this.scopes = new Map(); this.responses = new Set();
    this.writer = createExpertNativeWriter(output, { serialize });
    this._readBuffer = new ExpertFrameBuffer(message => this.accept(message));
    this._onstdinclose = () => {
      try { this._readBuffer.finish(); } catch { this.diagnostic(); }
      void this.close().catch(() => {});
    };
    this.onerror = () => { this.diagnostic(); void this.close().catch(() => {}); };
  }
  accept(message) {
    if (Object.hasOwn(message, 'id')) {
      if (this._closed || this.scopes.has(message.id) || this.scopes.size >= 16) refuse('FRAME_PENDING');
      this.scopes.set(message.id, { scope: createWorkScope({ clock: this.clock }), method: message.method });
    } else if (message.method === 'notifications/cancelled') {
      this.scopes.get(message.params?.requestId)?.scope.fail('ABORTED');
    }
    if (message.method === 'tools/call') {
      // The locked SDK projects params and drops record keys such as __proto__.
      // Admit original keys on the same request clock before that projection.
      const scope = this.scopes.get(message.id)?.scope;
      if (!scope) refuse('FRAME_REQUEST');
      scope.observe();
      const params = message.params;
      if (!params || Object.keys(params).length !== 2 || !Object.hasOwn(params, 'name') || !Object.hasOwn(params, 'arguments')) refuse('ARGUMENTS');
      argumentsRecord(params.arguments);
      scope.observe();
    }
  }
  scopeFor(id, signal) {
    const row = this.scopes.get(id);
    if (!row) refuse('FRAME_REQUEST');
    row.scope.bindSignal(signal); return row.scope;
  }
  send(message) {
    if (this._closed || !Object.hasOwn(message, 'id')) return Promise.reject(new ExpertStdioError('CLOSED'));
    const row = this.scopes.get(message.id);
    if (!row || this.responses.has(message.id)) return Promise.reject(new ExpertStdioError('FRAME_RESPONSE'));
    this.responses.add(message.id);
    // SDK schema failures sometimes contain caller strings; replace the entire error.
    const safe = Object.hasOwn(message, 'error') ? {
      jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Expert submission protocol refused.' },
    } : message;
    return this.writer.send(safe, row.scope, { tool: row.method === 'tools/call' && Object.hasOwn(safe, 'result') })
      .then(() => { row.scope.dispose(); this.scopes.delete(message.id); this.responses.delete(message.id); },
        error => { row.scope.fail(error.code ?? 'WRITE'); this.diagnostic(); void this.close().catch(() => {}); throw error; });
  }
  close() {
    if (!this.closing) {
      // Publish one closure promise before callbacks can reenter. Pausing the
      // inherited reader alone leaves a malformed-input child pipe open.
      let complete; let failed;
      this.closing = new Promise((resolve, reject) => { complete = resolve; failed = reject; });
      try {
        for (const { scope } of this.scopes.values()) { scope.close(); scope.dispose(); }
        this.scopes.clear(); this.responses.clear();
        Promise.resolve(super.close()).then(() => {
          try { this._stdin.destroy(); complete(); }
          catch { failed(new ExpertStdioError('CLOSE')); }
        }, () => failed(new ExpertStdioError('CLOSE')));
      } catch { failed(new ExpertStdioError('CLOSE')); }
    }
    return this.closing;
  }
}

export function createExpertSubmissionEndpoint({ input = process.stdin, output = process.stdout, stderr = process.stderr,
  clock = nativeClock, serialize = nativeSerialize, kernel = reconcileExpertSubmissions, decode = nativeDecode } = {}) {
  let transport;
  const diagnostics = createExpertDiagnostics(stderr, () => { void transport?.close().catch(() => {}); });
  transport = new ExpertSubmissionTransport(input, output, { clock, serialize, diagnostic: () => diagnostics.emit() });
  const server = new Server({ name: 'canli-expert-submission-stdio-example', version: '0.0.0', title: 'Packaged expert-submission audit' }, {
    capabilities: { tools: { listChanged: false } },
    instructions: 'Opt-in Unreleased supplied-byte example. Complete immutable-row reconciliation is distinct from verified humans, rights, expertise, independence, labels, adjudication or release. No provider, decisions or fetching.',
    inputRequired: { legacyShim: false },
  });
  server.setRequestHandler('tools/list', () => ({ resultType: 'complete', tools: [EXPERT_TOOL] }));
  server.setRequestHandler('tools/call', (request, ctx) => {
    const scope = transport.scopeFor(ctx.mcpReq.id, ctx.mcpReq.signal); scope.observe();
    const params = request.params;
    const valid = params && Object.keys(params).length === 2 && Object.hasOwn(params, 'name') && Object.hasOwn(params, 'arguments');
    const result = !valid ? expertRefusal('ARGUMENTS') : params.name !== EXPERT_TOOL.name ? expertRefusal('TOOL_NAME')
      : executeExpertSubmission(params.arguments, { kernel, decode, scope });
    scope.observe();
    const projected = server.projectCallToolResult(result, OUTPUT_SCHEMA); scope.observe();
    if (Buffer.byteLength(JSON.stringify(projected)) > EXPERT_STDIO_LIMITS.toolResultBytes) refuse('TOOL_RESULT_BOUND');
    scope.observe(); return projected;
  });
  server.onerror = () => { diagnostics.emit(); void transport.close().catch(() => {}); };
  return { server, transport, diagnostics };
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isDirectExecution()) {
  try {
    if (process.argv.length !== 2) refuse('CLI_ARGUMENTS');
    const { server, transport } = createExpertSubmissionEndpoint();
    await server.connect(transport);
  } catch {
    process.stderr.write('Expert submission stdio refused (STARTUP).\n');
    process.exitCode = 1;
  }
}
