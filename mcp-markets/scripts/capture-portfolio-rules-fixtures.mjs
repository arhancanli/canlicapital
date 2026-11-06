// Captures what the portfolio_rules stdio example reads and the fixtures lack (node scripts/capture-portfolio-rules-fixtures.mjs).
// Every captured response is replayed and only the rest is fetched live, so the example reads the same FINRA
// settlement dates and SEC files as the other fixtures; each new response goes into test/fixtures/manifest.json.
// SEC submissions stay uncaptured, as for the other tools reading GameStop: a missing one reads as a 10-K filer.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { portfolioRules } from "../src/portfolio-rules.mjs";
import { createSession } from "../src/sources.mjs";
import { replayFetch } from "../test/replay.mjs";

export const EXAMPLE = { holdings: [{ symbol: "GME", shares: 1_000_000, value: 25_000_000 }] };

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
const replay = replayFetch();
let n = 0;
const fetchImpl = async (url, init = {}) => {
  const res = await replay.fetchImpl(url, init);
  if (res.status !== 404 || String(url).startsWith("https://data.sec.gov/submissions/")) return res;
  const live = await fetch(url, init);
  const body = await live.text();
  if (!live.ok) return new Response(body, { status: live.status });
  const key = init.method && init.method !== "GET" ? `${init.method} ${url} ${init.body ?? ""}` : String(url);
  let file;
  do file = `p${String(++n).padStart(3, "0")}.gz`; while (existsSync(new URL(file, DIR)));
  writeFileSync(new URL(file, DIR), gzipSync(body, { level: 9 }));
  manifest[key] = file;
  console.log("captured", key.slice(0, 160), "->", file);
  return new Response(body, { status: 200 });
};
const r = await portfolioRules(createSession({ fetchImpl, env: {} }), EXAMPLE);
writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
console.log(JSON.stringify(r.holdings.rows));
