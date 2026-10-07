import test from "node:test";
import assert from "node:assert/strict";

import { checkRestatement, restatedPeriods, restatementItem } from "./restatements.mjs";
import { mulberry32 } from "./generate.mjs";
import { freshFacts } from "./generate-v1.mjs";

const fy = (val, filed, accn, extra = {}) => ({ start: "2021-01-01", end: "2021-12-31", val, accn, fy: 2021, fp: "FY", form: "10-K", filed, ...extra });
const raw = (facts) => ({ facts: { "us-gaap": Object.fromEntries(Object.entries(facts).map(([tag, rows]) => [tag, { units: { USD: rows } }])) } });
const record = { cik: "0000000001", name: "Example Corp" };

test("a figure revised in a later annual filing becomes a first-reported question, checked independently", () => {
  const r = raw({ Revenues: [fy(100, "2022-02-10", "0000000001-22-000001"), fy(100, "2023-02-10", "0000000001-23-000001"), fy(97, "2024-02-10", "0000000001-24-000001")] });
  const periods = restatedPeriods(r);
  assert.equal(periods.length, 1);
  assert.deepEqual([periods[0].first.val, periods[0].later.val], [100, 97]);
  const item = restatementItem(record, r, mulberry32(1));
  assert.equal(item.answer.value, 100);
  assert.match(item.question, /0000000001-24-000001/);
  assert.deepEqual(checkRestatement(item, r), []);
});

test("splits, changed fiscal-year starts and same-value refilings are not restatements", () => {
  assert.equal(restatedPeriods(raw({ EarningsPerShareDiluted: [fy(4, "2022-02-10", "a"), fy(1, "2023-02-10", "b")] })).length, 0, "per-share excluded");
  assert.equal(restatedPeriods(raw({ Revenues: [fy(100, "2022-02-10", "a"), fy(110, "2023-02-10", "b", { start: "2021-02-01" })] })).length, 0, "different start: a different period");
  assert.equal(restatedPeriods(raw({ Revenues: [fy(100, "2022-02-10", "a"), fy(100, "2023-02-10", "b")] })).length, 0);
});

test("the checker refuses a cited 'first' that is not the earliest filing, or an answer that is the later value", () => {
  const r = raw({ Revenues: [fy(90, "2021-12-01", "0000000001-21-000009"), fy(100, "2022-02-10", "0000000001-22-000001"), fy(97, "2024-02-10", "0000000001-24-000001")] });
  const item = restatementItem(record, raw({ Revenues: [fy(100, "2022-02-10", "0000000001-22-000001"), fy(97, "2024-02-10", "0000000001-24-000001")] }), mulberry32(1));
  assert.match(checkRestatement(item, r).join(" "), /not the first/);
  const wrong = { ...item, answer: { ...item.answer, value: 97 } };
  assert.match(checkRestatement(wrong, raw({ Revenues: [fy(100, "2022-02-10", "0000000001-22-000001"), fy(97, "2024-02-10", "0000000001-24-000001")] })).join(" "), /not the first-reported value/);
});

test("the fresh split keeps only facts and revisions filed after the cutoff", () => {
  const facts = new Map([["Assets", { concept: { tag: "Assets" }, facts: [{ end: "2025-12-31", filed: "2026-05-01" }, { end: "2024-12-31", filed: "2025-02-01" }] }]]);
  assert.deepEqual(freshFacts(facts, "2026-04-01").get("Assets").facts.map((f) => f.end), ["2025-12-31"]);
  assert.equal(freshFacts(facts, "2026-06-01").size, 0);
  const r = raw({ Revenues: [fy(100, "2022-02-10", "a"), fy(97, "2024-02-10", "b")] });
  assert.equal(restatedPeriods(r, { filedAfter: "2025-01-01" }).length, 0);
  assert.equal(restatedPeriods(r, { filedAfter: "2023-01-01" }).length, 1);
});
