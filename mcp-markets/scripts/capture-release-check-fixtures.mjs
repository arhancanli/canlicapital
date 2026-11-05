// Captures what release_check reads (node scripts/capture-release-check-fixtures.mjs): the filing lists,
// the 10-Qs and the results releases of the companies the tests use, once against EDGAR with the tests'
// clock (test/replay.mjs's NOW). Every response goes into test/fixtures/manifest.json as e###.gz under the
// exact URL asked for, so the tests replay the same requests. Responses already captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { releaseCheck } from "../src/release-check.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^e(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))).toString("utf8"), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (res.ok) {
    const file = `e${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(bytes, { level: 9 }));
    manifest[url] = file;
  }
  return new Response(bytes, { status: res.status });
}

// The clock stands still at NOW, so the session's own SEC spacing would add up; recording() spaces live requests.
const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const calls = [
  { company: "751978", period: "2024-03-31" },
  { company: "1087294", period: "2022-09-30" },
  { company: "AAPL" },
];
for (const args of calls) {
  try { const r = await releaseCheck(session, args); console.log(args.company, JSON.stringify(r.counts)); } catch (err) { console.log(args.company, err.message.slice(0, 160)); }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`manifest: ${Object.keys(manifest).length} responses`);
