// api/_lib/manifest.js
// The one list of routes this API serves. OpenAPI and /developers render FROM it, so neither can
// describe a route that does not exist.
//
// `requestOptional` names the keys of `requestExample` that a POST body may omit; every other key
// in the example is required. `requestExtraProperties` documents fields a handler accepts that do
// not appear in the example itself (deflated-sharpe's alternate contract-input mode), so the
// generated schema can list them without inventing a second example. Function routes are
// filesystem routes on Vercel, not rewrites, so the static-API rewrite guard in build-api.mjs does
// not apply to them.
export const MANIFEST = Object.freeze([
  {
    path: "/api/v1/keys", method: "POST", keyed: false,
    summary: "Issue a free key. Returned once; only its hash is stored.",
    requestExample: { label: "my-backtest-runner" },
    requestOptional: ["label"],
  },
  {
    path: "/api/v1/validate/deflated-sharpe", method: "POST", keyed: true,
    summary: "Probabilistic and deflated Sharpe from the seven contract inputs, or from a return series plus the trials behind it.",
    requestExample: { returns: [0.004, -0.002, 0.007, 0.001, -0.003, 0.005, 0.002, -0.001], periods_per_year: 252, effective_independent_trials: 30, cross_trial_sharpe_sd_annualized: 0.5 },
    // Two input shapes, not one flattened optional-property bag: a request is either the seven
    // contract fields, or a return series plus the trials behind it. Each mode names its own
    // required fields and its own example, so OpenAPI can render them as `oneOf` and a developer
    // sees both instead of one example that silently mixes fields from either shape. (This
    // replaces requestOptional/requestExtraProperties/requestDescription for this route: those
    // described the same two-shape reality as one flattened optional-property bag.)
    modes: [
      {
        name: "contract_inputs",
        label: "Mode 1: the seven contract inputs",
        required: ["observed_sharpe_annualized", "observations", "periods_per_year", "skew", "non_excess_kurtosis", "effective_independent_trials", "cross_trial_sharpe_sd_annualized"],
        // Same vector as daily_long_sample_heavy_tail in deflated_sharpe_calculator_contract.json.
        example: { observed_sharpe_annualized: 1.5, observations: 730, periods_per_year: 365, skew: -0.5, non_excess_kurtosis: 5.0, effective_independent_trials: 229, cross_trial_sharpe_sd_annualized: 0.57 },
      },
      {
        name: "return_series",
        label: "Mode 2: a return series plus the trials behind it",
        required: ["returns", "periods_per_year", "effective_independent_trials", "cross_trial_sharpe_sd_annualized"],
        example: { returns: [0.004, -0.002, 0.007, 0.001, -0.003, 0.005, 0.002, -0.001], periods_per_year: 252, effective_independent_trials: 30, cross_trial_sharpe_sd_annualized: 0.5 },
      },
    ],
  },
  {
    path: "/api/v1/validate/overfitting", method: "POST", keyed: true,
    summary: "Probability of backtest overfitting by CSCV over the returns of every variant tried.",
    requestExample: { matrix: [[0.01, 0.002, -0.004], [-0.003, 0.001, 0.006], [0.004, -0.002, 0.001], [0.002, 0.003, -0.001]], n_splits: 4 },
    requestOptional: ["n_splits"],
    requestExtraProperties: {
      max_combinations: { type: "number", description: "Defaults to the service ceiling; may not exceed it." },
      seed: { type: "number", description: "Defaults to 42. Seeds the service's own sampler for the non-exhaustive case." },
    },
  },
  {
    path: "/api/v1/validate/paper-evidence", method: "POST", keyed: true,
    summary: "Conformance of a performance record against the canli.paper-evidence.v0 standard.",
    requestExample: { record: { schema: "canli.paper-evidence.v0" } },
    requestOptional: [],
  },
  {
    path: "/api/v1/validate/breadth", method: "POST", keyed: true,
    summary: "Book Sharpe ceiling from per-sleeve quality and average pairwise correlation, and the sleeves a target needs.",
    requestExample: { sleeve_sharpe: 0.5, average_pairwise_correlation: 0.05, sleeves: 4, target: 1.5 },
    requestOptional: ["sleeves", "target"],
  },
  { path: "/api/v1/validate/status", method: "GET", keyed: false, summary: "Service and store status with the quota constants in force." },
  { path: "/api/v1/receipts/{id}", method: "GET", keyed: false, summary: "A stored verdict by content-hash id. Immutable." },
  {
    path: "/api/v1/receipts/{id}/badge.svg", method: "GET", keyed: false,
    summary: "An embeddable SVG badge for a receipt: the formula version and the receipt id prefix only, never a pass or fail mark.",
  },
]);

// The default `label` each integration on this site sends with its own POST /api/v1/keys call, so
// a count of api_keys grouped by label is a source breakdown with no tracking parameter. One
// table: the browser "Get a key" button and the curl, Python and JavaScript quickstart blocks on
// /developers all read these same four strings, so changing where a label points is a change in
// exactly one place, not three.
export const SNIPPET_LABELS = Object.freeze({
  developersPage: "developers-page",
  quickstartCurl: "quickstart-curl",
  quickstartPython: "quickstart-python",
  quickstartJs: "quickstart-js",
});
