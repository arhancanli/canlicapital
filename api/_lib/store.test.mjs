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

test("consumeQuota makes one call with the service key and returns remaining and the limit enforced", async () => {
  const f = fakeFetch([["/rest/v1/rpc/consume_quota_with_limit", (init) => { assert.deepEqual(JSON.parse(init.body), { p_key_hash: "abc", p_daily_limit: 1000 }); return ok({ remaining: 999, daily_limit: 1000 }); }]]);
  const store = createStore({ url: "https://x.supabase.co/", serviceKey: "svc", fetchImpl: f });
  assert.deepEqual(await store.consumeQuota("abc", 1000), { remaining: 999, limit: 1000 });
  assert.equal(f.calls.length, 1, "one round trip");
  assert.equal(f.calls[0].init.headers.apikey, "svc");
  assert.equal(f.calls[0].init.headers.Authorization, "Bearer svc");
});

test("consumeQuota reports a contributor key's larger limit as the store returns it", async () => {
  const f = fakeFetch([["/rest/v1/rpc/consume_quota_with_limit", () => ok({ remaining: 9500, daily_limit: 10000 })]]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  assert.deepEqual(await store.consumeQuota("abc", 1000), { remaining: 9500, limit: 10000 });
});

test("before the contributor migration, consumeQuota falls back to the original admission at the standard limit", async () => {
  const f = fakeFetch([
    ["/rest/v1/rpc/consume_quota_with_limit", () => ok({ code: "PGRST202", message: "Could not find the function public.consume_quota_with_limit(p_daily_limit, p_key_hash) in the schema cache" }, 404)],
    ["/rest/v1/rpc/consume_quota", (init) => { assert.deepEqual(JSON.parse(init.body), { p_key_hash: "abc", p_daily_limit: 1000 }); return ok(41); }],
  ]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  assert.deepEqual(await store.consumeQuota("abc", 1000), { remaining: 41, limit: 1000 });
  assert.deepEqual(f.calls.map((c) => new URL(c.url).pathname), ["/rest/v1/rpc/consume_quota_with_limit", "/rest/v1/rpc/consume_quota"]);
});

test("any other failure of the admission is a StoreError and never falls back", async () => {
  for (const [status, body] of [[500, { message: "boom" }], [404, { code: "PGRST116", message: "not that" }], [401, { message: "bad key" }]]) {
    const f = fakeFetch([["/rest/v1/rpc/consume_quota_with_limit", () => ok(body, status)], ["/rest/v1/rpc/consume_quota", () => { throw new Error("must not fall back"); }]]);
    const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
    await assert.rejects(store.consumeQuota("abc", 1000), (e) => e instanceof StoreError && e.status === status);
    assert.equal(f.calls.length, 1);
  }
});

test("a malformed admission response is refused, not read as a number", async () => {
  for (const body of [null, 999, { remaining: 999 }, { remaining: "999", daily_limit: 1000 }, { remaining: 1.5, daily_limit: 1000 }, { remaining: 999, daily_limit: null }]) {
    const f = fakeFetch([["/rest/v1/rpc/consume_quota_with_limit", () => ok(body)]]);
    const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
    await assert.rejects(store.consumeQuota("abc", 1000), /Invalid quota response/, JSON.stringify(body));
  }
});

const FINGERPRINT = "a".repeat(64);

test("readKeyTier sends only the hash and returns the key's label and tier, or null", async () => {
  let payload;
  let response = { label: "runner", tier: "contributor", daily_limit: 10000, granted_at: "2026-10-05T12:00:00+00:00" };
  const f = fakeFetch([["/rest/v1/rpc/read_key_tier", (init) => { payload = JSON.parse(init.body); return ok(response); }]]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  assert.deepEqual(await store.readKeyTier("hash-only"), response);
  assert.deepEqual(payload, { p_key_hash: "hash-only" });
  response = { label: null, tier: null, daily_limit: null, granted_at: null };
  assert.deepEqual(await store.readKeyTier("hash-only"), response);
  response = null;
  assert.equal(await store.readKeyTier("hash-only"), null);
});

test("readKeyTier refuses a record it cannot vouch for", async () => {
  const good = { label: null, tier: "contributor", daily_limit: 10000, granted_at: "2026-10-05T12:00:00+00:00" };
  for (const response of [
    [], "contributor", { ...good, tier: "gold" }, { ...good, daily_limit: 0 }, { ...good, daily_limit: "10000" },
    { ...good, granted_at: "yesterday" }, { ...good, label: 7 }, { ...good, tier: null },
    { label: null, tier: null, daily_limit: 10000, granted_at: null },
  ]) {
    const f = fakeFetch([["/rest/v1/rpc/read_key_tier", () => ok(response)]]);
    const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
    await assert.rejects(store.readKeyTier("hash-only"), /Invalid key tier response/, JSON.stringify(response));
  }
});

test("grantKeyTier and revokeKeyTier name the key by fingerprint or label, never by the key, and check the answer's shape", async () => {
  const payloads = [];
  let grant = { granted: true, matched_by: "fingerprint", fingerprint: FINGERPRINT, label: "runner", tier: "contributor", daily_limit: 10000, github_login: "octo-cat", granted_at: "2026-10-05T12:00:00+00:00", note: "PR 1" };
  let revoke = { revoked: true, matched_by: "label", fingerprint: FINGERPRINT, label: "runner" };
  const f = fakeFetch([
    ["/rest/v1/rpc/grant_key_tier", (init) => { payloads.push(JSON.parse(init.body)); return ok(grant); }],
    ["/rest/v1/rpc/revoke_key_tier", (init) => { payloads.push(JSON.parse(init.body)); return ok(revoke); }],
  ]);
  const store = createStore({ url: "https://x.supabase.co", serviceKey: "svc", fetchImpl: f });
  assert.deepEqual(await store.grantKeyTier({ keyHash: FINGERPRINT, tier: "contributor", dailyLimit: 10000, githubLogin: "octo-cat", note: "PR 1" }), grant);
  assert.deepEqual(await store.revokeKeyTier({ label: "runner" }), revoke);
  await store.grantKeyTier({ label: "runner", tier: "contributor", dailyLimit: 10000, githubLogin: "octo-cat" });
  assert.deepEqual(payloads, [
    { p_tier: "contributor", p_daily_limit: 10000, p_github_login: "octo-cat", p_key_hash: FINGERPRINT, p_label: null, p_note: "PR 1" },
    { p_key_hash: null, p_label: "runner" },
    { p_tier: "contributor", p_daily_limit: 10000, p_github_login: "octo-cat", p_key_hash: null, p_label: "runner", p_note: null },
  ]);
  grant = { granted: false, reason: "ambiguous_label", matched_by: "label", fingerprint: null, label: "runner" };
  assert.equal((await store.grantKeyTier({ label: "runner", tier: "contributor", dailyLimit: 10000, githubLogin: "octo-cat" })).reason, "ambiguous_label");
  for (grant of [{ granted: "yes" }, { granted: false }, null]) {
    await assert.rejects(store.grantKeyTier({ keyHash: FINGERPRINT, tier: "contributor", dailyLimit: 10000, githubLogin: "octo-cat" }), /Invalid grant response/, JSON.stringify(grant));
  }
  for (revoke of [{}, { revoked: false }, { revoked: "true" }]) {
    await assert.rejects(store.revokeKeyTier({ keyHash: FINGERPRINT }), /Invalid tier revocation response/, JSON.stringify(revoke));
  }
});

test("a failed RPC surfaces as StoreError with the status", async () => {
  const f = fakeFetch([["/rest/v1/rpc/consume_quota_with_limit", () => ok({ message: "boom" }, 500)]]);
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

test('revoke RPC receives only the key hash and rejects ambiguous responses', async () => {
  let payload;
  let response = { revoked: true, revoked_at: '2026-09-20T00:00:00Z' };
  const f = fakeFetch([['/rpc/revoke_key', init => { payload = JSON.parse(init.body); return ok(response); }]]);
  const store = createStore({ url: 'https://x.supabase.co', serviceKey: 'svc', fetchImpl: f });
  assert.deepEqual(await store.revokeKey('hash-only'), response);
  assert.deepEqual(payload, { p_key_hash: 'hash-only' });
  for (response of [{}, { revoked: true }, { revoked: true, revoked_at: 'not-a-date' }, { revoked: 'true' }]) await assert.rejects(store.revokeKey('hash-only'));
});
