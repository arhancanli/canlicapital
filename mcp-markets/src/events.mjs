// Company news from the source: the events companies must report on Form 8-K within four business
// days, by item (earnings, deals, executive changes, restatements, bankruptcies, cyber incidents),
// for one company or across the market, each with the opening of what the filing says.
import { z } from "zod";

import { htmlToText } from "./html.mjs";
import { archiveBase, filingDocuments, filings, getJson, getText, NotFound, own, resolveEntity } from "./sources.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const isoDay = (session, back = 0) => new Date(session.now() - back * 86400000).toISOString().slice(0, 10);

// Form 8-K items (General Instructions B and the Items), with the plain names people use.
export const ITEMS = Object.freeze({
  "1.01": ["material_agreement", "entered into a material definitive agreement"],
  "1.02": ["agreement_terminated", "terminated a material definitive agreement"],
  "1.03": ["bankruptcy", "bankruptcy or receivership"],
  "1.04": ["mine_safety", "mine safety: shutdown or pattern of violations"],
  "1.05": ["cybersecurity_incident", "material cybersecurity incident"],
  "2.01": ["acquisition_or_sale_completed", "completed an acquisition or disposition of assets"],
  "2.02": ["earnings", "results of operations and financial condition (earnings release)"],
  "2.03": ["new_debt", "created a direct financial obligation (new debt)"],
  "2.04": ["debt_accelerated", "a triggering event accelerated or increased an obligation"],
  "2.05": ["restructuring", "costs of exit or disposal activities (restructuring, layoffs)"],
  "2.06": ["impairment", "material impairment"],
  "3.01": ["delisting_notice", "notice of delisting or failure to meet a listing standard"],
  "3.02": ["unregistered_share_sale", "unregistered sale of equity securities"],
  "3.03": ["shareholder_rights_modified", "material modification of shareholders' rights"],
  "4.01": ["auditor_change", "change in the certifying accountant (auditor)"],
  "4.02": ["restatement", "previously issued financial statements should no longer be relied on (restatement)"],
  "5.01": ["change_in_control", "change in control of the registrant"],
  "5.02": ["executive_change", "departure or appointment of directors or officers; compensation"],
  "5.03": ["bylaws_or_fiscal_year_change", "amended articles or bylaws, or changed fiscal year"],
  "5.05": ["ethics_code_change", "amended or waived the code of ethics"],
  "5.07": ["shareholder_vote", "results of a shareholder vote"],
  "5.08": ["director_nominations", "shareholder director nominations"],
  "7.01": ["regulation_fd", "Regulation FD disclosure (investor presentation, guidance)"],
  "8.01": ["other_event", "other events"],
  "9.01": ["exhibits", "financial statements and exhibits"],
});
const BY_NAME = Object.fromEntries(Object.entries(ITEMS).map(([code, [name]]) => [name, code]));
const ALIASES = Object.freeze({ earnings_release: "2.02", results: "2.02", deal: "1.01", merger: "1.01", acquisition: "2.01", layoffs: "2.05", ceo_change: "5.02", cfo_change: "5.02", resignation: "5.02", cyber: "1.05", hack: "1.05", breach: "1.05", chapter_11: "1.03", auditor: "4.01", restatement: "4.02", non_reliance: "4.02", delisting: "3.01", vote: "5.07", guidance: "7.01", debt: "2.03", impairment: "2.06", control: "5.01" });

export function eventCode(q) {
  const s = String(q).trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^item_/, "");
  if (own(ITEMS, s)) return s;
  return own(BY_NAME, s) ?? own(ALIASES, s) ?? (() => { throw new NotFound(`Unknown 8-K event "${q}". Use an item number (2.02, 5.02, 4.02) or a name: ${Object.values(ITEMS).map((v) => v[0]).filter((n) => n !== "exhibits").join(", ")}.`); })();
}

// The opening of what the filing says under an item: the text after its heading, to the next item.
// Headings start a line; "Item 1.05(a) of Form 8-K" inside a sentence is a reference, not a heading.
// Converted text can glue a heading to its title ("Item 1.05Material ..."), so no word boundary.
const heading = (code) => new RegExp(`(?:^|\\n)[ \\t]*Item\\s*${code ? code.replace(".", "\\.") : "\\d\\.\\d{2}"}(?![\\d(])`, "i");
export function itemExcerpt(text, code, max = 420) {
  let at = text.search(heading(code));
  if (at < 0) at = text.search(new RegExp(`Item\\s*${code.replace(".", "\\.")}(?![\\d(])`, "i"));
  if (at < 0) return null;
  const rest = text.slice(at).replace(/^\s*Item\s*\d\.\d{2}\.?\s*/i, "");
  const next = rest.slice(1).search(heading());
  let body = next >= 0 ? rest.slice(0, next + 1) : rest;
  // Drop the item's title, which repeats the heading ("Material Cybersecurity Incident.").
  const nl = body.indexOf("\n");
  if (nl > 0 && nl < 220 && body.slice(nl).trim()) body = body.slice(nl);
  let out = body.replace(/\s+/g, " ").trim();
  // A title that wrapped onto a second line leaves its tail ("Officers.", "Completed Interim Review.").
  const tail = out.match(/^((?=[A-Z])[^.]{0,140}?\b(?:Officers|Review|Statements|Condition|Agreement|Assets|Obligation|Arrangement|Activities|Impairments|Standard|Rule|Securities|Holders|Accountant|Registrant|Year|Ethics|Disclosure|Events|Exhibits|Incidents?|Receivership)\.)\s+(?=[A-Z(])/);
  if (tail && tail[1].split(" ").length <= 16) out = out.slice(tail[0].length);
  return out ? out.slice(0, max) + (out.length > max ? "…" : "") : null;
}

async function excerptFor(session, url, codes) {
  try {
    const text = await getText(session, url, { maxBytes: 8 * 1024 * 1024, transform: htmlToText });
    const main = codes.find((c) => c !== "9.01") ?? codes[0];
    return itemExcerpt(text, main);
  } catch (err) {
    if (err instanceof NotFound) return null;
    throw err;
  }
}

const decode = (codes) => codes.map((c) => ITEMS[c]?.[0] ?? c);

export const eventsInput = z.object({
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name. Without it, filings across the whole market (then event is required)."),
  event: z.string().max(40).optional().describe("Which events: an item number (2.02) or a name: earnings, material_agreement, acquisition_or_sale_completed, executive_change, restatement, auditor_change, bankruptcy, cybersecurity_incident, restructuring, impairment, delisting_notice, new_debt, shareholder_vote, regulation_fd, other_event. Default: all, for a company."),
  since: DATE.optional().describe("Filed on or after this date; default 180 days ago for a company, 30 days across the market."),
  until: DATE.optional().describe("Filed on or before this date; default today."),
  limit: z.number().int().min(1).max(40).optional().describe("Most events to list; default 15."),
  excerpts: z.boolean().optional().describe("Read each filing for the opening of what it says; default true (one request per filing)."),
}).strict();

export async function companyEvents(session, args) {
  const a = eventsInput.parse(args);
  const code = a.event ? eventCode(a.event) : null;
  const limit = a.limit ?? 15;
  const until = a.until ?? isoDay(session);
  const columns = ["filed", "company", "items", "events", "excerpt", "accession", "url"];
  const limits = [
    "From Forms 8-K as filed with the SEC, usually within four business days of the event; Canli Capital does not edit or verify them. Excerpts are the opening of the filing's text under the item.",
    "An earnings release (2.02) or investor presentation (7.01) is usually in exhibit 99.1; read it with read_filing and document \"EX-99.1\".",
    "Not investment advice.",
  ];
  if (a.company) {
    const e = await resolveEntity(session, a.company);
    const since = a.since ?? isoDay(session, 180);
    const { sub, rows } = await filings(session, e.cik, { since });
    const picked = rows.filter((r) => /^8-K/.test(r.form) && r.filingDate >= since && r.filingDate <= until)
      .map((r) => ({ r, codes: String(r.items ?? "").split(",").map((x) => x.trim()).filter(Boolean) }))
      .filter(({ codes }) => !code || codes.includes(code));
    if (!picked.length) throw new NotFound(`${sub.name} filed no 8-K${code ? ` with item ${code} (${ITEMS[code][0]})` : ""} between ${since} and ${until}.`);
    const out = [];
    for (const { r, codes } of picked.slice(0, limit)) {
      const url = `${archiveBase(e.cik, r.accessionNumber)}/${String(r.primaryDocument).replace(/^xsl[^/]*\//, "")}`;
      out.push([r.filingDate, sub.name, codes, decode(codes), a.excerpts === false ? null : await excerptFor(session, url, code ? [code] : codes), r.accessionNumber, url]);
    }
    const counts = {};
    for (const { codes } of picked) for (const c of codes) if (c !== "9.01") counts[ITEMS[c]?.[0] ?? c] = (counts[ITEMS[c]?.[0] ?? c] ?? 0) + 1;
    return { company: { cik: e.cik, name: sub.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null }, since, until, matched: picked.length, counts, columns, rows: out, source: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${e.cik}&type=8-K&dateb=&owner=include&count=40`, limits };
  }
  if (!code) throw new Error("Across the market, name an event (for example restatement, bankruptcy, cybersecurity_incident, auditor_change or earnings), or pass a company.");
  const since = a.since ?? isoDay(session, 30);
  // Full-text search finds 8-Ks that mention the item; only filings that carry it are kept.
  const hits = [];
  for (let from = 0; from < 300 && hits.length < limit; from += 100) {
    const r = await getJson(session, `https://efts.sec.gov/LATEST/search-index?q=%22Item%20${code}%22&forms=8-K&dateRange=custom&startdt=${since}&enddt=${until}${from ? `&from=${from}` : ""}`);
    const page = r?.hits?.hits ?? [];
    // One row per filing; a hit on an exhibit (an auditor's letter, a contract) gives way to the 8-K itself.
    for (const h of page) {
      if (!(h._source?.items ?? []).includes(code)) continue;
      const i = hits.findIndex((x) => x._source.adsh === h._source.adsh);
      if (i < 0) hits.push(h);
      else if (!/^8-K/.test(hits[i]._source.file_type ?? "") && /^8-K/.test(h._source.file_type ?? "")) hits[i] = h;
    }
    if (page.length < 100) break;
  }
  if (!hits.length) throw new NotFound(`No 8-K with item ${code} (${ITEMS[code][0]}) was filed between ${since} and ${until}.`);
  hits.sort((x, y) => String(y._source.file_date).localeCompare(String(x._source.file_date)));
  const out = [];
  for (const h of hits.slice(0, limit)) {
    const s = h._source, [adsh, matched] = String(h._id).split(":");
    const cik = Number(s.ciks?.[0] ?? 0);
    let file = matched;
    if (!/^8-K/.test(s.file_type ?? "")) {
      const main = (await filingDocuments(session, cik, adsh).catch(() => [])).find((d) => /^8-K/.test(d.type ?? ""));
      if (main) file = main.name;
    }
    const url = `${archiveBase(cik, adsh)}/${file}`;
    out.push([s.file_date, (s.display_names?.[0] ?? "").replace(/\s+/g, " ").trim() || null, s.items ?? [], decode(s.items ?? []), a.excerpts === false ? null : await excerptFor(session, url, [code]), adsh, url]);
  }
  return { event: { item: code, name: ITEMS[code][0], meaning: ITEMS[code][1] }, since, until, found: hits.length, columns, rows: out, source: `https://efts.sec.gov/LATEST/search-index?q=%22Item%20${code}%22&forms=8-K&dateRange=custom&startdt=${since}&enddt=${until}`, limits };
}
