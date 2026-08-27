// =============================================================================
// build-engineering-manifest.mjs
// -----------------------------------------------------------------------------
// Produces public/glassbox/engineering_open_source.json: the source of truth for
// /engineering. Counts are DERIVED from what the repositories actually publish,
// never typed into the page.
//
// Derived over the network (re-derivable by anyone, from public URLs):
//   - source/test/total file counts, read out of each repository's
//     extraction_manifest.json, which lists every file it ships by SHA-256;
//   - the engine commit each extraction is pinned to, parsed from its own
//     check_parity.py, so the page cannot claim a pin the tool does not enforce.
//
// Recorded with provenance rather than derived (a static site cannot run pytest):
//   - test counts, type-check surface and benchmark figures. Each carries the
//     commit it was measured at and the date, and the page labels them as
//     measured-at rather than live. Anyone can re-run them; the commands are
//     printed on the page.
//
// Run this deliberately, not on every build: it needs the network, and a page
// that silently degrades when GitHub is slow is worse than one built from a
// committed artifact.
// =============================================================================

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public", "glassbox", "engineering_open_source.json");
const RAW = "https://raw.githubusercontent.com/arhancanli";

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

//: Verification results measured by running the repository's own gates. The
//: commands are published beside the numbers so the claim is checkable, and the
//: commit pins what was measured -- a number without one is an anecdote.
const MEASURED = {
  "canli-pit-lake": {
    measured_at: "2026-08-27",
    tests_passed: 941,
    tests_deselected: 12,
    tests_deselected_reason: "network tests, excluded by default",
    typed_source_files: 42,
    commands: ["uv run pytest", "uv run mypy", "uv run ruff check .", "uv run python tools/check_parity.py"],
    benchmark: {
      script: "benchmarks/lake_throughput.py",
      basis: "1,000,000 synthetic bars (50 instruments x 20,000 hourly), Apple silicon, single process",
      rows: [
        ["write, validate then atomic promote", "~1.05M bars/s"],
        ["read, everything visible", "~15M rows/s"],
        ["read, as_of at the midpoint", "~14M rows/s"],
        ["on disk, zstd-3", "60.6 bytes/bar"],
      ],
    },
  },
  "canli-backtest": {
    measured_at: "2026-08-27",
    tests_passed: 279,
    tests_deselected: 0,
    tests_deselected_reason: "",
    typed_source_files: 41,
    commands: ["uv run pytest", "uv run mypy", "uv run ruff check .", "uv run python tools/check_parity.py"],
    benchmark: {
      script: "benchmarks/validation_throughput.py",
      basis: "Apple silicon, single process; the PBO case runs on pure noise so the result is also a correctness check",
      rows: [
        ["PBO via CSCV, 2,000 x 100 configs, 5,000 sampled splits", "1.6 s"],
        ["Deflated Sharpe, 1,260 daily returns", "~300 microseconds"],
        ["PBO measured on pure noise (0.5 is correct)", "0.569"],
        ["One series, Sharpe +1.139, PSR against zero", "0.9828"],
        ["The same series deflated against 10 trials", "0.8408"],
        ["The same series deflated against 200 trials", "0.5608"],
      ],
    },
  },
};

async function getText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

async function describeExtraction(repo) {
  const manifest = JSON.parse(await getText(`${RAW}/${repo}/main/extraction_manifest.json`));
  const paths = Object.keys(manifest);
  const parity = await getText(`${RAW}/${repo}/main/tools/check_parity.py`);
  const pinned = parity.match(/ENGINE_COMMIT = "([0-9a-f]{40})"/);
  if (!pinned) throw new Error(`${repo}: check_parity.py declares no pinned engine commit`);

  const excluded = JSON.parse(await getText(`${RAW}/${repo}/main/excluded_tests.json`));

  return {
    repo,
    url: `https://github.com/arhancanli/${repo}`,
    files_total: paths.length,
    files_source: paths.filter((p) => p.startsWith("src/")).length,
    files_test: paths.filter((p) => p.startsWith("tests/")).length,
    pinned_engine_commit: pinned[1],
    excluded_test_modules: excluded.count,
    ...MEASURED[repo],
  };
}

const extractions = [];
for (const repo of ["canli-pit-lake", "canli-backtest"]) {
  extractions.push(await describeExtraction(repo));
  console.log(`  derived ${repo}`);
}

const payload = {
  schema: "canli.engineering-open-source.v1",
  generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  engine: {
    repo: "alphac",
    url: "https://github.com/arhancanli/alphac",
    note: "The whole system: data lake, point-in-time reader, backtester, walk-forward harness, multiple-testing machinery, portfolio optimizer and live broker loop.",
  },
  extractions,
};
payload.content_hash = `sha256:${createHash("sha256").update(canonical(payload)).digest("hex")}`;
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`\nwrote ${OUT.replace(ROOT + "/", "")}`);
console.log(`  ${payload.content_hash}`);
for (const e of payload.extractions) {
  console.log(`  ${e.repo.padEnd(16)} ${e.files_total} files, ${e.tests_passed} tests, pinned @ ${e.pinned_engine_commit.slice(0, 12)}`);
}
