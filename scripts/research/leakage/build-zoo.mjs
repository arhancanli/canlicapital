// Picks the cut points with the check's own planner and has zoo.py compute every indicator on the
// full series and on each prefix; writes config/research/leakage-zoo.json.
//   node scripts/research/leakage/build-zoo.mjs <python with pandas and statsmodels>
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planPrefixes } from "../../../js/leakage-core.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
export const ZOO_PLAN = Object.freeze({ rows: 600, prefixes: 5, seed: 7 });
const plan = { rows: ZOO_PLAN.rows, seed: ZOO_PLAN.seed, cuts: planPrefixes(ZOO_PLAN.rows, { prefixes: ZOO_PLAN.prefixes, seed: ZOO_PLAN.seed }) };
const input = join(mkdtempSync(join(tmpdir(), "leakage-zoo-")), "plan.json");
writeFileSync(input, JSON.stringify(plan));
const out = execFileSync(process.argv[2] ?? "python3", [join(HERE, "zoo.py"), input], { encoding: "utf8", maxBuffer: 1 << 28 });
writeFileSync(join(ROOT, "config/research/leakage-zoo.json"), out);
console.log(`wrote config/research/leakage-zoo.json: cuts ${plan.cuts.join(", ")}`);
