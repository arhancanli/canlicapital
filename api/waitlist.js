// =============================================================================
// CANLI CAPITAL / api/waitlist.js
// -----------------------------------------------------------------------------
// Vercel serverless function (Node runtime) that receives waitlist signups for
// the AlphaForge pre-launch. It validates the email server side, blocks the
// honeypot, and persists the signup. Persistence is ENV GATED and key free by
// default, so this DEPLOYS TODAY WITHOUT ANY KEYS and the form works on deploy.
//
// PERSISTENCE PRECEDENCE (first matching path wins):
//   1. Supabase: if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both set,
//      insert {email, created_at} into the `waitlist` table via the REST API.
//   2. Resend: else if RESEND_API_KEY is set, email the signup to
//      WAITLIST_NOTIFY_TO (or fall back to WAITLIST_FROM).
//   3. Accept + log: else accept the signup, log it to the function output, and
//      return success. The form works immediately; wire real storage later by
//      adding the env vars below, with no code change.
//
// ENVIRONMENT VARIABLES (all optional; none required to deploy):
//   SUPABASE_URL                Project URL, e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   Service role key (server side only, never shipped
//                               to the client). Grants insert on `waitlist`.
//   RESEND_API_KEY              Resend API key (used only if Supabase is absent).
//   WAITLIST_FROM               From address for the notification email.
//                               Default "AlphaForge <onboarding@resend.dev>".
//   WAITLIST_NOTIFY_TO          Recipient for the notification email.
//                               Default "arhancanli@icloud.com".
//
// SUPABASE `waitlist` TABLE SCHEMA (run once in the SQL editor):
//   create table if not exists public.waitlist (
//     id          bigint generated always as identity primary key,
//     email       text not null unique,
//     created_at  timestamptz not null default now()
//   );
//   -- RLS can stay enabled; the service role key bypasses it. Do not expose
//   -- this key to the browser. No anon insert policy is needed for this flow.
//
// SECURITY: secrets are read from process.env and never echoed in a response or
// error. A duplicate email (Supabase unique violation) is treated as success,
// so a repeat signup is idempotent and never leaks whether an address exists in
// an error message.
// =============================================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254; // RFC 5321 practical upper bound

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // This endpoint is same origin in production. Keep it tight; no wildcard CORS.
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// Vercel parses JSON bodies into req.body for known content types. Fall back to
// reading the raw stream so a plain form POST or an odd content type still works.
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try { return JSON.parse(req.body); } catch (e) { /* fall through */ }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Support application/x-www-form-urlencoded for a no-JS native form post.
    const params = new URLSearchParams(raw);
    const obj = {};
    for (const [k, v] of params) obj[k] = v;
    return obj;
  }
}

// ---- persistence paths ------------------------------------------------------

async function persistToSupabase(email) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(url.replace(/\/$/, "") + "/rest/v1/waitlist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: "Bearer " + key,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ email }),
  });

  if (res.ok) return { ok: true };

  // 409 is a unique violation: the address is already on the list. That is a
  // success from the visitor's point of view, and idempotent for us.
  if (res.status === 409) return { ok: true, duplicate: true };

  // Read the body for the server log only; never return it to the client.
  let detail = "";
  try { detail = await res.text(); } catch (e) { /* ignore */ }
  return { ok: false, status: res.status, detail };
}

async function persistToResend(email) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.WAITLIST_FROM || "Canli Capital <onboarding@resend.dev>";
  const to = process.env.WAITLIST_NOTIFY_TO || "arhancanli@icloud.com";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Canli Capital waitlist: new signup",
      text:
        "A new address joined the Canli Capital early-access waitlist.\n\n" +
        "Email: " + email + "\n" +
        "Time: " + new Date().toISOString() + "\n",
    }),
  });

  if (res.ok) return { ok: true };
  let detail = "";
  try { detail = await res.text(); } catch (e) { /* ignore */ }
  return { ok: false, status: res.status, detail };
}

// ---- handler ----------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: "Could not read request." });
  }

  // Honeypot. A filled `company` field is a bot. Return a quiet success and do
  // nothing, so the bot believes it succeeded and we store nothing.
  const honeypot = typeof body.company === "string" ? body.company.trim() : "";
  if (honeypot !== "") {
    return json(res, 200, { ok: true });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return json(res, 400, { ok: false, error: "Enter a valid email address." });
  }

  const hasSupabase =
    Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasResend = Boolean(process.env.RESEND_API_KEY);

  try {
    if (hasSupabase) {
      const result = await persistToSupabase(email);
      if (!result.ok) {
        console.error("[waitlist] supabase insert failed", result.status, result.detail);
        return json(res, 502, { ok: false, error: "Could not save right now." });
      }
      return json(res, 200, { ok: true });
    }

    if (hasResend) {
      const result = await persistToResend(email);
      if (!result.ok) {
        console.error("[waitlist] resend send failed", result.status, result.detail);
        return json(res, 502, { ok: false, error: "Could not save right now." });
      }
      return json(res, 200, { ok: true });
    }

    // No store configured. Accept, log for the operator, and succeed so the
    // form works on a keyless deploy. Wire Supabase or Resend later, no code
    // change needed.
    console.log("[waitlist] signup accepted (no store configured):", email);
    return json(res, 200, { ok: true, stored: false });
  } catch (err) {
    // Never leak internals. Log the real error, return a generic message.
    console.error("[waitlist] unexpected error", err && err.message ? err.message : err);
    return json(res, 500, { ok: false, error: "Something interrupted that." });
  }
}
