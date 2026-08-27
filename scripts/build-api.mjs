// =============================================================================
// build-api.mjs
// -----------------------------------------------------------------------------
// Generates the public read API at /api/v1 as STATIC JSON.
//
// WHY STATIC. The Codex plan requires that no public endpoint can reach a broker
// credential, a research database or a write path, and that the publisher exports
// an allowlisted snapshot into a separate public read plane. A generated file IS
// that snapshot, with the property enforced by construction rather than by
// configuration: there is no server, so there is nothing to misconfigure. It also
// caches perfectly and can be cited by URL, which an always-on stream cannot.
//
// EVERY RESPONSE CARRIES ITS OWN LIMITS. The envelope states the schema version,
// when it was generated, which artifacts it came from with their hashes, what
// class of claim it is, and the human page that explains it. A number without
// those is the thing this project exists not to publish, and an API is the
// easiest place in a site to forget them, because nobody reads an API by eye.
// =============================================================================

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public", "api", "v1");
const ORIGIN = "https://canlicapital.com";
const VERSION = "v1";

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const sha256 = (p) => `sha256:${createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex")}`;

const claims = read("public/contracts/public-claims.json");
const state = read("public/paper-state.json");
const broker = read("public/glassbox/alpaca_broker_reconciliation.json");
const chain = read("public/glassbox/transparency_log.json");
const trials = read("public/glassbox/trial_ledger.json");
const kills = read("public/glassbox/kill_log.json");
const research = read("public/research-index.json");

const claim = (id) => {
  const found = claims.claims.find((c) => c.id === id);
  if (!found) throw new Error(`api: no published claim ${id}`);
  return found;
};
const value = (id) => claim(id).value;

const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

//: One line per endpoint. The build refuses if an endpoint has none, so a route
//: cannot ship undocumented.
const ENDPOINT_SUMMARIES = {
  status: "Current state of the paper record: capital kind, period, observation count, validation status and broker reconciliation.",
  record: "The full record as an instance of the canli.paper-evidence.v0 open standard, including what it does not establish.",
  sleeves: "Per-sleeve state. Note that the research curves are not on a common date grid and cannot be combined.",
  "trials/summary": "The trial union used as the multiple-testing denominator, plus the kill counts.",
  research: "Every published research document and topic, including failures and feasibility nulls.",
  "chain/head": "The head of the signed append-only transparency chain, and the public key needed to verify it.",
};

/**
 * The envelope. Every endpoint returns one, and the fields are required rather
 * than conventional: `claim_class` and `limits` are the two an API most easily
 * omits and the two a consumer most needs.
 */
function envelope({ endpoint, claimClass, sources, humanPage, limits, data }) {
  if (!limits?.length) throw new Error(`api: ${endpoint} declares no limits`);
  return {
    schema: `canli.api.${VERSION}`,
    endpoint: `/api/${VERSION}/${endpoint}`,
    generated_at: generatedAt,
    claim_class: claimClass,
    capital_kind: value("forward.capital-kind"),
    canonical_human_page: humanPage,
    limits,
    sources: sources.map((p) => ({ path: p, sha256: sha256(p), url: `${ORIGIN}/${p.replace(/^public\//, "")}` })),
    data,
  };
}

const ENDPOINTS = {
  status: envelope({
    endpoint: "status",
    claimClass: "OBSERVED",
    sources: ["public/contracts/public-claims.json", "public/glassbox/alpaca_broker_reconciliation.json"],
    humanPage: `${ORIGIN}/performance`,
    limits: [
      "Paper execution only. No funded performance is represented anywhere in this API.",
      "A passing broker reconciliation means the paper accounts agree with the published record, not that a strategy works.",
    ],
    data: {
      capital_kind: value("forward.capital-kind"),
      first_observation: value("forward.first-mark"),
      last_observation: value("forward.last-mark"),
      return_observations: value("forward.return-observations"),
      validation_status: value("forward.validation-status"),
      internal_grade: value("validation.internal-grade"),
      sleeves_current: value("sleeves.current"),
      sleeves_target: value("sleeves.target"),
      broker_reconciled_sleeves: value("broker.reconciled-alpaca-sleeves"),
      broker_reconciliation_passes: value("broker.reconciliation-passes"),
    },
  }),

  sleeves: envelope({
    endpoint: "sleeves",
    claimClass: "OBSERVED",
    sources: ["public/paper-state.json", "public/glassbox/alpaca_broker_reconciliation.json"],
    humanPage: `${ORIGIN}/systems`,
    limits: [
      "Sleeve curves are decimated for display and are NOT on a common date grid, so they cannot be combined into a composite by a consumer.",
      "Equity figures are paper-account balances.",
    ],
    data: {
      count: (state.algorithms ?? []).filter((a) => a.key !== "alphac").length,
      composite_key: "alphac",
      sleeves: (state.algorithms ?? []).map((a) => {
        const b = broker.sleeves?.[a.key];
        const curve = a.research_curve ?? [];
        return {
          key: a.key,
          is_composite: a.key === "alphac",
          broker_reconciled: Boolean(b?.passes),
          open_positions: b?.open_position_count ?? null,
          current_equity: b?.current_equity ?? null,
          research_curve_points: curve.length,
          research_curve_first: curve[0]?.date ?? null,
          research_curve_last: curve.at(-1)?.date ?? null,
          live_curve_points: (a.live_curve ?? []).length,
        };
      }),
    },
  }),

  "trials/summary": envelope({
    endpoint: "trials/summary",
    claimClass: "OBSERVED",
    sources: ["public/glassbox/trial_ledger.json", "public/glassbox/kill_log.json"],
    humanPage: `${ORIGIN}/trials`,
    limits: [
      "The trial union is the denominator for multiple-testing correction. It is accounting, not performance.",
      "A hypothesis counted here may have been tested and abandoned without ever producing a publishable result.",
    ],
    data: {
      distinct_hypothesis_identities: trials.distinct_hypothesis_identities ?? null,
      distinct_config_hashes: trials.distinct_config_hashes ?? null,
      identity_budget: value("research.identity-budget"),
      identities_observed: value("research.identities-observed"),
      killed_count: kills.killed_count ?? null,
      screen_killed_count: kills.screen_killed_count ?? null,
      survived_count: kills.survived_count ?? null,
    },
  }),

  research: envelope({
    endpoint: "research",
    claimClass: "PUBLISHED_DOCUMENTS",
    sources: ["public/research-index.json"],
    humanPage: `${ORIGIN}/research`,
    limits: [
      "A published document is not a peer-reviewed one. No paper here has completed external review.",
      "Documents include failures and feasibility nulls; presence in this index is not evidence of a positive result.",
    ],
    data: {
      document_count: research.count ?? research.papers.length,
      topic_count: research.topics.length,
      topics: research.topics.map((t) => ({
        slug: t.slug,
        title: t.title ?? t.name ?? t.slug,
        url: `${ORIGIN}/research/topics/${t.slug}`,
      })),
      documents: research.papers.map((p) => ({
        slug: p.slug,
        title: p.title,
        url: `${ORIGIN}/research/${p.slug}`,
      })),
    },
  }),

  "chain/head": envelope({
    endpoint: "chain/head",
    claimClass: "CRYPTOGRAPHIC_RECORD",
    sources: ["public/glassbox/transparency_log.json"],
    humanPage: `${ORIGIN}/verify`,
    limits: [
      "The chain proves the record was not rewritten after publication. It does NOT prove any figure in it is correct.",
      "Signature verification requires the published Ed25519 public key and the verifier at /verify.",
    ],
    data: {
      entries: chain.entries?.length ?? null,
      distinct_days: chain.distinct_days ?? null,
      first_date: chain.first_date ?? null,
      last_date: chain.last_date ?? null,
      head: chain.head ?? chain.entries?.at(-1) ?? null,
      public_key_ed25519_hex: chain.public_key_ed25519_hex ?? null,
    },
  }),
};

function main() {
  mkdirSync(OUT, { recursive: true });
  const written = [];
  for (const [name, payload] of Object.entries(ENDPOINTS)) {
    const target = resolve(OUT, `${name}.json`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
    written.push(`/api/${VERSION}/${name}`);
  }
  // record.json is written by build-paper-evidence.mjs, because it IS an instance
  // of the published standard rather than a shape invented for this API.
  written.push(`/api/${VERSION}/record`);

  const index = {
    schema: `canli.api.${VERSION}`,
    generated_at: generatedAt,
    description:
      "A static, cacheable read API over the published Canli Capital record. Every response " +
      "carries its own sources, hashes, claim class and limits.",
    documentation: `${ORIGIN}/developers`,
    openapi: `${ORIGIN}/api/${VERSION}/openapi.json`,
    standard: {
      id: "canli.paper-evidence.v0",
      schema: `${ORIGIN}/standards/paper-evidence/v0/schema.json`,
      human_page: `${ORIGIN}/standards/paper-evidence`,
    },
    endpoints: written.sort().map((path) => ({ path, url: `${ORIGIN}${path}` })),
    limits: [
      "Read only. There is no write path and no authentication, because there is nothing to authenticate to.",
      "Regenerated on each publish. Treat generated_at as the freshness of every figure inside.",
      "Paper execution only. Nothing here represents funded performance.",
    ],
  };
  writeFileSync(resolve(OUT, "index.json"), `${JSON.stringify(index, null, 2)}\n`);

  // The OpenAPI document is DERIVED from the endpoints just written, never listed
  // by hand. A specification that documents a route which does not exist, or omits
  // one that does, is worse than none: it is a contract the publisher has already
  // broken on the day it shipped.
  const openapi = {
    openapi: "3.1.0",
    info: {
      title: "Canli Capital public read API",
      version: "1.0.0",
      summary: "A static, cacheable read API over a paper-traded systematic record.",
      description:
        "Every response carries the artifacts it was built from with their SHA-256 hashes, the " +
        "class of claim it represents, and the limits of what it can be used to say. There is no " +
        "write path and no authentication. Nothing here represents funded performance.",
      contact: { name: "Arhan Canli", url: `${ORIGIN}/founder` },
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: ORIGIN, description: "Production" }],
    externalDocs: { description: "Developer documentation", url: `${ORIGIN}/developers` },
    paths: Object.fromEntries(
      written.sort().map((path) => {
        const name = path.replace(`/api/${VERSION}/`, "");
        return [
          path,
          {
            get: {
              summary: ENDPOINT_SUMMARIES[name] ?? name,
              operationId: name.replace(/[^a-z]+/g, "_"),
              responses: {
                200: {
                  description: "The current snapshot, regenerated on each publish.",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        required: ["schema", "generated_at", "claim_class", "limits", "sources", "data"],
                      },
                    },
                  },
                },
              },
            },
          },
        ];
      }),
    ),
  };
  const undocumented = written.filter((p) => !ENDPOINT_SUMMARIES[p.replace(`/api/${VERSION}/`, "")]);
  if (undocumented.length) {
    throw new Error(`api: ${undocumented.join(", ")} have no summary; every endpoint must be described`);
  }
  writeFileSync(resolve(OUT, "openapi.json"), `${JSON.stringify(openapi, null, 2)}\n`);
  // Extensionless routing lives in vercel.json, which this build does not own.
  // Two places that must agree is one place that will drift, so the endpoints are
  // the source and the config is checked against them.
  const vercel = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
  const routed = new Set((vercel.rewrites ?? []).map((r) => r.source));
  const missing = [...written, `/api/${VERSION}/index`, `/api/${VERSION}/openapi`]
    .filter((path) => !routed.has(path));
  if (missing.length) {
    throw new Error(
      `api: vercel.json has no rewrite for ${missing.join(", ")}. Without one the ` +
        "extensionless URL published in the index and the OpenAPI document returns 404.",
    );
  }

  console.log(`  api ${VERSION}: ${written.length + 1} endpoints written, all routed`);
  for (const p of written) console.log(`    ${p}`);
}

main();
