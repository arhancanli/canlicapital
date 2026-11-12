// Captures what energy_report reads (node scripts/capture-energy-fixtures.mjs): EIA's weekly petroleum tables 1, 2
// and 4, its natural gas storage report and the weekly history pages, once, with the tests' clock (test/replay.mjs's
// NOW). The weekly files sit behind a redirect to a signed address; each is kept under its stable address, as
// test/replay.mjs answers it, and the signed one is never written down.
// Every response goes into test/fixtures/manifest.json as o###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { energyReport } from "../src/energy.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^o(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, redirect: "follow", headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (res.ok) {
    const file = `o${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(bytes, { level: 9 }));
    manifest[url] = file;
  }
  return new Response(bytes, { status: res.status });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
for (const args of [{ by_district: true }, { stock: "distillate" }]) {
  try {
    const r = await energyReport(session, args);
    console.log("ok", JSON.stringify(args), r.summary?.length ?? r.rows?.length);
  } catch (err) {
    console.log("error", JSON.stringify(args), err.message.slice(0, 200));
  }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
