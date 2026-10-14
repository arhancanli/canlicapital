// The analyst tools with hostile arguments: built-in property names ("constructor"), empty, very
// long and unusual strings, edge numbers, impossible dates and accessions. Every call must give an
// answer or a clean error that says what to do; no TypeError, no "undefined" or "[object Object]"
// in a message, no NaN or Infinity in an answer. Requests the fixtures do not hold get a 404.
import assert from "node:assert/strict";
import test from "node:test";

import { filingTables, tablesInput } from "../src/filing-tables.mjs";
import { earningsRelease, releaseInput } from "../src/releases.mjs";
import { createSession } from "../src/sources.mjs";
import { financialStatements, statementsInput } from "../src/statements.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
const STRINGS = ["constructor", "__proto__", "toString", "", " ", "x".repeat(5000), "Ünïcödé 😀 漢字", "' OR 1=1 --", "(.*)+$", "-1", "NaN", "\u0000", "a/b\\c", "\"paid\" \"members\"", "0000000000-00-000000", "9999-99-99"];
const NUMBERS = [-1, 0, 0.5, 1e308, 2 ** 53, Number.NaN];
const LEAK = /\bundefined\b|\[object Object\]|function [A-Za-z]*\(\) \{ \[native code\] \}/;

const TOOLS = [
  ["financial_statements", financialStatements, { company: "MSFT" }, ["company", "statement", "period", "accession", "filed_before"], ["filings", "fiscal_year"]],
  ["filing_tables", filingTables, { company: "MSFT", find: "geographic revenue" }, ["company", "find", "form", "accession", "filed_before", "document"], ["filings", "max_tables"]],
  ["earnings_release", earningsRelease, { company: "NVDA", accession: "0001045810-26-000073" }, ["company", "accession", "filed_before"], ["max_lines"]],
];

const badValue = (x) => typeof x === "number" && !Number.isFinite(x);
function scan(value, path = "") {
  if (badValue(value)) return path;
  if (typeof value === "string") return value.includes("[object Object]") ? path : null;
  if (Array.isArray(value)) { for (const [i, v] of value.entries()) { const p = scan(v, `${path}[${i}]`); if (p) return p; } return null; }
  if (value && typeof value === "object") { for (const [k, v] of Object.entries(value)) { const p = scan(v, `${path}.${k}`); if (p) return p; } }
  return null;
}

for (const [name, run, base, strings, numbers] of TOOLS) {
  test(`${name}: hostile arguments give answers or clean errors`, async () => {
    const calls = [["no arguments", {}], ["base", base], ["an unknown argument", { ...base, nope: 1 }]];
    for (const k of strings) for (const s of STRINGS) calls.push([`${k}=${JSON.stringify(s.slice(0, 20))}`, { ...base, [k]: s }]);
    for (const k of numbers) for (const n of NUMBERS) calls.push([`${k}=${n}`, { ...base, [k]: n }]);
    let answers = 0, refusals = 0;
    for (const [label, args] of calls) {
      try {
        const out = await run(session(), args);
        const at = scan(out);
        assert.equal(at, null, `${label}: a non-finite or [object Object] value at ${at}`);
        answers++;
      } catch (err) {
        assert.ok(!(err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError), `${label}: crashed with ${err?.constructor?.name}: ${err?.message}`);
        const msg = err?.issues ? err.issues.map((i) => i.message).join("; ") : String(err?.message ?? err);
        assert.ok(msg.length > 0, `${label}: an empty error`);
        assert.ok(!LEAK.test(msg.replace(/received undefined/g, "")), `${label}: the message leaks internals: ${msg}`);
        refusals++;
      }
    }
    assert.ok(answers >= 1 && refusals >= 10, `${name}: ${answers} answers, ${refusals} refusals`);
  });
}

test("the input schemas reject what the tools cannot use", () => {
  assert.equal(statementsInput.safeParse({ company: "MSFT", filings: 0 }).success, false);
  assert.equal(statementsInput.safeParse({ company: "MSFT", fiscal_year: 1990 }).success, false);
  assert.equal(tablesInput.safeParse({ company: "MSFT", filings: 9 }).success, false);
  assert.equal(tablesInput.safeParse({ company: "MSFT", find: "x" }).success, false);
  assert.equal(releaseInput.safeParse({ company: "NVDA", accession: "123" }).success, false);
  assert.equal(releaseInput.safeParse({ company: "NVDA", max_lines: 41 }).success, false);
});
