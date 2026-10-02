import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder, types } from 'node:util';

// This is an offline observation contract, not a Google/Bing export adapter.
export const INDEXING_EVIDENCE_LIMITS = Object.freeze({
  metadataBytes: 128 * 1024,
  rawBytes: 2 * 1024 * 1024,
  reportBytes: 4 * 1024 * 1024,
  rows: 512,
  depth: 12,
  nodes: 16384,
  stringUnits: 4096,
});

export class IndexingEvidenceError extends Error {
  constructor(code) {
    super(`Indexing evidence refused (${code}).`);
    this.name = 'IndexingEvidenceError';
    this.code = code;
  }
}

const refuse = code => { throw new IndexingEvidenceError(code); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength').get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer').get;
const typedSet = Uint8Array.prototype.set;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const INPUT_SCHEMA = 'canli.indexing-evidence-input.v1';
const FIXTURE_SCHEMA = 'canli.synthetic-indexing-source.v1';

function captureBytes(value, maximum, code) {
  // Intrinsic slots, rather than caller getters/iterators/constructor/species.
  if (!types.isUint8Array(value)) refuse('INPUT_BYTES');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) refuse('INPUT_BYTES');
  if (types.isSharedArrayBuffer(bufferGetter.call(value))) refuse('SHARED_BYTES');
  const length = byteLengthGetter.call(value);
  if (length < 1 || length > maximum) refuse(code);
  const captured = Buffer.alloc(length);
  typedSet.call(captured, value);
  return captured;
}

function unicode(value) {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) refuse('UNICODE');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) refuse('UNICODE');
  }
  return value;
}

function decode(bytes) {
  try { return unicode(decoder.decode(bytes)); }
  catch (error) {
    if (error instanceof IndexingEvidenceError) throw error;
    refuse('UTF8');
  }
}

// Bounded parser rejects duplicate keys before they can disappear in JSON.parse.
// JSON.parse is used only on an individually bounded string token, without a reviver.
function parseJson(bytes) {
  const source = decode(bytes);
  let position = 0;
  let nodes = 0;
  const numeric = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const whitespace = () => {
    while (' \t\r\n'.includes(source[position]) && position < source.length) position++;
  };
  function string() {
    const start = position++;
    while (position < source.length) {
      const character = source[position++];
      if (position - start > INDEXING_EVIDENCE_LIMITS.stringUnits * 6 + 2) refuse('STRING_BOUND');
      if (character === '\\') { position++; continue; }
      if (character === '"') {
        let value;
        try { value = JSON.parse(source.slice(start, position)); }
        catch { refuse('JSON'); }
        if (value.length > INDEXING_EVIDENCE_LIMITS.stringUnits) refuse('STRING_BOUND');
        return unicode(value);
      }
    }
    refuse('JSON');
  }
  function value(depth) {
    if (depth > INDEXING_EVIDENCE_LIMITS.depth) refuse('DEPTH_BOUND');
    if (++nodes > INDEXING_EVIDENCE_LIMITS.nodes) refuse('NODE_BOUND');
    whitespace();
    const character = source[position];
    if (character === '"') return string();
    if (character === '{') {
      position++;
      const result = Object.create(null);
      whitespace();
      if (source[position] === '}') { position++; return result; }
      while (position < source.length) {
        whitespace();
        if (source[position] !== '"') refuse('JSON');
        const key = string();
        if (Object.hasOwn(result, key)) refuse('DUPLICATE_KEY');
        whitespace();
        if (source[position++] !== ':') refuse('JSON');
        result[key] = value(depth + 1);
        whitespace();
        const separator = source[position++];
        if (separator === '}') return result;
        if (separator !== ',') refuse('JSON');
      }
      refuse('JSON');
    }
    if (character === '[') {
      position++;
      const result = [];
      whitespace();
      if (source[position] === ']') { position++; return result; }
      while (position < source.length) {
        // Every input array is bounded, including unsupported extra fields.
        if (result.length >= INDEXING_EVIDENCE_LIMITS.rows) refuse('ROW_BOUND');
        result.push(value(depth + 1));
        whitespace();
        const separator = source[position++];
        if (separator === ']') return result;
        if (separator !== ',') refuse('JSON');
      }
      refuse('JSON');
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(token, position)) { position += token.length; return result; }
    }
    numeric.lastIndex = position;
    const matched = numeric.exec(source);
    if (!matched) refuse('JSON');
    position = numeric.lastIndex;
    const result = Number(matched[0]);
    if (!Number.isFinite(result)) refuse('NONFINITE');
    return result;
  }
  const result = value(0);
  whitespace();
  if (position !== source.length) refuse('JSON');
  return result;
}

function fields(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) refuse('FIELDS');
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) refuse('FIELDS');
  return value;
}

function text(value, maximum = 512) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) refuse('TEXT');
  return unicode(value);
}

function optionalText(value) { if (value !== null) text(value); }
function hash(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) refuse('HASH');
}
function optionalHash(value) { if (value !== null) hash(value); }
function count(value) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0))) refuse('COUNT');
}
function optionalBoolean(value) {
  if (value !== null && typeof value !== 'boolean') refuse('BOOLEAN');
}
function choice(value, choices) { if (!choices.includes(value)) refuse('ENUM'); }
function unknownReason(reason, unknown) {
  optionalText(reason);
  if (unknown && reason === null) refuse('UNKNOWN_REASON');
}

function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) refuse('UTC');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !==
      (value.length === 20 ? value.slice(0, -1) + '.000Z' : value)) refuse('UTC');
  return parsed.getTime();
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) refuse('DATE');
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) refuse('DATE');
  return value;
}

function url(value) {
  text(value, 2048);
  let parsed;
  try { parsed = new URL(value); } catch { refuse('URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.href !== value) refuse('URL');
  return parsed;
}
function property(value) {
  text(value, 2048);
  if (value.startsWith('sc-domain:')) {
    const domain = value.slice(10);
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) || !domain.includes('.') ||
        domain.includes('..') || domain.split('.').some(part => part.startsWith('-') || part.endsWith('-'))) refuse('PROPERTY');
    const parsed = url('https://' + domain + '/');
    if (parsed.hostname !== domain) refuse('PROPERTY');
    return { kind: 'domain', domain };
  }
  const parsed = url(value);
  if (parsed.search) refuse('PROPERTY');
  return { kind: 'url_prefix', prefix: value, domain: parsed.hostname };
}
function belongs(value, admittedProperty) {
  const parsed = url(value);
  return admittedProperty.kind === 'domain' ?
    (parsed.hostname === admittedProperty.domain || parsed.hostname.endsWith('.' + admittedProperty.domain)) :
    value.startsWith(admittedProperty.prefix);
}

const METRICS = Object.freeze({
  aggregate_indexing: ['indexed', 'notIndexed'],
  url_inspection: ['inspected'],
  search_performance: ['impressions', 'clicks'],
  technical_eligibility: ['eligible', 'ineligible'],
  sitemap_inventory: ['urls'],
  notification_submission: ['submitted', 'accepted'],
});
const REPORTS = Object.freeze({
  property_indexing_aggregate: ['aggregate_indexing', ['google', 'bing']],
  url_inspection: ['url_inspection', ['google', 'bing']],
  search_performance: ['search_performance', ['google', 'bing']],
  technical_eligibility: ['technical_eligibility', ['local']],
  sitemap_inventory: ['sitemap_inventory', ['local']],
  url_notification: ['notification_submission', ['bing', 'local']],
});
const PAYLOAD_FIELDS = ['provider', 'property', 'report', 'metricKind', 'observedAt',
  'data', 'scope', 'coverage', 'metrics', 'rows', 'canonicalSet'];

function validate(input, expectedProperty, referenceAt) {
  fields(input, ['schema', ...PAYLOAD_FIELDS, 'capture', 'source', 'extraction']);
  if (input.schema !== INPUT_SCHEMA) refuse('SCHEMA');
  const expected = property(expectedProperty);
  const actual = property(input.property);
  if (input.property !== expectedProperty) refuse('PROPERTY_MISMATCH');
  choice(input.provider, ['google', 'bing', 'local']);
  if (actual.kind === 'domain' && input.provider !== 'google') refuse('PROPERTY_KIND');
  if (!Object.hasOwn(METRICS, input.metricKind)) refuse('METRIC_KIND');
  fields(input.report, ['kind', 'version', 'title']);
  text(input.report.title);
  if (input.report.version !== 'v1' || !Object.hasOwn(REPORTS, input.report.kind)) refuse('REPORT');
  const [metric, providers] = REPORTS[input.report.kind];
  if (metric !== input.metricKind || !providers.includes(input.provider)) refuse('REPORT_METRIC');
  const observed = utc(input.observedAt);
  if (observed > utc(referenceAt)) refuse('OBSERVATION_FUTURE');

  const data = fields(input.data, ['date', 'windowStart', 'windowEnd', 'updatedAt', 'unavailableReason']);
  if ((data.windowStart === null) !== (data.windowEnd === null)) refuse('DATE_WINDOW');
  for (const value of [data.date, data.windowStart, data.windowEnd]) {
    if (value !== null && date(value) > input.observedAt.slice(0, 10)) refuse('DATE_ORDER');
  }
  if (data.windowStart !== null && (data.windowStart > data.windowEnd ||
      (data.date !== null && (data.date < data.windowStart || data.date > data.windowEnd)))) refuse('DATE_WINDOW');
  if (data.updatedAt !== null) {
    if (utc(data.updatedAt) > observed || [data.date, data.windowEnd].some(value =>
      value !== null && value > data.updatedAt.slice(0, 10))) refuse('DATE_ORDER');
  }
  unknownReason(data.unavailableReason, (data.date === null && data.windowEnd === null) || data.updatedAt === null);

  const scope = fields(input.scope, ['kind', 'filter', 'family', 'selection', 'unavailableReason']);
  choice(scope.kind, ['property', 'family', 'selected_urls']);
  choice(scope.selection, ['aggregate', 'complete_export', 'purposive', 'unknown']);
  optionalText(scope.filter);
  optionalText(scope.family);
  unknownReason(scope.unavailableReason, scope.filter === null || scope.selection === 'unknown');
  if ((scope.kind === 'family') !== (scope.family !== null)) refuse('SCOPE');
  if (input.metricKind === 'aggregate_indexing' && scope.kind === 'selected_urls') refuse('SCOPE');
  if (scope.selection === 'aggregate' && input.metricKind !== 'aggregate_indexing') refuse('SCOPE');

  const capture = fields(input.capture, ['method', 'authorship', 'implementation']);
  choice(capture.method, ['manual_export', 'manual_transcription', 'synthetic_fixture']);
  if (capture.authorship !== 'self_attested') refuse('AUTHORSHIP');
  const implementation = fields(capture.implementation, ['name', 'version', 'sha256', 'unavailableReason']);
  optionalText(implementation.name);
  optionalText(implementation.version);
  optionalHash(implementation.sha256);
  unknownReason(implementation.unavailableReason,
    implementation.name === null || implementation.version === null || implementation.sha256 === null);

  const source = fields(input.source, ['format', 'sha256', 'bytes', 'unavailableReason']);
  choice(source.format, ['utf8_json', 'utf8_text', 'opaque']);
  optionalHash(source.sha256);
  count(source.bytes);
  if ((source.sha256 === null) !== (source.bytes === null)) refuse('SOURCE_BINDING');
  if (source.bytes !== null && (source.bytes < 1 || source.bytes > INDEXING_EVIDENCE_LIMITS.rawBytes)) refuse('RAW_BOUND');
  unknownReason(source.unavailableReason, source.sha256 === null);
  const extraction = fields(input.extraction, ['method', 'review', 'reviewer', 'unavailableReason']);
  choice(extraction.method, ['synthetic_json_v1', 'normalized_manual', 'unavailable']);
  choice(extraction.review, ['not_reviewed', 'self_attested']);
  optionalText(extraction.reviewer);
  unknownReason(extraction.unavailableReason, extraction.method === 'unavailable');
  if ((extraction.review === 'self_attested') !== (extraction.reviewer !== null)) refuse('REVIEW');
  if (extraction.method === 'synthetic_json_v1' &&
      (capture.method !== 'synthetic_fixture' || source.format !== 'utf8_json')) refuse('EXTRACTION');

  const coverage = fields(input.coverage, ['status', 'rowsReported', 'totalRows', 'pagesCaptured',
    'totalPages', 'rowLimit', 'limitReached', 'hasMore', 'sampling', 'unavailableReason']);
  choice(coverage.status, ['complete', 'partial', 'unknown']);
  choice(coverage.sampling, ['none', 'purposive', 'unknown']);
  for (const key of ['rowsReported', 'totalRows', 'pagesCaptured', 'totalPages', 'rowLimit']) count(coverage[key]);
  optionalBoolean(coverage.limitReached);
  optionalBoolean(coverage.hasMore);
  unknownReason(coverage.unavailableReason, coverage.status !== 'complete' ||
    ['rowsReported', 'totalRows', 'pagesCaptured', 'totalPages', 'rowLimit', 'limitReached', 'hasMore']
      .some(key => coverage[key] === null) || coverage.sampling === 'unknown');
  if ((coverage.rowsReported !== null && coverage.totalRows !== null && coverage.rowsReported > coverage.totalRows) ||
      (coverage.pagesCaptured !== null && coverage.totalPages !== null && coverage.pagesCaptured > coverage.totalPages) ||
      (coverage.rowsReported !== null && coverage.rowsReported > 0 && coverage.pagesCaptured === 0) || coverage.rowLimit === 0 ||
      (coverage.rowLimit !== null && coverage.rowsReported !== null && coverage.rowsReported > coverage.rowLimit)) refuse('COVERAGE');

  const keys = METRICS[input.metricKind];
  fields(input.metrics, [...keys, 'unavailableReason']);
  for (const key of keys) count(input.metrics[key]);
  unknownReason(input.metrics.unavailableReason, keys.some(key => input.metrics[key] === null));
  if (input.metricKind === 'notification_submission' && input.metrics.submitted !== null &&
      input.metrics.accepted !== null && input.metrics.accepted > input.metrics.submitted) refuse('METRIC_TOTAL');
  fields(input.canonicalSet, ['manifestSha256', 'unavailableReason']);
  optionalHash(input.canonicalSet.manifestSha256);
  unknownReason(input.canonicalSet.unavailableReason, input.canonicalSet.manifestSha256 === null);
  if (!Array.isArray(input.rows) || input.rows.length > INDEXING_EVIDENCE_LIMITS.rows) refuse('ROW_BOUND');
  const hasRows = ['url_inspection', 'search_performance'].includes(input.metricKind);
  if (!hasRows && input.rows.length !== 0) refuse('METRIC_ROWS');
  if (hasRows && coverage.rowsReported !== null && coverage.rowsReported !== input.rows.length) refuse('ROW_TOTAL');
  if (input.metricKind === 'url_inspection' && input.metrics.inspected !== null &&
      input.metrics.inspected !== input.rows.length) refuse('ROW_TOTAL');
  const seen = new Set();
  const canonicals = new Set();
  const positive = new Set();
  let duplicateUrls = 0;
  let duplicateCanonicals = 0;
  let canonicalMismatches = 0;
  let unknownRows = 0;
  for (const row of input.rows) {
    fields(row, input.metricKind === 'url_inspection' ?
      ['url', 'canonical', 'indexed', 'admitted', 'unavailableReason'] : ['url', 'impressions', 'clicks', 'unavailableReason']);
    if (!belongs(row.url, expected)) refuse('ROW_PROPERTY');
    if (seen.has(row.url)) duplicateUrls++;
    seen.add(row.url);
    if (input.metricKind === 'url_inspection') {
      optionalBoolean(row.indexed);
      optionalBoolean(row.admitted);
      if (row.canonical !== null) {
        url(row.canonical);
        if (canonicals.has(row.canonical)) duplicateCanonicals++;
        canonicals.add(row.canonical);
        if (row.canonical !== row.url || !belongs(row.canonical, expected)) canonicalMismatches++;
      }
      const unknown = row.canonical === null || row.indexed === null || row.admitted === null;
      unknownReason(row.unavailableReason, unknown);
      if (unknown) unknownRows++;
      if (row.indexed === true && row.admitted === true && row.canonical === row.url) positive.add(row.url);
    } else {
      count(row.impressions);
      count(row.clicks);
      const unknown = row.impressions === null || row.clicks === null;
      unknownReason(row.unavailableReason, unknown);
      if (unknown) unknownRows++;
    }
  }
  const incomplete = coverage.rowsReported === null || coverage.totalRows === null ||
    coverage.rowLimit === null ||
    coverage.pagesCaptured === null || coverage.totalPages === null || coverage.pagesCaptured < 1 ||
    coverage.rowsReported !== coverage.totalRows || coverage.pagesCaptured !== coverage.totalPages ||
    coverage.limitReached !== false || coverage.hasMore !== false || coverage.sampling !== 'none' ||
    (coverage.rowLimit !== null && coverage.rowsReported >= coverage.rowLimit) ||
    scope.kind === 'selected_urls' || ['purposive', 'unknown'].includes(scope.selection) ||
    keys.some(key => input.metrics[key] === null) ||
    input.extraction.method === 'unavailable' ||
    (input.metricKind === 'url_inspection' && input.rows.some(row => row.admitted === true) && input.canonicalSet.manifestSha256 === null) ||
    duplicateUrls > 0 || duplicateCanonicals > 0 || canonicalMismatches > 0 || unknownRows > 0;
  if (coverage.status === 'complete' && incomplete) refuse('FALSE_COMPLETENESS');
  if (coverage.status === 'complete' && input.metricKind === 'search_performance' &&
      keys.some(key => input.metrics[key] === null || input.rows.some(row => row[key] === null) ||
        input.rows.reduce((sum, row) => sum + BigInt(row[key]), 0n) !== BigInt(input.metrics[key]))) refuse('METRIC_TOTAL');
  return { summary: { retainedRows: input.rows.length, distinctSuppliedUrls: seen.size,
    duplicateUrls, duplicateCanonicals, canonicalMismatches, unknownRows,
    declaredPositiveAdmittedCanonicalRows: input.metricKind === 'url_inspection' ? positive.size : null,
    declaredCoverageComplete: coverage.status === 'complete' && !incomplete }, metricKeys: keys };
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** All four arguments are explicit. No callbacks, coercion, filesystem or clock reads. */
export function checkIndexingEvidence(metadataBytes, rawBytes, expectedProperty, referenceAt) {
  const metadata = captureBytes(metadataBytes, INDEXING_EVIDENCE_LIMITS.metadataBytes, 'METADATA_BOUND');
  const raw = rawBytes === null ? null : captureBytes(rawBytes, INDEXING_EVIDENCE_LIMITS.rawBytes, 'RAW_BOUND');
  // Both owned buffers are hashed before either buffer is decoded or extracted.
  const metadataHash = digest(metadata);
  const rawHash = raw === null ? null : digest(raw);
  const input = parseJson(metadata);
  const checked = validate(input, expectedProperty, referenceAt);
  if (raw === null) {
    if (input.source.unavailableReason === null || input.extraction.method !== 'unavailable') refuse('RAW_REQUIRED');
  } else {
    if (input.source.sha256 !== rawHash || input.source.bytes !== raw.length) refuse('RAW_BINDING');
    if (input.source.unavailableReason !== null) refuse('SOURCE_BINDING');
  }
  const parsedRaw = raw !== null && input.source.format === 'utf8_json' ? parseJson(raw) : null;
  if (raw !== null && input.source.format === 'utf8_text') decode(raw);
  let extractionVerification = 'unavailable';
  if (input.extraction.method === 'unavailable') {
    if (checked.metricKeys.some(key => input.metrics[key] !== null) || input.rows.length !== 0) refuse('UNAVAILABLE_VALUES');
  } else if (input.extraction.method === 'synthetic_json_v1') {
    const fixture = fields(parsedRaw, ['schema', 'payload']);
    if (fixture.schema !== FIXTURE_SCHEMA) refuse('UNSUPPORTED_FORMAT');
    fields(fixture.payload, PAYLOAD_FIELDS);
    const declared = Object.fromEntries(PAYLOAD_FIELDS.map(key => [key, input[key]]));
    if (canonical(fixture.payload) !== canonical(declared)) refuse('EXTRACTION_BINDING');
    extractionVerification = 'synthetic_payload_exact_not_provider_verified';
  } else {
    // Opaque workbooks may be retained, but manual values are never auto-extracted.
    extractionVerification = 'manual_values_not_machine_verified';
  }
  const report = {
    schema: 'canli.indexing-evidence-report.v1',
    status: 'OFFLINE_SELF_ATTESTED_OBSERVATION_ONLY',
    referenceAt,
    referenceClock: 'caller_supplied_not_provider_verified',
    providerAuthorship: 'self_attested',
    providerVerified: false,
    urlTruthVerified: false,
    admissionVerified: false,
    synthetic: input.capture.method === 'synthetic_fixture',
    byteBindingVerified: raw === null ? null : true,
    extractionVerification,
    originalInput: { sha256: metadataHash, bytes: metadata.length, encoding: 'base64', base64: metadata.toString('base64') },
    originalSource: { sha256: rawHash, bytes: raw === null ? null : raw.length,
      encoding: 'base64', base64: raw === null ? null : raw.toString('base64'),
      unavailableReason: raw === null ? input.source.unavailableReason : null },
    declaredObservation: input,
    rowSummary: checked.summary,
    established: { googleIndexedCount: null, bingIndexedCount: null,
      currentIndexedCount: null, distinctAdmittedCanonicalCount: null,
      qualifiedTargetProgress: null, indexedMinimumSatisfied: null,
      familyIndexedShare: null, reason: 'No independent provider capture, current-data qualification or verified useful canonical set.' },
    claimBoundary: 'Byte bindings and declared semantics only. Aggregate observations, diagnostic URL rows, performance, eligibility, inventory and notifications are separate. Historical observations remain dated. No indexed threshold is unlocked.',
  };
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > INDEXING_EVIDENCE_LIMITS.reportBytes) refuse('REPORT_BOUND');
  return freeze(report);
}

function admittedPath(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || resolve(value) !== value || value.includes('\0')) refuse('CLI_PATH');
  // Explicit existing directories only; no mkdir, recursive discovery or symlink aliases.
  try { if (fs.realpathSync(dirname(value)) !== dirname(value)) refuse('CLI_PATH'); }
  catch (error) { if (error instanceof IndexingEvidenceError) throw error; refuse('CLI_PATH'); }
  return value;
}
function readInput(path, maximum) {
  let descriptor;
  try {
    descriptor = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 1n || before.size > BigInt(maximum)) refuse('INPUT_FILE');
    const bytes = Buffer.alloc(Number(before.size));
    let read = 0;
    while (read < bytes.length) {
      const amount = fs.readSync(descriptor, bytes, read, bytes.length - read, null);
      if (amount === 0) refuse('INPUT_CHANGED');
      read += amount;
    }
    if (fs.readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0) refuse('INPUT_CHANGED');
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) refuse('INPUT_CHANGED');
    const closing = descriptor;
    descriptor = undefined;
    fs.closeSync(closing);
    return bytes;
  } catch (error) {
    if (error instanceof IndexingEvidenceError) throw error;
    refuse('INPUT_FILE');
  } finally {
    if (descriptor !== undefined) {
      const closing = descriptor;
      descriptor = undefined;
      try { fs.closeSync(closing); } catch { /* One attempt; close disposition is unknown. */ }
    }
  }
}
function writeExclusive(path, bytes) {
  let descriptor;
  let created = false;
  try {
    descriptor = fs.openSync(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    created = true;
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) refuse('OUTPUT_UNCERTAIN');
    let written = 0;
    while (written < bytes.length) {
      const amount = fs.writeSync(descriptor, bytes, written, bytes.length - written);
      if (amount < 1) refuse('OUTPUT_UNCERTAIN');
      written += amount;
    }
    fs.fsyncSync(descriptor);
    const closing = descriptor;
    descriptor = undefined;
    fs.closeSync(closing);
  } catch (error) {
    if (error instanceof IndexingEvidenceError) throw error;
    refuse(created ? 'OUTPUT_UNCERTAIN' : (error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_FILE'));
  } finally {
    if (descriptor !== undefined) {
      const closing = descriptor;
      descriptor = undefined;
      try { fs.closeSync(closing); } catch { /* One attempt; never reclose a reused number. */ }
    }
    // Never unlink: a failed write may have left bytes or a substituted pathname.
  }
}
function cli(argv) {
  const allowed = ['--metadata', '--raw', '--property', '--as-of', '--output'];
  const options = Object.create(null);
  if (argv.length !== allowed.length * 2) refuse('CLI_ARGUMENTS');
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.includes(argv[i]) || Object.hasOwn(options, argv[i]) ||
        typeof argv[i + 1] !== 'string' || argv[i + 1].startsWith('--')) refuse('CLI_ARGUMENTS');
    options[argv[i]] = argv[i + 1];
  }
  const metadataPath = admittedPath(options['--metadata']);
  const rawPath = options['--raw'] === 'unavailable' ? null : admittedPath(options['--raw']);
  const outputPath = admittedPath(options['--output']);
  if (outputPath === metadataPath || outputPath === rawPath) refuse('OUTPUT_IS_INPUT');
  const metadata = readInput(metadataPath, INDEXING_EVIDENCE_LIMITS.metadataBytes);
  const raw = rawPath === null ? null : readInput(rawPath, INDEXING_EVIDENCE_LIMITS.rawBytes);
  const report = checkIndexingEvidence(metadata, raw, options['--property'], options['--as-of']);
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (bytes.length > INDEXING_EVIDENCE_LIMITS.reportBytes) refuse('REPORT_BOUND');
  writeExclusive(outputPath, bytes);
  // Never echo paths, raw data, property/filter strings or credentials to the terminal.
  process.stdout.write(JSON.stringify({ schema: 'canli.indexing-evidence-written.v1',
    status: report.status, sha256: digest(bytes), bytes: bytes.length,
    currentIndexedCount: null, qualifiedTargetProgress: null }) + '\n');
}

let isEntry = false;
try {
  isEntry = !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
} catch { /* Imported by another entry; no CLI operation. */ }
if (isEntry) {
  try { cli(process.argv.slice(2)); }
  catch (error) {
    const code = error instanceof IndexingEvidenceError ? error.code : 'OFFLINE_REFUSAL';
    process.stderr.write(`Indexing evidence refused (${code}).\n`);
    process.exitCode = 1;
  }
}
