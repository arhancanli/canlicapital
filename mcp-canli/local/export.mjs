// A kept result written to a file the person opens in a spreadsheet or a notebook, without the rows passing
// through the model. Files go only into CANLI_HOME/exports, under a plain name, never over a file already there,
// each with a receipt beside it: the file's SHA-256 and the receipt of the answer it came from.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cell = (v) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
};

// A table as CSV: {columns, rows} with rows as arrays, or a list of objects.
export function toCsv(value) {
  if (value && Array.isArray(value.columns) && Array.isArray(value.rows)) return [value.columns.map(cell).join(","), ...value.rows.map((r) => (Array.isArray(r) ? r : [r]).map(cell).join(","))].join("\n");
  if (Array.isArray(value) && value.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
    const columns = [...new Set(value.flatMap((x) => Object.keys(x)))];
    return [columns.map(cell).join(","), ...value.map((x) => columns.map((c) => cell(x[c])).join(","))].join("\n");
  }
  throw new Error("Only a table (columns and rows, or a list of objects) becomes CSV; give path to the table inside the result, or format json.");
}

export function writeExport(home, name, text, receipt) {
  const dir = join(home, "exports");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, name);
  try {
    writeFileSync(file, `${text}\n`, { flag: "wx", mode: 0o644 });
  } catch (e) {
    if (e.code === "EEXIST") throw new Error(`${file} already exists; choose another name.`);
    throw e;
  }
  const sha256 = createHash("sha256").update(`${text}\n`).digest("hex");
  writeFileSync(`${file}.receipt.json`, `${JSON.stringify({ file: name, sha256, from: receipt ?? null }, null, 1)}\n`, { flag: "wx", mode: 0o644 });
  return { file, sha256, receipt_file: `${file}.receipt.json` };
}
