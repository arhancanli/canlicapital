import assert from "node:assert/strict";
import test from "node:test";

import { CLASSES, candidates, classify, companyHistory, mcnemarOneSided, placebo, runTaxonomy, wilson } from "./taxonomy.mjs";

const fy = (end, val, extra = {}) => ({ start: `${Number(end.slice(0, 4)) - 1}${end.slice(4, 8)}${end.slice(8)}`, end, val, ...extra });
const raw = {
  facts: {
    "us-gaap": {
      Revenues: { units: { USD: [fy("2022-12-31", 1000), fy("2023-12-31", 1200), fy("2023-12-31", 1150), fy("2024-12-31", 1500), { start: "2024-10-01", end: "2024-12-31", val: 400 }] } },
      NetIncomeLoss: { units: { USD: [fy("2023-12-31", 90), fy("2024-12-31", 120)] } },
      Assets: { units: { USD: [{ end: "2023-12-31", val: 5000 }, { end: "2024-12-31", val: 6000 }] } },
      Liabilities: { units: { USD: [{ end: "2023-12-31", val: 3000 }, { end: "2024-12-31", val: 3500 }] } },
    },
  },
};
const history = companyHistory(raw);
const fact = (concept, end, val) => ({ concept, end, val, unit: "USD" });
const lookup = { id: "a", template: "lookup", company: { cik: "1" }, answer: { kind: "number", value: 1200, unit: "USD" }, facts: [fact("Revenues", "2023-12-31", 1200)] };
const run = (parsed, extra = {}) => ({ status: "response", correct: false, parsed, ...extra });

test("the history keeps annual durations and instants, drops quarters, and keeps every reported version", () => {
  assert.deepEqual([...history.get("Revenues|USD").get("2023-12-31")].sort(), [1150, 1200]);
  assert.equal(history.get("Revenues|USD").get("2024-12-31").has(400), false, "a quarter is not a fiscal year");
  assert.ok(history.get("Assets|USD").has("2024-12-31"));
});

test("a wrong lookup is traced to a revision, another year, another line item, a units slip or nothing", () => {
  const c = candidates(lookup, history);
  assert.equal(classify(lookup, run(1150), c), "superseded_version");
  assert.equal(classify(lookup, run(1500), c), "other_period");
  assert.equal(classify(lookup, run(6000), c), "other_item");
  assert.equal(classify(lookup, run(1200000), c), "scale_slip");
  assert.equal(classify(lookup, run(-1200), c), "sign_flip");
  assert.equal(classify(lookup, run(1210), c), "near_miss");
  assert.equal(classify(lookup, run(777), c), "unsupported");
  assert.equal(classify(lookup, run(1200, { correct: true }), c), "correct");
  assert.equal(classify(lookup, run("not reported"), c), "false_abstention");
  assert.equal(classify(lookup, run(null), c), "no_answer");
  assert.equal(classify(lookup, { status: "error", parsed: null }, c), "request_failed");
});

test("derived items are re-derived at other periods: a change, a ratio and net assets", () => {
  const change = { id: "c", template: "change", company: { cik: "1" }, answer: { kind: "percent", value: 25, unit: "percent" }, facts: [fact("Revenues", "2023-12-31", 1200), fact("Revenues", "2024-12-31", 1500)] };
  assert.equal(classify(change, run(20), candidates(change, history)), "other_period", "2022 to 2023 is +20%");
  assert.equal(classify(change, run(30.43), candidates(change, history)), "superseded_version", "from the revised 1150 it is +30.43%");
  assert.equal(classify(change, run(0.25), candidates(change, history)), "percent_slip");
  const ratio = { id: "r", template: "ratio", company: { cik: "1" }, answer: { kind: "ratio", value: 0.02, unit: "ratio" }, facts: [fact("NetIncomeLoss", "2024-12-31", 120), fact("Assets", "2024-12-31", 6000)] };
  assert.equal(classify(ratio, run(0.018), candidates(ratio, history)), "other_period", "90 / 5000 in 2023");
  const net = { id: "n", template: "net_assets", company: { cik: "1" }, answer: { kind: "number", value: 2500, unit: "USD" }, facts: [fact("Assets", "2024-12-31", 6000), fact("Liabilities", "2024-12-31", 3500)] };
  assert.equal(classify(net, run(2000), candidates(net, history)), "other_period");
});

test("on a figure the filings do not report, any number is invented, and one copied from a reported year is marked", () => {
  const absent = { id: "u", template: "unanswerable", company: { cik: "1" }, answer: { kind: "not_reported", value: null, unit: null }, facts: [fact("Revenues", "2024-12-31", 1500)] };
  const c = candidates(absent, history);
  assert.equal(classify(absent, run("not reported", { correct: true }), c), "correct_abstention");
  assert.equal(classify(absent, run(1000), c), "invented_from_other_period");
  assert.equal(classify(absent, run(4321), c), "invented_unsupported");
});

test("the placebo re-checks each wrong number against another company's item, giving the chance match rate", () => {
  const other = { ...lookup, id: "b", company: { cik: "2" }, answer: { kind: "number", value: 50, unit: "USD" }, facts: [fact("Revenues", "2023-12-31", 50)] };
  const hist2 = companyHistory({ facts: { "us-gaap": { Revenues: { units: { USD: [fy("2023-12-31", 50), fy("2024-12-31", 1500)] } } } } });
  const candsFor = (it) => candidates(it, it.company.cik === "1" ? history : hist2);
  const byTemplate = new Map([["lookup", [lookup, other]]]);
  const p = placebo([{ item: lookup, run: run(1500) }, { item: lookup, run: run(777) }], byTemplate, candsFor, () => 0);
  assert.deepEqual([p.checked, p.matched], [2, 1], "1500 also appears in the decoy's history; 777 does not");
  assert.deepEqual([p.only_real, p.only_decoy], [0, 0], "both 1500s match, neither 777 does: no discordant pair");
  const summary = runTaxonomy({ summary: { model: "m", arm: "closed" }, capture_sha256: "x", runs: [{ id: "a", ...run(1500) }, { id: "a", ...run(1200, { correct: true }) }] }, new Map([["a", lookup]]), candsFor, byTemplate, 1);
  assert.equal(summary.counts.other_period, 1);
  assert.equal(summary.counts.correct, 1);
  assert.equal(summary.wrong_numbers, 1);
  assert.equal(summary.match_rate, 1);
});

test("every class has a plain definition, and the Wilson interval brackets the rate", () => {
  for (const [k, v] of Object.entries(CLASSES)) assert.ok(v.endsWith("."), k);
  const [lo, hi] = wilson(22, 109);
  assert.ok(lo < 22 / 109 && 22 / 109 < hi);
  assert.equal(wilson(0, 0), null);
});

test("the one-sided McNemar p-value is the binomial tail over the discordant pairs", () => {
  assert.equal(mcnemarOneSided(0, 0), null);
  assert.ok(Math.abs(mcnemarOneSided(5, 0) - 1 / 32) < 1e-12);
  assert.ok(Math.abs(mcnemarOneSided(3, 3) - 21 / 32) < 1e-12, "P(X>=3), n=6: (20+15+6+1)/64");
});
