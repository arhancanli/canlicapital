// Writes config/research/reality-check-reference.json: independent p-values for the three cases in
// cases.mjs, from Python's arch 8.0 and a numpy transcription of Hansen's studentized SPA. Needs uv.
//   node scripts/research/reality-check/build-reference.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultBlock } from "../../../js/snooping-core.js";
import { CASES, caseData } from "./cases.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const REPS = 10000;
const SEED = 20260928;
const ARCH = "arch==8.0.0";

const dir = mkdtempSync(join(tmpdir(), "reality-check-"));
for (const c of CASES) {
  const d = caseData(c);
  const rows = [];
  for (let t = 0; t < c.n; t += 1) rows.push(Array.from(d.subarray(t * c.k, (t + 1) * c.k)).join(","));
  writeFileSync(join(dir, `${c.name}.csv`), `${rows.join("\n")}\n`);
}
const specs = CASES.map((c) => `${c.name}:${defaultBlock(c.n)}`);
const stdout = execFileSync("uv", ["run", "-q", "--with", ARCH, "python", join(HERE, "reference.py"), dir, String(REPS), String(SEED), ...specs], { encoding: "utf8", maxBuffer: 1 << 24 });
const values = JSON.parse(stdout);
const out = {
  schema: "canli.reality-check-reference.v1",
  what: "Independent p-values for js/snooping-core.js on the fixed-seed cases in scripts/research/reality-check/cases.mjs: arch's SPA, RealityCheck and StepM (not studentized), and Hansen's studentized SPA transcribed from the paper in numpy. The two sides draw with different generators, so they agree within Monte Carlo error.",
  reference: { package: ARCH, reps: REPS, numpy_seed: SEED, bootstrap: "stationary", block_length: "round(n^(1/3))" },
  cases: CASES.map((c) => ({ ...c, block_length: defaultBlock(c.n), ...values[c.name] })),
};
writeFileSync(resolve(ROOT, "config/research/reality-check-reference.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(values, null, 1));
