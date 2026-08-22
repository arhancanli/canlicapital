// =============================================================================
// CANLI CAPITAL / scripts/verify-papers.mjs
// -----------------------------------------------------------------------------
// Checks the BUILT site, not the source, because the failure this guards against
// is invisible in source: thirty-four research documents were shipped for months
// with no HTML page and no sitemap entry, and everything looked fine locally the
// whole time. Every assertion below is made against dist/.
//
// Run after `npm run build`. Exits non-zero on any failure.
// =============================================================================

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const ORIGIN = "https://canlicapital.com";

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

if (!existsSync(DIST)) {
  console.error("dist/ does not exist -- run `npm run build` first");
  process.exit(1);
}

const sources = readdirSync(resolve(ROOT, "public/research")).filter((n) => n.endsWith(".md"));
const pages = existsSync(resolve(DIST, "research"))
  ? readdirSync(resolve(DIST, "research")).filter((n) => n.endsWith(".html"))
  : [];
// Topic hubs are CollectionPage, not ScholarlyArticle, and carry a different canonical path.
// Checked SEPARATELY rather than exempted: an exemption is how a page stops being checked at all.
const hubs = existsSync(resolve(DIST, "research", "topics"))
  ? readdirSync(resolve(DIST, "research", "topics")).filter((n) => n.endsWith(".html"))
  : [];

// A guard whose inputs are empty passes silently, which is the shape of the defect itself.
check(sources.length > 0, "no research documents found in public/research");
check(pages.length > 0, "no rendered research pages found in dist/research");

// 1. Every document has a page.
for (const source of sources) {
  const slug = basename(source, ".md");
  check(
    pages.includes(`${slug}.html`),
    `${source} has no rendered page: it would be published as raw markdown, unindexable`,
  );
}

// 2. Every page carries the metadata that makes it a document rather than a file.
const sitemap = readFileSync(resolve(DIST, "sitemap.xml"), "utf8");
for (const page of pages) {
  const slug = basename(page, ".html");
  const html = readFileSync(resolve(DIST, "research", page), "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/);
  const description = html.match(/<meta name="description" content="([^"]*)"/);

  check(Boolean(title && title[1].trim()), `${page} has no <title>`);
  check(
    Boolean(description && description[1].trim().length >= 60),
    `${page} has no usable meta description`,
  );
  check(
    html.includes(`<link rel="canonical" href="${ORIGIN}/research/${slug}"`),
    `${page} has no canonical URL`,
  );
  check(html.includes('"@type":"ScholarlyArticle"'), `${page} has no ScholarlyArticle schema`);
  check(
    html.includes(`"@id":"${ORIGIN}/#arhan-canli"`),
    `${page} does not attribute authorship to the Person entity`,
  );
  check(html.includes('property="og:title"'), `${page} has no Open Graph title`);

  // 3. Every page is in the sitemap. This is the specific thing that was wrong.
  check(
    sitemap.includes(`<loc>${ORIGIN}/research/${slug}</loc>`),
    `${slug} is not in sitemap.xml, so it will not be discovered`,
  );

  // 4. The stylesheet resolved. A wrong relative depth renders an unstyled page in
  //    production only, which no local check of the source would show.
  const stylesheetTags = html.match(/<link\b[^>]*>/g) || [];
  const linksBuiltStylesheet = stylesheetTags.some(
    (tag) => /rel="stylesheet"/.test(tag) && /href="\/assets\/paper-[^"]+\.css"/.test(tag),
  );
  check(
    linksBuiltStylesheet,
    `${page} does not link a built stylesheet -- it would render unstyled in production`,
  );
}

// 4b. Every topic hub is a real page: metadata, its own canonical, and in the sitemap.
check(hubs.length > 0, "no topic hubs found in dist/research/topics — the taxonomy did not build");
// Every essay paragraph on every hub, so a paragraph reused across two hubs is caught rather
// than read as two pages of content.
const essaySeen = new Map();

for (const hub of hubs) {
  const slug = basename(hub, ".html");
  const html = readFileSync(resolve(DIST, "research", "topics", hub), "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/);
  const description = html.match(/<meta name="description" content="([^"]*)"/);

  check(Boolean(title && title[1].trim()), `topic ${slug} has no <title>`);
  check(
    Boolean(description && description[1].trim().length >= 60),
    `topic ${slug} has no usable meta description`,
  );
  check(
    html.includes(`<link rel="canonical" href="${ORIGIN}/research/topics/${slug}"`),
    `topic ${slug} has no canonical URL`,
  );
  check(html.includes('"@type":"CollectionPage"'), `topic ${slug} has no CollectionPage schema`);
  check(
    sitemap.includes(`<loc>${ORIGIN}/research/topics/${slug}</loc>`),
    `topic ${slug} is not in sitemap.xml, so it will not be discovered`,
  );
  // A hub whose members are not linked from it is a doorway page.
  const links = (html.match(/href="\/research\/[a-z0-9-]+"/g) || []).length;
  check(links >= 3, `topic ${slug} links only ${links} papers — a hub that thin is a doorway page`);

  // A hub that carries links and nothing else is a doorway page whatever its schema says. Each
  // must open with real subject content: what the mechanism is, what the literature supports,
  // what this book found.
  const body = html.match(/<div class="paper__body">([\s\S]*?)<h2 class="hub__heading">/);
  check(body !== null, `topic ${slug} has no essay before its document list`);
  if (body) {
    const paragraphs = [...body[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0);
    // The standfirst does not count toward the essay: it existed before and is what this check
    // was written because of.
    const essay = paragraphs.slice(1);
    check(
      essay.length >= 3,
      `topic ${slug} opens with ${essay.length} essay paragraphs — under the three it needs`,
    );
    const words = essay.join(" ").split(/\s+/).filter(Boolean).length;
    check(words >= 180, `topic ${slug} essay is only ${words} words — too thin to rank or to read`);
    for (const paragraph of essay) {
      const seenOn = essaySeen.get(paragraph);
      // The anti-template check. The moment one paragraph can appear on two hubs, these become
      // boilerplate with the subject noun swapped, and they would deserve to rank for nothing.
      check(
        seenOn === undefined,
        `topic ${slug} shares an essay paragraph with ${seenOn} — templated, not written`,
      );
      essaySeen.set(paragraph, slug);
    }
  }
}

check(
  essaySeen.size >= 39,
  `only ${essaySeen.size} distinct essay paragraphs across all hubs — the extractor has stopped ` +
    `matching and every essay check above would pass vacuously`,
);

// 5. The library index the hub page renders from covers the whole corpus.
const index = JSON.parse(readFileSync(resolve(DIST, "research-index.json"), "utf8"));
check(
  index.papers.length === pages.length,
  `research-index.json lists ${index.papers.length} papers but ${pages.length} pages exist`,
);

// ---------------------------------------------------------------------------
// 6. MEASUREMENT PAGES. The same defect class as the papers, on a different
//    corpus: twenty-one artifacts were published as raw JSON that nothing
//    rendered and nothing linked. The check runs against the SAME discovery rule
//    the builder uses, applied here to the SHIPPED research.json, so a page that
//    stops being generated fails here rather than going quietly missing.
// ---------------------------------------------------------------------------
const isArtifact = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  ("claim_boundary" in value ||
    (typeof value.schema === "string" && value.schema.startsWith("canli.")));

const discoverArtifacts = (research) => {
  const found = [];
  for (const [key, value] of Object.entries(research)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    if (isArtifact(value)) {
      found.push(key);
      continue;
    }
    for (const [childKey, childValue] of Object.entries(value)) {
      if (isArtifact(childValue)) found.push(`${key}.${childKey}`);
    }
  }
  return found.sort();
};

const research = JSON.parse(readFileSync(resolve(DIST, "glassbox/research.json"), "utf8"));
const artifacts = discoverArtifacts(research);
const measurementPages = existsSync(resolve(DIST, "measurements"))
  ? readdirSync(resolve(DIST, "measurements")).filter((n) => n.endsWith(".html"))
  : [];

// A floor, for the same reason the papers have one: an empty corpus makes every assertion below
// pass without checking anything, which is the exact shape of the bug being guarded.
check(
  artifacts.length >= 12,
  `discovery found only ${artifacts.length} artifacts in research.json — the rule has stopped ` +
    `matching and every check below would pass vacuously`,
);
check(
  measurementPages.length === artifacts.length,
  `${artifacts.length} artifacts in research.json but ${measurementPages.length} measurement pages`,
);

const measurementIndex = resolve(DIST, "measurements.html");
check(existsSync(measurementIndex), "no /measurements index page was built");
const indexHtml = existsSync(measurementIndex) ? readFileSync(measurementIndex, "utf8") : "";

for (const path of artifacts) {
  const slug = path.replace(/[._]/g, "-").toLowerCase();
  const file = resolve(DIST, "measurements", `${slug}.html`);
  check(existsSync(file), `artifact ${path} has no page at /measurements/${slug}`);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, "utf8");
  check(
    html.includes(`<link rel="canonical" href="${ORIGIN}/measurements/${slug}"`),
    `measurement ${slug} has no self-canonical`,
  );
  check(/"@type":"Dataset"/.test(html), `measurement ${slug} is not marked up as a Dataset`);
  // The whole reason these pages exist: a number without its limits is the failure this record
  // is built to avoid, so the boundary block is not optional.
  check(
    html.includes("What this measurement does and does not claim"),
    `measurement ${slug} renders no claim boundary`,
  );
  check(
    sitemap.includes(`<loc>${ORIGIN}/measurements/${slug}</loc>`),
    `measurement ${slug} is not in the sitemap`,
  );
  // Two clicks from /research: the index links every page, and /research links the index.
  check(
    indexHtml.includes(`href="/measurements/${slug}"`),
    `measurement ${slug} is not linked from the /measurements index — it is an orphan`,
  );
}

check(
  sitemap.includes(`<loc>${ORIGIN}/measurements</loc>`),
  "the /measurements index is not in the sitemap",
);

// ---------------------------------------------------------------------------
// 7. THE END-TO-END WALK on /systems. Its whole claim is that the six stages
//    connect and that you can CHECK each one, so a proof link that 404s is worse
//    than no link: it invites the reader to verify and then wastes the attempt.
//    Every stage must be present and every link must resolve to a built page.
// ---------------------------------------------------------------------------
const systemsHtml = readFileSync(resolve(DIST, "systems.html"), "utf8");
const custody = systemsHtml.match(/<ol class="sys-custody">[\s\S]*?<\/ol>/);
check(custody !== null, "/systems has no end-to-end walk");
if (custody) {
  const stages = [...custody[0].matchAll(/class="sys-custody__stage[^"]*">([^<]+)</g)].map((m) =>
    m[1].trim(),
  );
  // Named rather than counted: a walk that silently dropped "Execution" would still be six rows
  // long if someone split another stage in two.
  for (const stage of ["Lake", "Factor", "Portfolio", "Overlay", "Execution", "Publication"]) {
    check(
      stages.some((s) => s.includes(stage)),
      `the end-to-end walk has no ${stage} stage — it no longer walks the whole path`,
    );
  }
  const proofLinks = [...custody[0].matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]);
  check(
    proofLinks.length >= stages.length,
    `${stages.length} stages but only ${proofLinks.length} proof links — a stage proves nothing`,
  );
  for (const href of new Set(proofLinks)) {
    check(
      existsSync(resolve(DIST, `${href.replace(/^\//, "")}.html`)),
      `the end-to-end walk links ${href}, which is not a built page`,
    );
  }
  // Each row must carry its own proof, or the links are decorating the strong rows and the
  // weak ones are unevidenced.
  const rows = (custody[0].match(/class="sys-custody__row"/g) || []).length;
  const proofs = (custody[0].match(/class="sys-custody__proof"/g) || []).length;
  check(rows === proofs, `${rows} stages but ${proofs} carry a proof link`);
}

// ---------------------------------------------------------------------------
// 8. /verify — the page that tells an outsider how to check this record. Its
//    failure mode is specific and nasty: an instruction that does not work is
//    worse than no instruction, because the reader spends their one attempt on
//    it and concludes the record is fake rather than the page stale. So every
//    file the commands name must exist on the published site, and every link on
//    the page must resolve. A dead link was already caught here once, to a topic
//    hub that is not built because it has too few members.
// ---------------------------------------------------------------------------
const verifyFile = resolve(DIST, "verify.html");
check(existsSync(verifyFile), "no /verify page was built");
if (existsSync(verifyFile)) {
  const verifyHtml = readFileSync(verifyFile, "utf8");

  for (const level of ["l1", "l2", "l3"]) {
    check(verifyHtml.includes(`id="${level}"`), `/verify has no ${level.toUpperCase()} section`);
  }
  // The honest half. A verification page that lists only what it establishes is marketing, and
  // this section is the first thing that would be quietly dropped.
  check(verifyHtml.includes('id="limits"'), "/verify no longer says what it cannot prove");
  check(
    /paper|no real capital/i.test(verifyHtml),
    "/verify does not state that this book trades on paper",
  );

  // Every glassbox file the commands tell a reader to download must actually be published.
  // Two forms, and the second is the one that matters: a literal glassbox/<name> path, and the
  // stems inside `for f in ... ; do`, which is how the bulk download is written.
  const named = new Set(
    [...verifyHtml.matchAll(/glassbox\/([A-Za-z0-9_.-]+)/g)]
      .map((m) => m[1])
      .filter((n) => n !== "$f.json"),
  );
  for (const loop of verifyHtml.matchAll(/for f in\s*\\?([\s\S]*?);\s*do/g)) {
    for (const stem of loop[1].split(/[\s\\]+/).filter(Boolean)) named.add(`${stem}.json`);
  }
  check(named.size >= 10, `/verify names only ${named.size} downloadable files — the command list `
    + `has stopped rendering and the checks below would pass vacuously`);
  for (const name of named) {
    const file = name.includes(".") ? name : `${name}.json`;
    check(
      existsSync(resolve(DIST, "glassbox", file)),
      `/verify tells the reader to download glassbox/${file}, which is not published`,
    );
  }
  // The kit's own verifier and the chain verifier are the two executables the page hands out.
  for (const script of ["reproduce.py", "verify_transparency.py"]) {
    check(
      existsSync(resolve(DIST, "glassbox", script)),
      `/verify references ${script}, which is not published`,
    );
  }

  // Every internal link on the page resolves to a built file.
  for (const href of new Set([...verifyHtml.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]))) {
    const target = href.replace(/^\//, "");
    const ok =
      target === "" ||
      existsSync(resolve(DIST, `${target}.html`)) ||
      existsSync(resolve(DIST, target));
    check(ok, `/verify links ${href}, which is not a built page`);
  }

  check(
    sitemap.includes(`<loc>${ORIGIN}/verify</loc>`),
    "/verify is not in the sitemap, so it will not be discovered",
  );
  // Linked from the homepage and the glass box, statically. The shared nav is assembled at
  // runtime, so a link that exists only there is invisible to a crawler reading the HTML.
  for (const page of ["index.html", "open.html"]) {
    check(
      readFileSync(resolve(DIST, page), "utf8").includes('href="/verify"'),
      `/${page.replace(".html", "")} has no static link to /verify`,
    );
  }
}

// ---------------------------------------------------------------------------
// 9. /founder — the page behind the Person entity that every paper resolves its
//    authorship to. Three things have to hold: the entity actually points here,
//    every number on it is derivable from a published artifact, and it makes no
//    claim that cannot be checked. The last one is the discipline the page is
//    built on, so it is enforced rather than trusted.
// ---------------------------------------------------------------------------
const founderFile = resolve(DIST, "founder.html");
check(existsSync(founderFile), "no /founder page was built");
if (existsSync(founderFile)) {
  const founderHtml = readFileSync(founderFile, "utf8");
  const personId = `${ORIGIN}/#arhan-canli`;

  check(founderHtml.includes('"@type":"ProfilePage"'), "/founder is not marked up as a ProfilePage");
  check(founderHtml.includes(`"@id":"${personId}"`), "/founder does not carry the Person @id");
  check(
    founderHtml.includes(`"mainEntityOfPage":"${ORIGIN}/founder"`),
    "/founder is not declared as the Person's main entity page",
  );
  // The defect this page exists to fix: the homepage declared the entity and resolved it to
  // itself, so eighty-two authorship claims led to a page that never described the author.
  const homeHtml = readFileSync(resolve(DIST, "index.html"), "utf8");
  check(
    homeHtml.includes(`"url": "${ORIGIN}/founder"`),
    "the homepage Person entity does not resolve to /founder",
  );
  check(homeHtml.includes('href="/founder"'), "the homepage has no static link to /founder");

  // Every measurement-shaped number must be derivable from a published artifact, and the set of
  // allowed values is derived INDEPENDENTLY here from named fields rather than by walking whole
  // artifacts. The first version did walk them, and it was nearly vacuous: those files carry
  // thousands of numbers, so a stale corpus count of 84 against a true 82 matched something
  // somewhere and passed. A trace check whose allowed set is that large is not a trace check.
  const killLog = JSON.parse(readFileSync(resolve(DIST, "glassbox", "kill_log.json"), "utf8"));
  const trialLedger = JSON.parse(readFileSync(resolve(DIST, "glassbox", "trial_ledger.json"), "utf8"));
  const chainLog = JSON.parse(readFileSync(resolve(DIST, "glassbox", "transparency_log.json"), "utf8"));
  const founderCommitment = JSON.parse(
    readFileSync(resolve(DIST, "glassbox", "founder_commitment.json"), "utf8"),
  );
  const trackRecord = JSON.parse(readFileSync(resolve(DIST, "glassbox", "track_record.json"), "utf8"));
  const countBuilt = (...parts) =>
    readdirSync(resolve(DIST, ...parts)).filter((n) => n.endsWith(".html")).length;

  const derived = [
    countBuilt("research"),
    countBuilt("research", "topics"),
    countBuilt("measurements"),
    killLog.killed_count,
    killLog.screen_killed_count,
    killLog.survived_count,
    killLog.killed_count + killLog.screen_killed_count,
    trialLedger.distinct_hypothesis_identities,
    trialLedger.hypothesis_identity_budget,
    chainLog.entries.length,
    trackRecord.live_days_accrued,
    founderCommitment.amount_usd,
  ];
  const renderings = new Set();
  for (const value of derived) {
    check(
      typeof value === "number" && Number.isFinite(value) && value > 0,
      `a fact /founder derives came back empty (${value}) — the check below would pass vacuously`,
    );
    renderings.add(String(value));
    renderings.add(value.toLocaleString("en-US"));
  }
  for (const date of [chainLog.entries[0].date, trackRecord.go_live_date]) renderings.add(date);

  const prose = founderHtml
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<head>[\s\S]*?<\/head>/g, " ")
    .replace(/<pre[\s\S]*?<\/pre>/g, " ");
  const datesRemoved = prose.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) =>
    renderings.has(d) ? " " : ` UNTRACEABLE_DATE_${d} `,
  );
  check(
    !datesRemoved.includes("UNTRACEABLE_DATE_"),
    `/founder quotes a date that is in no artifact: ` +
      `${(datesRemoved.match(/UNTRACEABLE_DATE_[\d-]+/g) || []).join(", ")}`,
  );
  const numbers = new Set((datesRemoved.match(/\b\d[\d,]*\b/g) || []).filter((n) => n.length > 1));
  const untraceable = [...numbers].filter((n) => !renderings.has(n));
  check(
    untraceable.length === 0,
    `/founder quotes numbers that are in no artifact: ${untraceable.join(", ")}`,
  );
  check(numbers.size >= 8, `/founder quotes only ${numbers.size} figures — the derivation has ` +
    `stopped rendering and the trace check above would pass vacuously`);

  // No credential may appear, because a credential is a claim a reader would have to take on
  // trust and this record's whole argument is that they should not have to. Checked against the
  // SHAPE of such a claim, not a word list the page could be rephrased around.
  for (const pattern of [
    /\b(?:PhD|Ph\.D|MSc|M\.Sc|MBA|BSc|B\.Sc)\b/,
    /\bgraduat(?:ed|e) (?:from|of)\b/i,
    /\b(?:formerly|previously) (?:at|with)\b/i,
    /\byears of experience\b/i,
    /\bawarded\b/i,
  ]) {
    check(
      !pattern.test(prose),
      `/founder makes an uncheckable credential claim matching ${pattern} — the page is built on ` +
        `not doing that`,
    );
  }

  for (const href of new Set([...founderHtml.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]))) {
    const target = href.replace(/^\//, "");
    const ok =
      target === "" ||
      existsSync(resolve(DIST, `${target}.html`)) ||
      existsSync(resolve(DIST, target));
    check(ok, `/founder links ${href}, which is not a built page`);
  }
  check(
    sitemap.includes(`<loc>${ORIGIN}/founder</loc>`),
    "/founder is not in the sitemap, so it will not be discovered",
  );
}

const sitemapUrls = (sitemap.match(/<loc>/g) || []).length;
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `verified ${pages.length} research pages: title, description, canonical, ScholarlyArticle, ` +
    `author entity, Open Graph, stylesheet, sitemap entry`,
);
console.log(
  `verified ${hubs.length} topic hubs: title, description, canonical, CollectionPage, ` +
    `sitemap entry, at least three linked members, and an opening essay of at least three ` +
    `paragraphs (${essaySeen.size} distinct paragraphs, none shared between hubs)`,
);
console.log(
  `verified ${measurementPages.length} measurement pages: one per artifact discovered in ` +
    `research.json, each with a self-canonical, Dataset markup, a rendered claim boundary, ` +
    `a sitemap entry, and a link from the index`,
);
console.log(
  `verified the /systems end-to-end walk: six named stages, one proof link each, all resolving`,
);
console.log(
  `verified /verify: three levels, every named download published, every link resolving, ` +
    `the limits section present, and static links from the homepage and the glass box`,
);
console.log(
  `verified /founder: ProfilePage carrying the Person @id, resolving from the homepage, every ` +
    `figure traceable to an artifact, and no uncheckable credential claim`,
);
console.log(`sitemap covers ${sitemapUrls} URLs`);
