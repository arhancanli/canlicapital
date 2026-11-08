// Captures what bond_offerings reads (node scripts/capture-bond-fixtures.mjs): EDGAR full-text searches,
// term sheets and fee table XBRL for the issuers the tests use, once against the live sources with the
// tests' clock (test/replay.mjs's NOW). Every response goes into test/fixtures/manifest.json as p###.gz under the
// exact URL asked for, so the tests replay the same requests. Responses already captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { bondOfferings } from "../src/bonds.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^p(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))).toString("utf8"), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (res.ok) {
    const file = `p${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(bytes, { level: 9 }));
    manifest[url] = file;
  }
  return new Response(bytes, { status: res.status });
}

// The clock stands still at NOW, so the session's own SEC spacing would add up; recording() spaces live requests.
const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const calls = [
  { company: "AAPL", years: 7, deals: 8 },
  { company: "MSFT", years: 10, deals: 2 },
  { company: "1018724", years: 2, deals: 3 },
  { company: "19617", years: 1, deals: 5 },
  { company: "Toyota Motor Credit", years: 1, deals: 3 },
  { company: "1341439", years: 1, deals: 3 },
  { company: "TSLA", years: 5 },
];
for (const args of calls) {
  try { const r = await bondOfferings(session, args); console.log(args.company, r.offerings.rows.length, "tranches"); } catch (err) { console.log(args.company, err.message.slice(0, 120)); }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`manifest: ${Object.keys(manifest).length} responses`);
