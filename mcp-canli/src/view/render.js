// The result viewer's rendering: a tool result (JSON) to HTML, with no dependencies, so the same
// functions run in the host's sandboxed frame and in the tests. Tables stay tables; a table whose
// first column is dates, or a series of dates and values, also gets a line chart; statements keep
// their lines and units; checked claims sit under their sentence with verdict badges; earlier
// guidance is drawn as its range with the actual result marked; the fields a result groups (a
// stock's market figures, a protocol's fees) are drawn as figures with their labels.
// Every string from a result is escaped: results carry text from filings and press releases.
import { studioCall, studioCompact, studioFor } from "./studio.js";
import { compareFor } from "./atlas.js";


export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

const ISO = /^\d{4}-\d{2}-\d{2}/;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isUrl = (v) => /^https?:\/\//.test(String(v ?? ""));
// A link out of the frame; `html` is already escaped.
const link = (url, html) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
const words = (v) => esc(String(v ?? "").replace(/_/g, " "));
// A link's text: the host and the last part of the path.
function linkText(url) {
  const m = /^https?:\/\/([^/?#]+)([^?#]*)/.exec(url), tail = (m?.[2] ?? "").split("/").filter(Boolean).pop();
  const s = tail ? `${m[1]}/…/${tail}` : m?.[1] ?? url;
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
}
const unitAfter = (u) => (u === "%" ? "%" : u ? ` <span class="sub">${esc(u)}</span>` : "");

// A number as people read it: thousands grouped, up to four decimals (at least `min`), never in
// exponent form.
export function fmt(v, min = 0) {
  if (!isNum(v)) return esc(v ?? "");
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.max(digits, min), minimumFractionDigits: min });
}

// An axis label: millions, billions and trillions shortened, so a large figure fits.
export function short(v) {
  const a = Math.abs(v);
  for (const [d, u] of [[1e12, "T"], [1e9, "B"], [1e6, "M"]]) if (a >= d) return `${Number((v / d).toPrecision(4)).toLocaleString("en-US")}${u}`;
  return fmt(v);
}

// Verdicts carry their meaning in colour. Positions against a guided range stay neutral: above the
// range is good news for revenue and bad news for costs.
const VERDICT = { confirmed: "ok", "confirmed as first reported": "ok", contradicted: "bad", "not reported": "warn", "not checkable": "muted" };
function badge(text) {
  const t = String(text ?? "");
  const kind = VERDICT[t] ?? (/^(above|below|within)/.test(t) ? "info" : /^not placed/.test(t) ? "muted" : null);
  return kind ? `<span class="badge ${kind}">${esc(t)}</span>` : esc(t);
}

// A table: its columns and rows, numbers right-aligned, badge columns coloured, long text wrapped
// to at most three lines (the whole of it on hover).
export function table({ columns, rows, title, note, maxRows = 200 }) {
  let cols = Array.isArray(columns) ? columns : [];
  let body = (Array.isArray(rows) ? rows : []).slice(0, maxRows).map((r) => (Array.isArray(r) ? r : [r]));
  // A statement's concept column moves into its line's tooltip, so the figures sit by their labels,
  // and a line with cents shows them in every period (18.00 beside 17.95, not 18).
  let concepts = null;
  if (cols[1] === "concept") {
    concepts = body.map((r) => r[1]);
    cols = [cols[0], ...cols.slice(2)];
    body = body.map((r) => [r[0], ...r.slice(2)]);
  }
  // A column no row fills is left out (the first, the label, stays).
  const filled = cols.map((_, i) => i === 0 || body.some((r) => r[i] !== null && r[i] !== undefined && r[i] !== ""));
  if (filled.includes(false)) { cols = cols.filter((_, i) => filled[i]); body = body.map((r) => r.filter((_, i) => filled[i])); }
  const badgeCol = new Set(cols.map((c, i) => (/^(verdict|position)$/.test(String(c)) ? i : -1)).filter((i) => i >= 0));
  const numCol = cols.map((_, i) => body.some((r) => isNum(r[i])) && body.every((r) => r[i] == null || isNum(r[i])));
  // A market's probability (0 to 1) reads as a percentage.
  const pctCol = new Set(cols.map((c, i) => (c === "probability" && body.every((r) => r[i] == null || (isNum(r[i]) && r[i] >= 0 && r[i] <= 1)) ? i : -1)).filter((i) => i >= 0));
  const cell = (v, i, min, tip) => {
    if (Array.isArray(v) || (v && typeof v === "object")) return `<td class="obj">${esc(JSON.stringify(v).slice(0, 160))}</td>`;
    if (badgeCol.has(i)) return `<td>${badge(v)}</td>`;
    if (pctCol.has(i) && isNum(v)) return `<td class="num" data-v="${v}">${fmt(Math.round(v * 1000) / 10)}%</td>`;
    if (isNum(v)) return `<td class="num" data-v="${v}">${fmt(v, cols[i] === "decimals" ? 0 : min)}</td>`;
    const s = String(v ?? "");
    if (cols[i] === "measure" && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return `<td>${words(s)}</td>`;
    if (isUrl(s)) return `<td>${link(s, "source")}</td>`;
    if (s.length > 48) return `<td class="text" title="${esc(tip ?? s)}"><div class="clamp">${esc(s.length > 600 ? `${s.slice(0, 597)}…` : s)}</div></td>`;
    return `<td${tip ? ` title="${esc(tip)}"` : ""}>${esc(s)}</td>`;
  };
  const head = cols.length ? `<thead><tr>${cols.map((c, i) => `<th${numCol[i] ? " class=\"num\"" : ""}>${esc(c)}</th>`).join("")}</tr></thead>` : "";
  // A heading row has a label and no values. A table without them sorts by any heading, and a long
  // one has a filter box (studio.js wires both).
  const isHeading = (row) => row.length > 1 && row.slice(1).every((v) => v === null || v === "");
  const sortable = body.length >= 3 && !concepts && !body.some(isHeading);
  const lines = body.map((row, n) => {
    const heading = isHeading(row);
    const min = concepts && row.some((v) => isNum(v) && !Number.isInteger(v)) ? 2 : 0;
    return `<tr${heading ? " class=\"heading\"" : ""}>${row.map((v, i) => cell(v, i, min, i === 0 && concepts?.[n] ? String(concepts[n]) : undefined)).join("")}</tr>`;
  }).join("");
  const more = Array.isArray(rows) && rows.length > maxRows ? `<p class="note">${rows.length - maxRows} more rows not shown.</p>` : "";
  const filter = sortable && body.length > 12 ? `<input type="search" class="filter" placeholder="Filter ${body.length} rows" aria-label="Filter rows">` : "";
  return `<section>${title ? `<h3>${esc(title)}</h3>` : ""}${filter}<div class="scroll"><table${sortable ? ' class="sortable"' : ""}>${head}<tbody>${lines}</tbody></table></div>${note ? `<p class="note">${esc(note)}</p>` : ""}${more}</section>`;
}

// Claims checked against filings (verify_claims): each sentence once, then its checks: the verdict,
// the measure and period, the claimed figure, the filed figure (linked to its filing, the
// difference on hover) and, for a contradicted figure, what it does match.
export function claims({ columns, rows }, title) {
  const [c, m, p, cl, u, v, f, d, n, s] = ["claim", "measure", "period", "claimed", "unit", "verdict", "filed", "difference", "note", "source"].map((k) => columns.indexOf(k));
  let last;
  const lines = rows.slice(0, 200).map((r) => {
    const sentence = r[c] !== last ? `<tr class="heading"><td colspan="5">${esc(r[c])}</td></tr>` : "";
    last = r[c];
    const filed = isNum(r[f]) ? `${fmt(r[f])}${r[u] === "%" ? "%" : ""}` : esc(r[f] ?? "");
    return `${sentence}<tr><td>${badge(r[v])}</td><td>${words(r[m])}${r[p] ? `<span class="sub line">${esc(r[p])}</span>` : ""}</td><td class="num">${fmt(r[cl])}${r[u] === "%" ? "%" : r[u] ? `<span class="sub line">${esc(r[u])}</span>` : ""}</td><td class="num"${isNum(r[d]) ? ` title="difference ${fmt(r[d])}"` : ""}>${isUrl(r[s]) ? link(r[s], filed || "source") : filed}</td><td class="text">${esc(r[n] ?? "")}</td></tr>`;
  }).join("");
  return `<section>${title ? `<h3>${esc(title)}</h3>` : ""}<div class="scroll"><table><thead><tr><th>verdict</th><th>measure</th><th class="num">claimed</th><th class="num">filed</th><th>note</th></tr></thead><tbody>${lines}</tbody></table></div></section>`;
}

// A results release's tables (earnings_release), compact enough for a chat: the measure with its
// part of the business or period under it, the figure with its unit, the basis, and what a change
// is measured against. The sentence each row came from is on hover.
const unitOf = (unit) => (unit === "%" ? "%" : unit ? `<span class="sub line">${esc(unit)}</span>` : "");
const amount = (v, unit) => `${fmt(v)}${unitOf(unit)}`;
const span = (lo, hi, unit, about) => `${about ? "about " : ""}${fmt(lo)}${isNum(hi) && hi !== lo ? ` to ${fmt(hi)}` : ""}${unitOf(unit)}`;
export function releaseKind(columns) {
  const has = (...ks) => ks.every((k) => columns.includes(k));
  return has("guided_low", "guided_high", "actual") ? "prior" : has("measure", "low", "high", "quote") ? "guidance" : has("measure", "value", "unit", "quote") ? "results" : null;
}
export function releaseTable({ columns, rows }, title) {
  const kind = releaseKind(columns), at = (k) => columns.indexOf(k);
  const get = (r, k) => (at(k) >= 0 ? r[at(k)] : null);
  const named = (r, under) => `<td title="${esc(["quote", "guidance_quote", "result_quote"].map((k) => get(r, k)).filter((x) => typeof x === "string" && x).join(" | "))}">${words(get(r, "measure") ?? get(r, "label"))}${under ? `<span class="sub line">${esc(under)}</span>` : ""}</td>`;
  const heads = { results: ["measure", "value", "basis", "change"], guidance: ["measure", "guided", "basis", "words"], prior: ["measure", "guided", "actual", "position"] }[kind];
  const cells = rows.slice(0, 200).map((r) => {
    if (kind === "results") return [named(r, get(r, "section")), `<td class="num">${amount(get(r, "value"), get(r, "unit"))}</td>`, `<td>${esc(get(r, "basis") ?? "")}</td>`, `<td>${esc([get(r, "change"), get(r, "versus")].filter(Boolean).join(", "))}</td>`];
    if (kind === "guidance") return [named(r, get(r, "period")), `<td class="num">${span(get(r, "low"), get(r, "high"), get(r, "unit"), get(r, "approximate"))}</td>`, `<td>${esc(get(r, "basis") ?? "")}</td>`, `<td>${esc(get(r, "change_or_words") ?? "")}</td>`];
    return [named(r, [get(r, "basis"), get(r, "period_guided")].filter(Boolean).join(", ")), `<td class="num">${span(get(r, "guided_low"), get(r, "guided_high"), get(r, "unit"))}</td>`, `<td class="num">${amount(get(r, "actual"), get(r, "unit"))}</td>`, `<td>${badge(get(r, "position"))}</td>`];
  });
  // A column no row fills (no basis named, no change) is left out.
  const keep = heads.map((_, i) => i < 2 || cells.some((c) => !/^<td[^>]*><\/td>$/.test(c[i])));
  const th = heads.map((h, i) => `<th${i && i < 3 && h !== "basis" ? " class=\"num\"" : ""}>${esc(h)}</th>`).filter((_, i) => keep[i]).join("");
  const lines = cells.map((c) => `<tr>${c.filter((_, i) => keep[i]).join("")}</tr>`).join("");
  return `<section>${title ? `<h3>${esc(title)}</h3>` : ""}<div class="scroll"><table><thead><tr>${th}</tr></thead><tbody>${lines}</tbody></table></div></section>`;
}

// Series for a chart from a table: the first column as dates, each numeric column a line, on the
// scale of the first one that is not all zeros (a volume beside a rate, or a change in basis points
// beside a rate in percent, would flatten it); a spread of percentiles is drawn as its outer pair,
// or not at all beside a target range. Rows that are changes (an "event" column: a policy rate's decisions) are steps.
export function seriesFromTable({ columns, rows }) {
  if (!Array.isArray(rows) || rows.length < 3 || !Array.isArray(columns) || !rows.every(Array.isArray)) return null;
  // The dates: the first column, one row a date (transactions on a shared day are not a series); or,
  // beside labels, a later column of dates in order (a futures curve's expirations).
  const isDates = (i) => rows.every((r) => typeof r[i] === "string" && ISO.test(r[i]));
  const unique = (i) => new Set(rows.map((r) => r[i])).size === rows.length;
  let at = isDates(0) && unique(0) ? 0 : -1;
  if (at < 0 && !isDates(0) && unique(0)) at = columns.findIndex((_, i) => i > 0 && isDates(i) && rows.every((r, k) => k === 0 || r[i] > rows[k - 1][i]));
  if (at < 0) return null;
  const dates = rows.map((r) => r[at]);
  const mid = (vs) => { const a = vs.filter(isNum).map(Math.abs).sort((x, y) => x - y); return a[a.length >> 1] ?? 0; };
  const pct = columns.map((c, i) => (/^percentile_/.test(String(c)) ? i : -1)).filter((i) => i > 0);
  const band = columns.includes("target_from") && columns.includes("target_to");
  let lines = [];
  for (let i = 1; i < columns.length; i++) {
    if (i === at) continue;
    if (pct.includes(i) && (band || (pct.length > 2 && i !== pct[0] && i !== pct.at(-1)))) continue;
    const values = rows.map((r) => r[i]);
    if (values.filter(isNum).length >= Math.max(3, rows.length * 0.6)) lines.push({ name: String(columns[i]), values: values.map((v) => (isNum(v) ? v : null)) });
  }
  const m0 = lines.map((l) => mid(l.values)).find((m) => m > 0);
  if (m0) lines = lines.filter((l) => { const m = mid(l.values); return m > m0 / 10 && m < m0 * 10; });
  lines = lines.slice(0, 4);
  return lines.length ? { dates, lines, ...(columns.includes("event") ? { step: true } : {}) } : null;
}

// A line chart in SVG: oldest on the left, the value range with four gridlines, a legend. Steps
// (a rate that holds until it changes) are spaced by date and drawn level until the next change.
export function chart({ dates, lines, step = false }, title) {
  const order = dates.map((d, i) => [d, i]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, i]) => i);
  const xs = order.map((i) => dates[i]);
  const all = lines.flatMap((l) => l.values.filter(isNum));
  if (all.length < 2) return "";
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const W = 640, H = 220, L = 56, R = 12, T = 12, B = 28;
  const t = xs.map((d) => Date.parse(d)), t0 = t[0], span = t[t.length - 1] - t0;
  const x = (k) => L + (xs.length === 1 ? 0 : (step && span > 0 ? (t[k] - t0) / span : k / (xs.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const grid = [0, 1, 2, 3].map((g) => { const v = lo + ((hi - lo) * g) / 3; return `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="axis" text-anchor="end">${short(v)}</text>`; }).join("");
  const paths = lines.map((l, n) => {
    let d = "", pen = false;
    order.forEach((i, k) => { const v = l.values[i]; if (!isNum(v)) { pen = false; return; } d += pen ? (step ? `H${x(k).toFixed(1)}V${y(v).toFixed(1)}` : `L${x(k).toFixed(1)},${y(v).toFixed(1)}`) : `M${x(k).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return `<path d="${d}" class="line s${n}"/>`;
  }).join("");
  const labels = `<text x="${L}" y="${H - 8}" class="axis">${esc(xs[0])}</text><text x="${W - R}" y="${H - 8}" class="axis" text-anchor="end">${esc(xs[xs.length - 1])}</text>`;
  const legend = lines.length > 1 ? `<div class="legend">${lines.map((l, n) => `<span><i class="s${n}"></i>${esc(l.name)}</span>`).join("")}</div>` : "";
  return `<section>${title ? `<h3>${esc(title)}</h3>` : ""}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title ?? "chart")}">${grid}${paths}${labels}</svg>${legend}</section>`;
}

// Earlier guidance against the result (earnings_release): each guided range as a band on its own
// scale, the actual result as a dot, and where it landed in words.
export function ranges({ columns, rows }, title) {
  const at = (...names) => names.map((k) => columns.indexOf(k)).find((i) => i >= 0) ?? -1;
  const [m, b, lo, hi, act, u, pos] = [at("measure"), at("basis"), at("guided_low", "low"), at("guided_high", "high"), at("actual"), at("unit"), at("position")];
  if (act < 0 || lo < 0 || hi < 0) return "";
  const items = rows.filter((r) => isNum(r[lo]) && isNum(r[hi]) && isNum(r[act])).slice(0, 24);
  if (!items.length) return "";
  const html = items.map((r) => {
    const a = Math.min(r[lo], r[act]), z = Math.max(r[hi], r[act]);
    const pad = (z - a) * 0.25 || Math.abs(z) * 0.05 || 1;
    const x = (v) => ((v - (a - pad)) / (z - a + 2 * pad)) * 100;
    return `<div class="range"><div class="top"><span>${words(r[m])}${r[b] ? ` <span class="sub">${esc(r[b])}</span>` : ""}</span><span class="vals">guided ${fmt(r[lo])}${r[hi] !== r[lo] ? ` to ${fmt(r[hi])}` : ""}, actual ${fmt(r[act])}${unitAfter(r[u])}${pos >= 0 && r[pos] ? ` ${badge(r[pos])}` : ""}</span></div><div class="track"><span class="bar" style="left:${x(r[lo]).toFixed(2)}%;width:${Math.max(0.8, x(r[hi]) - x(r[lo])).toFixed(2)}%"></span><span class="dot" style="left:${x(r[act]).toFixed(2)}%"></span></div></div>`;
  }).join("");
  return `<section>${title ? `<h3>${esc(title)}</h3>` : ""}<div class="ranges">${html}</div></section>`;
}

const STATEMENTS = ["income", "balance_sheet", "cash_flow", "comprehensive_income", "equity"];
const NAMES = { income: "Income statement", balance_sheet: "Balance sheet", cash_flow: "Cash flows", comprehensive_income: "Comprehensive income", equity: "Equity" };
const TALLY = [["confirmed", "ok"], ["contradicted", "bad"], ["not_reported", "warn"], ["not_checkable", "muted"]];
// What a result is about: its name heads the page, its other identifiers under it.
const SUBJECTS = ["company", "fund", "rate", "protocol", "chain", "stablecoin"];
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isPlain = (v) => v === null || typeof v !== "object";

// One field's value among figures: numbers grouped, links shortened, short lists joined, a small
// object on one line.
function value(v, depth = 0) {
  if (isNum(v)) return fmt(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return isUrl(v) ? link(v, esc(linkText(v)).replace(/\//g, "/<wbr>")) : esc(v.length > 600 ? `${v.slice(0, 599)}…` : v);
  if (Array.isArray(v) && v.every(isPlain)) return `${v.slice(0, 12).map((x) => value(x, depth + 1)).join(v.every(isUrl) ? "<br>" : ", ")}${v.length > 12 ? `, and ${v.length - 12} more` : ""}`;
  if (isObj(v) && depth === 0 && Object.values(v).every(isPlain)) return Object.entries(v).map(([k, x]) => `${words(k)} ${value(x, 1)}`).join(" · ");
  return esc(JSON.stringify(v ?? "").slice(0, 160));
}

// The tables an object holds: columns with rows, with one row of values, or with other lists of
// rows (a projection's median beside its range).
function tablesOf(v, title) {
  if (!isObj(v) || !Array.isArray(v.columns)) return [];
  const n = v.columns.length, out = [], note = typeof v.note === "string" ? v.note : null;
  if (Array.isArray(v.values) && v.values.length === n && v.values.every(isPlain)) out.push(table({ columns: v.columns, rows: [v.values], title, note }));
  for (const [k, rows] of Object.entries(v)) {
    if (k === "rows" ? Array.isArray(rows) : k !== "columns" && Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r) && r.length === n)) out.push(table({ columns: v.columns, rows, title: k === "rows" ? title : `${title} · ${k.replace(/_/g, " ")}`, note: k === "rows" ? note : null }));
  }
  return out;
}

// A curve over maturities (Treasury yields: "1 Mo" to "30 Yr"), in their order, each rate on hover.
const TENOR = /^\d+(\.\d+)?\s*(mo|month|months|yr|year|years|y|m|w|wk|week|weeks)$/i;
function curve(entries, title) {
  const vs = entries.map(([, v]) => v), W = 640, H = 200, L = 44, R = 12, T = 12, B = 28;
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = (k) => L + (k / (entries.length - 1)) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const grid = [0, 1, 2, 3].map((g) => { const v = lo + ((hi - lo) * g) / 3; return `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="axis" text-anchor="end">${short(v)}</text>`; }).join("");
  const path = entries.map(([, v], k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const dots = entries.map(([n, v], k) => `<circle cx="${x(k).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="pt"><title>${esc(n)}: ${fmt(v)}</title></circle>`).join("");
  const ticks = entries.map(([n], k) => `<text x="${x(k).toFixed(1)}" y="${H - 8}" class="axis" text-anchor="middle">${esc(String(n).replace(/\s*(month|months|mo)$/i, "m").replace(/\s*(year|years|yr)$/i, "y"))}</text>`).join("");
  return `<section>${title ? `<h3>${esc(title)}</h3>` : ""}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title ?? "curve")}">${grid}<path d="${path}" class="line s0"/>${dots}${ticks}</svg></section>`;
}

// Figures with their labels, in a grid; long text across the grid.
function grid(entries, title) {
  if (!entries.length) return "";
  if (entries.length >= 4 && entries.every(([k, v]) => TENOR.test(k) && isNum(v))) return curve(entries, title);
  const dd = (v) => {
    if (typeof v !== "string" || isUrl(v)) return value(v);
    if (v.length > 240) return `<div class="clamp" title="${esc(v.slice(0, 2000))}">${value(v)}</div>`;
    // A hash or other long unbroken token: its start, the whole on hover.
    if (v.length > 32 && !/\s/.test(v)) return `<span title="${esc(v)}">${esc(v.slice(0, 16))}…</span>`;
    return value(v);
  };
  // Long text and long links take the whole row.
  const wide = (v) => (Array.isArray(v) ? v.some(isUrl) : typeof v === "string" && (isUrl(v) ? linkText(v).length > 30 : v.length > 80 && /\s/.test(v)));
  return `<section>${title ? `<h3>${esc(title)}</h3>` : ""}<dl class="facts">${entries.map(([k, v]) => `<div${wide(v) ? " class=\"wide\"" : ""}><dt>${words(k)}</dt><dd>${dd(v)}</dd></div>`).join("")}</dl></section>`;
}

// A group of fields (market figures, a filing, fees): its figures, then the tables in it and in its
// own groups.
function facts(obj, title, skip = []) {
  if (Array.isArray(obj.columns)) {
    const plain = Object.entries(obj).filter(([k, v]) => k !== "note" && isPlain(v) && !skip.includes(k));
    return grid(plain, title) + tablesOf(obj, title).join("");
  }
  const entries = [], tables = [];
  for (const [k, v] of Object.entries(obj)) {
    if (skip.includes(k)) continue;
    const t = tablesOf(v, `${title} · ${k.replace(/_/g, " ")}`);
    if (t.length) tables.push(...t);
    else if (isObj(v) && !Object.values(v).every(isPlain)) tables.push(facts(v, `${title} · ${k.replace(/_/g, " ")}`));
    else entries.push([k, v]);
  }
  return grid(entries, title) + tables.join("");
}

// The blocks of one result: what it is about, a verdict tally, its grouped figures, then special
// forms (statements, series, guided against actual), any table in its fields, lists of records,
// and its plain fields and notes.
export function renderResult(result) {
  if (result == null || typeof result !== "object") return `<pre>${esc(JSON.stringify(result, null, 1))}</pre>`;
  if (Array.isArray(result)) return result.every(isObj) ? records(result) : `<pre>${esc(JSON.stringify(result, null, 1).slice(0, 4000))}</pre>`;
  const out = [];
  // The ref is in the heading; a preview's note and the limits are drawn at the end.
  const seen = new Set(["ref", "preview_only", "limits"]);
  const who = SUBJECTS.find((k) => isObj(result[k]) && typeof (result[k].name ?? result[k].ticker) === "string");
  const head = [who && (result[who].name ?? result[who].ticker), result.release?.headline, result.symbol, result.series, result.title, typeof result.query === "string" ? `“${result.query}”` : null].filter((x) => typeof x === "string").slice(0, 2);
  for (const k of ["symbol", "series", "title", "query"]) if (head.includes(result[k]) || head.includes(`“${result[k]}”`)) seen.add(k);
  if (who) {
    seen.add(who);
    const ids = Object.entries(result[who]).filter(([k, v]) => !["name", "id", "slug"].includes(k) && v !== head[0] && (isPlain(v) || (Array.isArray(v) && v.every(isPlain))) && v !== null && v !== "");
    out.push(`<p class="lead">${esc(head.join(" · "))}${ids.length ? `<span class="sub line">${ids.map(([k, v]) => `${words(k)} ${value(v)}`).join(" · ")}</span>` : ""}</p>`);
  } else if (head.length) out.push(`<p class="lead">${esc(head.join(" · "))}</p>`);
  // Interactive views (studio.js) draw what they hold; the rest is drawn as before.
  const studio = studioFor(result);
  for (const k of studio.used) seen.add(k);
  if (studio.html) out.push(studio.html);
  // A tally of verdicts reads at a glance; any other summary is figures with their labels.
  const sum = result.summary;
  if (isObj(sum) && !seen.has("summary")) {
    if (Object.keys(sum).every((k) => k === "claims" || TALLY.some(([t]) => t === k))) {
      out.push(`<p class="tally">${isNum(sum.claims) ? `${fmt(sum.claims)} ${sum.claims === 1 ? "claim" : "claims"} checked: ` : ""}${TALLY.filter(([k]) => sum[k] > 0).map(([k, kind]) => `<span class="badge ${kind}">${fmt(sum[k])} ${words(k)}</span>`).join(" ")}</p>`);
    } else out.push(facts(sum, "Summary"));
    seen.add("summary");
  }
  // Grouped figures (a stock's market data, the next earnings date, a filing, fees), before the
  // long tables; statements and tables are drawn below.
  for (const [k, v] of Object.entries(result)) {
    if (seen.has(k) || STATEMENTS.includes(k) || !isObj(v) || Array.isArray(v.rows) || (Array.isArray(v.columns) && Array.isArray(v.values) && Object.keys(v).length <= 3)) continue;
    out.push(facts(v, k.replace(/_/g, " "), k === "release" ? ["headline"] : []));
    seen.add(k);
  }
  // Statements as filed, under the company's own title and scale.
  for (const k of STATEMENTS) if (!seen.has(k) && result[k]?.columns && result[k]?.rows) {
    const st = result[k];
    out.push(table({ columns: st.columns, rows: st.rows, title: `${st.title || NAMES[k]}${st.units ? ` (${st.units})` : ""}` }));
    seen.add(k);
  }
  // A price or economic series: dates beside values.
  if (Array.isArray(result.dates) && (Array.isArray(result.close) || Array.isArray(result.values)) && !seen.has("close")) {
    const values = result.close ?? result.values;
    out.push(chart({ dates: result.dates, lines: [{ name: result.close ? "close" : String(result.series ?? "value"), values }] }, result.close ? `${result.symbol ?? ""} close` : String(result.title ?? result.series ?? "")));
    seen.add("dates"); seen.add("close"); seen.add("values");
  }
  // The last guidance against what the quarter delivered.
  const prior = result.previous_guidance_vs_results;
  if (prior?.columns && prior?.rows) out.push(ranges(prior, "Guided and actual"));
  // Every table in the result, at the top level or one level down.
  const tables = [];
  if (Array.isArray(result.columns) && Array.isArray(result.rows) && !seen.has("rows")) tables.push([null, result]);
  for (const [k, v] of Object.entries(result)) {
    if (seen.has(k) || !isObj(v)) continue;
    if (Array.isArray(v.columns) && (Array.isArray(v.rows) || Array.isArray(v.values))) { tables.push([k.replace(/_/g, " "), v]); seen.add(k); }
  }
  for (const [title, t] of tables) {
    const note = typeof t.note === "string" ? t.note : null;
    if (t === result && note) seen.add("note");
    if (!Array.isArray(t.rows)) { out.push(...tablesOf(t, title)); continue; }
    if (t.columns.includes("claim") && t.columns.includes("verdict")) {
      out.push(claims(t, title ?? "Claims"));
      if (note) out.push(`<p class="note">${esc(note)}</p>`);
      continue;
    }
    if (releaseKind(t.columns)) {
      out.push(releaseTable(t, title));
      if (note) out.push(`<p class="note">${esc(note)}</p>`);
      continue;
    }
    const series = seriesFromTable(t);
    // A rate that holds until it changes is drawn to the last day asked for.
    const last = series ? series.dates.reduce((b, d, i) => (d > series.dates[b] ? i : b), 0) : -1;
    if (series?.step && typeof result.end === "string" && ISO.test(result.end) && result.end > series.dates[last]) {
      series.dates.push(result.end);
      for (const l of series.lines) l.values.push(l.values[last]);
    }
    if (series) out.push(chart(series, title));
    out.push(table({ columns: t.columns, rows: t.rows, title, note }));
  }
  // Lists of records (a market's events with their rules) as tables.
  for (const [k, v] of Object.entries(result)) {
    if (!seen.has(k) && Array.isArray(v) && v.length && v.every(isObj)) { out.push(records(v, k.replace(/_/g, " "))); seen.add(k); }
  }
  // Plain fields and short lists; notes as notes.
  const notes = Object.entries(result).filter(([k, v]) => !seen.has(k) && /(^|_)note$/.test(k) && typeof v === "string");
  for (const [k] of notes) seen.add(k);
  const plain = Object.entries(result).filter(([k, v]) => !seen.has(k) && !["columns", "rows"].includes(k) && (isPlain(v) || (Array.isArray(v) && v.length && v.length <= 12 && v.every(isPlain)))).slice(0, 14);
  out.push(grid(plain, "Details"));
  for (const [, v] of notes) out.push(`<p class="note">${esc(v)}</p>`);
  if (typeof result.preview_only?.note === "string") out.push(`<p class="note">${esc(result.preview_only.note)}</p>`);
  if (Array.isArray(result.limits)) out.push(`<p class="note">${result.limits.map(esc).join(" ")}</p>`);
  return out.join("") || `<pre>${esc(JSON.stringify(result, null, 1).slice(0, 4000))}</pre>`;
}

// Records (objects with the same fields) as a table: the fields of the first ones as columns.
function records(list, title) {
  const columns = [...new Set(list.slice(0, 20).flatMap((r) => Object.keys(r)))].slice(0, 10);
  return table({ columns, rows: list.slice(0, 50).map((r) => columns.map((c) => r[c] ?? null)), title, maxRows: 50 });
}

// A run_tool result: one tool's result, or a batch of them, each under its tool's name.
export function renderRunResult(structured, input = {}) {
  if (!structured || typeof structured !== "object") return renderResult(structured);
  if (Array.isArray(structured.results)) {
    const last = Array.isArray(input?.calls) && input.return === "last";
    // Several price series are compared in one view above them, and each is not drawn again.
    const compare = compareFor(structured.results);
    studioCompact(Boolean(compare));
    const items = structured.results.map((r, i) => (studioCall(r.name, last ? input.calls.length - 1 : i), `<article><h2>${esc(r.name ?? "result")}${r.ref ? ` <small>${esc(r.ref)}</small>` : ""}</h2>${r.error ? `<p class="error">${esc(r.error)}</p>` : renderResult(r.result)}</article>`)).join("");
    studioCompact(false);
    return (compare ? `<article><h2>Compared</h2>${compare}</article>` : "") + items;
  }
  const name = input?.name ?? "";
  studioCall(name, null);
  return `<article>${name ? `<h2>${esc(name)}${structured.ref ? ` <small>${esc(structured.ref)}</small>` : ""}</h2>` : ""}${renderResult(structured)}</article>`;
}
