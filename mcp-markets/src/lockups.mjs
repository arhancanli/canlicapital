// lockup_calendar: when the shares insiders agreed not to sell at an IPO may be sold, from the company's own final
// prospectus (Rule 424(b)(4), or 424(b)(1) or 424(b)(3) where that is the final one). Each lock-up period is read
// from the prospectus's words ("for a period of 180 days after the date of this prospectus") and counted from the
// date those words name: the prospectus date on the cover, or the closing the cover says the underwriters expect.
// Early releases tied to an earnings release, the share price or a blackout period are quoted, and the release dates
// a schedule states are listed. Across the market, the lock-ups that end in a window; for one company, its IPO's terms
// and any later 8-K or prospectus supplement that waives or releases them.
import { z } from "zod";

import { paragraphs } from "./audit-signals.mjs";
import { htmlToText } from "./html.mjs";
import { coverTerms, kindOf, parseFiler } from "./ipos.mjs";
import { archiveBase, filings, getJson, getText, NotFound, pad10, resolveEntity } from "./sources.mjs";

const EFTS = "https://efts.sec.gov/LATEST/search-index";
const DAY = 86400000;
const QUOTE = 420;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const atDay = (iso) => Date.parse(`${iso}T00:00:00Z`);

export const lockupInput = z.object({
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name: its IPO's lock-up terms quoted from the final prospectus, and later filings that waive or release them. Without it, the IPO lock-ups across the market that end in the window."),
  days: z.number().int().min(1).max(365).optional().describe("Across the market, the window's length in days from today (or from since); default 60."),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Across the market, the window's first day (YYYY-MM-DD), for a past or later window; default today."),
  limit: z.number().int().min(1).max(60).optional().describe("Across the market, most lock-ups listed, earliest first; default 25."),
}).strict();

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE_RE = "(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4}";
export function isoOf(words) {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(String(words ?? "").trim());
  const k = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (k < 0) return null;
  const t = Date.UTC(Number(m[3]), k, Number(m[2]));
  return new Date(t).getUTCDate() === Number(m[2]) ? isoDay(t) : null;
}
export const addDays = (iso, n) => isoDay(atDay(iso) + n * DAY);
// Months land on the same day of the month, or the month's last day when it is shorter.
export function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + n, 0)).getUTCDate();
  return isoDay(Date.UTC(y, m - 1 + n, Math.min(d, last)));
}

// The prospectus's date and the closing the underwriters expect ("on or about May 15, 2026"), from the cover.
export function coverDates(text) {
  const head = String(text).slice(0, 20000), t = head.replace(/\s+/g, " ");
  let dated = new RegExp(`(?:date of this prospectus is|prospectus dated|prospectus is dated)\\s+(${DATE_RE})`, "i").exec(t)?.[1];
  // Many covers set the date on a line of its own at their foot ("April 15, 2026"), after the delivery sentence.
  if (!dated) {
    const lines = head.split("\n").slice(0, 200);
    const from = Math.max(0, lines.findIndex((l) => /\b(?:deliver|delivery)\b/i.test(l)));
    dated = lines.slice(from).map((l) => l.trim().replace(/\.$/, "")).find((l) => new RegExp(`^${DATE_RE}$`, "i").test(l));
  }
  const closing = new RegExp(`\\b(?:deliver|delivery)\\b[^.]{0,300}?\\bon(?: or about)?\\s+(${DATE_RE})`, "i").exec(t)?.[1];
  return { dated: isoOf(dated), closing: isoOf(closing) };
}

// ---------------------------------------------------------------------------------------------
// Reading the prospectus
// ---------------------------------------------------------------------------------------------

const clip = (s, n = QUOTE) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t; };
// A long sentence quoted around the words that matter, still an exact part of the prospectus.
const clipAround = (s, at) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= QUOTE || at < QUOTE - 60) return clip(t);
  const from = t.indexOf(" ", Math.max(0, at - 140)) + 1;
  return `…${clip(t.slice(from), QUOTE - 1)}`;
};
// Sentences end at a full stop before a capital; "a.m. Eastern Time", "Inc. (the" and "No. 7" do not end one.
const sentencesOf = (para) => para.split(/(?<=[a-z0-9%)\]"'”’]\.)(?<!\b(?:No|Nos|Mr|Ms|Mrs|Dr|St|vs|Inc|Co|Corp|Ltd|LLC|a\.m|p\.m|U\.S|i\.e|e\.g|L\.P|N\.V|S\.A)\.)\s+(?=["“]?[A-Z])/);

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, nine: 9, twelve: 12, eighteen: 18, "twenty-four": 24, thirty: 30, sixty: 60, ninety: 90, "one hundred twenty": 120, "one hundred fifty": 150, "one hundred eighty": 180, "two hundred seventy": 270, "three hundred sixty": 360, "three hundred sixty-five": 365 };
const NUM = "(\\d{1,3}|one hundred (?:and )?(?:twenty|fifty|eighty)|two hundred (?:and )?seventy|three hundred (?:and )?sixty(?:-five)?|twenty-four|eighteen|twelve|ninety|sixty|thirty|nine|six|five|four|three|two|one)";
// "180 days after the date of this prospectus", "one hundred eighty (180) days following the date of the final prospectus",
// "six months after the closing of this offering", "the 181st day after the date of the underwriting agreement".
const PERIOD = new RegExp(`\\b(?:${NUM}(?:\\s*\\((\\d{1,3})\\))?[-\\s]+(day|month|year)s?(?:\\s+(?:restricted\\s+|lock-?up\\s+)?period)?|(\\d{1,3})(?:st|nd|rd|th)\\s+(day))\\s+(?:after|from|following|subsequent\\s+to)\\s+((?:the\\s+)?(?:(?:date|day)\\s+of\\s+)?(?:(?:the|this|our)\\s+)?(?:final\\s+prospectus|prospectus|underwriting\\s+agreement|pricing(?:\\s+date)?|closing(?:\\s+date)?|completion|consummation|first\\s+day\\s+of\\s+trading|commencement\\s+of\\s+trading|listing|effective(?:ness)?\\b(?:\\s+date)?\\s+of\\s+(?:the|our|this)\\s+registration\\s+statement))`, "gi");
const basisOf = (b) => (/prospectus/i.test(b) ? "prospectus" : /underwriting|pricing/i.test(b) ? "pricing" : /closing|completion|consummation/i.test(b) ? "closing" : /trading|listing/i.test(b) ? "trading" : "effective");
// A sentence about a lock-up: its name, a market standoff, or holders agreeing not to sell.
const LOCKUP = /lock[- ]?up|locked[- ]up|market stand[- ]?off|restricted period|\b(?:will|may|shall|agreed?|agrees)\s+not\b[^.;]{0,300}\b(?:offer|sell|dispose|transfer|pledge)\b|\b(?:offer|sell|dispose|transfer|pledge)\b[^.;]{0,300}\bwithout the prior written consent\b/i;
const SHARES = /\b(?:shares|stock|securities|ADSs|equity)\b/i;
const HOLDERS = /\b(?:directors?|officers?|stockholders?|shareholders?|(?:security|equity|unit)\s?holders?|holders|insiders|members of (?:our )?management|selling (?:stockholders|shareholders))\b/i;
// Other periods counted from the same dates: the underwriters' option, prospectus delivery by dealers, Rule 144's
// "beginning 90 days after", and the Australian and other selling restrictions.
const NOT_BEFORE = /(?:\boption\b[^.;]{0,60}|\bbeginning|\bwithin|\bthrough and including\b[^.;]{0,40}|\bexercisable\b[^.;]{0,40})\s*$/i;
const NOT_AFTER = /^[^.;]{0,30}\b(?:to purchase|all dealers)\b|^\)?,?\s*all dealers/i;
// FINRA Rule 5110's lock-up of the underwriters' own warrants is not a holders' lock-up either.
const NOT_SENTENCE = /section 708|\bby applying for\b|\bdealers that (?:buy|effect)|\bRule (?:144|701)\b|\b(?:representative'?s?|underwriters?'?|placement agent'?s?)\s+warrants?\b|\bRule 5110\b/i;

const TRIGGERS = [
  ["an earnings release", /\b(?:release|announcement|publication|report(?:ing)?)\s+of\s+(?:our\s+|its\s+|the\s+company'?s\s+)?(?:[\w-]+\s+){0,5}?(?:earnings|results)\b|\bearnings\s+(?:release|announcement)\b/i],
  ["the share price", /\b(?:closing|last reported|reported closing)\s+(?:sale\s+|trading\s+)?price\b[^.;]{0,300}?\b\d{2,3}(?:\.\d+)?%/i],
  ["a blackout period", /\bblackout period\b/i],
];
const RELEASE = /\breleas(?:e|ed|es)\b|\beligible for (?:public )?sale\b|\bavailable for sale\b|\bend (?:early|on)\b|\bterminat/i;

// A schedule's dated release: "6:00 a.m. Eastern Time on August 19, 2026." on a line of its own, with its shares after.
const STAGE_DATE = new RegExp(`^(?:\\d{1,2}:\\d{2}\\s*[ap]\\.m\\.\\s+(?:Eastern|New York City|New York)\\s+Time\\s+on\\s+)?(${DATE_RE})\\.?$`, "i");
const STAGE_ROW = new RegExp(`^(?:\\d{1,2}:\\d{2}\\s*[ap]\\.m\\.[^,.]{0,40}\\bon\\s+)?${DATE_RE}`, "i");
const SCHEDULE_HEAD = /\bDate Available for (?:Sale|Resale)\b|\bEarliest Date\b|\bDate of Availability\b/i;

// The shares the prospectus says are locked up: a number of shares, or holders of a share of the stock.
const LOCKED = [
  /((?:approximately |an aggregate of |a total of |up to )*(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s+(?:million|billion))\s+(?:shares|ordinary shares|American Depositary Shares|ADSs)\b)[^.;]{0,160}?\b(?:are|will be|were|remain|is)\s+(?:subject to|bound by|restricted by)\b[^.;]{0,40}?\b(?:lock[- ]?up|market stand[- ]?off)/i,
  /\b(?:upon|after|following)\s+(?:the\s+)?(?:expiration|expiry|release)\s+of\s+(?:the\s+)?(?:lock[- ]?up|market stand[- ]?off)[^.;]{0,160}?((?:approximately |an aggregate of |up to )*(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s+(?:million|billion))\s+(?:additional\s+)?(?:shares|ordinary shares|ADSs)\b)/i,
  /\b(?:holders?|stockholders?|shareholders?)\s+(?:of|that together (?:represent|hold)|representing)\s+((?:approximately\s+)?[\d.]+%\s+of\s+(?:our|the)\b[^.;]{0,100}?)\s+(?:have|has)\s+(?:entered into|agreed|signed|executed)\b/i,
  /\bthat together represent\s+((?:approximately\s+)?[\d.]+%\s+of\s+(?:our|the)\b[^.;]{0,140}?)\s+have entered into\s+lock/i,
  /\b(substantially all of (?:our|the|these)\s+(?:outstanding\s+)?(?:[\w-]+\s+){0,3}?(?:securityholders|security holders|stockholders|shareholders|holders|shares|capital stock|equity securities))\b/i,
];

const numberOf = (word, digits) => (digits ? Number(digits) : /^\d+$/.test(word) ? Number(word) : WORD_NUMBERS[String(word).toLowerCase().replace(/ and /g, " ")] ?? null);

// What a final prospectus says of its lock-ups: the periods (each length, the date it counts from, how often the
// prospectus states it and the sentence that does, naming the holders where one does), the early releases with the event they turn on, the dated releases
// a schedule lists, the shares said to be locked up, and the cover's date, expected closing, price and shares.
export function lockupTerms(text) {
  const t = String(text);
  const cover0 = coverDates(t);
  const cover = coverTerms(t);
  // "The initial public offering price per share of our Class A common stock is $185.00."
  const price = (cover.price >= 0.01 ? cover.price : null) ?? (Number(/\bpublic offering price\b[^.$]{0,80}?\bis\s+\$\s?(\d[\d,]*(?:\.\d+)?)/i.exec(t.slice(0, 20000))?.[1]?.replace(/,/g, "")) || null);
  const paras = paragraphs(t);
  const periods = new Map(), early = [], stages = [];
  let locked = null;
  const seen = new Set();
  paras.forEach((para, k) => {
    if (para.length < 400 && SCHEDULE_HEAD.test(para)) {
      // A release schedule: dated lines, each followed by the shares it frees.
      for (let j = k + 1; j < Math.min(paras.length, k + 80); j += 1) {
        const d = STAGE_DATE.exec(paras[j]);
        if (!d) continue;
        const what = /\bshares\b/i.test(paras[j + 1] ?? "") ? paras[j + 1] : null;
        const iso = isoOf(d[1]);
        if (iso && !stages.some((s) => s.date === iso)) stages.push({ date: iso, when: paras[j], shares: what ? clip(what, 200) : null });
      }
    }
    if (!/\d|days?|months?/i.test(para)) return;
    for (const s of sentencesOf(para)) {
      if (NOT_SENTENCE.test(s)) continue;
      const about = LOCKUP.test(s) && SHARES.test(s);
      if (about) {
        for (const m of s.matchAll(PERIOD)) {
          if (NOT_BEFORE.test(s.slice(Math.max(0, m.index - 80), m.index)) || NOT_AFTER.test(s.slice(m.index + m[0].length, m.index + m[0].length + 40))) continue;
          const n = m[4] ? Number(m[4]) : numberOf(m[1], m[2]);
          const unit = (m[3] ?? m[5]).toLowerCase();
          if (!n) continue;
          const basis = basisOf(m[6]);
          const key = `${unit === "year" ? n * 12 : n} ${unit === "year" ? "month" : unit} ${basis}`;
          const holders = HOLDERS.test(s);
          const p = periods.get(key) ?? periods.set(key, { n: unit === "year" ? n * 12 : n, unit: unit === "year" ? "month" : unit, basis, from: m[6].replace(/\s+/g, " "), words: m[0].replace(/\s+/g, " "), count: 0, quote: null, at: k, earlierOf: false, holders: false }).get(key);
          p.count += 1;
          if (/\bearlier of\b/i.test(s)) p.earlierOf = true;
          // The quote: the first sentence that names the holders, else the first.
          if (!p.quote || (holders && !p.holders)) Object.assign(p, { from: m[6].replace(/\s+/g, " "), words: m[0].replace(/\s+/g, " "), quote: clipAround(s, /\bearlier of\b/i.test(s) ? s.search(/\bearlier of\b/i) : m.index), sig: s.replace(/\s+/g, " ").slice(0, 160).toLowerCase() });
          if (holders) p.holders = true;
          // A release schedule's row ("October 9, 2026 (120th day after the date of this prospectus) Up to 328.4 million shares").
          if (STAGE_ROW.test(s) && !p.shares) Object.assign(p, { staged: true, shares: clip(/\b(?:up to|approximately|an aggregate of|all)\b[^.;]{0,160}?\bshares\b[^.;]{0,120}/i.exec(s)?.[0] ?? "", 240) || null });
        }
        // A count of shares beats a share of the stock, which beats "substantially all".
        for (let i = 0; i < (locked?.rank ?? LOCKED.length); i += 1) { const x = LOCKED[i].exec(s); if (x) { locked = { words: x[1].replace(/\s+/g, " ").trim(), quote: clipAround(s, x.index), rank: i }; break; } }
      }
      if (about || RELEASE.test(s)) {
        const on = TRIGGERS.filter(([, re]) => re.test(s)).map(([name]) => name);
        const sig = s.replace(/\s+/g, " ").slice(0, 160).toLowerCase();
        if (on.length && !seen.has(sig) && (about || /\block[- ]?up|restricted period|market stand/i.test(paras[k - 1] ?? "") || /\b\d{2,3}(?:\.\d+)?%/.test(s))) {
          seen.add(sig);
          early.push({ on, sig, quote: clipAround(s, s.search(TRIGGERS.find(([name]) => name === on[0])[1])) });
        }
      }
    }
  });
  // An early release named in a period's own sentence ("the earlier of ... our release of earnings ... or 180 days") first.
  early.sort((x, y) => Number(/earlier of/i.test(y.quote)) - Number(/earlier of/i.test(x.quote)));
  // The main lock-up binds the holders (directors, officers, shareholders); a period only the company agreed to (not to
  // issue or sell new shares) comes after, as does one counted from a date the prospectus does not state.
  const dated = (p) => ["prospectus", "pricing", "closing"].includes(p.basis);
  const list = [...periods.values()].sort((x, y) => Number(y.holders) - Number(x.holders) || Number(dated(y)) - Number(dated(x)) || y.count - x.count || x.at - y.at);
  const once = early.filter((e, i) => early.findIndex((x) => x.on.join() === e.on.join()) === i);
  return { dated: cover0.dated, closing: cover0.closing, price, shares: cover.shares, ipo: /\binitial public offering\b/i.test(t.slice(0, 20000)), periods: list, early: once.slice(0, 4), stages, locked: locked && { words: locked.words, quote: locked.quote } };
}

// The dates each period ends on, counted from the date its words name. The pricing and the underwriting agreement
// are the prospectus date (a final prospectus is dated the day the offering is priced); the closing is the date the
// cover says the underwriters expect to deliver the shares. Trading and the registration statement's effective date
// are not dated in the prospectus, so those periods have no date.
export function endOf(p, terms) {
  const base = { prospectus: terms.dated, pricing: terms.dated, closing: terms.closing }[p.basis] ?? null;
  if (!base) return { base: null, end: null };
  return { base, end: p.unit === "day" ? addDays(base, p.n) : addMonths(base, p.n) };
}
const eventOf = (p, i) => (p.staged && !p.holders ? "staged release" : !p.holders ? "company's own lock-up ends" : i === 0 ? "lock-up ends" : "other lock-up ends");
const lengthOf = (p) => `${p.n} ${p.unit}${p.n === 1 ? "" : "s"}`;
const baseName = { prospectus: "prospectus date", pricing: "pricing (the prospectus date)", closing: "expected closing date", trading: "first trading day (not dated in the prospectus)", effective: "registration statement's effective date (not dated in the prospectus)" };

// ---------------------------------------------------------------------------------------------
// Finding final prospectuses
// ---------------------------------------------------------------------------------------------

const readDoc = (session, url) => getText(session, url, { maxBytes: 64 * 1024 * 1024, timeoutMs: 60000, transform: (t) => (/\.txt$/i.test(url) ? t : htmlToText(t)) });
const FINAL = "424B4,424B1";

// EDGAR full-text search: every hit is one document of a filing ("accession:file"), sorted by relevance.
const searchUrl = ({ q, forms, cik, from, to, page = 0 }) => `${EFTS}?q=${encodeURIComponent(q)}&forms=${forms}${cik ? `&ciks=${pad10(cik)}` : ""}${from ? `&dateRange=custom&startdt=${from}&enddt=${to}` : ""}${page ? `&from=${page * 100}` : ""}`;
async function search(session, args, pages = 3) {
  const hits = [];
  let total = 0;
  for (let page = 0; page < pages; page += 1) {
    const r = await getJson(session, searchUrl({ ...args, page }));
    total = r?.hits?.total?.value ?? 0;
    const got = r?.hits?.hits ?? [];
    for (const h of got) {
      const s = h._source ?? {}, [acc, file] = String(h._id).split(":");
      hits.push({ acc, file, form: s.form ?? null, type: String(s.file_type ?? ""), filed: s.file_date ?? null, cik: Number(s.ciks?.[0] ?? 0) || null, display: s.display_names?.[0] ?? null, sics: s.sics ?? [] });
    }
    if (got.length < 100) break;
  }
  return { url: searchUrl(args), total, hits };
}
// One entry per filing, at its main document (the one typed as the form itself).
function byFiling(hits) {
  const out = new Map();
  for (const h of hits) {
    const main = h.type === h.form;
    const cur = out.get(h.acc);
    if (!cur || (main && !cur.main)) out.set(h.acc, { ...h, main });
  }
  return out;
}

// Lock-up lengths looked for across the market, each with the days it can span (a month runs 28 to 31 days, and a
// period counted from the closing ends up to five days later). The standard 180 days or six months is read from
// every IPO prospectus filed in its window; the others only from prospectuses whose text states them in common
// wording (Rule 144's "beginning 90 days after the date of this prospectus" is in nearly every one, so 90 days needs
// "period of" or "ending" before it).
const BUCKETS = [
  { min: 180, max: 189, q: "\"initial public offering\" \"lock-up\"" },
  // Prospectuses with a release schedule ("Earliest Date Available for Sale"), for staged releases before the end.
  { min: 0, max: 189, q: "\"Date Available for Sale\" OR \"Earliest Date Available\" OR \"Date of Availability for Sale\"" },
  { min: 89, max: 97, words: ["90 days", "ninety (90) days", "three months"], strict: true },
  { min: 120, max: 128, words: ["120 days", "one hundred twenty (120) days", "four months"] },
  { min: 150, max: 158, words: ["150 days", "one hundred fifty (150) days", "five months"] },
  { min: 270, max: 280, words: ["270 days", "nine months"] },
  { min: 360, max: 372, words: ["360 days", "365 days", "12 months", "twelve months", "twelve (12) months", "one year"] },
  { min: 540, max: 553, words: ["540 days", "18 months", "eighteen months"] },
  { min: 720, max: 736, words: ["730 days", "24 months", "two years"] },
];
const BASES = ["after the date of this prospectus", "from the date of this prospectus", "following the date of this prospectus", "after the date of the final prospectus", "after the closing", "from the closing"];
const phrasesFor = (b) => b.words.flatMap((w) => (b.strict ? ["period of", "ending"].flatMap((pre) => BASES.slice(0, 2).concat("after the closing").map((base) => `"${pre} ${w} ${base}"`)) : BASES.map((base) => `"${w} ${base}"`))).join(" OR ");

const LIMITS = [
  "Not investment advice.",
  "Read from the final prospectus's own words: text matching can miss unusual wording, and a period counted from a date the prospectus does not state (the first trading day, the registration statement's effective date) has no expiry.",
  "Underwriters can waive or shorten a lock-up at any time, and waivers granted later are not always filed: a waiver found here is not the whole record.",
  "An expiry is the day holders may sell under the agreement, not a sign that they will; Rule 144, insider trading windows and vesting can still limit sales.",
];
const READING_TAIL = "an expiry is when holders may sell, not that they will, and staged and early releases are listed where the prospectus states them";
const MAX_READS = 60, READ_BATCH = 6;

// ---------------------------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------------------------

export async function lockupCalendar(session, args) {
  const a = lockupInput.parse(args);
  if (!a.company) return marketLockups(session, a);
  return companyLockups(session, a);
}

const COLUMNS = ["expiry", "event", "company", "ticker", "cik", "priced", "lockup", "counts_from", "base_date", "early_release", "shares_locked", "ipo_shares", "ipo_price", "form", "accession", "url"];

async function marketLockups(session, a) {
  const days = a.days ?? 60, limit = a.limit ?? 25;
  const start = a.since ?? isoDay(session.now()), end = addDays(start, days);
  const searches = [], sources = [];
  const cands = new Map();
  for (const b of BUCKETS) {
    const from = addDays(start, -b.max), to = addDays(end, 3 - b.min);
    const found = await search(session, { q: b.q ?? phrasesFor(b), forms: FINAL, from, to }, b.q ? 5 : 2);
    searches.push(found.url);
    for (const f of byFiling(found.hits).values()) {
      const filer = parseFiler(f.display);
      // SPACs and funds are not IPO lock-ups of this kind: a SPAC's founder shares are locked until after its merger.
      if (!f.cik || !f.main || kindOf(filer, f.sics, { priced: true }) !== "company") continue;
      const guess = b.min ? addDays(f.filed, b.min - 3) : start;
      const c = cands.get(f.acc);
      if (!c || guess < c.guess) cands.set(f.acc, { ...f, filer, guess });
    }
  }
  const rows = [], quotes = [];
  const counts = { prospectuses_found: cands.size, prospectuses_read: 0, not_initial_offerings: 0, without_stated_period: 0 };
  let capped = false, through = null;
  const done = new Set();
  const order = [...cands.values()].sort((x, y) => x.guess.localeCompare(y.guess) || x.acc.localeCompare(y.acc));
  const read = async (c) => { const url = `${archiveBase(c.cik, c.acc)}/${c.file}`; try { return { c, url, terms: lockupTerms(await readDoc(session, url)) }; } catch (err) { if (err instanceof NotFound) return { c, url, terms: null }; throw err; } };
  // One prospectus's rows: each period and dated release that ends in the window.
  const take = ({ c, url, terms }) => {
    counts.prospectuses_read += 1;
    sources.push(url);
    if (!terms.ipo) { counts.not_initial_offerings += 1; return; }
    if (done.has(c.cik)) return;
    if (!terms.periods.length) counts.without_stated_period += 1;
    const company = c.filer.name, ticker = c.filer.tickers[0] ?? null;
    const early = terms.early.length ? [...new Set(terms.early.flatMap((e) => e.on))].join("; ") : null;
    let any = false;
    terms.periods.forEach((p, i) => {
      const { base, end: ends } = endOf(p, terms);
      if (!ends || ends < start || ends > end) return;
      any = true;
      rows.push([ends, eventOf(p, i), company, ticker, c.cik, terms.dated, lengthOf(p), p.from, base, i === 0 ? early : null, p.shares ?? (i === 0 ? terms.locked?.words ?? null : null), terms.shares, terms.price, c.form, c.acc, url]);
      quotes.push({ company, about: `${lengthOf(p)} lock-up`, text: p.quote, url });
    });
    for (const st of terms.stages) {
      if (st.date < start || st.date > end) continue;
      any = true;
      rows.push([st.date, "staged release", company, ticker, c.cik, terms.dated, st.when, null, null, null, st.shares, terms.shares, terms.price, c.form, c.acc, url]);
    }
    if (!any) return;
    done.add(c.cik);
    const e = terms.early.find((x) => x.sig !== terms.periods[0]?.sig);
    if (e) quotes.push({ company, about: `early release on ${e.on.join(" and ")}`, text: e.quote, url });
  };
  // Read in the order their lock-ups would end, a few at a time; stop once the list is full and the rest would end later.
  for (let i = 0; i < order.length; i += READ_BATCH) {
    const ends = rows.map((r) => r[0]).sort();
    if (rows.length >= limit && order[i].guess > addDays(ends[limit - 1], 10)) break;
    // Unread prospectuses would end no sooner than their guess, less the days a filing can trail its pricing.
    if (counts.prospectuses_read >= MAX_READS) { capped = true; through = addDays(order[i].guess, -4); break; }
    for (const got of await Promise.all(order.slice(i, i + READ_BATCH).map(read))) if (got.terms) take(got);
  }
  rows.sort((x, y) => x[0].localeCompare(y[0]) || String(x[2]).localeCompare(String(y[2])));
  const shown = rows.slice(0, limit);
  Object.assign(counts, { lockups_in_window: rows.length, listed: shown.length, ...(capped ? { capped_at_reads: MAX_READS, complete_through: through < end ? through : end } : {}) });
  const first = shown[0];
  return {
    window: { from: start, to: end, days },
    columns: COLUMNS,
    rows: shown,
    note: `Lock-ups of IPOs that end ${start} to ${end}, earliest first, one row per period or dated release the final prospectus states. expiry is counted from the date its words name (counts_from): the prospectus date (priced; a period counted from the pricing or the underwriting agreement uses it too, as a final prospectus is dated the day it is priced), or for a period counted from the closing, the closing date the cover says the underwriters expect (base_date). early_release names what can end the main lock-up sooner (an earnings release, the share price, a blackout period); the company's own call (with company) quotes it. staged release rows are dates a release schedule in the prospectus states. shares_locked is as the prospectus words it (a count, a share of the stock, or substantially all). Found by EDGAR full-text search over final prospectuses (424B4, 424B1); SPACs and funds are left out.${capped ? ` Reading stopped at ${MAX_READS} prospectuses: the list is complete through ${counts.complete_through}; ask again with since ${addDays(counts.complete_through, 1)} for the rest of the window.` : ""}`,
    quotes,
    counts,
    reading: `${rows.length} IPO lock-up${rows.length === 1 ? "" : "s"} or dated release${rows.length === 1 ? "" : "s"} end ${start} to ${end}${first ? `, the first ${first[2]}'s on ${first[0]}` : ""}; ${READING_TAIL}.`,
    source: searches[0],
    sources: [...new Set([...searches, ...sources])],
    limits: [...LIMITS, "Across the market only IPOs whose final prospectus is a 424B4 or 424B1 are found; the standard 180 days or six months is read from every one in its window, other lengths only where the prospectus states them in common wording ('for a period of 12 months after the date of this prospectus')."],
  };
}

// Later filings that change the lock-up: a sentence saying the underwriters waived it or released shares from it.
// "may release ... at any time" is the standing permission every prospectus states, not a release.
const CHANGED = /\bwaived\b|\b(?:has|have|had)\s+(?:agreed to\s+)?(?:waive|release)\b|\bgranted (?:a |an )?(?:waiver|release|early release)\b|\b(?:were|was|has been|have been|are being|is being)\s+released\b|\bterminated the\b/i;
const STANDING = /\b(?:may|can|could|might|will)(?:,\s*[^,]{0,60},)?\s+(?:be\s+)?(?:release|waive|released|waived)\b|\bdiscretion\b|\bat any time\b|\bimpending\b|\bbusiness days before\b|\bwill notify\b|\bif\b[^.;]{0,120}\b(?:release|waive)|\bexpiration or waiver\b|\bno contractually specified\b/i;
export function lockupChanges(text) {
  const out = [];
  for (const para of paragraphs(String(text))) {
    if (!/lock[- ]?up|market stand[- ]?off/i.test(para)) continue;
    for (const s of sentencesOf(para)) if (/lock[- ]?up|market stand[- ]?off/i.test(s) && CHANGED.test(s) && !STANDING.test(s)) out.push(clipAround(s, s.search(CHANGED)));
  }
  return [...new Set(out)];
}

async function companyLockups(session, a) {
  const e = await resolveEntity(session, a.company);
  let { sub, rows } = await filings(session, e.cik);
  const company = { cik: e.cik, name: sub.name ?? e.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null };
  const finalsIn = (list) => list.filter((r) => /^424B[14]$/.test(r.form)).sort((x, y) => x.filingDate.localeCompare(y.filingDate));
  if (!finalsIn(rows).length && sub.filings?.files?.length) rows = (await filings(session, e.cik, { since: "2001-01-01" })).rows;
  // The IPO's final prospectus: the first 424B4 or 424B1 whose cover says it is an initial public offering, else the
  // first 424B3 that does (a self-underwritten offering or a direct listing).
  const tries = [...finalsIn(rows).slice(0, 3), ...rows.filter((r) => r.form === "424B3").sort((x, y) => x.filingDate.localeCompare(y.filingDate)).slice(0, 2)];
  let ipo = null, terms = null;
  const sources = [];
  for (const r of tries) {
    const url = `${archiveBase(e.cik, r.accessionNumber)}/${r.primaryDocument}`;
    let t;
    try { t = lockupTerms(await readDoc(session, url)); } catch (err) { if (err instanceof NotFound) continue; throw err; }
    sources.push(url);
    if (t.ipo) { ipo = { ...r, url }; terms = t; break; }
  }
  if (!ipo) throw new NotFound(`${company.name ?? a.company} has no IPO prospectus on EDGAR (a final prospectus, 424B4, 424B1 or 424B3, whose cover says initial public offering)${tries.length ? `; ${tries.length} final prospectus${tries.length === 1 ? " was" : "es were"} read` : ""}. A company that listed before EDGAR (1996), by a direct listing without one, or through a SPAC merger has none.`);
  const out = [];
  terms.periods.forEach((p, i) => {
    const { base, end } = endOf(p, terms);
    out.push([end, eventOf(p, i), lengthOf(p), p.from, base, end ? (p.earlierOf ? "at the latest: the prospectus names an earlier end (see early release)" : null) : `not dated: counted from the ${baseName[p.basis]}`, p.shares ?? (i === 0 ? terms.locked?.words ?? null : null), p.quote]);
  });
  for (const s of terms.stages) out.push([s.date, "staged release", null, null, null, `on the date the release schedule states (${s.when})`, s.shares, `${s.when} ${s.shares ?? ""}`.trim()]);
  for (const x of terms.early) out.push([null, "early release", null, null, null, `can end sooner on ${x.on.join(" and ")}; the date is not stated`, null, x.quote]);
  out.sort((x, y) => (x[0] ?? "9999").localeCompare(y[0] ?? "9999"));

  // Waivers and early releases filed later: 8-Ks and prospectus supplements that name the lock-up.
  const found = await search(session, { q: "\"lock-up\"", forms: "8-K,424B3,424B4,424B5,424B7", cik: e.cik }, 1);
  // The filing's own text or a press release; the underwriting agreement and lock-up forms filed at the closing are not changes.
  const filed = [...byFiling(found.hits.filter((h) => h.type === h.form || /^EX-99/i.test(h.type))).values()].filter((f) => f.acc !== ipo.accessionNumber && f.filed > ipo.filingDate).sort((x, y) => y.filed.localeCompare(x.filed) || y.acc.localeCompare(x.acc));
  const changes = [];
  for (const f of filed.slice(0, 6)) {
    const url = `${archiveBase(e.cik, f.acc)}/${f.file}`;
    let said;
    try { said = lockupChanges(await readDoc(session, url)); } catch (err) { if (err instanceof NotFound) continue; throw err; }
    sources.push(url);
    for (const q of said.slice(0, 2)) changes.push([f.filed, f.form, q, url]);
  }
  const main = terms.periods[0], mainEnd = main ? endOf(main, terms) : null;
  const say = main ? `${company.name}'s IPO lock-up (prospectus dated ${terms.dated ?? "not stated"}) runs ${main.words}${mainEnd?.end ? `, to ${mainEnd.end}` : ", a date the prospectus does not state"}` : `${company.name}'s IPO prospectus (dated ${terms.dated ?? "not stated"}) states no lock-up period in wording this tool reads`;
  const sooner = terms.early.length ? `, or sooner on ${[...new Set(terms.early.flatMap((x) => x.on))].join(" or ")}` : "";
  return {
    company,
    ipo: { form: ipo.form, filed: ipo.filingDate, prospectus_date: terms.dated, expected_closing: terms.closing, price: terms.price, shares_offered: terms.shares, accession: ipo.accessionNumber, url: ipo.url },
    columns: ["expiry", "event", "lockup", "counts_from", "base_date", "condition", "shares_locked", "quote"],
    rows: out,
    note: "Each lock-up period the final prospectus states, with the date it ends counted from the date its words name (counts_from, base_date): the prospectus date (also for a period counted from the pricing or the underwriting agreement, as a final prospectus is dated the day it is priced), or the closing date the cover says the underwriters expect. A period counted from a date the prospectus does not state has no expiry. staged release rows are dates a release schedule in the prospectus states; early release rows quote what can end the lock-up sooner (an earnings release, the share price, a blackout period), whose date is not known in advance.",
    changes: { columns: ["filed", "form", "quote", "url"], rows: changes, note: `Later 8-Ks and prospectus supplements whose text says the lock-up was waived or shares were released from it (of ${filed.length} filed after the IPO that name a lock-up; the newest ${Math.min(6, filed.length)} read).` },
    quotes: [...(main ? [{ about: `${lengthOf(main)} lock-up`, text: main.quote }] : []), ...terms.early.filter((x) => x.sig !== main?.sig).map((x) => ({ about: `early release on ${x.on.join(" and ")}`, text: x.quote })), ...(terms.locked ? [{ about: "shares locked up", text: terms.locked.quote }] : [])],
    counts: { lockup_periods: terms.periods.length, staged_releases: terms.stages.length, early_releases: terms.early.length, later_filings_naming_lockup: filed.length, changes_found: changes.length },
    reading: `${say}${sooner}${terms.stages.length ? `, with ${terms.stages.length} dated release${terms.stages.length === 1 ? "" : "s"} stated before then` : ""}; ${READING_TAIL}.`,
    source: ipo.url,
    sources: [...new Set([...sources, found.url])],
    limits: LIMITS,
  };
}
