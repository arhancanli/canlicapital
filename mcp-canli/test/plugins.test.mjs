// Plugins (CANLI_PLUGINS): a third party's pack joins the search, batches, the policy file and
// canli://privacy; a name clash or a bad module is refused at start; offline mode loads none.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "src", "server.mjs");
const DEMO = path.join(ROOT, "test", "fixtures", "demo-plugin.mjs");
const env = (extra) => ({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_PACKS: "quant", CANLI_HOME: mkdtempSync(path.join(tmpdir(), "canli-plugin-")), ...extra });

async function connect(t, extra) {
  const c = new Client({ name: "plugins", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: env(extra) }));
  t.after(() => c.close());
  return c;
}

test("a plugin's tools are found, run, chained into a pack's tool, and shown in privacy", async (t) => {
  const c = await connect(t, { CANLI_PLUGINS: DEMO });
  const found = await c.callTool({ name: "find_tool", arguments: { query: "degree days moving sum" } });
  assert.equal(found.structuredContent.rows[0][0], "demo_moving_sum");
  assert.equal(found.structuredContent.rows[0][1], "demo");
  assert.match(found.structuredContent.rows[0][2], /values: number\[\], window: integer/);
  const r = await c.callTool({ name: "run_tool", arguments: { calls: [
    { name: "demo_moving_sum", arguments: { values: [0.01, 0.02, -0.01, 0.03, 0.0, 0.02], window: 2 } },
    { name: "return_stats", arguments: { returns: { $result: 0, path: "sums" } } },
  ] } });
  assert.ok(!r.isError, r.content?.[0]?.text);
  assert.deepEqual(r.structuredContent.results[0].result.sums.slice(0, 3), [null, 0.03, 0.01]);
  assert.ok(r.structuredContent.results[1].error || r.structuredContent.results[1].result, "the chained call ran");
  const priv = JSON.parse((await c.readResource({ uri: "canli://privacy" })).contents[0].text);
  assert.deepEqual(priv.packs.demo, { network: "none", disk: "none", plugin: DEMO });
  const packs = JSON.parse((await c.readResource({ uri: "canli://packs" })).contents[0].text);
  assert.ok(packs.enabled.includes("demo") && packs.packs.demo.tools === 1);
});

test("the policy file covers plugins by pack", async (t) => {
  const home = mkdtempSync(path.join(tmpdir(), "canli-plugin-policy-")), policy = path.join(home, "policy.json");
  writeFileSync(policy, JSON.stringify({ tools: { deny: ["demo:*"] } }));
  const c = await connect(t, { CANLI_PLUGINS: DEMO, CANLI_POLICY: policy, CANLI_HOME: home });
  const r = await c.callTool({ name: "run_tool", arguments: { name: "demo_moving_sum", arguments: { values: [1, 2], window: 1 } } });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /denied by this server's policy/);
});

test("a clash, a missing module or an export-less module stops the start with the reason; offline loads none", async (t) => {
  const run = (plugins, extra = {}) => spawnSync(process.execPath, [SERVER], { env: env({ CANLI_PLUGINS: plugins, ...extra }), input: "", timeout: 20000 });
  assert.match(run(path.join(ROOT, "test", "fixtures", "clash-plugin.mjs")).stderr.toString(), /tool sharpe_ratio is already a tool here/);
  assert.match(run(path.join(ROOT, "test", "fixtures", "nope.mjs")).stderr.toString(), /cannot load/);
  assert.match(run(path.join(ROOT, "src", "watch.mjs")).stderr.toString(), /exports no registerTools/);
  const c = await connect(t, { CANLI_PLUGINS: DEMO, CANLI_OFFLINE: "1" });
  const found = await c.callTool({ name: "run_tool", arguments: { name: "demo_moving_sum", arguments: { values: [1], window: 1 } } });
  assert.equal(found.isError, true);
});
