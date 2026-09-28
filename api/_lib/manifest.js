import { LIMITS } from './limits.js';
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
    path: "/api/v1/keys/revoke", method: "POST", keyed: true, quota: false,
    summary: "Permanently revoke the bearer key without consuming validation quota. Already admitted requests may finish; public receipts remain available.",
    requestExample: {}, requestClosed: true, requestBodyRequired: false,
    maxBodyBytes: LIMITS.max_key_revoke_body_bytes,
  },
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
  {
    path: "/api/v1/validate/track-record", method: "POST", keyed: true,
    summary: "Minimum track record length for a Sharpe to clear a benchmark at a confidence level, and the probabilistic Sharpe of a record of a given length.",
    // The worked example of Bailey and López de Prado (2012): an annualized Sharpe of 2 against 1
    // on daily Normal returns needs 2.73 years; a two-year record is not long enough.
    requestExample: { observed_sharpe_annualized: 2, benchmark_sharpe_annualized: 1, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3, observations: 504 },
    requestOptional: ["benchmark_sharpe_annualized", "observations"],
    requestExtraProperties: {
      confidence: { type: "number", description: "Defaults to 0.95. Strictly between 0 and 1." },
    },
  },
  {
    path: "/api/v1/validate/backtest-length", method: "POST", keyed: true,
    summary: "Minimum backtest length for the best of N independent trials not to reach a target Sharpe by luck, and the trials a backtest's years allow.",
    // The paper's own statement (Bailey, Borwein, López de Prado and Zhu 2014, p. 11): with only 5
    // years of data, no more than 45 independent configurations should be tried at a target of 1.
    requestExample: { effective_independent_trials: 45, backtest_years: 5, target_sharpe_annualized: 1 },
    requestOptional: ["effective_independent_trials", "backtest_years", "target_sharpe_annualized"],
  },
  {
    path: "/api/v1/validate/haircut-sharpe", method: "POST", keyed: true,
    summary: "Haircut Sharpe ratio for multiple testing: the p-value of a Sharpe found among several tests, adjusted by Bonferroni, for independent tests, and with the other tests' Sharpe ratios by Holm and BHY.",
    // Exhibit 5 of Harvey and Liu (2015): 120 months, an annualized Sharpe of 1, autocorrelation 0.1
    // and 100 tests; the authors' Haircut_SR.m gives a Bonferroni haircut of 74.6 percent.
    requestExample: { observed_sharpe_annualized: 1, periods_per_year: 12, observations: 120, tests: 100, autocorrelation: 0.1 },
    requestOptional: ["tests", "autocorrelation", "other_sharpe_ratios_annualized"],
    requestExtraProperties: {
      other_sharpe_ratios_annualized: { type: "array", items: { type: "number" }, description: "Annualized Sharpe ratios of the other tests, over the same observations; adds Holm and BHY." },
    },
  },
  {
    path: "/api/v1/validate/luck-trials", method: "POST", keyed: true,
    summary: "Luck-equivalent trials: how many skill-less strategies a search would have had to try for its best to reach the observed Sharpe by luck, and, with a trial count, the chance that it did.",
    // Three years of daily returns at an annualized Sharpe of 1.5, found among 200 trials.
    requestExample: { observed_sharpe_annualized: 1.5, periods_per_year: 252, observations: 756, effective_independent_trials: 200, skew: -0.4, autocorrelation: 0.05 },
    requestOptional: ["effective_independent_trials", "skew", "autocorrelation"],
  },
  {
    path: "/api/v1/validate/reality-check", method: "POST", keyed: true,
    summary: "Data-snooping tests on every variant a search tried: Hansen's SPA, White's Reality Check and Romano and Wolf's StepM on one seeded stationary bootstrap. Did the best variant beat the benchmark by more than the best of K would by luck, and which variants did?",
    // Thirty periods of three variants' returns; the first has a small edge. Real searches pass hundreds of periods.
    requestExample: { matrix: [[0.0045, 0.0065, -0.0005], [0.0073, -0.0031, -0.0042], [-0.0002, -0.0055, 0.0058], [-0.0049, 0.0051, -0.0002], [0.0008, 0.0038, -0.0046], [0.0041, -0.0064, 0.0023], [0.0006, -0.0016, 0.0012], [0.002, 0.007, 0.0015], [0.0068, -0.0007, -0.0062], [0.0024, -0.0066, 0.0044], [-0.0051, 0.003, 0.002], [-0.0018, 0.0055, -0.0036], [0.0049, -0.0047, -0.0004], [0.003, -0.0037, 0.0011], [0.0006, 0.0058, 0.0041], [0.0047, 0.0016, -0.0068], [0.0042, -0.006, 0.0021], [-0.0036, 0.0004, 0.003], [-0.0041, 0.0055, -0.0012], [0.0041, -0.0022, -0.0022], [0.0056, -0.0044, -0.0006], [0.0009, 0.0034, 0.0062], [0.0021, 0.0029, -0.0056], [0.0046, -0.0039, -0.0003], [-0.0011, -0.0014, 0.0022], [-0.0051, 0.0039, 0.0015], [0.0019, 0.0001, -0.0024], [0.0073, -0.0034, -0.0031], [0.0027, 0.0008, 0.0069], [-0.0001, 0.0026, -0.0033]] },
    requestOptional: [],
    requestExtraProperties: {
      benchmark: { type: "array", items: { type: "number" }, description: "The benchmark's return in each period, one per row of matrix. Defaults to zero: the test is then whether the best variant's mean return beats zero." },
      block_length: { type: "integer", description: "Mean block length of the stationary bootstrap, in periods. Defaults to round(n^(1/3))." },
      reps: { type: "integer", description: "Bootstrap draws. Defaults to 2000, fewer when the matrix is large; periods x variants x draws may not exceed 200,000,000." },
      seed: { type: "integer", description: "Defaults to 42. Seeds the service's own generator, so a result reproduces exactly." },
      alpha: { type: "number", description: "Familywise error for StepM and the verdict. Defaults to 0.05." },
    },
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
