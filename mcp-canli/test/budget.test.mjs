// Answer budgets, the cost meter and receipts: a result shortened step by step until its JSON fits max_chars, kept
// whole under its ref; only the shape when nothing else fits; every answer's cost and receipt in _meta, which the
// model does not read; and the sources a receipt lists, from the markets pack's evidence and a fundamentals snapshot.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { COST_KEY, RECEIPT_KEY, fit, sourcesOf } from "../src/server.mjs";

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
    // Every answer's receipt: the same question gives the same hashes, and nothing of it is in the model's text.
    const [r1, r2] = [whole._meta?.[RECEIPT_KEY], (await call({}))._meta?.[RECEIPT_KEY]];
    assert.match(r1.server, /^canli-mcp@\d+\.\d+\.\d+/);
    assert.match(r1.input_sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual([r1.input_sha256, r1.output_sha256], [r2.input_sha256, r2.output_sha256]);
    assert.deepEqual(r1.sources, [], "find_tool reads no documents");
    assert.ok(!Number.isNaN(Date.parse(r1.at)));
    assert.equal(whole.content[0].text.includes(RECEIPT_KEY), false);
  } finally {
    await c.close();
  }
});

test("a receipt lists the documents behind the results: the markets pack's evidence and a fundamentals snapshot, each once", () => {
  const evidence = { columns: ["url", "sha256_16", "retrieved_at"], rows: [["https://www.sec.gov/a.htm", "0123456789abcdef", "2026-11-04T06:00:00.000Z"], ["https://www.sec.gov/a.htm", "0123456789abcdef", "2026-11-04T06:00:00.000Z"]] };
  const snapshot = { url: "https://canlicapital.com/company-data/sources/aa.json.gz", sha256: "a".repeat(64), fetched_at: "2026-09-19T09:30:25.021Z" };
  assert.deepEqual(sourcesOf([{ evidence }, { snapshot }, null, "text", [1, 2]]), [
    { url: "https://www.sec.gov/a.htm", sha256_16: "0123456789abcdef", retrieved_at: "2026-11-04T06:00:00.000Z" },
    { url: "https://canlicapital.com/company-data/sources/aa.json.gz", sha256: "a".repeat(64), retrieved_at: "2026-09-19T09:30:25.021Z" },
  ]);
});

test("receipt chains: an answer built from kept results carries their receipts, two levels written out and then their hashes", async () => {
  const c = new Client({ name: "chain-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const call = async (name, args) => { const r = await c.callTool({ name: "run_tool", arguments: { name, arguments: args } }); assert.notEqual(r.isError, true, r.content?.[0]?.text); return { ref: JSON.parse(r.content[0].text).ref, receipt: r._meta[RECEIPT_KEY] }; };
    const returns = Array.from({ length: 300 }, (_, i) => 0.001 + 0.01 * Math.sin(i * 1.7));
    const odds = (ref) => ({ annual_return: { $result: ref, path: ref === a.ref ? "sharpe_per_period" : "probability_ever" }, annual_volatility: 0.2, drawdown: 0.2, years: 1 });
    const a = await call("sharpe_ratio", { returns });
    assert.equal(a.receipt.from, undefined, "built from nothing kept");
    const b = await call("drawdown_probability", odds(a.ref));
    assert.deepEqual(b.receipt.from, [{ ref: a.ref, ...a.receipt }]);
    const d = await call("drawdown_probability", odds(b.ref));
    const e = await call("drawdown_probability", odds(d.ref));
    assert.equal(e.receipt.from[0].ref, d.ref);
    assert.equal(e.receipt.from[0].output_sha256, d.receipt.output_sha256);
    assert.equal(e.receipt.from[0].from[0].ref, b.ref);
    assert.deepEqual(e.receipt.from[0].from[0].from, [{ ref: a.ref, input_sha256: a.receipt.input_sha256, output_sha256: a.receipt.output_sha256, at: a.receipt.at }], "the third level is named by its hashes");
    // Reading part of a kept result carries its receipt too.
    const shown = await c.callTool({ name: "run_tool", arguments: { name: "show_result", arguments: { ref: a.ref, path: "sharpe" } } });
    assert.deepEqual(shown._meta[RECEIPT_KEY].from, [{ ref: a.ref, ...a.receipt }]);
  } finally {
    await c.close();
  }
});
