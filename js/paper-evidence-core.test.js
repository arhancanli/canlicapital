// The conformance suite for canli.paper-evidence.v0.
//
// The load-bearing assertion is not that invalid vectors fail. It is that each one
// fails AT ITS DECLARED POINTER: a validator that rejected everything would pass a
// naive suite while being useless, and one that failed the right vector for the
// wrong reason would hide a rule that does not work.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { conformance, validate } from "./paper-evidence-core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "standards/paper-evidence/vectors");
const SCHEMA = JSON.parse(readFileSync(resolve(ROOT, "standards/paper-evidence/schema.json"), "utf8"));
const MANIFEST = JSON.parse(readFileSync(resolve(DIR, "manifest.json"), "utf8"));
const load = (name) => JSON.parse(readFileSync(resolve(DIR, `${name}.json`), "utf8"));

test("the publisher's own live record conforms to its own standard", () => {
  const result = conformance(load("valid-alphac-book"), SCHEMA);
  const problems = [...result.structural, ...result.semantic]
    .map((e) => `${e.pointer} ${e.message}`)
    .join("; ");
  assert.equal(result.valid, true, `the live record does not conform: ${problems}`);
});

test("every invalid vector fails, AT THE POINTER IT DECLARES", () => {
  const invalid = MANIFEST.vectors.filter((v) => v.expect === "INVALID");
  assert.ok(invalid.length >= 10, `only ${invalid.length} invalid vectors; the suite is too thin`);
  for (const v of invalid) {
    const result = conformance(load(v.name), SCHEMA);
    assert.equal(result.valid, false, `${v.name} was accepted but violates ${v.violates}`);
    const pointers = [...result.structural, ...result.semantic].map((e) => e.pointer);
    assert.ok(
      pointers.includes(v.pointer),
      `${v.name} failed, but not at ${v.pointer}. Reported: ${pointers.join(", ") || "(none)"}. ` +
        "Failing for the wrong reason hides a rule that does not work.",
    );
  }
});

test("every vector on disk is in the manifest", () => {
  // Otherwise a vector can be added, quietly never run, and look like coverage.
  const onDisk = readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .map((f) => f.slice(0, -5))
    .sort();
  const declared = MANIFEST.vectors.map((v) => v.name).sort();
  assert.deepEqual(onDisk, declared, "the vector directory and the manifest disagree");
});

test("the validator is not vacuous: it accepts a correct minimal shape", () => {
  const schema = {
    type: "object",
    required: ["a"],
    additionalProperties: false,
    properties: { a: { type: "integer", minimum: 1 } },
  };
  assert.deepEqual(validate({ a: 1 }, schema), []);
  assert.equal(validate({ a: 0 }, schema).length, 1);
  assert.equal(validate({ a: "1" }, schema).length, 1);
  assert.equal(validate({}, schema).length, 1);
  assert.equal(validate({ a: 1, b: 2 }, schema).length, 1);
});

test("errors carry a JSON Pointer to the offending location", () => {
  const schema = {
    type: "object",
    properties: { outer: { type: "object", properties: { inner: { type: "integer" } } } },
  };
  const errors = validate({ outer: { inner: "no" } }, schema);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].pointer, "/outer/inner");
});

test("date validation rejects a date that does not exist", () => {
  const schema = { type: "string", format: "date" };
  assert.deepEqual(validate("2026-08-27", schema), []);
  assert.equal(validate("2026-02-30", schema).length, 1, "a regex alone accepts 30 February");
  assert.equal(validate("2026-13-01", schema).length, 1);
  assert.equal(validate("26-08-27", schema).length, 1);
});

test("semantic checks do not run on a structurally broken record", () => {
  // Otherwise a single missing field produces a page of consequential noise and
  // the real problem is buried.
  const result = conformance({ schema: "canli.paper-evidence.v0" }, SCHEMA);
  assert.equal(result.valid, false);
  assert.ok(result.structural.length > 0);
  assert.equal(result.semantic.length, 0);
});
