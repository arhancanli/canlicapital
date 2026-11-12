// A management team's record against its own word: each quarter it guided, what it said, what then
// happened, across as many quarters as its results releases go back. Guidance and results are both in
// its own press releases, so this needs no analyst and no estimate, only the filings.
import { z } from "zod";

import { earningsRelease } from "./releases.mjs";
import { NotFound } from "./sources.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
export const recordInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, name or CIK."),
  quarters: z.number().int().min(1).max(24).optional().describe("How many results releases to go back through; default 12."),
  measure: z.string().min(1).max(40).optional().describe("Only this measure, such as revenue or eps."),
  filed_before: DATE.optional().describe("Start from the latest release filed by this date."),
}).strict();

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const dayBefore = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

// One count per quarter for each measure: a table and a sentence can state one guide twice. A line that
// could not be placed against its range counts for nothing.
export function summarizeRecord(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.measure}|${r.basis ?? ""}|${r.unit}`;
    if (!groups.has(key)) groups.set(key, { measure: r.measure, basis: r.basis ?? null, unit: r.unit, times: 0, above: 0, within: 0, below: 0, misses: [], seen: new Set(), not_placed: 0 });
    const g = groups.get(key);
    if (/^not placed/.test(r.position)) { g.not_placed += 1; continue; }
    if (g.seen.has(r.quarter)) continue;
    g.seen.add(r.quarter);
    g.times += 1;
    if (/^above/.test(r.position)) g.above += 1; else if (/^below/.test(r.position)) { g.below += 1; g.misses.push(r.quarter); } else g.within += 1;
  }
  return [...groups.values()].filter((g) => g.times).sort((a, b) => b.times - a.times);
}

export function reading(company, g) {
  if (!g || g.times < 4) return `Too few guided quarters to read anything into ${company}'s record.`;
  const what = `${g.measure.replace(/_/g, " ")}${g.basis ? ` (${g.basis})` : ""}`;
  const parts = [`Over ${g.times} guided quarters, ${company}'s ${what} came in above its own range ${g.above} times, within it ${g.within} and below it ${g.below}.`];
  if (g.above / g.times >= 0.75) parts.push("A company that nearly always beats its range may simply set it low, so its guidance says little on its own.");
  if (g.below / g.times >= 0.25) parts.push(`It fell short ${g.below} times: ${g.misses.slice(0, 6).join(", ")}.`);
  return parts.join(" ");
}

export async function guidanceRecord(session, args, { release = earningsRelease } = {}) {
  const a = recordInput.parse(args);
  const want = a.quarters ?? 12, rows = [];
  let before = a.filed_before ?? null, read = 0, name = null, first = null, last = null;
  for (let i = 0; i < want; i += 1) {
    let r;
    try { r = await release(session, { company: a.company, ...(before ? { filed_before: before } : {}), max_lines: 3 }); } catch (err) { if (err instanceof NotFound && read) break; throw err; }
    read += 1;
    name ??= r.company?.name ?? a.company;
    last ??= r.release?.filed;
    first = r.release?.filed ?? first;
    const seen = r.previous_guidance_vs_results;
    for (const row of seen?.rows ?? []) {
      const m = Object.fromEntries((seen.columns ?? []).map((c, j) => [c, row[j]]));
      if (a.measure && m.measure !== a.measure) continue;
      if (m.guided_low == null || m.actual == null) continue;
      const q = seen.quarter ? `Q${seen.quarter.quarter} ${seen.quarter.year}` : m.period_guided;
      rows.push({ quarter: q, filed: r.release?.filed ?? null, measure: m.measure, basis: m.basis ?? null, unit: m.unit, guided_low: m.guided_low, guided_high: m.guided_high, actual: m.actual, position: m.position, url: r.release?.url ?? null });
    }
    if (!r.release?.filed) break;
    before = dayBefore(r.release.filed);
  }
  const groups = summarizeRecord(rows);
  const headline = groups.find((g) => /revenue/.test(g.measure)) ?? groups[0];
  return {
    company: name, releases_read: read, from: first, to: last, guided_lines_matched: rows.length,
    reading: reading(name ?? a.company, headline),
    record: { columns: ["measure", "basis", "unit", "times", "above_range", "within_range", "below_range", "quarters_below"], rows: groups.map((g) => [g.measure, g.basis, g.unit, g.times, g.above, g.within, g.below, g.misses.join(", ") || null]) },
    columns: ["quarter", "filed", "measure", "basis", "unit", "guided_low", "guided_high", "actual", "position", "url"],
    rows: rows.map((r) => [r.quarter, r.filed, r.measure, r.basis, r.unit, round(r.guided_low, 4), round(r.guided_high, 4), round(r.actual, 4), r.position, r.url]),
    meaning: "Each line sets what a company's earlier release guided against what its next release reported, as both are worded. Lines match by measure, basis and unit, so a change in how something is defined can break a match rather than mislead.",
    sources: ["The company's results press releases, filed on Form 8-K"],
    limits: [
      "Only guidance given in the press release itself. Many companies, Apple among them, give it on the call or not at all, and those show nothing here.",
      "A record of what was said and what came, read from text by rules, so check the quotes in earnings_release before relying on one line. It does not say why, and it does not forecast the next quarter.",
    ],
  };
}
