// Captures what housing_market reads (node scripts/capture-housing-fixtures.mjs): Zillow's metro home values,
// Realtor.com's metro and national listings and FRED's mortgage rate, once, with the tests' clock (test/replay.mjs's
// NOW), trimmed: Zillow's file to the US and the 120 largest metros, its last 72 months and values to a tenth, Realtor.com's metros to
// those, and its national history to its last 26 months.
// Every response goes into test/fixtures/manifest.json as h###.gz under the exact URL asked for. Responses already
// captured are not fetched again.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { csvTable } from "../src/cycle.mjs";
import { housingMarket, metroKey } from "../src/housing.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^h(\d+)/.exec(f)?.[1] ?? 0)));
const csv = (rows) => rows.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
const kept = new Set();

function trim(url, text) {
  const [head, ...rows] = csvTable(text);
  if (/zillowstatic/.test(url)) {
    const first = head.findIndex((h) => /^\d{4}-\d{2}-\d{2}$/.test(h)), from = head.length - 72;
    const pick = rows.filter((r) => Number(r[head.indexOf("SizeRank")]) <= 120);
    for (const r of pick) kept.add(metroKey(r[head.indexOf("RegionName")]));
    // Values to a tenth of a dollar: the tool rounds them further, and the file is a fifth of the size.
    const cols = (r, i) => [...r.slice(0, first), ...r.slice(from).map((v) => (i && v !== "" ? String(Math.round(Number(v) * 10) / 10) : v))];
    return csv([cols(head, 0), ...pick.map((r) => cols(r, 1))]);
  }
  if (/Metrics_Metro/.test(url)) return csv([head, ...rows.filter((r) => kept.has(metroKey(r[head.indexOf("cbsa_title")])))]);
  if (/Country_History/.test(url)) return csv([head, ...rows.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 26)]);
  return text;
}

async function recording(url, init = {}) {
  if (manifest[url]) return new Response(gunzipSync(readFileSync(new URL(manifest[url], DIR))), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  if (!res.ok) return new Response(await res.arrayBuffer(), { status: res.status });
  const text = trim(url, await res.text());
  const file = `h${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(Buffer.from(text), { level: 9 }));
  manifest[url] = file;
  return new Response(text, { status: 200 });
}

const session = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
for (const args of [{}, { area: "Austin" }, { rank: "falling" }]) {
  try {
    const r = await housingMarket(session, args);
    console.log("ok", JSON.stringify(args), r.summary?.length ?? r.rows.length);
  } catch (err) {
    console.log("error", JSON.stringify(args), err.message.slice(0, 200));
  }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
