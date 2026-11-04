// Captures what the tools added to catch up with the incumbents read (node scripts/capture-catchup-fixtures.mjs):
// scenario_risk's Yahoo chart data and FRED series, and trade_ticks' Kraken trades, once against the live
// sources with the tests' clock (test/replay.mjs's NOW). Every response goes into test/fixtures/manifest.json as p###.gz under the
// exact URL asked for, so the tests replay the same requests. Responses already captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { scenarioRisk } from "../src/scenarios.mjs";
import { tradeTicks } from "../src/ticks.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^p(\d+)/.exec(f)?.[1] ?? 0)));

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))).toString("utf8"), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (res.ok) {
    const file = `p${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(bytes, { level: 9 }));
    manifest[url] = file;
  }
  return new Response(bytes, { status: res.status });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {} });
const book = [{ symbol: "SPY", weight: 0.6 }, { symbol: "TLT", weight: 0.4 }];
await scenarioRisk(session, { holdings: book, shocks: { equities: -0.2 }, portfolio_value: 100000 });
await scenarioRisk(session, { holdings: book, scenario: "pandemic_crash" });
await scenarioRisk(session, { holdings: [{ symbol: "SPY", weight: 1 }], scenario: "dotcom_bust" });
const first = await tradeTicks(session, { pair: "bitcoin", start: "2024-01-01T00:00:00Z", requests: 1 });
await tradeTicks(session, { pair: "BTC/USD", since: first.next_since, requests: 1 });
await tradeTicks(session, { pair: "BTC/USD", start: "2024-01-01", requests: 2 });
await tradeTicks(session, { pair: "ETH/EUR", start: "2025-04-07T13:30:00Z", end: "2025-04-07T13:31:00Z" });
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`manifest: ${Object.keys(manifest).length} responses`);
