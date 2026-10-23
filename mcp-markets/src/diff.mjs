// What changed in a filing: one section of a company's latest 10-K (or 10-Q) against the same
// section of the filing before it. Paragraphs are matched across the two by the overlap of their
// word pairs; a paragraph with no match above the threshold is new or dropped, and a matched one
// that changed has its added and removed sentences listed. Words whose use rose or fell most are
// counted too ("tariff" from 0 to 14 mentions), which is often the quickest read of a new risk.
import { z } from "zod";

import { readFiling } from "./tools.mjs";

const COMPANY = z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple).");

export const diffInput = z.object({
  company: COMPANY,
  section: z.string().min(1).max(80).optional().describe("The item to compare: \"risk factors\" (default), \"md&a\", \"business\", \"legal proceedings\", \"market risk\", \"1A\"..."),
  form: z.enum(["10-K", "10-Q"]).optional().describe("Default 10-K: the latest annual report against the one before."),
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/).optional().describe("The newer filing; default the latest."),
  against: z.string().regex(/^\d{10}-\d{2}-\d{6}$/).optional().describe("The older filing; default the one filed before the newer."),
  threshold: z.number().min(0.2).max(0.95).optional().describe("Word-pair overlap at which two paragraphs are the same paragraph. Default 0.5."),
  max_items: z.number().int().min(1).max(60).optional().describe("Most new, dropped and changed paragraphs listed each. Default 15."),
}).strict();

// The whole section's text, page by page.
async function sectionText(session, args) {
  let offset = 0, text = "", head = null;
  for (let page = 0; page < 20; page += 1) {
    const r = await readFiling(session, { ...args, max_chars: 100000, offset });
    head ??= r;
    text += r.text ?? "";
    if (r.next_offset === undefined) break;
    offset = r.next_offset;
  }
  return { head, text };
}

const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'%$ ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter(Boolean);
const pairs = (s) => { const w = words(s), out = new Set(); for (let i = 0; i + 1 < w.length; i += 1) out.add(`${w[i]} ${w[i + 1]}`); return out; };
// Paragraphs worth comparing: long enough to say something, not page furniture.
const paragraphs = (text) => text.split("\n").map((p) => p.trim()).filter((p) => words(p).length >= 8);
const sentences = (p) => p.split(/(?<=[.;!?])\s+(?=[A-Z(“"])/).map((s) => s.trim()).filter((s) => words(s).length >= 4);

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n / Math.min(a.size, b.size);
}

const STOP = new Set("the of and to a in or our we that for be is are as on by with may could its from an any which this other these such not have has their it at will can were been more than also including".split(" "));

export function diffText(oldText, newText, { threshold = 0.5, maxItems = 15 } = {}) {
  const A = paragraphs(oldText), B = paragraphs(newText);
  const pa = A.map(pairs), pb = B.map(pairs);
  // Each new paragraph takes its best old match above the threshold; an old paragraph is used once.
  const used = new Set(), match = new Array(B.length).fill(-1), score = new Array(B.length).fill(0);
  const candidates = [];
  for (let j = 0; j < B.length; j += 1) for (let i = 0; i < A.length; i += 1) { const o = overlap(pa[i], pb[j]); if (o >= threshold) candidates.push([o, i, j]); }
  candidates.sort((x, y) => y[0] - x[0]);
  for (const [o, i, j] of candidates) if (match[j] < 0 && !used.has(i)) { match[j] = i; score[j] = o; used.add(i); }
  const added = B.filter((_, j) => match[j] < 0), removed = A.filter((_, i) => !used.has(i));
  const changed = [];
  for (let j = 0; j < B.length; j += 1) {
    if (match[j] < 0 || A[match[j]] === B[j]) continue;
    const so = sentences(A[match[j]]), sn = sentences(B[j]);
    const oldSet = new Set(so.map(norm)), newSet = new Set(sn.map(norm));
    const plus = sn.filter((s) => !oldSet.has(norm(s))), minus = so.filter((s) => !newSet.has(norm(s)));
    if (plus.length || minus.length) changed.push({ similarity: Math.round(score[j] * 100) / 100, added_sentences: plus.slice(0, 4), removed_sentences: minus.slice(0, 4), paragraph_start: B[j].slice(0, 160) });
  }
  // Words whose count moved most, per 10,000 words, among words used at least 3 times in either.
  const count = (t) => { const m = new Map(); let n = 0; for (const w of words(t)) { n += 1; if (w.length > 3 && !STOP.has(w) && !/^\d/.test(w)) m.set(w, (m.get(w) ?? 0) + 1); } return { m, n }; };
  const co = count(oldText), cn = count(newText);
  const terms = [...new Set([...co.m.keys(), ...cn.m.keys()])].map((w) => [w, co.m.get(w) ?? 0, cn.m.get(w) ?? 0]).filter(([, a, b]) => Math.max(a, b) >= 3);
  // Ranked by the change in the log of their rate, smoothed by one mention, so a word that appears
  // from nowhere outranks a common word used a little more.
  const lift = ([, a, b]) => Math.log((b + 1) / Math.max(cn.n, 1)) - Math.log((a + 1) / Math.max(co.n, 1));
  const rising = terms.filter((t) => lift(t) > Math.log(1.5)).sort((x, y) => lift(y) - lift(x) || y[2] - x[2]).slice(0, 15);
  const falling = terms.filter((t) => lift(t) < -Math.log(1.5)).sort((x, y) => lift(x) - lift(y) || y[1] - x[1]).slice(0, 10);
  const cut = (p) => (p.length > 700 ? `${p.slice(0, 700)}...` : p);
  return {
    summary: { old_paragraphs: A.length, new_paragraphs: B.length, added: added.length, removed: removed.length, changed: changed.length, unchanged: B.length - added.length - changed.length, old_words: co.n, new_words: cn.n },
    added: added.slice(0, maxItems).map(cut), removed: removed.slice(0, maxItems).map(cut),
    changed: changed.sort((x, y) => x.similarity - y.similarity).slice(0, maxItems),
    terms_rising: { columns: ["word", "old_count", "new_count"], rows: rising },
    terms_falling: { columns: ["word", "old_count", "new_count"], rows: falling },
  };
}

export async function filingDiff(session, args) {
  const a = diffInput.parse(args);
  const form = a.form ?? "10-K", section = a.section ?? "risk factors";
  const newer = await sectionText(session, { company: a.company, section, ...(a.accession ? { accession: a.accession } : { form }) });
  const olderArgs = a.against ? { company: a.company, section, accession: a.against }
    : { company: a.company, section, form, filed_before: new Date(Date.parse(newer.head.filing.filed) - 86400000).toISOString().slice(0, 10) };
  const older = await sectionText(session, olderArgs);
  const d = diffText(older.text, newer.text, { threshold: a.threshold ?? 0.5, maxItems: a.max_items ?? 15 });
  const s = d.summary;
  return {
    company: newer.head.company,
    section: newer.head.section ?? { item: section },
    newer: { ...newer.head.filing, url: newer.head.url }, older: { ...older.head.filing, url: older.head.url },
    ...d,
    plain_reading: `${newer.head.company.name}'s ${section} in the ${newer.head.filing.form} filed ${newer.head.filing.filed} against the one filed ${older.head.filing.filed}: ${s.added} new paragraphs, ${s.removed} dropped, ${s.changed} changed, ${s.unchanged} the same; ${s.new_words.toLocaleString("en-US")} words against ${s.old_words.toLocaleString("en-US")}.${d.terms_rising.rows.length ? ` Rising words: ${d.terms_rising.rows.slice(0, 5).map(([w, x, y]) => `${w} (${x} to ${y})`).join(", ")}.` : ""}`,
    meaning: "Paragraphs are matched by the share of their word pairs they have in common (threshold); a matched paragraph whose sentences changed is listed under changed, with the sentences added and removed. Counts are mentions in the whole section.",
    limits: ["Text as converted from the filing's HTML; tables and page furniture can split or merge paragraphs.", "A reworded paragraph below the threshold shows as one dropped and one new.", "Not investment advice."],
  };
}
