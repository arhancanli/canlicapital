// mcp-books/src/xbrl.mjs
//
// Canli Report's facts as an xBRL-JSON report: XBRL International's Open Information Model in JSON, the form
// XBRL processors and other agents read without parsing XML. Each fact names its concept, entity, period and
// unit, with the amount in the currency's major unit and its decimal places. A draft for review, like the facts:
// the namespace and schema must be those of the taxonomy release you file under, and an account with no concept
// is left out and listed, never guessed.
import { minorUnits, state } from "./ledger.mjs";
import { toFacts } from "./report.mjs";

export const XBRL_JSON = "https://xbrl.org/2021/xbrl-json";
// US GAAP's namespace and element schema follow its year; an IFRS release is named by its date, so it is given.
const usGaap = (year) => ({ namespace: `http://fasb.org/us-gaap/${year}`, schema: `https://xbrl.fasb.org/us-gaap/${year}/elts/us-gaap-${year}.xsd` });
const nextDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
// An XBRL date is the end of that day, which the model writes as the midnight that starts the next.
export const oimPeriod = (p) => (p.instant ? `${nextDay(p.instant)}T00:00:00` : `${p.start}T00:00:00/${nextDay(p.end)}T00:00:00`);

export function toXbrlJson(book, { asOf, from, to, taxonomy = "us-gaap", entity, scheme = "https://canlicapital.com/books/entity", year = 2025, namespace, schema } = {}) {
  const facts = toFacts(book, { asOf, from, to, taxonomy });
  const release = taxonomy === "us-gaap" ? { ...usGaap(year), ...(namespace ? { namespace } : {}), ...(schema ? { schema } : {}) } : { namespace, schema };
  if (!release.namespace || !release.schema) throw new Error(`For ${taxonomy}, give namespace and schema: those of the taxonomy release you file under (for IFRS, the ifrs-full namespace and the core schema of that release).`);
  const id = String(entity ?? state(book).name).trim().replace(/\s+/g, "_");
  if (!id) throw new Error("entity: the identifier the report is filed under, such as an LEI or a registration number.");
  const decimals = minorUnits(facts.currency);
  const report = {
    documentInfo: { documentType: XBRL_JSON, namespaces: { [taxonomy]: release.namespace, iso4217: "http://www.xbrl.org/2003/iso4217", entity: scheme }, taxonomy: [release.schema] },
    facts: Object.fromEntries(facts.facts.map((f, i) => [`f${i + 1}`, { value: f.text, decimals, dimensions: { concept: `${taxonomy}:${f.concept}`, entity: `entity:${id}`, period: oimPeriod(f.period), unit: `iso4217:${facts.currency}` } }])),
  };
  return { report, facts: facts.facts.length, unmapped: facts.unmapped };
}
