// Captures the responses the earnings_calendar tests replay (node scripts/capture-earnings-fixtures.mjs):
// Apple's results 8-Ks with the filing indexes that carry their acceptance times, and a quiet
// September week across the market. Recorded by running the tool at the tests' clock (2026-10-09
// 12:00 UTC); responses already in test/fixtures/manifest.json are served from it, as under replay.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { earningsCalendar } from "../src/earnings.mjs";
import { createSession } from "../src/sources.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Object.values(manifest).filter((f) => f.startsWith("c")).length;
const NOW = Date.parse("2026-10-09T12:00:00Z");

async function record(run, args) {
  const fetchImpl = async (url, init) => {
    if (manifest[url]) { const body = gunzipSync(readFileSync(new URL(manifest[url], DIR))); return new Response(body.toString("utf8"), { status: 200 }); }
    const res = await fetch(url, init);
    const text = await res.text();
    if (res.ok) {
      const file = `c${String(++n).padStart(3, "0")}.gz`;
      writeFileSync(new URL(file, DIR), gzipSync(text, { level: 9 }));
      manifest[url] = file;
    }
    return new Response(text, { status: res.status });
  };
  // The clock starts at the tests' time and runs, so SEC requests are still spaced 125 ms apart.
  const started = Date.now();
  await run(createSession({ fetchImpl, now: () => NOW + (Date.now() - started) }), args);
}

await record(earningsCalendar, { company: "AAPL" });
await record(earningsCalendar, { since: "2026-09-14", until: "2026-09-18" });

writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
console.log(n, "coverage responses in the manifest");
