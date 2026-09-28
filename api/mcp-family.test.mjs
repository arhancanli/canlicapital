// The hosted fundamentals and research endpoints, exercised over real HTTP the way a URL-only client
// (claude.ai connectors, ChatGPT) meets them: initialize, tools/list, a real tool call, and the
// stateless rules. Only the files the servers read are served from fixtures.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createSession as fundamentalsSession } from "../mcp-fundamentals/src/server.mjs";
import { createSession as researchSession } from "../mcp-research/src/server.mjs";
import { fakeFetch, files } from "../mcp-fundamentals/test/fixture.mjs";
import { createFundamentalsHandler } from "./mcp-fundamentals.js";
import { createResearchHandler } from "./mcp-research.js";

const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } };

async function withHandler(handler, path, fn) {
  const server = createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}${path}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function rpc(url, method, params, init = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Protocol-Version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    ...init,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

const fundamentals = () => createFundamentalsHandler({ session: fundamentalsSession({ base: "https://example.test", fetchImpl: fakeFetch(files()).impl, cacheDir: "" }) });

const INDEX = {
  count: 1,
  topics: [{ slug: "equities", label: "Equities", count: 1, blurb: "Equity strategies." }],
  papers: [{ slug: "momentum-test", title: "A momentum test", description: "Momentum on US equities.", path: "/research/momentum-test", publication_year: 2026 }],
};
const researchFetch = async (url) => {
  const path = new URL(url).pathname;
  if (path === "/research-index.json") return new Response(JSON.stringify(INDEX), { status: 200 });
  return new Response("not found", { status: 404 });
};
const research = () => createResearchHandler({ session: researchSession({ base: "https://example.test", fetchImpl: researchFetch }) });

test("the hosted fundamentals server introduces itself and answers a point-in-time call", async () => {
  await withHandler(fundamentals(), "/mcp/fundamentals", async (url) => {
    const init = await rpc(url, "initialize", INIT);
    assert.equal(init.status, 200);
    assert.equal(init.json.result.serverInfo.name, "canli-fundamentals-mcp");
    assert.equal(init.json.result.serverInfo.title, "Canli Fundamentals");
    assert.match(init.json.result.instructions, /call known_as_of/);
    assert.equal(init.headers.get("x-robots-tag"), "noindex");
    const list = await rpc(url, "tools/list", {});
    assert.deepEqual(list.json.result.tools.map((t) => t.name).sort(), ["cross_section", "find_company", "history", "known_as_of", "list_concepts", "restatements", "vintages"]);
    const call = await rpc(url, "tools/call", { name: "known_as_of", arguments: { company: "FIX", as_of: "2019-12-31", concepts: ["revenue"] } });
    const out = call.json.result.structuredContent;
    assert.deepEqual(out.rows[0].slice(0, 5), ["revenue", "SalesRevenueNet", "2019-09-30", "2018-10-01", 100]);
    const byName = await rpc(url, "tools/call", { name: "known_as_of", arguments: { company: "Fixture Corp", as_of: "2019-12-31", concepts: ["revenue"] } });
    assert.deepEqual(byName.json.result.structuredContent.company.matched, { query: "Fixture Corp", by: "name" });
    const found = await rpc(url, "tools/call", { name: "find_company", arguments: { query: "xom" } });
    assert.equal(found.json.result.structuredContent.resolved.name, "Exxon Mobil Corporation");
  });
});

test("the hosted research server lists its tools and searches the record", async () => {
  await withHandler(research(), "/mcp/research", async (url) => {
    const init = await rpc(url, "initialize", INIT);
    assert.equal(init.json.result.serverInfo.name, "canli-research-mcp");
    assert.equal(init.json.result.serverInfo.title, "Canli Research");
    assert.match(init.json.result.instructions, /search_research/);
    const list = await rpc(url, "tools/list", {});
    assert.equal(list.json.result.tools.length, 6);
    const call = await rpc(url, "tools/call", { name: "search_research", arguments: { query: "momentum" } });
    assert.equal(call.json.result.structuredContent.rows[0][0], "momentum-test");
    const missing = await rpc(url, "tools/call", { name: "get_paper", arguments: { slug: "no-such-paper" } });
    assert.equal(missing.json.result.isError, true);
    assert.match(missing.json.result.content[0].text, /search_research or list_topics returns the slugs/);
  });
});

test("both endpoints are stateless POST endpoints with CORS for browser clients", async () => {
  for (const [handler, path] of [[fundamentals(), "/mcp/fundamentals"], [research(), "/mcp/research"]]) {
    await withHandler(handler, path, async (url) => {
      const get = await fetch(url);
      assert.equal(get.status, 405, path);
      assert.equal(get.headers.get("allow"), "POST, OPTIONS");
      const options = await fetch(url, { method: "OPTIONS" });
      assert.equal(options.status, 204);
      assert.equal(options.headers.get("access-control-allow-origin"), "*");
      const big = await rpc(url, "tools/call", { name: "history", arguments: { company: "x".repeat(70_000) } });
      assert.equal(big.status, 413, "read-only calls are small; a 64 KiB body cap applies");
    });
  }
});
