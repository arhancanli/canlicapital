// Prove the two deployed surfaces serve the same critical evidence as this publication checkout.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(ROOT, "public");
const RECEIPT = resolve(ROOT, "artifacts/qa/live-publication-parity.json");
const ORIGINS = {
  main_site: "https://canlicapital.com",
  application: "https://app.canlicapital.com",
};
const PATHS = [
  "paper-state.json",
  "glassbox/alpaca_broker_reconciliation.json",
  "glassbox/track_record.json",
  "glassbox/program_status.json",
  "glassbox/trial_packet_manifest.json",
  "glassbox/trial_ledger.json",
  "glassbox/research.json",
  "glassbox/transparency_log.json",
  "glassbox/record_continuity.json",
  "glassbox/reproducibility.json",
  "glassbox/forward_evidence_maturity.json",
  "glassbox/accessibility_interaction_audit.json",
  "glassbox/research_accessibility_audit.json",
  "glassbox/external_publication_readiness.json",
  "glassbox/external_submission_plan.json",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

async function fetchEvidence(origin, path) {
  const response = await fetch(`${origin}/${path}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      "User-Agent": "CanliCapital-LiveEvidenceAudit/1.0",
    },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    bytes: bytes.length,
    sha256: sha256(bytes),
    etag: response.headers.get("etag"),
    last_modified: response.headers.get("last-modified"),
    response_date: response.headers.get("date"),
  };
}

const locals = Object.fromEntries(
  PATHS.map((path) => {
    const bytes = readFileSync(resolve(PUBLIC, path));
    return [path, { bytes: bytes.length, sha256: sha256(bytes) }];
  }),
);

const tasks = [];
for (const [surface, origin] of Object.entries(ORIGINS)) {
  for (const path of PATHS) tasks.push({ surface, origin, path });
}
const fetched = await Promise.all(
  tasks.map(async (task) => ({ ...task, evidence: await fetchEvidence(task.origin, task.path) })),
);
const remote = Object.fromEntries(Object.keys(ORIGINS).map((surface) => [surface, {}]));
for (const item of fetched) remote[item.surface][item.path] = item.evidence;

const files = PATHS.map((path) => {
  const local = locals[path];
  const main = remote.main_site[path];
  const app = remote.application[path];
  return {
    path,
    local,
    main_site: main,
    application: app,
    main_matches_local:
      main.ok && main.sha256 === local.sha256 && main.bytes === local.bytes,
    application_matches_local:
      app.ok && app.sha256 === local.sha256 && app.bytes === local.bytes,
    live_surfaces_match:
      main.ok && app.ok && main.sha256 === app.sha256 && main.bytes === app.bytes,
  };
});
const passed = files.every(
  (file) => file.main_matches_local && file.application_matches_local && file.live_surfaces_match,
);
const payload = {
  schema: "canli.live-publication-parity.v1",
  generated_at: new Date().toISOString(),
  origins: ORIGINS,
  files,
  summary: {
    files_checked: files.length,
    main_matches_local: files.filter((file) => file.main_matches_local).length,
    application_matches_local: files.filter((file) => file.application_matches_local).length,
    live_surfaces_match: files.filter((file) => file.live_surfaces_match).length,
    passed,
  },
  claim_boundary:
    `This receipt proves byte parity for ${PATHS.length} named critical files at the recorded HTTP responses. ` +
    "It does not prove broker freshness beyond the artifacts' own timestamps, the meaning of any " +
    "field, parity for unlisted files, search indexing, or future availability.",
};
payload.content_hash =
  "sha256:" + sha256(Buffer.from(JSON.stringify(canonicalize(payload))));
mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(RECEIPT, JSON.stringify(payload, null, 2) + "\n");
console.log(JSON.stringify({ ...payload.summary, receipt: RECEIPT, content_hash: payload.content_hash }, null, 2));
if (!passed) process.exit(1);
