// mcp-backtest/src/panel-io.mjs
//
// Reads and writes panels: a CSV with a `date` column (YYYY-MM-DD) and one column per ticker, one
// row per date. Prices are closes; a signal row is dated when its values became known. Empty cells
// are missing values (null), never zero. Files are read on this machine; nothing is uploaded.
import { readFileSync, statSync, writeFileSync } from "node:fs";

export const MAX_PANEL_BYTES = 64 * 1024 * 1024;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function splitLine(line) {
  const out = [];
  let cell = "", quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cell); cell = ""; }
    else cell += c;
  }
  out.push(cell);
  return out.map((s) => s.trim());
}

export function parsePanel(text, name = "panel") {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new RangeError(`${name} needs a header row and at least one data row`);
  const header = splitLine(lines[0]);
  if (header[0].toLowerCase() !== "date") throw new RangeError(`${name}'s first column must be "date"; got ${JSON.stringify(header[0])}`);
  const tickers = header.slice(1);
  if (!tickers.length) throw new RangeError(`${name} has no ticker columns`);
  const dupe = tickers.find((t, i) => tickers.indexOf(t) !== i);
  if (dupe) throw new RangeError(`${name} names the column ${dupe} twice`);
  const dates = [];
  const values = Object.fromEntries(tickers.map((t) => [t, []]));
  for (let r = 1; r < lines.length; r += 1) {
    const cells = splitLine(lines[r]);
    const date = cells[0];
    if (!DATE.test(date)) throw new RangeError(`${name} row ${r + 1}: date ${JSON.stringify(date)} is not YYYY-MM-DD`);
    if (dates.length && !(date > dates.at(-1))) throw new RangeError(`${name} row ${r + 1}: dates must be strictly increasing (${dates.at(-1)} then ${date})`);
    dates.push(date);
    tickers.forEach((t, i) => {
      const raw = cells[i + 1] ?? "";
      if (raw === "" || /^(na|nan|null)$/i.test(raw)) { values[t].push(null); return; }
      const x = Number(raw);
      if (!Number.isFinite(x)) throw new RangeError(`${name} row ${r + 1}, column ${t}: ${JSON.stringify(raw)} is not a number`);
      values[t].push(x);
    });
  }
  return { dates, tickers, values };
}

export function readPanel(path, name) {
  const size = statSync(path).size;
  if (size > MAX_PANEL_BYTES) throw new RangeError(`${path} is ${size} bytes; the limit is ${MAX_PANEL_BYTES}`);
  return parsePanel(readFileSync(path, "utf8"), name ?? path);
}

export function writePanel(path, { dates, tickers, values }) {
  const rows = [["date", ...tickers].join(",")];
  dates.forEach((d, i) => rows.push([d, ...tickers.map((t) => (values[t][i] === null || values[t][i] === undefined ? "" : String(values[t][i])))].join(",")));
  writeFileSync(path, rows.join("\n") + "\n");
}
