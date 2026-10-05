// GET /api/v1/keys/me: the bearer key's fingerprint, label and tier, never the key, and no quota.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import test from "node:test";

import { hashKey } from "../../_lib/auth.js";
import { BETA_MCP_URL, CLAIM_ISSUE_URL } from "../../_lib/contributor-access.js";
import { LIMITS } from "../../_lib/limits.js";
import { createKeyProfileHandler, keyProfile } from "./me.js";

const KEY = "ck_live_" + "k".repeat(43);
const STANDARD = { label: "my-backtest-runner", tier: null, daily_limit: null, granted_at: null };
const CONTRIBUTOR = { label: "my-backtest-runner", tier: "contributor", daily_limit: LIMITS.contributor_validations_per_key_per_day, granted_at: "2026-10-05T12:00:00+00:00" };

// A store with only the one method this route may call: any admission would throw. In call(),
// authorization null sends no Authorization header at all.
function storeReturning(record) {
  const hashes = [];
  return {
    hashes,
    readKeyTier: async (hash) => { hashes.push(hash); if (record instanceof Error) throw record; return record; },
    consumeQuota: () => { throw new Error("keys/me must not consume validation quota"); },
  };
}

async function call(store, { method = "GET", authorization = `Bearer ${KEY}` } = {}) {
  const req = Readable.from([]);
  req.method = method;
  req.headers = authorization === null ? {} : { authorization };
  const res = { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body ?? ""; } };
  await createKeyProfileHandler({ store })(req, res);
  return res;
}

test("a standard key reads its fingerprint, label and the standard limit, and how to claim contributor access", async () => {
  const store = storeReturning(STANDARD);
  const res = await call(store);
  assert.equal(res.statusCode, 200, res.body);
  const body = JSON.parse(res.body);
  assert.equal(body.schema, "canli.api.v1");
  assert.equal(body.endpoint, "/api/v1/keys/me");
  assert.equal(body.claim_class, "OBSERVED");
  assert.deepEqual(body.data, {
    fingerprint: hashKey(KEY),
    label: "my-backtest-runner",
    tier: "standard",
    validations_per_day: LIMITS.validations_per_key_per_day,
    contributor_since: null,
    beta_mcp: { url: BETA_MCP_URL, access: false },
    note: body.data.note,
  });
  assert.match(body.data.note, /never the key itself/);
  assert.ok(body.data.note.includes(CLAIM_ISSUE_URL));
  assert.deepEqual(store.hashes, [hashKey(KEY)], "only the key's hash reaches the store");
  assert.ok(!res.body.includes(KEY), "the key is never echoed");
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("the fingerprint is what the contributor's own shell prints, and the hash the store keeps", () => {
  const shell = execFileSync("sh", ["-c", "printf '%s' \"$CANLI_KEY\" | shasum -a 256"], { env: { PATH: process.env.PATH, CANLI_KEY: KEY }, encoding: "utf8" });
  assert.equal(shell.split(/\s+/)[0], hashKey(KEY));
  assert.equal(keyProfile(hashKey(KEY), STANDARD).fingerprint, shell.split(/\s+/)[0]);
});

test("a contributor key reads the contributor limit and beta MCP access", async () => {
  const res = await call(storeReturning(CONTRIBUTOR));
  assert.equal(res.statusCode, 200, res.body);
  const { data } = JSON.parse(res.body);
  assert.equal(data.tier, "contributor");
  assert.equal(data.fingerprint, hashKey(KEY));
  assert.equal(data.validations_per_day, LIMITS.contributor_validations_per_key_per_day);
  assert.equal(data.contributor_since, CONTRIBUTOR.granted_at);
  assert.deepEqual(data.beta_mcp, { url: BETA_MCP_URL, access: true });
  assert.ok(data.note.includes(String(LIMITS.contributor_validations_per_key_per_day)));
  assert.ok(!res.body.includes(KEY));
});

test("the reported limit follows the quota function's rule: a tier raises the standard limit, never lowers it", () => {
  assert.equal(keyProfile("f", { ...CONTRIBUTOR, daily_limit: 5 }).validations_per_day, LIMITS.validations_per_key_per_day);
  assert.equal(keyProfile("f", { ...CONTRIBUTOR, daily_limit: LIMITS.validations_per_key_per_day + 1 }).validations_per_day, LIMITS.validations_per_key_per_day + 1);
  assert.equal(keyProfile("f", STANDARD).validations_per_day, LIMITS.validations_per_key_per_day);
});

test("no key, or anything but a validation API key, is 401 and never reaches the store", async () => {
  const store = { readKeyTier: () => { throw new Error("must not reach the store"); } };
  for (const authorization of [null, "", "Basic abc", "Bearer not-a-canli-key", `Bearer ${KEY} extra`]) {
    const res = await call(store, { authorization });
    assert.equal(res.statusCode, 401, String(authorization));
    assert.equal(JSON.parse(res.body).error.code, "unauthorized");
  }
});

test("an unknown or revoked key is 401; an unavailable store is 503 and says nothing about the key", async () => {
  const unknown = await call(storeReturning(null));
  assert.equal(unknown.statusCode, 401);
  assert.equal(JSON.parse(unknown.body).error.message, "Unknown or revoked key");
  const down = await call(storeReturning(new Error("store 500: connection reset by peer")));
  assert.equal(down.statusCode, 503);
  assert.equal(JSON.parse(down.body).error.code, "store_unavailable");
  assert.ok(!down.body.includes(KEY));
  assert.ok(!down.body.includes("connection reset"), "store internals stay in the log");
  assert.deepEqual(JSON.parse(down.body).data, {});
});

test("only GET is served: other methods are 405 with Allow, OPTIONS is 204, neither reaches the store", async () => {
  const store = { readKeyTier: () => { throw new Error("must not reach the store"); } };
  for (const method of ["POST", "PUT", "DELETE"]) {
    const res = await call(store, { method });
    assert.equal(res.statusCode, 405, method);
    assert.equal(res.headers.Allow, "GET, OPTIONS");
  }
  assert.equal((await call(store, { method: "OPTIONS" })).statusCode, 204);
});
