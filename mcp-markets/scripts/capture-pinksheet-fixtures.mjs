// Captures what commodity_prices reads (node scripts/capture-pinksheet-fixtures.mjs): the World Bank's commodity page
// and its Pink Sheet workbook, once. The page is kept as the workbook's link; the workbook is rebuilt with its two tabs,
// their headers and their last 72 months, gzipped as wb###.gz and wb###.bin.gz.
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

import { PLAIN_USER_AGENT } from "../src/sources.mjs";
import { xlsxSheets } from "../src/xlsx.mjs";
import { workbook } from "./xlsx-fixture.mjs";

const PAGE = "https://www.worldbank.org/en/research/commodity-markets";
const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
if (manifest[PAGE]) { console.log("already captured", manifest[PAGE]); process.exit(0); }
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^wb(\d+)/.exec(f)?.[1] ?? 0)));
const save = (url, bytes, ext) => { const file = `wb${String(++n).padStart(3, "0")}${ext}`; writeFileSync(new URL(file, DIR), gzipSync(bytes, { level: 9 })); manifest[url] = file; return file; };

const page = await (await fetch(PAGE, { headers: { "User-Agent": PLAIN_USER_AGENT } })).text();
const link = /href="(https:\/\/thedocs\.worldbank\.org\/[^"]*CMO-Historical-Data-Monthly\.xlsx)"/.exec(page)?.[1];
if (!link) throw new Error("no workbook link");
save(PAGE, Buffer.from(`<a href="${link}">CMO-Historical-Data-Monthly.xlsx</a>`), ".gz");
const res = await fetch(link, { headers: { "User-Agent": PLAIN_USER_AGENT } });
const tabs = ["Monthly Prices", "Monthly Indices"];
const sheets = xlsxSheets(new Uint8Array(await res.arrayBuffer()), tabs).map((rows) => {
  const first = rows.findIndex((r) => /^\d{4}M\d{2}$/.test(r[0]));
  const months = rows.filter((r) => /^\d{4}M\d{2}$/.test(r[0]));
  return [...rows.slice(0, first), ...months.slice(-72)];
});
const file = save(link, workbook(tabs.map((t, i) => [t, sheets[i]])), ".bin.gz");
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
console.log("ok", file, link);
