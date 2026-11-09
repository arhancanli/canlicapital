// mcp-canli/src/zoo.mjs
//
// The Null Zoo registry's tools and what red_team keeps in it (the file itself is local/zoo.mjs). Each red_team
// attempt writes every variant it ran, with what failed, under a key for the data it ran on, so a later session on the
// same data is judged with the tries that came before it, and an agent can ask what was already tried.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { buildTrial, GENESIS, summarize } from "canli-validation-mcp/src/ledger-core.mjs";
import { z } from "zod";

export const ZOO_LIMITS = "Kept on this machine only, encrypted at rest; the key file sits beside it unless CANLI_ZOO_KEY holds it elsewhere. It holds what red_team ran here, not tries made with other tools or elsewhere. CANLI_NULL_ZOO=off stops red_team writing to it.";

export const ZOO_TOOLS = Object.freeze([
  { name: "zoo_search", pack: "desk", toolset: "desk", title: "What red_team already tried here", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    input: z.object({
      contains: z.string().max(100).optional().describe("Text in the trial's label: a tool, a recipe or a setting such as lookback=60."),
      outcome: z.enum(["failed", "cleared"]).optional(),
      data_key: z.string().regex(/^[0-9a-f]{8,64}$/).optional().describe("The data a trial ran on, as zoo_stats or red_team names it (a prefix is enough)."),
      limit: z.number().int().min(1).max(200).optional().describe("Default 20, newest first."),
    }).strict(),
    description: "Search the Null Zoo on this machine: every strategy red_team tried in any session, with its Sharpe, what failed and the data it ran on, newest first. Use it before a new idea, to see whether it, or something like it, already failed. Local server only.",
    keywords: "null zoo failed trials registry tried before history past attempts memory learn from failures search",
    args: "contains?: string, outcome?: failed|cleared, data_key?: string, limit?: integer" },
  { name: "zoo_stats", pack: "desk", toolset: "desk", title: "The Null Zoo's counts", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    input: z.object({}).strict(),
    description: "Counts in the Null Zoo on this machine: trials, sessions, failed and cleared, and for each data set the tries on it and their best Sharpe, with whether the file's chain is whole. Local server only.",
    keywords: "null zoo stats counts trials sessions data sets failed cleared registry",
    args: "" },
]);

const DATA_KEYS = /^(prices|dates|returns|close|high|low|open|volume|series|data|matrix|rows|prices_file|returns_file|series_file|panel_file)$/;
const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);

// A key for the data a strategy call ran on: the hash of the numbers passed in, or of the files named (their bytes),
// looking inside a recipe's own arguments. null when the data cannot be known here (another call's result) or the
// tool read its data itself.
export function dataKeyOf(args, { read = (p) => readFileSync(p) } = {}) {
  const parts = [];
  let unknown = false;
  const walk = (obj, at) => {
    for (const [k, v] of Object.entries(obj ?? {}).sort(([x], [y]) => (x < y ? -1 : 1))) {
      if (k === "arguments" && v && typeof v === "object" && !Array.isArray(v)) { walk(v, `${at}${k}.`); continue; }
      if (!DATA_KEYS.test(k)) continue;
      if (v && typeof v === "object" && !Array.isArray(v) && "$result" in v) { unknown = true; continue; }
      const path = typeof v === "string" && k.endsWith("_file") ? v : v && typeof v === "object" && typeof v.$file === "string" ? v.$file : null;
      if (path !== null) {
        let bytes;
        try { bytes = read(path); } catch { unknown = true; continue; }
        parts.push(`${at}${k}:file:${createHash("sha256").update(bytes).digest("hex")}:${canonical({ column: v.column ?? null, columns: v.columns ?? null })}`);
      } else parts.push(`${at}${k}:${canonical(v)}`);
    }
  };
  walk(args, "");
  if (unknown || !parts.length) return null;
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

// The luck of everything tried on this data in every session, the newest trials included: the best's deflated Sharpe.
export function allSessionsLuck(records, dataKey, periodsPerYear) {
  const same = records.filter((r) => r.data_key === dataKey && r.periods_per_year === periodsPerYear);
  if (same.length < 2) return null;
  const trials = [];
  for (const r of same) trials.push(buildTrial({ label: r.label, sharpe_annualized: r.sharpe_annualized, observations: r.periods, params: r.params ?? {}, periodsPerYear, n: trials.length + 1, prev: trials.at(-1)?.hash ?? GENESIS, recordedAt: r.at }));
  const s = summarize({ trials, periodsPerYear });
  return { trials: s.trials, sessions: new Set(same.map((r) => r.session)).size, best: s.best, deflated_sharpe_ratio: s.deflated?.deflated_sharpe_ratio ?? null, expected_best_by_luck_annualized: s.expected_best_by_luck_annualized };
}

const short = (k) => (k ? k.slice(0, 12) : null);

export function runZooSearch(zoo, args) {
  const a = ZOO_TOOLS[0].input.parse(args ?? {});
  const { records, broken } = zoo.read();
  const hits = records.filter((r) => (!a.contains || String(r.label).toLowerCase().includes(a.contains.toLowerCase())) && (!a.outcome || r.outcome === a.outcome) && (!a.data_key || String(r.data_key ?? "").startsWith(a.data_key))).reverse();
  const shown = hits.slice(0, a.limit ?? 20);
  return {
    total_matching: hits.length, of: records.length,
    columns: ["at", "label", "sharpe_annualized", "periods", "outcome", "failed", "data_key", "change"],
    rows: shown.map((r) => [r.at, r.label, r.sharpe_annualized, r.periods, r.outcome, r.failed ?? [], short(r.data_key), r.change ?? null]),
    chain: broken === null ? "whole" : `broken at line ${broken}: a line was removed or changed`,
    file: zoo.file, limits: ZOO_LIMITS,
  };
}

export function runZooStats(zoo) {
  const { records, broken } = zoo.read();
  const count = (f) => records.reduce((m, r) => { const k = f(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const sets = new Map();
  for (const r of records) {
    const k = r.data_key ?? "unknown";
    const s = sets.get(k) ?? { trials: 0, best_sharpe: -Infinity, first_at: r.at, last_at: r.at, sessions: new Set() };
    s.trials += 1; s.best_sharpe = Math.max(s.best_sharpe, r.sharpe_annualized); s.last_at = r.at; s.sessions.add(r.session);
    sets.set(k, s);
  }
  const rows = [...sets.entries()].sort((x, y) => y[1].trials - x[1].trials).slice(0, 20).map(([k, s]) => [k === "unknown" ? null : short(k), s.trials, s.sessions.size, s.best_sharpe, s.first_at, s.last_at]);
  return {
    trials: records.length, sessions: new Set(records.map((r) => r.session)).size,
    by_outcome: count((r) => r.outcome), by_tool: count((r) => r.tool),
    data_sets: { columns: ["data_key", "trials", "sessions", "best_sharpe", "first_at", "last_at"], rows },
    chain: broken === null ? "whole" : `broken at line ${broken}: a line was removed or changed`,
    file: zoo.file, key_from: zoo.keyFrom, limits: ZOO_LIMITS,
  };
}
