// Writes config/research/reality-check-reference.json: independent p-values for the four cases in
// cases.mjs, from Python's arch 8.0 (not studentized) and from reference.py's numpy transcription of
// the bootstrap-t SPA and StepM. Needs uv. The file's dated `history` is carried over on a rebuild.
//   node scripts/research/reality-check/build-reference.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultBlock } from "../../../js/snooping-core.js";
import { CASES, caseData } from "./cases.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const OUT = resolve(ROOT, "config/research/reality-check-reference.json");
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
// The dated record of how earlier values were made carries over; a first build starts it.
let history = [];
try {
  history = JSON.parse(readFileSync(OUT, "utf8")).history ?? [];
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const out = {
  schema: "canli.reality-check-reference.v1",
  what: "Independent p-values for js/snooping-core.js on the fixed-seed cases in scripts/research/reality-check/cases.mjs: arch's SPA, RealityCheck and StepM (not studentized), and the bootstrap-t SPA and StepM (every resample studentized by its own standard deviation, ties counted), transcribed in numpy in reference.py from the definitions in its docstring, not from the JavaScript. The two sides draw with different generators, so they agree within Monte Carlo error.",
  reference: {
    package: ARCH, reps: REPS, numpy_seed: SEED, bootstrap: "stationary", block_length: "round(n^(1/3))",
    seeds: { arch_spa: SEED, arch_reality_check: SEED + 1, arch_stepm: SEED + 2, bootstrap_t: SEED + 3 },
    bootstrap_t: "reference.py bootstrap_t: T = max(0, max_k sqrt(n) m_k / s_k) with sample standard deviations; each resample's recentred means divided by that resample's own standard deviations; Hansen's lower, consistent and upper recentrings (threshold from the Politis-Romano variance); p = #(T* >= T) / reps; StepM on the consistent recentring with its critical value floored at zero, alpha 0.05.",
  },
  history,
  cases: CASES.map((c) => ({ ...c, block_length: defaultBlock(c.n), ...values[c.name] })),
};
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(values, null, 1));
