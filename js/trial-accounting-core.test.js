import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildTrialUnion,
  filterTrialUnion,
  TRIAL_UNION_STATUS,
} from "./trial-accounting-core.js";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const ledger = readJson("../public/glassbox/trial_ledger.json");
const manifest = readJson("../public/glassbox/trial_packet_manifest.json");
const index = readJson("../public/glassbox/trial-packets/index.json");
const prospective = readJson("../public/glassbox/prospective_trial_record.json");
const union = buildTrialUnion(ledger, manifest, index, prospective);

test("complete trial union reconciles records, identities, packets and prospective reservation", () => {
  assert.equal(union.identities.length, ledger.distinct_hypothesis_identities);
  assert.equal(union.facts.selection_n, ledger.selection_statistics.n_hypotheses);
  assert.equal(
    union.facts.legacy_identities + union.facts.prospective_identities,
    union.facts.selection_n,
  );
  assert.equal(
    union.families.reduce((total, family) => total + family.identities, 0),
    union.facts.selection_n,
  );
});

test("packet completeness never becomes admission", () => {
  const complete = filterTrialUnion(union, { status: TRIAL_UNION_STATUS.LEGACY_COMPLETE });
  assert.equal(complete.length, manifest.summary.complete_trial_packets);
  assert.ok(complete.every((identity) => identity.packet_complete && !identity.admitted));
  const prospectiveIdentity = filterTrialUnion(union, {
    status: TRIAL_UNION_STATUS.PROSPECTIVE_FINAL_INCOMPLETE,
  });
  assert.equal(prospectiveIdentity.length, prospective.identity.hypotheses_spent);
  assert.ok(prospectiveIdentity.every((identity) => identity.packet_complete && !identity.admitted));
});

test("family filtering preserves the immutable union denominator", () => {
  for (const family of union.families) {
    assert.equal(filterTrialUnion(union, { family: family.family_key }).length, family.identities);
  }
  assert.equal(union.facts.selection_n, ledger.distinct_hypothesis_identities);
});

test("search resolves exact identity, config, label and family fields", () => {
  const target = union.identities[Math.floor(union.identities.length / 3)];
  assert.ok(filterTrialUnion(union, { query: target.hypothesis_key }).includes(target));
  assert.ok(filterTrialUnion(union, { query: target.config_hash }).includes(target));
  assert.ok(filterTrialUnion(union, { query: target.label }).includes(target));
  assert.ok(filterTrialUnion(union, { query: target.family_title }).includes(target));
});

test("unknown source schemas fail closed", () => {
  assert.throws(
    () => buildTrialUnion({ ...ledger, schema: "unknown" }, manifest, index, prospective),
    /schema mismatch/,
  );
});
