// Every command is offline. No eval adapter, credentials, models or MCP clients are invoked.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { auditBaselineContract, auditBaselineFixture, createBaselineContract, projectQuestions } from "./baseline-contract.mjs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
export function main(args) {
  const [mode, root, plan, extra] = args;
  if (!root || !plan || !["prepare", "audit", "questions", "audit-fixture"].includes(mode) ||
    args.length !== (["questions", "audit-fixture"].includes(mode) ? 4 : 3)) {
    throw new RangeError("usage: baseline-contract-cli.mjs prepare repo-root new-plan.json | audit repo-root plan.json | questions repo-root plan.json new-questions.json | audit-fixture repo-root plan.json fixture-capture.json");
  }
  if (mode === "prepare") {
    const contract = createBaselineContract(root);
    write(plan, contract);
    console.log(JSON.stringify(auditBaselineContract(root, contract)));
  } else if (mode === "questions") {
    const projection = projectQuestions(root, json(plan));
    write(extra, projection);
    console.log(JSON.stringify({ status: "question-projection-written", items: projection.questions.length, model_calls_authorized: false }));
  } else {
    console.log(JSON.stringify(mode === "audit" ? auditBaselineContract(root, json(plan)) : auditBaselineFixture(root, json(plan), json(extra))));
  }
  return 0;
}
let isEntry = false;
try { isEntry = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
catch { /* Imported module without a script entry. */ }
if (isEntry) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
