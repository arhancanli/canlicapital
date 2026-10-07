// How a model is wrong, not only whether. Every scored FilingFacts answer is placed in exactly one
// class, and every wrong number is checked against the company's whole reported XBRL history:
// a figure the company did report for another period, a superseded version of the asked figure,
// a different line item, a units slip, or a number no filing supports.
//   node scripts/datasets/filing-facts/taxonomy.mjs <items.jsonl> <runs-dir> <sources-dir> <out.json> [--seed 20261007]
// sources-dir holds one SEC companyfacts response per company as <cik>.raw.json.gz.
//
// Matching uses the scorer's own tolerances, so "matches" here means what "correct" means there.
// Searching a whole history can match by coincidence, so every run also gets a placebo: each wrong
// number is re-classified against a different, randomly paired item of the same template, and the
// share that still matches something is the chance rate to read every class against.
import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { mulberry32 } from "./generate.mjs";

export const TAXONOMY_VERSION = "canli.filing-facts-error-taxonomy.v1";

// The order is the precedence: an answer is placed in the first class it fits.
export const CLASSES = Object.freeze({
  correct: "Correct.",
  correct_abstention: "Said not reported, and the filings do not report it.",
  false_abstention: "Said not reported, but the filings do report it.",
  no_answer: "No final ANSWER line, or one that could not be read as a number.",
  request_failed: "The request failed or returned no response.",
  sign_flip: "The right magnitude with the wrong sign.",
  scale_slip: "The right digits at a thousand, million or billion times off.",
  percent_slip: "A percent given as a fraction or a fraction as a percent.",
  superseded_version: "A value another filing reported for the same item and period: a version before or after a revision.",
  other_period: "A value the company reported for the same item in a different period.",
  other_item: "A value the company reported for a different line item.",
  near_miss: "Within 2% (or 1 percentage point for a percent, 0.002 for a ratio) but matching no reported value.",
  unsupported: "A number no value in the company's reported history supports.",
  invented_from_other_period: "A number for a figure the filings do not report, equal to the item's value in a period they do report.",
  invented_unsupported: "A number for a figure the filings do not report, matching nothing the company reported.",
});

const DAY = 86400000;
const annualDuration = (o) => !o.start || ((Date.parse(o.end) - Date.parse(o.start)) / DAY >= 300 && (Date.parse(o.end) - Date.parse(o.start)) / DAY <= 400);

// concept -> end -> distinct values, for one unit; durations other than about a year are dropped
// (a quarter's revenue is not a fiscal year's revenue in another period).
export function companyHistory(raw) {
  const out = new Map();
  for (const [concept, body] of Object.entries(raw?.facts?.["us-gaap"] ?? {})) {
    for (const [unit, obs] of Object.entries(body.units ?? {})) {
      for (const o of obs) {
        if (!Number.isFinite(o.val) || !o.end || !annualDuration(o)) continue;
        const key = `${concept}|${unit}`;
        if (!out.has(key)) out.set(key, new Map());
        const ends = out.get(key);
        if (!ends.has(o.end)) ends.set(o.end, new Set());
        ends.get(o.end).add(o.val);
      }
    }
  }
  return out;
}

const tolerance = (kind, truth) => (kind === "number" ? Math.max(Math.abs(truth) * 0.001, 0.005) : kind === "percent" ? 0.05 : 0.0005);
const nearBand = (kind, truth) => (kind === "number" ? Math.abs(truth) * 0.02 : kind === "percent" ? 1 : 0.002);
const pctChange = (a, b) => (a === 0 ? null : ((b - a) / Math.abs(a)) * 100);

const values = (history, concept, unit, end) => [...(history.get(`${concept}|${unit}`)?.get(end) ?? [])];
const ends = (history, concept, unit) => [...(history.get(`${concept}|${unit}`)?.keys() ?? [])].sort();
const cross = (xs, ys, f) => xs.flatMap((x) => ys.map((y) => f(x, y))).filter(Number.isFinite);

// The item's own formula, evaluated (a) at the asked period with every reported version of its
// inputs and (b) at every other period; plus, for plain values, every other line item's values.
export function candidates(item, history) {
  const f = item.facts;
  const unit = f[0].unit;
  if (item.template === "lookup" || item.template === "unanswerable") {
    const c = f[0].concept, asked = item.template === "lookup" ? f[0].end : null;
    const sameEnd = asked ? values(history, c, unit, asked) : [];
    const otherEnds = ends(history, c, unit).filter((e) => e !== asked).flatMap((e) => values(history, c, unit, e));
    const otherItems = [...history].filter(([k]) => k.split("|")[1] === unit && k.split("|")[0] !== c).flatMap(([, m]) => [...m.values()].flatMap((s) => [...s]));
    return { versions: sameEnd, otherPeriods: otherEnds, otherItems };
  }
  if (item.template === "net_assets" || item.template === "ratio") {
    const [a, b] = f, op = item.template === "net_assets" ? (x, y) => x - y : (x, y) => (y === 0 ? NaN : x / y);
    const at = (e) => cross(values(history, a.concept, a.unit, e), values(history, b.concept, b.unit, e), op);
    const shared = ends(history, a.concept, a.unit).filter((e) => ends(history, b.concept, b.unit).includes(e));
    return { versions: at(a.end), otherPeriods: shared.filter((e) => e !== a.end).flatMap(at), otherItems: [] };
  }
  if (item.template === "change") {
    const [early, late] = f, c = early.concept;
    const at = (e1, e2) => cross(values(history, c, unit, e1), values(history, c, unit, e2), pctChange);
    const all = ends(history, c, unit);
    const pairs = all.slice(1).map((e, i) => [all[i], e]).filter(([x, y]) => !(x === early.end && y === late.end));
    return { versions: at(early.end, late.end), otherPeriods: pairs.flatMap(([x, y]) => at(x, y)), otherItems: [] };
  }
  throw new RangeError(`unknown template ${item.template}`);
}

const ABSENCE = /^(?:not reported|not available|no data|does not report|not disclosed|unavailable)[.!]?$/i;

export function classify(item, run, cands) {
  if (run.status !== "response") return "request_failed";
  const kind = item.answer.kind, p = run.parsed;
  if (kind === "not_reported") {
    if (typeof p === "string" && ABSENCE.test(p)) return "correct_abstention";
    if (typeof p !== "number") return "no_answer";
    const tol = (v) => Math.max(Math.abs(v) * 0.001, 0.005);
    return cands.otherPeriods.some((v) => Math.abs(p - v) <= tol(v)) ? "invented_from_other_period" : "invented_unsupported";
  }
  if (run.correct) return "correct";
  if (typeof p === "string" && ABSENCE.test(p)) return "false_abstention";
  if (typeof p !== "number") return "no_answer";
  const truth = item.answer.value, tol = tolerance(kind, truth);
  const hit = (v) => Math.abs(p - v) <= tolerance(kind, v);
  if (truth !== 0 && Math.abs(p + truth) <= tol) return "sign_flip";
  if (truth !== 0 && [3, 6, 9, -3, -6, -9].some((k) => Math.abs(p - truth * 10 ** k) <= tolerance(kind, truth * 10 ** k))) return "scale_slip";
  if (kind !== "number" && truth !== 0 && [2, -2].some((k) => Math.abs(p - truth * 10 ** k) <= tolerance(kind, truth * 10 ** k))) return "percent_slip";
  if (cands.versions.filter((v) => Math.abs(v - truth) > tolerance(kind, truth)).some(hit)) return "superseded_version";
  if (cands.otherPeriods.some(hit)) return "other_period";
  if (cands.otherItems.some(hit)) return "other_item";
  if (Math.abs(p - truth) <= nearBand(kind, truth)) return "near_miss";
  return "unsupported";
}

const NUMBER_CLASSES = ["sign_flip", "scale_slip", "percent_slip", "superseded_version", "other_period", "other_item", "near_miss", "unsupported"];
const MATCH_CLASSES = ["sign_flip", "scale_slip", "percent_slip", "superseded_version", "other_period", "other_item"];

// Wilson 95% interval for k of n.
export function wilson(k, n, z = 1.959963984540054) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// Each wrong number from this run, re-checked against another item of the same template whose
// company has a history. Returns how many matched something there, out of how many were checked.
// Pairing each answer with its own decoy allows an exact McNemar test: only the answers where the
// real history and the decoy disagree carry information.
export function placebo(wrong, itemsByTemplate, candsFor, rng) {
  let checked = 0, matched = 0, onlyReal = 0, onlyDecoy = 0;
  for (const { item, run } of wrong) {
    const pool = itemsByTemplate.get(item.template).filter((x) => x.id !== item.id && x.company.cik !== item.company.cik);
    if (!pool.length) continue;
    const decoy = pool[Math.floor(rng() * pool.length)];
    const fake = MATCH_CLASSES.includes(classify(decoy, { ...run, correct: false }, candsFor(decoy)));
    const real = MATCH_CLASSES.includes(classify(item, { ...run, correct: false }, candsFor(item)));
    checked += 1;
    if (fake) matched += 1;
    if (real && !fake) onlyReal += 1;
    if (fake && !real) onlyDecoy += 1;
  }
  return { checked, matched, rate: checked ? matched / checked : null, interval: wilson(matched, checked), only_real: onlyReal, only_decoy: onlyDecoy, mcnemar_p_one_sided: mcnemarOneSided(onlyReal, onlyDecoy) };
}

// P(X >= b) for X ~ Binomial(b + c, 1/2): how surprising b real-only matches are if the real
// history matched no more often than a random one.
export function mcnemarOneSided(b, c) {
  const n = b + c;
  if (!n) return null;
  let logC = 0, p = 0;
  for (let k = 0; k <= n; k += 1) {
    if (k > 0) logC += Math.log(n - k + 1) - Math.log(k);
    if (k >= b) p += Math.exp(logC - n * Math.LN2);
  }
  return Math.min(1, p);
}

export function runTaxonomy(runFile, itemsById, candsFor, itemsByTemplate, seed) {
  const counts = Object.fromEntries(Object.keys(CLASSES).map((k) => [k, 0]));
  const wrong = [];
  for (const run of runFile.runs) {
    const item = itemsById.get(run.id);
    if (!item) throw new Error(`run item ${run.id} is not in the items file`);
    const cls = classify(item, run, candsFor(item));
    counts[cls] += 1;
    if (NUMBER_CLASSES.includes(cls)) wrong.push({ item, run });
  }
  const n = runFile.runs.length, wrongNumbers = wrong.length;
  const matched = MATCH_CLASSES.reduce((a, k) => a + counts[k], 0);
  return {
    model: runFile.summary.model, arm: runFile.summary.arm, items: n, capture_sha256: runFile.capture_sha256,
    counts,
    wrong_numbers: wrongNumbers,
    wrong_numbers_matching_a_reported_value: matched,
    match_rate: wrongNumbers ? matched / wrongNumbers : null,
    match_interval: wilson(matched, wrongNumbers),
    placebo: placebo(wrong, itemsByTemplate, candsFor, mulberry32(seed)),
  };
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function main() {
  const [itemsPath, runsDir, sourcesDir, out] = process.argv.slice(2);
  const i = process.argv.indexOf("--seed");
  const seed = i > 0 ? Number(process.argv[i + 1]) : 20261007;
  if (!out) throw new Error("usage: taxonomy.mjs <items.jsonl> <runs-dir> <sources-dir> <out.json> [--seed N]");
  const itemsBuf = readFileSync(itemsPath);
  const items = itemsBuf.toString("utf8").trim().split("\n").map((l) => JSON.parse(l));
  const itemsById = new Map(items.map((x) => [x.id, x]));
  const histories = new Map(), sources = {};
  const historyFor = (cik) => {
    if (!histories.has(cik)) {
      const buf = readFileSync(join(sourcesDir, `${cik}.raw.json.gz`));
      sources[cik] = sha256(buf);
      histories.set(cik, companyHistory(JSON.parse(gunzipSync(buf).toString("utf8"))));
    }
    return histories.get(cik);
  };
  const cache = new Map();
  const candsFor = (item) => { if (!cache.has(item.id)) cache.set(item.id, candidates(item, historyFor(item.company.cik))); return cache.get(item.id); };
  const runFiles = readdirSync(runsDir).filter((f) => f.endsWith(".json")).sort();
  const loaded = runFiles.map((f) => ({ file: f, data: JSON.parse(readFileSync(join(runsDir, f), "utf8")) }));
  // Decoys come from items some run actually answered, so every decoy's company history is on hand.
  const used = new Set(loaded.flatMap(({ data }) => data.runs.map((r) => r.id)));
  const itemsByTemplate = new Map();
  for (const x of items) if (used.has(x.id)) { if (!itemsByTemplate.has(x.template)) itemsByTemplate.set(x.template, []); itemsByTemplate.get(x.template).push(x); }
  const runs = loaded.map(({ file, data }) => ({ file, ...runTaxonomy(data, itemsById, candsFor, itemsByTemplate, seed) }));
  const result = {
    schema: TAXONOMY_VERSION,
    classes: CLASSES,
    items_sha256: sha256(itemsBuf),
    placebo_seed: seed,
    sources: Object.fromEntries(Object.entries(sources).sort()),
    runs,
    limits: [
      "A wrong number that equals a reported value shows where it could have come from, not that the model looked it up; the placebo rate is how often a number from elsewhere matches by chance.",
      "The history is one SEC companyfacts capture; a value reported only in filings outside it cannot be matched, so some unsupported numbers may have a source this check does not see.",
      "Classes are defined before the second day of runs; the first day's runs informed them.",
    ],
  };
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  for (const r of runs) console.log(`${r.model} ${r.arm}: wrong numbers ${r.wrong_numbers}, matching ${r.wrong_numbers_matching_a_reported_value}, placebo ${r.placebo.matched}/${r.placebo.checked}`);
}

const isEntry = () => {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
};
if (isEntry()) main();
