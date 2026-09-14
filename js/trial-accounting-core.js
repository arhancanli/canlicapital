const LEDGER_SCHEMA = "glassbox.trial-ledger/2";
const MANIFEST_SCHEMA = "canli.alphac-trial-packet-manifest.v2";
const INDEX_SCHEMA = "canli.alphac-identity-trial-packet-index.v2";
const PROSPECTIVE_SCHEMA = "canli.alphac-public-prospective-trial-record.v1";
const REGISTER_SCHEMA = "canli.alphac-prospective-epoch-register.v1";
const REGISTER_GOVERNED = "GOVERNED_SERIAL_PACKET_CLOSED";

const STATUS = Object.freeze({
  LEGACY_COMPLETE: "legacy_complete_packet",
  LEGACY_INCOMPLETE: "legacy_incomplete_packet",
  PROSPECTIVE_FINAL_INCOMPLETE: "prospective_final_incomplete_not_admitted",
  PROSPECTIVE_UNCLOSED: "prospective_reserved_measured_unclosed",
});

// A prospective identity that was reserved and measured but never closed with a packet. Every
// one of these sits in selection N like any other identity; none has a public evidence page yet.
function registerIdentity(row, family) {
  requireCondition(row.admitted === false, `Register row ${row.hypothesis_key} claims admission`);
  requireCondition(row.packet_complete === false, `Register row ${row.hypothesis_key} claims a packet`);
  return {
    hypothesis_key: row.hypothesis_key,
    config_hash: row.config_hash,
    label: row.return_identity_id || row.hypothesis_key,
    family_key: row.family_trial_account || "unreserved",
    family_title: family?.title || row.family_trial_account || "No reservation on file",
    sleeve: family?.sleeve || "Prospective research",
    first_recorded_at: row.first_measurement?.recorded_at || null,
    ledger_profile: row.ledger_path,
    measurement: {
      observations: row.first_measurement?.n_obs ?? null,
      annualized_sharpe: row.first_measurement?.sharpe_ann ?? null,
      skew: null,
      kurtosis: null,
      deflated_sharpe_ratio: null,
    },
    status: STATUS.PROSPECTIVE_UNCLOSED,
    packet_complete: false,
    admitted: false,
    source_epoch: "prospective",
    verified_sections: [],
    missing_sections: ["closing_packet"],
    packet_status: row.status,
    packet_path: null,
    public_page: null,
    family_paper: null,
    blockers: [{ code: row.status, required_section: "closing_packet" }],
    reservation_ordinal: row.reservation_ordinal,
    disposition: row.final_disposition || "UNCLOSED",
    source_kind: row.source?.kind || "canonical",
  };
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireUnique(values, label) {
  requireCondition(new Set(values).size === values.length, `${label} are not unique`);
}

function legacyIdentity(identity, packetByKey) {
  const packet = packetByKey.get(identity.hypothesis_key);
  requireCondition(packet, `Packet index is missing ${identity.hypothesis_key}`);
  requireCondition(
    packet.packet_content_hash === identity.identity_packet_content_hash &&
      packet.research_family_key === identity.research_family_key,
    `Packet index binding mismatch for ${identity.hypothesis_key}`,
  );
  const complete = identity.coverage_status === "COMPLETE";
  requireCondition(
    packet.complete === complete,
    `Packet completeness mismatch for ${identity.hypothesis_key}`,
  );
  return {
    hypothesis_key: identity.hypothesis_key,
    config_hash: identity.config_hash,
    label: identity.label,
    family_key: identity.research_family_key,
    family_title: identity.research_family_title,
    sleeve: identity.sleeve_context,
    first_recorded_at: identity.first_recorded_at,
    ledger_profile: identity.ledger_profile,
    measurement: identity.measurement,
    status: complete ? STATUS.LEGACY_COMPLETE : STATUS.LEGACY_INCOMPLETE,
    packet_complete: complete,
    admitted: false,
    source_epoch: "legacy",
    verified_sections: identity.verified_sections,
    missing_sections: identity.missing_sections,
    packet_status: identity.identity_packet_status,
    packet_path: packet.public_path,
    public_page: `/trials/${identity.hypothesis_key}`,
    family_paper: identity.verified_family_paper_path?.replace(/\.md$/, "") || null,
    blockers: identity.completion_assessment?.blockers || [],
  };
}

function prospectiveIdentity(record, family) {
  const identity = record.identity;
  requireCondition(record.packet?.complete === true, "Prospective evidence accounting is incomplete");
  requireCondition(record.decision?.admitted === false, "Prospective source unexpectedly claims admission");
  requireCondition(
    record.gate_assessment?.admission_status === "INCOMPLETE_NOT_ADMITTED",
    "Prospective admission boundary drifted",
  );
  return {
    hypothesis_key: identity.hypothesis_key,
    config_hash: identity.config_hash,
    label: identity.return_identity_id,
    family_key: identity.family_trial_account,
    family_title: family?.title || identity.family_trial_account,
    sleeve: family?.sleeve || "Prospective research",
    first_recorded_at: null,
    ledger_profile: "prospective reservation",
    measurement: {
      observations: record.metrics.daily_observations,
      annualized_sharpe: record.metrics.annualized_daily_sharpe,
      skew: null,
      kurtosis: null,
      deflated_sharpe_ratio: record.metrics.deflated_sharpe_ratio,
    },
    status: STATUS.PROSPECTIVE_FINAL_INCOMPLETE,
    packet_complete: true,
    admitted: false,
    source_epoch: "prospective",
    verified_sections: [],
    missing_sections: record.gate_assessment.not_evaluated,
    packet_status: record.packet.packet_status,
    packet_path: record.public_paths.identity_packet,
    public_page: "/measurements/prospective-trial-record",
    family_paper: record.public_paths.paper,
    blockers: record.gate_assessment.not_evaluated.map((gate) => ({
      code: "NOT_EVALUATED",
      required_section: gate,
    })),
    reservation_ordinal: identity.reservation_ordinal,
    disposition: record.decision.disposition,
  };
}

export function buildTrialUnion(ledger, manifest, packetIndex, prospective, register) {
  requireCondition(ledger?.schema === LEDGER_SCHEMA, "Trial ledger schema mismatch");
  requireCondition(manifest?.schema === MANIFEST_SCHEMA, "Trial manifest schema mismatch");
  requireCondition(packetIndex?.schema === INDEX_SCHEMA, "Trial packet index schema mismatch");
  requireCondition(prospective?.schema === PROSPECTIVE_SCHEMA, "Prospective record schema mismatch");
  requireCondition(register?.schema === REGISTER_SCHEMA, "Prospective epoch register schema mismatch");
  requireCondition(
    ledger.immutable_execution_records -
      ledger.window_only_remeasurements -
      ledger.cross_profile_duplicate_identities ===
      ledger.distinct_hypothesis_identities,
    "Trial accounting equation does not reconcile",
  );
  requireCondition(
    ledger.selection_statistics.n_hypotheses === ledger.distinct_hypothesis_identities &&
      ledger.selection_statistics.unit === "first_immutable_record_per_hypothesis",
    "Selection statistics do not use the complete identity union",
  );
  requireCondition(
    manifest.identities.length === manifest.summary.distinct_hypothesis_identities &&
      packetIndex.packets.length === packetIndex.summary.published_identity_packets &&
      manifest.summary.published_identity_packets === packetIndex.summary.published_identity_packets,
    "Legacy packet counts do not reconcile",
  );
  // The prospective epoch is every identity measured after the legacy closure. Until
  // 2026-09-14 it was one identity, and this check read the single record; it now reads the
  // derived register, so a second checkout's measurements cannot hide from selection N again.
  const epoch = register.summary;
  requireCondition(
    epoch.identity_arithmetic_holds === true &&
      register.identities.length === epoch.observed_identities &&
      epoch.legacy_retired_identities === manifest.summary.distinct_hypothesis_identities,
    "Prospective epoch register does not reconcile with the legacy manifest",
  );
  requireCondition(
    manifest.summary.distinct_hypothesis_identities + epoch.observed_identities ===
      ledger.distinct_hypothesis_identities,
    "Legacy plus prospective identities do not equal selection N",
  );
  requireCondition(
    epoch.latest_reservation_ordinal === ledger.distinct_hypothesis_identities &&
      epoch.union_identities === ledger.distinct_hypothesis_identities &&
      prospective.epoch?.observed_identities === epoch.observed_identities,
    "Prospective epoch is not bound to current selection N",
  );
  const governedRow = register.identities.find(
    (row) => row.hypothesis_key === prospective.identity.hypothesis_key,
  );
  requireCondition(
    governedRow?.status === REGISTER_GOVERNED &&
      governedRow.reservation_ordinal === prospective.identity.reservation_ordinal &&
      prospective.metrics.union_hypothesis_identities === prospective.identity.reservation_ordinal,
    "Governed prospective identity is not the register's closed serial packet",
  );
  requireCondition(
    register.identities.filter((row) => row.status === REGISTER_GOVERNED).length ===
      prospective.identity.hypotheses_spent,
    "Governed packet count does not match the prospective record",
  );

  requireUnique(manifest.identities.map((identity) => identity.hypothesis_key), "Legacy keys");
  requireUnique(packetIndex.packets.map((packet) => packet.hypothesis_key), "Packet keys");
  const packetByKey = new Map(packetIndex.packets.map((packet) => [packet.hypothesis_key, packet]));
  const familyByKey = new Map(
    manifest.research_families.map((family) => [family.research_family_key, family]),
  );
  const identities = manifest.identities.map((identity) => legacyIdentity(identity, packetByKey));
  for (const row of register.identities) {
    if (row.hypothesis_key === prospective.identity.hypothesis_key) {
      identities.push(
        prospectiveIdentity(
          prospective,
          familyByKey.get(prospective.identity.family_trial_account),
        ),
      );
    } else {
      identities.push(registerIdentity(row, familyByKey.get(row.family_trial_account)));
    }
  }
  requireUnique(identities.map((identity) => identity.hypothesis_key), "Union keys");

  const familyCounts = new Map();
  for (const identity of identities) {
    const current = familyCounts.get(identity.family_key) || {
      family_key: identity.family_key,
      title: identity.family_title,
      sleeve: identity.sleeve,
      identities: 0,
      legacy_complete: 0,
      legacy_incomplete: 0,
      prospective: 0,
    };
    current.identities += 1;
    if (identity.status === STATUS.LEGACY_COMPLETE) current.legacy_complete += 1;
    else if (identity.status === STATUS.LEGACY_INCOMPLETE) current.legacy_incomplete += 1;
    else current.prospective += 1;
    familyCounts.set(identity.family_key, current);
  }
  const families = [...familyCounts.values()].sort(
    (left, right) => right.identities - left.identities || left.title.localeCompare(right.title),
  );
  requireCondition(
    families.reduce((total, family) => total + family.identities, 0) === identities.length,
    "Family counts do not cover the complete union",
  );

  return {
    identities,
    families,
    facts: {
      immutable_execution_records: ledger.immutable_execution_records,
      window_only_remeasurements: ledger.window_only_remeasurements,
      cross_profile_duplicate_identities: ledger.cross_profile_duplicate_identities,
      selection_n: ledger.distinct_hypothesis_identities,
      selection_variance: ledger.selection_statistics.sharpe_variance,
      budget: ledger.hypothesis_identity_budget,
      budget_remaining: ledger.budget_remaining,
      legacy_identities: manifest.summary.distinct_hypothesis_identities,
      legacy_complete_packets: manifest.summary.complete_trial_packets,
      legacy_incomplete_packets: manifest.summary.incomplete_trial_packets,
      prospective_identities: epoch.observed_identities,
      prospective_governed_packets: prospective.identity.hypotheses_spent,
      prospective_unclosed: epoch.observed_identities - prospective.identity.hypotheses_spent,
      prospective_admitted: prospective.decision.admitted || epoch.admitted_identities > 0,
      prospective_latest_reservation_ordinal: epoch.latest_reservation_ordinal,
    },
    claim_boundary: ledger.claim_boundary,
  };
}

export function filterTrialUnion(union, filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase();
  const family = String(filters.family || "all");
  const status = String(filters.status || "all");
  const sleeve = String(filters.sleeve || "all");
  return union.identities.filter((identity) => {
    if (family !== "all" && identity.family_key !== family) return false;
    if (status !== "all" && identity.status !== status) return false;
    if (sleeve !== "all" && identity.sleeve !== sleeve) return false;
    if (!query) return true;
    return [
      identity.hypothesis_key,
      identity.config_hash,
      identity.label,
      identity.family_title,
      identity.sleeve,
    ].some((value) => String(value || "").toLocaleLowerCase().includes(query));
  });
}

export const TRIAL_UNION_STATUS = STATUS;
