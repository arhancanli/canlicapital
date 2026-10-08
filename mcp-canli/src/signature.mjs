// A tool's arguments in one line ("prices: number[], window?: integer"), so find_tool results and
// argument errors can say how to call a tool without a describe_tool round trip (about 27 tokens
// against 274 for the full schema, on average).
import { z } from "zod";

const typeOf = (p) => {
  if (!p) return "any";
  if (p.enum) return p.enum.length > 5 ? `${p.enum.slice(0, 4).join("|")}|...` : p.enum.join("|");
  if (p.anyOf) return p.anyOf.map(typeOf).join("|");
  if (p.type === "array") { const t = typeOf(p.items); return t.includes("|") ? `(${t})[]` : `${t}[]`; }
  if (p.type === "object" && p.properties) return `{${Object.keys(p.properties).join(",")}}`;
  return p.type ?? "object";
};

export function signature(schema) {
  const s = z.toJSONSchema(schema, { io: "input" }), req = new Set(s.required ?? []);
  return Object.entries(s.properties ?? {}).map(([k, p]) => `${k}${req.has(k) ? "" : "?"}: ${typeOf(p)}`).join(", ");
}
