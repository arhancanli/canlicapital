// The agent benchmark's tasks and scorer, checked offline (no model, no network): every task names
// a real tool, ground truths are finite, and the scorer accepts the truth and rejects a wrong value.
import assert from "node:assert/strict";
import test from "node:test";

import { score, TASKS } from "../bench/agent/tasks.mjs";

const TOOLS = new Set(["validate_deflated_sharpe", "validate_overfitting", "validate_paper_evidence", "validate_breadth", "validate_track_record", "company_financial_history", "get_key", "get_receipt", "service_status"]);

test("every benchmark task names a real tool or none, and has a checkable ground truth", () => {
  const ids = new Set();
  for (const t of TASKS) {
    assert.ok(!ids.has(t.id), `duplicate task ${t.id}`);
    ids.add(t.id);
    assert.ok(t.tool === null || TOOLS.has(t.tool), `${t.id}: ${t.tool}`);
    if (t.company) continue;
    if (t.check.kind === "yesno") assert.ok(["yes", "no"].includes(t.expected), t.id);
    else assert.ok(Number.isFinite(t.expected), `${t.id}: ${t.expected}`);
  }
});

test("the scorer accepts the ground truth and rejects a wrong or missing answer", () => {
  for (const t of TASKS.filter((x) => !x.company)) {
    const truth = typeof t.expected === "number" ? String(t.expected) : t.expected;
    assert.equal(score(t, `Reasoning...\nANSWER: ${truth}`).correct, true, t.id);
    assert.equal(score(t, "no final answer line").correct, false, t.id);
    const wrong = typeof t.expected === "number" ? String(t.expected * 3 + 1) : (t.expected === "yes" ? "no" : "yes");
    assert.equal(score(t, `ANSWER: ${wrong}`).correct, false, t.id);
  }
});
