// How a company's language drifts: one 10-K section followed over several years, each year scored
// on how far its wording moved from the year before (cosine similarity of word counts, the measure of
// Cohen, Malloy and Nguyen's "Lazy Prices", Journal of Finance 2020, who found that firms whose
// 10-K text changed most went on to underperform), on hedging and adverse words per thousand, on
// readability (the Gunning fog index), and, for a theme the caller names ("supply chain"), on how
// much the section says about it and how that wording moves. Flags name the years and themes that
// moved most against the company's own history. All computed on the machine from the filings' text.
import { z } from "zod";

import { readFiling } from "./tools.mjs";

export const driftInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple)."),
  section: z.string().min(1).max(80).optional().describe("The 10-K item to follow: \"risk factors\" (default), \"md&a\", \"business\", \"market risk\"..."),
  years: z.number().int().min(2).max(8).optional().describe("Annual reports to compare, newest first; default 5."),
  theme: z.string().min(3).max(60).optional().describe("A phrase to follow through the years, e.g. \"supply chain\", \"tariff\", \"China\"."),
}).strict();

const HEDGE = new Set(["may", "might", "could", "possibly", "possible", "uncertain", "uncertainty", "uncertainties", "unpredictable", "approximately", "believe", "believes", "anticipate", "anticipates", "depend", "depends", "dependent", "fluctuate", "fluctuations", "volatile", "volatility", "unable", "cannot", "assurance"]);
const ADVERSE = new Set(["adverse", "adversely", "decline", "declines", "loss", "losses", "impair", "impairment", "impairments", "litigation", "breach", "breaches", "failure", "failures", "disruption", "disruptions", "shortage", "shortages", "delay", "delays", "default", "penalties", "penalty", "investigation", "investigations", "restructuring", "weakness", "termination"]);
const STOP = new Set("the of and to a in or our we for be by on with as that is are this its any which from such these may have not it at an other could their including will can if more than also has been those".split(" "));

const words = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
const sentences = (s) => s.replace(/\s+/g, " ").split(/(?<=[.;!?])\s+(?=[A-Z(“"])/).filter((x) => words(x).length >= 4);
const counts = (ws) => { const m = new Map(); for (const w of ws) m.set(w, (m.get(w) ?? 0) + 1); return m; };
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [w, x] of a) { na += x * x; const y = b.get(w); if (y) dot += x * y; }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : null;
}
const syllables = (w) => (w.replace(/e$/, "").match(/[aeiouy]+/g) ?? []).length || 1;
export function fog(text) {
  const ss = sentences(text), ws = words(text);
  if (!ss.length || !ws.length) return null;
  const complex = ws.filter((w) => w.length > 3 && syllables(w) >= 3).length;
  return 0.4 * (ws.length / ss.length + (100 * complex) / ws.length);
}
const per = (n, d, k) => (d ? Math.round((n / d) * k * 100) / 100 : null);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// Scores for each text against the one before it (texts newest first).
export function driftMetrics(texts, theme) {
  const t = theme ? theme.toLowerCase() : null;
  const rows = texts.map((text) => {
    const ws = words(text), c = counts(ws.filter((w) => w.length > 2 && !STOP.has(w)));
    const themed = t ? sentences(text).filter((s) => s.toLowerCase().includes(t)) : [];
    return { ws, c, n: ws.length, hedge: ws.filter((w) => HEDGE.has(w)).length, adverse: ws.filter((w) => ADVERSE.has(w)).length, fog: fog(text), themed, tc: counts(themed.flatMap(words).filter((w) => !STOP.has(w))) };
  });
  return rows.map((r, i) => {
    const prior = rows[i + 1];
    const sim = prior ? cosine(r.c, prior.c) : null;
    const themeSim = prior && r.themed.length && prior.themed.length ? cosine(r.tc, prior.tc) : null;
    return {
      words: r.n, similarity_to_prior: r3(sim), change: sim == null ? null : r3(1 - sim),
      hedging_per_1000: per(r.hedge, r.n, 1000), adverse_per_1000: per(r.adverse, r.n, 1000), fog: r3(r.fog),
      ...(t ? { theme_sentences: r.themed.length, theme_per_10000_words: per(r.themed.length, r.n, 10000), theme_similarity_to_prior: r3(themeSim), theme_new_words: prior ? newWords(r.tc, prior.tc) : [] } : {}),
    };
  });
}

// Words around the theme that rose most since the year before (at least three uses now).
function newWords(now, before) {
  return [...now].filter(([w, x]) => x >= 3 && w.length > 3 && x > 2 * (before.get(w) ?? 0)).sort((a, b) => b[1] - (before.get(b[0]) ?? 0) - (a[1] - (before.get(a[0]) ?? 0))).slice(0, 8).map(([w, x]) => `${w} ${before.get(w) ?? 0}->${x}`);
}

// Plain flags against the company's own history.
export function driftFlags(years, metrics, theme) {
  const flags = [];
  const changes = metrics.map((m) => m.change).filter((x) => x != null);
  if (changes.length >= 2) {
    const mean = changes.reduce((s, x) => s + x, 0) / changes.length;
    const i = metrics.findIndex((m) => m.change === Math.max(...changes));
    if (metrics[i].change > 1.5 * mean && metrics[i].change >= 0.05) flags.push(`${years[i]}: the largest rewrite in the period (change ${metrics[i].change} against an average of ${r3(mean)}), the kind of change "Lazy Prices" found preceded weaker returns.`);
  }
  const rising = (k) => metrics.length >= 3 && metrics.slice(0, 3).every((m, j, arr) => j === arr.length - 1 || (m[k] != null && arr[j + 1][k] != null && m[k] > arr[j + 1][k]));
  if (rising("hedging_per_1000")) flags.push(`Hedging words rose in each of the last three reports (${metrics.slice(0, 3).map((m) => m.hedging_per_1000).reverse().join(" -> ")} per 1,000 words).`);
  if (rising("adverse_per_1000")) flags.push(`Adverse words rose in each of the last three reports (${metrics.slice(0, 3).map((m) => m.adverse_per_1000).reverse().join(" -> ")} per 1,000 words).`);
  if (rising("fog")) flags.push(`The section grew harder to read in each of the last three reports (fog ${metrics.slice(0, 3).map((m) => m.fog).reverse().join(" -> ")}).`);
  if (theme) {
    if (rising("theme_per_10000_words")) flags.push(`"${theme}" took up more of the section in each of the last three reports (${metrics.slice(0, 3).map((m) => m.theme_sentences).reverse().join(" -> ")} sentences).`);
    const ts = metrics[0]?.theme_similarity_to_prior;
    if (ts != null && ts < 0.8) flags.push(`The latest report reworded what it says about "${theme}" (similarity ${ts} to the year before)${metrics[0].theme_new_words.length ? `; words rising beside it: ${metrics[0].theme_new_words.slice(0, 5).join(", ")}` : ""}.`);
  }
  return flags;
}

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

export async function filingDrift(session, args) {
  const a = driftInput.parse(args);
  const section = a.section ?? "risk factors", n = a.years ?? 5;
  const docs = [];
  let before = null;
  for (let i = 0; i < n; i += 1) {
    let d;
    try { d = await sectionText(session, { company: a.company, section, form: "10-K", ...(before ? { filed_before: before } : {}) }); } catch (err) { if (docs.length >= 2) break; throw err; }
    if (!d.text.trim()) break;
    docs.push(d);
    before = new Date(Date.parse(d.head.filing.filed) - 86400000).toISOString().slice(0, 10);
  }
  // A section under 300 words is a heading or a cross-reference the layout hid, not the section: it
  // is listed apart, never compared, so it cannot pass for a rewrite.
  const unread = docs.filter((d) => words(d.text).length < 300).map((d) => ({ filed: d.head.filing.filed, url: d.head.url, words: words(d.text).length }));
  const all = docs.length;
  docs.splice(0, docs.length, ...docs.filter((d) => words(d.text).length >= 300));
  if (docs.length < 2) throw new Error(`Fewer than two ${section} sections could be read from ${a.company}'s last ${all} 10-Ks (${unread.length} were headings or cross-references in this layout); try another section name.`);
  const metrics = driftMetrics(docs.map((d) => d.text), a.theme);
  const years = docs.map((d) => d.head.filing.period ?? d.head.filing.filed);
  const cols = ["filed", "period", "words", "similarity_to_prior", "change", "hedging_per_1000", "adverse_per_1000", "fog", ...(a.theme ? ["theme_sentences", "theme_per_10000_words", "theme_similarity_to_prior", "theme_new_words"] : [])];
  return {
    company: docs[0].head.company, section: docs[0].head.section ?? { item: section }, ...(a.theme ? { theme: a.theme } : {}),
    columns: cols,
    rows: docs.map((d, i) => [d.head.filing.filed, d.head.filing.period ?? null, ...cols.slice(2).map((k) => metrics[i][k] ?? null)]),
    flags: driftFlags(docs.map((d) => d.head.filing.filed), metrics, a.theme),
    filings: docs.map((d) => d.head.url),
    ...(unread.length ? { not_read: { note: "Filings whose section could not be found in their layout (under 300 words); left out of every comparison.", rows: unread } } : {}),
    meaning: "change is 1 minus the cosine similarity of the section's word counts (common words such as \"the\" left out) to the year before (0 = the same words, 1 = none shared). Cohen, Malloy and Nguyen (2020) found firms that changed their 10-Ks most went on to underperform, and that the changes clustered in risk factors and MD&A. Hedging and adverse words are counted per 1,000 words from short lists in this server; fog estimates the years of schooling a reader needs.",
    limits: ["Word counts measure how much the language moved, not why: a new risk, a new lawyer or a reorganized section all register.", "The word lists are this server's, short and general, not a licensed dictionary.", "Not investment advice."],
  };
}
