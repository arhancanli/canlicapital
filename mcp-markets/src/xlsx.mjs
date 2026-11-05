// A spreadsheet's (.xlsx) cells without a library: the zip's entries are found through its central directory and
// inflated when read, shared strings are resolved, and a worksheet comes back as rows of text, numbers as written.
import { inflateRawSync } from "node:zlib";

// XML's escapes undone once, &amp; last; a cell's text is the text of its <t> elements (a rich-text cell has several).
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const textOf = (xml) => decode([...xml.matchAll(/<t(?:\s[^>]*[^/>])?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));

// Every entry of a zip archive by name, each read (stored or deflated) only when asked for.
export function zipEntries(bytes, { maxText = 64 * 1024 * 1024 } = {}) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip archive");
  const entries = new Map();
  let at = buf.readUInt32LE(eocd + 16);
  for (let k = buf.readUInt16LE(eocd + 10); k > 0; k--) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw new Error("zip central directory is damaged");
    const method = buf.readUInt16LE(at + 10), compressed = buf.readUInt32LE(at + 20), size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28), local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    entries.set(name, () => {
      if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`zip entry ${name} not found`);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      if (size > maxText || start + compressed > buf.length) throw new Error(`zip entry ${name} is too large or runs past the archive`);
      const data = buf.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: maxText });
      throw new Error(`zip compression method ${method} is not supported`);
    });
  }
  return entries;
}

// A worksheet as rows of cell text: the first sheet, another by its number, or one by its tab's name. Several sheets of
// one workbook are read with xlsxSheets, which opens the archive once.
export function xlsxRows(bytes, sheet = 1) {
  return xlsxSheets(bytes, [sheet])[0];
}

export function xlsxSheets(bytes, sheets) {
  const entries = zipEntries(bytes);
  const read = (name) => (entries.has(name) ? entries.get(name)().toString("utf8") : null);
  const shared = [...(read("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const workbook = read("xl/workbook.xml") ?? "", rels = read("xl/_rels/workbook.xml.rels") ?? "";
  const path = (sheet) => {
    if (typeof sheet === "number") return `xl/worksheets/sheet${sheet}.xml`;
    const id = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => m[1]).find((a) => decode(/\bname="([^"]*)"/.exec(a)?.[1] ?? "") === sheet)?.match(/\br:id="([^"]+)"/)?.[1];
    const target = id ? [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => m[1]).find((a) => a.includes(`Id="${id}"`))?.match(/\bTarget="([^"]+)"/)?.[1] : null;
    return target ? `xl/${target.replace(/^\/?xl\//, "")}` : null;
  };
  return sheets.map((sheet) => {
    const xml = read(path(sheet) ?? "");
    if (!xml) throw new Error(`The spreadsheet has no sheet ${sheet}.`);
    return sheetRows(xml, shared);
  });
}

function sheetRows(xml, shared) {
  const rows = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c[1])?.[1], type = /\bt="([^"]+)"/.exec(c[1])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? "")?.[1];
      const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? textOf(/<is>([\s\S]*?)<\/is>/.exec(c[2] ?? "")?.[1] ?? "") : v == null ? "" : decode(v);
      row[ref ? [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : row.length] = value;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}
