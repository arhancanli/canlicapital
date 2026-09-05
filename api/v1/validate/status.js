// api/v1/validate/status.js
import { envelope, send } from "../../_lib/envelope.js";
import { defaultStore, sourcesFor } from "../../_lib/handler.js";
import { LIMITS, LIMITS_TEXT } from "../../_lib/limits.js";

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return send(res, 405, { error: "GET only" }); }
  let store_ok = false;
  try { store_ok = await defaultStore().ping(); } catch (e) { console.error("[validation-api] status ping failed", e.message); }
  const body = envelope({ endpoint: "validate/status", claimClass: "OBSERVED", capitalKind: "NOT_APPLICABLE_SERVICE_STATUS", limits: LIMITS_TEXT, sources: sourcesFor(["js/dsr-core.js", "js/pbo-core.js"]), data: { service: "validation-api", store_reachable: store_ok, quotas: LIMITS } });
  return send(res, store_ok ? 200 : 503, body, { cacheControl: "no-store" });
}
