// scripts/report-arrivals.mjs
// One command that says whether anyone arrived at the key product, measured, not assumed:
// reads GET /api/v1/validate/status (aggregates only) and prints today's numbers beside the
// pre-launch baseline in config/arrivals-baseline.json. Keys are people; validations are use;
// the breakdowns by referer host and snippet label are the only channel attribution we keep,
// because they need no tracking parameter. Run: npm run arrivals [-- https://canlicapital.com]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, "..", "config", "arrivals-baseline.json");

export function summarise(usage, baseline) {
  if (!usage || typeof usage !== "object") return { available: false, lines: ["usage unavailable: the status endpoint reported no usage block"] };
  const delta = (key) => (Number(usage[key] ?? 0) - Number(baseline[key] ?? 0));
  const map = (m) => Object.entries(m || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ") || "none";
  const lines = [
    `as of ${usage.as_of_utc_day}: keys today ${usage.keys_issued_today} (baseline ${baseline.keys_issued_today}, delta ${delta("keys_issued_today")})`,
    `validations today ${usage.validations_today} (baseline ${baseline.validations_today}, delta ${delta("validations_today")}), total ${usage.validations_total}`,
    `keys by referer host: ${map(usage.keys_by_source_host_today)}`,
    `keys by label: ${map(usage.keys_by_label_today)}`,
  ];
  const arrived = delta("keys_issued_today") > 0 && Object.keys(usage.keys_by_source_host_today || {}).some((h) => h !== "unknown");
  lines.push(arrived ? "verdict: someone arrived from a named source" : "verdict: no arrival from a named source yet");
  return { available: true, lines };
}

export async function report(base, fetchImpl = fetch, baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"))) {
  const res = await fetchImpl(`${base}/api/v1/validate/status`);
  const body = await res.json();
  return summarise(body?.data?.usage ?? null, baseline);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = process.argv[2] || "https://canlicapital.com";
  const { lines } = await report(base);
  for (const line of lines) console.log(line);
}
