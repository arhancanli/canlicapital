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
const GOVERNED = "GOVERNED_SERIAL_PACKET_CLOSED";
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

// A development-closed identity re-cast as a v2 governed batch closure whose packet the seal has
// not written yet: the shape the register and forward index publish right after a batch seal.
const asGovernedBatchClosure = {
  row: (row) => ({ ...row, status: GOVERNED, closure_kind: "governed", final_disposition: "KILL" }),
  forward: (row) => ({
    ...row,
    register_status: GOVERNED,
    closure: { ...row.closure, kind: "governed", final_disposition: "KILL", admitted: false },
    packet_status: "PACKET_PENDING",
    public_path: null,
    complete: false,
  }),
};

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
  const governedBatch = filterTrialUnion(union, { status: TRIAL_UNION_STATUS.PROSPECTIVE_GOVERNED_CLOSED });
  assert.ok(governedBatch.every((identity) => !identity.admitted));
  assert.equal(union.facts.prospective_identities, register.summary.observed_identities);
  assert.equal(
    union.facts.prospective_governed_packets +
      union.facts.prospective_governed_batch_closures +
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

test("a governed batch closure with its packet still owed is closed, not admitted, and links nothing", () => {
  const built = withIdentity(closedKey, asGovernedBatchClosure)();
  const [identity] = filterTrialUnion(built, { query: closedKey });
  assert.equal(identity.status, TRIAL_UNION_STATUS.PROSPECTIVE_GOVERNED_CLOSED);
  assert.equal(identity.disposition, "KILL");
  assert.equal(identity.admitted, false);
  assert.equal(identity.packet_complete, false);
  assert.equal(identity.packet_path, null);
  assert.equal(identity.public_page, null);
  assert.deepEqual(identity.missing_sections, ["identity_packet"]);
  // One development closure became one more governed batch closure, on top of whatever the
  // published register already carries.
  assert.equal(
    built.facts.prospective_governed_batch_closures,
    union.facts.prospective_governed_batch_closures + 1,
  );
  assert.equal(
    built.facts.prospective_governed_batch_packets_pending,
    union.facts.prospective_governed_batch_packets_pending + 1,
  );
  assert.equal(
    built.facts.prospective_governed_batch_dispositions.KILL,
    (union.facts.prospective_governed_batch_dispositions.KILL ?? 0) + 1,
  );
  assert.equal(built.facts.prospective_development_closures, union.facts.prospective_development_closures - 1);
});

test("a published governed batch closure links exactly the packet the forward index binds", () => {
  const forwardByKey = new Map(forwardIndex.packets.map((row) => [row.hypothesis_key, row]));
  const governedBatch = filterTrialUnion(union, {
    status: TRIAL_UNION_STATUS.PROSPECTIVE_GOVERNED_CLOSED,
  });
  assert.equal(governedBatch.length, union.facts.prospective_governed_batch_closures);
  for (const identity of governedBatch) {
    const row = forwardByKey.get(identity.hypothesis_key);
    assert.equal(identity.admitted, false);
    assert.equal(identity.disposition, row.closure.final_disposition);
    assert.equal(row.closure.kind, "governed");
    if (identity.packet_complete) {
      assert.equal(identity.packet_path, row.public_path);
      assert.equal(identity.public_page, `/trials/${identity.hypothesis_key}`);
    } else {
      assert.equal(identity.packet_path, null);
      assert.equal(identity.public_page, null);
    }
  }
});

test("a governed batch closure the forward index contradicts, or a stray packet path, fails closed", () => {
  assert.throws(
    withIdentity(closedKey, {
      row: asGovernedBatchClosure.row,
      forward: (row) => {
        const governed = asGovernedBatchClosure.forward(row);
        return { ...governed, closure: { ...governed.closure, final_disposition: "ADMIT" } };
      },
    }),
    /governed closure the forward packet index does not bind/,
  );
  assert.throws(
    withIdentity(closedKey, {
      row: asGovernedBatchClosure.row,
      forward: (row) => ({ ...asGovernedBatchClosure.forward(row), public_path: "/elsewhere.json" }),
    }),
    /publishes a governed packet the forward packet index does not bind/,
  );
  assert.throws(
    withIdentity(closedKey, {
      row: (row) => ({ ...asGovernedBatchClosure.row(row), admitted: true }),
      forward: asGovernedBatchClosure.forward,
    }),
    /claims admission/,
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
