// The contributor beta MCP endpoint, exercised over real HTTP like api/mcp.test.mjs: a local server
// runs the handler and the tests speak MCP Streamable HTTP to it. The tier lookup and the outbound
// validation call are stubbed, so the tests see which key each request ran under and what reached
// the store.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { configuredToolsets, createSession, registerTools, SERVER_INFO } from "../mcp/src/server.mjs";
import { hashKey } from "./_lib/auth.js";
import { CLAIM_ISSUE_URL, KEY_LOOKUP_URL, RELEASED_MCP_URL } from "./_lib/contributor-access.js";
import { BETA_SERVER_INFO, createBetaHandler } from "./mcp-beta.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRIBUTOR_KEY = "ck_live_" + "c".repeat(43);
const STANDARD_KEY = "ck_live_" + "s".repeat(43);
const REVOKED_KEY = "ck_live_" + "r".repeat(43);
const RECORDS = new Map([
  [hashKey(CONTRIBUTOR_KEY), { label: "beta", tier: "contributor", daily_limit: 10000, granted_at: "2026-10-05T12:00:00+00:00" }],
  [hashKey(STANDARD_KEY), { label: null, tier: null, daily_limit: null, granted_at: null }],
]);
const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } };

function tierStore({ fails = false } = {}) {
  const hashes = [];
  return {
    hashes,
    readKeyTier: async (hash) => { hashes.push(hash); if (fails) throw new Error("store 500: unavailable"); return RECORDS.get(hash) ?? null; },
  };
}

function stubApi() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), authorization: init?.headers?.Authorization });
    return new Response(JSON.stringify({ data: { ok: true }, error: null, limits: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetchImpl };
}

async function withServer(fn, { store = tierStore(), env = {} } = {}) {
  const api = stubApi();
  const handler = createBetaHandler({ store, env: () => env, fetchImpl: api.fetchImpl });
  const server = createServer((req, res) => handler(req, res));
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/mcp/beta`, api, store);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

async function rpc(url, method, params, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Protocol-Version": "2025-06-18", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: text ? JSON.parse(text) : null };
}

const bearer = (key) => ({ Authorization: `Bearer ${key}` });

test("without a key, or with a malformed one, the beta endpoint is a 403 that says how to get access", async () => {
  await withServer(async (url, api, store) => {
    for (const headers of [{}, { Authorization: "Basic abc" }, { Authorization: "Bearer not-a-canli-key" }]) {
      const { status, json, headers: response } = await rpc(url, "tools/list", {}, headers);
      assert.equal(status, 403, JSON.stringify(headers));
      assert.equal(json.jsonrpc, "2.0");
      assert.equal(json.result, undefined, "nothing is served");
      assert.equal(json.error.data.reason, "no_key");
      assert.match(json.error.message, /contributor key/);
      assert.match(json.error.message, /pull request has been merged/);
      assert.ok(json.error.message.includes(KEY_LOOKUP_URL) && json.error.message.includes(CLAIM_ISSUE_URL), "the message says how to get access");
      assert.match(json.error.message, /label or its fingerprint, never the key itself/);
      assert.equal(json.error.data.released_endpoint, RELEASED_MCP_URL);
      assert.equal(response.get("x-robots-tag"), "noindex");
    }
    assert.equal(store.hashes.length, 0, "no store call without a key");
    assert.equal(api.calls.length, 0);
  });
});

test("a standard key is refused with its fingerprint, so its holder can claim access; the key is never echoed", async () => {
  await withServer(async (url, api, store) => {
    const { status, json, text } = await rpc(url, "initialize", INIT, bearer(STANDARD_KEY));
    assert.equal(status, 403);
    assert.equal(json.error.data.reason, "not_a_contributor_key");
    assert.equal(json.error.data.fingerprint, hashKey(STANDARD_KEY));
    assert.match(json.error.message, /does not have contributor access/);
    assert.ok(!text.includes(STANDARD_KEY));
    assert.deepEqual(store.hashes, [hashKey(STANDARD_KEY)], "only the key's hash reaches the store");
    assert.equal(api.calls.length, 0);
  });
});

test("an unknown or revoked key is refused, and an unavailable tier check is a 503, never a pass", async () => {
  await withServer(async (url, api) => {
    const { status, json, text } = await rpc(url, "tools/list", {}, bearer(REVOKED_KEY));
    assert.equal(status, 403);
    assert.equal(json.error.data.reason, "unknown_or_revoked_key");
    assert.equal(json.error.data.fingerprint, undefined, "no fingerprint offered for a key the store does not know");
    assert.ok(!text.includes(REVOKED_KEY));
    assert.equal(api.calls.length, 0);
  });
  await withServer(async (url, api) => {
    const { status, json, text } = await rpc(url, "tools/list", {}, bearer(CONTRIBUTOR_KEY));
    assert.equal(status, 503);
    assert.equal(json.result, undefined);
    assert.match(json.error.message, /unavailable/);
    assert.ok(!text.includes(CONTRIBUTOR_KEY) && !text.includes("store 500"));
    assert.equal(api.calls.length, 0);
  }, { store: tierStore({ fails: true }) });
});

test("a contributor key gets the unreleased server, introduced as the contributor beta", async () => {
  await withServer(async (url) => {
    const { status, json, headers } = await rpc(url, "initialize", INIT, bearer(CONTRIBUTOR_KEY));
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.result.serverInfo.name, SERVER_INFO.name);
    assert.equal(json.result.serverInfo.title, `${SERVER_INFO.title} (contributor beta)`);
    assert.equal(json.result.serverInfo.version, `${SERVER_INFO.version}+beta`);
    assert.deepEqual(BETA_SERVER_INFO.icons, SERVER_INFO.icons);
    assert.equal(headers.get("mcp-session-id"), null, "stateless: no session id");
  });
});

test("tools/list is exactly the working package's default list for a keyed session, which never lists get_key", async () => {
  const session = createSession({ base: "https://example.test", fetchImpl: async () => { throw new Error("no network"); }, envKey: CONTRIBUTOR_KEY, hosted: { keySource: "caller" }, local: false, toolsets: configuredToolsets(undefined) });
  const expected = Object.keys(registerTools({ registerTool() {} }, session)).sort();
  assert.ok(!expected.includes("get_key"));
  await withServer(async (url) => {
    const { json } = await rpc(url, "tools/list", {}, bearer(CONTRIBUTOR_KEY));
    assert.deepEqual(json.result.tools.map((t) => t.name).sort(), expected);
    const company = await rpc(`${url}?toolsets=company`, "tools/list", {}, bearer(CONTRIBUTOR_KEY));
    assert.deepEqual(company.json.result.tools.map((t) => t.name), ["company_financial_history"]);
  });
});

test("a contributor's validation runs under the contributor's own key, which is never echoed back", async () => {
  await withServer(async (url, api, store) => {
    const { json, text } = await rpc(url, "tools/call", { name: "service_status", arguments: {} }, bearer(CONTRIBUTOR_KEY));
    assert.ok(json.result, JSON.stringify(json));
    assert.ok(api.calls.length >= 1);
    assert.ok(api.calls.every((c) => c.authorization === `Bearer ${CONTRIBUTOR_KEY}`), "never the shared key");
    assert.ok(!text.includes(CONTRIBUTOR_KEY));
    assert.deepEqual(store.hashes, [hashKey(CONTRIBUTOR_KEY)], "one tier check per request");
  }, { env: { CANLI_REMOTE_MCP_KEY: "canli_sharedkey_0123456789abcdefghij" } });
});

test("every request is checked again: access ends as soon as the tier is removed", async () => {
  const records = new Map(RECORDS);
  const store = { hashes: [], readKeyTier: async (hash) => { store.hashes.push(hash); return records.get(hash) ?? null; } };
  await withServer(async (url) => {
    assert.equal((await rpc(url, "tools/list", {}, bearer(CONTRIBUTOR_KEY))).status, 200);
    records.set(hashKey(CONTRIBUTOR_KEY), { label: "beta", tier: null, daily_limit: null, granted_at: null });
    assert.equal((await rpc(url, "tools/list", {}, bearer(CONTRIBUTOR_KEY))).status, 403);
    assert.equal(store.hashes.length, 2);
  }, { store });
});

test("GET is refused and OPTIONS answers the preflight, before any tier check", async () => {
  await withServer(async (url, api, store) => {
    const get = await fetch(url, { method: "GET", headers: bearer(CONTRIBUTOR_KEY) });
    assert.equal(get.status, 405);
    assert.match(get.headers.get("allow"), /POST/);
    const options = await fetch(url, { method: "OPTIONS" });
    assert.equal(options.status, 204);
    assert.equal(store.hashes.length, 0);
  });
});

test("the beta endpoint is the only api/ handler that imports a package's working source", () => {
  const files = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.m?js$/.test(name) && !/\.test\.m?js$/.test(name) ? [path] : [];
  });
  const importers = files(join(ROOT, "api"))
    .filter((path) => /from "(\.\.\/)+mcp(-fundamentals|-research|-execution)?\/src\//.test(readFileSync(path, "utf8")))
    .map((path) => relative(ROOT, path));
  assert.deepEqual(importers, ["api/mcp-beta.js"]);
  assert.match(readFileSync(join(ROOT, "api/mcp-beta.js"), "utf8"), /from "\.\.\/mcp\/src\/server\.mjs"/);
});

test("vercel.json routes /mcp/beta to this function and bundles the working package with it", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert.ok(vercel.rewrites.some((r) => r.source === "/mcp/beta" && r.destination === "/api/mcp-beta"));
  assert.equal(vercel.functions["api/mcp-beta.js"].includeFiles, "mcp/{package.json,src/**}");
  assert.equal(vercel.functions["api/mcp-beta.js"].maxDuration, vercel.functions["api/mcp.js"].maxDuration);
});
