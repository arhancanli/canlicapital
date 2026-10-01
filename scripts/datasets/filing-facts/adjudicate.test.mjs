import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { adjudicateGold } from "./adjudicate.mjs";
import { packetDigest } from "./agreement.mjs";

const gold = JSON.parse(readFileSync(new URL("../../../public/datasets/filing-facts/v0/gold-packet-v0.json", import.meta.url), "utf8"));
const [first, second] = gold.labels;
const packet = (who) => ({ ...gold, annotator: who, labels: gold.labels.map((label) => ({ ...label, question_clear: "yes", answer_matches_filing: "yes", citation_correct: "yes" })) });
const decision = (label, verdict = "accept") => ({ id: label.id, verdict, notes: "Matched the units, period and value in the source statement.", evidence: [{ url: label.filings[0], locator: "Main annual report, balance sheet table" }] });
const review = (decisions) => ({ schema: "canli.filing-facts-adjudication.v1", adjudicator: "Carol", packet_sha256: packetDigest(gold), decisions });

test("only complete pairs with an explicit source-backed adjudication enter the gold export", () => {
  const a = packet("Alice");
  const b = packet("Bob");
  b.labels[1].answer_matches_filing = "";
  const result = adjudicateGold(gold, a, b, review([decision(first), decision(second)]));
  assert.deepEqual(result.counts, { expected: 50, accepted: 1, rejected: 0, pending: 49 });
  assert.deepEqual(result.items.map((item) => item.id), [first.id]);
  assert.equal(result.items[0].review.submissions[0].annotator, "Alice");
  assert.equal(result.items[0].review.submissions[1].judgements.answer_matches_filing, "yes");
  assert.ok(result.pending.find((item) => item.id === second.id).missing_reviews.length);
  assert.equal(result.agreement.coverage.complete_pairs, 49);
});

test("disagreements are retained; a final rejection does not appear as an accepted item", () => {
  const b = packet("Bob");
  b.labels[0].answer_matches_filing = "no";
  b.labels[0].notes = "A different figure appears in the cited table.";
  const result = adjudicateGold(gold, packet("Alice"), b, review([decision(first, "reject")]));
  assert.equal(result.items.length, 0);
  assert.equal(result.rejected[0].id, first.id);
  assert.equal(result.agreement.disagreements[0].id, first.id);
});

test("anonymous, same-reviewer and stale-packet claims cannot create a gold set", () => {
  assert.throws(() => adjudicateGold(gold, packet(""), packet("Bob"), review([])), /two named/);
  assert.throws(() => adjudicateGold(gold, packet("Alice"), packet(" ALICE "), review([])), /distinct identities/);
  assert.throws(() => adjudicateGold(gold, packet("Alice"), packet("Bob"), { ...review([]), adjudicator: "alice" }), /adjudicator must be distinct/);
  assert.throws(() => adjudicateGold(gold, packet("Alice"), packet("Bob"), { ...review([]), packet_sha256: "0".repeat(64) }), /packet_sha256/);
});

test("source substitutions, unknown/duplicate decisions, missing locators and external evidence refuse", () => {
  const changed = packet("Alice");
  changed.labels[0].answer = "changed";
  assert.throws(() => adjudicateGold(gold, changed, packet("Bob"), review([])), /answer changed/);
  for (const decisions of [
    [decision(first), decision(first)],
    [{ ...decision(first), id: "unknown" }],
    [{ ...decision(first), notes: "" }],
    [{ ...decision(first), evidence: [] }],
    [{ ...decision(first), evidence: [{ url: "https://example.com/", locator: "table" }] }],
    [{ ...decision(first), evidence: [{ url: first.filings[0], locator: "" }] }],
  ]) assert.throws(() => adjudicateGold(gold, packet("Alice"), packet("Bob"), review(decisions)), /adjudication|evidence|locator/);
});

test("the canonical item digest ignores label order and judgement edits but binds answer/citation edits", () => {
  assert.equal(packetDigest({ ...gold, labels: [...gold.labels].reverse() }), packetDigest(gold));
  assert.equal(packetDigest(packet("Alice")), packetDigest(gold));
  const changed = structuredClone(gold);
  changed.labels[0].filings[0] += "changed/";
  assert.notEqual(packetDigest(changed), packetDigest(gold));
});
