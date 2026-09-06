// api/v1/keys.js
import { clientHash, generateKey, hashKey, refererHost } from "../_lib/auth.js";
import { BodyError, readJsonBody } from "../_lib/body.js";
import { envelope, errorEnvelope, send } from "../_lib/envelope.js";
import { defaultStore } from "../_lib/handler.js";
import { LIMITS, LIMITS_TEXT } from "../_lib/limits.js";

const ENDPOINT = "keys";
const fail = (res, status, code, message) => send(res, status, errorEnvelope({ endpoint: ENDPOINT, code, message, limits: LIMITS_TEXT }));

// The route's own body validator: an empty body is a valid request (label is optional), but a
// wrong-typed label is silently ignored rather than rejected, matching the behaviour this handler
// has always had. Exported so the OpenAPI round-trip test and unit tests exercise the exact same
// logic the handler runs, not a copy of it.
export function validateBody(body) {
  const label = typeof body.label === "string" ? body.label.slice(0, 64) : null;
  return { label };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, "", {});
  if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return fail(res, 405, "method_not_allowed", "Use POST"); }
  let body;
  try { body = await readJsonBody(req, 4096, { allowEmpty: true }); } catch (e) {
    if (e instanceof BodyError) return fail(res, e.status, e.code, e.message);
    return fail(res, 400, "unreadable_body", "Could not read the request body");
  }
  const { label } = validateBody(body);
  const key = generateKey();
  const salt = process.env.API_CLIENT_SALT;
  if (!salt) { console.error("[validation-api] API_CLIENT_SALT is not set"); return fail(res, 503, "store_unavailable", "Key issuance is not configured"); }
  let out;
  try { out = await defaultStore().issueKey({ clientHash: clientHash(req, salt), dailyLimit: LIMITS.keys_per_client_per_day, keyHash: hashKey(key), label, sourceHost: refererHost(req) }); } catch (e) {
    console.error("[validation-api] issue_key failed", e.status ?? "", e.message);
    return fail(res, 503, "store_unavailable", "The key store is unavailable; try again shortly");
  }
  if (!out.issued) return fail(res, 429, "issuance_exhausted", `At most ${LIMITS.keys_per_client_per_day} keys per client per UTC day`);
  return send(res, 201, envelope({ endpoint: ENDPOINT, claimClass: "OBSERVED", capitalKind: "NOT_APPLICABLE_SERVICE_STATUS", limits: LIMITS_TEXT, sources: [], data: { key, label, quotas: LIMITS, keys_remaining_today: out.remaining, note: "Store this key now. Only its hash is kept and it cannot be shown again." } }));
}
