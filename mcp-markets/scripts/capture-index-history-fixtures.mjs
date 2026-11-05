// Captures what index_constituents reads for the S&P 500 on past dates (node scripts/capture-index-history-fixtures.mjs):
// EDGAR's filing lists for IVV's series up to 75 days after each date and the N-PORT reports they lead to, around
// Tesla's addition to the index in December 2020.
// Every response goes into test/fixtures/manifest.json as ih###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { indexConstituents } from "../src/funds.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^ih(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (res.ok) {
    const file = `ih${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
    manifest[url] = file;
  }
  return new Response(text, { status: res.status });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const before = await indexConstituents(session, { index: "S&P 500", as_of: "2020-11-30", limit: 3 });
const after = await indexConstituents(session, { index: "S&P 500", as_of: "2020-12-31", changes_from: "2020-11-30", limit: 3 });
const tesla = (r) => r.rows.some((x) => /tesla/i.test(x[0]));
console.log(JSON.stringify({ before: [before.as_of, before.filed, before.members], after: [after.as_of, after.filed, after.members], counts: after.changes.counts, changes: after.changes.rows.map((x) => [x[0], x[1]]) }));
const all = await indexConstituents(session, { index: "S&P 500", as_of: "2020-11-30", limit: 5000 });
const allAfter = await indexConstituents(session, { index: "S&P 500", as_of: "2020-12-31", limit: 5000 });
console.log("Tesla in the 2020-09-30 report:", tesla(all), "| in the 2020-12-31 report:", tesla(allAfter));
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
