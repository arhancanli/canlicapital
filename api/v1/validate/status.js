// api/v1/validate/status.js
import { envelope, send } from "../../_lib/envelope.js";
import { defaultStore, sourcesFor } from "../../_lib/handler.js";
import { LIMITS, LIMITS_TEXT } from "../../_lib/limits.js";

// usage_summary() is an aggregate-only RPC (supabase/migrations/20260906_usage_summary.sql). It
// fails independently of the ping above: before that migration is applied, or on any transient
// store error, this must degrade to usage: null and never turn a working request into a 5xx or
// change what store_reachable means.
async function readUsage(store) {
  try {
    return { usage: await store.usageSummary(), usage_available: true };
  } catch (e) {
    console.error("[validation-api] usage summary unavailable", e.message);
    return { usage: null, usage_available: false };
  }
}

export function createStatusHandler({ store } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return send(res, 405, { error: "GET only" }); }
    const activeStore = store ?? defaultStore();
    let store_ok = false;
    try { store_ok = await activeStore.ping(); } catch (e) { console.error("[validation-api] status ping failed", e.message); }
    const { usage, usage_available } = await readUsage(activeStore);
    const body = envelope({
      endpoint: "validate/status",
      claimClass: "OBSERVED",
      capitalKind: "NOT_APPLICABLE_SERVICE_STATUS",
      limits: LIMITS_TEXT,
      sources: sourcesFor(["js/dsr-core.js", "js/pbo-core.js"]),
      data: { service: "validation-api", store_reachable: store_ok, quotas: LIMITS, usage, usage_available },
    });
    return send(res, store_ok ? 200 : 503, body, { cacheControl: "no-store" });
  };
}

export default createStatusHandler();
