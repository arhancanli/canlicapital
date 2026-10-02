import { createHash } from 'node:crypto';
import { TextDecoder, types } from 'node:util';
import { canonicalJson, pythonNumber, pythonString } from '../../canonical-json.mjs';
import { packetContent } from '../../../js/filing-facts-packet.js';
import { prepareExpertIntake, ExpertIntakeError, EXPERT_INTAKE_LIMITS } from './expert-intake.mjs';
import { agreement, cohensKappa, identity, indexPacket, missingJudgements, packetDigest } from './agreement.mjs';

// Pure supplied-byte reconciliation. No dispatch, admission, labels or document authentication.
export const EXPERT_SUBMISSION_LIMITS = Object.freeze({
  submissionBytes: 2 * 1024 * 1024, inventoryBytes: 16 * 1024, settingsBytes: 4096,
  totalInputBytes: 4 * 1024 * 1024, reportBytes: 6 * 1024 * 1024, submissions: 2,
  depth: 16, nodes: 32768, arrayRows: 256, stringUnits: 4096, numberUnits: 128,
});
export const EXPERT_SUBMISSION_INVENTORY_SCHEMA = 'canli.filing-facts-expert-submission-inventory.v1';
export const EXPERT_SUBMISSION_SETTINGS_SCHEMA = 'canli.filing-facts-expert-submission-settings.v1';
export const EXPERT_SUBMISSION_REPORT_SCHEMA = 'canli.filing-facts-expert-submission-audit.v1';
const ROLES = Object.freeze(['reviewer_a', 'reviewer_b']);
const ITEM_FIELDS = Object.freeze(['id', 'template', 'company', 'question', 'answer', 'filings']);
const JUDGEMENTS = Object.freeze({ question_clear: Object.freeze(['yes', 'no']),
  answer_matches_filing: Object.freeze(['yes', 'no', 'cannot_find']), citation_correct: Object.freeze(['yes', 'no']) });
const DEPENDENCIES = Object.freeze({
  expert_intake: 'f37ed4663a78cf819331410205f28b0671966cfe1b3c73aa0b13a46bf19b0ab4',
  agreement: 'f461cb2b9e3b138d1135a7ff295c30cfb911036183338b02faab1736cc90b6e6',
  canonical_json: '881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b',
  packet_content: 'eb61ab2bf78d7047569c8cf92ea348dc5c3a9e6fe311c16a63361765b2e08bc8',
  browser_export_format: '077c8cd3d7c4c2ad8c69ce9dfa24c8b38f6c4ff3b17470cb4d2645396506bdd3',
});
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const lengthGetter = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength').get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer').get;
const typedSet = Uint8Array.prototype.set;
const functionSource = Function.prototype.toString;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export class ExpertSubmissionAuditError extends Error {
  constructor(code) { super(`Expert submission audit refused (${code}).`); this.name = 'ExpertSubmissionAuditError'; this.code = code; }
}
function refuse(code) { throw new ExpertSubmissionAuditError(code); }
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function sha(value) {
  if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) refuse('SHA'); return value;
}
function captureBytes(value, maximum, budget) {
  if (types.isProxy(value) || !types.isUint8Array(value)) refuse('INPUT_BYTES');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) refuse('INPUT_BYTES');
  if (types.isSharedArrayBuffer(bufferGetter.call(value))) refuse('SHARED_BYTES');
  const length = lengthGetter.call(value);
  if (length < 1 || length > maximum) refuse('BYTE_BOUND');
  if (budget.total + length > EXPERT_SUBMISSION_LIMITS.totalInputBytes) refuse('TOTAL_INPUT_BOUND');
  budget.total += length;
  const copy = Buffer.alloc(length); typedSet.call(copy, value); return copy;
}
function captureArray(value, maximum, byteMaximum, budget, code) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse(`${code}_ARRAY`);
  const descriptors = Object.getOwnPropertyDescriptors(value); const count = descriptors.length.value;
  if (count > maximum) refuse(`${code}_BOUND`);
  if (Reflect.ownKeys(descriptors).length !== count + 1) refuse(`${code}_ARRAY`);
  const copies = []; let total = 0;
  for (let index = 0; index < count; index++) {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) refuse(`${code}_ARRAY`);
    const copy = captureBytes(descriptor.value, byteMaximum, budget); total += copy.length; copies.push(copy);
  }
  return { copies, total };
}
function unicode(value) {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) refuse('UNICODE');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) refuse('UNICODE');
  }
  return value;
}
function decode(bytes) {
  try { return unicode(decoder.decode(bytes)); }
  catch (error) { if (error instanceof ExpertSubmissionAuditError) throw error; refuse('UTF8'); }
}
function decimalIdentity(token) {
  let value = token.toLowerCase();
  const sign = value.startsWith('-') ? '-' : '';
  if (sign) value = value.slice(1);
  const [mantissa, exponent = '0'] = value.split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const power = Number(exponent);
  if (!Number.isSafeInteger(power) || Math.abs(power) > 400) refuse('NUMBER_RANGE');
  let digits = (whole + fraction).replace(/^0+/, '');
  let scale = power - fraction.length;
  if (!digits) return '0';
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); scale++; }
  return `${sign}${digits}e${scale}`;
}
function parseJson(bytes) {
  const source = decode(bytes); let position = 0; let nodes = 0;
  const numeric = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const whitespace = () => { while (position < source.length && ' \t\r\n'.includes(source[position])) position++; };
  function string() {
    const start = position++;
    while (position < source.length) {
      const character = source[position++];
      if (position - start > EXPERT_SUBMISSION_LIMITS.stringUnits * 6 + 2) refuse('STRING_BOUND');
      if (character === '\\') { position++; continue; }
      if (character === '"') {
        let value;
        try { value = JSON.parse(source.slice(start, position)); } catch { refuse('JSON'); }
        if (value.length > EXPERT_SUBMISSION_LIMITS.stringUnits) refuse('STRING_BOUND');
        return unicode(value);
      }
    }
    refuse('JSON');
  }
  function value(depth) {
    if (depth > EXPERT_SUBMISSION_LIMITS.depth) refuse('DEPTH_BOUND');
    if (++nodes > EXPERT_SUBMISSION_LIMITS.nodes) refuse('NODE_BOUND');
    whitespace(); const character = source[position];
    if (character === '"') return string();
    if (character === '{') {
      position++; const result = Object.create(null); whitespace();
      if (source[position] === '}') { position++; return result; }
      while (position < source.length) {
        whitespace(); if (source[position] !== '"') refuse('JSON');
        const key = string(); if (Object.hasOwn(result, key)) refuse('DUPLICATE_KEY');
        whitespace(); if (source[position++] !== ':') refuse('JSON');
        result[key] = value(depth + 1); whitespace();
        const separator = source[position++];
        if (separator === '}') return result;
        if (separator !== ',') refuse('JSON');
      }
      refuse('JSON');
    }
    if (character === '[') {
      position++; const result = []; whitespace();
      if (source[position] === ']') { position++; return result; }
      while (position < source.length) {
        if (result.length >= EXPERT_SUBMISSION_LIMITS.arrayRows) refuse('ARRAY_BOUND');
        result.push(value(depth + 1)); whitespace();
        const separator = source[position++];
        if (separator === ']') return result;
        if (separator !== ',') refuse('JSON');
      }
      refuse('JSON');
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(token, position)) { position += token.length; return result; }
    }
    numeric.lastIndex = position; const match = numeric.exec(source);
    if (!match) refuse('JSON');
    position = numeric.lastIndex;
    if (match[0].length > EXPERT_SUBMISSION_LIMITS.numberUnits) refuse('NUMBER_BOUND');
    const result = Number(match[0]);
    if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER || Object.is(result, -0)) refuse('NUMBER_RANGE');
    if (decimalIdentity(match[0]) !== decimalIdentity(JSON.stringify(result))) refuse('NUMBER_PRECISION');
    return result;
  }
  const result = value(0); whitespace();
  if (position !== source.length) refuse('JSON');
  return result;
}
function fields(value, required, optional = []) {
  if (!value || Array.isArray(value) || typeof value !== 'object') refuse('FIELDS');
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) refuse('FIELDS');
  return value;
}
function text(value, maximum = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) refuse('TEXT');
  return value;
}

function auditSettings(value, packetSha) {
  fields(value, ['schema', 'packet_sha256', 'implementation_source_sha256']);
  if (value.schema !== EXPERT_SUBMISSION_SETTINGS_SCHEMA) refuse('SCHEMA');
  if (sha(value.packet_sha256) !== packetSha) refuse('PACKET_SHA');
  if (value.implementation_source_sha256 !== null) sha(value.implementation_source_sha256);
  return value;
}
function submissionInventory(value, copies, preparation) {
  fields(value, ['schema', 'packet_sha256', 'submissions']);
  if (value.schema !== EXPERT_SUBMISSION_INVENTORY_SCHEMA) refuse('SCHEMA');
  if (sha(value.packet_sha256) !== preparation.packet_sha256) refuse('PACKET_SHA');
  if (!Array.isArray(value.submissions) || value.submissions.length > EXPERT_SUBMISSION_LIMITS.submissions) refuse('SUBMISSION_BOUND');
  if (value.submissions.length !== copies.length) refuse('SUBMISSION_COUNT');
  const seen = new Set(); const result = new Map();
  for (const [index, row] of value.submissions.entries()) {
    fields(row, ['role', 'declared_handle', 'packet_sha256', 'expected_sha256', 'expected_bytes']);
    if (!ROLES.includes(row.role) || seen.has(row.role)) refuse('SUBMISSION_ROLE'); seen.add(row.role);
    const role = preparation.review_packets.find(entry => entry.role === row.role);
    text(row.declared_handle);
    if (role.declared_handle === null || row.declared_handle !== role.declared_handle) refuse('SUBMISSION_HANDLE');
    if (sha(row.packet_sha256) !== preparation.packet_sha256) refuse('PACKET_SHA');
    const binding = byteBinding(copies[index]);
    if (sha(row.expected_sha256) !== binding.sha256) refuse('SUBMISSION_SHA');
    if (!Number.isSafeInteger(row.expected_bytes) || row.expected_bytes < 1 || row.expected_bytes !== binding.bytes) refuse('SUBMISSION_LENGTH');
    const packet = returnedPacket(parseJson(copies[index]), role.packet, preparation.packet_sha256);
    result.set(row.role, { role: row.role, declared_handle: row.declared_handle, expected_sha256: row.expected_sha256,
      expected_bytes: row.expected_bytes, packet_sha256: row.packet_sha256, binding,
      raw_byte_binding_verified: true, author_authenticated: null, document_authenticity: null, packet });
  }
  return result;
}
function returnedPacket(value, prepared, packetSha) {
  fields(value, ['schema', 'guidelines', 'judgements', 'annotator', 'labels', 'packet_sha256']);
  if (value.schema !== prepared.schema || value.guidelines !== prepared.guidelines || canonicalJson(value.judgements) !== canonicalJson(JUDGEMENTS)) refuse('PACKET_IMMUTABLE');
  if (sha(value.packet_sha256) !== packetSha) refuse('PACKET_SHA');
  // The delivered browser export trims only the declared annotator; alias matching is not a substitute.
  if (typeof value.annotator !== 'string' || value.annotator !== prepared.annotator.trim()) refuse('SUBMISSION_HANDLE');
  if (!Array.isArray(value.labels) || value.labels.length !== prepared.labels.length) refuse('ITEM_DENOMINATOR');
  const gold = new Map(prepared.labels.map(label => [label.id, label])); const seen = new Set();
  for (const label of value.labels) {
    fields(label, [...ITEM_FIELDS, ...Object.keys(JUDGEMENTS), 'notes']);
    if (typeof label.id !== 'string' || seen.has(label.id)) refuse('DUPLICATE_ID'); seen.add(label.id);
    const original = gold.get(label.id); if (!original) refuse('FOREIGN_ITEM');
    for (const key of ITEM_FIELDS) if (canonicalJson(label[key]) !== canonicalJson(original[key])) refuse('PACKET_IMMUTABLE');
    for (const [field, choices] of Object.entries(JUDGEMENTS)) if (label[field] !== '' && !choices.includes(label[field])) refuse('JUDGEMENT');
    if (typeof label.notes !== 'string') refuse('NOTES');
  }
  if (packetDigest(value) !== packetSha) refuse('PACKET_SHA');
  return value;
}
function byteBinding(bytes) { return { bytes: bytes.length, sha256: digest(bytes), original_base64: bytes.toString('base64') }; }
function frozen(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
  return value;
}
function roleCoverage(role, submission, selected) {
  const rows = submission?.packet.labels ?? []; let chosen = 0; let completeJudgements = 0; let complete = 0; let missingNotes = 0;
  for (const label of rows) {
    const fields = missingJudgements(label); const filled = Object.keys(JUDGEMENTS).filter(key => JUDGEMENTS[key].includes(label[key])).length;
    chosen += filled; if (filled === 3) completeJudgements++; if (!fields.length) complete++; if (fields.includes('notes')) missingNotes++;
  }
  return { role, submission_status: !submission ? 'absent_submission' : complete === selected ? 'complete_syntactic_submission' : 'partial_syntactic_submission',
    selected_n: selected, immutable_rows_returned_n: rows.length, chosen_judgement_fields_n: chosen,
    missing_judgement_fields_n: 3 * selected - chosen, complete_judgement_items_n: completeJudgements,
    complete_with_required_notes_n: complete, items_missing_required_notes_n: missingNotes,
    authenticated_human: null, task_expertise_verified: null, actual_independence_verified: null };
}
function reconcileCoverage(preparation, supplied) {
  const gold = preparation.review_packets[0].packet; const selected = gold.labels.length;
  const a = supplied.get('reviewer_a'); const b = supplied.get('reviewer_b');
  const indexes = [a, b].map(row => new Map((row?.packet.labels ?? []).map(label => [label.id, label])));
  const perField = {};
  for (const [field, choices] of Object.entries(JUDGEMENTS)) {
    const eligible = indexes.map(index => gold.labels.filter(label => choices.includes(index.get(label.id)?.[field])).map(label => label.id));
    const pairs = gold.labels.map(label => label.id).filter(id => indexes.every(index => choices.includes(index.get(id)?.[field])));
    perField[field] = { selected_n: selected, reviewer_a: { eligible_n: eligible[0].length, missing_n: selected - eligible[0].length },
      reviewer_b: { eligible_n: eligible[1].length, missing_n: selected - eligible[1].length },
      pair_eligible_n: pairs.length, pair_missing_n: selected - pairs.length,
      syntactic_agreement: pairs.length ? cohensKappa(...indexes.map(index => pairs.map(id => index.get(id)[field]))) : null };
  }
  const tasks = gold.labels.map(label => {
    const returned = indexes.map(index => index.get(label.id));
    const missing = ROLES.flatMap((role, index) => {
      const fields = missingJudgements(returned[index]); return fields.length ? [{ role, fields }] : [];
    });
    const disagreements = Object.keys(JUDGEMENTS).filter(field => returned.every(row => JUDGEMENTS[field].includes(row?.[field])) && returned[0][field] !== returned[1][field]);
    return { id: label.id, source_ids: label.filings.map(url => digest(Buffer.from(url, 'utf8'))), selected_n: selected,
      missing_submissions: ROLES.filter(role => !supplied.has(role)), missing_fields: missing,
      syntactic_disagreements: disagreements.map(field => ({ field, reviewer_a: returned[0][field], reviewer_b: returned[1][field] })),
      status: missing.length ? 'awaiting_complete_syntactic_submissions' : 'awaiting_independent_expert_verification_and_adjudication',
      verified_submissions: null, adjudication: null, task: 'Verify consenting independent expert reviewers and source-use rights, resolve missing fields and disagreements, then record a separately authorized source-backed adjudication.' };
  });
  const compared = a && b ? agreement(a.packet, b.packet, gold) : null;
  return { roles: ROLES.map(role => roleCoverage(role, supplied.get(role), selected)), tasks,
    coverage: { selected_n: selected, required_review_roles_n: 2, required_item_assignments_n: 2 * selected,
      role_submissions_provided_n: supplied.size, absent_role_submissions: ROLES.filter(role => !supplied.has(role)),
      complete_syntactic_pairs_n: tasks.filter(task => !task.missing_fields.length).length,
      per_field: perField, denominator: 'All selected immutable gold rows for each role and every pair; absent files, blank fields and missing notes never reduce selected-N.' },
    syntactic_agreement: { syntactic_only: true, verified_expert_agreement: null, basis: 'Unchanged agreement functions on compatible supplied declarations; complete-item pairs require all judgements and required notes. Per-field metrics have separate eligible/missing counts.',
      complete_item_pairs_result: compared, unavailable_reason: compared ? null : 'Both explicit role submissions are required; absent roles have full missing coverage.' } };
}
function implementationBinding(declaredSha, preparation) {
  const functions = [ExpertSubmissionAuditError, refuse, digest, sha, captureBytes, captureArray, unicode, decode, decimalIdentity, parseJson,
    fields, text, auditSettings, submissionInventory, returnedPacket, byteBinding, frozen, roleCoverage, reconcileCoverage,
    implementationBinding, reconcileExpertSubmissions, prepareExpertIntake, agreement, cohensKappa, identity, indexPacket,
    missingJudgements, packetDigest, packetContent, canonicalJson, pythonNumber, pythonString];
  const behavior = { limits: EXPERT_SUBMISSION_LIMITS, inherited_limits: EXPERT_INTAKE_LIMITS, roles: ROLES, item_fields: ITEM_FIELDS,
    judgements: JUDGEMENTS, schemas: [EXPERT_SUBMISSION_INVENTORY_SCHEMA, EXPERT_SUBMISSION_SETTINGS_SCHEMA, EXPERT_SUBMISSION_REPORT_SCHEMA],
    dependency_source_sha256: DEPENDENCIES, preparation_behavior_sha256: preparation.implementation.behavior_sha256,
    functions: functions.map(fn => functionSource.call(fn)), native_contract: 'Trusted Node intrinsics; owned native nonshared bytes and dense native arrays; no caller callbacks or I/O.' };
  return { name: 'canli.filing-facts.expert-submission-audit', version: 'v1', behavior_sha256: digest(canonicalJson(behavior)),
    preparation_behavior_sha256: preparation.implementation.behavior_sha256,
    dependency_source_sha256: DEPENDENCIES, dependency_source_pins_verified: false,
    declared_module_sha256: declaredSha, declared_module_sha256_verified: false,
    module_sha256_reason: 'Pure utility does not read module files. Source pins need a separate signed Git manifest and independent review; behavior fingerprints do not authenticate a runtime or documents.' };
}

/** Original six intake inputs, followed by raw submission inventory, its native buffers and audit settings. */
export function reconcileExpertSubmissions(goldBytes, expectedGoldRawSha256, intakeBytes, evidenceInventoryBytes,
  evidenceBuffers, intakeSettingsBytes, submissionInventoryBytes, submissionBuffers, auditSettingsBytes) {
  const budget = { total: 0 };
  const goldCopy = captureBytes(goldBytes, EXPERT_INTAKE_LIMITS.goldBytes, budget);
  const intakeCopy = captureBytes(intakeBytes, EXPERT_INTAKE_LIMITS.intakeBytes, budget);
  const inventoryCopy = captureBytes(evidenceInventoryBytes, EXPERT_INTAKE_LIMITS.inventoryBytes, budget);
  const settingsCopy = captureBytes(intakeSettingsBytes, EXPERT_INTAKE_LIMITS.settingsBytes, budget);
  const evidence = captureArray(evidenceBuffers, EXPERT_INTAKE_LIMITS.evidence, EXPERT_INTAKE_LIMITS.evidenceBytes, budget, 'EVIDENCE');
  if (evidence.total > EXPERT_INTAKE_LIMITS.evidenceTotalBytes) refuse('EVIDENCE_TOTAL_BOUND');
  if (budget.total > EXPERT_INTAKE_LIMITS.totalInputBytes) refuse('INTAKE_TOTAL_INPUT_BOUND');
  sha(expectedGoldRawSha256);
  const submissionsCopy = captureBytes(submissionInventoryBytes, EXPERT_SUBMISSION_LIMITS.inventoryBytes, budget);
  const auditCopy = captureBytes(auditSettingsBytes, EXPERT_SUBMISSION_LIMITS.settingsBytes, budget);
  const submissions = captureArray(submissionBuffers, EXPERT_SUBMISSION_LIMITS.submissions, EXPERT_SUBMISSION_LIMITS.submissionBytes, budget, 'SUBMISSION');
  let preparation;
  try { preparation = prepareExpertIntake(goldCopy, expectedGoldRawSha256, intakeCopy, inventoryCopy, evidence.copies, settingsCopy); }
  catch (error) { if (error instanceof ExpertIntakeError) refuse(`INTAKE_${error.code}`); throw error; }
  // Preserve intake itself; refuse malformed caller source declarations in this derived report.
  if (preparation.implementation.declared_module_sha256 !== null) sha(preparation.implementation.declared_module_sha256);
  const settings = auditSettings(parseJson(auditCopy), preparation.packet_sha256);
  const supplied = submissionInventory(parseJson(submissionsCopy), submissions.copies, preparation);
  const reconciliation = reconcileCoverage(preparation, supplied);
  const report = { schema: EXPERT_SUBMISSION_REPORT_SCHEMA, implementation: implementationBinding(settings.implementation_source_sha256, preparation),
    preparation, packet_sha256: preparation.packet_sha256, expected_gold_raw_sha256: expectedGoldRawSha256,
    bindings: { submission_inventory: byteBinding(submissionsCopy), audit_settings: byteBinding(auditCopy) },
    settings, limits: EXPERT_SUBMISSION_LIMITS, total_captured_input_bytes: budget.total,
    submissions: ROLES.map(role => supplied.get(role) ?? { role, declared_handle: preparation.review_packets.find(row => row.role === role).declared_handle,
      submission_status: 'absent_submission', binding: null, packet: null, author_authenticated: null, document_authenticity: null }),
    role_coverage: reconciliation.roles, coverage: reconciliation.coverage, syntactic_agreement: reconciliation.syntactic_agreement,
    adjudication: { blank_submission: preparation.adjudication.blank_submission, item_tasks: reconciliation.tasks,
      expert_adjudication: null, decisions_created_n: 0 }, established: { ...preparation.established },
    interpretation: 'Byte and syntactic consistency only. Expected raw pins and declared handles are caller inputs, not authentication. Different supplied aliases do not establish independence. Syntactic coverage/agreement is separate from verified expert review. No labels, decisions, qualifications, rights, admission or release are established; raw private credentials/submissions stay in the authorized coordinator process, not a public dataset.' };
  const canonical = canonicalJson(report);
  if (Buffer.byteLength(canonical) > EXPERT_SUBMISSION_LIMITS.reportBytes) refuse('REPORT_BOUND');
  const json = JSON.stringify(report);
  if (Buffer.byteLength(json) > EXPERT_SUBMISSION_LIMITS.reportBytes) refuse('REPORT_BOUND');
  if (canonical !== canonicalJson(JSON.parse(json))) refuse('ROUNDTRIP');
  report.content_hash = `sha256:${digest(canonical)}`;
  if (Buffer.byteLength(JSON.stringify(report)) > EXPERT_SUBMISSION_LIMITS.reportBytes || Buffer.byteLength(canonicalJson(report)) > EXPERT_SUBMISSION_LIMITS.reportBytes) refuse('REPORT_BOUND');
  return frozen(report);
}
