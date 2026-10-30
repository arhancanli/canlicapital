// Public records a company can show up in, from the agencies that keep them, no key needed:
// SEC enforcement (litigation releases, administrative proceedings), CFPB consumer complaints, FDA
// and NHTSA recalls, the Treasury's sanctions list and the Federal Register.
// Names match only when every word of the name is in the record, so a near miss is never served as
// a match, and each tool says what its record cannot show.
import { z } from "zod";

import { plainName } from "./news.mjs";
import { getEncodedText, getJson, getText, NotFound, own, resolveEntity } from "./sources.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const NOISE = new Set(["inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "llc", "plc", "lp", "the", "of", "and", "sa", "ag", "nv", "se"]);
const TICKER = /^[A-Z]{1,5}(?:[.-][A-Z])?$/;
const decode = (s) => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#0?39;|&apos;/g, "'").trim();
const clip = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, "")} ...` : t; };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// The words of a name that identify it, in lower case: "Apple Inc." -> ["apple"].
export const nameWords = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
export const keyWords = (name) => { const w = nameWords(name).filter((x) => !NOISE.has(x)); return w.length ? w : nameWords(name); };
export function namesMatch(record, name) {
  const have = new Set(nameWords(record));
  const want = keyWords(name);
  return want.length > 0 && want.every((w) => have.has(w));
}
// A ticker is looked up; a name is searched as written, since many of these firms file nothing with the SEC.
async function searchName(session, company) {
  if (!TICKER.test(company)) return company;
  return plainName((await resolveEntity(session, company)).name ?? company);
}

// ---------------------------------------------------------------------------------------------
// SEC enforcement
// ---------------------------------------------------------------------------------------------
const FEEDS = [
  ["litigation release", "https://www.sec.gov/enforcement-litigation/litigation-releases/rss"],
  ["administrative proceeding", "https://www.sec.gov/enforcement-litigation/administrative-proceedings/rss"],
];
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

export function parseFeed(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const tag = (name) => decode(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "");
    const d = tag("pubDate").match(/(\d{1,2}) (\w{3}) (\d{4})/);
    return { date: d ? `${d[3]}-${MONTHS[d[2]] ?? "01"}-${d[1].padStart(2, "0")}` : null, respondents: tag("title").replace(/[,;]\s*$/, ""), number: tag("dc:creator") || null, url: tag("link") };
  });
}

export const enforcementInput = z.object({
  company: z.string().min(2).max(120).optional().describe("A company or person, every word of it in the case's name. Leave out for all the latest actions."),
  limit: z.number().int().min(1).max(50).optional().describe("Most actions; default 25."),
}).strict();

export async function enforcementActions(session, args) {
  const a = enforcementInput.parse(args);
  const name = a.company ? await searchName(session, a.company) : null;
  const all = (await Promise.all(FEEDS.map(async ([kind, url]) => parseFeed(await getText(session, url)).map((x) => ({ kind, ...x })))));
  const reach = all.map((items) => items.at(-1)?.date).filter(Boolean).sort().at(-1) ?? null;
  const items = all.flat().filter((x) => !name || namesMatch(x.respondents, name)).sort((x, y) => String(y.date).localeCompare(String(x.date)));
  return {
    ...(name ? { searched: name } : {}),
    matched: items.length,
    feeds_reach_back_to: reach,
    columns: ["date", "kind", "respondents", "number", "url"],
    rows: items.slice(0, a.limit ?? 25).map((x) => [x.date, x.kind, x.respondents, x.number, x.url]),
    limits: ["The SEC's two feeds hold each one's latest 25 actions, so an empty answer says nothing before feeds_reach_back_to; search_filings and sec.gov reach further.", "A case's name is who the SEC named. A proceeding can end without a finding of wrongdoing; read the order."],
    sources: FEEDS.map(([, url]) => url),
  };
}

// ---------------------------------------------------------------------------------------------
// CFPB consumer complaints
// ---------------------------------------------------------------------------------------------
const CFPB = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/";
const buckets = (ag, name, n = 8) => (ag?.[name]?.[name]?.buckets ?? []).slice(0, n).map((b) => [b.key, b.doc_count]);

export const complaintsInput = z.object({
  company: z.string().min(2).max(120).describe("Ticker or name, as the bank or lender is known: \"Wells Fargo\", \"JPM\", \"Experian\"."),
}).strict();

export async function consumerComplaints(session, args) {
  const a = complaintsInput.parse(args);
  const name = await searchName(session, a.company);
  const found = await getJson(session, `${CFPB}?${new URLSearchParams({ search_term: name, field: "company", size: "0", no_aggs: "false" })}`, { timeoutMs: 45000 });
  const names = buckets(found.aggregations, "company", 40).filter(([key]) => namesMatch(key, name));
  if (!names.length) throw new NotFound(`The CFPB's complaint database has no company with every word of "${name}" in its name.`);
  const [company] = names[0];
  const q = (extra = {}) => `${CFPB}?${new URLSearchParams({ company, size: "0", no_aggs: "false", ...extra })}`;
  const all = await getJson(session, q(), { timeoutMs: 45000 });
  const year = await getJson(session, q({ date_received_min: iso(session.now() - 365 * 86400000) }), { timeoutMs: 45000 });
  const total = all.hits?.total?.value ?? 0;
  const timely = Object.fromEntries(buckets(all.aggregations, "timely"));
  return {
    company,
    ...(names.length > 1 ? { also_named: names.slice(1, 6).map(([key, n]) => [key, n]) } : {}),
    complaints: total,
    last_12_months: year.hits?.total?.value ?? 0,
    answered_in_time_pct: total ? Math.round(((timely.Yes ?? 0) / total) * 1000) / 10 : null,
    products: { columns: ["product", "complaints"], rows: buckets(all.aggregations, "product") },
    issues: { columns: ["issue", "complaints"], rows: buckets(all.aggregations, "issue") },
    last_12_months_issues: { columns: ["issue", "complaints"], rows: buckets(year.aggregations, "issue", 5) },
    responses: { columns: ["company_response", "complaints"], rows: buckets(all.aggregations, "company_response") },
    data_through: all._meta?.last_indexed ?? null,
    limits: ["Complaints are what consumers sent, and the CFPB does not verify them. Counts are not adjusted for a company's size, so a large bank has more; do not compare them as rates."],
    source: q(),
  };
}

// ---------------------------------------------------------------------------------------------
// Recalls
// ---------------------------------------------------------------------------------------------
const FDA = ["drug", "device", "food"];

export const recallsInput = z.object({
  company: z.string().min(2).max(120).optional().describe("Ticker or name of the recalling firm: its FDA recalls of drugs, devices and food."),
  vehicle: z.object({ make: z.string().min(2).max(40), model: z.string().min(1).max(40), year: z.number().int().min(1950).max(2100) }).strict().optional().describe("A vehicle's NHTSA safety recalls, e.g. {make: \"ford\", model: \"f-150\", year: 2023}."),
  limit: z.number().int().min(1).max(50).optional().describe("Most recalls of each kind, newest first; default 10."),
}).strict().refine((x) => x.company || x.vehicle, "Name a company or a vehicle.");

const usDate = (d) => (/^\d{8}$/.test(d ?? "") ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : (d ?? null));

async function fdaRecalls(session, kind, firm, limit) {
  const search = `recalling_firm:"${firm.replace(/"/g, "")}"`;
  const base = `https://api.fda.gov/${kind}/enforcement.json?search=${encodeURIComponent(search)}`;
  let r;
  try { r = await getJson(session, `${base}&sort=report_date:desc&limit=${limit}`); } catch (err) { if (err instanceof NotFound) return { kind, total: 0, classes: [], rows: [] }; throw err; }
  const counts = await getJson(session, `${base}&count=classification.exact`);
  return {
    kind,
    total: r.meta?.results?.total ?? r.results.length,
    classes: (counts.results ?? []).map((c) => [c.term, c.count]),
    rows: r.results.filter((x) => namesMatch(x.recalling_firm, firm)).map((x) => [kind, usDate(x.report_date), x.classification, x.status, clip(x.reason_for_recall, 180), clip(x.product_description, 120), x.recalling_firm, x.recall_number]),
  };
}

export async function productRecalls(session, args) {
  const a = recallsInput.parse(args);
  const limit = a.limit ?? 10;
  const out = {};
  if (a.company) {
    const firm = await searchName(session, a.company);
    const kinds = await Promise.all(FDA.map((k) => fdaRecalls(session, k, firm, limit)));
    out.fda = {
      firm,
      totals: Object.fromEntries(kinds.map((k) => [k.kind, k.total])),
      classes: Object.fromEntries(kinds.map((k) => [k.kind, k.classes])),
      columns: ["kind", "reported", "class", "status", "reason", "product", "firm", "recall_number"],
      rows: kinds.flatMap((k) => k.rows).sort((x, y) => String(y[1]).localeCompare(String(x[1]))).slice(0, limit * 2),
      class_means: "Class I can cause serious harm or death; Class II, temporary or reversible harm; Class III, unlikely to cause harm.",
    };
  }
  if (a.vehicle) {
    const v = a.vehicle;
    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?${new URLSearchParams({ make: v.make, model: v.model, modelYear: String(v.year) })}`;
    const r = await getJson(session, url);
    const when = (d) => { const m = String(d ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : d ?? null; };
    out.nhtsa = {
      vehicle: v,
      recalls: r.results?.length ?? 0,
      columns: ["reported", "campaign", "component", "summary", "consequence"],
      rows: (r.results ?? []).map((x) => [when(x.ReportReceivedDate), x.NHTSACampaignNumber, x.Component, clip(x.Summary, 220), clip(x.Consequence, 160)]).sort((x, y) => String(y[0]).localeCompare(String(x[0]))).slice(0, limit),
      source: url,
    };
  }
  out.limits = ["The firm is who recalled the product, as the FDA wrote its name, which can be a subsidiary under another name. Recalls are a record of action taken, not of how many people were harmed."];
  return out;
}

// ---------------------------------------------------------------------------------------------
// Sanctions (OFAC SDN list)
// ---------------------------------------------------------------------------------------------
const SDN = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV";
const ALT = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV";
const blank = (x) => (x === "-0-" || x === "" ? null : x);

export function csvRows(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === "\"") { if (text[i + 1] === "\"") { cell += "\""; i++; } else quoted = false; } else cell += c;
    } else if (c === "\"") quoted = true;
    else if (c === ",") { row.push(cell.trim()); cell = ""; } else if (c === "\n") { row.push(cell.trim()); if (row.length > 1) rows.push(row); row = []; cell = ""; } else if (c !== "\r" && c !== "\x1a") cell += c;
  }
  if (cell.trim() || row.length) { row.push(cell.trim()); if (row.length > 1) rows.push(row); }
  return rows;
}

export const sanctionsInput = z.object({
  name: z.string().min(3).max(120).describe("A person, company, bank or vessel. Every word must be in the listed name or an alias, in any order."),
  limit: z.number().int().min(1).max(50).optional().describe("Most listings; default 20."),
}).strict();

export async function sanctionsCheck(session, args) {
  const a = sanctionsInput.parse(args);
  const want = keyWords(a.name);
  if (want.join("").length < 3) throw new Error("A name of at least three letters is needed to search the list.");
  const has = (text) => { const words = new Set(nameWords(text)); return want.every((w) => words.has(w)); };
  const list = (url) => getEncodedText(session, url, { encoding: "latin1", redirectHost: /^[\w-]+\.s3\.us-gov-west-1\.amazonaws\.com$/, maxBytes: 32 * 1024 * 1024, timeoutMs: 60000 });
  const [sdn, alt] = await Promise.all([list(SDN), list(ALT)]);
  const listed = csvRows(sdn);
  const aliasOf = new Map();
  for (const r of csvRows(alt)) if (has(r[3] ?? "")) { const list = aliasOf.get(r[0]) ?? []; list.push(r[3]); aliasOf.set(r[0], list); }
  const hits = listed.filter((r) => has(r[1] ?? "") || aliasOf.has(r[0]));
  return {
    searched: want.join(" "),
    list_entries_read: listed.length,
    matched: hits.length,
    columns: ["entry", "name", "type", "program", "matched_alias", "remarks"],
    rows: hits.slice(0, a.limit ?? 20).map((r) => [Number(r[0]), r[1], blank(r[2]) ?? "entity", blank(r[3]), aliasOf.get(r[0])?.[0] ?? null, clip(blank(r[11]) ?? "", 200) || null]),
    limits: ["The Treasury's Specially Designated Nationals list only; its other lists are not searched, and neither are other countries'. Matching is by whole words, so a misspelling or another transliteration finds nothing.", "A name alone neither identifies nor clears anyone: no match is not clearance, and a match needs checking against the entry. This is not a compliance screening or legal advice."],
    sources: [SDN, ALT],
  };
}

// ---------------------------------------------------------------------------------------------
// Federal Register
// ---------------------------------------------------------------------------------------------
const AGENCIES = Object.freeze({
  sec: "securities-and-exchange-commission", cftc: "commodity-futures-trading-commission", fed: "federal-reserve-system", treasury: "treasury-department",
  occ: "comptroller-of-the-currency", cfpb: "consumer-financial-protection-bureau", fdic: "federal-deposit-insurance-corporation", irs: "internal-revenue-service",
  ftc: "federal-trade-commission", fcc: "federal-communications-commission", epa: "environmental-protection-agency", fda: "food-and-drug-administration",
  faa: "federal-aviation-administration", doe: "energy-department", ferc: "federal-energy-regulatory-commission", bis: "industry-and-security-bureau", ofac: "foreign-assets-control-office", hhs: "health-and-human-services-department",
});
const KINDS = { rule: "RULE", proposed_rule: "PRORULE", notice: "NOTICE", presidential: "PRESDOCU" };

export const rulesInput = z.object({
  query: z.string().min(2).max(200).optional().describe("Words to find, e.g. \"climate disclosure\" or \"stablecoin\"."),
  agency: z.string().max(12).optional().describe(`One of: ${Object.keys(AGENCIES).join(", ")}.`),
  type: z.enum(["rule", "proposed_rule", "notice", "presidential"]).optional().describe("Final rules, proposed rules, notices or presidential documents; default all."),
  since: DATE.optional().describe("Published on or after this date."),
  open_for_comment: z.boolean().optional().describe("Only those whose comment period has not closed."),
  limit: z.number().int().min(1).max(50).optional().describe("Most documents, newest first; default 15."),
}).strict().refine((x) => x.query || x.agency, "Give words to find or an agency.");

export async function federalRules(session, args) {
  const a = rulesInput.parse(args);
  const slug = a.agency ? own(AGENCIES, a.agency.toLowerCase()) : null;
  if (a.agency && !slug) throw new NotFound(`No agency "${a.agency}"; use one of ${Object.keys(AGENCIES).join(", ")}.`);
  const p = new URLSearchParams({ per_page: String(a.limit ?? 15), order: "newest" });
  for (const f of ["title", "type", "publication_date", "document_number", "html_url", "agencies", "abstract", "comments_close_on", "effective_on"]) p.append("fields[]", f);
  if (a.query) p.set("conditions[term]", a.query);
  if (slug) p.append("conditions[agencies][]", slug);
  if (a.type) p.append("conditions[type][]", KINDS[a.type]);
  if (a.since) p.set("conditions[publication_date][gte]", a.since);
  if (a.open_for_comment) p.set("conditions[comment_date][gte]", iso(session.now()));
  const url = `https://www.federalregister.gov/api/v1/documents.json?${p}`;
  const r = await getJson(session, url);
  return {
    matched: r.count ?? 0,
    columns: ["published", "type", "title", "agencies", "comments_close", "effective", "abstract", "url"],
    rows: (r.results ?? []).map((d) => [d.publication_date, d.type, d.title, (d.agencies ?? []).map((x) => x.name).filter(Boolean).join("; "), d.comments_close_on ?? null, d.effective_on ?? null, clip(d.abstract, 280) || null, d.html_url]),
    limits: ["Only what is published in the Federal Register: a rule can be announced earlier, and guidance or a statement may never appear here."],
    source: url,
  };
}
