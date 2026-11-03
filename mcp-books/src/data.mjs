// mcp-books/src/data.mjs
//
// Canli Data: a table packed as a dataset others can check. The rows as CSV, the SHA-256 of that CSV, and a
// dataset card in Hugging Face's README format (YAML front matter, then what the data is, where it came from,
// its columns and its licence). The card carries the source and the checksum, so anyone can confirm the file
// is the one described.
import { createHash } from "node:crypto";

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

// columns: [{ name, description }]; rows: objects with a value for every column (null for an empty cell).
export function packDataset({ name, title, description = "", source, license, columns, rows } = {}) {
  if (!/^[a-z0-9][a-z0-9-]{1,95}$/.test(name ?? "")) throw new Error("name must be lower-case letters, digits and dashes, as a dataset id");
  if (!source) throw new Error("A dataset needs its source");
  if (!license) throw new Error("A dataset needs a licence, such as cc0-1.0 or mit");
  if (!Array.isArray(columns) || !columns.length) throw new Error("columns must name each column");
  if (!Array.isArray(rows)) throw new Error("rows must be a list");
  rows.forEach((row, i) => {
    const missing = columns.filter((c) => !(c.name in row)).map((c) => c.name);
    if (missing.length) throw new Error(`Row ${i + 1} has no ${missing.join(", ")}`);
  });
  const csv = `${[columns.map((c) => cell(c.name)).join(","), ...rows.map((row) => columns.map((c) => cell(row[c.name])).join(","))].join("\n")}\n`;
  const sha256 = createHash("sha256").update(csv).digest("hex");
  const card = [
    "---",
    `license: ${license}`,
    `pretty_name: ${JSON.stringify(title ?? name)}`,
    "configs:",
    "- config_name: default",
    "  data_files:",
    "  - split: train",
    "    path: data.csv",
    "---",
    "",
    `# ${title ?? name}`,
    "",
    description,
    "",
    `Source: ${source}`,
    "",
    `${rows.length} rows in data.csv, SHA-256 ${sha256}.`,
    "",
    "| Column | Meaning |",
    "| --- | --- |",
    ...columns.map((c) => `| ${c.name} | ${String(c.description ?? "").replaceAll("|", "\\|")} |`),
    "",
  ].join("\n");
  return { name, rows: rows.length, csv, sha256, card };
}
