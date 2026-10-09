// Data by reference: any argument can be {"$file": "<path to CSV>", ...} instead of a long array,
// so the model never retypes a series (where numbers get dropped, and every number costs tokens
// twice). The file is read here, on this machine, and nothing is written.
//
//   {"$file": "prices.csv", "column": "close"}            -> [101.2, 101.9, ...]
//   {"$file": "prices.csv", "columns": ["SPY", "TLT"]}    -> [[101.2, 92.1], ...]
//   {"$file": "prices.csv", "columns": "all"}             -> every numeric column
//   {"$file": "returns.txt"}                               -> the first numeric column
// Options: "skip_rows" (default 0), "delimiter" (default: comma, or tab/semicolon if detected).
import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ROWS = 2_000_000;

function readTable(path, { skip_rows: skip = 0, delimiter } = {}) {
  const full = resolve(String(path).replace(/^~(?=$|\/)/, homedir()));
  // One descriptor for the checks and the read, so the file can't change between them.
  const fd = openSync(full, "r");
  let text;
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error(`$file: ${path} is not a file.`);
    if (st.size > MAX_BYTES) throw new Error(`$file: ${path} is ${st.size} bytes; the limit is ${MAX_BYTES}.`);
    text = readFileSync(fd, "utf8");
  } finally { closeSync(fd); }
  const lines = text.split(/\r?\n/).slice(skip).filter((l) => l.trim() !== "");
  if (lines.length > MAX_ROWS + 1) throw new Error(`$file: more than ${MAX_ROWS} rows.`);
  const d = delimiter ?? (lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",");
  const rows = lines.map((l) => l.split(d).map((c) => c.trim().replace(/^"|"$/g, "")));
  const numeric = (c) => c !== "" && Number.isFinite(Number(c));
  const header = rows[0].some((c) => !numeric(c)) ? rows.shift() : null;
  return { rows, header, full };
}

function columnIndex(table, col, path) {
  if (typeof col === "number") return col;
  const i = table.header ? table.header.findIndex((h) => h.toLowerCase() === String(col).toLowerCase()) : -1;
  if (i < 0) throw new Error(`$file: ${path} has no column "${col}"${table.header ? `; columns are ${table.header.join(", ")}` : " (no header row)"}.`);
  return i;
}

function toNumbers(table, idx, path) {
  return table.rows.map((r, k) => idx.map((i) => {
    const v = Number(r[i]);
    if (r[i] === undefined || r[i] === "" || !Number.isFinite(v)) throw new Error(`$file: ${path} row ${k + 1 + (table.header ? 1 : 0)} column ${i + 1} is not a number.`);
    return v;
  }));
}

export function readRef(input) {
  // A list given as "column" means "columns".
  const ref = Array.isArray(input.column) ? { ...input, columns: input.column, column: undefined } : input;
  const path = ref.$file, table = readTable(path, ref);
  if (ref.columns !== undefined) {
    const width = table.rows[0]?.length ?? 0;
    const idx = ref.columns === "all" ? [...Array(width).keys()].filter((i) => table.rows.every((r) => Number.isFinite(Number(r[i])) && r[i] !== "")) : ref.columns.map((c) => columnIndex(table, c, path));
    if (!idx.length) throw new Error(`$file: ${path} has no all-numeric column.`);
    return toNumbers(table, idx, path);
  }
  let i;
  if (ref.column !== undefined) i = columnIndex(table, ref.column, path);
  else { i = (table.rows[0] ?? []).findIndex((_, j) => table.rows.every((r) => r[j] !== "" && Number.isFinite(Number(r[j])))); if (i < 0) throw new Error(`$file: ${path} has no all-numeric column.`); }
  return toNumbers(table, [i], path).map((r) => r[0]);
}

// Replaces every {"$file": ...} inside an argument tree; returns the new tree and the files read.
export function resolveRefs(value, files = []) {
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, files));
  if (value && typeof value === "object") {
    if (typeof value.$file === "string") { const out = readRef(value); files.push({ path: value.$file, values: Array.isArray(out[0]) ? `${out.length} x ${out[0].length}` : out.length }); return out; }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, files)]));
  }
  return value;
}
