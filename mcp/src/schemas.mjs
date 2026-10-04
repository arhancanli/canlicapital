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
  periods_per_year: "Periods per year: 252 daily, 365 crypto, 52 weekly, 12 monthly.",
  skew: "Skewness of returns; 0 if Normal.",
  non_excess_kurtosis: "Kurtosis, not excess kurtosis; 3 if Normal.",
  effective_independent_trials: "Independent variants tried before choosing this one.",
  cross_trial_sharpe_sd_annualized: "Standard deviation of annualized Sharpe across those trials.",
  returns: "Periodic returns as fractions (0.01 = 1%), oldest first; replaces the Sharpe, observations, skew and kurtosis.",
  matrix: "Returns as fractions, one row per period, one column per variant.",
  n_splits: "Even number of blocks, at least 2; default 16.",
  max_combinations: "Most splits evaluated, up to 2000 (default).",
  seed: "Sampling seed; default 42.",
  rc_matrix: "Returns of every variant the search tried, one row per period, one column per variant.",
  matrix_file: "Path to a CSV or JSON with one numeric column per variant, instead of matrix.",
  rc_benchmark: "Benchmark return per period; default zero.",
  block_length: "Mean bootstrap block in periods; default round(n^(1/3)).",
  reps: "Bootstrap draws; default 2000.",
  alpha: "Familywise error for StepM; default 0.05.",
  record: "A canli.paper-evidence.v0 record.",
  sleeve_sharpe: "Annualized Sharpe of one sleeve.",
  average_pairwise_correlation: "Average correlation between sleeves, -1 to 1.",
  sleeves: "Sleeve count, for that book's Sharpe.",
  target: "Target book Sharpe, for the sleeves it needs.",
  benchmark_sharpe_annualized: "Annualized Sharpe to beat; default 0.",
  confidence: "Between 0 and 1; default 0.95.",
  record_observations: "Record length so far, for its probabilistic Sharpe.",
  label: "Name for the key.",
  receipt_id: "Receipt id from a validation result.",
  receipt_object: "A receipt object, to verify without fetching.",
  cik: "SEC CIK; send cik or ticker.",
  ticker: "Ticker such as AAPL; send ticker or cik.",
  concept: "us-gaap concept such as Assets; omit to list them.",
  limit: "Most observations, newest first; default 40.",
  target_sharpe_annualized: "In-sample annualized Sharpe you would call a discovery; default 1.",
  backtest_years: "Backtest length in years, for the most trials it allows.",
  bt_trials: "Independent trials tried (backtests, parameter sets, ideas).",
  hc_observations: "Return observations behind the Sharpe.",
  hc_tests: "Tests run, this one included; gives the Bonferroni and independent-test haircuts.",
  autocorrelation: "Lag-1 autocorrelation of returns, -1 to 1; default 0. Corrects the annualized Sharpe (Lo 2002).",
  other_sharpes: "Annualized Sharpes of the other tests over the same observations; adds Holm and BHY.",
  lt_trials: "Independent trials tried; adds the chance the best reached this Sharpe by luck.",
  lt_skew: "Skewness; below -0.5 the reading warns the counts are too generous.",
  variants: "Optional returns of every variant tried (this one included), one row per period, one column per variant; adds the overfitting check.",
  returns_file: "Path to a CSV or JSON of the returns on this machine (not on the hosted endpoint), instead of returns.",
  returns_column: "Column name or 1-based position, when returns_file has several numeric columns.",
  variants_file: "Path to a CSV or JSON with one numeric column per variant, instead of variants.",
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
    matrix: z.array(z.array(z.number()).max(200)).min(2).max(20000).describe(d.matrix),
    n_splits: z.number().int().positive().optional().describe(d.n_splits),
    max_combinations: z.number().int().positive().max(2000).optional().describe(d.max_combinations),
    seed: z.number().optional().describe(d.seed),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_reality_check: every variant's returns, inline or from a file on this machine.
// ---------------------------------------------------------------------------------------------

export const realityCheckToolShape = z
  .object({
    matrix: z.array(z.array(z.number()).max(200)).min(30).max(20000).optional().describe(d.rc_matrix),
    matrix_file: z.string().min(1).max(4096).optional().describe(d.matrix_file),
    benchmark: z.array(z.number()).min(30).max(20000).optional().describe(d.rc_benchmark),
    block_length: z.number().int().min(1).max(10000).optional().describe(d.block_length),
    reps: z.number().int().min(500).max(400000).optional().describe(d.reps),
    seed: z.number().int().optional().describe(d.seed),
    alpha: z.number().gt(0).max(0.5).optional().describe(d.alpha),
  })
  .strict();

export const realityCheckInput = realityCheckToolShape.refine((v) => (v.matrix === undefined) !== (v.matrix_file === undefined), "Send exactly one of matrix or matrix_file");

// ---------------------------------------------------------------------------------------------
// validate_paper_evidence: the record shape is the open standard itself, so this schema only
// checks that a record object was sent; canlicapital.com runs the real conformance check.
// ---------------------------------------------------------------------------------------------

export const paperEvidenceToolShape = z
  .object({
    record: z.record(z.string(), z.unknown()).optional().describe(d.record),
    record_file: z.string().min(1).max(1000).optional().describe("Local record or export-bundle JSON path; requires CANLI_LOCAL=1."),
    journal_file: z.string().min(1).max(1000).optional().describe("Local signed journal to recompute and bind; requires CANLI_LOCAL=1."),
    signature: z.object({ scheme: z.literal("Ed25519"), public_key: z.string().max(64), signature: z.string().max(128) }).strict().optional().describe("Detached record signature for a signed inline record; requires journal_file."),
  })
  .strict();
export const paperEvidenceInput = paperEvidenceToolShape
  .refine(v => (v.record === undefined) !== (v.record_file === undefined), "Send exactly one of record or record_file")
  .refine(v => v.signature === undefined || v.journal_file !== undefined, "Detached signature requires journal_file");

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
    skew: z.number().min(-100).max(100).optional().describe(d.lt_skew),
    autocorrelation: z.number().gt(-1).lt(1).optional().describe(d.autocorrelation),
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
    effective_independent_trials: z.number().int().min(2).max(10000000).optional().describe(`${d.effective_independent_trials} Optional with variants: counted from them, and the larger number is used.`),
    cross_trial_sharpe_sd_annualized: z.number().min(0).max(10).optional().describe(`${d.cross_trial_sharpe_sd_annualized} Optional with variants: measured from them, and the larger is used.`),
    benchmark_sharpe_annualized: z.number().min(-10).max(10).optional().describe(d.benchmark_sharpe_annualized),
    confidence: z.number().gt(0).lt(1).optional().describe(d.confidence),
    variants: z.array(z.array(z.number()).max(200)).min(2).max(20000).optional().describe(d.variants),
    variants_file: z.string().min(1).max(4096).optional().describe(d.variants_file),
    n_splits: z.number().int().positive().optional().describe(d.n_splits),
  })
  .strict();

// The handler's rule on top of the advertised shape: the returns come from exactly one place, the
// variants from at most one, and a column is named only for a file.
export const auditBacktestInput = auditBacktestToolShape
  .refine((v) => (v.returns === undefined) !== (v.returns_file === undefined), "Send exactly one of returns or returns_file")
  .refine((v) => v.variants === undefined || v.variants_file === undefined, "Send variants or variants_file, not both")
  .refine((v) => v.returns_column === undefined || v.returns_file !== undefined, "returns_column applies only to returns_file")
  .refine((v) => v.variants !== undefined || v.variants_file !== undefined || (v.effective_independent_trials !== undefined && v.cross_trial_sharpe_sd_annualized !== undefined),
    "Send variants or variants_file, or declare effective_independent_trials and cross_trial_sharpe_sd_annualized");

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

// verify_receipt: a receipt id to fetch, or a receipt already fetched, to check
// offline. Advertised flat; the handler enforces exactly one.
export const verifyReceiptToolShape = z
  .object({
    id: z.string().regex(/^[0-9a-f]{24}$/, "A receipt id is 24 hex characters").optional().describe(d.receipt_id),
    receipt: z.record(z.string(), z.unknown()).optional().describe(d.receipt_object),
    include_receipt: z.boolean().optional().describe("With id: also return the stored receipt."),
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
  get_key: `Issue a free validation key for this session. Rarely needed: the first validation issues one itself unless CANLI_KEY or local mode is set, and the read tools need none. ${LIMITS_SENTENCES.quotas}`,
  validate_deflated_sharpe: `Deflated Sharpe ratio: the probability (0 to 1) that the selected strategy's Sharpe beats the best that luck gives across the variants tried, with the probabilistic Sharpe and that luck benchmark. Send the seven statistics or a return series. With every variant's returns use validate_overfitting; luck as a trial count, validate_luck_trials; a multiple-testing haircut, validate_haircut_sharpe. ${LIMITS_SENTENCES.notAdmission}`,
  audit_backtest: `One-call audit of a strategy's returns. Headline: one test whose false-positive rate was measured on nine return shapes (Hansen's SPA with variants). Then deflated Sharpe, minimum track record and, with variants, overfitting and out-of-sample decay, each with its receipt, plus fix_next. Send every variant tried (variants_file) so trials are counted; point returns_file at a CSV instead of pasting. ${LIMITS_SENTENCES.notAdmission}`,
  validate_overfitting: `Probability of backtest overfitting (0 to 1) by CSCV: how often the in-sample best variant falls below the out-of-sample median. Needs every variant's returns (periods by variants); with summary statistics only, use validate_deflated_sharpe. ${LIMITS_SENTENCES.notAdmission}`,
  validate_reality_check: `Data-snooping tests on every variant a search tried: Hansen's SPA p-value that the best beat the benchmark only by luck, White's Reality Check, and the variants Romano-Wolf StepM finds better. Send all variants tried, not only the winners. ${LIMITS_SENTENCES.notAdmission}`,
  validate_paper_evidence: `Checks paper-evidence.v0 structure and disclosures. With CANLI_LOCAL=1, record_file reads an export bundle and journal_file verifies signatures, source hashes and recomputed claims. Without a journal, source facts and signatures are unchecked. Local files are never uploaded. ${LIMITS_SENTENCES.scope}`,
  validate_backtest_length: `Minimum backtest length (years) before the best of N independent trials is not expected to reach a target Sharpe by luck; with backtest_years, the most trials those years allow. For planning a search; once it has a result, use validate_deflated_sharpe. ${LIMITS_SENTENCES.notAdmission}`,
  validate_luck_trials: `How many skill-less strategies a search would need for its best to reach this Sharpe by luck (Monte Carlo), and with a trial count, the chance it did. States luck as the best of N random tries; for the probability the Sharpe is real, use validate_deflated_sharpe. ${LIMITS_SENTENCES.notAdmission}`,
  validate_haircut_sharpe: `Haircut Sharpe for multiple testing (Harvey and Liu 2015): the Sharpe a single test would have needed, by Bonferroni and independent tests, and with the other tests' Sharpes, Holm and BHY. For the probability the Sharpe is real, use validate_deflated_sharpe. ${LIMITS_SENTENCES.notAdmission}`,
  validate_track_record: `Minimum track record length (observations and years) for an observed Sharpe to beat a benchmark at a confidence level; with observations, the record's probabilistic Sharpe so far. For live or paper records; to size a backtest for its trials, use validate_backtest_length. ${LIMITS_SENTENCES.notAdmission}`,
  validate_breadth: `Book Sharpe ceiling from adding sleeves of this quality and correlation, the Sharpe at a sleeve count, and the sleeves a target needs. For portfolio construction; it validates no single strategy. ${LIMITS_SENTENCES.scope}`,
  verify_receipt: `Verify a receipt offline: its Ed25519 signature against the bundled canlicapital.com key, its output hash and its id. Send an id to fetch it first, or the receipt itself. ${LIMITS_SENTENCES.unsigned}`,
  service_status: `Whether the validation API is up, with its quotas; check after a timeout before resubmitting. No key. ${LIMITS_SENTENCES.scope}`,
  company_financial_history: `SEC-reported financial history for one company in the canlicapital.com reference, by cik or ticker: without a concept, the histories available; with one, observations newest first with accession, form, filed date and unit, plus the source's SHA-256. For point-in-time values use canli-fundamentals-mcp. ${COMPANY_REFERENCE_BOUNDARY}`,
});

// Output schemas (0.8.0). Published OPEN: extra fields always pass. A client validates a tool's
// structured result against the output schema it listed, so a closed schema turns every field a
// later version adds into a failed call (2026-09-26, the mcp-factory servers). Every field is
// optional because refusals and local results carry different subsets. They are kept terse: the
// tool list is re-sent to the model every turn, and one sentence per schema says what to read.
const refusal = z.looseObject({}).nullable().optional();
const sentences = z.array(z.string()).optional();
const loose = z.looseObject({}).optional();

export const validationOutput = z
  .looseObject({
    data: loose,
    error: refusal,
    limits: sentences,
    receipt: z.looseObject({}).nullable().optional(),
    computed: z.string().optional(),
    note: z.string().optional(),
  })
  .describe("data.result holds the statistics (data.plain_reading states them); limits say what the result does not establish; receipt ({id, url}) is the signed record, null when none was stored; error ({code, message}) is set only on refusal.");

export const auditOutput = z
  .looseObject({ readings: loose, checks: loose, not_run: loose, limits: sentences, note: z.string().optional(), error: refusal })
  .describe("checks holds each check's full validate_ result by name; readings one sentence per check; not_run the checks skipped and why.");

export const keyOutput = z
  .looseObject({ note: z.string().optional(), key_source: z.string().optional(), key_present: z.boolean().optional(), data: loose, error: refusal })
  .describe("key_source says which key the session uses; data.key is set when a new key was issued.");

export const receiptOutput = z
  .looseObject({ data: loose, error: refusal, limits: sentences })
  .describe("data is the stored receipt: validator, input, output, their hashes, source hashes and signature.");

export const verifyReceiptOutput = z
  .looseObject({ receipt_id: z.string().nullable().optional(), valid: z.boolean().optional(), checks: z.unknown().optional(), key_id: z.string().nullable().optional(), meaning: z.string().optional(), error: refusal })
  .describe("valid is true only when the signature, output hash and content id all check out; checks lists each.");

export const statusOutput = z
  .looseObject({ data: loose, limits: sentences, error: refusal })
  .describe("data.store_reachable, data.quotas and, when available, data.usage for this key.");

export const companyHistoryOutput = z
  .looseObject({ company: loose, claim_boundary: z.string().optional(), source: loose, histories: z.array(z.unknown()).optional(), history: loose, error: refusal })
  .describe("Without a concept, histories lists what is available; with one, history holds the observations newest first as columns and rows, each with its filing. Values are as reported to the SEC.");
