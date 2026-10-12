// mcp/src/lab-schemas.mjs
//
// Input and output schemas for the lab tools (src/lab.mjs): backtest_strategy, summarize_series,
// stress_test, check_feasibility, check_leakage and placebo_test. Like the validators'
// descriptions, each tool description carries one sentence of its own result's boundary language
// verbatim (test/lab.test.mjs checks it against the sentences the computation attaches), so an
// agent reads what the result cannot be used to claim before it ever calls the tool. Descriptions
// stay terse: the tool list is re-sent to the model on every turn.
import { z } from "zod";
import { BACKTEST_LIMITS_TEXT, FAMILIES } from "./local/js/backtest-core.js";
import { FEASIBILITY_LIMITS_TEXT } from "./local/js/feasibility-core.js";
import { SUMMARY_LIMITS_TEXT } from "./local/js/series-summary-core.js";
import { STRESS_LIMITS_TEXT } from "./local/js/stress-core.js";
import { LEAKAGE_LIMITS_TEXT } from "./local/js/leakage-core.js";
import { PLACEBO_LIMITS_TEXT, PLACEBO_METHODS } from "./local/js/placebo-core.js";

export const LAB_BOUNDARY = Object.freeze({
  backtest_strategy: BACKTEST_LIMITS_TEXT[3],
  summarize_series: SUMMARY_LIMITS_TEXT[2],
  stress_test: STRESS_LIMITS_TEXT[2],
  check_feasibility: FEASIBILITY_LIMITS_TEXT[0],
  check_leakage: LEAKAGE_LIMITS_TEXT[0],
  placebo_test: PLACEBO_LIMITS_TEXT[0],
});

export const LAB_TOOL_DESCRIPTIONS = Object.freeze({
  backtest_strategy: `Backtest a rule on your prices over a whole parameter grid, then validate the best with the count of variants actually run: deflated Sharpe, overfitting probability, minimum track record, vs buy and hold, after costs. ${LAB_BOUNDARY.backtest_strategy}`,
  summarize_series: `Summarize a long price or return series in about 100 words plus fields: growth, risk, dated drawdowns, trend, volatility regime, tails, jumps, stale data. Use instead of reading raw bars. ${LAB_BOUNDARY.summarize_series}`,
  stress_test: `Stress a strategy's returns: bootstrap histories (how often the drawdown limit breaks or Sharpe turns negative) and named crash, volatility, repeat and stuck-position scenarios, with a fragility share. ${LAB_BOUNDARY.stress_test}`,
  check_feasibility: `Check a trading plan before it trades: broker order-rate and minimum-order limits, 2026 US day-trading rules, square-root market impact with crowding, and the capital where costs eat the return. ${LAB_BOUNDARY.check_feasibility}`,
  check_leakage: `Test whether a signal looks ahead: plan gives cuts; rerun your code on the first cut rows for each, then compare. Rows that changed used later rows; the result names the pattern and horizon. No code is sent. ${LAB_BOUNDARY.check_leakage}`,
  placebo_test: `Test whether your pipeline finds edges in noise: plan writes placebo files (your data's returns in random orders, so nothing is predictable); run the whole pipeline on real.csv and on each, then compare for a p-value that counts every choice it makes. ${LAB_BOUNDARY.placebo_test}`,
});

const FAMILY_NAMES = Object.keys(FAMILIES);
// Lengths, counts and magnitudes are checked by the computation itself (src/local/js/*-core.js),
// with messages that say what to send instead; the advertised schema keeps types, enums and the
// bounds that tell a model what a value means (fractions, signs), because every bound here is
// re-sent to the model on every turn.
const series = () => z.array(z.number());
const file = (what) => z.string().describe(`CSV or JSON of ${what} on this machine; local server only.`);
const column = z.union([z.string(), z.number().int()]).describe("Column name or 1-based position.");
const periods = z.number().describe("252 daily (default), 365 crypto, 52 weekly, 12 monthly.");
const dates = z.array(z.string()).describe("Optional ISO dates, one per value.");

export const backtestInput = z
  .object({
    family: z.enum(FAMILY_NAMES).describe("sma_cross (fast, slow), momentum (lookback, skip), mean_reversion (window, entry_z), breakout (lookback), buy_and_hold."),
    grid: z.record(z.string(), z.union([z.number(), z.array(z.number())])).optional()
      .describe('Values per parameter, e.g. {"fast":[10,20],"slow":[50,200]}; every valid combination runs (max 200).'),
    prices: series().optional().describe("Prices, oldest first."),
    prices_file: file("prices").optional(),
    prices_column: column.optional(),
    dates: dates.optional(),
    periods_per_year: periods.optional(),
    cost_bps: z.number().min(0).optional().describe("Cost per unit of turnover, bps; default 5."),
    allow_short: z.boolean().optional().describe("Short instead of flat; default false."),
  })
  .strict();

export const summarizeInput = z
  .object({
    prices: series().optional().describe("Prices, oldest first; or returns, or series_file."),
    returns: z.array(z.number()).optional().describe("Returns as fractions, oldest first."),
    series_file: file("prices or returns").optional(),
    series_column: column.optional(),
    series_kind: z.enum(["prices", "returns"]).optional().describe("series_file holds; default prices."),
    dates: dates.optional(),
    periods_per_year: periods.optional(),
    benchmark_returns: z.array(z.number()).optional().describe("Same-period benchmark returns; adds beta."),
    name: z.string().optional().describe("Label for the text."),
  })
  .strict();

export const stressInput = z
  .object({
    returns: z.array(z.number()).optional().describe("Strategy returns as fractions, oldest first."),
    returns_file: file("returns").optional(),
    returns_column: column.optional(),
    periods_per_year: periods.optional(),
    paths: z.number().int().optional().describe("Default 1000."),
    block: z.number().optional().describe("Mean block length; default cube root of n."),
    seed: z.number().int().optional().describe("Default 42; reproduces exactly."),
    drawdown_limit: z.number().gt(0).lt(1).optional().describe("Fraction; default 0.2."),
    crash: z.number().gt(-1).lt(0).optional().describe("Crash size, negative; default min(-0.2, 3x worst period)."),
    volatility_multiplier: z.number().optional().describe("Default 2."),
    outage_periods: z.number().int().optional().describe("Stuck periods after the worst; default 5."),
  })
  .strict();

export const feasibilityInput = z
  .object({
    broker: z.enum(["alpaca", "ibkr", "other"]).optional().describe("Default other."),
    asset_class: z.enum(["us_equity", "crypto", "futures", "fx", "options"]).optional().describe("Default us_equity."),
    account: z.enum(["cash", "margin"]).optional().describe("Default margin; cash adds T+1 settlement checks."),
    capital_usd: z.number().describe("Account capital, e.g. 250000."),
    orders_per_rebalance: z.number().int().describe("Orders sent each rebalance, e.g. 40."),
    rebalances_per_year: z.number().describe("e.g. 52 weekly, 252 daily."),
    turnover_per_year: z.number().min(0).describe("Buys plus sells a year / capital."),
    adv_usd: z.number().describe("Daily dollar volume of a typical holding."),
    daily_volatility: z.number().max(1).describe("Of a typical holding, e.g. 0.02."),
    copies: z.number().int().optional().describe("Agents trading the same signal at once; default 1."),
    expected_gross_return: z.number().min(-1).optional().describe("Annual, before costs; adds capacity."),
    spread_and_fees_bps: z.number().min(0).optional().describe("Per trade; default 0."),
    impact_coefficient: z.number().optional().describe("Square-root law Y; default 1."),
    minutes_per_rebalance: z.number().optional().describe("Default 1."),
    orders_per_minute_limit: z.number().optional().describe("If the broker's is not on file."),
  })
  .strict();

export const leakageInput = z
  .object({
    action: z.enum(["plan", "compare"]).describe("plan first, then compare."),
    observations: z.number().int().optional().describe("plan: rows in the series."),
    prefixes: z.number().int().optional().describe("plan: cuts, default 5."),
    seed: z.number().int().optional().describe("plan: default random; reproduces the cuts."),
    cuts: z.array(z.number().int()).optional().describe("compare: plan's cuts."),
    // Shapes and lengths are checked by the computation (js/leakage-core.js) with messages that
    // say what to send; the advertised schema stays small because it is re-sent every turn.
    columns: z.record(z.string(), z.looseObject({})).optional().describe("compare: {name: {full: [all rows], prefixes: [[first cuts[i] rows], ...]}}, null for missing."),
    columns_file: z.string().optional().describe("compare, on your machine: a JSON file {cuts, columns} instead."),
    timestamps: z.array(z.string()).optional().describe("compare: a label per row, to name rows by date."),
    tolerance: z.number().optional().describe("Default 1e-9."),
  })
  .strict();

export const placeboInput = z
  .object({
    action: z.enum(["plan", "compare"]).describe("plan first, then compare."),
    data_file: z.string().optional().describe("plan, on your machine: CSV or JSON, a column per asset, dates optional."),
    columns: z.record(z.string(), z.array(z.number())).optional().describe("plan: {asset: [values]} instead of data_file."),
    kind: z.enum(["prices", "returns"]).optional().describe("plan: default prices."),
    placebos: z.number().int().optional().describe("plan: default 19, up to 199."),
    method: z.enum(PLACEBO_METHODS).optional().describe("plan: default permute; block methods keep autocorrelation."),
    seed: z.number().int().optional().describe("plan: default random; reproduces the files."),
    real: z.number().optional().describe("compare: the pipeline's result on the real data."),
    placebo_results: z.array(z.number()).optional().describe("compare: its result on each placebo, in file order."),
    lower_is_better: z.boolean().optional().describe("compare: true for a loss or error; default false."),
  })
  .strict();

const loose = z.looseObject({}).optional();
const sentences = z.array(z.string()).optional();

export const backtestOutput = z
  .looseObject({ variants: loose, selected: loose, buy_and_hold: loose, validation: loose, plain_reading: z.string().optional(), limits: sentences, source: loose })
  .describe("selected holds the best variant's parameters and metrics; validation the deflated Sharpe, overfitting probability and minimum track record counting every variant run; plain_reading states them.");

export const summaryOutput = z
  .looseObject({ text: z.string().optional(), growth: loose, risk: loose, drawdown: loose, trend: loose, volatility: z.looseObject({}).nullable().optional(), tails: loose, jumps: loose, limits: sentences, source: loose })
  .describe("text is the summary to read; the other fields hold each figure by the rule named in it.");

export const stressOutput = z
  .looseObject({ baseline: loose, resampled: loose, scenarios: z.array(z.unknown()).optional(), fragility: loose, plain_reading: z.string().optional(), limits: sentences, source: loose })
  .describe("resampled holds bootstrap percentiles and breach frequencies; scenarios each named stress and its rule; fragility the share of histories breaking the limit or losing.");

export const leakageOutput = z
  .looseObject({ verdict: z.string().optional(), cuts: z.array(z.number()).optional(), seed: z.number().optional(), columns: loose, flagged_columns: z.array(z.string()).optional(), plain_reading: z.string().optional(), limits: sentences, source: loose })
  .describe("plan: cuts and seed. compare: verdict over all columns, flagged_columns, and per column its pattern, sentence and per-cut changes.");

export const placeboOutput = z
  .looseObject({ verdict: z.string().optional(), p_value: z.number().optional(), dir: z.string().optional(), files: z.array(z.string()).optional(), placebo: loose, plain_reading: z.string().optional(), limits: sentences, source: loose })
  .describe("plan: dir, real.csv and the placebo files, method and seed. compare: verdict, p_value, and what the pipeline found on the placebos.");

export const feasibilityOutput = z
  .looseObject({ verdict: z.string().optional(), checks: z.array(z.unknown()).optional(), to_change: z.array(z.string()).optional(), sources: loose, plain_reading: z.string().optional(), limits: sentences })
  .describe("verdict summarizes the checks; each check has a status (ok, warning, blocking, unknown), its finding and numbers; to_change lists what to fix.");
