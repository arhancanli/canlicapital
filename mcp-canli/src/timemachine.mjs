// The time machine: start the server as of a past date, and every tool sees only what was public on
// that day. A model can then be tested on the past without being handed the future: its filings stop
// at that date, its prices stop at that date, and a tool that cannot be held to the date is switched
// off and says so. It is set when the server starts and no call can change it. One run_tool call can also
// be asked as of a date (its as_of): the same locks for that call only, and never later than the server's date.
//
// Three locks. A tool is allowed only if it is on this list. Its arguments are held to the date. And
// whatever comes back is read before it goes out: a table row dated later is dropped without a count,
// a field that tells of a later change without a date of its own is taken out, and any other later
// date stops the answer, so a mistake in a tool fails closed. The model's own memory is the one thing
// this cannot lock, which is why each run should be checked for it (recipes/agent-backtest).

const DAY = /^\d{4}-\d{2}-\d{2}/;
const minusDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const atMost = (x, d) => (x && x < d ? x : d);
export const parseAsOf = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`The as-of date must be YYYY-MM-DD, not ${value}.`);
  if (value > new Date().toISOString().slice(0, 10)) throw new Error(`The as-of date ${value} is in the future.`);
  return value;
};

const asOfArg = (a, d) => ({ ...a, as_of: atMost(a.as_of, d) });
const filedBefore = (a, d) => ({ ...a, filed_before: atMost(a.filed_before, d) });
const untilArg = (span) => (a, d) => ({ ...a, until: atMost(a.until, d), ...(span && !a.since ? { since: minusDays(d, span) } : {}) });
const endArg = (span) => (a, d) => { const { days: _days, ...rest } = a; return { ...rest, end: atMost(a.end, d), ...(span && !a.start ? { start: minusDays(d, span) } : {}) }; };
const REVISED = "These figures are today's revised values for those dates, not what was published then, so they can hold some later knowledge.";
const ADJUSTED = "Adjusted prices are scaled for later splits and dividends. Returns between dates are right, but a price level can hint at splits still to come.";

// Each tool that reads the world, with how it is held to the date. Anything not here is off:
// list_concepts too, since its counts and its order come from every filing, later ones included.
// drop: columns that say what came later without carrying a date, so the date check cannot see them.
// changed_after and changed say a later filing reported a different value; snapshot_date is the day
// the figures were fetched, which says what today is.
const HELD = {
  known_as_of: { args: asOfArg, drop: ["changed_after"] },
  history: { args: (a, d) => ({ ...a, basis: "as_of", as_of: atMost(a.as_of, d) }), drop: ["changed"] },
  cross_section: { args: asOfArg, drop: ["changed_after", "snapshot_date"] },
  vintages: {},
  vintage_diff: { args: (a, d) => ({ ...a, from: atMost(a.from, d), to: atMost(a.to, d) }) },
  find_company: {},
  financial_statements: { args: filedBefore },
  filing_tables: { args: filedBefore },
  earnings_release: { args: filedBefore },
  guidance_record: { args: filedBefore },
  read_filing: { args: filedBefore },
  list_filings: { args: untilArg(365 * 5) },
  search_filings: { args: untilArg(0) },
  insider_trades: { args: untilArg(365) },
  company_events: { args: untilArg(365) },
  economic_calendar: { args: untilArg(90) },
  treasury_auctions: { args: untilArg(90) },
  mentions_trend: { args: endArg(365 * 3) },
  price_history: { args: endArg(365), warning: ADJUSTED },
  price_panel: { args: endArg(365 * 5), warning: ADJUSTED },
  pit_factor: { args: endArg(365 * 5) },
  treasury_yields: { args: (a, d) => (a.date ? { ...a, date: atMost(a.date, d) } : endArg(365)(a, d)) },
  reference_rates: { args: endArg(365) },
  // ALFRED's vintage of the date: what had been published by then, at the values then shown; revisions would tell of later ones.
  economic_series: { args: (a, d) => { const { revisions: _later, ...rest } = a; return { ...endArg(365 * 5)(rest, d), as_of: atMost(a.as_of, d) }; } },
  world_economy: { args: (a, d) => { const year = Number(d.slice(0, 4)); return { ...a, end: Math.min(a.end ?? year, year), start: Math.min(a.start ?? year - 10, year) }; }, warning: REVISED },
  federal_debt: { args: endArg(365) },
  news: { args: endArg(30) },
  filing_memory: { args: (a, d) => { const { correlate_with: _dropped, ...rest } = a; return { ...rest, filed_before: atMost(a.filed_before, d) }; } },
};
// Tools that only work on what they are given, or on files and ledgers the caller holds.
const GIVEN_PACKS = new Set(["quant", "validation"]);
const GIVEN = new Set(["list_factors", "cpcv", "crisis_replay", "effective_bets", "find_diversifiers", "agent_consensus", "breadth_signals", "league_new", "league_commit", "league_score", "proof_file", "proof_find", "proof_verify", "arena_new", "arena_orders", "arena_step", "exchange_new", "exchange_join", "exchange_view", "exchange_orders", "exchange_step", "exchange_report", "exchange_run"]);
const SELF_ALLOWED = new Set(["find_tool", "describe_tool", "show_result", "swarm", "holdout_set", "holdout_test", "holdout_status", "preregister"]);
// Fields that are not claims about the world's date: where a figure came from, and how to read it.
const EXEMPT = new Set(["limits", "meaning", "note", "notes", "source", "sources", "url", "urls", "text", "next", "plain_reading", "how_to_check", "expiration", "expiry", "maturity", "maturity_date", "definitions", "time_machine", "fetched_at", "retrieved_at", "generated_at", "tickers_as_of"]);

// call: a machine for one run_tool call (its as_of), not for the whole server; the same three locks.
// reason: why the date holds, when it is not the call's own (a holdout), for the refusal.
export function createTimeMachine(asOf, { call = false, reason = null } = {}) {
  const d = parseAsOf(asOf);
  const admits = (name, pack) => Boolean(HELD[name]) || GIVEN.has(name) || GIVEN_PACKS.has(pack);
  const refuse = (name) => new Error(reason
    ? `${name} cannot be held to ${d}, so it is off ${reason}. Tools that read the world answer only when they can show just what was public by ${d}; find_tool lists them.`
    : call
      ? `${name} cannot be held to ${d}, so it cannot answer as of that date. Tools that read the world answer as of a date only when they can show just what was public by then; find_tool lists them.`
      : `${name} cannot be held to ${d}, so it is off in this run. This server is running as of ${d}: tools that read the world show only what was public by then. find_tool lists what is on.`);
  return {
    asOf: d,
    admits,
    selfAllowed: (name) => SELF_ALLOWED.has(name),
    refuse,
    admit(name, pack, args) {
      if (!admits(name, pack)) throw refuse(name);
      const held = HELD[name];
      return held?.args ? held.args(args ?? {}, d) : args ?? {};
    },
    seal(name, result) {
      if (!HELD[name] || !result || typeof result !== "object") return result;
      const late = [];
      const drop = new Set(HELD[name].drop ?? []);
      const isLate = (v) => typeof v === "string" && DAY.test(v) && v.slice(0, 10) > d;
      // A table loses its dropped columns, cells and all; a field of the same name goes too.
      const cut = (o) => {
        if (!drop.size || !Array.isArray(o.columns) || !Array.isArray(o.rows)) return o;
        const keep = o.columns.flatMap((c, i) => (drop.has(c) ? [] : [i]));
        return { ...o, columns: keep.map((i) => o.columns[i]), rows: o.rows.map((r) => (Array.isArray(r) ? keep.map((i) => r[i]) : r)) };
      };
      const walk = (value, key, path) => {
        if (EXEMPT.has(key)) return value;
        if (Array.isArray(value)) {
          // A table row dated later goes, and is not counted: how many later filings reported a
          // figure is itself later news. Anything else later is a mistake, and stops the answer.
          if (key === "rows" && value.every(Array.isArray)) return value.filter((row) => !row.some(isLate));
          return value.map((v, i) => walk(v, "", `${path}[${i}]`));
        }
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(cut(value)).filter(([k]) => !drop.has(k)).map(([k, v]) => [k, walk(v, k, path ? `${path}.${k}` : k)]));
        if (isLate(value)) late.push(`${path} is ${value}`);
        return value;
      };
      const { evidence: _when, snapshot: _fetched, ...rest } = result; // their retrieval times say what today is
      const out = walk(rest, "", "");
      if (late.length) throw new Error(`${name} came back with something dated after ${d} (${late.slice(0, 3).join("; ")}), so the answer was stopped.`);
      return { ...out, time_machine: { as_of: d, ...(drop.size ? { left_out: [...drop] } : {}), ...(HELD[name].warning ? { warning: HELD[name].warning } : {}) } };
    },
    instructions: `This server is running as of ${d}. Its tools show only what was public by that date, and tools that cannot be held to it are off. Answer as someone on ${d} would. Do not use what you remember of anything after that date; if you notice you know what happened next, say so rather than using it. Your training may include later events, and nothing here can remove them.`,
  };
}
