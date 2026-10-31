// Anonymous daily counts of what visitors do, to see whether the site works for them. Only the action's name
// arrives; nothing about the person is read or kept. Without Supabase set, it answers and counts nothing.
const ACTIONS = new Set(["check_started", "check_answered", "check_failed", "lookup", "share", "email_left", "install_copied", "returned"]);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  const what = String(typeof req.body === "string" ? req.body : req.body?.action ?? "").trim();
  if (!ACTIONS.has(what)) return res.status(204).end();
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (url && key) {
    try {
      await fetch(`${url}/rest/v1/rpc/count_site_action`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ what }), signal: AbortSignal.timeout(3000) });
    } catch { /* a lost count never fails a visitor */ }
  }
  return res.status(204).end();
}

export { ACTIONS };
