// Over stdio: three discovery tools, byte-stable across launches; batches with $file and $result;
// per-call errors that name the fix; order-sending tools refused inside a batch; receipts stable.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const base = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "" };
async function connect(env = {}) {
  const c = new Client({ name: "stdio-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { ...base, ...env } }));
  return c;
}
const CSV = path.join(tmpdir(), `canli-stdio-${process.pid}.csv`);
writeFileSync(CSV, `date,close,other\n${Array.from({ length: 500 }, (_, i) => `d${i},${(100 * Math.exp(0.0006 * i + 0.03 * Math.sin(i / 9))).toFixed(4)},${i}`).join("\n")}\n`);

test("three small tools, byte-identical across launches", async () => {
  const lists = [];
  for (let i = 0; i < 2; i++) { const c = await connect(); lists.push(JSON.stringify(await c.listTools())); await c.close(); }
  assert.equal(lists[0], lists[1]);
  const tools = JSON.parse(lists[0]).tools;
  assert.deepEqual(tools.map((t) => t.name), ["find_tool", "describe_tool", "run_tool"]);
  assert.ok(lists[0].length < 4500, `${lists[0].length} bytes`);
});

test("find, describe and run across packs; a batch with $file, $result, return last and digits", async (t) => {
  const c = await connect(); t.after(() => c.close());
  const f = await c.callTool({ name: "find_tool", arguments: { query: "triple barrier labels" } });
  assert.equal(f.structuredContent.rows[0][0], "triple_barrier_labels");
  const d = await c.callTool({ name: "describe_tool", arguments: { name: "validate_haircut_sharpe" } });
  assert.equal(d.structuredContent.pack, "validation");
  assert.ok(d.structuredContent.input_schema.properties);
  const one = await c.callTool({ name: "run_tool", arguments: { name: "max_drawdown", arguments: { prices: { $file: CSV, column: "close" } } } });
  assert.ok(!one.isError, one.content[0].text);
  assert.deepEqual(one.structuredContent.files_read, [{ path: CSV, values: 500 }]);
  const batch = await c.callTool({ name: "run_tool", arguments: { calls: [
    { name: "triple_barrier_labels", arguments: { prices: { $file: CSV, column: "close" } } },
    { name: "sample_weights", arguments: { prices: { $file: CSV, column: "close" }, spans: { $result: 0, path: "rows", pick: [0, 1] } } },
  ], return: "last", digits: 4 } });
  assert.ok(!batch.isError, batch.content[0].text);
  assert.equal(batch.structuredContent.results.length, 1);
  const w = batch.structuredContent.results[0].result;
  assert.ok(w.labels > 100);
  assert.ok(String(w.mean_uniqueness).replace(/^0\./, "").length <= 4);
});

test("find_tool rows carry argument signatures; select returns only the named fields", async (t) => {
  const c = await connect(); t.after(() => c.close());
  const f = await c.callTool({ name: "find_tool", arguments: { query: "sortino ratio" } });
  assert.deepEqual(f.structuredContent.columns, ["name", "pack", "args", "description"]);
  assert.match(f.structuredContent.rows[0][2], /returns\?: number\[\]/);
  const r = await c.callTool({ name: "run_tool", arguments: { name: "max_drawdown", arguments: { prices: { $file: CSV, column: "close" } }, select: ["max_drawdown", "nope"] } });
  assert.deepEqual(Object.keys(r.structuredContent).filter((k) => k !== "files_read"), ["max_drawdown", "nope", "available_fields"]);
  assert.equal(r.structuredContent.nope, null);
  assert.ok(r.structuredContent.available_fields.includes("max_drawdown"));
  const lifted = await c.callTool({ name: "run_tool", arguments: { name: "max_drawdown", arguments: { prices: { $file: CSV, column: "close" }, select: ["max_drawdown"], digits: 3 } } });
  assert.ok(!lifted.isError, lifted.content[0].text);
  assert.deepEqual(Object.keys(lifted.structuredContent).filter((k) => k !== "files_read"), ["max_drawdown"]);
  const listCol = await c.callTool({ name: "run_tool", arguments: { name: "correlation_matrix", arguments: { returns: { $file: CSV, column: ["close", "other"] } } } });
  assert.ok(!listCol.isError, listCol.content[0].text);
});

test("errors are per call and say what to do", async (t) => {
  const c = await connect(); t.after(() => c.close());
  const r = await c.callTool({ name: "run_tool", arguments: { calls: [{ name: "sharpe_ratio", arguments: { returns: [0.01, -0.02, 0.03] } }, { name: "sharpe_ratoi" }, { name: "sortino_ratio", arguments: { nope: 1 } }] } });
  const [a, b, e] = r.structuredContent.results;
  assert.ok(a.result);
  assert.match(b.error, /No tool sharpe_ratoi\. Closest: .*sharpe_ratio/);
  assert.match(e.error, /Arguments: .*returns\?: number\[\].*describe_tool sortino_ratio/);
  const bad = await c.callTool({ name: "run_tool", arguments: { name: "sharpe_ratio", arguments: { prices: { $file: CSV, column: "volume" } } } });
  assert.match(bad.content[0].text, /no column "volume"; columns are date, close, other/);
  const ref = await c.callTool({ name: "run_tool", arguments: { calls: [{ name: "sharpe_ratio", arguments: { returns: { $result: 1, path: "x" } } }] } });
  assert.match(ref.structuredContent.results[0].error, /refers to a call that has not run/);
});

test("order-sending tools never run inside a batch; receipts are stable", async (t) => {
  const c = await connect({ ALPACA_PAPER_KEY_ID: "PKTEST000000", ALPACA_PAPER_SECRET_KEY: "x", CANLI_HOME: tmpdir() }); t.after(() => c.close());
  const r = await c.callTool({ name: "run_tool", arguments: { calls: [{ name: "kelly_fraction", arguments: { win_probability: 0.6, payoff: 1 } }, { name: "send_paper_orders", arguments: { token: "x" } }] } });
  assert.match(r.content[0].text, /cannot run inside a batch/);
  const args = { name: "kelly_fraction", arguments: { win_probability: 0.6, payoff: 1 }, receipt: true };
  const a = await c.callTool({ name: "run_tool", arguments: args }), b = await c.callTool({ name: "run_tool", arguments: args });
  assert.deepEqual(a.structuredContent.receipt, b.structuredContent.receipt);
  assert.equal(a.structuredContent.receipt.packs.quant, "0.1.0");
});
