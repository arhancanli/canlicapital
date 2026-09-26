// Filing-facts reasoning items: templates over one company record (canli.company-reference.v1).
// Every item names its source filing(s) and units, and its answer is derived only from XBRL facts
// the record holds. check.mjs re-derives every answer by a separate path. Deterministic given rng.
//
// Periods: the record keeps one value per period end and unit (the latest-reported value). Instant
// concepts are balances at a date; duration concepts in these records are annual (fiscal-year)
// values. Only facts from annual reports (fp FY on 10-K, 10-K/A, 20-F or 40-F) are used, so a
// question never mixes a quarter with a year.

export const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);

export const secFilingUrl = (cik, accn) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replaceAll("-", "")}/`;

// Readable, fixed names for the concepts templates use; any other tag uses its record label.
export const CONCEPT_NAMES = Object.freeze({
  Assets: "total assets",
  Liabilities: "total liabilities",
  StockholdersEquity: "total stockholders' equity",
  CashAndCashEquivalentsAtCarryingValue: "cash and cash equivalents",
  NetIncomeLoss: "net income (loss)",
  Revenues: "revenues",
  RevenueFromContractWithCustomerExcludingAssessedTax: "revenue from contracts with customers",
  NetCashProvidedByUsedInOperatingActivities: "net cash provided by (used in) operating activities",
  NetCashProvidedByUsedInInvestingActivities: "net cash provided by (used in) investing activities",
  NetCashProvidedByUsedInFinancingActivities: "net cash provided by (used in) financing activities",
  RetainedEarningsAccumulatedDeficit: "retained earnings (accumulated deficit)",
  PropertyPlantAndEquipmentNet: "net property, plant and equipment",
  IncomeTaxExpenseBenefit: "income tax expense (benefit)",
  ShareBasedCompensation: "share-based compensation",
  EarningsPerShareBasic: "basic earnings per share",
  EarningsPerShareDiluted: "diluted earnings per share",
});

const MONEY_UNITS = new Set(["USD", "EUR", "CAD", "GBP", "JPY", "CHF", "AUD"]);

// One fact per concept, period end and unit. A period whose annual filings disagree on the value
// (94 of 261,936 periods in the 2026-09-26 sample, e.g. two 10-Ks with different fiscal-year start
// dates) is ambiguous and dropped; when they agree, the latest-filed fact is kept.
export function annualFacts(record) {
  const out = new Map();
  for (const concept of record.concepts) {
    const groups = new Map();
    for (const o of concept.observations) {
      if (o.fp !== "FY" || !ANNUAL_FORMS.has(o.form) || !Number.isFinite(o.val) || typeof o.accn !== "string") continue;
      const key = `${o.end}|${o.unit}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    const facts = [];
    for (const group of groups.values()) {
      if (new Set(group.map((o) => o.val)).size > 1) continue;
      facts.push(group.reduce((a, b) => (b.filed > a.filed ? b : a)));
    }
    if (facts.length) out.set(concept.tag, { concept, facts: facts.sort((a, b) => (a.end < b.end ? 1 : -1)) });
  }
  return out;
}

const nameOf = (entry) => CONCEPT_NAMES[entry.concept.tag] ?? entry.concept.label?.toLowerCase() ?? entry.concept.tag;
const periodPhrase = (entry, end) => (entry.concept.kind === "instant" ? `as of ${end}` : `for the fiscal year ended ${end}`);
const unitPhrase = (unit) => (MONEY_UNITS.has(unit) ? `in ${unit}` : unit.includes("/") ? `in ${unit.replace("/", " per ")}` : `in ${unit}`);
const source = (fact) => `its ${fact.form} filed ${fact.filed} (accession ${fact.accn})`;
const cite = (record, entry, fact) => ({ concept: entry.concept.tag, taxonomy: entry.concept.taxonomy, end: fact.end, val: fact.val, unit: fact.unit, accn: fact.accn, form: fact.form, filed: fact.filed, url: secFilingUrl(record.cik, fact.accn) });
const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];
const round = (x, places) => Number(x.toFixed(places));

export const TEMPLATES = Object.freeze({
  // One value, as reported in a named annual filing.
  lookup(record, facts, rng) {
    const entry = pick(rng, [...facts.values()]);
    const fact = pick(rng, entry.facts.slice(0, 6));
    return {
      question: `According to ${record.name}'s XBRL data in ${source(fact)}, what was ${nameOf(entry)} ${periodPhrase(entry, fact.end)}, ${unitPhrase(fact.unit)}?`,
      answer: { kind: "number", value: fact.val, unit: fact.unit },
      facts: [cite(record, entry, fact)],
      derivation: "fact",
      hops: 1,
    };
  },
  // Year-over-year change of one concept: absolute and percent.
  change(record, facts, rng) {
    const eligible = [...facts.values()].filter((e) => e.facts.length >= 2);
    if (!eligible.length) return null;
    const entry = pick(rng, eligible);
    const i = Math.floor(rng() * Math.min(entry.facts.length - 1, 5));
    const [later, earlier] = [entry.facts[i], entry.facts[i + 1]];
    if (later.unit !== earlier.unit || earlier.val === 0) return null;
    const span = entry.concept.kind === "instant"
      ? `from its balance as of ${earlier.end} to its balance as of ${later.end}`
      : `from the fiscal year ended ${earlier.end} to the fiscal year ended ${later.end}`;
    return {
      question: `Using ${record.name}'s annual XBRL data, by what percentage did ${nameOf(entry)} change ${span}? Give the change relative to the earlier value's magnitude, as a percent to two decimals.`,
      answer: { kind: "percent", value: round(((later.val - earlier.val) / Math.abs(earlier.val)) * 100, 2), unit: "percent" },
      facts: [cite(record, entry, earlier), cite(record, entry, later)],
      derivation: "(later - earlier) / |earlier| * 100",
      hops: 2,
    };
  },
  // A ratio of two concepts for the same period.
  ratio(record, facts, rng) {
    const pairs = [
      ["NetIncomeLoss", "Revenues", "net profit margin (net income divided by revenues)"],
      ["NetIncomeLoss", "RevenueFromContractWithCustomerExcludingAssessedTax", "net profit margin (net income divided by revenue from contracts with customers)"],
      ["Liabilities", "Assets", "ratio of total liabilities to total assets"],
      ["NetIncomeLoss", "Assets", "net income divided by total assets at the fiscal year end"],
      ["CashAndCashEquivalentsAtCarryingValue", "Assets", "share of total assets held as cash and cash equivalents"],
    ].filter(([a, b]) => facts.has(a) && facts.has(b));
    if (!pairs.length) return null;
    const [a, b, label] = pick(rng, pairs);
    const numerators = new Map(facts.get(a).facts.map((f) => [f.end + f.unit, f]));
    const shared = facts.get(b).facts.filter((f) => numerators.has(f.end + f.unit) && f.val !== 0);
    if (!shared.length) return null;
    const den = pick(rng, shared.slice(0, 5));
    const num = numerators.get(den.end + den.unit);
    return {
      question: `From ${record.name}'s annual XBRL data, what was its ${label} for the period ending ${den.end}? Give a decimal ratio to four places.`,
      answer: { kind: "ratio", value: round(num.val / den.val, 4), unit: "ratio" },
      facts: [cite(record, facts.get(a), num), cite(record, facts.get(b), den)],
      derivation: `${a} / ${b}`,
      hops: 2,
    };
  },
  // Assets minus liabilities at one balance date (arithmetic over two facts, not an identity claim).
  net_assets(record, facts, rng) {
    if (!facts.has("Assets") || !facts.has("Liabilities")) return null;
    const liab = new Map(facts.get("Liabilities").facts.map((f) => [f.end + f.unit, f]));
    const shared = facts.get("Assets").facts.filter((f) => liab.has(f.end + f.unit));
    if (!shared.length) return null;
    const assets = pick(rng, shared.slice(0, 5));
    const liabilities = liab.get(assets.end + assets.unit);
    return {
      question: `Using ${record.name}'s XBRL balance sheet data as of ${assets.end}, what is total assets minus total liabilities, ${unitPhrase(assets.unit)}?`,
      answer: { kind: "number", value: assets.val - liabilities.val, unit: assets.unit },
      facts: [cite(record, facts.get("Assets"), assets), cite(record, facts.get("Liabilities"), liabilities)],
      derivation: "Assets - Liabilities",
      hops: 2,
    };
  },
  // A fiscal year before the company's earliest annual XBRL fact for a concept it does report: the
  // right answer is that the filings' XBRL data do not report it. Absence is claimed only for this
  // source, never for the company's history in general.
  unanswerable(record, facts, rng) {
    const entry = pick(rng, [...facts.values()]);
    const earliest = entry.facts.at(-1);
    const year = Number(earliest.end.slice(0, 4)) - 2 - Math.floor(rng() * 4);
    const end = `${year}${earliest.end.slice(4)}`;
    return {
      question: `According to ${record.name}'s XBRL-tagged SEC filings, what was ${nameOf(entry)} ${periodPhrase(entry, end)}? If those filings' XBRL data do not report it, say so.`,
      answer: { kind: "not_reported", value: null, unit: null, earliest_reported_end: earliest.end },
      facts: [cite(record, entry, earliest)],
      derivation: `no annual fact for ${entry.concept.tag} ending ${end}; earliest is ${earliest.end}`,
      hops: 1,
    };
  },
});
