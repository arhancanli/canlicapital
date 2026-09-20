import { EDITORIAL_POLICY_V4, EDITORIAL_EXCLUSIONS_V4 } from './company-editorial-v4.mjs';
import { EDITORIAL_POLICY_V3, EDITORIAL_EXCLUSIONS_V3 } from './company-editorial-v3.mjs';
import { EDITORIAL_POLICY, EDITORIAL_EXCLUSIONS } from './company-editorial-dispositions.mjs';
import { createHash } from 'node:crypto';
import { EXTENDED_CONCEPTS, EXTENDED_POLICY, compatibleUnit } from './company-extended-concepts.mjs';

// Deliberately selected concepts, not arbitrary ticker x keyword combinations.
export const CONCEPTS = {
  Assets: { label: 'Total assets', kind: 'instant', meaning: 'Resources recognized on the balance sheet. Book assets are not the market value of the business.' },
  Liabilities: { label: 'Total liabilities', kind: 'instant', meaning: 'Recognized obligations at the reporting date. The definition and scope differ from interest-bearing debt.' },
  StockholdersEquity: { label: 'Stockholders equity', kind: 'instant', meaning: 'The reported residual interest after liabilities. It is an accounting amount, not market capitalization.' },
  CashAndCashEquivalentsAtCarryingValue: { label: 'Cash and cash equivalents', kind: 'instant', meaning: 'Cash and qualifying short-term liquid investments under the filer’s accounting policy. Restricted cash and longer-term investments may be reported separately.' },
  NetIncomeLoss: { label: 'Net income or loss', kind: 'duration', meaning: 'Reported profit or loss for the period. Check the filing for attribution, exceptional items and discontinued operations before comparing companies.' },
  NetCashProvidedByUsedInOperatingActivities: { label: 'Operating cash flow', kind: 'duration', meaning: 'Cash generated or used by operating activities. Working-capital timing can make this differ substantially from reported income.' },
  PaymentsToAcquirePropertyPlantAndEquipment: { label: 'Capital expenditure payments', kind: 'duration', meaning: 'Cash payments to acquire property, plant and equipment. This taxonomy concept does not capture every form of investment or acquisition.' },
  Revenues: { label: 'Revenue', kind: 'duration', meaning: 'Revenue under this specific accounting concept. A missing value is not zero; filers can use other revenue concepts.' },
  RevenueFromContractWithCustomerExcludingAssessedTax: { label: 'Contract revenue excluding tax', kind: 'duration', meaning: 'Revenue from customer contracts excluding assessed taxes under this specific taxonomy concept. It is not automatically comparable to older revenue tags.' },
};
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export class CompanyReferenceError extends Error {
  constructor(code, message) { super(message); this.name = 'CompanyReferenceError'; this.code = code; }
}

export function selectObservations(fact, kind, asOf, diagnostics = {}) {
  if (!date(asOf) || !['instant', 'duration'].includes(kind)) throw new Error('Invalid selection parameters');
  const reject = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  if (!fact || typeof fact !== 'object' || Array.isArray(fact) || (fact.units !== undefined && (!fact.units || typeof fact.units !== 'object' || Array.isArray(fact.units)))) throw new CompanyReferenceError('INVALID_FACTS', 'Invalid fact units');
  const selected = [];
  for (const [unit, observations] of Object.entries(fact.units ?? {})) {
    if (!Array.isArray(observations)) throw new CompanyReferenceError('INVALID_FACTS', 'Fact observations must be an array');
    const periods = new Map();
    const filings = new Map();
    for (const row of observations) {
      if (!row || typeof row !== 'object' || !Number.isFinite(row.val) || !date(row.end) || !date(row.filed) || row.end > row.filed || !/^\d{10}-\d{2}-\d{6}$/.test(row.accn ?? '')) { reject('invalid_observation'); continue; }
      if (row.filed > asOf || row.end > asOf) { reject('future_observation'); continue; }
      if (!['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A'].includes(row.form)) { reject('nonannual_form'); continue; }
      if (kind === 'duration') {
        if (!date(row.start)) { reject('invalid_start'); continue; }
        const days = (Date.parse(row.end) - Date.parse(row.start)) / 86_400_000 + 1;
        if (days < 300 || days > 400) { reject('nonannual_duration'); continue; }
      } else if (row.start) { reject('duration_on_instant'); continue; }
      const key = `${row.start ?? ''}/${row.end}`;
      const filingKey = `${key}/${row.filed}/${row.accn}`;
      if (filings.has(filingKey) && filings.get(filingKey) !== row.val) throw new CompanyReferenceError('CONFLICTING_FACTS', `Conflicting ${unit} facts for ${key}`);
      filings.set(filingKey, row.val);
      const previous = periods.get(key);
      // Keep a deterministic latest-filed observation; retained facts expose when it was filed.
      if (!previous || `${row.filed}/${row.accn}` > `${previous.filed}/${previous.accn}`) periods.set(key, { ...row, unit });
    }
    selected.push(...periods.values());
  }
  return selected.sort((a, b) => a.unit.localeCompare(b.unit) || b.end.localeCompare(a.end) || (b.start ?? '').localeCompare(a.start ?? ''));
}

export function companyReference(raw, { fetchedAt, expectedCik, diagnostics = {}, selectionPolicy }) {
  if (typeof fetchedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(fetchedAt) || !Number.isFinite(Date.parse(fetchedAt))) throw new Error('A verified UTC capture timestamp is required before publication');
  if (selectionPolicy !== undefined && ![EXTENDED_POLICY, EDITORIAL_POLICY, EDITORIAL_POLICY_V3, EDITORIAL_POLICY_V4].includes(selectionPolicy)) throw new Error('Unknown company selection policy');
  const source = JSON.parse(raw);
  if (!source || !Number.isSafeInteger(source.cik) || source.cik < 1 || source.cik > 9999999999 || source.cik !== Number(expectedCik) || typeof source.entityName !== 'string' || !source.entityName.trim()) throw new CompanyReferenceError('INVALID_ENTITY', 'SEC entity identity mismatch');
  const cik = String(source.cik).padStart(10, '0');
  const asOf = fetchedAt.slice(0, 10);
  if (!date(asOf)) throw new Error('Invalid capture date');
  const concepts = [];
  const editorialExclusions = [];
  const decisions = selectionPolicy === EDITORIAL_POLICY_V4 ? EDITORIAL_EXCLUSIONS_V4 : selectionPolicy === EDITORIAL_POLICY_V3 ? EDITORIAL_EXCLUSIONS_V3 : selectionPolicy === EDITORIAL_POLICY ? EDITORIAL_EXCLUSIONS : [];
  const sourceHash = createHash('sha256').update(raw).digest('hex');
  const definitions = [EXTENDED_POLICY, EDITORIAL_POLICY, EDITORIAL_POLICY_V3, EDITORIAL_POLICY_V4].includes(selectionPolicy) ? { ...CONCEPTS, ...EXTENDED_CONCEPTS } : CONCEPTS;
  for (const [tag, definition] of Object.entries(definitions)) {
    const fact = source.facts?.['us-gaap']?.[tag];
    if (!fact) continue;
    const disposition = decisions.find(row => row.cik === cik && row.tag === tag);
    if (disposition) {
      if (sourceHash !== disposition.source_sha256) throw new CompanyReferenceError('EDITORIAL_REVIEW_REQUIRED', `Changed source requires renewed scope review for ${cik}/${tag}`);
      editorialExclusions.push({ tag, reason: disposition.reason, filing_url: disposition.filing_url });
      diagnostics.editorial_scope_excluded = (diagnostics.editorial_scope_excluded ?? 0) + 1;
      continue;
    }
    let observations = selectObservations(fact, definition.kind, asOf, diagnostics);
    if (Object.hasOwn(EXTENDED_CONCEPTS, tag)) {
      observations = observations.filter(row => {
        if (compatibleUnit(row.unit, definition.unitKind)) return true;
        diagnostics.incompatible_unit = (diagnostics.incompatible_unit ?? 0) + 1; return false;
      });
      const units = new Map();
      for (const row of observations) { if (!units.has(row.unit)) units.set(row.unit, []); units.get(row.unit).push(row); }
      if (![...units.values()].some(rows => new Set(rows.map(row => row.end)).size >= 3 && new Set(rows.map(row => row.val)).size >= 2)) {
        diagnostics.insufficient_varying_history = (diagnostics.insufficient_varying_history ?? 0) + 1; continue;
      }
    }
    // A page must have a real multi-period history, not a single isolated number.
    if (new Set(observations.map((row) => row.end)).size < 3) continue;
    concepts.push({ tag, taxonomy: 'us-gaap', ...definition, observations });
  }
  if (concepts.length < 4) throw new CompanyReferenceError('INSUFFICIENT_COVERAGE', `Insufficient substantive coverage for CIK ${cik}`);
  return {
    schema: 'canli.company-reference.v1', cik, name: source.entityName,
    ...(selectionPolicy ? { selection_policy: selectionPolicy } : {}),
    source_url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
    source_sha256: sourceHash, fetched_at: fetchedAt,
    policy: 'Latest-filed annual-report facts per unit and reporting period at capture time. Duration facts cover 300 to 400 days. This selection can include restatements and is not a point-in-time backtest dataset. Missing concepts are omitted, never zero-filled. Values retain original units and are not currency converted.' + (selectionPolicy ? ' Extended concepts require compatible unit shapes and at least three reporting ends with changing values within one unit. Constant or incompatible added histories are omitted.' : ''),
    claim_boundary: 'Public company accounting reference, not market prices, returns, an investment recommendation, or ALPHAC performance. Validate a separately constructed return series with the validation API; accounting values are not returns.',
    ...(editorialExclusions.length ? { editorial_exclusions: editorialExclusions } : {}),
    concepts,
  };
}

export function verifyCompanyReference(record, original) {
  const reproduced = companyReference(original, { fetchedAt: record.fetched_at, expectedCik: record.cik, selectionPolicy: record.selection_policy });
  for (const field of ['selection_policy', 'name', 'source_url', 'source_sha256', 'policy', 'claim_boundary', 'editorial_exclusions', 'concepts']) {
    if (JSON.stringify(record[field]) !== JSON.stringify(reproduced[field])) throw new Error(`Company ${record.cik} ${field} does not reproduce from its captured source`);
  }
}
