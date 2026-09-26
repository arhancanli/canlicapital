import assert from "node:assert/strict";
import test from "node:test";

import { agreement, cohensKappa } from "./agreement.mjs";
import { goldPacket } from "./gold-packet.mjs";

test("Cohen's kappa matches the textbook example (0.4 for 50 items: 20 yes/yes, 15 no/no, 5 and 10 off)", () => {
  // Two raters, 50 items: both yes 20, both no 15, A yes/B no 5, A no/B yes 10.
  const a = [...Array(20).fill("yes"), ...Array(15).fill("no"), ...Array(5).fill("yes"), ...Array(10).fill("no")];
  const b = [...Array(20).fill("yes"), ...Array(15).fill("no"), ...Array(5).fill("no"), ...Array(10).fill("yes")];
  const k = cohensKappa(a, b);
  assert.equal(k.observed, 0.7);
  assert.ok(Math.abs(k.expected - 0.5) < 1e-12);
  assert.ok(Math.abs(k.kappa - 0.4) < 1e-12);
});

test("perfect agreement is kappa 1; one shared constant label leaves kappa undefined; chance-level agreement is 0", () => {
  assert.equal(cohensKappa(["yes", "no", "yes"], ["yes", "no", "yes"]).kappa, 1);
  assert.equal(cohensKappa(["yes", "yes"], ["yes", "yes"]).kappa, null);
  assert.equal(cohensKappa(["yes", "yes", "no", "no"], ["yes", "no", "yes", "no"]).kappa, 0);
  assert.throws(() => cohensKappa(["yes"], []), /same, non-empty/);
});

test("agreement compares two filled packets, lists disagreements and rejects labels outside the allowed set", () => {
  const items = [1, 2, 3, 4].map((n) => ({ id: `i${n}`, template: n % 2 ? "lookup" : "ratio", company: { name: "C" }, question: `q${n}`, answer: { kind: "number", value: n, unit: "USD" }, facts: [{ url: "https://www.sec.gov/Archives/edgar/data/1/1/" }] }));
  const packet = goldPacket(items, 2);
  const fill = (overrides) => ({ ...packet, labels: packet.labels.map((l) => ({ ...l, question_clear: "yes", answer_matches_filing: "yes", citation_correct: "yes", ...(overrides[l.id] ?? {}) })) });
  const result = agreement(fill({}), fill({ i1: { answer_matches_filing: "no" } }));
  assert.equal(result.items, 4);
  assert.deepEqual(result.disagreements, [{ id: "i1", fields: ["answer_matches_filing"], a: { answer_matches_filing: "yes" }, b: { answer_matches_filing: "no" } }]);
  assert.throws(() => agreement(fill({ i2: { citation_correct: "maybe" } }), fill({})), /citation_correct must be one of yes, no/);
});
