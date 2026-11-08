// mcp-canli/src/redteam.mjs
//
// red_team: the loop an agent runs when it writes a strategy, fails a check and writes it again, with the server
// keeping score. Each attempt runs one strategy tool, and the result is judged against everything this session has
// tried: the luck the server already counts (luck.mjs) for every variant of every attempt, the overfitting
// probability where the attempt ran a grid, whether it beats simply holding the asset, and whether its record is long
// enough. What failed comes back with what to change.
//
// A loop that rewrites a strategy until it passes is itself a search, and the search is where false discoveries come
// from. So nothing here resets: every attempt and every variant inside it is added to the count the next is judged
// against (the luck bar also moves with the spread of results, so it can fall a little when attempts agree), an attempt
// that does worse than an earlier one cannot pass, and the last word belongs to the holdout (holdout.mjs), years the
// loop never saw, opened once.
import { z } from "zod";

import { trialsOf } from "./luck.mjs";
import { allSessionsLuck, dataKeyOf } from "./zoo.mjs";

// The tools that backtest a strategy (a subset of what trials.mjs counts: cpcv and audit_backtest judge returns).
export const STRATEGY_TOOLS = /^(backtest_[a-z0-9_]+|run_sleeve|sleeve_tournament|sleeve_walk_forward|combine_sleeves|breadth_book|breadth_sweep|strategy_sweep)$/;
const BAR = { deflated_sharpe: 0.95, overfitting: 0.5 };
const SHOWN = 10;

export const redTeamInput = z.object({
  name: z.string().min(1).max(100).describe("The strategy tool to run, as find_tool names it: a backtest_ recipe, backtest_strategy, strategy_sweep, run_sleeve, breadth_sweep and the like."),
  arguments: z.record(z.string(), z.unknown()).optional().describe("Its arguments, as run_tool takes them ($file and $result work)."),
  change: z.string().max(300).optional().describe("What changed since the last attempt, in a sentence; kept in the attempt log."),
  bar: z.object({
    deflated_sharpe: z.number().min(0.5).max(0.999).optional().describe("Deflated Sharpe needed, default 0.95."),
    overfitting: z.number().min(0.05).max(0.9).optional().describe("Overfitting probability (CSCV) must be below this, default 0.5."),
  }).strict().optional(),
}).strict();

export const RED_TEAM_TOOL = Object.freeze({
  name: "red_team", pack: "desk", toolset: "desk", title: "Red-team a strategy, counting every attempt", input: redTeamInput,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  description: "Run one strategy tool and judge the result against everything this session has tried: deflated Sharpe at the session's true count of strategies (every attempt and every variant in it), overfitting probability for a grid, against buying and holding, and track-record length. Returns what failed and what to change, and the attempt log. Locally, every attempt is kept in the Null Zoo (zoo_search), and a later session on the same data is judged with the tries before it. Rewriting until it passes is a search, so every attempt is added to the count it is judged against; the final check is holdout_test on years the loop never saw. Clearing the checks is not admission to anything and not a forecast.",
  keywords: "red team auto correct loop rewrite strategy until valid self correcting agent backtest audit overfitting deflated sharpe pbo cscv data mining bias feedback fix next attempt",
  args: "name: string, arguments?: object, change?: string, bar?: {deflated_sharpe?, overfitting?}",
});

export const RED_TEAM_LIMITS = "Clearing these checks is not admission to anything and not a forecast. The count covers what this server ran in this session; strategies tried elsewhere, and what the model remembers of the data, are not in it.";

// One session's attempt log.
export function createRedTeam({ now = () => new Date().toISOString() } = {}) {
  const attempts = [];
  // This session's name in the Null Zoo, so its tries are told apart from earlier sessions'.
  const id = `${now().slice(0, 19)}-${Math.random().toString(16).slice(2, 10)}`;
  return { id, attempts, add(row) { attempts.push({ attempt: attempts.length + 1, at: now(), ...row }); return attempts.at(-1); } };
}

const two = (x) => (x === null || x === undefined ? "n/a" : Number(x).toFixed(2));
const num = (x) => (Number.isFinite(x) ? x : null);

// The attempt's own figures, where its tool reports them.
function figuresOf(result) {
  const pbo = num(result?.probability_of_backtest_overfitting?.probability) ?? num(result?.validation?.overfitting?.probability) ?? num(result?.overfitting?.probability);
  const holdSharpe = num(result?.buy_and_hold?.sharpe);
  const minPeriods = num(result?.validation?.min_track_record?.periods);
  const periods = num(result?.window?.evaluated_returns) ?? num(result?.periods);
  return { pbo, holdSharpe, minPeriods, periods };
}

// ctx: { call(name, args), luck (luck.mjs, the session's), log (createRedTeam), vault (holdout.mjs) or null, hosted,
// zoo: () => the Null Zoo (local/zoo.mjs) or null when off or hosted, session: this server's id in the zoo }.
export async function runRedTeam(ctx, args) {
  const a = redTeamInput.parse(args ?? {});
  if (!STRATEGY_TOOLS.test(a.name)) throw new Error(`red_team runs a tool that backtests a strategy (a backtest_ recipe, backtest_strategy, strategy_sweep, run_sleeve, breadth_sweep, ...), not ${a.name}. To audit returns you already have, use audit_backtest.`);
  if (!ctx.luck) throw new Error("red_team needs the session's luck count, which this server does not keep here.");
  const bar = { ...BAR, ...(a.bar ?? {}) };
  const result = await ctx.call(a.name, a.arguments ?? {});
  const tried = trialsOf(a.name, a.arguments ?? {}, result);
  const note = ctx.luck.record(a.name, a.arguments ?? {}, result);
  if (!tried.length || !note) throw new Error(`${a.name} returned no strategy Sharpe with its number of periods, so there is nothing to count or judge.`);

  const mine = tried.reduce((b, t) => (t.sharpe_annualized > b.sharpe_annualized ? t : b));
  const sessionBest = note.best.sharpe_annualized;
  const isBest = mine.sharpe_annualized >= sessionBest - 1e-12;
  const dsr = note.deflated_sharpe_ratio;
  const f = figuresOf(result);
  const checks = {};

  checks.luck = {
    measure: `deflated Sharpe of the session's best, counting all ${note.trials} strategies tried`,
    value: dsr, bar: `at least ${bar.deflated_sharpe}`,
    passed: dsr === null ? false : isBest && dsr >= bar.deflated_sharpe,
    why: dsr === null
      ? "One strategy tried: a deflated Sharpe needs at least two different results, so nothing can be judged yet. Every later attempt is judged with this one."
      : !isBest
        ? `An earlier try did better (${note.best.label}, Sharpe ${two(sessionBest)}); this attempt's best is ${two(mine.sharpe_annualized)}. It added ${tried.length} to the count.`
        : dsr >= bar.deflated_sharpe
          ? `Sharpe ${two(mine.sharpe_annualized)} against about ${two(note.expected_best_by_luck_annualized)} from luck alone across ${note.trials} tries.`
          : `Sharpe ${two(mine.sharpe_annualized)} is what the best of ${note.trials} skill-less tries could show (luck alone gives about ${two(note.expected_best_by_luck_annualized)}).`,
  };
  checks.overfitting = f.pbo === null
    ? { measure: "probability of backtest overfitting (CSCV)", value: null, passed: null, why: "Not measured: this tool ran one setting. Run the grid you would have tried (strategy_sweep or backtest_strategy) so the choice among settings is measured." }
    : { measure: "probability of backtest overfitting (CSCV)", value: f.pbo, bar: `below ${bar.overfitting}`, passed: f.pbo < bar.overfitting, why: f.pbo < bar.overfitting ? "The in-sample winner mostly stayed in the top half out of sample." : "The setting that won in sample did no better than a random pick out of sample at least half the time." };
  // Overfitting across the whole search: every variant this session ran on this data, from the tools that hand over
  // their returns (luck.mjs), judged as one grid. A loop that rewrites until a grid passes can pass each grid and still
  // overfit across them. Judged only once the pool holds more than this attempt's own grid, which the check above has.
  const across = note.overfitting_across_session;
  if (across && across.variants > tried.length) {
    checks.overfitting_across_session = {
      measure: `probability of backtest overfitting across the ${across.variants} variants this session ran on this data (CSCV)`,
      value: across.probability, bar: `below ${bar.overfitting}`, passed: across.probability < bar.overfitting, why: across.reading,
    };
  }
  checks.beats_holding = f.holdSharpe === null
    ? { measure: "Sharpe against buying and holding the same prices", value: null, passed: null, why: "Not reported by this tool." }
    : { measure: "Sharpe against buying and holding the same prices", value: { strategy: mine.sharpe_annualized, buy_and_hold: f.holdSharpe }, passed: mine.sharpe_annualized > f.holdSharpe, why: mine.sharpe_annualized > f.holdSharpe ? "It earns more per unit of risk than holding." : "Holding the asset did as well or better: a timing rule that is long most of the time can earn the asset's own premium without any timing skill." };
  checks.track_record = f.minPeriods === null || f.periods === null
    ? { measure: "minimum track record for this Sharpe", value: null, passed: null, why: "Not reported by this tool; audit_backtest on the returns gives it." }
    : { measure: "minimum track record for this Sharpe", value: { needed: f.minPeriods, have: f.periods }, passed: f.periods >= f.minPeriods, why: f.periods >= f.minPeriods ? "Long enough at 95% confidence." : "Too short to tell this Sharpe from zero at 95% confidence." };

  const vaultState = ctx.vault ? ctx.vault.status() : null;
  const tested = vaultState?.holdout && typeof vaultState.test === "object";
  checks.holdout = ctx.hosted || !ctx.vault
    ? { measure: "years the loop never saw", passed: null, why: "The holdout vault keeps a session; run locally (npx -y canli-mcp)." }
    : !vaultState.holdout
      ? { measure: "years the loop never saw", passed: null, why: "No holdout is set, so every attempt has seen every year. holdout_set now keeps the last years aside; attempts from then on cannot see them." }
      : tested
        ? { measure: "years the loop never saw", passed: null, why: `The holdout from ${vaultState.holdout.from} was tested once (${vaultState.test.tool}); read that test. It cannot be opened again.` }
        : { measure: "years the loop never saw", passed: null, why: `Hidden from ${vaultState.holdout.from}; this attempt did not see them.` };

  // Every session's tries on the same data, from the Null Zoo: a new session does not start the count again.
  let zoo = null, prior = [], dataKey = null, zooNote;
  try { zoo = ctx.hosted ? null : (await ctx.zoo?.()) ?? null; } catch (e) { zooNote = { error: String(e?.message ?? e) }; }
  if (zoo) { prior = zoo.read().records; dataKey = dataKeyOf(a.arguments ?? {}); }
  const ppy = note.periods_per_year ?? 252, at = new Date().toISOString(), session = ctx.session ?? "session";
  const rows = tried.map((t) => ({ at, session, tool: a.name, label: t.label, params: t.params, sharpe_annualized: t.sharpe_annualized, periods: t.observations, periods_per_year: ppy, data_key: dataKey, ...(a.change ? { change: a.change } : {}) }));
  if (zoo) {
    const all = dataKey ? allSessionsLuck([...prior, ...rows], dataKey, ppy) : null;
    checks.luck_all_sessions = !dataKey
      ? { measure: "deflated Sharpe counting earlier sessions on the same data", value: null, passed: null, why: "The data came from another call's result or was read by the tool itself, so earlier sessions cannot be matched to it." }
      : !all || all.sessions < 2
        ? { measure: "deflated Sharpe counting earlier sessions on the same data", value: null, passed: null, why: "No earlier session in the Null Zoo ran on this data." }
        : { measure: `deflated Sharpe counting all ${all.trials} tries on this data across ${all.sessions} sessions`, value: all.deflated_sharpe_ratio, bar: `at least ${bar.deflated_sharpe}`,
            passed: all.deflated_sharpe_ratio !== null && mine.sharpe_annualized >= all.best.sharpe_annualized - 1e-12 && all.deflated_sharpe_ratio >= bar.deflated_sharpe,
            why: mine.sharpe_annualized < all.best.sharpe_annualized - 1e-12 ? `An earlier session did better on this data (${all.best.label}, Sharpe ${two(all.best.sharpe_annualized)}).` : `Sharpe ${two(mine.sharpe_annualized)} against about ${two(all.expected_best_by_luck_annualized)} from luck across every session's tries.` };
  }
  const failed = Object.entries(checks).filter(([, c]) => c.passed === false).map(([k]) => k);
  if (zoo) {
    const best = rows.indexOf(rows.find((r) => r.sharpe_annualized === mine.sharpe_annualized));
    try {
      zoo.append(rows.map((r, i) => ({ ...r, outcome: i === best && !failed.length ? "cleared" : "failed", failed: i === best ? failed : ["beaten in its own grid"] })));
      zooNote = { written: rows.length, earlier_trials: prior.length, ...(dataKey ? { data_key: dataKey.slice(0, 12), earlier_on_this_data: prior.filter((r) => r.data_key === dataKey).length } : {}), file: zoo.file };
    } catch (e) { zooNote = { error: String(e?.message ?? e) }; }
  } else if (!zooNote) zooNote = { off: ctx.hosted ? "hosted: nothing is kept" : "CANLI_NULL_ZOO=off, or no zoo on this server" };
  const unmeasured = Object.entries(checks).filter(([k, c]) => c.passed === null && k !== "holdout").map(([k]) => k);
  const row = ctx.log.add({ tool: a.name, ...(a.change ? { change: a.change } : {}), best_sharpe: mine.sharpe_annualized, variants: tried.length, strategies_so_far: note.trials, deflated_sharpe: dsr, failed });
  const firstBar = ctx.log.attempts.find((x) => x.luck_bar !== undefined && x.luck_bar !== null)?.luck_bar ?? null;
  row.luck_bar = note.expected_best_by_luck_annualized ?? null;

  const fixes = {
    luck_all_sessions: "Earlier sessions already tried this data: a new session is not a fresh start. zoo_search shows what they ran.",
    luck: dsr === null ? "Try the alternatives you would have tried anyway, as one grid (strategy_sweep), so they are judged together." : !isBest ? "Go back to the better earlier idea, or change the idea, not a parameter: small tweaks add tries without adding evidence." : "Each attempt adds to this count. Fewer, larger changes, each stated before it runs (preregister), beat many small ones.",
    overfitting: "Use a smaller grid, and pick settings whose neighbours also do well rather than the single best cell.",
    overfitting_across_session: "Across every attempt on this data, the best variant is mostly a lucky one: more rewrites on the same data will not fix that. State one hypothesis (preregister) and test it once on the holdout, or on data this session has not seen.",
    beats_holding: "Compare against holding the same asset; if the rule is long most of the time, test the timing itself (placebo_test shuffles the months and keeps the premium).",
    track_record: "More history, a lower-turnover version, or a less ambitious Sharpe claim.",
  };
  const many = ctx.log.attempts.length >= 10 && failed.length > 0;
  const next = failed.length
    ? many
      ? `${ctx.log.attempts.length} attempts in, the search itself is now the main source of any Sharpe found. Stop rewriting: state one hypothesis (preregister) and test it once on the holdout.`
      : failed.map((k) => fixes[k]).join(" ")
    : !ctx.vault || ctx.hosted
      ? "It clears the checks that ran. Locally, set a holdout before the next idea and judge the final one there."
      : !vaultState.holdout
        ? "It clears the checks that ran, but every attempt saw every year. Set a holdout before the next idea, or judge this one on data that arrives after today."
        : tested
          ? "It clears the checks that ran; the holdout has been used. New data after today is the next honest test."
          : `It clears the checks that ran. The last check: holdout_test with {"name": "${a.name}", "arguments": <the same>}, once. Nothing may change after that test.`;

  const log = ctx.log.attempts.slice(-SHOWN);
  return {
    attempt: row.attempt,
    tool: a.name,
    verdict: failed.length ? `fails: ${failed.join(", ")}` : unmeasured.length ? `clears the checks that ran (${unmeasured.join(", ")} not measured)` : "clears every check that ran",
    checks,
    next,
    search: { attempts: ctx.log.attempts.length, strategies_counted: note.trials, luck_bar_now: row.luck_bar, luck_bar_at_first: firstBar ?? row.luck_bar, reading: note.reading, overfitting_across_session: across ? { probability: across.probability, variants: across.variants } : null },
    attempts: { columns: ["attempt", "tool", "change", "best_sharpe", "variants", "strategies_so_far", "deflated_sharpe", "failed"], rows: log.map((x) => [x.attempt, x.tool, x.change ?? null, x.best_sharpe, x.variants, x.strategies_so_far, x.deflated_sharpe, x.failed]), ...(ctx.log.attempts.length > SHOWN ? { earlier: ctx.log.attempts.length - SHOWN } : {}) },
    null_zoo: zooNote,
    result,
    limits: RED_TEAM_LIMITS + (ctx.hosted ? " Hosted: only this request is counted; run the loop locally with npx -y canli-mcp." : ""),
  };
}
