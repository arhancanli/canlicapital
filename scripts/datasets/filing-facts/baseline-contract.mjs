// Offline preparation only. Reuse the PR343 sampler and evidence runner.
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";

import { canonicalJson } from "../../canonical-json.mjs";
import { SCORING_VERSION, stratifiedSample } from "./eval.mjs";
import { auditEvidence, evaluateCapture, readDataset, SCORING_SOURCE_FILES, sha256 } from "./evidence.mjs";

export const BASELINE_SCHEMA = "canli.filing-facts-baseline-contract.v1";
export const QUESTIONS_SCHEMA = "canli.filing-facts-baseline-questions.v1";
export const FIXTURE_PURPOSE = "synthetic-software-fixture";
export const V0_DIRECTORY = "public/datasets/filing-facts/v0";
export const V0_SHA256 = Object.freeze({
  "SHA256SUMS": "b54dca812414ede42ab7258dbb83fa3c041a71a4ff5223691b3dc2c00525e1d8",
  "ff-eval-closed.json": "450bff2b316adf5e8f4562d4cacdceca143c6b10ed657ecefa02af24e4c95720",
  "ff-eval-mcp.json": "50a88c0c383ac492a8c1c2d489a1c5830c478a71ae7bab7660fd2878a73cb6c6",
  "filing-facts-v0.jsonl": "c01b9e3e660ff341017532718e6bc8f7fe96d1ffa68d86236c53e73ae3149d7d",
  "gold-packet-v0.json": "91c6f960e34509653800a4cda81bd0632dd58c889ee78eb6461a985765500413",
});
const DIRECTORY = "scripts/datasets/filing-facts";
const PLAN_SOURCES = ["baseline-contract.mjs", "baseline-contract-cli.mjs", "BASELINE.md"];
const CONTEXT = ["public/research/filing-facts-v0.md", `${DIRECTORY}/README.md`, `${DIRECTORY}/EVALUATION.md`];
const digest = (value) => sha256(canonicalJson(value));
const pin = (bytes) => ({ bytes: bytes.length, sha256: sha256(bytes) });
const read = (root, path) => readFileSync(join(root, path));

export function createBaselineContract(root) {
  const v0 = Object.fromEntries(Object.entries(V0_SHA256).map(([name, expected]) => {
    const bytes = read(root, `${V0_DIRECTORY}/${name}`);
    if (sha256(bytes) !== expected) throw new RangeError(`historical V0 bytes changed: ${name}`);
    return [name, pin(bytes)];
  }));
  const dataset = readDataset(read(root, `${V0_DIRECTORY}/filing-facts-v0.jsonl`));
  const sample = stratifiedSample(dataset.items, 3, 20261001);
  const templateCounts = Object.fromEntries([...new Set(sample.map((item) => item.template))].sort()
    .map((template) => [template, sample.filter((item) => item.template === template).length]));
  if (sample.length !== 15 || Object.keys(templateCounts).length !== 5 || Object.values(templateCounts).some((n) => n !== 3)) {
    throw new RangeError("pipeline smoke contract requires exactly three items from each of the five V0 templates");
  }
  const sources = Object.fromEntries([...SCORING_SOURCE_FILES, ...PLAN_SOURCES].map((relative) => {
    const path = normalize(join(DIRECTORY, relative));
    const bytes = read(root, path);
    if (!bytes.equals(readFileSync(new URL(relative, import.meta.url)))) {
      throw new RangeError(`loaded preparation/scoring source differs from supplied checkout: ${path}`);
    }
    return [path, pin(bytes)];
  }));
  const legacy = Object.fromEntries(["ff-eval-closed.json", "ff-eval-mcp.json"].map((name) => {
    const audit = auditEvidence(read(root, `${V0_DIRECTORY}/filing-facts-v0.jsonl`), JSON.parse(read(root, `${V0_DIRECTORY}/${name}`)));
    if (audit.status !== "unrescorable" || audit.raw_answers_present !== 0) throw new RangeError("unexpected historical baseline evidence");
    return [name, { status: audit.status, runs: audit.runs, raw_answers_present: audit.raw_answers_present,
      parsing_change_effect: "unmeasured" }];
  }));
  const gold = JSON.parse(read(root, `${V0_DIRECTORY}/gold-packet-v0.json`));
  const bindings = sample.map((item) => ({
    id: item.id, template: item.template, company_cik: item.company.cik,
    question_sha256: sha256(item.question), item_sha256: digest(item),
    expected_sha256: digest(item.answer), cited_facts_sha256: digest(item.facts),
    cited_filing_urls: [...new Set(item.facts.map((fact) => fact.url))].sort(),
    source_availability: "unverified",
    absence_coverage: item.template === "unanswerable" ? "full annual concept history required; one earliest cited row does not prove completeness" : "not an absence task",
  }));
  const contract = {
    schema: BASELINE_SCHEMA,
    purpose: "pipeline-smoke-preparation",
    execution: { status: "unassigned", provider: null, model: null, price: null, resource: null, hold: null,
      model_calls_authorized: false, admission: "separate fresh lead/127f financial and usable-model review required" },
    dataset: { canonical: "https://canlicapital.com/research/filing-facts-v0", directory: V0_DIRECTORY,
      items: dataset.items.length, sha256: dataset.sha256, files: v0 },
    context: Object.fromEntries(CONTEXT.map((path) => [path, pin(read(root, path))])),
    historical_baselines: legacy,
    annotation: { packet_rows: gold.labels.length, completed_packet_rows: gold.labels.filter((row) =>
      Object.keys(gold.judgements).every((field) => gold.judgements[field].includes(row[field]))).length,
    authenticated_expert_review: false },
    sampling: { method: "stratified", seed: 20261001, per_template: 3,
      item_ids: sample.map((item) => item.id), items: sample.length, by_template: templateCounts,
      role: "software pipeline smoke; no model ranking, statistical power or held-out expert-gold claim" },
    bindings,
    implementation: { scoring_version: SCORING_VERSION, sources },
    arms: {
      closed: { capture_arm: "closed", status: "held", source_access: "question only",
        tool_contract: "forbidden", tool_calls: 0, tool_trace: "empty; no source context or source contract" },
      source_assisted: { capture_arm: null, status: "held",
        source_access: "identical immutable source bundle as MCP for every selected question",
        reason: "PR343 capture schema has no separate source-assisted arm; reviewed adapter/schema required before execution" },
      mcp: { capture_arm: "mcp", status: "held", source_access: "identical immutable source bundle as source-assisted",
        reason: "server/tool contract and exact source availability must be pinned before execution" },
    },
    comparison: {
      questions: "same ordered item IDs and question bytes in every arm; expected answers excluded from prompts",
      model: "same provider/model/version and generation settings in every compared arm",
      source_parity: "source-assisted and MCP must expose the same immutable source bytes, coverage and truncation policy",
      cohort: "freeze source availability and complete comparison cohort before requests; never trim failures or missing answers afterwards",
      closed_vs_assisted: "measures source access plus the workflow; does not isolate an MCP transport effect",
      source_proof: "V0 selected facts/accession URLs do not establish a complete provider or server source snapshot",
    },
    capture_requirements: {
      reuse: "canli.filing-facts-answer-capture.v1 and canli.filing-facts-evaluation.v1; replay-evaluation.mjs is authoritative",
      per_item: ["raw response_text or null", "error or null", "provider response IDs and observed model", "raw provider usage or explicitly unavailable",
        "raw tool arguments/results and truncation", "every request/retry attempt, including failed attempts",
        "attempt start/completion timestamps and elapsed latency", "measured billed cost or null with reason and pinned price basis"],
      denominators: "all 15 selected items, including missing captures, missing responses, request errors and no final answers",
      usage_cost_latency: "missing measurements are null with explicit coverage; never zero-fill or report a partial total as complete",
      retries: "include attempts, tokens, cost and elapsed time from errors/retries; no success-only averages",
      admission: "current eval.mjs lacks per-attempt latency/cost/retry records; a reviewed measurement adapter is required",
      financial: "fresh wallet and usable existing model, shared $6 total tax-only cash guard, $2 reviewed job hold, $20 credit margin; no allocation in this contract",
    },
    limitations: [
      "This is an offline preparation artifact. No model was called, provider result authenticated, resource allocated or financial hold created.",
      "V0 is machine-generated/checked XBRL evidence, not human-verified filing truth or authenticated expert gold; tagging errors may enter answers.",
      "Historical V0 scores remain unrescorable and byte-unchanged; no raw answers may be reconstructed from expected, parsed or correct fields.",
      "Public V0 questions may have appeared in training; this sample is not a held-out benchmark or a model-ranking study.",
      "Use only cleared original questions, numeric facts and filing identifiers. The historical card's blanket public-domain wording does not clear rendered issuer filings or vendor rows.",
      "Annual XBRL absence is narrower than absence from all rendered filings; complete captured concept history is still unverified.",
    ],
  };
  return { ...contract, contract_sha256: digest(contract) };
}

export function auditBaselineContract(root, contract) {
  const expected = createBaselineContract(root);
  if (canonicalJson(contract) !== canonicalJson(expected)) throw new RangeError("baseline contract does not match exact sources, context, bindings and deterministic smoke cohort");
  return { status: "verified-offline-plan", contract_sha256: contract.contract_sha256,
    items: contract.sampling.items, model_calls_authorized: false, expert_gold: false };
}

export function projectQuestions(root, contract) {
  auditBaselineContract(root, contract);
  const items = new Map(readDataset(read(root, `${V0_DIRECTORY}/filing-facts-v0.jsonl`)).items.map((item) => [item.id, item]));
  return { schema: QUESTIONS_SCHEMA, purpose: "pipeline-smoke-question-projection", contract_sha256: contract.contract_sha256,
    model_calls_authorized: false,
    questions: contract.sampling.item_ids.map((id) => ({ id, question: items.get(id).question })) };
}

// A fixture audit exercises the existing scorer without admitting a real run or inventing measurements.
export function auditBaselineFixture(root, contract, capture) {
  auditBaselineContract(root, contract);
  if (capture.purpose !== FIXTURE_PURPOSE || capture.baseline_contract_sha256 !== contract.contract_sha256) {
    throw new RangeError("unassigned offline plan accepts only explicitly labelled contract-bound synthetic fixtures, never model baselines");
  }
  if (capture.arm !== "closed") throw new RangeError("source/MCP fixture admission remains held until immutable source parity is established");
  if (capture.source_contract !== undefined || capture.source_context !== undefined || capture.source_bundle !== undefined) {
    throw new RangeError("closed fixture cannot contain source-assisted metadata or source context");
  }
  if (canonicalJson(capture.sampling) !== canonicalJson({ method: "stratified", seed: contract.sampling.seed,
    per_template: contract.sampling.per_template, item_ids: contract.sampling.item_ids })) {
    throw new RangeError("fixture must retain the entire predeclared smoke cohort");
  }
  const evidence = evaluateCapture(read(root, `${V0_DIRECTORY}/filing-facts-v0.jsonl`), capture);
  const replay = auditEvidence(read(root, `${V0_DIRECTORY}/filing-facts-v0.jsonl`), evidence);
  return { status: "synthetic-fixture-replayed", purpose: FIXTURE_PURPOSE, model_baseline: false,
    contract_sha256: contract.contract_sha256, replay, coverage: evidence.summary.coverage,
    measurement_status: "synthetic fixture; no observed provider usage, cost or latency claimed" };
}
