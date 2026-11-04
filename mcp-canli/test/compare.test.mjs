// compare_answers and rerun_answer: two kept answers compared as changes_only compares them, and a kept answer's
// call run again now, said to be the same or what changed, the new answer kept under its own ref.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("a kept answer run again is the same; two answers compare by what changed", async () => {
  const c = new Client({ name: "compare-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const call = async (name, args) => { const r = await c.callTool({ name: "run_tool", arguments: { name, arguments: args } }); return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text); };
    const returns = Array.from({ length: 120 }, (_, i) => 0.002 * Math.sin(i / 3));
    const a = await call("sharpe_ratio", { returns });
    const again = await call("rerun_answer", { ref: a.ref });
    assert.equal(again.same, true);
    assert.match(again.new_ref, /^r\d+$/);
    assert.equal((await call("compare_answers", { before: a.ref, after: again.new_ref })).same_question, true);
    const b = await call("sharpe_ratio", { returns: returns.map((x) => x + 0.001) });
    const cmp = await call("compare_answers", { before: a.ref, after: b.ref });
    assert.equal(cmp.same_question, false);
    assert.ok(cmp.changed.sharpe && "from" in cmp.changed.sharpe, JSON.stringify(cmp).slice(0, 300));
    assert.match((await call("rerun_answer", { ref: "r999" })).error, /not kept/);
  } finally {
    await c.close();
  }
});
