import assert from "node:assert/strict";
import test from "node:test";

import { behaviour, runItem, scoreAnswer, stratifiedSample } from "./eval.mjs";

const item = (kind, value) => ({ answer: { kind, value, unit: kind === "number" ? "USD" : kind } });

test("answers are read from the last ANSWER line and scored within each kind's tolerance", () => {
  assert.equal(scoreAnswer(item("number", 677375000), "work...\nANSWER: 677,375,000").correct, true);
  assert.equal(scoreAnswer(item("number", 677375000), "ANSWER: 677000000").correct, true, "within 0.1%");
  assert.equal(scoreAnswer(item("number", 677375000), "ANSWER: 576370000").correct, false);
  assert.equal(scoreAnswer(item("percent", 4.49), "ANSWER: 4.49%").correct, true);
  assert.equal(scoreAnswer(item("percent", 4.49), "ANSWER: 4.6").correct, false);
  assert.equal(scoreAnswer(item("ratio", -0.3216), "ANSWER: -0.3211").correct, false, "a ratio must be right to four places");
  assert.equal(scoreAnswer(item("not_reported", null), "ANSWER: not reported").correct, true);
  assert.equal(scoreAnswer(item("not_reported", null), "ANSWER: 12345").correct, false);
  assert.deepEqual(scoreAnswer(item("number", 1), "no final line"), { answered: false, correct: false, parsed: null });
});

test("behaviour separates abstaining from answering: a model that abstains on everything is not rewarded", () => {
  const always = [
    ...Array.from({ length: 4 }, () => ({ template: "lookup", parsed: "not reported", correct: false })),
    ...Array.from({ length: 2 }, () => ({ template: "unanswerable", parsed: "not reported", correct: true })),
  ];
  const b = behaviour(always);
  assert.equal(b.answerable_accuracy, 0);
  assert.equal(b.answerable_abstention, 1);
  assert.equal(b.unanswerable_abstention, 1);
  assert.equal(b.numbers_given, 0);
  const guesser = behaviour([{ template: "lookup", parsed: 5, correct: false }, { template: "ratio", parsed: 0.1, correct: true }, { template: "unanswerable", parsed: 7, correct: false }]);
  assert.equal(guesser.numbers_wrong, 0.5);
  assert.equal(guesser.unanswerable_invented_number, 1);
});

test("blank, malformed and mixed answers cannot become correct numerical or absence answers", () => {
  for (const text of ["ANSWER:", "ANSWER: $", "ANSWER: USD", "ANSWER: 1 2", "ANSWER: 1,2", "ANSWER: 0x0c"]) {
    assert.equal(scoreAnswer(item("number", 0), text).correct, false, text);
    assert.equal(scoreAnswer(item("number", 12), text).correct, false, text);
  }
  for (const text of ["ANSWER: 123 (not available in earlier filings)", "ANSWER: not reported, but probably 123", "The question asks for ANSWER: not reported"]) {
    assert.equal(scoreAnswer(item("not_reported", null), text).correct, false, text);
  }
  assert.equal(scoreAnswer(item("number", 0), "ANSWER: 0").correct, true);
  assert.equal(scoreAnswer(item("number", -12), "ANSWER: -1.2e1").correct, true);
});

test("strict answers keep units, abstentions and invented numbers distinct", () => {
  assert.equal(scoreAnswer(item("number", 1200), "ANSWER: $1,200 USD").correct, true);
  assert.equal(scoreAnswer(item("number", 12), "ANSWER: 12%").correct, false);
  assert.equal(scoreAnswer(item("ratio", 1), "ANSWER: 1 USD").correct, false);
  for (const text of ["ANSWER: Infinity", "ANSWER: NaN", "ANSWER: 1e999", "ANSWER: +", "ANSWER: 1,00,000"]) {
    assert.equal(scoreAnswer(item("number", 0), text).correct, false, text);
  }
  const runs = [
    { template: "lookup", ...scoreAnswer(item("number", 0), "ANSWER: not reported") },
    { template: "lookup", ...scoreAnswer(item("number", 0), "ANSWER: 123 (not reported earlier)") },
    { template: "unanswerable", ...scoreAnswer(item("not_reported", null), "ANSWER: 123") },
  ];
  assert.equal(behaviour(runs).answerable_abstention, 0.5);
  assert.equal(behaviour(runs).unanswerable_invented_number, 1);
});

test("the live adapter retains final text and observed provider/tool evidence without oracle answers", async () => {
  const inputs = [];
  const responses = [
    { id: "fixture-response-1", model: "fixture-model-snapshot", usage: { prompt_tokens: 10, completion_tokens: 2 },
      choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "fixture-call", function: { name: "fixture_lookup", arguments: '{"cik":"1"}' } }] } }] },
    { id: "fixture-response-2", model: "fixture-model-snapshot", usage: { prompt_tokens: 20, completion_tokens: 3 },
      choices: [{ message: { role: "assistant", content: "Arithmetic\nANSWER: 0" } }] },
  ];
  const run = await runItem({ id: "fixture-item", question: "Synthetic fixture question", answer: { value: 0 } }, {
    model: "fixture-model", arm: "mcp", mcp: { tools: [{ name: "fixture_lookup" }],
      client: { callTool: async () => ({ content: [{ text: "Synthetic fixture fact" }] }) } },
    request: async (_, messages) => { inputs.push(structuredClone(messages)); return responses.shift(); },
  });
  assert.equal(run.response_text, "Arithmetic\nANSWER: 0");
  assert.equal(run.tokens, 35); assert.equal(run.tool_calls, 1); assert.equal(run.error, null);
  assert.equal(run.provider_responses[0].response_id, "fixture-response-1");
  assert.equal(run.tool_trace[0].response_text, "Synthetic fixture fact");
  assert.equal(inputs[1].at(-1).role, "tool");
  assert.equal(Object.hasOwn(run, "expected"), false);
  assert.equal(Object.hasOwn(run, "correct"), false);
});

test("the live adapter preserves failed-call evidence and cannot turn a missing final response into zero", async () => {
  const source = { id: "fixture-item", question: "Synthetic fixture question" };
  const failed = await runItem(source, { model: "fixture", arm: "closed", request: async () => { throw new Error("Synthetic request failure"); } });
  assert.equal(failed.response_text, null); assert.equal(failed.error, "Synthetic request failure");
  const missing = await runItem(source, { model: "fixture", arm: "closed", request: async () => ({ choices: [{ message: { content: null } }] }) });
  assert.equal(missing.response_text, null); assert.match(missing.error, /No final response/);
});

test("the sample is stratified by template and fixed by its seed", () => {
  const items = ["a", "b"].flatMap((t) => Array.from({ length: 10 }, (_, i) => ({ id: `${t}${i}`, template: t })));
  const s = stratifiedSample(items, 3, 1);
  assert.deepEqual(s.map((x) => x.template), ["a", "a", "a", "b", "b", "b"]);
  assert.deepEqual(stratifiedSample(items, 3, 1), s);
  assert.notDeepEqual(stratifiedSample(items, 3, 2).map((x) => x.id), s.map((x) => x.id));
  for (const perTemplate of [0, -1, 1.5, NaN]) assert.throws(() => stratifiedSample(items, perTemplate, 1), /per-template/);
  for (const seed of [-1, 0x100000000, 1.5, NaN]) assert.throws(() => stratifiedSample(items, 3, seed), /seed/);
});
