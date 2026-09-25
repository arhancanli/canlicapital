// The hosted MCP endpoint, exercised over real HTTP: a local server runs the handler and the tests
// speak MCP Streamable HTTP to it. Only the outbound call to the validation API is stubbed, so the
// tests can see which key each request ran under.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createHostedHandler, resolveKey } from "./mcp.js";

const CALLER_KEY = "canli_callerkey_0123456789abcdefghij";
const SHARED_KEY = "canli_sharedkey_0123456789abcdefghij";

function stubApi() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), authorization: init?.headers?.Authorization });
    return new Response(JSON.stringify({ data: { ok: true }, error: null, limits: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

async function withServer(env, fn) {
  const api = stubApi();
  const handler = createHostedHandler({ env: () => env, fetchImpl: api.fetchImpl });
  const server = createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  try {
    return await fn(url, api);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function rpc(url, method, params, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Protocol-Version": "2025-06-18",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: text ? JSON.parse(text) : null };
}

const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } };

test("initialize answers with the package's own server name and version", async () => {
  await withServer({ CANLI_REMOTE_MCP_KEY: SHARED_KEY }, async (url) => {
    const { status, json, headers } = await rpc(url, "initialize", INIT);
    assert.equal(status, 200);
    assert.equal(json.result.serverInfo.name, "canlicapital-validation-mcp");
    assert.match(json.result.serverInfo.version, /^\d+\.\d+\.\d+$/);
    assert.equal(headers.get("x-robots-tag"), "noindex");
    assert.equal(headers.get("mcp-session-id"), null, "stateless: no session id");
  });
});

test("tools/list exposes exactly the npm package's tools", async () => {
  await withServer({ CANLI_REMOTE_MCP_KEY: SHARED_KEY }, async (url) => {
    const { json } = await rpc(url, "tools/list", {});
    assert.deepEqual(json.result.tools.map((t) => t.name).sort(), [
      "company_financial_history",
      "get_key",
      "get_receipt",
      "service_status",
      "validate_breadth",
      "validate_deflated_sharpe",
      "validate_overfitting",
      "validate_paper_evidence",
    ]);
  });
});

test("without a caller key a validation runs under the shared key", async () => {
  await withServer({ CANLI_REMOTE_MCP_KEY: SHARED_KEY }, async (url, api) => {
    const { json } = await rpc(url, "tools/call", { name: "service_status", arguments: {} });
    assert.ok(json.result, JSON.stringify(json));
    assert.ok(api.calls.length >= 1);
    assert.ok(api.calls.every((c) => c.authorization === `Bearer ${SHARED_KEY}`));
  });
});

test("a caller key replaces the shared key and is never echoed back", async () => {
  await withServer({ CANLI_REMOTE_MCP_KEY: SHARED_KEY }, async (url, api) => {
    const { json, text } = await rpc(
      url,
      "tools/call",
      { name: "service_status", arguments: {} },
      { Authorization: `Bearer ${CALLER_KEY}` },
    );
    assert.ok(json.result);
    assert.ok(api.calls.every((c) => c.authorization === `Bearer ${CALLER_KEY}`));
    assert.ok(!text.includes(CALLER_KEY), "the caller's key must not appear in the response");
  });
});

test("get_key on the hosted endpoint says which key is in use and issues nothing", async () => {
  await withServer({ CANLI_REMOTE_MCP_KEY: SHARED_KEY }, async (url, api) => {
    const shared = await rpc(url, "tools/call", { name: "get_key", arguments: {} });
    assert.match(shared.text, /shared anonymous key/);
    assert.equal(api.calls.length, 0, "no key is issued from the platform's shared address");
    assert.ok(!shared.text.includes(SHARED_KEY), "the shared key must not be revealed");
  });
  await withServer({}, async (url) => {
    const none = await rpc(url, "tools/call", { name: "get_key", arguments: {} });
    assert.match(none.text, /no shared key configured/);
  });
});

test("a malformed Authorization header is refused, not downgraded to the shared key", async () => {
  await withServer({ CANLI_REMOTE_MCP_KEY: SHARED_KEY }, async (url, api) => {
    const { status } = await rpc(url, "tools/list", {}, { Authorization: "Basic abc" });
    assert.equal(status, 401);
    assert.equal(api.calls.length, 0);
  });
  assert.equal(resolveKey({ headers: { authorization: "Bearer short" } }, {}).error !== undefined, true);
});

test("GET is refused: the endpoint is stateless and has no server stream", async () => {
  await withServer({ CANLI_REMOTE_MCP_KEY: SHARED_KEY }, async (url) => {
    const res = await fetch(url, { method: "GET" });
    assert.equal(res.status, 405);
    assert.match(res.headers.get("allow"), /POST/);
  });
});
