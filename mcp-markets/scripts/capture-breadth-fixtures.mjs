// Captures what market_breadth reads for the Dow (node scripts/capture-breadth-fixtures.mjs): DIA's daily holdings
// (already captured for index_constituents) and its 30 members' daily closes over a year from Yahoo's spark endpoint,
// once. Each symbol's quote is kept to the fields the tool reads (its regular market price and time), so the files
// stay small.
// Every response goes into test/fixtures/manifest.json as mb###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { marketBreadth } from "../src/market-breadth.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^mb(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  let text = await res.text();
  if (res.ok && /\/v7\/finance\/spark\?/.test(url)) {
    const d = JSON.parse(text);
    for (const x of d?.spark?.result ?? []) for (const r of x.response ?? []) r.meta = { symbol: r.meta?.symbol, regularMarketPrice: r.meta?.regularMarketPrice, regularMarketTime: r.meta?.regularMarketTime };
    text = JSON.stringify(d);
  }
  if (res.ok) {
    const file = `mb${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
    manifest[url] = file;
  }
  return new Response(text, { status: res.status });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const r = await marketBreadth(session, { index: "Dow" });
console.log("ok", r.priced, "of", r.members, "members on", r.session);
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
