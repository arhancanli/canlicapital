// Captures what rate_expectations reads (node scripts/capture-expectations-fixtures.mjs): the Fed's meeting calendar,
// FRED's target range and effective rate, and Yahoo's fed funds futures quotes, once at the capture time (the
// in-process tests' clock, AT below) and once at test/replay.mjs's NOW (the stdio test's clock), whose contract months
// and FRED windows differ.
// Every response goes into test/fixtures/manifest.json as x###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { rateExpectations } from "../src/expectations.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

export const AT = Date.parse("2026-11-04T23:00:00Z");
const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^x(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (res.ok) {
    const file = `x${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(bytes, { level: 9 }));
    manifest[url] = file;
  }
  return new Response(bytes, { status: res.status });
}

for (const at of [AT, NOW]) {
  const session = createSession({ fetchImpl: recording, now: () => at, env: {}, sleep: async () => {} });
  try {
    const r = await rateExpectations(session, {});
    console.log("ok", new Date(at).toISOString(), r.meetings.rows.length, "meetings");
  } catch (err) {
    console.log("error", new Date(at).toISOString(), err.message.slice(0, 200));
  }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
