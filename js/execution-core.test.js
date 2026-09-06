// Tests for the execution-reality core. The classification tests are the point:
// the page's whole claim is that these assumptions are not the same kind of thing,
// and that claim is only worth making if the measurement can tell them apart.

import assert from "node:assert/strict";
import test from "node:test";

import {
  VARIANTS, classify, compareVariants, generateSeries, runVariant, sweepSeeds,
} from "./execution-core.js";

const SERIES = () => generateSeries({ seed: 31337, bars: 750, gapVolatility: 0.004 });
const SETTINGS = { spreadBps: 5, delayBars: 1, impactBps: 8, outageRate: 0.05 };

test("a series with no overnight gap is refused, because the comparison would be vacuous", () => {
  // Without a gap, open[t+1] IS close[t], so "fill at the next open" and "fill at
  // the decision close" are the same price and the page's headline collapses to a
  // tie that looks like a finding.
  const flat = generateSeries({ seed: 1, bars: 200 });
  assert.equal(flat[1].open, flat[0].close, "the shared generator should be continuous by default");
  assert.throws(
    () => runVariant({ series: flat, fast: 5, slow: 20, config: VARIANTS[1].config }),
    /no overnight gap/,
  );
});

test("with a gap, the idealised fill and the honest fill genuinely differ", () => {
  const series = SERIES();
  const idealised = runVariant({ series, fast: 14, slow: 34, config: VARIANTS[0].config });
  const honest = runVariant({ series, fast: 14, slow: 34, config: VARIANTS[1].config });
  assert.notEqual(idealised.sharpeAnnualised, honest.sharpeAnnualised);
});

test("a cost never helps: spread strictly reduces the result on every series", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const series = generateSeries({ seed, bars: 500, gapVolatility: 0.004 });
    const base = { fillAtDecisionClose: false, spreadBps: 0, delayBars: 0, impactBps: 0, outageRate: 0 };
    const free = runVariant({ series, fast: 8, slow: 30, config: base });
    const charged = runVariant({ series, fast: 8, slow: 30, config: { ...base, spreadBps: 20 } });
    assert.ok(
      charged.totalReturn <= free.totalReturn,
      `seed ${seed}: a pure cost improved the result, which cannot happen`,
    );
  }
});

test("THE CLASSIFICATION: costs and re-timings are told apart by measurement", () => {
  const rows = sweepSeeds({
    seeds: 200, bars: 600, gapVolatility: 0.004, fast: 14, slow: 34, settings: SETTINGS,
  });
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));

  // Pure costs: negative every time, with an enormous t.
  for (const key of ["spread", "impact"]) {
    assert.equal(classify(by[key]), "COST", `${key} should classify as a cost`);
    assert.ok(by[key].worseShare >= 0.98, `${key} helped on ${(1 - by[key].worseShare) * 100}% of series`);
    assert.ok(Math.abs(by[key].t) > 20, `${key} has t=${by[key].t}, too weak for a cost`);
  }

  // The lookahead defect on an edge-free series: no reliable direction at all.
  // This is the uncomfortable result and it must not quietly become a "cost".
  assert.equal(
    classify(by.idealised), "INDISTINGUISHABLE",
    "on a series with no edge, filling at the decision price has no systematic effect: " +
      "its damage is proportional to how predictive the signal is, which is the thing " +
      "the backtest was meant to establish",
  );

  // A re-timing moves the result without a dependable sign.
  assert.notEqual(classify(by.delay), "COST", "a delay is not a cost, it changes which prices you get");
  assert.ok(by.delay.worseShare < 0.9, "a delay that always hurt would be a cost after all");
});

test("assumptions turned off are excluded rather than reported as no effect", () => {
  const rows = sweepSeeds({
    seeds: 20, bars: 400, gapVolatility: 0.004, fast: 8, slow: 30,
    settings: { spreadBps: 0, delayBars: 0, impactBps: 0, outageRate: 0 },
  });
  // Only the idealised fill remains, since it is not a numeric setting.
  assert.deepEqual(rows.map((r) => r.key), ["idealised"]);
});

test("an outage holds the previous position rather than flattening it", () => {
  const series = SERIES();
  const base = { fillAtDecisionClose: false, spreadBps: 0, delayBars: 0, impactBps: 0, outageRate: 0 };
  const always = runVariant({ series, fast: 14, slow: 34, config: { ...base, outageRate: 1 }, outageSeed: 3 });
  // With every rebalance failing, the position can never leave its starting value,
  // so the strategy never trades and every return is zero.
  assert.ok(always.returns.every((r) => r === 0), "a total outage should leave the position untouched");
});

test("the gap is measured from the honest baseline, not from the idealised fill", () => {
  const c = compareVariants({ series: SERIES(), fast: 14, slow: 34, outageSeed: 7 });
  const baseline = c.rows.find((r) => r.key === "next_open").result.sharpeAnnualised;
  assert.equal(c.executionGap.baselineSharpe, baseline);
  assert.equal(
    c.executionGap.sharpeLost,
    baseline - c.rows.at(-1).result.sharpeAnnualised,
  );
  // Reported, but kept out of the headline number.
  assert.ok("idealisedMinusBaseline" in c.executionGap);
});

test("every variant prices the SAME decisions, which is what makes them comparable", () => {
  const series = SERIES();
  const compared = compareVariants({ series, fast: 14, slow: 34, outageSeed: 5 });
  const lengths = new Set(compared.rows.map((r) => r.result.returns.length));
  assert.equal(
    lengths.size, 1,
    `variants priced ${[...lengths].join(" and ")} decisions, so their Sharpes are computed over ` +
      "different samples and the comparison is not like for like",
  );
});

test("without a shared reserve the samples differ, which is why reserveBars exists", () => {
  // The failure this guards against, demonstrated rather than described: a delayed
  // variant needs an extra bar of runway, so left to itself it prices one fewer
  // decision than an undelayed one.
  const series = SERIES();
  const undelayed = runVariant({ series, fast: 14, slow: 34, config: VARIANTS[1].config, outageSeed: 5 });
  const delayed = runVariant({ series, fast: 14, slow: 34, config: VARIANTS[3].config, outageSeed: 5 });
  assert.equal(delayed.returns.length, undelayed.returns.length - 1);
  // And a reserve smaller than the delay is refused rather than silently honoured.
  assert.throws(
    () => runVariant({ series, fast: 14, slow: 34, config: VARIANTS[3].config, reserveBars: 0 }),
    /at least this variant's delay/,
  );
});
