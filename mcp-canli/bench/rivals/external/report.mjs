// The results of one set as a table: per model and arm, how many answers passed with a 95% Wilson
// interval, what they cost and how many turns they took; then the pass rate by question type.
//   node external/report.mjs --set vals [--out DIR]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./run.mjs";

// A 95% interval for a pass rate that stays inside 0 to 1, also for small samples.
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}

export function report(lines, set) {
  // The newest graded answer per model, arm, question and repetition.
  const last = new Map();
  for (const r of lines) if (r.pass !== null && !r.harness_error) last.set(`${r.model}|${r.arm}|${r.id}|${r.rep}`, r);
  const rows = [...last.values()];
  const groups = new Map();
  for (const r of rows) { const k = `${r.model}|${r.arm}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  const out = [`# ${set}: results`, "", `Judge: ${[...new Set(rows.map((r) => r.judge))].join(", ") || "-"}. A rubric answer passes when it states every fact and contradicts nothing in the reference answer (Vals' operators, graded here, not on Vals' platform).`, "", "| Model | Arm | Passed | Rate (95% interval) | Cost | Per answer | Mean turns |", "|---|---|---|---|---|---|---|"];
  for (const [k, rs] of [...groups].sort()) {
    const [model, arm] = k.split("|"), n = rs.length, pass = rs.filter((r) => r.pass).length, [lo, hi] = wilson(pass, n);
    const usd = rs.reduce((s, r) => s + (r.cost_usd ?? 0) + (r.judge_cost_usd ?? 0), 0);
    const turns = rs.reduce((s, r) => s + (r.turns ?? 0), 0) / n;
    out.push(`| ${model} | ${arm} | ${pass} of ${n} | ${pct(pass / n)} (${pct(lo)} to ${pct(hi)}) | $${usd.toFixed(2)} | $${(usd / n).toFixed(3)} | ${turns.toFixed(1)} |`);
  }
  const types = [...new Set(rows.map((r) => r.type))].sort();
  const keys = [...groups.keys()].sort();
  if (types.length > 1) {
    out.push("", "By question type (passed of answered):", "", `| Type | ${keys.map((k) => k.split("|").join(" · ")).join(" | ")} |`, `|---|${keys.map(() => "---").join("|")}|`);
    for (const t of types) out.push(`| ${t} | ${keys.map((k) => { const rs = groups.get(k).filter((r) => r.type === t); return rs.length ? `${rs.filter((r) => r.pass).length} of ${rs.length}` : "-"; }).join(" | ")} |`);
  }
  return out.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const o = parseArgs(process.argv.slice(2));
  const text = readFileSync(`${o.out}/${o.set}.jsonl`, "utf8");
  console.log(report(text.split("\n").filter(Boolean).map((l) => JSON.parse(l)), o.set));
}
