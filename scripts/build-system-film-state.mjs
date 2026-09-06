import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "public/system-films/state.json");

const sources = {
  engine: {
    file: "public/glassbox/trial_ledger.json",
    url: "/glassbox/trial_ledger.json",
    claims: "/trials",
  },
  broker: {
    file: "public/glassbox/alpaca_broker_reconciliation.json",
    url: "/glassbox/alpaca_broker_reconciliation.json",
    claims: "/measurements/alpaca-broker-reconciliation",
  },
  record: {
    file: "public/glassbox/transparency_log.json",
    url: "/glassbox/transparency_log.json",
    claims: "/verify",
  },
};

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadSource(key) {
  const source = sources[key];
  const path = resolve(ROOT, source.file);
  const bytes = await readFile(path);
  const data = JSON.parse(bytes);
  requireValue(data.generated_at, `${source.file} has no generated_at timestamp`);
  return {
    data,
    binding: {
      artifact_url: source.url,
      claim_url: source.claims,
      generated_at: data.generated_at,
      sha256: digest(bytes),
    },
  };
}

const [engine, broker, record] = await Promise.all([
  loadSource("engine"),
  loadSource("broker"),
  loadSource("record"),
]);

requireValue(Number.isInteger(engine.data.distinct_hypothesis_identities), "trial ledger identity count is missing");
requireValue(Number.isInteger(engine.data.immutable_execution_records), "trial ledger execution count is missing");
requireValue(Number.isInteger(engine.data.budget_remaining), "trial ledger budget remaining is missing");
requireValue(typeof broker.data.summary?.passes === "boolean", "broker reconciliation pass state is missing");
requireValue(Number.isInteger(broker.data.summary?.reconciled_alpaca_sleeves), "broker sleeve count is missing");
requireValue(Number.isInteger(record.data.entry_count), "transparency entry count is missing");
requireValue(record.data.head?.chain_hash, "transparency chain head is missing");

const snapshotAt = [engine, broker, record]
  .map(({ data }) => data.generated_at)
  .sort()
  .at(-1);
const brokerRailOrder = ["alphamax", "managed_futures", "alphavintage"];

const payload = {
  schema: "canli.system-films-state.v1",
  snapshot_at: snapshotAt,
  claim_boundary: "Observed public artifacts only. These films visualize state and provenance, not returns, funded execution, or investment performance.",
  films: [
    {
      id: "engine",
      ordinal: "01",
      title: "The engine is testing",
      basis: "OBSERVED RESEARCH ACCOUNTING",
      timestamp: engine.data.generated_at,
      status: String(engine.data.research_status || "STATUS UNAVAILABLE").replaceAll("_", " "),
      source: engine.binding,
      metrics: [
        { label: "Hypothesis identities", value: engine.data.distinct_hypothesis_identities },
        { label: "Immutable executions", value: engine.data.immutable_execution_records },
        { label: "Budget remaining", value: engine.data.budget_remaining },
      ],
      transcript: [
        "Candidate mechanisms enter without a result attached.",
        "A hypothesis identity freezes before its execution is counted.",
        "Immutable records accumulate while the preregistered budget remains visible.",
      ],
    },
    {
      id: "broker",
      ordinal: "02",
      title: "The broker is observed",
      basis: "OBSERVED ALPACA PAPER STATE",
      timestamp: broker.data.generated_at,
      status: broker.data.summary.passes === true ? "RECONCILIATION PASS" : "RECONCILIATION OPEN",
      source: broker.binding,
      metrics: [
        { label: "Paper sleeves", value: broker.data.summary.reconciled_alpaca_sleeves },
        { label: "Open positions", value: broker.data.summary.open_positions },
        { label: "Open orders", value: broker.data.summary.open_orders },
      ],
      rails: brokerRailOrder
        .filter((id) => broker.data.sleeves?.[id])
        .map((id) => ({
          id,
          capital_kind: broker.data.sleeves[id].capital_kind,
          passes: broker.data.sleeves[id].passes === true,
        })),
      transcript: [
        "Three dedicated paper sleeves enter as separate execution rails.",
        "Aggregate positions and orders are observed without exposing account identifiers or holdings.",
        "The reconciliation state resolves from the published broker artifact.",
      ],
    },
    {
      id: "record",
      ordinal: "03",
      title: "The record is sealed",
      basis: "OBSERVED SIGNED PUBLIC RECORD",
      timestamp: record.data.head.generated_at,
      status: "SIGNED HEAD PUBLISHED",
      source: record.binding,
      metrics: [
        { label: "Signed entries", value: record.data.entry_count },
        { label: "Disclosed payloads", value: record.data.payload_disclosure?.disclosed_entries || 0 },
        { label: "Head sequence", value: record.data.head.seq },
      ],
      head_hash_prefix: String(record.data.head.chain_hash).slice(0, 16),
      transcript: [
        "Published states join an append-only sequence.",
        "Each visible node binds to the previous chain hash.",
        "The current signed head resolves with its timestamp and short hash prefix.",
      ],
    },
  ],
};

const serialized = `${JSON.stringify(payload, null, 2)}\n`;
requireValue(!/PA[0-9A-Z]{8,}/.test(serialized), "sanitized film state contains an Alpaca account identifier");
requireValue(!/(api[_ -]?secret|secret[_ -]?key|private[_ -]?key)/i.test(serialized), "sanitized film state contains a secret-shaped field");

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, serialized);
console.log(`built ${payload.films.length} sanitized system film states -> ${OUTPUT.replace(`${ROOT}/`, "")}`);
