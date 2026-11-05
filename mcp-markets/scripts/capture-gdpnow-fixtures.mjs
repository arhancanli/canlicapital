// Captures what gdp_nowcast reads (node scripts/capture-gdpnow-fixtures.mjs): the Atlanta Fed's GDPNow workbook, once.
// The workbook is 11 MB; the fixture is a small workbook rebuilt from the three tabs the tool reads (Table, TableCont,
// TrackRecord), each cut to its first table, its text written inline, stored without compression, gzipped as d###.bin.gz.
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

import { PLAIN_USER_AGENT } from "../src/sources.mjs";
import { xlsxSheets } from "../src/xlsx.mjs";
import { workbook } from "./xlsx-fixture.mjs";

const URL_ = "https://www.atlantafed.org/-/media/Project/Atlanta/FRBA/Documents/research-and-data/data/gdpnow/GDPTrackingModelDataAndForecasts.xlsx";
const TABS = ["Table", "TableCont", "TrackRecord"];
const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
if (manifest[URL_]) { console.log("already captured", manifest[URL_]); process.exit(0); }

const res = await fetch(URL_, { headers: { "User-Agent": PLAIN_USER_AGENT } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const sheets = xlsxSheets(new Uint8Array(await res.arrayBuffer()), TABS).map((rows) => { const end = rows.findIndex((r, i) => i > 0 && r.every((c) => c === "")); return end < 0 ? rows : rows.slice(0, end); });
const book = workbook(TABS.map((name, i) => [name, sheets[i]]));
const n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^d(\d+)/.exec(f)?.[1] ?? 0))) + 1;
const file = `d${String(n).padStart(3, "0")}.bin.gz`;
writeFileSync(new URL(file, DIR), gzipSync(book, { level: 9 }));
manifest[URL_] = file;
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
console.log("ok", file, book.length, "bytes", sheets.map((s) => s.length).join("/"), "rows");
