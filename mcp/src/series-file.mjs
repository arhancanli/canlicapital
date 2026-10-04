// mcp/src/series-file.mjs
//
// Reads a return series, or a matrix of variant returns, from a file on the machine the server runs
// on, so an agent can point a tool at its backtest output instead of copying hundreds of numbers
// into the call (the agent benchmark measured transcription errors on long pasted series).
//
// Only numbers leave this module. Error messages name rows and columns by position, never by a
// cell's content or a header's text, so a path pointed at the wrong file cannot echo that file back
// into the conversation. The hosted endpoint never reads files (see toolAuditBacktest).
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";

export const MAX_SERIES_FILE_BYTES = 5 * 1024 * 1024;
// check_leakage's file holds a full run and every prefix run of each column: several times a series.
export const MAX_COLUMNS_FILE_BYTES = 50 * 1024 * 1024;

// One open file descriptor for the check and the read, so the file checked is the file read: a
// path swapped between a separate stat and read could otherwise pass the size and type checks as
// one file and be read as another. The read stops one byte past the cap, whatever the file grows to.
function readText(path, maxBytes = MAX_SERIES_FILE_BYTES) {
  let fd;
  try {
    fd = openSync(resolve(path), "r");
  } catch {
    throw new Error(`${path}: no such file`);
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error(`${path}: not a regular file`);
    if (stat.size > maxBytes) throw new Error(`${path}: larger than ${maxBytes} bytes`);
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    for (;;) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
      if (length > maxBytes) throw new Error(`${path}: larger than ${maxBytes} bytes`);
    }
    return buffer.toString("utf8", 0, length);
  } finally {
    closeSync(fd);
  }
}

const isNumber = (cell) => cell.trim() !== "" && Number.isFinite(Number(cell.trim()));
// Cells a spreadsheet or pandas writes for a missing value.
const isMissing = (cell) => /^(|nan|na|n\/a|#n\/a|null|none|-)$/i.test(cell.trim());
const DATE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})([ T].*)?$/;
const kindOf = (cell) => (isNumber(cell) ? "number" : isMissing(cell) ? "missing" : DATE.test(cell.trim()) ? "date" : "text");

// The first row is a header when one of its cells differs in kind from the cells below it: a label
// above numbers or dates. A date above dates is data, so a file without a header keeps its first row.
function hasHeader(first, below) {
  if (!first.some((cell) => !isNumber(cell))) return false;
  if (!below.length) return true;
  return first.some((cell, j) => {
    if (isNumber(cell)) return false;
    // Missing values say nothing about what a column holds, so they do not vote.
    const kinds = below.map((row) => kindOf(row[j] ?? "")).filter((k) => k !== "missing");
    if (!kinds.length) return true;
    const count = (k) => kinds.filter((x) => x === k).length;
    const common = [...new Set(kinds)].sort((a, b) => count(b) - count(a))[0];
    return kindOf(cell) !== common;
  });
}

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
  const header = hasHeader(first, lines.slice(1, 6).map(split)) ? first : null;
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
// A column of numbers with some empty or NaN cells is not dropped: it is reported as incomplete, so
// a blank cell can never make the reader pick a different column (a benchmark) in its place.
function numericColumns({ header, rows }) {
  const width = rows[0]?.length ?? 0;
  const columns = [];
  const incomplete = [];
  const skipped = [];
  const offset = header ? 2 : 1; // file line of the first data row
  for (let j = 0; j < width; j += 1) {
    const cells = rows.map((row) => (typeof row[j] === "number" ? String(row[j]) : String(row[j])));
    const numeric = cells.filter(isNumber).length;
    if (numeric === cells.length) {
      const values = cells.map(Number);
      if (isRowCounter(header ? header[j] : null, values)) skipped.push(j + 1);
      else columns.push({ index: j, name: header ? header[j] : String(j + 1), values });
    } else if (numeric > 0 && numeric * 2 >= cells.length && cells.every((c) => isNumber(c) || isMissing(c))) {
      const gaps = cells.map((c, i) => (isNumber(c) ? null : i + offset)).filter((i) => i !== null);
      incomplete.push({ index: j, name: header ? header[j] : String(j + 1), gaps });
    }
  }
  return { columns, incomplete, skipped };
}

const lineList = (gaps) => (gaps.length > 5 ? `${gaps.slice(0, 5).join(", ")} and ${gaps.length - 5} more` : gaps.join(", "));
const incompleteError = (path, c) => new Error(`${path}: column ${c.index + 1} holds numbers but is empty or not a number on line${c.gaps.length > 1 ? "s" : ""} ${lineList(c.gaps)}; fill or remove those rows, or pick another column with returns_column`);

// One series. With several numeric columns, `column` (a header name or a 1-based index) picks it.
// Returns the values, the 1-based position of the column read, and the positions of any row-counter
// columns skipped. Without `column`, any incomplete numeric column is refused, naming its lines.
export function readSeriesFile(path, column) {
  const table = parseTable(readText(path), path);
  if (!table.rows.length) throw new Error(`${path}: no data rows`);
  const { columns, incomplete, skipped } = numericColumns(table);
  const match = (list) => list.find((c) => c.name === String(column)) ?? list.find((c) => String(c.index + 1) === String(column));
  if (column === undefined) {
    if (incomplete.length) throw incompleteError(path, incomplete[0]);
    if (!columns.length) throw new Error(`${path}: no column holds only numbers`);
    if (columns.length > 1) throw new Error(`${path}: ${columns.length} numeric columns (positions ${columns.map((c) => c.index + 1).join(", ")}); pick one with returns_column, by header name or position`);
    return { values: columns[0].values, column: columns[0].index + 1, skipped };
  }
  const gappy = match(incomplete);
  if (gappy) throw incompleteError(path, gappy);
  const picked = match(columns);
  if (!picked) throw new Error(`${path}: returns_column matches no numeric column; numeric columns are at positions ${columns.map((c) => c.index + 1).join(", ") || "none"}`);
  return { values: picked.values, column: picked.index + 1, skipped };
}

// One series plus, when the file has one, its ISO date column (YYYY-MM-DD, optionally with a time),
// so a summary can name the day a drawdown began instead of a row number. Dates are the only
// non-numeric cells that ever leave this module, and only when every cell of the column is an ISO
// date: a strict shape that cannot carry anything else from the file into the conversation.
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})(?:[ T][0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export function readSeriesWithDates(path, column) {
  const series = readSeriesFile(path, column);
  const table = parseTable(readText(path), path);
  if (!table.rows.length || typeof table.rows[0][0] === "number") return { ...series, dates: null };
  const width = table.rows[0].length;
  for (let j = 0; j < width; j += 1) {
    const cells = table.rows.map((row) => String(row[j]).trim());
    if (cells.every((cell) => ISO_DATE.test(cell))) return { ...series, dates: cells.map((cell) => cell.slice(0, 10)), date_column: j + 1 };
  }
  return { ...series, dates: null };
}

// Every numeric column is one variant; rows are periods. An incomplete column is refused.
export function readMatrixFile(path) {
  const table = parseTable(readText(path), path);
  const { columns, incomplete, skipped } = numericColumns(table);
  if (incomplete.length) throw incompleteError(path, incomplete[0]);
  if (columns.length < 2) throw new Error(`${path}: needs at least 2 numeric columns, one per variant`);
  return { matrix: table.rows.map((_, i) => columns.map((c) => c.values[i])), skipped };
}

// check_leakage's columns as the caller's script wrote them: {"columns": {name: {"full": [...],
// "prefixes": [[...], ...]}}}, with "cuts" and "timestamps" if the script has them. Python's
// json.dump writes a missing value as NaN, which is not JSON, so NaN reads as null. Every problem
// is named by position; names leave this module only once every column has the right shape.
export function readColumnsFile(path) {
  const text = readText(path, MAX_COLUMNS_FILE_BYTES).replace(/(?<=[[,:]\s*)NaN(?=\s*[,\]}])/g, "null");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${path}: does not parse as JSON (numbers, null for a missing value)`);
  }
  const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isObject(value) || !isObject(value.columns)) throw new Error(`${path}: must be a JSON object {"columns": {name: {"full": [...], "prefixes": [[...], ...]}}}`);
  Object.entries(value.columns).forEach(([name, column], i) => {
    if (name.length > 100) throw new Error(`${path}: column ${i + 1} has a name longer than 100 characters`);
    if (!isObject(column) || !Array.isArray(column.full) || !Array.isArray(column.prefixes) || !column.prefixes.every(Array.isArray)) {
      throw new Error(`${path}: column ${i + 1} is not {"full": [...], "prefixes": [[...], ...]}`);
    }
    [column.full, ...column.prefixes].forEach((run, r) => run.forEach((cell, t) => {
      if (cell !== null && !(typeof cell === "number" && Number.isFinite(cell))) {
        throw new Error(`${path}: column ${i + 1}, ${r === 0 ? "full" : `prefixes[${r - 1}]`}[${t}] is not a finite number or null`);
      }
    }));
  });
  if (value.cuts !== undefined && !(Array.isArray(value.cuts) && value.cuts.every(Number.isInteger))) throw new Error(`${path}: cuts must be a list of whole numbers`);
  if (value.timestamps !== undefined && !(Array.isArray(value.timestamps) && value.timestamps.every((v) => typeof v === "string" || typeof v === "number"))) {
    throw new Error(`${path}: timestamps must be a list of dates or numbers`);
  }
  return { columns: value.columns, cuts: value.cuts, timestamps: value.timestamps?.map(String) };
}
