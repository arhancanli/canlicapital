// =============================================================================
// build-paper-evidence-vectors.mjs
// -----------------------------------------------------------------------------
// Conformance test vectors for canli.paper-evidence.v0.
//
// Each invalid vector is the VALID record with exactly one thing wrong, so an
// implementer can diff them and see the rule rather than read about it. They are
// generated rather than hand-written for the same reason: ten hand-maintained
// copies of a record drift from the schema the moment it changes, and then the
// vectors quietly stop testing anything.
//
// The manifest records what each vector violates and where, and the test suite
// asserts each one fails AT THAT POINTER. A vector that failed for an unrelated
// reason would otherwise look like a passing test.
// =============================================================================

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { conformance } from "../js/paper-evidence-core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "standards/paper-evidence/vectors");
const VALID = JSON.parse(readFileSync(resolve(DIR, "valid-alphac-book.json"), "utf8"));

const clone = () => JSON.parse(JSON.stringify(VALID));

const CASES = [
  {
    name: "invalid-missing-required-claim-maturity",
    pointer: "/",
    violates: "required: claim_maturity",
    why: "A record that never says what it fails to establish is the defect this standard exists to prevent.",
    mutate: (r) => { delete r.claim_maturity; },
  },
  {
    name: "invalid-empty-does-not-establish",
    pointer: "/claim_maturity/does_not_establish",
    violates: "minItems: 1",
    why: "Every record fails to establish something. An empty list means the publisher did not look.",
    mutate: (r) => { r.claim_maturity.does_not_establish = []; },
  },
  {
    name: "invalid-unknown-capital-kind",
    pointer: "/capital/kind",
    violates: "enum",
    why: "Capital kind is enumerated so it cannot be softened into prose.",
    mutate: (r) => { r.capital.kind = "REAL_MONEY"; },
  },
  {
    name: "invalid-wrong-schema-id",
    pointer: "/schema",
    violates: "const",
    why: "A record claiming a version it does not implement is worse than an unversioned one.",
    mutate: (r) => { r.schema = "canli.paper-evidence.v1"; },
  },
  {
    name: "invalid-unexpected-property",
    pointer: "/returns/annualized_return_pct",
    violates: "additionalProperties: false",
    why: "Extra fields are where unreviewed claims enter a standardised record.",
    mutate: (r) => { r.returns.annualized_return_pct = 42; },
  },
  {
    name: "invalid-malformed-sha256",
    pointer: "/provenance/source_bindings/0/sha256",
    violates: "pattern",
    why: "A truncated or mistyped digest cannot be checked, so it is not provenance.",
    mutate: (r) => { r.provenance.source_bindings[0].sha256 = "sha256:deadbeef"; },
  },
  {
    name: "invalid-impossible-date",
    pointer: "/period/first_observation",
    violates: "format: date",
    why: "A regex accepts 2026-02-30. A record's period must be a date that exists.",
    mutate: (r) => { r.period.first_observation = "2026-02-30"; },
  },
  {
    name: "invalid-no-source-bindings",
    pointer: "/provenance/source_bindings",
    violates: "minItems: 1",
    why: "A record bound to nothing is an assertion.",
    mutate: (r) => { r.provenance.source_bindings = []; },
  },
  {
    name: "invalid-semantic-unreportable-sharpe-reported",
    pointer: "/returns/sharpe_annualised",
    violates: "semantic: sharpe_reportable false but a Sharpe is published",
    why: "Declaring the sample cannot support a figure and then publishing it anyway.",
    mutate: (r) => { r.returns.sharpe_reportable = false; r.returns.sharpe_annualised = 1.8; },
  },
  {
    name: "invalid-semantic-paper-net-of-realised",
    pointer: "/returns/basis",
    violates: "semantic: PAPER capital cannot be net of REALISED costs",
    why: "Realised costs require funded execution. This is how a paper record acquires the authority of a funded one.",
    mutate: (r) => { r.capital.kind = "PAPER"; r.returns.basis = "NET_OF_REALISED_COSTS"; },
  },
  {
    name: "invalid-semantic-uncounted-trials",
    pointer: "/selection/trial_count",
    violates: "semantic: trials_counted true but trial_count null",
    why: "Claiming to count trials without a count.",
    mutate: (r) => { r.selection.trials_counted = true; r.selection.trial_count = null; },
  },
  {
    name: "invalid-semantic-reversed-period",
    pointer: "/period",
    violates: "semantic: first_observation after last_observation",
    why: "A period that runs backwards passes every type check.",
    mutate: (r) => {
      const first = r.period.first_observation;
      r.period.first_observation = r.period.last_observation;
      r.period.last_observation = first;
    },
  },
];

mkdirSync(DIR, { recursive: true });
const manifest = [];
for (const c of CASES) {
  const record = clone();
  c.mutate(record);
  writeFileSync(resolve(DIR, `${c.name}.json`), `${JSON.stringify(record, null, 2)}\n`);
  manifest.push({ name: c.name, expect: "INVALID", pointer: c.pointer, violates: c.violates, why: c.why });
}
manifest.unshift({
  name: "valid-alphac-book",
  expect: "VALID",
  pointer: null,
  violates: null,
  why: "The publisher's own live record. If this ever stops conforming, the build fails.",
});
writeFileSync(
  resolve(DIR, "manifest.json"),
  `${JSON.stringify({ schema: "canli.paper-evidence.v0", vectors: manifest }, null, 2)}\n`,
);
// -----------------------------------------------------------------------------
// The conformance receipt. A standard that publishes a schema and asserts its own
// vectors behave is asking to be taken on trust; this RUNS the validator over
// every vector and records what actually happened, including the pointer each
// failure was reported at. It is what /standards/paper-evidence renders from, so
// the page cannot state a result the validator did not produce.
// -----------------------------------------------------------------------------
const SCHEMA = JSON.parse(readFileSync(resolve(ROOT, "standards/paper-evidence/schema.json"), "utf8"));
const results = manifest.map((v) => {
  const record = JSON.parse(readFileSync(resolve(DIR, `${v.name}.json`), "utf8"));
  const outcome = conformance(record, SCHEMA);
  const pointers = [...outcome.structural, ...outcome.semantic].map((e) => e.pointer);
  const expectedValid = v.expect === "VALID";
  return {
    name: v.name,
    expected: v.expect,
    observed: outcome.valid ? "VALID" : "INVALID",
    as_expected: outcome.valid === expectedValid,
    violates: v.violates,
    expected_pointer: v.pointer,
    reported_pointers: pointers,
    // The assertion that matters: a vector failing for an unrelated reason would
    // look like a pass while hiding a rule that does not work.
    failed_at_expected_pointer: expectedValid ? null : pointers.includes(v.pointer),
  };
});

const disagreements = results.filter(
  (r) => !r.as_expected || r.failed_at_expected_pointer === false,
);
if (disagreements.length) {
  console.error("paper-evidence: the conformance suite disagrees with its own manifest:");
  for (const d of disagreements) console.error(`  ${d.name}: expected ${d.expected} at ${d.expected_pointer}, got ${d.observed} at ${d.reported_pointers.join(", ") || "(none)"}`);
  process.exit(1);
}

const receipt = {
  schema: "canli.paper-evidence-conformance.v1",
  standard: "canli.paper-evidence.v0",
  generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  author: "Arhan Canli",
  claim_boundary:
    "A record of this validator run over these vectors. It shows the rules fire where they are " +
    "meant to. It is not evidence that the standard is complete, and it is not an independent " +
    "implementation.",
  validator: { path: "js/paper-evidence-core.js", dependencies: 0 },
  required_members: SCHEMA.required.length,
  totals: {
    vectors: results.length,
    valid: results.filter((r) => r.expected === "VALID").length,
    invalid: results.filter((r) => r.expected === "INVALID").length,
    behaved_as_declared: results.filter((r) => r.as_expected).length,
    failed_at_declared_pointer: results.filter((r) => r.failed_at_expected_pointer === true).length,
  },
  independent_implementations: 0,
  results,
};
const body = JSON.stringify(
  Object.fromEntries(Object.entries(receipt).filter(([k]) => k !== "content_hash")),
);
receipt.content_hash = `sha256:${createHash("sha256").update(body).digest("hex")}`;
mkdirSync(resolve(ROOT, "public/glassbox"), { recursive: true });
writeFileSync(
  resolve(ROOT, "public/glassbox/paper_evidence_conformance.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);

console.log(
  `  vectors: 1 valid, ${CASES.length} invalid, each violating exactly one rule; ` +
    `${receipt.totals.behaved_as_declared}/${receipt.totals.vectors} behaved as declared, ` +
    `${receipt.totals.failed_at_declared_pointer} failed at the declared pointer`,
);
