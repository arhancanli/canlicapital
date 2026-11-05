// release_check: a quarter's results press release (8-K Item 2.02, exhibit 99) set against the 10-Q or
// 10-K filed after it. Every figure in the release's tables is looked for among the report's inline XBRL
// facts for the same period. It agrees when a fact holds it within the release's rounding; it changed
// when its line in the report holds another value (the line found as the one where the figure's other
// periods agree, or the line with its label between lines that agree); it is release-only when neither
// is found. Preliminary results change before the 10-Q when a subsequent event, an impairment or a
// reclassification is booked after the release.
import { z } from "zod";

import { releasesFrom } from "./earnings.mjs";
import { halfUnit, readDocument, valueOf } from "./filing-check.mjs";
import { documentTables } from "./filing-tables.mjs";
import { archiveBase, filingDocuments, filings, getText, NotFound, resolveEntity } from "./sources.mjs";

export const releaseCheckInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple)."),
  period: z.string().min(2).max(24).optional().describe("The quarter: its end date (2026-06-30; a few days off is fine for 52-53 week years) or a fiscal label (Q2 2026, FY2025: the fiscal year that ends in that year). Default: the latest quarter whose 10-Q or 10-K is filed."),
  max_rows: z.number().int().min(1).max(200).optional().describe("Most changed figures and release-only labels listed; default 40."),
}).strict();

const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const addMonths = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, Math.min(d, last)); };

// ---------------------------------------------------------------------------------------------
// The periods a release's columns name
// ---------------------------------------------------------------------------------------------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?";
const valid = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? iso(y, m, d) : null);

// "June 28, 2025", "MAR 31, 2024", "Sept. 30, 2025", "28 June 2025", "6/28/2025": the date a header names.
export function headerDate(text) {
  const t = String(text);
  let m = t.match(new RegExp(`\\b${MONTH}\\s+(\\d{1,2}),?\\s+((?:19|20)\\d{2})\\b`, "i"));
  if (m) return valid(m[3], MONTHS[m[1].toLowerCase()], Number(m[2]));
  m = t.match(new RegExp(`\\b(\\d{1,2})\\s+${MONTH},?\\s+((?:19|20)\\d{2})\\b`, "i"));
  if (m) return valid(m[3], MONTHS[m[2].toLowerCase()], Number(m[1]));
  m = t.match(/\b(\d{1,2})\/(\d{1,2})\/((?:19|20)\d{2}|\d{2})\b/);
  if (m) return valid(m[3].length === 2 ? `20${m[3]}` : m[3], Number(m[1]), Number(m[2]));
  return null;
}

// A header's month and day without the year ("Three Months Ended June 30,") and a year on its own ("2025").
const monthDay = (text) => { const m = String(text).match(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})\\b(?!,?\\s+(?:19|20)\\d{2})`, "i")); return m ? [MONTHS[m[1].toLowerCase()], Number(m[2])] : null; };
const yearOnly = (text) => { const m = String(text).match(/(?:^|[^\d/])((?:19|20)\d{2})(?![\d/])/); return m ? m[1] : null; };

// How long a column's period runs, in days with a tolerance: a quarter (three months, 12 to 16 weeks,
// "Q3", "fourth quarter"), six or nine months, a year, or a stated number of weeks.
const WORD_NUMBERS = { three: 3, six: 6, nine: 9, twelve: 12, thirteen: 13, fourteen: 14, sixteen: 16 };
export function headerLength(text) {
  const t = String(text).toLowerCase();
  const n = (w) => WORD_NUMBERS[w] ?? Number(w);
  // The year to date runs as long as the quarters so far: the figures decide.
  if (/\byear[- ]to[- ]date\b|\bytd\b/.test(t)) return null;
  let m = t.match(/\b(\d{1,2}|twelve|thirteen|fourteen|sixteen)[- ]weeks?\b/);
  if (m) return { days: n(m[1]) * 7, tol: 6 };
  m = t.match(/\b(3|6|9|12|three|six|nine|twelve)[- ]months?\b/);
  if (m) return { days: Math.round(n(m[1]) * 30.44), tol: 12 };
  if (/\b(?:quarters?|q[1-4]|[1-4]q)\b/.test(t)) return { days: 98, tol: 18 };
  if (/\b(?:years?|fiscal|full[- ]year|fy\s?'?\d{2,4}|annual)\b/.test(t)) return { days: 365, tol: 12 };
  return null;
}

// A column that measures change, not a period: "% Change", "Variance", "B/(W)".
const CHANGE = /\b(?:change|chg|variance|var|increase|decrease|growth|incr|decr|fav|unfav|b\/\(w\)|better|worse|y\/y|yoy|q\/q|qoq|vs\.?|versus|bps)\b|%/i;
// A column, line or table on another basis than the report's: non-GAAP, adjusted, constant currency.
const NON_GAAP_COLUMN = /non[- ]?gaap|\badjust|constant currency|currency impact|\bfx\b|foreign exchange|\bimpact\b|pro forma|\borganic\b/i;
const NON_GAAP_LINE = /non[- ]?gaap|\badjusted\b|\bexcluding\b|pro forma|\borganic\b|\bunderlying\b|constant currency|ebitda|free cash flow/i;
const NON_GAAP_TABLE = /non[- ]?gaap|reconciliation|constant currency|\badjusted\b/i;
const STATEMENT_TITLE = /statements? of (?:consolidated )?(?:operations|income|earnings|comprehensive|cash flows?|financial position|condition)|balance sheets?|income statements?|cash flows? statements?/i;
const STATEMENT_OF_POSITION = /balance sheets?|financial position|financial condition|statements? of condition|assets and liabilities/i;

// What a column's header says of its period. exact: an end date with a length or a moment named.
function columnHint(header, table) {
  const context = `${table.heading ?? ""} ${table.caption ?? ""}`;
  let end = headerDate(header);
  if (!end) {
    const y = yearOnly(header), md = monthDay(header) ?? monthDay(context);
    if (y && md) end = valid(y, md[0], md[1]);
  }
  const length = headerLength(header) ?? headerLength(context.replace(/\([^)]*\)/g, " "));
  const instant = !length && (STATEMENT_OF_POSITION.test(context) || /^\s*(?:as of|as at|at)\b/i.test(header)) ? true : null;
  return { end, length, instant, exact: Boolean(end && (length || instant)) };
}

// ---------------------------------------------------------------------------------------------
// The report's facts, by period
// ---------------------------------------------------------------------------------------------

const periodKey = (start, end) => `${start ?? ""}|${end}`;
export const periodLabel = (p) => (p.start ? `${Math.max(1, Math.round(p.days / 30.44))} months to ${p.end}` : `at ${p.end}`);

// Every fact with a value other than zero, by period, sorted by size for lookup.
export function factsByPeriod(doc) {
  const out = new Map();
  for (const f of doc.facts) {
    const c = doc.contexts.get(f.contextRef);
    if (!c?.end) continue;
    const value = valueOf(f);
    if (value === null || value === undefined || value === 0) continue;
    const start = c.start && c.start !== c.end ? c.start : null;
    const key = periodKey(start, c.end);
    const p = out.get(key) ?? out.set(key, { key, start, end: c.end, days: start ? days(start, c.end) + 1 : null, facts: [] }).get(key);
    p.facts.push({ f, value, abs: Math.abs(value), kind: doc.kinds.get(f.unitRef) ?? null, dims: c.dims, half: halfUnit(f.decimals) });
  }
  for (const p of out.values()) { p.facts.sort((a, b) => a.abs - b.abs); p.maxHalf = p.facts.reduce((n, x) => Math.max(n, x.half), 0); }
  return out;
}

// The facts of a period whose size is the target's within either side's rounding.
function near(p, target, half) {
  const lo = target - half - p.maxHalf, hi = target + half + p.maxHalf;
  let a = 0, b = p.facts.length;
  while (a < b) { const m = (a + b) >> 1; if (p.facts[m].abs < lo) a = m + 1; else b = m; }
  const out = [];
  for (let i = a; i < p.facts.length && p.facts[i].abs <= hi; i += 1) {
    const x = p.facts[i];
    if (Math.abs(x.abs - target) <= Math.max(half, x.half) + 1e-9 * Math.max(1, target)) out.push(x);
  }
  return out;
}

// The scale a fact is compared at: money and share counts at the table's, amounts per share and
// anything else as shown.
const scaleFor = (kind, scales) => (kind === "money" ? scales.money : kind === "shares" ? scales.shares : 0);
// Significant digits: 1,000 and 7 match by chance, 61,238 and 0.123 hardly ever.
const sig = (v) => String(Math.abs(v)).replace(/e[-+]\d+$/, "").replace(".", "").replace(/^0+/, "").replace(/0+$/, "").length;
const decimalsOf = (v) => { const s = String(Math.abs(v)); if (/e-/.test(s)) return Number(s.split("e-")[1]); const i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; };

function matches(p, value, dp, scales) {
  const out = [];
  for (const s of new Set([scales.money, scales.shares, 0])) {
    const half = 0.5 * 10 ** (s - dp);
    for (const x of near(p, Math.abs(value) * 10 ** s, half)) if (scaleFor(x.kind, scales) === s && !out.includes(x)) out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

const SIGN_WORDS = /\((?:loss|losses|income|gain|gains|benefit|expense|expenses|deficit|earnings|provision|increase|decrease|used in|charges?|credits?)\)/gi;
const STOP = new Set(["the", "of", "and", "for", "from", "to", "in", "on", "a", "an", "at", "as", "by", "or"]);
const stem = (w) => { let s = w; if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1); if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1); return s; };
// A label's words: without its parentheses ("(loss)", "(Note 10)", "($68,390 attributable to VIEs)"), numbers,
// a leading "Less:" or small words, each cut to its stem.
export function labelWords(label) {
  return String(label ?? "").toLowerCase().replace(SIGN_WORDS, " ").replace(/\([^()]*\)|\*+/g, " ").replace(/^\s*(?:less|add|plus|minus)\s*:?\s+/, "")
    .replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
}
export function labelSimilarity(a, b) {
  const x = new Set(labelWords(a)), y = new Set(labelWords(b));
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both += 1;
  return both / (x.size + y.size - both);
}

const rowLabel = (t, i) => t.rows[i]?.cells.find((c) => /[A-Za-z]/.test(c.text))?.text ?? "";
const GENERIC = /^(?:basic|diluted|total|other|net|subtotal|gross|as reported|reported|gaap|non-gaap)\s*(?:\(\d{1,2}\)|\*+)?\s*:?$/i;

// A fact shown in parentheses or after a minus sign reads as negative, whatever its sign as tagged
// (a payment in a cash flow statement is tagged positive and shown in parentheses).
function shownNegative(doc, x) {
  const f = x.f;
  if (f.table === null) return x.value < 0;
  const cells = doc.tables[f.table].rows[f.row].cells;
  const at = cells.findIndex((c) => c.col === f.col);
  const own = at >= 0 ? cells[at].text : "";
  const before = own.slice(0, Math.max(0, own.indexOf(f.text))) || (at > 0 ? cells.slice(Math.max(0, at - 2), at).map((c) => c.text).join("") : "");
  return /\(\s*\$?\s*$|[-−–]\s*\$?\s*$/.test(before);
}

// ---------------------------------------------------------------------------------------------
// One release table set against the report
// ---------------------------------------------------------------------------------------------

// The release's columns as periods. A column with no header next to a dated one holds that one's
// figures where a parenthesis split them off ("(1,390" and ")" in two cells).
function tableColumns(t) {
  const headers = t.columns.slice(1);
  const rows = t.rows.map((r) => r.slice(1));
  for (let c = 1; c < headers.length; c += 1) {
    if (headers[c] || !headers[c - 1]) continue;
    for (const r of rows) if (typeof r[c] === "number" && r[c - 1] === null) { r[c - 1] = r[c]; r[c] = null; }
  }
  return { headers, rows };
}

// The scale the table states for money and for share counts, if it states one.
const SCALE = { thousand: 3, thousands: 3, "000": 3, "000s": 3, "000's": 3, million: 6, millions: 6, billion: 9, billions: 9 };
function statedScale(t) {
  const text = [t.caption, t.heading, ...t.columns, ...(t.notes ?? [])].filter(Boolean).join(" ");
  const m = text.match(/\b(thousands|millions|billions)\b|\$\s?\(?(000s?|000's)\)?|\((000s?|000's)\)/i);
  if (!m) return null;
  const money = SCALE[(m[1] ?? m[2] ?? m[3]).toLowerCase()];
  const shares = text.match(/\bshares?\b[^.;)]{0,40}?\b(?:in|reflected in|are in)\s+(thousands|millions)\b|\b(thousands|millions)\s+of\s+shares\b/i);
  return { money, shares: shares ? SCALE[(shares[1] ?? shares[2]).toLowerCase()] : null };
}

function compareTable(t, ctx) {
  const { headers, rows } = tableColumns(t);
  const cells = [];
  rows.forEach((r, i) => r.forEach((v, c) => { if (typeof v === "number" && !CHANGE.test(headers[c] ?? "") && !NON_GAAP_COLUMN.test(headers[c] ?? "")) cells.push({ i, c, value: v }); }));
  if (!cells.length) return null;
  // A reconciliation or non-GAAP table, and its non-GAAP lines, are matched by value only: their lines
  // are not the report's lines, whatever their labels say.
  const title = `${t.caption ?? ""} ${t.heading ?? ""}`;
  const byLine = !(NON_GAAP_TABLE.test(title) && !STATEMENT_TITLE.test(title));
  const gaapLine = (i) => byLine && !NON_GAAP_LINE.test(String(t.rows[i][0] ?? ""));
  const dpRow = rows.map((r) => Math.max(0, ...r.filter((v) => typeof v === "number").map(decimalsOf)));
  // The periods each column may be: those its header allows, or all of them.
  const hints = headers.map((h) => columnHint(h, t));
  const fits = (h, p) => (!h.end || Math.abs(days(h.end, p.end)) <= 7) && (!h.length || (p.days !== null && Math.abs(p.days - h.length.days) <= h.length.tol)) && (!h.instant || p.days === null);
  const candidates = hints.map((h) => [...ctx.periods.values()].filter((p) => fits(h, p)));
  const stated = statedScale(t);
  // Periods and scales are chosen by figures that rarely agree by chance.
  const count = (scales, c, p) => cells.filter((x) => x.c === c && sig(x.value) >= 3 && matches(p, x.value, dpRow[x.i], scales).length).length;
  // The scale of money: the one stated, unless none of its figures agree and another's do.
  const tryScales = (shares) => [0, 3, 6, 9].map((s) => ({ s, n: headers.reduce((n, _, c) => n + Math.max(0, ...candidates[c].map((p) => count({ money: s, shares: shares ?? s }, c, p))), 0) }));
  const money = tryScales(null).sort((a, b) => b.n - a.n || (b.s === stated?.money) - (a.s === stated?.money));
  const moneyScale = stated && (money.find((x) => x.s === stated.money).n > 0 || money[0].n < 3) ? stated.money : money[0].s;
  const sharesTried = [0, 3, 6, 9].map((s) => ({ s, n: headers.reduce((n, _, c) => n + Math.max(0, ...candidates[c].map((p) => count({ money: moneyScale, shares: s }, c, p))), 0) })).sort((a, b) => b.n - a.n || (b.s === (stated?.shares ?? moneyScale)) - (a.s === (stated?.shares ?? moneyScale)));
  const scales = { money: moneyScale, shares: sharesTried[0].s };
  const scaleNote = stated ? (stated.money === moneyScale ? "stated" : "read from agreement (no figure agrees at the stated scale)") : "read from agreement (none stated)";
  // Each column's period: of those it may be, the one most of its figures agree with. A column with no
  // agreeing figure keeps a period only when its header names one exactly.
  const periods = headers.map((h, c) => {
    const n = cells.filter((x) => x.c === c && sig(x.value) >= 3).length;
    if (!cells.some((x) => x.c === c)) return null;
    const ranked = candidates[c].map((p) => ({ p, n: count(scales, c, p) })).sort((a, b) => b.n - a.n || Math.abs(days(hints[c].end ?? a.p.end, a.p.end)) - Math.abs(days(hints[c].end ?? b.p.end, b.p.end)));
    // A column whose header names no date needs several agreeing figures, and a good share of its own.
    if (hints[c].end ? ranked[0]?.n >= 1 : ranked[0]?.n >= 3 && ranked[0].n >= 0.4 * n) return ranked[0].p;
    if (hints[c].exact && ranked.length === 1) return ranked[0].p;
    return null;
  });
  // Figures that agree, and which of the report's lines they sit on.
  for (const x of cells) {
    x.period = periods[x.c];
    if (!x.period) continue;
    x.agree = x.value === 0 ? [] : matches(x.period, x.value, dpRow[x.i], scales);
    // A balance at the start or end of a period shown in its column (cash at the beginning of the year).
    if (x.value !== 0 && !x.agree.length && x.period.start) {
      for (const at of [x.period.end, addDays(x.period.start, -1)]) { const p = ctx.periods.get(periodKey(null, at)); if (p) x.agree.push(...matches(p, x.value, dpRow[x.i], scales)); }
      x.balance = x.agree.length > 0;
    }
  }
  // The report's table that most agreeing lines sit in, and each line's place in it, kept in order.
  const votes = new Map();
  for (const i of new Set(cells.filter((x) => x.agree?.length).map((x) => x.i))) {
    for (const tb of new Set(cells.filter((x) => x.i === i && x.agree?.length).flatMap((x) => x.agree.map((a) => a.f.table)).filter((v) => v !== null))) votes.set(tb, (votes.get(tb) ?? 0) + 1);
  }
  const [tableAt] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null];
  const ft = tableAt === null ? null : ctx.doc.tables[tableAt];
  const labels = rowLabels(t);
  const anchors = new Map(), reordered = new Map();
  if (ft) {
    const pairs = [];
    for (const i of new Set(cells.map((x) => x.i))) {
      if (!gaapLine(i)) continue;
      const own = cells.filter((x) => x.i === i && x.agree?.length && !x.balance);
      const rowsHit = new Map();
      for (const x of own) for (const a of x.agree) if (a.f.table === tableAt) rowsHit.set(a.f.row, (rowsHit.get(a.f.row) ?? 0) + 1);
      // The same line: a figure that rarely agrees by chance, or a like label.
      for (const j of rowsHit.keys()) {
        const distinct = own.some((x) => x.agree.some((a) => a.f.row === j && a.f.table === tableAt) && sig(x.value) >= 4);
        if (distinct || labelSimilarity(t.rows[i][0], rowLabel(ft, j)) >= 0.5) pairs.push([i, j]);
      }
    }
    // The longest run of lines in the same order in both tables.
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const best = pairs.map(() => 1), prev = pairs.map(() => -1);
    for (let a = 0; a < pairs.length; a += 1) for (let b = 0; b < a; b += 1) if (pairs[b][0] < pairs[a][0] && pairs[b][1] < pairs[a][1] && best[b] + 1 > best[a]) { best[a] = best[b] + 1; prev[a] = b; }
    let at = best.length ? best.indexOf(Math.max(...best)) : -1;
    while (at >= 0) { anchors.set(pairs[at][0], pairs[at][1]); at = prev[at]; }
    // A table with fewer lines in common than this is not the report's table: its lines are matched by value only.
    if (anchors.size < 3) anchors.clear();
    // A line the two documents order differently keeps its place when its label is the same.
    const taken = new Set(anchors.values());
    for (const [i, j] of anchors.size ? pairs : []) if (!anchors.has(i) && !taken.has(j) && labelSimilarity(t.rows[i][0], rowLabel(ft, j)) >= 0.6) { reordered.set(i, j); taken.add(j); }
  }
  // A line with no agreeing figure: the report's line between the same agreeing lines whose label is its own.
  const used = new Set([...anchors.values(), ...reordered.values()]);
  const counterpart = new Map();
  if (ft) {
    const order = [...anchors.keys()].sort((a, b) => a - b);
    for (const i of [...new Set(cells.map((x) => x.i))].sort((a, b) => a - b)) {
      if (anchors.has(i) || reordered.has(i)) { counterpart.set(i, { j: anchors.get(i) ?? reordered.get(i), how: "same" }); continue; }
      if (!gaapLine(i)) continue;
      const before = order.filter((k) => k < i).at(-1), after = order.find((k) => k > i);
      if (before === undefined && after === undefined) continue;
      const lo = before === undefined ? anchors.get(after) - 8 : anchors.get(before), hi = after === undefined ? anchors.get(before) + 8 : anchors.get(after);
      let pick = null;
      for (let j = Math.max(0, lo + 1); j < Math.min(ft.rows.length, hi); j += 1) {
        if (used.has(j) || !ft.rows[j].cells.some((c) => c.facts.length)) continue;
        const sim = labelSimilarity(t.rows[i][0], rowLabel(ft, j));
        if (sim >= 0.6 && (!pick || sim > pick.sim)) pick = { j, sim };
      }
      if (pick) { used.add(pick.j); counterpart.set(i, { j: pick.j, how: pick.sim === 1 ? "label" : "similar" }); }
    }
  }
  // Each figure: agrees, changed (its line found, with another value) or release-only.
  const out = { agree: 0, changed: [], releaseOnly: [], notCompared: 0, compared: 0, filingTable: tableAt, used, periods, scales, scaleNote, agreed: new Set(cells.flatMap((x) => (x.agree ?? []).map((v) => v.f))) };
  // On a line that holds one fact per member (a debt table, a segment table), the figure is set against
  // the member and unit its agreeing figures carry; on a line found by its label, against the fact with
  // no member. Columns that share a period (fixed, floating and total debt) are matched by value only.
  const dimsOf = (f) => (ctx.doc.contexts.get(f.contextRef)?.dims ?? []).join(",");
  const kindOf = (f) => ctx.doc.kinds.get(f.unitRef) ?? null;
  const shared = new Set(periods.filter((p, c) => p && periods.some((q, d) => d !== c && q === p)));
  const onRow = (i, j) => cells.filter((z) => z.i === i).flatMap((z) => (z.agree ?? []).filter((v) => v.f.table === tableAt && v.f.row === j));
  const samePeriod = (f, p) => { const c = ctx.doc.contexts.get(f.contextRef); return c && c.end === p.end && (c.start && c.start !== c.end ? c.start : null) === p.start; };
  for (const x of cells) {
    if (!x.period) { out.notCompared += 1; continue; }
    let cp = shared.has(x.period) ? null : counterpart.get(x.i);
    const agreeing = cp ? onRow(x.i, cp.j) : [];
    // The same line needs a like label too: "Net income available to common stockholders" can equal
    // "Net income" in one year and not the next.
    if (cp?.how === "same" && labelSimilarity(t.rows[x.i][0], rowLabel(ft, cp.j)) < 0.5) cp = null;
    const want = new Set(agreeing.map((v) => `${v.dims.join(",")}#${v.kind}`));
    const fits = (f) => (want.size ? want.has(`${dimsOf(f)}#${kindOf(f)}`) : !dimsOf(f));
    const lineFacts = cp ? ctx.doc.tables[tableAt].rows[cp.j].cells.flatMap((c) => c.facts).map((k) => ctx.doc.facts[k]).filter(fits) : [];
    let onLine = lineFacts.filter((f) => samePeriod(f, x.period)), elsewhere = false;
    // A line that does not show this period (a cash flow statement without the quarter) points to its
    // concept, which for the same member and period is the same fact wherever the report tags it.
    if (cp && !onLine.length && lineFacts.length) {
      const names = new Set(lineFacts.map((f) => `${f.name}#${dimsOf(f)}#${kindOf(f)}`));
      onLine = ctx.doc.facts.filter((f) => names.has(`${f.name}#${dimsOf(f)}#${kindOf(f)}`) && samePeriod(f, x.period));
      elsewhere = onLine.length > 0;
    }
    // The fact in the figure's unit: the one nearest it in size.
    const scaledOf = (y) => y.value / 10 ** scaleFor(y.kind, scales);
    const gap = (y) => Math.abs(Math.log10(Math.abs(scaledOf(y)) + 1e-12) - Math.log10(Math.abs(x.value) + 1e-12));
    const y = onLine.map((f) => ({ f, value: valueOf(f), kind: kindOf(f) })).filter((v) => typeof v.value === "number").sort((p, q) => gap(p) - gap(q))[0];
    // A line found by its label alone gives way to a fact elsewhere that holds the figure.
    if (x.agree.some((a) => onLine.includes(a.f)) || (x.agree.length && (!y || cp.how !== "same")) || (y && x.value === 0 && y.value === 0)) { out.agree += 1; out.compared += 1; continue; }
    if (!y) {
      if (x.value === 0) continue;
      // The report shows the line, but not for this period (a quarter's cash flows in a 10-Q that gives
      // them for the year to date).
      if (lineFacts.length) { out.notCompared += 1; continue; }
      out.compared += 1;
      out.releaseOnly.push({ i: x.i, label: labels[x.i], period: x.period, value: x.value });
      continue;
    }
    // The figure as the report shows it, in the release's scale.
    const filed = Number(((shownNegative(ctx.doc, y) ? -1 : 1) * Math.abs(scaledOf(y))).toFixed(dpRow[x.i] + 6));
    out.compared += 1;
    const fLabel = rowLabel(ft, cp.j);
    const how = elsewhere ? `the concept the report tags on its line "${fLabel}", for this period from another of its tables`
      : cp.how === "same" ? (agreeing.length ? `the same line of the report ("${fLabel}"), where its other period agrees` : `the line of the report ("${fLabel}") that holds this line's other figures`)
      : cp.how === "label" ? "the line of the report with the same label, between lines that agree" : `the line of the report labelled "${fLabel}", between lines that agree`;
    out.changed.push({ i: x.i, label: labels[x.i], period: x.period, release: x.value, filed, concept: y.f.name, kind: y.kind, how, dp: dpRow[x.i] });
  }
  return out;
}

// Each release line's label, with the heading above it when the label alone says little ("Diluted").
function rowLabels(t) {
  let heading = null;
  return t.rows.map((r) => {
    const label = String(r[0] ?? "").trim();
    if (r.slice(1).every((v) => v === null)) { heading = label.replace(/:$/, ""); return label; }
    return heading && (GENERIC.test(label) || !label) ? `${heading}: ${label}` : label;
  });
}

// ---------------------------------------------------------------------------------------------
// Which filings
// ---------------------------------------------------------------------------------------------

const PERIODIC = /^(?:10-Q|10-K|10-QT|10-KT)$/;

// "Q2 2026", "Q2 FY26", "2Q26", "second quarter 2026", "FY2025", "fiscal 2025".
export function fiscalLabel(text) {
  const t = String(text).toLowerCase();
  const q = t.match(/\bq([1-4])\b|\b([1-4])q|\b(first|second|third|fourth)\s+quarter\b/);
  const quarter = q ? Number(q[1] ?? q[2] ?? { first: 1, second: 2, third: 3, fourth: 4 }[q[3]]) : /\b(?:fy|fiscal|year)\b|^\s*fy/.test(t) ? 4 : null;
  const y = t.match(/(?:^|[^\d])((?:19|20)\d{2})(?!\d)/) ?? t.match(/(?:fy|q[1-4]|[1-4]q|')\s?(\d{2})(?!\d)/);
  if (!quarter || !y) return null;
  return { quarter, year: Number(y[1].length === 2 ? `20${y[1]}` : y[1]), annual: !q };
}

// The quarter's end a fiscal label means: the fiscal year ending in that calendar year, by the
// company's fiscal year end (SEC's "0927").
const labelEnd = (label, fyEnd) => {
  const mm = Number(String(fyEnd ?? "1231").slice(0, 2)) || 12, dd = Number(String(fyEnd ?? "1231").slice(2, 4)) || 31;
  return addMonths(iso(label.year, mm, Math.min(dd, 28)), -3 * (4 - label.quarter));
};

// The document's own fiscal year and period (dei:DocumentFiscalYearFocus, DocumentFiscalPeriodFocus).
function documentFocus(html) {
  const pick = (name) => String(html).match(new RegExp(`name="dei:${name}"[^>]*>(?:<[^>]+>)*\\s*([^<\\s]+)`))?.[1] ?? null;
  const year = Number(pick("DocumentFiscalYearFocus")) || null;
  const period = pick("DocumentFiscalPeriodFocus");
  return year || period ? { year, period: period?.toUpperCase() ?? null } : null;
}

// The results releases filed for a report: Item 2.02 8-Ks from its period's end to the day after it
// was filed, the latest first (a quarter's full results come after a preliminary one).
const releasesFor = (rows, report) => releasesFrom(rows).flatMap((r) => r.members)
  .filter((m) => m.date > report.reportDate && days(report.filingDate, m.date) <= 1).sort((a, b) => b.date.localeCompare(a.date));

const MAX_EXHIBITS = 3;

// One release's tables set against the report.
async function checkRelease(session, cik, accession, ctx) {
  const docs = await filingDocuments(session, cik, accession);
  const exhibits = docs.filter((d) => /^EX-99/.test(d.type ?? "") && /\.html?$/i.test(d.name)).slice(0, MAX_EXHIBITS);
  if (!exhibits.length) return null;
  let best = null;
  for (const ex of exhibits) {
    const tables = await documentTables(session, ex.url);
    const results = tables.map((t) => ({ t, r: compareTable(t, ctx) })).filter((x) => x.r);
    const compared = results.reduce((n, x) => n + x.r.compared, 0);
    if (!best || compared > best.compared) best = { exhibit: ex, tables, results, compared };
    if (compared >= 10) break;
  }
  return best;
}

const fmtNumber = (n) => (typeof n === "number" ? Number(n.toFixed(6)) : n);
const SCALE_NAMES = { 0: "units", 3: "thousands", 6: "millions", 9: "billions" };

export async function releaseCheck(session, args) {
  const a = releaseCheckInput.parse(args);
  const max = a.max_rows ?? 40;
  const e = await resolveEntity(session, a.company);
  const asked = a.period?.trim();
  const isDate = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked);
  const label = asked && !isDate ? fiscalLabel(asked) : null;
  if (asked && !isDate && !label) throw new Error(`period "${asked}" is neither a date (2026-06-30) nor a fiscal label (Q2 2026, FY2025).`);
  const year = isDate ? Number(asked.slice(0, 4)) : label ? label.year + 1 : new Date(session.now()).getUTCFullYear();
  const { sub, rows } = await filings(session, e.cik, { since: `${year - 2}-01-01` });
  const name = sub.name ?? e.name ?? `CIK ${e.cik}`;
  const reports = rows.filter((r) => PERIODIC.test(r.form) && r.reportDate);
  if (!reports.length) throw new NotFound(`${name} has filed no 10-Q or 10-K in the period read${rows.some((r) => /^(20-F|40-F|6-K)$/.test(r.form)) ? " (it reports as a foreign issuer, on Forms 20-F, 40-F and 6-K)" : ""}; list_filings shows what it has filed.`);
  const nearest = (end) => reports.map((r) => [r, Math.abs(days(r.reportDate, end))]).filter(([, d]) => d <= (isDate ? 10 : 20)).sort((x, y) => x[1] - y[1])[0]?.[0] ?? null;
  let report = !asked ? reports.find((r) => releasesFor(rows, r).length) ?? reports[0] : nearest(isDate ? asked : labelEnd(label, sub.fiscalYearEnd));
  if (!report) throw new NotFound(`${name} has no 10-Q or 10-K for ${isDate ? `a quarter ending near ${asked}` : `${asked} (read as the quarter ending near ${labelEnd(label, sub.fiscalYearEnd)})`}; its recent reports end ${reports.slice(0, 4).map((r) => r.reportDate).join(", ")}.`);
  const read = async (r) => {
    if (r.isInlineXBRL === 0) throw new Error(`${name}'s ${r.form} for the period to ${r.reportDate} is not in inline XBRL, so its figures cannot be read beside the release's; filing_check and financial_statements read older filings.`);
    const url = `${archiveBase(e.cik, r.accessionNumber)}/${String(r.primaryDocument).replace(/^xsl[^/]*\//, "")}`;
    const html = await getText(session, url, { maxBytes: 96 * 1024 * 1024, timeoutMs: 60000, variant: "inline-xbrl" });
    return { url, html, doc: readDocument(html), focus: documentFocus(html) };
  };
  let filed = await read(report);
  // A fiscal label is checked against the report's own: a company that names its year by the one it
  // starts in is a year off.
  if (label && filed.focus?.year && filed.focus.year !== label.year) {
    const retry = nearest(addMonths(labelEnd(label, sub.fiscalYearEnd), 12 * (label.year - filed.focus.year)));
    if (retry && retry !== report) { const again = await read(retry); if (again.focus?.year === label.year) { report = retry; filed = again; } }
  }
  if (!filed.doc.facts.length) throw new Error(`${name}'s ${report.form} for the period to ${report.reportDate} holds no inline XBRL facts to compare.`);
  const releases = releasesFor(rows, report);
  if (!releases.length) throw new NotFound(`${name} filed no results release (8-K Item 2.02) between the end of the period on ${report.reportDate} and its ${report.form} of ${report.filingDate}; earnings_release reads its releases.`);
  const ctx = { doc: filed.doc, periods: factsByPeriod(filed.doc) };
  let found = null, release = null;
  for (const m of releases.slice(0, 2)) {
    found = await checkRelease(session, e.cik, m.accession, ctx);
    release = m;
    if (found?.compared) break;
  }
  if (!found) throw new NotFound(`${name}'s results 8-K ${release.accession} has no press release in HTML to read; read_filing lists its documents.`);
  if (!found.compared) throw new NotFound(`No figure in ${name}'s results release of ${release.date} (${found.exhibit.url}) could be set against its ${report.form} of ${report.filingDate}: ${found.tables.length ? "its tables hold no figures for the periods the report covers" : "it has no tables in HTML (its statements may be pictures)"}. earnings_release reads the release's text.`);
  const results = found.results.map((x) => x.r);
  const counts = { compared: 0, agreeing: 0, changed: 0, release_only: 0, not_in_report_periods: 0 };
  for (const r of results) { counts.compared += r.compared; counts.agreeing += r.agree; counts.changed += r.changed.length; counts.release_only += r.releaseOnly.length; counts.not_in_report_periods += r.notCompared; }
  const scaleName = (r, kind) => (kind === "per_share" ? "units (per share)" : kind === "shares" ? `${SCALE_NAMES[r.scales.shares] ?? `10^${r.scales.shares}`} of shares` : kind === "money" ? SCALE_NAMES[r.scales.money] ?? `10^${r.scales.money}` : "as shown");
  const changed = results.flatMap((r) => r.changed.map((c) => {
    const diff = Number((c.filed - c.release).toFixed(Math.min(10, c.dp + 6)));
    return [c.label, periodLabel(c.period), fmtNumber(c.release), fmtNumber(c.filed), fmtNumber(diff), c.release ? Number(((diff / Math.abs(c.release)) * 100).toFixed(2)) : null, c.concept, scaleName(r, c.kind), c.how];
  }));
  const onlySeen = new Set();
  const releaseOnly = results.flatMap((r) => r.releaseOnly.map((x) => x.label)).filter((l) => l && !onlySeen.has(l) && onlySeen.add(l));
  // Lines of the report's matched tables that no release line matched: new lines, or lines the release
  // folded into others.
  const filedOnly = [];
  const agreed = new Set(results.flatMap((r) => [...r.agreed]));
  for (const r of results.filter((x) => x.filingTable !== null && x.compared >= 3)) {
    const ft = filed.doc.tables[r.filingTable];
    const wanted = new Set(r.periods.filter(Boolean).map((p) => p.key));
    ft.rows.forEach((row, j) => {
      if (r.used.has(j) || filedOnly.some((x) => x.table === r.filingTable && x.j === j)) return;
      const facts = row.cells.flatMap((c) => c.facts);
      if (facts.some((k) => agreed.has(filed.doc.facts[k]))) return;
      for (const k of facts) {
        const f = filed.doc.facts[k], c = filed.doc.contexts.get(f.contextRef), v = valueOf(f);
        if (!c || c.dims.length || typeof v !== "number" || v === 0) continue;
        const p = ctx.periods.get(periodKey(c.start && c.start !== c.end ? c.start : null, c.end));
        if (!p || !wanted.has(p.key)) continue;
        const kind = filed.doc.kinds.get(f.unitRef) ?? null;
        const s = scaleFor(kind, r.scales);
        filedOnly.push({ table: r.filingTable, j, row: [rowLabel(ft, j), periodLabel(p), fmtNumber((shownNegative(filed.doc, { f, value: v }) ? -1 : 1) * Math.abs(v) / 10 ** s), f.name] });
        break;
      }
    });
  }
  const form = report.form;
  const reading = counts.changed
    ? `${counts.changed} of the ${counts.compared} figures ${name}'s results release of ${release.date} gave for periods its ${form} reports are different in the ${form} filed ${report.filingDate}; ${counts.agreeing} agree${counts.release_only ? ` and ${counts.release_only} have no counterpart in it` : ""}.`
    : `Every figure ${name}'s results release of ${release.date} gave that its ${form} of ${report.filingDate} also reports agrees (${counts.agreeing} of ${counts.compared})${counts.release_only ? `; ${counts.release_only} release figures have no counterpart in the ${form}` : ""}.`;
  const indexUrl = `${archiveBase(e.cik, release.accession)}/${release.accession}-index.htm`;
  return {
    company: { cik: e.cik, name, ticker: sub.tickers?.[0] ?? e.ticker ?? null },
    period: { end: report.reportDate, ...(filed.focus ? { fiscal: [filed.focus.period, filed.focus.year].filter(Boolean).join(" ") } : {}) },
    release: { date: release.date, accession: release.accession, url: found.exhibit.url, index: indexUrl },
    filing: { form, date: report.filingDate, accession: report.accessionNumber, url: filed.url },
    counts,
    changed: {
      columns: ["label", "period", "release_value", "filed_value", "difference", "difference_pct", "concept", "scale", "matched_by"],
      rows: changed.slice(0, max),
      ...(changed.length > max ? { rows_shown: `${max} of ${changed.length}` } : {}),
      note: "Values are as each document shows them, in the release's scale (scale): a figure in parentheses is negative. difference is filed_value minus release_value; difference_pct is that as a percentage of the release's figure. concept is the XBRL concept the report tags on the line.",
    },
    release_only: releaseOnly.slice(0, max),
    ...(filedOnly.length ? { filed_only: { columns: ["label", "period", "filed_value", "concept"], rows: filedOnly.slice(0, max).map((x) => x.row), note: "Lines of the report's matching tables, in the periods compared, that no line of the release matches: a line the report adds (a charge booked after the release) or one the release folds into another." } } : {}),
    tables: { columns: ["release_table", "caption", "compared", "agreeing", "changed", "release_only", "scale", "report_table"], rows: found.results.filter((x) => x.r.compared).map(({ t, r }) => [t.index, String(t.caption ?? t.heading ?? "").slice(0, 120), r.compared, r.agree, r.changed.length, r.releaseOnly.length, `${SCALE_NAMES[r.scales.money] ?? r.scales.money} (${r.scaleNote})`, r.filingTable]) },
    reading,
    source: filed.url,
    sources: [found.exhibit.url, filed.url],
    limits: [
      "Not investment advice.",
      "Compares the figures in the release's tables (statements, segment and other tables) with the facts tagged in the report's inline XBRL for the same periods. Figures written only in the release's sentences are not compared, nor are percentages.",
      "Non-GAAP figures (adjusted earnings, EBITDA, free cash flow), operating metrics and figures the report does not tag have no XBRL counterpart and show as release-only; a period the report does not cover (a fourth quarter in a 10-K, a sequential quarter, a quarter's cash flows in a 10-Q that gives them for the year to date) is counted in not_in_report_periods.",
      "A figure agrees when a fact for its period holds the same size within the rounding either shows. It is called changed only when its line in the report is found (matched_by says how) and holds another value; a line the report presents differently (split or combined) is release-only, not changed.",
      "Only the report's main document is read; the scale of a table is the one it states, or the one its figures agree at when it states none (tables lists both).",
    ],
  };
}
