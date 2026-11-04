// mcp-canli/src/prereg.mjs
//
// Pre-registration over MCP. A hypothesis written down after the data was seen proves nothing, and a research
// diary can be rewritten. Here the hypothesis and its plan are hashed with the time before any data is read: the
// answer gives the hash, every later answer's receipt names it (canlicapital.com/receipt, under `after`), and the
// record is kept on this machine (local/prereg.mjs) and in the signed audit log when one is on. Anyone given the
// text can hash it again and see that it matches, and the receipts show what was read after it.
import { createHash } from "node:crypto";

import { z } from "zod";

export const PREREG_TOOL = Object.freeze({
  name: "preregister", pack: "desk", toolset: "desk", title: "Pre-register a hypothesis before the data",
  input: z.object({
    hypothesis: z.string().min(1).max(4000).describe("What you expect to find, in your words."),
    plan: z.string().max(4000).optional().describe("The test: data, period, measure and the result that would count against it."),
    data_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("The last date of data you have already looked at."),
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  description: "Hash a hypothesis and its plan with the time before reading any data. Every later answer's receipt names the hash, so the order (hypothesis, then data) is in the client's own records; the record is kept on this machine. Local server only.",
  keywords: "pre-register preregistration hypothesis commit before data research plan p-hacking registered report timestamp hash",
  args: "hypothesis: string, plan?: string, data_until?: date",
});

const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v));

// keep: writes a record on this machine and says where (local/prereg.mjs), or null to keep it in this session only.
export function createRegistry({ keep = null, now = () => new Date().toISOString() } = {}) {
  const entries = [];
  return {
    async add(args) {
      const a = PREREG_TOOL.input.parse(args ?? {});
      const record = { hypothesis: a.hypothesis, ...(a.plan ? { plan: a.plan } : {}), ...(a.data_until ? { data_until: a.data_until } : {}), at: now() };
      const sha256 = createHash("sha256").update(canonical(record)).digest("hex");
      const entry = { id: `prereg-${sha256.slice(0, 8)}`, sha256, at: record.at };
      const kept = keep ? await keep({ ...entry, record }) : "this session only";
      entries.push(entry);
      return { ...entry, hashed: record, kept_in: kept, how_to_check: "SHA-256 of the hashed record as canonical JSON (keys sorted, no spaces). Every later answer's receipt lists it under after." };
    },
    // What every later receipt names.
    list: () => entries.map(({ id, sha256, at }) => ({ id, sha256, at })),
  };
}
