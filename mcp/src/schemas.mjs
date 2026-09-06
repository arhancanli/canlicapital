// mcp/src/schemas.mjs
//
// Input schemas for canlicapital.com's free validation API, kept in one module so a test can
// round-trip them against the API's own examples: public/api/v1/openapi.json, the manifest at
// api/_lib/manifest.js, and the seven-field contract at
// public/glassbox/deflated_sharpe_calculator_contract.json. See
// docs/superpowers/specs/2026-09-05-developer-key-validation-api-design.md section 4 for the
// validator semantics these shapes mirror.
import { z } from "zod";

// ---------------------------------------------------------------------------------------------
// validate_deflated_sharpe: the API accepts exactly one of two input modes, never a mix.
// Input A is the seven fields of deflated_sharpe_calculator_contract.json.
// Input B is a raw return series plus the trials and dispersion behind it.
// ---------------------------------------------------------------------------------------------

export const deflatedSharpeContractInputs = z
  .object({
    observed_sharpe_annualized: z.number().min(-10).max(10),
    observations: z.number().int().min(2).max(1000000),
    periods_per_year: z.number().min(1).max(10000),
    skew: z.number().min(-20).max(20),
    non_excess_kurtosis: z.number().min(1).max(100),
    effective_independent_trials: z.number().int().min(2).max(10000000),
    cross_trial_sharpe_sd_annualized: z.number().min(0).max(10),
  })
  .strict();

export const deflatedSharpeReturnSeriesInputs = z
  .object({
    returns: z.array(z.number()).min(2).max(20000),
    periods_per_year: z.number().min(1).max(10000),
    effective_independent_trials: z.number().int().min(2).max(10000000),
    cross_trial_sharpe_sd_annualized: z.number().min(0).max(10),
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
    observed_sharpe_annualized: z.number().min(-10).max(10).optional(),
    observations: z.number().int().min(2).max(1000000).optional(),
    periods_per_year: z.number().min(1).max(10000).optional(),
    skew: z.number().min(-20).max(20).optional(),
    non_excess_kurtosis: z.number().min(1).max(100).optional(),
    effective_independent_trials: z.number().int().min(2).max(10000000).optional(),
    cross_trial_sharpe_sd_annualized: z.number().min(0).max(10).optional(),
    returns: z.array(z.number()).min(2).max(20000).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_overfitting
// ---------------------------------------------------------------------------------------------

export const overfittingInput = z
  .object({
    matrix: z.array(z.array(z.number())).min(2).max(20000),
    n_splits: z.number().int().positive().optional(),
    max_combinations: z.number().int().positive().max(2000).optional(),
    seed: z.number().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_paper_evidence: the record shape is the open standard itself, so this schema only
// checks that a record object was sent; canlicapital.com runs the real conformance check.
// ---------------------------------------------------------------------------------------------

export const paperEvidenceInput = z
  .object({
    record: z.record(z.string(), z.unknown()),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// validate_breadth
// ---------------------------------------------------------------------------------------------

export const breadthInput = z
  .object({
    sleeve_sharpe: z.number().positive(),
    average_pairwise_correlation: z.number().min(-1).max(1),
    sleeves: z.number().int().min(1).max(500).optional(),
    target: z.number().positive().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// get_key / get_receipt
// ---------------------------------------------------------------------------------------------

export const getKeyInput = z
  .object({
    label: z.string().max(64).optional(),
  })
  .strict();

export const getReceiptInput = z
  .object({
    id: z.string().regex(/^[0-9a-f]{24}$/, "A receipt id is 24 hex characters"),
  })
  .strict();

export const emptyInput = z.object({}).strict();

// ---------------------------------------------------------------------------------------------
// Boundary language: verbatim sentences from api/_lib/limits.js LIMITS_TEXT. A test asserts each
// of these strings is still present, byte for byte, in that source array, so this module cannot
// drift from the text the live API actually attaches to every envelope.
// ---------------------------------------------------------------------------------------------

export const LIMITS_SENTENCES = Object.freeze({
  scope: "This verdict is about the series exactly as submitted. The service never saw the data source, its costs, survivorship, or any lookahead in how the series was built.",
  notAdmission: "A deflated Sharpe or overfitting probability above or below any threshold is not admission to anything and is not a forecast.",
  unsigned: "The receipt is content-hashed and reproducible from the open-source core it names. It is not signed.",
  quotas: "Quotas: 1000 validations per key per UTC day, 5 keys per client per UTC day, 1048576 bytes per request, 20000 observations per series, 200 variants per matrix.",
});

// One tool description per tool, each stating (in one sentence lifted from the boundary language
// above) what the tool's result cannot be used to claim, so an agent sees this before it ever
// calls the tool, not only inside the returned envelope.
export const TOOL_DESCRIPTIONS = Object.freeze({
  get_key: `Issue a free canlicapital.com validation key (POST /api/v1/keys) and hold it in memory for this session; skipped when CANLI_KEY is already set. ${LIMITS_SENTENCES.quotas}`,
  validate_deflated_sharpe: `Probabilistic and deflated Sharpe from the seven contract inputs, or from a return series plus the trials and dispersion behind it, never both. ${LIMITS_SENTENCES.notAdmission}`,
  validate_overfitting: `Probability of backtest overfitting by CSCV over the returns of every variant tried. ${LIMITS_SENTENCES.notAdmission}`,
  validate_paper_evidence: `Conformance of a performance record against the canli.paper-evidence.v0 standard. ${LIMITS_SENTENCES.scope}`,
  validate_breadth: `Book Sharpe ceiling from per-sleeve quality and average pairwise correlation, and the sleeves a target needs. ${LIMITS_SENTENCES.scope}`,
  get_receipt: `Fetch a stored verdict by its content-hash id (GET /api/v1/receipts/{id}), immutable and cacheable. ${LIMITS_SENTENCES.unsigned}`,
  service_status: `Service, store and quota constants for the validation API (GET /api/v1/validate/status); no key required. ${LIMITS_SENTENCES.scope}`,
});
