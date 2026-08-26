import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(ROOT, "public");
const REGISTRY_PATH = resolve(ROOT, "contracts/public-claims.registry.json");
const OUTPUT_PATH = resolve(PUBLIC, "contracts/public-claims.json");

const MATURITIES = new Set(["observed", "simulated", "model_estimated", "planned"]);
const VALUE_TYPES = new Set(["string", "number", "integer", "boolean", "array", "object"]);
const FORMATS = new Set(["text", "status", "date", "timestamp", "integer", "decimal", "percent", "currency", "count"]);
const SURFACES = new Set(["home", "live", "research", "trials", "systems", "foundry", "methodology", "verify", "corrections", "status", "founder", "open"]);
const SOURCE_PATTERN = /^\/(?:glassbox\/[^/]+\.json|paper-state\.json|research-index\.json)$/;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const EM_DASH_PATTERN = /\u2014|&mdash;|&#8212;/i;

const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
const errors = [];
const sourceCache = new Map();

function fail(location, message) {
  errors.push(`${location}: ${message}`);
}

function resolvePointer(document, pointer) {
  if (pointer === "") return { found: true, value: document };
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    return { found: false, value: undefined };
  }
  let cursor = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (cursor === null || typeof cursor !== "object" || !(token in cursor)) {
      return { found: false, value: undefined };
    }
    cursor = cursor[token];
  }
  return { found: true, value: cursor };
}

function sourceDocument(publicPath, location) {
  if (typeof publicPath !== "string" || !SOURCE_PATTERN.test(publicPath)) {
    fail(location, `unsupported public source path ${JSON.stringify(publicPath)}`);
    return null;
  }
  if (isAbsolute(publicPath.slice(1))) {
    fail(location, "source path must be public-root relative");
    return null;
  }
  const file = resolve(PUBLIC, publicPath.slice(1));
  if (!file.startsWith(`${PUBLIC}${sep}`)) {
    fail(location, "source path escapes public/");
    return null;
  }
  if (!sourceCache.has(file)) {
    try {
      sourceCache.set(file, JSON.parse(readFileSync(file, "utf8")));
    } catch (error) {
      fail(location, `cannot read ${publicPath}: ${error.message}`);
      return null;
    }
  }
  return sourceCache.get(file);
}

function valueMatches(value, expected) {
  if (expected === "array") return Array.isArray(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === expected;
}

if (registry.schema !== "canli.public-claim-registry.v1") {
  fail("registry.schema", "must equal canli.public-claim-registry.v1");
}
if (!VERSION_PATTERN.test(registry.contract_version || "")) {
  fail("registry.contract_version", "must be semantic version text");
}
if (typeof registry.claim_boundary !== "string" || registry.claim_boundary.length < 40) {
  fail("registry.claim_boundary", "must explain the registry limitation");
}
if (EM_DASH_PATTERN.test(registry.claim_boundary || "")) {
  fail("registry.claim_boundary", "contains a forbidden em dash");
}
if (!Array.isArray(registry.claims) || registry.claims.length === 0) {
  fail("registry.claims", "must contain at least one claim");
}

const ids = new Set();
const resolvedClaims = [];

for (const [index, claim] of (registry.claims || []).entries()) {
  const location = `claims[${index}]`;
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
    fail(location, "must be an object");
    continue;
  }
  if (!ID_PATTERN.test(claim.id || "")) fail(`${location}.id`, "invalid claim id");
  if (ids.has(claim.id)) fail(`${location}.id`, `duplicate claim id ${claim.id}`);
  ids.add(claim.id);
  if (typeof claim.label !== "string" || claim.label.length < 2) fail(`${location}.label`, "missing label");
  if (typeof claim.description !== "string" || claim.description.length < 12) fail(`${location}.description`, "missing description");
  if (!MATURITIES.has(claim.maturity)) fail(`${location}.maturity`, `unsupported maturity ${claim.maturity}`);
  if (!VALUE_TYPES.has(claim.value_type)) fail(`${location}.value_type`, `unsupported type ${claim.value_type}`);
  if (!FORMATS.has(claim.format)) fail(`${location}.format`, `unsupported format ${claim.format}`);
  if (EM_DASH_PATTERN.test(`${claim.label || ""}${claim.description || ""}`)) {
    fail(location, "editable claim copy contains a forbidden em dash");
  }
  if (!Array.isArray(claim.surfaces) || claim.surfaces.length === 0) {
    fail(`${location}.surfaces`, "must name at least one product surface");
  } else {
    const unique = new Set(claim.surfaces);
    if (unique.size !== claim.surfaces.length) fail(`${location}.surfaces`, "contains duplicates");
    for (const surface of claim.surfaces) {
      if (!SURFACES.has(surface)) fail(`${location}.surfaces`, `unsupported surface ${surface}`);
    }
  }

  const source = sourceDocument(claim.source?.path, `${location}.source.path`);
  if (!source) continue;
  const valueResult = resolvePointer(source, claim.source?.pointer);
  if (!valueResult.found) {
    fail(`${location}.source.pointer`, `does not resolve: ${claim.source?.pointer}`);
    continue;
  }
  if (valueResult.value === null && claim.allow_null !== true) {
    fail(`${location}.source.pointer`, "resolved to null without allow_null");
  } else if (valueResult.value !== null && !valueMatches(valueResult.value, claim.value_type)) {
    fail(`${location}.source.pointer`, `expected ${claim.value_type}, received ${Array.isArray(valueResult.value) ? "array" : typeof valueResult.value}`);
  }

  let asOf = null;
  if (claim.source?.as_of_pointer) {
    const asOfResult = resolvePointer(source, claim.source.as_of_pointer);
    if (!asOfResult.found || typeof asOfResult.value !== "string") {
      fail(`${location}.source.as_of_pointer`, `does not resolve to text: ${claim.source.as_of_pointer}`);
    } else {
      asOf = asOfResult.value;
    }
  }

  let boundary = null;
  if (typeof claim.boundary?.text === "string") {
    boundary = claim.boundary.text;
  } else if (typeof claim.boundary?.pointer === "string") {
    const boundaryResult = resolvePointer(source, claim.boundary.pointer);
    if (!boundaryResult.found || typeof boundaryResult.value !== "string" || boundaryResult.value.length < 30) {
      fail(`${location}.boundary.pointer`, `does not resolve to sufficient text: ${claim.boundary.pointer}`);
    } else {
      boundary = boundaryResult.value;
    }
  } else {
    fail(`${location}.boundary`, "must provide text or a source pointer");
  }
  if (EM_DASH_PATTERN.test(boundary || "")) fail(`${location}.boundary`, "resolved boundary contains a forbidden em dash");

  resolvedClaims.push({
    id: claim.id,
    label: claim.label,
    description: claim.description,
    maturity: claim.maturity,
    value: valueResult.value,
    value_type: claim.value_type,
    format: claim.format,
    ...(claim.unit ? { unit: claim.unit } : {}),
    boundary,
    surfaces: claim.surfaces,
    source: {
      path: claim.source.path,
      pointer: claim.source.pointer,
      as_of: asOf,
    },
  });
}

if (errors.length > 0) {
  console.error(`public claim contract failed with ${errors.length} error${errors.length === 1 ? "" : "s"}`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const dates = resolvedClaims
  .map((claim) => claim.source.as_of)
  .filter(Boolean)
  .map((value) => ({ value, time: Date.parse(value) }))
  .filter((entry) => Number.isFinite(entry.time))
  .sort((a, b) => b.time - a.time);

const output = {
  schema: "canli.public-claims-resolved.v1",
  contract_version: registry.contract_version,
  evidence_as_of: dates[0]?.value || null,
  claim_boundary: registry.claim_boundary,
  claims: resolvedClaims,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`resolved ${resolvedClaims.length} public claims from ${sourceCache.size} artifacts`);
