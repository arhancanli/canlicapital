// The haircut Sharpe ratio against its sources: Harvey and Liu, "Backtesting", Journal of Portfolio
// Management 42(1), 2015 (people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF,
// sha256 b32ec2e9e08d2450...); the authors' Haircut_SR.m (people.duke.edu/~charvey/backtesting/,
// sha256 ce647111b8f7...), run in GNU Octave with only its print precision raised; and R's pt, qt
// and p.adjust. Fixtures under js/fixtures/ record each source.
//
// Not used as a check: footnote 20's claim that 50 tests take a t-statistic of 7.29 to 6.64. Under
// the normal limit they take it to 6.74, and 6.70 with 600 degrees of freedom; the footnote does not
// state the degrees of freedom behind 6.64.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { autocorrelationFactor, familyAdjusted, haircutSharpe } from "./haircut-core.js";
import { studentTQuantileUpper, studentTUpper } from "./student-t.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

test("Student t tails and quantiles agree with R's pt and qt to 1e-11 relative, down to 1e-40", () => {
  const ref = fixture("student-t-reference.json");
  assert.ok(ref.survival.length > 150 && ref.quantile.length > 100);
  for (const r of ref.survival) {
    // Below double precision (for example t = 40 with 100000 degrees of freedom) R returns 0 too.
    if (r.upper === 0) { assert.equal(studentTUpper(r.t, r.df), 0, `P(T > ${r.t}), df ${r.df}`); continue; }
    const rel = Math.abs(studentTUpper(r.t, r.df) - r.upper) / r.upper;
    assert.ok(rel <= 1e-11, `P(T > ${r.t}), df ${r.df}: relative error ${rel}`);
  }
  for (const r of ref.quantile) {
    const rel = Math.abs(studentTQuantileUpper(r.upper, r.df) - r.t) / Math.max(1, Math.abs(r.t));
    assert.ok(rel <= 1e-11, `upper ${r.upper}, df ${r.df}: relative error ${rel}`);
  }
});

test("Exhibit 5: monthly returns with autocorrelation 0.1 turn an annualized Sharpe of 1 into 0.912", () => {
  assert.equal(autocorrelationFactor(0.1, 12).toFixed(3), "0.912");
  assert.ok(Math.abs(autocorrelationFactor(0.1, 12) - 0.912245460839) < 1e-12);
});

test("the authors' Haircut_SR.m: every deterministic Bonferroni output agrees to 1e-9", () => {
  const ref = fixture("haircut-sr-reference.json");
  assert.equal(ref.cases.length, 5);
  for (const c of ref.cases) {
    const i = c.inputs;
    const r = haircutSharpe({ sharpeAnnualized: i.sharpe_annualized, periodsPerYear: 12, observations: i.observations, tests: i.tests, autocorrelation: i.autocorrelation });
    const label = `${i.observations} months, Sharpe ${i.sharpe_annualized}, ${i.tests} tests`;
    assert.ok(Math.abs(r.sharpe_annualized_corrected - c.sr_annual_ac_corrected) < 1e-9, label);
    assert.ok(Math.abs(r.bonferroni.adjusted_p - c.bonferroni.adjusted_p) < 1e-9, label);
    assert.ok(Math.abs(r.bonferroni.haircut_sharpe_annualized - c.bonferroni.haircut_sharpe_annualized) < 1e-9, label);
    assert.ok(Math.abs(r.bonferroni.haircut * 100 - c.bonferroni.haircut_percent) < 1e-7, label);
  }
});

test("a strong Sharpe keeps a finite haircut where Haircut_SR.m's 1 - tcdf rounds to 0 and returns Inf", () => {
  const { cases } = fixture("haircut-sr-reference.json").excluded;
  assert.equal(cases[0].bonferroni.haircut_sharpe_annualized, "Inf");
  const i = cases[0].inputs;
  const r = haircutSharpe({ sharpeAnnualized: i.sharpe_annualized, periodsPerYear: 12, observations: i.observations, tests: i.tests });
  assert.ok(r.p_value_single > 0 && r.p_value_single < 1e-30);
  assert.ok(Number.isFinite(r.bonferroni.haircut_sharpe_annualized));
  assert.ok(r.bonferroni.haircut > 0 && r.bonferroni.haircut < 0.1);
});

test("Holm and BHY on a family agree with R's p.adjust, ties included", () => {
  const ref = fixture("p-adjust-reference.json");
  for (const f of ref.families) {
    f.p.forEach((_, i) => {
      const a = familyAdjusted(f.p, i);
      assert.ok(Math.abs(a.holm - f.holm[i]) < 1e-15, `holm ${i} of ${f.p.length}`);
      assert.ok(Math.abs(a.bhy - f.BY[i]) < 1e-15, `BY ${i} of ${f.p.length}`);
    });
  }
});

test("one test is no adjustment; more tests never shrink the haircut; Bonferroni is the harsher bound", () => {
  const base = { sharpeAnnualized: 0.8, periodsPerYear: 12, observations: 240 };
  const one = haircutSharpe({ ...base, tests: 1 });
  assert.equal(one.bonferroni.haircut_sharpe_annualized.toFixed(12), (0.8).toFixed(12));
  let previous = -1;
  for (const tests of [1, 2, 5, 20, 100, 1000]) {
    const r = haircutSharpe({ ...base, tests });
    assert.ok(r.bonferroni.haircut >= previous - 1e-12);
    assert.ok(r.bonferroni.adjusted_p >= r.independent.adjusted_p - 1e-15);
    previous = r.bonferroni.haircut;
  }
});

test("the family adjustments use the other tests' own Sharpe ratios, and the count must agree", () => {
  const r = haircutSharpe({ sharpeAnnualized: 1, periodsPerYear: 12, observations: 120, otherSharpesAnnualized: [0.2, 0.5, 0.9, -0.1] });
  assert.equal(r.tests, 5);
  assert.ok(r.holm.adjusted_p <= r.bonferroni.adjusted_p + 1e-15);
  assert.ok(r.bhy.adjusted_p > 0 && r.bhy.adjusted_p <= 1);
  assert.throws(() => haircutSharpe({ sharpeAnnualized: 1, periodsPerYear: 12, observations: 120, tests: 3, otherSharpesAnnualized: [0.2] }), RangeError);
  assert.throws(() => haircutSharpe({ sharpeAnnualized: -0.5, periodsPerYear: 12, observations: 120, tests: 3 }), RangeError);
  assert.throws(() => haircutSharpe({ sharpeAnnualized: 1, periodsPerYear: 12, observations: 120, tests: 3, autocorrelation: 1 }), RangeError);
});
