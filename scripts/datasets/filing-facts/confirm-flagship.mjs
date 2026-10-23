// Test D8 of TAXONOMY.md's DeepSeek pre-registration (Amendment 1): the published canli-mcp flagship
// against the validation server's company tool, deepseek-flash, paired by item. Written before the
// flagship runs were made.
//   node scripts/datasets/filing-facts/confirm-flagship.mjs <ds-dir>
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: confirm-flagship.mjs <ds-dir>");
const read = (...p) => JSON.parse(readFileSync(join(...p), "utf8"));
// P(X >= k), X ~ Binomial(n, 1/2).
const tail = (k, n) => { let p = 0, c = 0; for (let i = 0; i <= n; i++) { c = i ? c + Math.log(n - i + 1) - Math.log(i) : 0; if (i >= k) p += Math.exp(c - n * Math.LN2); } return n ? p : null; };
const fmt = (p) => (p === null ? "undefined" : p.toExponential(3));
const ok = (r) => r.template !== "unanswerable" && r.correct;
for (const s of ["restatement", "v0", "large", "fresh"]) {
  const a = join(dir, `runs-${s}`, "deepseek-flash-mcp.json"), b = join(dir, `runs-${s}`, "deepseek-flash-flagship.json");
  if (!existsSync(a) || !existsSync(b)) { console.log(`${s}: missing a run`); continue; }
  const old = read(a), neu = new Map(read(b).runs.map((r) => [r.id, r]));
  let oldOnly = 0, newOnly = 0;
  for (const o of old.runs) { const n = neu.get(o.id); if (!n) continue; if (ok(o) && !ok(n)) oldOnly++; if (ok(n) && !ok(o)) newOnly++; }
  const answerable = old.runs.filter((r) => r.template !== "unanswerable").length;
  const limit = [...neu.values()].filter((r) => /six-turn limit/.test(r.error ?? "")).length;
  const k = (runs) => runs.filter(ok).length;
  const line = `${s}: answerable correct, validation tool ${k(old.runs)}/${answerable}, flagship ${k([...neu.values()])}/${answerable}; flagship only ${newOnly}, validation only ${oldOnly}; flagship runs at the six-turn limit ${limit}/${neu.size}`;
  console.log(s === "restatement" ? `D8 ${line}, one-sided McNemar p = ${fmt(tail(newOnly, newOnly + oldOnly))} -> ${tail(newOnly, newOnly + oldOnly) < 0.05 ? "SUPPORTED" : "NOT SUPPORTED"}` : `reported ${line}`);
}
