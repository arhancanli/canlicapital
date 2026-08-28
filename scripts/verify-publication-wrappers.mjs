import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(ROOT, "artifacts/qa/publication-wrapper-manifest.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const forbiddenDashForms = new RegExp(`\u2014|&${"mdash"};|&#${"8212"};`, "i");

check(existsSync(manifestPath), "publication wrapper manifest is missing");
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { records: [] };
check(manifest.schema === "canli.publication-wrapper-manifest.v1", "publication wrapper schema differs");
check(manifest.records.length === 16, `expected 16 publication wrappers, found ${manifest.records.length}`);

const sitemapPath = resolve(ROOT, "dist/sitemap.xml");
const sitemap = existsSync(sitemapPath) ? readFileSync(sitemapPath, "utf8") : "";
const vercelConfig = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
const archiveHeader = (vercelConfig.headers || []).find((entry) => entry.source === "/publication/(.*)/paper");
check(Boolean(archiveHeader), "hosting policy for immutable paper routes is missing");
check(
  archiveHeader?.headers?.some((header) => header.key === "X-Robots-Tag" && header.value === "noindex, follow"),
  "immutable paper routes are not declared noindex, follow at the hosting layer",
);
for (const record of manifest.records) {
  const source = resolve(ROOT, record.source);
  const wrapper = resolve(ROOT, record.wrapper);
  const builtWrapper = resolve(ROOT, "dist", record.wrapper);
  check(existsSync(source), `${record.source}: immutable paper is missing`);
  check(existsSync(wrapper), `${record.wrapper}: source wrapper is missing`);
  check(existsSync(builtWrapper), `${record.wrapper}: built wrapper is missing`);
  if (existsSync(source)) {
    const digest = createHash("sha256").update(readFileSync(source)).digest("hex");
    check(digest === record.original_sha256, `${record.source}: immutable hash changed during wrapping`);
  }
  if (existsSync(wrapper)) {
    const html = readFileSync(wrapper, "utf8");
    check(html.includes('data-product-shell="v3"'), `${record.wrapper}: v3 shell marker is missing`);
    check(html.includes(`href="${record.original_route}"`), `${record.wrapper}: direct original link is missing`);
    check(!forbiddenDashForms.test(html), `${record.wrapper}: editable em dash form remains`);
  }
  check(sitemap.includes(`<loc>https://canlicapital.com${record.wrapper_route}</loc>`), `${record.wrapper_route}: absent from sitemap`);
  check(!sitemap.includes(`<loc>https://canlicapital.com${record.original_route}</loc>`), `${record.original_route}: original should sit behind its wrapper in the sitemap`);
}

if (failures.length) {
  console.error(`publication wrapper verification failed with ${failures.length} error${failures.length === 1 ? "" : "s"}`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log(`verified ${manifest.records.length} current-shell publication wrappers; immutable paper hashes unchanged`);
