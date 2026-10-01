// Offline only: no API credentials, model calls, MCP connections or network access.
// score <items.jsonl> <capture.json> <out.json>; audit <items.jsonl> <evaluation.json>
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { auditEvidence, evaluateCapture } from "./evidence.mjs";

export function main(args) {
  const [mode, itemsFile, recordFile, outFile] = args;
  if (!itemsFile || !recordFile || (mode === "score" ? args.length !== 4 : mode !== "audit" || args.length !== 3)) {
    throw new RangeError("usage: replay-evaluation.mjs score items.jsonl capture.json out.json | audit items.jsonl evaluation.json");
  }
  const bytes = readFileSync(itemsFile);
  const record = JSON.parse(readFileSync(recordFile, "utf8"));
  if (mode === "score") {
    if ([itemsFile, recordFile].some((path) => pathToFileURL(path).href === pathToFileURL(outFile).href)) {
      throw new RangeError("output must differ from both input files");
    }
    const evidence = evaluateCapture(bytes, record);
    writeFileSync(outFile, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(evidence.summary));
    return 0;
  }
  const result = auditEvidence(bytes, record);
  console.log(JSON.stringify(result));
  return result.status === "unrescorable" ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
