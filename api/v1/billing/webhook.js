// api/v1/billing/webhook.js
//
// Stripe tells this endpoint when a hosted-server subscription starts, renews, changes or ends, and
// it sets the paying key's tier (api/_lib/tiers.js) through set_key_tier. Checkout carries the key's
// SHA-256 as client_reference_id (the pricing page hashes the key in the browser; the key itself
// never reaches Stripe or this endpoint). A subscription's tier comes from its price's lookup key
// (canli_pro_*, canli_team_*, canli_enterprise_*) and lasts to its period's end plus GRACE_DAYS, so
// a late renewal event never cuts a paying user off.
//
// Off until STRIPE_WEBHOOK_SECRET is set: every request then gets 503. Each event's signature is
// checked (HMAC-SHA256 over "timestamp.body", within TOLERANCE_SECONDS) before anything is read.
import { createHmac, timingSafeEqual } from "node:crypto";

import { defaultStore } from "../../_lib/handler.js";

export const TOLERANCE_SECONDS = 300;
export const GRACE_DAYS = 3;
const MAX_BYTES = 256 * 1024;
const ACTIVE = new Set(["active", "trialing"]);

export function verifySignature(raw, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = Object.groupBy(String(header ?? "").split(",").map((p) => p.trim().split("=")).filter((p) => p.length === 2), ([k]) => k);
  const t = Number(parts.t?.[0]?.[1]);
  if (!Number.isFinite(t) || Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest();
  return (parts.v1 ?? []).some(([, sig]) => { const got = Buffer.from(sig, "hex"); return got.length === expected.length && timingSafeEqual(got, expected); });
}

export function tierFromLookupKey(key) {
  const m = /^canli_(pro|team|enterprise)(?:_|$)/.exec(String(key ?? ""));
  return m ? m[1] : null;
}

// What an event changes, or null when it changes nothing here.
export function tierChange(event) {
  const o = event?.data?.object ?? {};
  if (event?.type === "checkout.session.completed") {
    if (!/^[0-9a-f]{64}$/.test(String(o.client_reference_id ?? "")) || !o.subscription) return null;
    return { keyHash: o.client_reference_id, subscription: String(o.subscription), customer: o.customer ? String(o.customer) : null, tier: tierFromLookupKey(o.metadata?.lookup_key) ?? "pro", until: null };
  }
  if (event?.type === "customer.subscription.created" || event?.type === "customer.subscription.updated" || event?.type === "customer.subscription.deleted") {
    const item = o.items?.data?.[0] ?? {};
    const tier = tierFromLookupKey(item.price?.lookup_key) ?? tierFromLookupKey(o.metadata?.lookup_key);
    const end = Number(item.current_period_end ?? o.current_period_end);
    const live = event.type !== "customer.subscription.deleted" && ACTIVE.has(o.status) && tier;
    return { keyHash: /^[0-9a-f]{64}$/.test(String(o.metadata?.key_hash ?? "")) ? o.metadata.key_hash : null, subscription: String(o.id), customer: o.customer ? String(o.customer) : null, tier: live ? tier : "free", until: live && Number.isFinite(end) ? new Date((end + GRACE_DAYS * 86400) * 1000).toISOString() : null };
  }
  return null;
}

// The raw body, read from the stream (never req.body, which a platform may have parsed: the
// signature is over the exact bytes).
async function rawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BYTES) throw Object.assign(new Error("too large"), { status: 413 }); chunks.push(chunk); }
  return Buffer.concat(chunks).toString("utf8");
}

export function createBillingWebhook({ secret = process.env.STRIPE_WEBHOOK_SECRET, store, now = () => Math.floor(Date.now() / 1000) } = {}) {
  const reply = (res, status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(`${JSON.stringify(body)}\n`); };
  return async (req, res) => {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return reply(res, 405, { error: "Use POST" }); }
    if (!secret) return reply(res, 503, { error: "Billing is not set up" });
    let raw;
    try { raw = await rawBody(req); } catch (e) { return reply(res, e.status ?? 400, { error: "Unreadable body" }); }
    if (!verifySignature(raw, req.headers["stripe-signature"], secret, now())) return reply(res, 400, { error: "Bad signature" });
    let event;
    try { event = JSON.parse(raw); } catch { return reply(res, 400, { error: "Not JSON" }); }
    const change = tierChange(event);
    if (!change) return reply(res, 200, { received: true, changed: false });
    if (!change.keyHash && !change.subscription) return reply(res, 200, { received: true, changed: false });
    try {
      // A subscription event for a key not yet linked (its checkout event still to come) updates
      // nothing; Stripe retries, and the checkout event links the key.
      const { updated } = await (store ?? defaultStore()).setKeyTier(change);
      return reply(res, 200, { received: true, changed: updated > 0, tier: change.tier });
    } catch {
      // A 5xx makes Stripe retry the event later.
      return reply(res, 503, { error: "Store unavailable" });
    }
  };
}
export default createBillingWebhook();
