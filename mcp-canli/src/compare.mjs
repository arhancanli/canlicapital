// Two kept answers set side by side (compare_answers), and a kept answer's call run again now (rerun_answer): what
// changed, by the same comparison as changes_only (rows added and removed, fields changed), leaving out when a
// source was read and the fixed words, so an answer read twice from unchanged sources compares as the same.
import { z } from "zod";

const REF = z.string().regex(/^r\d+$/).describe("The ref of a kept result, such as r3.");
export const compareInput = z.object({ before: REF, after: REF }).strict();
export const rerunInput = z.object({ ref: REF }).strict();
export const previewInput = z.object({ name: z.string().min(1).max(100).describe("The tool, as find_tool names it.") }).strict();

export const COMPARE_TOOLS = Object.freeze([
  { name: "compare_answers", pack: "desk", toolset: "desk", title: "What changed between two kept answers", input: compareInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    description: "Two kept answers (by their refs) side by side: the rows added and removed and the fields changed from before to after, and whether they answered the same question.",
    keywords: "compare answers diff two results what changed between difference receipts",
    args: "before: string, after: string" },
  { name: "rerun_answer", pack: "desk", toolset: "desk", title: "Run a kept answer's call again and compare", input: rerunInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    description: "Run the call behind a kept answer again, now, and say whether the answer is the same; if not, what changed. The new answer is kept under its own ref.",
    keywords: "rerun reproduce replay same answer again reproducibility check stale refresh",
    args: "ref: string" },
  { name: "cost_preview", pack: "desk", toolset: "desk", title: "What a tool cost earlier in this session", input: previewInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    description: "Before a heavy call: how long the tool took and how many characters it answered with when it ran earlier in this session (median and largest), and whether it reads the network, so a call can set max_chars or select first.",
    keywords: "cost preview estimate how long how big tokens size before calling heavy expensive tool budget",
    args: "name: string" },
]);
