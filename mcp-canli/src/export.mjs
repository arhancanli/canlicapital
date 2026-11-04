// export_result: a kept result, or a table inside it, written to a file in CANLI_HOME/exports as CSV or JSON,
// with its receipt beside it (local/export.mjs). The rows never pass through the model, which reads only where
// the file is, its size and its hash.
import { z } from "zod";

export const exportInput = z.object({
  ref: z.string().regex(/^r\d+$/).describe("The ref of a kept result, such as r3."),
  path: z.string().max(200).optional().describe("The part to write, such as rows or series.0; default the whole result."),
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(csv|json)$/, "a plain file name ending in .csv or .json").describe("The file's name in CANLI_HOME/exports, such as apple-revenue.csv."),
}).strict();

export const EXPORT_TOOL = Object.freeze({
  name: "export_result", pack: "desk", toolset: "desk", title: "Write a kept result to a CSV or JSON file", input: exportInput, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  description: "Write a kept result (by its ref), or a table inside it, to a CSV or JSON file in CANLI_HOME/exports for a spreadsheet or a notebook, with a receipt beside it; the rows never pass through the model. Never over an existing file. Local server only.",
  keywords: "export csv json file download save table spreadsheet excel pandas notebook write rows to disk",
  args: "ref: string, path?: string, name: string",
});
