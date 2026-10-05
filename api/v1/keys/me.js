// api/v1/keys/me.js
// GET /api/v1/keys/me: which key the bearer key is, without the key. Returns the key's
// fingerprint (the hex SHA-256 of the key: the key_hash the store keeps, and what
// printf '%s' "$CANLI_KEY" | shasum -a 256 prints), its label and its access tier, so a contributor
// can name the key in a Contributor access issue without ever posting it. A fingerprint cannot
// authenticate. Consumes no validation quota and stores nothing.
import { bearerKey, hashKey } from "../../_lib/auth.js";
import { BETA_MCP_URL, CLAIM_ISSUE_URL, isContributor, validationsPerDay } from "../../_lib/contributor-access.js";
import { envelope, errorEnvelope, send } from "../../_lib/envelope.js";
import { defaultStore } from "../../_lib/handler.js";
import { LIMITS_TEXT } from "../../_lib/limits.js";

const ENDPOINT = "keys/me";

// The response data for the presented key's fingerprint and its read_key_tier record. Exported so
// the tests and the OpenAPI document describe the same fields the handler returns.
export function keyProfile(fingerprint, record) {
  const contributor = isContributor(record);
  const perDay = validationsPerDay(record);
  return {
    fingerprint,
    label: record.label,
    tier: contributor ? "contributor" : "standard",
    validations_per_day: perDay,
    contributor_since: contributor ? record.granted_at : null,
    beta_mcp: { url: BETA_MCP_URL, access: contributor },
    note: contributor
      ? `This key has contributor access: ${perDay} validations per UTC day and the beta MCP endpoint, which serves the unreleased validation server.`
      : `The fingerprint is the key's SHA-256 and cannot authenticate. After a pull request of yours is merged, name this key by its fingerprint or label, never the key itself, in a Contributor access issue: ${CLAIM_ISSUE_URL}`,
  };
}

export function createKeyProfileHandler({ store } = {}) {
  const fail = (res, status, code, message) => send(res, status, errorEnvelope({ endpoint: ENDPOINT, code, message, limits: LIMITS_TEXT }));
  return async function handler(req, res) {
    if (req.method === "OPTIONS") return send(res, 204, "", {});
    if (req.method !== "GET") { res.setHeader("Allow", "GET, OPTIONS"); return fail(res, 405, "method_not_allowed", "Use GET"); }
    const key = bearerKey(req);
    if (!key) return fail(res, 401, "unauthorized", "Send the key to look up as Authorization: Bearer ck_live_...");
    const fingerprint = hashKey(key);
    let record;
    try { record = await (store ?? defaultStore()).readKeyTier(fingerprint); } catch (e) {
      console.error("[validation-api] read_key_tier failed", e.status ?? "", e.message);
      return fail(res, 503, "store_unavailable", "The key store is unavailable; try again shortly");
    }
    if (!record) return fail(res, 401, "unauthorized", "Unknown or revoked key");
    return send(res, 200, envelope({ endpoint: ENDPOINT, claimClass: "OBSERVED", capitalKind: "NOT_APPLICABLE_SERVICE_STATUS", limits: LIMITS_TEXT, sources: [], data: keyProfile(fingerprint, record) }));
  };
}

export default createKeyProfileHandler();
