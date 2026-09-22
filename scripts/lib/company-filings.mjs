// Per-filing cross-sections of a company's captured SEC companyfacts source.
//
// A filing page answers "what did this filing report?" for one accession: every
// published concept that filing tagged, with the periods it covered, as tagged.
// This is a view over the same bytes as the company record. The selector
// (company-reference.mjs) decides identity, coverage and editorial holds; this
// module never admits a company the selector rejects and never shows a value
// the selector's holds exclude. Design: docs/goal/FILING_PAGE_FAMILY_PROPOSAL.md.
import { createHash } from 'node:crypto';
import { CONCEPTS, CompanyReferenceError, companyReference } from './company-reference.mjs';
import { EXTENDED_CONCEPTS, compatibleUnit } from './company-extended-concepts.mjs';
import { EXPANDED_CONCEPTS_V23 } from './company-expanded-concepts-v23.mjs';

export const FILINGS_POLICY = 'filings-v1';
export const FILING_FORMS = Object.freeze(['10-K', '10-K/A', '10-Q', '10-Q/A', '20-F', '20-F/A', '40-F', '40-F/A']);
export const MIN_FILING_CONCEPTS = 8;
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export const filingPath = (cik, accession) => `/companies/${cik}/filings/${accession}`;
export const filingsIndexPath = cik => `/companies/${cik}/filings`;
export const secFilingIndexUrl = (cik, accession) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}/`;

export function conceptDefinitions(selectionPolicy) {
  if (selectionPolicy === 'extended-v23') return { ...CONCEPTS, ...EXTENDED_CONCEPTS, ...EXPANDED_CONCEPTS_V23 };
  if (selectionPolicy === 'extended-v22') return { ...CONCEPTS, ...EXTENDED_CONCEPTS };
  throw new Error(`Filings are defined for extended-v22 and extended-v23 only, not ${selectionPolicy}`);
}

// Pure derivation from a parsed source and the selector's record for the same
// bytes. Exported so the rules can be tested with synthetic inputs.
export function filingsFromSource(source, record, definitions, asOf) {
  if (!date(asOf)) throw new Error('Invalid capture date');
  const scopeHeld = new Set((record.editorial_exclusions ?? []).filter(row => !row.observation).map(row => row.tag));
  const observationHolds = (record.editorial_exclusions ?? []).filter(row => row.observation);
  const held = (tag, row) => observationHolds.some(hold => hold.tag === tag && Object.entries(hold.observation).every(([key, value]) => row[key] === value));
  const byAccession = new Map();
  const diagnostics = { invalid_observation: 0, future_observation: 0, other_form: 0, incompatible_unit: 0, scope_held: 0, observation_held: 0, duplicate_fact: 0 };
  for (const [tag, definition] of Object.entries(definitions)) {
    const fact = source.facts?.['us-gaap']?.[tag];
    if (!fact) continue;
    if (scopeHeld.has(tag)) { diagnostics.scope_held++; continue; }
    for (const [unit, rows] of Object.entries(fact.units ?? {})) {
      if (!Array.isArray(rows)) throw new CompanyReferenceError('INVALID_FACTS', 'Fact observations must be an array');
      if (!compatibleUnit(unit, definition.unitKind ?? 'money')) { diagnostics.incompatible_unit++; continue; }
      for (const row of rows) {
        if (!row || typeof row !== 'object' || !Number.isFinite(row.val) || !date(row.end) || !date(row.filed) || row.end > row.filed || !ACCESSION.test(row.accn ?? '')) { diagnostics.invalid_observation++; continue; }
        if (row.filed > asOf || row.end > asOf) { diagnostics.future_observation++; continue; }
        if (!FILING_FORMS.includes(row.form)) { diagnostics.other_form++; continue; }
        if (definition.kind === 'duration' ? !date(row.start) || row.start > row.end : row.start !== undefined) { diagnostics.invalid_observation++; continue; }
        if (held(tag, row)) { diagnostics.observation_held++; continue; }
        const filing = byAccession.get(row.accn) ?? { accession: row.accn, form: row.form, filed: row.filed, fy: row.fy ?? null, fp: row.fp ?? null, facts: new Map(), withheld: null };
        if (filing.form !== row.form || filing.filed !== row.filed || filing.fy !== (row.fy ?? null) || filing.fp !== (row.fp ?? null)) filing.withheld = 'INCONSISTENT_FILING_METADATA';
        const key = `${tag}/${unit}/${row.start ?? ''}/${row.end}`;
        const previous = filing.facts.get(key);
        if (previous) {
          if (previous.val !== row.val) filing.withheld = filing.withheld ?? 'CONFLICTING_FACTS';
          else diagnostics.duplicate_fact++;
        } else filing.facts.set(key, { tag, unit, ...(definition.kind === 'duration' ? { start: row.start } : {}), end: row.end, val: row.val });
        byAccession.set(row.accn, filing);
      }
    }
  }
  const order = Object.keys(definitions);
  const filings = [], withheld = [];
  let thin = 0;
  for (const filing of byAccession.values()) {
    if (filing.withheld) { withheld.push({ accession: filing.accession, form: filing.form, filed: filing.filed, reason: filing.withheld }); continue; }
    const tags = new Set([...filing.facts.values()].map(fact => fact.tag));
    if (tags.size < MIN_FILING_CONCEPTS) { thin++; continue; }
    const concepts = [];
    for (const tag of order) {
      if (!tags.has(tag)) continue;
      const definition = definitions[tag];
      const facts = [...filing.facts.values()].filter(fact => fact.tag === tag).map(({ tag: _, ...fact }) => ({ ...fact, ...(fact.start ? { days: (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000 + 1 } : {}) }))
        .sort((a, b) => a.unit.localeCompare(b.unit) || b.end.localeCompare(a.end) || (b.start ?? '').localeCompare(a.start ?? ''));
      concepts.push({ tag, taxonomy: 'us-gaap', label: definition.label, kind: definition.kind, meaning: definition.meaning, facts });
    }
    filings.push({ accession: filing.accession, form: filing.form, amendment: filing.form.endsWith('/A'), filed: filing.filed, fiscal_year: filing.fy, fiscal_period: filing.fp, sec_index_url: secFilingIndexUrl(record.cik, filing.accession), concept_count: concepts.length, fact_count: concepts.reduce((n, c) => n + c.facts.length, 0), concepts });
  }
  filings.sort((a, b) => b.filed.localeCompare(a.filed) || b.accession.localeCompare(a.accession));
  withheld.sort((a, b) => b.filed.localeCompare(a.filed) || b.accession.localeCompare(a.accession));
  return { filings, withheld, summary: { accessions_seen: byAccession.size, filings: filings.length, thin_filings: thin, withheld_filings: withheld.length, diagnostics } };
}

export function companyFilings(raw, { fetchedAt, expectedCik, selectionPolicy = 'extended-v23' }) {
  const record = companyReference(raw, { fetchedAt, expectedCik, selectionPolicy });
  const definitions = conceptDefinitions(selectionPolicy);
  const source = JSON.parse(raw);
  const { filings, withheld, summary } = filingsFromSource(source, record, definitions, fetchedAt.slice(0, 10));
  return {
    schema: 'canli.company-filings.v1', cik: record.cik, name: record.name,
    selection_policy: selectionPolicy, filings_policy: FILINGS_POLICY,
    source_url: record.source_url, source_sha256: record.source_sha256, fetched_at: record.fetched_at,
    policy: `Every published concept a filing tagged, with the periods it covered, as reported in that filing at capture time. Forms ${FILING_FORMS.join(', ')}. A filing page needs at least ${MIN_FILING_CONCEPTS} published concepts. Later filings can restate these values; the company history pages show the latest-filed value per period.`,
    claim_boundary: record.claim_boundary,
    ...(record.editorial_exclusions ? { editorial_exclusions: record.editorial_exclusions } : {}),
    filings, withheld, summary,
  };
}

export function filingsHash(document) {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex');
}
