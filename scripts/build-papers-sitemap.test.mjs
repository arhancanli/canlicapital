// =============================================================================
// scripts/build-papers-sitemap.test.mjs
// -----------------------------------------------------------------------------
// End-to-end companion to lastmod.test.mjs. That file unit-tests the resolution
// primitives with injected fixtures; this one runs the REAL `node
// scripts/build-papers.mjs` against the real repository and checks the two
// properties the SEO audit asked for directly on its output, `public/sitemap.xml`:
//
//   1. STABILITY -- building the sitemap twice, a build apart, with nothing in
//      git changed in between, must produce byte-identical <lastmod> values.
//      Before this fix, every URL was stamped with `new Date()`, so two builds
//      on different calendar days always disagreed regardless of content.
//
//   2. MOVEMENT -- a page whose real source was committed on a different day
//      must carry a different lastmod from one whose source was not, and that
//      difference must match what a fresh, independent git query says.
// =============================================================================

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { gitCommitDate } from "./lastmod.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runBuildPapers() {
  execFileSync("node", ["scripts/build-papers.mjs"], { cwd: ROOT, stdio: "pipe" });
  return readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
}

function lastmodByLoc(sitemap) {
  const entries = new Map();
  const re = /<loc>(.*?)<\/loc>\s*<lastmod>(.*?)<\/lastmod>/g;
  let match = re.exec(sitemap);
  while (match) {
    entries.set(match[1], match[2]);
    match = re.exec(sitemap);
  }
  return entries;
}

/** Block the event loop without spinning the CPU, so "a build apart" costs real wall-clock
 * time without wasting it. */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Built ONCE, twice, up front: `first` and `second` feed the stability check, and `second` is
// reused for the movement check too, so this file costs two real builds rather than three.
let first;
let second;

before(() => {
  first = runBuildPapers();
  // A real elapsed gap, long enough to cross a wall-clock second boundary -- exactly the kind
  // of "the build simply ran later" difference the old `new Date().toISOString().slice(0, 10)`
  // stamp was sensitive to once it crossed midnight, and this implementation must not be,
  // because nothing in git moved between the two builds.
  pause(1100);
  second = runBuildPapers();
});

test(
  "STABILITY (end-to-end): rebuilding the sitemap a beat later, with git history unchanged, " +
    "produces a byte-identical file",
  () => {
    assert.equal(first, second, "public/sitemap.xml must not change when nothing in git did");
  },
);

test(
  "MOVEMENT (end-to-end): a page whose source was committed on a different day carries a " +
    "different real lastmod, matching an independent git query",
  () => {
    const byLoc = lastmodByLoc(second);

    // Two real, currently-published research papers whose markdown sources were committed on
    // different calendar days (confirmed independently below via gitCommitDate, not hardcoded
    // as a date so this test keeps working as the repository's history grows).
    const older = "alphavintage-missing-release-correction";
    const newer = "alphamax-equity-momentum-lineage";

    const expectedOlder = gitCommitDate(ROOT, `public/research/${older}.md`);
    const expectedNewer = gitCommitDate(ROOT, `public/research/${newer}.md`);
    assert.ok(expectedOlder, `git has no commit history for ${older}.md; pick different fixtures`);
    assert.ok(expectedNewer, `git has no commit history for ${newer}.md; pick different fixtures`);
    assert.notEqual(
      expectedOlder,
      expectedNewer,
      "the two fixture papers must genuinely have different commit dates for this test to prove anything",
    );

    const actualOlder = byLoc.get(`https://canlicapital.com/research/${older}`);
    const actualNewer = byLoc.get(`https://canlicapital.com/research/${newer}`);
    assert.equal(actualOlder, expectedOlder, `${older} lastmod must match its source's git commit date`);
    assert.equal(actualNewer, expectedNewer, `${newer} lastmod must match its source's git commit date`);
    assert.notEqual(actualOlder, actualNewer, "the two pages must carry different lastmod values");
  },
);
