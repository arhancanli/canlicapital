// =============================================================================
// CANLI CAPITAL / scripts/audit-published-numbers.mjs
// -----------------------------------------------------------------------------
// Every numeral a reader can see on this site must trace to something we
// published, and this reports the ones that do not.
//
// WHY. The kill papers already have this guarantee. A generator that can only
// print figures present in the entry it renders, with a test that catches a
// hand-typed one. The other hundred-odd pages did not. A number written into
// prose by hand is a claim nothing keeps honest: it is right on the day it is
// typed and silently wrong from the next time the artifact behind it moves.
//
// TRACING IS BY RULE, NOT BY EXEMPTION LIST. An exemption list is how a check
// stops checking: entries accumulate, nobody re-reads them, and one of them ends
// up naming a file that no longer exists. Every rule below is a general property
// a numeral can have, computed fresh each run:
//
//   EXACT       the token appears verbatim inside a published artifact.
//   ROUNDED     some artifact value rounds to the token AT THE TOKEN'S OWN
//               precision. This is what makes a page showing 0.4689 traceable to
//               an artifact holding 0.46893918…, which is the overwhelmingly
//               common case and the reason a verbatim-only check reported 573
//               false positives on its first run.
//   PERCENT     some artifact value times one hundred rounds to the token.
//   DATE        a four-digit year in 1900-2100, or a component of an ISO date
//               printed on the same page.
//   STRUCTURE   the token equals a count of something the built site contains.
//               pages, papers, hubs, measurements, sitemap URLs. These are
//               claims ABOUT the site, so the site is the artifact, and the
//               count is recomputed here rather than trusted.
//
// Anything left over is reported with the page it appears on.
// =============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const MAX_REPORTED = 40;

if (!existsSync(DIST)) {
  console.error("dist/ does not exist. Run `npm run build` first.");
  process.exit(1);
}

function walk(dir, ext) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "assets") continue;
      out.push(...walk(full, ext));
    } else if (entry.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

/** What a READER sees. Head, scripts and styles are stripped: a numeral inside a stylesheet or a
 *  structured-data block is not a claim being made to a person, and counting it would drown the
 *  ones that are. */
const visibleText = (html) =>
  html
    .replace(/<head>[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    // Inline SVG is geometry. Path coordinates are not published claims and will
    // never appear in an artifact, so scanning them makes every icon added to the
    // shell look like an untraceable figure. One GitHub mark contributed 47 of
    // them to /founder and one more to /engineering.
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x[0-9a-f]+;/gi, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ");

// Exponential notation is ONE numeral, not two. Without the exponent group, an artifact holding
// 3e-06 contributed the tokens "3" and "06" to the universe and a page printing 0.000003 traced to
// neither. Six of the first run's forty-five "untraceable" numbers were this, on both sides at
// once.
// The leading lookbehind is a RANGE rule, not a cosmetic one: in "1961-1970" the hyphen joins two
// years, and reading it as a minus sign invented the number -1970 and reported it as an
// unpublished claim. A minus sign only counts as one when what precedes it is not part of a word
// or a number.
const NUMERAL = /(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const ISO_DATE = /\b(19|20)\d\d-\d\d-\d\d\b/g;

// ---------------------------------------------------------------------------
// The published universe: every number inside every glassbox artifact.
// ---------------------------------------------------------------------------
const artifacts = walk(resolve(DIST, "glassbox"), ".json");

// The published data a page renders from is not all under glassbox/. The homepage
// reads paper-state.json, the public-claims contract, the research index and the
// film state, and none of them was in the corpus, so the homepage could not be
// scoped to what it actually uses and fell back to being traced against every
// artifact on the site. These are published files under dist/ like any other; the
// corpus should know them.
for (const extra of [
  "paper-state.json",
  "contracts/public-claims.json",
  "research-index.json",
  "system-films/state.json",
]) {
  const file = resolve(DIST, extra);
  if (existsSync(file)) artifacts.push(file);
}

// PER-ARTIFACT, NOT ONE POOL. Tracing every page against every number in every artifact was the
// first design, and it has an expiry date: the corpus grows on every publish, so a figure that
// traces to nothing today can start "tracing" tomorrow because an unrelated artifact happened to
// contain a matching value. That is exactly what happened: two genuinely untraceable numbers
// went quiet within two hours of this guard shipping, because publishing the claim-coverage map
// added its own numbers to the pool. A guard that weakens each time the record grows is a guard
// with an expiry date, so a page is now traced against the artifacts IT REFERENCES.
const perArtifact = new Map();
for (const file of artifacts) {
  const text = readFileSync(file, "utf8");
  const verbatim = new Set();
  const values = [];
  for (const token of text.match(NUMERAL) || []) {
    verbatim.add(token);
    const value = Number(token.replace(/,/g, ""));
    if (Number.isFinite(value)) values.push(value);
  }
  const labels = new Set(verbatim);
  for (const token of text.match(/\d+/g) || []) labels.add(token);
  try {
    const walkSizes = (node) => {
      if (Array.isArray(node)) {
        labels.add(String(node.length));
        node.forEach(walkSizes);
      } else if (node && typeof node === "object") {
        labels.add(String(Object.keys(node).length));
        Object.values(node).forEach(walkSizes);
      }
    };
    walkSizes(JSON.parse(text));
  } catch {
    /* a non-JSON artifact contributes no container sizes */
  }
  values.sort((a, b) => a - b);
  // Key by the glassbox-relative name where that applies, and by basename for the
  // files above, so a page can declare either without knowing where it lives.
  const key = file.startsWith(resolve(DIST, "glassbox"))
    ? relative(resolve(DIST, "glassbox"), file)
    : file.slice(resolve(DIST).length + 1);
  perArtifact.set(key, { verbatim, labels, values });
  perArtifact.set(key.split("/").pop(), { verbatim, labels, values });
}

/** The whole corpus, used only where a page declares no source. */
const corpus = { verbatim: new Set(), values: [] };
for (const { verbatim, values } of perArtifact.values()) {
  for (const token of verbatim) corpus.verbatim.add(token);
  // A loop, not `push(...values)`: one artifact can hold hundreds of thousands of numbers and a
  // spread that wide overflows the call stack (RangeError), which silently ended this audit on
  // 2026-09-05. Same result, no argument-count ceiling.
  for (const v of values) corpus.values.push(v);
}
// NOTE the corpus takes `verbatim`, never `labels`. The fallback is the weaker path already;
// widening it with every digit sequence inside every identifier would make it weaker still.
corpus.values.sort((a, b) => a - b);

const scopeCache = new Map();
function scopeFor(sources) {
  const key = [...sources].sort().join("|");
  if (scopeCache.has(key)) return scopeCache.get(key);
  const verbatim = new Set();
  const values = [];
  for (const name of sources) {
    const entry = perArtifact.get(name);
    if (!entry) continue;
    for (const token of entry.labels) verbatim.add(token);
    for (const v of entry.values) values.push(v);
  }
  values.sort((a, b) => a - b);
  const scope = { verbatim, values };
  scopeCache.set(key, scope);
  return scope;
}

/** Is some value IN THIS SCOPE within half a unit of the token's last decimal place? */
function rounds(scope, target, decimals) {
  const { values } = scope;
  const tolerance = 0.5 * 10 ** -decimals + Number.EPSILON * Math.abs(target) * 8;
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target - tolerance) lo = mid + 1;
    else hi = mid;
  }
  return lo < values.length && values[lo] <= target + tolerance;
}

/**
 * The same test for a COMPACT token, whose precision is expressed in scaled units.
 *
 * "$993.9K" carries one decimal place of THOUSANDS, so it stands for anything
 * within half a hundred of 993,900. Passing the unscaled tolerance would demand
 * the artifact match to within 0.05 of a dollar, which no compact rendering can
 * ever satisfy, and the rule would be decorative.
 */
function roundsScaled(scope, target, decimals, scale) {
  const { values } = scope;
  const tolerance = 0.5 * 10 ** -decimals * scale + Number.EPSILON * Math.abs(target) * 8;
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target - tolerance) lo = mid + 1;
    else hi = mid;
  }
  return lo < values.length && values[lo] <= target + tolerance;
}

// ---------------------------------------------------------------------------
// Site-structural counts: claims ABOUT the site, recomputed from the site.
// ---------------------------------------------------------------------------
const htmlFiles = walk(DIST, ".html");
const sitemap = readFileSync(resolve(DIST, "sitemap.xml"), "utf8");
const countOf = (predicate) => htmlFiles.filter(predicate).length;
const rel = (f) => relative(DIST, f);
const structure = new Set(
  [
    htmlFiles.length,
    (sitemap.match(/<loc>/g) || []).length,
    countOf((f) => rel(f).startsWith("research/") && !rel(f).startsWith("research/topics/")),
    countOf((f) => rel(f).startsWith("research/topics/")),
    countOf((f) => rel(f).startsWith("measurements/")),
    artifacts.length,
  ].map(String),
);

// ---------------------------------------------------------------------------
// Classify every numeral on every page.
// ---------------------------------------------------------------------------
const reasons = { EXACT: 0, ROUNDED: 0, PERCENT: 0, COMPACT: 0, DATE: 0, STRUCTURE: 0, IDENTIFIER: 0 };
const untraceable = new Map();
let seen = 0;

let scopedPages = 0;
let fallbackPages = 0;
const fallbackUntraceable = new Map();

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const text = visibleText(html);
  // A page is scoped ONLY when its generator DECLARES the complete set of artifacts it drew
  // from, via <meta name="canli:sources">. A link to a glassbox file in prose is a citation, not
  // a statement that it is the only source. Treating one as the other scoped research papers to
  // a single artifact while they quoted figures from three, which is a worse answer than the
  // honest fallback.
  const declared = html.match(/<meta name="canli:sources" content="([^"]*)"/);
  const sources = new Set(
    declared ? declared[1].split(/\s+/).filter(Boolean) : [],
  );
  const scoped = sources.size > 0;
  const scope = scoped ? scopeFor(sources) : corpus;
  if (scoped) scopedPages += 1;
  else fallbackPages += 1;
  const dateParts = new Set();
  for (const date of text.match(ISO_DATE) || []) {
    for (const part of date.split("-")) {
      dateParts.add(part);
      dateParts.add(String(Number(part)));
    }
    dateParts.add(date.slice(0, 4));
  }
  // A numeral inside a citation is an IDENTIFIER, not a claim: "10.1016/j.jfineco" is a DOI and
  // "arXiv:2103.02012" is a paper's name. The rule is contextual: what precedes the numeral
  // rather than a list of the particular identifiers this corpus happens to cite today.
  const identifiers = new Set();
  for (const match of html.matchAll(/(?:doi|arxiv|https?|www|:\/\/)[^"'\s<>]*/gi)) {
    for (const token of match[0].match(NUMERAL) || []) identifiers.add(token);
  }
  for (const match of text.matchAll(/(?:doi|arxiv|https?|www|:\/\/)\S*/gi)) {
    for (const token of match[0].match(NUMERAL) || []) identifiers.add(token);
  }
  for (const match of text.matchAll(/\b10\.\d{4,}\S*/g)) {
    for (const token of match[0].match(NUMERAL) || []) identifiers.add(token);
  }
  // A content hash is an identifier too, and a hex digest containing "2844e509" reads as
  // exponential notation to any numeral scanner.
  for (const match of text.matchAll(/\b[0-9a-f]{12,}\b/g)) {
    for (const token of match[0].match(NUMERAL) || []) identifiers.add(token);
  }

  // COMPACT notation. Intl's compact currency renders 993951.67 as "$993.9K", and
  // the scaled token traces to nothing: the artifact holds the full value and the
  // page shows it divided by a thousand. Whether such a token passed was pure luck,
  // depending on whether some unrelated artifact happened to hold a similar number.
  // The suffix is part of the numeral's meaning, so it is read here and the token is
  // traced against value * scale. A rule, not an exemption: it works for any future
  // compact figure without anybody adding it to a list.
  const COMPACT_SCALE = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const compactScaleOf = new Map();
  for (const match of text.matchAll(/(?<![\w.])(-?\d[\d,]*(?:\.\d+)?)\s?([KMBT])\b/g)) {
    compactScaleOf.set(match[1], COMPACT_SCALE[match[2]]);
  }

  for (const token of new Set(text.match(NUMERAL) || [])) {
    seen += 1;
    if (identifiers.has(token)) { reasons.IDENTIFIER += 1; continue; }
    const bare = token.replace(/,/g, "");
    const value = Number(bare);
    const decimals = (bare.split(".")[1] || "").length;

    if (scope.verbatim.has(token) || scope.verbatim.has(bare)) { reasons.EXACT += 1; continue; }
    if (Number.isFinite(value) && rounds(scope, value, decimals)) { reasons.ROUNDED += 1; continue; }
    if (Number.isFinite(value) && rounds(scope, value / 100, decimals + 2)) {
      reasons.PERCENT += 1;
      continue;
    }
    // COMPACT is deliberately honoured only on a SCOPED page. "$993.9K" pins the
    // underlying value to plus or minus fifty, which is a thousand times wider than
    // any other rule here, and against the whole-corpus fallback a window that wide
    // finds a match by chance: two deliberately wrong compact figures traced
    // cleanly while plain numerals of the same wrongness were caught. A
    // low-information rule is only safe where the candidate set is the handful of
    // artifacts the page names.
    const scale = compactScaleOf.get(token) ?? compactScaleOf.get(bare);
    if (scoped && scale && Number.isFinite(value) && roundsScaled(scope, value * scale, decimals, scale)) {
      reasons.COMPACT += 1;
      continue;
    }
    if (/^(19|20)\d\d$/.test(bare) || dateParts.has(bare)) { reasons.DATE += 1; continue; }
    if (structure.has(bare)) { reasons.STRUCTURE += 1; continue; }

    const bucket = scoped ? untraceable : fallbackUntraceable;
    if (!bucket.has(token)) bucket.set(token, []);
    const where = bucket.get(token);
    if (where.length < 3) where.push("/" + rel(file).replace(/\.html$/, ""));
  }
}

// A universe that collapsed would make every numeral untraceable, and a page set that collapsed
// would make the whole audit pass. Both are floors, both are the shape of the bug.
const problems = [];
if (corpus.values.length < 5000) {
  problems.push(`Only ${corpus.values.length} numbers were found across ${artifacts.length} artifacts. ` +
    `The published universe did not load, so everything would report as untraceable.`);
}
if (scopedPages < 20) {
  problems.push(`Only ${scopedPages} pages declared a glassbox source. The source extractor has ` +
    `stopped matching, so almost everything fell back to the whole corpus and the scoping this ` +
    `guard exists for is not happening`);
}
if (seen < 500) {
  problems.push(`Only ${seen} numerals were found across ${htmlFiles.length} pages. The page scan ` +
    `matched almost nothing, so a clean result here means nothing`);
}

console.log(`published numbers: ${htmlFiles.length} pages, ${seen} numerals seen`);
console.log(
  "  traced: " +
    Object.entries(reasons).map(([k, v]) => `${k.toLowerCase()} ${v}`).join("  "),
);
console.log(
  `  scoped to declared sources: ${scopedPages} pages   whole-corpus fallback: ${fallbackPages}`,
);
console.log(`  corpus: ${corpus.values.length} numbers across ${artifacts.length} artifacts`);

if (fallbackUntraceable.size > 0) {
  console.error(
    `\n${fallbackUntraceable.size} numeral(s) on pages that declare NO source trace to nothing ` +
      `in the whole corpus:`,
  );
  for (const [token, where] of [...fallbackUntraceable].slice(0, MAX_REPORTED)) {
    console.error(`  - ${token}  on ${where.join(", ")}`);
  }
  problems.push(`${fallbackUntraceable.size} untraceable numeral(s) on unsourced pages`);
}

if (untraceable.size > 0) {
  console.error(
    `\n${untraceable.size} numeral(s) on pages that DO declare a source trace to nothing in it:`,
  );
  for (const [token, where] of [...untraceable].slice(0, MAX_REPORTED)) {
    console.error(`  - ${token}  on ${where.join(", ")}`);
  }
  if (untraceable.size > MAX_REPORTED) {
    console.error(`  … and ${untraceable.size - MAX_REPORTED} more`);
  }
  problems.push(`${untraceable.size} untraceable numeral(s) on sourced pages`);
}

if (problems.length > 0) {
  console.error(`\nFAILED: ${problems.join("; ")}`);
  process.exit(1);
}
console.log("  every numeral a reader can see traces to a published artifact");
