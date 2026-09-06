import assert from "node:assert/strict";
import test from "node:test";

import { StoreError, createStore } from "./store.js";

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    for (const [suffix, respond] of routes) if (String(url).endsWith(suffix)) return respond(init);
    throw new Error(`unexpected ${url}`);
  };
  fn.calls = calls;
  return fn;
}
const ok = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

test("consumeQuota calls the RPC with the service key and returns remaining", async () => {
  const f = fakeFetch([["/rest/v1/rpc/consume_quota", (init) => { assert.equal(JSON.parse(init.body).p_daily_limit, 1000); return ok(999); }]]);
  const store = createStore({ url: "https://x.supabase.co/", serviceKey: "svc", fetchImpl: f });
  assert.deepEqual(await store.consumeQuota("abc", 1000), { remaining: 999 });
  assert.equal(f.calls[0].init.headers.apikey, "svc");
  assert.equal(f.calls[0].init.headers.Authorization, "Bearer svc");
});

test("a failed RPC surfaces as StoreError with the status", async () => {
  const f = fakeFetch([["/rest/v1/rpc/consume_quota", () => ok({ message: "boom" }, 500)]]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  await assert.rejects(store.consumeQuota("abc", 1000), (e) => e instanceof StoreError && e.status === 500);
});

test("getReceipt returns null on an empty result and the row otherwise", async () => {
  const rows = [];
  const f = fakeFetch([["receipts?id=eq.deadbeef&select=*", () => ok(rows)]]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  assert.equal(await store.getReceipt("deadbeef"), null);
  rows.push({ id: "deadbeef", output: { pbo: 0.1 } });
  assert.deepEqual(await store.getReceipt("deadbeef"), rows[0]);
});

test("saveReceipt posts with resolution=ignore-duplicates so a replay is idempotent", async () => {
  const f = fakeFetch([["/rest/v1/receipts?on_conflict=id", (init) => { assert.match(init.headers.Prefer, /ignore-duplicates/); return ok(null, 201); }]]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  await store.saveReceipt({ id: "deadbeef", endpoint: "validate/breadth", input_sha256: "a", output: {}, bindings: {} });
});

test("issueKey sends p_source_host from the caller, defaulting to null when omitted", async () => {
  const f = fakeFetch([["/rest/v1/rpc/issue_key", (init) => { assert.equal(JSON.parse(init.body).p_source_host, "github.com"); return ok({ issued: true, remaining: 4 }); }]]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  assert.deepEqual(await store.issueKey({ clientHash: "h", dailyLimit: 5, keyHash: "kh", label: "l", sourceHost: "github.com" }), { issued: true, remaining: 4 });
});

test("issueKey omits no host as null, never as an empty string or undefined key", async () => {
  const f = fakeFetch([["/rest/v1/rpc/issue_key", (init) => { const body = JSON.parse(init.body); assert.equal(body.p_source_host, null); assert.ok("p_source_host" in body); return ok({ issued: true, remaining: 4 }); }]]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  await store.issueKey({ clientHash: "h", dailyLimit: 5, keyHash: "kh", label: "l" });
});

test("usageSummary calls the RPC with the service key and returns the aggregate object", async () => {
  const aggregate = { validations_today: 12, validations_total: 340, keys_issued_today: 2, as_of_utc_day: "2026-09-06" };
  const f = fakeFetch([["/rest/v1/rpc/usage_summary", (init) => { assert.equal(init.body, "{}"); return ok(aggregate); }]]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  assert.deepEqual(await store.usageSummary(), aggregate);
  assert.equal(f.calls[0].init.headers.apikey, "svc");
});

test("usageSummary surfaces a missing function (migration not yet applied) as StoreError", async () => {
  const f = fakeFetch([["/rest/v1/rpc/usage_summary", () => ok({ code: "PGRST202", message: "Could not find the function public.usage_summary" }, 404)]]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  await assert.rejects(store.usageSummary(), (e) => e instanceof StoreError && e.status === 404);
});

test("usageSummary propagates a network failure without swallowing it", async () => {
  const f = async () => { throw new TypeError("fetch failed"); };
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  await assert.rejects(store.usageSummary(), /fetch failed/);
});
