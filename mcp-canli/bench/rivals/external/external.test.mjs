// The proof runner without keys or network: datasets parsed from hand-made text, the judge's reply
// read, and whole runs on the synthetic dev set with the mock model and judge (resume, budget stop).
//   cd mcp-canli/bench/rivals && node --test external/*.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { financebenchItems, parseCsv, valsItems } from "./datasets.mjs";
import { parseJson } from "./judge.mjs";
import { costOf } from "./prices.mjs";
import { report, wilson } from "./report.mjs";
import { main, parseArgs } from "./run.mjs";

test("CSV as Vals writes it: quoted commas, line breaks, doubled quotes, a byte-order mark, CRLF", () => {
  const text = "﻿Question,Answer,Rubric\r\n\"What, exactly?\",\"Line one\nline two\",\"[{\"\"operator\"\": \"\"correctness\"\"}]\"\r\nplain,two,[]\r\n";
  assert.deepEqual(parseCsv(text), [{ Question: "What, exactly?", Answer: "Line one\nline two", Rubric: "[{\"operator\": \"correctness\"}]" }, { Question: "plain", Answer: "two", Rubric: "[]" }]);
});

test("the sets' items: an id from the question, the rubric, the reference and the as-of date", () => {
  const rubric = JSON.stringify([{ operator: "correctness", criteria: "A" }, { operator: "contradiction", criteria: "B" }]).replace(/"/g, "\"\"");
  const [v] = valsItems(`Question,Answer,Question Type,Expert time (mins),Rubric\nQ one,A one,Trends,5,"${rubric}"\n`);
  assert.equal(v.id.length, "vals-".length + 12);
  assert.deepEqual([v.set, v.type, v.reference, v.asOf, v.rubric.length], ["vals", "Trends", "A one", "2025-04-07", 2]);
  const [f] = financebenchItems(JSON.stringify({ financebench_id: "financebench_id_1", company: "X", doc_name: "X_2022_10K", question_type: "metrics-generated", question: "Q?", answer: "$1" }) + "\n");
  assert.deepEqual([f.id, f.set, f.type, f.reference, f.rubric], ["financebench_id_1", "financebench", "metrics-generated", "$1", null]);
});

test("dollars from tokens, with cache reads at a tenth and writes at 1.25 times", () => {
  assert.equal(costOf("claude-sonnet-5-5", { input: 1e6, output: 1e5 }), 3);
  assert.equal(costOf("claude-sonnet-5-5", { cache_read: 1e6, cache_write: 1e6 }), 0.2 + 2.5);
  assert.throws(() => costOf("some-new-model", { input: 1 }, {}), /No price/);
  assert.equal(costOf("some-new-model", { input: 1e6 }, { PRICE_IN: "1", PRICE_OUT: "2" }), 1);
});

test("the judge's JSON, fenced or not; anything else is no verdict", () => {
  assert.deepEqual(parseJson("```json\n{\"correct\": true, \"why\": \"same\"}\n```"), { correct: true, why: "same" });
  assert.deepEqual(parseJson("Here: {\"items\":[{\"n\":1,\"met\":false}]}"), { items: [{ n: 1, met: false }] });
  assert.equal(parseJson("I think it is correct."), null);
});

test("a whole run on the dev set with the mock model: graded, resumable, never printing a question", async () => {
  const out = mkdtempSync(`${tmpdir()}/external-`), logs = [];
  const opts = { ...parseArgs(["--set", "dev", "--arms", "none"]), out };
  const r = await main(opts, { log: (l) => logs.push(l), env: {} });
  assert.deepEqual([r.exit, r.answered, r.passed], [0, 3, 2]);
  const lines = readFileSync(`${out}/dev.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => [l.id, l.pass, l.met, l.of]), [["dev-apple-fy25", true, 4, 4], ["dev-novo-2025", false, 3, 4], ["dev-shell-q2-2025", true, null, null]]);
  assert.ok(lines.every((l) => l.dataset.file === "dev.json" && l.code === null));
  const questions = JSON.parse(readFileSync(new URL("./dev.json", import.meta.url), "utf8")).map((x) => x.question);
  assert.ok(logs.every((l) => questions.every((q) => !l.includes(q))), "logs carry ids, never questions");
  const again = await main(opts, { log: () => {}, env: {} });
  assert.equal(again.answered, 0, "a rerun skips what is done");
  assert.match(report(lines, "dev"), /\| mock \| none \| 2 of 3 \| 66\.7% \(/);
});

test("the budget guard stops before the next answer once the spend reaches the budget", async () => {
  const out = mkdtempSync(`${tmpdir()}/external-`), logs = [];
  const r = await main({ ...parseArgs(["--set", "dev", "--arms", "none", "--budget-usd", "1.5"]), out }, { log: (l) => logs.push(l), env: { MOCK_COST_USD: "1" } });
  assert.deepEqual([r.exit, r.answered], [4, 2]);
  assert.ok(logs.some((l) => /^BUDGET_REACHED: \$2\.00 of \$1\.5/.test(l)));
  await assert.rejects(main({ ...parseArgs(["--set", "dev", "--model", "claude-sonnet-5-5"]), out }, { log: () => {} }), /needs --budget-usd/);
});

test("a 95% Wilson interval stays inside 0 to 1", () => {
  const [lo, hi] = wilson(0, 10);
  assert.equal(lo, 0);
  assert.ok(hi > 0.25 && hi < 0.35);
  const [a, b] = wilson(50, 50);
  assert.ok(a > 0.9 && b === 1);
});
