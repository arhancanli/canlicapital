// Captures what central_bank_speeches reads (node scripts/capture-bis-speeches-fixtures.mjs): the BIS's feed of
// central bankers' speeches and one speech page (kept as its metadata and its text), once.
// Every response goes into test/fixtures/manifest.json as bs###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { centralBankSpeeches } from "../src/speeches.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^bs(\d+)/.exec(f)?.[1] ?? 0)));
const SPEECH = "https://www.bis.org/speeches/20261103-path-back-2-has-become-less-comfortable";

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  if (!res.ok) return new Response(await res.arrayBuffer(), { status: res.status });
  let text = await res.text();
  if (url === SPEECH) text = [...text.matchAll(/<meta name="(?:citation_title|citation_author|description)" content="[^"]*"\s*\/?>/g)].map((m) => m[0]).join("\n") + "\n" + (/<div class="text__component">[\s\S]*?<\/div>/.exec(text)?.[0] ?? "");
  const file = `bs${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
  manifest[url] = file;
  return new Response(text, { status: 200 });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
for (const args of [{}, { read: SPEECH }]) {
  const r = await centralBankSpeeches(session, args);
  console.log("ok", JSON.stringify(args).slice(0, 60), r.rows.length);
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
