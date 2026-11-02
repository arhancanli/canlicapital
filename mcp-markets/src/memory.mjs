// filing_memory: everything one company has said about a subject, across every annual report it has
// on EDGAR, with how often it said so each year and, if asked, how that moved with a margin.
//
// The reports are read once (the disk cache keeps them), split into paragraphs and ranked with BM25 on
// this machine: no key, no service, nothing to install. A company rarely uses the caller's wording, so
// the calling model supplies the other words for a subject (also, all_of); a local embedding model,
// when one is installed, can re-rank too (models.mjs). Nothing here is ever sent anywhere.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { decodeEntities, findSections, htmlToText } from "./html.mjs";
import { factBook } from "./listing.mjs";
import { embed, INSTALL_HINT, MODELS, modelsDir, modelsInstalled } from "./models.mjs";
import { annualValues } from "./research.mjs";
import { archiveBase, filingDocuments, filings, getJson, getText, NotFound, pad10, resolveEntity } from "./sources.mjs";

const FORMS = { "10-K": /^(10-K|10-K405|10-KSB|10-KT)$/, "20-F": /^20-F$/, "40-F": /^40-F$/ };
const MEASURES = {
  gross_margin: (m) => (m.revenue > 0 && m.gross_profit != null ? m.gross_profit / m.revenue : null),
  operating_margin: (m) => (m.revenue > 0 && m.operating_income != null ? m.operating_income / m.revenue : null),
  net_margin: (m) => (m.revenue > 0 && m.net_income != null ? m.net_income / m.revenue : null),
};

export const memoryInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, name or CIK."),
  query: z.string().min(1).max(300).describe("The subject in plain words, for example \"supply chain problems in Southeast Asia\". Quote a phrase to keep its words together."),
  also: z.array(z.string().min(1).max(80)).max(40).optional().describe("Other words a company might use for the same subject, which you supply, such as contract manufacturer, Vietnam, Thailand. They help the ranking."),
  all_of: z.array(z.array(z.string().min(1).max(80)).min(1).max(40)).min(1).max(5).optional().describe("What counts as a mention: a paragraph must hold at least one term from every group, such as [[\"supply chain\",\"supplier\"],[\"Southeast Asia\",\"Vietnam\",\"Thailand\"]]. Without it, a paragraph counts if it holds most of the query's words."),
  years: z.number().int().min(1).max(35).optional().describe("How many annual reports back; default 20."),
  form: z.enum(["10-K", "20-F", "40-F"]).optional().describe("Annual report form; default 10-K."),
  section: z.string().min(1).max(40).optional().describe("Only one part of each report: \"risk factors\", \"md&a\", \"business\" or an item number such as 1A."),
  limit: z.number().int().min(1).max(30).optional().describe("Passages to return; default 8."),
  per_year: z.number().int().min(1).max(10).optional().describe("Most passages from one report; default 2."),
  filed_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Only reports filed by this date."),
  correlate_with: z.enum(Object.keys(MEASURES)).optional().describe("Compare how often the subject comes up with this measure, year by year, from the company's XBRL (2009 on)."),
  semantic: z.boolean().optional().describe("Also rank by meaning with a local embedding model, if one is installed (canli-mcp models install). Helps when a company's words differ from yours and you have supplied no others. The first run over a company's reports takes minutes; later ones are quick."),
}).strict();

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------
const STOP = new Set("a an and are as at be been but by can could do does for from had has have if in into is it its may might more most no not of on or our other such than that the their them then there these they this those to under was we were which while will with would you your".split(" "));

export function stem(word) {
  const w = word.toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("sses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  return w;
}

const raw = (text) => String(text).toLowerCase().match(/[a-z][a-z0-9&'-]*|\d[\d.,]*%?/g) ?? [];
export const tokens = (text) => raw(text).filter((w) => !STOP.has(w)).map(stem);
// A paragraph as one string of stemmed words, so a phrase matches across plurals and endings.
const normal = (text) => ` ${raw(text).map(stem).join(" ")} `;
const hasTerm = (norm, term) => norm.includes(normal(term));

// ---------------------------------------------------------------------------------------------
// Paragraphs
// ---------------------------------------------------------------------------------------------
const MIN_WORDS = 14, MAX_CHARS = 1400;
// A table row or a stray heading is not something the company said: too few words, or mostly numbers.
const looksLikeProse = (s) => {
  const parts = s.split(/\s+/);
  if (parts.length < MIN_WORDS) return false;
  if (/\s\|\s/.test(s) && (s.match(/\s\|\s/g) ?? []).length * 3 > parts.length) return false;
  const numeric = parts.filter((w) => /^[$(]*[\d,.%)-]+$/.test(w)).length;
  return numeric / parts.length < 0.3;
};

function cut(text) {
  if (text.length <= MAX_CHARS) return [text];
  const out = [];
  let now = "";
  for (const sentence of text.split(/(?<=[.;:])\s+/)) {
    if (now && now.length + sentence.length > MAX_CHARS) { out.push(now); now = ""; }
    now = now ? `${now} ${sentence}` : sentence;
  }
  if (now) out.push(now);
  return out.map((p) => p.slice(0, MAX_CHARS * 2));
}

// Old filings wrap at about 70 characters, with a blank line between paragraphs, and read back as one
// paragraph per block; a modern filing is one paragraph per line.
export function paragraphsOf(text, form = "10-K") {
  const found = findSections(text, form);
  const starts = [...found.sections].sort((a, b) => a.line - b.line);
  const sectionAt = (line) => {
    let key = null;
    for (const s of starts) { if (s.line > line) break; if (line < s.end) key = s.key; }
    return key;
  };
  const lengths = found.lines.filter((l) => l.trim()).map((l) => l.length).sort((a, b) => a - b);
  const wrapped = lengths.length > 40 && lengths[Math.floor(lengths.length * 0.9)] < 100;
  const out = [];
  const push = (body, line) => { for (const p of cut(body.replace(/\s+/g, " ").trim())) if (looksLikeProse(p)) out.push({ section: sectionAt(line), text: p }); };
  if (wrapped) {
    let block = [], at = 0;
    found.lines.forEach((l, i) => {
      if (!l.trim()) { if (block.length) push(block.join(" "), at); block = []; return; }
      if (!block.length) at = i;
      block.push(l);
    });
    if (block.length) push(block.join(" "), at);
  } else {
    found.lines.forEach((l, i) => { if (l.length >= 60) push(l, i); });
  }
  return out;
}

// A filing made before about 2001 is one text file holding every document, each in a <DOCUMENT> block.
export function annualPartOf(submission) {
  const docs = [...String(submission).matchAll(/<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi)];
  if (!docs.length) return String(submission);
  const keep = docs.map((m) => m[1]).filter((d) => /<TYPE>\s*(10-K|20-F|40-F|EX-13)/i.test(d));
  return (keep.length ? keep : docs.map((m) => m[1])).map((d) => {
    const body = d.match(/<TEXT>([\s\S]*?)(?:<\/TEXT>|$)/i)?.[1] ?? d;
    return /<(?:html|p|div|table)\b/i.test(body) ? htmlToText(body) : decodeEntities(body.replace(/<\/?(?:page|c|s|table|caption|fn)\b[^>]*>/gi, ""));
  }).join("\n\n");
}

// ---------------------------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------------------------
export function buildIndex(paragraphs) {
  const posting = new Map();
  const lengths = new Float64Array(paragraphs.length);
  paragraphs.forEach((p, i) => {
    const tf = new Map();
    for (const t of tokens(p.text)) { tf.set(t, (tf.get(t) ?? 0) + 1); lengths[i] += 1; }
    for (const [t, n] of tf) { let list = posting.get(t); if (!list) posting.set(t, list = []); list.push(i, n); }
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  return { paragraphs, posting, lengths, average: paragraphs.length ? total / paragraphs.length : 0 };
}

const idf = (index, term) => {
  const n = (index.posting.get(term)?.length ?? 0) / 2;
  return n ? Math.log(1 + (index.paragraphs.length - n + 0.5) / (n + 0.5)) : 0;
};

// BM25. The asked words count in full and the supplied alternatives at a little over half, so a
// paragraph in the company's own words can rise without outranking one that says what was asked.
export function score(index, query, also = []) {
  const k1 = 1.2, b = 0.75;
  const scores = new Float64Array(index.paragraphs.length);
  const add = (term, weight) => {
    const list = index.posting.get(term);
    if (!list) return;
    const w = idf(index, term) * weight;
    for (let j = 0; j < list.length; j += 2) {
      const i = list[j], n = list[j + 1];
      scores[i] += w * (n * (k1 + 1)) / (n + k1 * (1 - b + b * index.lengths[i] / index.average));
    }
  };
  const asked = [...new Set(tokens(query.replace(/"/g, " ")))];
  for (const t of asked) add(t, 1);
  for (const t of new Set(also.flatMap(tokens))) if (!asked.includes(t)) add(t, 0.55);
  return scores;
}

// What counts as a mention. Spelled out, because the yearly counts are only as good as this rule.
export function mentionTest(index, query, allOf) {
  if (allOf) {
    const groups = allOf.map((g) => g.map((t) => t.replace(/"/g, "")));
    return (norm) => groups.every((g) => g.some((t) => hasTerm(norm, t)));
  }
  const phrases = [...query.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const asked = [...new Set(tokens(query.replace(/"[^"]+"/g, " ")))];
  const weights = asked.map((t) => [t, Math.max(idf(index, t), 0.01)]);
  const whole = weights.reduce((a, [, w]) => a + w, 0);
  return (norm) => {
    if (phrases.length && !phrases.every((p) => hasTerm(norm, p))) return false;
    if (!asked.length) return phrases.length > 0;
    const held = weights.reduce((a, [t, w]) => a + (norm.includes(` ${t} `) ? w : 0), 0);
    return held / whole >= 0.6;
  };
}

// Meaning, from a small model on this machine. Each report's vectors are one file of plain floats, read
// and scanned directly: at a few thousand paragraphs a company, no database would be any faster. Files
// are built newest report first, within a time budget, and the answer says how far it got.
const VECTORS = "v1";
async function semanticScores(session, reports, all, query, { budgetMs = 25000 } = {}) {
  if (!session.embedder && !modelsInstalled(session.env)) return { status: "not installed", how: INSTALL_HINT };
  const d = MODELS.embedding.dimensions, dir = join(modelsDir(session.env), "vectors", VECTORS);
  const began = session.now(), held = new Array(reports.length).fill(null);
  for (let i = 0; i < reports.length; i += 1) {
    const r = reports[i], file = join(dir, `${r.filing.accessionNumber}.f32`), bytes = r.paragraphs.length * d * 4;
    if (!session.embedder && existsSync(file) && statSync(file).size === bytes) {
      const b = readFileSync(file);
      held[i] = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    } else if (session.now() - began < budgetMs) {
      held[i] = await embed(session, r.paragraphs.map((p) => p.text));
      if (!session.embedder) { mkdirSync(dir, { recursive: true }); writeFileSync(file, Buffer.from(held[i].buffer)); }
    }
  }
  const q = await embed(session, [query.replace(/"/g, "")]);
  const scores = new Float64Array(all.length).fill(-1);
  all.forEach((p, n) => {
    const v = held[p.report];
    if (!v) return;
    let dot = 0;
    const at = p.at * d;
    for (let j = 0; j < d; j += 1) dot += q[j] * v[at + j];
    scores[n] = dot;
  });
  const ranked = held.filter(Boolean).length;
  return { status: ranked === reports.length ? "used" : "partly built", reports_ranked: ranked, of: reports.length, model: MODELS.embedding.id, scores, ...(ranked < reports.length ? { note: "Call again to build more, or run canli-mcp models index <company> to build them all." } : {}) };
}

// Two rankings into one, by position alone (reciprocal rank fusion), so neither score's scale matters.
export function fuse(words, meaning, k = 60) {
  const rank = (values) => { const order = [...values.keys()].filter((i) => values[i] > 0).sort((a, b) => values[b] - values[a]); const out = new Map(); order.forEach((i, r) => out.set(i, r)); return out; };
  const a = rank(words), b = rank(meaning), out = new Float64Array(words.length);
  for (let i = 0; i < words.length; i += 1) out[i] = (a.has(i) ? 1 / (k + a.get(i)) : 0) + (b.has(i) ? 1 / (k + b.get(i)) : 0);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The link to a measure
// ---------------------------------------------------------------------------------------------
const ranks = (xs) => {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    for (let k = i; k <= j; k += 1) out[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
};
const pearson = (a, b) => {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let up = 0, da = 0, db = 0;
  for (let i = 0; i < n; i += 1) { up += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? up / Math.sqrt(da * db) : null;
};
export const spearman = (a, b) => pearson(ranks(a), ranks(b));

// How often a shuffled order gives a link at least this strong in either direction. Seeded, so the
// same inputs give the same answer on any machine.
export function permutationP(a, b, { rounds = 5000, seed = 20261102 } = {}) {
  const ra = ranks(a), rb = ranks(b), seen = Math.abs(pearson(ra, rb) ?? 0);
  let x = seed >>> 0, hits = 0;
  const next = () => { x = (x + 0x6d2b79f5) >>> 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shuffled = rb.slice();
  for (let r = 0; r < rounds; r += 1) {
    for (let i = shuffled.length - 1; i > 0; i -= 1) { const j = Math.floor(next() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    if (Math.abs(pearson(ra, shuffled) ?? 0) >= seen - 1e-12) hits += 1;
  }
  return (hits + 1) / (rounds + 1);
}

const fix = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

// years: oldest first, each { period, per_10000 }. measure: Map(period end -> value).
export function linkToMeasure(years, measure, name) {
  const near = (period) => {
    if (!period) return null;
    const t = Date.parse(period);
    for (const [end, v] of measure) if (Math.abs(Date.parse(end) - t) <= 15 * 86400000 && v != null) return { end, v };
    return null;
  };
  const joined = years.map((y) => ({ ...y, m: near(y.period) })).filter((y) => y.m);
  const tests = [];
  const compare = (label, pairs) => {
    if (pairs.length < 6) { tests.push([label, pairs.length, null, null]); return; }
    const a = pairs.map((p) => p[0]), b = pairs.map((p) => p[1]);
    tests.push([label, pairs.length, fix(spearman(a, b)), fix(permutationP(a, b))]);
  };
  const steps = joined.slice(1).map((y, i) => ({ y, before: joined[i] }));
  compare(`change in mentions against the change in ${name} that year`, steps.map(({ y, before }) => [y.per_10000 - before.per_10000, y.m.v - before.m.v]));
  compare(`mentions one year against the change in ${name} the next`, steps.map(({ y, before }) => [before.per_10000, y.m.v - before.m.v]));
  const dips = steps.filter(({ y, before }) => before.m.v - y.m.v >= 0.01).map(({ y, before }) => [y.period, fix(before.m.v), fix(y.m.v), y.per_10000, before.per_10000]);
  return {
    measure: name,
    columns: ["compared", "pairs", "spearman", "permutation_p"], rows: tests,
    series: { columns: ["period_end", name, "mentions_per_10000_words"], rows: joined.map((y) => [y.period, fix(y.m.v), y.per_10000]) },
    dips: { columns: ["period_end", `${name}_year_before`, name, "mentions_per_10000_words", "mentions_per_10000_words_year_before"], rows: dips },
    meaning: "Changes are compared rather than levels, because two things that both drift over the years correlate without any link. permutation_p is how often a shuffled order gives a link at least this strong. A dip is a fall of at least one percentage point. Fewer than six pairs gets no figure.",
  };
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------
async function reportParagraphs(session, cik, filing, form) {
  session.memory ??= new Map();
  const key = `${filing.accessionNumber}|${form}`;
  if (session.memory.has(key)) return session.memory.get(key);
  const base = archiveBase(cik, filing.accessionNumber);
  const name = String(filing.primaryDocument ?? "").replace(/^xsl[^/]*\//, "");
  const url = name ? `${base}/${name}` : `${base}/${filing.accessionNumber}.txt`;
  const plain = !name || /\.txt$/i.test(name);
  let text = await getText(session, url, { maxBytes: 32 * 1024 * 1024, transform: (t) => (plain ? annualPartOf(t) : htmlToText(t)) });
  let read = url;
  // A short 10-K usually incorporates its annual report to shareholders, filed as Exhibit 13.
  if (!plain && text.split(/\s+/).length < 12000) {
    const docs = await filingDocuments(session, cik, filing.accessionNumber).catch(() => []);
    const thirteen = docs.find((d) => /^EX-13/i.test(d.type ?? "") && /\.(htm|html|txt)$/i.test(d.name));
    if (thirteen) {
      text += `\n${await getText(session, `${base}/${thirteen.name}`, { maxBytes: 24 * 1024 * 1024, transform: (t) => (/\.txt$/i.test(thirteen.name) ? t : htmlToText(t)) })}`;
      read = `${url} and ${thirteen.name}`;
    }
  }
  const out = { url, read, paragraphs: paragraphsOf(text, form), words: text.split(/\s+/).length };
  if (session.memory.size > 120) session.memory.delete(session.memory.keys().next().value);
  session.memory.set(key, out);
  return out;
}

async function pool(items, size, work) {
  const out = new Array(items.length);
  let at = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (at < items.length) { const i = at; at += 1; out[i] = await work(items[i], i); }
  }));
  return out;
}

const SECTION_NAMES = { "risk factors": "1A", risks: "1A", business: "1", "md&a": "7", mda: "7", "market risk": "7A", "legal proceedings": "3", properties: "2" };

export async function filingMemory(session, args) {
  const a = memoryInput.parse(args);
  const form = a.form ?? "10-K", want = a.years ?? 20, limit = a.limit ?? 8, perYear = a.per_year ?? 2;
  const entity = await resolveEntity(session, a.company);
  const { sub, rows } = await filings(session, entity.cik, { since: "1993-01-01" });
  const annual = rows.filter((r) => FORMS[form].test(r.form) && (!a.filed_before || r.filingDate <= a.filed_before)).slice(0, want);
  if (!annual.length) throw new NotFound(`${sub.name ?? a.company} has no ${form} on EDGAR. A foreign filer reports on 20-F or 40-F; try form.`);
  const notRead = [];
  const reports = (await pool(annual, 4, async (f) => {
    try {
      const r = await reportParagraphs(session, entity.cik, f, form);
      if (!r.paragraphs.length) { notRead.push({ filed: f.filingDate, url: r.url, why: "no prose found" }); return null; }
      return { filing: f, ...r };
    } catch (err) { notRead.push({ filed: f.filingDate, why: String(err?.message ?? err).slice(0, 120) }); return null; }
  })).filter(Boolean);
  if (!reports.length) throw new Error(`None of ${sub.name ?? a.company}'s ${form} reports could be read: ${notRead.map((n) => n.why).slice(0, 2).join("; ")}`);

  const only = a.section ? (SECTION_NAMES[a.section.toLowerCase()] ?? a.section.toUpperCase()) : null;
  const all = [];
  reports.forEach((r, report) => { r.paragraphs.forEach((p, at) => { if (!only || p.section === only) all.push({ ...p, report, at }); }); });
  if (!all.length) throw new NotFound(`No paragraphs in section "${a.section}" of these reports; leave section out to search each whole report.`);
  const index = buildIndex(all);
  const words = score(index, a.query, [...(a.also ?? []), ...(a.all_of ?? []).flat()]);
  const isMention = mentionTest(index, a.query, a.all_of);
  const meaning = a.semantic ? await semanticScores(session, reports, all, a.query) : null;
  const scores = meaning?.scores ? fuse(words, meaning.scores) : words;

  const counts = new Array(reports.length).fill(0);
  const hits = [];
  all.forEach((p, i) => {
    if (!scores[i]) return;
    const mention = isMention(normal(p.text));
    if (mention) counts[p.report] += 1;
    hits.push({ i, mention, score: scores[i] });
  });
  // Passages that count as mentions come first, best first, and no one report takes them all. With
  // meaning in the ranking, a passage in other words can lead.
  hits.sort(meaning?.scores ? (x, y) => y.score - x.score : (x, y) => (y.mention - x.mention) || (y.score - x.score));
  const taken = new Map(), passages = [];
  for (const h of hits) {
    if (passages.length >= limit) break;
    const p = all[h.i], n = taken.get(p.report) ?? 0;
    if (n >= perYear) continue;
    taken.set(p.report, n + 1);
    const r = reports[p.report];
    passages.push([r.filing.filingDate, r.filing.reportDate ?? null, p.section, h.mention, fix(h.score, meaning?.scores ? 4 : 2), p.text.slice(0, 900), r.url]);
  }
  const wordsIn = reports.map((r, i) => all.reduce((s, p) => s + (p.report === i ? p.text.split(/\s+/).length : 0), 0));
  const yearly = reports.map((r, i) => [r.filing.filingDate, r.filing.reportDate ?? null, r.filing.form, wordsIn[i], counts[i], wordsIn[i] ? fix(counts[i] / wordsIn[i] * 10000, 2) : null]);

  const result = {
    company: { cik: Number(entity.cik), name: sub.name ?? entity.name ?? a.company },
    query: a.query,
    ...(a.also?.length ? { also: a.also } : {}),
    counted_as: a.all_of ? `a paragraph holding at least one term from each of ${a.all_of.length} group${a.all_of.length === 1 ? "" : "s"}` : "a paragraph holding most of the query's words, weighted by how rare each word is",
    reports_read: reports.length,
    earliest: reports.at(-1).filing.filingDate,
    latest: reports[0].filing.filingDate,
    columns: ["filed", "period_end", "form", "prose_words", "mentions", "mentions_per_10000_words"],
    rows: yearly,
    passages: { columns: ["filed", "period_end", "item", "counts_as_mention", "score", "text", "url"], rows: passages },
    ...(notRead.length ? { not_read: notRead.slice(0, 12) } : {}),
    ...(meaning ? { semantic: Object.fromEntries(Object.entries(meaning).filter(([k]) => k !== "scores")) } : {}),
  };
  if (a.correlate_with) {
    const cf = await getJson(session, `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(entity.cik)}.json`, { maxBytes: 96 * 1024 * 1024 }).catch(() => null);
    if (!cf) result.link = { measure: a.correlate_with, note: "This company has no XBRL facts, so there is nothing to compare with." };
    else {
      const values = annualValues(factBook(cf), ["revenue", "gross_profit", "operating_income", "net_income"]);
      const measure = new Map([...values].map(([end, m]) => [end, MEASURES[a.correlate_with](m)]));
      result.link = linkToMeasure(yearly.map((y) => ({ period: y[1], per_10000: y[5] })).reverse(), measure, a.correlate_with);
    }
  }
  result.sources = ["SEC EDGAR: the company's annual reports", ...(a.correlate_with ? ["SEC company facts (XBRL, 2009 on)"] : [])];
  result.limits = [
    meaning?.scores ? "Passages are ranked by words and by a small model's sense of meaning. Mentions are still counted by words alone, so the yearly counts can be reproduced." : "This matches words, ranked by how rare and how frequent they are. It does not understand meaning: a passage can use the words and be about something else, and a passage in other words is missed unless you supply them in also or all_of.",
    "A count follows what lawyers choose to write as much as what is happening. A rise is a change in the words, not evidence of the event.",
    ...(a.correlate_with ? ["A link across one company's years is a handful of points, and many subjects could be tried against it. It suggests something to look at. It does not show a cause or forecast a margin."] : []),
    "Tables and short headings are left out. Reports older than about 2001 are plain text, and their sections may not be identified.",
  ];
  return result;
}

// For `canli-mcp models index <company>`: build every report's vectors now, with no time budget.
export async function buildMemoryVectors(session, company, { years = 25, form = "10-K", onReport = () => {} } = {}) {
  const entity = await resolveEntity(session, company);
  const { rows } = await filings(session, entity.cik, { since: "1993-01-01" });
  const annual = rows.filter((r) => FORMS[form].test(r.form)).slice(0, years);
  for (const f of annual) {
    const r = await reportParagraphs(session, entity.cik, f, form);
    await semanticScores(session, [{ filing: f, paragraphs: r.paragraphs }], [], "x", { budgetMs: Infinity });
    onReport(f.filingDate, r.paragraphs.length);
  }
  return annual.length;
}
