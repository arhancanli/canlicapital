import assert from "node:assert/strict";
import test from "node:test";

import { behaviour, scoreAnswer, stratifiedSample } from "./eval.mjs";

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

test("the sample is stratified by template and fixed by its seed", () => {
  const items = ["a", "b"].flatMap((t) => Array.from({ length: 10 }, (_, i) => ({ id: `${t}${i}`, template: t })));
  const s = stratifiedSample(items, 3, 1);
  assert.deepEqual(s.map((x) => x.template), ["a", "a", "a", "b", "b", "b"]);
  assert.deepEqual(stratifiedSample(items, 3, 1), s);
  assert.notDeepEqual(stratifiedSample(items, 3, 2).map((x) => x.id), s.map((x) => x.id));
});
