// api/mcp-beta.js
//
// The contributor beta MCP endpoint (canlicapital.com/mcp/beta): the validation server as it is on
// main now (mcp/src/server.mjs), before it is released to npm and to /mcp, for keys that hold
// contributor access. This is the one hosted handler that serves a package's working source; every
// other one imports only from mcp-released/ (scripts/mcp-released.test.mjs).
//
// Every request is checked before its body is read: the bearer key must be a validation API key
// whose tier is contributor (read_key_tier, supabase/migrations/20261005_contributor_access.sql).
// Everyone else gets a 403 whose error says how to get access, and /mcp stays open to everyone.
// The request then runs exactly as on /mcp under the caller's own key (_lib/mcp-hosted.js), so
// validations count against that key's contributor quota. The key is never echoed or logged.
import { configuredToolsets, createSession, registerAll, SERVER_INFO, SERVER_INSTRUCTIONS } from "../mcp/src/server.mjs";
import { bearerKey, hashKey } from "./_lib/auth.js";
import { CLAIM_ISSUE_URL, GUIDE_URL, HOW_TO_GET_ACCESS, KEY_LOOKUP_URL, RELEASED_MCP_URL, isContributor } from "./_lib/contributor-access.js";
import { defaultStore } from "./_lib/handler.js";
import { inProcessFetch } from "./_lib/in-process-fetch.js";
import { createValidationMcpHandler } from "./_lib/mcp-hosted.js";

const WORKING = Object.freeze({ configuredToolsets, createSession, registerAll, SERVER_INFO, SERVER_INSTRUCTIONS });

// The unreleased build says so in initialize, so a client connected to both endpoints can tell
// them apart: same name, a "(contributor beta)" title and a "+beta" build tag on the version.
export const BETA_SERVER_INFO = Object.freeze({ ...SERVER_INFO, title: `${SERVER_INFO.title} (contributor beta)`, version: `${SERVER_INFO.version}+beta` });

const denied = (reason, message, extra = {}) => ({
  error: {
    status: 403,
    code: -32001,
    message: `${message} ${HOW_TO_GET_ACCESS}`,
    data: { reason, ...extra, fingerprint_lookup: KEY_LOOKUP_URL, claim_issue: CLAIM_ISSUE_URL, guide: GUIDE_URL, released_endpoint: RELEASED_MCP_URL },
  },
});

// Contributor keys only. A missing or malformed key, an unknown or revoked key and a key without
// the tier are each a 403 naming the reason; a store that cannot answer is a 503, never a pass.
export function contributorAuthorizer({ store } = {}) {
  return async function authorize(req) {
    const key = bearerKey(req);
    if (!key) return denied("no_key", "The beta MCP endpoint needs a contributor key in the Authorization header (Bearer ck_live_...).");
    const fingerprint = hashKey(key);
    let record;
    try { record = await (store ?? defaultStore()).readKeyTier(fingerprint); } catch (e) {
      console.error("[mcp-beta] contributor check failed", e.status ?? "", e.message);
      return { error: { status: 503, code: -32603, message: "The contributor access check is unavailable; try again shortly." } };
    }
    if (!record) return denied("unknown_or_revoked_key", "This key is unknown or revoked.");
    // Its fingerprint is what its holder would post to claim access; it cannot authenticate.
    if (!isContributor(record)) return denied("not_a_contributor_key", `This key does not have contributor access. Its fingerprint is ${fingerprint}.`, { fingerprint });
    return { key, keySource: "caller" };
  };
}

export function createBetaHandler({ store, env = () => process.env, fetchImpl = inProcessFetch() } = {}) {
  return createValidationMcpHandler({ server: WORKING, serverInfo: BETA_SERVER_INFO, env, fetchImpl, path: "/mcp/beta", authorize: contributorAuthorizer({ store }) });
}

export default createBetaHandler();
