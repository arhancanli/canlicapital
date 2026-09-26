// js/validate/haircut-sharpe.js
// The pure computation behind POST /api/v1/validate/haircut-sharpe, shared by the API route and the
// MCP package's local mode (mcp/src/local mirrors it byte for byte), so the two cannot disagree.
import { haircutSharpe } from "../haircut-core.js";

// The haircut Sharpe ratio of Harvey and Liu, "Backtesting" (2015), checked against the authors'
// Haircut_SR.m and R in js/haircut-paper-vectors.test.js. Bonferroni and independent-test adjustments
// need only the number of tests; Holm and BHY need the other tests' Sharpe ratios, which the caller
// knows (the authors simulate them from a published factor model when they are unknown).

const MAX_OTHERS = 10000;

export function compute(body) {
  const missing = ["observed_sharpe_annualized", "periods_per_year", "observations"].filter((k) => body[k] === undefined);
  if (missing.length) throw new RangeError(`Missing required fields: ${missing.join(", ")}`);
  const others = body.other_sharpe_ratios_annualized;
  if (others !== undefined && (!Array.isArray(others) || others.length < 1 || others.length > MAX_OTHERS)) {
    throw new RangeError(`other_sharpe_ratios_annualized must be an array of 1 to ${MAX_OTHERS} Sharpe ratios`);
  }
  if (others === undefined && body.tests === undefined) throw new RangeError("Send tests, other_sharpe_ratios_annualized, or both");
  const inputs = {
    observed_sharpe_annualized: Number(body.observed_sharpe_annualized),
    periods_per_year: Number(body.periods_per_year),
    observations: Number(body.observations),
    autocorrelation: body.autocorrelation === undefined ? 0 : Number(body.autocorrelation),
    ...(body.tests !== undefined ? { tests: Number(body.tests) } : {}),
    ...(others !== undefined ? { other_tests: others.length } : {}),
  };
  if (!(inputs.observations <= 1000000)) throw new RangeError("observations must be at most 1000000");
  const result = haircutSharpe({
    sharpeAnnualized: inputs.observed_sharpe_annualized,
    periodsPerYear: inputs.periods_per_year,
    observations: inputs.observations,
    tests: inputs.tests,
    autocorrelation: inputs.autocorrelation,
    otherSharpesAnnualized: others,
  });
  return { derived_inputs: inputs, result, plain_reading: reading(inputs, result) };
}

function reading(inputs, r) {
  const num = (x, d = 3) => String(Number(Number(x).toFixed(d)));
  const pct = (x) => `${(x * 100).toFixed(1)} percent`;
  const p = (x) => (x < 0.0001 ? Number(x).toExponential(2) : num(x, 4));
  const line = (name, a) => `${name} gives an adjusted p-value of ${p(a.adjusted_p)} and a haircut Sharpe of ${num(a.haircut_sharpe_annualized)}, a ${pct(a.haircut)} haircut`;
  const corrected = inputs.autocorrelation !== 0 ? ` (${num(r.sharpe_annualized_corrected)} after the autocorrelation correction)` : "";
  const parts = [
    `Tested alone, an annualized Sharpe of ${num(inputs.observed_sharpe_annualized)}${corrected} over ${inputs.observations} observations has a p-value of ${p(r.p_value_single)}.`,
    `Counting ${r.tests} tests, ${line("Bonferroni", r.bonferroni)}; treating the tests as independent ${line("", r.independent).trim()}.`,
  ];
  if (r.holm) parts.push(`With the other tests' own Sharpe ratios, ${line("Holm", r.holm)}, and ${line("BHY", r.bhy)}.`);
  parts.push("The haircut counts only the tests declared; tests run and not counted are invisible to it.");
  return parts.join(" ");
}
