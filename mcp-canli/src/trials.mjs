// How many things were tried before this one, counted from the signed audit log and not from memory.
// A deflated Sharpe ratio is only as honest as the number of trials put into it, and that number has
// always been whatever the researcher says. Here every backtest that ran through the server is in a
// hash-chained, signed log, so the count can be shown to someone else and checked by them.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { verifyAudit } from "./governance.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
export const trialsInput = z.object({
  since: DATE.optional().describe("Count from this date: when this piece of research began."),
  until: DATE.optional().describe("Count up to this date."),
  tools: z.array(z.string().min(1).max(60)).max(40).optional().describe("Only these tools; default every tool that tests a strategy."),
}).strict();
const TESTS = /^(backtest_|run_sleeve$|sleeve_tournament$|sleeve_walk_forward$|combine_sleeves$|breadth_book$|breadth_sweep$|cpcv$|audit_backtest$)/;

export const TRIALS_TOOL = Object.freeze({
  name: "signed_trial_count", pack: "desk", toolset: "desk", title: "Count the trials behind a result, from the signed log", input: trialsInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  description: "How many different backtests ran through this server, counted from its signed audit log, not from memory: the number to give validate_deflated_sharpe or validate_luck_trials, which someone else can check with canli-mcp audit verify. Needs the audit log on (CANLI_POLICY).",
  keywords: "number of trials how many backtests tried multiple testing honest count signed audit proof selection bias deflated sharpe p hacking data snooping",
  args: "since?: string, until?: string, tools?: string[]",
});

export function signedTrialCount(args, { dir, keys = {} }) {
  const a = trialsInput.parse(args ?? {});
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort(); } catch { /* no log yet */ }
  if (!files.length) return { log_on: false, how: "Nothing is counted until the audit log is on: set CANLI_POLICY to a JSON file holding {\"audit\": {\"arguments\": \"hash\"}}, then run your backtests through this server." };
  const check = verifyAudit(dir, keys);
  const counted = (t) => (a.tools ? a.tools.includes(t) : TESTS.test(t));
  const byTool = new Map();
  let calls = 0, failed = 0, first = null, last = null;
  for (const f of files) {
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      if (!line) continue;
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (r.type !== "call" || !counted(r.tool)) continue;
      const day = String(r.at).slice(0, 10);
      if ((a.since && day < a.since) || (a.until && day > a.until)) continue;
      calls += 1;
      if (!r.ok) { failed += 1; continue; }
      first = !first || r.at < first ? r.at : first;
      last = !last || r.at > last ? r.at : last;
      if (!byTool.has(r.tool)) byTool.set(r.tool, new Set());
      byTool.get(r.tool).add(r.args_sha256);
    }
  }
  const trials = [...byTool.values()].reduce((n, s) => n + s.size, 0);
  const unsigned = check.files.reduce((n, x) => n + (x.unsigned ?? 0), 0);
  return {
    log_on: true, trials, calls, failed_calls: failed, first, last,
    log_checks_out: check.valid, unsigned_records: unsigned,
    columns: ["tool", "different_runs"], rows: [...byTool].map(([t, s]) => [t, s.size]).sort((x, y) => y[1] - x[1]),
    next: `Pass ${Math.max(trials, 1)} as the number of trials to validate_deflated_sharpe or validate_luck_trials. Someone else can check the log with canli-mcp audit verify and the public keys beside it.`,
    limits: [
      "Different arguments count as different runs, so this counts what was tried, not how different it was. Close variants are far from independent: validate_luck_trials can bring that down, and effective_bets measures it.",
      "It sees only what ran through this server while the log was on. Work done elsewhere is not in it, and someone can always keep a second machine. It raises the cost of hiding trials; it cannot end it.",
      ...(unsigned ? [`${unsigned} records since the last checkpoint are chained but not yet signed.`] : []),
    ],
  };
}
