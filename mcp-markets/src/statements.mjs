// A company's financial statements exactly as it filed them: the income statement, balance sheet,
// cash flow and equity statements of its 10-K or 10-Q, read from SEC's rendered XBRL reports, with
// the company's own line labels and order, each line's XBRL concept, and the values as the filing
// shows them. Several filings join into one table by period; where an older filing reported a
// period differently, the newer figure is shown and the first-reported one is listed beside it.
import { z } from "zod";

import { parseReport, reportList, statementKind } from "./reports.mjs";
import { archiveBase, filings, getText, NotFound, resolveEntity } from "./sources.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const KINDS = ["income", "balance_sheet", "cash_flow", "comprehensive_income", "equity"];
const CORE = ["income", "balance_sheet", "cash_flow"];
const MAX_COLUMNS = 12;
const MAX_REVISED = 40;

export const statementsInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple)."),
  statement: z.enum(["core", "income", "balance_sheet", "cash_flow", "comprehensive_income", "equity", "all"]).optional().describe("Which statement: income, balance_sheet, cash_flow, comprehensive_income, equity; core (default) is the first three, all is every one."),
  period: z.enum(["annual", "quarterly"]).optional().describe("annual (10-K, default) or quarterly (10-Q: each quarter and the year to date; the fourth quarter is only in the 10-K's year)."),
  filings: z.number().int().min(1).max(6).optional().describe("How many 10-Ks (or 10-Qs) to read and join by period, newest first; default 1. One 10-K holds three years of income and cash flows and two balance sheets, so 2 covers four years and 3 covers five."),
  fiscal_year: z.number().int().min(2009).max(2100).optional().describe("Start from the 10-K for the fiscal year ending in this calendar year (or the latest 10-Q of it)."),
  filed_before: DATE.optional().describe("Start from the latest filing on or before this date: what was known then."),
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/, "an accession number such as 0000320193-25-000079").optional().describe("Start from this filing."),
}).strict();

// The column a value belongs to across filings: its period, or its date.
const columnKey = (c) => (c.instant ? `i|${c.instant}` : c.end ? `${c.months ?? "?"}|${c.end}` : `m|${c.label}`);
const columnLabel = (c) => (c.instant ? c.instant : c.end ? `${c.months ? `${c.months} months` : "period"} to ${c.end}` : c.label);
const columnOrder = (a, b) => {
  const da = a.instant ?? a.end ?? "", db = b.instant ?? b.end ?? "";
  if ((a.months ?? 0) !== (b.months ?? 0)) return (a.months ?? 0) - (b.months ?? 0);
  return db.localeCompare(da);
};

// The statement pages of one filing, by kind: the first report of each kind among its statements.
async function statementPages(session, cik, filing) {
  const base = archiveBase(cik, filing.accessionNumber);
  let list;
  try {
    list = reportList(await getText(session, `${base}/FilingSummary.xml`, { maxBytes: 4 * 1024 * 1024 }));
  } catch (err) {
    if (err instanceof NotFound) return null;
    throw err;
  }
  const pages = {};
  for (const r of list) {
    if (r.category && r.category !== "Statements") continue;
    const kind = statementKind(r.name);
    if (kind && !pages[kind]) pages[kind] = { name: r.name, url: `${base}/${r.file}` };
  }
  return { pages, index: `${base}/${filing.accessionNumber}-index.htm` };
}

// Rows keyed by concept, the breakdown member they sit under ("Revenue" under "Product" is not
// "Revenue" under "Service and Other") and the occurrence of that pair on the page, so filings that
// relabel a line still join and a breakdown listed in another order still lands on the right line.
// Rows only an older filing has go after the row they followed there.
export function rowKeys(rows) {
  const seen = new Map();
  let member = "";
  return rows.map((r) => {
    if (r.member) member = r.label.toLowerCase();
    const base = `${r.concept ?? `label:${r.label.toLowerCase()}`}@${r.member ? "" : member}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}

const sameLabel = (a, b) => a.label.toLowerCase().replace(/\s+/g, " ").trim() === b.label.toLowerCase().replace(/\s+/g, " ").trim();
const PER_SHARE = (r) => /PerShare/i.test(r.concept ?? "") || /per share/i.test(r.label);
const SHARES = (r) => !PER_SHARE(r) && (/\(in shares\)|\(shares\)/i.test(r.label) || /(WeightedAverageNumberOf|SharesOutstanding|SharesIssued)/.test(r.concept ?? ""));

// The joined rows' values for the shown columns. A value comes from the newest filing that reports
// its period. An older filing that reports a line differently for a period a newer filing also
// reports is on another basis for that line (a split, restatement or reclassification): its other
// periods on that line are left out and listed, so no row mixes bases. Two neighbouring rows with
// the same label under different concepts (a filing renamed the concept) merge when they agree.
export function buildRows(entries, shown) {
  const keys = shown.map(columnKey);
  const rows = [], revised = [], otherBasis = [];
  const ratios = new Map();
  for (const r of entries) {
    const off = new Set();
    for (const cell of r.cells.values()) for (const c of cell.slice(1)) if (c.value !== cell[0].value) off.add(c.filing);
    const values = keys.map((k, i) => {
      const cell = r.cells.get(k) ?? [];
      if (!cell.length) return null;
      const top = cell[0], first = cell.at(-1);
      if (cell.length > 1 && first.value !== top.value) {
        revised.push({ label: r.label, column: shown[i], value: top.value, first_reported: first.value, filing: first.filing });
        if (typeof top.value === "number" && typeof first.value === "number" && top.value && first.value && (PER_SHARE(r) || SHARES(r))) {
          if (!ratios.has(first.filing)) ratios.set(first.filing, []);
          ratios.get(first.filing).push(PER_SHARE(r) ? first.value / top.value : top.value / first.value);
        }
      }
      if (off.has(top.filing)) {
        otherBasis.push({ label: r.label, column: shown[i], value: top.value, filing: top.filing });
        return null;
      }
      return top.value;
    });
    if (!r.section && values.every((v) => v === null)) continue;
    const from = new Set([...r.cells.values()].flat().map((c) => c.filing));
    const row = { label: r.label, concept: r.concept, section: r.section, member: r.member, values, from };
    const prev = rows.at(-1);
    // Only a concept renamed between filings: different concepts, from different filings, agreeing.
    if (prev && !prev.section && !row.section && prev.concept !== row.concept && sameLabel(prev, row) && ![...from].some((f) => prev.from.has(f)) && values.every((v, i) => v === null || prev.values[i] === null || v === prev.values[i])) {
      if (prev.values[0] === null && values[0] !== null) prev.concept = row.concept;
      prev.values = prev.values.map((v, i) => v ?? values[i]);
      for (const f of from) prev.from.add(f);
      continue;
    }
    rows.push(row);
  }
  // A split: every per-share and share-count revision from one filing by the same whole factor.
  const splits = [];
  for (const [fi, rs] of ratios) {
    const k = Math.round(rs[0]);
    if (rs.length >= 2 && k >= 2 && rs.every((x) => Math.abs(x / k - 1) <= 0.06)) splits.push([fi, k]);
  }
  return { rows, revised, otherBasis, splits };
}

// A heading (a section title or a breakdown member such as "Net Sales") stays when values follow
// it, other headings in between, before the next breakdown member starts.
export function pruneHeadings(rows) {
  return rows.filter((r, i) => {
    if (!r.section) return true;
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].member) return false;
      if (!rows[j].section) return rows[j].values.some((v) => v !== null);
    }
    return false;
  });
}

function joinRows(tables) {
  const order = [], byKey = new Map();
  const keysOf = (t) => rowKeys(t.rows);
  tables.forEach((t, ti) => {
    const keys = keysOf(t);
    let after = -1;
    t.rows.forEach((r, i) => {
      const key = keys[i];
      if (!byKey.has(key)) {
        const entry = { key, label: r.label, concept: r.concept, section: Boolean(r.section), member: Boolean(r.member), cells: new Map() };
        byKey.set(key, entry);
        order.splice(after + 1, 0, entry);
      }
      const entry = byKey.get(key);
      after = order.indexOf(entry);
      r.values.forEach((v, ci) => {
        if (v === null) return;
        const col = columnKey(t.columns[ci]);
        if (!entry.cells.has(col)) entry.cells.set(col, []);
        entry.cells.get(col).push({ value: v, filing: ti });
      });
    });
  });
  return order;
}

export async function financialStatements(session, args) {
  const a = statementsInput.parse(args);
  const period = a.period ?? "annual";
  const want = a.statement === "all" ? KINDS : !a.statement || a.statement === "core" ? CORE : [a.statement];
  const count = a.filings ?? 1;
  const e = await resolveEntity(session, a.company);
  // How far back to read the filing list: from the year asked for (an accession carries its year).
  const startYear = a.fiscal_year ?? (a.accession ? 2000 + Number(a.accession.slice(11, 13)) : Number((a.filed_before ?? new Date(session.now()).toISOString()).slice(0, 4)));
  const back = period === "annual" ? count + 2 : Math.ceil(count / 3) + 2;
  const { sub, rows } = await filings(session, e.cik, { since: `${startYear - back}-01-01` });
  const forms = period === "annual" ? ["10-K", "20-F", "40-F"] : ["10-Q"];
  let candidates = rows.filter((r) => forms.includes(r.form));
  // A foreign issuer's annual report is a 20-F or 40-F; a domestic one's 10-K comes first.
  if (period === "annual" && candidates.some((r) => r.form === "10-K")) candidates = candidates.filter((r) => r.form === "10-K");
  if (!candidates.length) throw new NotFound(`${sub.name} has filed no ${forms.join(" or ")} in the period read${period === "quarterly" && sub.category?.includes("foreign") ? " (foreign issuers report quarters on Form 6-K, without XBRL statements)" : ""}; list_filings shows what it has filed.`);
  let start = 0;
  if (a.accession) {
    start = candidates.findIndex((r) => r.accessionNumber === a.accession);
    if (start < 0) throw new NotFound(`${a.accession} is not one of ${sub.name}'s ${forms.join("/")} filings; list_filings shows them.`);
  } else if (a.fiscal_year) {
    start = candidates.findIndex((r) => String(r.reportDate ?? "").startsWith(String(a.fiscal_year)));
    if (start < 0) throw new NotFound(`${sub.name} has no ${forms[0]} for a period ending in ${a.fiscal_year}; its recent ones end ${candidates.slice(0, 4).map((r) => r.reportDate).join(", ")}.`);
  } else if (a.filed_before) {
    start = candidates.findIndex((r) => r.filingDate <= a.filed_before);
    if (start < 0) throw new NotFound(`${sub.name} filed no ${forms[0]} on or before ${a.filed_before} in the period read.`);
  }
  const picked = candidates.slice(start, start + count);
  const read = [];
  for (const f of picked) {
    const found = await statementPages(session, e.cik, f);
    if (found) read.push({ filing: f, ...found });
  }
  if (!read.length) throw new NotFound(`${sub.name}'s ${picked[0].form} ${picked[0].accessionNumber} has no rendered XBRL statements (filed before XBRL, or without it); read_filing with section "financial statements" gives the text.`);
  const out = {};
  const revised = [], otherBasis = [], splits = new Set();
  const notJoined = [];
  for (const kind of want) {
    const tables = [];
    for (const r of read) {
      const p = r.pages[kind];
      if (!p) continue;
      const t = parseReport(await getText(session, p.url, { maxBytes: 8 * 1024 * 1024 }));
      tables.push({ ...t, url: p.url, name: p.name, filing: r.filing });
      // An equity statement's columns are its components, not periods: it does not join.
      if (kind === "equity") break;
    }
    if (!tables.length) continue;
    // Filings in other units are not joined into the newest one's numbers.
    const joined = tables.filter((t) => t.units === tables[0].units);
    for (const t of tables.filter((x) => x.units !== tables[0].units)) notJoined.push({ statement: kind, accession: t.filing.accessionNumber, units: t.units, url: t.url });
    const cols = new Map();
    for (const t of joined) for (const c of t.columns) if (!cols.has(columnKey(c))) cols.set(columnKey(c), c);
    const ordered = kind === "equity" ? [...cols.values()] : [...cols.values()].sort(columnOrder);
    const shown = ordered.slice(0, MAX_COLUMNS);
    const built = buildRows(joinRows(joined), shown);
    for (const x of built.revised) if (revised.length < MAX_REVISED) revised.push([kind, x.label, columnLabel(x.column), x.value, x.first_reported, joined[x.filing].filing.accessionNumber]);
    for (const x of built.otherBasis) if (otherBasis.length < MAX_REVISED) otherBasis.push([kind, x.label, columnLabel(x.column), x.value, joined[x.filing].filing.accessionNumber]);
    for (const [fi, k] of built.splits) splits.add(`${joined[fi].filing.accessionNumber} reports per-share figures ${k} times the newer ones and share counts a ${k}th of them: consistent with a ${k}-for-1 stock split after it was filed.`);
    const rowsOut = pruneHeadings(built.rows).map((r) => [r.label, r.concept, ...r.values]);
    const footnotes = joined[0].footnotes;
    out[kind] = {
      title: joined[0].title,
      units: joined[0].units,
      columns: ["line", "concept", ...shown.map(columnLabel)],
      rows: rowsOut,
      ...(footnotes ? { footnotes } : {}),
      ...(ordered.length > shown.length ? { more_columns: `${ordered.length - shown.length} older columns not shown; pass fiscal_year or accession to start earlier` } : {}),
      sources: joined.map((t) => t.url),
    };
  }
  if (!Object.keys(out).length) throw new NotFound(`No ${want.join(", ")} statement was found among the rendered reports of ${sub.name}'s ${read[0].filing.form}; filing_tables lists every report in the filing.`);
  return {
    company: { cik: e.cik, name: sub.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null },
    period,
    filings: { columns: ["accession", "form", "filed", "period", "index"], rows: read.map((r) => [r.filing.accessionNumber, r.filing.form, r.filing.filingDate, r.filing.reportDate || null, r.index]) },
    ...out,
    ...(revised.length ? { revised: { note: "The same line and period reported differently by an older filing (a restatement, reclassification or split): value is the newest filing's, first_reported the oldest one read.", columns: ["statement", "line", "period", "value", "first_reported", "first_reported_in"], rows: revised } } : {}),
    ...(otherBasis.length ? { other_basis: { note: "Periods only an older filing covers, on lines that filing reports differently for the periods both cover: they are on another basis (before a split, restatement or reclassification), so they are listed here and left out of the table.", columns: ["statement", "line", "period", "value_as_filed", "filing"], rows: otherBasis } } : {}),
    ...(splits.size ? { splits: [...splits] } : {}),
    ...(notJoined.length ? { not_joined: { note: "These filings present the statement in other units, so their numbers were not joined; read them with accession.", rows: notJoined } } : {}),
    units_note: "Values are as each statement shows them: units gives the scale of money and shares (\"$ in Millions\"); per-share amounts, percentages and rows labeled with their own unit are not scaled.",
    limits: [
      "From the XBRL statements the company filed, as SEC renders them; Canli Capital does not edit or verify them. Labels are the company's own.",
      ...(period === "quarterly" ? ["A 10-Q holds the quarter and the year to date (cash flows are usually year to date only); the fourth quarter is in the 10-K, as the year."] : []),
      "Not investment advice.",
    ],
  };
}
