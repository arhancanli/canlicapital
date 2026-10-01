import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { agreement, packetDigest } from "../scripts/datasets/filing-facts/agreement.mjs";
import { DRAFT_SCHEMA, commentBody, filledPacket, itemStatus, packetFingerprint, progress, restoreDraft, storedDraft, validatePacket } from "./annotate-core.js";

const packet = JSON.parse(readFileSync(new URL("../public/datasets/filing-facts/v0/gold-packet-v0.json", import.meta.url), "utf8"));
const [first, second] = packet.labels;
const digest = packetDigest(packet);

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
  const filled = filledPacket(packet, answers, " octocat ", digest);
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
  const body = commentBody(packet, answers, "octocat", digest);
  assert.match(body, new RegExp(`1 of ${packet.labels.length} items`));
  const json = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
  assert.deepEqual(json.labels.map((l) => l.id), [first.id]);
});

test("a negative judgement without its required source note stays out of submitted labels", () => {
  const answers = { [first.id]: { question_clear: "yes", answer_matches_filing: "no", citation_correct: "yes", notes: "   " } };
  const body = commentBody(packet, answers, "reviewer", digest);
  const json = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
  assert.deepEqual(json.labels, []);
});

test("the copied submission is a real Markdown code block", () => {
  const body = commentBody(packet, {}, "reviewer", digest);
  assert.ok(body.includes("\n\n```json\n"));
  assert.ok(body.endsWith("\n```\n"));
});

test("browser fingerprints exactly match offline review digests, including non-ASCII source text", async () => {
  assert.equal(await packetFingerprint(packet), digest);
  assert.equal(digest, "15c595ed8109dd324dffeddd104d2f72154ef3710b9d64a0fb7eac7ddc95b7ee");
  const changed = structuredClone(packet);
  changed.labels.reverse();
  changed.labels[0].notes = "A review note cannot change the immutable packet digest.";
  assert.equal(await packetFingerprint(changed), digest);
  changed.labels[0].question += " \u2014 vérifier € 📈";
  assert.equal(await packetFingerprint(changed), packetDigest(changed));
  assert.notEqual(await packetFingerprint(changed), digest);
});

test("only a draft bound to the current packet can restore labels; recovery status remains explicit", () => {
  const state = { index: 1, annotator: "reviewer", answers: { [first.id]: { question_clear: "yes", notes: "kept" } } };
  const saved = storedDraft(packet, digest, state);
  assert.deepEqual(restoreDraft(packet, digest, saved), { state, status: "restored" });
  const legacy = structuredClone(state);
  assert.equal(restoreDraft(packet, digest, legacy).status, "legacy");
  assert.deepEqual(restoreDraft(packet, digest, legacy).state.answers, {});
  assert.deepEqual(legacy, state, "the caller can preserve and download the untouched legacy draft");
  const foreign = { ...saved, packet_sha256: "a".repeat(64) };
  assert.equal(restoreDraft(packet, digest, foreign).status, "source_mismatch");
  assert.deepEqual(restoreDraft(packet, digest, foreign).state.answers, {});
  for (const invalid of [null, [], 3, "draft"]) assert.equal(restoreDraft(packet, digest, invalid).status, "invalid");
});

test("matching drafts safely normalize corrupt state without accepting foreign IDs or invalid labels", () => {
  const bad = { schema: DRAFT_SCHEMA, packet_sha256: digest, index: 999, annotator: {}, answers: { [first.id]: { question_clear: "yes", answer_matches_filing: "maybe", notes: ["no"] }, [second.id]: null, foreign: { question_clear: "yes" } } };
  const copy = structuredClone(bad);
  const result = restoreDraft(packet, digest, bad);
  assert.equal(result.status, "sanitized");
  assert.deepEqual(result.state, { index: 0, annotator: "", answers: { [first.id]: { question_clear: "yes" } } });
  assert.deepEqual(bad, copy);
  for (const index of [-1, "0", 0.5, Infinity]) assert.equal(restoreDraft(packet, digest, { ...bad, index, answers: null }).state.index, 0);
});

test("download and copied complete submissions reproduce offline coverage and packet binding", () => {
  const answers = { [first.id]: { question_clear: "yes", answer_matches_filing: "no", citation_correct: "yes", notes: "The original statement reports a different number." }, [second.id]: { question_clear: "yes", answer_matches_filing: "cannot_find", citation_correct: "yes" } };
  const download = filledPacket(packet, answers, "Alice", digest);
  const body = commentBody(packet, answers, "Alice", digest);
  const copied = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
  assert.equal(download.packet_sha256, digest);
  assert.equal(copied.packet_sha256, digest);
  assert.deepEqual(copied.labels.map(label => label.id), [first.id]);
  const other = filledPacket(packet, answers, "Bob", digest);
  const downloadedReview = agreement(download, other, packet);
  const copiedReview = agreement(copied, other, packet);
  for (const key of ["basis", "expected", "complete_a", "complete_b", "complete_pairs"]) assert.equal(downloadedReview.coverage[key], copiedReview.coverage[key]);
  assert.deepEqual(downloadedReview.judgements, copiedReview.judgements);
  assert.deepEqual([...new Set(downloadedReview.coverage.incomplete.map(item => item.id))], [...new Set(copiedReview.coverage.incomplete.map(item => item.id))]);
  assert.throws(() => agreement({ ...copied, packet_sha256: "f".repeat(64) }, other, packet), /digest does not match/);
  assert.throws(() => filledPacket(packet, answers, "Alice"), /SHA-256 is required/);
  assert.throws(() => commentBody(packet, answers, "  ", digest), /name or stable handle/);
});

test("unsafe or malformed source packets cannot render as review work", () => {
  for (const change of [p => { p.labels = []; }, p => { p.labels[0].filings = ["javascript:alert(1)"]; }, p => { p.labels[0].filings = ["https://evil.example/Archives/edgar/data/1/"]; }, p => { p.labels.push(p.labels[0]); }, p => { p.judgements.citation_correct.push("maybe"); }]) {
    const changed = structuredClone(packet);
    change(changed);
    assert.throws(() => validatePacket(changed), RangeError);
  }
});
