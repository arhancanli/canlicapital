// Confirmatory tests of TAXONOMY.md's third pre-registration (H6-H9, H1'', H2'') on the
// 2026-10-24 runs. Written and committed before any of those runs was made.
//   node scripts/datasets/filing-facts/confirm-large.mjs <large-dir> <ext-dir>
// <large-dir> holds runs-large/ (gemma4-12b-32k-closed.json, -mcp.json with the ticker-only tool,
// -mcpname.json with name lookup), runs-v0name/gemma4-12b-32k-mcpname.json and
// taxonomy-large.json; <ext-dir> is the 2026-10-23 extension (its v0 runs and taxonomy-v0.json).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [large, ext] = process.argv.slice(2);
if (!large || !ext) throw new Error("usage: confirm-large.mjs <large-dir> <ext-dir>");
const read = (...p) => JSON.parse(readFileSync(join(...p), "utf8"));
const lnFact = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
// P(X >= k), X ~ Binomial(n, 1/2).
const tail = (k, n) => { let p = 0, c = 0; for (let i = 0; i <= n; i++) { c = i ? c + Math.log(n - i + 1) - Math.log(i) : 0; if (i >= k) p += Math.exp(c - n * Math.LN2); } return n ? p : null; };
// One-sided Fisher exact: P(first row has >= a successes) given the margins of [[a, n1 - a], [b, n2 - b]].
const fisher = (a, n1, b, n2) => {
  const k = a + b, N = n1 + n2, ln = (x) => lnFact(n1) - lnFact(x) - lnFact(n1 - x) + lnFact(n2) - lnFact(k - x) - lnFact(n2 - k + x) - (lnFact(N) - lnFact(k) - lnFact(N - k));
  let p = 0; for (let x = a; x <= Math.min(k, n1); x++) p += Math.exp(ln(x)); return Math.min(1, p);
};
const verdict = (p) => (p !== null && p < 0.05 ? "SUPPORTED" : "NOT SUPPORTED");
const fmt = (p) => (p === null ? "undefined" : p.toExponential(3));
const closedTax = (file) => read(file).runs.find((r) => r.arm === "closed");
const L = closedTax(join(large, "taxonomy-large.json")), V = closedTax(join(ext, "taxonomy-v0.json"));

// H6: closed-book correct numbers per answerable item, large set against v0.
const answerable = (f) => f.runs.filter((r) => r.template !== "unanswerable");
const correct = (f) => [answerable(f).filter((r) => r.correct).length, answerable(f).length];
const [a6, n6] = correct(read(large, "runs-large", "gemma4-12b-32k-closed.json")), [b6, m6] = correct(read(ext, "runs-v0", "gemma4-12b-32k-closed.json"));
console.log(`H6: large ${a6}/${n6} vs v0 ${b6}/${m6} correct, one-sided Fisher p = ${fmt(fisher(a6, n6, b6, m6))} -> ${verdict(fisher(a6, n6, b6, m6))}`);

// H7: closed-book wrong numbers that equal a reported value, large set against v0.
const p7 = fisher(L.wrong_numbers_matching_a_reported_value, L.wrong_numbers, V.wrong_numbers_matching_a_reported_value, V.wrong_numbers);
console.log(`H7: large ${L.wrong_numbers_matching_a_reported_value}/${L.wrong_numbers} vs v0 ${V.wrong_numbers_matching_a_reported_value}/${V.wrong_numbers} matching, one-sided Fisher p = ${fmt(p7)} -> ${verdict(p7)}`);

// H1'': large set, closed-book, more than half of wrong numbers unsupported.
console.log(`H1'': ${L.counts.unsupported}/${L.wrong_numbers} unsupported, one-sided binomial p = ${fmt(tail(L.counts.unsupported, L.wrong_numbers))} -> ${verdict(tail(L.counts.unsupported, L.wrong_numbers))}`);

// H2'': large set, closed-book, own company against decoy.
const { only_real: r2, only_decoy: d2 } = L.placebo;
console.log(`H2'': real-only ${r2} vs decoy-only ${d2}, one-sided McNemar p = ${fmt(tail(r2, r2 + d2))} -> ${verdict(tail(r2, r2 + d2))}`);

// H8, H9: the tool with name lookup against the ticker-only tool, paired by item, pooled over v0 and large.
const pairs = [
  [read(ext, "runs-v0", "gemma4-12b-32k-mcp.json"), read(large, "runs-v0name", "gemma4-12b-32k-mcpname.json")],
  [read(large, "runs-large", "gemma4-12b-32k-mcp.json"), read(large, "runs-large", "gemma4-12b-32k-mcpname.json")],
];
const paired = (test) => {
  let oldOnly = 0, newOnly = 0;
  for (const [old, neu] of pairs) {
    const byId = new Map(neu.runs.map((r) => [r.id, r]));
    for (const o of old.runs) { const n = byId.get(o.id); if (!n) continue; const a = test(o), b = test(n); if (a && !b) oldOnly++; if (b && !a) newOnly++; }
  }
  return [oldOnly, newOnly];
};
const limit = (r) => /six-turn limit/.test(r.error ?? "");
const [o8, n8] = paired(limit);
console.log(`H8: turn limit with ticker tool only ${o8} vs with name tool only ${n8}, one-sided McNemar p = ${fmt(tail(o8, o8 + n8))} -> ${verdict(tail(o8, o8 + n8))}`);
const [o9, n9] = paired((r) => r.template !== "unanswerable" && r.correct);
console.log(`H9: correct with name tool only ${n9} vs with ticker tool only ${o9}, one-sided McNemar p = ${fmt(tail(n9, n9 + o9))} -> ${verdict(tail(n9, n9 + o9))}`);
for (const [old, neu] of pairs) console.log(`descriptive ${old.summary.items} items: turn limit ${old.runs.filter(limit).length} -> ${neu.runs.filter(limit).length}; accuracy ${old.summary.accuracy.toFixed(3)} -> ${neu.summary.accuracy.toFixed(3)}`);
