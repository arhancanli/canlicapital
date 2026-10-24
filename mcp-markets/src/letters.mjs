// SEC comment letters: what the SEC's staff questioned in a company's filings (form UPLOAD, the
// staff's letters) and how the company answered (form CORRESP), grouped into review threads, with
// the topics each recent letter raises. The SEC releases a review's letters no sooner than 20
// business days after it closes, so the newest review may not be public yet.
import { z } from "zod";

import { archiveBase, filings, getText, resolveEntity } from "./sources.mjs";
import { htmlToText } from "./html.mjs";

export const lettersInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  years: z.number().int().min(1).max(25).optional().describe("Years back to list; default 10."),
  read: z.number().int().min(0).max(6).optional().describe("Newest letters filed as text to read for their topics and an excerpt; default 4 (PDF letters are listed, not read)."),
}).strict();

// Topics a staff letter or a reply commonly turns on, by the words that name them.
export const TOPICS = Object.freeze({
  "non-GAAP measures": /non-gaap|adjusted ebitda|adjusted operating|item 10\(e\)/i,
  "revenue recognition": /revenue recognition|asc 606|performance obligation|principal (?:versus|vs\.?|or) agent|gross versus net/i,
  "segments": /segment|asc 280|chief operating decision maker|codm/i,
  "goodwill and impairment": /goodwill|impairment/i,
  "MD&A and results": /management'?s discussion|results of operations|known trends|key performance indicator|\bkpi/i,
  "liquidity and debt": /liquidity|capital resources|covenant|going concern/i,
  "income taxes": /income tax|deferred tax|valuation allowance|effective tax rate/i,
  "critical estimates": /critical accounting (?:estimate|polic)/i,
  "controls": /internal control|disclosure controls|material weakness/i,
  "risk factors": /risk factor/i,
  "China and VIEs": /\bchina\b|\bprc\b|variable interest entit|\bvie\b|hong kong/i,
  "crypto assets": /crypto|digital asset|bitcoin/i,
  "climate": /climate/i,
  "cybersecurity": /cybersecurity|cyber incident/i,
  "executive pay": /compensation discussion|executive compensation|pay versus performance/i,
  "business combinations": /business combination|acquisition|purchase price allocation/i,
});
export const topicsOf = (text) => Object.entries(TOPICS).filter(([, re]) => re.test(text)).map(([t]) => t);

// A letter's body without its letterhead: from the salutation, collapsed to plain text.
export function letterExcerpt(text, max = 900) {
  const t = String(text).replace(/\s+/g, " ").trim();
  const at = t.search(/\b(?:Dear|Ladies and Gentlemen)\b/i);
  const body = at >= 0 ? t.slice(at) : t;
  return body.length > max ? `${body.slice(0, max).replace(/\s+\S*$/, "")} ...` : body;
}

// Letters at most 120 days apart belong to one review.
export function threads(rows) {
  const asc = [...rows].sort((x, y) => x.filingDate.localeCompare(y.filingDate));
  const out = [];
  for (const r of asc) {
    const last = out.at(-1);
    if (last && (Date.parse(r.filingDate) - Date.parse(last.end)) / 86400000 <= 120) { last.end = r.filingDate; last.letters.push(r); } else out.push({ start: r.filingDate, end: r.filingDate, letters: [r] });
  }
  return out.reverse();
}

export async function commentLetters(session, args) {
  const a = lettersInput.parse(args);
  const e = await resolveEntity(session, a.company);
  const since = new Date(session.now() - (a.years ?? 10) * 365.25 * 86400000).toISOString().slice(0, 10);
  const { sub, rows } = await filings(session, e.cik, { since });
  const letters = rows.filter((r) => (r.form === "UPLOAD" || r.form === "CORRESP") && r.filingDate >= since);
  const url = (r) => `${archiveBase(e.cik, r.accessionNumber)}/${r.primaryDocument}`;
  const reads = [];
  // The newest letters filed as text (staff letters are often PDFs, which are listed, not read).
  const readable = letters.filter((r) => /\.(?:htm|html|txt)$/i.test(r.primaryDocument ?? "")).slice(0, a.read ?? 4);
  for (const r of readable) {
    try {
      const text = await getText(session, url(r), { maxBytes: 4 * 1024 * 1024, transform: (t) => (/\.txt$/i.test(r.primaryDocument) ? t : htmlToText(t)), variant: "letter" });
      reads.push([r.filingDate, r.form, topicsOf(text).join("; ") || null, letterExcerpt(text), url(r)]);
    } catch (err) { reads.push([r.filingDate, r.form, null, `could not be read: ${String(err.message).slice(0, 100)}`, url(r)]); }
  }
  const th = threads(letters);
  return {
    company: { cik: e.cik, name: sub.name ?? e.name, ticker: e.ticker ?? null }, since,
    staff_letters: letters.filter((r) => r.form === "UPLOAD").length, company_replies: letters.filter((r) => r.form === "CORRESP").length,
    reviews: { note: "Letters at most 120 days apart grouped as one review; a review usually ends with a staff letter saying it has no further comments.", columns: ["start", "end", "staff_letters", "replies"], rows: th.map((t) => [t.start, t.end, t.letters.filter((x) => x.form === "UPLOAD").length, t.letters.filter((x) => x.form === "CORRESP").length]) },
    recent: { columns: ["date", "form", "topics", "excerpt", "url"], rows: reads },
    letters: { note: "UPLOAD is the SEC staff's letter; CORRESP is the company's reply.", columns: ["date", "form", "accession", "url"], rows: letters.map((r) => [r.filingDate, r.form, r.accessionNumber, url(r)]) },
    meaning: "The SEC's Division of Corporation Finance reviews every listed company's filings at least once every three years and writes when it wants more disclosure or questions an accounting choice. Repeated letters on one topic, such as non-GAAP measures or revenue recognition, show where a company's reporting draws scrutiny.",
    source: `https://data.sec.gov/submissions/CIK${String(e.cik).padStart(10, "0")}.json (forms UPLOAD and CORRESP)`,
    limits: ["Letters are released at least 20 business days after a review ends, so a review under way is not shown.", "Topics are found by words in the letter, not read by a person; older letters are often PDFs and are listed, not read.", "Not investment advice."],
  };
}
