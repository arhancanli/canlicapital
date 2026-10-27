// The billing webhook on fake events: off without a secret, signature and age checked, checkout
// links a key by its hash, subscription events set the tier to the period's end plus grace, and an
// ended or unpaid subscription falls back to free.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

import { createBillingWebhook, GRACE_DAYS, tierChange, tierFromLookupKey, verifySignature } from "./webhook.js";

const SECRET = "whsec_test_only";
const NOW = 1_800_000_000;
const sign = (raw, t = NOW, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
const HASH = "a".repeat(64);

async function post(handler, raw, headers = {}) {
  const server = createServer((req, res) => handler(req, res));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/billing/webhook`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: raw });
    return { status: r.status, body: await r.json() };
  } finally { await new Promise((r) => server.close(r)); }
}

test("signatures: right secret and fresh only", () => {
  const raw = "{\"x\":1}";
  assert.equal(verifySignature(raw, sign(raw), SECRET, NOW), true);
  assert.equal(verifySignature(raw, sign(raw, NOW, "whsec_other"), SECRET, NOW), false);
  assert.equal(verifySignature(raw + " ", sign(raw), SECRET, NOW), false, "the exact bytes are signed");
  assert.equal(verifySignature(raw, sign(raw, NOW - 301), SECRET, NOW), false, "too old");
  assert.equal(verifySignature(raw, "garbage", SECRET, NOW), false);
  assert.equal(verifySignature(raw, `${sign(raw)},v1=00`, SECRET, NOW), true, "any v1 that matches");
});

test("events become tier changes", () => {
  assert.equal(tierFromLookupKey("canli_pro_monthly"), "pro");
  assert.equal(tierFromLookupKey("canli_team"), "team");
  assert.equal(tierFromLookupKey("other_pro"), null);
  assert.deepEqual(tierChange({ type: "checkout.session.completed", data: { object: { client_reference_id: HASH, subscription: "sub_1", customer: "cus_1", metadata: { lookup_key: "canli_team_monthly" } } } }), { keyHash: HASH, subscription: "sub_1", customer: "cus_1", tier: "team", until: null });
  assert.equal(tierChange({ type: "checkout.session.completed", data: { object: { client_reference_id: "ck_live_raw_key", subscription: "sub_1" } } }), null, "only a hash links a key");
  const end = NOW + 30 * 86400;
  const sub = (status, type = "customer.subscription.updated") => tierChange({ type, data: { object: { id: "sub_1", customer: "cus_1", status, items: { data: [{ current_period_end: end, price: { lookup_key: "canli_pro_monthly" } }] } } } });
  assert.deepEqual(sub("active"), { keyHash: null, subscription: "sub_1", customer: "cus_1", tier: "pro", until: new Date((end + GRACE_DAYS * 86400) * 1000).toISOString() });
  assert.equal(sub("past_due").tier, "free");
  assert.equal(sub("active", "customer.subscription.deleted").tier, "free");
  assert.equal(tierChange({ type: "invoice.created", data: { object: {} } }), null);
});

test("the endpoint: off without a secret, refuses bad signatures, writes changes, asks for a retry when the store is down", async () => {
  const raw = JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: HASH, subscription: "sub_1", customer: "cus_1" } } });
  assert.equal((await post(createBillingWebhook({ secret: "" }), raw, { "Stripe-Signature": sign(raw) })).status, 503);
  const writes = [];
  const store = { setKeyTier: async (c) => { writes.push(c); return { updated: 1 }; } };
  const hook = createBillingWebhook({ secret: SECRET, store, now: () => NOW });
  assert.equal((await post(hook, raw, { "Stripe-Signature": sign(raw, NOW, "whsec_other") })).status, 400);
  assert.equal(writes.length, 0);
  const ok = await post(hook, raw, { "Stripe-Signature": sign(raw) });
  assert.deepEqual([ok.status, ok.body], [200, { received: true, changed: true, tier: "pro" }]);
  assert.deepEqual(writes, [{ keyHash: HASH, subscription: "sub_1", customer: "cus_1", tier: "pro", until: null }]);
  const other = JSON.stringify({ type: "invoice.created", data: { object: {} } });
  assert.deepEqual((await post(hook, other, { "Stripe-Signature": sign(other) })).body, { received: true, changed: false });
  const down = createBillingWebhook({ secret: SECRET, store: { setKeyTier: async () => { throw new Error("503"); } }, now: () => NOW });
  assert.equal((await post(down, raw, { "Stripe-Signature": sign(raw) })).status, 503);
});
