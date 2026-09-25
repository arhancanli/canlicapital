// Deterministic return matrices for the CSCV cross-check against the CRAN pbo package.
// js/pbo-cran-crosscheck.test.js rebuilds them to run pboCscv; running this file writes them as
// CSV for scripts/reference/pbo-cran.R. mulberry32 and Box-Muller, so neither implementation's own
// random generator is involved.
import { writeFileSync } from "node:fs";

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(next) {
  return Math.sqrt(-2 * Math.log(next() || 1e-12)) * Math.cos(2 * Math.PI * next());
}

// Returns are 1% daily noise; a "skill" case adds a small drift to one column.
export function referenceMatrix({ rows, cols, seed, driftColumn = null }) {
  const next = mulberry32(seed);
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (_, j) => 0.01 * normal(next) + 0.001 * (j === driftColumn ? 0.08 : 0)),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fixture = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(new URL("../../js/fixtures/pbo-cran-reference.json", import.meta.url), "utf8")));
  const out = process.argv[2] ?? ".";
  for (const c of fixture.cases) {
    const m = referenceMatrix({ rows: c.rows, cols: c.cols, seed: c.seed, driftColumn: c.drift === "column 3" ? 3 : null });
    writeFileSync(`${out}/${c.name}.csv`, m.map((row) => row.join(",")).join("\n") + "\n");
  }
}
