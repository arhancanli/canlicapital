// Placebo study v1 evaluation, by the rule in config/research/placebo-v1-prereg.json: each
// candidate method's size in every null cell (the share of tests in which no placebo was as good as
// the real result, which is p = 0.05 with 19 placebos), the selected method, its power on planted
// trends, and the same rates for the two textbook tests the placebo replaces.
//   node scripts/research/placebo/v1/evaluate.mjs [run] [prereg] [evaluation out]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const round = (x) => Number(x.toFixed(4));
export const cellLabel = (c) => `${c.pipeline}/${c.family}/${c.kind === "null" ? c.variant : `strength_${c.strength}`}`;

// Pearson's chi-square of the rank counts against a uniform rank: under a calibrated method every
// one of the K + 1 ranks is equally likely, not only the top one.
function rankChiSquare(counts, tests) {
  const expected = tests / counts.length;
  return counts.reduce((a, n) => a + (n - expected) ** 2 / expected, 0);
}

export function evaluate(run, prereg) {
  const nulls = run.cells.filter((c) => c.kind === "null");
  const trends = run.cells.filter((c) => c.kind === "power");
  const top = (c, m) => c.rank_counts[m][0] / c.tests;
  const table = Object.fromEntries(prereg.candidates.map((m) => {
    const sizes = nulls.map((c) => top(c, m));
    const chi = nulls.map((c) => rankChiSquare(c.rank_counts[m], c.tests));
    return [m, {
      size: Object.fromEntries(nulls.map((c, i) => [cellLabel(c), round(sizes[i])])),
      worst_size: round(Math.max(...sizes)),
      mean_size: round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
      failures: nulls.flatMap((c, i) => (sizes[i] > prereg.bar.size_max ? [{ cell: cellLabel(c), size: round(sizes[i]) }] : [])),
      rank_uniformity: { worst_chi_square: round(Math.max(...chi)), cells_beyond_critical: chi.filter((x) => x > prereg.report.rank_chi_square_critical).length },
      power: Object.fromEntries(trends.map((c) => [cellLabel(c), round(top(c, m))])),
    }];
  }));
  const passing = prereg.candidates.filter((m) => table[m].failures.length === 0);
  const selected = passing[0] ?? [...prereg.candidates].sort((a, b) => table[a].failures.length - table[b].failures.length || table[a].mean_size - table[b].mean_size)[0];
  const rate = (pick) => Object.fromEntries(run.cells.map((c) => [cellLabel(c), round(pick(c) / c.tests)]));
  return {
    schema: "canli.placebo-evaluation.v1",
    bar: prereg.bar,
    selected,
    selected_by: passing.length ? "the first candidate, in the pre-registered order, meeting the size bar in every null cell" : "no candidate met the bar: the fewest failures, then the smallest mean size",
    candidates: table,
    textbook: { naive: rate((c) => c.naive_rejections), bonferroni: rate((c) => c.bonferroni_rejections) },
    // What each pipeline finds in data with nothing to find: its mean best Sharpe on null markets.
    luck: Object.fromEntries(nulls.map((c) => [cellLabel(c), { real: c.mean_real_sharpe, placebo: c.mean_placebo_sharpe[selected] }])),
    tests: { null: nulls[0].tests, power: trends[0]?.tests ?? 0 },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [runPath = "config/research/placebo-v1.json", preregPath = "config/research/placebo-v1-prereg.json", out = "config/research/placebo-v1-evaluation.json"] = process.argv.slice(2);
  const evaluation = { ...evaluate(JSON.parse(readFileSync(runPath, "utf8")), JSON.parse(readFileSync(preregPath, "utf8"))), prereg: preregPath };
  writeFileSync(out, `${JSON.stringify(evaluation, null, 1)}\n`);
  console.log(`selected ${evaluation.selected} (${evaluation.selected_by}); wrote ${out}`);
}
