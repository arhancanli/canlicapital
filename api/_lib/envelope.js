// api/_lib/envelope.js
// The same envelope scripts/build-api.mjs emits for the static endpoints, with the two values
// user-submitted data needs. Kept deliberately parallel: a consumer who parsed one can parse both.
const ORIGIN = "https://canlicapital.com";
const VERSION = "v1";
export const CLAIM_USER = "USER_SUBMITTED_SCENARIO";
export const CAPITAL_USER = "NOT_APPLICABLE_USER_SUBMITTED";
export const DEVELOPERS_PAGE = `${ORIGIN}/developers`;

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export function envelope({ endpoint, claimClass = CLAIM_USER, capitalKind = CAPITAL_USER, humanPage = DEVELOPERS_PAGE, limits, sources, data, receipt }) {
  if (!Array.isArray(limits) || limits.length === 0) throw new Error(`api: ${endpoint} declares no limits`);
  const body = {
    schema: `canli.api.${VERSION}`,
    endpoint: `/api/${VERSION}/${endpoint}`,
    generated_at: nowIso(),
    claim_class: claimClass,
    capital_kind: capitalKind,
    canonical_human_page: humanPage,
    limits: [...limits],
    sources: sources.map((s) => ({ path: s.path, sha256: s.sha256, url: s.url ?? `${ORIGIN}/${s.path.replace(/^public\//, "")}` })),
    data,
  };
  if (receipt) body.receipt = receipt;
  return body;
}

export function errorEnvelope({ endpoint, code, message, pointer, limits, sources = [] }) {
  const body = envelope({ endpoint, limits, sources, data: {} });
  body.error = pointer ? { code, message, pointer } : { code, message };
  return body;
}

export function quotaHeaders({ limit, remaining, resetIso }) {
  return { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(Math.max(0, remaining)), "X-RateLimit-Reset": resetIso };
}

export function send(res, status, body, { headers = {}, cacheControl = "no-store" } = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(`${JSON.stringify(body)}\n`);
}

export function nextUtcMidnightIso(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
