// Captures what economic_series reads for its as_of tests (node scripts/capture-vintage-fixtures.mjs): ALFRED's past releases
// and FRED's current figures, once, with the tests' clock (test/replay.mjs's NOW).
// Every response goes into test/fixtures/manifest.json as v###.gz under the exact URL asked for (a POST query
// under "POST <url> <body>", as test/replay.mjs looks it up). Responses already captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { economicSeries } from "../src/tools.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^v(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  const key = init.method && init.method !== "GET" ? `${init.method} ${url} ${init.body ?? ""}` : url;
  if (manifest[key]) return new Response(gunzipSync(readFileSync(new URL(manifest[key], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (res.ok) {
    const file = `v${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(bytes, { level: 9 }));
    manifest[key] = file;
  }
  return new Response(bytes, { status: res.status });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const calls = [{ series: "PAYEMS", as_of: "2025-09-01", revisions: true, start: "2025-01-01" }, { series: "unemployment rate", as_of: "2020-04-01", last: 3 }];
for (const args of calls) {
  try {
    const r = await economicSeries(session, args);
    console.log("ok", JSON.stringify(args), r.latest ? JSON.stringify(r.latest) : `${r.rows?.length} rows`);
  } catch (err) {
    console.log("error", JSON.stringify(args), err.message.slice(0, 200));
  }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
