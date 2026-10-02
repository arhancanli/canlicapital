import { createHash } from 'node:crypto';
import { TextDecoder, types } from 'node:util';
import { canonicalJson, pythonNumber, pythonString } from '../../scripts/canonical-json.mjs';

// An offline prerequisite for audit_inputs. The released server never imports this core.
export const AUDIT_INPUTS_LIMITS = Object.freeze({
  referenceBytes: 512 * 1024, usageBytes: 64 * 1024, settingsBytes: 4096,
  companies: 32, usageRows: 64, referenceRows: 2048, returnedVintages: 4096,
  arrayRows: 2048, depth: 16, nodes: 65536, stringUnits: 1024,
  numberUnits: 128, reportBytes: 4 * 1024 * 1024,
});
const REFERENCE_SCHEMA = 'canli.fundamentals.audit-reference.v1';
const SETTINGS_SCHEMA = 'canli.fundamentals.audit-settings.v1';
const REPORT_SCHEMA = 'canli.fundamentals.audit-report.v1';
const PERIODIC_FORMS = Object.freeze(['10-K', '10-K/A', '10-Q', '10-Q/A', '20-F', '20-F/A', '40-F', '40-F/A']);
const TAXONOMIES = Object.freeze(['us-gaap', 'ifrs-full', 'dei']);
const CANONICAL_SOURCE_SHA = '881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b';
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength').get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer').get;
const typedSet = Uint8Array.prototype.set;
const functionSource = Function.prototype.toString;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export class AuditInputsError extends Error {
  constructor(code) { super(`Fundamentals audit refused (${code}).`); this.name = 'AuditInputsError'; this.code = code; }
}
function refuse(code) { throw new AuditInputsError(code); }
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function captureBytes(value, maximum) {
  if (types.isProxy(value) || !types.isUint8Array(value)) refuse('INPUT_BYTES');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) refuse('INPUT_BYTES');
  if (types.isSharedArrayBuffer(bufferGetter.call(value))) refuse('SHARED_BYTES');
  const length = byteLengthGetter.call(value);
  if (length < 1 || length > maximum) refuse('BYTE_BOUND');
  const copy = Buffer.alloc(length);
  typedSet.call(copy, value);
  return copy;
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
  catch (error) { if (error instanceof AuditInputsError) throw error; refuse('UTF8'); }
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
  const source = decode(bytes);
  let position = 0;
  let nodes = 0;
  const numeric = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const whitespace = () => { while (position < source.length && ' \t\r\n'.includes(source[position])) position++; };
  function string() {
    const start = position++;
    while (position < source.length) {
      const character = source[position++];
      if (position - start > AUDIT_INPUTS_LIMITS.stringUnits * 6 + 2) refuse('STRING_BOUND');
      if (character === '\\') { position++; continue; }
      if (character === '"') {
        let value;
        try { value = JSON.parse(source.slice(start, position)); } catch { refuse('JSON'); }
        if (value.length > AUDIT_INPUTS_LIMITS.stringUnits) refuse('STRING_BOUND');
        return unicode(value);
      }
    }
    refuse('JSON');
  }
  function value(depth) {
    if (depth > AUDIT_INPUTS_LIMITS.depth) refuse('DEPTH_BOUND');
    if (++nodes > AUDIT_INPUTS_LIMITS.nodes) refuse('NODE_BOUND');
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
        if (result.length >= AUDIT_INPUTS_LIMITS.arrayRows) refuse('ARRAY_BOUND');
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
    if (matched[0].length > AUDIT_INPUTS_LIMITS.numberUnits) refuse('NUMBER_BOUND');
    const result = Number(matched[0]);
    if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER || Object.is(result, -0)) refuse('NUMBER_RANGE');
    if (decimalIdentity(matched[0]) !== decimalIdentity(JSON.stringify(result))) refuse('NUMBER_PRECISION');
    return result;
  }
  const result = value(0);
  whitespace();
  if (position !== source.length) refuse('JSON');
  return result;
}
function fields(value, required, optional = []) {
  if (!value || Array.isArray(value) || typeof value !== 'object') refuse('FIELDS');
  if (required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) refuse('FIELDS');
  return value;
}
function text(value, maximum = 128) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) refuse('TEXT');
  return value;
}
function identifier(value, maximum) {
  text(value, maximum);
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) refuse('IDENTIFIER');
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900) refuse('DATE');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) refuse('DATE');
  return value;
}
function cutoff(value) {
  if (typeof value !== 'string') refuse('DATE');
  if (value.length === 10) return { supplied: date(value), day: value, precision: 'date' };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) refuse('UTC');
  date(value.slice(0, 10));
  const parsed = new Date(value);
  const expected = value.length === 20 ? value.slice(0, -1) + '.000Z' : value;
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== expected) refuse('UTC');
  return { supplied: value, day: value.slice(0, 10), precision: 'utc_instant' };
}
function financialNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || Object.is(value, -0)) refuse('VALUE');
  return value;
}
function sourceCik(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 9999999999) return String(value).padStart(10, '0');
  if (typeof value !== 'string' || !/^\d{10}$/.test(value) || /^0+$/.test(value)) refuse('CIK');
  return value;
}
function usageRow(value) {
  fields(value, ['cik', 'taxonomy', 'concept', 'unit', 'start', 'end', 'value', 'used_on']);
  if (typeof value.cik !== 'string') refuse('CIK');
  sourceCik(value.cik);
  identifier(value.taxonomy, 64); identifier(value.concept, 128); text(value.unit, 64);
  if (value.start !== null) date(value.start);
  date(value.end); financialNumber(value.value);
  const when = cutoff(value.used_on);
  if ((value.start !== null && value.start > value.end) || value.end > when.day) refuse('PERIOD');
  return { ...value, cutoff_day: when.day, cutoff_precision: when.precision };
}
function settings(value) {
  fields(value, ['schema', 'snapshot_captured_at', 'capture_reason', 'completeness', 'completeness_reason', 'implementation_source_sha256']);
  if (value.schema !== SETTINGS_SCHEMA) refuse('SCHEMA');
  if (value.snapshot_captured_at !== null && cutoff(value.snapshot_captured_at).precision !== 'utc_instant') refuse('UTC');
  if (value.capture_reason !== null) text(value.capture_reason, 512);
  if ((value.snapshot_captured_at === null) !== (value.capture_reason !== null)) refuse('UNKNOWN_REASON');
  if (!['unknown', 'partial', 'declared_complete'].includes(value.completeness)) refuse('COMPLETENESS');
  if (value.completeness_reason !== null) text(value.completeness_reason, 512);
  if ((value.completeness !== 'declared_complete') !== (value.completeness_reason !== null)) refuse('UNKNOWN_REASON');
  if (value.implementation_source_sha256 !== null && (typeof value.implementation_source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.implementation_source_sha256))) refuse('IMPLEMENTATION_SHA');
  return value;
}
function reference(value, configuration) {
  fields(value, ['schema', 'companyfacts']);
  if (value.schema !== REFERENCE_SCHEMA || !Array.isArray(value.companyfacts) || value.companyfacts.length > AUDIT_INPUTS_LIMITS.companies) refuse('REFERENCE');
  const companies = new Map();
  let sourceRows = 0;
  for (const company of value.companyfacts) {
    fields(company, ['cik', 'facts'], ['entityName']);
    const cik = sourceCik(company.cik);
    if (companies.has(cik)) refuse('DUPLICATE_COMPANY');
    if (Object.hasOwn(company, 'entityName')) text(company.entityName, 1024);
    if (!company.facts || typeof company.facts !== 'object' || Array.isArray(company.facts)) refuse('FACTS');
    const all = [];
    for (const [taxonomy, concepts] of Object.entries(company.facts)) {
      identifier(taxonomy, 64);
      if (!concepts || typeof concepts !== 'object' || Array.isArray(concepts)) refuse('FACTS');
      for (const [concept, item] of Object.entries(concepts)) {
        identifier(concept, 128); fields(item, ['units'], ['label', 'description']);
        for (const k of ['label', 'description']) if (Object.hasOwn(item, k)) text(item[k], 1024);
        if (!item.units || typeof item.units !== 'object' || Array.isArray(item.units)) refuse('UNITS');
        for (const [unit, vintages] of Object.entries(item.units)) {
          text(unit, 64);
          if (!Array.isArray(vintages)) refuse('VINTAGES');
          for (const vintage of vintages) {
            if (++sourceRows > AUDIT_INPUTS_LIMITS.referenceRows) refuse('REFERENCE_ROW_BOUND');
            fields(vintage, ['end', 'val', 'accn', 'filed', 'form'], ['start', 'fy', 'fp', 'frame']);
            const start = vintage.start ?? null;
            if (start !== null) date(start);
            date(vintage.end); date(vintage.filed); financialNumber(vintage.val);
            if ((start !== null && start > vintage.end) || vintage.end > vintage.filed) refuse('PERIOD');
            if (configuration.snapshot_captured_at !== null && vintage.filed > configuration.snapshot_captured_at.slice(0, 10)) refuse('CAPTURE_DATE');
            if (typeof vintage.accn !== 'string' || !/^\d{10}-\d{2}-\d{6}$/.test(vintage.accn)) refuse('ACCESSION');
            text(vintage.form, 16);
            if (Object.hasOwn(vintage, 'fy') && vintage.fy !== null && (!Number.isSafeInteger(vintage.fy) || vintage.fy < 1900 || vintage.fy > 9999)) refuse('FISCAL_YEAR');
            for (const k of ['fp', 'frame']) if (Object.hasOwn(vintage, k) && vintage[k] !== null) text(vintage[k], 64);
            all.push({ source_index: sourceRows - 1, cik, taxonomy, concept, unit, start, end: vintage.end, value: vintage.val, filed: vintage.filed, accession: vintage.accn, form: vintage.form, periodic_form_supported: PERIODIC_FORMS.includes(vintage.form) });
          }
        }
      }
    }
    companies.set(cik, { facts: company.facts, vintages: all });
  }
  return { companies, sourceRows };
}
function vintageIdentity(value) {
  return canonicalJson({ cik: value.cik, taxonomy: value.taxonomy, concept: value.concept, unit: value.unit, start: value.start, end: value.end, value: value.value, filed: value.filed, accession: value.accession, form: value.form });
}
function auditRow(row, source, budget) {
  const result = { usage: row, status: null, reason: null, verdict: null, selected: null, selected_reason: null, eligible_vintages: [], same_day_vintages: [], later_vintages: [], unsupported_vintages: [], earliest_supplied_periodic_filed: null, used_before_earliest_supplied_filing: null, later_only_value_observed: null, observed_values_changed: null, formal_restatement_cause: null, global_first_availability: null, trading_calendar_lookahead: null };
  const finish = (status, reason) => { result.status = status; result.reason = reason; if (result.selected === null) result.selected_reason ??= reason; return result; };
  if (!TAXONOMIES.includes(row.taxonomy)) return finish('unsupported', 'taxonomy_not_supported');
  const company = source.companies.get(row.cik);
  if (!company) return finish('missing', 'company_absent_from_supplied_reference');
  const concept = company.facts[row.taxonomy]?.[row.concept];
  if (!concept) return finish('missing', 'exact_taxonomy_concept_absent');
  if (!Object.hasOwn(concept.units, row.unit)) return finish('unsupported', 'exact_unit_absent_no_conversion');
  const matching = company.vintages.filter(v => v.taxonomy === row.taxonomy && v.concept === row.concept && v.unit === row.unit && v.start === row.start && v.end === row.end);
  if (!matching.length) return finish('missing', 'exact_period_absent_no_quarter_ytd_or_tag_derivation');
  budget.returned += matching.length;
  if (budget.returned > AUDIT_INPUTS_LIMITS.returnedVintages) refuse('RETURNED_VINTAGE_BOUND');
  const ordered = matching.slice().sort((a, b) => (a.filed > b.filed) - (a.filed < b.filed) || (a.accession > b.accession) - (a.accession < b.accession) || a.source_index - b.source_index);
  for (const v of ordered) {
    if (!v.periodic_form_supported) result.unsupported_vintages.push(v);
    else if (v.filed < row.cutoff_day) result.eligible_vintages.push(v);
    else if (v.filed === row.cutoff_day) result.same_day_vintages.push(v);
    else result.later_vintages.push(v);
  }
  const supported = ordered.filter(v => v.periodic_form_supported);
  if (!supported.length) return finish('unsupported', 'matching_rows_are_not_supported_periodic_forms');
  result.earliest_supplied_periodic_filed = supported[0].filed;
  result.used_before_earliest_supplied_filing = row.cutoff_day < supported[0].filed;
  result.observed_values_changed = new Set(supported.map(v => v.value)).size > 1;
  if (!result.same_day_vintages.length) result.later_only_value_observed = result.later_vintages.some(v => v.value === row.value) && !result.eligible_vintages.some(v => v.value === row.value);
  const eligible = result.eligible_vintages;
  if (eligible.length) {
    const lastDate = eligible[eligible.length - 1].filed;
    const latest = new Map();
    for (const v of eligible.filter(v => v.filed === lastDate)) latest.set(vintageIdentity(v), v);
    if (latest.size === 1) result.selected = [...latest.values()][0];
    else result.selected_reason = 'multiple_latest_same_date_observations_no_intraday_order';
  }
  if (result.same_day_vintages.length) return finish('timing_indeterminate', 'same_day_date_only_filing_cannot_establish_intraday_availability');
  if (!eligible.length) return finish('missing', 'no_strictly_earlier_periodic_vintage_in_supplied_reference');
  if (!result.selected) return finish('ambiguous', result.selected_reason);
  result.selected_reason = null;
  result.verdict = result.selected.value === row.value;
  return finish(result.verdict ? 'match' : 'mismatch', result.verdict ? 'matches_latest_strictly_earlier_supplied_observation' : 'differs_from_latest_strictly_earlier_supplied_observation');
}
function frozen(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
  return value;
}
function byteBinding(bytes) { return { sha256: digest(bytes), bytes: bytes.length, original_base64: bytes.toString('base64') }; }
function implementationBinding(declaredSha) {
  const functions = [AuditInputsError, refuse, digest, captureBytes, unicode, decode, decimalIdentity, parseJson, fields, text, identifier, date, cutoff, financialNumber, sourceCik, usageRow, settings, reference, vintageIdentity, auditRow, frozen, byteBinding, implementationBinding, auditInputs, canonicalJson, pythonNumber, pythonString];
  const behavior = { limits: AUDIT_INPUTS_LIMITS, schemas: [REFERENCE_SCHEMA, SETTINGS_SCHEMA, REPORT_SCHEMA], forms: PERIODIC_FORMS, taxonomies: TAXONOMIES, canonical_source_sha256: CANONICAL_SOURCE_SHA, functions: functions.map(fn => functionSource.call(fn)), native_contract: 'Node crypto SHA256, owned native Uint8Array slots/set, fatal UTF8, untampered intrinsics' };
  return { name: 'canli.fundamentals.audit-inputs-core', version: 'v1', behavior_sha256: digest(canonicalJson(behavior)), canonical_dependency_sha256: CANONICAL_SOURCE_SHA, declared_module_sha256: declaredSha, declared_module_sha256_verified: false, module_sha256_reason: 'Pure core does not read its module file; full source pin is caller-declared and independently bound by repository source review.' };
}

/** All four inputs are explicit. Byte arguments are native Buffer/Uint8Array, not objects. */
export function auditInputs(referenceBytes, expectedSha256, usageBytes, settingsBytes) {
  const referenceCopy = captureBytes(referenceBytes, AUDIT_INPUTS_LIMITS.referenceBytes);
  const usageCopy = captureBytes(usageBytes, AUDIT_INPUTS_LIMITS.usageBytes);
  const settingsCopy = captureBytes(settingsBytes, AUDIT_INPUTS_LIMITS.settingsBytes);
  // Freeze the three exact byte bindings before any decoding or extraction.
  const bindings = { reference: byteBinding(referenceCopy), usage: byteBinding(usageCopy), settings: byteBinding(settingsCopy) };
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) refuse('EXPECTED_SHA');
  if (bindings.reference.sha256 !== expectedSha256) refuse('REFERENCE_SHA');
  const configuration = settings(parseJson(settingsCopy));
  const rows = parseJson(usageCopy);
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > AUDIT_INPUTS_LIMITS.usageRows) refuse('USAGE_ROW_BOUND');
  const usage = rows.map(usageRow);
  const source = reference(parseJson(referenceCopy), configuration);
  const budget = { returned: 0 };
  const results = usage.map(row => auditRow(row, source, budget));
  const counts = { match: 0, mismatch: 0, missing: 0, ambiguous: 0, unsupported: 0, timing_indeterminate: 0 };
  for (const row of results) counts[row.status]++;
  const report = { schema: REPORT_SCHEMA, implementation: implementationBinding(configuration.implementation_source_sha256), bindings, expected_reference_sha256: expectedSha256, reference_byte_binding_verified: true, settings: configuration, limits: AUDIT_INPUTS_LIMITS, rows: results, coverage: { selected_n: usage.length, counts, verdict_supported_n: counts.match + counts.mismatch, verdict_unknown_n: usage.length - counts.match - counts.mismatch, reference_companies: source.companies.size, reference_vintages: source.sourceRows, returned_matching_vintages: budget.returned, denominator: 'Every explicitly selected usage row; no omitted missing, ambiguous, unsupported or same-day row.' }, established: { source_authorship_verified: false, capture_time_verified: false, completeness_verified: false, full_universe_coverage: null, survivorship_audit: null, source_rights: null, expert_adjudication: null, release_calibration: null, global_availability: null, trading_calendar_lookahead: null, split_or_scaling_adjustment: null }, interpretation: 'Exact supplied concept/unit/period and latest strictly earlier periodic filing observations. Date-only same-day timing remains unknown; later-only values are supplied-snapshot diagnostics. Changed values are not a formal restatement cause. No fetching, aliases, quarter/YTD derivation, split adjustment, advice or orders.' };
  report.content_hash = `sha256:${digest(canonicalJson(report))}`;
  if (Buffer.byteLength(JSON.stringify(report)) > AUDIT_INPUTS_LIMITS.reportBytes) refuse('REPORT_BOUND');
  return frozen(report);
}
