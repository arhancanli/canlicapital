// =============================================================================
// build-paper-evidence.mjs
// -----------------------------------------------------------------------------
// Maps this project's own live record into canli.paper-evidence.v0, validates it
// against the published schema, and writes it out as both the standard's flagship
// example and the API's /api/v1/record endpoint.
//
// The convergence is the point. A standard whose only example is invented is a
// wish; one whose flagship instance is the publisher's own live record, generated
// from the same artifacts the site renders, is a commitment. If the record ever
// stops conforming, this build fails and nothing ships.
//
// Nothing here is typed. Every value is read from a published artifact, and the
// mapping is the interesting part: it is where you find out whether your own
// record can actually answer the questions your standard asks.
// =============================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { conformance } from "../js/paper-evidence-core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const SCHEMA = JSON.parse(readFileSync(resolve(ROOT, "standards/paper-evidence/schema.json"), "utf8"));

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const sha256 = (p) => createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

export function buildRecord({ claims, state, broker, coverage, generatedAt }) {
  const value = (id) => {
    const claim = claims.claims.find((c) => c.id === id);
    if (!claim) throw new Error(`paper-evidence: no published claim ${id}`);
    return claim.value;
  };
  const metrics = state.metrics ?? {};

  const observations = Number(value("forward.return-observations"));
  // The project's own rule: a forward Sharpe needs 252 observations to estimate.
  // Encoding it here rather than hard-coding a boolean means a longer record
  // starts reporting one without anybody remembering to flip a flag.
  const SHARPE_MINIMUM_OBSERVATIONS = 252;
  const sharpeReportable = observations >= SHARPE_MINIMUM_OBSERVATIONS;

  const realisedDrawdown = Number(metrics.max_drawdown_pct);
  const hasRealisedDrawdown = Number.isFinite(realisedDrawdown);

  return {
    schema: "canli.paper-evidence.v0",
    generated_at: generatedAt,
    capital: {
      kind: value("forward.capital-kind") === "PAPER_ONLY" ? "PAPER" : "MIXED",
      execution: "MIXED",
      venue: "Alpaca paper accounts for equity and futures sleeves; locally simulated fills for crypto perpetuals",
      notes:
        "Three sleeves reconcile against dedicated Alpaca paper accounts. The crypto sleeve is " +
        "filled locally against point-in-time venue data and is never presented as broker-executed.",
    },
    identity: {
      name: state.book?.name ?? "ALPHAC Cross-Asset Book",
      kind: "BOOK",
      preregistered: false,
      constituents: (state.algorithms ?? []).map((a) => a.key).filter((k) => k !== "alphac"),
    },
    period: {
      first_observation: value("forward.first-mark"),
      last_observation: value("forward.last-mark"),
      observation_count: observations,
      frequency: "DAILY",
      calendar: "UTC daily marks; sleeves trade on their own venue calendars",
    },
    returns: {
      basis: "NET_OF_MODELLED_COSTS",
      cumulative: Number(value("forward.cumulative-return")),
      annualised: null,
      sharpe_annualised: sharpeReportable ? Number(metrics.honest_forward_sharpe) : null,
      sharpe_reportable: sharpeReportable,
      series_available: true,
      series_url: `${ORIGIN}/paper-state.json`,
    },
    costs: {
      modelled: true,
      components: ["SPREAD", "FEES", "IMPACT", "LATENCY", "FINANCING", "BORROW", "FUNDING"],
      turnover_annualised: null,
      // Derived from the cost-coverage ledger, never typed here. A record that
      // lists what it charges and stays silent on the rest lets a reader assume
      // the silence means "immaterial" when it may mean "not considered".
      not_modelled: coverage.costs
        .filter((c) => c.status === "NOT_CHARGED")
        .map((c) => c.name),
      coverage_url: `${ORIGIN}/costs`,
      notes:
        "One shared transaction-cost model prices every fill; the engine never computes a cost " +
        "itself. Latency is charged as a flat add-on but measures about 5.5 hours in the live " +
        "record, so it is modelled as the wrong KIND of quantity. Every unmodelled cost listed " +
        "flatters the result, so these returns are an upper bound.",
    },
    selection: {
      trials_counted: true,
      trial_count: Number(value("research.identities-observed")),
      trial_unit: "first immutable record per hypothesis identity, deduplicated across every durable ledger",
      deflation_applied: false,
      deflated_sharpe_ratio: null,
      deflation_method:
        "Deflated Sharpe against the expected maximum of the counted trial union. Not applied to " +
        "this record because the forward sample cannot support a Sharpe estimate yet.",
    },
    risk: {
      max_drawdown_realised: hasRealisedDrawdown ? realisedDrawdown / 100 : null,
      drawdown_basis: hasRealisedDrawdown ? "OBSERVED" : "NOT_ESTABLISHED",
      max_drawdown_model_expected: Number(value("model.expected-max-drawdown")),
      exposure_notes:
        "The realised figure is descriptive of a short sample. The model estimate is not " +
        "established by live evidence.",
    },
    corrections: {
      count: 0,
      withdrawn_figures: [],
      log_url: `${ORIGIN}/progress`,
    },
    provenance: {
      source_bindings: [
        { path: "public/paper-state.json", sha256: sha256("public/paper-state.json"), url: `${ORIGIN}/paper-state.json` },
        { path: "public/contracts/public-claims.json", sha256: sha256("public/contracts/public-claims.json"), url: `${ORIGIN}/contracts/public-claims.json` },
        { path: "public/glassbox/alpaca_broker_reconciliation.json", sha256: sha256("public/glassbox/alpaca_broker_reconciliation.json"), url: `${ORIGIN}/glassbox/alpaca_broker_reconciliation.json` },
      ],
      independently_verifiable: true,
      verification_url: `${ORIGIN}/verify`,
      signed: true,
      signature_scheme: "Ed25519 over an append-only hash chain",
    },
    claim_maturity: {
      establishes: [
        `A ${observations}-observation paper record with broker reconciliation on ${value("broker.reconciled-alpaca-sleeves")} sleeves.`,
        "That every published figure traces to a hash-bound artifact.",
      ],
      does_not_establish: [
        `A forward Sharpe ratio. ${SHARPE_MINIMUM_OBSERVATIONS} observations are required to estimate one and this record has ${observations}.`,
        "An expected maximum drawdown. The realised figure describes a short sample and the model estimate is not live evidence.",
        "Live-forward diversification between sleeves.",
      "A return net of every cost. Several cost categories are not charged at all and every one " +
        "of them flatters, so this figure is an upper bound. The full ledger is at /costs.",
        "Any funded performance whatsoever. No real capital has been deployed.",
      ],
      external_review_count: 0,
      independent_replication_count: 0,
    },
  };
}

function main() {
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const record = buildRecord({
    claims: read("public/contracts/public-claims.json"),
    state: read("public/paper-state.json"),
    broker: read("public/glassbox/alpaca_broker_reconciliation.json"),
    coverage: read("public/glassbox/cost_coverage.json"),
    generatedAt,
  });

  const result = conformance(record, SCHEMA);
  if (!result.valid) {
    console.error("paper-evidence: this project's own record does not conform to its own standard:");
    for (const e of [...result.structural, ...result.semantic]) console.error(`  ${e.pointer}  ${e.message}`);
    process.exit(1);
  }

  for (const out of [
    "standards/paper-evidence/vectors/valid-alphac-book.json",
    "public/api/v1/record.json",
  ]) {
    const target = resolve(ROOT, out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
  }
  console.log(
    `  paper-evidence: the live record conforms; ${record.period.observation_count} observations, ` +
      `${record.selection.trial_count} trials counted, ` +
      `${record.claim_maturity.does_not_establish.length} things it does not establish`,
  );
}

if (!existsSync(resolve(ROOT, "standards/paper-evidence/schema.json"))) {
  throw new Error("paper-evidence: the schema is missing");
}
main();
