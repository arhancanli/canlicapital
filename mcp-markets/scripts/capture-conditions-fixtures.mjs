// Captures what financial_conditions reads (node scripts/capture-conditions-fixtures.mjs): the OFR's stress index
// file, the Fed Board's excess bond premium file and sixteen FRED series, once. The three longest daily files are
// trimmed to keep the repository small (the OFR's from 2022, Moody's Baa spread and the VIX from 2000), so in the
// tests their history starts there.
// Every response goes into test/fixtures/manifest.json as fc###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { financialConditions } from "../src/conditions.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^fc(\d+)/.exec(f)?.[1] ?? 0)));
const TRIM = [[/financial-stress-index\/data\/fsi\.csv$/, "2022-01-01"], [/[?&]id=(BAA10Y|VIXCLS)$/, "2000-01-01"]];

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  let text = await res.text();
  const from = TRIM.find(([re]) => re.test(url))?.[1];
  if (from) { const [head, ...lines] = text.trim().split(/\r?\n/); text = `${[head, ...lines.filter((l) => l.slice(0, 10) >= from)].join("\n")}\n`; }
  if (res.ok) {
    const file = `fc${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
    manifest[url] = file;
  }
  return new Response(text, { status: res.status });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const r = await financialConditions(session, {});
console.log("ok", r.rows.length, "measures");
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
