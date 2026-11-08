// Placebo study v2: applies the pre-registered bars and decision rules to the two result files.
//   node scripts/research/placebo/v2/evaluate.mjs <prereg> <sim results> <real results> > evaluation.json
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Holm step-down adjusted p-values, in the input order. */
export function holm(ps) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = new Array(ps.length);
  let running = 0;
  order.forEach(([p, i], rank) => {
    running = Math.max(running, Math.min(1, (ps.length - rank) * p));
    out[i] = running;
  });
  return out;
}

const round = (x) => Number(x.toFixed(6));

export function evaluate(prereg, sim, real) {
  const bars = prereg.bars;
  // Calibration: the share of tests in which no placebo was at least as good (p = 1/20).
  const cells = sim.cells.map((c) => ({
    claim: c.claim, family: c.family, tests: c.tests,
    rejection: round(c.rank_counts[0] / c.tests),
    naive: round(c.naive_rejections / c.tests), bonferroni: round(c.bonferroni_rejections / c.tests),
    role: bars.cell_roles[c.claim]?.[c.family] ?? "report",
  }));
  const failures = cells.filter((c) => (c.role === "exchangeable" || c.role === "claim_false") && c.rejection > bars.size_max);
  const labelled = [...new Set(failures.filter((c) => c.role === "claim_false").map((c) => c.claim))];
  const codeCheck = failures.filter((c) => c.role === "exchangeable");

  // Real data: Holm within each pre-registered family.
  const tests = real.tests.map((t) => ({ ...t, family: prereg.claims[t.claim].family === "primary" && prereg.families.primary_tests.includes(t.test) ? "primary" : "secondary" }));
  for (const family of ["primary", "secondary"]) {
    const mine = tests.filter((t) => t.family === family);
    holm(mine.map((t) => t.p_value)).forEach((p, i) => { mine[i].holm_p = round(p); });
  }
  const verdict = (t) => (t ? (t.holm_p < bars.alpha ? "below" : "not below") : "not run");
  const find = (claim, test) => tests.find((t) => t.claim === claim && t.test === test);
  const claims = Object.entries(prereg.claims).filter(([, c]) => c.family === "primary").map(([name, c]) => ({
    claim: name, label: c.label,
    in_sample: verdict(find(name, "in_sample_search")),
    out_of_sample: verdict(find(name, "oos_published")),
    caveat: labelled.includes(name) ? "the simulated claim-false cell for this pipeline exceeded the size bar: a small p-value here shows time-series structure, not the claim" : null,
  }));
  return {
    schema: "canli.placebo-evaluation.v2",
    bars,
    calibration: { cells, failures, code_check_failures: codeCheck, labelled_pipelines: labelled },
    real: tests,
    claims,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [preregPath, simPath, realPath] = process.argv.slice(2);
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  process.stdout.write(`${JSON.stringify(evaluate(read(preregPath), read(simPath), read(realPath)), null, 1)}\n`);
}
