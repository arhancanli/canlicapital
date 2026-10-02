import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { auditInputs, AuditInputsError, AUDIT_INPUTS_LIMITS } from '../src/audit-inputs-core.mjs';
import { contentHash } from '../../scripts/canonical-json.mjs';

// Handwritten synthetic observations, not downloaded filings or a release gold set.
const CIK = '0000123456';
const CORE_URL = new URL('../src/audit-inputs-core.mjs', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value));
const coreBytes = readFileSync(CORE_URL);
const defaultSettings = () => ({ schema: 'canli.fundamentals.audit-settings.v1', snapshot_captured_at: '2022-01-01T00:00:00Z', capture_reason: null, completeness: 'partial', completeness_reason: 'Only explicitly selected synthetic companies and vintages supplied.', implementation_source_sha256: sha(coreBytes) });
const usage = (changes = {}) => ({ cik: CIK, taxonomy: 'us-gaap', concept: 'Assets', unit: 'USD', start: null, end: '2019-12-31', value: 100, used_on: '2020-03-01', ...changes });
const first = (changes = {}) => ({ end: '2019-12-31', val: 100, accn: '0000123456-20-000001', filed: '2020-02-10', form: '10-K', ...changes });
const later = (changes = {}) => ({ end: '2019-12-31', val: 90, accn: '0000123456-21-000002', filed: '2021-02-10', form: '10-K', ...changes });
const reference = (vintages = [first(), later()], extraFacts = {}) => ({ schema: 'canli.fundamentals.audit-reference.v1', companyfacts: [{ cik: 123456, entityName: 'Synthetic Example', facts: { 'us-gaap': { Assets: { units: { USD: vintages } }, ...extraFacts } } }] });
function run(ref = reference(), rows = [usage()], configuration = defaultSettings()) {
  const raw = Buffer.isBuffer(ref) ? ref : encode(ref);
  return auditInputs(raw, sha(raw), Buffer.isBuffer(rows) ? rows : encode(rows), Buffer.isBuffer(configuration) ? configuration : encode(configuration));
}
function refuses(fn, code) {
  assert.throws(fn, error => error instanceof AuditInputsError && error.code === code && error.message === `Fundamentals audit refused (${code}).`);
}
const outcome = (ref, row) => run(ref, [row]).rows[0];

test('audit inputs: original pre-cutoff value matches while later vintages stay diagnostic', () => {
  const row = run().rows[0];
  assert.equal(row.status, 'match'); assert.equal(row.verdict, true);
  assert.equal(row.selected.value, 100); assert.equal(row.selected.accession, '0000123456-20-000001');
  assert.equal(row.selected.filed, '2020-02-10'); assert.equal(row.selected_reason, null);
  assert.deepEqual(row.eligible_vintages.map(v => v.value), [100]);
  assert.deepEqual(row.later_vintages.map(v => v.value), [90]);
  assert.equal(row.later_only_value_observed, false);
});

test('audit inputs: later-value counterexample is a supported mismatch without future selection', () => {
  const row = outcome(reference(), usage({ value: 90 }));
  assert.equal(row.status, 'mismatch'); assert.equal(row.verdict, false);
  assert.equal(row.selected.value, 100); assert.equal(row.later_only_value_observed, true);
  assert.equal(row.observed_values_changed, true); assert.equal(row.formal_restatement_cause, null);
});

test('audit inputs: latest strictly prior observation supersedes an older supplied value', () => {
  const report = run(reference(), [usage({ value: 90, used_on: '2021-03-01' }), usage({ value: 100, used_on: '2021-03-01' })]);
  assert.deepEqual(report.rows.map(r => [r.status, r.selected.value, r.verdict]), [['match', 90, true], ['mismatch', 90, false]]);
  assert.equal(report.rows[1].later_only_value_observed, false);
});

test('audit inputs: before-earliest future-only observation yields null verdict and selection', () => {
  const row = outcome(reference(), usage({ value: 90, used_on: '2020-01-01' }));
  assert.equal(row.status, 'missing'); assert.equal(row.verdict, null); assert.equal(row.selected, null);
  assert.equal(row.earliest_supplied_periodic_filed, '2020-02-10');
  assert.equal(row.used_before_earliest_supplied_filing, true); assert.equal(row.later_only_value_observed, true);
  assert.equal(row.global_first_availability, null); assert.equal(row.trading_calendar_lookahead, null);
});

test('audit inputs: same-day date-only filing makes an earlier selected observation diagnostic', () => {
  const row = outcome(reference(), usage({ value: 90, used_on: '2021-02-10' }));
  assert.equal(row.status, 'timing_indeterminate'); assert.equal(row.verdict, null);
  assert.equal(row.selected.value, 100); assert.equal(row.same_day_vintages[0].value, 90);
  assert.equal(row.later_only_value_observed, null); assert.equal(row.trading_calendar_lookahead, null);
});

test('audit inputs: UTC used_on cannot establish intraday availability of a date-only filing', () => {
  const row = outcome(reference([first()]), usage({ used_on: '2020-02-10T23:59:59.999Z' }));
  assert.equal(row.status, 'timing_indeterminate'); assert.equal(row.selected, null); assert.equal(row.verdict, null);
  assert.equal(row.usage.cutoff_precision, 'utc_instant');
  assert.equal(row.used_before_earliest_supplied_filing, false);
  assert.equal(row.selected_reason, 'same_day_date_only_filing_cannot_establish_intraday_availability');
});

test('audit inputs: conflicting latest-date accessions stay ambiguous in either source order', () => {
  const a = first(), b = first({ val: 99, accn: '0000123456-20-000002' });
  for (const vintages of [[a, b], [b, a]]) {
    const row = outcome(reference(vintages), usage());
    assert.equal(row.status, 'ambiguous'); assert.equal(row.selected, null); assert.equal(row.verdict, null);
    assert.equal(row.eligible_vintages.length, 2);
    assert.equal(row.selected_reason, 'multiple_latest_same_date_observations_no_intraday_order');
  }
});

test('audit inputs: equal values on distinct latest accessions do not invent a selected accession', () => {
  const row = outcome(reference([first(), first({ accn: '0000123456-20-000002' })]), usage());
  assert.equal(row.status, 'ambiguous'); assert.equal(row.selected, null); assert.equal(row.verdict, null);
  assert.equal(row.observed_values_changed, false);
});

test('audit inputs: exact duplicates remain visible and a unique later prior filing resolves old ties', () => {
  const duplicate = outcome(reference([first(), first()]), usage());
  assert.equal(duplicate.status, 'match'); assert.equal(duplicate.eligible_vintages.length, 2);
  const row = outcome(reference([first(), first({ val: 99, accn: '0000123456-20-000002' }), later()]), usage({ value: 90, used_on: '2021-03-01' }));
  assert.equal(row.status, 'match'); assert.equal(row.selected.filed, '2021-02-10');
});

test('audit inputs: all six outcomes retain the full selected-N denominator', () => {
  const tie = [first(), first({ val: 99, accn: '0000123456-20-000002' })];
  const ref = reference([first()], { Tied: { units: { USD: tie } } });
  const rows = [usage(), usage({ value: 99 }), usage({ concept: 'Absent' }), usage({ unit: 'EUR' }), usage({ concept: 'Tied' }), usage({ used_on: '2020-02-10' })];
  const report = run(ref, rows);
  assert.deepEqual(report.rows.map(r => r.status), ['match', 'mismatch', 'missing', 'unsupported', 'ambiguous', 'timing_indeterminate']);
  assert.equal(report.coverage.selected_n, 6); assert.equal(report.rows.length, 6);
  assert.deepEqual(report.coverage.counts, { match: 1, mismatch: 1, missing: 1, ambiguous: 1, unsupported: 1, timing_indeterminate: 1 });
  assert.equal(report.coverage.verdict_supported_n, 2); assert.equal(report.coverage.verdict_unknown_n, 4);
  for (const r of report.rows.slice(2)) { assert.equal(r.verdict, null); assert.ok(r.reason); }
});

test('audit inputs: absent company taxonomy concept and empty reference never zero-fill', () => {
  const refs = [reference(), reference(), reference(), { schema: 'canli.fundamentals.audit-reference.v1', companyfacts: [] }];
  const rows = [usage({ cik: '0000654321', value: 0 }), usage({ taxonomy: 'ifrs-full', value: 0 }), usage({ concept: 'Unknown', value: 0 }), usage({ value: 0 })];
  for (let i = 0; i < rows.length; i++) {
    const row = outcome(refs[i], rows[i]); assert.equal(row.status, 'missing'); assert.equal(row.selected, null); assert.equal(row.verdict, null);
  }
});

test('audit inputs: exact units and opaque per-share conventions prohibit implicit conversion', () => {
  const ref = reference([first()], { EarningsPerShareDiluted: { units: { 'USD/shares': [first({ val: 2 })] } } });
  const report = run(ref, [usage({ unit: 'USD/thousands', value: 0.1 }), usage({ concept: 'EarningsPerShareDiluted', unit: 'USD/shares', value: 2 }), usage({ concept: 'EarningsPerShareDiluted', unit: 'USD', value: 2 })]);
  assert.deepEqual(report.rows.map(r => r.status), ['unsupported', 'match', 'unsupported']);
  assert.equal(report.established.split_or_scaling_adjustment, null);
});

test('audit inputs: quarter YTD instant and concept aliases stay separate', () => {
  const ref = reference([], { Revenue: { units: { USD: [first({ start: '2019-10-01', val: 10 }), first({ start: '2019-01-01', val: 40, accn: '0000123456-20-000002' })] } } });
  const report = run(ref, [usage({ concept: 'Revenue', start: '2019-10-01', value: 10 }), usage({ concept: 'Revenue', start: '2019-01-01', value: 40 }), usage({ concept: 'Revenue', start: null, value: 40 }), usage({ concept: 'Revenue', start: '2019-07-01', value: 30 }), usage({ concept: 'Revenues', start: '2019-10-01', value: 10 })]);
  assert.deepEqual(report.rows.map(r => r.status), ['match', 'match', 'missing', 'missing', 'missing']);
  assert.equal(report.rows[0].eligible_vintages.length, 1); assert.equal(report.rows[1].eligible_vintages.length, 1);
});

test('audit inputs: unsupported taxonomies and forms cannot establish periodic availability', () => {
  const ref = reference([first({ form: '8-K' })]);
  const report = run(ref, [usage(), usage({ taxonomy: 'custom-taxonomy' })]);
  assert.deepEqual(report.rows.map(r => r.status), ['unsupported', 'unsupported']);
  assert.equal(report.rows[0].unsupported_vintages.length, 1); assert.equal(report.rows[0].earliest_supplied_periodic_filed, null);
  const mixed = outcome(reference([first(), later({ form: '8-K' })]), usage({ used_on: '2021-03-01' }));
  assert.equal(mixed.status, 'match'); assert.equal(mixed.selected.value, 100); assert.equal(mixed.unsupported_vintages.length, 1);
});

test('audit inputs: negative losses explicit zero fractions and safe edge values compare exactly', () => {
  for (const value of [-100, 0, 0.1, -0.125, 1e-7, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
    const row = outcome(reference([first({ val: value })]), usage({ value }));
    assert.equal(row.status, 'match'); assert.equal(row.selected.value, value);
  }
});

test('audit inputs: nonnumeric null boolean string and nonfinite values refuse', () => {
  for (const value of [null, true, false, '100', 'NaN', 'Infinity']) {
    refuses(() => run(reference([first({ val: value })])), 'VALUE');
    refuses(() => run(reference(), [usage({ value })]), 'VALUE');
  }
  const raw = encode(reference()).toString();
  for (const token of ['1e309', '-1e309', '9007199254740992', '-0', '-0.0']) {
    refuses(() => run(Buffer.from(raw.replace('"val":100', `"val":${token}`))), 'NUMBER_RANGE');
  }
  for (const token of ['NaN', 'Infinity']) refuses(() => run(Buffer.from(raw.replace('"val":100', `"val":${token}`))), 'JSON');
});

test('audit inputs: raw decimal rounding underflow and numeric-token overflow refuse', () => {
  const raw = encode(reference()).toString();
  for (const token of ['9007199254740991.1', '0.10000000000000001', '1e-400']) {
    refuses(() => run(Buffer.from(raw.replace('"val":100', `"val":${token}`))), 'NUMBER_PRECISION');
  }
  refuses(() => run(Buffer.from(raw.replace('"val":100', `"val":0.${'1'.repeat(129)}`))), 'NUMBER_BOUND');
  assert.equal(outcome(Buffer.from(raw.replace('"val":100', '"val":100.00')), usage()).status, 'match');
});

test('audit inputs: malformed calendars non-UTC cutoffs and contradictory periods refuse', () => {
  for (const day of ['2020-02-30', '2019-02-29', '2020-13-01', '1899-12-31', '2020-02-1x']) refuses(() => run(reference(), [usage({ used_on: day })]), 'DATE');
  for (const timestamp of ['2020-03-01T00:00:00+00:00', '2020-03-01T24:00:00Z', '2020-03-01T00:00Z', '2020-03-01T00:00:60Z']) refuses(() => run(reference(), [usage({ used_on: timestamp })]), 'UTC');
  refuses(() => run(reference(), [usage({ start: '2020-01-01' })]), 'PERIOD');
  refuses(() => run(reference(), [usage({ used_on: '2019-12-30' })]), 'PERIOD');
  refuses(() => run(reference([first({ start: '2020-01-01' })])), 'PERIOD');
  refuses(() => run(reference([first({ filed: '2019-12-30' })])), 'PERIOD');
  assert.equal(outcome(reference([first({ filed: '2020-02-29' })]), usage()).status, 'match');
});

test('audit inputs: declared capture chronology completeness and unknown reasons stay explicit', () => {
  refuses(() => run(reference(), [usage()], { ...defaultSettings(), snapshot_captured_at: '2020-01-01T00:00:00Z' }), 'CAPTURE_DATE');
  refuses(() => run(reference(), [usage()], { ...defaultSettings(), snapshot_captured_at: '2022-01-01' }), 'UTC');
  refuses(() => run(reference(), [usage()], { ...defaultSettings(), snapshot_captured_at: null }), 'UNKNOWN_REASON');
  refuses(() => run(reference(), [usage()], { ...defaultSettings(), completeness_reason: null }), 'UNKNOWN_REASON');
  const unknown = run(reference(), [usage()], { ...defaultSettings(), snapshot_captured_at: null, capture_reason: 'Capture time unavailable.', completeness: 'unknown', completeness_reason: 'Coverage unavailable.', implementation_source_sha256: null });
  assert.equal(unknown.settings.snapshot_captured_at, null); assert.equal(unknown.implementation.declared_module_sha256, null);
  const complete = run(reference(), [usage()], { ...defaultSettings(), completeness: 'declared_complete', completeness_reason: null });
  assert.equal(complete.established.completeness_verified, false); assert.equal(complete.established.full_universe_coverage, null);
});

test('audit inputs: CIK accession fiscal metadata and closed schemas validate without coercion', () => {
  for (const cik of [123456, '123456', '0000000000', ['0000123456']]) refuses(() => run(reference(), [usage({ cik })]), 'CIK');
  refuses(() => run(reference([first({ accn: 'bad' })])), 'ACCESSION');
  refuses(() => run(reference([first({ fy: 2020.5 })])), 'FISCAL_YEAR');
  refuses(() => run(reference(), [{ ...usage(), extra: 1 }]), 'FIELDS');
  refuses(() => run({ ...reference(), schema: 'wrong' }), 'REFERENCE');
  refuses(() => run(reference(), [usage()], { ...defaultSettings(), schema: 'wrong' }), 'SCHEMA');
  refuses(() => run(reference(), [usage()], { ...defaultSettings(), implementation_source_sha256: 123 }), 'IMPLEMENTATION_SHA');
  const ref = reference(); ref.companyfacts.push(ref.companyfacts[0]);
  refuses(() => run(ref), 'DUPLICATE_COMPANY');
});

test('audit inputs: duplicate escaped JSON keys malformed syntax and trailing data refuse', () => {
  const raw = encode(reference()).toString();
  refuses(() => run(Buffer.from(raw.replace('"val":100', '"val":100,"v\\u0061l":99'))), 'DUPLICATE_KEY');
  const rows = encode([usage()]).toString();
  refuses(() => run(reference(), Buffer.from(rows.replace('"value":100', '"value":100,"value":99'))), 'DUPLICATE_KEY');
  for (const invalid of [raw + '{}', raw.slice(0, -1), raw.replace('"val":100', '"val":01'), raw.replace('"val":100', '"val":100,'), '\ufeff' + raw]) refuses(() => run(Buffer.from(invalid)), 'JSON');
});

test('audit inputs: malformed UTF8 unpaired surrogates and oversized decoded strings refuse', () => {
  refuses(() => run(Buffer.from([0x7b, 0xc3, 0x28, 0x7d])), 'UTF8');
  const raw = encode(reference()).toString();
  refuses(() => run(Buffer.from(raw.replace('Synthetic Example', '\\ud800'))), 'UNICODE');
  refuses(() => run(Buffer.from(raw.replace('Synthetic Example', '\\udc00'))), 'UNICODE');
  const ref = reference(); ref.companyfacts[0].entityName = 'a'.repeat(1025);
  refuses(() => run(ref), 'STRING_BOUND');
});

test('audit inputs: prototype-looking concept keys remain owned and cannot supply inherited facts', () => {
  const ref = reference();
  ref.companyfacts[0].facts['us-gaap'] = JSON.parse('{"__proto__":{"units":{"USD":[]}},"constructor":{"units":{"USD":[]}}}');
  const report = run(ref, [usage({ concept: '__proto__' }), usage({ concept: 'constructor' }), usage({ concept: 'toString' })]);
  assert.deepEqual(report.rows.map(r => r.status), ['missing', 'missing', 'missing']);
  assert.equal(Object.prototype.polluted, undefined);
});

test('audit inputs: raw reference tampering at every byte defeats the separately supplied SHA', () => {
  const raw = encode(reference([first()])); const expected = sha(raw);
  for (let i = 0; i < raw.length; i++) {
    const changed = Buffer.from(raw); changed[i] ^= 1;
    refuses(() => auditInputs(changed, expected, encode([usage()]), encode(defaultSettings())), 'REFERENCE_SHA');
  }
  const changed = Buffer.concat([raw, Buffer.from(' ')]);
  refuses(() => auditInputs(changed, expected, encode([usage()]), encode(defaultSettings())), 'REFERENCE_SHA');
  assert.equal(run(changed).rows[0].status, 'match');
});

test('audit inputs: expected hash refuses arrays objects boxed strings and uppercase without coercion', () => {
  const raw = encode(reference()); let traps = 0;
  const coercive = { toString() { traps++; return sha(raw); } };
  for (const expected of [[sha(raw)], coercive, new String(sha(raw)), sha(raw).toUpperCase(), null]) refuses(() => auditInputs(raw, expected, encode([usage()]), encode(defaultSettings())), 'EXPECTED_SHA');
  assert.equal(traps, 0);
});

test('audit inputs: byte APIs reject proxies subclasses shared storage and object getters', () => {
  let traps = 0; const raw = encode(reference());
  const proxy = new Proxy(raw, { get() { traps++; throw new Error('getter must stay untouched'); }, getPrototypeOf() { traps++; throw new Error('prototype must stay untouched'); } });
  class ForeignBytes extends Uint8Array {}
  const getter = Object.defineProperty({}, 'length', { get() { traps++; throw new Error('length must stay untouched'); } });
  for (const candidate of [proxy, new ForeignBytes(raw), getter, reference(), new DataView(new ArrayBuffer(4)), 'raw']) refuses(() => auditInputs(candidate, sha(raw), encode([usage()]), encode(defaultSettings())), 'INPUT_BYTES');
  refuses(() => auditInputs(new Uint8Array(new SharedArrayBuffer(4)), sha(raw), encode([usage()]), encode(defaultSettings())), 'SHARED_BYTES');
  refuses(() => auditInputs(raw, sha(raw), proxy, encode(defaultSettings())), 'INPUT_BYTES');
  refuses(() => auditInputs(raw, sha(raw), encode([usage()]), proxy), 'INPUT_BYTES');
  assert.equal(traps, 0);
});

test('audit inputs: native byte-slot copying ignores caller properties and respects view offsets', () => {
  const raw = encode(reference()); let traps = 0;
  for (const key of ['byteLength', 'buffer', 'toJSON', Symbol.iterator]) Object.defineProperty(raw, key, { get() { traps++; throw new Error('caller property'); } });
  const result = auditInputs(raw, sha(Buffer.from(encode(reference()))), encode([usage()]), encode(defaultSettings()));
  assert.equal(result.rows[0].status, 'match'); assert.equal(traps, 0);
  const padded = Buffer.concat([Buffer.from('ignored'), encode(reference()), Buffer.from('ignored')]);
  const view = new Uint8Array(padded.buffer, padded.byteOffset + 7, encode(reference()).length);
  assert.equal(auditInputs(view, sha(encode(reference())), encode([usage()]), encode(defaultSettings())).content_hash, result.content_hash);
});

test('audit inputs: byte inputs remain unchanged and all returned descendants are frozen', () => {
  const raw = encode(reference()), rows = encode([usage()]), configuration = encode(defaultSettings());
  const before = [raw, rows, configuration].map(b => Buffer.from(b));
  const report = auditInputs(raw, sha(raw), rows, configuration);
  for (let i = 0; i < before.length; i++) assert.deepEqual([raw, rows, configuration][i], before[i]);
  const saved = JSON.stringify(report);
  raw.fill(0); rows.fill(0); configuration.fill(0);
  assert.equal(JSON.stringify(report), saved);
  assert.throws(() => { report.rows[0].selected.value = 999; }, TypeError);
  assert.throws(() => report.rows.push({}), TypeError);
  assert.throws(() => { report.settings.completeness = 'declared_complete'; }, TypeError);
  assert.throws(() => { report.bindings.reference.sha256 = 'bad'; }, TypeError);
});

test('audit inputs: independent raw usage settings and whole-source declarations bind exact bytes', () => {
  const baseline = run();
  const rawChanged = run(Buffer.concat([encode(reference()), Buffer.from(' ')]));
  const usageChanged = run(reference(), Buffer.concat([encode([usage()]), Buffer.from(' ')]));
  const settingsChanged = run(reference(), [usage()], Buffer.concat([encode(defaultSettings()), Buffer.from(' ')]));
  assert.notEqual(rawChanged.bindings.reference.sha256, baseline.bindings.reference.sha256);
  assert.notEqual(usageChanged.bindings.usage.sha256, baseline.bindings.usage.sha256);
  assert.notEqual(settingsChanged.bindings.settings.sha256, baseline.bindings.settings.sha256);
  for (const report of [rawChanged, usageChanged, settingsChanged]) { assert.notEqual(report.content_hash, baseline.content_hash); assert.equal(report.rows[0].status, 'match'); }
  const sourceChanged = run(reference(), [usage()], { ...defaultSettings(), implementation_source_sha256: sha(Buffer.concat([coreBytes, Buffer.from('\n// independent source byte counterexample\n')])) });
  assert.notEqual(sourceChanged.implementation.declared_module_sha256, baseline.implementation.declared_module_sha256);
  assert.notEqual(sourceChanged.content_hash, baseline.content_hash);
  assert.equal(sourceChanged.implementation.behavior_sha256, baseline.implementation.behavior_sha256);
  assert.equal(sourceChanged.implementation.declared_module_sha256_verified, false);
  const canonicalBytes = readFileSync(new URL('../../scripts/canonical-json.mjs', import.meta.url));
  assert.equal(baseline.implementation.canonical_dependency_sha256, sha(canonicalBytes));
});

test('audit inputs: deterministic public JSON roundtrip preserves the shared canonical content hash', () => {
  const ref = reference([first({ val: 1e-7 })]); ref.companyfacts[0].entityName = 'Évidence 😀';
  ref.companyfacts[0].facts['us-gaap'].Assets.units = { '€😀': [first({ val: 1e-7 })] };
  const report = run(ref, [usage({ unit: '€😀', value: 1e-7 })]);
  const repeated = run(ref, [usage({ unit: '€😀', value: 1e-7 })]);
  const publicReport = JSON.parse(JSON.stringify(report));
  assert.equal(JSON.stringify(report), JSON.stringify(repeated));
  assert.equal(publicReport.content_hash, contentHash(publicReport, createHash));
  assert.equal(publicReport.bindings.reference.sha256, sha(Buffer.from(publicReport.bindings.reference.original_base64, 'base64')));
  assert.deepEqual(publicReport.coverage, report.coverage);
});

test('audit inputs: each explicit raw byte ceiling accepts its boundary and refuses one extra byte', () => {
  const raws = [encode(reference([first()])), encode([usage()]), encode(defaultSettings())];
  const ceilings = [AUDIT_INPUTS_LIMITS.referenceBytes, AUDIT_INPUTS_LIMITS.usageBytes, AUDIT_INPUTS_LIMITS.settingsBytes];
  for (let which = 0; which < 3; which++) {
    const inputs = raws.map(b => Buffer.from(b));
    inputs[which] = Buffer.concat([inputs[which], Buffer.alloc(ceilings[which] - inputs[which].length, 0x20)]);
    const report = auditInputs(inputs[0], sha(inputs[0]), inputs[1], inputs[2]);
    assert.equal(report.rows[0].status, 'match');
    inputs[which] = Buffer.concat([inputs[which], Buffer.from(' ')]);
    refuses(() => auditInputs(inputs[0], sha(inputs[0]), inputs[1], inputs[2]), 'BYTE_BOUND');
  }
  refuses(() => auditInputs(Buffer.alloc(0), '0'.repeat(64), raws[1], raws[2]), 'BYTE_BOUND');
});

test('audit inputs: usage and company ceilings retain every row at the accepted boundary', () => {
  const rows = Array.from({ length: 64 }, () => usage());
  assert.equal(run(reference([first()]), rows).coverage.selected_n, 64);
  refuses(() => run(reference([first()]), [...rows, usage()]), 'USAGE_ROW_BOUND');
  refuses(() => run(reference(), []), 'USAGE_ROW_BOUND');
  const ref = reference([]); ref.companyfacts = Array.from({ length: 32 }, (_, i) => ({ cik: String(i + 1).padStart(10, '0'), facts: {} }));
  assert.equal(run(ref).coverage.reference_companies, 32);
  ref.companyfacts.push({ cik: '0000000033', facts: {} });
  refuses(() => run(ref), 'REFERENCE');
});

test('audit inputs: source-row and expanded-vintage ceilings refuse aggregate overflow without truncation', () => {
  const vintages = Array.from({ length: 2048 }, () => first());
  const ref = reference(vintages);
  const report = run(ref, [usage(), usage()]);
  assert.equal(report.coverage.reference_vintages, 2048); assert.equal(report.coverage.returned_matching_vintages, 4096);
  assert.equal(report.rows.length, 2); assert.ok(report.rows.every(r => r.eligible_vintages.length === 2048));
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= 4 * 1024 * 1024);
  refuses(() => run(ref, [usage(), usage(), usage()]), 'RETURNED_VINTAGE_BOUND');
  ref.companyfacts[0].facts['us-gaap'].Other = { units: { USD: [first()] } };
  refuses(() => run(ref), 'REFERENCE_ROW_BOUND');
  refuses(() => run(reference([...vintages, first()])), 'ARRAY_BOUND');
});

test('audit inputs: parser depth node and lexical bounds refuse before unsupported structure processing', () => {
  refuses(() => run(Buffer.from('['.repeat(18) + '0' + ']'.repeat(18))), 'DEPTH_BOUND');
  const many = '[' + Array.from({ length: 2048 }, () => '[' + Array(33).fill('0').join(',') + ']').join(',') + ']';
  refuses(() => run(Buffer.from(many)), 'NODE_BOUND');
  refuses(() => run(reference(), [usage({ unit: 'U'.repeat(65) })]), 'TEXT');
  refuses(() => run(reference(), [usage({ concept: 'X'.repeat(129) })]), 'TEXT');
  refuses(() => run(reference(), [usage({ taxonomy: 'bad taxonomy' })]), 'IDENTIFIER');
});

test('audit inputs: absent calibration rights universe and formal restatement claims stay null', () => {
  const report = run(reference([first(), later({ form: '10-K/A' })]), [usage({ value: 90 })]);
  assert.equal(report.rows[0].observed_values_changed, true); assert.equal(report.rows[0].formal_restatement_cause, null);
  for (const key of ['full_universe_coverage', 'survivorship_audit', 'source_rights', 'expert_adjudication', 'release_calibration', 'global_availability', 'trading_calendar_lookahead', 'split_or_scaling_adjustment']) assert.equal(report.established[key], null);
  for (const key of ['source_authorship_verified', 'capture_time_verified', 'completeness_verified']) assert.equal(report.established[key], false);
});

test('audit inputs: executable documented import example is offline and produces the literal outcome', async () => {
  const guide = readFileSync(new URL('../AUDIT_INPUTS.md', import.meta.url), 'utf8');
  const example = guide.match(/<!-- executable-import-example -->\s*```js\n([\s\S]*?)\n```/);
  assert.ok(example, 'One marked runnable JavaScript example is required.');
  const standalone = example[1].replace("'./mcp-fundamentals/src/audit-inputs-core.mjs'", JSON.stringify(CORE_URL.href));
  const oldFetch = globalThis.fetch; let fetches = 0;
  globalThis.fetch = () => { fetches++; throw new Error('No network is authorized by this offline example.'); };
  try {
    const executed = await import('data:text/javascript;base64,' + Buffer.from(standalone).toString('base64'));
    assert.deepEqual(executed.summary, { selected_n: 1, status: 'mismatch', selected_value: 100, used_value: 90, later_only_value_observed: true });
    assert.equal(executed.report.rows[0].selected.accession, '0000123456-20-000001');
    assert.equal(fetches, 0);
  } finally { globalThis.fetch = oldFetch; }
});
