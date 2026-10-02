import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prepareExpertIntake, ExpertIntakeError, EXPERT_INTAKE_LIMITS as LIMITS,
  EXPERT_INTAKE_SCHEMA, EXPERT_INVENTORY_SCHEMA, EXPERT_SETTINGS_SCHEMA } from './expert-intake.mjs';
import { goldPacket } from './gold-packet.mjs';
import { agreement, packetDigest, identity } from './agreement.mjs';
import { adjudicateGold } from './adjudicate.mjs';
import { canonicalJson } from '../../canonical-json.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = object => Buffer.from(JSON.stringify(object));
const clone = object => JSON.parse(JSON.stringify(object));
const sourceId = url => hash(Buffer.from(url, 'utf8'));
const FILES = [
  'https://example.invalid/filings/synthetic-a/',
  'https://example.invalid/filings/synthetic-b/',
];
function fixtureGold(n = 3) {
  const items = Array.from({ length: n }, (_, index) => ({ id: `fixture-${index}`, template: 'lookup',
    company: { name: 'Synthetic software fixture company' }, question: `Synthetic question ${index}: what is the supplied total?`,
    answer: { kind: 'number', value: index + 1, unit: 'USD' }, facts: [{ url: FILES[index % FILES.length] }] }));
  return goldPacket(items, n);
}
function role(name, handle = `synthetic-${name}`) {
  return { role: name, handle, aliases: [], affiliations: null, conflicts: null,
    identity_evidence_ids: [], independence_evidence_ids: [], qualifications: [] };
}
function qualification(id = 'fixture-qualification') {
  return { id, kind: 'phd', title: 'SYNTHETIC declared credential', task_relevance: 'Synthetic financial statement review',
    evidence_ids: [], verification: null };
}
function claim(id = 'fixture-rights') {
  return { id, declaration_text: 'SYNTHETIC declaration; not source clearance', allowed_uses: ['human_review'],
    denied_uses: [], evidence_ids: [], verification: null };
}
function setup(gold = fixtureGold()) {
  const packetSha = packetDigest(gold);
  return { gold, rawGold: bytes(gold), expectedGold: hash(bytes(gold)),
    intake: { schema: EXPERT_INTAKE_SCHEMA, packet_sha256: packetSha, roles: [], sources: [] },
    inventory: { schema: EXPERT_INVENTORY_SCHEMA, evidence: [] }, evidence: [],
    settings: { schema: EXPERT_SETTINGS_SCHEMA, packet_sha256: packetSha, required_uses: ['human_review'],
      prepared_on: '2026-10-02', implementation_source_sha256: null } };
}
function prepare(s) {
  return prepareExpertIntake(s.rawGold, s.expectedGold, bytes(s.intake), bytes(s.inventory), s.evidence, bytes(s.settings));
}
function reject(s, code) {
  assert.throws(() => prepare(s), error => error instanceof ExpertIntakeError && error.code === code);
}
function addEvidence(s, id, purpose, subject, payload = Buffer.from('SYNTHETIC SOFTWARE FIXTURE; no real credential or rights evidence')) {
  s.inventory.evidence.push({ id, packet_sha256: s.settings.packet_sha256, purpose, subject,
    expected_sha256: hash(payload), expected_bytes: payload.length }); s.evidence.push(payload);
}
function withRoles() {
  const s = setup(); s.intake.roles = ['reviewer_a', 'reviewer_b', 'adjudicator'].map(name => role(name)); return s;
}
function boundRoleEvidence(purpose = 'identity') {
  const s = withRoles(); const a = s.intake.roles[0]; let subject = { role: a.role, handle: a.handle };
  if (purpose === 'qualification') { const q = qualification(); a.qualifications.push(q); q.evidence_ids = ['doc']; subject.qualification_id = q.id; }
  else if (purpose === 'conflict') { a.conflicts = [{ id: 'conflict-a', description: 'Synthetic declared conflict', evidence_ids: ['doc'] }]; subject.conflict_id = 'conflict-a'; }
  else a[`${purpose}_evidence_ids`] = ['doc'];
  addEvidence(s, 'doc', purpose, subject); return s;
}
function boundSourceEvidence() {
  const s = setup(); const url = s.gold.labels[0].filings[0]; const id = sourceId(url);
  const c = claim(); c.evidence_ids = ['rights-doc']; s.intake.sources = [{ source_id: id, url, claims: [c] }];
  addEvidence(s, 'rights-doc', 'source_rights', { source_id: id, url }); return s;
}

test('synthetic goldPacket copies bind the existing digest and retain every immutable item and blank judgement', () => {
  const s = withRoles(); const report = prepare(s);
  assert.equal(report.packet_sha256, packetDigest(s.gold)); assert.equal(report.coverage.selected_n, 3);
  assert.equal(report.coverage.prepared_item_assignments, 6);
  for (const copy of report.review_packets) {
    assert.deepEqual(copy.packet.labels, s.gold.labels); assert.equal(packetDigest(copy.packet), packetDigest(s.gold));
    for (const row of copy.packet.labels) for (const field of ['question_clear', 'answer_matches_filing', 'citation_correct', 'notes']) assert.equal(row[field], '');
  }
  const compared = agreement(...report.review_packets.map(row => row.packet), s.gold);
  assert.equal(compared.coverage.expected, 3); assert.equal(compared.coverage.complete_pairs, 0);
  assert.equal(compared.coverage.incomplete.length, 6);
  const adjudicated = adjudicateGold(s.gold, ...report.review_packets.map(row => row.packet), report.adjudication.blank_submission);
  assert.deepEqual(adjudicated.counts, { expected: 3, accepted: 0, rejected: 0, pending: 3 });
});

test('published fifty-item blank gold remains exact, prepares one hundred assignments and creates no human labels', () => {
  const raw = readFileSync(new URL('../../../public/datasets/filing-facts/v0/gold-packet-v0.json', import.meta.url));
  assert.equal(hash(raw), '91c6f960e34509653800a4cda81bd0632dd58c889ee78eb6461a985765500413');
  const gold = JSON.parse(raw); const s = setup(gold); s.rawGold = raw; s.expectedGold = hash(raw);
  const report = prepare(s); assert.equal(report.coverage.selected_n, 50); assert.equal(report.coverage.prepared_item_assignments, 100);
  for (const copy of report.review_packets) { assert.deepEqual(copy.packet.labels, gold.labels); assert.equal(packetDigest(copy.packet), packetDigest(gold)); }
  assert.equal(report.established.expert_labelled_items_n, null); assert.equal(hash(raw), s.expectedGold);
});

test('missing all roles preserves both unassigned blank packets, all sources and a distinct adjudicator checklist', () => {
  const s = setup(); const report = prepare(s);
  assert.deepEqual(report.coverage.missing_roles, ['reviewer_a', 'reviewer_b', 'adjudicator']);
  assert.equal(report.coverage.declared_roles_n, 0); assert.equal(report.review_packets.length, 2);
  for (const copy of report.review_packets) { assert.equal(copy.declared_handle, null); assert.equal(copy.packet.annotator, ''); assert.equal(copy.packet.labels.length, 3); }
  assert.equal(report.adjudication.declared_handle, null); assert.equal(report.adjudication.item_tasks.length, 3);
  assert.deepEqual(report.adjudication.blank_submission.decisions, []); assert.equal(report.coverage.distinct_sources_n, 2);
  assert.equal(report.coverage.sources_missing_declaration_n, 2);
});

test('one declared reviewer and missing evidence never shrink the selected item denominator or promote coverage', () => {
  const s = setup(); const a = role('reviewer_a'); a.identity_evidence_ids = ['missing-identity'];
  const q = qualification(); q.evidence_ids = ['missing-qualification']; a.qualifications = [q]; s.intake.roles = [a];
  const report = prepare(s); assert.equal(report.coverage.selected_n, 3); assert.equal(report.coverage.prepared_item_assignments, 6);
  assert.deepEqual(report.coverage.evidence_missing_ids, ['missing-identity', 'missing-qualification']);
  assert.equal(report.role_worklists[0].identity_evidence.provided.length, 0);
  assert.equal(report.role_worklists[0].qualifications[0].task_expertise_verified, null);
  assert.equal(report.established.authenticated_humans_n, null);
});

test('declared PhD CFA engineering and verification provenance remain unverified despite exact supplied evidence', () => {
  const s = boundRoleEvidence('qualification'); const a = s.intake.roles[0]; const q = a.qualifications[0];
  q.verification = { who: 'synthetic-verifier', date: '2026-10-01', method: 'Synthetic caller claim', evidence_ids: ['doc'] };
  for (const kind of ['cfa', 'engineering', 'other']) a.qualifications.push({ ...qualification(`fixture-${kind}`), kind });
  const report = prepare(s); const tasks = report.role_worklists[0].qualifications;
  assert.equal(tasks.length, 4); assert.equal(tasks[0].evidence.provided[0].sha256, hash(s.evidence[0]));
  assert.equal(tasks[0].declared_verification_evidence.provided.length, 1);
  for (const task of tasks) { assert.equal(task.qualification_authenticity_verified, null); assert.equal(task.task_expertise_verified, null); }
  assert.equal(report.established.verified_experts_n, null); assert.equal(report.established.admitted_for_human_review, null);
});

test('shared affiliation and declared conflicts are retained without inferring dependence or independence', () => {
  const s = boundRoleEvidence('conflict'); for (const row of s.intake.roles) row.affiliations = ['SYNTHETIC same employer'];
  const report = prepare(s); assert.equal(report.coverage.declared_roles_n, 3);
  assert.equal(report.role_worklists[0].conflicts[0].evidence.provided.length, 1);
  for (const row of report.role_worklists) assert.equal(row.actual_independence_verified, null);
  assert.equal(report.established.verified_independent_reviewers_n, null);
});

test('NFKC trim and case identity collisions match agreement and refuse overlapping reviewer handles', () => {
  const s = withRoles(); s.intake.roles[0].handle = 'Alice'; s.intake.roles[1].handle = ' ＡＬＩＣＥ ';
  assert.equal(identity(s.intake.roles[0].handle), identity(s.intake.roles[1].handle)); reject(s, 'IDENTITY_COLLISION');
});

test('aliases cannot conceal an adjudicator collision or repeat an already normalized same-role identity', () => {
  for (const sameRole of [false, true]) {
    const s = withRoles(); s.intake.roles[sameRole ? 0 : 2].aliases = [` ${s.intake.roles[0].handle.toUpperCase()} `];
    reject(s, 'IDENTITY_COLLISION');
  }
});

test('duplicate or unknown role declarations and nonstring stable handles are refused', () => {
  for (const change of [s => s.intake.roles.push(role('reviewer_a')), s => { s.intake.roles[0].role = 'expert'; },
    s => { s.intake.roles[0].handle = 123; }, s => { s.intake.roles[0].aliases = [false]; }]) {
    const s = setup(); s.intake.roles = [role('reviewer_a')]; change(s); assert.throws(() => prepare(s), ExpertIntakeError);
  }
});

test('a provided verified boolean or expert flag is an unknown field and cannot override intake uncertainty', () => {
  for (const place of ['role', 'qualification', 'evidence', 'settings']) {
    const s = boundRoleEvidence('qualification'); const target = place === 'role' ? s.intake.roles[0] : place === 'qualification' ? s.intake.roles[0].qualifications[0] : place === 'evidence' ? s.inventory.evidence[0] : s.settings;
    target.verified = true; reject(s, 'FIELDS');
  }
});

test('opaque native evidence is retained byte-for-byte including binary bytes without asserting document authenticity', () => {
  const s = boundRoleEvidence(); const raw = Buffer.from([0xff, 0x00, 0xc0, 0xaf, 0x7f]); s.evidence[0] = raw;
  s.inventory.evidence[0].expected_sha256 = hash(raw); s.inventory.evidence[0].expected_bytes = raw.length;
  const report = prepare(s); const entry = report.evidence_inventory[0];
  assert.deepEqual(Buffer.from(entry.binding.original_base64, 'base64'), raw); assert.equal(entry.document_authenticity, null);
  assert.equal(entry.byte_binding_verified, true); assert.equal(entry.referenced, true);
});

test('advertised evidence hash cannot conceal different bytes or reordered buffer attachments', () => {
  const s = boundRoleEvidence(); s.evidence[0] = Buffer.from('SYNTHETIC substituted document'); reject(s, 'EVIDENCE_SHA');
  const pair = boundRoleEvidence(); const a = pair.intake.roles[0]; a.independence_evidence_ids = ['ind-doc'];
  addEvidence(pair, 'ind-doc', 'independence', { role: a.role, handle: a.handle }, Buffer.from('SYNTHETIC distinct second document'));
  pair.evidence.reverse(); reject(pair, 'EVIDENCE_SHA');
});

test('separate exact evidence length and native buffer inventory cardinality are enforced', () => {
  const s = boundRoleEvidence(); s.inventory.evidence[0].expected_bytes++; reject(s, 'EVIDENCE_LENGTH');
  const missing = boundRoleEvidence(); missing.evidence = []; reject(missing, 'EVIDENCE_COUNT');
});

test('evidence for another declared reviewer cannot satisfy an identity reference', () => {
  const s = boundRoleEvidence(); const b = s.intake.roles[1];
  s.inventory.evidence[0].subject = { role: b.role, handle: b.handle }; reject(s, 'EVIDENCE_SUBJECT');
});

test('valid identity evidence cannot be repurposed as qualification or independence evidence', () => {
  const s = boundRoleEvidence(); const a = s.intake.roles[0]; a.independence_evidence_ids = ['doc']; reject(s, 'EVIDENCE_SUBJECT');
  const q = boundRoleEvidence('qualification'); q.inventory.evidence[0].purpose = 'identity'; delete q.inventory.evidence[0].subject.qualification_id;
  reject(q, 'EVIDENCE_SUBJECT');
});

test('qualification and conflict evidence must name the exact declared qualification or conflict', () => {
  for (const purpose of ['qualification', 'conflict']) {
    const s = boundRoleEvidence(purpose); s.inventory.evidence[0].subject[`${purpose}_id`] = 'wrong'; reject(s, 'EVIDENCE_SUBJECT');
  }
});

test('foreign packet evidence is refused even when the document bytes and own hash are valid', () => {
  const s = boundRoleEvidence(); s.inventory.evidence[0].packet_sha256 = '0'.repeat(64); reject(s, 'EVIDENCE_PACKET');
});

test('rights evidence bound to another cited source cannot clear the selected source declaration', () => {
  const s = boundSourceEvidence(); const other = s.gold.labels.find(row => row.filings[0] !== s.intake.sources[0].url).filings[0];
  s.inventory.evidence[0].subject = { source_id: sourceId(other), url: other }; reject(s, 'EVIDENCE_SUBJECT');
});

test('source ID URL substitution and uncited source declarations are refused without dropping packet sources', () => {
  const s = boundSourceEvidence(); s.intake.sources[0].url += 'changed/'; reject(s, 'SOURCE_BINDING');
  const other = setup(); const url = 'https://example.invalid/uncited/'; other.intake.sources = [{ source_id: sourceId(url), url, claims: [] }];
  reject(other, 'SOURCE_BINDING');
});

test('duplicate evidence IDs qualification IDs source records and rights claim IDs refuse rather than overwrite', () => {
  for (const place of ['evidence', 'qualification', 'source', 'claim']) {
    const s = place === 'evidence' || place === 'qualification' ? boundRoleEvidence('qualification') : boundSourceEvidence();
    if (place === 'evidence') { s.inventory.evidence.push(clone(s.inventory.evidence[0])); s.evidence.push(Buffer.from(s.evidence[0])); }
    if (place === 'qualification') s.intake.roles[0].qualifications.push(clone(s.intake.roles[0].qualifications[0]));
    if (place === 'source') s.intake.sources.push(clone(s.intake.sources[0]));
    if (place === 'claim') s.intake.sources[0].claims.push(clone(s.intake.sources[0].claims[0]));
    reject(s, 'DUPLICATE_ID');
  }
});

test('unreferenced but correctly bound evidence stays in the inventory with explicit unreferenced coverage', () => {
  const s = boundRoleEvidence(); s.intake.roles[0].identity_evidence_ids = [];
  const report = prepare(s); assert.deepEqual(report.coverage.evidence_unreferenced_ids, ['doc']);
  assert.equal(report.evidence_inventory.length, 1); assert.equal(report.evidence_inventory[0].referenced, false);
  assert.equal(report.established.authenticated_humans_n, null);
});

test('complete declared rights scope with matching synthetic bytes never becomes actual clearance or release admission', () => {
  const s = boundSourceEvidence(); s.settings.required_uses = ['human_review', 'training', 'redistribution'];
  const c = s.intake.sources[0].claims[0]; c.allowed_uses = [...s.settings.required_uses];
  c.verification = { who: 'synthetic-checker', date: '2026-10-01', method: 'SYNTHETIC assertion, not independent clearance', evidence_ids: ['rights-doc'] };
  const report = prepare(s); const task = report.source_worklists.find(row => row.source_id === s.intake.sources[0].source_id);
  assert.deepEqual(task.mechanical_flags.uncovered_required_uses, []); assert.equal(task.mechanical_flags.missing_declared_evidence, false);
  assert.equal(task.actual_rights_verified, null); assert.equal(task.admitted_for_release, null);
  assert.equal(report.established.verified_source_rights_n, null); assert.equal(report.coverage.sources_missing_declaration_n, 1);
});

test('public-origin or licence text without use declarations remains unknown and missing evidence is visible', () => {
  const s = boundSourceEvidence(); const c = s.intake.sources[0].claims[0]; c.declaration_text = 'Public SEC origin and CC BY are caller declarations only';
  c.allowed_uses = null; c.denied_uses = null; c.evidence_ids = ['missing-rights']; s.inventory.evidence = []; s.evidence = [];
  const report = prepare(s); const task = report.source_worklists.find(row => row.source_id === s.intake.sources[0].source_id);
  assert.equal(task.mechanical_flags.unknown_use_scope, true); assert.equal(task.mechanical_flags.missing_declared_evidence, true);
  assert.deepEqual(report.coverage.evidence_missing_ids, ['missing-rights']); assert.equal(task.actual_rights_verified, null);
});

test('contradictory allowed and denied uses across claims are exposed mechanically while distinct restrictions stay distinct', () => {
  const s = boundSourceEvidence(); const other = claim('restriction'); other.allowed_uses = []; other.denied_uses = ['human_review'];
  s.intake.sources[0].claims.push(other); const report = prepare(s); const task = report.source_worklists[0];
  assert.deepEqual(task.mechanical_flags.contradictory_use_claims, ['human_review']);
  other.denied_uses = ['training']; const resolved = prepare(s).source_worklists[0];
  assert.deepEqual(resolved.mechanical_flags.contradictory_use_claims, []); assert.equal(resolved.actual_rights_verified, null);
});

test('requested training or redistribution outside declared scope remains uncovered or restricted', () => {
  const s = boundSourceEvidence(); s.settings.required_uses = ['human_review', 'training', 'redistribution'];
  s.intake.sources[0].claims[0].denied_uses = ['training']; const task = prepare(s).source_worklists[0];
  assert.deepEqual(task.mechanical_flags.uncovered_required_uses, ['training', 'redistribution']);
  assert.deepEqual(task.mechanical_flags.restricted_required_uses, ['training']); assert.equal(task.admitted_for_human_review, null);
});

test('raw gold hash and independently supplied canonical content pin detect altered immutable questions', () => {
  const s = setup(); const changed = clone(s.gold); changed.labels[0].question += ' edited'; s.rawGold = bytes(changed); reject(s, 'GOLD_RAW_SHA');
  s.expectedGold = hash(s.rawGold); reject(s, 'PACKET_SHA');
  const falseHash = setup(); falseHash.expectedGold = 'F'.repeat(64); reject(falseHash, 'SHA');
});

test('completed gold judgements notes or annotator declarations cannot be converted back into blank intake', () => {
  for (const field of ['question_clear', 'answer_matches_filing', 'citation_correct', 'notes', 'annotator']) {
    const s = setup(); const changed = clone(s.gold);
    if (field === 'annotator') changed.annotator = 'synthetic-completed'; else changed.labels[0][field] = field === 'notes' ? 'Synthetic prior note' : 'yes';
    s.rawGold = bytes(changed); s.expectedGold = hash(s.rawGold); reject(s, 'BLANK_GOLD');
  }
});

test('unknown gold fields or a changed judgement vocabulary cannot alter the existing annotation contract', () => {
  for (const change of [gold => { gold.labels[0].expert = true; }, gold => { gold.judgements.question_clear.push('maybe'); },
    gold => { gold.guidelines = 'different-guidelines'; }, gold => { gold.labels[0].filings = []; }]) {
    const s = setup(); const changed = clone(s.gold); change(changed); s.rawGold = bytes(changed); s.expectedGold = hash(s.rawGold);
    assert.throws(() => prepare(s), ExpertIntakeError);
  }
});

test('raw packet ordering changes its raw binding while the existing ID-sorted canonical digest stays compatible', () => {
  const s = setup(); const reverse = clone(s.gold); reverse.labels.reverse(); s.rawGold = bytes(reverse); s.expectedGold = hash(s.rawGold);
  const report = prepare(s); assert.equal(report.packet_sha256, packetDigest(s.gold));
  assert.deepEqual(report.review_packets[0].packet.labels.map(row => row.id), reverse.labels.map(row => row.id));
  assert.notEqual(report.bindings.gold.sha256, hash(bytes(s.gold)));
});

test('intake and settings canonical packet bindings independently refuse foreign packet declarations', () => {
  for (const target of ['intake', 'settings']) { const s = setup(); s[target].packet_sha256 = '0'.repeat(64); reject(s, 'PACKET_SHA'); }
});

test('all returned bindings own their bytes and input buffers remain unchanged after immutable preparation', () => {
  const s = boundRoleEvidence(); const before = Buffer.from(s.evidence[0]); const report = prepare(s);
  assert.deepEqual(s.evidence[0], before); const captured = Buffer.from(report.evidence_inventory[0].binding.original_base64, 'base64');
  s.rawGold.fill(0); s.evidence[0].fill(1); s.intake.roles[0].handle = 'changed-after-return';
  assert.deepEqual(captured, before); assert.equal(report.role_worklists[0].declared_handle, 'synthetic-reviewer_a');
  assert.ok(Object.isFrozen(report)); assert.ok(Object.isFrozen(report.review_packets[0].packet.labels[0]));
  assert.throws(() => { report.review_packets[0].packet.labels[0].notes = 'mutation'; }, TypeError);
});

test('canonical report content hash is deterministic through JSON roundtrip and whole-source declarations stay unverified', () => {
  const s = boundRoleEvidence(); s.settings.implementation_source_sha256 = 'a'.repeat(64);
  const first = prepare(s); const second = prepare(s); assert.deepEqual(first, second);
  const recovered = JSON.parse(JSON.stringify(first)); const expected = recovered.content_hash; delete recovered.content_hash;
  assert.equal(`sha256:${hash(canonicalJson(recovered))}`, expected); assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(first.implementation.declared_module_sha256, 'a'.repeat(64)); assert.equal(first.implementation.declared_module_sha256_verified, false);
  assert.match(first.implementation.behavior_sha256, /^[a-f0-9]{64}$/);
});

test('malformed UTF8 and raw or escaped unpaired Unicode refuse without replacement-byte repair', () => {
  const s = setup();
  for (const [raw, code] of [[Buffer.from([0xc0, 0xaf]), 'UTF8'],
    [Buffer.concat([Buffer.from('{"schema":"'), Buffer.from([0xed, 0xa0, 0x80]), Buffer.from('"}')]), 'UTF8'],
    [Buffer.from('{"schema":"\\ud800"}'), 'UNICODE']]) {
    assert.throws(() => prepareExpertIntake(s.rawGold, s.expectedGold, raw, bytes(s.inventory), [], bytes(s.settings)), error => error.code === code);
  }
});

test('duplicate decoded JSON members including escaped keys are refused before schema extraction', () => {
  const s = setup();
  for (const raw of ['{"schema":"a","schema":"b"}', '{"schema":"a","\\u0073chema":"b"}']) {
    assert.throws(() => prepareExpertIntake(s.rawGold, s.expectedGold, Buffer.from(raw), bytes(s.inventory), [], bytes(s.settings)), error => error.code === 'DUPLICATE_KEY');
  }
});

test('prototype-like unknown keys malformed JSON BOM and trailing syntax cannot pass a closed input schema', () => {
  const s = setup();
  for (const raw of ['{"__proto__":{"polluted":true}}', '\ufeff{}', '{} trailing', '{"schema":', '[1,]', '{"a":true,}']) {
    assert.throws(() => prepareExpertIntake(s.rawGold, s.expectedGold, Buffer.from(raw), bytes(s.inventory), [], bytes(s.settings)), ExpertIntakeError);
  }
  assert.equal({}.polluted, undefined);
});

test('lossy numeric literals negative zero nonfinite values and coercive evidence counts are refused', () => {
  const s = boundRoleEvidence(); const raw = JSON.stringify(s.inventory);
  for (const literal of ['-0', '1e999', '9007199254740993', '0.10000000000000001', '"64"', 'false']) {
    const changed = raw.replace(/"expected_bytes":\d+/, `"expected_bytes":${literal}`);
    assert.throws(() => prepareExpertIntake(s.rawGold, s.expectedGold, bytes(s.intake), Buffer.from(changed), s.evidence, bytes(s.settings)), ExpertIntakeError);
  }
});

test('calendar-invalid verification dates and unknown qualification use or purpose values are refused', () => {
  const s = boundRoleEvidence('qualification'); s.intake.roles[0].qualifications[0].verification = { who: 'fixture', date: '2026-02-30', method: 'fixture', evidence_ids: [] };
  reject(s, 'DATE');
  const u = setup(); u.settings.required_uses = ['all-rights']; reject(u, 'USE');
  const p = boundRoleEvidence(); p.inventory.evidence[0].purpose = 'expert-verified'; reject(p, 'EVIDENCE_PURPOSE');
});

test('byte input proxies subclasses shared backing and boxed hashes cannot execute custom conversion hooks', () => {
  const s = setup(); let callbacks = 0;
  class CustomBytes extends Uint8Array { get byteLength() { callbacks++; return 1; } }
  for (const input of [new Proxy(s.rawGold, { get() { callbacks++; throw new Error('trap'); } }), new CustomBytes([1]), new Uint8Array(new SharedArrayBuffer(8))]) {
    assert.throws(() => prepareExpertIntake(input, s.expectedGold, bytes(s.intake), bytes(s.inventory), [], bytes(s.settings)), ExpertIntakeError);
  }
  const boxed = { toString() { callbacks++; return s.expectedGold; }, valueOf() { callbacks++; return s.expectedGold; } };
  assert.throws(() => prepareExpertIntake(s.rawGold, boxed, bytes(s.intake), bytes(s.inventory), [], bytes(s.settings)), ExpertIntakeError);
  assert.equal(callbacks, 0);
});

test('native Uint8Array subviews and poisoned own byte getters copy the actual native slots without invoking accessors', () => {
  const s = setup(); const padded = Buffer.concat([Buffer.from('xx'), s.rawGold, Buffer.from('yy')]);
  const view = new Uint8Array(padded.buffer, padded.byteOffset + 2, s.rawGold.length); let callbacks = 0;
  for (const key of ['length', 'byteLength', 'buffer']) Object.defineProperty(view, key, { get() { callbacks++; throw new Error('accessor'); } });
  const report = prepareExpertIntake(view, s.expectedGold, bytes(s.intake), bytes(s.inventory), [], bytes(s.settings));
  assert.equal(report.bindings.gold.sha256, s.expectedGold); assert.equal(callbacks, 0);
});

test('evidence array accessors proxies sparse entries and unexpected keys refuse without callback invocation', () => {
  const s = setup(); let callbacks = 0; const getter = [];
  Object.defineProperty(getter, '0', { get() { callbacks++; throw new Error('getter'); }, enumerable: true });
  const extra = []; extra.unexpected = Buffer.from('x');
  const proxied = new Proxy([], { ownKeys() { callbacks++; throw new Error('proxy'); } });
  for (const evidence of [getter, proxied, new Array(1), extra]) {
    assert.throws(() => prepareExpertIntake(s.rawGold, s.expectedGold, bytes(s.intake), bytes(s.inventory), evidence, bytes(s.settings)), ExpertIntakeError);
  }
  assert.equal(callbacks, 0);
});

test('raw byte maxima accept bounded whitespace but independently reject every overlimit input', () => {
  const s = setup(); const padded = (raw, length) => Buffer.concat([raw, Buffer.alloc(length - raw.length, 0x20)]);
  const gold = padded(s.rawGold, LIMITS.goldBytes); const intake = padded(bytes(s.intake), LIMITS.intakeBytes);
  const inventory = padded(bytes(s.inventory), LIMITS.inventoryBytes); const settings = padded(bytes(s.settings), LIMITS.settingsBytes);
  const report = prepareExpertIntake(gold, hash(gold), intake, inventory, [], settings);
  assert.equal(report.coverage.selected_n, 3); assert.equal(report.bindings.gold.bytes, LIMITS.goldBytes);
  for (const args of [[Buffer.alloc(LIMITS.goldBytes + 1), s.expectedGold, bytes(s.intake), bytes(s.inventory), [], bytes(s.settings)],
    [s.rawGold, s.expectedGold, Buffer.alloc(LIMITS.intakeBytes + 1), bytes(s.inventory), [], bytes(s.settings)],
    [s.rawGold, s.expectedGold, bytes(s.intake), Buffer.alloc(LIMITS.inventoryBytes + 1), [], bytes(s.settings)],
    [s.rawGold, s.expectedGold, bytes(s.intake), bytes(s.inventory), [], Buffer.alloc(LIMITS.settingsBytes + 1)]]) {
    assert.throws(() => prepareExpertIntake(...args), error => error.code === 'BYTE_BOUND');
  }
});

test('evidence item count per-file and aggregate byte caps refuse before a partial result can be returned', () => {
  const s = setup();
  for (const [evidence, code] of [[Array.from({ length: LIMITS.evidence + 1 }, () => Buffer.from('x')), 'EVIDENCE_BOUND'],
    [[Buffer.alloc(LIMITS.evidenceBytes + 1)], 'BYTE_BOUND'],
    [Array.from({ length: 9 }, () => Buffer.alloc(LIMITS.evidenceBytes)), 'EVIDENCE_TOTAL_BOUND']]) {
    assert.throws(() => prepareExpertIntake(s.rawGold, s.expectedGold, bytes(s.intake), bytes(s.inventory), evidence, bytes(s.settings)), error => error.code === code);
  }
});

test('combined raw input budget refuses an individually bounded plan without truncating evidence', () => {
  const s = setup(); const padded = Buffer.concat([s.rawGold, Buffer.alloc(LIMITS.goldBytes - s.rawGold.length, 0x20)]);
  const evidence = Array.from({ length: 8 }, () => Buffer.alloc(LIMITS.evidenceBytes));
  assert.throws(() => prepareExpertIntake(padded, hash(padded), bytes(s.intake), bytes(s.inventory), evidence, bytes(s.settings)), error => error.code === 'TOTAL_INPUT_BOUND');
});

test('item source alias qualification and claim budgets refuse excess instead of silently dropping selected inputs', () => {
  const many = setup(); const gold = clone(many.gold);
  gold.labels = Array.from({ length: LIMITS.items + 1 }, (_, i) => ({ ...gold.labels[0], id: `over-${i}` }));
  many.rawGold = bytes(gold); many.expectedGold = hash(many.rawGold); reject(many, 'ITEM_BOUND');
  for (const key of ['aliases', 'qualifications']) {
    const s = withRoles(); s.intake.roles[0][key] = Array.from({ length: 9 }, (_, i) => key === 'aliases' ? `alias-${i}` : qualification(`q-${i}`));
    assert.throws(() => prepare(s), ExpertIntakeError);
  }
  const claims = boundSourceEvidence(); claims.intake.sources[0].claims = Array.from({ length: 9 }, (_, i) => claim(`c-${i}`));
  assert.throws(() => prepare(claims), ExpertIntakeError);
  const sources = setup(); const sourceGold = clone(sources.gold);
  sourceGold.labels = Array.from({ length: 9 }, (_, i) => ({ ...sourceGold.labels[0], id: `i-${i}`,
    filings: Array.from({ length: 16 }, (_, j) => `https://example.invalid/unique/${i}/${j}/`) }));
  sources.rawGold = bytes(sourceGold); sources.expectedGold = hash(sources.rawGold); reject(sources, 'SOURCE_BOUND');
});

test('strict JSON depth array string node and numeric-token budgets are enforced independently of schema', () => {
  const s = setup(); const rawInputs = [
    ['['.repeat(18) + '0' + ']'.repeat(18), 'DEPTH_BOUND'],
    [JSON.stringify(Array(257).fill(null)), 'ARRAY_BOUND'],
    [JSON.stringify('x'.repeat(4097)), 'STRING_BOUND'],
    [JSON.stringify(Array.from({ length: 256 }, () => Array(128).fill(0))), 'NODE_BOUND'],
    ['1.' + '0'.repeat(128), 'NUMBER_BOUND'],
  ];
  for (const [raw, code] of rawInputs) {
    // Node fixture uses the larger gold byte argument, retaining the same independent raw SHA.
    const input = Buffer.from(raw); assert.ok(input.length <= LIMITS.goldBytes);
    assert.throws(() => prepareExpertIntake(input, hash(input), bytes(s.intake), bytes(s.inventory), [], bytes(s.settings)), error => error.code === code);
  }
});

test('canonical output expansion refuses the whole report without truncating large Unicode packet copies', () => {
  const gold = fixtureGold(55); for (const label of gold.labels) label.answer = '😀'.repeat(2048);
  const s = setup(gold); assert.ok(s.rawGold.length < LIMITS.goldBytes); reject(s, 'REPORT_BOUND');
});

test('executable synthetic guide import prepares bound blank packets and leaves every verification result unknown', async () => {
  const guide = readFileSync(new URL('./EXPERT_INTAKE.md', import.meta.url), 'utf8');
  const match = guide.match(/<!-- executable-example:start -->\s*```js\n([\s\S]*?)\n```\s*<!-- executable-example:end -->/);
  assert.ok(match, 'documented executable example exists');
  const program = match[1].replaceAll("'./expert-intake.mjs'", JSON.stringify(new URL('./expert-intake.mjs', import.meta.url).href))
    .replaceAll("'../../../js/filing-facts-packet.js'", JSON.stringify(new URL('../../../js/filing-facts-packet.js', import.meta.url).href));
  const imported = await import(`data:text/javascript;base64,${Buffer.from(program).toString('base64')}`);
  const report = imported.exampleReport; assert.equal(report.coverage.selected_n, 1); assert.equal(report.review_packets.length, 2);
  assert.equal(report.review_packets[0].packet.labels[0].question_clear, ''); assert.equal(report.established.verified_experts_n, null);
  assert.equal(report.established.verified_source_rights_n, null);
});
