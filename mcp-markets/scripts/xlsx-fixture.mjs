// A small workbook for a test fixture: named tabs of rows, text written inline, numbers as written, in a zip of stored
// entries, so a capture script can keep the few tabs and rows a tool reads from a large published workbook.
import { crc32 } from "node:zlib";

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const column = (i) => (i < 26 ? String.fromCharCode(65 + i) : column(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const cell = (v, j, i) => (v === "" ? "" : /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v) ? `<c r="${column(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${column(j)}${i + 1}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`);
const sheetXml = (rows) => `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(v, j, i)).join("")}</row>`).join("")}</sheetData></worksheet>`;

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

// tabs: [[name, rows]] -> the workbook's bytes.
export function workbook(tabs) {
  return zip([
    ["xl/workbook.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tabs.map(([t], i) => `<sheet name="${xml(t)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`)],
    ["xl/_rels/workbook.xml.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tabs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`)],
    ...tabs.map(([, rows], i) => [`xl/worksheets/sheet${i + 1}.xml`, Buffer.from(sheetXml(rows))]),
  ]);
}
