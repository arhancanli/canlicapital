// =============================================================================
// CANLI CAPITAL / scripts/audit-published-numbers.mjs
// -----------------------------------------------------------------------------
// Every numeral a reader can see on this site must trace to something we
// published, and this reports the ones that do not.
//
// WHY. The kill papers already have this guarantee — a generator that can only
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
//   STRUCTURE   the token equals a count of something the built site contains —
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
  console.error("dist/ does not exist — run `npm run build` first");
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
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ");

// Exponential notation is ONE numeral, not two. Without the exponent group, an artifact holding
// 3e-06 contributed the tokens "3" and "06" to the universe and a page printing 0.000003 traced to
// neither — six of the first run's forty-five "untraceable" numbers were this, on both sides at
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
const verbatim = new Set();
const values = [];
for (const file of artifacts) {
  const text = readFileSync(file, "utf8");
  for (const token of text.match(NUMERAL) || []) {
    verbatim.add(token);
    const value = Number(token.replace(/,/g, ""));
    if (Number.isFinite(value)) values.push(value);
  }
}
values.sort((a, b) => a - b);

/** Is some published value within half a unit of this token's last decimal place? */
function rounds(target, decimals) {
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
const reasons = { EXACT: 0, ROUNDED: 0, PERCENT: 0, DATE: 0, STRUCTURE: 0, IDENTIFIER: 0 };
const untraceable = new Map();
let seen = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const text = visibleText(html);
  const dateParts = new Set();
  for (const date of text.match(ISO_DATE) || []) {
    for (const part of date.split("-")) dateParts.add(String(Number(part)));
    dateParts.add(date.slice(0, 4));
  }
  // A numeral inside a citation is an IDENTIFIER, not a claim: "10.1016/j.jfineco" is a DOI and
  // "arXiv:2103.02012" is a paper's name. The rule is contextual — what precedes the numeral —
  // rather than a list of the particular identifiers this corpus happens to cite today.
  const identifiers = new Set();
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

  for (const token of new Set(text.match(NUMERAL) || [])) {
    seen += 1;
    if (identifiers.has(token)) { reasons.IDENTIFIER += 1; continue; }
    const bare = token.replace(/,/g, "");
    const value = Number(bare);
    const decimals = (bare.split(".")[1] || "").length;

    if (verbatim.has(token) || verbatim.has(bare)) { reasons.EXACT += 1; continue; }
    if (Number.isFinite(value) && rounds(value, decimals)) { reasons.ROUNDED += 1; continue; }
    if (Number.isFinite(value) && rounds(value / 100, decimals + 2)) { reasons.PERCENT += 1; continue; }
    if (/^(19|20)\d\d$/.test(bare) || dateParts.has(bare)) { reasons.DATE += 1; continue; }
    if (structure.has(bare)) { reasons.STRUCTURE += 1; continue; }

    if (!untraceable.has(token)) untraceable.set(token, []);
    const where = untraceable.get(token);
    if (where.length < 3) where.push("/" + rel(file).replace(/\.html$/, ""));
  }
}

// A universe that collapsed would make every numeral untraceable, and a page set that collapsed
// would make the whole audit pass. Both are floors, both are the shape of the bug.
const problems = [];
if (values.length < 5000) {
  problems.push(`only ${values.length} numbers found across ${artifacts.length} artifacts — the ` +
    `published universe did not load, so everything would report as untraceable`);
}
if (seen < 500) {
  problems.push(`only ${seen} numerals found across ${htmlFiles.length} pages — the page scan ` +
    `matched almost nothing, so a clean result here means nothing`);
}

console.log(`published numbers: ${htmlFiles.length} pages, ${seen} numerals seen`);
console.log(
  "  traced: " +
    Object.entries(reasons).map(([k, v]) => `${k.toLowerCase()} ${v}`).join("  "),
);
console.log(`  universe: ${values.length} numbers across ${artifacts.length} artifacts`);

if (untraceable.size > 0) {
  console.error(`\n${untraceable.size} numeral(s) trace to nothing published:`);
  for (const [token, where] of [...untraceable].slice(0, MAX_REPORTED)) {
    console.error(`  - ${token}  on ${where.join(", ")}`);
  }
  if (untraceable.size > MAX_REPORTED) {
    console.error(`  … and ${untraceable.size - MAX_REPORTED} more`);
  }
  problems.push(`${untraceable.size} untraceable numeral(s)`);
}

if (problems.length > 0) {
  console.error(`\nFAILED: ${problems.join("; ")}`);
  process.exit(1);
}
console.log("  every numeral a reader can see traces to a published artifact");
