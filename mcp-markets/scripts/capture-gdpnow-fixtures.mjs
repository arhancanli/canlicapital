// Captures what gdp_nowcast reads (node scripts/capture-gdpnow-fixtures.mjs): the Atlanta Fed's GDPNow workbook, once.
// The workbook is 11 MB; the fixture is a small workbook rebuilt from the three tabs the tool reads (Table, TableCont,
// TrackRecord), each cut to its first table, its text written inline, stored without compression, gzipped as d###.bin.gz.
import { crc32, gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

import { PLAIN_USER_AGENT } from "../src/sources.mjs";
import { xlsxSheets } from "../src/xlsx.mjs";

const URL_ = "https://www.atlantafed.org/-/media/Project/Atlanta/FRBA/Documents/research-and-data/data/gdpnow/GDPTrackingModelDataAndForecasts.xlsx";
const TABS = ["Table", "TableCont", "TrackRecord"];
const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
if (manifest[URL_]) { console.log("already captured", manifest[URL_]); process.exit(0); }

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const column = (i) => (i < 26 ? String.fromCharCode(65 + i) : column(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const sheetXml = (rows) => `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => (v === "" ? "" : /^-?\d+(\.\d+)?(E[-+]?\d+)?$/i.test(v) ? `<c r="${column(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${column(j)}${i + 1}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`)).join("")}</row>`).join("")}</sheetData></worksheet>`;

// A zip archive of stored entries.
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const n = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(local, n, data);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const res = await fetch(URL_, { headers: { "User-Agent": PLAIN_USER_AGENT } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const sheets = xlsxSheets(new Uint8Array(await res.arrayBuffer()), TABS).map((rows) => { const end = rows.findIndex((r, i) => i > 0 && r.every((c) => c === "")); return end < 0 ? rows : rows.slice(0, end); });
const book = zip([
  ["xl/workbook.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${TABS.map((t, i) => `<sheet name="${t}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`)],
  ["xl/_rels/workbook.xml.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${TABS.map((t, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`)],
  ...sheets.map((rows, i) => [`xl/worksheets/sheet${i + 1}.xml`, Buffer.from(sheetXml(rows))]),
]);
const n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^d(\d+)/.exec(f)?.[1] ?? 0))) + 1;
const file = `d${String(n).padStart(3, "0")}.bin.gz`;
writeFileSync(new URL(file, DIR), gzipSync(book, { level: 9 }));
manifest[URL_] = file;
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
console.log("ok", file, book.length, "bytes", sheets.map((s) => s.length).join("/"), "rows");
