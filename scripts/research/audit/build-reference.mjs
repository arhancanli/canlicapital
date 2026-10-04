// Writes the fixed cases for reference.py and saves its answers as config/research/audit-core-reference.json.
//   node scripts/research/audit/build-reference.mjs <python with numpy and statsmodels>
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SERIES, VARIANTS } from "./cases.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const python = process.argv[2] ?? "python3";
const input = join(mkdtempSync(join(tmpdir(), "audit-ref-")), "cases.json");
writeFileSync(input, JSON.stringify({ periods_per_year: 252, series: SERIES, variants: VARIANTS }));
const out = execFileSync(python, [join(HERE, "reference.py"), input], { encoding: "utf8" });
writeFileSync(join(ROOT, "config/research/audit-core-reference.json"), out);
console.log("wrote config/research/audit-core-reference.json");
