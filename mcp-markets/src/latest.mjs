// What has just been filed with the SEC, across every company: EDGAR's latest-filings feed (the one
// behind "Latest Filings" on sec.gov), newest first, by form, 8-K event, words in the filer's name
// and time. The feed holds roughly the last few business days, so this is for watching what comes
// in; list_filings, search_filings and company_events cover earlier periods.
import { z } from "zod";

import { eventCode, ITEMS } from "./events.mjs";
import { getText, NotFound } from "./sources.mjs";

const FEED = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent";
const PAGE = 100;
const MAX_PAGES = 10;
const FORM = /^[A-Z0-9][A-Z0-9 ./-]{0,19}$/i;

export const latestInput = z.object({
  forms: z.array(z.string().regex(FORM, "a form type such as 8-K, 10-K, 4, SC 13D or S-1")).min(1).max(6).optional()
    .describe("Form types, e.g. [\"8-K\"], [\"10-K\", \"10-Q\"], [\"4\"], [\"SC 13D\"], [\"S-1\"]; each also matches its amendments (8-K/A). Default: every form."),
  event: z.string().max(40).optional().describe("8-K filings with this item only: an item number (2.02) or a name (earnings, executive_change, restatement, bankruptcy, cybersecurity_incident...)."),
  company: z.string().min(2).max(80).optional().describe("Words that must all appear in the filer's name, e.g. \"bancorp\" or \"apple\"."),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/, "a date (2026-10-23) or a date and time (2026-10-23T14:00:00-04:00)").optional()
    .describe("Accepted at or after this time (a date means its start, US Eastern). Default: everything the feed holds."),
  limit: z.number().int().min(1).max(200).optional().describe("Most filings to list; default 40."),
}).strict();

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const tag = (e, name) => new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(e)?.[1]?.trim() ?? null;

// One feed entry: "8-K - Oak Valley Bancorp (0001431567) (Filer)", its summary (filed date,
// accession, size, and an 8-K's items), the acceptance time and the filing index link.
export function parseEntry(e) {
  const title = decode(tag(e, "title") ?? "");
  const m = /^(.+?) - (.+) \((\d{10})\) \(([^)]+)\)$/.exec(title);
  if (!m) return null;
  const summary = decode(tag(e, "summary") ?? "");
  const accession = /AccNo:\s*<\/b>\s*([\d-]{20})/.exec(summary)?.[1] ?? /accession-number=([\d-]{20})/.exec(e)?.[1] ?? null;
  const items = [...summary.matchAll(/Item (\d\.\d{2})/g)].map((x) => x[1]);
  return { accepted: tag(e, "updated"), form: m[1].trim(), company: m[2].trim(), cik: m[3], role: m[4], accession, items, url: /href="([^"]+)"/.exec(e)?.[1] ?? null };
}

export function parseFeed(xml) {
  return [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((x) => parseEntry(x[1])).filter(Boolean);
}

// A date alone is midnight in New York, where EDGAR keeps its clock; a time without an offset is New
// York time too. The offset comes from the time-zone database, so daylight saving is right.
function nyOffset(day) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName").value;
  const m = /GMT([+-])(\d{1,2})/.exec(name);
  return m ? `${m[1]}${m[2].padStart(2, "0")}:00` : "-05:00";
}
export function sinceMs(since) {
  if (!since) return null;
  if (/(Z|[+-]\d{2}:\d{2})$/.test(since)) return Date.parse(since);
  const day = since.slice(0, 10);
  return Date.parse(`${/T/.test(since) ? since : `${day}T00:00:00`}${nyOffset(day)}`);
}

const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

export async function latestFilings(session, args) {
  const a = latestInput.parse(args);
  const limit = a.limit ?? 40;
  const code = a.event ? eventCode(a.event) : null;
  const from = sinceMs(a.since);
  const want = a.company ? words(a.company) : [];
  // The feed filters by form prefix itself, one form per request; an 8-K event needs 8-Ks.
  const forms = a.forms ?? (code ? ["8-K"] : [""]);
  const seen = new Set(), rows = [], sources = [];
  let reachedEnd = false, oldest = null;
  for (const form of forms) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = `${FEED}&type=${encodeURIComponent(form)}&company=&dateb=&owner=include&start=${page * PAGE}&count=${PAGE}&output=atom`;
      const entries = parseFeed(await getText(session, url, { maxBytes: 4 * 1024 * 1024 }));
      sources.push(url);
      if (!entries.length) { reachedEnd = true; break; }
      let older = false;
      for (const x of entries) {
        const t = Date.parse(x.accepted);
        if (oldest === null || t < oldest) oldest = t;
        if (from !== null && t < from) { older = true; continue; }
        if (form && !(x.form === form.toUpperCase() || x.form.startsWith(`${form.toUpperCase()}/`))) continue;
        if (code && !x.items.includes(code)) continue;
        if (want.length && !want.every((w) => words(x.company).includes(w))) continue;
        const key = `${x.accession}|${x.cik}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(x);
      }
      if (older || entries.length < PAGE || rows.length >= limit * 3) { if (entries.length < PAGE) reachedEnd = true; break; }
    }
  }
  rows.sort((x, y) => Date.parse(y.accepted) - Date.parse(x.accepted) || x.accession.localeCompare(y.accession));
  if (!rows.length && (a.company || code || a.forms)) {
    throw new NotFound(`No ${a.forms ? a.forms.join("/") : code ? "8-K" : ""} filing${code ? ` with Item ${code} (${ITEMS[code][0]})` : ""}${a.company ? ` by a filer named "${a.company}"` : ""} is in EDGAR's latest-filings feed${a.since ? ` since ${a.since}` : ""}. The feed holds about the last few business days; list_filings, search_filings or company_events reach further back.`);
  }
  return {
    columns: ["accepted", "form", "company", "cik", "role", "items", "events", "accession", "url"],
    rows: rows.slice(0, limit).map((x) => [x.accepted, x.form, x.company, x.cik, x.role, x.items, x.items.map((c) => ITEMS[c]?.[0] ?? c), x.accession, x.url]),
    matched: rows.length,
    ...(oldest !== null ? { feed_reaches_back_to: new Date(oldest).toISOString() } : {}),
    note: `Newest first, by acceptance time (US Eastern). role: Filer for the company that filed; an ownership form (3, 4, 13D/G) also lists the issuer (Subject or Issuer) and the owner (Reporting). ${reachedEnd ? "The feed ended before the time asked for: it holds only about the last few business days." : ""}`.trim(),
    sources,
    limits: ["EDGAR's latest-filings feed: filings accepted in about the last few business days, updated as they are accepted; a filing accepted after 5:30 p.m. Eastern counts as filed the next business day.", "Not investment advice."],
  };
}
