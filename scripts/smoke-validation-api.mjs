// scripts/smoke-validation-api.mjs <base-url>
// Issues a key, calls every validator with the manifest's example, fetches a receipt, and asserts
// the envelope. Exit 1 on any failure. Run against a preview URL before production.
import assert from "node:assert/strict";
import { MANIFEST } from "../api/_lib/manifest.js";

const base = process.argv[2];
if (!base) { console.error("usage: smoke-validation-api.mjs https://<deployment>"); process.exit(2); }
const j = async (res) => { const text = await res.text(); try { return { status: res.status, body: JSON.parse(text), headers: res.headers }; } catch { throw new Error(`non-JSON ${res.status}: ${text.slice(0, 200)}`); } };

// Non-key-consuming: a malformed body must be rejected before any key is issued, not fall through
// to an empty body and burn one of the client's five daily keys on a shell-quoting typo.
const malformed = await j(await fetch(`${base}/api/v1/keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" }));
assert.equal(malformed.status, 400, JSON.stringify(malformed.body));
assert.equal(malformed.body.error?.code, "invalid_json", JSON.stringify(malformed.body));
assert.equal(malformed.body.data?.key, undefined, "malformed JSON must not issue a key");
console.log("ok malformed-json probe on /api/v1/keys (no key consumed)");

const keyRes = await j(await fetch(`${base}/api/v1/keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "smoke" }) }));
assert.equal(keyRes.status, 201, JSON.stringify(keyRes.body));
const key = keyRes.body.data.key;
assert.match(key, /^ck_live_/);
console.log("key issued; remaining today", keyRes.body.data.keys_remaining_today);

let receiptUrl;
for (const m of MANIFEST.filter((x) => x.keyed)) {
  const r = await j(await fetch(`${base}${m.path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(m.requestExample) }));
  assert.equal(r.status, 200, `${m.path}: ${JSON.stringify(r.body).slice(0, 300)}`);
  assert.equal(r.body.schema, "canli.api.v1");
  assert.equal(r.body.claim_class, "USER_SUBMITTED_SCENARIO");
  assert.ok(r.body.limits.length >= 4);
  assert.match(r.body.receipt.id, /^[0-9a-f]{24}$/);
  assert.ok(r.headers.get("x-ratelimit-remaining"));
  receiptUrl = r.body.receipt.url.replace("https://canlicapital.com", base);
  console.log("ok", m.path, "remaining", r.headers.get("x-ratelimit-remaining"), "stored", r.body.data.receipt_stored);
}
const rec = await j(await fetch(receiptUrl));
assert.equal(rec.status, 200, JSON.stringify(rec.body).slice(0, 300));
assert.equal(rec.body.data.id, receiptUrl.split("/").pop());
const unauth = await j(await fetch(`${base}/api/v1/validate/breadth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
assert.equal(unauth.status, 401);
const status = await j(await fetch(`${base}/api/v1/validate/status`));
assert.equal(status.status, 200, JSON.stringify(status.body).slice(0, 200));
console.log("smoke passed against", base);
