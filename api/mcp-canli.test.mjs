// The hosted flagship (canlicapital.com/mcp/canli), exercised over real HTTP the way a URL-only
// client meets it: the published package's three tools and result viewer, a computation, and the
// hosted rules (no files, no paper trading, no prices, nothing kept, a per-caller rate). Nothing
// here reaches the network.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createCanliHandler, createLimiter, HOSTED_NOTE, MAX_FLAGSHIP_BODY_BYTES, namesAFile } from "./mcp-canli.js";

const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } };

async function withHandler(handler, fn) {
  const server = createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/mcp/canli`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function rpc(url, method, params, { id = 1, raw } = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Protocol-Version": "2025-06-18" },
    body: raw ?? JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { status: res.status, headers: res.headers, body: await res.json() };
}
const call = (url, name, args) => rpc(url, "tools/call", { name: "run_tool", arguments: { name, arguments: args } });
const text = (r) => r.body.result.content[0].text;

test("the published flagship answers by URL: three tools, the viewer, the hosted rules in its instructions", async () => {
  await withHandler(createCanliHandler(), async (url) => {
    const init = await rpc(url, "initialize", INIT);
    assert.equal(init.status, 200);
    assert.equal(init.body.result.serverInfo.name, "canli-mcp");
    assert.ok(init.body.result.instructions.endsWith(HOSTED_NOTE));
    const tools = (await rpc(url, "tools/list", {})).body.result.tools;
    assert.deepEqual(tools.map((t) => t.name), ["find_tool", "describe_tool", "run_tool"]);
    assert.equal(tools.find((t) => t.name === "run_tool")._meta.ui.resourceUri, "ui://canli/view");
    const view = (await rpc(url, "resources/read", { uri: "ui://canli/view" })).body.result.contents[0];
    assert.equal(view.mimeType, "text/html;profile=mcp-app");
    assert.match(view.text, /^<!doctype html>/);
  });
});

test("a computation runs; paper trading and prices stay with the local server", async () => {
  await withHandler(createCanliHandler(), async (url) => {
    const stats = await call(url, "return_stats", { returns: [0.01, -0.02, 0.015, 0.003, -0.004, 0.012] });
    assert.equal(stats.body.result.isError ?? false, false, text(stats));
    assert.match(text(stats), /mean|sharpe/i);
    const paper = await call(url, "paper_account", {});
    assert.equal(paper.body.result.isError, true, "the paper pack is not served");
    const found = (await rpc(url, "tools/call", { name: "find_tool", arguments: { query: "paper trading account orders" } })).body.result;
    assert.doesNotMatch(found.content[0].text, /"pack":\s*"paper"|paper_account/);
    const price = await call(url, "price_history", { symbol: "SPY" });
    assert.equal(price.body.result.isError, true);
    assert.match(text(price), /Keyless prices are off/, "no request to Yahoo is made");
  });
});

test("a request naming a file is refused before any tool, with its own id; a body over the limit is refused", async () => {
  assert.equal(namesAFile({ name: "deflated_sharpe", arguments: { returns: { $file: "/etc/passwd", column: "x" } } }), true);
  assert.equal(namesAFile({ calls: [{ name: "a", arguments: { x: [1, 2, { $file: "a.csv" }] } }] }), true);
  assert.equal(namesAFile({ name: "a", arguments: { note: "$file" } }), false, "the words alone are not a file argument");
  await withHandler(createCanliHandler(), async (url) => {
    const r = await rpc(url, "tools/call", { name: "run_tool", arguments: { name: "return_stats", arguments: { returns: { $file: "/etc/passwd", column: "x" } } } }, { id: 7 });
    assert.equal(r.status, 200);
    assert.equal(r.body.id, 7);
    assert.equal(r.body.error.code, -32602);
    assert.match(r.body.error.message, /reads no files/);
    const big = await rpc(url, "tools/call", null, { raw: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_tool", arguments: { name: "return_stats", arguments: { returns: Array(MAX_FLAGSHIP_BODY_BYTES / 4).fill(0.001) } } } }) });
    assert.equal(big.status, 413);
  });
});

test("each caller gets a bounded number of requests a minute", async () => {
  let t = 0;
  const limiter = createLimiter({ perMinute: 2, now: () => t });
  assert.deepEqual([limiter("a"), limiter("a"), limiter("b")], [0, 0, 0]);
  assert.equal(limiter("a"), 60, "the third in a minute waits for the first to age out");
  t = 60_001;
  assert.equal(limiter("a"), 0);
  await withHandler(createCanliHandler({ limiter: createLimiter({ perMinute: 1 }) }), async (url) => {
    assert.equal((await rpc(url, "initialize", INIT)).status, 200);
    const again = await rpc(url, "tools/list", {});
    assert.equal(again.status, 429);
    assert.ok(Number(again.headers.get("retry-after")) >= 1);
    assert.match(again.body.error.message, /60 a minute/);
  });
});
