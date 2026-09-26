// The hosted MCP endpoint answers validations with this deployment's own handlers, in process. The
// adapter must behave like the network for them and stay out of the way for everything else.
import assert from "node:assert/strict";
import test from "node:test";

import { readJsonBody } from "./body.js";
import { send } from "./envelope.js";
import { IN_PROCESS_ROUTES, inProcessFetch } from "./in-process-fetch.js";
import { MANIFEST } from "./manifest.js";

test("every keyed validation route in the manifest is served in process", () => {
  const validators = MANIFEST.filter((m) => m.method === "POST" && m.keyed && m.path.startsWith("/api/v1/validate/")).map((m) => m.path).sort();
  assert.deepEqual(Object.keys(IN_PROCESS_ROUTES).sort(), validators);
});

test("a validation request reaches the handler with its method, headers and body, and its response comes back", async () => {
  const echo = async (req, res) => {
    const body = await readJsonBody(req, 1000);
    send(res, 201, { method: req.method, auth: req.headers.authorization, body }, { headers: { "X-RateLimit-Remaining": "7" } });
  };
  const fetchImpl = inProcessFetch({ routes: { "/api/v1/validate/echo": echo }, fallback: async () => { throw new Error("no fallback"); } });
  const res = await fetchImpl("https://canlicapital.com/api/v1/validate/echo", {
    method: "POST", headers: { Authorization: "Bearer ck_live_test", "Content-Type": "application/json" }, body: JSON.stringify({ a: 1 }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("x-ratelimit-remaining"), "7");
  assert.deepEqual(JSON.parse(await res.text()), { method: "POST", auth: "Bearer ck_live_test", body: { a: 1 } });
});

test("anything that is not a POST to a validation route goes to the fallback unchanged", async () => {
  const seen = [];
  const fallback = async (url, init) => { seen.push([url, init?.method ?? "GET"]); return new Response("{}", { status: 200 }); };
  const fetchImpl = inProcessFetch({ fallback });
  await fetchImpl("https://canlicapital.com/company-data/0000320193.json", { method: "GET" });
  await fetchImpl("https://canlicapital.com/api/v1/validate/breadth", { method: "GET" });
  await fetchImpl("https://canlicapital.com/api/v1/keys", { method: "POST", body: "{}" });
  assert.deepEqual(seen, [
    ["https://canlicapital.com/company-data/0000320193.json", "GET"],
    ["https://canlicapital.com/api/v1/validate/breadth", "GET"],
    ["https://canlicapital.com/api/v1/keys", "POST"],
  ]);
});

test("the real handlers run: no key is 401, and a key with no quota store is 503, as over the network", async () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const fetchImpl = inProcessFetch({ fallback: async () => { throw new Error("no network"); } });
    const body = JSON.stringify({ sleeve_sharpe: 0.5, average_pairwise_correlation: 0.05 });
    const noKey = await fetchImpl("https://canlicapital.com/api/v1/validate/breadth", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(noKey.status, 401);
    assert.equal(JSON.parse(await noKey.text()).error.code, "unauthorized");
    const keyed = await fetchImpl("https://canlicapital.com/api/v1/validate/breadth", { method: "POST", headers: { Authorization: "Bearer ck_live_0123456789abcdef", "Content-Type": "application/json" }, body });
    assert.equal(keyed.status, 503);
    assert.equal(JSON.parse(await keyed.text()).error.code, "store_unavailable");
  } finally {
    if (saved.url !== undefined) process.env.SUPABASE_URL = saved.url;
    if (saved.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
});

test("an oversized body is refused by the handler's own cap", async () => {
  const fetchImpl = inProcessFetch({ fallback: async () => { throw new Error("no network"); } });
  const res = await fetchImpl("https://canlicapital.com/api/v1/validate/breadth", {
    method: "POST", headers: { Authorization: "Bearer ck_live_0123456789abcdef" }, body: JSON.stringify({ pad: "x".repeat(1_100_000) }),
  });
  assert.equal(res.status, 413);
});

test("the caller's deadline still applies", async () => {
  const hang = () => new Promise(() => {});
  const fetchImpl = inProcessFetch({ routes: { "/api/v1/validate/hang": hang } });
  const controller = new AbortController();
  const pending = fetchImpl("https://canlicapital.com/api/v1/validate/hang", { method: "POST", body: "{}", signal: controller.signal });
  controller.abort();
  await assert.rejects(pending);
  await assert.rejects(fetchImpl("https://canlicapital.com/api/v1/validate/hang", { method: "POST", body: "{}", signal: AbortSignal.abort() }));
});
