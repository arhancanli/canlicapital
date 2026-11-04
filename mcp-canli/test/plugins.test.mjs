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

test("identical calls in flight share one run, and each caller gets its own copy", async (t) => {
  const c = await connect(t, { CANLI_PLUGINS: path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/count-plugin.mjs") });
  const batch = async (calls) => JSON.parse((await c.callTool({ name: "run_tool", arguments: { calls } })).content[0].text).results.map((r) => r.result);
  const same = await batch([{ name: "counter_slow", arguments: { label: "a" } }, { name: "counter_slow", arguments: { label: "a" } }, { name: "counter_slow", arguments: { label: "b" } }]);
  assert.deepEqual(same.map((r) => [r.label, r.runs]), [["a", 1], ["a", 1], ["b", 2]], "the two identical calls ran once");
  const later = await batch([{ name: "counter_slow", arguments: { label: "a" } }]);
  assert.equal(later[0].runs, 3, "a call after the first finished runs again");
});

test("a batch reports progress as its calls finish, and a cancelled chain starts no further call", async (t) => {
  const c = await connect(t, { CANLI_PLUGINS: path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/count-plugin.mjs") });
  const seen = [];
  // The calls finish apart, so each report goes out on its own. The client applies a result at once and a report a
  // tick later (the SDK's order), so the last report, sent just before the result, can come too late to count.
  await c.callTool({ name: "run_tool", arguments: { calls: [0, 200, 400].map((ms, i) => ({ name: "counter_slow", arguments: { label: "pqr"[i], ms } })) } }, { onprogress: (p) => seen.push([p.progress, p.total]) });
  assert.deepEqual(seen.slice(0, 2), [[1, 3], [2, 3]]);
  assert.ok(seen.length === 2 || String(seen[2]) === "3,3", JSON.stringify(seen));
  // A chain, each call reading the one before: cancelled while the second runs, the third never starts.
  const stop = new AbortController();
  const calls = [{ name: "counter_slow", arguments: { label: "a" } }, { name: "counter_slow", arguments: { label: { $result: 0, path: "label" } } }, { name: "counter_slow", arguments: { label: { $result: 1, path: "label" } } }];
  setTimeout(() => stop.abort(), 75);
  await assert.rejects(c.callTool({ name: "run_tool", arguments: { calls } }, { signal: stop.signal }));
  await new Promise((r) => setTimeout(r, 150));
  const after = JSON.parse((await c.callTool({ name: "run_tool", arguments: { name: "counter_slow", arguments: { label: "z" } } })).content[0].text);
  assert.ok(after.runs <= 3 + 3, `the third call of the cancelled batch did not run: 3 earlier runs, at most two of the batch, and this one, not ${after.runs}`);
});

test("a batch runs in waves: calls that read no other call start at once, a call reading two waits for both", async (t) => {
  const c = await connect(t, { CANLI_PLUGINS: path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/count-plugin.mjs") });
  const calls = [
    { name: "counter_slow", arguments: { label: "a" } },
    { name: "counter_slow", arguments: { label: "b" } },
    { name: "counter_slow", arguments: { label: { $result: 0, path: "label" } } },
    { name: "counter_slow", arguments: { label: "c" } },
  ];
  const out = JSON.parse((await c.callTool({ name: "run_tool", arguments: { calls } })).content[0].text).results;
  assert.deepEqual(out.map((r) => r.result.label), ["a", "b", "a", "c"], "the batch's order kept");
  // a, b and c run together, then the call reading a: two waves, not four calls in a row.
  assert.equal(Math.max(...[0, 1, 3].map((i) => out[i].result.alongside)), 3, JSON.stringify(out.map((r) => r.result)));
  assert.equal(out[2].result.alongside, 1, "the call reading a ran after its wave");
  const failed = JSON.parse((await c.callTool({ name: "run_tool", arguments: { calls: [{ name: "counter_slow", arguments: { label: "x".repeat(30) } }, { name: "counter_slow", arguments: { label: { $result: 0, path: "label" } } }, { name: "counter_slow", arguments: { label: { $result: 3, path: "label" } } }] } })).content[0].text).results;
  assert.match(failed[1].error, /\$result 0 failed/);
  assert.match(failed[2].error, /\$result 3 refers to a call that has not run/);
});
