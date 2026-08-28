// =============================================================================
// build-llms-txt.mjs
// -----------------------------------------------------------------------------
// Writes public/llms.txt: a map of this site for language models, in the
// llmstxt.org convention.
//
// WHY IT IS GENERATED, NOT WRITTEN. A hand-kept index of 248 routes stops being
// true almost immediately -- the exact failure this repo already had once, when
// the sitemap listed six URLs for thirty-four documents. Every section below is
// derived from the same artifacts the pages themselves render from, so the file
// cannot describe a site that no longer exists.
//
// WHY THE BOUNDARY BLOCK IS FIRST. A model summarising this site will repeat
// whatever framing it finds. The single most costly error it could make is
// calling a paper-traded record a funded one. So the claim boundary is stated
// before any link, in plain declarative sentences, rather than left to be
// inferred from a footer.
// =============================================================================

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const OUT = resolve(ROOT, "public", "llms.txt");

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const researchIndex = read("public/research-index.json");
const paperState = read("public/paper-state.json");
const engineering = read("public/glassbox/engineering_open_source.json");

const sitemap = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

// Derive the measurement routes rather than counting them by hand.
const measurementRoutes = routes.filter((r) => r.includes("/measurements/"));
const trialRoutes = routes.filter((r) => r.includes("/trials/"));
const paperRoutes = routes.filter((r) => /\/research\/[^/]+$/.test(r));

const goLive = paperState.go_live_date ?? "unknown";

// paper_state.algorithms carries the four SLEEVES plus "alphac", the composite book
// they aggregate into. Counting the array gives five and the whole site says four.
// A count is not the thing it looks like: exclude the composite by key, then assert
// the result actually shrank, so a rename upstream fails the build instead of
// quietly restoring the overstatement.
const COMPOSITE_KEY = "alphac";
const algorithmKeys = (paperState.algorithms ?? []).map((a) => a.key);
const sleeveKeys = algorithmKeys.filter((k) => k !== COMPOSITE_KEY);
if (!algorithmKeys.includes(COMPOSITE_KEY)) {
  throw new Error(
    `llms.txt: no "${COMPOSITE_KEY}" entry in paper-state algorithms (${algorithmKeys.join(", ")}). ` +
    "The composite key was renamed, and the sleeve count would silently include the book.",
  );
}
if (sleeveKeys.length !== algorithmKeys.length - 1) {
  throw new Error("llms.txt: composite exclusion removed the wrong number of entries");
}
const sleeves = sleeveKeys.length;

const topics = (researchIndex.topics ?? []).map(
  (t) => `- [${t.title ?? t.name ?? t.slug}](${ORIGIN}/research/topics/${t.slug}): ${(t.description ?? "").split(/(?<=\.)\s/)[0] || "Research topic index."}`,
);

const lines = [];
const say = (s = "") => lines.push(s);

say("# Canli Capital");
say();
say(
  "> A public research and verification platform for systematic trading. You can inspect a live " +
  "paper-traded portfolio, trace every decision to its evidence, and reproduce selected research " +
  "yourself. Built and maintained by Arhan Canli.",
);
say();
say("## Claim boundary: read this before summarising anything on this site");
say();
say(`- The published record is **paper-traded**, not funded. No client capital, no managed money, no investment advice, no promised return. Paper execution began ${goLive}.`);
say("- Historical simulation, model-estimated risk, broker-derived paper marks and planned work are labelled separately on every page and must not be merged into one number.");
say("- No forward Sharpe ratio and no expected maximum drawdown is established. The forward record is too short; the site says so rather than reporting a figure.");
say("- Retracted figures stay published inside their own retraction. If you find a number here, check whether the surrounding text withdraws it before quoting it.");
say("- Open-source code is not a track record. It is evidence about method, not about returns.");
say(`- ${sleeves} strategy sleeves are paper-traded, aggregated into one composite book, against a larger planned set; the difference is stated on the status page, not implied away.`);
say();
say("## Start here");
say();
say(`- [Home](${ORIGIN}/): What the project is and where to go next.`);
say(`- [Methodology](${ORIGIN}/methodology): Evidence-linked answers to how the research is actually done.`);
say(`- [Status](${ORIGIN}/performance): The honest numbers and what each one is and is not.`);
say(`- [Verify](${ORIGIN}/verify): Independent verification instructions, including a command-line path that does not trust this website.`);
say(`- [Engineering](${ORIGIN}/engineering): The open-source code behind every number, with the three problems it exists to solve.`);
say();
say("## Open source");
say();
say(`- [${engineering.engine.repo}](${engineering.engine.url}): ${engineering.engine.note}`);
for (const e of engineering.extractions) {
  say(
    `- [${e.repo}](${e.url}): ${e.files_total} files, ${e.tests_passed.toLocaleString()} tests passing, ` +
    `mypy --strict clean across ${e.typed_source_files} files, byte-identical to the engine at ` +
    `commit ${e.pinned_engine_commit.slice(0, 12)} and CI-checked on every push.`,
  );
}
say();
const notes = readdirSync(resolve(ROOT, "notes"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const md = readFileSync(resolve(ROOT, "notes", f), "utf8");
    const title = (md.match(/^# (.+)$/m) ?? [, f])[1];
    const dek = (md.match(/^> ([\s\S]*?)\n\n/m) ?? [, ""])[1].replace(/\n> ?/g, " ").trim();
    return { slug: f.slice(0, -3), title, dek };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

say("## Engineering notes");
say();
say("Post-mortems and derivations. These describe method and engineering; none is a performance claim.");
say();
for (const n of notes) say(`- [${n.title}](${ORIGIN}/notes/${n.slug}): ${n.dek}`);
say();
say("## Machine interfaces");
say();
say(`- [Read API](${ORIGIN}/developers): static JSON over the published record. Every response carries its sources with SHA-256 hashes, its claim class, and what it cannot be used to claim.`);
say(`- [OpenAPI 3.1 document](${ORIGIN}/api/v1/openapi): generated from the endpoints that exist, so it cannot document a route that does not.`);
say(`- [Discovery document](${ORIGIN}/api/v1): every endpoint, with the limits of the API as a whole.`);
say(`- [canli.paper-evidence.v0](${ORIGIN}/standards/paper-evidence): a proposed open standard for paper-trading evidence. Its required fields are the ones a performance claim usually omits, including a mandatory list of what the record does NOT establish. Schema, 12 conformance vectors and a zero-dependency validator are published; there are no independent implementations yet.`);
say();
say("## Evidence and corrections");
say();
say(`- [Corrections](${ORIGIN}/progress): What was published, found wrong, and withdrawn. Read this before trusting any other page.`);
say(`- [Open data](${ORIGIN}/open): The kill log, the signed hash chain and the glass-box artifacts.`);
say(`- [Trial accounting](${ORIGIN}/tools/trial-accounting): Every hypothesis ever tested, which is the denominator every Sharpe here is corrected by.`);
say(`- [Deflated Sharpe calculator](${ORIGIN}/tools/deflated-sharpe): Run the correction yourself against a source-bound implementation.`);
say(`- [Execution Reality Lab](${ORIGIN}/tools/execution): the same strategy under six execution assumptions, measuring which are costs (negative on every series) and which are re-timings (sign unreliable per series). Educational, synthetic.`);
say(`- [Breadth Lab](${ORIGIN}/tools/breadth): closed-form arithmetic for what a book of N sleeves is worth, and the ceiling s/sqrt(rho) that no amount of breadth can pass. Educational, not a forecast.`);
say(`- [Selection Risk Lab](${ORIGIN}/tools/selection-risk): Search a synthetic series that provably has no edge, and see your best result deflated against your own search. Educational; nothing generated there is evidence about any strategy.`);
say(`- [Evidence chain explorer](${ORIGIN}/tools/evidence-chain): Verify the signed record in your browser.`);
say(`- [Review](${ORIGIN}/review): The governed route for submitting criticism of a specific paper.`);
say();
say("## Research");
say();
say(`The research corpus is ${paperRoutes.length} documents across ${topics.length} topics, including work that failed. Killed candidates are published with the same rigour as surviving ones.`);
say();
for (const t of topics) say(t);
say();
say("## Machine-readable");
say();
say(`- [Sitemap](${ORIGIN}/sitemap.xml): all ${routes.length} indexable routes.`);
say(`- [Full text](${ORIGIN}/llms-full.txt): every research document, engineering note and paper abstract concatenated into one file, so a model can read the whole corpus without sampling it.`);
say(`- [Paper state](${ORIGIN}/paper-state.json): the live record as JSON, the source every page renders from.`);
say(`- [Research index](${ORIGIN}/research-index.json): ${researchIndex.count ?? paperRoutes.length} documents with citation metadata.`);
say(`- [Engineering manifest](${ORIGIN}/glassbox/engineering_open_source.json): repository counts, derived from what each repository publishes.`);
say(`- ${measurementRoutes.length} measurement pages and ${trialRoutes.length} trial pages carry schema.org Dataset metadata.`);
say();
say("## Authorship");
say();
say(
  `Arhan Canli is the founder, named author and accountable human for methodology, claims, ` +
  `corrections and publication decisions. Profile: ${ORIGIN}/founder. Code: ` +
  `https://github.com/arhancanli. Development uses reviewed AI-assisted tooling; ownership, ` +
  `research decisions and published claims are his.`,
);
say();

const body = lines.join("\n");
writeFileSync(OUT, body);

// =============================================================================
// llms-full.txt
// -----------------------------------------------------------------------------
// llms.txt is a map. This is the territory: every research document, every
// engineering note and every archived abstract concatenated into one fetch.
//
// WHY IT EXISTS. A model asked about this site will otherwise crawl a sample of
// 275 URLs and reason from whatever subset it happened to reach. The corpus here
// is 111 research documents, and the ones most worth reading are the failures,
// which are exactly the pages a crawler ranks lowest and samples last. Publishing
// the whole thing in one file removes sampling from the equation.
//
// WHY IT REPEATS THE INDEX FIRST. The claim boundary has to survive truncation.
// A model that reads only the first few kilobytes of a 700 KB file must still
// come away knowing the record is paper-traded, so the boundary block is the
// first thing in the file and it is the SAME string llms.txt publishes -- not a
// copy that can drift, but the same generated lines.
// =============================================================================

const full = [];
const fullSay = (line = "") => full.push(line);

fullSay("# Canli Capital: full text corpus");
fullSay();
fullSay(
  "This file is the complete text of the research published at " + ORIGIN + ", assembled in one " +
  "document. The index below is identical to " + ORIGIN + "/llms.txt. Every document after it is " +
  "reproduced in full from the same markdown the website renders.",
);
fullSay();
fullSay("---");
fullSay();
fullSay(body);
fullSay();
fullSay("---");
fullSay();
const RULE = "=".repeat(78);
const section = (heading) => { fullSay(); fullSay(RULE); fullSay(heading.toUpperCase()); fullSay(RULE); fullSay(); };
const document = (url) => { fullSay(); fullSay("-".repeat(78)); fullSay(`SOURCE: ${url}`); fullSay("-".repeat(78)); fullSay(); };

section(`Full text: ${notes.length} engineering notes, then the research corpus`);

for (const n of notes) {
  document(`${ORIGIN}/notes/${n.slug}`);
  fullSay(readFileSync(resolve(ROOT, "notes", `${n.slug}.md`), "utf8").trim());
  fullSay();
}

// The research corpus, in full, read from the same markdown the site publishes at
// /research/<slug>.md so this file cannot contain a document the site does not.
const researchDir = resolve(ROOT, "public/research");
const researchFiles = readdirSync(researchDir).filter((f) => f.endsWith(".md")).sort();
if (researchFiles.length !== paperRoutes.length) {
  throw new Error(
    `llms-full.txt: ${researchFiles.length} markdown sources but ${paperRoutes.length} research routes in the sitemap. ` +
    "One of them is publishing a document the other does not.",
  );
}
section(`Research corpus: ${researchFiles.length} documents, including every failed candidate`);
for (const file of researchFiles) {
  document(`${ORIGIN}/research/${file.slice(0, -3)}`);
  fullSay(readFileSync(resolve(researchDir, file), "utf8").trim());
  fullSay();
}

// Archived working papers: the abstract and the checksums, not the body. The body
// is byte-preserved HTML whose hash is published; inlining it here would create a
// second copy that no manifest pins, and a model quoting the copy could not tell
// whether it matched the archive.
const registry = read("public/glassbox/external_publication_registry.json");
section(`Archived working papers: ${registry.sleeves.length} abstracts`);
fullSay(
  "Preprints, not peer reviewed, with no DOI and no independent replication. Each paper is " +
  "byte-preserved and its checksums are published beside it. The abstract is reproduced here; " +
  "the body is not, because a copy of it in this file would not hash to the checksum the bundle " +
  "publishes, and an uncheckable copy of a document whose whole point is that it is checkable is " +
  "worse than a link.",
);
fullSay();
for (const sleeve of registry.sleeves) {
  const dir = sleeve.bundle_manifest.replace(/\/bundle_manifest\.json$/, "");
  const meta = read(`public/${dir}/paper.json`);
  document(`${ORIGIN}/${dir}`);
  fullSay(`# ${meta.title}`);
  fullSay();
  fullSay(`Published ${meta.date}. Paper: ${ORIGIN}/${dir}/paper . PDF: ${ORIGIN}/${dir}/paper.pdf`);
  fullSay();
  if (meta.abstract) { fullSay(meta.abstract.trim()); fullSay(); }
  if (meta.claim_boundary) { fullSay(`Claim boundary: ${meta.claim_boundary.trim()}`); fullSay(); }
}

const fullBody = full.join("\n");
writeFileSync(resolve(ROOT, "public", "llms-full.txt"), fullBody);
console.log(
  `  llms-full.txt  ${(fullBody.length / 1024).toFixed(0)} KB, ` +
  `${researchFiles.length} research documents, ${notes.length} notes, ${registry.sleeves.length} abstracts`,
);
console.log(`  llms.txt  ${body.split("\n").length} lines, ${routes.length} routes, ${topics.length} topics, ${engineering.extractions.length + 1} repositories`);
