// api/_lib/handler.js
// One pipeline for every validator: method, body, key, quota, compute, receipt, respond. A
// validator file is then twenty lines that name its endpoint, its sources and its compute.
import { bearerKey, hashKey } from "./auth.js";
import { BINDINGS } from "./bindings.generated.js";
import { BodyError, readJsonBody } from "./body.js";
import { canonical, contentId, sha256Hex } from "./canonical.js";
import { envelope, errorEnvelope, nextUtcMidnightIso, quotaHeaders, send } from "./envelope.js";
import { LIMITS, LIMITS_TEXT } from "./limits.js";
import { createStore } from "./store.js";

const ORIGIN = "https://canlicapital.com";

export function sourcesFor(paths) {
  return paths.map((path) => {
    const sha256 = BINDINGS.files[path];
    if (!sha256) throw new Error(`validation-api: ${path} is not in bindings.generated.js`);
    return { path, sha256, url: `${ORIGIN}/${path.replace(/^public\//, "")}` };
  });
}

export function defaultStore() {
  return createStore({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
}

export function validatorHandler({ endpoint, sourcesPaths, compute, store, now = () => new Date() }) {
  const sources = sourcesFor(sourcesPaths);
  const fail = (res, status, code, message, pointer, headers) => send(res, status, errorEnvelope({ endpoint, code, message, pointer, limits: LIMITS_TEXT, sources }), { headers });

  return async function handler(req, res) {
    if (req.method === "OPTIONS") return send(res, 204, "", {});
    if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return fail(res, 405, "method_not_allowed", "Use POST"); }
    let body;
    try { body = await readJsonBody(req, LIMITS.max_body_bytes); } catch (e) {
      if (e instanceof BodyError) return fail(res, e.status, e.code, e.message);
      return fail(res, 400, "unreadable_body", "Could not read the request body");
    }
    const key = bearerKey(req);
    if (!key) return fail(res, 401, "unauthorized", "Send Authorization: Bearer ck_live_... from POST /api/v1/keys");
    const activeStore = store ?? defaultStore();
    let remaining;
    try { ({ remaining } = await activeStore.consumeQuota(hashKey(key), LIMITS.validations_per_key_per_day)); } catch (e) {
      console.error("[validation-api] quota store failed", e.status ?? "", e.message);
      return fail(res, 503, "store_unavailable", "The quota store is unavailable; try again shortly");
    }
    const resetIso = nextUtcMidnightIso(now());
    const headers = quotaHeaders({ limit: LIMITS.validations_per_key_per_day, remaining, resetIso });
    if (remaining === -2) return fail(res, 401, "unauthorized", "Unknown or revoked key", undefined, headers);
    if (remaining === -1) {
      const retry = Math.max(1, Math.ceil((Date.parse(resetIso) - now().getTime()) / 1000));
      return fail(res, 429, "quota_exhausted", `Daily quota of ${LIMITS.validations_per_key_per_day} validations reached`, undefined, { ...headers, "Retry-After": String(retry) });
    }
    let data;
    try { data = compute(body); } catch (e) {
      if (e instanceof RangeError || e instanceof TypeError) return fail(res, 422, "invalid_input", e.message, undefined, headers);
      console.error("[validation-api] compute failed", endpoint, e);
      return fail(res, 500, "compute_failed", "The validator failed; nothing was stored", undefined, headers);
    }
    const input_sha256 = `sha256:${sha256Hex(canonical(body))}`;
    const bindings = Object.fromEntries(sources.map((s) => [s.path, s.sha256]));
    const id = contentId({ endpoint, input_sha256, output: data, bindings });
    const output_sha256 = `sha256:${sha256Hex(canonical(data))}`;
    const receipt = { id, url: `${ORIGIN}/api/v1/receipts/${id}`, input_sha256, output_sha256 };
    let stored = true;
    try { await activeStore.saveReceipt({ id, key_id: null, endpoint, input_sha256, output: data, bindings }); } catch (e) {
      stored = false;
      console.error("[validation-api] receipt save failed", e.status ?? "", e.message);
    }
    return send(res, 200, envelope({ endpoint, limits: LIMITS_TEXT, sources, data: { ...data, receipt_stored: stored }, receipt }), { headers });
  };
}
