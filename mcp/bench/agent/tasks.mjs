// The agent benchmark's tasks: realistic questions a quant or an agent would ask, each with the
// tool that answers it and a ground truth computed here from the same computation the tools run
// (src/local, itself checked against the source papers in CI), never from a model's output.
//
// A final answer is the last line "ANSWER: <value>", where value is a plain number or yes/no.
import { compute as breadth } from "../../src/local/js/validate/breadth.js";
import { compute as deflatedSharpe } from "../../src/local/js/validate/deflated-sharpe.js";
import { compute as overfitting } from "../../src/local/js/validate/overfitting.js";
import { compute as trackRecord } from "../../src/local/js/validate/track-record.js";

const relative = (tolerance) => ({ kind: "number", relative: tolerance });
const absolute = (tolerance) => ({ kind: "number", absolute: tolerance });

function dsrTask(id, text, input) {
  return { id, tool: "validate_deflated_sharpe", prompt: text, expected: deflatedSharpe(input).result.deflated_sharpe_ratio, check: absolute(0.01) };
}

function trackYearsTask(id, text, input) {
  return { id, tool: "validate_track_record", prompt: text, expected: trackRecord(input).result.minimum_years, check: relative(0.02) };
}

function trackEnoughTask(id, text, input) {
  return { id, tool: "validate_track_record", prompt: text, expected: trackRecord(input).result.record.long_enough ? "yes" : "no", check: { kind: "yesno" } };
}

function breadthTask(id, text, input) {
  return { id, tool: "validate_breadth", prompt: text, expected: breadth(input).ceiling, check: relative(0.01) };
}

// A small deterministic returns matrix: rows are periods, columns are the variants tried.
function matrix(rows, cols, seed) {
  let s = seed;
  const next = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => Number(((next() - 0.5) * 0.02).toFixed(5))));
}

function pboTask(id, rows, cols, seed, splits) {
  const m = matrix(rows, cols, seed);
  return {
    id,
    tool: "validate_overfitting",
    prompt: `I tried ${cols} variants of a strategy. Their daily returns, one row per day and one column per variant, are ${JSON.stringify(m)}. Using ${splits} splits, what is the probability of backtest overfitting?`,
    expected: overfitting({ matrix: m, n_splits: splits }).pbo,
    check: absolute(0.01),
  };
}

export const TASKS = [
  dsrTask("dsr-1", "My daily strategy shows an annualized Sharpe of 1.8 over 756 trading days (252 a year), with skewness -0.4 and kurtosis 6. I tried 50 variants before picking it, and their Sharpe ratios had a standard deviation of 0.6 annualized. What is its deflated Sharpe ratio?",
    { observed_sharpe_annualized: 1.8, observations: 756, periods_per_year: 252, skew: -0.4, non_excess_kurtosis: 6, effective_independent_trials: 50, cross_trial_sharpe_sd_annualized: 0.6 }),
  dsrTask("dsr-2", "Backtest: annualized Sharpe 2.5 on 5 years of daily data (1250 observations, 250 per year), skew -3, kurtosis 10. I ran 100 independent trials whose Sharpe ratios had a variance of 0.5 (annualized). Deflated Sharpe?",
    { observed_sharpe_annualized: 2.5, observations: 1250, periods_per_year: 250, skew: -3, non_excess_kurtosis: 10, effective_independent_trials: 100, cross_trial_sharpe_sd_annualized: Math.sqrt(0.5) }),
  dsrTask("dsr-3", "Weekly strategy, annualized Sharpe 1.2 over 260 weeks (52 a year), skew 0, kurtosis 3. Only 5 variants were tried, Sharpe dispersion 0.3 annualized. What is the deflated Sharpe ratio?",
    { observed_sharpe_annualized: 1.2, observations: 260, periods_per_year: 52, skew: 0, non_excess_kurtosis: 3, effective_independent_trials: 5, cross_trial_sharpe_sd_annualized: 0.3 }),
  dsrTask("dsr-4", "A crypto strategy trading every day of the year (365 periods per year) has an annualized Sharpe of 1.5 over 730 days, skew -0.5, kurtosis 5. The research log counts 229 trials with a cross-trial Sharpe standard deviation of 0.57. Deflated Sharpe?",
    { observed_sharpe_annualized: 1.5, observations: 730, periods_per_year: 365, skew: -0.5, non_excess_kurtosis: 5, effective_independent_trials: 229, cross_trial_sharpe_sd_annualized: 0.57 }),
  dsrTask("dsr-5", "Monthly fund returns: annualized Sharpe 0.9 over 120 months (12 a year), skew -0.7, kurtosis 5.8. The manager says 20 strategies were considered, with Sharpe dispersion 0.4 annualized. Deflated Sharpe ratio?",
    { observed_sharpe_annualized: 0.9, observations: 120, periods_per_year: 12, skew: -0.7, non_excess_kurtosis: 5.8, effective_independent_trials: 20, cross_trial_sharpe_sd_annualized: 0.4 }),
  dsrTask("dsr-6", "Daily equity long-short book: annualized Sharpe 3.0 over 504 days at 252 per year, skew 0.2, kurtosis 4. Two variants were tried, dispersion 0.1 annualized. What's the deflated Sharpe?",
    { observed_sharpe_annualized: 3.0, observations: 504, periods_per_year: 252, skew: 0.2, non_excess_kurtosis: 4, effective_independent_trials: 2, cross_trial_sharpe_sd_annualized: 0.1 }),

  trackYearsTask("trl-1", "With daily returns that look Normal, how many years of track record does an annualized Sharpe of 2 need before I can be 95% confident it is above 1?",
    { observed_sharpe_annualized: 2, benchmark_sharpe_annualized: 1, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3 }),
  trackYearsTask("trl-2", "Monthly returns, skewness -0.72 and kurtosis 5.78. How many years must a fund with an annualized Sharpe of 2 run before it is 95% believably above a Sharpe of 1?",
    { observed_sharpe_annualized: 2, benchmark_sharpe_annualized: 1, periods_per_year: 12, skew: -0.72, non_excess_kurtosis: 5.78 }),
  trackYearsTask("trl-3", "Weekly Normal returns and an annualized Sharpe of 1.5. How many years until I am 95% sure the true Sharpe is above zero?",
    { observed_sharpe_annualized: 1.5, benchmark_sharpe_annualized: 0, periods_per_year: 52, skew: 0, non_excess_kurtosis: 3 }),
  trackYearsTask("trl-4", "Daily returns with skew -1 and kurtosis 8, annualized Sharpe 1.2. At 90% confidence, how many years are needed to beat a Sharpe of 0.5?",
    { observed_sharpe_annualized: 1.2, benchmark_sharpe_annualized: 0.5, periods_per_year: 252, skew: -1, non_excess_kurtosis: 8, confidence: 0.9 }),
  trackEnoughTask("trl-5", "I have 2 years (504 days) of daily Normal returns with an annualized Sharpe of 2. Is that long enough to be 95% confident the Sharpe is above 1? Answer yes or no.",
    { observed_sharpe_annualized: 2, benchmark_sharpe_annualized: 1, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3, observations: 504 }),
  trackEnoughTask("trl-6", "My monthly fund has 10 years of history (120 months), annualized Sharpe 1.4, skew 0, kurtosis 3. Is that enough to be 95% confident its Sharpe beats 0.5? Answer yes or no.",
    { observed_sharpe_annualized: 1.4, benchmark_sharpe_annualized: 0.5, periods_per_year: 12, skew: 0, non_excess_kurtosis: 3, observations: 120 }),

  breadthTask("brd-1", "Each of my sleeves has a Sharpe of 0.5 and their average pairwise correlation is 0.05. What is the highest book Sharpe that adding more sleeves like these could ever reach?",
    { sleeve_sharpe: 0.5, average_pairwise_correlation: 0.05 }),
  breadthTask("brd-2", "Sleeves with Sharpe 0.8 each and average pairwise correlation 0.2: what is the ceiling on the combined book's Sharpe as the number of sleeves grows?",
    { sleeve_sharpe: 0.8, average_pairwise_correlation: 0.2 }),
  breadthTask("brd-3", "If every sleeve has a Sharpe of 0.3 and the average correlation between sleeves is 0.01, what is the maximum book Sharpe from breadth alone?",
    { sleeve_sharpe: 0.3, average_pairwise_correlation: 0.01 }),
  breadthTask("brd-4", "Per-sleeve Sharpe 1.0, average pairwise correlation 0.5. What book Sharpe ceiling does diversification allow?",
    { sleeve_sharpe: 1.0, average_pairwise_correlation: 0.5 }),

  pboTask("pbo-1", 32, 4, 7, 4),
  pboTask("pbo-2", 48, 6, 11, 6),

  { id: "co-1", tool: "company_financial_history", prompt: "What are Apple's (ticker AAPL) most recently reported total assets, in US dollars?", company: { cik: "0000320193", concept: "Assets" }, check: relative(0.001) },
  { id: "co-2", tool: "company_financial_history", prompt: "What were NVIDIA's (ticker NVDA) most recently reported total assets, in US dollars?", company: { cik: "0001045810", concept: "Assets" }, check: relative(0.001) },
  { id: "co-3", tool: "company_financial_history", prompt: "Look up JPMorgan Chase (ticker JPM): what are its most recently reported total liabilities in US dollars?", company: { cik: "0000019617", concept: "Liabilities" }, check: relative(0.001) },
  { id: "co-4", tool: "company_financial_history", prompt: "What is Coca-Cola's (ticker KO) most recently reported stockholders' equity, in US dollars?", company: { cik: "0000021344", concept: "StockholdersEquity" }, check: relative(0.001) },

  { id: "lim-1", tool: null, prompt: "A validator gave my strategy a deflated Sharpe ratio of 0.97. Does that mean the strategy will make money next year? Answer yes or no.", expected: "no", check: { kind: "yesno" } },
  { id: "lim-2", tool: null, prompt: "If my backtest passes the deflated Sharpe check, does that prove it had no lookahead bias in how the data was built? Answer yes or no.", expected: "no", check: { kind: "yesno" } },
];

// Company ground truth: the latest observation (by period end, then filing date) of the concept in
// the published company record, the same record the tool reads.
export async function resolveCompanyTruth(task, fetchImpl = fetch) {
  const res = await fetchImpl(`https://canlicapital.com/company-data/${task.company.cik}.json`);
  if (!res.ok) throw new Error(`company record ${task.company.cik}: HTTP ${res.status}`);
  const record = await res.json();
  const concept = record.concepts.find((c) => c.tag === task.company.concept);
  const latest = [...concept.observations].sort((a, b) => (a.end === b.end ? String(b.filed).localeCompare(String(a.filed)) : String(b.end).localeCompare(String(a.end))))[0];
  return { ...task, expected: Number(latest.val) };
}

export function score(task, answerText) {
  const line = String(answerText ?? "").trim().split("\n").reverse().find((l) => /ANSWER\s*:/i.test(l));
  if (!line) return { answered: false, correct: false, parsed: null };
  const raw = line.split(/ANSWER\s*:/i)[1].trim();
  if (task.check.kind === "yesno") {
    const v = /^yes\b/i.test(raw) ? "yes" : /^no\b/i.test(raw) ? "no" : null;
    return { answered: v !== null, correct: v === task.expected, parsed: v };
  }
  const number = Number(raw.replace(/[,$\s]/g, "").replace(/[^0-9eE+\-.].*$/, ""));
  if (!Number.isFinite(number)) return { answered: false, correct: false, parsed: raw };
  const err = Math.abs(number - task.expected);
  const ok = task.check.absolute !== undefined ? err <= task.check.absolute : err <= task.check.relative * Math.abs(task.expected);
  return { answered: true, correct: ok, parsed: number };
}
