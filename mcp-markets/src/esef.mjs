// european_filings: a company's annual financial report in the European Single Electronic Format
// (ESEF), the tagged report issuers on EU and EEA regulated markets file, as collected by XBRL
// International's filings.xbrl.org. The company is found by name in the repository's index (or
// given by its LEI); its filings come from the live API; the figures are the report's own tagged
// facts (IFRS concepts, the company's currency and scale), read from the report's xBRL-JSON.
import { z } from "zod";

import { getJson, getText, NotFound } from "./sources.mjs";

const BASE = "https://filings.xbrl.org";
const LEI = /^[A-Z0-9]{18}[0-9]{2}$/;

// The measures most questions ask for, each with the IFRS concepts that carry it, in order.
export const MEASURES = Object.freeze({
  revenue: ["ifrs-full:Revenue", "ifrs-full:RevenueFromContractsWithCustomers"],
  gross_profit: ["ifrs-full:GrossProfit"],
  operating_income: ["ifrs-full:ProfitLossFromOperatingActivities"],
  pretax_income: ["ifrs-full:ProfitLossBeforeTax"],
  income_tax: ["ifrs-full:IncomeTaxExpenseContinuingOperations"],
  net_income: ["ifrs-full:ProfitLoss"],
  net_income_to_owners: ["ifrs-full:ProfitLossAttributableToOwnersOfParent"],
  eps_basic: ["ifrs-full:BasicEarningsLossPerShare"],
  eps_diluted: ["ifrs-full:DilutedEarningsLossPerShare"],
  rnd: ["ifrs-full:ResearchAndDevelopmentExpense"],
  total_assets: ["ifrs-full:Assets"],
  total_liabilities: ["ifrs-full:Liabilities"],
  equity: ["ifrs-full:Equity"],
  equity_to_owners: ["ifrs-full:EquityAttributableToOwnersOfParent"],
  cash: ["ifrs-full:CashAndCashEquivalents"],
  operating_cash_flow: ["ifrs-full:CashFlowsFromUsedInOperatingActivities"],
  capex: ["ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
  dividends_paid: ["ifrs-full:DividendsPaidClassifiedAsFinancingActivities", "ifrs-full:DividendsPaid"],
  dividend_per_share: ["ifrs-full:DividendsRecognisedAsDistributionsToOwnersPerShare"],
  shares_outstanding: ["ifrs-full:NumberOfSharesOutstanding"],
  weighted_average_shares: ["ifrs-full:WeightedAverageShares"],
});

export const esefInput = z.object({
  company: z.string().min(2).max(120).describe("Company name (ASML, LVMH, TotalEnergies) or its LEI (724500Y6DUVHQD6OXN27)."),
  year: z.number().int().min(2017).max(2100).optional().describe("Fiscal year the report covers (the year its period ends); default the latest filed."),
  words: z.string().min(2).max(80).optional().describe("Also find the report's other figures whose concept names hold these words (\"net system sales\", \"lease liabilities\")."),
}).strict();

const LEGAL = new Set("nv sa se plc ag spa asa ab oyj as aps sas kgaa gmbh bv nyrt dd ltd limited inc corp corporation sgps sicav societe anonyme the holding holdings group company co".split(" "));
// A name's words for matching: no accents, punctuation, legal-form or generic words, and no single
// letters (the pieces of "A/S" or "N.V.").
export function nameWords(name) {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 1 && !LEGAL.has(w));
}

// Every filer the repository knows (about 7,400 names and LEIs, one request of about 3 MB), read
// once a session.
async function filers(session) {
  if (session.esefFilers) return session.esefFilers;
  const data = await patient(session, `${BASE}/api/entities?page%5Bsize%5D=10000`, { maxBytes: 32 * 1024 * 1024 });
  session.esefFilers = (Array.isArray(data?.data) ? data.data : []).map((e) => e?.attributes).filter((x) => x?.identifier && x?.name)
    .map((x) => ({ lei: x.identifier, name: x.name, words: nameWords(x.name) }));
  return session.esefFilers;
}

// Filers whose names hold every word asked for, the closest first: the fewest extra words, then
// the shortest name.
export function matchFilers(list, query) {
  const want = nameWords(query);
  if (!want.length) return [];
  return list.filter((f) => want.every((w) => f.words.includes(w)))
    .map((f) => ({ ...f, extra: f.words.length - want.length }))
    .sort((a, b) => a.extra - b.extra || a.name.length - b.name.length);
}

// The repository's API is sometimes slow to answer; a timed-out request is tried once more.
const patient = (session, url, opts) => getJson(session, url, opts).catch((e) => (/did not answer/.test(e?.message ?? "") ? getJson(session, url, opts) : Promise.reject(e)));

async function entityFilings(session, lei) {
  const data = await patient(session, `${BASE}/api/entities/${lei}/filings?page%5Bsize%5D=100`);
  return (Array.isArray(data?.data) ? data.data : []).map((f) => f.attributes).filter((a) => a?.period_end && a?.json_url)
    .sort((a, b) => b.period_end.localeCompare(a.period_end) || String(b.date_added).localeCompare(String(a.date_added)));
}

// OIM periods are boundaries: an instant at 2026-01-01T00:00:00 is the end of 2025-12-31, and a
// duration's end is exclusive in the same way.
const dayBefore = (t) => new Date(Date.parse(`${t.slice(0, 10)}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
export function periodOf(p) {
  if (!p) return null;
  const [a, b] = String(p).split("/");
  if (!b) return /T00:00:00/.test(a) ? dayBefore(a) : a.slice(0, 10);
  return `${a.slice(0, 10)} to ${/T00:00:00/.test(b) ? dayBefore(b) : b.slice(0, 10)}`;
}
export function unitOf(u) {
  if (!u) return null;
  const [num, den] = String(u).split("/");
  const name = (x) => x.replace(/^iso4217:/, "").replace(/^xbrli:/, "").replace(/^utr:/, "");
  return den ? `${name(num)} per ${name(den).replace(/s$/, "")}` : name(num);
}

// The report's own figures: facts with no breakdown axes (the statements' totals), one per
// concept, period and unit.
export function plainFacts(report) {
  const out = new Map();
  for (const f of Object.values(report?.facts ?? {})) {
    const d = f?.dimensions ?? {};
    if (!d.concept || !d.unit || Object.keys(d).some((k) => !["concept", "entity", "period", "unit", "language"].includes(k))) continue;
    const value = Number(f.value);
    if (!Number.isFinite(value)) continue;
    const key = `${d.concept}|${d.period}|${d.unit}`;
    if (!out.has(key)) out.set(key, { concept: d.concept, period: periodOf(d.period), end: String(d.period).split("/").at(-1), unit: unitOf(d.unit), value, decimals: f.decimals ?? null });
  }
  return [...out.values()];
}

// The latest annual report: issuers that also tag interim reports end each year on their fiscal
// year end, so the filing on the usual year-end day of the complete years is the annual one.
export function annual(filings) {
  const byYear = new Map();
  for (const f of filings) { const y = f.period_end.slice(0, 4); if (!byYear.has(y) || f.period_end > byYear.get(y)) byYear.set(y, f.period_end); }
  const years = [...byYear.keys()].sort();
  const counts = new Map();
  for (const y of years.slice(0, -1)) { const md = byYear.get(y).slice(5); counts.set(md, (counts.get(md) ?? 0) + 1); }
  const fye = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (fye && filings.find((f) => f.period_end.slice(5) === fye)) ?? filings[0];
}

const camelWords = (concept) => concept.split(":").pop().replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/\s+/);

export async function europeanFilings(session, args) {
  const a = esefInput.parse(args);
  const q = a.company.trim();
  let lei = LEI.test(q.toUpperCase()) ? q.toUpperCase() : null, name = null, alternatives = [], filings = [], byName = false, passedOver = [];
  if (lei) {
    name = (await getJson(session, `${BASE}/api/entities/${lei}`).catch(() => null))?.data?.attributes?.name ?? null;
    filings = await entityFilings(session, lei);
  } else {
    const hits = matchFilers(await filers(session), q);
    if (!hits.length) throw new NotFound(`No ESEF filer named "${q}" in filings.xbrl.org. ESEF covers issuers on EU and EEA regulated markets (and UK issuers' reports while the UK used it); Swiss, US and other companies file elsewhere. Pass the LEI if you know it.`);
    // The closest names first; a filer listed without any report is passed over, and said.
    const empty = [];
    for (const h of hits.slice(0, 4)) {
      filings = await entityFilings(session, h.lei);
      if (filings.length) { ({ lei, name } = h); byName = h.extra > 0 || empty.length > 0; break; }
      empty.push(h.name);
    }
    passedOver = empty;
    if (!lei) throw new NotFound(`filings.xbrl.org lists ${hits.slice(0, 4).map((h) => h.name).join("; ")}, but holds no report with data for ${hits.length > 1 ? "any of them" : "it"}. German issuers mostly file with the Bundesanzeiger instead.`);
    alternatives = hits.filter((h) => h.lei !== lei).slice(0, 5).map((h) => ({ name: h.name, lei: h.lei }));
  }
  if (!filings.length) throw new NotFound(`filings.xbrl.org has no ESEF report with data for ${name ?? lei}.`);
  const filing = a.year ? filings.find((f) => Number(f.period_end.slice(0, 4)) === a.year) : annual(filings);
  if (!filing) throw new NotFound(`${name ?? lei} has no ESEF report for fiscal ${a.year} in filings.xbrl.org; it has ${[...new Set(filings.map((f) => f.period_end.slice(0, 4)))].join(", ")}.`);
  const url = `${BASE}${filing.json_url}`;
  const report = JSON.parse(await getText(session, url, { maxBytes: 64 * 1024 * 1024 }));
  const facts = plainFacts(report);
  // Newest periods first: the year reported, then the comparatives.
  const ends = [...new Set(facts.map((f) => f.end))].sort().reverse();
  const rank = (f) => ends.indexOf(f.end);
  const rows = [];
  for (const [measure, concepts] of Object.entries(MEASURES)) {
    const concept = concepts.find((c) => facts.some((f) => f.concept === c));
    if (!concept) continue;
    for (const f of facts.filter((x) => x.concept === concept).sort((x, y) => rank(x) - rank(y)).slice(0, 3)) rows.push([measure, concept, f.period, f.value, f.unit, f.decimals]);
  }
  const words = a.words ? a.words.toLowerCase().split(/\s+/).filter(Boolean) : null;
  const found = words ? facts.filter((f) => { const w = camelWords(f.concept); return words.every((x) => w.some((y) => y.startsWith(x))); }).sort((x, y) => x.concept.localeCompare(y.concept) || rank(x) - rank(y)).slice(0, 60) : null;
  return {
    company: { name: name ?? lei, lei, country: filing.country },
    filing: { period_end: filing.period_end, added: String(filing.date_added).slice(0, 10), errors: filing.error_count ?? null, warnings: filing.warning_count ?? null, viewer: `${BASE}${filing.viewer_url}`, report: `${BASE}${filing.report_url}`, data: url },
    facts: { columns: ["measure", "concept", "period", "value", "unit", "decimals"], rows },
    ...(found ? { found: { words: a.words, columns: ["concept", "period", "value", "unit", "decimals"], rows: found.map((f) => [f.concept, f.period, f.value, f.unit, f.decimals]) } } : {}),
    other_years: [...new Set(filings.map((f) => f.period_end))].filter((p) => p !== filing.period_end),
    ...(alternatives.length ? { also_matched: alternatives } : {}),
    ...(byName ? { matched_by_name: `"${q}" matched ${name}${passedOver.length ? ` (${passedOver.join("; ")} ${passedOver.length > 1 ? "have" : "has"} no report there)` : ""}: check that it is the company you meant (a subsidiary or a namesake can match a short name), or pass the LEI.` } : {}),
    note: "Figures as the company tagged them in its ESEF report: totals only (no breakdowns by segment or axis), values in the unit shown at full scale, decimals giving their precision (-6: to the million). Read a figure in the viewer before relying on it.",
    limits: [
      "From filings.xbrl.org, XBRL International's collection of ESEF reports; it is not the official storage mechanism of every country, and a report can be missing or arrive later there.",
      "ESEF covers annual financial reports of issuers on EU and EEA regulated markets; half-year reports are mostly untagged.",
      "Not investment advice.",
    ],
  };
}
