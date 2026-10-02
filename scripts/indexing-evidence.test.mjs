import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import * as http from 'node:http';
import * as https from 'node:https';
import { checkIndexingEvidence, IndexingEvidenceError, INDEXING_EVIDENCE_LIMITS } from './lib/indexing-evidence.mjs';

const modulePath = fileURLToPath(new URL('./lib/indexing-evidence.mjs', import.meta.url));
const implementationSha256 = sha(fs.readFileSync(modulePath));
const expectedProperty = 'sc-domain:canlicapital.com';
const referenceAt = '2026-10-02T02:00:00.000Z';
const payloadFields = ['provider', 'property', 'report', 'metricKind', 'observedAt',
  'data', 'scope', 'coverage', 'metrics', 'rows', 'canonicalSet'];
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function encoded(value) { return Buffer.from(JSON.stringify(value), 'utf8'); }
function observation() {
  return {
    schema: 'canli.indexing-evidence-input.v1',
    provider: 'google', property: expectedProperty,
    report: { kind: 'property_indexing_aggregate', version: 'v1', title: 'Synthetic aggregate fixture' },
    metricKind: 'aggregate_indexing', observedAt: '2026-09-20T15:00:00.000Z',
    data: { date: '2026-09-14', windowStart: null, windowEnd: null,
      updatedAt: '2026-09-20T14:00:00.000Z', unavailableReason: null },
    scope: { kind: 'property', filter: 'All known pages', family: null,
      selection: 'aggregate', unavailableReason: null },
    capture: { method: 'synthetic_fixture', authorship: 'self_attested',
      implementation: { name: 'Written synthetic fixture', version: 'v1',
        sha256: implementationSha256, unavailableReason: null } },
    source: { format: 'utf8_json', sha256: null, bytes: null, unavailableReason: null },
    extraction: { method: 'synthetic_json_v1', review: 'not_reviewed', reviewer: null, unavailableReason: null },
    coverage: { status: 'complete', rowsReported: 1, totalRows: 1,
      pagesCaptured: 1, totalPages: 1, rowLimit: 1000, limitReached: false,
      hasMore: false, sampling: 'none', unavailableReason: null },
    metrics: { indexed: 262, notIndexed: 40, unavailableReason: null }, rows: [],
    canonicalSet: { manifestSha256: null, unavailableReason: 'No independently verified admitted canonical set.' },
  };
}
function fixture(customize = () => {}) {
  const input = observation();
  customize(input);
  const payload = Object.fromEntries(payloadFields.map(key => [key, input[key]]));
  const raw = encoded({ schema: 'canli.synthetic-indexing-source.v1', payload });
  input.source.sha256 = sha(raw);
  input.source.bytes = raw.length;
  return { input, raw, metadata: encoded(input) };
}
function check(value, property = expectedProperty, asOf = referenceAt) {
  return checkIndexingEvidence(value.metadata ?? encoded(value.input), value.raw, property, asOf);
}
function refusal(action, code) {
  assert.throws(action, error => error instanceof IndexingEvidenceError && error.code === code);
}
function unknownEstablished(report) {
  for (const key of ['googleIndexedCount', 'bingIndexedCount', 'currentIndexedCount',
    'distinctAdmittedCanonicalCount', 'qualifiedTargetProgress', 'indexedMinimumSatisfied', 'familyIndexedShare']) {
    assert.equal(report.established[key], null, key);
  }
  assert.equal(report.providerVerified, false);
  assert.equal(report.urlTruthVerified, false);
  assert.equal(report.admissionVerified, false);
}
function urlRows(input, rows) {
  input.report.kind = 'url_inspection'; input.metricKind = 'url_inspection';
  input.scope = { kind: 'selected_urls', filter: 'Selected diagnostic URLs', family: null,
    selection: 'purposive', unavailableReason: null };
  input.rows = rows;
  input.metrics = { inspected: rows.length, unavailableReason: null };
  input.coverage = { status: 'partial', rowsReported: rows.length, totalRows: null,
    pagesCaptured: 1, totalPages: null, rowLimit: 1000, limitReached: false,
    hasMore: null, sampling: 'purposive', unavailableReason: 'Purposive diagnostic sample, not site coverage.' };
}
function inspected(path = '/tools/example/') {
  const value = 'https://canlicapital.com' + path;
  return { url: value, canonical: value, indexed: true, admitted: true, unavailableReason: null };
}
function manual(raw, customize = () => {}) {
  const input = observation();
  input.capture.method = 'manual_transcription';
  input.extraction = { method: 'normalized_manual', review: 'self_attested',
    reviewer: 'Supplied reviewer label', unavailableReason: null };
  input.source = { format: 'opaque', sha256: sha(raw), bytes: raw.length, unavailableReason: null };
  customize(input);
  return { input, raw, metadata: encoded(input) };
}
function cliFiles(t, value = fixture()) {
  const folder = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'canli-index-evidence-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const metadataPath = join(folder, 'metadata.json');
  const rawPath = join(folder, 'original.raw');
  const outputPath = join(folder, 'checked.json');
  fs.writeFileSync(metadataPath, value.metadata);
  fs.writeFileSync(rawPath, value.raw);
  const args = ['--metadata', metadataPath, '--raw', rawPath,
    '--property', value.input.property, '--as-of', referenceAt, '--output', outputPath];
  return { folder, metadataPath, rawPath, outputPath, args, value };
}
function runCli(files, { args = files.args, preload = null } = {}) {
  return spawnSync(process.execPath, [...(preload ? ['--require', preload] : []), modulePath, ...args],
    { encoding: 'utf8', timeout: 8000, maxBuffer: 16384,
      env: { ...process.env, OPENAI_API_KEY: 'DO_NOT_ECHO_SYNTHETIC_SENTINEL' } });
}
function cliRefusal(result, code) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `Indexing evidence refused (${code}).\n`);
  assert.equal(result.stderr.includes('DO_NOT_ECHO_SYNTHETIC_SENTINEL'), false);
}

function closeAfterReuse(t, target) {
  const files = cliFiles(t); const preload = join(files.folder, 'close-reuse.cjs');
  const foreignPath = join(files.folder, 'unrelated.txt'); const oraclePath = join(files.folder, 'close-oracle.json');
  const foreignBytes = Buffer.from('Unrelated fixture file; the checker must not close its reused descriptor.');
  fs.writeFileSync(foreignPath, foreignBytes);
  const targetPath = target === 'input' ? files.metadataPath : files.outputPath;
  fs.writeFileSync(preload, `const fs = require('node:fs'); const { syncBuiltinESMExports } = require('node:module');
const targetPath = ${JSON.stringify(targetPath)}; const foreignPath = ${JSON.stringify(foreignPath)};
const open = fs.openSync; const close = fs.closeSync; let targetFd; let foreignFd; let targetCloseCalls = 0; let injected = false;
fs.openSync = (...args) => { const fd = open(...args); if (args[0] === targetPath) targetFd = fd; return fd; };
fs.closeSync = fd => { if (fd === targetFd) { targetCloseCalls++; if (!injected) { injected = true; close(fd); foreignFd = open(foreignPath, fs.constants.O_RDONLY); throw Error('synthetic close after descriptor reuse'); } } return close(fd); };
process.on('exit', () => { let foreignStillOpen = false; try { foreignStillOpen = fs.fstatSync(foreignFd).ino === fs.statSync(foreignPath).ino; } catch {}
fs.writeFileSync(${JSON.stringify(oraclePath)}, JSON.stringify({ injected, reusedSameNumber: foreignFd === targetFd, targetCloseCalls, foreignStillOpen }));
if (foreignStillOpen) close(foreignFd); }); syncBuiltinESMExports();`);
  cliRefusal(runCli(files, { preload }), target === 'input' ? 'INPUT_FILE' : 'OUTPUT_UNCERTAIN');
  assert.deepEqual(JSON.parse(fs.readFileSync(oraclePath)), {
    injected: true, reusedSameNumber: true, targetCloseCalls: 1, foreignStillOpen: true,
  });
  assert.deepEqual(fs.readFileSync(files.metadataPath), files.value.metadata);
  assert.deepEqual(fs.readFileSync(files.rawPath), files.value.raw);
  assert.deepEqual(fs.readFileSync(foreignPath), foreignBytes);
  assert.equal(fs.existsSync(files.outputPath), target === 'output');
}

test('index evidence: historical aggregate retains original bytes and dates without current counts', () => {
  const value = fixture(); const report = check(value);
  assert.equal(report.declaredObservation.metrics.indexed, 262);
  assert.equal(report.declaredObservation.observedAt, '2026-09-20T15:00:00.000Z');
  assert.equal(report.declaredObservation.data.date, '2026-09-14');
  assert.equal(report.byteBindingVerified, true);
  assert.equal(report.extractionVerification, 'synthetic_payload_exact_not_provider_verified');
  assert.deepEqual(Buffer.from(report.originalInput.base64, 'base64'), value.metadata);
  assert.deepEqual(Buffer.from(report.originalSource.base64, 'base64'), value.raw);
  assert.equal(report.originalSource.sha256, sha(value.raw));
  assert.equal(report.originalSource.bytes, value.raw.length);
  unknownEstablished(report);
});

test('index evidence: caller mutation cannot alter captured bytes or the frozen report', () => {
  const value = fixture(); const before = Buffer.from(value.raw);
  const report = check(value);
  value.raw.fill(0); value.metadata.fill(0);
  assert.deepEqual(Buffer.from(report.originalSource.base64, 'base64'), before);
  assert.equal(report.originalSource.sha256, sha(before));
  assert.throws(() => { report.declaredObservation.metrics.indexed = 9000000; }, TypeError);
  unknownEstablished(report);
});

test('index evidence: rejects changed raw bytes, wrong length and substituted original', () => {
  const value = fixture(); const altered = Buffer.from(value.raw); altered[5] ^= 1;
  refusal(() => checkIndexingEvidence(value.metadata, altered, expectedProperty, referenceAt), 'RAW_BINDING');
  const input = structuredClone(value.input); input.source.bytes--;
  refusal(() => check({ input, raw: value.raw }), 'RAW_BINDING');
  refusal(() => checkIndexingEvidence(value.metadata, fixture(i => { i.metrics.indexed = 263; }).raw,
    expectedProperty, referenceAt), 'RAW_BINDING');
});

test('index evidence: matching raw hash alone cannot validate a changed extraction', () => {
  const value = fixture(); const input = structuredClone(value.input); input.metrics.indexed++;
  refusal(() => check({ input, raw: value.raw }), 'EXTRACTION_BINDING');
});

test('index evidence: exact domain and URL-prefix property bindings remain distinct', () => {
  const value = fixture();
  refusal(() => check(value, 'sc-domain:foreign.example'), 'PROPERTY_MISMATCH');
  refusal(() => check(value, 'https://canlicapital.com/'), 'PROPERTY_MISMATCH');
  const bing = fixture(input => { input.provider = 'bing'; input.property = 'https://canlicapital.com/'; });
  unknownEstablished(check(bing, bing.input.property));
  refusal(() => check(fixture(input => { input.provider = 'bing'; })), 'PROPERTY_KIND');
});

test('index evidence: wrong report, metric or provider cannot become indexing', () => {
  refusal(() => check(fixture(i => { i.metricKind = 'sitemap_inventory'; })), 'REPORT_METRIC');
  refusal(() => check(fixture(i => { i.report.kind = 'invented_dashboard_adapter'; })), 'REPORT');
  refusal(() => check(fixture(i => { i.provider = 'unsupported_provider'; })), 'ENUM');
  refusal(() => check(fixture(i => { i.report.version = 'unreviewed_v2'; })), 'REPORT');
});

test('index evidence: impossible calendar values and non-UTC observations are refused', () => {
  for (const invalid of ['2026-02-30', '2026-13-01', '2026-00-10']) {
    refusal(() => check(fixture(i => { i.data.date = invalid; })), 'DATE');
  }
  for (const invalid of ['2026-09-20T15:00:00+04:00', '2026-02-30T15:00:00.000Z', '2026-09-20']) {
    refusal(() => check(fixture(i => { i.observedAt = invalid; })), 'UTC');
  }
  refusal(() => check(fixture(), expectedProperty, { toString() { throw Error('callback'); } }), 'UTC');
});

test('index evidence: future data, update, observation and inconsistent windows are refused', () => {
  refusal(() => check(fixture(i => { i.data.date = '2026-09-21'; })), 'DATE_ORDER');
  refusal(() => check(fixture(i => { i.data.updatedAt = '2026-09-20T16:00:00Z'; })), 'DATE_ORDER');
  refusal(() => check(fixture(i => { i.observedAt = '2026-10-03T00:00:00Z'; })), 'OBSERVATION_FUTURE');
  refusal(() => check(fixture(i => { i.data.windowStart = '2026-09-15'; i.data.windowEnd = '2026-09-13'; })), 'DATE_WINDOW');
  refusal(() => check(fixture(i => { i.data.windowStart = '2026-09-01'; })), 'DATE_WINDOW');
  refusal(() => check(fixture(i => { i.data.windowStart = '2026-09-15'; i.data.windowEnd = '2026-09-19'; })), 'DATE_WINDOW');
});

test('index evidence: missing dates and metric values stay null with explicit reasons', () => {
  const value = fixture(input => {
    input.data = { date: null, windowStart: null, windowEnd: null, updatedAt: null,
      unavailableReason: 'Dates not supplied.' };
    input.metrics = { indexed: null, notIndexed: null, unavailableReason: 'Counts not supplied.' };
    input.coverage.status = 'unknown'; input.coverage.unavailableReason = 'Counts and data dates unavailable.';
  });
  const report = check(value);
  assert.equal(report.declaredObservation.metrics.indexed, null);
  assert.equal(report.declaredObservation.data.date, null);
  unknownEstablished(report);
  refusal(() => check(fixture(i => { i.data.date = null; i.data.updatedAt = null; })), 'UNKNOWN_REASON');
  refusal(() => check(fixture(i => { i.metrics.indexed = null; })), 'UNKNOWN_REASON');
});

test('index evidence: strict nonnegative safe counts reject coercion, fractions and unsafe values', () => {
  for (const invalid of ['262', true, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, []]) {
    refusal(() => check(fixture(i => { i.metrics.indexed = invalid; })), 'COUNT');
  }
  const value = fixture();
  refusal(() => checkIndexingEvidence(Buffer.from(value.metadata.toString().replace('"indexed":262', '"indexed":1e999')),
    value.raw, expectedProperty, referenceAt), 'NONFINITE');
  refusal(() => checkIndexingEvidence(Buffer.from(value.metadata.toString().replace('"indexed":262', '"indexed":-0')),
    value.raw, expectedProperty, referenceAt), 'COUNT');
  const zero = check(fixture(i => { i.metrics.indexed = 0; i.metrics.notIndexed = 0; }));
  assert.equal(zero.declaredObservation.metrics.indexed, 0); unknownEstablished(zero);
});

test('index evidence: no getters, iterators, toJSON or species run at the byte boundary', () => {
  let calls = 0;
  const accessor = { get byteLength() { calls++; return 1; }, toJSON() { calls++; return {}; } };
  refusal(() => checkIndexingEvidence(accessor, fixture().raw, expectedProperty, referenceAt), 'INPUT_BYTES');
  refusal(() => checkIndexingEvidence(fixture().metadata, accessor, expectedProperty, referenceAt), 'INPUT_BYTES');
  const value = fixture();
  for (const bytes of [value.metadata, value.raw]) {
    Object.defineProperty(bytes, 'byteLength', { get() { calls++; throw Error('getter'); } });
    Object.defineProperty(bytes, Symbol.iterator, { get() { calls++; throw Error('iterator'); } });
    Object.defineProperty(bytes, 'constructor', { get() { calls++; throw Error('species'); } });
    bytes.toJSON = () => { calls++; throw Error('toJSON'); };
  }
  unknownEstablished(check(value)); assert.equal(calls, 0);
  class Untrusted extends Uint8Array {}
  refusal(() => checkIndexingEvidence(new Untrusted(1), value.raw, expectedProperty, referenceAt), 'INPUT_BYTES');
  refusal(() => checkIndexingEvidence(new Uint8Array(new SharedArrayBuffer(10)), value.raw,
    expectedProperty, referenceAt), 'SHARED_BYTES');
});

test('index evidence: duplicate keys and supplied verification flags are refused', () => {
  const value = fixture();
  const duplicate = Buffer.from(value.metadata.toString().replace('"provider":"google"', '"provider":"google","provider":"bing"'));
  refusal(() => checkIndexingEvidence(duplicate, value.raw, expectedProperty, referenceAt), 'DUPLICATE_KEY');
  refusal(() => check(fixture(i => { i.providerVerified = true; })), 'FIELDS');
  refusal(() => check(fixture(i => { i.capture.authorship = 'independently_verified'; })), 'AUTHORSHIP');
  const invalidHash = fixture(); invalidHash.input.source.sha256 = [];
  refusal(() => check({ input: invalidHash.input, raw: invalidHash.raw }), 'HASH');
});

test('index evidence: malformed UTF-8 and unpaired Unicode are refused without sanitizing', () => {
  const value = fixture();
  refusal(() => checkIndexingEvidence(Buffer.from([0x7b, 0xc3, 0x28, 0x7d]), value.raw,
    expectedProperty, referenceAt), 'UTF8');
  refusal(() => check(fixture(i => { i.report.title = '\ud800'; })), 'UNICODE');
  const raw = Buffer.from([0xc3, 0x28]);
  refusal(() => check(manual(raw, i => { i.source.format = 'utf8_text'; })), 'UTF8');
  const unicodeValue = fixture(i => { i.report.title = 'Synthetic café 📈'; });
  assert.equal(check(unicodeValue).declaredObservation.report.title, 'Synthetic café 📈');
  assert.equal(check(unicodeValue).originalSource.sha256, sha(unicodeValue.raw));
});

test('index evidence: metadata, raw, nesting, rows, nodes and string bounds are finite', () => {
  const value = fixture();
  refusal(() => checkIndexingEvidence(Buffer.alloc(INDEXING_EVIDENCE_LIMITS.metadataBytes + 1), value.raw,
    expectedProperty, referenceAt), 'METADATA_BOUND');
  refusal(() => checkIndexingEvidence(value.metadata, Buffer.alloc(INDEXING_EVIDENCE_LIMITS.rawBytes + 1),
    expectedProperty, referenceAt), 'RAW_BOUND');
  refusal(() => checkIndexingEvidence(Buffer.from('['.repeat(14) + '0' + ']'.repeat(14)), value.raw,
    expectedProperty, referenceAt), 'DEPTH_BOUND');
  refusal(() => checkIndexingEvidence(encoded(Array(513).fill(0)), value.raw,
    expectedProperty, referenceAt), 'ROW_BOUND');
  refusal(() => checkIndexingEvidence(encoded(Array.from({ length: 512 }, () => Array(32).fill(0))), value.raw,
    expectedProperty, referenceAt), 'NODE_BOUND');
  refusal(() => check(fixture(i => { i.report.title = 'x'.repeat(4097); })), 'STRING_BOUND');
});

test('index evidence: manual opaque source retention never authenticates extraction or provider', () => {
  const raw = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
  const report = check(manual(raw));
  assert.equal(report.declaredObservation.metrics.indexed, 262);
  assert.equal(report.synthetic, false);
  assert.equal(report.extractionVerification, 'manual_values_not_machine_verified');
  assert.equal(report.providerAuthorship, 'self_attested');
  assert.deepEqual(Buffer.from(report.originalSource.base64, 'base64'), raw);
  unknownEstablished(report);
});

test('index evidence: unavailable extraction keeps original source and refuses invented values', () => {
  const value = manual(Buffer.from('Unsupported workbook bytes'), input => {
    input.extraction = { method: 'unavailable', review: 'not_reviewed', reviewer: null,
      unavailableReason: 'No supported workbook extraction.' };
    input.metrics = { indexed: null, notIndexed: null, unavailableReason: 'Not extracted.' };
    input.coverage.status = 'unknown'; input.coverage.unavailableReason = 'Coverage not established.';
  });
  const report = check(value); assert.equal(report.extractionVerification, 'unavailable');
  assert.equal(report.declaredObservation.metrics.indexed, null); unknownEstablished(report);
  const input = structuredClone(value.input); input.metrics.indexed = 262;
  refusal(() => check({ input, raw: value.raw }), 'UNAVAILABLE_VALUES');
  refusal(() => check(fixture(i => { i.extraction.method = 'unreviewed_xlsx_adapter'; })), 'ENUM');
});

test('index evidence: a referenced historical workbook hash without bytes remains unavailable', () => {
  const value = manual(Buffer.from('unretained workbook placeholder'), input => {
    input.source.sha256 = '5f90caa3d103cb180c3f190bc2566074f5bead67a1e9043371d4611dc03d77af';
    input.source.bytes = 10943;
    input.source.unavailableReason = 'Original workbook not retained here; hash reference only.';
    input.extraction = { method: 'unavailable', review: 'not_reviewed', reviewer: null,
      unavailableReason: 'Raw workbook absent.' };
    input.metrics = { indexed: null, notIndexed: null, unavailableReason: 'No retained source extraction.' };
    input.coverage.status = 'unknown'; input.coverage.unavailableReason = 'Raw coverage unavailable.';
  });
  const report = check({ input: value.input, raw: null });
  assert.equal(report.byteBindingVerified, null); assert.equal(report.originalSource.base64, null);
  assert.equal(report.originalSource.sha256, null);
  assert.equal(report.declaredObservation.source.sha256, value.input.source.sha256);
  unknownEstablished(report);
  refusal(() => checkIndexingEvidence(fixture().metadata, null, expectedProperty, referenceAt), 'RAW_REQUIRED');
});

test('index evidence: sitemap, eligibility, notifications and performance cannot unlock indexing', () => {
  const cases = [
    ['sitemap_inventory', 'sitemap_inventory', 'local', { urls: 916480, unavailableReason: null }],
    ['technical_eligibility', 'technical_eligibility', 'local', { eligible: 99, ineligible: 1, unavailableReason: null }],
    ['notification_submission', 'url_notification', 'bing', { submitted: 42, accepted: 42, unavailableReason: null }],
    ['search_performance', 'search_performance', 'google', { impressions: 100, clicks: 2, unavailableReason: null }],
  ];
  for (const [metricKind, reportKind, provider, metrics] of cases) {
    const value = fixture(input => {
      input.metricKind = metricKind; input.report.kind = reportKind; input.provider = provider;
      input.property = 'https://canlicapital.com/'; input.scope.selection = 'complete_export'; input.metrics = metrics;
      if (metricKind === 'search_performance') input.rows = [{ url: 'https://canlicapital.com/', impressions: 100, clicks: 2, unavailableReason: null }];
    });
    const report = check(value, value.input.property);
    assert.equal(Object.hasOwn(report.declaredObservation.metrics, 'indexed'), false); unknownEstablished(report);
    value.input.metrics.indexed = 916480;
    refusal(() => check({ input: value.input, raw: value.raw }, value.input.property), 'FIELDS');
  }
});

test('index evidence: selected positive URL observations cannot establish site or family coverage', () => {
  const value = fixture(i => urlRows(i, [inspected()])); const report = check(value);
  assert.equal(report.rowSummary.declaredPositiveAdmittedCanonicalRows, 1);
  assert.equal(report.rowSummary.declaredCoverageComplete, false); unknownEstablished(report);
  const input = structuredClone(value.input);
  Object.assign(input.coverage, { status: 'complete', totalRows: 1, totalPages: 1, hasMore: false,
    sampling: 'none', unavailableReason: null });
  refusal(() => check({ input, raw: value.raw }), 'FALSE_COMPLETENESS');
});

test('index evidence: duplicates, alias canonicals and unknown rows remain diagnostic partial evidence', () => {
  const row = inspected(); const alias = inspected('/alias/'); alias.canonical = row.canonical;
  const unknown = { url: 'https://canlicapital.com/unknown/', canonical: null, indexed: null,
    admitted: null, unavailableReason: 'No inspection status supplied.' };
  const report = check(fixture(i => urlRows(i, [row, { ...row }, alias, unknown])));
  assert.equal(report.rowSummary.duplicateUrls, 1); assert.equal(report.rowSummary.duplicateCanonicals, 2);
  assert.equal(report.rowSummary.canonicalMismatches, 1); assert.equal(report.rowSummary.unknownRows, 1);
  assert.equal(report.rowSummary.declaredPositiveAdmittedCanonicalRows, 1); unknownEstablished(report);
});

test('index evidence: foreign URLs are refused and foreign canonicals cannot become complete', () => {
  const foreign = inspected(); foreign.url = 'https://foreign.example/'; foreign.canonical = foreign.url;
  refusal(() => check(fixture(i => urlRows(i, [foreign]))), 'ROW_PROPERTY');
  const mismatch = inspected(); mismatch.canonical = 'https://foreign.example/';
  const report = check(fixture(i => urlRows(i, [mismatch])));
  assert.equal(report.rowSummary.canonicalMismatches, 1);
  assert.equal(report.rowSummary.declaredPositiveAdmittedCanonicalRows, 0); unknownEstablished(report);
});

test('index evidence: partial pages, row limits, unknown pagination and sampling refuse completeness', () => {
  for (const change of [
    c => { c.hasMore = true; }, c => { c.limitReached = true; }, c => { c.totalPages = 2; },
    c => { c.totalRows = 2; }, c => { c.hasMore = null; c.unavailableReason = 'Unknown pagination.'; },
    c => { c.rowLimit = 1; }, c => { c.sampling = 'purposive'; },
  ]) refusal(() => check(fixture(i => change(i.coverage))), 'FALSE_COMPLETENESS');
  refusal(() => check(fixture(i => { i.coverage.rowsReported = 2; })), 'COVERAGE');
  refusal(() => check(fixture(i => { i.coverage.pagesCaptured = 2; })), 'COVERAGE');
});

test('index evidence: even complete declared canonical rows keep admitted useful counts unknown', () => {
  const value = fixture(input => {
    urlRows(input, [inspected('/one/'), inspected('/two/')]);
    input.scope = { kind: 'family', filter: 'Tools family', family: 'tools', selection: 'complete_export', unavailableReason: null };
    input.coverage = { status: 'complete', rowsReported: 2, totalRows: 2, pagesCaptured: 1,
      totalPages: 1, rowLimit: 1000, limitReached: false, hasMore: false, sampling: 'none', unavailableReason: null };
    input.canonicalSet.manifestSha256 = sha(Buffer.from('Synthetic manifest reference, not independently checked admission.'));
    input.canonicalSet.unavailableReason = null;
  });
  const report = check(value); assert.equal(report.rowSummary.declaredCoverageComplete, true);
  assert.equal(report.rowSummary.declaredPositiveAdmittedCanonicalRows, 2); unknownEstablished(report);
  const input = structuredClone(value.input); input.rows[1].url = input.rows[0].url; input.rows[1].canonical = input.rows[0].canonical;
  refusal(() => check({ input, raw: value.raw }), 'FALSE_COMPLETENESS');
});

test('index evidence: unavailable reasons, metric totals and row totals cannot contradict coverage', () => {
  refusal(() => check(fixture(i => { i.coverage.status = 'partial'; })), 'UNKNOWN_REASON');
  refusal(() => check(fixture(i => { urlRows(i, [inspected()]); i.metrics.inspected = 2; })), 'ROW_TOTAL');
  refusal(() => check(fixture(i => { urlRows(i, [inspected()]); i.coverage.rowsReported = 0; })), 'ROW_TOTAL');
  const performance = fixture(input => {
    input.report.kind = 'search_performance'; input.metricKind = 'search_performance';
    input.scope.selection = 'complete_export'; input.metrics = { impressions: 10, clicks: 1, unavailableReason: null };
    input.rows = [{ url: 'https://canlicapital.com/', impressions: 9, clicks: 1, unavailableReason: null }];
  });
  refusal(() => check(performance), 'METRIC_TOTAL');
});

test('index evidence: actual CLI writes one exclusive private artifact with exact original inputs', t => {
  const files = cliFiles(t); const result = runCli(files);
  assert.equal(result.status, 0); assert.equal(result.stderr, ''); assert.equal(result.error, undefined);
  const bytes = fs.readFileSync(files.outputPath); const receipt = JSON.parse(result.stdout); const report = JSON.parse(bytes);
  assert.equal(receipt.sha256, sha(bytes)); assert.equal(receipt.bytes, bytes.length);
  assert.equal(receipt.currentIndexedCount, null); assert.equal(receipt.qualifiedTargetProgress, null);
  assert.equal(fs.statSync(files.outputPath).mode & 0o777, 0o600);
  assert.deepEqual(fs.readFileSync(files.metadataPath), files.value.metadata);
  assert.deepEqual(fs.readFileSync(files.rawPath), files.value.raw);
  assert.deepEqual(Buffer.from(report.originalInput.base64, 'base64'), files.value.metadata);
  assert.deepEqual(Buffer.from(report.originalSource.base64, 'base64'), files.value.raw); unknownEstablished(report);
  assert.equal(result.stdout.includes(files.folder), false);
  assert.equal(result.stdout.includes(expectedProperty), false);
  assert.equal(result.stdout.includes('DO_NOT_ECHO_SYNTHETIC_SENTINEL'), false);
});

test('index evidence: actual CLI refuses existing outputs, symlink outputs and input aliases', t => {
  const files = cliFiles(t); const prior = Buffer.from('existing output must remain exact');
  fs.writeFileSync(files.outputPath, prior); cliRefusal(runCli(files), 'OUTPUT_EXISTS');
  assert.deepEqual(fs.readFileSync(files.outputPath), prior);
  const same = [...files.args]; same[same.indexOf('--output') + 1] = files.rawPath;
  cliRefusal(runCli(files, { args: same }), 'OUTPUT_IS_INPUT');
  assert.deepEqual(fs.readFileSync(files.rawPath), files.value.raw);
  fs.unlinkSync(files.outputPath); fs.symlinkSync(files.rawPath, files.outputPath);
  cliRefusal(runCli(files), 'OUTPUT_EXISTS'); assert.equal(fs.lstatSync(files.outputPath).isSymbolicLink(), true);
  assert.deepEqual(fs.readFileSync(files.rawPath), files.value.raw);
});

test('index evidence: actual CLI requires explicit inputs, property, reference and output without discovery', t => {
  const files = cliFiles(t);
  for (const args of [[], files.args.slice(0, -2), ['--discover', files.folder], [...files.args, '--publish']]) {
    cliRefusal(runCli(files, { args }), 'CLI_ARGUMENTS');
  }
  const relative = [...files.args]; relative[1] = 'metadata.json';
  cliRefusal(runCli(files, { args: relative }), 'CLI_PATH');
  const absentParent = [...files.args]; absentParent[absentParent.indexOf('--output') + 1] = join(files.folder, 'absent', 'result.json');
  cliRefusal(runCli(files, { args: absentParent }), 'CLI_PATH');
  assert.equal(fs.existsSync(join(files.folder, 'absent')), false); assert.equal(fs.existsSync(files.outputPath), false);
});

test('index evidence: actual CLI refuses symlinks, special files and bounded oversize before reading', t => {
  const files = cliFiles(t); const linked = join(files.folder, 'linked.raw'); fs.symlinkSync(files.rawPath, linked);
  const args = [...files.args]; args[args.indexOf('--raw') + 1] = linked; cliRefusal(runCli(files, { args }), 'INPUT_FILE');
  const fifo = join(files.folder, 'input.fifo'); execFileSync('mkfifo', [fifo], { timeout: 2000 });
  args[args.indexOf('--raw') + 1] = fifo; cliRefusal(runCli(files, { args }), 'INPUT_FILE');
  args[args.indexOf('--raw') + 1] = files.folder; cliRefusal(runCli(files, { args }), 'INPUT_FILE');
  const large = join(files.folder, 'oversize.raw'); fs.writeFileSync(large, Buffer.alloc(INDEXING_EVIDENCE_LIMITS.rawBytes + 1));
  args[args.indexOf('--raw') + 1] = large; cliRefusal(runCli(files, { args }), 'INPUT_FILE');
  assert.equal(fs.existsSync(files.outputPath), false); assert.deepEqual(fs.readFileSync(files.rawPath), files.value.raw);
});

test('index evidence: actual CLI refuses tampered source and never echoes sensitive input on errors', t => {
  const files = cliFiles(t); fs.appendFileSync(files.rawPath, 'tampered bytes'); cliRefusal(runCli(files), 'RAW_BINDING');
  assert.equal(fs.existsSync(files.outputPath), false);
  fs.writeFileSync(files.metadataPath, encoded({ ...files.value.input, token: 'DO_NOT_ECHO_SYNTHETIC_SENTINEL' }));
  cliRefusal(runCli(files), 'FIELDS'); assert.equal(fs.existsSync(files.outputPath), false);
});

test('index evidence: actual CLI has no false acknowledgment after partial write, fsync or close failure', t => {
  for (const fault of ['write', 'fsync', 'close']) {
    const files = cliFiles(t); const preload = join(files.folder, 'fault.cjs');
    const code = `const fs = require('node:fs'); const { syncBuiltinESMExports } = require('node:module');
let output; const open = fs.openSync; fs.openSync = (...args) => { const fd = open(...args); if (typeof args[1] === 'number' && (args[1] & fs.constants.O_WRONLY)) output = fd; return fd; };
const write = fs.writeSync; let writes = 0; const close = fs.closeSync; let failedClose = false;
if (${JSON.stringify(fault)} === 'write') fs.writeSync = (...args) => { if (++writes === 1) return write(args[0], args[1], args[2], 17); throw Error('synthetic write failure'); };
if (${JSON.stringify(fault)} === 'fsync') fs.fsyncSync = () => { throw Error('synthetic fsync failure'); };
if (${JSON.stringify(fault)} === 'close') fs.closeSync = fd => { if (fd === output && !failedClose) { failedClose = true; throw Error('synthetic close failure'); } return close(fd); };
syncBuiltinESMExports();`;
    fs.writeFileSync(preload, code); cliRefusal(runCli(files, { preload }), 'OUTPUT_UNCERTAIN');
    assert.equal(fs.existsSync(files.outputPath), true);
    if (fault === 'write') assert.equal(fs.statSync(files.outputPath).size, 17);
    assert.deepEqual(fs.readFileSync(files.metadataPath), files.value.metadata); assert.deepEqual(fs.readFileSync(files.rawPath), files.value.raw);
  }
});

test('index evidence: actual CLI rejects input mutation during descriptor capture', t => {
  const files = cliFiles(t); const preload = join(files.folder, 'mutate.cjs');
  fs.writeFileSync(preload, `const fs = require('node:fs'); const { syncBuiltinESMExports } = require('node:module');
const metadataPath = ${JSON.stringify(files.metadataPath)}; const open = fs.openSync; let metadataFd;
fs.openSync = (...args) => { const fd = open(...args); if (args[0] === metadataPath) metadataFd = fd; return fd; };
const read = fs.readSync; let changed = false; fs.readSync = (...args) => { const result = read(...args); if (args[0] === metadataFd && !changed && result > 0) { changed = true; fs.appendFileSync(metadataPath, ' '); } return result; }; syncBuiltinESMExports();`);
  cliRefusal(runCli(files, { preload }), 'INPUT_CHANGED'); assert.equal(fs.existsSync(files.outputPath), false);
  assert.deepEqual(fs.readFileSync(files.metadataPath), Buffer.concat([files.value.metadata, Buffer.from(' ')]));
  assert.deepEqual(fs.readFileSync(files.rawPath), files.value.raw);
});

test('index evidence: reader close-after-close failure never closes a reused unrelated descriptor', t => {
  closeAfterReuse(t, 'input');
});

test('index evidence: writer close-after-close failure never closes a reused unrelated descriptor', t => {
  closeAfterReuse(t, 'output');
});

test('index evidence: API and actual CLI operate with network calls trapped and no credential lookup', t => {
  const priorFetch = globalThis.fetch; const originalHttp = http.default.request; const originalHttps = https.default.request;
  let calls = 0; const trapped = () => { calls++; throw Error('network prohibited'); };
  globalThis.fetch = trapped; http.default.request = trapped; https.default.request = trapped;
  try { unknownEstablished(check(fixture())); assert.equal(calls, 0); }
  finally { globalThis.fetch = priorFetch; http.default.request = originalHttp; https.default.request = originalHttps; }
  const files = cliFiles(t); const preload = join(files.folder, 'offline.cjs');
  fs.writeFileSync(preload, `const { syncBuiltinESMExports } = require('node:module');
const fail = () => { throw Error('network prohibited'); }; globalThis.fetch = fail;
for (const name of ['node:http','node:https']) { const m = require(name); m.request = fail; m.get = fail; }
const net = require('node:net'); net.connect = fail; net.createConnection = fail; syncBuiltinESMExports();`);
  const result = runCli(files, { preload }); assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes('DO_NOT_ECHO_SYNTHETIC_SENTINEL'), false);
  const source = fs.readFileSync(modulePath, 'utf8');
  assert.equal(/from ['"](?:node:(?:http|https|net|tls|child_process)|[^.'n])/.test(source), false);
  assert.equal(source.includes('process.env'), false); unknownEstablished(JSON.parse(fs.readFileSync(files.outputPath)));
});
