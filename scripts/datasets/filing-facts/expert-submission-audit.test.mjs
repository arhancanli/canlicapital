import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { reconcileExpertSubmissions, ExpertSubmissionAuditError, EXPERT_SUBMISSION_LIMITS as LIMITS,
  EXPERT_SUBMISSION_INVENTORY_SCHEMA, EXPERT_SUBMISSION_SETTINGS_SCHEMA } from './expert-submission-audit.mjs';
import { EXPERT_INTAKE_LIMITS, ExpertIntakeError, prepareExpertIntake } from './expert-intake.mjs';
import { filledPacket } from '../../../js/annotate-core.js';
import { agreement, cohensKappa, packetDigest } from './agreement.mjs';
import { canonicalJson } from '../../canonical-json.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value));
const clone = value => JSON.parse(JSON.stringify(value));
const choices = { question_clear: ['yes', 'no'], answer_matches_filing: ['yes', 'no', 'cannot_find'], citation_correct: ['yes', 'no'] };
function fixtureGold(n = 3) {
  return { schema: 'canli.filing-facts-gold-packet.v0', guidelines: 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md',
    judgements: clone(choices), annotator: '', labels: Array.from({ length: n }, (_, i) => ({ id: `synthetic-${i}`, template: 'lookup',
      company: 'SYNTHETIC SOFTWARE FIXTURE COMPANY', question: `Synthetic question ${i}?`, answer: `${i + 1} synthetic USD`,
      filings: [`https://www.sec.gov/Archives/edgar/data/0/synthetic-${i}/`], question_clear: '', answer_matches_filing: '', citation_correct: '', notes: '' })) };
}
function role(name, handle = `synthetic-${name}`) {
  return { role: name, handle, aliases: [], affiliations: null, conflicts: null,
    identity_evidence_ids: [], independence_evidence_ids: [], qualifications: [] };
}
function setup(gold = fixtureGold(), rawGold = bytes(gold)) {
  const sha = packetDigest(gold);
  return { gold, rawGold, expectedGold: hash(rawGold), evidence: [],
    intake: { schema: 'canli.filing-facts-expert-intake.v1', packet_sha256: sha, roles: ['reviewer_a', 'reviewer_b', 'adjudicator'].map(name => role(name)), sources: [] },
    evidenceInventory: { schema: 'canli.filing-facts-expert-evidence.v1', evidence: [] },
    intakeSettings: { schema: 'canli.filing-facts-expert-settings.v1', packet_sha256: sha, prepared_on: '2026-10-02', required_uses: ['human_review'], implementation_source_sha256: null },
    submissionInventory: { schema: EXPERT_SUBMISSION_INVENTORY_SCHEMA, packet_sha256: sha, submissions: [] }, submissions: [],
    auditSettings: { schema: EXPERT_SUBMISSION_SETTINGS_SCHEMA, packet_sha256: sha, implementation_source_sha256: null } };
}
function args(s) { return [s.rawGold, s.expectedGold, bytes(s.intake), bytes(s.evidenceInventory), s.evidence,
  bytes(s.intakeSettings), bytes(s.submissionInventory), s.submissions, bytes(s.auditSettings)]; }
function run(s) { return reconcileExpertSubmissions(...args(s)); }
function reject(s, code) { assert.throws(() => run(s), e => e instanceof ExpertSubmissionAuditError && (!code || e.code === code)); }
function answers(gold, value = 'yes') { return Object.fromEntries(gold.labels.map(label => [label.id,
  { question_clear: value, answer_matches_filing: value, citation_correct: value, notes: value === 'yes' ? '' : 'SYNTHETIC finding; not an expert label' }])); }
function put(s, name, packet = filledPacket(s.gold, answers(s.gold), s.intake.roles.find(r => r.role === name).handle, s.auditSettings.packet_sha256)) {
  const raw = Buffer.isBuffer(packet) ? packet : bytes(packet);
  s.submissionInventory.submissions.push({ role: name, declared_handle: s.intake.roles.find(r => r.role === name)?.handle ?? 'synthetic-undeclared',
    packet_sha256: s.auditSettings.packet_sha256, expected_sha256: hash(raw), expected_bytes: raw.length }); s.submissions.push(raw); return s;
}
function replace(s, index, raw) {
  s.submissions[index] = raw; Object.assign(s.submissionInventory.submissions[index], { expected_sha256: hash(raw), expected_bytes: raw.length });
}
function change(s, index, mutation) { const packet = JSON.parse(s.submissions[index]); mutation(packet); replace(s, index, bytes(packet)); }
function complete() { return put(put(setup(), 'reviewer_a'), 'reviewer_b'); }
function unknown(report) {
  for (const value of Object.values(report.established)) assert.equal(value, null);
  assert.equal(report.syntactic_agreement.verified_expert_agreement, null); assert.equal(report.adjudication.expert_adjudication, null);
  assert.equal(report.adjudication.decisions_created_n, 0); assert.deepEqual(report.adjudication.blank_submission.decisions, []);
  for (const row of report.role_coverage) for (const key of ['authenticated_human', 'task_expertise_verified', 'actual_independence_verified']) assert.equal(row[key], null);
}
const pad = (raw, length) => { assert.ok(raw.length <= length); return Buffer.concat([raw, Buffer.alloc(length - raw.length, 32)]); };

test('delivered blank50 raw91c6 and packet15c595 retain100 assignments and50 missing review pairs', () => {
  const raw = fs.readFileSync(new URL('../../../public/datasets/filing-facts/v0/gold-packet-v0.json', import.meta.url));
  assert.equal(hash(raw), '91c6f960e34509653800a4cda81bd0632dd58c889ee78eb6461a985765500413');
  const s = setup(JSON.parse(raw), raw); s.intake.roles = []; const report = run(s);
  assert.equal(report.packet_sha256, '15c595ed8109dd324dffeddd104d2f72154ef3710b9d64a0fb7eac7ddc95b7ee');
  assert.equal(report.coverage.selected_n, 50); assert.equal(report.coverage.required_item_assignments_n, 100);
  assert.equal(report.adjudication.item_tasks.length, 50); assert.equal(report.coverage.complete_syntactic_pairs_n, 0);
  assert.deepEqual(report.coverage.absent_role_submissions, ['reviewer_a', 'reviewer_b']);
  assert.equal(report.preparation.bindings.gold.original_base64, raw.toString('base64'));
  for (const field of Object.values(report.coverage.per_field)) { assert.equal(field.pair_missing_n, 50); assert.equal(field.reviewer_a.missing_n, 50); }
  unknown(report);
});

test('actual browser filledPacket roundtrip of delivered50 is compatible with unchanged agreement and remains fictional', () => {
  const raw = fs.readFileSync(new URL('../../../public/datasets/filing-facts/v0/gold-packet-v0.json', import.meta.url)); const s = setup(JSON.parse(raw), raw);
  const declarations = answers(s.gold); declarations[s.gold.labels[0].id].answer_matches_filing = 'cannot_find'; declarations[s.gold.labels[0].id].notes = 'SYNTHETIC browser fixture finding';
  for (const name of ['reviewer_a', 'reviewer_b']) put(s, name, filledPacket(s.gold, declarations, s.intake.roles.find(r => r.role === name).handle, s.auditSettings.packet_sha256));
  const report = run(s); assert.equal(report.coverage.complete_syntactic_pairs_n, 50);
  assert.deepEqual(report.syntactic_agreement.complete_item_pairs_result, agreement(...s.submissions.map(raw => JSON.parse(raw)), s.gold));
  for (const row of report.submissions) assert.equal(row.packet.labels.length, 50);
  assert.equal(report.preparation.coverage.prepared_completed_review_pairs_n, 0); unknown(report);
});

test('one absent submission retains both role denominators and all selected pairs without inventing a packet', () => {
  const s = put(setup(), 'reviewer_b'); const report = run(s);
  assert.equal(report.coverage.selected_n, 3); assert.equal(report.role_coverage[0].selected_n, 3);
  assert.equal(report.submissions[0].packet, null); assert.equal(report.submissions[0].binding, null);
  assert.equal(report.role_coverage[1].complete_with_required_notes_n, 3);
  assert.equal(report.syntactic_agreement.complete_item_pairs_result, null); assert.equal(report.adjudication.item_tasks.length, 3);
  assert.deepEqual(report.adjudication.item_tasks[0].missing_submissions, ['reviewer_a']); unknown(report);
});

test('present blank browser exports remain distinct from absent role files and establish zero syntactic completion', () => {
  const s = setup(); for (const name of ['reviewer_a', 'reviewer_b']) put(s, name, filledPacket(s.gold, {}, s.intake.roles.find(r => r.role === name).handle, s.auditSettings.packet_sha256));
  const report = run(s); assert.equal(report.coverage.role_submissions_provided_n, 2); assert.equal(report.coverage.complete_syntactic_pairs_n, 0);
  assert.equal(report.syntactic_agreement.complete_item_pairs_result.coverage.expected, 3);
  assert.equal(report.role_coverage[0].submission_status, 'partial_syntactic_submission'); unknown(report);
});

test('partial judgements preserve per-field eligible missing and complete-pair coverage independently', () => {
  const s = complete(); change(s, 0, p => { p.labels[0].question_clear = ''; p.labels[1].answer_matches_filing = ''; });
  change(s, 1, p => { p.labels[0].citation_correct = ''; }); const report = run(s);
  assert.equal(report.coverage.selected_n, 3); assert.equal(report.coverage.complete_syntactic_pairs_n, 1);
  assert.equal(report.coverage.per_field.question_clear.pair_eligible_n, 2); assert.equal(report.coverage.per_field.answer_matches_filing.pair_missing_n, 1);
  assert.equal(report.coverage.per_field.citation_correct.reviewer_b.missing_n, 1);
  assert.equal(report.syntactic_agreement.complete_item_pairs_result.items, 1); unknown(report);
});

test('notes required for no and cannot_find remain missing work while field judgements remain eligible', () => {
  const s = complete(); change(s, 0, p => { p.labels[0].answer_matches_filing = 'cannot_find'; p.labels[0].notes = ''; });
  const report = run(s); assert.equal(report.role_coverage[0].complete_judgement_items_n, 3);
  assert.equal(report.role_coverage[0].complete_with_required_notes_n, 2); assert.equal(report.role_coverage[0].items_missing_required_notes_n, 1);
  assert.equal(report.coverage.per_field.answer_matches_filing.pair_eligible_n, 3);
  assert.deepEqual(report.adjudication.item_tasks[0].missing_fields, [{ role: 'reviewer_a', fields: ['notes'] }]);
  assert.deepEqual(report.adjudication.item_tasks[0].syntactic_disagreements, [{ field: 'answer_matches_filing', reviewer_a: 'cannot_find', reviewer_b: 'yes' }]); unknown(report);
});

test('partial-field disagreements are visible before complete-item agreement without creating adjudication decisions', () => {
  const s = complete(); change(s, 0, p => { p.labels[0].question_clear = 'no'; p.labels[0].citation_correct = ''; p.labels[0].notes = 'SYNTHETIC disputed wording'; });
  const report = run(s); assert.equal(report.syntactic_agreement.complete_item_pairs_result.disagreements.length, 0);
  assert.deepEqual(report.adjudication.item_tasks[0].syntactic_disagreements.map(row => row.field), ['question_clear']);
  assert.equal(report.adjudication.blank_submission.schema, 'canli.filing-facts-adjudication.v1'); unknown(report);
});

test('unchanged per-field Cohen kappa uses the eligible pairs and exposes null for a constant agreeing category', () => {
  const s = complete(); change(s, 0, p => { p.labels[0].question_clear = 'no'; p.labels[0].notes = 'SYNTHETIC note'; });
  change(s, 1, p => { p.labels[1].question_clear = 'no'; p.labels[1].notes = 'SYNTHETIC note'; });
  const report = run(s); assert.deepEqual(report.coverage.per_field.question_clear.syntactic_agreement, cohensKappa(['no', 'yes', 'yes'], ['yes', 'no', 'yes']));
  assert.equal(report.coverage.per_field.citation_correct.syntactic_agreement.kappa, null); unknown(report);
});

test('known NFKC trim and case alias collisions remain refused by unchanged intake before reconciliation', () => {
  for (const place of ['handle', 'alias', 'adjudicator']) {
    const s = setup(); s.intake.roles[0].handle = 'Alice';
    if (place === 'handle') s.intake.roles[1].handle = ' ＡＬＩＣＥ ';
    else s.intake.roles[place === 'alias' ? 1 : 2].aliases = [' ALICE ']; reject(s, 'INTAKE_IDENTITY_COLLISION');
  }
});

test('different handles shared employer and supplied credential claims establish no human expertise rights or independence', () => {
  const s = complete(); for (const row of s.intake.roles) row.affiliations = ['SYNTHETIC same employer'];
  s.intake.roles[0].qualifications = [{ id: 'synthetic-phd', kind: 'phd', title: 'SYNTHETIC PhD', task_relevance: 'SYNTHETIC task relevance', evidence_ids: ['doc'], verification: null }];
  const raw = Buffer.from('SYNTHETIC SOFTWARE FIXTURE; not a credential'); s.evidence.push(raw);
  s.evidenceInventory.evidence.push({ id: 'doc', packet_sha256: s.auditSettings.packet_sha256, purpose: 'qualification', subject: { role: 'reviewer_a', handle: s.intake.roles[0].handle, qualification_id: 'synthetic-phd' }, expected_sha256: hash(raw), expected_bytes: raw.length });
  const report = run(s); assert.equal(report.preparation.evidence_inventory[0].byte_binding_verified, true);
  assert.equal(report.preparation.evidence_inventory[0].document_authenticity, null); unknown(report);
});

test('delivered browser annotator trim is accepted while exact intake and inventory declarations remain bound', () => {
  const s = setup(); s.intake.roles[0].handle = ' synthetic-reviewer_a '; put(s, 'reviewer_a'); const report = run(s);
  assert.equal(report.submissions[0].declared_handle, ' synthetic-reviewer_a '); assert.equal(report.submissions[0].packet.annotator, 'synthetic-reviewer_a'); unknown(report);
});

test('swapped raw submissions cannot satisfy the other role even when expected raw pins are updated', () => {
  const s = complete(); const originals = s.submissions.map(raw => Buffer.from(raw)); replace(s, 0, originals[1]); replace(s, 1, originals[0]); reject(s, 'SUBMISSION_HANDLE');
});

test('a role inventory handle is exact and cannot substitute a supplied alias or another declared person', () => {
  for (const handle of ['different-handle', ' SYNTHETIC-REVIEWER_A ']) { const s = complete(); s.submissionInventory.submissions[0].declared_handle = handle; reject(s, 'SUBMISSION_HANDLE'); }
});

test('an undeclared reviewer or adjudicator cannot supply a reviewer return and duplicate roles are refused', () => {
  const s = put(setup(), 'reviewer_a'); s.intake.roles = s.intake.roles.filter(row => row.role !== 'reviewer_a'); reject(s, 'SUBMISSION_HANDLE');
  for (const name of ['adjudicator', 'expert', 'reviewer_a']) { const t = complete(); t.submissionInventory.submissions[1].role = name; reject(t, 'SUBMISSION_ROLE'); }
});

test('all submission inventory settings row and returned packet canonical pins independently refuse a foreign packet', () => {
  for (const target of ['inventory', 'settings', 'row', 'packet']) {
    const s = complete(); if (target === 'inventory') s.submissionInventory.packet_sha256 = '0'.repeat(64);
    if (target === 'settings') s.auditSettings.packet_sha256 = '0'.repeat(64);
    if (target === 'row') s.submissionInventory.submissions[0].packet_sha256 = '0'.repeat(64);
    if (target === 'packet') change(s, 0, p => { p.packet_sha256 = '0'.repeat(64); }); reject(s, 'PACKET_SHA');
  }
});

test('changed immutable question answer company template and filings are refused despite re-advertised raw hashes', () => {
  for (const field of ['question', 'answer', 'company', 'template', 'filings']) {
    const s = complete(); change(s, 0, p => { p.labels[0][field] = field === 'filings' ? ['https://example.invalid/foreign/'] : 'changed'; }); reject(s, 'PACKET_IMMUTABLE');
  }
});

test('missing extra duplicate and foreign immutable rows cannot shrink repair or replace the selected denominator', () => {
  for (const changeRows of [p => p.labels.pop(), p => p.labels.push(clone(p.labels[0])), p => { p.labels[1] = clone(p.labels[0]); }, p => { p.labels[0].id = 'foreign-item'; }]) {
    const s = complete(); change(s, 0, changeRows); reject(s);
  }
});

test('closed immutable row fields require every browser-export field and refuse hidden extra labels', () => {
  for (const mutation of [p => { delete p.labels[0].question; }, p => { delete p.labels[0].question_clear; }, p => { p.labels[0].verified = true; }, p => { p.expert_labels = 3; }]) {
    const s = complete(); change(s, 0, mutation); reject(s, 'FIELDS');
  }
});

test('same immutable IDs in a different raw row order remain explicitly raw-bound and compatible with gold scoring', () => {
  const s = complete(); change(s, 0, p => p.labels.reverse()); const report = run(s);
  assert.equal(report.submissions[0].packet.labels[0].id, s.gold.labels.at(-1).id);
  assert.deepEqual(report.syntactic_agreement.complete_item_pairs_result, agreement(...s.submissions.map(raw => JSON.parse(raw)), s.gold)); unknown(report);
});

test('schema guidelines vocabulary and packet annotator tampering are refused without browser-style sanitization', () => {
  for (const mutation of [p => { p.schema = 'foreign'; }, p => { p.guidelines = 'other'; }, p => { p.judgements.question_clear.push('maybe'); }, p => { p.annotator = 'other'; }]) {
    const s = complete(); change(s, 0, mutation); reject(s);
  }
});

test('only exact delivered judgement choices or blank strings are accepted and notes remain strings', () => {
  for (const value of ['Yes', ' yes ', 'maybe', null, false, 1, {}, []]) { const s = complete(); change(s, 0, p => { p.labels[0].question_clear = value; }); reject(s, 'JUDGEMENT'); }
  const s = complete(); change(s, 0, p => { p.labels[0].notes = 1; }); reject(s, 'NOTES');
});

test('independently supplied raw SHA and exact positive safe lengths cannot be silently recomputed by the utility', () => {
  const s = complete(); s.submissionInventory.submissions[0].expected_sha256 = '0'.repeat(64); reject(s, 'SUBMISSION_SHA');
  for (const value of [0, -1, 1, 1.5, '123']) { const t = complete(); t.submissionInventory.submissions[0].expected_bytes = value; reject(t, 'SUBMISSION_LENGTH'); }
  const t = complete(); t.submissions[0] = Buffer.concat([t.submissions[0], Buffer.from(' ')]); reject(t, 'SUBMISSION_SHA');
});

test('raw array inventory count and ordering are bound independently of role presentation order', () => {
  const s = complete(); s.submissions.pop(); reject(s, 'SUBMISSION_COUNT');
  const t = complete(); t.submissions.reverse(); reject(t, 'SUBMISSION_SHA');
  const u = complete(); u.submissions.reverse(); u.submissionInventory.submissions.reverse(); const report = run(u);
  assert.equal(report.submissions[0].role, 'reviewer_a'); assert.equal(report.coverage.complete_syntactic_pairs_n, 3); unknown(report);
});

test('unknown fields in inventory rows settings and top-level schemas cannot promote verified facts', () => {
  for (const location of ['inventory', 'row', 'settings']) {
    const s = complete(); if (location === 'inventory') s.submissionInventory.verified = true;
    else if (location === 'row') s.submissionInventory.submissions[0].authenticated = true; else s.auditSettings.rights_verified = true; reject(s, 'FIELDS');
  }
});

test('preparation is recomputed unchanged from captured six inputs including independently supplied gold and evidence pins', () => {
  const s = complete(); const report = run(s); assert.deepEqual(report.preparation, prepareExpertIntake(...args(s).slice(0, 6)));
  s.expectedGold = '0'.repeat(64); reject(s, 'INTAKE_GOLD_RAW_SHA');
});

test('owned original bindings and frozen packets survive caller mutation without changing any input bytes during invocation', () => {
  const s = complete(); const original = s.submissions.map(raw => Buffer.from(raw)); const rawGold = Buffer.from(s.rawGold); const report = run(s);
  assert.deepEqual(s.rawGold, rawGold); assert.deepEqual(s.submissions, original); const expected = report.content_hash;
  s.rawGold.fill(0); s.submissions[0].fill(1); s.submissionInventory.submissions[0].declared_handle = 'changed';
  assert.equal(report.submissions[0].binding.original_base64, original[0].toString('base64')); assert.equal(report.content_hash, expected);
  assert.ok(Object.isFrozen(report)); assert.ok(Object.isFrozen(report.submissions[0].packet.labels[0]));
  assert.throws(() => { report.adjudication.blank_submission.decisions.push({}); }, TypeError); unknown(report);
});

test('deterministic canonical report hash roundtrips while caller whole-source and dependency pins stay explicitly unverified', () => {
  const s = complete(); s.auditSettings.implementation_source_sha256 = 'a'.repeat(64); const report = run(s); assert.deepEqual(report, run(s));
  const restored = JSON.parse(JSON.stringify(report)); const expected = restored.content_hash; delete restored.content_hash;
  assert.equal(expected, `sha256:${hash(canonicalJson(restored))}`);
  assert.equal(report.implementation.declared_module_sha256, 'a'.repeat(64)); assert.equal(report.implementation.declared_module_sha256_verified, false);
  assert.equal(report.implementation.dependency_source_pins_verified, false); assert.match(report.implementation.behavior_sha256, /^[a-f0-9]{64}$/); unknown(report);
});

test('BMP supplementary control and escaped Unicode notes preserve exact bytes and canonical roundtrip', () => {
  const s = complete(); const note = 'SYNTHETIC é😀\u007f\n"\\ note'; change(s, 0, p => { p.labels[0].notes = note; });
  const report = run(s); assert.equal(report.submissions[0].packet.labels[0].notes, note);
  assert.equal(report.submissions[0].binding.bytes, s.submissions[0].length); assert.equal(report.submissions[0].binding.sha256, hash(s.submissions[0]));
  const restored = JSON.parse(JSON.stringify(report)); const expected = restored.content_hash; delete restored.content_hash; assert.equal(expected, `sha256:${hash(canonicalJson(restored))}`);
});

test('malformed UTF8 and unpaired raw or escaped Unicode are refused on the exact bound return bytes', () => {
  for (const [raw, code] of [[Buffer.from([0xff]), 'UTF8'], [Buffer.from('"\\ud800"'), 'UNICODE'], [Buffer.from([0xed, 0xa0, 0x80]), 'UTF8']]) {
    const s = put(setup(), 'reviewer_a'); replace(s, 0, raw); reject(s, code);
  }
});

test('duplicate decoded JSON members including escaped keys are refused before extracting a packet schema', () => {
  for (const raw of ['{"schema":"a","schema":"b"}', '{"schema":"a","\\u0073chema":"b"}']) { const s = put(setup(), 'reviewer_a'); replace(s, 0, Buffer.from(raw)); reject(s, 'DUPLICATE_KEY'); }
});

test('BOM trailing data and malformed JSON refuse the whole input without returning partial coverage', () => {
  for (const raw of ['\ufeff{}', '{} trailing', '{', '[1,]', '{"a":true,}']) { const s = put(setup(), 'reviewer_a'); replace(s, 0, Buffer.from(raw)); reject(s); }
});

test('strict JSON depth array decoded-string and numeric budgets reject bounded hostile submissions', () => {
  for (const [raw, code] of [['['.repeat(18) + '0' + ']'.repeat(18), 'DEPTH_BOUND'],
    [JSON.stringify(Array.from({ length: 257 }, () => 0)), 'ARRAY_BOUND'], [JSON.stringify('a'.repeat(4097)), 'STRING_BOUND'],
    ['{"n":-0}', 'NUMBER_RANGE'], ['{"n":1e999}', 'NUMBER_RANGE'], ['{"n":9007199254740993}', 'NUMBER_RANGE'],
    ['{"n":1.0000000000000001}', 'NUMBER_PRECISION'], ['{"n":' + '1'.repeat(129) + '}', 'NUMBER_BOUND']]) {
    const s = put(setup(), 'reviewer_a'); replace(s, 0, Buffer.from(raw)); reject(s, code);
  }
});

test('byte inputs reject strings wider typed arrays proxies subclasses and shared backing without callbacks', () => {
  const s = complete(); let calls = 0; class Child extends Uint8Array {}
  for (const input of ['{}', {}, new Uint16Array(3), new Child(s.submissions[0]), new Proxy(s.submissions[0], { get() { calls++; throw new Error('callback'); } }), new Uint8Array(new SharedArrayBuffer(8))]) {
    const a = args(s); a[7] = [input, s.submissions[1]]; assert.throws(() => reconcileExpertSubmissions(...a), ExpertSubmissionAuditError);
  }
  const a = args(s); a[1] = { toString() { calls++; return s.expectedGold; } }; assert.throws(() => reconcileExpertSubmissions(...a), ExpertSubmissionAuditError); assert.equal(calls, 0);
});

test('submission and evidence arrays reject sparse accessor decorated subclass and proxy containers without invoking getters', () => {
  const s = complete(); let calls = 0; const accessor = [s.submissions[0], s.submissions[1]]; Object.defineProperty(accessor, '0', { get() { calls++; throw new Error('getter'); } });
  const sparse = [s.submissions[0], s.submissions[1]]; delete sparse[0]; const extra = [...s.submissions]; extra.extra = true;
  class Child extends Array {} const child = new Child(...s.submissions); const proxy = new Proxy(s.submissions, { get() { calls++; throw new Error('proxy'); } });
  for (const container of [accessor, sparse, extra, child, proxy]) { const a = args(s); a[7] = container; assert.throws(() => reconcileExpertSubmissions(...a), ExpertSubmissionAuditError); }
  const evidence = []; Object.defineProperty(evidence, '0', { get() { calls++; throw new Error('evidence getter'); } });
  const a = args(s); a[4] = evidence; assert.throws(() => reconcileExpertSubmissions(...a), ExpertSubmissionAuditError); assert.equal(calls, 0);
});

test('native byte-slot capture accepts a nonshared view without consulting shadowed byte getters', () => {
  const s = complete(); let calls = 0; const backing = Buffer.concat([Buffer.from('xx'), s.submissions[0], Buffer.from('yy')]); const view = new Uint8Array(backing.buffer, backing.byteOffset + 2, s.submissions[0].length);
  for (const key of ['byteLength', 'buffer']) Object.defineProperty(view, key, { get() { calls++; throw new Error('shadowed getter'); } });
  const a = args(s); a[7] = [view, s.submissions[1]]; const report = reconcileExpertSubmissions(...a);
  assert.equal(report.submissions[0].binding.sha256, hash(s.submissions[0])); assert.equal(calls, 0); unknown(report);
});

test('new inventory settings and submission byte caps accept exact padded boundaries and refuse one byte over', () => {
  const s = put(setup(), 'reviewer_a'); replace(s, 0, pad(s.submissions[0], LIMITS.submissionBytes));
  const a = args(s); a[6] = pad(a[6], LIMITS.inventoryBytes); a[8] = pad(a[8], LIMITS.settingsBytes);
  const report = reconcileExpertSubmissions(...a); assert.equal(report.submissions[0].binding.bytes, LIMITS.submissionBytes);
  for (const index of [6, 8]) { const over = [...a]; over[index] = Buffer.concat([a[index], Buffer.from(' ')]); assert.throws(() => reconcileExpertSubmissions(...over), e => e.code === 'BYTE_BOUND'); }
  const over = [...a]; over[7] = [Buffer.concat([s.submissions[0], Buffer.from(' ')])]; assert.throws(() => reconcileExpertSubmissions(...over), e => e.code === 'BYTE_BOUND'); unknown(report);
});

test('exact4MiB aggregate is admitted and one extra byte refuses before parsing or derived report output', () => {
  const s = complete(); replace(s, 0, pad(s.submissions[0], LIMITS.submissionBytes));
  for (let pass = 0; pass < 3; pass++) {
    const a = args(s); const fixed = [0, 2, 3, 5, 6, 8].reduce((total, i) => total + a[i].length, 0) + s.submissions[0].length;
    replace(s, 1, pad(bytes(JSON.parse(s.submissions[1])), LIMITS.totalInputBytes - fixed));
  }
  const report = run(s); assert.equal(report.total_captured_input_bytes, LIMITS.totalInputBytes);
  replace(s, 1, Buffer.concat([s.submissions[1], Buffer.from(' ')])); reject(s, 'TOTAL_INPUT_BOUND'); unknown(report);
});

test('old gold intake evidence inventory and settings byte caps remain enforced through native copies', () => {
  const s = setup(); const original = args(s);
  for (const [index, cap] of [[0, EXPERT_INTAKE_LIMITS.goldBytes], [2, EXPERT_INTAKE_LIMITS.intakeBytes], [3, EXPERT_INTAKE_LIMITS.inventoryBytes], [5, EXPERT_INTAKE_LIMITS.settingsBytes]]) {
    const a = [...original]; a[index] = pad(a[index], cap); if (index === 0) a[1] = hash(a[index]); const report = reconcileExpertSubmissions(...a); unknown(report);
    a[index] = Buffer.concat([a[index], Buffer.from(' ')]); assert.throws(() => reconcileExpertSubmissions(...a), e => e.code === 'BYTE_BOUND');
  }
  const a = [...original]; a[4] = [Buffer.alloc(EXPERT_INTAKE_LIMITS.evidenceBytes + 1)]; assert.throws(() => reconcileExpertSubmissions(...a), e => e.code === 'BYTE_BOUND');
});

test('original evidence count total and complete intake aggregate caps remain independent of new4MiB policy', () => {
  const s = setup(); const a = args(s); a[4] = Array.from({ length: 65 }, () => Buffer.from('x')); assert.throws(() => reconcileExpertSubmissions(...a), e => e.code === 'EVIDENCE_BOUND');
  a[4] = Array.from({ length: 9 }, () => Buffer.alloc(EXPERT_INTAKE_LIMITS.evidenceBytes)); assert.throws(() => reconcileExpertSubmissions(...a), e => e.code === 'EVIDENCE_TOTAL_BOUND');
  a[4] = Array.from({ length: 8 }, () => Buffer.alloc(EXPERT_INTAKE_LIMITS.evidenceBytes)); a[0] = pad(a[0], EXPERT_INTAKE_LIMITS.goldBytes); a[1] = hash(a[0]);
  assert.throws(() => reconcileExpertSubmissions(...a), e => e.code === 'INTAKE_TOTAL_INPUT_BOUND');
});

test('empty byte payloads and more than two supplied return buffers are refused rather than silently ignored', () => {
  const s = complete(); const a = args(s); a[7] = [Buffer.alloc(0), s.submissions[1]]; assert.throws(() => reconcileExpertSubmissions(...a), e => e.code === 'BYTE_BOUND');
  a[7] = [...s.submissions, s.submissions[0]]; assert.throws(() => reconcileExpertSubmissions(...a), e => e.code === 'SUBMISSION_BOUND');
});

test('canonical Unicode output expansion above6MiB refuses the entire report while raw inputs remain within finite caps', () => {
  const s = setup(fixtureGold(128)); for (const name of ['reviewer_a', 'reviewer_b']) {
    const declarations = answers(s.gold); for (const answer of Object.values(declarations)) answer.notes = 'é'.repeat(4096);
    put(s, name, filledPacket(s.gold, declarations, s.intake.roles.find(r => r.role === name).handle, s.auditSettings.packet_sha256));
  }
  assert.ok(s.submissions.every(raw => raw.length < LIMITS.submissionBytes)); assert.ok(args(s).filter(Buffer.isBuffer).reduce((n, raw) => n + raw.length, 0) + s.submissions.reduce((n, raw) => n + raw.length, 0) < LIMITS.totalInputBytes);
  reject(s, 'REPORT_BOUND');
});

test('reconciliation is read-only with no filesystem network or socket calls and no input mutation', () => {
  const s = complete(); const a = args(s); const before = a.map(value => Buffer.isBuffer(value) ? hash(value) : null); let calls = 0;
  const saved = []; const guard = () => { calls++; throw new Error('UNEXPECTED SIDE EFFECT'); };
  for (const [object, keys] of [[fs, ['readFileSync', 'writeFileSync', 'openSync', 'readFile', 'writeFile', 'open']], [http, ['request', 'get']], [https, ['request', 'get']], [net, ['connect', 'createConnection']]]) {
    for (const key of keys) { saved.push([object, key, object[key]]); object[key] = guard; }
  }
  const fetch = globalThis.fetch; globalThis.fetch = guard; syncBuiltinESMExports();
  try { const report = reconcileExpertSubmissions(...a); assert.equal(report.coverage.selected_n, 3); unknown(report); }
  finally { for (const [object, key, value] of saved) object[key] = value; globalThis.fetch = fetch; syncBuiltinESMExports(); }
  assert.equal(calls, 0); assert.deepEqual(a.map(value => Buffer.isBuffer(value) ? hash(value) : null), before);
});

test('executable synthetic guide reconciles a real browser export with missing peer and unknown expert outcomes', async () => {
  const guide = fs.readFileSync(new URL('./EXPERT_SUBMISSION_AUDIT.md', import.meta.url), 'utf8');
  const match = guide.match(/<!-- executable-example:start -->\s*```js\n([\s\S]*?)\n```\s*<!-- executable-example:end -->/); assert.ok(match);
  const program = match[1].replaceAll("'./expert-submission-audit.mjs'", JSON.stringify(new URL('./expert-submission-audit.mjs', import.meta.url).href))
    .replaceAll("'../../../js/filing-facts-packet.js'", JSON.stringify(new URL('../../../js/filing-facts-packet.js', import.meta.url).href))
    .replaceAll("'../../../js/annotate-core.js'", JSON.stringify(new URL('../../../js/annotate-core.js', import.meta.url).href));
  const imported = await import(`data:text/javascript;base64,${Buffer.from(program).toString('base64')}`); const report = imported.exampleReport;
  assert.equal(report.coverage.selected_n, 1); assert.equal(report.role_coverage[0].complete_with_required_notes_n, 1); assert.deepEqual(report.coverage.absent_role_submissions, ['reviewer_b']); unknown(report);
});


test('decoded judgement notes string boundary is4096 units for BMP or supplementary pairs and refuses one unit over', () => {
  for (const note of ['é'.repeat(4096), '😀'.repeat(2048), 'a'.repeat(4096)]) {
    const s = complete(); change(s, 0, p => { p.labels[0].notes = note; }); const report = run(s); assert.equal(report.submissions[0].packet.labels[0].notes, note);
    change(s, 0, p => { p.labels[0].notes += 'x'; }); reject(s, 'STRING_BOUND');
  }
});

test('strict per-input JSON node budget refuses finite nested arrays before closed-field extraction', () => {
  const s = put(setup(), 'reviewer_a'); const raw = bytes(Array.from({ length: 129 }, () => Array.from({ length: 256 }, () => 0)));
  assert.ok(raw.length < LIMITS.submissionBytes); replace(s, 0, raw); reject(s, 'NODE_BOUND');
});

test('original opaque evidence wrong raw pin and source scope remain refused by unchanged intake', () => {
  const s = setup(); const raw = Buffer.from('SYNTHETIC fictional identity document'); s.evidence.push(raw);
  s.intake.roles[0].identity_evidence_ids = ['doc'];
  s.evidenceInventory.evidence.push({ id: 'doc', packet_sha256: s.auditSettings.packet_sha256, purpose: 'identity',
    subject: { role: 'reviewer_a', handle: s.intake.roles[0].handle }, expected_sha256: '0'.repeat(64), expected_bytes: raw.length });
  reject(s, 'INTAKE_EVIDENCE_SHA'); s.evidenceInventory.evidence[0].expected_sha256 = hash(raw);
  const report = run(s); assert.equal(report.preparation.evidence_inventory[0].binding.original_base64, raw.toString('base64')); unknown(report);
  s.evidenceInventory.evidence[0].subject.role = 'reviewer_b'; reject(s, 'INTAKE_EVIDENCE_SUBJECT');
});

test('inventory and audit settings independently enforce strict raw parsing and closed schema rather than trusting packet returns', () => {
  const s = complete(); const original = args(s);
  for (const index of [6, 8]) {
    for (const raw of [Buffer.from([0xff]), Buffer.from('{"schema":"a","schema":"b"}'), Buffer.from('null')]) {
      const a = [...original]; a[index] = raw; assert.throws(() => reconcileExpertSubmissions(...a), ExpertSubmissionAuditError);
    }
  }
});

test('ASCII return duplication and raw-binding expansion refuse reports above6MiB despite exact4MiB captured inputs', () => {
  const s = setup(fixtureGold(128)); for (const name of ['reviewer_a', 'reviewer_b']) {
    const declarations = answers(s.gold); for (const answer of Object.values(declarations)) answer.notes = 'a'.repeat(4096);
    put(s, name, filledPacket(s.gold, declarations, s.intake.roles.find(r => r.role === name).handle, s.auditSettings.packet_sha256));
  }
  replace(s, 0, pad(s.submissions[0], LIMITS.submissionBytes));
  for (let pass = 0; pass < 3; pass++) {
    const a = args(s); const fixed = [0, 2, 3, 5, 6, 8].reduce((total, i) => total + a[i].length, 0) + s.submissions[0].length;
    replace(s, 1, pad(bytes(JSON.parse(s.submissions[1])), LIMITS.totalInputBytes - fixed));
  }
  const a = args(s); assert.equal([0, 2, 3, 5, 6, 8].reduce((total, i) => total + a[i].length, 0) + s.submissions.reduce((total, raw) => total + raw.length, 0), LIMITS.totalInputBytes);
  reject(s, 'REPORT_BOUND');
});


test('CC-367 exact64 declared source SHA refuses every final line terminator while valid64 and null remain unverified', () => {
  for (const target of ['auditSettings', 'intakeSettings']) {
    for (const suffix of ['\n', '\r', '\u2028', '\u2029', '\r\n', ' ']) {
      const s = complete(); s[target].implementation_source_sha256 = 'a'.repeat(64) + suffix; reject(s, 'SHA');
    }
    for (const value of [null, 'a'.repeat(64)]) {
      const s = complete(); s[target].implementation_source_sha256 = value; const report = run(s);
      const binding = target === 'auditSettings' ? report.implementation : report.preparation.implementation;
      assert.equal(binding.declared_module_sha256, value); assert.equal(binding.declared_module_sha256_verified, false); unknown(report);
    }
  }
});
