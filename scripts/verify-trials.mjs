import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const source = JSON.parse(readFileSync(resolve(ROOT, "public/glassbox/trial-packets/index.json"), "utf8"));
const pages = readdirSync(resolve(DIST, "trials")).filter((name) => name.endsWith(".html"));
const sitemap = readFileSync(resolve(DIST, "sitemap.xml"), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(source.packets.length === 228, `source index has ${source.packets.length} packets, expected 228`);
check(pages.length === source.packets.length, `built ${pages.length} trial pages for ${source.packets.length} packets`);
check(existsSync(resolve(DIST, "trials.html")), "trial index page was not built");
for (const packet of source.packets) {
  const name = `${packet.hypothesis_key}.html`;
  check(pages.includes(name), `${packet.hypothesis_key} has no HTML evidence page`);
  if (!pages.includes(name)) continue;
  const html = readFileSync(resolve(DIST, "trials", name), "utf8");
  // The index entry carries only identity and status. The section-level debt
  // lives in the packet itself, so read it rather than asserting against fields
  // the index does not have -- which would compare every page to zero and fail.
  const full = JSON.parse(readFileSync(
    resolve(ROOT, "public/glassbox/trial-packets", `${packet.hypothesis_key}.json`), "utf8"));
  check(html.includes(`<link rel="canonical" href="https://canlicapital.com/trials/${packet.hypothesis_key}"`), `${name} has no self-canonical`);
  check(html.includes('"@type":"Dataset"'), `${name} has no Dataset schema`);
  check(html.includes('"@id":"https://canlicapital.com/#arhan-canli"'), `${name} has no Arhan Canli Person binding`);
  check(html.includes(`href="/glassbox/trial-packets/${packet.hypothesis_key}.json"`), `${name} does not link its raw packet`);
  check(!/href="\/research\/[^"]+\.md"/.test(html), `${name} links to a raw markdown duplicate instead of canonical HTML`);
  const inSitemap = sitemap.includes(`<loc>https://canlicapital.com/trials/${packet.hypothesis_key}</loc>`);
  if (packet.complete) {
    check(html.includes('name="robots" content="index, follow,'), `${name} is complete but not indexable`);
    check(inSitemap, `${name} is complete but absent from the sitemap`);
  } else {
    check(html.includes('name="robots" content="noindex, follow,'), `${name} is incomplete but indexable`);
    check(!inSitemap, `${name} is incomplete but present in the sitemap`);
    // ASSERT THE DEBT, NOT A SENTENCE ABOUT IT.
    //
    // This used to require the literal string "A missing section stays visibly
    // missing" -- a sentence of prose that appeared, identically, on all 228
    // trial pages. It could be satisfied by a page that printed the sentence and
    // rendered none of the missing sections, and it FAILED a page that rendered
    // every missing section and simply did not repeat the explanation. It was
    // guarding the wording.
    //
    // What has to be true is that every section the packet records as missing is
    // on the page, labelled missing. That is checked directly, per section, so a
    // page cannot quietly drop one and still pass.
    const missingSections = Object.entries(full.required_sections ?? {})
      .filter(([, section]) => section.status === "MISSING_IDENTITY_LEVEL_EVIDENCE");
    const renderedMissing = (html.match(/trial__section--missing/g) ?? []).length;
    check(
      renderedMissing === missingSections.length,
      `${name} renders ${renderedMissing} missing sections but its packet records ${missingSections.length}`,
    );
    for (const [sectionName] of missingSections) {
      const label = sectionName.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
      check(
        html.includes(label),
        `${name} does not name its missing section "${label}"`,
      );
    }
    // A packet with nothing missing is not incomplete, so reaching this branch
    // with zero missing sections means the completeness flag and the sections
    // disagree, and the loop above would have passed vacuously.
    check(
      missingSections.length > 0 || (full.partial_sections ?? []).length > 0,
      `${name} is marked incomplete but records no missing or partial section`,
    );
  }
  if ((packet.partial_sections ?? []).length) {
    check(html.includes("trial__section--partial"), `${name} renders partial evidence as verified or missing`);
    check(html.includes("walk-forward JSON"), `${name} does not expose the preserved walk-forward source`);
    check(html.includes("equity Parquet"), `${name} does not expose the preserved equity source`);
  }
}
if (failures.length) {
  console.error(`trial-page verification failed (${failures.length})`);
  failures.slice(0, 30).forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
const complete = source.packets.filter((packet) => packet.complete).length;
console.log(`verified ${pages.length} trial evidence pages: exact packet binding, Dataset schema, founder attribution, raw download, canonical paper links, ${complete} complete packets indexed and ${pages.length - complete} incomplete packets noindexed`);
