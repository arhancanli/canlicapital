// Over stdio: four tools with honest annotations, and without paper keys every call is a tool error
// that says how to set them, never a crash or a request.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("four tools; only send is destructive; missing keys are a clear tool error", async (t) => {
  const env = { ...process.env, CANLI_HOME: "/nonexistent-canli-home" };
  delete env.ALPACA_PAPER_KEY_ID; delete env.ALPACA_PAPER_SECRET_KEY;
  const c = new Client({ name: "t", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env }));
  t.after(() => c.close());
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((x) => x.name), ["paper_account", "preview_paper_orders", "rebalance_to_weights", "send_paper_orders"]);
  for (const x of tools) assert.equal(x.annotations.destructiveHint, x.name === "send_paper_orders", x.name);
  const r = await c.callTool({ name: "paper_account", arguments: {} });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /ALPACA_PAPER_KEY_ID/);
});
