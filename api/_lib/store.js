// api/_lib/store.js
// Supabase over REST with fetch, the way api/waitlist.js does it: no SDK, the service-role key from
// env only, every write through a SECURITY DEFINER RPC declared in supabase/migrations.
export class StoreError extends Error {
  constructor(status, detail) { super(`store ${status}: ${detail}`); this.status = status; this.detail = detail; }
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
    async consumeQuota(keyHash, dailyLimit) {
      const remaining = await call("/rpc/consume_quota", { method: "POST", body: JSON.stringify({ p_key_hash: keyHash, p_daily_limit: dailyLimit }) });
      return { remaining: Number(remaining) };
    },
    async issueKey({ clientHash, dailyLimit, keyHash, label }) {
      const out = await call("/rpc/issue_key", { method: "POST", body: JSON.stringify({ p_client_hash: clientHash, p_daily_limit: dailyLimit, p_key_hash: keyHash, p_label: label ?? null }) });
      return { issued: Boolean(out?.issued), remaining: Number(out?.remaining ?? 0) };
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
  };
}
