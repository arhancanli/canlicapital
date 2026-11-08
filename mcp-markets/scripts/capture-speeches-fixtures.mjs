// Captures what fed_speeches reads (node scripts/capture-speeches-fixtures.mjs): the Federal Reserve's speeches,
// testimony and monetary policy feeds and one speech page, once; the page is kept as its title and its article.
// Every response goes into test/fixtures/manifest.json as fs###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { fedSpeeches } from "../src/speeches.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^fs(\d+)/.exec(f)?.[1] ?? 0)));
const SPEECH = "https://www.federalreserve.gov/newsevents/speech/waller20261008a.htm";

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  if (!res.ok) return new Response(await res.arrayBuffer(), { status: res.status });
  let text = await res.text();
  if (url === SPEECH) text = [/<title>[\s\S]*?<\/title>/.exec(text)?.[0] ?? "", /<div[^>]*id="article"[^>]*>[\s\S]*?<\/div>\s*<\/div>/.exec(text)?.[0] ?? ""].join("\n");
  const file = `fs${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
  manifest[url] = file;
  return new Response(text, { status: 200 });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
for (const args of [{}, { read: SPEECH }]) {
  const r = await fedSpeeches(session, args);
  console.log("ok", JSON.stringify(args).slice(0, 60), r.rows.length);
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
