// Captures what audit_signals reads (node scripts/capture-audit-signals-fixtures.mjs): the filing lists, EDGAR
// full-text searches, reports and 8-Ks of the companies and windows the tests use, once against EDGAR with the
// tests' clock (test/replay.mjs's NOW). Every response goes into test/fixtures/manifest.json as s###.gz under the
// exact URL asked for, so the tests replay the same requests. Responses already captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { auditSignals } from "../src/audit-signals.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^s(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))).toString("utf8"), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (res.ok) {
    const file = `s${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(bytes, { level: 9 }));
    manifest[url] = file;
  }
  return new Response(bytes, { status: res.status });
}

// The clock stands still at NOW, so the session's own SEC spacing would add up; recording() spaces live requests.
const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const calls = [
  { company: "1898795", signal: "going_concern", limit: 3 },
  { company: "1401835", signal: "going_concern", limit: 3 },
  { company: "1056358", signal: "auditor_change", limit: 2 },
  { company: "1883835", signal: "auditor_change", limit: 2 },
  { signal: "auditor_change", days: 7, limit: 10 },
  { days: 1, limit: 3 },
];
for (const args of calls) {
  try { const r = await auditSignals(session, args); console.log(JSON.stringify(args), r.reading.slice(0, 200)); } catch (err) { console.log(JSON.stringify(args), err.message.slice(0, 160)); }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`manifest: ${Object.keys(manifest).length} responses`);
