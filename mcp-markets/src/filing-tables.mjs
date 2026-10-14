// filing_tables: the tables of a filing that hold a figure, found by words. A 10-K or 10-Q is
// searched twice over: its rendered XBRL reports (every statement, note table and detail table,
// with periods and units) and the tables in its document (where MD&A figures the XBRL does not
// tag live, such as members, stores or average revenue per user). An 8-K's tables are those of its
// press release. With filings above one, the same words are looked up in each earlier filing of
// the form, so a figure the company reports every year can be followed back.
import { z } from "zod";

import { parseReport, reportList } from "./reports.mjs";
import { archiveBase, filingDocuments, filings, getText, NotFound, resolveEntity } from "./sources.mjs";
import { extractTables, matchedRows, scoreTable, searchTerms, together } from "./tables.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const REPORT_FETCH = 4;

export const tablesInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple)."),
  find: z.string().min(2).max(160).optional().describe("Words the table holds, in its title or its row labels: \"paid members\", \"revenue by region\", \"share repurchases\", \"adjusted EPS reconciliation\"; quote a phrase. Without find, the filing's tables are listed."),
  form: z.string().min(1).max(20).optional().describe("10-K (default), 10-Q, 8-K (a results press release's tables), DEF 14A (proxy), 20-F, S-1..."),
  filings: z.number().int().min(1).max(8).optional().describe("Look in this many filings of the form, newest first, to follow a figure over the years; default 1. Needs find."),
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/, "an accession number such as 0000320193-25-000079").optional().describe("Start from this filing."),
  filed_before: DATE.optional().describe("Start from the latest filing of the form on or before this date."),
  document: z.string().min(1).max(120).optional().describe("Search this document of the filing instead (by type or file name, \"EX-99.2\"); default the main document, or an 8-K's press release."),
  max_tables: z.number().int().min(1).max(10).optional().describe("Most tables shown per filing; default 3."),
}).strict();

const isXbrlForm = (form) => /^(10-K|10-Q|20-F|40-F|10-KT|10-QT)(\/A)?$/.test(form);

// The document whose tables are read: the one asked for, an 8-K's press release, or the main one.
async function pickDocument(session, cik, filing, wanted) {
  const base = archiveBase(cik, filing.accessionNumber);
  const main = { name: String(filing.primaryDocument).replace(/^xsl[^/]*\//, ""), type: filing.form };
  if (!wanted && !/^8-K/.test(filing.form)) return { ...main, url: `${base}/${main.name}` };
  const docs = await filingDocuments(session, cik, filing.accessionNumber);
  const text = (d) => /\.(htm|html)$/i.test(d.name);
  if (wanted) {
    const w = wanted.toLowerCase();
    const d = docs.find((x) => x.name.toLowerCase() === w) ?? docs.find((x) => (x.type ?? "").toLowerCase() === w) ?? docs.find((x) => (x.type ?? "").toLowerCase().startsWith(w));
    if (!d) throw new NotFound(`No document "${wanted}" in ${filing.accessionNumber}; it holds ${docs.map((x) => `${x.name} (${x.type})`).join(", ")}.`);
    if (!text(d)) throw new Error(`${d.name} is not an HTML document; read it at ${d.url}.`);
    return { name: d.name, type: d.type, url: d.url };
  }
  const ex = docs.find((d) => /^EX-99/.test(d.type ?? "") && text(d));
  return ex ? { name: ex.name, type: ex.type, url: ex.url } : { ...main, url: `${base}/${main.name}` };
}

async function documentTables(session, url) {
  return getText(session, url, { maxBytes: 24 * 1024 * 1024, variant: "tables", transform: (html) => JSON.stringify(extractTables(html)), parse: (t) => JSON.parse(t) });
}

// One filing: the matching tables, best first; or, without words, what tables it has.
async function searchFiling(session, cik, filing, a, terms) {
  const base = archiveBase(cik, filing.accessionNumber);
  const doc = await pickDocument(session, cik, filing, a.document);
  let reports = [];
  if (isXbrlForm(filing.form) && !a.document) {
    try { reports = reportList(await getText(session, `${base}/FilingSummary.xml`, { maxBytes: 4 * 1024 * 1024 })); } catch (err) { if (!(err instanceof NotFound)) throw err; }
  }
  const tables = await documentTables(session, doc.url);
  if (!terms.length) {
    return {
      xbrl_reports: reports.length ? { columns: ["name", "category", "url"], rows: reports.filter((r) => r.category !== "Cover").map((r) => [r.name, r.category, `${base}/${r.file}`]) } : null,
      document_tables: { document: doc.name, url: doc.url, count: tables.length, columns: ["index", "caption", "first_line", "columns"], rows: tables.slice(0, 80).map((t) => [t.index, (t.caption ?? "").slice(0, 140), String(t.rows[0]?.[0] ?? "").slice(0, 80), t.columns.length - 1]) },
    };
  }
  const found = [];
  // XBRL reports whose names carry the words are read and scored on their rows as well.
  // Statements and detail reports hold the figures; note, policy and "(Tables)" pages are text
  // blocks whose tables the document search reads as tables.
  const named = reports.filter((r) => !["Cover", "Notes", "Policies", "Tables"].includes(r.category))
    .map((r) => ({ r, hits: terms.filter((x) => r.name.toLowerCase().includes(x)).length }))
    .filter((x) => x.hits > 0).sort((x, y) => y.hits - x.hits || x.r.position - y.r.position).slice(0, REPORT_FETCH);
  for (const { r } of named) {
    const page = parseReport(await getText(session, `${base}/${r.file}`, { maxBytes: 8 * 1024 * 1024 }));
    const t = { caption: page.title, columns: ["line", ...page.columns.map((c) => c.label)], rows: page.rows.map((x) => [x.notes ? `${x.label} ${x.notes.join("")}` : x.label, ...x.values]), ...(page.footnotes ? { footnotes: page.footnotes } : {}) };
    const score = scoreTable(t, terms, r.name);
    if (score > 0) found.push({ score: score + 1, source: "xbrl report", title: r.name, units: page.units, url: `${base}/${r.file}`, table: t, name: r.name, together: together(t, terms, r.name) });
  }
  for (const t of tables) {
    const score = scoreTable(t, terms);
    if (score > 0) found.push({ score, source: "document table", title: t.caption, url: doc.url, index: t.index, table: t, name: "", together: together(t, terms) });
  }
  // Tables where the words come together outrank, and then exclude, tables where they are scattered.
  if (found.some((f) => f.together)) found.splice(0, found.length, ...found.filter((f) => f.together));
  found.sort((x, y) => y.score - x.score);
  return {
    tables: found.slice(0, a.max_tables ?? 3).map((f) => {
      const { rows, all } = matchedRows(f.table, terms, f.name);
      return {
        source: f.source, title: f.title ?? null, ...(f.units ? { units: f.units } : {}), ...(f.index != null ? { table_index: f.index } : {}),
        columns: f.table.columns, rows, ...(all ? {} : { rows_shown: `${rows.length} of ${f.table.rows.length}: the rows that name the words, with their headings` }),
        ...(f.table.notes?.length ? { notes: f.table.notes.slice(0, 3) } : {}),
        ...(f.table.footnotes ? { footnotes: f.table.footnotes } : {}),
        url: f.url,
      };
    }),
    matched: found.length,
    searched: { xbrl_reports_read: named.length, document: doc.name, document_tables: tables.length },
  };
}

export async function filingTables(session, args) {
  const a = tablesInput.parse(args);
  const terms = searchTerms(a.find);
  if (a.find && !terms.length) throw new Error(`find "${a.find}" has no words to look for; name the figure, for example "paid members".`);
  if ((a.filings ?? 1) > 1 && !terms.length) throw new Error("filings above 1 follows a figure through earlier filings: pass find with the words it is under.");
  const form = (a.form ?? "10-K").toUpperCase();
  const count = a.filings ?? 1;
  const e = await resolveEntity(session, a.company);
  const yearOf = a.accession ? 2000 + Number(a.accession.slice(11, 13)) : Number((a.filed_before ?? new Date(session.now()).toISOString()).slice(0, 4));
  const perYear = form.startsWith("10-Q") ? 3 : form.startsWith("8-K") ? 4 : 1;
  const { sub, rows } = await filings(session, e.cik, { since: `${yearOf - Math.ceil(count / perYear) - 1}-01-01` });
  // An 8-K means a results release (Item 2.02) unless an accession names another.
  let candidates = rows.filter((r) => r.form === form && (form !== "8-K" || a.accession || String(r.items ?? "").includes("2.02")));
  if (!candidates.length) throw new NotFound(`${sub.name} has no ${form}${form === "8-K" ? " results release (Item 2.02)" : ""} in the period read; list_filings shows what it has filed.`);
  let start = 0;
  if (a.accession) {
    start = candidates.findIndex((r) => r.accessionNumber === a.accession);
    if (start < 0) throw new NotFound(`${a.accession} is not one of ${sub.name}'s ${form} filings; list_filings shows them.`);
  } else if (a.filed_before) {
    start = candidates.findIndex((r) => r.filingDate <= a.filed_before);
    if (start < 0) throw new NotFound(`${sub.name} filed no ${form} on or before ${a.filed_before} in the period read.`);
  }
  candidates = candidates.slice(start, start + count);
  const results = [];
  for (const f of candidates) {
    const r = await searchFiling(session, e.cik, f, a, terms);
    results.push({ filing: { accession: f.accessionNumber, form: f.form, filed: f.filingDate, period: f.reportDate || null }, ...r });
  }
  const none = terms.length && results.every((r) => !r.tables.length);
  return {
    company: { cik: e.cik, name: sub.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null },
    ...(a.find ? { find: a.find, terms } : {}),
    form,
    results,
    ...(none ? { next: `No table in ${results.length === 1 ? "this filing" : "these filings"} holds every word of "${a.find}". Try fewer or other words (the company's own label), list the tables without find, or read_filing with find for figures written in sentences.` } : {}),
    note: "Values are as the table shows them: an XBRL report's units give the scale (\"$ in Millions\"); a document table's scale is in its caption or headers (\"in millions\", \"Dollars in billions\"). Percentages keep their % sign.",
    limits: [
      "From the filings as submitted to the SEC; Canli Capital does not edit or verify them. Document tables are read from the filing's HTML: a figure whose header is ambiguous is shown under the nearest one, so check the url when a column matters.",
      "Not investment advice.",
    ],
  };
}
