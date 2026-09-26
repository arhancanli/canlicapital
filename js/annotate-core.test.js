import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { commentBody, filledPacket, itemStatus, progress } from "./annotate-core.js";

const packet = JSON.parse(readFileSync(new URL("../public/datasets/filing-facts/v0/gold-packet-v0.json", import.meta.url), "utf8"));
const [first, second] = packet.labels;

test("an item is complete only with all three judgements, and a 'no' needs a note", () => {
  const answers = { [first.id]: { question_clear: "yes", answer_matches_filing: "yes" } };
  assert.equal(itemStatus(packet, answers, first.id), "incomplete");
  answers[first.id].citation_correct = "yes";
  assert.equal(itemStatus(packet, answers, first.id), "complete");
  answers[second.id] = { question_clear: "yes", answer_matches_filing: "no", citation_correct: "yes" };
  assert.equal(itemStatus(packet, answers, second.id), "needs_note");
  answers[second.id].notes = "The 10-K reports 1,203 million.";
  assert.equal(itemStatus(packet, answers, second.id), "complete");
  assert.deepEqual(progress(packet, answers), { total: packet.labels.length, complete: 2, needsNote: 0 });
});

test("the filled packet keeps the schema and order the agreement script reads, and ignores invalid values", () => {
  const answers = { [first.id]: { question_clear: "yes", answer_matches_filing: "maybe", citation_correct: "no", notes: "  wrong accession  " } };
  const filled = filledPacket(packet, answers, " octocat ");
  assert.equal(filled.schema, packet.schema);
  assert.equal(filled.annotator, "octocat");
  assert.deepEqual(filled.labels.map((l) => l.id), packet.labels.map((l) => l.id));
  assert.equal(filled.labels[0].question_clear, "yes");
  assert.equal(filled.labels[0].answer_matches_filing, "", "a value outside the packet's choices is not recorded");
  assert.equal(filled.labels[0].notes, "wrong accession");
  assert.equal(filled.labels[1].question_clear, "");
});

test("the GitHub comment carries only fully answered items", () => {
  const answers = { [first.id]: { question_clear: "yes", answer_matches_filing: "yes", citation_correct: "yes" }, [second.id]: { question_clear: "yes" } };
  const body = commentBody(packet, answers, "octocat");
  assert.match(body, new RegExp(`1 of ${packet.labels.length} items`));
  const json = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
  assert.deepEqual(json.labels.map((l) => l.id), [first.id]);
});
