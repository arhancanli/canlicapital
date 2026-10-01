import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, copyFileSync, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { auditBaselineContract, auditBaselineFixture, createBaselineContract, FIXTURE_PURPOSE, projectQuestions, V0_DIRECTORY, V0_SHA256 } from "./baseline-contract.mjs";
import { CAPTURE_SCHEMA, readDataset } from "./evidence.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = join(ROOT, "scripts/datasets/filing-facts/baseline-contract-cli.mjs");
const clone = (value) => structuredClone(value);
const source = readFileSync(join(ROOT, V0_DIRECTORY, "filing-facts-v0.jsonl"));
const items = new Map(readDataset(source).items.map((item) => [item.id, item]));
const contract = createBaselineContract(ROOT);
function fixture() {
  return { schema: CAPTURE_SCHEMA, purpose: FIXTURE_PURPOSE, baseline_contract_sha256: contract.contract_sha256,
    provider: "synthetic-test-fixture", model: "synthetic-test-model", arm: "closed",
    recorded_at: "2026-10-01T00:00:00.000Z", dataset_sha256: contract.dataset.sha256,
    sampling: { method: "stratified", seed: contract.sampling.seed, per_template: contract.sampling.per_template, item_ids: contract.sampling.item_ids },
    runs: contract.sampling.item_ids.map((id) => ({ id, response_text: `ANSWER: ${items.get(id).answer.value ?? "not reported"}`,
      error: null, tokens: 0, tool_calls: 0, tool_trace: [] })) };
}
function snapshot() {
  const root = mkdtempSync(join(tmpdir(), "canli-baseline-contract-"));
  const paths = [...Object.keys(contract.implementation.sources), ...Object.keys(contract.context),
    ...Object.keys(V0_SHA256).map((name) => `${V0_DIRECTORY}/${name}`)];
  for (const path of paths) { mkdirSync(dirname(join(root, path)), { recursive: true }); copyFileSync(join(ROOT, path), join(root, path)); }
  return root;
}
function readPrivate(path) {
  const fd = openSync(path, "r");
  try { assert.equal(fstatSync(fd).mode & 0o777, 0o600); return readFileSync(fd); }
  finally { closeSync(fd); }
}

test("finite smoke cohort binds all five historical files, context, expected/source facts and existing scorer", () => {
  assert.equal(auditBaselineContract(ROOT, contract).status, "verified-offline-plan");
  assert.equal(contract.sampling.items, 15);
  assert.deepEqual(Object.values(contract.sampling.by_template), [3, 3, 3, 3, 3]);
  assert.deepEqual(Object.keys(contract.dataset.files), Object.keys(V0_SHA256));
  assert.equal(Object.keys(contract.implementation.sources).length, 10);
  assert.equal(Object.keys(contract.context).length, 3);
  assert.equal(contract.annotation.packet_rows, 50);
  assert.equal(contract.annotation.completed_packet_rows, 0);
  assert.equal(contract.execution.model_calls_authorized, false);
  assert.equal(contract.arms.source_assisted.capture_arm, null);
  assert.equal(contract.bindings.filter((item) => item.template === "unanswerable").length, 3);
  assert.ok(contract.bindings.every((item) => item.source_availability === "unverified"));
  for (const legacy of Object.values(contract.historical_baselines)) {
    assert.equal(legacy.status, "unrescorable"); assert.equal(legacy.raw_answers_present, 0); assert.equal(legacy.runs, 150);
  }
});

test("changes to source/context, V0 bytes or expected/sample requirements are refused", () => {
  for (const mutate of [
    (plan) => { plan.bindings[0].expected_sha256 = "0".repeat(64); },
    (plan) => { plan.bindings[0].cited_facts_sha256 = "0".repeat(64); },
    (plan) => { plan.sampling.item_ids.reverse(); },
    (plan) => { plan.sampling.seed++; },
    (plan) => { plan.execution.model_calls_authorized = true; },
    (plan) => { plan.capture_requirements.denominators = "successful subset"; },
  ]) { const changed = clone(contract); mutate(changed); assert.throws(() => auditBaselineContract(ROOT, changed), /contract does not match/); }
  for (const path of [Object.keys(contract.context)[0], `${V0_DIRECTORY}/filing-facts-v0.jsonl`, Object.keys(contract.implementation.sources)[0]]) {
    const root = snapshot();
    try {
      writeFileSync(join(root, path), Buffer.concat([readFileSync(join(root, path)), Buffer.from("\n")]));
      assert.throws(() => auditBaselineContract(root, contract), /changed|differs|does not match/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("question projection has exact original question bytes and excludes oracle/source fields", () => {
  const projection = projectQuestions(ROOT, contract);
  assert.equal(projection.model_calls_authorized, false);
  assert.deepEqual(projection.questions.map((item) => item.id), contract.sampling.item_ids);
  for (const row of projection.questions) {
    assert.deepEqual(Object.keys(row), ["id", "question"]);
    assert.equal(row.question, items.get(row.id).question);
  }
});

test("source changed after module load is refused instead of binding old executing code to new disk bytes", () => {
  const root = snapshot();
  try {
    const script = `
      import { appendFileSync } from 'node:fs';
      const module = await import(${JSON.stringify(pathToFileURL(join(root, 'scripts/datasets/filing-facts/baseline-contract.mjs')).href)});
      appendFileSync(${JSON.stringify(join(root, 'scripts/datasets/filing-facts/eval.mjs'))}, '\\n// synthetic post-load source mutation\\n');
      try { module.createBaselineContract(${JSON.stringify(root)}); process.exitCode = 10; }
      catch (error) { if (!error.message.includes('loaded preparation/scoring source differs')) throw error; }
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("existing replay retains errors, nulls, absent records and blank answers in all fifteen denominators", () => {
  const capture = fixture(); capture.runs.pop();
  capture.runs[0].error = "Synthetic timeout fixture";
  capture.runs[1].response_text = null;
  capture.runs[2].response_text = "";
  const result = auditBaselineFixture(ROOT, contract, capture);
  assert.equal(result.purpose, FIXTURE_PURPOSE); assert.equal(result.model_baseline, false);
  assert.equal(result.replay.runs, 15); assert.equal(result.replay.status, "recomputed");
  assert.deepEqual(result.coverage, { expected: 15, captured: 14, responses: 12, missing_captures: 1,
    missing_responses: 1, request_errors: 1, no_final_answers: 1 });
  capture.runs = [];
  assert.equal(auditBaselineFixture(ROOT, contract, capture).coverage.missing_captures, 15);
});

test("a transient dataset read cannot score a different oracle under the original contract", () => {
  const directory = mkdtempSync(join(tmpdir(), "canli-baseline-transient-"));
  try {
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { createHash } from 'node:crypto';
      const api = await import(${JSON.stringify(pathToFileURL(join(ROOT, 'scripts/datasets/filing-facts/baseline-contract.mjs')).href)});
      const root = ${JSON.stringify(ROOT)};
      const path = ${JSON.stringify(join(ROOT, V0_DIRECTORY, 'filing-facts-v0.jsonl'))};
      const contract = api.createBaselineContract(root);
      const changed = fs.readFileSync(path, 'utf8').trim().split('\\n').map(JSON.parse);
      for (const item of changed) if (item.answer.value !== null) item.answer.value += 12345;
      const bytes = Buffer.from(changed.map((item) => JSON.stringify(item)).join('\\n') + '\\n');
      const items = new Map(changed.map((item) => [item.id, item]));
      const capture = { schema: 'canli.filing-facts-answer-capture.v1', purpose: api.FIXTURE_PURPOSE,
        baseline_contract_sha256: contract.contract_sha256, provider: 'synthetic-test-fixture',
        model: 'synthetic-test-model', arm: 'closed', recorded_at: '2026-10-01T00:00:00.000Z',
        dataset_sha256: createHash('sha256').update(bytes).digest('hex'),
        sampling: { method: 'stratified', seed: contract.sampling.seed,
          per_template: 3, item_ids: contract.sampling.item_ids },
        runs: contract.sampling.item_ids.map((id) => ({ id,
          response_text: 'ANSWER: ' + (items.get(id).answer.value ?? 'not reported'),
          error: null, tokens: 0, tool_calls: 0, tool_trace: [] })) };
      const original = fs.readFileSync;
      let datasetReads = 0;
      fs.readFileSync = function (candidate, ...args) {
        if (candidate === path && ++datasetReads === 2) return bytes;
        return original.call(this, candidate, ...args);
      };
      syncBuiltinESMExports();
      try { assert.throws(() => api.auditBaselineFixture(root, contract, capture), /dataset changed before fixture scoring/); }
      finally { fs.readFileSync = original; syncBuiltinESMExports(); }
      assert.equal(datasetReads, 2, 'second read is the scoring buffer after the original preflight');
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8", timeout: 10000, cwd: directory });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("closed fixtures refuse tools, assisted metadata, a changed cohort and real-run labels", () => {
  for (const mutate of [
    (capture) => { capture.tool_contract = { tools: [] }; },
    (capture) => { capture.runs[0].tool_calls = 1; },
    (capture) => { capture.runs[0].tool_trace = [{ name: "fixture" }]; },
    (capture) => { capture.source_contract = {}; },
    (capture) => { capture.source_context = "fixture context"; },
    (capture) => { capture.source_bundle = {}; },
    (capture) => { capture.sampling.item_ids = capture.sampling.item_ids.slice(1); },
    (capture) => { capture.purpose = "model-baseline"; },
    (capture) => { capture.baseline_contract_sha256 = "0".repeat(64); },
    (capture) => { capture.arm = "mcp"; capture.tool_contract = { tools: [{}] }; },
    (capture) => { capture.arm = "source"; },
  ]) { const capture = fixture(); mutate(capture); assert.throws(() => auditBaselineFixture(ROOT, contract, capture), RangeError); }
});

test("duplicate, out-of-sample and mismatched raw captures are refused by the existing evaluator", () => {
  for (const mutate of [
    (capture) => { capture.runs.push(clone(capture.runs[0])); },
    (capture) => { capture.runs[0].id = "outside-sample"; },
    (capture) => { capture.dataset_sha256 = "0".repeat(64); },
    (capture) => { delete capture.runs[0].response_text; },
    (capture) => { capture.runs[0].tokens = -1; },
  ]) { const capture = fixture(); mutate(capture); assert.throws(() => auditBaselineFixture(ROOT, contract, capture), RangeError); }
});

test("prepare, question projection and fixture replay do not use a network adapter", () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network prohibited in offline contract test"); };
  try {
    auditBaselineContract(ROOT, createBaselineContract(ROOT));
    projectQuestions(ROOT, contract);
    assert.equal(auditBaselineFixture(ROOT, contract, fixture()).model_baseline, false);
  } finally { globalThis.fetch = fetch; }
});

test("CLI creates private files, refuses overwrite/tampering and executes through a real path alias", () => {
  const directory = mkdtempSync(join(tmpdir(), "canli-baseline-cli-"));
  try {
    const plan = join(directory, "plan.json"), questions = join(directory, "questions.json"), capture = join(directory, "fixture.json");
    const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", timeout: 10000 });
    const first = run("prepare", ROOT, plan);
    assert.equal(first.status, 0, first.stderr); assert.equal(JSON.parse(first.stdout).items, 15);
    const before = readPrivate(plan);
    assert.equal(run("prepare", ROOT, plan).status, 1); assert.deepEqual(readFileSync(plan), before);
    assert.equal(run("audit", ROOT, plan).status, 0);
    assert.equal(run("questions", ROOT, plan, questions).status, 0);
    assert.equal(JSON.parse(readPrivate(questions)).questions.length, 15);
    assert.equal(run("questions", ROOT, plan, plan).status, 1); assert.deepEqual(readFileSync(plan), before);
    writeFileSync(capture, JSON.stringify(fixture()));
    const replay = run("audit-fixture", ROOT, plan, capture);
    assert.equal(replay.status, 0, replay.stderr); assert.equal(JSON.parse(replay.stdout).model_baseline, false);
    const entry = join(directory, "entry-alias.mjs"); symlinkSync(CLI, entry);
    const aliased = spawnSync(process.execPath, [entry, "audit", ROOT, plan], { encoding: "utf8", timeout: 10000 });
    assert.equal(aliased.status, 0, aliased.stderr);
    assert.equal(JSON.parse(aliased.stdout).status, "verified-offline-plan", "aliased script entry must execute, not exit silently");
    const changed = clone(contract); changed.bindings[0].expected_sha256 = "0".repeat(64);
    writeFileSync(plan, JSON.stringify(changed)); assert.equal(run("audit", ROOT, plan).status, 1);
    const alias = realAlias(directory);
    if (alias !== directory) {
      const other = join(alias, "alias-plan.json");
      assert.equal(run("prepare", ROOT, other).status, 0);
      assert.equal(readFileSync(other).length, before.length);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

function realAlias(path) { return path.startsWith("/var/") ? `/private${path}` : path; }
