// The book's facts as an xBRL-JSON report: the document type, namespaces for every prefix used, an XBRL date as the
// midnight that starts the next day, amounts in the major unit with their decimal places, and the taxonomy release
// asked for (US GAAP by year; IFRS only with its namespace and schema).
import assert from "node:assert/strict";
import test from "node:test";

import { oimPeriod, toXbrlJson } from "../src/xbrl.mjs";
import { month } from "./fixture.mjs";

const range = { asOf: "2026-01-31", from: "2026-01-01", to: "2026-01-31" };

test("an xBRL-JSON report of the book's facts", () => {
  const { report, facts, unmapped } = toXbrlJson(month(), range);
  assert.equal(report.documentInfo.documentType, "https://xbrl.org/2021/xbrl-json");
  assert.deepEqual(report.documentInfo.taxonomy, ["https://xbrl.fasb.org/us-gaap/2025/elts/us-gaap-2025.xsd"]);
  assert.equal(report.documentInfo.namespaces["us-gaap"], "http://fasb.org/us-gaap/2025");
  assert.deepEqual(unmapped, []);
  const all = Object.values(report.facts);
  assert.equal(all.length, facts);
  const byConcept = (c) => all.find((f) => f.dimensions.concept === `us-gaap:${c}`);
  assert.deepEqual(byConcept("Assets"), { value: "48050.00", decimals: 2, dimensions: { concept: "us-gaap:Assets", entity: "entity:Example_Trading_LLC", period: "2026-02-01T00:00:00", unit: "iso4217:AED" } });
  assert.equal(byConcept("NetIncomeLoss").value, "-2000.00");
  assert.equal(byConcept("NetIncomeLoss").dimensions.period, "2026-01-01T00:00:00/2026-02-01T00:00:00");
  for (const f of all) for (const qname of [f.dimensions.concept, f.dimensions.entity, f.dimensions.unit]) assert.ok(report.documentInfo.namespaces[qname.split(":")[0]], `${qname} has a namespace`);
});

test("periods, taxonomy releases and the entity", () => {
  assert.equal(oimPeriod({ instant: "2025-12-31" }), "2026-01-01T00:00:00", "the end of a year is the midnight that starts the next");
  assert.equal(oimPeriod({ start: "2024-02-01", end: "2024-02-29" }), "2024-02-01T00:00:00/2024-03-01T00:00:00", "a leap-year February ends at the midnight that starts March");
  assert.equal(toXbrlJson(month(), { ...range, year: 2024 }).report.documentInfo.namespaces["us-gaap"], "http://fasb.org/us-gaap/2024");
  assert.throws(() => toXbrlJson(month(), { ...range, taxonomy: "ifrs-full" }), /give namespace and schema/);
  const ifrs = toXbrlJson(month(), { ...range, taxonomy: "ifrs-full", namespace: "https://example.test/ifrs-full", schema: "https://example.test/ifrs.xsd", entity: "LEI 5493 0012" });
  assert.ok(Object.values(ifrs.report.facts).every((f) => f.dimensions.concept.startsWith("ifrs-full:") && f.dimensions.entity === "entity:LEI_5493_0012"));
});
