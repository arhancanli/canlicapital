// js/validate/paper-evidence.js
// The pure computation behind POST /api/v1/validate/paper-evidence, shared by the API route and the
// MCP package's local mode (mcp/src/local mirrors it byte for byte), so the two cannot disagree.
import schema from "../../standards/paper-evidence/schema.json" with { type: "json" };
import { conformance } from "../paper-evidence-core.js";

export function compute(body) {
  if (!body.record || typeof body.record !== "object" || Array.isArray(body.record)) throw new RangeError("Send the record to validate under the key \"record\"");
  const out = conformance(body.record, schema);
  return { standard: "canli.paper-evidence.v0", valid: out.valid, structural: out.structural, semantic: out.semantic, plain_reading: out.valid ? "The record conforms to the standard. Conformance says the record states what a paper record must state; it does not say the strategy works." : `The record does not conform: ${out.structural.length} structural and ${out.semantic.length} semantic failure(s), each with a JSON pointer.` };
}
