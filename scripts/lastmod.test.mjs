import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { artifactDate, gitCommitDate, resolveLastmod } from "./lastmod.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("artifactDate prefers generated_at over evidence_date", () => {
  assert.equal(
    artifactDate({ generated_at: "2026-08-01T00:00:00Z", evidence_date: "2026-08-30" }),
    "2026-08-01",
  );
});

test("artifactDate falls back to evidence_date when generated_at is absent", () => {
  assert.equal(artifactDate({ evidence_date: "2026-08-22" }), "2026-08-22");
});

test("artifactDate returns null for artifacts carrying neither field", () => {
  assert.equal(artifactDate({ schema: "canli.example/1" }), null);
  assert.equal(artifactDate(null), null);
  assert.equal(artifactDate("not-an-object"), null);
});

test("artifactDate rejects a malformed date rather than inventing one", () => {
  assert.equal(artifactDate({ generated_at: "not-a-date" }), null);
});

test("gitCommitDate returns null instead of throwing when the runner fails", () => {
  const run = () => {
    throw new Error("git not installed");
  };
  assert.equal(gitCommitDate(ROOT, "package.json", { run }), null);
});

test("gitCommitDate returns null for an untracked path (empty git output)", () => {
  const run = () => "";
  assert.equal(gitCommitDate(ROOT, "not-a-real-file.txt", { run }), null);
});

test("gitCommitDate extracts the date portion of git's committer-date ISO output", () => {
  const run = (root, relPath) => {
    assert.equal(root, ROOT);
    assert.equal(relPath, "scripts/build-papers.mjs");
    return "2026-08-19T21:59:29+04:00\n";
  };
  assert.equal(gitCommitDate(ROOT, "scripts/build-papers.mjs", { run }), "2026-08-19");
});

test("gitCommitDate resolves a real tracked file through the actual git binary", () => {
  // One integration point exercising the real subprocess, so a broken git
  // invocation (wrong flags, wrong cwd) is caught even though every other test
  // injects a fake runner.
  const date = gitCommitDate(ROOT, "package.json");
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
});

test("resolveLastmod returns the MOST RECENT date across artifacts and files", () => {
  const run = (root, relPath) => (relPath === "b.md" ? "2026-08-10T00:00:00Z" : "2026-01-01T00:00:00Z");
  const date = resolveLastmod({
    root: ROOT,
    files: ["a.md", "b.md"],
    artifacts: [{ generated_at: "2026-07-04T00:00:00Z" }],
    buildDate: "2026-09-06",
    run,
  });
  assert.equal(date, "2026-08-10");
});

test("resolveLastmod falls back to buildDate and reports it when no source has a date", () => {
  const run = () => "";
  let reportedFiles = null;
  const date = resolveLastmod({
    root: ROOT,
    files: ["ghost.md"],
    artifacts: [{}],
    buildDate: "2026-09-06",
    run,
    onFallback: (files) => {
      reportedFiles = files;
    },
  });
  assert.equal(date, "2026-09-06");
  assert.deepEqual(reportedFiles, ["ghost.md"]);
});

// -----------------------------------------------------------------------------
// The behaviour the audit actually asked for: two resolutions a build apart, with
// nothing in the underlying sources changed, must agree exactly -- and moving one
// source's date must move ONLY the lastmod values that depend on it.
// -----------------------------------------------------------------------------

test("STABILITY: unchanged inputs resolve to the identical lastmod on a later build", () => {
  const fixedGitDates = { "research/a.md": "2026-08-12T10:00:00Z" };
  const run = (root, relPath) => fixedGitDates[relPath] ?? "";
  const artifact = { generated_at: "2026-08-20T00:00:00Z" };

  const buildOnce = (buildDate) =>
    resolveLastmod({ root: ROOT, files: ["research/a.md"], artifacts: [artifact], buildDate, run });

  // Same git history and artifact, "one minute apart" build times.
  const first = buildOnce("2026-09-06T12:00:00Z");
  const second = buildOnce("2026-09-06T12:01:00Z");
  assert.equal(first, second);
  assert.equal(first, "2026-08-20");
});

test("MOVEMENT: a page whose source date moves gets a moved lastmod, others do not", () => {
  const gitDates = { "research/a.md": "2026-08-12T10:00:00Z", "research/b.md": "2026-08-13T10:00:00Z" };
  const run = (root, relPath) => gitDates[relPath] ?? "";

  const before = {
    a: resolveLastmod({ root: ROOT, files: ["research/a.md"], buildDate: "2026-09-06", run }),
    b: resolveLastmod({ root: ROOT, files: ["research/b.md"], buildDate: "2026-09-06", run }),
  };
  assert.equal(before.a, "2026-08-12");
  assert.equal(before.b, "2026-08-13");

  // Only a.md's source moves.
  gitDates["research/a.md"] = "2026-09-01T10:00:00Z";
  const after = {
    a: resolveLastmod({ root: ROOT, files: ["research/a.md"], buildDate: "2026-09-06", run }),
    b: resolveLastmod({ root: ROOT, files: ["research/b.md"], buildDate: "2026-09-06", run }),
  };
  assert.equal(after.a, "2026-09-01");
  assert.notEqual(after.a, before.a);
  assert.equal(after.b, before.b);
});
