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
