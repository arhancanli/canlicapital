// mcp/test/properties.test.mjs
//
// Property-based (fuzz) tests of the local computations, the same code the API routes run. The
// golden-vector tests in the canlicapital repository pin single worked examples from the papers;
// these check laws that must hold for every input:
//   - totality: any input either returns finite numbers in their ranges or is refused with a
//     RangeError that names the problem, never NaN, never another kind of exception;
//   - the monotonicities the formulas imply (more trials or wider trial dispersion never raises
//     the deflated Sharpe; the deflated Sharpe never exceeds the plain PSR against zero);
//   - inverse consistency (a record exactly as long as the minimum track record length reaches
//     the requested confidence, and one shorter does not);
//   - invariances (CSCV overfitting is unchanged when every return is scaled by a power of two).
// The seed is fixed so a failure reproduces; fast-check prints the shrunk counterexample.
import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";

import { minimumTrackRecordLength, probabilisticSharpe } from "../src/local/js/dsr-core.js";
import { compute as breadth } from "../src/local/js/validate/breadth.js";
import { compute as deflatedSharpe } from "../src/local/js/validate/deflated-sharpe.js";
import { compute as overfitting } from "../src/local/js/validate/overfitting.js";
import { compute as trackRecord } from "../src/local/js/validate/track-record.js";

const RUNS = { seed: 20260925, numRuns: 400 };
const SLACK = 1e-12;

// Anything a caller might send for a numeric field, including the values that break naive code.
const anyValue = fc.oneof(
  fc.double(),
  fc.integer({ min: -10, max: 10_000 }),
  fc.constantFrom(0, -0, 1, -1, 2, Number.NaN, Infinity, -Infinity, 1e308, -1e308, 5e-324, "3", "", null, true, [], {}),
);

// Realistic ranges, for the laws that only mean something on inputs the formulas accept.
const realistic = {
  sharpe: fc.double({ min: -3, max: 5, noNaN: true }),
  observations: fc.integer({ min: 30, max: 5000 }),
  periodsPerYear: fc.constantFrom(12, 52, 250, 252, 365),
  skew: fc.double({ min: -3, max: 3, noNaN: true }),
  kurtosis: fc.double({ min: 1, max: 20, noNaN: true }),
  trials: fc.integer({ min: 2, max: 1000 }),
  dispersion: fc.double({ min: 0.01, max: 2, noNaN: true }),
};

const dsrInput = fc.record({
  observed_sharpe_annualized: realistic.sharpe,
  observations: realistic.observations,
  periods_per_year: realistic.periodsPerYear,
  skew: realistic.skew,
  non_excess_kurtosis: realistic.kurtosis,
  effective_independent_trials: realistic.trials,
  cross_trial_sharpe_sd_annualized: realistic.dispersion,
});

// Runs f; returns its value, or undefined when the input was refused with a RangeError. Any other
// exception fails the property.
function refusedOr(f) {
  try {
    return f();
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

const isProbability = (x) => Number.isFinite(x) && x >= 0 && x <= 1;

test("deflated Sharpe is total: any input returns probabilities in [0, 1] or a RangeError", () => {
  fc.assert(
    fc.property(fc.dictionary(fc.constantFrom("observed_sharpe_annualized", "observations", "periods_per_year", "skew", "non_excess_kurtosis", "effective_independent_trials", "cross_trial_sharpe_sd_annualized"), anyValue), (body) => {
      const out = refusedOr(() => deflatedSharpe(body));
      if (out === undefined) return;
      assert.ok(isProbability(out.result.deflated_sharpe_ratio), `deflated_sharpe_ratio ${out.result.deflated_sharpe_ratio}`);
      assert.ok(isProbability(out.result.psr_against_zero), `psr_against_zero ${out.result.psr_against_zero}`);
      assert.ok(Number.isFinite(out.result.expected_max_sharpe_annualized));
    }),
    RUNS,
  );
});

test("deflated Sharpe never exceeds the PSR against zero (a search can only raise the bar)", () => {
  fc.assert(
    fc.property(dsrInput, (input) => {
      const out = refusedOr(() => deflatedSharpe(input));
      if (out === undefined) return;
      assert.ok(out.result.deflated_sharpe_ratio <= out.result.psr_against_zero + SLACK);
    }),
    RUNS,
  );
});

test("more trials never raise the deflated Sharpe", () => {
  fc.assert(
    fc.property(dsrInput, fc.integer({ min: 1, max: 5000 }), (input, extra) => {
      const fewer = refusedOr(() => deflatedSharpe(input));
      const more = refusedOr(() => deflatedSharpe({ ...input, effective_independent_trials: input.effective_independent_trials + extra }));
      if (fewer === undefined || more === undefined) return;
      assert.ok(more.result.deflated_sharpe_ratio <= fewer.result.deflated_sharpe_ratio + SLACK);
    }),
    RUNS,
  );
});

test("wider dispersion across trials never raises the deflated Sharpe", () => {
  fc.assert(
    fc.property(dsrInput, fc.double({ min: 0, max: 2, noNaN: true }), (input, widen) => {
      const narrow = refusedOr(() => deflatedSharpe(input));
      const wide = refusedOr(() => deflatedSharpe({ ...input, cross_trial_sharpe_sd_annualized: input.cross_trial_sharpe_sd_annualized + widen }));
      if (narrow === undefined || wide === undefined) return;
      assert.ok(wide.result.deflated_sharpe_ratio <= narrow.result.deflated_sharpe_ratio + SLACK);
    }),
    RUNS,
  );
});

const trlInput = fc.record({
  observed_sharpe_annualized: fc.oneof(realistic.sharpe, fc.double({ min: 5e-324, max: 1e-150, noNaN: true })),
  benchmark_sharpe_annualized: fc.double({ min: -1, max: 3, noNaN: true }),
  periods_per_year: realistic.periodsPerYear,
  skew: realistic.skew,
  non_excess_kurtosis: realistic.kurtosis,
  confidence: fc.double({ min: 0.5, max: 0.999, noNaN: true }),
});

test("minimum track record length is total: finite positive years or a RangeError", () => {
  fc.assert(
    fc.property(fc.dictionary(fc.constantFrom("observed_sharpe_annualized", "benchmark_sharpe_annualized", "periods_per_year", "skew", "non_excess_kurtosis", "confidence", "observations"), anyValue), (body) => {
      const out = refusedOr(() => trackRecord(body));
      if (out === undefined) return;
      assert.ok(Number.isFinite(out.result.minimum_years) && out.result.minimum_years > 0, `minimum_years ${out.result.minimum_years}`);
    }),
    RUNS,
  );
});

test("a Sharpe too close to its benchmark is refused, never reported as an infinite record", () => {
  // Found by the property below: a margin of 1e-200 made the length Infinity, which the API
  // serialised as null years beside a reading that said "Infinity observations".
  for (const margin of [1e-323, 1e-200, 1e-160]) {
    assert.throws(() => trackRecord({ observed_sharpe_annualized: margin, benchmark_sharpe_annualized: 0, periods_per_year: 12, skew: 0, non_excess_kurtosis: 3 }), RangeError);
  }
  assert.ok(Number.isFinite(trackRecord({ observed_sharpe_annualized: 1e-6, benchmark_sharpe_annualized: 0, periods_per_year: 12, skew: 0, non_excess_kurtosis: 3 }).result.minimum_years));
});

test("a record as long as the minimum track record length reaches the confidence; a shorter one does not", () => {
  fc.assert(
    fc.property(trlInput, (input) => {
      const min = refusedOr(() => minimumTrackRecordLength(input));
      if (min === undefined || !(min.observations < 1e7)) return;
      const psrAt = (observations) => probabilisticSharpe({ ...input, observations }).probabilistic_sharpe_ratio;
      const enough = Math.max(2, Math.ceil(min.observations));
      assert.ok(psrAt(enough) >= input.confidence - 1e-12, `PSR at ${enough} observations below ${input.confidence}`);
      const short = Math.floor(min.observations - 1e-9);
      if (short >= 2 && short < min.observations - 1e-6) assert.ok(psrAt(short) < input.confidence + 1e-12, `PSR at ${short} observations already reaches ${input.confidence}`);
    }),
    RUNS,
  );
});

test("asking for more confidence never shortens the minimum track record", () => {
  fc.assert(
    fc.property(trlInput, fc.double({ min: 0, max: 0.4, noNaN: true }), (input, raise) => {
      const higher = Math.min(0.9999, input.confidence + raise);
      const low = refusedOr(() => minimumTrackRecordLength(input));
      const high = refusedOr(() => minimumTrackRecordLength({ ...input, confidence: higher }));
      if (low === undefined || high === undefined) return;
      assert.ok(high.observations >= low.observations - SLACK * low.observations);
    }),
    RUNS,
  );
});

const breadthInput = fc.record({
  sleeve_sharpe: fc.double({ min: 0.01, max: 3, noNaN: true }),
  average_pairwise_correlation: fc.double({ min: -1, max: 1, noNaN: true }),
});

test("breadth is total, and the ceiling is s / sqrt(rho) exactly when rho is positive", () => {
  fc.assert(
    fc.property(fc.dictionary(fc.constantFrom("sleeve_sharpe", "average_pairwise_correlation", "sleeves", "target"), anyValue), (body) => {
      const out = refusedOr(() => breadth(body));
      if (out === undefined) return;
      const s = Number(body.sleeve_sharpe);
      const rho = Number(body.average_pairwise_correlation);
      if (rho > 0) assert.equal(out.ceiling, s / Math.sqrt(rho));
      else assert.equal(out.ceiling_is_unbounded, true);
    }),
    RUNS,
  );
});

test("a book never exceeds the breadth ceiling, and adding sleeves never lowers it when rho >= 0", () => {
  fc.assert(
    fc.property(breadthInput.filter((b) => b.average_pairwise_correlation >= 0), fc.integer({ min: 1, max: 499 }), (input, sleeves) => {
      const n = breadth({ ...input, sleeves });
      const next = breadth({ ...input, sleeves: sleeves + 1 });
      if (!n.ceiling_is_unbounded) assert.ok(n.book.book_sharpe <= n.ceiling * (1 + SLACK));
      assert.ok(next.book.book_sharpe >= n.book.book_sharpe * (1 - SLACK));
    }),
    RUNS,
  );
});

test("sleeves_required is the smallest count that reaches the target", () => {
  fc.assert(
    fc.property(breadthInput.filter((b) => b.average_pairwise_correlation > 0), fc.double({ min: 0.05, max: 5, noNaN: true }), (input, target) => {
      const out = breadth({ ...input, target });
      if (!out.target.reachable || out.target.sleeves_required > 500) return;
      const n = out.target.sleeves_required;
      assert.ok(breadth({ ...input, sleeves: n }).book.book_sharpe >= target * (1 - SLACK), `${n} sleeves fall short of ${target}`);
      if (n > 1) assert.ok(breadth({ ...input, sleeves: n - 1 }).book.book_sharpe < target * (1 + SLACK), `${n - 1} sleeves already reach ${target}`);
    }),
    RUNS,
  );
});

const matrixInput = fc
  .record({ rows: fc.integer({ min: 8, max: 40 }), cols: fc.integer({ min: 2, max: 6 }), splits: fc.constantFrom(2, 4, 6, 8) })
  .chain(({ rows, cols, splits }) =>
    fc.record({
      // Returns in basis-point steps up to 10 percent a period. Magnitudes near 1e-158 underflow when
      // squared, which changes a standard deviation under scaling; no return series looks like that.
      matrix: fc.array(fc.array(fc.integer({ min: -1000, max: 1000 }).map((bp) => bp / 10000), { minLength: cols, maxLength: cols }), { minLength: rows, maxLength: rows }),
      n_splits: fc.constant(splits),
    }),
  );

test("CSCV overfitting is total on arbitrary matrices: PBO in [0, 1] or a RangeError", () => {
  fc.assert(
    fc.property(fc.oneof(matrixInput, fc.record({ matrix: fc.array(fc.array(anyValue, { maxLength: 4 }), { maxLength: 12 }), n_splits: anyValue })), (body) => {
      const out = refusedOr(() => overfitting(body));
      if (out === undefined) return;
      assert.ok(isProbability(out.pbo), `pbo ${out.pbo}`);
      assert.ok(out.n_combinations >= 1);
    }),
    { ...RUNS, numRuns: 200 },
  );
});

test("CSCV overfitting is unchanged when every return is scaled by a power of two", () => {
  fc.assert(
    fc.property(matrixInput, fc.integer({ min: -8, max: 8 }), (body, k) => {
      const base = refusedOr(() => overfitting(body));
      if (base === undefined) return;
      const scaled = overfitting({ ...body, matrix: body.matrix.map((row) => row.map((x) => x * 2 ** k)) });
      assert.equal(scaled.pbo, base.pbo);
      assert.equal(scaled.n_combinations, base.n_combinations);
    }),
    { ...RUNS, numRuns: 150 },
  );
});
