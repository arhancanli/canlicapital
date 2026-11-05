// Captures what inflation_nowcast reads (node scripts/capture-nowcast-fixtures.mjs): the Cleveland Fed's three nowcast
// files, once. Each file holds every period since 2013 (5 to 8 MB); the fixture keeps its last sixteen periods, which
// the tool reads the same way.
// Every response goes into test/fixtures/manifest.json as i###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { inflationNowcast } from "../src/nowcast.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^i(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  if (!res.ok) return new Response(await res.arrayBuffer(), { status: res.status });
  const text = JSON.stringify(JSON.parse((await res.text()).replace(/^﻿/, "")).slice(-16));
  const file = `i${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
  manifest[url] = file;
  return new Response(text, { status: 200 });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
for (const args of [{}, { record: true }, { month: "2026-10" }]) {
  try {
    const r = await inflationNowcast(session, args);
    console.log("ok", JSON.stringify(args), r.rows?.length ?? r.months?.rows.length);
  } catch (err) {
    console.log("error", JSON.stringify(args), err.message.slice(0, 200));
  }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
