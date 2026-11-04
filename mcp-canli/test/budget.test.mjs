// Answer budgets and the cost meter: a result shortened step by step until its JSON fits max_chars, kept whole
// under its ref; only the shape when nothing else fits; and every answer's cost in _meta, which the model does not
// read, with the characters it does read.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { COST_KEY, fit } from "../src/server.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("fit shortens a result step by step until its JSON is within the budget, and names the ref", () => {
  const big = { rows: Array.from({ length: 500 }, (_, i) => ({ i, text: "x".repeat(50) })), note: "y".repeat(3000), n: 7 };
  for (const budget of [200000, 20000, 5000, 2000, 1000]) {
    const out = fit(big, "r1", budget);
    assert.ok(JSON.stringify(out).length <= budget, `${budget}: ${JSON.stringify(out).length}`);
    if (budget < 40000) assert.match(out.preview_only.note, /r1/);
  }
  assert.deepEqual(fit({ a: 1, b: [1, 2] }, "r1", 1000), { a: 1, b: [1, 2] }, "a result within the budget is untouched");
  // A result with too many fields to shorten into the budget comes back as its shape.
  const wide = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`field_${i}`, i]));
  const shape = fit(wide, null, 1000);
  assert.match(shape.preview_only.note, /Only the shape fits max_chars 1000\. Call again with select/);
});

test("over stdio, max_chars holds a result to its budget, and every answer reports its cost in _meta", async () => {
  const c = new Client({ name: "budget-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const call = (extra) => c.callTool({ name: "run_tool", arguments: { name: "find_tool", arguments: { query: "sharpe ratio volatility drawdown", limit: 50 }, ...extra } });
    const whole = await call({});
    const capped = await call({ max_chars: 1000 });
    assert.ok(whole.content[0].text.length > 1000, `the whole answer is ${whole.content[0].text.length} characters`);
    assert.ok(capped.content[0].text.length <= 1000, `${capped.content[0].text.length} characters`);
    const cost = capped._meta?.[COST_KEY];
    assert.ok(Number.isInteger(cost.ms) && cost.ms >= 0 && Number.isInteger(cost.cpu_ms));
    assert.equal(cost.chars, capped.content[0].text.length, "the characters the model reads");
    assert.equal(capped.content[0].text.includes(COST_KEY), false, "the cost is not in what the model reads");
  } finally {
    await c.close();
  }
});
