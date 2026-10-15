// The result viewer's rendering: a tool result (JSON) to HTML, with no dependencies, so the same
// functions run in the host's sandboxed frame and in the tests. Tables stay tables; a table whose
// first column is dates, or a series of dates and values, also gets a line chart; statements keep
// their lines and units; checked claims sit under their sentence with verdict badges; earlier
// guidance is drawn as its range with the actual result marked.
// Every string from a result is escaped: results carry text from filings and press releases.

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

const ISO = /^\d{4}-\d{2}-\d{2}/;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isUrl = (v) => /^https?:\/\//.test(String(v ?? ""));
// A link out of the frame; `html` is already escaped.
const link = (url, html) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
const words = (v) => esc(String(v ?? "").replace(/_/g, " "));
const unitAfter = (u) => (u === "%" ? "%" : u ? ` <span class="sub">${esc(u)}</span>` : "");

// A number as people read it: thousands grouped, up to four decimals (at least `min`), never in
// exponent form.
export function fmt(v, min = 0) {
  if (!isNum(v)) return esc(v ?? "");
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.max(digits, min), minimumFractionDigits: min });
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
  const badgeCol = new Set(cols.map((c, i) => (/^(verdict|position)$/.test(String(c)) ? i : -1)).filter((i) => i >= 0));
  const cell = (v, i, min, tip) => {
    if (Array.isArray(v) || (v && typeof v === "object")) return `<td class="obj">${esc(JSON.stringify(v).slice(0, 160))}</td>`;
    if (badgeCol.has(i)) return `<td>${badge(v)}</td>`;
    if (isNum(v)) return `<td class="num">${fmt(v, min)}</td>`;
    const s = String(v ?? "");
    if (isUrl(s)) return `<td>${link(s, "source")}</td>`;
    if (s.length > 48) return `<td class="text" title="${esc(tip ?? s)}"><div class="clamp">${esc(s.length > 600 ? `${s.slice(0, 597)}…` : s)}</div></td>`;
    return `<td${tip ? ` title="${esc(tip)}"` : ""}>${esc(s)}</td>`;
  };
  const head = cols.length ? `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>` : "";
  // A heading row has a label and no values.
  const lines = body.map((row, n) => {
    const heading = row.length > 1 && row.slice(1).every((v) => v === null || v === "");
    const min = concepts && row.some((v) => isNum(v) && !Number.isInteger(v)) ? 2 : 0;
    return `<tr${heading ? " class=\"heading\"" : ""}>${row.map((v, i) => cell(v, i, min, i === 0 && concepts?.[n] ? String(concepts[n]) : undefined)).join("")}</tr>`;
  }).join("");
  const more = Array.isArray(rows) && rows.length > maxRows ? `<p class="note">${rows.length - maxRows} more rows not shown.</p>` : "";
  return `<section>${title ? `<h3>${esc(title)}</h3>` : ""}<div class="scroll"><table>${head}<tbody>${lines}</tbody></table></div>${note ? `<p class="note">${esc(note)}</p>` : ""}${more}</section>`;
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

// Series for a chart from a table: the first column as dates, each numeric column a line.
export function seriesFromTable({ columns, rows }) {
  if (!Array.isArray(rows) || rows.length < 3 || !Array.isArray(columns)) return null;
  const dates = rows.map((r) => (Array.isArray(r) ? r[0] : null));
  if (!dates.every((d) => typeof d === "string" && ISO.test(d))) return null;
  const lines = [];
  for (let i = 1; i < columns.length && lines.length < 4; i++) {
    const values = rows.map((r) => r[i]);
    if (values.filter(isNum).length >= Math.max(3, rows.length * 0.6)) lines.push({ name: String(columns[i]), values: values.map((v) => (isNum(v) ? v : null)) });
  }
  return lines.length ? { dates, lines } : null;
}

// A line chart in SVG: oldest on the left, the value range with four gridlines, a legend.
export function chart({ dates, lines }, title) {
  const order = dates.map((d, i) => [d, i]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, i]) => i);
  const xs = order.map((i) => dates[i]);
  const all = lines.flatMap((l) => l.values.filter(isNum));
  if (all.length < 2) return "";
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const W = 640, H = 220, L = 56, R = 12, T = 12, B = 28;
  const x = (k) => L + (xs.length === 1 ? 0 : (k / (xs.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const grid = [0, 1, 2, 3].map((g) => { const v = lo + ((hi - lo) * g) / 3; return `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="axis" text-anchor="end">${fmt(v)}</text>`; }).join("");
  const paths = lines.map((l, n) => {
    let d = "", pen = false;
    order.forEach((i, k) => { const v = l.values[i]; if (!isNum(v)) { pen = false; return; } d += `${pen ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
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

// The blocks of one result: special forms first (statements, series, guided against actual), then
// any table found in its fields, then its plain fields.
export function renderResult(result) {
  if (result == null || typeof result !== "object") return `<pre>${esc(JSON.stringify(result, null, 1))}</pre>`;
  const out = [];
  // The ref is in the heading; a preview's note is drawn at the end.
  const seen = new Set(["ref", "preview_only"]);
  const head = [result.company?.name ?? result.company?.ticker, result.release?.headline, result.symbol, result.series, result.title].filter((x) => typeof x === "string").slice(0, 2);
  if (head.length) out.push(`<p class="lead">${esc(head.join(" · "))}</p>`);
  // A tally of verdicts reads at a glance; any other summary is a list of its fields.
  const sum = result.summary;
  if (sum && typeof sum === "object" && !Array.isArray(sum)) {
    if (Object.keys(sum).every((k) => k === "claims" || TALLY.some(([t]) => t === k))) {
      out.push(`<p class="tally">${isNum(sum.claims) ? `${fmt(sum.claims)} ${sum.claims === 1 ? "claim" : "claims"} checked: ` : ""}${TALLY.filter(([k]) => sum[k] > 0).map(([k, kind]) => `<span class="badge ${kind}">${fmt(sum[k])} ${words(k)}</span>`).join(" ")}</p>`);
    } else out.push(kv(sum, "Summary"));
    seen.add("summary");
  }
  // Statements as filed, under the company's own title and scale.
  for (const k of STATEMENTS) if (result[k]?.columns && result[k]?.rows) {
    const s = result[k];
    out.push(table({ columns: s.columns, rows: s.rows, title: `${s.title || NAMES[k]}${s.units ? ` (${s.units})` : ""}` }));
    seen.add(k);
  }
  // A price or economic series: dates beside values.
  if (Array.isArray(result.dates) && (Array.isArray(result.close) || Array.isArray(result.values))) {
    const values = result.close ?? result.values;
    out.push(chart({ dates: result.dates, lines: [{ name: result.close ? "close" : String(result.series ?? "value"), values }] }, result.close ? `${result.symbol ?? ""} close` : String(result.title ?? result.series ?? "")));
    seen.add("dates"); seen.add("close"); seen.add("values");
  }
  // The last guidance against what the quarter delivered.
  const prior = result.previous_guidance_vs_results;
  if (prior?.columns && prior?.rows) out.push(ranges(prior, "Guided and actual"));
  // Every table in the result, at the top level or one level down.
  const tables = [];
  if (Array.isArray(result.columns) && Array.isArray(result.rows)) tables.push([null, result]);
  for (const [k, v] of Object.entries(result)) {
    if (seen.has(k) || !v || typeof v !== "object" || Array.isArray(v)) continue;
    if (Array.isArray(v.columns) && Array.isArray(v.rows)) tables.push([k.replace(/_/g, " "), v]);
  }
  for (const [title, t] of tables) {
    const note = typeof t.note === "string" ? t.note : null;
    if (t === result && note) seen.add("note");
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
    const s = seriesFromTable(t);
    if (s) out.push(chart(s, title));
    out.push(table({ columns: t.columns, rows: t.rows, title, note }));
  }
  const plain = Object.fromEntries(Object.entries(result).filter(([k, v]) => !seen.has(k) && (v === null || typeof v !== "object") && !["columns", "rows"].includes(k)).slice(0, 14));
  if (Object.keys(plain).length) out.push(kv(plain, "Details"));
  if (typeof result.preview_only?.note === "string") out.push(`<p class="note">${esc(result.preview_only.note)}</p>`);
  if (Array.isArray(result.limits)) out.push(`<p class="note">${result.limits.map(esc).join(" ")}</p>`);
  return out.join("") || `<pre>${esc(JSON.stringify(result, null, 1).slice(0, 4000))}</pre>`;
}

function kv(obj, title) {
  return `<section><h3>${esc(title)}</h3><dl>${Object.entries(obj).map(([k, v]) => `<dt>${words(k)}</dt><dd>${isNum(v) ? fmt(v) : esc(typeof v === "object" ? JSON.stringify(v) : v)}</dd>`).join("")}</dl></section>`;
}

// A run_tool result: one tool's result, or a batch of them, each under its tool's name.
export function renderRunResult(structured, input = {}) {
  if (!structured || typeof structured !== "object") return renderResult(structured);
  if (Array.isArray(structured.results)) {
    return structured.results.map((r) => `<article><h2>${esc(r.name ?? "result")}${r.ref ? ` <small>${esc(r.ref)}</small>` : ""}</h2>${r.error ? `<p class="error">${esc(r.error)}</p>` : renderResult(r.result)}</article>`).join("");
  }
  const name = input?.name ?? "";
  return `<article>${name ? `<h2>${esc(name)}${structured.ref ? ` <small>${esc(structured.ref)}</small>` : ""}</h2>` : ""}${renderResult(structured)}</article>`;
}
