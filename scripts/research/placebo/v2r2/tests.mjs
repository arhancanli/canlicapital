// Placebo study v2, round 2: the real-data tests, built exactly as round 1 builds them. The functions
// below are copies of round 1's (scripts/research/placebo/v2/run.mjs), which cannot be imported into a
// worker thread because that file starts its own worker loop on import. A unit test checks that both
// build the same tests from the round-1 registration.
import { lastCommonMonth, panel } from "../v2/data.mjs";
import { headline, ruleResults, warmup } from "../v2/pipelines.mjs";

export const TEST_IDS = ["in_sample_search", "oos_published", "oos_selected", "oos_search", "full_search"];
export const monthIndex = (yyyymm) => Math.floor(yyyymm / 100) * 12 + ((yyyymm % 100) - 1);
export const monthsBetween = (a, b) => monthIndex(b) - monthIndex(a) + 1;

export function compileClaim(name, spec) {
  const index = new Map(spec.series.map((s, i) => [s, i]));
  const at = (s) => { if (!index.has(s)) throw new Error(`${name}: unknown series ${s}`); return index.get(s); };
  const claim = { name, ...spec };
  if (spec.pipeline === "vol_managed") claim.columns = Object.fromEntries(spec.series.map((s) => [s, at(s)]));
  else claim.universes = Object.fromEntries(Object.entries(spec.universes).map(([u, list]) => [u, list.map(at)]));
  return claim;
}

export const single = (rule) => Object.fromEntries(Object.entries(rule).map(([k, v]) => [k, [v]]));

export function publishedGrid(claim) {
  if (claim.pipeline === "vol_managed") return { factor: claim.grid.factor, window: [claim.published.window], power: [claim.published.power] };
  return single(claim.published);
}

export function aggregate(results, how) {
  if (how === "mean") return { stat: results.reduce((a, r) => a + r.stat, 0) / results.length, naive: null, bonferroni: null, rules: results.length };
  return headline(results);
}

export const slice = (p, a, b) => ({ returns: p.returns.map((c) => c.subarray(a, b)), variance: p.variance.map((c) => (c ? c.subarray(a, b) : null)) });
export const reorder = (v, idx) => ({ returns: v.returns.map((c) => Float64Array.from(idx, (i) => c[i])), variance: v.variance.map((c) => (c ? Float64Array.from(idx, (i) => c[i]) : null)) });
export const withGrid = (claim, grid) => ({ ...claim, grid });

/** Every real-data test of every claim of a registration (round 1's realTests, plus the panel). */
export function realTests(prereg, blocks) {
  const tests = [];
  const names = Object.keys(prereg.claims);
  names.forEach((name, ci) => {
    const spec = prereg.claims[name];
    const claim = compileClaim(name, spec);
    const sources = spec.series.map((s) => ({ name: s, ...prereg.series[s] }));
    const last = Math.min(lastCommonMonth(blocks, sources), prereg.data.last_month);
    const p = panel(blocks, sources, spec.sample_start, last);
    // Round 1's French panels are complete by construction; the OSAP file can have gaps.
    p.returns.forEach((c, i) => { for (let t = 0; t < c.length; t++) if (!Number.isFinite(c[t])) throw new Error(`${p.names[i]}: no value for ${p.months[t]}`); });
    const isRows = monthsBetween(spec.sample_start, spec.sample_end);
    const w = warmup(spec.pipeline, spec.grid);
    const all = p.months.length;
    const is = slice(p, 0, isRows), full = slice(p, 0, all);
    const make = (id, view, from, permuteFrom, grid, how) => ({ claim: name, claimIndex: ci, id, view, from, permuteFrom, grid, aggregate: how, months: [p.months[from], p.months[view.returns[0].length - 1]] });
    const t1 = make("in_sample_search", is, w, 0, spec.grid, "max");
    const picked = headline(ruleResults(withGrid(claim, spec.grid), is, w)).rule;
    const pubHow = spec.pipeline === "vol_managed" && spec.grid.factor.length > 1 ? "mean" : "max";
    for (const t of [
      t1,
      make("oos_published", full, isRows, isRows, publishedGrid(claim), pubHow),
      make("oos_selected", full, isRows, isRows, single(picked), "max"),
      make("oos_search", full, isRows, isRows, spec.grid, "max"),
      make("full_search", full, w, 0, spec.grid, "max"),
    ]) {
      if (!(spec.tests ?? prereg.tests.ids).includes(t.id)) continue;
      tests.push({ ...t, index: tests.length, picked: t.id === "oos_selected" ? picked : undefined, isRows });
    }
  });
  return tests;
}
