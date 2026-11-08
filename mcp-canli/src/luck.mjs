// mcp-canli/src/luck.mjs
//
// The search an agent runs, counted by the server itself. An agent can try hundreds of strategy variants
// in an hour, and the best of them looks skilled by luck alone. canli-validation-mcp's trial ledger
// corrects for that, but only for the variants an agent chooses to record. Here every strategy result a
// tool returns (an annualized Sharpe with its number of periods) is recorded as a trial in a hash-chained
// ledger kept in memory, with no opt-in, and each such answer says what is left after luck across every
// trial so far: the best trial, the best that luck alone would give across that many, and the best's
// deflated Sharpe ratio. The statistics are the ledger's own (canli-validation-mcp/src/ledger-core.mjs).
//
// One set of ledgers per server: on a local server, the whole session; on the hosted server, which keeps nothing
// between requests, one request, so a batch is counted together and the answer says that is all it saw.
import { buildTrial, GENESIS, summarize } from "canli-validation-mcp/src/ledger-core.mjs";

import { TESTS } from "./trials.mjs";

const PERIODS_PER_YEAR = 252;
// Arguments that are data, not settings: left out of a trial's label and parameters.
const DATA_ARGS = /^(prices|dates|returns|weights|series|close|high|low|open|volume|data|rows|matrix|signal|benchmark)$/;

const shortValue = (v) => (typeof v === "number" || typeof v === "boolean" ? String(v) : typeof v === "string" ? (v.length <= 24 ? v : `${v.slice(0, 21)}...`) : Array.isArray(v) ? `[${v.length}]` : "{...}");

// The settings a variant was run with: the tool's own `parameters` when it reports them, else its arguments
// other than the data it was given.
function settingsOf(args, result) {
  if (result.parameters && typeof result.parameters === "object" && !Array.isArray(result.parameters)) return result.parameters;
  return Object.fromEntries(Object.entries(args ?? {}).filter(([k, v]) => !DATA_ARGS.test(k) && !(v && typeof v === "object" && "$result" in v)));
}

// A result of a tool that tests a strategy (the tools signed_trial_count counts) that is one strategy's
// performance: a finite annualized Sharpe and at least two periods. Measuring a fund's Sharpe is no trial.
export function trialOf(name, args, result) {
  if (!TESTS.test(name) || !result || typeof result !== "object" || Array.isArray(result)) return null;
  const { sharpe, periods } = result;
  if (!Number.isFinite(sharpe) || !Number.isInteger(periods) || periods < 2) return null;
  const params = settingsOf(args, result);
  const shown = Object.entries(params).slice(0, 8).map(([k, v]) => `${k}=${shortValue(v)}`).join(" ");
  return { label: shown ? `${name} ${shown}` : name, sharpe_annualized: sharpe, observations: periods, params: { tool: name, ...params } };
}

// A sweep's variants, each its own trial: canli-quant-mcp's strategy_sweep and sleeve_tournament,
// canli-backtest-mcp's breadth_sweep and canli-validation-mcp's backtest_strategy return every_trial, every variant's annualized Sharpe best first with the periods
// behind them (one number for all, or one per variant), so a grid of 400 is 400 tries and not one. A label names the
// variant's settings where the answer's own table shows them (the top 50 of a sweep, the tournament's leaderboard,
// every row of a breadth sweep), its combination k where a breadth sweep's shard lists it with no table, and its place
// among the rest otherwise.
const SWEEPS = /^(strategy_sweep|sleeve_tournament|breadth_sweep|backtest_strategy)$/;
const BREADTH_SETTINGS = ["k", "signals", "smoothing", "target_vol", "cost_bps", "min_names"];

// canli-validation-mcp's backtest_strategy: a variant's settings from its row of top (best first, as every_trial is),
// the columns before sharpe; the variants past top are labelled by their place.
function gridSettings(result, i) {
  const cols = result.variants?.columns, row = result.variants?.top?.[i];
  if (!Array.isArray(cols) || !Array.isArray(row)) return null;
  const end = cols.indexOf("sharpe");
  return end > 0 ? Object.fromEntries(cols.slice(0, end).map((c, j) => [c, row[j]])) : null;
}

// A breadth sweep's combination k (every_trial lists each variant's): its settings by the table's column names where
// the answer has its row, else k alone, as in a shard's answer.
function breadthSettings(result, k) {
  const cols = result.columns, at = Array.isArray(cols) ? cols.indexOf("k") : -1;
  const row = at < 0 || !Array.isArray(result.rows) ? undefined : result.rows.find((r) => Array.isArray(r) && r[at] === k);
  if (!row) return { k };
  return Object.fromEntries(BREADTH_SETTINGS.map((c) => [c, row[cols.indexOf(c)]]).filter(([, v]) => v !== null && v !== undefined));
}

// backtest_strategy from canli-validation-mcp before 0.16 lists only its top variants: those are counted.
function everyTrialOf(name, result) {
  if (!SWEEPS.test(name)) return null;
  if (result?.every_trial || name !== "backtest_strategy") return result?.every_trial ?? null;
  const cols = result?.variants?.columns, top = result?.variants?.top, at = Array.isArray(cols) ? cols.indexOf("sharpe") : -1;
  if (at < 0 || !Array.isArray(top) || !top.length) return null;
  return { sharpes: top.map((row) => row?.[at]), periods: result.window?.evaluated_returns, periods_per_year: result.settings?.periods_per_year };
}

export function trialsOf(name, args, result) {
  const every = everyTrialOf(name, result);
  if (!every || !Array.isArray(every.sharpes)) { const one = trialOf(name, args, result); return one ? [one] : []; }
  const total = every.sharpes.length, periodsAt = (i) => (Array.isArray(every.periods) ? every.periods[i] : every.periods);
  const settings = (i) => {
    const k = name === "breadth_sweep" && Array.isArray(every.k) ? every.k[i] : undefined;
    const params = name === "strategy_sweep" ? result.rows?.[i]?.[0] : name === "backtest_strategy" ? gridSettings(result, i) : Number.isInteger(k) ? breadthSettings(result, k) : null;
    const recipe = result.recipe ?? (name === "backtest_strategy" ? result.family : undefined);
    const sleeve = name === "sleeve_tournament" ? result.leaderboard?.[i]?.[0] : null;
    if (params && typeof params === "object" && !Array.isArray(params)) return { label: `${name} ${recipe ?? ""} ${Object.entries(params).slice(0, 8).map(([k, v]) => `${k}=${shortValue(v)}`).join(" ")}`.replace(/ +/g, " ").trim(), params: { ...(recipe ? { recipe } : {}), ...params } };
    if (typeof sleeve === "string") return { label: `${name} ${sleeve}`, params: { sleeve } };
    return { label: `${name}${recipe ? ` ${recipe}` : ""} variant ${i + 1} of ${total}`, params: { variant: i + 1 } };
  };
  return every.sharpes.flatMap((sharpe, i) => {
    const periods = periodsAt(i);
    if (!Number.isFinite(sharpe) || !Number.isInteger(periods) || periods < 2) return [];
    const { label, params } = settings(i);
    // A breadth sweep's variant is the same try wherever it is run again, whole or in a shard: its sweep_id names the
    // files, grid and split.
    const key = name === "breadth_sweep" && typeof result.sweep_id === "string" && Number.isInteger(params.k) ? `${result.sweep_id}:${params.k}` : undefined;
    return [{ label, sharpe_annualized: sharpe, observations: periods, params: { tool: name, ...params }, ...(key ? { key } : {}) }];
  });
}

// What the model reads of a sweep: how many variants were counted, not the whole list, which stays under the
// answer's ref.
export function shownTrials(result) {
  if (!result || !Array.isArray(result.every_trial?.sharpes)) return result;
  const { sharpes, periods, k, ...rest } = result.every_trial;
  return { ...result, every_trial: { ...(Number.isInteger(periods) ? { periods } : {}), ...rest, counted: sharpes.length } };
}

// One ledger for each sampling frequency (the tools' periods_per_year, 252 by default), since a deflated
// Sharpe compares trials measured the same way. A variant that names itself (a breadth sweep's) is counted once.
export function createLuck({ scope = "session", now = () => new Date().toISOString() } = {}) {
  const ledgers = new Map(), counted = new Set();
  return {
    get trials() {
      return [...ledgers.values()].reduce((t, l) => t + l.length, 0);
    },
    // Records the result if it is a strategy's performance, or a sweep's every variant; returns the luck note to
    // add to it, or null.
    record(name, args, result) {
      const found = trialsOf(name, args, result);
      if (!found.length) return null;
      const listed = result?.every_trial?.periods_per_year ?? (name === "backtest_strategy" ? result?.settings?.periods_per_year : undefined);
      const stated = Number(listed) > 0 ? Number(listed) : Number(args?.periods_per_year);
      const ppy = stated > 0 ? stated : PERIODS_PER_YEAR;
      if (!ledgers.has(ppy)) ledgers.set(ppy, []);
      const trials = ledgers.get(ppy);
      let again = 0;
      for (const { key, ...trial } of found) {
        if (key && counted.has(key)) { again += 1; continue; }
        if (key) counted.add(key);
        trials.push(buildTrial({ ...trial, periodsPerYear: ppy, n: trials.length + 1, prev: trials.at(-1)?.hash ?? GENESIS, recordedAt: now() }));
      }
      if (!trials.length) return null;
      const s = summarize({ trials, periodsPerYear: ppy });
      const elsewhere = this.trials - trials.length;
      const dsr = s.deflated?.deflated_sharpe_ratio ?? null;
      const two = (x) => Number(x).toFixed(2);
      // Kept short: it rides on every strategy answer, and a model reads it each time.
      return {
        trials: s.trials,
        ...(ppy === PERIODS_PER_YEAR ? {} : { periods_per_year: ppy }),
        best: { trial: s.best.n, label: s.best.label, sharpe_annualized: s.best.sharpe_annualized },
        expected_best_by_luck_annualized: s.expected_best_by_luck_annualized,
        deflated_sharpe_ratio: dsr,
        reading: [
          s.trials === 1
            ? `The first strategy tested in this ${scope}; every later one is judged with it.`
            : `${s.trials} strategies tested in this ${scope}. The best (trial ${s.best.n}, Sharpe ${two(s.best.sharpe_annualized)}) against about ${two(s.expected_best_by_luck_annualized)} from luck alone: deflated Sharpe ${dsr === null ? "not yet defined" : two(dsr)}, the chance its true Sharpe is above zero.`,
          elsewhere ? `${elsewhere} more at other frequencies, counted apart.` : "",
          again === found.length ? "These variants (the same files, grid and split) were counted already; nothing is added." : again ? `${again} of these ${found.length} variants were counted already.` : "",
          scope === "request" ? "Hosted: only this request is counted; run the search as one batch, or locally with npx canli-mcp." : "",
        ].filter(Boolean).join(" "),
      };
    },
  };
}
