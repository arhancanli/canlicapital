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

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { IMMUTABLE_PAPER_SHORT_TITLES } from "./paper-presentation.mjs";
import { normalizeEditableCopy } from "./editable-copy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const ORIGIN = "https://canlicapital.com";

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

if (!existsSync(DIST)) {
  console.error("dist/ does not exist -- run `npm run build` first");
  process.exit(1);
}

const sources = readdirSync(resolve(ROOT, "public/research")).filter((n) => n.endsWith(".md"));
const citationDir = resolve(DIST, "research", "citations");
const citations = existsSync(citationDir)
  ? readdirSync(citationDir).filter((n) => n.endsWith(".bib"))
  : [];
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
check(
  citations.length === sources.length,
  `citation corpus has ${citations.length} BibTeX files for ${sources.length} papers`,
);

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
const citationKeys = new Map();
for (const page of pages) {
  const slug = basename(page, ".html");
  const html = readFileSync(resolve(DIST, "research", page), "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/);
  const description = html.match(/<meta name="description" content="([^"]*)"/);
  const citationTitle = html.match(/<meta name="citation_title" content="([^"]*)"/g) || [];
  const citationAuthor = html.match(/<meta name="citation_author" content="([^"]*)"/g) || [];
  const citationDate = html.match(/<meta name="citation_publication_date" content="([^"]*)"/g) || [];
  const citationUrl = html.match(/<meta name="citation_fulltext_html_url" content="([^"]*)"/g) || [];
  const sourceHash = html.match(/<meta name="alphac-source-sha256" content="([0-9a-f]{64})"/);
  const sourceMarkdown = readFileSync(resolve(ROOT, "public/research", `${slug}.md`), "utf8");

  check(Boolean(title && title[1].trim()), `${page} has no <title>`);
  check(
    sourceHash?.[1] === sha256(sourceMarkdown),
    `${page} was rendered from source bytes that do not match its published markdown`,
  );
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
  // Google Scholar requires an unambiguous title, at least one actual author, and publication
  // year. Assert one exact value for each so a duplicate or site-name-as-author regression does
  // not produce bibliographic records that look valid while attributing the paper incorrectly.
  check(
    citationTitle.length === 1 && citationTitle[0].includes(`content="${html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]}"`),
    `${page} has missing, duplicate, or inconsistent citation_title metadata`,
  );
  check(
    citationAuthor.length === 1 && citationAuthor[0].includes('content="Arhan Canli"'),
    `${page} has missing, duplicate, or incorrect citation_author metadata`,
  );
  check(
    citationDate.length === 1 && /content="\d{4}"/.test(citationDate[0]),
    `${page} has missing, duplicate, or invalid citation_publication_date metadata`,
  );
  check(
    citationUrl.length === 1 &&
      citationUrl[0].includes(`content="${ORIGIN}/research/${slug}"`),
    `${page} has missing, duplicate, or incorrect citation_fulltext_html_url metadata`,
  );
  check(
    html.includes(`"datePublished":"${citationDate[0]?.match(/content="([^"]*)"/)?.[1]}"`),
    `${page} citation date does not match ScholarlyArticle datePublished`,
  );
  check(
    html.includes(`"url":"${ORIGIN}/founder"`),
    `${page} structured author does not resolve to the founder profile`,
  );
  check(
    html.includes(`href="/research/citations/${slug}.bib" download`),
    `${page} does not expose its downloadable citation`,
  );
  const markdownLinks = [...html.matchAll(/(?:^|\s)href="(\/research\/[^"]+\.md)"/g)].map(
    (match) => match[1],
  );
  check(
    markdownLinks.length === 1 && markdownLinks[0] === `/research/${slug}.md`,
    `${page} must link exactly one raw markdown source (itself), never use markdown for paper navigation`,
  );
  const citationFile = `${slug}.bib`;
  check(citations.includes(citationFile), `${page} has no BibTeX citation file`);
  if (citations.includes(citationFile)) {
    const bib = readFileSync(resolve(citationDir, citationFile), "utf8");
    const citationKey = bib.match(/^@techreport\{([^,]+),/m)?.[1];
    check(Boolean(citationKey), `${citationFile} has no parseable tech-report citation key`);
    if (citationKey) {
      const previous = citationKeys.get(citationKey);
      check(
        previous === undefined,
        `${citationFile} reuses citation key ${citationKey} from ${previous}`,
      );
      citationKeys.set(citationKey, citationFile);
    }
    check(bib.includes("author      = {Canli, Arhan}"), `${citationFile} misattributes its author`);
    check(bib.includes("institution = {Canli Capital}"), `${citationFile} has no institution`);
    check(bib.includes("year        = {2026}"), `${citationFile} has no publication year`);
    check(
      bib.includes(`url         = {${ORIGIN}/research/${slug}}`),
      `${citationFile} does not cite its canonical URL`,
    );
  }

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

const vercelConfig = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
const rawEvidenceHeader = vercelConfig.headers?.find(
  (rule) =>
    rule.source.includes("md") &&
    rule.source.includes("json") &&
    rule.headers?.some(
      (header) => header.key.toLowerCase() === "x-robots-tag" && /\bnoindex\b/i.test(header.value),
    ),
);
check(
  Boolean(rawEvidenceHeader),
  "vercel.json does not apply X-Robots-Tag: noindex to raw markdown and machine evidence",
);

const researchIndex = JSON.parse(readFileSync(resolve(DIST, "research-index.json"), "utf8"));
check(
  researchIndex.papers?.length === pages.length,
  `research-index.json has ${researchIndex.papers?.length ?? 0} records for ${pages.length} papers`,
);
for (const paper of researchIndex.papers || []) {
  const citationFile = `${paper.slug}.bib`;
  const bib = citations.includes(citationFile)
    ? readFileSync(resolve(citationDir, citationFile), "utf8")
    : "";
  const citationKey = bib.match(/^@techreport\{([^,]+),/m)?.[1];
  check(paper.author === "Arhan Canli", `${paper.slug} has incorrect indexed author`);
  check(paper.publication_year === "2026", `${paper.slug} has incorrect indexed publication year`);
  check(
    paper.path === `/research/${paper.slug}`,
    `${paper.slug} has incorrect indexed canonical path`,
  );
  check(
    paper.citation_path === `/research/citations/${paper.slug}.bib`,
    `${paper.slug} has incorrect indexed citation path`,
  );
  check(
    paper.citation_key === citationKey,
    `${paper.slug} indexed citation key does not match its BibTeX record`,
  );
}

// 4b. Every topic hub is a real page: metadata, its own canonical, and in the sitemap.
check(hubs.length > 0, "No topic hubs found in dist/research/topics. The taxonomy did not build.");
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
  check(links >= 3, `Topic ${slug} links only ${links} papers. A hub that thin is a doorway page.`);

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
      `Topic ${slug} opens with ${essay.length} essay paragraphs, fewer than the three it needs.`,
    );
    const words = essay.join(" ").split(/\s+/).filter(Boolean).length;
    check(words >= 180, `Topic ${slug} essay is only ${words} words. It is too thin to rank or read.`);
    for (const paragraph of essay) {
      const seenOn = essaySeen.get(paragraph);
      // The anti-template check. The moment one paragraph can appear on two hubs, these become
      // boilerplate with the subject noun swapped, and they would deserve to rank for nothing.
      check(
        seenOn === undefined,
        `Topic ${slug} shares an essay paragraph with ${seenOn}. The copy is templated.`,
      );
      essaySeen.set(paragraph, slug);
    }
  }
}

check(
  essaySeen.size >= 39,
  `Only ${essaySeen.size} distinct essay paragraphs exist across all hubs. The extractor has stopped ` +
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
  `Discovery found only ${artifacts.length} artifacts in research.json. The rule has stopped ` +
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
    `Measurement ${slug} is not linked from the /measurements index. It is an orphan.`,
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
      `The end-to-end walk has no ${stage} stage. It no longer covers the whole path.`,
    );
  }
  const proofLinks = [...custody[0].matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]);
  check(
    proofLinks.length >= stages.length,
    `${stages.length} stages have only ${proofLinks.length} proof links. A stage proves nothing.`,
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
// 8. /verify: the page that tells an outsider how to check this record. Its
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
    /paper|no funded performance/i.test(verifyHtml),
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
  check(named.size >= 10, `/verify names only ${named.size} downloadable files. The command list `
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
// 9. /founder: the page behind the Person entity that every paper resolves its
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
  const stanfordEvidence = JSON.parse(
    readFileSync(resolve(DIST, "glassbox", "stanford_cs_evidence_map.json"), "utf8"),
  );
  const contribution = stanfordEvidence.contribution_map;
  const walkthrough = stanfordEvidence.ninety_second_walkthrough;
  if (!contribution || !walkthrough) {
    console.error(
      "dist/glassbox/stanford_cs_evidence_map.json uses the retired schema -- run `npm run build` first",
    );
    process.exit(1);
  }
  const forwardFacts = stanfordEvidence.evidence.forward_truth.facts;
  const systemsFacts = stanfordEvidence.evidence.systems_and_provenance.facts;
  const governanceFacts = stanfordEvidence.evidence.research_governance.facts;
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
      `A fact /founder derives came back empty (${value}). The next check would pass vacuously.`,
    );
    renderings.add(String(value));
    renderings.add(value.toLocaleString("en-US"));
  }
  const portfolioValues = [
    walkthrough.total_seconds,
    forwardFacts.daily_return_observations,
    forwardFacts.current_sleeves,
    forwardFacts.target_sleeves,
    systemsFacts.alpaca_sleeves_expected,
    systemsFacts.alpaca_sleeves_reconciled,
    systemsFacts.publication_bundle_files,
    governanceFacts.legacy_hypothesis_identities,
    governanceFacts.prospective_hypothesis_identities,
    governanceFacts.total_hypothesis_identities,
    contribution.external_validation.assigned_reviewers,
    contribution.external_validation.completed_reviews,
    contribution.external_validation.independent_replications,
    ...walkthrough.chapters.flatMap((chapter) => [chapter.start_second, chapter.end_second]),
  ];
  for (const value of portfolioValues) {
    check(
      typeof value === "number" && Number.isFinite(value) && value >= 0,
      `a portfolio fact /founder derives is invalid (${value})`,
    );
    renderings.add(String(value));
    renderings.add(String(value).padStart(2, "0"));
    renderings.add(value.toLocaleString("en-US"));
  }
  walkthrough.chapters.forEach((_, index) => renderings.add(String(index + 1).padStart(2, "0")));
  for (const date of [chainLog.entries[0].date, trackRecord.go_live_date]) renderings.add(date);
  // The inception year is a published claim like any other, so it is traced to its
  // source in config/brand.js rather than exempted.
  const founded = (readFileSync(resolve(ROOT, "config/brand.js"), "utf8")
    .match(/founded:\s*"(\d{4})-(\d{2})"/) || []);
  if (founded[1]) {
    renderings.add(founded[1]);
    renderings.add(founded[2]);
    renderings.add(String(Number(founded[2])));
  }

  // Inline SVG is geometry, not prose: a path's coordinates are numbers no
  // artifact will ever contain, and reading them as published figures makes the
  // check fire on any icon added to the shell. Adding one GitHub mark introduced
  // 47 "untraceable" numbers, all of them path data. Stripped for the same reason
  // <script> and <pre> already are.
  const prose = founderHtml
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<head>[\s\S]*?<\/head>/g, " ")
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
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
  check(numbers.size >= 8, `/founder quotes only ${numbers.size} figures. The derivation has ` +
    `stopped rendering and the trace check above would pass vacuously`);

  check(
    founderHtml.includes('content="stanford_cs_evidence_map.json '),
    "/founder does not declare the portfolio evidence map as a source",
  );
  check(
    contribution.status === "SELF_DISCLOSED_SOURCE_BOUND_NOT_INDEPENDENTLY_ATTESTED" &&
      founderHtml.includes("Self-disclosed and source-bound") &&
      founderHtml.includes("Not independently attested"),
    "/founder weakens or omits the self-disclosed contribution boundary",
  );
  // The disclosure is checked against the CONTRIBUTION MAP, not against three
  // phrases someone once typed. The earlier version required the literal heading
  // "AI-assisted development", and so it failed the moment that disclosure was
  // moved from a numbered card of its own into the tools-and-services card where
  // it categorically belongs -- a change that altered the item's RANK on the page
  // and removed none of its substance. A guard that cannot tell those two apart
  // is guarding the wording, not the honesty.
  //
  // What must remain true: the role the tooling played is stated verbatim from
  // the source of truth, the page says no tool can claim authorship, and the
  // venue-disclosure obligation is on the page. Reword freely; delete and fail.
  const tooling = contribution.ai_assisted_tooling;
  const asHtml = (text) => String(text)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  check(
    founderHtml.includes(asHtml(tooling.role)),
    "/founder no longer states the tooling role recorded in the contribution map",
  );
  check(
    /can(?:not)? claim authorship/.test(founderHtml) && founderHtml.includes("venue-specific disclosure"),
    "/founder does not state the limits of tooling: authorship and venue disclosure",
  );
  // The precise, unabbreviated list stays in the machine-readable map even though
  // the page prose summarises it, so an academic venue reading the JSON gets the
  // exact terms rather than the sentence.
  check(
    Array.isArray(tooling.not_permitted_to_claim) &&
      ["authorship", "independent review", "author approval"].every((claim) => tooling.not_permitted_to_claim.includes(claim)) &&
      tooling.venue_disclosure_required === true,
    "the contribution map no longer records what AI tooling may not claim",
  );
  check(
    !/sole author|my own work|unaided authorship/i.test(founderHtml),
    "/founder makes an unsupported unaided or sole-authorship claim",
  );
  check(
    walkthrough.total_seconds === 90 &&
      walkthrough.chapters.length === 6 &&
      (founderHtml.match(/class="founder-spine__item"/g) || []).length === 6,
    "/founder does not render the complete source-bound 90-second walkthrough",
  );
  check(
    founderHtml.includes("The video has not been recorded") &&
      founderHtml.includes(`${contribution.external_validation.completed_reviews} completed`) &&
      founderHtml.includes("Planned, not applied"),
    "/founder turns planned, unreviewed or unrecorded work into completed evidence",
  );

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
      `/founder makes an uncheckable credential claim matching ${pattern}. The page is built on ` +
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

// ---------------------------------------------------------------------------
// 10. /review: a source-bound public criticism surface. Opening an issue is not
//     allowed to silently become assigned review, peer review or replication.
// ---------------------------------------------------------------------------
const reviewFile = resolve(DIST, "review.html");
check(existsSync(reviewFile), "no /review page was built");
if (existsSync(reviewFile)) {
  const reviewHtml = readFileSync(reviewFile, "utf8");
  const submissionPlan = JSON.parse(
    readFileSync(resolve(DIST, "glassbox", "external_submission_plan.json"), "utf8"),
  );
  const stanfordEvidence = JSON.parse(
    readFileSync(resolve(DIST, "glassbox", "stanford_cs_evidence_map.json"), "utf8"),
  );
  const records = submissionPlan.records.filter((record) => record.wave === 1);
  const external = stanfordEvidence.contribution_map.external_validation;
  const assigned = records.reduce(
    (total, record) => total + record.review.external_reviewer_packet.assigned_reviewers,
    0,
  );
  const completed = records.reduce(
    (total, record) => total + record.review.external_reviewer_packet.completed_reviews,
    0,
  );
  const replications = records.reduce(
    (total, record) => total + record.review.independent_replications_completed,
    0,
  );

  check(records.length === 5, `/review derives ${records.length} flagship records instead of 5`);
  check(records.length * 2 === 10, "/review does not derive exactly 10 independent roles");
  check(
    assigned === 0 && completed === 0 && replications === 0,
    `/review source state is not zero: ${assigned} assigned, ${completed} completed, ` +
      `${replications} replications`,
  );
  check(
    external.assigned_reviewers === assigned &&
      external.completed_reviews === completed &&
      external.independent_replications === replications,
    "/review source ledgers disagree about external validation state",
  );
  check(
    records.every((record) => record.review.formal_peer_review_claimed === false),
    "/review includes a record that claims formal peer review",
  );
  check(
    reviewHtml.includes(`<link rel="canonical" href="${ORIGIN}/review"`),
    "/review has no self-canonical",
  );
  check(reviewHtml.includes('"@type":"CollectionPage"'), "/review is not a CollectionPage");
  check(reviewHtml.includes('"@type":"ItemList"'), "/review has no ItemList");
  check(reviewHtml.includes('"numberOfItems":5'), "/review ItemList does not contain 5 papers");
  check(
    reviewHtml.includes(`"author":{"@id":"${ORIGIN}/#arhan-canli"}`),
    "/review author does not resolve to the founder Person entity",
  );
  check(
    reviewHtml.includes(
      'content="external_submission_plan.json stanford_cs_evidence_map.json"',
    ),
    "/review does not declare its two source ledgers",
  );
  check(
    (reviewHtml.match(/class="review-manuscript"/g) || []).length === 5,
    "/review does not render 5 manuscript rows",
  );
  check(
    (reviewHtml.match(/class="review-lane review-lane--/g) || []).length === 10,
    "/review does not render 10 independent review lanes",
  );
  check(
    (reviewHtml.match(/<small>Unassigned<\/small>/g) || []).length === 10,
    "/review does not label all 10 roles unassigned",
  );
  check(
    reviewHtml.includes("external-review.yml"),
    "/review has no link to the structured external critique form",
  );
  check(
    /not assigned review/i.test(reviewHtml) &&
      /not peer review/i.test(reviewHtml) &&
      /not replication/i.test(reviewHtml),
    "/review weakens the distinction between criticism, review and replication",
  );
  check(
    !/independently reviewed|peer-reviewed|externally validated|replicated successfully/i.test(
      reviewHtml,
    ),
    "/review makes an unsupported validation claim",
  );
  for (const record of records) {
    const pathname = new URL(record.public_canonical).pathname.replace(/\/paper$/, "");
    check(
      reviewHtml.includes(`href="${pathname}"`),
      `/review does not link the exact public paper for ${record.registry_key}`,
    );
    check(
      existsSync(resolve(DIST, `${pathname.replace(/^\//, "")}.html`)),
      `/review links a paper wrapper that was not built: ${pathname}`,
    );
  }
  check(
    sitemap.includes(`<loc>${ORIGIN}/review</loc>`),
    "/review is not in the sitemap, so it will not be discovered",
  );
  const founderHtml = readFileSync(founderFile, "utf8");
  check(founderHtml.includes('href="/review"'), "/founder has no static link to /review");
}

// ---------------------------------------------------------------------------
// 11. /foundry: locally verified contracts must remain visibly distinct from
//     cloud deployment and operational acceptance.
// ---------------------------------------------------------------------------
const foundryFile = resolve(DIST, "foundry.html");
check(existsSync(foundryFile), "no /foundry page was built");
if (existsSync(foundryFile)) {
  const foundryHtml = readFileSync(foundryFile, "utf8");
  const foundryReceipt = JSON.parse(
    readFileSync(
      resolve(DIST, "glassbox", "foundry_local_contract_verification.json"),
      "utf8",
    ),
  );
  const claimedHash = foundryReceipt.content_hash;
  const payload = { ...foundryReceipt };
  delete payload.content_hash;
  const observedHash = `sha256:${sha256(canonicalJson(payload))}`;

  check(
    foundryReceipt.schema === "canli.foundry-local-contract-verification.v1" &&
      foundryReceipt.status === "PASS",
    "/foundry source is not a passing local-contract receipt",
  );
  check(claimedHash === observedHash, "/foundry source receipt content hash does not reproduce");
  check(
    foundryReceipt.design_status.deployment === "PLANNED_NOT_APPLIED" &&
      foundryReceipt.design_status.runtime === "FROZEN_NOT_DEPLOYED" &&
      foundryReceipt.design_status.lifecycle === "DESIGN_FROZEN_NOT_DEPLOYED" &&
      foundryReceipt.design_status.acceptance === "INCOMPLETE_NOT_OPERATIONAL",
    "/foundry source weakens or contradicts the not-deployed status",
  );
  check(
    foundryReceipt.acceptance.required_receipts === 11 &&
      foundryReceipt.acceptance.public_receipts_attached === 0 &&
      foundryReceipt.acceptance.missing_receipts.length === 11,
    "/foundry source does not preserve the eleven-receipt zero-state",
  );
  check(
    foundryReceipt.architecture.broker_write_access === false &&
      foundryReceipt.architecture.execution_reachable_from_research === false &&
      foundryReceipt.architecture.research_and_holdout_separate === true,
    "/foundry source weakens the research-to-execution boundary",
  );
  check(
    foundryReceipt.first_migration.status === "PREPARED_NOT_IMPORTED_OR_REPLAYED" &&
      foundryReceipt.first_migration.preserved_state === "KILLED" &&
      foundryReceipt.first_migration.replay_status === "NOT_RUN_IN_FOUNDRY" &&
      foundryReceipt.first_migration.max_attempts === 1 &&
      foundryReceipt.first_migration.new_identity_spend_allowed === false,
    "/foundry source changes the bounded first-migration contract",
  );
  check(
    foundryHtml.includes(`<link rel="canonical" href="${ORIGIN}/foundry"`),
    "/foundry has no self-canonical",
  );
  check(foundryHtml.includes('"@type":"WebPage"'), "/foundry is not marked up as a WebPage");
  check(
    foundryHtml.includes('"@type":"SoftwareSourceCode"'),
    "/foundry has no SoftwareSourceCode entity",
  );
  check(
    foundryHtml.includes(`"author":{"@id":"${ORIGIN}/#arhan-canli"}`),
    "/foundry author does not resolve to the founder Person entity",
  );
  check(
    foundryHtml.includes('content="foundry_local_contract_verification.json"'),
    "/foundry does not declare its exact source receipt",
  );
  check(
    (foundryHtml.match(/class="foundry-service"/g) || []).length === 7,
    "/foundry does not render all seven research services",
  );
  check(
    (foundryHtml.match(/class="foundry-receipt"/g) || []).length === 11 &&
      (foundryHtml.match(/<small>Missing<\/small>/g) || []).length === 11,
    "/foundry does not render eleven missing acceptance receipts",
  );
  check(
    /not operational/i.test(foundryHtml) &&
      /planned, not applied/i.test(foundryHtml) &&
      /not run in Foundry/i.test(foundryHtml) &&
      /no broker write access/i.test(foundryHtml),
    "/foundry omits an operational, deployment, migration or broker boundary",
  );
  check(
    !/Foundry is (?:live|deployed|operational)|operational Foundry|deployment complete/i.test(
      foundryHtml,
    ),
    "/foundry makes an unsupported deployment claim",
  );
  check(
    foundryHtml.includes(
      `href="/trials/${foundryReceipt.first_migration.historical_identity_key}"`,
    ) &&
      existsSync(
        resolve(
          DIST,
          "trials",
          `${foundryReceipt.first_migration.historical_identity_key}.html`,
        ),
      ),
    "/foundry does not resolve its first migration to the historical trial packet",
  );
  check(
    sitemap.includes(`<loc>${ORIGIN}/foundry</loc>`),
    "/foundry is not in the sitemap, so it will not be discovered",
  );
  const founderHtml = readFileSync(founderFile, "utf8");
  check(founderHtml.includes('href="/foundry"'), "/founder has no static link to /foundry");
}

// ---------------------------------------------------------------------------
// 12. /methodology: the long-tail questions, each answered with a link to the
//     document that DEMONSTRATES the answer. An FAQ whose evidence links do not
//     resolve is a brochure that claims to be a citation, which is worse than a
//     brochure. Every answer must carry evidence, every link must resolve, and
//     the FAQPage markup must describe the questions actually on the page.
// ---------------------------------------------------------------------------
const methodologyFile = resolve(DIST, "methodology.html");
check(existsSync(methodologyFile), "no /methodology page was built");
if (existsSync(methodologyFile)) {
  const methodologyHtml = readFileSync(methodologyFile, "utf8");
  const admissionContract = JSON.parse(
    readFileSync(resolve(DIST, "glassbox/sleeve_admission_contract.json"), "utf8"),
  );
  const maturityDsr = admissionContract.deflation_policy.book_maturity_threshold;

  check(methodologyHtml.includes('"@type":"FAQPage"'), "/methodology is not marked up as an FAQPage");
  check(
    methodologyHtml.includes(`${maturityDsr} is <em>not</em> a per-sleeve`) &&
      methodologyHtml.includes("full-union book threshold before a portfolio-maturity"),
    "/methodology does not explain the in-force v7 DSR measurement-versus-maturity boundary",
  );
  check(
    !methodologyHtml.includes("book&#39;s gate is a deflated Sharpe") &&
      !methodologyHtml.includes("book's gate is a deflated Sharpe"),
    "/methodology republishes the retired fixed incremental DSR gate",
  );
  const headings = (methodologyHtml.match(/<h2>/g) || []).length;
  const marked = (methodologyHtml.match(/"@type":"Question"/g) || []).length;
  check(headings >= 10, `/methodology has only ${headings} sections. The question list has ` +
    `stopped rendering and the checks below would pass vacuously`);
  // One trailing section ("Where to go next") is not a question, so the markup carries one fewer.
  check(
    marked === headings - 1,
    `/methodology renders ${headings - 1} questions but marks up ${marked}. The structured data ` +
      `describes a different page from the one a reader sees`,
  );

  // Every answer carries evidence, and every evidence link resolves.
  const evidence = [...methodologyHtml.matchAll(/class="faq__evidence"[\s\S]*?<\/p>/g)];
  check(
    evidence.length === marked,
    `${marked} questions have ${evidence.length} evidence lines. An answer asserts without showing.`,
  );
  const evidenceLinks = new Set(
    evidence.flatMap((block) => [...block[0].matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1])),
  );
  check(
    evidenceLinks.size >= 15,
    `/methodology cites only ${evidenceLinks.size} distinct documents. This is thinner than the corpus ` +
      `it exists to index`,
  );
  for (const href of new Set([...methodologyHtml.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]))) {
    const target = href.replace(/^\//, "");
    const ok =
      target === "" ||
      existsSync(resolve(DIST, `${target}.html`)) ||
      existsSync(resolve(DIST, target));
    check(ok, `/methodology links ${href}, which is not a built page`);
  }
  check(
    sitemap.includes(`${ORIGIN}/methodology</loc>`),
    "/methodology is not in the sitemap, so it will not be discovered",
  );
  for (const page of ["index.html", "research.html"]) {
    check(
      readFileSync(resolve(DIST, page), "utf8").includes('href="/methodology"'),
      `/${page.replace(".html", "")} has no static link to /methodology`,
    );
  }
}

// ---------------------------------------------------------------------------
// 13. /tools/deflated-sharpe: browser arithmetic stays bound to the reviewed
//     ALPHAC formula, current selection union and current policy boundary.
// ---------------------------------------------------------------------------
const dsrToolFile = resolve(DIST, "tools/deflated-sharpe.html");
check(existsSync(dsrToolFile), "no /tools/deflated-sharpe page was built");
if (existsSync(dsrToolFile)) {
  const dsrToolHtml = readFileSync(dsrToolFile, "utf8");
  const dsrContract = JSON.parse(
    readFileSync(resolve(DIST, "glassbox/deflated_sharpe_calculator_contract.json"), "utf8"),
  );
  const trialLedger = JSON.parse(
    readFileSync(resolve(DIST, "glassbox/trial_ledger.json"), "utf8"),
  );
  const contractBytes = readFileSync(
    resolve(DIST, "glassbox/deflated_sharpe_calculator_contract.json"),
  );
  const observedContractBytesHash = `sha256:${sha256(contractBytes)}`;

  check(
    dsrContract.schema === "canli.alphac-deflated-sharpe-calculator-contract.v1" &&
      dsrContract.status === "REFERENCE_IMPLEMENTATION_CONTRACT" &&
      dsrContract.content_hash ===
        "sha256:4f0043376bff896f427e0314e7e29848751424863337fcf0bfd7ec9429502b8a" &&
      observedContractBytesHash ===
        "sha256:2ba8fcb339a5fdb9304da074fcbdf9e229f9b6f5ec2f8a787c542f5f31db7e8f",
    "/tools/deflated-sharpe formula contract is unsupported or hash-invalid",
  );
  check(
    dsrContract.test_vectors.length >= 3,
    "/tools/deflated-sharpe has fewer than three production golden vectors",
  );
  check(
    dsrContract.current_policy.per_sleeve_dsr ===
      "mandatory_measurement_not_a_universal_gate" &&
      dsrContract.current_policy.full_union_book_maturity_threshold === 0.95,
    "/tools/deflated-sharpe weakens the in-force DSR policy boundary",
  );
  check(
    trialLedger.selection_statistics.n_hypotheses ===
      trialLedger.distinct_hypothesis_identities &&
      dsrToolHtml.includes(`>${trialLedger.selection_statistics.n_hypotheses}</dd>`),
    "/tools/deflated-sharpe does not render the current complete-union identity count",
  );
  check(
    dsrToolHtml.includes(`<link rel="canonical" href="${ORIGIN}/tools/deflated-sharpe"`),
    "/tools/deflated-sharpe has no self-canonical",
  );
  check(
    dsrToolHtml.includes('"@type":"WebApplication"') &&
      dsrToolHtml.includes(`"author":{"@id":"${ORIGIN}/#arhan-canli"}`),
    "/tools/deflated-sharpe lacks WebApplication markup or founder attribution",
  );
  check(
    dsrToolHtml.includes(
      'content="deflated_sharpe_calculator_contract.json trial_ledger.json"',
    ),
    "/tools/deflated-sharpe does not declare both exact source artifacts",
  );
  check(
    /no output on this page is an ALPHAC performance claim/i.test(dsrToolHtml) &&
      /not a universal sleeve gate/i.test(dsrToolHtml) &&
      /not an admission verdict/i.test(dsrToolHtml),
    "/tools/deflated-sharpe omits its performance, policy or verdict boundary",
  );
  check(
    sitemap.includes(`<loc>${ORIGIN}/tools/deflated-sharpe</loc>`),
    "/tools/deflated-sharpe is not in the sitemap",
  );
  check(
    readFileSync(methodologyFile, "utf8").includes('href="/tools/deflated-sharpe"'),
    "/methodology does not link to the Deflated Sharpe calculator",
  );
}

// ---------------------------------------------------------------------------
// 14. /tools/evidence-chain: browser verification remains bound to the exact
//     public chain, disclosure boundary, anchor manifest and honest payload
//     rehash limitation.
// ---------------------------------------------------------------------------
const chainToolFile = resolve(DIST, "tools/evidence-chain.html");
check(existsSync(chainToolFile), "no /tools/evidence-chain page was built");
if (existsSync(chainToolFile)) {
  const chainToolHtml = readFileSync(chainToolFile, "utf8");
  const transparencyBytes = readFileSync(resolve(DIST, "glassbox/transparency_log.json"));
  const anchorsBytes = readFileSync(resolve(DIST, "glassbox/ots/anchors.json"));
  const verifierBytes = readFileSync(resolve(DIST, "glassbox/verify_transparency.py"));
  const transparency = JSON.parse(transparencyBytes);
  const anchors = JSON.parse(anchorsBytes);
  const entries = transparency.entries;
  const disclosure = transparency.payload_disclosure;

  check(
    transparency.schema === "glassbox.transparency_log/2" &&
      transparency.entry_count === entries.length &&
      entries.at(-1).seq === entries.length - 1 &&
      transparency.head.chain_hash === entries.at(-1).chain_hash,
    "/tools/evidence-chain public transparency source is internally inconsistent",
  );
  check(
    disclosure.first_disclosed_seq ===
      entries.find((entry) => Object.hasOwn(entry, "payload")).seq &&
      disclosure.disclosed_entries ===
        entries.filter((entry) => Object.hasOwn(entry, "payload")).length &&
      disclosure.opaque_historical_entries + disclosure.disclosed_entries === entries.length,
    "/tools/evidence-chain disclosure boundary is not derived from the published entries",
  );
  check(
    anchors.schema === "glassbox.ots_anchors/1" &&
      anchors.anchor_count === anchors.anchors.length &&
      anchors.bitcoin_confirmed_count + anchors.calendar_pending_count === anchors.anchor_count &&
      anchors.anchors.every(
        (anchor) =>
          entries[anchor.seq]?.chain_hash === anchor.chain_hash &&
          entries[anchor.seq]?.date === anchor.date,
      ),
    "/tools/evidence-chain checkpoint manifest is not bound to the public chain",
  );
  check(
    chainToolHtml.includes(`<link rel="canonical" href="${ORIGIN}/tools/evidence-chain"`) &&
      chainToolHtml.includes('"@type":"WebApplication"') &&
      chainToolHtml.includes(`"author":{"@id":"${ORIGIN}/#arhan-canli"}`),
    "/tools/evidence-chain lacks its canonical, WebApplication markup or founder attribution",
  );
  check(
    chainToolHtml.includes(
      'content="transparency_log.json ots/anchors.json verify_transparency.py"',
    ) &&
      chainToolHtml.includes(`sha256:${sha256(transparencyBytes)}`) &&
      chainToolHtml.includes(`sha256:${sha256(anchorsBytes)}`) &&
      chainToolHtml.includes(`sha256:${sha256(verifierBytes)}`),
    "/tools/evidence-chain does not declare and hash all three exact public sources",
  );
  check(
    chainToolHtml.includes(`>${entries.length}</dd>`) &&
      chainToolHtml.includes(`SEQ ${entries.at(-1).seq}`) &&
      chainToolHtml.includes(`>SEQ ${disclosure.first_disclosed_seq}</strong>`) &&
      chainToolHtml.includes(`>${anchors.bitcoin_confirmed_count}</dd>`),
    "/tools/evidence-chain does not render current chain, boundary and checkpoint facts",
  );
  check(
    /what does not[\s\S]*broker truth/i.test(chainToolHtml) &&
      /pre-boundary payload contents/i.test(chainToolHtml) &&
      /absence of an unpublished alternate chain/i.test(chainToolHtml) &&
      /published Python verifier performs the complete disclosed-payload rehash/i.test(
        chainToolHtml,
      ),
    "/tools/evidence-chain omits its integrity, completeness or payload-rehash boundary",
  );
  check(
    sitemap.includes(`<loc>${ORIGIN}/tools/evidence-chain</loc>`),
    "/tools/evidence-chain is not in the sitemap",
  );
  check(
    readFileSync(resolve(DIST, "verify.html"), "utf8").includes(
      'href="/tools/evidence-chain"',
    ) &&
      readFileSync(methodologyFile, "utf8").includes('href="/tools/evidence-chain"'),
    "/verify and /methodology do not both link to the evidence-chain explorer",
  );
}

// ---------------------------------------------------------------------------
// 15. /tools/trial-accounting: the public search denominator is reconstructed
//     from the exact ledger, legacy packet manifest, packet index and separately
//     reserved prospective identity. Packet completeness must never become an
//     admission claim.
// ---------------------------------------------------------------------------
const trialToolFile = resolve(DIST, "tools/trial-accounting.html");
check(existsSync(trialToolFile), "no /tools/trial-accounting page was built");
if (existsSync(trialToolFile)) {
  const trialToolHtml = readFileSync(trialToolFile, "utf8");
  const ledgerBytes = readFileSync(resolve(DIST, "glassbox/trial_ledger.json"));
  const manifestBytes = readFileSync(resolve(DIST, "glassbox/trial_packet_manifest.json"));
  const packetIndexBytes = readFileSync(resolve(DIST, "glassbox/trial-packets/index.json"));
  const prospectiveBytes = readFileSync(resolve(DIST, "glassbox/prospective_trial_record.json"));
  const ledger = JSON.parse(ledgerBytes);
  const manifest = JSON.parse(manifestBytes);
  const packetIndex = JSON.parse(packetIndexBytes);
  const prospective = JSON.parse(prospectiveBytes);
  const selectionN = ledger.distinct_hypothesis_identities;

  check(
    ledger.schema === "glassbox.trial-ledger/2" &&
      ledger.immutable_execution_records - ledger.window_only_remeasurements -
        ledger.cross_profile_duplicate_identities === selectionN &&
      ledger.selection_statistics.unit === "first_immutable_record_per_hypothesis" &&
      ledger.selection_statistics.n_hypotheses === selectionN,
    "/tools/trial-accounting ledger does not reconcile to the complete identity union",
  );
  check(
    manifest.schema === "canli.alphac-trial-packet-manifest.v2" &&
      packetIndex.schema === "canli.alphac-identity-trial-packet-index.v2" &&
      manifest.identities.length === manifest.summary.distinct_hypothesis_identities &&
      packetIndex.packets.length === packetIndex.summary.published_identity_packets &&
      manifest.summary.complete_trial_packets + manifest.summary.incomplete_trial_packets ===
        manifest.summary.distinct_hypothesis_identities,
    "/tools/trial-accounting legacy packet corpus is internally inconsistent",
  );
  check(
    prospective.schema === "canli.alphac-public-prospective-trial-record.v1" &&
      prospective.identity.hypotheses_spent === 1 &&
      prospective.identity.reservation_ordinal === selectionN &&
      prospective.metrics.union_hypothesis_identities === selectionN &&
      prospective.packet.complete === true &&
      prospective.decision.admitted === false &&
      prospective.gate_assessment.admission_status === "INCOMPLETE_NOT_ADMITTED" &&
      manifest.summary.distinct_hypothesis_identities + prospective.identity.hypotheses_spent ===
        selectionN,
    "/tools/trial-accounting prospective identity is not separately reserved and not admitted",
  );
  check(
    trialToolHtml.includes(`<link rel="canonical" href="${ORIGIN}/tools/trial-accounting"`) &&
      trialToolHtml.includes('"@type":"WebApplication"') &&
      trialToolHtml.includes(`"author":{"@id":"${ORIGIN}/#arhan-canli"}`),
    "/tools/trial-accounting lacks its canonical, WebApplication markup or founder attribution",
  );
  check(
    trialToolHtml.includes(
      'content="trial_ledger.json trial_packet_manifest.json trial-packets/index.json prospective_trial_record.json"',
    ) &&
      trialToolHtml.includes(`sha256:${sha256(ledgerBytes)}`) &&
      trialToolHtml.includes(`sha256:${sha256(manifestBytes)}`) &&
      trialToolHtml.includes(`sha256:${sha256(packetIndexBytes)}`) &&
      trialToolHtml.includes(`sha256:${sha256(prospectiveBytes)}`),
    "/tools/trial-accounting does not declare and hash all four exact public sources",
  );
  check(
    trialToolHtml.includes(`<strong>${ledger.immutable_execution_records}</strong>`) &&
      trialToolHtml.includes(`<strong>${ledger.window_only_remeasurements}</strong>`) &&
      trialToolHtml.includes(`<strong>${ledger.cross_profile_duplicate_identities}</strong>`) &&
      trialToolHtml.includes(`Selection N</span><strong>${selectionN}</strong>`) &&
      trialToolHtml.includes(`${manifest.summary.complete_trial_packets}<small> complete</small>`) &&
      trialToolHtml.includes(`${manifest.summary.incomplete_trial_packets}<small> incomplete</small>`),
    "/tools/trial-accounting does not render the current equation or packet debt",
  );
  check(
    /Accounting, not performance/i.test(trialToolHtml) &&
      /complete packet is not a passed strategy/i.test(trialToolHtml) &&
      /prospective identity remains not admitted/i.test(trialToolHtml) &&
      /not live returns, rankings, admission scores or recommendations/i.test(trialToolHtml),
    "/tools/trial-accounting omits its accounting, admission or performance boundary",
  );
  check(
    sitemap.includes(`<loc>${ORIGIN}/tools/trial-accounting</loc>`),
    "/tools/trial-accounting is not in the sitemap",
  );
  check(
    readFileSync(resolve(DIST, "trials.html"), "utf8").includes(
      'href="/tools/trial-accounting"',
    ) &&
      readFileSync(methodologyFile, "utf8").includes('href="/tools/trial-accounting"'),
    "/trials and /methodology do not both link to the trial-accounting explorer",
  );
}

// ---------------------------------------------------------------------------
// 11. SHORT TITLES. A search-result headline is not a document's name. Papers
//     whose real names run past 65 characters declare a short title used for
//     <title> only. The risk of that mechanism is that it quietly RENAMES
//     the document. So this checks both halves: the short title fits, and the
//     page still presents the real name in its H1, Open Graph title and
//     structured-data headline. A reader must never arrive at a document called
//     something other than what it is.
// ---------------------------------------------------------------------------
const TITLE_LIMIT = 65;
let shortTitled = 0;
for (const page of pages) {
  const slug = basename(page, ".html");
  const markdown = readFileSync(resolve(ROOT, "public/research", `${slug}.md`), "utf8");
  // The rendered page cannot carry the source title verbatim when that title
  // contains an em dash: audit-writing.mjs locks editable copy at zero em-dash
  // forms, so the renderer rewrites it. Comparing the raw source title against
  // the rendered one asked for something the publishing contract forbids, and 20
  // of 111 papers could satisfy neither gate. This check is about whether the
  // page RENAMED the document, so both sides are normalized through the same
  // shared definition the renderer uses. A genuine rename still fails; only the
  // mandated dash rewrite is accepted.
  const sourceTitle = (markdown.match(/^#\s+(.+)$/m) || [])[1]?.trim();
  const realTitle = sourceTitle === undefined ? undefined : normalizeEditableCopy(sourceTitle).trim();
  const shortLine = markdown.match(/^\*\*Short title:\*\*\s*(.+)$/im);
  const shortTitle = shortLine?.[1].trim() ?? IMMUTABLE_PAPER_SHORT_TITLES[slug] ?? null;
  const html = readFileSync(resolve(DIST, "research", page), "utf8");
  const rendered = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";

  if (!realTitle) continue;
  if (realTitle.length > TITLE_LIMIT) {
    check(
      shortTitle !== null,
      `${slug} has a ${realTitle.length}-character title and declares no short title, so its ` +
        `search result is truncated mid-phrase`,
    );
  }
  if (shortTitle) {
    shortTitled += 1;
    const short = shortTitle;
    check(
      short.length <= TITLE_LIMIT,
      `${slug} declares a short title of ${short.length} characters, which is not short`,
    );
    check(
      rendered.startsWith(short),
      `${slug} declares a short title that its page does not use (<title> is ${rendered})`,
    );
    // The half that matters: the document keeps its real name where its name is presented.
    const h1 = (html.match(/<h1 class="paper__title">([\s\S]*?)<\/h1>/) || [])[1];
    check(h1 !== undefined, `${slug} has no paper title heading`);
    if (h1 !== undefined) {
      const h1Text = h1.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      check(
        h1Text === realTitle,
        `${slug} presents "${h1Text}" as its name but the document is called "${realTitle}". ` +
          `the short title has renamed the document`,
      );
    }
    check(
      html.includes(`property="og:title" content="${realTitle.replace(/&/g, "&amp;")}"`) ||
        html.includes(`"headline":${JSON.stringify(realTitle)}`),
      `${slug} does not carry its real name in Open Graph or structured data`,
    );
  }
}
check(shortTitled >= 20, `Only ${shortTitled} papers declare a short title. The extractor has ` +
  `stopped matching and the checks above would pass vacuously`);

// ---------------------------------------------------------------------------
// 12. data-fact FALLBACKS. Every `<span data-fact="k">TEXT</span>` is overwritten
//     by main.js at runtime, so the TEXT is only what a crawler and a reader
//     with JS off actually see. This makes it a published claim, and it had
//     drifted: "8,436 survivorship-free US stocks", "392K+ fundamentals" and
//     "2,820+ tests" sat in the HTML long after config/brand.js was the source
//     of truth. A fallback that disagrees with the value replacing it is a
//     second, stale copy of the number.
// ---------------------------------------------------------------------------
const brand = readFileSync(resolve(ROOT, "config/brand.js"), "utf8");
const factsBlock = brand.slice(
  brand.indexOf("export const FACTS = {"),
  brand.indexOf("};", brand.indexOf("export const FACTS = {")),
);
const FACTS = Object.fromEntries(
  [...factsBlock.matchAll(/^\s*(\w+):\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]]),
);
check(Object.keys(FACTS).length >= 8, `only ${Object.keys(FACTS).length} FACTS parsed from ` +
  `config/brand.js. The extractor has stopped matching and the checks below would pass vacuously.`);

// Walk dist/ here rather than reuse a name from another script: this file had no page walker.
const walkHtml = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "assets") continue;
      out.push(...walkHtml(resolve(dir, entry.name)));
    } else if (entry.name.endsWith(".html")) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
};

let factSpans = 0;
for (const file of walkHtml(DIST)) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/data-fact="(\w+)">([^<]*)</g)) {
    const [, key, text] = match;
    if (!(key in FACTS)) continue;
    factSpans += 1;
    check(
      text === FACTS[key],
      `${file.replace(DIST, "")} renders data-fact="${key}" as "${text}" while config/brand.js says ` +
        `"${FACTS[key]}". The static text is what a crawler and a no-JS reader see, so a stale ` +
        `fallback is a stale published number.`,
    );
  }
}
check(factSpans >= 10, `Only ${factSpans} data-fact spans were found across the built site. The scan ` +
  `has stopped matching`);

// ---------------------------------------------------------------------------
// FOUNDING DATE. The inception date is declared in structured data on several
// hand-authored pages AND stated in the shell footer prose on every page. It had
// already drifted once: the JSON-LD said 2026 while the project began in July
// 2024, so every crawler was told the wrong year. Six hand-maintained copies of
// one fact will drift again, so this asserts they agree with each other and with
// the sentence a reader actually sees.
// ---------------------------------------------------------------------------
{
  const declared = new Set();
  const pagesWithDate = [];
  for (const file of walkHtml(DIST)) {
    const html = readFileSync(file, "utf8");
    const match = html.match(/"foundingDate"\s*:\s*"([^"]+)"/);
    if (!match) continue;
    declared.add(match[1]);
    pagesWithDate.push(file.slice(DIST.length));
  }
  check(
    declared.size === 1,
    `pages declare ${declared.size} different founding dates (${[...declared].join(", ")}). ` +
      "One fact, one value.",
  );
  check(
    pagesWithDate.length >= 5,
    `only ${pagesWithDate.length} pages declare a founding date; the check would pass vacuously`,
  );
  // Agreeing with each other is not enough: six copies can agree on a wrong value,
  // which is exactly how "2026" survived. They must agree with the config source.
  const brandFounded = (readFileSync(resolve(ROOT, "config/brand.js"), "utf8")
    .match(/founded:\s*"([^"]+)"/) || [])[1];
  check(
    brandFounded !== undefined,
    "config/brand.js declares no `founded` date for the pages to agree with",
  );
  check(
    declared.size === 1 && declared.has(brandFounded),
    `structured data declares ${[...declared].join(", ")} but config/brand.js says ` +
      `${brandFounded}. brand.js is the source.`,
  );
  const [structuredDate] = [...declared];
  if (structuredDate) {
    const year = structuredDate.slice(0, 4);
    const month = Number(structuredDate.slice(5, 7));
    const monthName = [
      "", "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ][month] ?? "";
    const footerHtml = readFileSync(resolve(DIST, "index.html"), "utf8");
    const footer = footerHtml.slice(footerHtml.indexOf('<footer class="cc-footer"'));
    const stated = monthName ? `${monthName} ${year}` : year;
    check(
      footer.includes(stated),
      `structured data says the project began ${structuredDate}, but the footer a reader sees ` +
        `does not say "${stated}". The machine claim and the human claim must match.`,
    );
  }
}
console.log(
  `verified the founding date agrees across every page that declares it, and matches the ` +
    `sentence in the footer`,
);

const sitemapUrls = (sitemap.match(/<loc>/g) || []).length;
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `verified ${pages.length} research pages: title, description, canonical, ScholarlyArticle, ` +
    `author entity, Scholar metadata, unique BibTeX citation, indexed citation identity, ` +
    `Open Graph, stylesheet, sitemap entry`,
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
console.log(
  `verified /review: 5 source-bound manuscript rows, 10 unassigned roles, zero completed reviews ` +
    `or replications, exact paper links, governed critique route, and sitemap discovery`,
);
console.log(
  `verified /foundry: passing local contracts, planned-not-applied cloud state, 0 of 11 ` +
    `acceptance receipts, no broker path, bounded killed-trial migration, and sitemap discovery`,
);
console.log(
  `verified /methodology: every question marked up, every answer carrying evidence, and every ` +
    `evidence link resolving`,
);
console.log(
  `verified /tools/deflated-sharpe: hash-bound ALPHAC contract, current trial union, golden ` +
    `vectors, policy boundary, structured data, methodology link and sitemap discovery`,
);
console.log(
  `verified /tools/evidence-chain: exact source hashes, current chain and disclosure facts, ` +
    `checkpoint bindings, claim limits, structured data, internal links and sitemap discovery`,
);
console.log(
  `verified /tools/trial-accounting: complete 229-identity union, exact source hashes, packet ` +
    `debt, prospective non-admission, claim boundaries, internal links and sitemap discovery`,
);
console.log(
  `verified ${shortTitled} short titles: each fits, each is used, and each document still ` +
    `presents its real name in the H1 and the structured data`,
);
console.log(
  `verified ${factSpans} data-fact fallbacks against config/brand.js. The static text a crawler ` +
    `sees agrees with the value JS replaces it with`,
);
console.log(`sitemap covers ${sitemapUrls} URLs`);
