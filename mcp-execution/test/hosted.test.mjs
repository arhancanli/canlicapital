// The hosted build: exactly one tool, no account or positions accepted, and an import graph that
// cannot reach anything but the check and its pure cores (no broker, journal or file code).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";

import { HOSTED_INSTRUCTIONS, registerHostedTools, SERVER_INFO } from "../src/hosted.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Every module a file reaches: relative files followed, bare and node: specifiers collected. */
export function importGraph(entry) {
  const files = new Set();
  const external = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (files.has(file)) continue;
    files.add(file);
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec);
        assert.ok(existsSync(target), `${relative(ROOT, file)} imports a missing ${spec}`);
        queue.push(target);
      } else external.add(spec);
    }
  }
  return { files: [...files].map((f) => relative(ROOT, f)).sort(), external: [...external].sort() };
}

test("hosted.mjs reaches only the check, the server identity and the pure cores", () => {
  const graph = importGraph(resolve(ROOT, "src/hosted.mjs"));
  assert.deepEqual(graph.files, [
    "src/check-orders.mjs",
    "src/core/js/exec-cost-core.js",
    "src/core/js/pretrade-core.js",
    "src/core/scripts/canonical-json.mjs",
    "src/hosted.mjs",
    "src/info.mjs",
  ]);
  assert.deepEqual(graph.external, ["node:crypto", "node:fs", "zod"], "node:fs only reads the package's own version");
});

test("the walk itself finds what it should: the local server reaches the stdio transport", () => {
  const graph = importGraph(resolve(ROOT, "src/server.mjs"));
  assert.ok(graph.external.includes("@modelcontextprotocol/server/stdio"));
  assert.ok(graph.files.includes("src/check-orders.mjs"));
});

async function hostedClient(now) {
  const server = new McpServer(SERVER_INFO, { instructions: HOSTED_INSTRUCTIONS });
  registerHostedTools(server, { now });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "hosted-test", version: "1" });
  await client.connect(b);
  return client;
}

test("a client lists exactly check_orders on the hosted build, and the account fields are refused", async () => {
  const client = await hostedClient(() => new Date("2026-09-28T14:30:00Z"));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name), ["check_orders"]);
    assert.ok(!("account" in tools[0].inputSchema.properties), "the hosted schema shows no account");
    const args = { asset_class: "us_equity", orders: [{ symbol: "AAPL", side: "buy", qty: 100 }], market: { AAPL: { price: 100, adv_usd: 5e9, daily_vol: 0.015 } }, limits: { max_order_notional: 5000 } };
    const ok = await client.callTool({ name: "check_orders", arguments: args });
    assert.notEqual(ok.isError, true, JSON.stringify(ok.content));
    assert.deepEqual(ok.structuredContent.rows[0][4], ["order_notional_cap"]);
    assert.equal(ok.structuredContent.kill_switch, undefined, "hosted has no kill switch file to report");
    assert.ok(!ok.structuredContent.checks_applied.includes("kill_switch"));
    assert.equal(ok.structuredContent.as_of, "2026-09-28T14:30:00.000Z");
    const refused = await client.callTool({ name: "check_orders", arguments: { ...args, account: { equity: 1e5, positions: {} } } });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /hosted server takes no account or positions; run canli-execution-mcp locally/);
    const { toolHostedCheckOrders } = await import("../src/hosted.mjs");
    await assert.rejects(toolHostedCheckOrders({ ...args, account: { equity: 1e5, positions: {} } }), /takes no account/, "the handler refuses it too, called directly");
  } finally {
    await client.close();
  }
});

// The lean schema clients see and the strict one that validates must name the same fields at every
// level, or a model would be shown a field the server refuses (or never shown one it accepts).
function shape(schema) {
  if (!schema || typeof schema !== "object") return null;
  const out = {};
  if (schema.properties) out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, shape(v)]));
  if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) out.items = shape(schema.items);
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") out.additionalProperties = shape(schema.additionalProperties);
  if (schema.enum) out.enum = [...schema.enum].sort();
  if (schema.required) out.required = [...schema.required].sort();
  return out;
}

test("the published schemas name exactly the fields, enums and required keys the validators accept", async () => {
  const { z } = await import("zod");
  const m = await import("../src/check-orders.mjs");
  const strip = (s) => {
    // The strict book levels are [price, qty] tuples; the lean schema shows them as arrays.
    const json = z.toJSONSchema(s, { io: "input" });
    const book = json.properties.market.additionalProperties.properties.book;
    for (const side of ["bids", "asks"]) delete book.properties[side].items;
    delete json.properties.account?.not;
    return json;
  };
  assert.deepEqual(shape(m.CHECK_ORDERS_JSON), shape(strip(m.checkOrdersInput)));
  const hosted = strip(m.hostedCheckOrdersInput);
  delete hosted.properties.account;
  assert.deepEqual(shape(m.HOSTED_CHECK_ORDERS_JSON), shape(hosted));
});

test("the tool list stays small: what a model reads each turn, in characters", async () => {
  const { CHECK_ORDERS_DESCRIPTION, CHECK_ORDERS_JSON, HOSTED_CHECK_ORDERS_DESCRIPTION, HOSTED_CHECK_ORDERS_JSON } = await import("../src/check-orders.mjs");
  const size = (d, s) => d.length + JSON.stringify(s).length;
  // Measured 2026-09-28 with scripts/bench/mcp-tool-tokens.py: 697 o200k local, 654 hosted.
  assert.ok(size(CHECK_ORDERS_DESCRIPTION, CHECK_ORDERS_JSON) < 2800, `${size(CHECK_ORDERS_DESCRIPTION, CHECK_ORDERS_JSON)} characters`);
  assert.ok(size(HOSTED_CHECK_ORDERS_DESCRIPTION, HOSTED_CHECK_ORDERS_JSON) < 2650, `${size(HOSTED_CHECK_ORDERS_DESCRIPTION, HOSTED_CHECK_ORDERS_JSON)} characters`);
});
