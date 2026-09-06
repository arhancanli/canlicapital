// api/_lib/manifest.js
// The one list of routes this API serves. OpenAPI and /developers render FROM it, so neither can
// describe a route that does not exist. Function routes are filesystem routes on Vercel, not
// rewrites, so the static-API rewrite guard in build-api.mjs does not apply to them.
export const MANIFEST = Object.freeze([
  { path: "/api/v1/keys", method: "POST", keyed: false, summary: "Issue a free key. Returned once; only its hash is stored.", requestExample: { label: "my-backtest-runner" } },
  { path: "/api/v1/validate/deflated-sharpe", method: "POST", keyed: true, summary: "Probabilistic and deflated Sharpe from the seven contract inputs, or from a return series plus the trials behind it.", requestExample: { returns: [0.004, -0.002, 0.007, 0.001, -0.003, 0.005, 0.002, -0.001], periods_per_year: 252, effective_independent_trials: 30, cross_trial_sharpe_sd_annualized: 0.5 } },
  { path: "/api/v1/validate/overfitting", method: "POST", keyed: true, summary: "Probability of backtest overfitting by CSCV over the returns of every variant tried.", requestExample: { matrix: [[0.01, 0.002, -0.004], [-0.003, 0.001, 0.006], [0.004, -0.002, 0.001], [0.002, 0.003, -0.001]], n_splits: 4 } },
  { path: "/api/v1/validate/paper-evidence", method: "POST", keyed: true, summary: "Conformance of a performance record against the canli.paper-evidence.v0 standard.", requestExample: { record: { schema: "canli.paper-evidence.v0" } } },
  { path: "/api/v1/validate/breadth", method: "POST", keyed: true, summary: "Book Sharpe ceiling from per-sleeve quality and average pairwise correlation, and the sleeves a target needs.", requestExample: { sleeve_sharpe: 0.5, average_pairwise_correlation: 0.05, sleeves: 4, target: 1.5 } },
  { path: "/api/v1/validate/status", method: "GET", keyed: false, summary: "Service and store status with the quota constants in force." },
  { path: "/api/v1/receipts/{id}", method: "GET", keyed: false, summary: "A stored verdict by content-hash id. Immutable." },
]);
