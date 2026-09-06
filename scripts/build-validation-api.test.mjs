import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { KEY_LIFECYCLE_TEXT, LIMITS, LIMITS_TEXT } from "../api/_lib/limits.js";
import { BINDINGS } from "../api/_lib/bindings.generated.js";
import { MANIFEST, SNIPPET_LABELS } from "../api/_lib/manifest.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The route's own body validator, one per POST path, so the round-trip test below proves the
// OpenAPI example is accepted by the SAME function the live handler runs, not a stand-in for it.
const BODY_VALIDATORS = {
  "/api/v1/keys": async () => (await import("../api/v1/keys.js")).validateBody,
  "/api/v1/validate/deflated-sharpe": async () => (await import("../api/v1/validate/deflated-sharpe.js")).compute,
  "/api/v1/validate/overfitting": async () => (await import("../api/v1/validate/overfitting.js")).compute,
  "/api/v1/validate/paper-evidence": async () => (await import("../api/v1/validate/paper-evidence.js")).compute,
  "/api/v1/validate/breadth": async () => (await import("../api/v1/validate/breadth.js")).compute,
};

test("the quota constants are the documented values and every one has a sentence", () => {
  assert.deepEqual(LIMITS, {
    validations_per_key_per_day: 1000, keys_per_client_per_day: 5, max_body_bytes: 1048576,
    max_observations: 20000, max_variants: 200, max_cscv_combinations: 2000, wall_time_seconds: 10,
  });
  assert.ok(Object.isFrozen(LIMITS));
  assert.ok(LIMITS_TEXT.length >= 4);
  for (const line of LIMITS_TEXT) assert.ok(!line.includes("\u2014"), "no em dashes in published copy");
});

test("key-lifecycle facts are published: no expiry, no self-serve revoke or rotate, and what a client is", () => {
  assert.ok(KEY_LIFECYCLE_TEXT.length >= 3);
  const joined = KEY_LIFECYCLE_TEXT.join(" ").toLowerCase();
  assert.match(joined, /do not expire|does not expire/);
  assert.match(joined, /no self-serve revoke/);
  assert.match(joined, /issue a new (key|one)/);
  assert.match(joined, /client/);
  assert.match(joined, /ip address/);
  assert.match(joined, /salt/);
  // A numeral, not a version tag like "v1": mirrors audit-published-numbers.mjs's own rule that a
  // digit preceded by a word character (as in v1, v0) is an identifier, not a published claim.
  const NUMERAL = /(?<![\w.])\d+/g;
  for (const line of KEY_LIFECYCLE_TEXT) {
    assert.ok(!line.includes("\u2014"), "no em dashes in published copy");
    for (const token of line.match(NUMERAL) ?? []) {
      assert.ok(Object.values(LIMITS).some((v) => String(v) === token), `${token} in key-lifecycle text is not a published LIMITS value`);
    }
  }
});

test("the published limits artifact carries the key-lifecycle facts", () => {
  const limits = JSON.parse(readFileSync(resolve(ROOT, "public/glassbox/validation_api_limits.json"), "utf8"));
  assert.deepEqual(limits.key_lifecycle_text, KEY_LIFECYCLE_TEXT);
});

test("the committed bindings and limits artifact are current", () => {
  const before = readFileSync(resolve(ROOT, "api/_lib/bindings.generated.js"), "utf8");
  const beforeLimits = readFileSync(resolve(ROOT, "public/glassbox/validation_api_limits.json"), "utf8");
  execFileSync(process.execPath, [resolve(ROOT, "scripts/build-validation-api.mjs")], { stdio: "pipe" });
  assert.equal(readFileSync(resolve(ROOT, "api/_lib/bindings.generated.js"), "utf8"), before, "bindings.generated.js is stale; run scripts/build-validation-api.mjs");
  assert.equal(readFileSync(resolve(ROOT, "public/glassbox/validation_api_limits.json"), "utf8"), beforeLimits);
  for (const [path, digest] of Object.entries(BINDINGS.files)) {
    assert.match(digest, /^sha256:[0-9a-f]{64}$/, path);
  }
});

test("openapi documents every manifest route with the right method and a 429 for keyed ones", () => {
  const openapi = JSON.parse(readFileSync(resolve(ROOT, "public/api/v1/openapi.json"), "utf8"));
  for (const m of MANIFEST) {
    const entry = openapi.paths[m.path]?.[m.method.toLowerCase()];
    assert.ok(entry, `${m.method} ${m.path} missing from openapi`);
    assert.equal(entry.summary, m.summary);
    if (m.keyed) { assert.ok(entry.responses["429"], `${m.path} lacks 429`); assert.deepEqual(entry.security, [{ bearerKey: [] }]); }
  }
  assert.equal(openapi.components.securitySchemes.bearerKey.scheme, "bearer");
});

test("every POST route's request schema has properties, and its example round-trips through its own validator", async () => {
  const openapi = JSON.parse(readFileSync(resolve(ROOT, "public/api/v1/openapi.json"), "utf8"));
  for (const m of MANIFEST.filter((r) => r.method === "POST")) {
    const body = openapi.paths[m.path]?.post?.requestBody;
    assert.ok(body, `${m.path} has no requestBody`);
    const media = body.content["application/json"];
    const loadValidator = BODY_VALIDATORS[m.path];
    assert.ok(loadValidator, `${m.path} has no registered body validator for this test`);
    const validate = await loadValidator();
    // A route can declare `modes`: a discriminated union of input shapes, documented as a oneOf
    // with one schema and one example PER MODE rather than a single flat object. Every mode gets
    // the same checks a single-shape route gets, individually.
    if (Array.isArray(m.modes) && m.modes.length) {
      assert.ok(Array.isArray(media.schema.oneOf) && media.schema.oneOf.length === m.modes.length, `${m.path} schema oneOf does not match its declared modes`);
      for (const [i, modeSchema] of media.schema.oneOf.entries()) {
        const mode = m.modes[i];
        assert.ok(modeSchema.properties && Object.keys(modeSchema.properties).length > 0, `${m.path} mode ${mode.name} schema has no properties`);
        assert.ok(Array.isArray(modeSchema.required) && modeSchema.required.length > 0, `${m.path} mode ${mode.name} schema has no required array`);
        assert.deepEqual(media.examples?.[mode.name]?.value, mode.example, `${m.path} mode ${mode.name} example is missing or has drifted from the manifest`);
        assert.doesNotThrow(() => validate(mode.example), `${m.path} mode ${mode.name}: its own documented example does not pass its own validator`);
      }
      continue;
    }
    assert.ok(media.schema.properties && Object.keys(media.schema.properties).length > 0, `${m.path} schema has no properties`);
    assert.ok(Array.isArray(media.schema.required), `${m.path} schema has no required array`);
    assert.deepEqual(media.example, m.requestExample, `${m.path} example is missing or has drifted from the manifest`);
    assert.doesNotThrow(() => validate(m.requestExample), `${m.path}: its own documented example does not pass its own validator`);
  }
});

test("vercel.json gives the function routes no-store and receipts an immutable cache", () => {
  const vercel = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
  const bySource = Object.fromEntries(vercel.headers.map((h) => [h.source, Object.fromEntries(h.headers.map((x) => [x.key, x.value]))]));
  assert.equal(bySource["/api/v1/validate/(.*)"]["Cache-Control"], "no-store");
  assert.equal(bySource["/api/v1/keys"]["Cache-Control"], "no-store");
  assert.match(bySource["/api/v1/receipts/(.*)"]["Cache-Control"], /immutable/);
});

test("/developers ships no loading placeholder: the key result and error boxes are hidden and empty in the static HTML", () => {
  const html = readFileSync(resolve(ROOT, "developers.html"), "utf8");
  const resultBox = html.match(/<div class="dev-key-result"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(resultBox, "the key-result box is missing");
  assert.match(resultBox[0], /\bhidden\b/, "the key-result box must be hidden without JS");
  assert.equal(resultBox[1].trim(), "", "the key-result box must be empty in static HTML, never a loading placeholder");
  const errorBox = html.match(/<p class="dev-key-error"[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(errorBox, "the key-error box is missing");
  assert.match(errorBox[0], /\bhidden\b/, "the key-error box must be hidden without JS");
  assert.equal(errorBox[1].trim(), "", "the key-error box must be empty in static HTML");
  assert.ok(html.includes("dev-get-key-button"), "the get-a-key button must be present");
  assert.ok(html.includes("$CANLI_KEY"), "the curl fallback with the placeholder must be present");
});

test("/developers documents every manifest route, the quotas, and what a verdict does not establish", () => {
  const html = readFileSync(resolve(ROOT, "developers.html"), "utf8");
  for (const m of MANIFEST) assert.ok(html.includes(`${m.method} ${m.path}`), `${m.method} ${m.path} missing from /developers`);
  assert.ok(html.includes(String(LIMITS.validations_per_key_per_day)));
  assert.ok(html.includes("does not establish"));
  assert.ok(html.includes("curl -X POST https://canlicapital.com/api/v1/keys"));
  assert.match(html, /<meta name="canli:sources" content="[^"]*validation_api_limits\.json/);
  assert.ok(!html.includes("\u2014"), "no em dashes");
});

test("deflated-sharpe declares two input modes, and openapi documents them as oneOf", () => {
  const dsr = MANIFEST.find((m) => m.path === "/api/v1/validate/deflated-sharpe");
  assert.ok(Array.isArray(dsr.modes) && dsr.modes.length === 2, "deflated-sharpe should declare two modes");
  for (const mode of dsr.modes) {
    assert.ok(mode.name && mode.required?.length && mode.example, `mode ${mode.name} needs name, required and example`);
    for (const key of mode.required) assert.ok(key in mode.example, `${mode.name} example is missing required field ${key}`);
  }
  const openapi = JSON.parse(readFileSync(resolve(ROOT, "public/api/v1/openapi.json"), "utf8"));
  const schema = openapi.paths["/api/v1/validate/deflated-sharpe"].post.requestBody.content["application/json"].schema;
  assert.ok(Array.isArray(schema.oneOf), "requestBody schema should be a oneOf");
  assert.equal(schema.oneOf.length, 2);
  for (const s of schema.oneOf) assert.ok(Array.isArray(s.required) && s.required.length > 0, "each oneOf entry needs its own required list");
  const requiredSets = schema.oneOf.map((s) => [...s.required].sort().join(","));
  assert.notEqual(requiredSets[0], requiredSets[1], "the two modes must have distinct required fields");
});

test("openapi documents usage (nullable) with its six fields on the status response", () => {
  const openapi = JSON.parse(readFileSync(resolve(ROOT, "public/api/v1/openapi.json"), "utf8"));
  const okResponse = openapi.paths["/api/v1/validate/status"].get.responses["200"];
  assert.match(JSON.stringify(okResponse), /"usage"/, "status 200 response should reference usage");
  const usageSchema = openapi.components.schemas.UsageSummary;
  assert.ok(usageSchema, "openapi should declare a UsageSummary schema");
  const usageJson = JSON.stringify(usageSchema);
  for (const field of [
    "validations_today", "validations_total", "keys_issued_today", "as_of_utc_day",
    "keys_by_source_host_today", "keys_by_label_today",
  ]) {
    assert.match(usageJson, new RegExp(field), `UsageSummary should name ${field}`);
  }
  assert.match(usageJson, /"null"/, "usage must be documented as nullable");
});

test("/developers renders a labelled snippet for each deflated-sharpe input mode", () => {
  const html = readFileSync(resolve(ROOT, "developers.html"), "utf8");
  const dsr = MANIFEST.find((m) => m.path === "/api/v1/validate/deflated-sharpe");
  for (const mode of dsr.modes) {
    assert.ok(html.includes(mode.label ?? mode.name), `missing label for mode ${mode.name}`);
  }
  // Distinct request bodies actually appear, not one example flattened over both modes. The page
  // HTML-escapes the JSON in each snippet, so the field names (which need no escaping) are the
  // reliable markers that BOTH shapes were rendered rather than one repeated twice.
  assert.ok(html.includes("observed_sharpe_annualized"), "contract-inputs example missing from /developers");
  assert.ok(html.includes("&quot;returns&quot;:["), "return-series example missing from /developers");
});

test("openapi documents the receipt badge route as an SVG response, never the JSON envelope", () => {
  const openapi = JSON.parse(readFileSync(resolve(ROOT, "public/api/v1/openapi.json"), "utf8"));
  const op = openapi.paths["/api/v1/receipts/{id}/badge.svg"]?.get;
  assert.ok(op, "the receipt badge route is missing from openapi");
  assert.ok(op.responses["200"]?.content?.["image/svg+xml"], "badge 200 response should be image/svg+xml");
  assert.ok(op.responses["404"]?.content?.["image/svg+xml"], "badge 404 response should be image/svg+xml");
  assert.ok(!op.responses["200"]?.content?.["application/json"], "badge 200 response should not be the JSON envelope");
  assert.equal(op.parameters?.[0]?.name, "id");
});

test("SNIPPET_LABELS gives each integration on /developers a distinct, plain default label", () => {
  const values = Object.values(SNIPPET_LABELS);
  assert.ok(values.length >= 4, "expected at least the four launch-kit-plan integrations");
  assert.equal(new Set(values).size, values.length, "snippet labels must be pairwise distinct");
  for (const v of values) assert.match(v, /^[a-z0-9-]+$/, `${v} should be a plain lowercase label, not a tracking parameter`);
});

test("/developers renders every snippet's own default label, so a breakdown by label is a source breakdown", () => {
  const html = readFileSync(resolve(ROOT, "developers.html"), "utf8");
  for (const label of Object.values(SNIPPET_LABELS)) {
    assert.ok(html.includes(label), `label "${label}" missing from /developers`);
  }
});
