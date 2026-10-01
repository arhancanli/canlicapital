import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../canonical-json.mjs';

export const SCHEMA = 'canli.filing-facts-first-later-candidate.v1';
export const TEMPLATE = 'first_later_annual_value';
export const POLICY = Object.freeze({
  version: 'canli.filing-facts-annual-source-policy.v1',
  taxonomy: 'us-gaap', unit: 'USD', forms: Object.freeze(['10-K', '10-K/A']), fp: 'FY',
  min_duration_days: 335, max_duration_days: 395,
  amounts: 'safe_integer_USD_values_and_difference',
  cutoff: 'filed_date_lte_as_of',
  history: 'eligible_observations_present_in_one_captured_companyfacts_response',
  earliest: 'earliest_eligible_filed_date_present_not_first_ever',
  percent_change: '100 * (later - earliest) / abs(earliest); null when earliest is zero',
});
export const LIMITS = Object.freeze([
  'Machine-checked candidate; no human or expert verification.',
  'Earliest and latest refer only to eligible observations present in the named snapshot through the filed-date cutoff; history may be incomplete.',
  'Filed dates do not establish intraday availability; capture time is record metadata, not independent time attestation.',
  'A numeric difference does not establish an accounting restatement, its cause or the correct economic comparison basis.',
  'Only exact USD/us-gaap annual-duration intervals in 10-K(/A) FY rows are eligible; quarter, YTD, instant and other-form rows are excluded.',
  'This initial candidate policy requires safe integer USD values and differences; percentages use binary64 arithmetic.',
]);

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
export function filingUrl(cik, accession) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll('-', '')}/`;
}
export function questionFor(item) {
  return `In the hash-bound SEC companyfacts snapshot for ${item.company.name}, use only USD ${item.period.taxonomy}:${item.period.concept} observations for the exact interval ${item.period.start} to ${item.period.end} in 10-K or 10-K/A FY rows filed through ${item.as_of}. Compare the earliest eligible observation present (${item.earliest.filed}, accession ${item.earliest.accn}) with the latest eligible observation present (${item.later.filed}, accession ${item.later.accn}). What are their values, later minus earliest in USD, and the percent difference relative to the absolute earliest value? Earliest is limited to this snapshot, not first-ever reporting.`;
}
export function candidateId(item) {
  const { id, ...content } = item;
  return createHash('sha256').update(canonicalJson(content)).digest('hex');
}
