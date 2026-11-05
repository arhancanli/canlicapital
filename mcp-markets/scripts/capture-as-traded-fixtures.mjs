// Captures what price_history reads for prices as traded (node scripts/capture-as-traded-fixtures.mjs): NVIDIA's
// daily chart around its 10-for-1 split of June 2024 with the splits Yahoo knows after it, and the request for
// splits after the window that tools.test.mjs's unadjusted Apple call now makes.
// Every response goes into test/fixtures/manifest.json as at###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { priceHistory } from "../src/tools.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^at(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (res.ok) {
    const file = `at${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
    manifest[url] = file;
  }
  return new Response(text, { status: res.status });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const window = { symbol: "NVDA", start: "2024-03-01", end: "2024-06-14" };
const traded = await priceHistory(session, { ...window, adjustment: "none" });
const splits = await priceHistory(session, { ...window, adjustment: "splits" });
const all = await priceHistory(session, window);
const at = (r, d) => r.close[r.dates.indexOf(d)];
console.log(JSON.stringify({ splits: traded.splits, later: traded.later_splits ?? [], dividends: traded.dividends, close_0607: [at(traded, "2024-06-07"), at(splits, "2024-06-07"), at(all, "2024-06-07")], close_0610: [at(traded, "2024-06-10"), at(splits, "2024-06-10")], volume_0607: [traded.volume[traded.dates.indexOf("2024-06-07")], splits.volume[splits.dates.indexOf("2024-06-07")]], price_return: [traded.change.price_return, splits.change.price_return] }));
await priceHistory(session, { symbol: "AAPL", start: "2025-01-01", end: "2026-10-08", adjusted: false });
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
