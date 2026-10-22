// Tables in filing documents (a 10-K's MD&A, a press release's guidance and reconciliations, a
// proxy) as rows a model can read: the label, then one value per column, numbers parsed. EDGAR's
// HTML spreads one figure over several cells ("$", "1,234", ")", "%") and pads columns with empty
// ones, so cells are laid out by their column spans, a figure's pieces are joined, and each value
// is placed under the header that spans it.
import { decodeEntities, htmlToText } from "./html.mjs";
import { cellValue } from "./reports.mjs";

const MAX_TABLES = 1500;
const MAX_ROWS = 400;

const textOf = (html) => {
  let t = String(html).replace(/<br\s*\/?>/gi, " ").replace(/<sup\b[^>]*>\s*(\(?\d{1,2}\)?|\*+|[a-z])\s*<\/sup>/gi, "");
  for (let prev = null; prev !== t;) { prev = t; t = t.replace(/<[^>]*>/g, " "); }
  return decodeEntities(t.replace(/[<>]/g, " ")).replace(/[\s ​  ]+/g, " ").trim();
};

// Every top-level table with where it starts and ends; a table inside a cell stays in its cell.
function tableSpans(html) {
  const out = [];
  const re = /<(\/?)table\b[^>]*>/gi;
  let depth = 0, start = 0, m;
  while ((m = re.exec(html)) && out.length < MAX_TABLES) {
    if (!m[1]) { if (depth++ === 0) start = m.index; }
    else if (depth > 0 && --depth === 0) out.push([start, m.index + m[0].length]);
  }
  return out;
}

const PREFIX = /^(?:\(|[$€£¥]|US\$|C\$|A\$|\(\s*[$€£¥]|[$€£¥]\s*\()$/;
const SUFFIX = /^(?:\)|%|\)\s*%|%\s*\)|pts?\.?|bps|x|\*+)$/i;
// A figure: a number as cells hold them, or an amount with its scale ("$8.10 Billion").
const isNumeric = (t) => typeof cellValue(t).value === "number" || /^\(?[$€£¥]\s?\d[\d,]*(?:\.\d+)?\s*(?:billion|million|thousand|bn|mn|[bmk])\)?$/i.test(String(t).trim());
const isYear = (t) => /^(?:fiscal |fy\s?)?(?:19|20)\d{2}$/i.test(t);

// One row's cells as tokens: a figure's pieces joined, empty cells dropped, each token with the
// grid columns it covers. Header rows are not joined ("$" there heads a column of its own).
export function rowTokens(cells, join = true) {
  const raw = [];
  let pos = 0;
  for (const c of cells) {
    raw.push({ text: c.text, start: pos, end: pos + c.span });
    pos += c.span;
  }
  if (!join) return raw.filter((c) => c.text);
  const out = [];
  let carry = null;
  for (const c of raw) {
    if (!c.text) continue;
    if (PREFIX.test(c.text)) { carry = carry ? { text: `${carry.text}${c.text}`, start: carry.start } : { text: c.text, start: c.start }; continue; }
    if (SUFFIX.test(c.text) && out.length && !carry) {
      const last = out[out.length - 1];
      last.text = `${last.text}${c.text}`;
      last.end = c.end;
      continue;
    }
    out.push(carry ? { text: `${carry.text}${carry.text.endsWith("(") ? "" : " "}${c.text}`.replace(/\s+/g, " "), start: carry.start, end: c.end } : { ...c });
    carry = null;
  }
  return out;
}

// A figure as a number when it is one ("$ (1,234)" -> -1234); a percentage keeps its sign as text
// ("(0.5)%" -> "-0.5%"), so a growth rate is never read as an amount; other text stays text.
export function figure(text) {
  const t = String(text).replace(/\s+%/g, "%").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/^\((.*)\)%$/, "($1%)");
  const parsed = cellValue(t.replace(/^\((-?[\d.,]+)%\)$/, "($1)%"));
  if (typeof parsed.value !== "number") return text;
  return parsed.percent ? `${parsed.value}%` : parsed.value;
}

// One HTML table as caption, column headers and rows.
export function parseTable(tableHtml, caption = null) {
  const rows = [];
  for (const m of String(tableHtml).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    // A cell may close itself ("<td colspan=\"3\" />"), as Costco's 10-K writes its spacers.
    const cells = [...m[1].matchAll(/<t([hd])\b([^>]*?)(?:\/>|>([\s\S]*?)<\/t[hd]>)/gi)].map((c) => ({ text: textOf(c[3] ?? ""), span: Math.max(1, Math.min(50, Number(c[2].match(/colspan\s*=\s*"?(\d+)/i)?.[1] ?? 1) || 1)) }));
    const tokens = rowTokens(cells);
    if (tokens.length) rows.push({ tokens, raw: rowTokens(cells, false) });
    if (rows.length >= MAX_ROWS) break;
  }
  if (!rows.length) return null;
  const notes = [], body = [];
  for (const r of rows) {
    if (r.tokens.length === 1 && r.tokens[0].text.length > 150) notes.push(r.tokens[0].text);
    // A footnote under the table ("1 | Business segment operating profit ... are non-GAAP measures")
    // often starts a cell left of every label (Lockheed Martin's outlook, 2026-10-22): as a row it
    // would make that empty column the labels' and leave every real row without a label.
    else if (r.tokens.length === 2 && /^(?:\(?\d{1,2}\)?|\*+|[a-z])$/.test(r.tokens[0].text) && r.tokens[1].text.length > 60) notes.push(`${r.tokens[0].text} ${r.tokens[1].text}`);
    else body.push(r);
  }
  if (!body.length) return { caption, columns: ["line"], rows: [], notes };
  const left = Math.min(...body.map((r) => r.tokens[0].start));
  // A row is data when a value after its label is a number (a year alone is a header).
  const labelOf = (r) => (r.tokens[0].start === left && !isNumeric(r.tokens[0].text) ? r.tokens[0] : null);
  const valuesOf = (r) => (labelOf(r) ? r.tokens.slice(1) : r.tokens);
  const isData = (r) => valuesOf(r).some((t) => isNumeric(t.text) && !isYear(t.text));
  const firstData = body.findIndex(isData);
  const numeric = firstData >= 0;
  // Header rows: before the first data row, rows of several cells or cells right of the labels.
  const headRows = numeric ? body.slice(0, firstData).filter((r) => r.tokens.length > 1 || r.tokens[0].start > left) : body.length > 1 && body[0].tokens.length > 1 ? [body[0]] : [];
  const dataRows = numeric ? body.slice(firstData) : body.slice(headRows.length);
  // Where each value sits: figures align right, so their last grid column; text, its first.
  const posOf = (t) => (numeric ? t.end - 1 : t.start);
  const positions = [...new Set(dataRows.flatMap((r) => valuesOf(r).map(posOf)))].sort((a, b) => a - b);
  if (!positions.length) return { caption, columns: ["line"], rows: body.map((r) => [r.tokens.map((t) => t.text).join(" ")]), ...(notes.length ? { notes } : {}) };
  // A column is the lowest header cell over a position (headers span the cells of their figures);
  // positions no header covers group with their neighbours one grid column away.
  const headerCells = headRows.map((r) => r.raw.filter((t) => t.start > left || (t.start === left && r.raw.length > 1 && t !== r.raw[0])));
  const leafOf = (p) => {
    for (let h = headerCells.length - 1; h >= 0; h--) {
      const t = headerCells[h].find((x) => x.start <= p && x.end > p);
      if (t) return `${h}:${t.start}`;
    }
    return null;
  };
  const slotKey = new Map();
  let lastFree = null;
  for (const p of positions) {
    const leaf = leafOf(p);
    if (leaf) { slotKey.set(p, leaf); lastFree = null; continue; }
    slotKey.set(p, lastFree && p - lastFree.p <= 1 ? lastFree.key : `p:${p}`);
    lastFree = { p, key: slotKey.get(p) };
  }
  // A header over several figures of one row (a period over its pre-tax, tax and net columns) is
  // split where the figures sit.
  const crowded = new Set();
  for (const r of dataRows) {
    const seen = new Map();
    for (const t of valuesOf(r)) {
      const k = slotKey.get(posOf(t));
      if (seen.has(k) && seen.get(k) !== posOf(t)) crowded.add(k);
      seen.set(k, posOf(t));
    }
  }
  for (const k of crowded) {
    let cluster = 0, prev = null;
    for (const p of positions.filter((x) => slotKey.get(x) === k)) {
      if (prev !== null && p - prev > 1) cluster++;
      slotKey.set(p, `${k}|${cluster}`);
      prev = p;
    }
  }
  const slots = [...new Set(positions.map((p) => slotKey.get(p)))];
  const headers = slots.map((key) => {
    const p = positions.find((x) => slotKey.get(x) === key);
    const parts = [];
    for (const cells of headerCells) {
      const t = cells.find((x) => x.start <= p && x.end > p);
      if (t && parts.at(-1) !== t.text) parts.push(t.text);
    }
    return parts.join(" ");
  });
  const out = [];
  for (const r of dataRows) {
    const label = labelOf(r);
    const values = new Array(slots.length).fill(null);
    for (const t of valuesOf(r)) {
      const i = slots.indexOf(slotKey.get(posOf(t)));
      values[i] = values[i] === null ? figure(t.text) : `${values[i]} ${t.text}`;
    }
    if (!label && values.every((v) => v === null)) continue;
    out.push([label ? label.text : "", ...values]);
  }
  // A header row's first cell is the table's own title ("Q3 FY27 Guidance Metrics").
  const heading = headRows.map((r) => r.raw[0]).filter((t) => t && t.start === left && t.text).map((t) => t.text).join(" / ");
  return { caption, ...(heading ? { heading } : {}), columns: ["line", ...headers], rows: out, ...(notes.length ? { notes } : {}) };
}

// Every table in a document, each with the text just above it as its caption (the heading or the
// sentence that introduces it), and where it sits in the document.
export function extractTables(html) {
  const s = String(html);
  const spans = tableSpans(s);
  const out = [];
  let prevEnd = 0;
  let title = null;
  spans.forEach(([a, b], i) => {
    // The caption: the last lines of text between the previous table and this one, or the title
    // a one-line table just above set (statements in press releases are titled that way).
    const before = htmlToText(s.slice(Math.max(prevEnd, a - 6000), a)).split("\n").map((l) => l.trim()).filter(Boolean);
    const text = before.slice(-2).join(" / ").slice(-300) || null;
    const caption = title && (!text || before.length <= 2) ? [title, text].filter(Boolean).join(" / ").slice(0, 300) : text;
    prevEnd = b;
    const t = parseTable(s.slice(a, b), caption);
    title = null;
    if (!t || !t.rows.length) return;
    if (t.columns.length === 1 && t.rows.length === 1 && String(t.rows[0][0]).length <= 160) { title = String(t.rows[0][0]); return; }
    out.push({ index: i, ...t });
  });
  return out;
}

// Search words: phrases in double quotes stay whole, other words are matched as word starts, so
// "membership" also finds "memberships" and "repurchase" finds "repurchases".
export function searchTerms(find) {
  const terms = [];
  const s = String(find ?? "").toLowerCase();
  for (const m of s.matchAll(/"([^"]+)"|([^\s"]+)/g)) {
    const t = (m[1] ?? m[2]).replace(/[^a-z0-9&%$.\- ]+/g, " ").trim();
    if (t.length > 1 && !STOP.has(t)) terms.push(t);
  }
  return terms;
}
const STOP = new Set(["the", "of", "and", "for", "in", "on", "to", "a", "an", "by", "per", "from", "with", "what", "how", "was", "is", "are", "its", "their"]);

const has = (text, term) => {
  const at = text.indexOf(term);
  if (at < 0) return false;
  // A word start: "share" is in "shares" and "share-based", not in "timeshare".
  for (let i = at; i >= 0; i = text.indexOf(term, i + 1)) if (i === 0 || !/[a-z0-9]/.test(text[i - 1])) return true;
  return false;
};

// How well a table matches: every term must appear in it (caption, headers or row labels);
// terms in the caption and in one row label together count most.
export function scoreTable(t, terms, name = "") {
  if (!terms.length) return 0;
  const title = `${name} ${t.caption ?? ""} ${(t.notes ?? []).join(" ")}`.toLowerCase();
  const head = t.columns.join(" ").toLowerCase();
  const labels = t.rows.map((r) => String(r[0]).toLowerCase());
  const all = `${title} ${head} ${labels.join(" ")}`;
  if (!terms.every((x) => has(all, x))) return 0;
  let score = 0;
  for (const x of terms) score += (has(title, x) ? 3 : 0) + (has(head, x) ? 2 : 0) + (labels.some((l) => has(l, x)) ? 1 : 0);
  if (labels.some((l) => terms.every((x) => has(l, x)))) score += 4 * terms.length;
  // A table of figures outranks a block of prose laid out as a table.
  const valued = t.rows.filter((r) => r.length > 1 && r.slice(1).some((v) => v !== null && v !== "")).length;
  return score + Math.min(2, valued / 3);
}

// Whether the words come together: all in the title (with any prose inside the table), all in
// the column headers, or all in one row's label. "paid members" is together in "Total paid
// members", scattered in a balance sheet with "Additional paid-in capital" and "membership fees".
export function together(t, terms, name = "") {
  const title = `${name} ${t.caption ?? ""} ${(t.notes ?? []).join(" ")}`.toLowerCase();
  const head = t.columns.join(" ").toLowerCase();
  return terms.every((x) => has(title, x)) || terms.every((x) => has(head, x)) || t.rows.some((r) => { const l = String(r[0]).toLowerCase(); return terms.every((x) => has(l, x)); });
}

// The rows to show from a matched table: all of it when its title names the terms, otherwise the
// rows whose labels carry a term, with the heading rows above them.
export function matchedRows(t, terms, name = "", max = 40) {
  const title = `${name} ${t.caption ?? ""}`.toLowerCase();
  if (terms.every((x) => has(title, x)) || t.rows.length <= 12) return { rows: t.rows.slice(0, max), all: t.rows.length <= max };
  const keep = new Set();
  t.rows.forEach((r, i) => {
    if (!terms.some((x) => has(String(r[0]).toLowerCase(), x))) return;
    keep.add(i);
    // The nearest heading row above (a label with no values) gives the line its context.
    for (let j = i - 1; j >= 0 && j >= i - 8; j--) if (r !== t.rows[j] && t.rows[j].slice(1).every((v) => v === null)) { keep.add(j); break; }
  });
  const rows = [...keep].sort((a, b) => a - b).map((i) => t.rows[i]);
  return rows.length ? { rows: rows.slice(0, max), all: false } : { rows: t.rows.slice(0, max), all: t.rows.length <= max };
}
