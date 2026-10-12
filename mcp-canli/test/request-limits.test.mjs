import assert from "node:assert/strict";
import test from "node:test";
import { registerAll } from "../src/server.mjs";

function handlers() {
  const h = {};
  registerAll({ registerTool: (name, _config, fn) => { h[name] = fn; }, registerResource: () => {}, registerPrompt: () => {} }, ["quant"]);
  return h;
}
const call = () => ({ name: "max_drawdown", arguments: { prices: [100, 110, 105] } });

test("wrapped requests retain the 25-call limit and execute nothing when refused", async () => {
  const h = handlers();
  const r = await h.run_tool({ name: "run_tool", arguments: { calls: Array.from({ length: 26 }, call) } });
  assert.equal(r.isError, true, "wrapping cannot enlarge a batch");
  const ref = await h.run_tool({ name: "show_result", arguments: { ref: "r1" } });
  assert.equal(ref.isError, true, "no refused call was executed or kept");
});

test("flattened batches retain the total call limit", async () => {
  const r = await handlers().run_tool({ calls: Array.from({ length: 2 }, () => ({ name: "run_tool", arguments: { calls: Array.from({ length: 13 }, call) } })) });
  assert.equal(r.isError, true);
});

test("wrapped and lifted options must satisfy the advertised schema", async () => {
  for (const options of [{ digits: 0 }, { digits: 11 }, { select: [] }, { receipt: "yes" }]) {
    const wrapped = await handlers().run_tool({ name: "run_tool", arguments: { ...call(), ...options } });
    assert.equal(wrapped.isError, true, JSON.stringify(options));
    const lifted = await handlers().run_tool({ name: "max_drawdown", arguments: { prices: [100, 110, 105], ...options } });
    assert.equal(lifted.isError, true, JSON.stringify(options));
  }
});

test("valid wrapped calls and the exact batch limit still work", async () => {
  const h = handlers();
  const single = await h.run_tool({ name: "run_tool", arguments: { ...call(), digits: 4 } });
  assert.ok(!single.isError, single.content[0].text);
  const batch = await h.run_tool({ name: "run_tool", arguments: { calls: Array.from({ length: 25 }, call) } });
  assert.ok(!batch.isError, batch.content[0].text);
  assert.equal(batch.structuredContent.results.length, 25);
});
