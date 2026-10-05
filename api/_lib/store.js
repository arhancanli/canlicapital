// api/_lib/store.js
// Supabase over REST with fetch, the way api/waitlist.js does it: no SDK, the service-role key from
// env only, every write through a SECURITY DEFINER RPC declared in supabase/migrations.
export class StoreError extends Error {
  constructor(status, detail) { super(`store ${status}: ${detail}`); this.status = status; this.detail = detail; }
}

// PostgREST's answer for a function it does not know: the migration that adds it is not applied.
const isMissingFunction = (e) => e instanceof StoreError && e.status === 404 && /PGRST202/.test(String(e.detail));

// read_key_tier's row, checked field by field: the key's label, and its tier with the limit that
// comes with it, or no tier at all. Anything else is a store fault, not an answer.
function keyTierRecord(out) {
  const valid = out !== null && typeof out === "object" && !Array.isArray(out)
    && (out.label === null || typeof out.label === "string")
    && (out.tier === null
      ? out.daily_limit === null && out.granted_at === null
      : out.tier === "contributor" && Number.isSafeInteger(out.daily_limit) && out.daily_limit > 0 && typeof out.granted_at === "string" && Number.isFinite(Date.parse(out.granted_at)));
  if (!valid) throw new Error("Invalid key tier response");
  return { label: out.label, tier: out.tier, daily_limit: out.daily_limit, granted_at: out.granted_at };
}

export function createStore({ url, serviceKey, fetchImpl = globalThis.fetch }) {
  if (!url || !serviceKey) throw new Error("store: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const base = String(url).replace(/\/$/, "") + "/rest/v1";
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  async function call(path, init) {
    const res = await fetchImpl(base + path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    if (!res.ok) throw new StoreError(res.status, (await res.text()).slice(0, 300));
    if (res.status === 204 || res.status === 201) return null;
    return res.json();
  }

  return {
    // One round trip: the admission returns what remains and the limit it enforced, which is the
    // larger of dailyLimit and the key's tier (supabase/migrations/20261005_contributor_access.sql).
    // Until that migration is applied PostgREST does not know the function, nothing was admitted
    // or counted, and the original admission still enforces dailyLimit, so validation keeps working.
    async consumeQuota(keyHash, dailyLimit) {
      const body = JSON.stringify({ p_key_hash: keyHash, p_daily_limit: dailyLimit });
      let out;
      try { out = await call("/rpc/consume_quota_with_limit", { method: "POST", body }); } catch (e) {
        if (!isMissingFunction(e)) throw e;
        const remaining = await call("/rpc/consume_quota", { method: "POST", body });
        return { remaining: Number(remaining), limit: dailyLimit };
      }
      if (!out || !Number.isSafeInteger(out.remaining) || !Number.isSafeInteger(out.daily_limit)) throw new Error("Invalid quota response");
      return { remaining: out.remaining, limit: out.daily_limit };
    },
    // The presented key's label and tier, or null for an unknown or revoked key.
    async readKeyTier(keyHash) {
      const out = await call("/rpc/read_key_tier", { method: "POST", body: JSON.stringify({ p_key_hash: keyHash }) });
      return out === null ? null : keyTierRecord(out);
    },
    // Maintainer only (scripts/grant-contributor-access.mjs). The key is named by its fingerprint
    // (the stored key_hash), by a label exactly one active key carries, or by both; never the key.
    async grantKeyTier({ keyHash, label, tier, dailyLimit, githubLogin, note }) {
      const out = await call("/rpc/grant_key_tier", { method: "POST", body: JSON.stringify({ p_tier: tier, p_daily_limit: dailyLimit, p_github_login: githubLogin, p_key_hash: keyHash ?? null, p_label: label ?? null, p_note: note ?? null }) });
      if (!out || typeof out.granted !== "boolean" || (!out.granted && typeof out.reason !== "string")) throw new Error("Invalid grant response");
      return out;
    },
    async revokeKeyTier({ keyHash, label }) {
      const out = await call("/rpc/revoke_key_tier", { method: "POST", body: JSON.stringify({ p_key_hash: keyHash ?? null, p_label: label ?? null }) });
      if (!out || typeof out.revoked !== "boolean" || (!out.revoked && typeof out.reason !== "string")) throw new Error("Invalid tier revocation response");
      return out;
    },
    async issueKey({ clientHash, dailyLimit, keyHash, label, sourceHost }) {
      const out = await call("/rpc/issue_key", { method: "POST", body: JSON.stringify({ p_client_hash: clientHash, p_daily_limit: dailyLimit, p_key_hash: keyHash, p_label: label ?? null, p_source_host: sourceHost ?? null }) });
      return { issued: Boolean(out?.issued), remaining: Number(out?.remaining ?? 0) };
    },
    async revokeKey(keyHash) {
      const out = await call("/rpc/revoke_key", { method: "POST", body: JSON.stringify({ p_key_hash: keyHash }) });
      if (!out || typeof out.revoked !== 'boolean' || (out.revoked && (typeof out.revoked_at !== 'string' || !Number.isFinite(Date.parse(out.revoked_at))))) throw new Error('Invalid revocation response');
      return out;
    },
    async saveReceipt(receipt) {
      await call("/receipts?on_conflict=id", { method: "POST", headers: { Prefer: "return=minimal,resolution=ignore-duplicates" }, body: JSON.stringify(receipt) });
    },
    async getReceipt(id) {
      const rows = await call(`/receipts?id=eq.${encodeURIComponent(id)}&select=*`, { method: "GET" });
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    },
    async ping() {
      const rows = await call("/receipts?select=id&limit=1", { method: "GET" });
      return Array.isArray(rows);
    },
    async usageSummary() {
      return call("/rpc/usage_summary", { method: "POST", body: "{}" });
    },
  };
}
