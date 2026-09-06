// api/v1/keys.js
import { clientHash, generateKey, hashKey } from "../_lib/auth.js";
import { BodyError, readJsonBody } from "../_lib/body.js";
import { envelope, errorEnvelope, send } from "../_lib/envelope.js";
import { defaultStore } from "../_lib/handler.js";
import { LIMITS, LIMITS_TEXT } from "../_lib/limits.js";

const ENDPOINT = "keys";
const fail = (res, status, code, message) => send(res, status, errorEnvelope({ endpoint: ENDPOINT, code, message, limits: LIMITS_TEXT }));

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, "", {});
  if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return fail(res, 405, "method_not_allowed", "Use POST"); }
  let body = {};
  try { body = await readJsonBody(req, 4096); } catch (e) { if (e instanceof BodyError && e.status === 413) return fail(res, 413, e.code, e.message); body = {}; }
  const label = typeof body.label === "string" ? body.label.slice(0, 64) : null;
  const key = generateKey();
  const salt = process.env.API_CLIENT_SALT;
  if (!salt) { console.error("[validation-api] API_CLIENT_SALT is not set"); return fail(res, 503, "store_unavailable", "Key issuance is not configured"); }
  let out;
  try { out = await defaultStore().issueKey({ clientHash: clientHash(req, salt), dailyLimit: LIMITS.keys_per_client_per_day, keyHash: hashKey(key), label }); } catch (e) {
    console.error("[validation-api] issue_key failed", e.status ?? "", e.message);
    return fail(res, 503, "store_unavailable", "The key store is unavailable; try again shortly");
  }
  if (!out.issued) return fail(res, 429, "issuance_exhausted", `At most ${LIMITS.keys_per_client_per_day} keys per client per UTC day`);
  return send(res, 201, envelope({ endpoint: ENDPOINT, claimClass: "OBSERVED", capitalKind: "NOT_APPLICABLE_SERVICE_STATUS", limits: LIMITS_TEXT, sources: [], data: { key, label, quotas: LIMITS, keys_remaining_today: out.remaining, note: "Store this key now. Only its hash is kept and it cannot be shown again." } }));
}
