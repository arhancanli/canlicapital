// The question pages under /mcp-servers/answers: each one a finance question, the canli-mcp call that
// answers it and what that call returned when it was recorded (config/mcp-answers.json;
// mcp-canli/bench/record-site-answers.mjs writes public/demos/canli-mcp/answers/<slug>.json).
// Everything shown is the recorded result itself, cut to its first rows: no figure is typed here.

const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const ROWS = 8, COLUMNS = 8, ARRAY = 6, TEXT = 140;
// Never part of the answer a reader asked for: what the tool read, and its other filings.
const SKIP = new Set(["evidence", "filings", "expirations", "sources", "corrected", "changes_since"]);

export const ANSWERS_ROUTE = "/mcp-servers/answers";
export const answerRoute = (a) => `${ANSWERS_ROUTE}/${a.slug}`;
export const answerFile = (a) => `demos/canli-mcp/answers/${a.slug}.json`;

// The calls a page makes, in order, and the tools they name.
export const callsOf = (call) => (Array.isArray(call.calls) ? call.calls : [call]);
export const toolsOf = (call) => [...new Set(callsOf(call).map((c) => c.name))];

// A batch answers {results: [{name, result}]}; each result is shown on its own.
export function resultsOf(recorded) {
  const r = recorded.result;
  return Array.isArray(r?.results) ? r.results.map((x) => ({ name: x.name, result: x.result })) : [{ name: callsOf(recorded.call).at(-1).name, result: r }];
}

const cell = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && /^https?:\/\//.test(v)) return `<a href="${esc(v)}" rel="noreferrer nofollow">source</a>`;
  if (typeof v === "object") return esc(JSON.stringify(v).slice(0, TEXT));
  const s = String(v);
  return esc(s.length > TEXT ? `${s.slice(0, TEXT)}…` : s);
};

// The first table in a result: its own {columns, rows}, one nested under a key, rows grouped under
// several keys beside one set of columns (a market overview), or a dated series.
export function firstTable(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const width = (rows) => Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r));
  if (Array.isArray(result.columns) && width(result.rows)) return { columns: result.columns, rows: result.rows, total: result.rows.length };
  if (Array.isArray(result.columns)) {
    const group = Object.entries(result).find(([k, v]) => !SKIP.has(k) && width(v) && v[0].length === result.columns.length);
    if (group) return { title: group[0], columns: result.columns, rows: group[1], total: group[1].length };
  }
  if (Array.isArray(result.dates)) {
    const series = ["close", "values", "value"].find((k) => Array.isArray(result[k]) && result[k].length === result.dates.length);
    if (series) {
      const from = Math.max(0, result.dates.length - ROWS);
      return { columns: ["date", series], rows: result.dates.slice(from).map((d, i) => [d, result[series][from + i]]), total: result.dates.length, last: true };
    }
  }
  for (const [k, v] of Object.entries(result)) {
    if (SKIP.has(k) || !v || typeof v !== "object" || Array.isArray(v)) continue;
    if (Array.isArray(v.columns) && width(v.rows)) return { title: k, columns: v.columns, rows: v.rows, total: v.rows.length };
  }
  return null;
}

export function tableHtml(t, caption) {
  const cols = t.columns.slice(0, COLUMNS), rows = t.last ? t.rows : t.rows.slice(0, ROWS);
  const cut = t.columns.length > COLUMNS ? "; the first columns" : "";
  const which = t.last ? "the latest rows" : t.total > rows.length ? "the first rows" : "every row";
  return `<div class="mcp-table" role="region" tabindex="0" aria-label="${esc(caption)}"><table class="dev-table"><caption>${esc(caption)}${t.title ? `: ${esc(t.title.replaceAll("_", " "))}` : ""}, ${which}${cut}</caption><thead><tr>${cols.map((c) => `<th scope="col">${esc(String(c).replaceAll("_", " "))}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.slice(0, COLUMNS).map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

// The result as the model read it, with long arrays and strings cut so it fits a page.
export function compactJson(value) {
  const cut = (v) => {
    if (Array.isArray(v)) return v.length > ARRAY ? [...v.slice(0, ARRAY).map(cut), "…"] : v.map(cut);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "evidence").map(([k, x]) => [k, cut(x)]));
    if (typeof v === "string" && v.length > TEXT) return `${v.slice(0, TEXT)}…`;
    return v;
  };
  return JSON.stringify(cut(value), null, 2);
}

// Tool names in an answer, set as code: only names the server really has.
export function withTools(text, names) {
  const known = new Set(names);
  return esc(text).replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (w) => (known.has(w) ? `<code>${w}</code>` : w));
}
export const toolsNamed = (text, names) => {
  const known = new Set(names);
  return [...new Set(text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [])].filter((w) => known.has(w));
};

export function checkAnswers(config, recorded, toolNames) {
  const slugs = new Set();
  for (const a of config.answers) {
    if (!/^[a-z0-9-]+$/.test(a.slug) || slugs.has(a.slug)) throw new Error(`answer slug must be unique kebab-case: ${a.slug}`);
    slugs.add(a.slug);
    if (!a.question.endsWith("?")) throw new Error(`${a.slug}: a question ends with a question mark`);
    for (const t of toolsOf(a.call)) if (!toolNames.includes(t)) throw new Error(`${a.slug}: no tool ${t}`);
    const r = recorded.get(a.slug);
    if (!r) throw new Error(`${a.slug}: not recorded; run mcp-canli/bench/record-site-answers.mjs`);
    if (JSON.stringify(r.call) !== JSON.stringify(a.call)) throw new Error(`${a.slug}: the recording is of a different call; record it again`);
  }
  for (const a of config.answers) for (const s of a.related ?? []) if (!slugs.has(s)) throw new Error(`${a.slug}: related ${s} is not a page`);
}
