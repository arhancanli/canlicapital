// Captures what consumer_expectations reads (node scripts/capture-consumers-fixtures.mjs): the New York Fed's Survey of
// Consumer Expectations workbook, once. The fixture is a small workbook of the thirteen tabs the tool reads, each kept
// as its attribution line, its header row and its last 26 months, gzipped as y###.bin.gz.
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

import { PLAIN_USER_AGENT } from "../src/sources.mjs";
import { xlsxSheets } from "../src/xlsx.mjs";
import { workbook } from "./xlsx-fixture.mjs";

const URL_ = "https://www.newyorkfed.org/medialibrary/interactives/sce/sce/downloads/data/frbny-sce-data.xlsx";
const TABS = ["Inflation expectations", "Home price expectations", "Commodity expectations", "Earnings growth", "HH Income Change", "HH Spending Change", "Job separation expectation", "Job finding expectations", "Unemployment Expectations", "Delinquency expectations", "Interest rate expectations", "Stock Prices", "Government debt"];
const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
if (manifest[URL_]) { console.log("already captured", manifest[URL_]); process.exit(0); }

const res = await fetch(URL_, { headers: { "User-Agent": PLAIN_USER_AGENT } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const sheets = xlsxSheets(new Uint8Array(await res.arrayBuffer()), TABS).map((rows, t) => {
  const months = rows.filter((r) => /^\d{6}$/.test(r[0]));
  const head = rows.slice(0, rows.indexOf(months[0])).reverse().find((r) => r[0] === "" && r.slice(1).some((c) => c !== ""));
  return [rows.find((r) => /^Source:/.test(r[0] ?? "")) ?? [""], [TABS[t]], head, ...months.slice(-26)];
});
const book = workbook(TABS.map((name, i) => [name, sheets[i]]));
const n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^y(\d+)/.exec(f)?.[1] ?? 0))) + 1;
const file = `y${String(n).padStart(3, "0")}.bin.gz`;
writeFileSync(new URL(file, DIR), gzipSync(book, { level: 9 }));
manifest[URL_] = file;
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
console.log("ok", file, book.length, "bytes");
