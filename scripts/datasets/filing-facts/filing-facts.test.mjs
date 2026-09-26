// Filing-facts items are only as good as their checker: every generated item must pass it, and it
// must reject each way an item can be wrong. Fixtures are the company records committed under
// public/company-data (real SEC XBRL facts).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { checkItem } from "./check.mjs";
import { itemsForCompany } from "./generate.mjs";
import { annualFacts } from "./templates.mjs";

const DIR = new URL("../../../public/company-data/", import.meta.url);
const RECORDS = readdirSync(DIR).filter((f) => /^\d{10}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const ALL = RECORDS.flatMap((r) => itemsForCompany(r, { perCompany: 10, seed: 7 }).map((item) => ({ item, record: r })));
const clone = (x) => JSON.parse(JSON.stringify(x));
const find = (template) => ALL.find((x) => x.item.template === template);

test("fixtures produce items of every template, and every one passes the independent checker", () => {
  assert.ok(RECORDS.length >= 5);
  assert.deepEqual([...new Set(ALL.map((x) => x.item.template))].sort(), ["change", "lookup", "net_assets", "ratio", "unanswerable"]);
  for (const { item, record } of ALL) assert.deepEqual(checkItem(item, record), [], `${item.id} ${item.question}`);
});

test("generation is deterministic in its seed and differs across seeds", () => {
  const r = RECORDS[0];
  assert.deepEqual(itemsForCompany(r, { perCompany: 10, seed: 7 }), itemsForCompany(r, { perCompany: 10, seed: 7 }));
  assert.notDeepEqual(itemsForCompany(r, { perCompany: 10, seed: 7 }).map((i) => i.question), itemsForCompany(r, { perCompany: 10, seed: 8 }).map((i) => i.question));
});

test("the checker rejects a wrong value, a wrong accession and a wrong URL", () => {
  const { item, record } = find("lookup");
  const value = clone(item); value.answer.value += 1;
  assert.match(checkItem(value, record).join(), /lookup value differs/);
  const accn = clone(item); accn.facts[0].accn = "0000000000-00-000000";
  assert.match(checkItem(accn, record).join(), /differs from record|URL/);
  const url = clone(item); url.facts[0].url = "https://www.sec.gov/Archives/edgar/data/1/0/";
  assert.match(checkItem(url, record).join(), /URL does not name accession/);
});

test("the checker rejects a miscomputed change, a ratio across two periods and wrong net assets", () => {
  const change = clone(find("change").item); change.answer.value += 0.02;
  assert.match(checkItem(change, find("change").record).join(), /percent change does not recompute/);
  const ratio = find("ratio");
  const shifted = clone(ratio.item); shifted.answer.value = Number((shifted.answer.value + 0.001).toFixed(4));
  assert.match(checkItem(shifted, ratio.record).join(), /ratio does not recompute/);
  const net = find("net_assets"); const wrong = clone(net.item); wrong.answer.value -= 1;
  assert.match(checkItem(wrong, net.record).join(), /net assets do not recompute/);
});

test("an unanswerable item that is in fact answerable is rejected", () => {
  const { item, record } = find("unanswerable");
  const answerable = clone(item);
  const reported = item.facts[0].end;
  answerable.question = answerable.question.replace(/\d{4}-\d{2}-\d{2}/, reported);
  assert.match(checkItem(answerable, record).join(), /unanswerable item is answerable/);
  // And every generated unanswerable date is before the concept's earliest annual fact.
  for (const { item: u, record: r } of ALL.filter((x) => x.item.template === "unanswerable")) {
    const asked = u.question.match(/(?:as of|fiscal year ended) (\d{4}-\d{2}-\d{2})/)[1];
    const earliest = annualFacts(r).get(u.facts[0].concept).facts.at(-1).end;
    assert.ok(asked < earliest, `${asked} before ${earliest}`);
  }
});

test("a period whose annual filings disagree is never used, and the checker rejects an item citing one", () => {
  const record = clone(RECORDS[0]);
  const concept = record.concepts.find((c) => c.tag === "Assets") ?? record.concepts[0];
  const fact = concept.observations.find((o) => o.fp === "FY");
  concept.observations.push({ ...fact, val: fact.val + 1000, accn: "0000000000-99-000001", filed: "2099-01-01" });
  const entry = annualFacts(record).get(concept.tag);
  assert.ok(!entry || !entry.facts.some((f) => f.end === fact.end && f.unit === fact.unit), "ambiguous period dropped");
  const lookup = { schema: "x", template: "lookup", company: { cik: record.cik }, question: "q", answer: { kind: "number", value: fact.val, unit: fact.unit }, facts: [{ concept: concept.tag, end: fact.end, val: fact.val, unit: fact.unit, accn: fact.accn, form: fact.form, filed: fact.filed, url: `https://www.sec.gov/Archives/edgar/data/1/${fact.accn.replaceAll("-", "")}/` }] };
  assert.match(checkItem(lookup, record).join(), /ambiguous/);
});
