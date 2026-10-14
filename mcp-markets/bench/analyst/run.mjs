// Runs every analyst question through its tool, live against SEC EDGAR, and checks the answer
// against bench/analyst/truth.json (built by truth.py, independently of the tools). Tool level: a
// question passes when the tool's answer holds the expected figures; no model reads it.
//
//   node bench/analyst/run.mjs [--only id] [--set fresh]       writes results-YYYY-MM-DD.json
import { readFileSync, writeFileSync } from "node:fs";

import { earningsRelease } from "../../src/releases.mjs";
import { filingTables } from "../../src/filing-tables.mjs";
import { createSession } from "../../src/sources.mjs";
import { financialStatements } from "../../src/statements.mjs";
import { verifyClaims } from "../../src/verify.mjs";

const HERE = new URL("./", import.meta.url);
const TOOLS = { financial_statements: financialStatements, filing_tables: filingTables, earnings_release: earningsRelease, verify_claims: verifyClaims };
const questions = JSON.parse(readFileSync(new URL("questions.json", HERE), "utf8")).questions;
const truths = JSON.parse(readFileSync(new URL("truth.json", HERE), "utf8")).truths;
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

// Every number in an answer, from numbers and from text ("$9.7B - $10.5B", "84,100").
function numbersIn(value, out = []) {
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (typeof value === "string") for (const m of value.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) out.push(Number(m[0].replace(/,/g, "")));
  else if (Array.isArray(value)) for (const v of value) numbersIn(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) numbersIn(v, out);
  return out;
}
// The same figure in another scale (a page in thousands or millions, a guide in billions).
const SCALES = [1, 1e3, 1e6, 1e9, 1e-3, 1e-6];
const same = (a, b) => SCALES.some((k) => Math.abs(a * k - b) <= Math.max(1e-9, Math.abs(b) * 5e-4));
const holds = (nums, x) => nums.some((n) => same(n, x));
// Every row-like array of an answer (a table row, a guidance row).
function rowsIn(value, out = []) {
  if (Array.isArray(value)) { if (value.some((v) => typeof v !== "object" || v === null)) out.push(value); for (const v of value) rowsIn(v, out); }
  else if (value && typeof value === "object") for (const v of Object.values(value)) rowsIn(v, out);
  return out;
}
const rowHolds = (answer, [lo, hi]) => rowsIn(answer).some((r) => { const n = numbersIn(r); return holds(n, lo) && holds(n, hi); });

function score(q, truth, answer) {
  if (truth?.error) return { pass: false, why: `no truth: ${truth.error}` };
  const want = truth?.given ?? truth;
  if (q.type === "verify") {
    const v = answer.rows[0][answer.columns.indexOf("verdict")], note = String(answer.rows[0][answer.columns.indexOf("note")] ?? "");
    const ok = v === want.verdict && (!want.note || note.includes(want.note));
    return ok ? { pass: true } : { pass: false, why: `verdict ${v}${note ? ` (${note.slice(0, 80)})` : ""}, expected ${want.verdict}${want.note ? ` (${want.note})` : ""}` };
  }
  if (q.type === "beat_or_miss") {
    const rows = answer?.previous_guidance_vs_results?.rows ?? [];
    const cols = answer?.previous_guidance_vs_results?.columns ?? [];
    const pos = cols.indexOf("position"), act = cols.indexOf("actual");
    const hit = rows.find((r) => String(r[pos]).startsWith(want.position) && same(r[act], want.actual));
    return hit ? { pass: true, row: hit.slice(0, 12) } : { pass: false, why: `no comparison row "${want.position}" with actual ${want.actual}`, rows: rows.map((r) => r.slice(0, 12)) };
  }
  if (want.range) {
    const missing = [want.range, want.also_range].filter(Boolean).filter((r) => !rowHolds(answer, r));
    return missing.length ? { pass: false, why: `no row holds ${missing.map((r) => r.join("-")).join(" and ")}` } : { pass: true };
  }
  const nums = numbersIn(answer);
  const values = want.values ?? [];
  const missing = values.filter((v) => !holds(nums, v));
  return missing.length ? { pass: false, why: `missing ${missing.join(", ")}` } : { pass: true };
}

const only = arg("--only"), set = arg("--set");
const results = [];
for (const q of questions) {
  if ((only && q.id !== only) || (set && q.set !== set)) continue;
  const session = createSession();
  const t0 = Date.now();
  let answer = null, error = null;
  try { answer = await TOOLS[q.tool](session, q.args); } catch (err) { error = String(err?.message ?? err); }
  const ms = Date.now() - t0;
  // A trap passes on a refusal that says why, or an answer with nothing in it; never on a figure.
  const s = q.type === "trap"
    ? (q.expect.error ? (error && error.includes(q.expect.error) ? { pass: true } : { pass: false, why: error ? `refused, but: ${error}` : "answered instead of refusing" })
      : q.expect.no_tables ? (!error && (answer?.results ?? []).every((r) => !r.tables?.length) ? { pass: true } : { pass: false, why: error ? `error: ${error}` : "returned a table" })
      : (!error && answer?.rows?.[0]?.[answer.columns.indexOf("verdict")] === q.expect.verdict ? { pass: true } : { pass: false, why: error ? `error: ${error}` : `verdict ${answer?.rows?.[0]?.[5]}` }))
    : error ? { pass: false, why: `tool error: ${error}` } : score(q, truths[q.id], answer);
  results.push({ id: q.id, set: q.set, type: q.type, tool: q.tool, pass: s.pass, ...(s.pass ? {} : { why: s.why }), ...(s.row ? { row: s.row } : {}), ...(s.rows ? { rows: s.rows } : {}), ms, chars: answer ? JSON.stringify(answer).length : 0 });
  console.log(`${s.pass ? "PASS" : "FAIL"} ${q.set.padEnd(5)} ${q.id.padEnd(30)} ${String(ms).padStart(6)} ms${s.pass ? "" : `  ${s.why}`}`);
}
const group = (key) => Object.entries(results.reduce((acc, r) => { const k = key(r); acc[k] ??= [0, 0]; acc[k][0] += r.pass ? 1 : 0; acc[k][1]++; return acc; }, {})).map(([k, [p, n]]) => ({ group: k, passed: p, of: n }));
const summary = { passed: results.filter((r) => r.pass).length, of: results.length, by_set: group((r) => r.set), by_type: group((r) => `${r.set} ${r.type}`), median_ms: results.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(results.length / 2)], median_chars: results.map((r) => r.chars).sort((a, b) => a - b)[Math.floor(results.length / 2)] };
console.log(JSON.stringify(summary, null, 1));
if (!only && !set) writeFileSync(new URL(`results-${new Date().toISOString().slice(0, 10)}.json`, HERE), JSON.stringify({ ran: new Date().toISOString(), node: process.version, summary, results }, null, 1) + "\n");
