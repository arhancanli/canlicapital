#!/usr/bin/env node
import { types, TextDecoder } from 'node:util';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { prepareExpertIntake, ExpertIntakeError, EXPERT_REPORT_SCHEMA, EXPERT_INTAKE_LIMITS } from './expert-intake-core.mjs';
import { canonicalJson, contentHash } from './canonical-json.mjs';

// Packaged opt-in command. No default-server registration or import-time launch.
export const INTAKE_STDIO_LIMITS = Object.freeze({
  goldBytes: 524288, intakeBytes: 65536, evidenceInventoryBytes: 32768,
  evidenceBytes: 32768, evidenceCount: 64, evidenceTotalBytes: 262144,
  intakeSettingsBytes: 4096, totalInputBytes: 786432,
  requestFrameBytes: 2097152, reportBytes: 2097152,
  toolResultBytes: 7340032, responseFrameBytes: 8388608,
  refusalBytes: 2048, stderrBytes: 8192, stringIdBytes: 128, pendingRequests: 16,
  workMs: 15000, closureMs: 5000, totalMs: 20000,
});
const FIELDS = Object.freeze([
  'gold_base64', 'expected_gold_raw_sha256', 'intake_base64',
  'evidence_inventory_base64', 'evidence_base64', 'intake_settings_base64',
]);
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encodedCap = bytes => Math.ceil(bytes / 3) * 4;
const encoded = maximum => z.string().min(4).max(encodedCap(maximum)).describe('Canonical base64 of exact supplied bytes, including padding where required; never fetched or repaired.');
export const INTAKE_TOOL_INPUT = z.object({
  gold_base64: encoded(INTAKE_STDIO_LIMITS.goldBytes),
  expected_gold_raw_sha256: z.string().length(64).regex(/^[a-f0-9]{64}$/).describe('Separate primitive lowercase SHA256 of the original gold bytes.'),
  intake_base64: encoded(INTAKE_STDIO_LIMITS.intakeBytes),
  evidence_inventory_base64: encoded(INTAKE_STDIO_LIMITS.evidenceInventoryBytes),
  evidence_base64: z.array(encoded(INTAKE_STDIO_LIMITS.evidenceBytes)).max(INTAKE_STDIO_LIMITS.evidenceCount),
  intake_settings_base64: encoded(INTAKE_STDIO_LIMITS.intakeSettingsBytes),
}).strict();
const sha = () => z.string().length(64).regex(/^[a-f0-9]{64}$/);
const byteBinding = maximum => z.object({ bytes: z.number().int().positive().max(maximum), sha256: sha(), original_base64: encoded(maximum) }).strict();
const ROLES = Object.freeze(['reviewer_a', 'reviewer_b', 'adjudicator']);
const USES = Object.freeze(['human_review', 'evaluation', 'training', 'redistribution']);
const roleName = () => z.enum(ROLES);
const text = (maximum = 128) => z.string().max(maximum);
const ids = (maximum = 8) => z.array(text()).max(maximum);
const useList = () => z.array(z.enum(USES)).max(4);
const verification = z.object({ who: text(), date: text(10), method: text(1024), evidence_ids: ids() }).strict();
const qualificationDeclaration = z.object({ id: text(), kind: z.enum(['phd', 'cfa', 'engineering', 'other']),
  title: text(512), task_relevance: text(1024).nullable(), evidence_ids: ids(), verification: verification.nullable() }).strict();
const conflictDeclaration = z.object({ id: text(), description: text(1024), evidence_ids: ids() }).strict();
const roleDeclaration = z.object({ role: roleName(), handle: text(), aliases: ids(),
  affiliations: z.array(text(512)).max(8).nullable(), conflicts: z.array(conflictDeclaration).max(16).nullable(),
  identity_evidence_ids: ids(), independence_evidence_ids: ids(), qualifications: z.array(qualificationDeclaration).max(8) }).strict();
const claimDeclaration = z.object({ id: text(), declaration_text: text(2048).nullable(),
  allowed_uses: useList().nullable(), denied_uses: useList().nullable(), evidence_ids: ids(), verification: verification.nullable() }).strict();
const evidenceReferences = z.object({ declared_ids: ids(),
  provided: z.array(z.object({ id: text(), bytes: z.number().int().positive().max(INTAKE_STDIO_LIMITS.evidenceBytes), sha256: sha() }).strict()).max(8),
  missing_ids: ids(), authenticity_verified: z.null() }).strict();
const ROLE_TASKS = Object.freeze([
  'Authenticate the consenting person behind the declared handle and aliases.',
  'Verify task-relevant qualifications with an independent credential/source check.',
  'Check actual independence and disclosed affiliations/conflicts; distinct text handles alone do not establish it.',
]);
const REVIEW_TASK = 'Review the same immutable packet independently after identity, qualification and source-use checks.';
const ADJUDICATOR_TASK = 'Await both independent complete submissions before a source-backed decision.';
const SOURCE_TASKS = Object.freeze([
  'Check who can grant the requested uses for this exact source and whether the supplied evidence is authentic.',
  'Resolve missing, conflicting or out-of-scope use declarations for every requested use.',
  'Record a separately authorized rights/admission decision; public availability, URLs and dataset-card licence are not independent clearance.',
]);
const ITEM_TASK = 'After complete independent reviews, check cited filing locators, resolve disagreements and record an explicit decision with source notes.';
const DENOMINATOR = 'All items and distinct exact cited sources in the supplied immutable gold packet; missing roles/evidence never reduce selected-N.';
const PACKET_BASIS = 'packetContent: immutable schema, ID-sorted id/template/company/question/answer/filings; raw SHA binds original order and all blank fields separately.';
const roleWorklist = z.object({ role: roleName(), declared_handle: text().nullable(), declaration: roleDeclaration.nullable(),
  authenticated_human: z.null(), task_expertise_verified: z.null(), actual_independence_verified: z.null(),
  tasks: z.tuple([...ROLE_TASKS.map(value => z.literal(value)), z.enum([REVIEW_TASK, ADJUDICATOR_TASK])]),
  status: z.enum(['missing_role_declaration', 'declared_unverified']), identity_evidence: evidenceReferences.nullable(),
  independence_evidence: evidenceReferences.nullable(),
  qualifications: z.array(z.object({ declaration: qualificationDeclaration, evidence: evidenceReferences,
    declared_verification_evidence: evidenceReferences.nullable(), qualification_authenticity_verified: z.null(), task_expertise_verified: z.null(),
    tasks: z.tuple([z.literal('Verify the claimed qualification and verification provenance independently.'),
      z.literal('Assess its relevance to financial statement and XBRL review.')]) }).strict()).max(8),
  conflicts: z.array(z.object({ declaration: conflictDeclaration, evidence: evidenceReferences, independently_assessed: z.null() }).strict()).max(16).nullable(),
}).strict();
const sourceWorklist = z.object({ source_id: sha(), url: text(2048), item_ids: ids(128).min(1), declaration_present: z.boolean(),
  claims: z.array(z.object({ declaration: claimDeclaration, evidence: evidenceReferences,
    declared_verification_evidence: evidenceReferences.nullable(), rights_verified: z.null() }).strict()).max(8),
  required_uses: useList(), mechanical_flags: z.object({ missing_declaration: z.boolean(), unknown_use_scope: z.boolean(),
    missing_declared_evidence: z.boolean(), contradictory_use_claims: useList(), uncovered_required_uses: useList(), restricted_required_uses: useList() }).strict(),
  actual_rights_verified: z.null(), source_completeness_verified: z.null(), admitted_for_human_review: z.null(), admitted_for_release: z.null(),
  tasks: z.tuple(SOURCE_TASKS.map(value => z.literal(value))),
}).strict();
const blankLabel = z.object({ id: text(), template: text(), company: text(512), question: text(4096), answer: text(4096),
  filings: z.array(text(2048)).min(1).max(16), question_clear: z.literal(''), answer_matches_filing: z.literal(''), citation_correct: z.literal(''), notes: z.literal('') }).strict();
const reviewPacket = z.object({ schema: z.literal('canli.filing-facts-gold-packet.v0'),
  guidelines: z.literal('scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md'),
  judgements: z.object({ question_clear: z.tuple([z.literal('yes'), z.literal('no')]),
    answer_matches_filing: z.tuple([z.literal('yes'), z.literal('no'), z.literal('cannot_find')]),
    citation_correct: z.tuple([z.literal('yes'), z.literal('no')]) }).strict(),
  annotator: text(), labels: z.array(blankLabel).min(1).max(128), packet_sha256: sha() }).strict();
const evidenceSubject = z.union([
  z.object({ role: roleName(), handle: text() }).strict(),
  z.object({ role: roleName(), handle: text(), qualification_id: text() }).strict(),
  z.object({ role: roleName(), handle: text(), conflict_id: text() }).strict(),
  z.object({ source_id: sha(), url: text(2048) }).strict(),
]);
const inventoryEntry = z.object({ id: text(), packet_sha256: sha(), purpose: z.enum(['identity', 'independence', 'qualification', 'conflict', 'source_rights']),
  subject: evidenceSubject, expected_sha256: sha(), expected_bytes: z.number().int().positive().max(INTAKE_STDIO_LIMITS.evidenceBytes),
  binding: byteBinding(INTAKE_STDIO_LIMITS.evidenceBytes), byte_binding_verified: z.literal(true), document_authenticity: z.null(), referenced: z.boolean() }).strict();
export const INTAKE_TOOL_OUTPUT = z.object({
  schema: z.literal(EXPERT_REPORT_SCHEMA),
  implementation: z.object({
    name: z.literal('canli.filing-facts.expert-intake'), version: z.literal('v1'),
    // Source declarations/diagnostics are never executing-code authentication.
    behavior_sha256: sha(), dependency_source_sha256: z.object({
      canonical_json: z.literal('881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b'),
      packet_content: z.literal('eb61ab2bf78d7047569c8cf92ea348dc5c3a9e6fe311c16a63361765b2e08bc8'),
      identity_convention_agreement: z.literal('f461cb2b9e3b138d1135a7ff295c30cfb911036183338b02faab1736cc90b6e6'),
      guidelines: z.literal('0c358e06d3e68dedb96c85be73392783a2f639a581870b4d239fa33a7e544afb'),
    }).strict(),
    declared_module_sha256: sha().nullable(), declared_module_sha256_verified: z.literal(false),
    module_sha256_reason: z.literal('Pure core does not read its module file. Whole-source SHA is caller-declared; use a separate signed source manifest and review.'),
  }).strict(),
  bindings: z.object({ gold: byteBinding(INTAKE_STDIO_LIMITS.goldBytes), intake: byteBinding(INTAKE_STDIO_LIMITS.intakeBytes),
    inventory: byteBinding(INTAKE_STDIO_LIMITS.evidenceInventoryBytes), settings: byteBinding(INTAKE_STDIO_LIMITS.intakeSettingsBytes) }).strict(),
  expected_gold_raw_sha256: sha(), raw_gold_byte_binding_verified: z.literal(true), packet_sha256: sha(),
  packet_binding_basis: z.literal(PACKET_BASIS),
  settings: z.object({ schema: z.literal('canli.filing-facts-expert-settings.v1'), packet_sha256: sha(), required_uses: useList().min(1),
    prepared_on: text(10), implementation_source_sha256: sha().nullable() }).strict(),
  prepared_on_authenticated: z.literal(false), limits: z.object(Object.fromEntries(Object.entries(EXPERT_INTAKE_LIMITS).map(([key, value]) => [key, z.literal(value)]))).strict(),
  review_packets: z.array(z.object({ role: z.enum(['reviewer_a', 'reviewer_b']), declared_handle: z.string().nullable(),
    assignment_status: z.enum(['declared_unverified', 'missing_role_declaration']), packet: reviewPacket }).strict()).length(2),
  role_worklists: z.array(roleWorklist).length(3), source_worklists: z.array(sourceWorklist).min(1).max(128),
  adjudication: z.object({ declared_handle: z.string().nullable(),
    blank_submission: z.object({ schema: z.literal('canli.filing-facts-adjudication.v1'), adjudicator: z.string(), packet_sha256: sha(), decisions: z.array(z.never()).length(0) }).strict(),
    item_tasks: z.array(z.object({ id: text(), source_ids: z.array(sha()).min(1).max(16),
      required_review_roles: z.tuple([z.literal('reviewer_a'), z.literal('reviewer_b')]),
      status: z.literal('awaiting_independent_complete_submissions'), verified_submissions: z.null(), task: z.literal(ITEM_TASK) }).strict()).min(1).max(128),
  }).strict(),
  evidence_inventory: z.array(inventoryEntry).max(INTAKE_STDIO_LIMITS.evidenceCount),
  coverage: z.object({ selected_n: z.number().int().positive().max(128), prepared_items_per_review_role: z.number().int().positive().max(128),
    prepared_item_assignments: z.number().int().positive().max(256), required_roles_n: z.literal(3), declared_roles_n: z.number().int().nonnegative().max(3),
    missing_roles: z.array(z.enum(['reviewer_a', 'reviewer_b', 'adjudicator'])).max(3), distinct_sources_n: z.number().int().positive().max(128),
    sources_declared_n: z.number().int().nonnegative().max(128), sources_missing_declaration_n: z.number().int().nonnegative().max(128),
    evidence_provided_n: z.number().int().nonnegative().max(64), evidence_missing_ids: z.array(z.string()), evidence_unreferenced_ids: z.array(z.string()),
    prepared_completed_review_pairs_n: z.literal(0), denominator: z.literal(DENOMINATOR),
  }).strict(),
  established: z.object({ authenticated_humans_n: z.null(), verified_experts_n: z.null(), verified_independent_reviewers_n: z.null(),
    verified_source_rights_n: z.null(), verified_source_completeness: z.null(), expert_labelled_items_n: z.null(),
    admitted_for_human_review: z.null(), admitted_for_release: z.null(), expert_agreement: z.null(), expert_adjudication: z.null(),
  }).strict(),
  interpretation: z.string(), content_hash: z.string().length(71).regex(/^sha256:[a-f0-9]{64}$/),
}).strict();
const INPUT_SCHEMA = z.toJSONSchema(INTAKE_TOOL_INPUT);
const OUTPUT_SCHEMA = z.toJSONSchema(INTAKE_TOOL_OUTPUT);
export const INTAKE_TOOL = Object.freeze({
  name: 'filingfacts_prepare_expert_intake',
  title: 'Prepare supplied expert-review intake',
  description: 'Prepare two blank same-gold reviewer packets and a distinct adjudicator worklist from six exact supplied-byte inputs. Returns the complete preparation report and every selected item. Byte consistency is separate from authenticated humans, expertise, independence, rights, labels and admission. Offline opt-in command; no fetching, recruitment, dispatch or decisions.',
  inputSchema: INPUT_SCHEMA, outputSchema: OUTPUT_SCHEMA,
  annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }),
});

export class IntakeStdioError extends Error {
  constructor(code) { super('Expert intake stdio refused (' + code + ').'); this.name = 'IntakeStdioError'; this.code = code; }
}
function refuse(code) { throw new IntakeStdioError(code); }
const nativeClock = () => performance.now();
const nativeDecode = text => Buffer.from(text, 'base64');
const nativeSerialize = value => JSON.stringify(value);

/** One sticky absolute clock. Internal test injection is never a wire field. */
export function createWorkScope({ clock = nativeClock, signal, startedAt } = {}) {
  const started = startedAt === undefined ? clock() : startedAt;
  let previous = started; let failure = null; let closed = false; let exited = false;
  const listeners = new Set(); const signals = new Set(); const abortListeners = new Map();
  function fail(code) {
    if (failure === null) {
      failure = code;
      for (const listener of [...listeners]) {
        // Failure observers are terminal bookkeeping, never orphan rejections.
        try { listener(new IntakeStdioError(failure)); } catch {}
      }
    }
  }
  function observe() {
    const now = clock();
    if (!Number.isFinite(now) || !Number.isFinite(started) || now < previous) fail('CLOCK');
    previous = now;
    if (closed) fail('CLOSED');
    if (exited) fail('EXITED');
    if ([...signals].some(value => value.aborted)) fail('ABORTED');
    if (now - started >= INTAKE_STDIO_LIMITS.workMs) fail('DEADLINE');
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
    remaining() { return Math.max(0, started + INTAKE_STDIO_LIMITS.workMs - observe()); },
    onFailure(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { for (const [value, listener] of abortListeners) value.removeEventListener('abort', listener); abortListeners.clear(); signals.clear(); },
    get failure() { return failure; },
  };
}

/** Own both original Promise outcomes before any fallible owner observation. */
export function observeOriginalPromise(original, { resolved = () => {}, rejected = () => {} } = {}) {
  if (!types.isPromise(original)) refuse('PROMISE');
  Promise.prototype.then.call(original,
    value => { try { resolved(value); } catch {} },
    error => { try { rejected(error); } catch {} });
  return original;
}
export function startOwnedPromise(start, scope, observers = {}) {
  scope.observe();
  const original = start();
  observeOriginalPromise(original, observers);
  scope.observe();
  return original;
}
export function runObservedTask(callback, scope) {
  scope.observe();
  const value = callback();
  if (types.isPromise(value)) observeOriginalPromise(value);
  scope.observe();
  if (!types.isPromise(value)) return value;
  const observed = Promise.prototype.then.call(value, result => { scope.observe(); return result; }, error => { scope.observe(); throw error; });
  observeOriginalPromise(observed);
  return observed;
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
/** Called on the ORIGINAL raw request, before locked SDK object/record codecs. */
export function admitOriginalCall(params, observe = () => {}) {
  observe();
  if (!params || types.isProxy(params) || typeof params !== 'object' || Array.isArray(params) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(params))) refuse('ARGUMENTS');
  const rows = Object.getOwnPropertyDescriptors(params); const keys = Reflect.ownKeys(rows);
  if (keys.length !== 2 || keys.some(key => !['name', 'arguments'].includes(key))) refuse('ARGUMENTS');
  for (const key of ['name', 'arguments']) {
    if (!rows[key] || !Object.hasOwn(rows[key], 'value') || !rows[key].enumerable) refuse('ARGUMENTS');
  }
  if (typeof rows.name.value !== 'string' || rows.name.value.length > 128) refuse('ARGUMENTS');
  argumentsRecord(rows.arguments.value);
  observe();
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
  if (value === '') refuse('EMPTY_INPUT');
  const match = /^[A-Za-z0-9+/]+={0,2}$/.exec(value);
  if (value.length % 4 !== 0 || !match || match[0].length !== value.length) refuse('BASE64');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const last = ALPHABET.indexOf(value[value.length - padding - 1]);
  if ((padding === 2 && (last & 15) !== 0) || (padding === 1 && (last & 3) !== 0)) refuse('BASE64');
  const bytes = value.length / 4 * 3 - padding;
  if (bytes > maximum) refuse('INPUT_BOUND');
  return bytes;
}
/** All types, counts and canonical lengths are admitted before the FIRST decode. */
export function captureIntakeArguments(value, { decode = nativeDecode, observe = () => {} } = {}) {
  observe(); const args = argumentsRecord(value);
  const evidenceTokens = denseArray(args.evidence_base64, INTAKE_STDIO_LIMITS.evidenceCount);
  const singles = [
    ['gold_base64', INTAKE_STDIO_LIMITS.goldBytes], ['intake_base64', INTAKE_STDIO_LIMITS.intakeBytes],
    ['evidence_inventory_base64', INTAKE_STDIO_LIMITS.evidenceInventoryBytes], ['intake_settings_base64', INTAKE_STDIO_LIMITS.intakeSettingsBytes],
  ];
  const rows = singles.map(([key, cap]) => ({ text: args[key], bytes: base64Length(args[key], cap) }));
  const evidence = evidenceTokens.map(text => ({ text, bytes: base64Length(text, INTAKE_STDIO_LIMITS.evidenceBytes) }));
  const evidenceBytes = evidence.reduce((sum, row) => sum + row.bytes, 0);
  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0) + evidenceBytes;
  if (evidenceBytes > INTAKE_STDIO_LIMITS.evidenceTotalBytes) refuse('EVIDENCE_TOTAL_BOUND');
  if (totalBytes > INTAKE_STDIO_LIMITS.totalInputBytes) refuse('TOTAL_INPUT_BOUND');
  // Validation uses the captured descriptor values, never reads caller fields again.
  const admitted = { ...args, evidence_base64: evidenceTokens };
  if (!INTAKE_TOOL_INPUT.safeParse(admitted).success) refuse('ARGUMENTS');
  observe();
  function owned(row) {
    observe(); const buffer = decode(row.text);
    if (!Buffer.isBuffer(buffer) || Object.getPrototypeOf(buffer) !== Buffer.prototype || types.isSharedArrayBuffer(buffer.buffer)) refuse('DECODE');
    if (buffer.length !== row.bytes || buffer.toString('base64') !== row.text) refuse('DECODE');
    observe(); return buffer;
  }
  const buffers = rows.map(owned); const evidenceBuffers = evidence.map(owned); observe();
  return { totalBytes, kernelArguments: [buffers[0], args.expected_gold_raw_sha256, buffers[1], buffers[2], evidenceBuffers, buffers[3]],
    originalBase64: Object.freeze(rows.map(row => row.text)), originalEvidenceBase64: Object.freeze(evidence.map(row => row.text)),
    expectedGoldRawSha256: args.expected_gold_raw_sha256 };
}

function toolResult(report, text, isError = false) {
  return { resultType: 'complete', content: [{ type: 'text', text }], ...(report ? { structuredContent: report } : {}), ...(isError ? { isError: true } : {}) };
}
function safePublicTree(value, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 100000 || depth > 64) refuse('OUTPUT_SCHEMA');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) refuse('OUTPUT_SCHEMA'); return; }
  if (!value || typeof value !== 'object' || types.isProxy(value)) refuse('OUTPUT_SCHEMA');
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) &&
      !(Object.getPrototypeOf(value) === null && !array)) refuse('OUTPUT_SCHEMA');
  const rows = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(rows)) {
    if (array && key === 'length') continue;
    const row = rows[key];
    if (typeof key !== 'string' || !Object.hasOwn(row, 'value') || !row.enumerable) refuse('OUTPUT_SCHEMA');
    safePublicTree(row.value, depth + 1, budget);
  }
}
function validateCompleteReport(report, captured, scope) {
  scope.observe(); safePublicTree(report); scope.observe();
  if (!INTAKE_TOOL_OUTPUT.safeParse(report).success) refuse('OUTPUT_SCHEMA');
  scope.observe();
  const inputs = captured.kernelArguments;
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  function same(actual, expected) {
    scope.observe(); const left = canonicalJson(actual); scope.observe();
    const right = canonicalJson(expected); scope.observe();
    if (left !== right) refuse('OUTPUT_BINDING');
  }
  const binding = buffer => ({ bytes: buffer.length, sha256: digest(buffer), original_base64: buffer.toString('base64') });
  const documents = {};
  for (const [position, [name, index]] of [['gold', 0], ['intake', 2], ['inventory', 3], ['settings', 5]].entries()) {
    scope.observe(); const buffer = inputs[index]; const bound = binding(buffer); scope.observe();
    if (bound.original_base64 !== captured.originalBase64[position]) refuse('OUTPUT_BINDING');
    same(report.bindings[name], bound);
    scope.observe(); const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer); scope.observe();
    documents[name] = JSON.parse(decoded); scope.observe();
  }
  if (inputs[1] !== captured.expectedGoldRawSha256 || report.expected_gold_raw_sha256 !== captured.expectedGoldRawSha256 ||
      report.bindings.gold.sha256 !== captured.expectedGoldRawSha256) refuse('OUTPUT_BINDING');
  const { gold, intake, inventory, settings } = documents;
  const n = gold.labels.length;
  same(report.settings, settings); same(report.limits, EXPERT_INTAKE_LIMITS);
  if (report.packet_sha256 !== settings.packet_sha256 || report.packet_sha256 !== intake.packet_sha256 ||
      (Object.hasOwn(gold, 'packet_sha256') && gold.packet_sha256 !== report.packet_sha256) ||
      report.implementation.declared_module_sha256 !== settings.implementation_source_sha256) refuse('OUTPUT_BINDING');

  // These checks admit relationships in the ONE returned report. They never run
  // the preparation kernel again, return a repaired report, or authenticate code.
  const roles = new Map(intake.roles.map(row => [row.role, row]));
  const declarations = new Map(intake.sources.map(row => [row.source_id, row]));
  const sources = new Map();
  for (const label of gold.labels) {
    scope.observe();
    for (const url of label.filings) {
      const id = digest(Buffer.from(url, 'utf8'));
      if (!sources.has(id)) sources.set(id, { source_id: id, url, item_ids: [] });
      if (sources.get(id).url !== url) refuse('OUTPUT_BINDING');
      sources.get(id).item_ids.push(label.id);
    }
  }
  if (inventory.evidence.length !== inputs[4].length || inputs[4].length !== captured.originalEvidenceBase64.length ||
      report.evidence_inventory.length !== inventory.evidence.length) refuse('OUTPUT_BINDING');
  const entries = new Map();
  for (const [index, entry] of inventory.evidence.entries()) {
    scope.observe(); const bound = binding(inputs[4][index]); scope.observe();
    if (bound.original_base64 !== captured.originalEvidenceBase64[index] || entry.expected_bytes !== bound.bytes ||
        entry.expected_sha256 !== bound.sha256 || entry.packet_sha256 !== report.packet_sha256 || entries.has(entry.id)) refuse('OUTPUT_BINDING');
    entries.set(entry.id, { ...entry, binding: bound, byte_binding_verified: true, document_authenticity: null });
  }
  const used = new Set(); const missing = new Set();
  function references(actual, ids, purpose, subject) {
    const provided = []; const absent = [];
    for (const id of ids) {
      scope.observe(); const entry = entries.get(id);
      if (!entry) { absent.push(id); missing.add(id); continue; }
      if (entry.purpose !== purpose) refuse('OUTPUT_BINDING');
      same(entry.subject, subject); used.add(id);
      provided.push({ id, bytes: entry.binding.bytes, sha256: entry.binding.sha256 });
    }
    same(actual, { declared_ids: ids, provided, missing_ids: absent, authenticity_verified: null });
  }
  for (const [index, name] of ROLES.entries()) {
    scope.observe(); const declaration = roles.get(name); const row = report.role_worklists[index];
    same(row.declaration, declaration ?? null);
    if (row.role !== name || row.declared_handle !== (declaration?.handle ?? null) ||
        row.status !== (declaration ? 'declared_unverified' : 'missing_role_declaration')) refuse('OUTPUT_BINDING');
    same(row.tasks, [...ROLE_TASKS, name === 'adjudicator' ? ADJUDICATOR_TASK : REVIEW_TASK]);
    if (!declaration) {
      same(row.identity_evidence, null); same(row.independence_evidence, null); same(row.qualifications, []); same(row.conflicts, null);
    } else {
      const subject = { role: name, handle: declaration.handle };
      references(row.identity_evidence, declaration.identity_evidence_ids, 'identity', subject);
      references(row.independence_evidence, declaration.independence_evidence_ids, 'independence', subject);
      if (row.qualifications.length !== declaration.qualifications.length) refuse('OUTPUT_BINDING');
      for (const [position, qualification] of declaration.qualifications.entries()) {
        const actual = row.qualifications[position]; const target = { ...subject, qualification_id: qualification.id };
        same(actual.declaration, qualification);
        references(actual.evidence, qualification.evidence_ids, 'qualification', target);
        if (qualification.verification === null) same(actual.declared_verification_evidence, null);
        else references(actual.declared_verification_evidence, qualification.verification.evidence_ids, 'qualification', target);
      }
      if (declaration.conflicts === null) same(row.conflicts, null);
      else {
        if (!row.conflicts || row.conflicts.length !== declaration.conflicts.length) refuse('OUTPUT_BINDING');
        for (const [position, conflict] of declaration.conflicts.entries()) {
          same(row.conflicts[position].declaration, conflict);
          references(row.conflicts[position].evidence, conflict.evidence_ids, 'conflict', { ...subject, conflict_id: conflict.id });
        }
      }
    }
    if (index < 2) {
      const packet = report.review_packets[index];
      if (packet.role !== name || packet.declared_handle !== (declaration?.handle ?? null) ||
          packet.assignment_status !== (declaration ? 'declared_unverified' : 'missing_role_declaration')) refuse('OUTPUT_BINDING');
      same(packet.packet, { ...gold, annotator: declaration?.handle ?? '', packet_sha256: report.packet_sha256 });
    }
  }
  if (report.source_worklists.length !== sources.size) refuse('OUTPUT_BINDING');
  for (const [index, source] of [...sources.values()].entries()) {
    scope.observe(); const row = report.source_worklists[index]; const declaration = declarations.get(source.source_id);
    if (row.source_id !== source.source_id || row.url !== source.url || row.declaration_present !== Boolean(declaration)) refuse('OUTPUT_BINDING');
    same(row.item_ids, source.item_ids); same(row.required_uses, settings.required_uses);
    const claims = declaration?.claims ?? [];
    if (row.claims.length !== claims.length) refuse('OUTPUT_BINDING');
    const allowed = new Set(); const denied = new Set();
    for (const [position, claim] of claims.entries()) {
      const actual = row.claims[position]; const subject = { source_id: source.source_id, url: source.url };
      same(actual.declaration, claim);
      references(actual.evidence, claim.evidence_ids, 'source_rights', subject);
      if (claim.verification === null) same(actual.declared_verification_evidence, null);
      else references(actual.declared_verification_evidence, claim.verification.evidence_ids, 'source_rights', subject);
      for (const use of claim.allowed_uses ?? []) allowed.add(use);
      for (const use of claim.denied_uses ?? []) denied.add(use);
    }
    same(row.mechanical_flags, {
      missing_declaration: !declaration,
      unknown_use_scope: !claims.length || claims.some(claim => claim.allowed_uses === null || claim.denied_uses === null),
      missing_declared_evidence: !claims.length || row.claims.some(claim => !claim.evidence.provided.length || claim.evidence.missing_ids.length || (claim.declared_verification_evidence?.missing_ids.length ?? 0)),
      contradictory_use_claims: USES.filter(use => allowed.has(use) && denied.has(use)),
      uncovered_required_uses: settings.required_uses.filter(use => !allowed.has(use)),
      restricted_required_uses: settings.required_uses.filter(use => denied.has(use)),
    });
  }
  const adjudicator = roles.get('adjudicator')?.handle ?? null;
  if (report.adjudication.declared_handle !== adjudicator) refuse('OUTPUT_BINDING');
  same(report.adjudication.blank_submission, { schema: 'canli.filing-facts-adjudication.v1', adjudicator: adjudicator ?? '', packet_sha256: report.packet_sha256, decisions: [] });
  same(report.adjudication.item_tasks, gold.labels.map(label => ({ id: label.id, source_ids: label.filings.map(url => digest(Buffer.from(url, 'utf8'))),
    required_review_roles: ['reviewer_a', 'reviewer_b'], status: 'awaiting_independent_complete_submissions', verified_submissions: null, task: ITEM_TASK })));
  same(report.evidence_inventory, [...entries.values()].map(entry => ({ ...entry, referenced: used.has(entry.id) })));
  same(report.coverage, {
    selected_n: n, prepared_items_per_review_role: n, prepared_item_assignments: 2 * n, required_roles_n: 3, declared_roles_n: roles.size,
    missing_roles: ROLES.filter(name => !roles.has(name)), distinct_sources_n: sources.size, sources_declared_n: declarations.size,
    sources_missing_declaration_n: [...sources.keys()].filter(id => !declarations.has(id)).length,
    evidence_provided_n: entries.size, evidence_missing_ids: [...missing].sort(), evidence_unreferenced_ids: [...entries.keys()].filter(id => !used.has(id)),
    prepared_completed_review_pairs_n: 0, denominator: DENOMINATOR,
  });
}
export function intakeRefusal(code) {
  const stable = typeof code === 'string' && code.length <= 64 && /^[A-Z0-9_]+$/.test(code) ? code : 'INTERNAL';
  const data = { schema: 'canli.expert-intake-stdio-refusal.v1', status: 'refused', error: {
    code: stable, message: 'Expert intake preparation refused (' + stable + ').',
    next_step: 'Supply a complete corrected bounded batch using the packaged EXPERT_INTAKE_STDIO.md contract. No input is echoed.',
  } };
  const result = toolResult(null, JSON.stringify(data), true);
  if (Buffer.byteLength(JSON.stringify(result)) > INTAKE_STDIO_LIMITS.refusalBytes) refuse('REFUSAL_BOUND');
  return result;
}
export function executeExpertIntake(value, { kernel = prepareExpertIntake, decode = nativeDecode, scope = createWorkScope() } = {}) {
  try {
    scope.observe();
    const captured = captureIntakeArguments(value, { decode, observe: scope.observe });
    const report = runObservedTask(() => kernel(...captured.kernelArguments), scope);
    // The delivered preparation kernel is synchronous. A foreign async result
    // is refused, but both of its original outcomes are already owned.
    if (types.isPromise(report)) refuse('OUTPUT_SCHEMA');
    validateCompleteReport(report, captured, scope); scope.observe();
    const text = JSON.stringify(report); scope.observe();
    if (Buffer.byteLength(text) > INTAKE_STDIO_LIMITS.reportBytes) refuse('REPORT_BOUND');
    if (report.content_hash !== contentHash(report, createHash)) refuse('CONTENT_HASH');
    const publicReport = JSON.parse(text); scope.observe();
    if (canonicalJson(report) !== canonicalJson(publicReport)) refuse('PUBLIC_JSON');
    const response = toolResult(publicReport, text);
    if (Buffer.byteLength(JSON.stringify(response)) > INTAKE_STDIO_LIMITS.toolResultBytes) refuse('TOOL_RESULT_BOUND');
    scope.observe(); return response;
  } catch (error) {
    // Late/aborted work stays sticky; transport final admission then closes without a success.
    if (error instanceof IntakeStdioError) return intakeRefusal(error.code);
    if (error instanceof ExpertIntakeError) return intakeRefusal('CORE_' + error.code);
    return intakeRefusal('INTERNAL');
  }
}

function validId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (typeof value !== 'string' || Buffer.byteLength(value) > INTAKE_STDIO_LIMITS.stringIdBytes) return false;
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
export class IntakeFrameBuffer {
  constructor(onMessage = () => {}, { clock = nativeClock } = {}) {
    this.buffer = Buffer.alloc(0); this.onMessage = onMessage; this.clock = clock; this.scope = null;
  }
  append(chunk) {
    if (!Buffer.isBuffer(chunk) || Object.getPrototypeOf(chunk) !== Buffer.prototype || types.isSharedArrayBuffer(chunk.buffer)) refuse('FRAME_BYTES');
    if (!this.scope) this.scope = createWorkScope({ clock: this.clock });
    this.scope.observe();
    if (this.buffer.length + chunk.length > INTAKE_STDIO_LIMITS.requestFrameBytes) { this.clear(); refuse('FRAME_INPUT_BOUND'); }
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
    this.scope.observe();
  }
  readMessage() {
    const index = this.buffer.indexOf(10); if (index < 0) return null;
    const scope = this.scope; scope.observe();
    const line = this.buffer.subarray(0, index); this.buffer = this.buffer.subarray(index + 1);
    let message;
    try { message = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(line)); }
    catch { this.clear(); refuse('FRAME_PARSE'); }
    scope.observe();
    if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_./-]{0,127}$/.test(message.method) ||
      Object.keys(message).some(key => !['jsonrpc', 'id', 'method', 'params'].includes(key)) ||
      (Object.hasOwn(message, 'id') && !validId(message.id)) ||
      (Object.hasOwn(message, 'params') && (!message.params || Array.isArray(message.params) || typeof message.params !== 'object'))) {
      this.clear(); refuse('FRAME_SHAPE');
    }
    this.onMessage(message, scope); scope.observe();
    // A second frame already captured in the same chunk retains that capture epoch.
    this.scope = this.buffer.length ? createWorkScope({ clock: this.clock, startedAt: scope.started }) : null;
    return message;
  }
  finish() { if (this.buffer.length) { this.clear(); refuse('FRAME_UNTERMINATED'); } }
  clear() { this.buffer = Buffer.alloc(0); this.scope?.dispose(); this.scope = null; }
}

/** SAME sender used by production and native fixtures. One captured write, no retry. */
export function createIntakeNativeWriter(output, { serialize = nativeSerialize, frameBytes = INTAKE_STDIO_LIMITS.responseFrameBytes } = {}) {
  if (!Number.isSafeInteger(frameBytes) || frameBytes < 1 || frameBytes > INTAKE_STDIO_LIMITS.responseFrameBytes) refuse('FRAME_POLICY');
  const nativeWrite = output.write.bind(output);
  return {
    send(message, scope, { tool = false } = {}) {
      try {
        scope.observe();
        if (Object.hasOwn(message, 'id') && !validId(message.id)) refuse('FRAME_ID');
        // Bound the actual duplicated/escaped tool object as well as its whole envelope.
        if (tool && Buffer.byteLength(serialize(message.result)) > INTAKE_STDIO_LIMITS.toolResultBytes) refuse('TOOL_RESULT_BOUND');
        const json = serialize(message);
        if (typeof json !== 'string') refuse('SERIALIZE');
        const frame = json + '\n';
        if (Buffer.byteLength(frame) > frameBytes) refuse('FRAME_OUTPUT_BOUND');
        const encodedFrame = Buffer.from(frame, 'utf8');
        return new Promise((resolve, reject) => {
          let settled = false; let timer; let removeFailure = () => {};
          let writeReturned = false; let drainPending = false;
          const clean = () => {
            let failed = false;
            for (const [event, listener] of [['error', onError], ['close', onClose], ['drain', onDrain]]) {
              try { output.off(event, listener); } catch { failed = true; }
            }
            clearTimeout(timer);
            try { removeFailure(); } catch { failed = true; }
            return failed;
          };
          const finish = error => {
            if (settled) return;
            settled = true;
            if (clean()) { scope.fail('LISTENER'); error ??= new IntakeStdioError(scope.failure); }
            if (error) reject(error); else resolve();
          };
          const onError = () => { scope.fail('WRITE'); finish(new IntakeStdioError('WRITE')); };
          const onClose = () => { scope.close(); finish(new IntakeStdioError('CLOSED')); };
          const onDrain = () => {
            if (!writeReturned) { drainPending = true; return; }
            try { scope.observe(); finish(); } catch (error) { finish(error); }
          };
          try {
            removeFailure = scope.onFailure(finish);
            output.once('error', onError); output.once('close', onClose); output.once('drain', onDrain);
            timer = setTimeout(() => { scope.fail('DEADLINE'); finish(new IntakeStdioError('DEADLINE')); }, scope.remaining());
            // Exact serialized bytes, encoded cap and event setup are complete.
            // No callback, await or second serialization occurs between this check and write.
            scope.observe();
            const accepted = nativeWrite(encodedFrame);
            writeReturned = true;
            scope.observe();
            if (settled) return;
            if (typeof accepted !== 'boolean') refuse('WRITE');
            if (accepted) finish();
            else if (drainPending) onDrain();
          } catch (error) { scope.fail(error instanceof IntakeStdioError ? error.code : 'WRITE'); finish(new IntakeStdioError(scope.failure)); }
        });
      } catch (error) {
        scope.fail(error instanceof IntakeStdioError ? error.code : 'SERIALIZE');
        return Promise.reject(new IntakeStdioError(scope.failure));
      }
    },
  };
}

/** Captured constant diagnostics: never SDK exception text, input, paths or stacks. */
export function createIntakeDiagnostics(output, overflow = () => {}) {
  const write = output.write.bind(output); let bytes = 0; let failed = false;
  return {
    emit() {
      if (failed) return false;
      const text = 'Expert intake stdio refused (TRANSPORT).\n'; const size = Buffer.byteLength(text);
      if (bytes + size > INTAKE_STDIO_LIMITS.stderrBytes) { failed = true; overflow(); return false; }
      bytes += size;
      try { write(text); return true; } catch { failed = true; overflow(); return false; }
    },
    get bytes() { return bytes; }, get failed() { return failed; },
  };
}

export class ExpertIntakeTransport extends StdioServerTransport {
  constructor(input, output, { clock = nativeClock, serialize = nativeSerialize, diagnostic = () => {} } = {}) {
    super(input, output, { maxBufferSize: INTAKE_STDIO_LIMITS.requestFrameBytes });
    this.clock = clock; this.diagnostic = diagnostic; this.scopes = new Map(); this.responses = new Set();
    this.writer = createIntakeNativeWriter(output, { serialize });
    this._readBuffer = new IntakeFrameBuffer((message, scope) => this.accept(message, scope), { clock });
    this._onstdinclose = () => {
      try { this._readBuffer.finish(); } catch { this.diagnostic(); }
      void this.close().catch(() => {});
    };
    this.onerror = () => { this.diagnostic(); void this.close().catch(() => {}); };
  }
  start() {
    const scope = createWorkScope({ clock: this.clock });
    return startOwnedPromise(() => super.start(), scope, {
      resolved: () => { try { scope.observe(); } catch { this.diagnostic(); void this.close().catch(() => {}); } },
      rejected: () => { this.diagnostic(); void this.close().catch(() => {}); },
    });
  }
  accept(message, originalScope) {
    if (Object.hasOwn(message, 'id')) {
      if (this._closed || this.scopes.has(message.id) || this.scopes.size >= INTAKE_STDIO_LIMITS.pendingRequests) refuse('FRAME_PENDING');
      this.scopes.set(message.id, { scope: originalScope ?? createWorkScope({ clock: this.clock }), method: message.method });
    } else if (message.method === 'notifications/cancelled') {
      this.scopes.get(message.params?.requestId)?.scope.fail('ABORTED');
    }
    if (message.method === 'tools/call') {
      // The locked SDK projects params and drops record keys such as __proto__.
      // Admit original keys on the same request clock before that projection.
      const scope = this.scopes.get(message.id)?.scope;
      if (!scope) refuse('FRAME_REQUEST');
      admitOriginalCall(message.params, scope.observe);
    }
  }
  scopeFor(id, signal) {
    const row = this.scopes.get(id);
    if (!row) refuse('FRAME_REQUEST');
    row.scope.bindSignal(signal); return row.scope;
  }
  send(message) {
    if (this._closed || !Object.hasOwn(message, 'id')) return Promise.reject(new IntakeStdioError('CLOSED'));
    const row = this.scopes.get(message.id);
    if (!row || this.responses.has(message.id)) return Promise.reject(new IntakeStdioError('FRAME_RESPONSE'));
    this.responses.add(message.id);
    // SDK schema failures sometimes contain caller strings; replace the entire error.
    const safe = Object.hasOwn(message, 'error') ? {
      jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Expert intake protocol refused.' },
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
      observeOriginalPromise(this.closing);
      try {
        for (const { scope } of this.scopes.values()) { scope.close(); scope.dispose(); }
        this.scopes.clear(); this.responses.clear();
        const original = Promise.resolve(super.close()); observeOriginalPromise(original);
        original.then(() => {
          try { this._stdin.destroy(); complete(); }
          catch { failed(new IntakeStdioError('CLOSE')); }
        }, () => failed(new IntakeStdioError('CLOSE')));
      } catch { failed(new IntakeStdioError('CLOSE')); }
    }
    return this.closing;
  }
}

export function createExpertIntakeEndpoint({ input = process.stdin, output = process.stdout, stderr = process.stderr,
  clock = nativeClock, serialize = nativeSerialize, kernel = prepareExpertIntake, decode = nativeDecode } = {}) {
  let transport;
  const diagnostics = createIntakeDiagnostics(stderr, () => { void transport?.close().catch(() => {}); });
  transport = new ExpertIntakeTransport(input, output, { clock, serialize, diagnostic: () => diagnostics.emit() });
  const server = new Server({ name: 'canli-expert-intake-stdio-example', version: '0.0.0', title: 'Packaged expert-intake preparation' }, {
    capabilities: { tools: { listChanged: false } },
    instructions: 'Opt-in Unreleased supplied-byte preparation. Complete blank packets and worklists establish no authenticated humans, rights, expertise, independence, labels or admission. No provider, recruitment, dispatch, decisions or fetching.',
    inputRequired: { legacyShim: false },
  });
  server.setRequestHandler('tools/list', () => ({ resultType: 'complete', tools: [INTAKE_TOOL] }));
  server.setRequestHandler('tools/call', (request, ctx) => {
    const scope = transport.scopeFor(ctx.mcpReq.id, ctx.mcpReq.signal); scope.observe();
    const params = request.params;
    const valid = params && Object.keys(params).length === 2 && Object.hasOwn(params, 'name') && Object.hasOwn(params, 'arguments');
    const result = runObservedTask(() => !valid ? intakeRefusal('ARGUMENTS') : params.name !== INTAKE_TOOL.name ? intakeRefusal('TOOL_NAME')
      : executeExpertIntake(params.arguments, { kernel, decode, scope }), scope);
    scope.observe();
    const projected = server.projectCallToolResult(result, OUTPUT_SCHEMA); scope.observe();
    if (!result.isError && (!projected.structuredContent || canonicalJson(projected.structuredContent) !== canonicalJson(result.structuredContent) ||
        projected.content?.length !== 1 || projected.content[0]?.text !== result.content[0].text)) refuse('OUTPUT_PROJECTION');
    if (Buffer.byteLength(JSON.stringify(projected)) > INTAKE_STDIO_LIMITS.toolResultBytes) refuse('TOOL_RESULT_BOUND');
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
    const { server, transport } = createExpertIntakeEndpoint();
    await server.connect(transport);
  } catch {
    process.stderr.write('Expert intake stdio refused (STARTUP).\n');
    process.exitCode = 1;
  }
}
