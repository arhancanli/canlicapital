#!/usr/bin/env node
// Writes the research pages for Canli Capital's own methods from their committed study results,
// and publishes those results under /glassbox/research/ so every figure on the page traces to a
// downloadable artifact (scripts/audit-published-numbers.mjs). The page text is generated here;
// no figure is typed. scripts/build-method-papers.test.mjs fails if a committed page drifts from
// what this script writes.
//   node scripts/build-method-papers.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const STUDIES = Object.freeze({
  luck: "config/research/luck-trials-size-study.json",
  zoo: "config/research/null-zoo-v0.json",
});

const read = (rel) => JSON.parse(readFileSync(resolve(ROOT, rel), "utf8"));
const f3 = (x) => x.toFixed(3);
const pct = (x) => `${(100 * x).toFixed(1)}%`;

const LUCK_METHODS = { student_t_null: "Student t null (shipped)", dsr_standard_error: "Non-normal standard error (deflated Sharpe convention)", bootstrap: "Bootstrap of the best trial's returns" };
const ZOO_FAMILIES = {
  iid_normal: "Independent normal returns",
  student_t4: "Fat tails (Student t)",
  skew_negative: "Negative skew",
  skew_positive: "Positive skew",
  garch: "Volatility clustering (GARCH)",
  ar1: "Autocorrelated returns (AR(1))",
  regimes: "Two volatility regimes",
  correlated_trials: "Correlated trials (one common factor)",
};
const ZOO_VALIDATORS = { luck_trials: "Luck-equivalent trials", luck_trials_lo: "Luck-equivalent trials, Lo-corrected", luck_trials_nonnormal_se: "Luck trials, non-normal SE", haircut_bonferroni: "Haircut Sharpe (Bonferroni)", haircut_bonferroni_lo: "Haircut Sharpe (Bonferroni, Lo-corrected)", deflated_sharpe: "Deflated Sharpe ratio at 0.95", bootstrap_best: "Bootstrap of the best trial" };

export function luckPaper(luck, zoo) {
  const designs = [...new Set(luck.rows.map((r) => r.t))].sort((a, b) => a - b);
  const longest = designs.at(-1);
  const rows = luck.rows.filter((r) => r.t === longest);
  const table = ["| Returns | " + Object.values(LUCK_METHODS).join(" | ") + " |", "|---|" + Object.keys(LUCK_METHODS).map(() => "---").join("|") + "|",
    ...rows.map((r) => `| ${ZOO_FAMILIES[r.distribution === "student_t4" ? "student_t4" : r.distribution] ?? r.distribution.replaceAll("_", " ")} | ${Object.keys(LUCK_METHODS).map((m) => f3(r.size[m].at_5_percent)).join(" | ")} |`)].join("\n");
  const ar = zoo.rows.find((r) => r.family === "ar1");
  const iid = zoo.rows.find((r) => r.family === "iid_normal");
  return `# Luck-equivalent trials: how many skill-less strategies it takes to reach a Sharpe by luck

**Short title:** Luck-equivalent trials
**Author:** Arhan Canli
**Declared:** 2026-09-26, with its calibration study published beside it.

A backtest's Sharpe ratio means little until you know how many strategies were tried to find it.
Luck-equivalent trials answers the reviewer's question in the unit a research log records: how many
independent, skill-less strategies would a search have had to try for its best to reach this Sharpe
by luck alone?

## The statistic

Under the null of no skill and normal returns, a Sharpe ratio's t-statistic (the per-period Sharpe
times the square root of the number of observations) follows a Student t distribution with one
fewer degree of freedom than there are observations. One skill-less trial therefore reaches the
observed Sharpe with a known probability p. The best of N independent skill-less trials reaches it
with probability 1 - (1 - p)^N, so the N at which that probability equals a chosen level q is
ln(1 - q) / ln(1 - p). The statistic reports that N at even odds and at the five percent level, the
N whose expected best (the deflated Sharpe ratio's benchmark) matches the observation, and, given a
trial count, the chance that the best of that many reached the Sharpe by luck.

Each piece is a known result. What is new is the statistic, stated in trials, with its calibration
measured and its failure cases published.

## Calibration

Rejection rate at the ${pct(zoo.design.level)} level when every strategy is skill-less, from
[\`/glassbox/research/luck-trials-size-study.json\`](/glassbox/research/luck-trials-size-study.json)
(searches of ${rows[0].trials} strategies over ${longest} periods, ${rows[0].reps} searches per
cell, fixed seeds). A calibrated statistic rejects at the level.

${table}

No method is calibrated for every return shape. The Student t null holds for normal and fat-tailed
returns but is too generous to negatively skewed strategies; the non-normal standard error fixes
negative skew and fails under fat tails; a bootstrap of the best trial's returns is closest overall
but inherits the selection that made that trial the best.

## Autocorrelation

On the Null Zoo ([\`/research/null-zoo-v0\`](/research/null-zoo-v0)), autocorrelated returns
make a skill-less search look skilled: at the same level the statistic rejected ${f3(ar.size.luck_trials)}
of searches. Correcting the Sharpe for the returns' own autocorrelation as Lo (2002) does brings it
to ${f3(ar.size.luck_trials_lo)}, and costs nothing where there is no autocorrelation (${f3(iid.size.luck_trials)}
before, ${f3(iid.size.luck_trials_lo)} after). The API and the MCP tool accept the autocorrelation.

## Use it

\`POST /api/v1/validate/luck-trials\` with a free key, or the \`validate_luck_trials\` tool in the
\`canli-validation-mcp\` server on npm. Every result is stored as a signed receipt.

## Evidence boundary

The statistic counts independent trials; correlated trials count as fewer, and the caller must
estimate how many. It assumes no skill under the null and says nothing about whether a strategy
will make money. Its calibration is measured on the return shapes above and no others.
`;
}

export function zooPaper(zoo) {
  const validators = Object.keys(ZOO_VALIDATORS).filter((v) => zoo.rows[0].size[v] !== undefined);
  const table = (kind) => ["| Returns | " + validators.map((v) => ZOO_VALIDATORS[v]).join(" | ") + " |", "|---|" + validators.map(() => "---").join("|") + "|",
    ...zoo.rows.map((r) => `| ${ZOO_FAMILIES[r.family] ?? r.family} | ${validators.map((v) => f3(r[kind][v])).join(" | ")} |`)].join("\n");
  const ar = zoo.rows.find((r) => r.family === "ar1");
  const iid = zoo.rows.find((r) => r.family === "iid_normal");
  return `# Null Zoo v0: backtest-overfitting corrections scored on ground truth

**Short title:** Null Zoo v0
**Author:** Arhan Canli
**Declared:** 2026-09-26, with every cell's seed in the published results.

Every correction for backtest overfitting makes a promise: that a skill-less strategy will pass it
no more often than its stated level. The Null Zoo tests the promise. It draws research searches in
which the truth is known, from return families with different shapes, and counts how often each
correction calls a skill-less search's best strategy skilled (its size) and how often it finds a
strategy that does have skill (its power).

## Design

Each search tries ${zoo.design.trials} strategies over ${zoo.design.observations} daily
observations; every strategy has a true Sharpe of zero, except in the power arm, where one has a
true annualized Sharpe of ${zoo.design.skill}. Each cell runs ${zoo.reps} searches with its own
fixed seed. The level is ${pct(zoo.design.level)}. Results:
[\`/glassbox/research/null-zoo-v0.json\`](/glassbox/research/null-zoo-v0.json); generators and
checks: \`scripts/research/null-zoo/\` in the open repository.

## Size: how often a skill-less search is called skilled

${table("size")}

## Power: how often a strategy with skill is found

${table("power")}

## What it shows

- Autocorrelated returns break every best-of-N test that ignores them: luck-equivalent trials
  rejected ${f3(ar.size.luck_trials)} and the Bonferroni haircut ${f3(ar.size.haircut_bonferroni)}
  of skill-less searches. Lo's correction brings luck-equivalent trials to ${f3(ar.size.luck_trials_lo)}.
- The deflated Sharpe ratio read as a test at 0.95 almost never calls noise skilled
  (${f3(iid.size.deflated_sharpe)}) but finds the skilled strategy in only ${f3(iid.power.deflated_sharpe)}
  of searches, against ${f3(iid.power.luck_trials)} for luck-equivalent trials. It subtracts the
  expected best of N and then asks for high confidence on top: an estimate, not a test at its level.
- Haircut Sharpe p-values are two-sided, as the authors define them, so their size sits near half
  the level by construction.

## Evidence boundary

These are synthetic searches. They measure how corrections behave on known return shapes; they do
not say which shape a real strategy has, and a correction that passes here can still fail on a
shape the zoo does not contain.
`;
}

export function build({ write = true } = {}) {
  const luck = read(STUDIES.luck);
  const zoo = read(STUDIES.zoo);
  const pages = { "public/research/luck-equivalent-trials.md": luckPaper(luck, zoo), "public/research/null-zoo-v0.md": zooPaper(zoo) };
  if (write) {
    mkdirSync(resolve(ROOT, "public/glassbox/research"), { recursive: true });
    for (const rel of Object.values(STUDIES)) copyFileSync(resolve(ROOT, rel), resolve(ROOT, "public/glassbox/research", rel.split("/").at(-1)));
    for (const [rel, text] of Object.entries(pages)) writeFileSync(resolve(ROOT, rel), text);
  }
  return pages;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pages = build();
  console.log(`method papers: ${Object.keys(pages).length} pages, ${Object.keys(STUDIES).length} study results published under /glassbox/research/`);
}
