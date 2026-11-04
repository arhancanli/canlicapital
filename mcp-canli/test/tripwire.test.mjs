// The network tripwire: inside a pack that sends nothing, fetch is refused and counted; outside, it works; a
// plugin that says it sends nothing and fetches anyway is refused; and an answer whose every call ran where
// fetch is refused says network "none" in its receipt.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { RECEIPT_KEY } from "../src/server.mjs";
import { installTripwire, withoutNetwork } from "../src/tripwire.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("fetch is refused inside the scope and works outside it", async () => {
  installTripwire();
  await assert.rejects(withoutNetwork("sharpe_ratio", "quant", () => fetch("data:text/plain,hi")), /sharpe_ratio is in quant, a pack that sends nothing, and tried to reach the network; refused/);
  assert.equal(await (await fetch("data:text/plain,hi")).text(), "hi");
  // Work started inside the scope stays inside it.
  await assert.rejects(withoutNetwork("t", "quant", async () => { await new Promise((r) => setTimeout(r, 5)); return fetch("data:,x"); }), /refused/);
});

test("over stdio: a quiet plugin that fetches is refused, and receipts say when an answer reached no network", async () => {
  const c = new Client({ name: "tripwire-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(HERE, "../src/server.mjs")], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_PLUGINS: path.join(HERE, "fixtures/quiet-plugin.mjs") } }));
  try {
    const call = (name, args) => c.callTool({ name: "run_tool", arguments: { name, arguments: args } });
    const refused = await call("quiet_fetch", {});
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /quiet_fetch is in quiet, a pack that sends nothing, and tried to reach the network; refused/);
    const quant = await call("sharpe_ratio", { returns: Array.from({ length: 60 }, (_, i) => 0.001 * Math.sin(i)) });
    assert.match(quant._meta[RECEIPT_KEY].network, /^none/);
    assert.equal((await call("holdout_status", {}))._meta[RECEIPT_KEY].network, undefined, "only answers whose every call ran where fetch is refused say so");
  } finally {
    await c.close();
  }
});
