import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { auditEvidence, CAPTURE_SCHEMA, evaluateCapture, readDataset, SCORING_SOURCE_FILES } from "./evidence.mjs";
import { SCORING_VERSION, stratifiedSample } from "./eval.mjs";

const items = ["lookup", "unanswerable", "ratio"].flatMap((template) => Array.from({ length: 3 }, (_, i) => ({
  schema: "canli.filing-facts-item.v0", id: `${template}-${i}`, template, company: { cik: "0000000001", name: "Test fixture" },
  question: `Synthetic ${template} fixture ${i}`, answer: { kind: template === "lookup" ? "number" : template === "ratio" ? "ratio" : "not_reported",
    value: template === "unanswerable" ? null : i },
})));
const bytes = Buffer.from(items.map((item) => JSON.stringify(item)).join("\n") + "\n");
function capture() {
  const source = readDataset(bytes);
  const sample = stratifiedSample(source.items, 1, 7);
  return { schema: CAPTURE_SCHEMA, provider: "synthetic-test-fixture", model: "synthetic-test-model", arm: "closed",
    recorded_at: "2026-10-01T00:00:00.000Z", dataset_sha256: source.sha256,
    sampling: { method: "stratified", seed: 7, per_template: 1, item_ids: sample.map((item) => item.id) },
    runs: sample.map((item) => ({ id: item.id, response_text: `ANSWER: ${item.answer.value ?? "not reported"}`, tokens: 10, tool_calls: 0, error: null })) };
}
const clone = (value) => structuredClone(value);

test("offline replay binds raw answers, exact source bytes, sampling and scorer version", () => {
  const input = capture();
  const output = evaluateCapture(bytes, input);
  assert.equal(output.summary.accuracy, 1);
  assert.equal(output.scoring.version, SCORING_VERSION);
  assert.deepEqual(output.capture, input);
  assert.equal(output.dataset.bytes, bytes.length);
  assert.equal(auditEvidence(bytes, output).status, "recomputed");
  assert.throws(() => evaluateCapture(Buffer.concat([bytes, Buffer.from("\n")]), input), /source bytes/);
  const changed = clone(input); changed.sampling.item_ids.reverse();
  assert.throws(() => evaluateCapture(bytes, changed), /deterministic source sample/);
  const extra = clone(input); extra.runs.push({ ...extra.runs[0] });
  assert.throws(() => evaluateCapture(bytes, extra), /duplicate/);
  extra.runs.at(-1).id = "outside-sample";
  assert.throws(() => evaluateCapture(bytes, extra), /out-of-sample/);
});

test("missing captures, missing responses and request failures keep the full selected denominator", () => {
  const input = capture();
  input.runs.pop();
  input.runs[0].error = "Synthetic timeout";
  input.runs[1].response_text = null;
  const output = evaluateCapture(bytes, input);
  assert.equal(output.summary.items, 3);
  assert.equal(output.summary.accuracy, 0, "an answer next to a request error cannot pass");
  assert.equal(output.summary.response_accuracy, null);
  assert.deepEqual(output.summary.coverage, { expected: 3, captured: 2, responses: 0,
    missing_captures: 1, missing_responses: 1, request_errors: 1, no_final_answers: 0 });
  const empty = capture(); empty.runs = [];
  assert.equal(evaluateCapture(bytes, empty).summary.coverage.missing_captures, 3);
});

test("tampered raw answers, totals, expected answers, capture digest and scoring version fail audit", () => {
  const good = evaluateCapture(bytes, capture());
  for (const mutate of [
    (record) => { record.runs[0].response_text = "ANSWER: bogus"; },
    (record) => { record.summary.accuracy = 0; },
    (record) => { record.runs[0].expected = 100; },
    (record) => { record.capture_sha256 = "0".repeat(64); },
    (record) => { record.scoring.version = "legacy"; },
    (record) => { record.capture.runs[0].response_text = "ANSWER: bogus"; },
  ]) {
    const bad = clone(good); mutate(bad);
    assert.throws(() => auditEvidence(bytes, bad), /scoring replay/);
  }
  const oracle = capture(); oracle.runs[0].response_text = "ANSWER: bogus"; oracle.runs[0].correct = true;
  assert.equal(evaluateCapture(bytes, oracle).runs[0].correct, false, "captured verdicts are never trusted");
});

test("unknown schema, bad source items, missing raw text, negative costs and MCP without tools are refused", () => {
  const badSource = clone(items); badSource[0].answer.value = null;
  assert.throws(() => readDataset(JSON.stringify(badSource[0])), /invalid/);
  assert.throws(() => readDataset(bytes.toString() + JSON.stringify(items[0]) + "\n"), /duplicate/);
  for (const mutate of [
    (record) => { delete record.runs[0].response_text; },
    (record) => { record.runs[0].tokens = -1; },
    (record) => { record.runs[0].tool_calls = 0.5; },
    (record) => { record.arm = "mcp"; },
    (record) => { record.arm = "other"; },
  ]) {
    const bad = capture(); mutate(bad); assert.throws(() => evaluateCapture(bytes, bad), RangeError);
  }
});

test("closed-book captures cannot claim tool contracts, calls or traces", () => {
  for (const mutate of [
    (record) => { record.tool_contract = { tools: [{ name: "fixture-tool" }] }; },
    (record) => { record.runs[0].tool_calls = 1; },
    (record) => { record.runs[0].tool_trace = [{ name: "fixture-tool" }]; },
  ]) {
    const bad = capture(); mutate(bad);
    assert.throws(() => evaluateCapture(bytes, bad), /closed-book/);
  }
  const assisted = capture(); assisted.arm = "mcp"; assisted.tool_contract = { tools: [{ name: "fixture-tool" }] };
  assisted.runs[0].tool_calls = 1; assisted.runs[0].tool_trace = [{ name: "fixture-tool" }];
  assert.equal(evaluateCapture(bytes, assisted).summary.accuracy, 1);
});

test("replay refuses changed scoring/sampling helper sources even when outputs would be identical", () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-eval-source-binding-"));
  try {
    const scripts = join(dir, "scripts"); mkdirSync(scripts);
    cpSync(new URL("./", import.meta.url), join(scripts, "datasets/filing-facts"), { recursive: true });
    copyFileSync(new URL("../../canonical-json.mjs", import.meta.url), join(scripts, "canonical-json.mjs"));
    const source = join(dir, "items.jsonl"), evidence = join(dir, "evidence.json");
    writeFileSync(source, bytes); writeFileSync(evidence, JSON.stringify(evaluateCapture(bytes, capture())));
    const cli = join(scripts, "datasets/filing-facts/replay-evaluation.mjs");
    const run = () => spawnSync(process.execPath, [cli, "audit", source, evidence], { encoding: "utf8", env: { PATH: process.env.PATH }, timeout: 5000 });
    assert.equal(run().status, 0);
    for (const name of SCORING_SOURCE_FILES) {
      const file = join(scripts, "datasets/filing-facts", name), original = readFileSync(file);
      appendFileSync(file, "\n// independent source mutation; numerical behavior unchanged\n");
      const result = run(); assert.equal(result.status, 1, name); assert.match(result.stderr, /scoring replay/, name);
      writeFileSync(file, original);
    }
    assert.equal(run().status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("historical v0 records remain byte-identical and explicitly unrescorable without raw answers", () => {
  const dir = new URL("../../../public/datasets/filing-facts/v0/", import.meta.url);
  const dataset = readFileSync(new URL("filing-facts-v0.jsonl", dir));
  for (const line of readFileSync(new URL("SHA256SUMS", dir), "utf8").trim().split("\n")) {
    const [expected, file] = line.split(/\s+/);
    assert.equal(createHash("sha256").update(readFileSync(new URL(file, dir))).digest("hex"), expected);
  }
  for (const name of ["ff-eval-closed.json", "ff-eval-mcp.json"]) {
    const original = readFileSync(new URL(name, dir));
    const record = JSON.parse(original);
    const audit = auditEvidence(dataset, record);
    assert.equal(audit.status, "unrescorable");
    assert.equal(audit.runs, 150);
    assert.equal(audit.raw_answers_present, 0);
    assert.deepEqual(audit.recorded_summary, record.summary);
    assert.equal(readFileSync(new URL(name, dir)).equals(original), true);
  }
});

test("CLI scores and audits offline, refuses overwritten inputs/results, and flags legacy evidence", () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-eval-evidence-"));
  try {
    const source = join(dir, "items.jsonl"), input = join(dir, "capture.json"), output = join(dir, "evidence.json");
    writeFileSync(source, bytes); writeFileSync(input, JSON.stringify(capture()));
    const cli = new URL("./replay-evaluation.mjs", import.meta.url);
    const run = (...args) => spawnSync(process.execPath, [cli.pathname, ...args], { encoding: "utf8", env: { PATH: process.env.PATH }, timeout: 5000 });
    assert.equal(run("score", source, input, output).status, 0);
    assert.equal(JSON.parse(run("audit", source, output).stdout).status, "recomputed");
    assert.equal(run("score", source, input, output).status, 1);
    assert.equal(run("score", source, input, source).status, 1);
    const legacy = join(dir, "legacy.json"); writeFileSync(legacy, JSON.stringify({ summary: {}, runs: [{ parsed: 0 }] }));
    const audit = run("audit", source, legacy);
    assert.equal(audit.status, 2); assert.equal(JSON.parse(audit.stdout).status, "unrescorable");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
