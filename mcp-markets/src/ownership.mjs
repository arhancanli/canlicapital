// Who owns more than 5 percent of a company, from Schedules 13D and 13G: passive holders (13G) and
// holders who may seek to influence or change control (13D, which states its purpose). Since
// December 2024 both are filed as structured XML; earlier ones are text and are listed unread.
import { z } from "zod";

import { archiveBase, filings, getJson, getText, NotFound, resolveEntity } from "./sources.mjs";
import { all, child, num, parseXml, textAt } from "./xml.mjs";

const round = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const isoDay = (session, back = 0) => new Date(session.now() - back * 86400000).toISOString().slice(0, 10);
const usDate = (s) => { const m = String(s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : s || null; };
const isStructured = (form) => /^SCHEDULE 13[DG]/.test(form);
const kindOf = (form) => (/13D/.test(form) ? "13D" : "13G");

// Rule 13d-1 paragraphs a 13G is filed under: (b) qualified institutions, (c) passive investors,
// (d) holders since before registration.
const RULES = Object.freeze({ "Rule 13d-1(b)": "qualified institution (bank, broker, adviser, insurer, fund)", "Rule 13d-1(c)": "passive investor", "Rule 13d-1(d)": "held before the class was registered" });
// Item 12 / cover-page type codes.
export const PERSON_TYPES = Object.freeze({ BD: "broker-dealer", BK: "bank", IC: "insurance company", IV: "investment company", IA: "investment adviser", EP: "employee benefit plan", HC: "parent holding company", SA: "savings association", CP: "church plan", CO: "corporation", PN: "partnership", IN: "individual", FI: "non-US institution", OO: "other" });

// One structured Schedule 13D or 13G, read into its reporting persons.
export function parseSchedule13(xml) {
  const doc = parseXml(xml);
  const sub = child(doc, "edgarSubmission");
  const form = textAt(sub, "headerData", "submissionType");
  const data = child(sub, "formData");
  const head = child(data, "coverPageHeader");
  const issuer = child(head, "issuerInfo");
  const persons = [];
  // 13G: one coverPageHeaderReportingPersonDetails per person; 13D: reportingPersons/reportingPersonInfo.
  for (const p of all(data, "coverPageHeaderReportingPersonDetails")) {
    const own = child(p, "reportingPersonBeneficiallyOwnedNumberOfShares");
    persons.push({ name: textAt(p, "reportingPersonName"), shares: num(textAt(p, "reportingPersonBeneficiallyOwnedAggregateNumberOfShares")), percent: num(textAt(p, "classPercent")),
      sole_voting: num(textAt(own, "soleVotingPower")), shared_voting: num(textAt(own, "sharedVotingPower")), sole_dispositive: num(textAt(own, "soleDispositivePower")), shared_dispositive: num(textAt(own, "sharedDispositivePower")),
      type: textAt(p, "typeOfReportingPerson"), organized_in: textAt(p, "citizenshipOrOrganization") });
  }
  for (const p of all(data, "reportingPersonInfo")) {
    persons.push({ name: textAt(p, "reportingPersonName"), shares: num(textAt(p, "aggregateAmountOwned")), percent: num(textAt(p, "percentOfClass")),
      sole_voting: num(textAt(p, "soleVotingPower")), shared_voting: num(textAt(p, "sharedVotingPower")), sole_dispositive: num(textAt(p, "soleDispositivePower")), shared_dispositive: num(textAt(p, "sharedDispositivePower")),
      type: textAt(p, "typeOfReportingPerson"), organized_in: textAt(p, "citizenshipOrOrganization") ?? textAt(p, "citizenship"), funds_source: textAt(p, "fundsSource") });
  }
  const purpose = textAt(child(child(data, "items1To7") ?? data, "item4"), "transactionPurpose") ?? all(data, "transactionPurpose")[0]?.text?.trim() ?? null;
  return {
    form, amendment: num(textAt(head, "amendmentNo")),
    event_date: usDate(textAt(head, "eventDateRequiresFilingThisStatement") ?? textAt(head, "dateOfEvent")),
    issuer: { cik: num(textAt(issuer, "issuerCik") ?? textAt(issuer, "issuerCIK")), name: textAt(issuer, "issuerName") }, class: textAt(head, "securitiesClassTitle"),
    rules: all(head, "designateRulePursuantThisScheduleFiled").map((r) => r.text.trim()),
    persons, purpose: purpose ? purpose.replace(/\s+/g, " ").trim() : null,
  };
}

async function readSchedule(session, cik, accession) {
  const url = `${archiveBase(cik, accession)}/primary_doc.xml`;
  return { url, ...parseSchedule13(await getText(session, url, { maxBytes: 4 * 1024 * 1024 })) };
}

const personRow = (s, p, filed, accession, url) => [p.name, PERSON_TYPES[p.type] ?? p.type ?? null, kindOf(s.form), s.amendment, s.event_date, filed, p.shares, p.percent == null ? null : round(p.percent / 100, 6), p.sole_voting, p.shared_voting, accession, url];
const PERSON_COLUMNS = ["holder", "holder_type", "schedule", "amendment", "event_date", "filed", "shares", "percent_of_class", "sole_voting", "shared_voting", "accession", "url"];

export const holdersInput = z.object({
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name. Without it, the latest filings across the whole market (new activist stakes by default)."),
  schedule: z.enum(["13D", "13G", "both"]).optional().describe("13D (may seek to influence control; states its purpose), 13G (passive) or both. Default: both for a company, 13D across the market."),
  since: DATE.optional().describe("Filed on or after this date; default three years ago for a company, seven days ago across the market."),
  limit: z.number().int().min(1).max(50).optional().describe("Most filings to read; default 25."),
}).strict();

export async function largeHolders(session, args) {
  const a = holdersInput.parse(args);
  const limit = a.limit ?? 25;
  const limits = [
    "From Schedules 13D and 13G as filed with the SEC; a holder files once it passes 5 percent of a class, and again when its stake changes. Percentages are of the class as the filer counted it, so holders' figures can rest on different share counts.",
    "13D filers may seek to influence or change control and must say why (purpose); 13G filers certify a passive stake. Filings from before December 2024 are text and are listed with links, not read.",
    "Not investment advice.",
  ];
  if (a.company) {
    const e = await resolveEntity(session, a.company);
    const since = a.since ?? isoDay(session, 3 * 365);
    const { sub, rows } = await filings(session, e.cik, { since });
    const want = a.schedule && a.schedule !== "both" ? a.schedule : null;
    const picked = rows.filter((r) => /^(SCHEDULE|SC) 13[DG]/.test(r.form) && r.filingDate >= since && (!want || kindOf(r.form) === want));
    if (!picked.length) throw new NotFound(`No Schedule ${want ?? "13D or 13G"} about ${sub.name} has been filed since ${since}.`);
    const structured = picked.filter((r) => isStructured(r.form)).slice(0, limit);
    // EDGAR lists a company's own 13D and 13G filings about other companies (Coca-Cola's stakes in
    // its bottlers) beside those about it; each filing names its subject, so only those are kept.
    const read = [];
    let aboutOthers = 0;
    for (const r of structured) {
      let s;
      try { s = await readSchedule(session, e.cik, r.accessionNumber); } catch (err) { if (!(err instanceof NotFound)) throw err; continue; }
      if (s.issuer.cik != null && s.issuer.cik !== Number(e.cik)) { aboutOthers++; continue; }
      read.push({ r, s });
    }
    // The latest filing by each holder is its current stake (amendments replace earlier ones).
    const latest = new Map();
    for (const { r, s } of read) for (const p of s.persons) if (p.name && !latest.has(p.name.toLowerCase())) latest.set(p.name.toLowerCase(), personRow(s, p, r.filingDate, r.accessionNumber, s.url));
    const holders = [...latest.values()].sort((x, y) => (y[7] ?? -1) - (x[7] ?? -1));
    const activists = read.filter(({ s }) => kindOf(s.form) === "13D" && s.purpose).slice(0, 5).map(({ r, s }) => ({ filed: r.filingDate, holder: s.persons[0]?.name ?? null, amendment: s.amendment, purpose: s.purpose.slice(0, 700) + (s.purpose.length > 700 ? "…" : "") }));
    const legacy = picked.filter((r) => !isStructured(r.form));
    return {
      company: { cik: e.cik, name: sub.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null }, since,
      filings: picked.length, read: read.length, ...(aboutOthers ? { filed_by_it_about_other_companies: aboutOthers } : {}),
      columns: PERSON_COLUMNS, rows: holders,
      ...(activists.length ? { purposes_13d: activists } : {}),
      ...(legacy.length ? { earlier_text_filings: { note: "Text filings from before December 2024, not read; EDGAR lists filings the company made about other companies here too, so check each one's subject.", count: legacy.length, columns: ["filed", "form", "accession", "url"], rows: legacy.slice(0, 10).map((r) => [r.filingDate, r.form, r.accessionNumber, `${archiveBase(e.cik, r.accessionNumber)}/${r.primaryDocument}`]) } } : {}),
      note: "rows has each holder's latest filing in the window, largest stake first; a percent of 0 means the holder reported it no longer owns more than 5 percent.",
      source: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${e.cik}&type=SC+13&dateb=&owner=include&count=40`,
      limits,
    };
  }
  // Across the market: EDGAR full-text search lists the filings; each is then read.
  const schedule = a.schedule ?? "13D";
  const since = a.since ?? isoDay(session, 7), until = isoDay(session);
  const forms = schedule === "both" ? "SCHEDULE%2013D,SCHEDULE%2013G" : `SCHEDULE%2013${schedule.slice(-1)}`;
  const found = await getJson(session, `https://efts.sec.gov/LATEST/search-index?forms=${forms}&dateRange=custom&startdt=${since}&enddt=${until}`);
  const hits = (found?.hits?.hits ?? []).slice(0, limit);
  if (!hits.length) throw new NotFound(`No Schedule ${schedule === "both" ? "13D or 13G" : schedule} was filed between ${since} and ${until}.`);
  const rows = [];
  for (const h of hits) {
    const src = h._source ?? {};
    const accession = src.adsh ?? String(h._id).split(":")[0];
    const subjectCik = Number(src.ciks?.[0] ?? 0);
    let s = null;
    try { s = await readSchedule(session, subjectCik, accession); } catch (err) { if (!(err instanceof NotFound)) throw err; }
    const p = s?.persons?.[0];
    rows.push([src.file_date ?? null, src.form ?? null, s?.issuer?.name ?? src.display_names?.[0] ?? null, s?.issuer?.cik ?? subjectCik, p?.name ?? src.display_names?.[1] ?? null, p ? PERSON_TYPES[p.type] ?? p.type ?? null : null, p?.shares ?? null, p?.percent == null ? null : round(p.percent / 100, 6), s?.amendment ?? null, s?.purpose ? s.purpose.slice(0, 240) + (s.purpose.length > 240 ? "…" : "") : null, accession]);
  }
  return {
    schedule, since, until, total: found?.hits?.total?.value ?? rows.length, shown: rows.length,
    columns: ["filed", "form", "company", "company_cik", "holder", "holder_type", "shares", "percent_of_class", "amendment", "purpose", "accession"],
    rows,
    source: `https://efts.sec.gov/LATEST/search-index?forms=${forms}&dateRange=custom&startdt=${since}&enddt=${until}`,
    limits,
  };
}
