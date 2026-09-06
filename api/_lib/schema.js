// api/_lib/schema.js
// Turns a MANIFEST entry's requestExample into a JSON Schema: properties and types read off the
// example's own shape, required computed as "every example key not named in requestOptional".
// The OpenAPI document and the handler therefore describe the same fields from the same object;
// a field added to an example without updating a handler, or a handler accepting a field no
// example shows, is the only way they can now drift, and both are visible in a diff of one file.
function schemaForValue(value) {
  if (Array.isArray(value)) {
    return { type: "array", items: value.length ? schemaForValue(value[0]) : {} };
  }
  if (value !== null && typeof value === "object") {
    const properties = Object.fromEntries(Object.entries(value).map(([key, v]) => [key, schemaForValue(v)]));
    return { type: "object", properties, required: Object.keys(properties) };
  }
  if (typeof value === "number") return { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  return { type: "string" };
}

/** The requestBody schema for one MANIFEST entry: properties inferred from its requestExample,
 * required narrowed by requestOptional, and any requestExtraProperties merged in as additional,
 * non-required fields the example does not itself demonstrate. */
export function requestSchemaFor(entry) {
  const example = entry.requestExample ?? {};
  const schema = schemaForValue(example);
  const optional = new Set(entry.requestOptional ?? []);
  schema.required = Object.keys(schema.properties).filter((key) => !optional.has(key));
  for (const [key, propertySchema] of Object.entries(entry.requestExtraProperties ?? {})) {
    if (!(key in schema.properties)) schema.properties[key] = propertySchema;
  }
  if (entry.requestDescription) schema.description = entry.requestDescription;
  return schema;
}
