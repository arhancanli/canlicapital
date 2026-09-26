// =============================================================================
// paper-evidence-core.js
// -----------------------------------------------------------------------------
// A validator for canli.paper-evidence.v0, with no dependencies.
//
// It implements the subset of JSON Schema the standard actually uses: type,
// const, enum, required, additionalProperties, properties, items, minItems,
// minLength, minimum, maximum, pattern, and the date and date-time formats.
//
// WHY NOT A LIBRARY. A standard is only adoptable if checking it is cheap. A
// validator that pulls a dependency tree makes conformance a project; one that
// runs in any browser and any Node without installing anything makes it a
// paste. The subset is small enough to read in one sitting, which is the other
// half of adoptability.
//
// Every error carries a JSON Pointer to the offending location, because "invalid"
// without a path is a validator that makes you do its work.
// =============================================================================

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const typeOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
};

const matchesType = (value, expected) => {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  return actual === expected;
};

function isValidDate(text) {
  if (!ISO_DATE.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Round-trip: rejects 2026-02-30, which a regex alone accepts.
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Validate `value` against `schema`. Returns every error found, not just the
 * first: a conformance report that stops at the first problem turns adoption
 * into a guessing game.
 */
export function validate(value, schema, pointer = "") {
  const errors = [];
  const fail = (message, at = pointer) => errors.push({ pointer: at || "/", message });

  if ("const" in schema && value !== schema.const) {
    fail(`must equal ${JSON.stringify(schema.const)}`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    fail(`must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`);
    return errors;
  }

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((t) => matchesType(value, t))) {
      fail(`expected ${allowed.join(" or ")}, got ${typeOf(value)}`);
      return errors;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`must be at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      fail(`must match ${schema.pattern}`);
    }
    if (schema.format === "date" && !isValidDate(value)) fail("must be a valid ISO date");
    if (schema.format === "date-time" && !ISO_DATE_TIME.test(value)) {
      fail("must be an ISO date-time");
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be <= ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(`must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, i) => errors.push(...validate(item, schema.items, `${pointer}/${i}`)));
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) fail(`missing required property "${key}"`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(schema.properties && key in schema.properties)) {
          fail(`unexpected property "${key}"`, `${pointer}/${key}`);
        }
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], sub, `${pointer}/${key}`));
    }
  }

  return errors;
}

/**
 * Checks the standard cannot express as shape, only as a relationship between
 * fields. A record can satisfy every type in the schema and still make a claim
 * it has disqualified itself from making, and these are exactly those cases.
 */
export function semanticChecks(record) {
  const errors = [];
  const fail = (pointer, message) => errors.push({ pointer, message });

  if (record?.returns?.sharpe_reportable === false && record?.returns?.sharpe_annualised !== null) {
    fail(
      "/returns/sharpe_annualised",
      "sharpe_reportable is false, so sharpe_annualised must be null. Declaring a sample " +
        "cannot support a figure and then publishing the figure is the defect this field exists to prevent.",
    );
  }
  if (record?.selection?.trials_counted === true && record?.selection?.trial_count === null) {
    fail("/selection/trial_count", "trials_counted is true, so trial_count may not be null");
  }
  if (record?.selection?.deflation_applied === true && record?.selection?.deflated_sharpe_ratio === null) {
    fail("/selection/deflated_sharpe_ratio", "deflation_applied is true, so the deflated ratio must be present");
  }
  if (record?.capital?.kind === "PAPER" && record?.returns?.basis === "NET_OF_REALISED_COSTS") {
    fail(
      "/returns/basis",
      "a PAPER record cannot be net of REALISED costs: realised costs require funded execution. " +
        "Use NET_OF_MODELLED_COSTS.",
    );
  }
  if (record?.risk?.drawdown_basis === "NOT_ESTABLISHED" && record?.risk?.max_drawdown_realised !== null) {
    fail(
      "/risk/max_drawdown_realised",
      "drawdown_basis is NOT_ESTABLISHED, so no realised drawdown may be stated",
    );
  }
  const first = record?.period?.first_observation;
  const last = record?.period?.last_observation;
  if (first && last && first > last) {
    fail("/period", "first_observation is after last_observation");
  }
  return errors;
}

/** Full conformance: shape, then the relationships shape cannot express. */
export function conformance(record, schema) {
  const structural = validate(record, schema);
  // Semantic checks read fields; running them on a structurally broken record
  // produces noise, so they are gated on the shape being right first.
  const semantic = structural.length === 0 ? semanticChecks(record) : [];
  return { valid: structural.length === 0 && semantic.length === 0, structural, semantic };
}
