// mcp/src/series-file.mjs
//
// Reads a return series, or a matrix of variant returns, from a file on the machine the server runs
// on, so an agent can point a tool at its backtest output instead of copying hundreds of numbers
// into the call (the agent benchmark measured transcription errors on long pasted series).
//
// Only numbers leave this module. Error messages name rows and columns by position, never by a
// cell's content or a header's text, so a path pointed at the wrong file cannot echo that file back
// into the conversation. The hosted endpoint never reads files (see toolAuditBacktest).
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const MAX_SERIES_FILE_BYTES = 5 * 1024 * 1024;

function readText(path) {
  const full = resolve(path);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    throw new Error(`${path}: no such file`);
  }
  if (!stat.isFile()) throw new Error(`${path}: not a regular file`);
  if (stat.size > MAX_SERIES_FILE_BYTES) throw new Error(`${path}: larger than ${MAX_SERIES_FILE_BYTES} bytes`);
  return readFileSync(full, "utf8");
}

const isNumber = (cell) => cell.trim() !== "" && Number.isFinite(Number(cell.trim()));

// A JSON array (of numbers, or of arrays of numbers), or delimited text: comma, semicolon or tab
// separated, one row per line, with an optional header row naming the columns.
function parseTable(text, path) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new Error(`${path}: starts like JSON but does not parse as JSON`);
    }
    if (!Array.isArray(value)) throw new Error(`${path}: JSON must be an array`);
    const rows = value.map((row) => (Array.isArray(row) ? row : [row]));
    rows.forEach((row, i) => row.forEach((cell, j) => {
      if (typeof cell !== "number" || !Number.isFinite(cell)) throw new Error(`${path}: JSON item ${i + 1}, position ${j + 1} is not a finite number`);
    }));
    return { header: null, rows };
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!lines.length) throw new Error(`${path}: empty`);
  const delimiter = [",", ";", "\t"].find((d) => lines[0].includes(d)) ?? ",";
  const split = (line) => line.split(delimiter).map((cell) => cell.trim());
  const first = split(lines[0]);
  const header = first.some((cell) => !isNumber(cell)) ? first : null;
  const body = header ? lines.slice(1) : lines;
  const width = (header ?? first).length;
  const rows = body.map((line, i) => {
    const cells = split(line);
    if (cells.length !== width) throw new Error(`${path}: row ${i + 1 + (header ? 1 : 0)} has ${cells.length} cells, expected ${width}`);
    return cells;
  });
  return { header, rows };
}

// A row counter, such as the unnamed index pandas writes first: an empty header, or whole numbers
// that step by exactly one. No return series looks like that, so it is skipped, and the caller
// reports the skip rather than hiding it.
function isRowCounter(name, values) {
  if (name === "") return true;
  return values.length >= 3 && values.every((v, i) => Number.isInteger(v) && (i === 0 || v - values[i - 1] === 1));
}

// Numeric columns only: a date or label column is dropped, never parsed; a row counter is skipped.
function numericColumns({ header, rows }) {
  const width = rows[0]?.length ?? 0;
  const columns = [];
  const skipped = [];
  for (let j = 0; j < width; j += 1) {
    if (rows.every((row) => typeof row[j] === "number" || isNumber(String(row[j])))) {
      const values = rows.map((row) => Number(row[j]));
      if (isRowCounter(header ? header[j] : null, values)) skipped.push(j + 1);
      else columns.push({ index: j, name: header ? header[j] : String(j + 1), values });
    }
  }
  return { columns, skipped };
}

// One series. With several numeric columns, `column` (a header name or a 1-based index) picks it.
// Returns the values and the positions of any row-counter columns skipped.
export function readSeriesFile(path, column) {
  const table = parseTable(readText(path), path);
  if (!table.rows.length) throw new Error(`${path}: no data rows`);
  const { columns, skipped } = numericColumns(table);
  if (!columns.length) throw new Error(`${path}: no column holds only numbers`);
  if (column === undefined) {
    if (columns.length > 1) throw new Error(`${path}: ${columns.length} numeric columns (positions ${columns.map((c) => c.index + 1).join(", ")}); pick one with returns_column, by header name or position`);
    return { values: columns[0].values, skipped };
  }
  const picked = columns.find((c) => c.name === String(column)) ?? columns.find((c) => String(c.index + 1) === String(column));
  if (!picked) throw new Error(`${path}: returns_column matches no numeric column; numeric columns are at positions ${columns.map((c) => c.index + 1).join(", ")}`);
  return { values: picked.values, skipped };
}

// Every numeric column is one variant; rows are periods.
export function readMatrixFile(path) {
  const table = parseTable(readText(path), path);
  const { columns, skipped } = numericColumns(table);
  if (columns.length < 2) throw new Error(`${path}: needs at least 2 numeric columns, one per variant`);
  return { matrix: table.rows.map((_, i) => columns.map((c) => c.values[i])), skipped };
}
