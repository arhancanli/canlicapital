// api/_lib/limits.js
// THE quota constants. Enforcement (handler.js), the /developers page, the OpenAPI document and
// public/glassbox/validation_api_limits.json all import or derive from this object, so the number a
// reader sees is the number the service enforces. Change a value here and nowhere else.
export const LIMITS = Object.freeze({
  validations_per_key_per_day: 1000,
  keys_per_client_per_day: 5,
  max_body_bytes: 1024 * 1024,
  max_observations: 20000,
  max_variants: 200,
  max_cscv_combinations: 2000,
  wall_time_seconds: 10,
});

export const LIMITS_TEXT = Object.freeze([
  "This verdict is about the series exactly as submitted. The service never saw the data source, its costs, survivorship, or any lookahead in how the series was built.",
  "A deflated Sharpe or overfitting probability above or below any threshold is not admission to anything and is not a forecast.",
  "The receipt is content-hashed and reproducible from the open-source core it names. It is not signed.",
  `Quotas: ${LIMITS.validations_per_key_per_day} validations per key per UTC day, ${LIMITS.keys_per_client_per_day} keys per client per UTC day, ${LIMITS.max_body_bytes} bytes per request, ${LIMITS.max_observations} observations per series, ${LIMITS.max_variants} variants per matrix.`,
]);

// What the page has never said. None of this is enforcement text: it is what happens to a key
// after it is issued, which a reader otherwise has to find out by trying it. Any numeral here is
// a LIMITS value, never a hand-typed one, so it cannot drift from what the service actually does.
export const KEY_LIFECYCLE_TEXT = Object.freeze([
  "Keys do not expire once issued.",
  "There is no self-serve revoke or rotate endpoint in v1. If a key is compromised or simply unwanted, issue a new key and stop using the old one; the old one keeps working until someone revokes it by hand on the server side.",
  `"Client", for the daily key-issuance quota, means the request's IP address hashed together with a salt that rotates every UTC day, not a stored account. A shared office or NAT IP address draws from the same pool of ${LIMITS.keys_per_client_per_day} keys a day as every other request behind it.`,
]);
