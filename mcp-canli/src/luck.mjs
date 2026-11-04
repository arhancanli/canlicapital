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

// One ledger for each sampling frequency (the tools' periods_per_year, 252 by default), since a deflated
// Sharpe compares trials measured the same way.
export function createLuck({ scope = "session", now = () => new Date().toISOString() } = {}) {
  const ledgers = new Map();
  return {
    get trials() {
      return [...ledgers.values()].reduce((t, l) => t + l.length, 0);
    },
    // Records the result if it is a strategy's performance; returns the luck note to add to it, or null.
    record(name, args, result) {
      const trial = trialOf(name, args, result);
      if (!trial) return null;
      const ppy = Number(args?.periods_per_year) > 0 ? Number(args.periods_per_year) : PERIODS_PER_YEAR;
      if (!ledgers.has(ppy)) ledgers.set(ppy, []);
      const trials = ledgers.get(ppy);
      trials.push(buildTrial({ ...trial, periodsPerYear: ppy, n: trials.length + 1, prev: trials.at(-1)?.hash ?? GENESIS, recordedAt: now() }));
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
          scope === "request" ? "Hosted: only this request is counted; run the search as one batch, or locally with npx canli-mcp." : "",
        ].filter(Boolean).join(" "),
      };
    },
  };
}
