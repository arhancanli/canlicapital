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
  const fill = (overrides) => ({ ...packet, labels: packet.labels.map((l) => ({ ...l, question_clear: "yes", answer_matches_filing: "yes", citation_correct: "yes", notes: "Checked the filing table.", ...(overrides[l.id] ?? {}) })) });
  const result = agreement(fill({}), fill({ i1: { answer_matches_filing: "no" } }));
  assert.equal(result.items, 4);
  assert.deepEqual(result.disagreements, [{ id: "i1", fields: ["answer_matches_filing"], a: { answer_matches_filing: "yes" }, b: { answer_matches_filing: "no" } }]);
  assert.throws(() => agreement(fill({ i2: { citation_correct: "maybe" } }), fill({})), /citation_correct must be one of yes, no/);
});

test("coverage exposes missing and incomplete items instead of silently dropping them", () => {
  const blank = { schema: "canli.filing-facts-gold-packet.v0", labels: [{ id: "a" }, { id: "b" }, { id: "c" }] };
  const done = (id) => ({ id, question_clear: "yes", answer_matches_filing: "yes", citation_correct: "yes" });
  const a = { ...blank, labels: [done("a"), { ...done("b"), answer_matches_filing: "" }] };
  const b = { ...blank, labels: [done("a"), done("c")] };
  const result = agreement(a, b, blank);
  assert.equal(result.items, 1);
  assert.deepEqual([result.coverage.expected, result.coverage.complete_a, result.coverage.complete_b], [3, 1, 2]);
  assert.deepEqual(result.coverage.incomplete, [
    { id: "b", annotator: "a", fields: ["answer_matches_filing"] },
    { id: "b", annotator: "b", fields: ["item"] },
    { id: "c", annotator: "a", fields: ["item"] },
  ]);
  assert.equal(result.judgements.question_clear.observed, 1);
  assert.equal(result.independent_identities_declared, null);
  const empty = agreement(blank, blank, blank);
  assert.equal(empty.items, 0);
  assert.equal(empty.judgements.answer_matches_filing, null);
  assert.equal(empty.coverage.incomplete.length, 6);
});

test("invalid labels outside the intersection and duplicate IDs cannot inflate agreement", () => {
  const p = { schema: "canli.filing-facts-gold-packet.v0", labels: [{ id: "a", citation_correct: "maybe" }] };
  assert.throws(() => agreement(p, { ...p, labels: [] }), /citation_correct must/);
  assert.throws(() => agreement({ ...p, labels: [{ id: "a" }, { id: "a" }] }, { ...p, labels: [] }), /duplicate item a/);
  assert.throws(() => agreement({ ...p, labels: [{ id: "a" }] }, { ...p, labels: [] }, { ...p, labels: [{ id: "b" }] }), /unknown gold item a/);
});

test("a negative judgement without its required source note is incomplete", () => {
  const p = { schema: "canli.filing-facts-gold-packet.v0", labels: [{ id: "a", question_clear: "yes", answer_matches_filing: "cannot_find", citation_correct: "yes", notes: " " }] };
  assert.deepEqual(agreement(p, p).coverage.incomplete.map((x) => x.fields), [["notes"], ["notes"]]);
});

test("distinct identities and unchanged source items are checked when a gold packet is supplied", () => {
  const p = { schema: "canli.filing-facts-gold-packet.v0", annotator: "Alice", labels: [{ id: "a", question: "original" }] };
  assert.throws(() => agreement(p, { ...p, annotator: " ALICE " }), /distinct identities/);
  assert.throws(() => agreement({ ...p, labels: [{ id: "a", question: "edited" }] }, { ...p, annotator: "Bob" }, p), /question changed/);
});

test("reviewer identities and required source notes cannot be replaced by non-text values", () => {
  const p = { schema: "canli.filing-facts-gold-packet.v0", annotator: "Alice", labels: [{ id: "a", question_clear: "yes", answer_matches_filing: "no", citation_correct: "yes", notes: { fabricated: true } }] };
  assert.throws(() => agreement(p, { ...p, annotator: "Bob" }), /notes must be a string/);
  assert.throws(() => agreement({ ...p, annotator: 123, labels: [] }, { ...p, annotator: "Bob", labels: [] }), /annotator must be a string/);
});
