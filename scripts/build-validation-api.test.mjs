import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LIMITS, LIMITS_TEXT } from "../api/_lib/limits.js";
import { BINDINGS } from "../api/_lib/bindings.generated.js";
import { MANIFEST } from "../api/_lib/manifest.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the quota constants are the documented values and every one has a sentence", () => {
  assert.deepEqual(LIMITS, {
    validations_per_key_per_day: 1000, keys_per_client_per_day: 5, max_body_bytes: 1048576,
    max_observations: 20000, max_variants: 200, max_cscv_combinations: 2000, wall_time_seconds: 10,
  });
  assert.ok(Object.isFrozen(LIMITS));
  assert.ok(LIMITS_TEXT.length >= 4);
  for (const line of LIMITS_TEXT) assert.ok(!line.includes("—"), "no em dashes in published copy");
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

test("vercel.json gives the function routes no-store and receipts an immutable cache", () => {
  const vercel = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
  const bySource = Object.fromEntries(vercel.headers.map((h) => [h.source, Object.fromEntries(h.headers.map((x) => [x.key, x.value]))]));
  assert.equal(bySource["/api/v1/validate/(.*)"]["Cache-Control"], "no-store");
  assert.equal(bySource["/api/v1/keys"]["Cache-Control"], "no-store");
  assert.match(bySource["/api/v1/receipts/(.*)"]["Cache-Control"], /immutable/);
});

test("/developers documents every manifest route, the quotas, and what a verdict does not establish", () => {
  const html = readFileSync(resolve(ROOT, "developers.html"), "utf8");
  for (const m of MANIFEST) assert.ok(html.includes(`${m.method} ${m.path}`), `${m.method} ${m.path} missing from /developers`);
  assert.ok(html.includes(String(LIMITS.validations_per_key_per_day)));
  assert.ok(html.includes("does not establish"));
  assert.ok(html.includes("curl -X POST https://canlicapital.com/api/v1/keys"));
  assert.match(html, /<meta name="canli:sources" content="[^"]*validation_api_limits\.json/);
  assert.ok(!html.includes("—"), "no em dashes");
});
