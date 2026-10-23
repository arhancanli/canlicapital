// Confirmatory tests of TAXONOMY.md's fourth pre-registration (D1-D7) on the DeepSeek runs.
// Written and committed before any of those runs was made.
//   node scripts/datasets/filing-facts/confirm-deepseek.mjs <ds-dir>
// <ds-dir> holds runs-{v0,large,restatement,fresh}/ and taxonomy-{v0,large,restatement,fresh}.json.
// The tests are on deepseek-flash; deepseek-v4-pro, run closed-book only if the balance allows,
// gets the closed-book tests again as a secondary replication.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: confirm-deepseek.mjs <ds-dir>");
const SETS = ["v0", "large", "restatement", "fresh"];
const read = (...p) => JSON.parse(readFileSync(join(...p), "utf8"));
const tax = Object.fromEntries(SETS.map((s) => [s, existsSync(join(dir, `taxonomy-${s}.json`)) ? read(dir, `taxonomy-${s}.json`).runs : []]));
const runFiles = (s) => (existsSync(join(dir, `runs-${s}`)) ? readdirSync(join(dir, `runs-${s}`)).filter((f) => f.endsWith(".json")).map((f) => read(dir, `runs-${s}`, f)) : []);
const lnFact = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
// P(X >= k), X ~ Binomial(n, 1/2).
const tail = (k, n) => { let p = 0, c = 0; for (let i = 0; i <= n; i++) { c = i ? c + Math.log(n - i + 1) - Math.log(i) : 0; if (i >= k) p += Math.exp(c - n * Math.LN2); } return n ? p : null; };
// One-sided Fisher exact: P(first row has >= a successes) given the margins of [[a, n1 - a], [b, n2 - b]].
const fisher = (a, n1, b, n2) => {
  if (!n1 || !n2) return null;
  const k = a + b, N = n1 + n2, ln = (x) => lnFact(n1) - lnFact(x) - lnFact(n1 - x) + lnFact(n2) - lnFact(k - x) - lnFact(n2 - k + x) - (lnFact(N) - lnFact(k) - lnFact(N - k));
  let p = 0; for (let x = a; x <= Math.min(k, n1); x++) p += Math.exp(ln(x)); return Math.min(1, p);
};
const verdict = (p) => (p !== null && p < 0.05 ? "SUPPORTED" : "NOT SUPPORTED");
const fmt = (p) => (p === null || p === undefined ? "undefined" : p.toExponential(3));
const bad = (r) => r.counts.unsupported + r.counts.invented_from_other_period + r.counts.invented_unsupported;
const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
const answerable = (f) => f.runs.filter((r) => r.template !== "unanswerable");
const correct = (files) => [sum(files, (f) => answerable(f).filter((r) => r.correct).length), sum(files, (f) => answerable(f).length)];

const closedTests = (model, tag) => {
  const closed = (s) => tax[s].filter((r) => r.model === model && r.arm === "closed");
  const files = (s) => runFiles(s).filter((f) => f.summary.model === model && f.summary.arm === "closed");
  if (!SETS.some((s) => closed(s).length)) { console.log(`${tag}: no closed-book runs for ${model}`); return; }
  // D1: v0, fresh and large sets pooled; more than half of wrong numbers unsupported.
  const h1 = ["v0", "fresh", "large"].flatMap(closed), w1 = sum(h1, (r) => r.wrong_numbers), u1 = sum(h1, (r) => r.counts.unsupported);
  console.log(`${tag} D1: ${u1}/${w1} unsupported, one-sided binomial p = ${fmt(tail(u1, w1))} -> ${verdict(tail(u1, w1))}`);
  // D2: every closed-book run pooled; own company against decoy.
  const all = SETS.flatMap(closed), b = sum(all, (r) => r.placebo.only_real), c = sum(all, (r) => r.placebo.only_decoy);
  console.log(`${tag} D2: real-only ${b} vs decoy-only ${c}, one-sided McNemar p = ${fmt(tail(b, b + c))} -> ${verdict(tail(b, b + c))}`);
  // D4: restatement items; revised figure against first-reported figure.
  const rs = closed("restatement"), rev = sum(rs, (r) => r.counts.superseded_version), first = sum(rs, (r) => r.counts.correct);
  console.log(`${tag} D4: revised ${rev} vs first-reported ${first}, one-sided binomial p = ${fmt(tail(rev, rev + first))} -> ${verdict(tail(rev, rev + first))}`);
  // D5: correct per answerable item, v0 against fresh.
  const [k0, n0] = correct(files("v0")), [k1, n1] = correct(files("fresh")), p5 = fisher(k0, n0, k1, n1);
  console.log(`${tag} D5: v0 ${k0}/${n0} vs fresh ${k1}/${n1} correct, one-sided Fisher p = ${fmt(p5)} -> ${verdict(p5)}`);
  // D6: correct per answerable item, large against v0.
  const [k6, n6] = correct(files("large")), p6 = fisher(k6, n6, k0, n0);
  console.log(`${tag} D6: large ${k6}/${n6} vs v0 ${k0}/${n0} correct, one-sided Fisher p = ${fmt(p6)} -> ${verdict(p6)}`);
  // D7: wrong numbers equal to a reported value, large against v0.
  const [L] = closed("large"), [V] = closed("v0");
  const p7 = L && V ? fisher(L.wrong_numbers_matching_a_reported_value, L.wrong_numbers, V.wrong_numbers_matching_a_reported_value, V.wrong_numbers) : null;
  console.log(`${tag} D7: large ${L?.wrong_numbers_matching_a_reported_value}/${L?.wrong_numbers} vs v0 ${V?.wrong_numbers_matching_a_reported_value}/${V?.wrong_numbers} matching, one-sided Fisher p = ${fmt(p7)} -> ${verdict(p7)}`);
};

const FLASH = "deepseek/deepseek-flash", PRO = "deepseek/deepseek-v4-pro";
closedTests(FLASH, "flash");

// D3: unsupported plus invented answers per item, closed-book against the tool, per set and pooled.
let cb = 0, cn = 0, tb = 0, tn = 0;
for (const s of SETS) {
  const cl = tax[s].find((r) => r.model === FLASH && r.arm === "closed"), mc = tax[s].find((r) => r.model === FLASH && r.arm === "mcp");
  if (!cl || !mc) { console.log(`flash D3 ${s}: missing an arm`); continue; }
  cb += bad(cl); cn += cl.items; tb += bad(mc); tn += mc.items;
  console.log(`flash D3 ${s}: closed ${bad(cl)}/${cl.items}, tool ${bad(mc)}/${mc.items} -> ${bad(mc) / mc.items < bad(cl) / cl.items ? "lower with the tool" : "not lower"}`);
}
const p3 = fisher(cb, cn, tb, tn);
console.log(`flash D3 pooled: closed ${cb}/${cn} vs tool ${tb}/${tn}, one-sided Fisher p = ${fmt(p3)} -> ${verdict(p3)}`);

// Reported with no test: tool-arm accuracy on answerable items and runs that reached the six-turn limit.
for (const s of SETS) for (const f of runFiles(s).filter((x) => x.summary.arm === "mcp")) {
  const [k, n] = correct([f]), limit = f.runs.filter((r) => /six-turn limit/.test(r.error ?? "")).length;
  console.log(`reported ${f.summary.model} tool ${s}: ${k}/${n} answerable correct, ${limit}/${f.runs.length} at the six-turn limit, ${f.summary.errors} errors of any kind`);
}

closedTests(PRO, "pro (secondary)");
