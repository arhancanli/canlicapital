import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LIMITS, LIMITS_TEXT } from "../api/_lib/limits.js";
import { BINDINGS } from "../api/_lib/bindings.generated.js";

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
