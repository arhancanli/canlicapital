// Captures what options_sentiment reads (node scripts/capture-putcall-fixtures.mjs): Cboe's daily options statistics for
// the trading days before the tests' clock (test/replay.mjs's NOW), each kept as the ratios and the volumes the tool
// reads, as z###.gz. A weekend or holiday answers 403 and is not kept.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { putCallRatios } from "../src/putcall.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^z(\d+)/.exec(f)?.[1] ?? 0)));
const KEEP = ["ratios", "SUM OF ALL PRODUCTS", "EQUITY OPTIONS", "INDEX OPTIONS", "EXCHANGE TRADED PRODUCTS", "SPX + SPXW"];

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 200));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  if (!res.ok) return new Response(await res.arrayBuffer(), { status: res.status });
  const j = await res.json();
  const text = JSON.stringify(Object.fromEntries(KEEP.filter((k) => k in j).map((k) => [k, j[k]])));
  const file = `z${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
  manifest[url] = file;
  return new Response(text, { status: 200 });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const r = await putCallRatios(session, {});
console.log("ok", r.date, r.rows.length, "days");
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
