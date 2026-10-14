// earnings_release: a quarter's results press release (Form 8-K, Item 2.02, exhibit 99) read for
// an analyst: the headline, the results it states, the guidance it gives (each figure parsed into
// a range with its measure, basis, period and the sentence or table row it came from), the tables
// it holds, and the previous release's guidance for this quarter lined up against these results.
import { z } from "zod";

import { releasesFrom } from "./earnings.mjs";
import { pressHeadline } from "./events.mjs";
import { documentTables } from "./filing-tables.mjs";
import { compareGuidance, guidanceFromTable, guidanceFromText, isGuidanceTable, quarterOf, resultsFromText } from "./guidance.mjs";
import { htmlToText } from "./html.mjs";
import { filingDocuments, filings, getText, NotFound, resolveEntity } from "./sources.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");

export const releaseInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple)."),
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/, "an accession number such as 0000320193-25-000079").optional().describe("A results 8-K; default the latest (earnings_calendar lists them)."),
  filed_before: DATE.optional().describe("The latest results release filed on or before this date."),
  compare: z.boolean().optional().describe("Line up the previous release's guidance for this quarter against these results; default true."),
  max_lines: z.number().int().min(3).max(40).optional().describe("Most result lines; default 12."),
}).strict();


// The press release of a results 8-K and what it says.
async function readRelease(session, cik, accession, company) {
  const docs = await filingDocuments(session, cik, accession);
  const html = (d) => /\.(htm|html)$/i.test(d.name);
  const exhibits = docs.filter((d) => /^EX-99/.test(d.type ?? "") && html(d));
  const main = exhibits[0] ?? docs.find((d) => /^8-K/.test(d.type ?? "") && html(d));
  if (!main) throw new NotFound(`${accession} has no press release in HTML; read_filing lists its documents.`);
  const raw = await getText(session, main.url, { maxBytes: 16 * 1024 * 1024 });
  const text = htmlToText(raw);
  const tables = await documentTables(session, main.url);
  let guidance = [...guidanceFromText(text, { company }), ...tables.filter(isGuidanceTable).flatMap(guidanceFromTable)];
  const read = [main];
  // Some companies give their outlook in a second exhibit (CFO commentary, a supplement).
  if (!guidance.length && exhibits[1]) {
    const second = exhibits[1];
    const t2 = await documentTables(session, second.url);
    const x2 = htmlToText(await getText(session, second.url, { maxBytes: 16 * 1024 * 1024 }));
    guidance = [...guidanceFromText(x2, { company }), ...t2.filter(isGuidanceTable).flatMap(guidanceFromTable)];
    read.push(second);
  }
  // The same figure stated in a bullet, a quote and a table is listed once.
  const seen = new Set();
  guidance = guidance.filter((g) => {
    const k = [g.measure ?? g.label, g.basis, g.low, g.high, g.unit, g.change ?? ""].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { main, read, raw, text, tables, guidance, headline: pressHeadline(raw, company), results: resultsFromText(text) };
}

const gRow = (g) => [g.measure ?? g.label ?? null, g.basis ?? null, g.period ?? null, g.low, g.high, g.mid, g.unit, g.approximate ? true : null, g.change ?? g.words ?? null, g.width_pct_of_mid ?? null, g.quote];

export async function earningsRelease(session, args) {
  const a = releaseInput.parse(args);
  const e = await resolveEntity(session, a.company);
  const year = a.accession ? 2000 + Number(a.accession.slice(11, 13)) : Number((a.filed_before ?? new Date(session.now()).toISOString()).slice(0, 4));
  const { sub, rows } = await filings(session, e.cik, { since: `${year - 2}-01-01` });
  const releases = releasesFrom(rows);
  if (!releases.length) throw new NotFound(`${sub.name} filed no results release (8-K Item 2.02) since ${year - 2}; foreign issuers furnish results on Form 6-K.`);
  let at = releases.length - 1;
  if (a.accession) {
    at = releases.findIndex((r) => r.accession === a.accession || r.also.includes(a.accession));
    if (at < 0) throw new NotFound(`${a.accession} is not one of ${sub.name}'s results releases (8-K Item 2.02); earnings_calendar lists them.`);
  } else if (a.filed_before) {
    at = releases.map((r) => r.date <= a.filed_before).lastIndexOf(true);
    if (at < 0) throw new NotFound(`${sub.name} filed no results release on or before ${a.filed_before} in the period read.`);
  }
  const target = releases[at];
  const now = await readRelease(session, e.cik, target.accession, sub.name);
  const max = a.max_lines ?? 12;
  const seenQuotes = new Set();
  const results = now.results.filter((r) => { const k = `${r.measure}|${r.value}|${r.unit}`; if (seenQuotes.has(k)) return false; seenQuotes.add(k); return true; }).slice(0, max);
  let comparison;
  if (a.compare !== false && at > 0) {
    const prev = releases[at - 1];
    const before = await readRelease(session, e.cik, prev.accession, sub.name);
    // Guidance for a quarter is set against this quarter's results; guidance for the year only when
    // this release reports the year.
    // Only guidance for the quarter these results cover: the guided period must name the same
    // quarter as this release (and the same year when both give one).
    const opening = `${now.headline ?? ""} ${now.text.slice(0, 1500)}`;
    const here = quarterOf(now.headline) ?? quarterOf(now.text.slice(0, 1500));
    if (here && !here.year) here.year = quarterOf(opening)?.year ?? null;
    const forThis = here ? before.guidance.filter((g) => {
      if (g.low === null) return false;
      const p = quarterOf(g.period);
      return p && p.quarter === here.quarter && (!p.year || !here.year || p.year === here.year);
    }) : [];
    // A table that restates a guide as a point ("74.9%") without the text's band ("plus or minus 50
    // basis points") is set aside where the band is known.
    const ranged = new Set(forThis.filter((g) => g.low !== g.high).map((g) => `${g.measure}|${g.basis}|${g.unit}`));
    const rowsOut = compareGuidance(forThis.filter((g) => g.low !== g.high || !ranged.has(`${g.measure}|${g.basis}|${g.unit}`)), now.results);
    comparison = {
      previous_release: { filed: prev.date, accession: prev.accession, url: before.main.url },
      quarter: here ?? null,
      guided_items: forThis.length,
      ...(rowsOut.length
        ? { columns: ["measure", "basis", "period_guided", "unit", "guided_low", "guided_high", "actual", "vs_low", "vs_high", "vs_low_bps", "vs_high_bps", "position", "guidance_quote", "result_quote"], rows: rowsOut.map((r) => [r.measure, r.basis, r.period, r.unit, r.guided_low, r.guided_high, r.actual, r.vs_low, r.vs_high, r.vs_low_bps ?? null, r.vs_high_bps ?? null, r.position, r.guidance_quote, r.result_quote]) }
        : { rows: [], note: forThis.length ? "No result in this release names the same measure, basis and unit as the previous guidance; compare by the quotes in guidance and results." : "The previous release gave no quarterly guidance this tool could read; read it with read_filing." }),
      note: "Measures are matched by name, basis (GAAP, adjusted, non-GAAP) and unit; check that period_guided is the quarter these results cover, and both quotes.",
    };
  }
  return {
    company: { cik: e.cik, name: sub.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null },
    release: { filed: target.date, accession: target.accession, document: now.main.name, url: now.main.url, headline: now.headline, ...(now.read.length > 1 ? { also_read: now.read.slice(1).map((d) => d.url) } : {}) },
    results: { columns: ["measure", "value", "unit", "basis", "change", "quote"], rows: results.map((r) => [r.measure, r.value, r.unit, r.basis, r.change, r.quote]) },
    guidance: now.guidance.length
      ? { columns: ["measure", "basis", "period", "low", "high", "mid", "unit", "approximate", "change_or_words", "width_pct_of_mid", "quote"], rows: now.guidance.slice(0, 40).map(gRow) }
      : { rows: [], note: "No guidance was found in this release (some companies give it on the call or in a separate exhibit); read_filing with document \"EX-99.2\" reads another exhibit." },
    ...(comparison ? { previous_guidance_vs_results: comparison } : {}),
    tables: { columns: ["index", "caption", "first_line", "columns"], rows: now.tables.slice(0, 30).map((t) => [t.index, (t.caption ?? "").slice(0, 120), String(t.rows[0]?.[0] ?? "").slice(0, 60), t.columns.length - 1]), next: "filing_tables with form \"8-K\" and the accession (find words) returns a table's rows." },
    note: "Ranges are as stated: \"plus or minus\" is applied, \"approximately\" is marked, words such as \"low single digits\" are kept as words. Every figure carries the sentence or table row it came from; read it before relying on the measure, basis or period.",
    limits: [
      "From the press release furnished on Form 8-K; Canli Capital does not edit or verify it. Guidance that is given only on the earnings call is not in it.",
      "Parsing finds measures by their common names; an unusual name is kept as written, and a figure may be assigned to the wrong measure: the quote is the authority.",
      "Not investment advice.",
    ],
  };
}
