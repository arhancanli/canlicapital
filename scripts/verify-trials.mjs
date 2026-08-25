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
    check(html.includes("A missing section stays visibly missing"), `${name} softens incomplete evidence debt`);
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
