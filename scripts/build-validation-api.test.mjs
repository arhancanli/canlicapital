import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { KEY_LIFECYCLE_TEXT, LIMITS, LIMITS_TEXT } from "../api/_lib/limits.js";
import { BINDINGS } from "../api/_lib/bindings.generated.js";
import { MANIFEST } from "../api/_lib/manifest.js";

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
    assert.ok(media.schema.properties && Object.keys(media.schema.properties).length > 0, `${m.path} schema has no properties`);
    assert.ok(Array.isArray(media.schema.required), `${m.path} schema has no required array`);
    assert.deepEqual(media.example, m.requestExample, `${m.path} example is missing or has drifted from the manifest`);
    const loadValidator = BODY_VALIDATORS[m.path];
    assert.ok(loadValidator, `${m.path} has no registered body validator for this test`);
    const validate = await loadValidator();
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
