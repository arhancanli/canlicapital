import assert from "node:assert/strict";
import test from "node:test";

import { requestSchemaFor } from "./schema.js";

test("infers types from the example and marks non-optional keys required", () => {
  const schema = requestSchemaFor({
    requestExample: { sleeve_sharpe: 0.5, average_pairwise_correlation: 0.05, sleeves: 4, target: 1.5 },
    requestOptional: ["sleeves", "target"],
  });
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.properties.sleeve_sharpe, { type: "number" });
  assert.deepEqual(schema.required.sort(), ["average_pairwise_correlation", "sleeve_sharpe"]);
  assert.ok(!schema.required.includes("sleeves"));
});

test("no requestOptional means every example key is required", () => {
  const schema = requestSchemaFor({ requestExample: { record: { schema: "canli.paper-evidence.v0" } } });
  assert.deepEqual(schema.required, ["record"]);
  assert.deepEqual(schema.properties.record, { type: "object", properties: { schema: { type: "string" } }, required: ["schema"] });
});

test("nested arrays infer item schemas recursively", () => {
  const schema = requestSchemaFor({ requestExample: { matrix: [[0.01, -0.002]] } });
  assert.deepEqual(schema.properties.matrix, { type: "array", items: { type: "array", items: { type: "number" } } });
});

test("requestExtraProperties add fields the example does not itself show, never required", () => {
  const schema = requestSchemaFor({
    requestExample: { returns: [0.01] },
    requestOptional: ["returns"],
    requestExtraProperties: { observations: { type: "number" } },
  });
  assert.deepEqual(schema.properties.observations, { type: "number" });
  assert.ok(!schema.required.includes("observations"));
  assert.deepEqual(schema.required, []);
});

test("requestDescription is carried onto the schema when present", () => {
  const schema = requestSchemaFor({ requestExample: { a: 1 }, requestDescription: "either/or, see the docs" });
  assert.equal(schema.description, "either/or, see the docs");
});
