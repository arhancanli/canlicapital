// mcp/test/schemas.test.mjs
//
// Round-trips the zod schemas in ../src/schemas.mjs against the API's own examples, so the shapes
// this MCP server accepts cannot silently drift from what canlicapital.com actually documents:
// public/api/v1/openapi.json (the deflated-sharpe return-series example), the contract file (the
// seven-field example), and api/_lib/manifest.js (the other three validators plus get_key).
// Also checks that every tool description carries a limits sentence, and that those sentences are
// still present, verbatim, in api/_lib/limits.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  breadthInput,
  deflatedSharpeInput,
  getKeyInput,
  getReceiptInput,
  LIMITS_SENTENCES,
  REGISTRY_LIMITS_CLAUSE,
  overfittingInput,
  paperEvidenceInput,
  TOOL_DESCRIPTIONS,
} from "../src/schemas.mjs";
import { MANIFEST } from "../../api/_lib/manifest.js";
import { LIMITS_TEXT } from "../../api/_lib/limits.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const readJson = (relPath) => JSON.parse(readFileSync(path.join(repoRoot, relPath), "utf8"));
const manifestExample = (routePath) => MANIFEST.find((m) => m.path === routePath).requestExample;


// The published OpenAPI documents deflated-sharpe as a oneOf with two named examples
// (contract_inputs, return_series) since the two-mode schema shipped; older builds carried a
// single top-level example. Accept either shape and fail loudly if neither is present.
function returnSeriesExample(openapi) {
  const body = openapi.paths["/api/v1/validate/deflated-sharpe"].post.requestBody.content["application/json"];
  const example = body.examples?.return_series?.value ?? body.example;
  if (!example || !Array.isArray(example.returns)) throw new Error("OpenAPI carries no return-series example for deflated-sharpe");
  return example;
}

test("deflated-sharpe: accepts the OpenAPI return-series example verbatim", () => {
  const openapi = readJson("public/api/v1/openapi.json");
  const example = returnSeriesExample(openapi);
  const result = deflatedSharpeInput.safeParse(example);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test("deflated-sharpe: accepts the seven-field contract example verbatim", () => {
  const contract = readJson("public/glassbox/deflated_sharpe_calculator_contract.json");
  const vector = contract.test_vectors.find((v) => v.id === "trading_days_short_search");
  const result = deflatedSharpeInput.safeParse(vector.inputs);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test("deflated-sharpe: rejects a mixed input carrying fields from both modes", () => {
  const openapi = readJson("public/api/v1/openapi.json");
  const returnSeries = returnSeriesExample(openapi);
  const contract = readJson("public/glassbox/deflated_sharpe_calculator_contract.json");
  const contractFields = contract.test_vectors.find((v) => v.id === "trading_days_short_search").inputs;
  const mixed = { ...returnSeries, ...contractFields };
  const result = deflatedSharpeInput.safeParse(mixed);
  assert.equal(result.success, false);
});

test("deflated-sharpe: rejects an empty object (neither mode)", () => {
  assert.equal(deflatedSharpeInput.safeParse({}).success, false);
});

test("overfitting: accepts the manifest example", () => {
  const example = manifestExample("/api/v1/validate/overfitting");
  const result = overfittingInput.safeParse(example);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test("paper-evidence: accepts the manifest example", () => {
  const example = manifestExample("/api/v1/validate/paper-evidence");
  const result = paperEvidenceInput.safeParse(example);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test("breadth: accepts the manifest example", () => {
  const example = manifestExample("/api/v1/validate/breadth");
  const result = breadthInput.safeParse(example);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test("get_key: accepts the manifest example", () => {
  const example = manifestExample("/api/v1/keys");
  const result = getKeyInput.safeParse(example);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test("get_receipt: accepts a 24-hex id and rejects a malformed one", () => {
  assert.equal(getReceiptInput.safeParse({ id: "a".repeat(24) }).success, true);
  assert.equal(getReceiptInput.safeParse({ id: "not-hex" }).success, false);
  assert.equal(getReceiptInput.safeParse({ id: "a".repeat(23) }).success, false);
});

test("every tool description states, verbatim, one sentence of the boundary language", () => {
  const sentences = Object.values(LIMITS_SENTENCES);
  for (const [tool, description] of Object.entries(TOOL_DESCRIPTIONS)) {
    const carriesOne = sentences.some((sentence) => description.includes(sentence));
    assert.ok(carriesOne, `${tool} description does not carry a limits sentence: ${description}`);
  }
});

test("the registry clause is the verbatim tail of the not-admission sentence", () => {
  assert.ok(
    LIMITS_SENTENCES.notAdmission.endsWith(REGISTRY_LIMITS_CLAUSE),
    `REGISTRY_LIMITS_CLAUSE has drifted from LIMITS_SENTENCES.notAdmission: ${REGISTRY_LIMITS_CLAUSE}`,
  );
});

test("the boundary language has not drifted from api/_lib/limits.js LIMITS_TEXT", () => {
  for (const [key, sentence] of Object.entries(LIMITS_SENTENCES)) {
    assert.ok(LIMITS_TEXT.includes(sentence), `LIMITS_SENTENCES.${key} is not in LIMITS_TEXT verbatim: ${sentence}`);
  }
});
