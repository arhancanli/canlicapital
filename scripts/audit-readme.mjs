// Keep repository-level publication claims bound to the same artifacts as the rendered site.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(ROOT, "../AlphaForge");
const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");
const researchIndex = JSON.parse(readFileSync(resolve(ROOT, "public/research-index.json"), "utf8"));
const packetManifest = JSON.parse(
  readFileSync(resolve(ROOT, "public/glassbox/trial_packet_manifest.json"), "utf8"),
);
const sitemap = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
const measurementCount = readdirSync(resolve(ROOT, "measurements")).filter((name) =>
  name.endsWith(".html"),
).length;
const sitemapCount = (sitemap.match(/<loc>/g) || []).length;
const summary = packetManifest.summary;
const failures = [];
const requireText = (text, claim) => {
  if (!readme.includes(text)) failures.push(`${claim}: expected README to contain ${JSON.stringify(text)}`);
};

requireText(`${researchIndex.count} generated technical reports`, "research corpus count drifted");
requireText(`${researchIndex.topics.length} substantive subject`, "topic-hub count drifted");
requireText(`${measurementCount} generated Dataset pages`, "measurement count drifted");
requireText(`${sitemapCount} canonical URLs`, "sitemap count drifted");
requireText(
  `all ${summary.published_identity_packets} recorded hypotheses`,
  "published packet count drifted",
);
requireText(
  `${summary.incomplete_trial_packets} of those packets incomplete`,
  "incomplete packet count drifted",
);

let deployGateChecked = false;
if (existsSync(resolve(ENGINE, "scripts/live_tick.sh"))) {
  const tick = readFileSync(resolve(ENGINE, "scripts/live_tick.sh"), "utf8");
  const publish = readFileSync(resolve(ENGINE, "scripts/live_publish.sh"), "utf8");
  deployGateChecked = true;
  if (!tick.includes("if uv run python scripts/check_retracted_claims.py; then")) {
    failures.push("live_tick.sh no longer makes retracted-claim success a deploy condition");
  }
  if (!tick.includes('if [ "$_PUBLISHABLE" -eq 1 ]; then')) {
    failures.push("live_tick.sh no longer gates deploy execution on _PUBLISHABLE");
  }
  if (!publish.includes("uv run python scripts/check_retracted_claims.py || {")) {
    failures.push("live_publish.sh no longer handles retracted-claim failure explicitly");
  }
  if (!publish.includes("PUBLISHABLE=0")) {
    failures.push("live_publish.sh no longer marks a failed publication bundle unpublishable");
  }
}

if (failures.length) {
  console.error(`README AUDIT FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `README audit passed: ${researchIndex.count} papers, ${researchIndex.topics.length} topic hubs, ` +
    `${measurementCount} measurements, ${sitemapCount} URLs, ` +
    `${summary.published_identity_packets} packets (${summary.incomplete_trial_packets} incomplete); ` +
    `deploy-gate source ${deployGateChecked ? "verified" : "not present in this checkout"}`,
);
