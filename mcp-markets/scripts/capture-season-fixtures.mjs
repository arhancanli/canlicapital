// Captures what earnings_season reads (node scripts/capture-season-fixtures.mjs) for 27 October to 4 November 2026 on
// a clock fixed at 5 November 02:00 UTC: Nasdaq's earnings calendar for each weekday and the week after, and SPY's
// daily holdings (already captured for index_constituents). Each calendar day is kept to the S&P 500's members, so the
// files stay small.
// Every response goes into test/fixtures/manifest.json as es###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { earningsSeason } from "../src/earnings-season.mjs";
import { dailyHoldings } from "../src/funds.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";

export const CLOCK = Date.parse("2026-11-05T02:00:00Z");
const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^es(\d+)/.exec(f)?.[1] ?? 0)));
const replay = async (url) => (manifest[url] ? new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 }) : new Response("", { status: 404 }));
const members = new Set((await dailyHoldings(createSession({ fetchImpl: replay, now: () => CLOCK, env: {}, sleep: async () => {} }), "SPY", 5000)).rows.map((r) => String(r[1]).replace(/[^A-Z0-9]/gi, "").toUpperCase()));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  let text = await res.text();
  if (res.ok && /api\.nasdaq\.com\/api\/calendar\/earnings/.test(url)) {
    const d = JSON.parse(text);
    if (d?.data?.rows) d.data.rows = d.data.rows.filter((r) => members.has(String(r.symbol).replace(/[^A-Z0-9]/gi, "").toUpperCase()));
    text = JSON.stringify(d);
  }
  if (res.ok) {
    const file = `es${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
    manifest[url] = file;
  }
  return new Response(text, { status: res.status });
}

const session = createSession({ fetchImpl: recording, now: () => CLOCK, env: {}, sleep: async () => {} });
const r = await earningsSeason(session, { since: "2026-10-27", until: "2026-11-04" });
console.log("ok", r.tally.reported, "reported");
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
