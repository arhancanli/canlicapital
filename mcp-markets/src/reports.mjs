// SEC's rendered XBRL reports ("R pages"): every statement, note table and detail table of a 10-K,
// 10-Q, 20-F or 40-F as the filing presents it. FilingSummary.xml lists them; each R page is one
// HTML table whose rows carry the company's label, the XBRL concept and the values, and whose
// title carries the units ("USD ($) shares in Thousands, $ in Thousands").
//
// Values are returned as the page shows them, never rescaled: the page's units say what they are
// in, and SEC's renderer already marks the rows that are not in them ("(in shares)", "(in USD per
// share)", "Number of states | states"). So every number here can be found on the page itself.
import { decodeEntities } from "./html.mjs";

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1]).trim() : null;
};

// The reports of a filing, in the filing's own order. "All Reports" (a book of every page) and
// reports without an HTML page (filings before SEC rendered HTML) are left out.
export function reportList(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<Report\b[^>]*>([\s\S]*?)<\/Report>/g)) {
    const file = tag(m[1], "HtmlFileName");
    if (!file || tag(m[1], "ReportType") === "Book") continue;
    out.push({ position: Number(tag(m[1], "Position")) || out.length + 1, name: tag(m[1], "ShortName") ?? file, category: tag(m[1], "MenuCategory"), file });
  }
  return out.sort((a, b) => a.position - b.position);
}

// What kind of statement a report is, from its name; parentheticals and anything else are null.
export function statementKind(name) {
  const n = String(name).toLowerCase().replace(/[’`]/g, "'");
  if (/parenthetical/.test(n)) return null;
  if (/cash flow/.test(n)) return "cash_flow";
  if (/(stockholders|shareholders|shareowners|owners|partners|members|unitholders)'? ?(equity|deficit|capital)|changes in (net assets|equity|capital)|statements? of equity|equity statements?/.test(n)) return "equity";
  if (/balance sheet|financial (position|condition)|statements? of condition|assets(,)? liabilities/.test(n)) return "balance_sheet";
  if (/comprehensive/.test(n) && !/operations|earnings|statements? of income and/.test(n)) return "comprehensive_income";
  if (/operations|income|earnings|(profit|loss)\b|revenues? and expenses/.test(n)) return "income";
  return null;
}

// The table that starts at `from`, to its own closing tag (R pages can hold tables inside cells:
// a note's text block, or the footnotes after the report).
function outerTable(s, from) {
  const re = /<(\/?)table\b[^>]*>/gi;
  re.lastIndex = from;
  let depth = 0, m;
  while ((m = re.exec(s))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return s.slice(from, m.index + m[0].length);
  }
  return s.slice(from);
}

const strip = (html) => {
  let t = String(html);
  for (let prev = null; prev !== t;) { prev = t; t = t.replace(/<[^>]*>/g, " "); }
  return decodeEntities(t.replace(/[<>]/g, " ")).replace(/[\s ​]+/g, " ").trim();
};

// The cells of one row: tag, class, spans, text, and the XBRL concept a label links to.
function cellsOf(rowHtml, inner) {
  const out = [];
  // A cell may close itself ("<td colspan=\"3\" />"); its content is then empty.
  for (const m of rowHtml.matchAll(/<(t[hd])\b([^>]*?)(?:\/>|>([\s\S]*?)<\/t[hd]>)/gi)) {
    const attrs = m[2];
    const html = m[3] ?? "";
    const num = (name) => Number(attrs.match(new RegExp(`${name}\\s*=\\s*"?(\\d+)`, "i"))?.[1] ?? 1) || 1;
    // A note's own tables sit inside its cell; they read as text.
    const body = html.replace(/\u0000(\d+)\u0000/g, (_, i) => ` ${inner[Number(i)]} `);
    const concept = html.match(/defref_([^'"\s)]+)/)?.[1] ?? null;
    // Footnote marks ("[1]") are references to the notes below the table, not part of the value.
    const marks = [...body.matchAll(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi)].map((x) => strip(x[1])).filter(Boolean);
    out.push({ th: m[1].toLowerCase() === "th", cls: attrs.match(/class\s*=\s*"([^"]*)"/i)?.[1] ?? "", colspan: Math.min(num("colspan"), 50), rowspan: Math.min(num("rowspan"), 10), text: strip(body.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "")), concept, marks });
  }
  return out;
}

const MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const DATE_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2}), (\d{4})\b/;
export function isoDate(text) {
  const m = String(text).match(DATE_RE);
  return m ? `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}` : null;
}

// One column's header ("12 Months Ended Dec. 31, 2025", "Dec. 31, 2025", "Common Stock [Member]").
export function columnOf(parts) {
  const label = parts.join(" ").replace(/\s+/g, " ").trim();
  const months = Number(label.match(/(\d+) Months? Ended/i)?.[1]) || null;
  const end = isoDate(label);
  const members = parts.filter((p) => !/Months? Ended/i.test(p) && !DATE_RE.test(p)).map((p) => p.replace(/\s*\[Member\]$/, "").trim()).filter(Boolean);
  return { label, ...(months ? { months } : {}), ...(end ? (months ? { end } : { instant: end }) : {}), ...(members.length ? { members } : {}) };
}

// The units in a report's title: "Consolidated Statements of Income - USD ($) shares in
// Millions, $ in Millions" -> title and units.
export function splitTitle(text) {
  const m = String(text).match(/^(.*?)\s+-\s+((?:[A-Z]{3}\s*\(.{1,5}\)|[$€£¥]\s*(?:\/|in\b)|shares\b|pure\b).*)$/);
  if (m) return { title: m[1].trim(), units: m[2].trim() };
  // Some titles have no dash before the units: NXP's "CONSOLIDATED BALANCE SHEETS € in Millions, $ in Millions".
  const bare = String(text).match(/^(.*?)\s+([$€£¥]\s+in\s+(?:thousands|millions|billions)\b.*)$/i);
  return bare ? { title: bare[1].trim(), units: bare[2].trim() } : { title: String(text).trim(), units: null };
}

// "$ 45,183,036" -> 45183036; "(776,510)" -> -776510; "21.0%" -> 21 with a percent flag; text stays text.
export function cellValue(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { value: null };
  const bare = t.replace(/^(?:[A-Z]{3}\s+)?[$€£¥]\s*/, "").replace(/\s+/g, "");
  const m = bare.match(/^(\()?([-−]?)(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?(\))?(%)?$/);
  if (m && (m[3] || m[4]) && Boolean(m[1]) === Boolean(m[5])) {
    const v = Number(`${m[3] ? m[3].replace(/,/g, "") : "0"}${m[4] ?? ""}`);
    return { value: m[1] || m[2] ? -v : v, ...(m[6] ? { percent: true } : {}) };
  }
  return { value: t };
}

// Rows that only structure the page ("Income Statement [Abstract]", "[Line Items]", "[Table]").
const STRUCTURE = /\[(Abstract|Line Items|Table|Axis|Domain|Roll Forward)\]$|\{Abstract\}$/i;

// One R page: title, units, the period (or member) of each column, and its rows.
export function parseReport(html) {
  let s = String(html);
  const start = s.search(/<table\b[^>]*class\s*=\s*"report"/i);
  if (start < 0) throw new Error("not a rendered XBRL report");
  let table = outerTable(s, start);
  // The footnotes ("[1] Includes billings to OEMs...") sit in a table in the report's last row.
  const footnotes = [];
  table = table.replace(/<table\b[^>]*class\s*=\s*"outerFootnotes"[^>]*>[\s\S]*?<\/table>/gi, (ft) => {
    for (const m of ft.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => strip(c[1]));
      if (cells.length >= 2 && /^\[\d+\]$/.test(cells[0])) footnotes.push([cells[0], cells.slice(1).join(" ").slice(0, 600)]);
    }
    return "";
  });
  // Tables inside cells (a note's text block) become placeholders, so rows split cleanly.
  const inner = [];
  const open = table.indexOf(">") + 1;
  let body = table.slice(open);
  for (;;) {
    const at = body.search(/<table\b/i);
    if (at < 0) break;
    const t = outerTable(body, at);
    if (t.length === body.length - at && !/<\/table>\s*$/i.test(t)) { body = body.slice(0, at); break; }
    inner.push(strip(t.replace(/<\/(td|th)>/gi, " | ").replace(/<\/tr>/gi, " ; ")));
    body = `${body.slice(0, at)}\u0000${inner.length - 1}\u0000${body.slice(at + t.length)}`;
  }
  const rows = [...body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].map((m) => ({ cls: m[1].match(/class\s*=\s*"([^"]*)"/i)?.[1] ?? "", cells: cellsOf(m[2], inner) }));
  const head = [];
  while (head.length < rows.length && rows[head.length].cells.length && rows[head.length].cells.every((c) => c.th)) head.push(rows[head.length]);
  if (!head.length) throw new Error("report has no header row");
  // The header grid, with column and row spans laid out.
  const grid = [], carry = [];
  head.forEach((row, r) => {
    grid[r] = [];
    let c = 0;
    const fill = () => { while (carry[c]?.left > 0) { grid[r][c] = carry[c].text; carry[c].left--; c++; } };
    for (const cell of row.cells) {
      fill();
      for (let k = 0; k < cell.colspan; k++) {
        grid[r][c + k] = cell.text;
        if (cell.rowspan > 1) carry[c + k] = { text: cell.text, left: cell.rowspan - 1 };
      }
      c += cell.colspan;
    }
    fill();
  });
  const { title, units } = splitTitle(grid[0][0] ?? "");
  // The title cell spans the label column and, on pages with footnotes, the column of their marks.
  const labelSpan = head[0].cells[0]?.colspan ?? 1;
  const width = Math.max(...grid.map((g) => g.length));
  const columns = [];
  for (let c = labelSpan; c < width; c++) {
    const parts = [];
    for (const g of grid) if (g[c] && parts.at(-1) !== g[c]) parts.push(g[c]);
    columns.push(columnOf(parts));
  }
  const out = [];
  for (const row of rows.slice(head.length)) {
    const [first, ...others] = row.cells;
    if (!first || first.th) continue;
    const markCells = others.slice(0, labelSpan - 1);
    const rest = others.slice(labelSpan - 1);
    const marks = [...first.marks, ...markCells.flatMap((c) => [...c.marks, c.text].filter(Boolean))].filter((x) => /^\[\d+\]$/.test(x));
    const label = first.text.replace(/\s*\[\d+\]$/, "");
    // Footnote rows after the report repeat no label and no concept.
    if (!label && !first.concept) continue;
    const member = Boolean(first.concept?.includes("=")) || /\brh\b/.test(row.cls);
    const values = rest.slice(0, columns.length).map((c) => cellValue(c.text));
    while (values.length < columns.length) values.push({ value: null });
    const empty = values.every((v) => v.value === null);
    if (empty && STRUCTURE.test(label)) continue;
    const percent = values.some((v) => v.percent);
    out.push({
      label: percent && !/%|percent/i.test(label) ? `${label} (%)` : label,
      concept: first.concept && !member ? first.concept.replace(/^([a-z][a-z0-9-]*)_/i, "$1:") : null,
      ...(empty ? { section: true } : {}),
      ...(member ? { member: true } : {}),
      ...(marks.length ? { notes: marks } : {}),
      values: values.map((v) => v.value),
    });
  }
  return { title, units, columns, rows: out, ...(footnotes.length ? { footnotes } : {}) };
}
