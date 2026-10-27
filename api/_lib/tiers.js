// api/_lib/tiers.js
// THE hosted-server tiers. A request with no key is free; a key (Authorization: Bearer ck_live_...)
// carries the tier its billing set. Enforcement (api/mcp-canli.js), the billing webhook and the
// pricing page read this object, so the number a reader sees is the number the service enforces.
export const TIERS = Object.freeze({
  free: Object.freeze({ requests_per_minute: 60, max_body_bytes: 1_048_576 }),
  pro: Object.freeze({ requests_per_minute: 600, max_body_bytes: 8 * 1_048_576 }),
  team: Object.freeze({ requests_per_minute: 1200, max_body_bytes: 16 * 1_048_576 }),
  enterprise: Object.freeze({ requests_per_minute: 3000, max_body_bytes: 16 * 1_048_576 }),
});
export const TIER_NAMES = Object.freeze(Object.keys(TIERS));
export const tierLimits = (tier) => TIERS[tier] ?? TIERS.free;
