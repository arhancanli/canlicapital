// mcp/src/schemas.mjs
//
// Input schemas for canlicapital.com's free validation API, kept in one module so a test can
// round-trip them against the API's own examples: public/api/v1/openapi.json, the manifest at
// api/_lib/manifest.js, and the seven-field contract at
// public/glassbox/deflated_sharpe_calculator_contract.json. See
// docs/superpowers/specs/2026-09-05-developer-key-validation-api-design.md section 4 for the
// validator semantics these shapes mirror.
import { z } from "zod";

// One description per input field, shared by every shape that uses the field, so a client reads
// the same meaning, unit and example wherever the field appears. Agents choose arguments from
// these; a bare "number" leaves units (fraction or percent, kurtosis or excess kurtosis) to guess.
export const FIELD_DESCRIPTIONS = Object.freeze({
  observed_sharpe_annualized: "Annualized Sharpe as observed.",
  observations: "Number of return observations.",
  periods_per_year: "Observations per year: 252 daily, 365 daily crypto, 52 weekly, 12 monthly.",
  skew: "Skewness of returns; 0 if Normal.",
  non_excess_kurtosis: "Kurtosis, not excess kurtosis; 3 if Normal.",
  effective_independent_trials: "Independent variants tried before choosing this one.",
  cross_trial_sharpe_sd_annualized: "Standard deviation of the annualized Sharpe across those trials.",
  returns: "Periodic returns as fractions (0.01 is 1%), oldest first; replaces the Sharpe, observations, skew and kurtosis fields.",
  matrix: "Returns as fractions: one row per period, one column per variant.",
  n_splits: "Even number of blocks, at least 2; default 16.",
  max_combinations: "Most splits evaluated, up to 2000 (default).",
  seed: "Sampling seed; default 42.",
  record: "A canli.paper-evidence.v0 record.",
  sleeve_sharpe: "Annualized Sharpe of one sleeve.",
  average_pairwise_correlation: "Average correlation between sleeves, -1 to 1.",
  sleeves: "Sleeve count, to get that book's Sharpe.",
  target: "Target book Sharpe, to get the sleeves it needs.",
  benchmark_sharpe_annualized: "Annualized Sharpe to beat; default 0.",
  confidence: "Between 0 and 1; default 0.95.",
  record_observations: "Record length so far, to get its probabilistic Sharpe.",
  label: "Name for the key.",
  receipt_id: "Receipt id from a validation result.",
  receipt_object: "A receipt as get_receipt returns it (its data), to verify without fetching it.",
  cik: "SEC CIK; send cik or ticker.",
  ticker: "Ticker such as AAPL; send ticker or cik.",
  concept: "us-gaap concept such as Assets; omit to list them.",
  limit: "Most observations, newest first; default 40.",
  target_sharpe_annualized: "In-sample annualized Sharpe you would take as a discovery; default 1.",
  backtest_years: "Length of the backtest in years, to get the most independent trials it allows.",
  bt_trials: "Independent trials (backtests, parameter sets, ideas) tried; gives the minimum backtest length.",
  hc_observations: "Number of return observations behind the Sharpe ratio.",
  hc_tests: "Total tests run, this one included; gives the Bonferroni and independent-test haircuts.",
  autocorrelation: "First-order autocorrelation of the returns, -1 to 1; default 0. Corrects the annualized Sharpe as Lo (2002).",
  other_sharpes: "Annualized Sharpe ratios of the other tests, over the same observations; adds the Holm and BHY haircuts.",
  lt_trials: "Independent trials tried; adds the chance that the best of them reached this Sharpe by luck.",
  skew: "Skewness of the returns; below -0.5 the reading warns that the counts are too generous.",
  variants: "Optional returns of every variant tried, this one included, as fractions: one row per period, one column per variant. Adds the overfitting check.",
  returns_file: "Path to a CSV or JSON file of the returns on the machine running this server, instead of returns. Not available on the hosted endpoint.",
  returns_column: "Header name or 1-based position of the returns column when returns_file has several numeric columns.",
  variants_file: "Path to a CSV or JSON file of every variant's returns (one numeric column per variant), instead of variants.",
});
const d = FIELD_DESCRIPTIONS;

// ---------------------------------------------------------------------------------------------
// validate_deflated_sharpe: the API accepts exactly one of two input modes, never a mix.
// Input A is the seven fields of deflated_sharpe_calculator_contract.json.
// Input B is a raw return series plus the trials and dispersion behind it.
// ---------------------------------------------------------------------------------------------

export const deflatedSharpeContractInputs = z
  .object({
    observed_sharpe_annualized: z.number().min(-10).max(10).describe(d.observed_sharpe_annualized),
    observations: z.number().int().min(2).max(1000000).describe(d.observations),
    periods_per_year: z.number().min(1).max(10000).describe(d.periods_per_year),
    skew: z.number().min(-20).max(20).describe(d.skew),
    non_excess_kurtosis: z.number().min(1).max(100).describe(d.non_excess_kurtosis),
    effective_independent_trials: z.number().int().min(2).max(10000000).describe(d.effective_independent_trials),
    cross_trial_sharpe_sd_annualized: z.number().min(0).max(10).describe(d.cross_trial_sharpe_sd_annualized),
  })
  .strict();

export const deflatedSharpeReturnSeriesInputs = z
  .object({
    returns: z.array(z.number()).min(2).max(20000).describe(d.returns),
    periods_per_year: z.number().min(1).max(10000).describe(d.periods_per_year),
    effective_independent_trials: z.number().int().min(2).max(10000000).describe(d.effective_independent_trials),
    cross_trial_sharpe_sd_annualized: z.number().min(0).max(10).describe(d.cross_trial_sharpe_sd_annualized),
  })
  .strict();

// The oneOf: exactly one of the two shapes above. A value carrying fields from both, or neither,
// fails every branch and so fails the union, which is the rejection this module is tested for.
export const deflatedSharpeInput = z.union([deflatedSharpeContractInputs, deflatedSharpeReturnSeriesInputs]);

// The MCP-facing shape: every field from both modes, all optional. A bare union has no useful
// JSON Schema for a client to read, so the tool advertises this flat shape (for discovery and
// per-field type checking) while the strict oneOf rule above is enforced in the tool handler.
export const deflatedSharpeToolShape = z
  .object({
    observed_sharpe_annualized: z.number().min(-10).max(10).optional().describe(d.observed_sharpe_annualized),
    observations: z.number().int().min(2).max(1000000).optional().describe(d.observations),
    periods_per_year: z.number().min(1).max(10000).optional().describe(d.periods_per_year),
    skew: z.number().min(-20).max(20).optional().describe(d.skew),
    non_excess_kurtosis: z.number().min(1).max(100).optional().describe(d.non_excess_kurtosis),
    effective_independent_trials: z.number().int().min(2).max(10000000).optional().describe(d.effective_independent_trials),
    cross_trial_sharpe_sd_annualized: z.number().min(0).max(10).optional().describe(d.cross_trial_sharpe_sd_annualized),
    returns: z.array(z.number()).min(2).max(20000).optional().describe(d.returns),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_overfitting
// ---------------------------------------------------------------------------------------------

export const overfittingInput = z
  .object({
    matrix: z.array(z.array(z.number())).min(2).max(20000).describe(d.matrix),
    n_splits: z.number().int().positive().optional().describe(d.n_splits),
    max_combinations: z.number().int().positive().max(2000).optional().describe(d.max_combinations),
    seed: z.number().optional().describe(d.seed),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_paper_evidence: the record shape is the open standard itself, so this schema only
// checks that a record object was sent; canlicapital.com runs the real conformance check.
// ---------------------------------------------------------------------------------------------

export const paperEvidenceInput = z
  .object({
    record: z.record(z.string(), z.unknown()).describe(d.record),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_breadth
// ---------------------------------------------------------------------------------------------

export const breadthInput = z
  .object({
    sleeve_sharpe: z.number().positive().describe(d.sleeve_sharpe),
    average_pairwise_correlation: z.number().min(-1).max(1).describe(d.average_pairwise_correlation),
    sleeves: z.number().int().min(1).max(500).optional().describe(d.sleeves),
    target: z.number().positive().optional().describe(d.target),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_track_record
// ---------------------------------------------------------------------------------------------

export const trackRecordInput = z
  .object({
    observed_sharpe_annualized: z.number().min(-10).max(10).describe(d.observed_sharpe_annualized),
    periods_per_year: z.number().min(1).max(10000).describe(d.periods_per_year),
    skew: z.number().min(-20).max(20).describe(d.skew),
    non_excess_kurtosis: z.number().min(1).max(100).describe(d.non_excess_kurtosis),
    benchmark_sharpe_annualized: z.number().min(-10).max(10).optional().describe(d.benchmark_sharpe_annualized),
    confidence: z.number().gt(0).lt(1).optional().describe(d.confidence),
    observations: z.number().int().min(2).max(1000000).optional().describe(d.record_observations),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_backtest_length
// ---------------------------------------------------------------------------------------------

export const backtestLengthInput = z
  .object({
    effective_independent_trials: z.number().int().min(2).max(1000000000).optional().describe(d.bt_trials),
    backtest_years: z.number().gt(0).max(1000).optional().describe(d.backtest_years),
    target_sharpe_annualized: z.number().gt(0).max(10).optional().describe(d.target_sharpe_annualized),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_haircut_sharpe
// ---------------------------------------------------------------------------------------------

export const haircutSharpeInput = z
  .object({
    observed_sharpe_annualized: z.number().gt(0).max(10).describe(d.observed_sharpe_annualized),
    periods_per_year: z.number().min(1).max(10000).describe(d.periods_per_year),
    observations: z.number().int().min(3).max(1000000).describe(d.hc_observations),
    tests: z.number().int().min(1).max(100000000).optional().describe(d.hc_tests),
    autocorrelation: z.number().gt(-1).lt(1).optional().describe(d.autocorrelation),
    other_sharpe_ratios_annualized: z.array(z.number().min(-10).max(10)).min(1).max(10000).optional().describe(d.other_sharpes),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_luck_trials
// ---------------------------------------------------------------------------------------------

export const luckTrialsInput = z
  .object({
    observed_sharpe_annualized: z.number().min(-20).max(20).describe(d.observed_sharpe_annualized),
    periods_per_year: z.number().min(1).max(10000).describe(d.periods_per_year),
    observations: z.number().int().min(3).max(1000000).describe(d.hc_observations),
    effective_independent_trials: z.number().int().min(1).max(1000000000).optional().describe(d.lt_trials),
    skew: z.number().min(-100).max(100).optional().describe(d.skew),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// audit_backtest: the deflated Sharpe, track record and (with variants) overfitting checks on one
// return series in one call. Each check runs through its own validator, unchanged.
// ---------------------------------------------------------------------------------------------

export const auditBacktestToolShape = z
  .object({
    returns: z.array(z.number()).min(2).max(20000).optional().describe(d.returns),
    returns_file: z.string().min(1).max(4096).optional().describe(d.returns_file),
    returns_column: z.union([z.string().min(1).max(200), z.number().int().min(1)]).optional().describe(d.returns_column),
    periods_per_year: z.number().min(1).max(10000).describe(d.periods_per_year),
    effective_independent_trials: z.number().int().min(2).max(10000000).describe(d.effective_independent_trials),
    cross_trial_sharpe_sd_annualized: z.number().min(0).max(10).describe(d.cross_trial_sharpe_sd_annualized),
    benchmark_sharpe_annualized: z.number().min(-10).max(10).optional().describe(d.benchmark_sharpe_annualized),
    confidence: z.number().gt(0).lt(1).optional().describe(d.confidence),
    variants: z.array(z.array(z.number())).min(2).max(20000).optional().describe(d.variants),
    variants_file: z.string().min(1).max(4096).optional().describe(d.variants_file),
    n_splits: z.number().int().positive().optional().describe(d.n_splits),
  })
  .strict();

// The handler's rule on top of the advertised shape: the returns come from exactly one place, the
// variants from at most one, and a column is named only for a file.
export const auditBacktestInput = auditBacktestToolShape
  .refine((v) => (v.returns === undefined) !== (v.returns_file === undefined), "Send exactly one of returns or returns_file")
  .refine((v) => v.variants === undefined || v.variants_file === undefined, "Send variants or variants_file, not both")
  .refine((v) => v.returns_column === undefined || v.returns_file !== undefined, "returns_column applies only to returns_file");

// ---------------------------------------------------------------------------------------------
// get_key / get_receipt
// ---------------------------------------------------------------------------------------------

export const getKeyInput = z
  .object({
    label: z.string().max(64).optional().describe(d.label),
  })
  .strict();

export const getReceiptInput = z
  .object({
    id: z.string().regex(/^[0-9a-f]{24}$/, "A receipt id is 24 hex characters").describe(d.receipt_id),
  })
  .strict();

export const emptyInput = z.object({}).strict();

// verify_receipt: a receipt id to fetch, or a receipt already fetched (get_receipt's data), to check
// offline. Advertised flat; the handler enforces exactly one.
export const verifyReceiptToolShape = z
  .object({
    id: z.string().regex(/^[0-9a-f]{24}$/, "A receipt id is 24 hex characters").optional().describe(d.receipt_id),
    receipt: z.record(z.string(), z.unknown()).optional().describe(d.receipt_object),
  })
  .strict();

// company_financial_history reads the public company reference, not the validation API.
// Advertised to clients as a flat object (a refinement has no useful JSON Schema); the handler
// enforces the exactly-one-of rule with companyHistoryInput.
export const companyHistoryToolShape = z
  .object({
    cik: z.string().regex(/^\d{1,10}$/, "A CIK is 1 to 10 digits").optional().describe(d.cik),
    ticker: z.string().regex(/^[A-Za-z0-9.\-]{1,10}$/, "A ticker is 1 to 10 letters, digits, dots or hyphens").optional().describe(d.ticker),
    concept: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,99}$/, "A concept is a us-gaap tag such as Revenues or Assets").optional().describe(d.concept),
    limit: z.number().int().min(1).max(200).optional().describe(d.limit),
  })
  .strict();

export const companyHistoryInput = z
  .object({
    cik: z.string().regex(/^\d{1,10}$/, "A CIK is 1 to 10 digits").optional().describe(d.cik),
    ticker: z.string().regex(/^[A-Za-z0-9.\-]{1,10}$/, "A ticker is 1 to 10 letters, digits, dots or hyphens").optional().describe(d.ticker),
    concept: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,99}$/, "A concept is a us-gaap tag such as Revenues or Assets").optional().describe(d.concept),
    limit: z.number().int().min(1).max(200).optional().describe(d.limit),
  })
  .strict()
  .refine((v) => (v.cik === undefined) !== (v.ticker === undefined), "Send exactly one of cik or ticker");

// The company reference carries its own boundary sentence in every record (claim_boundary),
// written by scripts/lib/company-reference.mjs. A test pins this copy to that source verbatim.
export const COMPANY_REFERENCE_BOUNDARY = "Public company accounting reference, not market prices, returns, an investment recommendation, or ALPHAC performance. Validate a separately constructed return series with the validation API; accounting values are not returns.";

// ---------------------------------------------------------------------------------------------
// Boundary language: verbatim sentences from api/_lib/limits.js LIMITS_TEXT. A test asserts each
// of these strings is still present, byte for byte, in that source array, so this module cannot
// drift from the text the live API actually attaches to every envelope.
// ---------------------------------------------------------------------------------------------

export const LIMITS_SENTENCES = Object.freeze({
  scope: "This verdict is about the series exactly as submitted. The service never saw the data source, its costs, survivorship, or any lookahead in how the series was built.",
  notAdmission: "A deflated Sharpe or overfitting probability above or below any threshold is not admission to anything and is not a forecast.",
  unsigned: "The receipt is content-hashed, reproducible from the open-source core it names, and signed with Ed25519 by a key published at https://canlicapital.com/.well-known/canli-receipt-keys.json.",
  quotas: "Quotas: 1000 validations per key per UTC day, 5 keys per client per UTC day, 1048576 bytes per validation request, 1024 bytes per key revocation request, 20000 observations per series, 200 variants per matrix.",
});

// The MCP registry caps server.json's top-level description at 100 characters (its 422 reads
// "expected length <= 100"), shorter than any sentence above. That one description carries this
// clause instead: the verbatim tail of `notAdmission`, so it cannot drift from the boundary
// language either (test/schemas.test.mjs pins the tail, test/registry-files.test.mjs the cap).
export const REGISTRY_LIMITS_CLAUSE = "is not admission to anything and is not a forecast.";
export const REGISTRY_DESCRIPTION_MAX = 100;

// One tool description per tool, each stating (in one sentence lifted from the boundary language
// above) what the tool's result cannot be used to claim, so an agent sees this before it ever
// calls the tool, not only inside the returned envelope.
export const TOOL_DESCRIPTIONS = Object.freeze({
  get_key: `Issue a free canlicapital.com validation key (POST /api/v1/keys) and hold it in memory for this session. Only needed before a validation when neither CANLI_KEY nor local mode is set; the read tools (get_receipt, service_status, company_financial_history) never need a key. ${LIMITS_SENTENCES.quotas}`,
  validate_deflated_sharpe: `Whether a Sharpe survives the number of variants tried: probabilistic and deflated Sharpe (0 to 1) and the Sharpe luck alone would reach. Send the seven statistics or a return series, not both. ${LIMITS_SENTENCES.notAdmission}`,
  audit_backtest: `Audit one strategy's return series in one call: deflated Sharpe, the minimum track record length for its Sharpe to beat the benchmark, and, with every variant's returns, the probability of backtest overfitting. Point returns_file at the backtest's CSV or JSON rather than copying long series into the call. Each check is the matching validate_ tool's result with its own receipt, side by side; the audit does not grade the strategy. Uses one validation per check. ${LIMITS_SENTENCES.notAdmission}`,
  validate_overfitting: `Probability (0 to 1) that picking the best of several backtested variants was overfitting, by CSCV over every variant's returns. ${LIMITS_SENTENCES.notAdmission}`,
  validate_paper_evidence: `Whether a paper or simulated performance record meets canli.paper-evidence.v0, with each failure's JSON pointer. ${LIMITS_SENTENCES.scope}`,
  validate_backtest_length: `Minimum backtest length, in years, before the best of N independent trials is not expected to reach a target Sharpe by luck, and with backtest_years, the most independent trials those years allow. Send effective_independent_trials, backtest_years, or both. ${LIMITS_SENTENCES.notAdmission}`,
  validate_luck_trials: `How many skill-less strategies a search would have had to try for its best to reach this Sharpe by luck, and, with a trial count, the chance that it did. Calibrated by Monte Carlo. ${LIMITS_SENTENCES.notAdmission}`,
  validate_haircut_sharpe: `Haircut Sharpe ratio for multiple testing (Harvey and Liu, 2015): the Sharpe a single test would have needed once the number of tests is counted, by Bonferroni and for independent tests, and with the other tests' Sharpe ratios by Holm and BHY. ${LIMITS_SENTENCES.notAdmission}`,
  validate_track_record: `Minimum track record length, in observations and years, for an observed Sharpe to beat a benchmark at a confidence level, and with observations, the record's probabilistic Sharpe so far. ${LIMITS_SENTENCES.notAdmission}`,
  validate_breadth: `Highest book Sharpe reachable by adding sleeves of this quality and correlation, the Sharpe at a sleeve count, and the sleeves a target needs. ${LIMITS_SENTENCES.scope}`,
  verify_receipt: `Check a validation receipt's Ed25519 signature offline against the canlicapital.com public key bundled in this package, that its output hashes to its output_sha256, and that its content hashes to its id. Send an id to fetch the receipt first, or a receipt already fetched. ${LIMITS_SENTENCES.unsigned}`,
  get_receipt: `Fetch a stored verdict by receipt id (GET /api/v1/receipts/{id}) to re-check an earlier result. No key. ${LIMITS_SENTENCES.unsigned}`,
  service_status: `Whether the validation API is up, with quota constants (GET /api/v1/validate/status); check after a timeout before resubmitting. No key. ${LIMITS_SENTENCES.scope}`,
  company_financial_history: `SEC-reported financial history for one company from the canlicapital.com company reference (GET /company-data/{cik}.json), by cik or by ticker (resolved through GET /api/v1/company-tickers.json, companies in the release only). Without a concept it lists the available histories; with one it returns observations, newest first, each with its filing accession, form, filed date and unit, plus the SHA-256 of the original SEC response. No key required. ${COMPANY_REFERENCE_BOUNDARY}`,
});
