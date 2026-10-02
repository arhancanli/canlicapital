import { createHash } from 'node:crypto';
import { TextDecoder, types } from 'node:util';
import { canonicalJson, pythonNumber, pythonString } from '../../canonical-json.mjs';
import { packetContent } from '../../../js/filing-facts-packet.js';

// Supplied bytes only. No recruitment, review dispatch, labels, filesystem or server integration.
export const EXPERT_INTAKE_LIMITS = Object.freeze({
  goldBytes: 512 * 1024, intakeBytes: 64 * 1024, inventoryBytes: 32 * 1024, settingsBytes: 4096,
  evidenceBytes: 32 * 1024, evidenceTotalBytes: 256 * 1024, totalInputBytes: 768 * 1024,
  items: 128, sources: 128, filingsPerItem: 16, roles: 3, aliasesPerRole: 8,
  qualificationsPerRole: 8, conflictsPerRole: 16, claimsPerSource: 8, evidence: 64, evidenceReferences: 8,
  arrayRows: 256, depth: 16, nodes: 32768, stringUnits: 4096, numberUnits: 128,
  reportBytes: 2 * 1024 * 1024,
});
export const EXPERT_INTAKE_SCHEMA = 'canli.filing-facts-expert-intake.v1';
export const EXPERT_INVENTORY_SCHEMA = 'canli.filing-facts-expert-evidence.v1';
export const EXPERT_SETTINGS_SCHEMA = 'canli.filing-facts-expert-settings.v1';
export const EXPERT_REPORT_SCHEMA = 'canli.filing-facts-expert-preparation.v1';
const GOLD_SCHEMA = 'canli.filing-facts-gold-packet.v0';
const GUIDELINES = 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md';
const ROLES = Object.freeze(['reviewer_a', 'reviewer_b', 'adjudicator']);
const USES = Object.freeze(['human_review', 'evaluation', 'training', 'redistribution']);
const PURPOSES = Object.freeze(['identity', 'independence', 'qualification', 'conflict', 'source_rights']);
const JUDGEMENTS = Object.freeze({
  question_clear: Object.freeze(['yes', 'no']),
  answer_matches_filing: Object.freeze(['yes', 'no', 'cannot_find']),
  citation_correct: Object.freeze(['yes', 'no']),
});
const DEPENDENCIES = Object.freeze({
  canonical_json: '881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b',
  packet_content: 'eb61ab2bf78d7047569c8cf92ea348dc5c3a9e6fe311c16a63361765b2e08bc8',
  identity_convention_agreement: 'f461cb2b9e3b138d1135a7ff295c30cfb911036183338b02faab1736cc90b6e6',
  guidelines: '0c358e06d3e68dedb96c85be73392783a2f639a581870b4d239fa33a7e544afb',
});
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const lengthGetter = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength').get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer').get;
const typedSet = Uint8Array.prototype.set;
const functionSource = Function.prototype.toString;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export class ExpertIntakeError extends Error {
  constructor(code) { super(`Expert intake refused (${code}).`); this.name = 'ExpertIntakeError'; this.code = code; }
}
function refuse(code) { throw new ExpertIntakeError(code); }
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function captureBytes(value, maximum) {
  if (types.isProxy(value) || !types.isUint8Array(value)) refuse('INPUT_BYTES');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) refuse('INPUT_BYTES');
  if (types.isSharedArrayBuffer(bufferGetter.call(value))) refuse('SHARED_BYTES');
  const length = lengthGetter.call(value);
  if (length < 1 || length > maximum) refuse('BYTE_BOUND');
  const copy = Buffer.alloc(length);
  typedSet.call(copy, value);
  return copy;
}
function captureEvidence(value) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse('EVIDENCE_ARRAY');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const count = descriptors.length.value;
  if (count > EXPERT_INTAKE_LIMITS.evidence) refuse('EVIDENCE_BOUND');
  if (Reflect.ownKeys(descriptors).length !== count + 1) refuse('EVIDENCE_ARRAY');
  const copies = []; let total = 0;
  for (let index = 0; index < count; index++) {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) refuse('EVIDENCE_ARRAY');
    const copy = captureBytes(descriptor.value, EXPERT_INTAKE_LIMITS.evidenceBytes);
    total += copy.length;
    if (total > EXPERT_INTAKE_LIMITS.evidenceTotalBytes) refuse('EVIDENCE_TOTAL_BOUND');
    copies.push(copy);
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
  catch (error) { if (error instanceof ExpertIntakeError) throw error; refuse('UTF8'); }
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
      if (position - start > EXPERT_INTAKE_LIMITS.stringUnits * 6 + 2) refuse('STRING_BOUND');
      if (character === '\\') { position++; continue; }
      if (character === '"') {
        let value;
        try { value = JSON.parse(source.slice(start, position)); } catch { refuse('JSON'); }
        if (value.length > EXPERT_INTAKE_LIMITS.stringUnits) refuse('STRING_BOUND');
        return unicode(value);
      }
    }
    refuse('JSON');
  }
  function value(depth) {
    if (depth > EXPERT_INTAKE_LIMITS.depth) refuse('DEPTH_BOUND');
    if (++nodes > EXPERT_INTAKE_LIMITS.nodes) refuse('NODE_BOUND');
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
        if (result.length >= EXPERT_INTAKE_LIMITS.arrayRows) refuse('ARRAY_BOUND');
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
    if (match[0].length > EXPERT_INTAKE_LIMITS.numberUnits) refuse('NUMBER_BOUND');
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
function identifier(value) {
  text(value); if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) refuse('IDENTIFIER'); return value;
}
function sha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) refuse('SHA'); return value;
}
function array(value, maximum, code = 'ARRAY_BOUND') {
  if (!Array.isArray(value) || value.length > maximum) refuse(code); return value;
}
function unique(value, maximum, validate = identifier) {
  array(value, maximum); const seen = new Set();
  for (const entry of value) { validate(entry); if (seen.has(entry)) refuse('DUPLICATE_ID'); seen.add(entry); }
  return value;
}
// Exact agreement.mjs identity convention, applied only to supplied handles/aliases.
function normalizedIdentity(value) { return text(value).trim().normalize('NFKC').toLowerCase(); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900) refuse('DATE');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) refuse('DATE');
  return value;
}
function sourceUrl(value) {
  text(value, 2048); if (/\s/.test(value)) refuse('SOURCE_URL');
  let url; try { url = new URL(value); } catch { refuse('SOURCE_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) refuse('SOURCE_URL');
  return value;
}
function uses(value) {
  return unique(value, USES.length, entry => { if (!USES.includes(entry)) refuse('USE'); });
}
function verification(value) {
  if (value === null) return;
  fields(value, ['who', 'date', 'method', 'evidence_ids']); text(value.who); date(value.date); text(value.method, 1024);
  unique(value.evidence_ids, EXPERT_INTAKE_LIMITS.evidenceReferences);
}
function settings(value) {
  fields(value, ['schema', 'packet_sha256', 'required_uses', 'prepared_on', 'implementation_source_sha256']);
  if (value.schema !== EXPERT_SETTINGS_SCHEMA) refuse('SCHEMA'); sha(value.packet_sha256);
  uses(value.required_uses); if (!value.required_uses.length) refuse('USE'); date(value.prepared_on);
  if (value.implementation_source_sha256 !== null) sha(value.implementation_source_sha256);
  return value;
}
function goldPacket(value) {
  fields(value, ['schema', 'guidelines', 'judgements', 'annotator', 'labels'], ['packet_sha256']);
  if (value.schema !== GOLD_SCHEMA || value.guidelines !== GUIDELINES || value.annotator !== '' || canonicalJson(value.judgements) !== canonicalJson(JUDGEMENTS)) refuse('BLANK_GOLD');
  array(value.labels, EXPERT_INTAKE_LIMITS.items, 'ITEM_BOUND'); if (!value.labels.length) refuse('ITEM_BOUND');
  const ids = new Set(); const sources = new Map();
  for (const label of value.labels) {
    fields(label, ['id', 'template', 'company', 'question', 'answer', 'filings', ...Object.keys(JUDGEMENTS), 'notes']);
    identifier(label.id); if (ids.has(label.id)) refuse('DUPLICATE_ID'); ids.add(label.id);
    text(label.template); text(label.company, 512); text(label.question, 4096); text(label.answer, 4096);
    for (const field of [...Object.keys(JUDGEMENTS), 'notes']) if (label[field] !== '') refuse('BLANK_GOLD');
    unique(label.filings, EXPERT_INTAKE_LIMITS.filingsPerItem, sourceUrl);
    if (!label.filings.length) refuse('SOURCE_BOUND');
    for (const url of label.filings) {
      const id = digest(Buffer.from(url, 'utf8'));
      if (sources.has(id) && sources.get(id).url !== url) refuse('SOURCE_BINDING');
      if (!sources.has(id)) sources.set(id, { source_id: id, url, item_ids: [] });
      sources.get(id).item_ids.push(label.id);
      if (sources.size > EXPERT_INTAKE_LIMITS.sources) refuse('SOURCE_BOUND');
    }
  }
  const packetSha = digest(packetContent(value));
  if (value.packet_sha256 !== undefined && value.packet_sha256 !== packetSha) refuse('PACKET_SHA');
  return { packet: value, packetSha, sources };
}
function intake(value, packetSha, sourceMap) {
  fields(value, ['schema', 'packet_sha256', 'roles', 'sources']);
  if (value.schema !== EXPERT_INTAKE_SCHEMA) refuse('SCHEMA');
  if (sha(value.packet_sha256) !== packetSha) refuse('PACKET_SHA');
  array(value.roles, EXPERT_INTAKE_LIMITS.roles, 'ROLE_BOUND'); array(value.sources, EXPERT_INTAKE_LIMITS.sources, 'SOURCE_BOUND');
  const roles = new Map(); const identities = new Set();
  for (const role of value.roles) {
    fields(role, ['role', 'handle', 'aliases', 'affiliations', 'conflicts', 'identity_evidence_ids', 'independence_evidence_ids', 'qualifications']);
    if (!ROLES.includes(role.role) || roles.has(role.role)) refuse('ROLE'); text(role.handle);
    unique(role.aliases, EXPERT_INTAKE_LIMITS.aliasesPerRole, normalizedIdentity);
    for (const handle of [role.handle, ...role.aliases]) {
      const key = normalizedIdentity(handle); if (identities.has(key)) refuse('IDENTITY_COLLISION'); identities.add(key);
    }
    if (role.affiliations !== null) unique(role.affiliations, 8, entry => text(entry, 512));
    unique(role.identity_evidence_ids, EXPERT_INTAKE_LIMITS.evidenceReferences);
    unique(role.independence_evidence_ids, EXPERT_INTAKE_LIMITS.evidenceReferences);
    if (role.conflicts !== null) {
      array(role.conflicts, EXPERT_INTAKE_LIMITS.conflictsPerRole); const seen = new Set();
      for (const conflict of role.conflicts) {
        fields(conflict, ['id', 'description', 'evidence_ids']); identifier(conflict.id); text(conflict.description, 1024);
        if (seen.has(conflict.id)) refuse('DUPLICATE_ID'); seen.add(conflict.id);
        unique(conflict.evidence_ids, EXPERT_INTAKE_LIMITS.evidenceReferences);
      }
    }
    array(role.qualifications, EXPERT_INTAKE_LIMITS.qualificationsPerRole); const qualifications = new Set();
    for (const qualification of role.qualifications) {
      fields(qualification, ['id', 'kind', 'title', 'task_relevance', 'evidence_ids', 'verification']); identifier(qualification.id);
      if (qualifications.has(qualification.id)) refuse('DUPLICATE_ID'); qualifications.add(qualification.id);
      if (!['phd', 'cfa', 'engineering', 'other'].includes(qualification.kind)) refuse('QUALIFICATION');
      text(qualification.title, 512); if (qualification.task_relevance !== null) text(qualification.task_relevance, 1024);
      unique(qualification.evidence_ids, EXPERT_INTAKE_LIMITS.evidenceReferences); verification(qualification.verification);
    }
    roles.set(role.role, role);
  }
  const sources = new Map();
  for (const source of value.sources) {
    fields(source, ['source_id', 'url', 'claims']); sha(source.source_id); sourceUrl(source.url);
    if (!sourceMap.has(source.source_id) || sourceMap.get(source.source_id).url !== source.url) refuse('SOURCE_BINDING');
    if (sources.has(source.source_id)) refuse('DUPLICATE_ID'); array(source.claims, EXPERT_INTAKE_LIMITS.claimsPerSource);
    const ids = new Set();
    for (const claim of source.claims) {
      fields(claim, ['id', 'declaration_text', 'allowed_uses', 'denied_uses', 'evidence_ids', 'verification']); identifier(claim.id);
      if (ids.has(claim.id)) refuse('DUPLICATE_ID'); ids.add(claim.id);
      if (claim.declaration_text !== null) text(claim.declaration_text, 2048);
      if (claim.allowed_uses !== null) uses(claim.allowed_uses);
      if (claim.denied_uses !== null) uses(claim.denied_uses);
      unique(claim.evidence_ids, EXPERT_INTAKE_LIMITS.evidenceReferences); verification(claim.verification);
    }
    sources.set(source.source_id, source);
  }
  return { roles, sources };
}
function inventory(value, evidenceCopies, packetSha, declarations, sourceMap) {
  fields(value, ['schema', 'evidence']); if (value.schema !== EXPERT_INVENTORY_SCHEMA) refuse('SCHEMA');
  array(value.evidence, EXPERT_INTAKE_LIMITS.evidence, 'EVIDENCE_BOUND');
  if (value.evidence.length !== evidenceCopies.length) refuse('EVIDENCE_COUNT');
  const entries = new Map();
  for (const [index, entry] of value.evidence.entries()) {
    fields(entry, ['id', 'packet_sha256', 'purpose', 'subject', 'expected_sha256', 'expected_bytes']); identifier(entry.id);
    if (entries.has(entry.id)) refuse('DUPLICATE_ID');
    if (sha(entry.packet_sha256) !== packetSha) refuse('EVIDENCE_PACKET');
    if (!PURPOSES.includes(entry.purpose)) refuse('EVIDENCE_PURPOSE');
    const subject = entry.subject;
    if (entry.purpose === 'source_rights') {
      fields(subject, ['source_id', 'url']); sha(subject.source_id); sourceUrl(subject.url);
      if (!sourceMap.has(subject.source_id) || sourceMap.get(subject.source_id).url !== subject.url) refuse('EVIDENCE_SUBJECT');
    } else {
      const extra = entry.purpose === 'qualification' ? ['qualification_id'] : entry.purpose === 'conflict' ? ['conflict_id'] : [];
      fields(subject, ['role', 'handle', ...extra]);
      const role = declarations.roles.get(subject.role);
      if (!role || subject.handle !== role.handle) refuse('EVIDENCE_SUBJECT');
      if (entry.purpose === 'qualification' && !role.qualifications.some(row => row.id === subject.qualification_id)) refuse('EVIDENCE_SUBJECT');
      if (entry.purpose === 'conflict' && !role.conflicts?.some(row => row.id === subject.conflict_id)) refuse('EVIDENCE_SUBJECT');
    }
    const binding = byteBinding(evidenceCopies[index]);
    if (sha(entry.expected_sha256) !== binding.sha256) refuse('EVIDENCE_SHA');
    if (!Number.isSafeInteger(entry.expected_bytes) || entry.expected_bytes < 1 || entry.expected_bytes !== binding.bytes) refuse('EVIDENCE_LENGTH');
    entries.set(entry.id, { ...entry, binding, byte_binding_verified: true, document_authenticity: null });
  }
  return entries;
}
function evidenceReferences(ids, purpose, subject, entries, used, missing) {
  const provided = []; const absent = [];
  for (const id of ids) {
    const entry = entries.get(id);
    if (!entry) { absent.push(id); missing.add(id); continue; }
    if (entry.purpose !== purpose || canonicalJson(entry.subject) !== canonicalJson(subject)) refuse('EVIDENCE_SUBJECT');
    used.add(id); provided.push({ id, bytes: entry.binding.bytes, sha256: entry.binding.sha256 });
  }
  return { declared_ids: ids, provided, missing_ids: absent, authenticity_verified: null };
}
function roleWorklist(name, role, entries, used, missing) {
  const base = { role: name, declared_handle: role?.handle ?? null, declaration: role ?? null,
    authenticated_human: null, task_expertise_verified: null, actual_independence_verified: null,
    tasks: ['Authenticate the consenting person behind the declared handle and aliases.',
      'Verify task-relevant qualifications with an independent credential/source check.',
      'Check actual independence and disclosed affiliations/conflicts; distinct text handles alone do not establish it.',
      name === 'adjudicator' ? 'Await both independent complete submissions before a source-backed decision.' : 'Review the same immutable packet independently after identity, qualification and source-use checks.'] };
  if (!role) return { ...base, status: 'missing_role_declaration', identity_evidence: null, independence_evidence: null, qualifications: [], conflicts: null };
  const subject = { role: name, handle: role.handle };
  const refs = (ids, purpose, target = subject) => evidenceReferences(ids, purpose, target, entries, used, missing);
  return { ...base, status: 'declared_unverified', identity_evidence: refs(role.identity_evidence_ids, 'identity'),
    independence_evidence: refs(role.independence_evidence_ids, 'independence'),
    qualifications: role.qualifications.map(row => {
      const target = { ...subject, qualification_id: row.id };
      return { declaration: row, evidence: refs(row.evidence_ids, 'qualification', target),
        declared_verification_evidence: row.verification === null ? null : refs(row.verification.evidence_ids, 'qualification', target),
        qualification_authenticity_verified: null, task_expertise_verified: null,
        tasks: ['Verify the claimed qualification and verification provenance independently.', 'Assess its relevance to financial statement and XBRL review.'] };
    }),
    conflicts: role.conflicts === null ? null : role.conflicts.map(row => ({ declaration: row,
      evidence: refs(row.evidence_ids, 'conflict', { ...subject, conflict_id: row.id }), independently_assessed: null })),
  };
}
function sourceWorklist(source, declaration, configuration, entries, used, missing) {
  const subject = { source_id: source.source_id, url: source.url };
  const allowed = new Set(); const denied = new Set();
  const claims = (declaration?.claims ?? []).map(claim => {
    for (const use of claim.allowed_uses ?? []) allowed.add(use);
    for (const use of claim.denied_uses ?? []) denied.add(use);
    return { declaration: claim,
      evidence: evidenceReferences(claim.evidence_ids, 'source_rights', subject, entries, used, missing),
      declared_verification_evidence: claim.verification === null ? null : evidenceReferences(claim.verification.evidence_ids, 'source_rights', subject, entries, used, missing),
      rights_verified: null };
  });
  const contradictory = USES.filter(use => allowed.has(use) && denied.has(use));
  const uncovered = configuration.required_uses.filter(use => !allowed.has(use));
  const restricted = configuration.required_uses.filter(use => denied.has(use));
  const unknownScope = !claims.length || claims.some(row => row.declaration.allowed_uses === null || row.declaration.denied_uses === null);
  const missingEvidence = !claims.length || claims.some(row => !row.evidence.provided.length || row.evidence.missing_ids.length || (row.declared_verification_evidence?.missing_ids.length ?? 0));
  return { ...source, declaration_present: Boolean(declaration), claims, required_uses: configuration.required_uses,
    mechanical_flags: { missing_declaration: !declaration, unknown_use_scope: unknownScope,
      missing_declared_evidence: Boolean(missingEvidence), contradictory_use_claims: contradictory,
      uncovered_required_uses: uncovered, restricted_required_uses: restricted },
    actual_rights_verified: null, source_completeness_verified: null, admitted_for_human_review: null, admitted_for_release: null,
    tasks: ['Check who can grant the requested uses for this exact source and whether the supplied evidence is authentic.',
      'Resolve missing, conflicting or out-of-scope use declarations for every requested use.',
      'Record a separately authorized rights/admission decision; public availability, URLs and dataset-card licence are not independent clearance.'] };
}
function byteBinding(bytes) { return { bytes: bytes.length, sha256: digest(bytes), original_base64: bytes.toString('base64') }; }
function frozen(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
  return value;
}
function implementationBinding(declaredSha) {
  const functions = [ExpertIntakeError, refuse, digest, captureBytes, captureEvidence, unicode, decode, decimalIdentity, parseJson,
    fields, text, identifier, sha, array, unique, normalizedIdentity, date, sourceUrl, uses, verification, settings, goldPacket, intake,
    inventory, evidenceReferences, roleWorklist, sourceWorklist, byteBinding, frozen, implementationBinding, prepareExpertIntake,
    canonicalJson, pythonNumber, pythonString, packetContent];
  const behavior = { limits: EXPERT_INTAKE_LIMITS, schemas: [EXPERT_INTAKE_SCHEMA, EXPERT_INVENTORY_SCHEMA, EXPERT_SETTINGS_SCHEMA, EXPERT_REPORT_SCHEMA, GOLD_SCHEMA],
    roles: ROLES, uses: USES, purposes: PURPOSES, judgements: JUDGEMENTS, guidelines: GUIDELINES, dependency_source_sha256: DEPENDENCIES,
    functions: functions.map(fn => functionSource.call(fn)), native_contract: 'Trusted Node SHA256/UTF8/URL/intrinsics; native owned nonshared byte copies; no callbacks.' };
  return { name: 'canli.filing-facts.expert-intake', version: 'v1', behavior_sha256: digest(canonicalJson(behavior)),
    dependency_source_sha256: DEPENDENCIES, declared_module_sha256: declaredSha, declared_module_sha256_verified: false,
    module_sha256_reason: 'Pure core does not read its module file. Whole-source SHA is caller-declared; use a separate signed source manifest and review.' };
}

/** Six explicit inputs. Inventory rows and native evidence buffers have the same order. */
export function prepareExpertIntake(goldBytes, expectedGoldRawSha256, intakeBytes, inventoryBytes, evidenceBuffers, settingsBytes) {
  const goldCopy = captureBytes(goldBytes, EXPERT_INTAKE_LIMITS.goldBytes);
  const intakeCopy = captureBytes(intakeBytes, EXPERT_INTAKE_LIMITS.intakeBytes);
  const inventoryCopy = captureBytes(inventoryBytes, EXPERT_INTAKE_LIMITS.inventoryBytes);
  const settingsCopy = captureBytes(settingsBytes, EXPERT_INTAKE_LIMITS.settingsBytes);
  const evidence = captureEvidence(evidenceBuffers);
  if (goldCopy.length + intakeCopy.length + inventoryCopy.length + settingsCopy.length + evidence.total > EXPERT_INTAKE_LIMITS.totalInputBytes) refuse('TOTAL_INPUT_BOUND');
  const bindings = { gold: byteBinding(goldCopy), intake: byteBinding(intakeCopy), inventory: byteBinding(inventoryCopy), settings: byteBinding(settingsCopy) };
  if (sha(expectedGoldRawSha256) !== bindings.gold.sha256) refuse('GOLD_RAW_SHA');
  const configuration = settings(parseJson(settingsCopy));
  const gold = goldPacket(parseJson(goldCopy));
  if (configuration.packet_sha256 !== gold.packetSha) refuse('PACKET_SHA');
  const declarations = intake(parseJson(intakeCopy), gold.packetSha, gold.sources);
  const entries = inventory(parseJson(inventoryCopy), evidence.copies, gold.packetSha, declarations, gold.sources);
  const used = new Set(); const missing = new Set();
  const roles = ROLES.map(role => roleWorklist(role, declarations.roles.get(role), entries, used, missing));
  const sources = [...gold.sources.values()].map(source => sourceWorklist(source, declarations.sources.get(source.source_id), configuration, entries, used, missing));
  const reviewPackets = ROLES.slice(0, 2).map(role => {
    const declaration = declarations.roles.get(role); const packet = JSON.parse(JSON.stringify(gold.packet));
    packet.annotator = declaration?.handle ?? ''; packet.packet_sha256 = gold.packetSha;
    return { role, declared_handle: declaration?.handle ?? null, assignment_status: declaration ? 'declared_unverified' : 'missing_role_declaration', packet };
  });
  const adjudicator = declarations.roles.get('adjudicator');
  const report = { schema: EXPERT_REPORT_SCHEMA, implementation: implementationBinding(configuration.implementation_source_sha256), bindings,
    expected_gold_raw_sha256: expectedGoldRawSha256, raw_gold_byte_binding_verified: true, packet_sha256: gold.packetSha,
    packet_binding_basis: 'packetContent: immutable schema, ID-sorted id/template/company/question/answer/filings; raw SHA binds original order and all blank fields separately.',
    settings: configuration, prepared_on_authenticated: false, limits: EXPERT_INTAKE_LIMITS, review_packets: reviewPackets, role_worklists: roles, source_worklists: sources,
    adjudication: { declared_handle: adjudicator?.handle ?? null,
      blank_submission: { schema: 'canli.filing-facts-adjudication.v1', adjudicator: adjudicator?.handle ?? '', packet_sha256: gold.packetSha, decisions: [] },
      item_tasks: gold.packet.labels.map(label => ({ id: label.id, source_ids: label.filings.map(url => digest(Buffer.from(url, 'utf8'))),
        required_review_roles: ['reviewer_a', 'reviewer_b'], status: 'awaiting_independent_complete_submissions', verified_submissions: null,
        task: 'After complete independent reviews, check cited filing locators, resolve disagreements and record an explicit decision with source notes.' })) },
    evidence_inventory: [...entries.values()].map(entry => ({ ...entry, referenced: used.has(entry.id) })),
    coverage: { selected_n: gold.packet.labels.length, prepared_items_per_review_role: gold.packet.labels.length,
      prepared_item_assignments: 2 * gold.packet.labels.length, required_roles_n: ROLES.length, declared_roles_n: declarations.roles.size,
      missing_roles: ROLES.filter(role => !declarations.roles.has(role)), distinct_sources_n: gold.sources.size,
      sources_declared_n: declarations.sources.size, sources_missing_declaration_n: sources.filter(source => !source.declaration_present).length,
      evidence_provided_n: entries.size, evidence_missing_ids: [...missing].sort(), evidence_unreferenced_ids: [...entries.keys()].filter(id => !used.has(id)),
      prepared_completed_review_pairs_n: 0, denominator: 'All items and distinct exact cited sources in the supplied immutable gold packet; missing roles/evidence never reduce selected-N.' },
    established: { authenticated_humans_n: null, verified_experts_n: null, verified_independent_reviewers_n: null,
      verified_source_rights_n: null, verified_source_completeness: null, expert_labelled_items_n: null,
      admitted_for_human_review: null, admitted_for_release: null, expert_agreement: null, expert_adjudication: null },
    interpretation: 'Preparation and byte/hash/scope checks only. Supplied identities, aliases, affiliations, qualifications and verification declarations are unverified. Alias checks detect supplied text collisions only; same employer neither proves nor disproves actual independence. Exact opaque evidence bytes do not authenticate documents or confer rights. No labels, recruitment, packet dispatch, source fetching or automatic admission.' };
  const canonical = canonicalJson(report);
  if (canonical !== canonicalJson(JSON.parse(JSON.stringify(report)))) refuse('ROUNDTRIP');
  report.content_hash = `sha256:${digest(canonical)}`;
  if (Buffer.byteLength(JSON.stringify(report)) > EXPERT_INTAKE_LIMITS.reportBytes || Buffer.byteLength(canonical) + 100 > EXPERT_INTAKE_LIMITS.reportBytes) refuse('REPORT_BOUND');
  return frozen(report);
}
