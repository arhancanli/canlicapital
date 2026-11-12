// audit_signals: what auditors and companies say when something is wrong, from SEC filings. Going-concern
// doubt: each 10-K and 10-Q whose own text says there is substantial doubt about the company's ability to
// continue as a going concern, as a timeline (first raised, still raised, lifted), or across the market the
// companies whose latest report newly raised it. Auditor changes: 8-K Item 4.01, who left, who came, resigned
// or dismissed, and what the filing says of disagreements and reportable events. Critical audit matters: the
// matters named in the auditor's report of the latest 10-K. Every row quotes the sentence that shows it.
import { z } from "zod";

import { htmlToText } from "./html.mjs";
import { archiveBase, filingDocuments, filings, getJson, getText, NotFound, pad10, resolveEntity } from "./sources.mjs";

const EFTS = "https://efts.sec.gov/LATEST/search-index";
const GC_Q = "\"substantial doubt\" \"going concern\"";
const DAY = 86400000;
const QUOTE = 300;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export const auditInput = z.object({
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name. Without it, across the market: the companies whose latest 10-K or 10-Q newly raised a going-concern doubt, or the auditor changes filed, in the last `days`."),
  signal: z.enum(["going_concern", "auditor_change", "critical_audit_matters", "all"]).optional().describe("going_concern, auditor_change (8-K Item 4.01), critical_audit_matters (the latest 10-K's auditor's report; a company only) or all. Default: all for a company, going_concern across the market."),
  days: z.number().int().min(1).max(365).optional().describe("Across the market, how many days back from today; default 30."),
  limit: z.number().int().min(1).max(40).optional().describe("Most rows in each table; default 12 for a company (its latest reports), 10 across the market."),
}).strict();

// ---------------------------------------------------------------------------------------------
// Reading filings
// ---------------------------------------------------------------------------------------------

const readText = (session, url) => getText(session, url, { maxBytes: 64 * 1024 * 1024, timeoutMs: 60000, transform: (t) => (/\.txt$/i.test(url) ? t : htmlToText(t)) });

// EDGAR full-text search: every hit is one document of a filing ("accession:file"), sorted by relevance.
const searchUrl = ({ q, forms, cik, from, to, page = 0 }) => `${EFTS}?q=${encodeURIComponent(q)}&forms=${forms}${cik ? `&ciks=${[cik].flat().map(pad10).join(",")}` : ""}${from ? `&dateRange=custom&startdt=${from}&enddt=${to}` : ""}${page ? `&from=${page * 100}` : ""}`;
function hitOf(h) {
  const s = h._source ?? {}, [acc, file] = String(h._id).split(":");
  const shown = String(s.display_names?.[0] ?? "").replace(/\s+/g, " ").trim();
  const m = /^(.*?)\s*(?:\(([A-Z0-9.\-, ]+)\)\s*)?\(CIK \d+\)$/.exec(shown);
  return { acc, file, cik: Number(s.ciks?.[0] ?? 0), name: m ? m[1].trim() : shown || null, ticker: m?.[2]?.split(",")[0].trim() ?? null, form: s.form ?? null, type: String(s.file_type ?? ""), filed: s.file_date ?? null, period: s.period_ending ?? null, items: s.items ?? [] };
}
async function search(session, args, pages = 3) {
  const hits = [];
  let total = 0;
  for (let page = 0; page < pages; page += 1) {
    const r = await getJson(session, searchUrl({ ...args, page }));
    total = r?.hits?.total?.value ?? 0;
    const got = r?.hits?.hits ?? [];
    hits.push(...got.map(hitOf));
    if (got.length < 100) break;
  }
  return { url: searchUrl(args), total, hits };
}

// A filing's hits, its main document first (10-K, 10-Q, 8-K), then exhibits.
function byFiling(hits, main) {
  const out = new Map();
  for (const h of hits) {
    const f = out.get(h.acc) ?? out.set(h.acc, { ...h, docs: [] }).get(h.acc);
    if (main.test(h.type)) f.docs.unshift(h.file); else f.docs.push(h.file);
    if (main.test(h.type)) Object.assign(f, { file: h.file, type: h.type });
  }
  return out;
}

const clip = (s, n = QUOTE) => { const t = String(s ?? "").replace(/\s+/g, " ").replace(/^(?:\(?[a-z0-9]{1,3}\)\s*)?\|\s*/i, "").trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t; };

// A long sentence quoted from just before the words that matter ("…except that the report included an explanatory
// paragraph"), so the quote shows them; still an exact part of the filing.
const clipAt = (s, re) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim(), i = t.search(re);
  if (t.length <= QUOTE || i < QUOTE - 120) return clip(t);
  const from = t.indexOf(" ", Math.max(0, i - 80)) + 1;
  return `…${clip(t.slice(from), QUOTE - 1)}`;
};

// Paragraphs as the filing sets them: a line broken mid-sentence joins the next; a heading ("Going Concern",
// "(a) Dismissal of Independent Registered Public Accounting Firm") stays apart. A line is broken mid-sentence
// when it ends without a full stop and has a comma or connector at its end, an open bracket, a year or a
// lowercase word a heading would not hold, or runs long.
const CONNECTORS = new Set(["of", "and", "in", "the", "for", "to", "on", "a", "an", "or", "with", "by", "at", "from", "as", "its", "our", "their", "vs"]);
const broken = (prev, line) => /^[a-z(]/.test(line) || /[,&]$|\b(?:On|In|At|By|As|Also|the|of|and|or|a|an|to|by|for|with|from|as|that|its|our|their)$/.test(prev) || prev.length > 80
  || (prev.match(/\(/g)?.length ?? 0) > (prev.match(/\)/g)?.length ?? 0) || /\b(?:19|20)\d{2}\b/.test(prev) || prev.split(/\s+/).some((w) => /^[a-z]{3,}/.test(w) && !CONNECTORS.has(w));
export function paragraphs(text) {
  const out = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const prev = out.at(-1);
    // "Elauwit Connection, Inc." at a line's end does not end the sentence when "(the "Company")" opens the next.
    if (prev && ((!/[.:;!?]["”')]*$/.test(prev) && broken(prev, line)) || /^[a-z]/.test(line) || (/\b(?:Inc|Corp|Co|Ltd|No|L\.L\.C|P\.C|P\.A|N\.V|S\.A)\.$/.test(prev) && /^\(/.test(line)))) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}
// Sentences end at a full stop before a capital or a quote; "No. 7", "U.S. GAAP" and "Inc. (the" do not end one.
const sentencesIn = (para) => para.split(/(?<=[a-z0-9%)\]"”'’]\.)(?<!\b(?:No|Nos|Mr|Ms|Mrs|Dr|St|vs)\.)\s+(?=["“]?[A-Z])/);

// ---------------------------------------------------------------------------------------------
// Going concern: what a sentence says of substantial doubt
// ---------------------------------------------------------------------------------------------

const NOT_ALLEVIATED = /\bnot\s+(?:yet\s+)?(?:been\s+)?(?:fully\s+|sufficiently\s+)?alleviated\b|\b(?:do|does|did|will|would|could|can)\s*(?:not|n't)\s+(?:\w+\s+)?alleviate\b|\b(?:insufficient|not sufficient|not enough|unable)\s+to\s+alleviate\b|\bcannot\s+(?:\w+\s+)?alleviate\b/i;
const ALLEVIATED = /\balleviated\b|\balleviates\b|\balleviate\s+(?:the\s+|such\s+|this\s+|that\s+|any\s+)?substantial doubts?\b|\bsubstantial doubt\b[^.;]{0,160}\bno longer exists?\b|\bno longer (?:any\s+)?substantial doubt\b/i;
// Alleviation that is only hoped for, planned or evaluated.
const ALLEVIATION_HOPED = /\bwhether\b|\bif\b|\bunless\b|\bno assurance\b|\bnot be\b|\buncertain\b|\b(?:may|might|could|would|should|can)\s+(?:\w+\s+){0,4}alleviate|\b(?:intended|designed|expected|plans?|attempts?|attempting|seeks?|seeking|efforts?|order|necessary|needed|required|able|steps?|actions?)\s+(?:\w+\s+)?to\s+alleviate\b/i;
const NO_DOUBT = /\bno\s+(?:such\s+)?substantial doubt\b|\bnot\s+substantial doubt\b|\b(?:do|does|did)\s+not\s+(?:\w+\s+){0,3}(?:raise|create|give rise to|indicate)\b[^.;]{0,20}\bsubstantial doubt\b|\bdid\s+not\s+identify\b[^.;]{0,160}\bsubstantial doubt\b|\bsubstantial doubt\b[^.;]{0,160}\b(?:does|did)\s+not\s+exist\b|\bnot\s+aware\s+of\b[^.;]{0,160}\bsubstantial doubt\b/i;
const RAISE = /\b(?:rais(?:e|es|ed|ing)|creat(?:e|es|ed|ing)|caus(?:e|es|ed)|indicat(?:e|es|ed)|express(?:es|ed)?|disclos(?:e|es|ed)|identified)\s+(?:a\s+|the\s+|significant\s+)?substantial\s+doubts?\b|\bsubstantial\s+doubts?\b[^.;]{0,160}?\b(?:exists?|existed|remains?|remained|continues?\s+to\s+exist)\b|\bthere\s+(?:is|was|remains|exists|continues\s+to\s+be)\s+(?:a\s+)?substantial\s+doubts?\b|\bgoing\s+concern["”']?\s+(?:paragraph|opinion|qualification|explanatory|emphasis)\b|\bexplanatory\s+paragraph\b|\bsubstantial doubts?\b[^.;]{0,80}\b(?:has|have)\s+been\s+(?:raised|expressed|identified)\b/gi;

// Whose ability the doubt is about, when the sentence says: "the Company's", "our" and "its" are the filer's,
// unless "its" follows another company named in the sentence ("LiveWire Group, Inc. disclosed conditions that
// raise substantial doubt about its ability", in its parent's 10-Q).
const ENTITY = /\b([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,4}),?\s+(?:Inc|Corp|Corporation|LLC|L\.L\.C|Ltd|Limited|plc|N\.V|S\.A|AG|GmbH|LP|L\.P)\b/g;
function aboutAnother(s, filer) {
  const object = /\bdoubts?\s+(?:about|regarding|as to|concerning|over|of|on)\s+(?:the\s+)?([^,;()]{1,80}?)\s+abilit(?:y|ies)\b/i.exec(s)?.[1]?.trim() ?? "";
  if (!object || /^(?:our|its own|company'?s?|registrant'?s?|partnership'?s?|trust'?s?|fund'?s?|bank'?s?|corporation'?s?|group'?s?|issuer'?s?|entity'?s?)$/i.test(object)) return false;
  if (/^its$/i.test(object)) return !/\(the\s+["“](?:Company|Registrant|Partnership|Trust)["”]\)/.test(s) && [...s.matchAll(ENTITY)].some((m) => !(filer && sameName(m[1], filer)));
  const named = object.replace(/'s?$/, "");
  return /^[A-Z]/.test(named) && !(filer && sameName(named, filer));
}

// One sentence on substantial doubt: raised, alleviated, no_doubt or mention (a policy, a risk that might come,
// a list of forward-looking statements, or another company's doubt).
export function doubtIn(sentence, filer = null) {
  const s = String(sentence).replace(/[’‘]/g, "'");
  if (aboutAnother(s, filer)) return "mention";
  if (NOT_ALLEVIATED.test(s)) return "raised";
  // "It is probable that management's plans will alleviate" is the standard's own wording for lifting it; any
  // other "will alleviate" is a hope.
  const will = /\bwill\s+(?:\w+\s+){0,4}alleviate\b/i.test(s);
  if ((ALLEVIATED.test(s) || will) && !ALLEVIATION_HOPED.test(s) && (!will || /\bprobable\b/i.test(s))) return "alleviated";
  if (NO_DOUBT.test(s)) return "no_doubt";
  if (/\ban entity'?s\b|\bforward-looking statements?\b/i.test(s)) return "mention";
  for (const m of s.matchAll(RAISE)) {
    const before = s.slice(0, m.index), clause = before.slice(Math.max(before.lastIndexOf(";"), before.lastIndexOf(":")) + 1);
    if (/\b(?:if|whether|when|unless|in the event|should)\b/i.test(clause)) continue;
    if (/\b(?:may|might|could|would|will|can|cannot|not|no|never)\s+(?:\w+\s+){0,2}$/i.test(before)) continue;
    if (/\b(?:not|no)\b/i.test(m[0])) continue;
    return "raised";
  }
  return "mention";
}

const REPORT_HEAD = /^(?:report of )?independent registered public accounting firm(?:'s|’s)? report\b|^report of independent registered public accounting firm\b|^report of independent (?:certified public )?accountants?\b/i;
// What a document says: status (doubt raised, doubt alleviated, no substantial doubt, mentioned only, not
// mentioned) and the sentence that shows it, preferring the auditor's report. A sentence must name both
// phrases to raise it; one that only says "substantial doubt", within a few paragraphs of a going-concern
// passage, counts when it says the doubt is alleviated, absent or not alleviated ("management concluded that
// its plans alleviate the substantial doubt").
export function goingConcernIn(text, filer = null) {
  const found = { raised: [], alleviated: [], no_doubt: [], mention: [] };
  let inReport = false, left = 0, k = 0, lastGc = -99;
  for (const para of paragraphs(text)) {
    k += 1;
    if (para.length < 200 && REPORT_HEAD.test(para)) { inReport = true; left = 80; } else if (inReport && --left <= 0) inReport = false;
    if (/going[\s-]+concern/i.test(para)) lastGc = k;
    if (/substantial\s+doubt/i.test(para) && k - lastGc <= 6) {
      for (const s of sentencesIn(para)) {
        if (!/substantial\s+doubt/i.test(s)) continue;
        const v = doubtIn(s, filer), both = /going[\s-]+concern/i.test(s);
        if (both || v === "alleviated" || v === "no_doubt" || (v === "raised" && NOT_ALLEVIATED.test(s.replace(/[’‘]/g, "'")))) found[v].push({ s, inReport });
      }
    }
    if (inReport && /^We (?:have )?served as the Company'?s auditor/i.test(para)) inReport = false;
  }
  // The quote: the auditor's own words, else a short sentence that says "raise".
  const pick = (list) => list.find((x) => x.inReport) ?? list.find((x) => /\brais/i.test(x.s) && x.s.length <= 400) ?? list.find((x) => x.s.length <= 400) ?? list[0];
  // A report that says its plans do not alleviate the doubt has not lifted it, whatever else it says.
  const lifted = found.alleviated.length && !found.raised.some((x) => NOT_ALLEVIATED.test(x.s.replace(/[’‘]/g, "'")));
  const [status, list] = lifted ? ["doubt alleviated", found.alleviated] : found.raised.length ? ["doubt raised", found.raised] : found.no_doubt.length ? ["no substantial doubt", found.no_doubt] : found.mention.length ? ["mentioned only", found.mention] : ["not mentioned", []];
  const best = list.length ? (status === "doubt raised" ? pick(list) : list.find((x) => x.s.length <= 400) ?? list[0]) : null;
  return { status, quote: best ? clip(best.s) : null, said_in: best ? (best.inReport ? "auditor's report" : "company's text") : null, auditor_report: found.raised.some((x) => x.inReport) };
}

// A filing's status from the documents the search found in it, its main document first.
async function filingDoubt(session, cik, acc, docs, sources, filer = null) {
  let best = { status: "not mentioned", quote: null, said_in: null, url: null };
  const rank = { "doubt alleviated": 4, "doubt raised": 3, "no substantial doubt": 2, "mentioned only": 1, "not mentioned": 0 };
  for (const file of docs.slice(0, 3)) {
    const url = `${archiveBase(cik, acc)}/${file}`;
    let r;
    try { r = goingConcernIn(await readText(session, url), filer); } catch (err) { if (err instanceof NotFound) continue; throw err; }
    sources.push(url);
    if (rank[r.status] > rank[best.status] || (r.status === best.status && r.auditor_report && best.said_in !== "auditor's report")) best = { ...r, url };
    if (best.status === "doubt raised" && best.said_in === "auditor's report") break;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Auditor changes: Form 8-K Item 4.01
// ---------------------------------------------------------------------------------------------

// The text under Item 4.01, to the next item or the signatures. Its title tells the heading from a mention
// ("Item 4.01 of the Original Form 8-K").
export function item401(text) {
  const t = String(text);
  const titled = [...t.matchAll(/Item\s*4\.01\.?\s*[-–—:]?\s*Changes?\s+in\s+(?:the\s+)?Registrant['’]?s\s+Certifying\s+Accountants?\.?/gi)];
  let at = titled.length ? titled.at(-1).index : t.search(/(?:^|\n)[ \t]*Item\s*4\.01(?![\d(])/i);
  if (at < 0) at = t.search(/Item\s*4\.01(?![\d(])/i);
  if (at < 0) return null;
  const rest = t.slice(at);
  const end = rest.slice(12).search(/(?:^|\n)[ \t]*(?:Item\s*\d\.\d{2}(?![\d(])|SIGNATURES?\b)/i);
  return end >= 0 ? rest.slice(0, end + 12) : rest.slice(0, 20000);
}

// An accounting firm's name as written: capitalised words, "&", commas and its legal form.
const WORD = "(?:[A-Z][\\w&'’+.\\-]*|&|and|of|de)";
const FIRM = `(?<![\\w&])(?!(?:On|In|As|By|At|For|During|Effective|The|Our|Its|Their|Such|This|That|These|Each|Both|Neither|Also|Accordingly|Following|Prior|January|February|March|April|May|June|July|August|September|October|November|December|Company|Registrant|Board|Audit\\s+Committee|Committee|Item|Form|Regulation|Exhibit|Section|Rule|PCAOB|SEC|Securities|Commission)\\b)[A-Z][\\w&'’+.\\-]*(?:,?\\s+${WORD}){0,8}`;
const SUFFIX = /\b(?:L\.?L\.?P|L\.?L\.?C|P\.?L\.?L\.?C|P\.?C|P\.?A|PAC|PLT|CPAs?|Ltd|Limited|LLP|Chartered|Accountants?|Accounting|Assurance|Audit(?!\s+Committee)|Partners|Associates|N\.?V|GmbH|AG|S\.?A|Co|Company|KPMG|Deloitte|PricewaterhouseCoopers|PwC|Ernst|EY|BDO|Grant Thornton|RSM|Crowe|Marcum|Withum|WithumSmith|Mazars|Forvis|CBIZ|UHY|Moss Adams|Baker Tilly|MaloneBailey|Weinberg|Haskell|Cherry Bekaert|Plante|Eide Bailly|Wipfli)\b\.?/;
const NOT_A_FIRM = /^(?:the\s+)?(?:Company|Registrant|Board(?: of Directors)?|Audit Committee|Committee|Securities and Exchange Commission|Commission|Exhibit|Item|Form|Regulation S-K|Current Report|Original(?: Form 8-K| Report)?|Amendment|Report)$/i;
const tidyFirm = (s) => String(s).replace(/^(?:the|our|its)\s+/i, "").replace(/['’]s$/, "").replace(/,\s*$/, "").replace(/(?<![A-Z]\.[A-Z]|\b(?:Co|Inc|Ltd|Corp|L\.L\.C|L\.L\.P|P\.C|P\.A|N\.V|S\.A))\.$/, "").replace(/\s+(?:and|of|de|&)$/i, "").trim();

// Firms the section defines a short name for: Marcum LLP ("Marcum").
function definitions(section, filer) {
  const out = new Map();
  for (const m of section.matchAll(new RegExp(`(${FIRM})\\s*(?:\\((?:formerly|f/k/a|now)[^)]*\\)\\s*)?\\((?:the\\s+)?["“]([^"”]{1,40})["”]\\)`, "g"))) {
    const full = tidyFirm(m[1]), short = m[2].trim();
    if (NOT_A_FIRM.test(short) || NOT_A_FIRM.test(full) || (filer && sameName(full, filer))) continue;
    if (!SUFFIX.test(full) && !/accountant|auditor|firm/i.test(section.slice(m.index + m[0].length, m.index + m[0].length + 120))) continue;
    out.set(short.toLowerCase(), full);
  }
  return out;
}
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9& ]+/g, " ").split(/\s+/).filter((w) => w && !["inc", "corp", "corporation", "co", "company", "ltd", "the", "llc", "lp"].includes(w)).join(" ");
const sameName = (a, b) => { const x = words(a), y = words(b); return Boolean(x && y && (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `))); };

// What an Item 4.01 section says: the firm that left and how, the firm engaged, and the statements Item 304
// of Regulation S-K requires on disagreements and reportable events. Nothing is inferred beyond the words.
export function auditorChangeIn(section, filer = null, whole = null) {
  const text = String(section ?? "").replace(/\s+/g, " ").replace(/[’]/g, "'");
  // A short name can be defined before the item (an amendment's explanatory note), so the whole filing is read for them.
  const defs = definitions(String(whole ?? section ?? "").replace(/\s+/g, " ").replace(/[’]/g, "'"), filer);
  const full = (name) => { const t = tidyFirm(name); return defs.get(t.toLowerCase()) ?? t; };
  const named = new Set([...defs.values()].map((v) => v.toLowerCase()));
  const isFirm = (name) => { const t = tidyFirm(name); return t.length >= 2 && !NOT_A_FIRM.test(t) && !/\b(?:Independent|Registered|Certifying|New|Former|Predecessor|Successor|Previous|Prior)\b/.test(t) && !(filer && sameName(t, filer)) && (defs.has(t.toLowerCase()) || named.has(t.toLowerCase()) || SUFFIX.test(t)); };
  const sentences = paragraphs(String(section ?? "").replace(/[’]/g, "'")).flatMap(sentencesIn);
  const firstWith = (re) => sentences.find((s) => re.test(s)) ?? null;
  const P = `(?:\\s*\\([^)]{0,120}\\))*`;
  const formers = [];
  const add = (name, how, at) => { if (isFirm(name)) formers.push({ name: full(name), how, at }); };
  for (const m of text.matchAll(new RegExp(`\\bdismiss(?:ed|al of|ing)?\\s+(?:of\\s+)?(${FIRM})`, "g"))) add(m[1], "dismissed", m.index);
  for (const m of text.matchAll(new RegExp(`(${FIRM})${P}\\s+(?:was|were|has been)\\s+(?:dismissed|notified of (?:its|their) dismissal)`, "g"))) add(m[1], "dismissed", m.index);
  for (const m of text.matchAll(new RegExp(`(${FIRM})${P}\\s+(?:has\\s+|had\\s+)?(resigned|tendered (?:its|their) resignation|notified|informed|advised)([\\s\\S]{0,220})`, "g"))) {
    if (/^(?:resigned|tendered)/.test(m[2]) || /\bresign/i.test(m[3])) add(m[1], "resigned", m.index);
    else if (/declin\w* to stand|not to stand|not stand for re-?(?:election|appointment)|not seek re-?(?:election|appointment)/i.test(m[3])) add(m[1], "declined to stand for re-appointment", m.index);
  }
  for (const m of text.matchAll(new RegExp(`(${FIRM})${P}\\s+(?:declined|will not stand|would not stand|decided not to stand)`, "g"))) add(m[1], "declined to stand for re-appointment", m.index);
  for (const m of text.matchAll(new RegExp(`\\bresignation of\\s+(${FIRM})`, "g"))) add(m[1], "resigned", m.index);
  for (const m of text.matchAll(new RegExp(`\\b(?:succeed(?:s|ed|ing)?|successor to|replac(?:e|es|ed|ing))\\s+(${FIRM})`, "g"))) add(m[1], null, m.index);
  const changeTo = new RegExp(`\\b(?:chang\\w*|transition\\w*)\\b[^.]{0,160}?\\bfrom\\s+(${FIRM})${P}\\s+to\\s+(${FIRM})`).exec(text);
  if (changeTo) add(changeTo[1], null, changeTo.index);
  // A heading says which: "(a) Dismissal of Independent Registered Public Accounting Firm".
  const head = /\b(Resignation|Dismissal|Termination)\s+of\s+(?:the\s+)?(?:Previous|Prior|Former|Predecessor|Current)?\s*(?:Independent|Registered|Certifying)/.exec(text)?.[1] ?? null;
  const wanted = head === "Resignation" ? "resigned" : head ? "dismissed" : null;
  formers.sort((x, y) => x.at - y.at);
  const former = (wanted && formers.find((f) => f.how === wanted)) || formers.find((f) => f.how) || formers[0] || null;
  let how = former?.how ?? wanted;
  if (former && !how) {
    const about = sentences.filter((s) => s.includes(former.name) || [...defs].some(([k, v]) => v === former.name && s.toLowerCase().includes(k)));
    how = about.some((s) => /\bresign/i.test(s)) ? "resigned" : about.some((s) => /\bdismiss/i.test(s)) ? "dismissed" : null;
  }
  // The firm engaged: the first named after an engagement that is not the one leaving.
  let engaged = null;
  const newRes = [new RegExp(`\\b(?:engag(?:ed|ing|ement of)|appoint(?:ed|ing|ment of)|retain(?:ed|ing)|retention of|select(?:ed|ing|ion of))\\s+(?:of\\s+)?(${FIRM})`, "g"), new RegExp(`(${FIRM})${P}\\s+(?:was|has been|had been)\\s+(?:engaged|appointed|selected|retained)`, "g")];
  const candidates = [];
  for (const re of newRes) for (const m of text.matchAll(re)) if (isFirm(m[1])) candidates.push({ name: full(m[1]), at: m.index });
  if (changeTo && isFirm(changeTo[2])) candidates.push({ name: full(changeTo[2]), at: changeTo.index });
  candidates.sort((x, y) => x.at - y.at);
  engaged = candidates.find((c) => !former || !sameName(c.name, former.name))?.name ?? null;
  const shortOf = (name) => [...defs].filter(([, v]) => v === name).map(([k]) => k);
  const mentions = (s, name) => name && (s.includes(name) || shortOf(name).some((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(s)));
  const changeQuote = former ? sentences.find((s) => mentions(s, former.name) && /resign|dismiss|declin|not to stand|chang|transition|succeed|replac/i.test(s)) : null;
  const newQuote = engaged ? sentences.find((s) => mentions(s, engaged) && /engag|appoint|retain|select/i.test(s)) : firstWith(/has not (?:yet )?engaged|not yet (?:engaged|appointed)|in the process of (?:engaging|selecting|identifying)|search for a (?:new|successor)/i);
  // Item 304(a)(1)(iv) and (v): "there were no disagreements"; "except for the material weakness ... no reportable events".
  // One sentence often states both ("(i) no disagreements ... and (ii) no reportable events, except ..."): an
  // exception belongs to the topic it follows.
  const stated = (topic, other) => {
    // The new auditor's paragraph ("neither the Company nor anyone on its behalf consulted ... a disagreement") is not about the one leaving.
    const all = sentences.filter((s) => topic.test(s) && !/\bconsult/i.test(s));
    if (!all.length) return { value: null, quote: null };
    const own = (s) => { const i = s.search(topic), j = s.slice(i + 1).search(other); return j >= 0 ? s.slice(i, i + 1 + j) : s.slice(i); };
    const except = all.find((s) => /\b(?:except|other than|excluding|with the exception of)\b/i.test(own(s)));
    if (except) return { value: "reported", quote: clipAt(except, /\b(?:except|other than|excluding|with the exception of)\b/i) };
    const none = all.find((s) => /\b(?:no|not had any|without any)\b[^.;]{0,40}["“(]?\s*(?:such\s+)?(?:disagreements?|reportable events?)/i.test(s) || /\bthere (?:were|have been|was|has been) no\b/i.test(s));
    return none ? { value: "none", quote: null } : { value: "reported", quote: clip(all[0]) };
  };
  const disagreements = stated(/\bdisagreements?\b/i, /\breportable events?\b/i);
  const reportable = stated(/\breportable events?\b/i, /\bdisagreements?\b/i);
  const gcSentence = sentences.find((s) => /going concern/i.test(s) && /\b(?:except|explanatory|included|contained|emphasis|raised|substantial doubt)\b/i.test(s) && !/\b(?:did not|does not) (?:contain|include)[^.;]{0,80}going concern/i.test(s));
  return {
    former: former?.name ?? null, how, engaged,
    disagreements: disagreements.value, reportable_events: reportable.value,
    going_concern_paragraph: gcSentence ? "stated" : null,
    quote: changeQuote ? clip(changeQuote) : sentences.length ? clip(sentences.find((s) => s.length >= 40 && /accountant|accounting firm|auditor/i.test(s) && !/^(?:Item\s*4\.01|Changes? in (?:the )?Registrant)/i.test(s)) ?? sentences.find((s) => s.length >= 40) ?? sentences[0]) : null,
    new_quote: newQuote ? clip(newQuote) : null,
    disclosed: [disagreements.value === "reported" ? disagreements.quote : null, reportable.value === "reported" && reportable.quote !== disagreements.quote ? reportable.quote : null, gcSentence ? clipAt(gcSentence, /\bexcept\b|explanatory paragraph|going concern/i) : null].filter(Boolean),
  };
}

async function auditorChanges(session, filingsFound, limit, sources) {
  const rows = [];
  for (const f of [...filingsFound.values()].sort((x, y) => String(y.filed).localeCompare(String(x.filed)) || y.acc.localeCompare(x.acc)).slice(0, limit)) {
    let file = /^8-K/.test(f.type) ? f.file : null;
    if (!file) file = (await filingDocuments(session, f.cik, f.acc).catch(() => [])).find((d) => /^8-K/.test(d.type ?? ""))?.name ?? f.file;
    const url = `${archiveBase(f.cik, f.acc)}/${file}`;
    let c = null;
    try { const text = await readText(session, url); c = auditorChangeIn(item401(text), f.name, text); sources.push(url); } catch (err) { if (!(err instanceof NotFound)) throw err; }
    const letter = f.letter ? `${archiveBase(f.cik, f.acc)}/${f.letter}` : null;
    rows.push([f.filed, f.period, f.name, f.ticker, f.cik, f.form, c?.former ?? null, c?.how ?? null, c?.engaged ?? null, c?.disagreements ?? null, c?.reportable_events ?? null, c?.going_concern_paragraph ?? null, c?.quote ?? null, c?.new_quote ?? null, c?.disclosed ?? [], letter, f.acc, url]);
  }
  return rows;
}
const CHANGE_COLUMNS = ["filed", "event_date", "company", "ticker", "cik", "form", "former_auditor", "how", "new_auditor", "disagreements", "reportable_events", "prior_going_concern_paragraph", "quote", "new_auditor_quote", "disclosed", "former_auditor_letter", "accession", "url"];
const CHANGE_NOTE = "From each 8-K's Item 4.01 in the filing's words. how is resigned, dismissed or declined to stand for re-appointment only when the filing says so (null when it does not); no reason is inferred. disagreements and reportable_events are none when the filing states there were none (Item 304 of Regulation S-K), reported when it describes one (quoted in disclosed). prior_going_concern_paragraph is stated when the filing says the former auditor's report carried a going-concern paragraph. former_auditor_letter is its letter to the SEC (exhibit 16), when the search found it.";

// 8-K Item 4.01 filings in the search hits, one per filing, the former auditor's letter (EX-16) noted.
function changeFilings(hits) {
  const out = new Map();
  for (const h of hits.filter((x) => x.items.includes("4.01"))) {
    const f = out.get(h.acc) ?? out.set(h.acc, { ...h, letter: null }).get(h.acc);
    if (/^EX-16/i.test(h.type)) f.letter = h.file;
    if (/^8-K/.test(h.type) && !/^8-K/.test(f.type)) Object.assign(f, { file: h.file, type: h.type });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Critical audit matters
// ---------------------------------------------------------------------------------------------

const PAGE_LINE = /^(?:PART\s+[IVX]+|Item\s+\d+[A-Z]?\.?|F-\d+|\d{1,3}|Table of Contents|Index)$/i;
const CAM_BODY = /^(?:Description of the Matter|Critical Audit Matter Description|As (?:more fully |further )?(?:described|discussed|disclosed|explained|noted|referenced) in|Refer to|Why (?:the|we)|How (?:we|the critical))/i;

// The matters an auditor's report names, each with the sentence that says why (or the first that describes it).
export function criticalAuditMatters(text) {
  const t = String(text);
  const intro = t.search(/critical audit matters?\s+(?:communicated|described|is|are)\b[^\n]{0,80}\b(?:below|matters? arising)|critical audit matters are matters arising/i);
  if (intro < 0) return null;
  const tail = t.slice(intro);
  const endAt = tail.search(/\n\s*\/s\/|\nWe have served as/i);
  const region = endAt > 0 ? tail.slice(0, endAt) : tail.slice(0, 30000);
  const signature = /\/s\/\s*([^\n]{3,90})/.exec(tail.slice(Math.max(0, endAt), Math.max(0, endAt) + 400))?.[1]?.replace(/\s*\|.*$/, "").trim() ?? null;
  const since = /We have served as the Company'?s auditors? since (\d{4})/i.exec(tail.slice(0, Math.max(0, endAt) + 1200))?.[1] ?? null;
  if (/\b(?:there (?:are|were) no|we determined that there are no|did not identify any)\s+critical audit matters\b/i.test(region.slice(0, 2500))) return { none: true, matters: [], auditor: signature, since };
  const lines = region.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && !PAGE_LINE.test(l));
  // A matter's title is a short line of its own, followed by its description ("Description of the Matter",
  // "As described in Note 8"), or ending "- Refer to Note 1 to the financial statements".
  const titles = [];
  for (let i = 1; i < lines.length; i += 1) {
    const l = lines[i], refers = /^(.{3,160}?)\s*[-–—]+\s*Refer(?:ence)? to Notes?\b/i.exec(l);
    const title = refers ? refers[1] : l.length <= 160 && /^[A-Z]/.test(l) && !/[.:;,]$/.test(l) && !/\|/.test(l) && !CAM_BODY.test(l) && !/^(?:Critical Audit Matters?|Basis for Opinion|Opinion)\b/i.test(l) && CAM_BODY.test(lines[i + 1] ?? "") ? l : null;
    if (title) titles.push({ i, title: title.trim(), refers: Boolean(refers) });
  }
  const matters = [];
  titles.forEach(({ i, title, refers }, k) => {
    const body = lines.slice(i + 1, titles[k + 1]?.i ?? i + 40).join(" ");
    const why = sentencesIn(body).find((s) => /\bcritical audit matter\b/i.test(s) && /\b(?:identified|determin|principal considerations?)\b/i.test(s)) ?? sentencesIn(body.replace(/^(?:Description of the Matter|Critical Audit Matter Description)\s*/i, "")).find((s) => s.length > 40);
    const note = /\bNotes?\s+(\d+[A-Z]?(?:(?:,\s*|\s+and\s+)\d+[A-Z]?)*)/.exec(refers ? lines[i] : body.slice(0, 300))?.[1] ?? null;
    if (!matters.some((m) => m.matter === title)) matters.push({ matter: title, notes: note, quote: why ? clip(why) : null });
  });
  return { none: false, matters, auditor: signature, since };
}

// ---------------------------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------------------------

const PERIODIC = /^10-[KQ](?:\/A)?$/;
const LIMITS = [
  "Not investment advice.",
  "Read from the filings' own words: text matching can miss unusual wording or a statement split across sentences, and a filing whose text EDGAR's full-text search has not indexed is not found.",
  "A going-concern note is the company's and its auditor's judgment that it may not meet its obligations for a year after the statements are issued, not a prediction that it will fail.",
];

export async function auditSignals(session, args) {
  const a = auditInput.parse(args);
  const signal = a.signal ?? (a.company ? "all" : "going_concern");
  const want = (s) => signal === "all" || signal === s;
  const sources = [], searches = [];
  if (!a.company) {
    if (signal === "critical_audit_matters") throw new Error("Critical audit matters are read from one company's 10-K: pass a company.");
    return marketSignals(session, a, want, sources, searches);
  }
  const limit = a.limit ?? 12;
  const e = await resolveEntity(session, a.company);
  const { sub, rows } = await filings(session, e.cik, { since: isoDay(session.now() - (limit * 100 + 400) * DAY) });
  const company = { cik: e.cik, name: sub.name ?? e.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null };
  const out = { company };
  const counts = {};
  const say = [];

  if (want("going_concern")) {
    const found = await search(session, { q: GC_Q, forms: "10-K,10-Q", cik: e.cik });
    searches.push(found.url);
    const hits = byFiling(found.hits, /^10-[KQ]/);
    // Amendments count only when they say something on it: most restate a part (Part III) and say nothing.
    const reports = rows.filter((r) => PERIODIC.test(r.form) && (!/\/A$/.test(r.form) || hits.has(r.accessionNumber))).slice(0, limit);
    const all = rows.filter((r) => PERIODIC.test(r.form) && !/\/A$/.test(r.form)).length;
    const timeline = [];
    for (const r of [...reports].reverse()) {
      const h = hits.get(r.accessionNumber);
      const doc = h ? await filingDoubt(session, e.cik, r.accessionNumber, h.docs, sources, company.name) : { status: "not mentioned", quote: null, said_in: null, url: null };
      timeline.push({ r, ...doc, url: doc.url ?? `${archiveBase(e.cik, r.accessionNumber)}/${r.primaryDocument}` });
    }
    let prev;
    for (const x of timeline) {
      const raised = x.status === "doubt raised";
      x.change = raised ? (prev === "doubt raised" ? "still raised" : prev !== undefined || all <= limit ? "first raised" : "raised (earlier reports not read)") : prev === "doubt raised" ? "lifted" : null;
      prev = x.status;
    }
    timeline.reverse();
    out.going_concern = {
      columns: ["period", "form", "filed", "status", "change", "said_in", "quote", "accession", "url"],
      rows: timeline.map((x) => [x.r.reportDate, x.r.form, x.r.filingDate, x.status, x.change, x.said_in, x.quote, x.r.accessionNumber, x.url]),
      note: "Newest first. status is what the report's own words say: doubt raised (conditions raise substantial doubt about the company's ability to continue as a going concern), doubt alleviated (the company says management's plans alleviated it), no substantial doubt, mentioned only (a policy, a risk that might come) or not mentioned (the two phrases are not both in any of its documents). change is first raised, still raised or lifted against the report before it. said_in is auditor's report when the auditor's own report states it.",
    };
    const raised = timeline.filter((x) => x.status === "doubt raised");
    const lifted = timeline.find((x) => x.change === "lifted");
    counts.reports_read = timeline.length;
    counts.reports_with_doubt = raised.length;
    const latest = timeline[0];
    // The run of reports raising it that ends with the latest: where it began.
    let run = 0;
    while (timeline[run]?.status === "doubt raised") run += 1;
    const began = timeline[run - 1];
    if (!latest) say.push("it has filed no 10-K or 10-Q");
    else if (run) say.push(`its latest report (${latest.r.form} filed ${latest.r.filingDate}) says there is substantial doubt about its ability to continue as a going concern, ${began.change === "first raised" ? `first raised in the ${began.r.form} filed ${began.r.filingDate}` : `as has every report read since the ${began.r.form} filed ${began.r.filingDate}`}`);
    else if (latest.status === "doubt alleviated") say.push(`its latest report (${latest.r.form} filed ${latest.r.filingDate}) says the substantial doubt about its ability to continue as a going concern was alleviated${lifted ? `; the doubt was lifted in the ${lifted.r.form} filed ${lifted.r.filingDate}` : ""}`);
    else if (lifted) say.push(`the going-concern doubt it raised was lifted in its ${lifted.r.form} filed ${lifted.r.filingDate}${lifted.status === "doubt alleviated" ? ", which says it was alleviated" : ""}`);
    else {
      const eased = timeline.find((x) => x.status === "doubt alleviated");
      say.push(`${raised.length ? `${raised.length} of its last ${timeline.length} reports raised a going-concern doubt, not its latest` : `none of its last ${timeline.length} reports raises a going-concern doubt`}${eased ? `; its ${eased.r.form} filed ${eased.r.filingDate} says the doubt was alleviated` : ""}`);
    }
  }

  if (want("auditor_change")) {
    const found = await search(session, { q: "\"Item 4.01\"", forms: "8-K", cik: e.cik });
    searches.push(found.url);
    const changes = changeFilings(found.hits);
    const rowsOut = await auditorChanges(session, changes, limit, sources);
    out.auditor_changes = { columns: CHANGE_COLUMNS, rows: rowsOut, note: `Newest first, every 8-K since 2001 that EDGAR lists with Item 4.01 (8-K/A amendments included). ${CHANGE_NOTE}` };
    counts.auditor_change_filings = changes.size;
    const last = rowsOut[0];
    say.push(last ? `its latest auditor change was filed ${last[0]}${last[6] ? `: ${last[6]}${last[7] ? ` ${last[7]}` : " left"}` : ""}${last[8] ? `, ${last[8]} engaged` : ""}` : "it has filed no auditor change (8-K Item 4.01) since 2001");
  }

  if (want("critical_audit_matters")) {
    const tenK = rows.find((r) => r.form === "10-K");
    if (!tenK) out.critical_audit_matters = { matters: null, note: "No 10-K among the filings read." };
    else {
      const url = `${archiveBase(e.cik, tenK.accessionNumber)}/${tenK.primaryDocument}`;
      let cams = criticalAuditMatters(await readText(session, url));
      let at = url;
      // The auditor's report can sit in an exhibit (the annual report to shareholders, EX-13).
      if (!cams) {
        const found = await search(session, { q: "\"critical audit matter\"", forms: "10-K", cik: e.cik, from: tenK.filingDate, to: tenK.filingDate }, 1);
        searches.push(found.url);
        for (const h of found.hits.filter((x) => x.acc === tenK.accessionNumber && x.file !== tenK.primaryDocument).slice(0, 2)) {
          const u = `${archiveBase(e.cik, h.acc)}/${h.file}`;
          cams = criticalAuditMatters(await readText(session, u));
          if (cams) { at = u; break; }
        }
      }
      sources.push(at);
      out.critical_audit_matters = {
        filing: { form: tenK.form, filed: tenK.filingDate, period: tenK.reportDate, accession: tenK.accessionNumber, url: at },
        auditor: cams?.auditor ?? null, auditor_since: cams?.since ? Number(cams.since) : null,
        columns: ["matter", "notes", "quote"],
        rows: cams ? cams.matters.map((m) => [m.matter, m.notes, m.quote]) : [],
        note: cams?.none ? "The auditor's report states there are no critical audit matters." : !cams ? "No critical audit matters section was found in the 10-K: emerging growth companies, and audits before 2019 to 2020, have none." : "Each matter as titled in the auditor's report, the financial statement notes it refers to, and the sentence that says why it is a critical audit matter (or the first that describes it).",
      };
      counts.critical_audit_matters = cams?.matters?.length ?? 0;
      if (cams?.matters?.length) say.push(`its auditor's report on the ${tenK.form} filed ${tenK.filingDate} names ${cams.matters.length} critical audit matter${cams.matters.length > 1 ? "s" : ""} (${cams.matters.map((m) => m.matter).join("; ")})`);
      else if (cams?.none) say.push(`its auditor's report on the ${tenK.form} filed ${tenK.filingDate} states there are no critical audit matters`);
    }
  }

  return {
    ...out,
    counts,
    reading: `${company.name}: ${say.join("; ")}.`,
    source: searches[0] ?? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${e.cik}`,
    sources: [...new Set([...searches, ...sources])],
    limits: LIMITS,
  };
}

// Across the market: companies whose latest 10-K or 10-Q newly raised a going-concern doubt, and the window's
// auditor changes. Search hits come by relevance, so they are read in windows, newest first.
async function marketSignals(session, a, want, sources, searches) {
  const days = a.days ?? 30, limit = a.limit ?? 10;
  const to = isoDay(session.now()), from = isoDay(session.now() - days * DAY);
  const out = { window: { from, to, days } };
  const counts = {};
  const say = [];

  if (want("going_concern")) {
    const first = await search(session, { q: GC_Q, forms: "10-K,10-Q", from, to }, 1);
    searches.push(first.url);
    counts.documents_found = first.total;
    // Up to 300 hits are read for the whole window; above that, three days at a time from the newest.
    const windows = [];
    if (first.total <= 300) windows.push({ from, to, hits: first.total <= 100 ? first.hits : null });
    else for (let end = session.now(); isoDay(end) >= from; end -= 3 * DAY) windows.push({ from: isoDay(Math.max(end - 2 * DAY, Date.parse(from))), to: isoDay(end), hits: null });
    const checks = Math.min(100, Math.max(30, limit * 6));
    const seen = new Set();
    const tally = { companies_checked: 0, newly_raised: 0, previous_report_names_it: 0, first_report: 0, newer_report_without_doubt: 0, not_raised_in_text: 0 };
    const found = [];
    // The report before is looked for among each company's documents that name both phrases in the 400 days
    // before the window: one search for forty companies, no document read.
    const priorFrom = isoDay(Date.parse(from) - 400 * DAY);
    const full = () => found.length >= limit || tally.companies_checked >= checks;
    for (const w of windows) {
      if (full()) break;
      let hits = w.hits;
      if (!hits) { const r = await search(session, { q: GC_Q, forms: "10-K,10-Q", from: w.from, to: w.to }, 5); hits = r.hits; if (w.from !== from || w.to !== to) searches.push(r.url); }
      const list = [...byFiling(hits.filter((h) => /^10-[KQ]$/.test(h.form ?? "")), /^10-[KQ]/).values()].sort((x, y) => String(y.filed).localeCompare(String(x.filed)) || y.acc.localeCompare(x.acc)).filter((f) => !seen.has(f.cik) && seen.add(f.cik));
      for (let g = 0; g < list.length && !full(); g += 40) {
        const group = list.slice(g, g + 40);
        const prior = await search(session, { q: GC_Q, forms: "10-K,10-Q", cik: group.map((f) => f.cik), from: priorFrom, to }, 10);
        searches.push(prior.url);
        const named = new Set(prior.hits.map((h) => h.acc));
        for (const f of group) {
          if (full()) break;
          tally.companies_checked += 1;
          const { rows } = await filings(session, f.cik);
          const i = rows.findIndex((r) => r.accessionNumber === f.acc);
          if (rows.slice(0, Math.max(0, i)).some((r) => PERIODIC.test(r.form) && !/\/A$/.test(r.form))) { tally.newer_report_without_doubt += 1; continue; }
          const before = i < 0 ? null : rows.slice(i + 1).find((r) => PERIODIC.test(r.form) && !/\/A$/.test(r.form) && r.filingDate <= f.filed);
          if (!before) { tally.first_report += 1; continue; }
          let names = named.has(before.accessionNumber);
          if (!names && before.filingDate < priorFrom) {
            const r = await search(session, { q: GC_Q, forms: "10-K,10-Q", cik: f.cik, from: before.filingDate, to: before.filingDate }, 1);
            names = r.hits.some((h) => h.acc === before.accessionNumber);
          }
          if (names) { tally.previous_report_names_it += 1; continue; }
          const now = await filingDoubt(session, f.cik, f.acc, f.docs, sources, f.name);
          if (now.status !== "doubt raised") { tally.not_raised_in_text += 1; continue; }
          tally.newly_raised += 1;
          found.push([f.filed, f.name, f.ticker, f.cik, f.form, f.period, now.quote, now.said_in, `${before.form} filed ${before.filingDate}`, `${archiveBase(f.cik, before.accessionNumber)}/${before.primaryDocument}`, f.acc, now.url]);
        }
      }
    }
    Object.assign(counts, tally, { companies_in_hits_read: seen.size });
    out.going_concern = {
      columns: ["filed", "company", "ticker", "cik", "form", "period", "quote", "said_in", "previous_report", "previous_url", "accession", "url"],
      rows: found,
      note: `Companies whose latest 10-K or 10-Q, filed ${from} to ${to}, says there is substantial doubt about their ability to continue as a going concern when no document of the report before it names both substantial doubt and going concern (EDGAR full-text search), newest first. Each new report is read and quoted; at most ${checks} companies a call, newest first. A company whose report before names both phrases is counted in previous_report_names_it without reading it. Amendments (10-K/A, 10-Q/A) are not counted.`,
    };
    say.push(`${found.length} compan${found.length === 1 ? "y's" : "ies'"} latest 10-K or 10-Q filed ${from} to ${to} newly raised a going-concern doubt, of ${tally.companies_checked} companies checked (EDGAR's search found ${first.total} documents naming both phrases)`);
  }

  if (want("auditor_change")) {
    const found = await search(session, { q: "\"Item 4.01\"", forms: "8-K", from, to });
    searches.push(found.url);
    const changes = changeFilings(found.hits);
    const rowsOut = await auditorChanges(session, changes, limit, sources);
    out.auditor_changes = { columns: CHANGE_COLUMNS, rows: rowsOut, note: `Newest first, the 8-Ks filed ${from} to ${to} that EDGAR lists with Item 4.01 (8-K/A amendments included). ${CHANGE_NOTE}` };
    Object.assign(counts, { auditor_change_filings: changes.size, auditor_changes_read: rowsOut.length });
    const resigned = rowsOut.filter((r) => r[7] === "resigned").length, dismissed = rowsOut.filter((r) => r[7] === "dismissed").length;
    say.push(`${changes.size} auditor-change filings (8-K Item 4.01) were filed ${from} to ${to}${rowsOut.length ? `; of the ${rowsOut.length} read, ${resigned} say the auditor resigned and ${dismissed} that it was dismissed` : ""}`);
  }

  return {
    ...out,
    counts,
    reading: `Across the market: ${say.join("; ")}.`,
    source: searches[0],
    sources: [...new Set([...searches, ...sources])],
    limits: LIMITS,
  };
}
