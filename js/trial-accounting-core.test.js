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
const register = readJson("../public/glassbox/prospective_epoch_register.json");
const forwardIndex = readJson("../public/glassbox/trial-packets/forward_index.json");
const union = buildTrialUnion(ledger, manifest, index, prospective, register, forwardIndex);

const DEVELOPMENT_CLOSED = "DEVELOPMENT_CLOSURE_FINAL_NOT_ADMITTED";
const closedKey = register.identities.find((row) => row.status === DEVELOPMENT_CLOSED)?.hypothesis_key;

// A copy of the register and the forward index with one identity's rows changed, so a refusal
// test exercises the same union a real publish would build.
function withIdentity(key, { row: changeRow = (row) => row, forward: changeForward = (row) => row }) {
  const nextRegister = structuredClone(register);
  const nextForward = structuredClone(forwardIndex);
  nextRegister.identities = nextRegister.identities.map((row) =>
    row.hypothesis_key === key ? changeRow(row) : row,
  );
  nextForward.packets = nextForward.packets.map((row) =>
    row.hypothesis_key === key ? changeForward(row) : row,
  );
  return () => buildTrialUnion(ledger, manifest, index, prospective, nextRegister, nextForward);
}

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
  const unclosedRows = register.identities.filter((row) => row.packet_complete === false);
  const unclosed = filterTrialUnion(union, { status: TRIAL_UNION_STATUS.PROSPECTIVE_UNCLOSED });
  assert.equal(unclosed.length, unclosedRows.length);
  assert.equal(union.facts.prospective_unclosed, unclosedRows.length);
  assert.ok(unclosed.every((identity) => !identity.packet_complete && !identity.admitted && identity.public_page === null));
  const closed = filterTrialUnion(union, { status: TRIAL_UNION_STATUS.PROSPECTIVE_DEVELOPMENT_CLOSED });
  assert.equal(closed.length, register.identities.filter((row) => row.status === DEVELOPMENT_CLOSED).length);
  assert.ok(closed.every((identity) => identity.packet_complete && !identity.admitted));
  assert.equal(union.facts.prospective_identities, register.summary.observed_identities);
  assert.equal(
    union.facts.prospective_governed_packets +
      union.facts.prospective_development_closures +
      union.facts.prospective_unclosed,
    register.summary.observed_identities,
  );
});

test("a development-closed identity links only the packet the forward index binds", () => {
  assert.ok(closedKey, "the published register carries at least one development closure");
  const forwardByKey = new Map(forwardIndex.packets.map((row) => [row.hypothesis_key, row]));
  const closed = filterTrialUnion(union, { status: TRIAL_UNION_STATUS.PROSPECTIVE_DEVELOPMENT_CLOSED });
  for (const identity of closed) {
    const row = forwardByKey.get(identity.hypothesis_key);
    assert.equal(identity.packet_path, row.public_path);
    assert.equal(identity.public_page, `/trials/${identity.hypothesis_key}`);
    assert.equal(identity.disposition, row.closure.final_disposition);
  }
  assert.deepEqual(
    Object.values(union.facts.prospective_development_dispositions).reduce((a, b) => a + b, 0),
    closed.length,
  );
});

test("a closed identity the forward index does not bind fails closed", () => {
  assert.throws(
    withIdentity(closedKey, { forward: (row) => ({ ...row, public_path: null }) }),
    /does not bind/,
  );
  assert.throws(
    withIdentity(closedKey, {
      forward: (row) => ({ ...row, closure: { ...row.closure, final_disposition: "ADMIT" } }),
    }),
    /does not bind/,
  );
  assert.throws(
    withIdentity(closedKey, { forward: (row) => ({ ...row, reservation_ordinal: row.reservation_ordinal + 1 }) }),
    /does not bind/,
  );
});

test("an unclosed identity with a published packet, or a claimed admission, fails closed", () => {
  assert.throws(
    withIdentity(closedKey, {
      row: (row) => ({ ...row, packet_complete: false, closure_kind: null, final_disposition: null }),
    }),
    /is unclosed but a closure or packet is named/,
  );
  assert.throws(withIdentity(closedKey, { row: (row) => ({ ...row, admitted: true }) }), /claims admission/);
  assert.throws(
    withIdentity(closedKey, { row: (row) => ({ ...row, closure_kind: "governed" }) }),
    /without a development closure/,
  );
});

test("a governed identity the forward index does not bind fails closed", () => {
  const governedKey = prospective.identity.hypothesis_key;
  assert.throws(
    withIdentity(governedKey, {
      forward: (row) => ({ ...row, closure: { ...row.closure, final_disposition: "ADMIT" } }),
    }),
    /Governed prospective identity is not bound to the forward packet index/,
  );
  assert.throws(
    withIdentity(governedKey, {
      forward: (row) => ({ ...row, public_path: "/glassbox/trial-packets/0000000000000000.json" }),
    }),
    /not bound to the forward packet index/,
  );
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
    () => buildTrialUnion({ ...ledger, schema: "unknown" }, manifest, index, prospective, register, forwardIndex),
    /schema mismatch/,
  );
  assert.throws(
    () => buildTrialUnion(ledger, manifest, index, prospective, register, undefined),
    /Forward packet index schema mismatch/,
  );
});
