// api/_lib/contributor-access.js
// What contributor access is and how to claim it, in one place for GET /api/v1/keys/me and the
// beta MCP endpoint (api/mcp-beta.js). The figures are LIMITS values; the tier itself is granted
// by scripts/grant-contributor-access.mjs through supabase/migrations/20261005_contributor_access.sql.
//
// A key is named, never shared, by its label or its fingerprint: the hex SHA-256 of the key, which
// is exactly the key_hash the store keeps (auth.js hashKey) and what this prints locally.
import { LIMITS } from "./limits.js";

export const CONTRIBUTOR_TIER = "contributor";
export const BETA_MCP_URL = "https://canlicapital.com/mcp/beta";
export const RELEASED_MCP_URL = "https://canlicapital.com/mcp";
export const KEY_LOOKUP_URL = "https://canlicapital.com/api/v1/keys/me";
export const CLAIM_ISSUE_URL = "https://github.com/arhancanli/canlicapital/issues/new?template=contributor-access.yml";
export const GUIDE_URL = "https://github.com/arhancanli/canlicapital/blob/main/CONTRIBUTING.md#rewards-contributor-access";
export const FINGERPRINT_COMMAND = `printf '%s' "$CANLI_KEY" | shasum -a 256`;

export const HOW_TO_GET_ACCESS = `Contributor access is for people whose pull request has been merged into https://github.com/arhancanli/canlicapital: open a Contributor access issue (${CLAIM_ISSUE_URL}) naming your key by its label or its fingerprint, never the key itself. GET ${KEY_LOOKUP_URL} returns the fingerprint, as does ${FINGERPRINT_COMMAND}. The released server stays open to everyone at ${RELEASED_MCP_URL}.`;

// The limit a key's validations are admitted under: the same rule as the quota function, the
// larger of the standard limit and the tier's, so this never reports a figure the store would not
// enforce.
export const validationsPerDay = (record) => Math.max(LIMITS.validations_per_key_per_day, record?.daily_limit ?? 0);

export const isContributor = (record) => record?.tier === CONTRIBUTOR_TIER;
