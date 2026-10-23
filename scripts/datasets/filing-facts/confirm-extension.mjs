// Confirmatory tests of TAXONOMY.md's extension pre-registration (H1'-H5) on the 2026-10-23 runs.
// Written and committed before any extension run was scored.
//   node scripts/datasets/filing-facts/confirm-extension.mjs <ext-dir> <v0-run-dir>...
// <ext-dir> holds runs-v0/, runs-restatement/, runs-fresh/ and taxonomy-{v0,restatement,fresh}.json;
// each <v0-run-dir> is an earlier day's v0 runs, used only for H5's comparison.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [ext, ...earlier] = process.argv.slice(2);
if (!ext) throw new Error("usage: confirm-extension.mjs <ext-dir> <v0-run-dir>...");
const SETS = ["v0", "restatement", "fresh"];
const tax = Object.fromEntries(SETS.map((s) => [s, JSON.parse(readFileSync(join(ext, `taxonomy-${s}.json`), "utf8")).runs]));
const runFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

const lnFact = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
// P(X >= k), X ~ Binomial(n, 1/2).
const tail = (k, n) => { let p = 0, c = 0; for (let i = 0; i <= n; i++) { c = i ? c + Math.log(n - i + 1) - Math.log(i) : 0; if (i >= k) p += Math.exp(c - n * Math.LN2); } return n ? p : null; };
// One-sided Fisher exact: P(first row has >= a successes) given the margins of [[a, n1 - a], [b, n2 - b]].
const fisher = (a, n1, b, n2) => {
  const k = a + b, N = n1 + n2, ln = (x) => lnFact(n1) - lnFact(x) - lnFact(n1 - x) + lnFact(n2) - lnFact(k - x) - lnFact(n2 - k + x) - (lnFact(N) - lnFact(k) - lnFact(N - k));
  let p = 0; for (let x = a; x <= Math.min(k, n1); x++) p += Math.exp(ln(x)); return Math.min(1, p);
};
const verdict = (p) => (p !== null && p < 0.05 ? "SUPPORTED" : "NOT SUPPORTED");
const bad = (r) => r.counts.unsupported + r.counts.invented_from_other_period + r.counts.invented_unsupported;
const closed = (s) => tax[s].filter((r) => r.arm === "closed");

// H1': answerable non-restatement items, all closed-book extension runs (v0 and fresh sets).
const h1 = [...closed("v0"), ...closed("fresh")];
const wrong = h1.reduce((a, r) => a + r.wrong_numbers, 0), uns = h1.reduce((a, r) => a + r.counts.unsupported, 0);
console.log(`H1': ${uns}/${wrong} unsupported, one-sided binomial p = ${tail(uns, wrong)?.toExponential(3)} -> ${verdict(tail(uns, wrong))}`);

// H2': every closed-book extension run, pooled discordant pairs.
const all = SETS.flatMap(closed), b = all.reduce((a, r) => a + r.placebo.only_real, 0), c = all.reduce((a, r) => a + r.placebo.only_decoy, 0);
console.log(`H2': real-only ${b} vs decoy-only ${c}, one-sided McNemar p = ${tail(b, b + c)?.toExponential(3)} -> ${verdict(tail(b, b + c))}`);

// H3': per model and set, wherever both arms ran.
for (const s of SETS) for (const m of new Set(tax[s].map((r) => r.model))) {
  const cl = tax[s].find((r) => r.model === m && r.arm === "closed"), mc = tax[s].find((r) => r.model === m && r.arm === "mcp");
  if (cl && mc) console.log(`H3' ${s} ${m}: closed ${bad(cl)}/${cl.items}, tool ${bad(mc)}/${mc.items} -> ${bad(mc) / mc.items < bad(cl) / cl.items ? "SUPPORTED" : "NOT SUPPORTED"}`);
}

// H4: on restatement items, closed-book answers that give the revised figure outnumber those that give the first-reported one.
const rs = closed("restatement"), rev = rs.reduce((a, r) => a + r.counts.superseded_version, 0), first = rs.reduce((a, r) => a + r.counts.correct, 0);
console.log(`H4: revised ${rev} vs first-reported ${first}, one-sided binomial p = ${tail(rev, rev + first)?.toExponential(3)} -> ${verdict(tail(rev, rev + first))}`);

// H5: closed-book correct numbers per answerable item, v0 against the fresh split, for models closed-book on both.
const answerable = (f) => f.runs.filter((r) => r.template !== "unanswerable");
const fresh = runFiles(join(ext, "runs-fresh")).filter((f) => f.summary.arm === "closed");
const v0 = [join(ext, "runs-v0"), ...earlier].flatMap(runFiles).filter((f) => f.summary.arm === "closed" && f.summary.items === 150);
const models = [...new Set(fresh.map((f) => f.summary.model))].filter((m) => v0.some((f) => f.summary.model === m));
const count = (files) => files.filter((f) => models.includes(f.summary.model)).flatMap(answerable).reduce(([k, n], r) => [k + (r.correct ? 1 : 0), n + 1], [0, 0]);
const [k0, n0] = count(v0), [k1, n1] = count(fresh), p5 = models.length ? fisher(k0, n0, k1, n1) : null;
console.log(`H5 (${models.join(", ")}): v0 ${k0}/${n0} vs fresh ${k1}/${n1} correct, one-sided Fisher p = ${p5?.toExponential(3)} -> ${verdict(p5)}`);

// Exploratory, no test: tool-arm accuracy on answerable items, v0 against fresh.
for (const f of runFiles(join(ext, "runs-fresh")).filter((x) => x.summary.arm === "mcp")) {
  const [k, n] = answerable(f).reduce(([a, m], r) => [a + (r.correct ? 1 : 0), m + 1], [0, 0]);
  console.log(`exploratory tool ${f.summary.model} fresh: ${k}/${n} answerable correct`);
}
