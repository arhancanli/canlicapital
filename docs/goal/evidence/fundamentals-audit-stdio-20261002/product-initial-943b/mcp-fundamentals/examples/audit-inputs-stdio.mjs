#!/usr/bin/env node
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { auditInputs, AuditInputsError, AUDIT_INPUTS_LIMITS } from '../src/audit-inputs-core.mjs';
import { contentHash } from '../../scripts/canonical-json.mjs';

// Repository example only. Never imported by the released seven-tool server.
export const STDIO_AUDIT_LIMITS = Object.freeze({
  referenceBytes: AUDIT_INPUTS_LIMITS.referenceBytes,
  usageBytes: AUDIT_INPUTS_LIMITS.usageBytes,
  settingsBytes: AUDIT_INPUTS_LIMITS.settingsBytes,
  aggregateBytes: 560 * 1024,
  requestBufferBytes: 1024 * 1024,
  compactContentBytes: 64 * 1024,
  evidenceContentBytes: 2 * 1024 * 1024,
  compactResultBytes: 256 * 1024,
  evidenceResultBytes: 6 * 1024 * 1024,
  responseFrameBytes: 7 * 1024 * 1024 + 4096,
});
const RESULT_SCHEMA = 'canli.fundamentals.audit-stdio-result.v1';
const INPUT_KEYS = Object.freeze(['reference_base64', 'expected_reference_sha256', 'usage_base64', 'settings_base64', 'detail']);
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encodedCap = bytes => Math.ceil(bytes / 3) * 4;
export const AUDIT_TOOL_INPUT = z.object({
  reference_base64: z.string().min(4).max(encodedCap(STDIO_AUDIT_LIMITS.referenceBytes)).describe('Canonical padded base64 of the exact supplied reference JSON bytes; no fetching.'),
  expected_reference_sha256: z.string().regex(/^[a-f0-9]{64}$/).describe('Separately supplied lowercase SHA256 of those reference bytes.'),
  usage_base64: z.string().min(4).max(encodedCap(STDIO_AUDIT_LIMITS.usageBytes)).describe('Canonical padded base64 of the complete selected usage-row JSON array.'),
  settings_base64: z.string().min(4).max(encodedCap(STDIO_AUDIT_LIMITS.settingsBytes)).describe('Canonical padded base64 of all explicit core settings; no settings defaults.'),
  detail: z.enum(['compact', 'evidence']).optional().describe('Default compact retains every selected row; evidence returns the complete core report.'),
}).strict();
export const AUDIT_TOOL_OUTPUT = z.object({
  schema: z.literal(RESULT_SCHEMA),
  status: z.enum(['ok', 'refused']),
  view: z.enum(['compact', 'evidence']).optional(),
  projection: z.object({
    complete_core_report: z.boolean(),
    core_report_content_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    retained_selected_n: z.number().int().min(1).max(AUDIT_INPUTS_LIMITS.usageRows),
    omitted: z.array(z.string()),
  }).passthrough().optional(),
  adapter: z.record(z.string(), z.unknown()).optional(),
  audit: z.object({
    schema: z.enum(['canli.fundamentals.audit-report.v1', 'canli.fundamentals.audit-compact.v1']),
    rows: z.array(z.object({
      status: z.enum(['match', 'mismatch', 'missing', 'unsupported', 'ambiguous', 'timing_indeterminate']),
      verdict: z.boolean().nullable(), reason: z.string(),
      usage: z.record(z.string(), z.unknown()), selected: z.record(z.string(), z.unknown()).nullable(),
      selected_reason: z.string().nullable(),
    }).passthrough()).min(1).max(AUDIT_INPUTS_LIMITS.usageRows),
    coverage: z.object({
      selected_n: z.number().int().min(1).max(AUDIT_INPUTS_LIMITS.usageRows),
      counts: z.record(z.string(), z.number().int().nonnegative()),
      verdict_supported_n: z.number().int().nonnegative(), verdict_unknown_n: z.number().int().nonnegative(),
      denominator: z.string(),
    }).passthrough(),
    bindings: z.record(z.string(), z.unknown()),
    implementation: z.record(z.string(), z.unknown()),
    established: z.record(z.string(), z.unknown()),
  }).passthrough().optional(),
  content_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  error: z.object({ code: z.string().regex(/^[A-Z_]{1,64}$/), message: z.string().max(160), next_step: z.string().max(256) }).passthrough().optional(),
}).passthrough();
const INPUT_JSON_SCHEMA = z.toJSONSchema(AUDIT_TOOL_INPUT);
const OUTPUT_JSON_SCHEMA = z.toJSONSchema(AUDIT_TOOL_OUTPUT);
export const AUDIT_TOOL = Object.freeze({
  name: 'audit_inputs',
  title: 'Audit supplied fundamentals',
  description: 'Audit supplied fundamentals against exact hash-bound vintages. Retains every selected row and unknown outcome. Local repository example; no fetching, unit conversion or trading advice.',
  inputSchema: INPUT_JSON_SCHEMA,
  outputSchema: OUTPUT_JSON_SCHEMA,
  annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }),
});

class TransportInputError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function refuse(code) { throw new TransportInputError(code); }
function argumentsRecord(value) {
  if (!value || types.isProxy(value) || typeof value !== 'object' || Array.isArray(value)) refuse('ARGUMENTS');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) refuse('ARGUMENTS');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length < 4 || keys.length > 5 || keys.some(k => typeof k !== 'string' || !INPUT_KEYS.includes(k))) refuse('ARGUMENTS');
  const result = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!Object.hasOwn(d, 'value') || !d.enumerable || typeof d.value !== 'string') refuse('ARGUMENTS');
    result[key] = d.value;
  }
  if (INPUT_KEYS.slice(0, 4).some(k => !Object.hasOwn(result, k))) refuse('ARGUMENTS');
  if (!/^[a-f0-9]{64}$/.test(result.expected_reference_sha256)) refuse('EXPECTED_SHA');
  if (result.detail !== undefined && !['compact', 'evidence'].includes(result.detail)) refuse('DETAIL');
  return result;
}
function base64Length(value, maximum) {
  // All three encoded/decoded lengths and their aggregate are admitted before any decode.
  if (value.length > encodedCap(maximum)) refuse('INPUT_BOUND');
  if (value.length < 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) refuse('BASE64');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const last = BASE64_ALPHABET.indexOf(value[value.length - padding - 1]);
  if ((padding === 2 && (last & 15) !== 0) || (padding === 1 && (last & 3) !== 0)) refuse('BASE64');
  const length = value.length / 4 * 3 - padding;
  if (length < 1 || length > maximum) refuse('INPUT_BOUND');
  return length;
}
function capture(value) {
  const args = argumentsRecord(value);
  const fields = [['reference_base64', STDIO_AUDIT_LIMITS.referenceBytes], ['usage_base64', STDIO_AUDIT_LIMITS.usageBytes], ['settings_base64', STDIO_AUDIT_LIMITS.settingsBytes]];
  const lengths = fields.map(([key, maximum]) => base64Length(args[key], maximum));
  if (lengths.reduce((a, b) => a + b, 0) > STDIO_AUDIT_LIMITS.aggregateBytes) refuse('AGGREGATE_BOUND');
  if (!AUDIT_TOOL_INPUT.safeParse(args).success) refuse('ARGUMENTS');
  const copies = fields.map(([key]) => Buffer.from(args[key], 'base64'));
  // This is a second exact-byte check, never a repair or permissive normalization.
  for (let i = 0; i < copies.length; i++) {
    if (copies[i].length !== lengths[i] || copies[i].toString('base64') !== args[fields[i][0]]) refuse('BASE64');
  }
  return { args, copies, detail: args.detail ?? 'compact' };
}
function compactReport(report) {
  const { content_hash, bindings, rows, schema, ...rest } = report;
  return {
    ...rest,
    schema: 'canli.fundamentals.audit-compact.v1',
    source_report_schema: schema,
    bindings: Object.fromEntries(Object.entries(bindings).map(([key, { original_base64, ...binding }]) => [key, binding])),
    rows: rows.map(({ eligible_vintages, same_day_vintages, later_vintages, unsupported_vintages, ...row }) => ({
      ...row,
      vintage_counts: { eligible: eligible_vintages.length, same_day: same_day_vintages.length, later: later_vintages.length, unsupported: unsupported_vintages.length },
    })),
  };
}
function adapterBinding() {
  return {
    name: 'canli.fundamentals.audit-stdio-example', version: 'v1',
    behavior_sha256: contentHash({
      limits: STDIO_AUDIT_LIMITS, input_schema: INPUT_JSON_SCHEMA, output_schema: OUTPUT_JSON_SCHEMA,
      functions: [TransportInputError, refuse, argumentsRecord, base64Length, capture, compactReport, adapterBinding, result, failure, executeAuditInputs].map(fn => Function.prototype.toString.call(fn)),
    }, createHash).slice(7),
    whole_module_sha256_verified: false,
    source_binding_reason: 'Behavior fingerprint is separate from the independently signed whole-source manifest; this example does not read module files.',
  };
}
function result(data, isError = false) {
  return { resultType: 'complete', content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, ...(isError ? { isError: true } : {}) };
}
function failure(code) {
  return result({ schema: RESULT_SCHEMA, status: 'refused', error: {
    code, message: `Fundamentals audit refused (${code}).`,
    next_step: 'Check the repository AUDIT_INPUTS.md byte, schema and capacity contract; supply a corrected complete batch. Raw input bytes are never echoed in errors.',
  } }, true);
}
/** No filesystem, network, provider callback, persistence or settings default. */
export function executeAuditInputs(value) {
  try {
    const { args, copies, detail } = capture(value);
    const report = auditInputs(copies[0], args.expected_reference_sha256, copies[1], copies[2]);
    const data = {
      schema: RESULT_SCHEMA, status: 'ok', view: detail,
      projection: { complete_core_report: detail === 'evidence', core_report_content_hash: report.content_hash, retained_selected_n: report.coverage.selected_n,
        omitted: detail === 'evidence' ? [] : ['bindings.*.original_base64', 'rows.*.eligible_vintages', 'rows.*.same_day_vintages', 'rows.*.later_vintages', 'rows.*.unsupported_vintages'] },
      adapter: adapterBinding(), audit: detail === 'evidence' ? report : compactReport(report),
    };
    data.content_hash = contentHash(data, createHash);
    if (!AUDIT_TOOL_OUTPUT.safeParse(data).success) refuse('OUTPUT_SCHEMA');
    if (Buffer.byteLength(JSON.stringify(data)) > STDIO_AUDIT_LIMITS[`${detail}ContentBytes`]) refuse('OUTPUT_BOUND');
    const response = result(data);
    if (Buffer.byteLength(JSON.stringify(response)) > STDIO_AUDIT_LIMITS[`${detail}ResultBytes`]) refuse('OUTPUT_BOUND');
    return response;
  } catch (error) {
    if (error instanceof TransportInputError) return failure(error.code);
    if (error instanceof AuditInputsError && /^[A-Z_]{1,48}$/.test(error.code)) return failure(`CORE_${error.code}`);
    return failure('INTERNAL');
  }
}

export function createAuditInputsServer() {
  // Low-level SDK API preserves bounded stable refusal codes before Zod can echo errors.
  const server = new Server({ name: 'canli-fundamentals-audit-example', version: '0.0.0', title: 'Repository fundamentals audit example' }, {
    capabilities: { tools: { listChanged: false } },
    instructions: 'Repository-only Unreleased example. audit_inputs consumes exact supplied raw bytes and a separate reference SHA256. Compact keeps every selected row; request evidence for the complete report. Missing coverage and same-day filing timing remain unknown.',
  });
  server.setRequestHandler('tools/list', () => ({ resultType: 'complete', tools: [AUDIT_TOOL] }));
  server.setRequestHandler('tools/call', request => server.projectCallToolResult(
    request.params.name === 'audit_inputs' ? executeAuditInputs(request.params.arguments) : failure('TOOL_NAME'), OUTPUT_JSON_SCHEMA,
  ));
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const server = createAuditInputsServer();
  // Pinned SDK 2.1.0 bounds its read buffer before appending/parsing a protocol frame.
  const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: STDIO_AUDIT_LIMITS.requestBufferBytes });
  const send = transport.send.bind(transport);
  transport.send = message => Buffer.byteLength(JSON.stringify(message)) > STDIO_AUDIT_LIMITS.responseFrameBytes
    ? Promise.reject(new TransportInputError('FRAME_OUTPUT_BOUND')) : send(message);
  server.onerror = () => { process.stderr.write('Fundamentals audit transport refused (TRANSPORT).\n'); };
  await server.connect(transport);
}
