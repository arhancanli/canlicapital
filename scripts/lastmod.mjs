// =============================================================================
// CANLI CAPITAL / scripts/lastmod.mjs
// -----------------------------------------------------------------------------
// One rule: a sitemap <lastmod> must be the date the PAGE'S CONTENT last changed,
// never the date the build ran. Before this module existed, build-papers.mjs
// stamped every one of 262 URLs with `new Date()` on every prebuild, hourly,
// whether or not anything on the page had moved. That is not a lastmod; it is a
// build timestamp wearing a lastmod's name, and it teaches a crawler to ignore
// the field entirely.
//
// Two sources of truth, tried in this order for each page:
//   1. ARTIFACT DATE. If the page renders a generated JSON artifact that itself
//      declares when it was produced (`generated_at` or `evidence_date`), that is
//      the content date. It is more precise than git history: the artifact can be
//      regenerated with identical bytes and an identical timestamp, and a rebuild
//      of the SITE around it must not move the page's lastmod.
//   2. GIT COMMIT DATE. For a hand-authored source file (a markdown document, an
//      HTML page, the generator script whose own literal prose the page renders),
//      the date its content last changed is the date it was last committed. This
//      is computed AT BUILD TIME via `git log -1 --format=%cI -- <path>`, not
//      cached, so it always reflects the tree actually being built.
//
// A page can depend on several of these at once (a generated page reads a JSON
// artifact AND is rendered by a script whose own template prose can change
// independently). The resolved lastmod is the MOST RECENT of every date found,
// because the page changes when ANY of its sources changes.
//
// FALLBACK. If git is unavailable (no repository, no `git` binary) and no
// artifact supplied a date, there is no real source date to derive, and the
// only honest fallback left is the build date -- which is exactly the bug this
// file exists to avoid everywhere else. Callers MUST report this via `onFallback`
// so it is never a silent regression back to stamping-with-today.
// =============================================================================

import { execFileSync } from "node:child_process";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The committer date of the most recent commit touching `relPath`, as YYYY-MM-DD.
 * `relPath` may be a file or a directory (git reports the latest commit touching
 * anything under it). Returns null if git is unavailable, the path has never been
 * committed, or the command fails for any other reason -- never throws, because a
 * missing date is a normal, expected input to resolveLastmod's fallback.
 */
export function gitCommitDate(root, relPath, { run = defaultGitRun } = {}) {
  let out;
  try {
    out = run(root, relPath);
  } catch {
    return null;
  }
  const iso = String(out ?? "").trim().split("\n")[0];
  if (!iso) return null;
  const dateOnly = iso.slice(0, 10);
  return DATE_ONLY.test(dateOnly) ? dateOnly : null;
}

function defaultGitRun(root, relPath) {
  return execFileSync("git", ["log", "-1", "--format=%cI", "--", relPath], {
    cwd: root,
    encoding: "utf8",
  });
}

/**
 * The date an artifact declares it was generated, as YYYY-MM-DD. Checks
 * `generated_at` before `evidence_date` -- when both are present, `generated_at`
 * describes the object's own production and is the more specific claim.
 */
export function artifactDate(artifact) {
  if (!artifact || typeof artifact !== "object") return null;
  const raw = artifact.generated_at ?? artifact.evidence_date;
  if (typeof raw !== "string" || raw.length < 10) return null;
  const dateOnly = raw.slice(0, 10);
  return DATE_ONLY.test(dateOnly) ? dateOnly : null;
}

/**
 * Resolve one URL's lastmod from every real source that can move it.
 *
 * `files` are repo-relative paths whose git commit date counts as a content date.
 * `artifacts` are parsed JSON objects (or plain objects) checked for their own
 * generated_at/evidence_date. The result is the MOST RECENT date found across
 * both; if none is found, `buildDate` is returned and `onFallback` is called with
 * the `files` list so the caller can report exactly what could not be dated.
 */
export function resolveLastmod({ root, files = [], artifacts = [], buildDate, onFallback, run }) {
  const candidates = [];
  for (const artifact of artifacts) {
    const date = artifactDate(artifact);
    if (date) candidates.push(date);
  }
  for (const file of files) {
    const date = gitCommitDate(root, file, run ? { run } : undefined);
    if (date) candidates.push(date);
  }
  if (candidates.length === 0) {
    if (onFallback) onFallback(files);
    return buildDate;
  }
  candidates.sort();
  return candidates[candidates.length - 1];
}
