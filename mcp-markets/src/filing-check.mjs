// filing_check: every number in a filing, read twice. A 10-K or 10-Q filed in inline XBRL is one
// document read two ways: a person reads each figure as shown, in the unit the text or table states for
// it; a machine reads the tag on it. This lists where the two disagree: a figure tagged at a scale other
// than the one stated for it, the same fact tagged twice with different values, a sum in the filing's
// calculation linkbase that does not add up, and a fact SEC's company facts hold differently or not at all.
import { z } from "zod";

import { decodeEntities } from "./html.mjs";
import { archiveBase, filings, getJson, getText, NotFound, pad10, resolveEntity } from "./sources.mjs";
import { parseCalculations } from "./trace.mjs";
import { all, child, children, parseXml } from "./xml.mjs";

// ---------------------------------------------------------------------------------------------
// Reading the document
// ---------------------------------------------------------------------------------------------

const attrsOf = (s) => {
  const out = {};
  for (const m of String(s).matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3]);
  return out;
};
const squash = (s) => s.replace(/[\s ​]+/g, " ").trim();
const local = (qname) => String(qname).trim().replace(/^.*:/, "");

// Contexts and units from the document's hidden header: each context's period and dimensions, each
// unit's name (as SEC's company facts write it) and kind.
export function readResources(xml) {
  const root = parseXml(xml);
  const contexts = new Map(), units = new Map(), kinds = new Map();
  for (const c of all(root, "context")) {
    const p = child(c, "period");
    const dims = [
      ...all(c, "explicitMember").map((m) => `${local(m.attrs.dimension ?? "")}=${local(m.text)}`),
      ...all(c, "typedMember").map((m) => `${local(m.attrs.dimension ?? "")}=${squash(m.children.map((x) => x.text).join(" ") || m.text)}`),
    ].sort();
    const start = child(p, "startDate")?.text.trim() ?? null, end = child(p, "endDate")?.text.trim() ?? null, instant = child(p, "instant")?.text.trim() ?? null;
    contexts.set(c.attrs.id, { start, end: end ?? instant, dims });
  }
  // parseXml drops prefixes from element names, not from text: a measure reads "iso4217:USD".
  for (const u of all(root, "unit")) {
    const div = child(u, "divide");
    const measures = (el) => children(el, "measure").map((m) => m.text.trim());
    const [num, den] = div ? [measures(child(div, "unitNumerator")), measures(child(div, "unitDenominator"))] : [measures(u), []];
    const name = (list) => list.map(local).join("*");
    units.set(u.attrs.id, den.length ? `${name(num)}/${name(den)}` : name(num));
    const one = (list, re) => list.length === 1 && re.test(list[0]);
    kinds.set(u.attrs.id, !den.length && one(num, /^iso4217:/) ? "money" : !den.length && one(num, /^xbrli:shares$/) ? "shares" : !den.length && one(num, /^xbrli:pure$/) ? "pure" : one(num, /^iso4217:/) && one(den, /^xbrli:shares$/) ? "per_share" : null);
  }
  return { contexts, units, kinds };
}

const WORDS = { no: 0, none: 0, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// "twenty-five", "one hundred", "no": numbers in words, as SEC's numwordsen transform reads them.
function wordsToNumber(text) {
  const words = text.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter((w) => w && w !== "and");
  if (!words.length) return null;
  let total = 0, part = 0;
  for (const w of words) {
    if (Object.hasOwn(WORDS, w)) part += WORDS[w];
    else if (w === "hundred") part = (part || 1) * 100;
    else if (w === "thousand") { total += (part || 1) * 1000; part = 0; }
    else return null;
  }
  return String(total + part);
}

// A fact's displayed text as the decimal it stands for, before scale and sign: "1,234.5" -> "1234.5".
// Null for a transform this reader does not know; such facts are counted, not guessed at.
export function displayedNumber(text, format) {
  const t = squash(text);
  const f = local(format ?? "").toLowerCase();
  const decimal = (s) => (/^\d+(\.\d*)?$|^\.\d+$/.test(s) ? s.replace(/\.$/, "") : null);
  if (!f) return /^\d+(\.\d+)?$|^\.\d+$/.test(t) ? t : null;
  if (/^(fixed-zero|zerodash|numdash|fixedzero)$/.test(f)) return "0";
  if (/^(num-dot-decimal|numdotdecimal|numcommadot|num-dot-decimal-apos|numspacedot)$/.test(f)) return decimal(t.replace(/[,\s'’]/g, ""));
  if (/^(num-comma-decimal|numcommadecimal|numdotcomma|numspacecomma|num-comma-decimal-apos)$/.test(f)) return decimal(t.replace(/[.\s'’]/g, "").replace(",", "."));
  if (/^(numwordsen|num-word-en)$/.test(f)) return wordsToNumber(t);
  return null;
}

// A decimal string times ten to the scale, as a number, without the float error of multiplying.
export function scaled(decimal, scale) {
  const [whole, frac = ""] = decimal.split(".");
  let d = `${whole}${frac}`, point = whole.length + scale;
  if (point <= 0) { d = "0".repeat(1 - point) + d; point = 1; }
  if (point > d.length) d += "0".repeat(point - d.length);
  return Number(`${d.slice(0, point)}.${d.slice(point) || "0"}`);
}

// Each fact's value as tagged: the displayed number times ten to its scale, with its sign. Null for a
// nil fact; undefined for one whose format this reader does not know.
export function valueOf(f) {
  if (f.nil) return null;
  const d = displayedNumber(f.text, f.format);
  if (d === null) return undefined;
  const v = scaled(d, f.scale);
  return v === 0 ? 0 : f.sign * v;
}

// The document as a person sees it: blocks of text, and tables of rows of cells, with every
// ix:nonFraction in them (nested ones too: each tag on a figure is a fact of its own). Facts in the
// hidden header are read but have no place on the page. One pass over the tags; a "<" that opens no
// tag is skipped at the next "<" or ">", so a stray one costs nothing.
const BLOCK = new Set(["p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "center", "section", "article", "hr"]);
const UNSEEN = new Set(["head", "style", "script", "title"]);
export function readDocument(html) {
  const s = String(html);
  const head = s.search(/<ix:header\b/i), headEnd = head < 0 ? -1 : s.indexOf("</ix:header>", head);
  const a0 = head < 0 ? -1 : s.indexOf("<ix:resources", head), b0 = a0 < 0 ? -1 : s.indexOf("</ix:resources>", a0);
  const { contexts, units, kinds } = readResources(a0 >= 0 && b0 > a0 && b0 < headEnd ? s.slice(a0, b0 + 15) : "");
  const facts = [], blocks = [], tables = [];
  // A block remembers the table that comes after it, so each table knows the lines above it.
  let block = { text: "", facts: [] };
  const endBlock = () => { const t = squash(block.text); if (t || block.facts.length) blocks.push({ text: t, facts: block.facts, next_table: tables.length }); block = { text: "", facts: [] }; };
  let table = null, row = null, cell = null, depth = 0, hidden = 0, unseen = 0;
  const open = [];
  // Facts just closed, collecting the text after them to the end of their cell or block.
  let trailing = [];
  // Cells are placed in the table's grid: a cell spans its colspan, and a cell spanning rows keeps its
  // columns taken in the rows below it.
  const newRow = () => {
    const busy = new Set();
    table.carry.forEach((n, col) => { if (n > 0) { busy.add(col); table.carry[col] = n - 1; } });
    return { cells: [], width: 0, busy };
  };
  const re = /<!--[\s\S]*?-->|<[?!][^<>]*>|<(\/?)([a-zA-Z][\w:.-]*)([^<>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[4] !== undefined) {
      if (unseen) continue;
      const text = decodeEntities(m[4]);
      for (const f of open) f.text += text;
      // The hidden header's text (its contexts' dates and identifiers) is no one's to read.
      if (hidden) continue;
      if (cell) cell.text += text; else block.text += text;
      // Kept short: the words right after a figure are all that is read, and a long run of spaces would
      // cost the patterns that read them time.
      if (trailing.length) { for (const f of trailing) f.after = (f.after + text).slice(0, 60); trailing = trailing.filter((f) => f.after.length < 40); }
      continue;
    }
    if (!m[2]) continue;
    const name = m[2].toLowerCase(), closing = Boolean(m[1]), selfClosing = /\/\s*$/.test(m[3]);
    if (UNSEEN.has(name)) { if (closing) unseen = Math.max(0, unseen - 1); else if (!selfClosing) unseen += 1; continue; }
    if (name === "ix:header") { if (closing) hidden = Math.max(0, hidden - 1); else if (!selfClosing) hidden += 1; continue; }
    if (name === "ix:nonfraction") {
      if (closing) {
        const f = open.pop();
        if (f) { f.text = squash(f.text); trailing.push(f); }
        continue;
      }
      const a = attrsOf(m[3]);
      const f = {
        index: facts.length, id: a.id ?? null, name: a.name ?? "", contextRef: a.contextref ?? "", unitRef: a.unitref ?? "",
        decimals: a.decimals === undefined || a.decimals === "INF" ? null : Number(a.decimals), scale: Number(a.scale ?? 0) || 0,
        sign: a.sign === "-" ? -1 : 1, format: a.format ?? null, nil: Object.entries(a).some(([k, v]) => /(?:^|:)nil$/.test(k) && v === "true"),
        text: "", after: "", hidden: hidden > 0, table: null, row: null, col: null, span: null, block: null,
      };
      facts.push(f);
      if (!f.hidden && cell && table) { f.table = table.index; f.row = table.rows.length; f.col = cell.col; f.span = cell.span; cell.facts.push(f.index); }
      else if (!f.hidden) { f.block = blocks.length; block.facts.push(f.index); }
      if (selfClosing) f.nil = true; else open.push(f);
      continue;
    }
    if (hidden || unseen) continue;
    if (name === "table") {
      if (closing) {
        depth = Math.max(0, depth - 1);
        if (depth === 0 && table) { if (row) table.rows.push(row); tables.push(table); table = null; row = null; cell = null; }
      } else if (!selfClosing) {
        if (depth === 0) { endBlock(); trailing = []; table = { index: tables.length, rows: [], carry: [] }; }
        depth += 1;
      }
      continue;
    }
    if (table && depth === 1 && name === "tr") {
      if (row) table.rows.push(row);
      row = closing ? null : newRow();
      cell = null; trailing = [];
      continue;
    }
    if (table && depth === 1 && (name === "td" || name === "th")) {
      trailing = [];
      if (closing) { cell = null; continue; }
      row ??= newRow();
      const at = attrsOf(m[3]);
      const span = Math.max(1, Math.min(50, Number(at.colspan ?? 1) || 1)), down = Math.max(1, Math.min(50, Number(at.rowspan ?? 1) || 1));
      let col = row.width;
      while (row.busy.has(col)) col += 1;
      const c = { text: "", col, span, facts: [] };
      row.width = col + span;
      if (down > 1) for (let k = col; k < col + span; k += 1) table.carry[k] = down - 1;
      row.cells.push(c);
      cell = selfClosing ? null : c;
      continue;
    }
    if (!table && BLOCK.has(name)) { endBlock(); trailing = []; }
  }
  endBlock();
  if (table) { if (row) table.rows.push(row); tables.push(table); }
  for (const t of tables) { delete t.carry; for (const r of t.rows) { delete r.busy; for (const c of r.cells) c.text = squash(c.text); } }
  return { contexts, units, kinds, facts, blocks, tables };
}

// ---------------------------------------------------------------------------------------------
// The unit stated for a figure
// ---------------------------------------------------------------------------------------------

const SCALE_WORDS = { thousand: 3, thousands: 3, million: 6, millions: 6, billion: 9, billions: 9, trillion: 12, trillions: 12 };
const SCALE_NAMES = { "-4": "basis points", "-2": "per cent", 0: "units", 3: "thousands", 6: "millions", 9: "billions", 12: "trillions" };
export const scaleName = (s) => SCALE_NAMES[s] ?? `10^${s}`;
// "in millions", "in $ millions", "in thousands of U.S. dollars": a scale someone states.
const IN_SCALE = /\b(?:in\s+(?:(?:U\.?S\.?\s*)?\$\s*|US\$\s*|(?:U\.?S\.?\s+)?dollars\s+)?(thousands|millions|billions)\b|(thousands|millions|billions)\s+of\s+(?:U\.?S\.?\s+)?dollars\b)/gi;
// What a scale can be stated for that is neither money nor shares.
const OTHER_SUBJECT = /\b(square\s+feet|sq\.?\s*ft|feet|acres|barrels|bbls?|tons|tonnes|ounces|units|employees|headcount|customers|subscribers|members|accounts|users|people|stores|locations|vehicles|cars|devices|days|years|months|hours|megawatts|mw|gallons|cubic|loans|contracts|transactions|trades|clients|policies|patients|beds|rooms|miles|kilometers)\b/i;
const SHARES_SUBJECT = /\b(?:shares?|share\s+(?:data|amounts?|counts?|numbers?)|number\s+of\s+(?:common\s+)?shares|stock\s+options?|options|rsus?|psus?|awards|units\s+of\s+(?:common\s+)?stock)\b/i;
const PER_SHARE = /\bper[\s-]+(?:common\s+)?(?:share|unit)\b|\bper-share\b/i;

// What one statement of units says: the scale of money and of share counts. "(In millions, except
// number of shares, which are reflected in thousands, and per-share amounts)" is money in millions and
// shares in thousands; "(in millions, except share data)" leaves share counts without a scale (null).
export function readUnitPhrase(text) {
  const t = String(text).replace(/\s+/g, " ");
  const hits = [...t.matchAll(IN_SCALE)];
  if (!hits.length) return null;
  const out = { text: t.trim(), money: undefined, shares: undefined };
  let base;
  hits.forEach((h, i) => {
    const scale = SCALE_WORDS[(h[1] ?? h[2]).toLowerCase()];
    // The words this scale is stated for: those since the clause before.
    const from = i ? hits[i - 1].index + hits[i - 1][0].length : 0;
    const subject = t.slice(from, h.index).replace(/,?\s*(?:which|that)\s+(?:are|is)\s*(?:reflected|presented|shown|stated|expressed)?\s*$/i, "")
      .split(/\bexcept\b|[;:]|,\s*(?:and\s+)?(?=[a-z])|\band\b/i).pop().replace(/[(),]/g, " ").trim();
    const ofDollars = Boolean(h[2]) || /^\s+of\s+(?:U\.?S\.?\s+)?dollars\b/i.test(t.slice(h.index + h[0].length));
    if (!subject || /^(?:amounts?|figures|all\s+amounts?|dollars?(?:\s+amounts?)?|\$|(?:tabular\s+)?amounts?\s+(?:are\s+)?|in)$/i.test(subject)) {
      if (base === undefined) base = scale;
      out.money ??= scale;
      if (!/dollars?|\$/i.test(subject) && !ofDollars) out.shares ??= scale;
    } else if (SHARES_SUBJECT.test(subject) && !PER_SHARE.test(subject)) out.shares = scale;
    else if (!OTHER_SUBJECT.test(subject) && !PER_SHARE.test(subject)) out.money ??= scale;
  });
  // Share counts named as an exception, with no scale of their own, are not in the stated one.
  const except = t.split(/\bexcept\b/i).slice(1).join(" ");
  if (except && base !== undefined && out.shares === base && SHARES_SUBJECT.test(except.replace(PER_SHARE, " ")) && ![...except.matchAll(IN_SCALE)].length) out.shares = null;
  return out.money === undefined && out.shares === undefined ? null : out;
}

// A statement of units in a line or cell: a parenthesis that holds one ("(In millions, except per share
// amounts)", "... as follows (in millions):"), or a short line that is nothing else ("Dollars in millions").
export function unitStatement(text) {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (!t) return null;
  let found = null;
  for (const m of t.matchAll(/\(([^()]{0,240})\)/g)) found = readUnitPhrase(m[1]) ?? found;
  if (found) return found;
  if (t.length <= 140 && /^\(?\s*(?:(?:\$|US\$|€|£)\s|(?:dollars|amounts|all amounts|in|tabular|figures|shares|notional|[A-Z][a-z]+(?: [a-z]+)? in)\b)/i.test(t)) return readUnitPhrase(t);
  return null;
}

const FOOTER = /^(?:\d{1,3}|page \d+|table of contents|part [iv]+|item \d+[a-c]?\.?|.{0,80}\|\s*\d{1,3})$/i;
const isHeading = (t) => t.length >= 3 && t.length <= 120 && !FOOTER.test(t) && !/[.:;]$/.test(t) && !/\bwww\.|https?:/i.test(t)
  && (t.match(/[A-Za-z]/g) ?? []).length > (t.match(/\d/g) ?? []).length && !unitStatement(t);
// A table's footnote under it: "(1) China includes Hong Kong and Taiwan.", "(a)Represents ...".
const FOOTNOTE = /^(?:\(\s*(?:\d{1,2}|[a-z])\s*\)|\*{1,3}|\d{1,2}\s)\s*\S/;
const clip = (t, n = 160) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
// A row's label: its first cell with words in it.
const rowLabel = (t, i) => t.rows[i]?.cells.find((c) => /[A-Za-z]/.test(c.text))?.text ?? null;

// The units each table states, from the widest to the narrowest: the lines just above it (or, for a
// table that only goes on from the one before, that table's); its heading rows, for the whole table
// when the statement sits over the labels, else for the columns it heads; and rows inside it that head
// what follows ("Shares (in thousands):"). Also a title for each table.
export function tableUnits(doc) {
  const above = doc.tables.map(() => []);
  for (const b of doc.blocks) if (b.next_table < above.length) above[b.next_table].push(b);
  const length = (list) => list.reduce((n, b) => n + b.text.length, 0);
  const out = [];
  for (const t of doc.tables) {
    const width = Math.max(1, ...t.rows.map((r) => r.width));
    const first = t.rows.findIndex((r) => r.cells.some((c) => c.facts.length));
    const head = first < 0 ? [] : t.rows.slice(0, first);
    // The labels' column: where the rows with figures start their words.
    const labels = t.rows.slice(Math.max(first, 0)).map((r) => r.cells.find((c) => /[A-Za-z]/.test(c.text))?.col).filter((c) => c !== undefined);
    const left = labels.length ? Math.min(...labels) : 0;
    let table = null;
    const columns = [];
    for (const r of head) for (const c of r.cells) {
      const u = c.text ? unitStatement(c.text) : null;
      if (!u) continue;
      if (c.col <= left || c.span >= 0.8 * width) table ??= { ...u, where: "the table's heading" };
      else columns.push({ from: c.col, to: c.col + c.span, unit: { ...u, where: "the column's heading" } });
    }
    const sections = [];
    if (first >= 0) t.rows.forEach((r, i) => {
      if (i < first || r.cells.some((c) => c.facts.length)) return;
      const u = unitStatement(r.cells.map((c) => c.text).filter(Boolean).join(" "));
      if (u) sections.push({ row: i, unit: { ...u, where: "a heading row in the table" } });
    });
    const lines = above[t.index];
    let caption = null;
    for (const b of lines.slice(-3).reverse()) { const u = unitStatement(b.text); if (u) { caption = { ...u, where: "the line above the table" }; break; } }
    // The table before with figures in it (a table of footnotes or a page footer between them is passed
    // over), and what separates the two. Its unit carries over only past headings, page footers and its
    // own footnotes: a sentence ("Lease costs were as follows:") introduces a table of its own.
    let prev = out[t.index - 1], between = [...lines];
    while (prev && prev.first < 0 && out[prev.index - 1]) { between = [...above[prev.index], ...between]; prev = out[prev.index - 1]; }
    const passable = between.every((b) => FOOTER.test(b.text) || isHeading(b.text) || FOOTNOTE.test(b.text)) && length(between) < 250;
    // A table that says it goes on from another ("(table continued from previous page)") is that table,
    // whatever footnotes and page breaks sit between them.
    const continued = [...head.flatMap((r) => r.cells.map((c) => c.text)), lines.at(-1)?.text ?? ""].some((x) => x.length < 80 && /\bcontinued\b/i.test(x));
    const before = prev && (passable || continued) ? (prev.table ?? prev.caption ?? prev.inherited) : null;
    const inherited = !table && !caption && before ? { ...before, where: before.where.endsWith("of the table before") ? before.where : `${before.where} of the table before` } : null;
    // A title the table gives itself in its first row ("Securities registered pursuant to Section 12(b)
    // of the Act:"), else the nearest heading above it, else the line just above it.
    const own = head.map((r) => r.cells.filter((c) => c.text)).find((cells) => cells.length);
    const ownTitle = own?.length === 1 && own[0].text.length >= 25 && /[a-z]/.test(own[0].text) && !unitStatement(own[0].text) && !/\b(?:19|20)\d{2}\b/.test(own[0].text) ? own[0].text.replace(/:$/, "") : null;
    const title = ownTitle ?? [...lines].reverse().find((b) => isHeading(b.text))?.text ?? (lines.length ? clip(lines.at(-1).text) : null) ?? (passable || continued ? prev?.title : null) ?? null;
    out.push({ index: t.index, first, table, columns, sections, caption, inherited, title });
  }
  return out;
}

// The words after a figure that state its scale ("$3.8 billion", "$450M"), and a rate's per cent or
// basis points sign, in its own cell or the next one.
const SHORT_SCALE = { k: 3, m: 6, mm: 6, mn: 6, b: 9, bn: 9 };
const scaleAfter = (text) => {
  const m = String(text).match(/^\s*\)?\s*(?:(thousand|million|billion|trillion)s?\b|(bn|mn|mm|[kmb])(?![\w&-]))/i);
  return !m ? undefined : m[1] ? SCALE_WORDS[m[1].toLowerCase()] : SHORT_SCALE[m[2].toLowerCase()];
};
const percentAfter = (text) => (/^\s*\)?\s*%/.test(text) ? -2 : /^\s*\)?\s*(?:bps|basis points)\b/i.test(text) ? -4 : undefined);
const firstWord = (text) => String(text).trim().split(/\s+/)[0] ?? "";

// The unit stated for one money or share figure in a table: its row's label, a heading row above it in
// the table, its column's heading, then the table's own statement, the lines above and the table it
// continues. When the first three disagree the figure is left out: which one governs is not clear.
function tableLevel(t, u, f, kind) {
  const label = rowLabel(t, f.row);
  const row = label ? unitStatement(label) : null;
  const section = u.sections.filter((x) => x.row < f.row).at(-1)?.unit ?? null;
  const columns = u.columns.filter((c) => c.from < f.col + (f.span ?? 1) && c.to > f.col).map((c) => c.unit);
  const near = [row && { ...row, where: "the row's label" }, section, ...columns].filter((x) => x && x[kind] !== undefined);
  if (new Set(near.map((x) => x[kind])).size > 1) return { ambiguous: true };
  return near[0] ?? [u.table, u.caption, u.inherited].find((x) => x && x[kind] !== undefined) ?? null;
}

// Each figure shown in the document whose stated unit can be read, set against the scale it is tagged
// at. Zero is zero at any scale, so zeros are left out.
export function scaleCheck(doc, units = tableUnits(doc)) {
  const findings = [];
  const counts = { compared: 0, money: 0, shares: 0, per_share: 0, percent: 0, not_compared_no_stated_unit: 0, not_compared_unclear: 0 };
  for (const f of doc.facts) {
    if (f.hidden || f.nil) continue;
    const v = valueOf(f);
    if (v === undefined || v === 0) continue;
    const kind = doc.kinds.get(f.unitRef) ?? null;
    if (!kind) continue;
    const t = f.table === null ? null : doc.tables[f.table];
    const word = scaleAfter(f.after);
    let expected, stated;
    if (word !== undefined) { expected = word; stated = { text: `${f.text} ${firstWord(f.after)}`, where: "the words after the figure" }; }
    else if (kind === "money" || kind === "shares") {
      // "48,700 shares" in a sentence: a whole count followed by the word shares is a count of shares.
      // A table's stated unit covers the words in its rows ("50,400,000 shares authorized" under "number
      // of shares, which are reflected in thousands"), so this is for sentences only. A sentence's money
      // with no scale after it is not read: a filing can state once, for a whole section, that its
      // amounts are in millions (RBC Bearings' notes write "$1,375.1").
      if (!t) {
        if (kind !== "shares" || !/^[\d,]+$/.test(f.text) || !/^\s*(?:(?:common|ordinary|class [a-z])\s+)?shares?\b/i.test(f.after)) continue;
        expected = 0; stated = { text: `${f.text} ${firstWord(f.after)}`, where: "the words after the figure" };
      } else {
        const level = tableLevel(t, units[f.table], f, kind);
        if (level?.ambiguous) { counts.not_compared_unclear += 1; continue; }
        if (!level) { counts.not_compared_no_stated_unit += 1; continue; }
        if (level[kind] === null) { counts.not_compared_unclear += 1; continue; }
        expected = level[kind]; stated = level;
      }
    } else if (kind === "per_share") {
      // An amount per share is in units (cents when it says so), whatever scale the table states.
      if (!t && !/^\s*per\b/i.test(f.after)) continue;
      const cents = /^\s*(?:¢|cents?\b)/i.test(f.after);
      expected = cents ? -2 : 0; stated = { text: cents ? `${f.text} ${firstWord(f.after)}` : "per share", where: cents ? "the words after the figure" : "its unit (an amount per share)" };
    } else {
      const next = t ? t.rows[f.row].cells.filter((c) => c.col > f.col).find((c) => c.text)?.text ?? "" : "";
      expected = percentAfter(f.after) ?? (t && !f.after.trim() ? percentAfter(next) : undefined);
      if (expected === undefined) continue;
      stated = { text: expected === -2 ? `${f.text}%` : `${f.text} basis points`, where: "the sign after the figure" };
    }
    counts.compared += 1;
    counts[kind === "pure" ? "percent" : kind] += 1;
    if (f.scale !== expected) findings.push({ kind: "scale", fact: f, value: v, stated, expected });
  }
  return { findings, counts };
}

// ---------------------------------------------------------------------------------------------
// The same fact tagged twice, sums, and SEC's company facts
// ---------------------------------------------------------------------------------------------

// Half a unit in the last place a fact states: the most its rounding can move it. INF (exact) allows
// only floating-point error.
export const halfUnit = (d) => (d === null || d === undefined || !Number.isFinite(d) ? 1e-9 : 0.5 * 10 ** -d);
const contextKey = (c) => `${c.start ?? ""}|${c.end ?? ""}|${c.dims.join(",")}`;

// Two values of one fact agree when the more precise one, rounded to the other's decimals, is the other:
// they are no further apart than half a unit in the less precise one's last place. 617.4 million and
// 617 million in millions agree; 1,234 and 1,235 in millions do not.
const agree = (a, b) => Math.abs(a.value - b.value) <= Math.max(halfUnit(a.f.decimals), halfUnit(b.f.decimals)) + 1e-9 * Math.max(1, Math.abs(a.value));

// Every fact with a value, grouped by concept, context (its period and dimensions, whatever its id)
// and unit. A group of two or more is a fact tagged more than once; differ holds two of its tags that
// disagree, if any do.
export function groupFacts(doc) {
  const groups = new Map();
  for (const f of doc.facts) {
    const c = doc.contexts.get(f.contextRef);
    const value = valueOf(f);
    if (!c || value === null || value === undefined) continue;
    const unit = doc.units.get(f.unitRef) ?? null;
    const key = `${f.name}#${contextKey(c)}#${unit ?? f.unitRef}`;
    (groups.get(key) ?? groups.set(key, { key, name: f.name, context: c, unit, facts: [], differ: null }).get(key)).facts.push({ f, value });
  }
  for (const g of groups.values()) {
    for (let i = 0; i < g.facts.length && !g.differ; i += 1) for (let j = i + 1; j < g.facts.length; j += 1) if (!agree(g.facts[i], g.facts[j])) { g.differ = [g.facts[i], g.facts[j]]; break; }
  }
  return groups;
}

export function duplicateCheck(groups) {
  const findings = [];
  let tagged = 0, tags = 0;
  for (const g of groups.values()) {
    if (g.facts.length < 2) continue;
    tagged += 1; tags += g.facts.length;
    if (g.differ) findings.push({ kind: "duplicate", fact: g.differ[0].f, value: g.differ[0].value, other: g.differ[1].f, other_value: g.differ[1].value, tags: g.facts.length });
  }
  return { findings, counts: { facts_tagged_more_than_once: tagged, tags_on_them: tags } };
}

// The calculation linkbase's sums, each recomputed in every context where its total has a value. A
// missing line counts as zero, as XBRL's calculation rules have it; a sum that then falls short is
// incomplete (the line may be filed only split by member), not flagged. A fact tagged twice with
// different values leaves its sums unchecked.
export function sumCheck(groups, links) {
  // The linkbase names concepts without their prefix (as trace.mjs reads it); a name two prefixes share
  // is left out.
  const byLocal = new Map(), names = new Map(), totals = new Map();
  for (const g of groups.values()) {
    const name = local(g.name);
    (names.get(name) ?? names.set(name, new Set()).get(name)).add(g.name);
    byLocal.set(`${name}#${contextKey(g.context)}#${g.unit}`, g);
    (totals.get(name) ?? totals.set(name, []).get(name)).push(g);
  }
  const single = (name) => names.get(name)?.size === 1;
  const parents = new Map();
  for (const l of links) for (const a of l.arcs) {
    const k = `${l.role}#${a.parent}`;
    const p = parents.get(k) ?? parents.set(k, { role: l.role, parent: a.parent, arcs: [] }).get(k);
    if (!p.arcs.some((b) => b.child === a.child)) p.arcs.push(a);
  }
  // A fact tagged more than once (consistently) is taken at its most precise tag: a table's 338,745
  // thousand rather than the text's "$339 million".
  const precise = (grp) => grp.facts.reduce((b, x) => (halfUnit(x.f.decimals) < halfUnit(b.f.decimals) ? x : b));
  const findings = [];
  const counts = { checked: 0, adding_up: 0, incomplete: 0, not_adding_up: 0, not_checked_duplicates_differ: 0 };
  const done = new Set();
  for (const p of parents.values()) {
    if (!single(p.parent)) continue;
    for (const g of totals.get(p.parent) ?? []) {
      const ctx = contextKey(g.context);
      const lines = p.arcs.map((a) => ({ a, g: single(a.child) ? byLocal.get(`${a.child}#${ctx}#${g.unit}`) : undefined }));
      const held = lines.filter((x) => x.g);
      if (!held.length) continue;
      // One check per total, context and set of lines, however many reports repeat the calculation.
      const sig = `${g.key}#${p.arcs.map((a) => `${a.child}*${a.weight}`).sort().join(",")}`;
      if (done.has(sig)) continue;
      done.add(sig);
      if (g.differ || held.some((x) => x.g.differ)) { counts.not_checked_duplicates_differ += 1; continue; }
      counts.checked += 1;
      const top = precise(g), parts = held.map((x) => ({ ...x, p: precise(x.g) }));
      const sum = parts.reduce((n, x) => n + x.a.weight * x.p.value, 0);
      const tolerance = parts.reduce((n, x) => n + halfUnit(x.p.f.decimals), halfUnit(top.f.decimals));
      if (Math.abs(sum - top.value) <= tolerance + 1e-9 * Math.max(1, Math.abs(top.value))) { counts.adding_up += 1; continue; }
      if (held.length < lines.length) { counts.incomplete += 1; continue; }
      counts.not_adding_up += 1;
      findings.push({ kind: "sum", fact: top.f, value: top.value, sum, difference: sum - top.value, tolerance, role: p.role, lines: parts.map((x) => ({ concept: x.g.name, weight: x.a.weight, value: x.p.value, displayed: x.p.f.text })) });
    }
  }
  return { findings, counts };
}

// SEC's company facts for the filing's accession, set against its facts without dimensions (the only
// ones company facts hold) in the taxonomies company facts has for the company.
export function companyFactsCheck(groups, cf, accession) {
  const held = new Map();
  let rows = 0;
  for (const [taxonomy, concepts] of Object.entries(cf?.facts ?? {})) {
    for (const [concept, body] of Object.entries(concepts ?? {})) {
      for (const [unit, list] of Object.entries(body?.units ?? {})) {
        for (const r of Array.isArray(list) ? list : []) {
          if (r?.accn !== accession) continue;
          rows += 1;
          const key = `${taxonomy}:${concept}#${r.start ?? ""}|${r.end ?? ""}#${unit}`;
          (held.get(key) ?? held.set(key, []).get(key)).push(r.val);
        }
      }
    }
  }
  const counts = { compared: 0, same: 0, different: 0, missing: 0, rows_for_this_filing: rows };
  const findings = [];
  if (!rows) return { findings, counts, unavailable: true };
  const taxonomies = new Set(Object.keys(cf.facts));
  for (const g of groups.values()) {
    if (g.context.dims.length || !taxonomies.has(g.name.split(":")[0])) continue;
    counts.compared += 1;
    // Company facts write a period that starts and ends on one day as a moment, with no start.
    const c = g.context;
    const key = `${g.name}#${c.start && c.start !== c.end ? c.start : ""}|${c.end ?? ""}#${g.unit}`;
    const vals = held.get(key), first = g.facts[0];
    if (!vals) { counts.missing += 1; findings.push({ kind: "company_facts_missing", fact: first.f, value: first.value }); continue; }
    if (g.facts.some((x) => vals.some((v) => Math.abs(v - x.value) <= 1e-9 * Math.max(1, Math.abs(v))))) { counts.same += 1; continue; }
    counts.different += 1;
    findings.push({ kind: "company_facts_value", fact: first.f, value: first.value, company_facts: vals });
  }
  return { findings, counts, unavailable: false };
}

// ---------------------------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------------------------

export const checkInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple)."),
  form: z.enum(["10-K", "10-Q"]).optional().describe("10-K (default) or 10-Q."),
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/, "an accession number such as 0000320193-25-000079").optional().describe("Check this filing (a 10-K or 10-Q, or an amendment of one), whatever form says."),
  filings: z.number().int().min(1).max(5).optional().describe("Check the latest this many filings of the form, newest first; default 1."),
}).strict();

const CHECKABLE = /^10-[KQ]T?(?:\/A)?$/;
const MAX_DOCUMENTS = 4;
const MAX_ROWS = 100;
const KIND_ORDER = ["scale", "duplicate", "sum", "company_facts_value", "company_facts_missing"];

export const CHECK_MEANING = "scale: a figure is tagged at a scale (the power of ten its tag multiplies the number shown by) other than the one the document states for it: in the words after it (\"$3.8 billion\", \"48,700 shares\"), its row, a heading row above it, its column's heading, the table's heading or the lines above the table; per-share amounts are in units and a figure followed by % is in per cent. A machine reads such a figure that many times larger or smaller than a person does. duplicate: one concept tagged twice for the same period, dimensions and unit, with values further apart than their stated rounding. sum: a total in the filing's own calculation linkbase that its lines, as tagged and all present, do not add up to within their stated rounding. company_facts_value and company_facts_missing: SEC's company facts (data.sec.gov) hold another value, or none, for this filing's fact with the same concept, period and unit.";

export const CHECK_LIMITS = Object.freeze([
  "Only filings in inline XBRL can be read twice: most 10-Ks and 10-Qs filed from 2019 to 2021 on. figure_trace checks an older filing's sums from its separate XBRL file.",
  "A figure's unit is read from the words around it. A unit stated once for a whole section (\"all amounts are in millions\"), in a footnote, or nowhere leaves the figure out of the scale check, as does money in a sentence with no scale word after it; checked.scale counts the figures compared and those left out.",
  "Only the sums the filing's calculation linkbase states are checked. A sum with a line missing is counted as incomplete, not flagged: the line may be filed only split by member.",
  "Company facts are compared only for facts without dimensions, in the taxonomies SEC's file holds for the company; the company's own concepts are not in it.",
  "No finding means these checks found nothing, not that the figures are right.",
]);

const periodText = (c) => (c.start && c.start !== c.end ? `${c.start} to ${c.end}` : c.end);
const fmt = (n) => (typeof n !== "number" ? String(n) : Math.abs(n) >= 1e-4 || n === 0 ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(n));

// The documents of an inline XBRL filing, as SEC's FilingSummary.xml lists its inputs: the inline
// documents carry their document type; the calculation linkbase is a file of its own or sits inside
// the schema.
export function inputFiles(xml) {
  const block = String(xml).match(/<InputFiles>([\s\S]*?)<\/InputFiles>/)?.[1];
  if (block === undefined) return null;
  const files = [...block.matchAll(/<File\b([^>]*)>([^<]+)<\/File>/g)].map((m) => ({ name: decodeEntities(m[2]).trim(), doctype: m[1].match(/doctype="([^"]*)"/)?.[1] ?? null }));
  return {
    documents: files.filter((f) => f.doctype && /\.html?$/i.test(f.name)).map((f) => f.name),
    calculation: files.find((f) => /_cal\.xml$/i.test(f.name))?.name ?? null,
    schema: files.find((f) => /\.xsd$/i.test(f.name))?.name ?? null,
  };
}

const noInline = (name, row) => `${name}'s ${row.form} ${row.accessionNumber} (filed ${row.filingDate}) is not in inline XBRL: its figures are tagged in a separate XBRL file, not in the document a person reads, so the two cannot be set side by side. figure_trace checks its sums from that XBRL file, and financial_statements gives its statements as SEC renders them.`;

// Where a figure is: its table's title and row, or the nearest heading above it in the text.
function whereOf(entry, f) {
  if (f.hidden) return "not shown: tagged in the document's hidden header";
  const { doc, units } = entry;
  if (f.table !== null) {
    const title = units[f.table]?.title, label = rowLabel(doc.tables[f.table], f.row);
    return [title && clip(title, 120), label && clip(label, 120)].filter(Boolean).join(" / ") || null;
  }
  for (let i = f.block - 1; i >= 0 && i >= f.block - 60; i -= 1) if (isHeading(doc.blocks[i].text)) return clip(doc.blocks[i].text, 120);
  return null;
}

// One finding as a row: what was compared with what, where it is, and a link to the figure.
function findingRow(x, ctx) {
  const f = x.fact, c = ctx.contexts.get(f.contextRef), unit = ctx.units.get(f.unitRef) ?? null;
  const entry = ctx.docs[f.doc];
  const link = (y) => `${ctx.docs[y.doc].url}${y.id ? `#${y.id}` : ""}`;
  let displayed = f.text, compared, reading;
  if (x.kind === "scale") {
    const seen = scaled(displayedNumber(f.text, f.format), x.expected) * f.sign;
    const factor = fmt(10 ** Math.abs(f.scale - x.expected));
    if (x.stated.where === "the words after the figure" || x.stated.where === "the sign after the figure") displayed = x.stated.text;
    compared = { stated: clip(x.stated.text, 200), stated_in: x.stated.where, scale_stated: x.expected, scale_tagged: f.scale, a_person_reads: seen };
    const how = displayed === x.stated.text ? "" : x.stated.text === "per share" ? ", an amount per share" : `, in ${scaleName(x.expected)} by ${x.stated.where}`;
    reading = `Shown as ${displayed}${how}; tagged at scale ${f.scale}, so a machine reads ${fmt(x.value)}, ${f.scale > x.expected ? `${factor} times` : `1/${factor} of`} the ${fmt(seen)} a person reads.`;
  } else if (x.kind === "duplicate") {
    compared = { displayed: x.other.text, value: x.other_value, url: link(x.other), tags: x.tags };
    reading = `Tagged ${x.tags} times for one period and unit, as ${f.text} (${fmt(x.value)}) and ${x.other.text} (${fmt(x.other_value)}): further apart than their stated rounding.`;
  } else if (x.kind === "sum") {
    compared = { lines_sum: x.sum, difference: x.difference, tolerance: x.tolerance, calculation: x.role, lines: { columns: ["concept", "weight", "value", "displayed"], rows: x.lines.map((l) => [l.concept, l.weight, l.value, l.displayed]) } };
    const terms = x.lines.map((l, i) => { const v = l.weight * l.value; return i ? `${v < 0 ? " - " : " + "}${fmt(Math.abs(v))}` : fmt(v); }).join("");
    reading = `The filing's calculation gives ${terms} = ${fmt(x.sum)}; the total is tagged ${fmt(x.value)}, ${fmt(Math.abs(x.difference))} apart, more than the ${fmt(x.tolerance)} their rounding allows.`;
  } else if (x.kind === "company_facts_value") {
    const rounded = x.company_facts.some((v) => v === Number(x.value.toFixed(6)));
    compared = { company_facts: x.company_facts.length === 1 ? x.company_facts[0] : x.company_facts };
    reading = `SEC's company facts hold ${x.company_facts.map(fmt).join(" and ")} for this filing; the filing tags ${fmt(x.value)}${rounded ? ", which rounded to six decimal places is what company facts hold" : ""}.`;
  } else {
    compared = { company_facts: null };
    reading = "SEC's company facts hold nothing for this concept, period and unit from this filing.";
  }
  return [x.kind, f.name, periodText(c), unit, c.dims.length ? c.dims.join("; ") : null, displayed, x.value, compared, whereOf(entry, f), link(f), reading];
}

// One filing: its inline documents read, and checked four ways.
async function checkFiling(session, cik, name, row, cf) {
  if (row.isInlineXBRL === 0) throw new Error(noInline(name, row));
  const base = archiveBase(cik, row.accessionNumber);
  let inputs = null;
  try { inputs = inputFiles(await getText(session, `${base}/FilingSummary.xml`, { maxBytes: 8 * 1024 * 1024 })); } catch (err) { if (!(err instanceof NotFound)) throw err; }
  if (!inputs) {
    const items = (await getJson(session, `${base}/index.json`))?.directory?.item ?? [];
    inputs = { documents: [], calculation: items.find((i) => /_cal\.xml$/i.test(i.name))?.name ?? null, schema: items.find((i) => /\.xsd$/i.test(i.name))?.name ?? null };
  }
  const names = (inputs.documents.length ? inputs.documents : [String(row.primaryDocument ?? "").replace(/^xsl[^/]*\//, "")]).filter(Boolean).slice(0, MAX_DOCUMENTS);
  const docs = [], contexts = new Map(), units = new Map(), kinds = new Map();
  for (const file of names) {
    const url = `${base}/${file}`;
    // Its own cache entry: read_filing and others keep a document's text, its tags stripped, under its URL.
    const doc = readDocument(await getText(session, url, { maxBytes: 96 * 1024 * 1024, timeoutMs: 60000, variant: "inline-xbrl" }));
    for (const [k, v] of doc.contexts) contexts.set(k, v);
    for (const [k, v] of doc.units) units.set(k, v);
    for (const [k, v] of doc.kinds) kinds.set(k, v);
    docs.push({ url, doc });
  }
  const facts = docs.flatMap((d, i) => { for (const f of d.doc.facts) f.doc = i; return d.doc.facts; });
  if (!facts.length) throw new Error(noInline(name, row));
  // A document of a set may use contexts and units another one defines.
  for (const d of docs) { Object.assign(d.doc, { contexts, units, kinds }); d.units = tableUnits(d.doc); }
  const scale = { findings: [], counts: null };
  for (const d of docs) {
    const r = scaleCheck(d.doc, d.units);
    scale.findings.push(...r.findings);
    scale.counts = scale.counts ? Object.fromEntries(Object.entries(scale.counts).map(([k, v]) => [k, v + r.counts[k]])) : r.counts;
  }
  const groups = groupFacts({ facts, contexts, units });
  const dup = duplicateCheck(groups);
  const calFile = inputs.calculation ?? inputs.schema;
  const sums = sumCheck(groups, calFile ? parseCalculations(await getText(session, `${base}/${calFile}`, { maxBytes: 64 * 1024 * 1024 })) : []);
  const cfc = cf ? companyFactsCheck(groups, cf, row.accessionNumber) : { findings: [], unavailable: true };
  const found = [...scale.findings, ...dup.findings, ...sums.findings, ...cfc.findings].sort((x, y) => KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind));
  const byKind = Object.fromEntries(KIND_ORDER.map((k) => [k, found.filter((x) => x.kind === k).length]).filter(([, n]) => n));
  const notRead = facts.filter((f) => !f.nil && valueOf(f) === undefined).length;
  const checked = {
    documents: docs.map((d) => d.url),
    facts_read: facts.length,
    facts_hidden: facts.filter((f) => f.hidden).length,
    ...(notRead ? { facts_in_a_format_not_read: notRead } : {}),
    tables_with_facts: docs.reduce((n, d) => n + d.units.filter((u) => u.first >= 0).length, 0),
    scale: scale.counts,
    duplicates: dup.counts,
    sums: { ...sums.counts, calculation: calFile ? `${base}/${calFile}` : null },
    company_facts: cfc.unavailable ? { not_compared: cf ? "SEC's company facts hold nothing from this filing yet; SEC adds a filing's facts after it processes the filing." : "SEC's company facts could not be read for this company." } : cfc.counts,
  };
  const reading = `Read ${fmt(facts.length)} tagged figures in ${docs.length === 1 ? "the document" : `${docs.length} documents`}: ${fmt(scale.counts.compared)} had their scale set against the unit stated for them, ${fmt(dup.counts.facts_tagged_more_than_once)} facts tagged more than once were compared, ${fmt(sums.counts.checked)} sums were recomputed${cfc.unavailable ? "" : `, and ${fmt(cfc.counts.compared)} facts were set against SEC's company facts`}. ${found.length ? `${found.length} ${found.length === 1 ? "disagreement" : "disagreements"}: ${Object.entries(byKind).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ")}.` : "No disagreement found."}`;
  const ctx = { contexts, units, docs };
  return {
    filing: { accession: row.accessionNumber, form: row.form, filed: row.filingDate, period: row.reportDate || null, document: docs[0].url, index: `${base}/${row.accessionNumber}-index.htm` },
    checked,
    findings: {
      total: found.length, ...(found.length ? { by_kind: byKind } : {}),
      columns: ["kind", "concept", "period", "unit", "dimensions", "displayed", "value", "compared_with", "where", "url", "reading"],
      rows: found.slice(0, MAX_ROWS).map((x) => findingRow(x, ctx)),
      ...(found.length > MAX_ROWS ? { rows_shown: `${MAX_ROWS} of ${found.length}, by kind` } : {}),
    },
    plain_reading: reading,
  };
}

export async function filingCheck(session, args) {
  const a = checkInput.parse(args);
  const form = a.form ?? "10-K";
  const count = a.accession ? 1 : a.filings ?? 1;
  const e = await resolveEntity(session, a.company);
  // The recent filings first; older pages of the list only when they are needed (a bank's recent
  // block can be a few months of prospectuses).
  let { sub, rows } = await filings(session, e.cik);
  const enough = () => (a.accession ? rows.some((r) => r.accessionNumber === a.accession) : rows.filter((r) => r.form === form).length >= count);
  if (!enough() && sub.filings?.files?.length) {
    const year = a.accession ? 2000 + Number(a.accession.slice(11, 13)) : new Date(session.now()).getUTCFullYear();
    const back = a.accession ? 1 : form === "10-K" ? count + 1 : Math.ceil(count / 3) + 1;
    ({ sub, rows } = await filings(session, e.cik, { since: `${year - back}-01-01` }));
  }
  const name = sub.name ?? e.name ?? `CIK ${e.cik}`;
  let picked;
  if (a.accession) {
    const row = rows.find((r) => r.accessionNumber === a.accession);
    if (!row) throw new NotFound(`${a.accession} is not one of ${name}'s filings in the period read; list_filings shows them.`);
    if (!CHECKABLE.test(row.form)) throw new Error(`${a.accession} is a ${row.form}; filing_check reads 10-Ks and 10-Qs and their amendments.`);
    picked = [row];
  } else {
    picked = rows.filter((r) => r.form === form).slice(0, count);
    const abroad = rows.some((r) => /^(20-F|40-F)$/.test(r.form));
    if (!picked.length) throw new NotFound(`${name} has filed no ${form} in the period read${abroad ? " (it files 20-F or 40-F annual reports, which this tool does not read)" : ""}; list_filings shows what it has filed.`);
  }
  const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(e.cik)}.json`;
  let cf = null;
  if (picked.some((r) => r.isInlineXBRL !== 0)) {
    try { cf = await getJson(session, factsUrl, { maxBytes: 96 * 1024 * 1024, timeoutMs: 60000 }); } catch (err) { if (!(err instanceof NotFound)) throw err; }
  }
  const results = [];
  for (const row of picked) {
    try { results.push(await checkFiling(session, e.cik, name, row, cf)); } catch (err) {
      if (picked.length === 1 || !(err instanceof Error) || err instanceof TypeError) throw err;
      results.push({ filing: { accession: row.accessionNumber, form: row.form, filed: row.filingDate, period: row.reportDate || null }, error: err.message });
    }
  }
  if (results.every((r) => r.error)) throw new Error(results[0].error);
  return {
    company: { cik: e.cik, name, ticker: sub.tickers?.[0] ?? e.ticker ?? null },
    form: a.accession ? picked[0].form : form,
    ...(a.accession && (a.filings ?? 1) > 1 ? { filings_note: "An accession names one filing, so filings was not used." } : {}),
    results,
    meaning: CHECK_MEANING,
    source: factsUrl,
    limits: CHECK_LIMITS,
  };
}
