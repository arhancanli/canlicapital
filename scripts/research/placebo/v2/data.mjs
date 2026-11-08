// Placebo study v2: reads the Kenneth French Data Library CSV files named in the pre-registration
// (config/research/placebo-v2-prereg.json), checks each file's SHA-256 against the registered value,
// and builds the monthly panels the pipelines search. Nothing here is fetched or executed: the files
// are read as text from a directory given on the command line.
//
// A French CSV holds several blocks (monthly, annual, value- and equal-weighted). We take the first
// block of rows whose first field is a date (yyyymm or yyyymmdd): monthly returns, value-weighted for
// the industry files, daily returns for the daily files. Values are percent; we divide by 100.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** The first date-keyed block of a French CSV: { columns, dates, rows }. Missing markers stop the run. */
export function firstBlock(text) {
  const lines = text.split(/\r?\n/);
  let header = null, started = false;
  const dates = [], rows = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const isRow = /^\d{6}(\d{2})?$/.test(cells[0]);
    if (!started && isRow) {
      started = true;
      header = lines[i - 1].split(",").map((c) => c.trim()).slice(1);
    }
    if (started && !isRow) break;
    if (!started) continue;
    const values = cells.slice(1).map(Number);
    if (values.length !== header.length || values.some((v) => !Number.isFinite(v) || v <= -99.99)) {
      throw new Error(`row ${cells[0]}: missing or malformed value`);
    }
    dates.push(Number(cells[0]));
    rows.push(values.map((v) => v / 100));
  }
  if (!started) throw new Error("no date-keyed block");
  return { columns: header, dates, rows };
}

const monthOf = (date) => (date > 999999 ? Math.floor(date / 100) : date);
const monthIndex = (yyyymm) => Math.floor(yyyymm / 100) * 12 + ((yyyymm % 100) - 1);
export const monthLabel = (index) => Math.floor(index / 12) * 100 + (index % 12) + 1;

/** Reads every registered file, checking hashes. Returns parsed blocks keyed by file name. */
export function readFiles(dir, files) {
  const out = {};
  for (const [name, { sha256: want }] of Object.entries(files)) {
    const path = join(dir, name);
    const got = sha256(path);
    if (got !== want) throw new Error(`${name}: SHA-256 ${got} is not the registered ${want}`);
    out[name] = firstBlock(readFileSync(path, "utf8"));
  }
  return out;
}

/** A monthly series per requested (file, column), as a Map from month index to return. */
function monthlySeries(block, column) {
  const c = block.columns.indexOf(column);
  if (c < 0) throw new Error(`no column ${column}`);
  return new Map(block.dates.map((d, t) => [monthIndex(monthOf(d)), block.rows[t][c]]));
}

/**
 * Realized variance per month from daily returns, as Moreira and Muir (2017) define it: the sum of
 * squared deviations of the month's daily returns from their own monthly mean.
 */
function monthlyVariance(block, column) {
  const c = block.columns.indexOf(column);
  if (c < 0) throw new Error(`no column ${column}`);
  const days = new Map();
  block.dates.forEach((d, t) => {
    const m = monthIndex(monthOf(d));
    if (!days.has(m)) days.set(m, []);
    days.get(m).push(block.rows[t][c]);
  });
  const out = new Map();
  for (const [m, r] of days) {
    const mean = r.reduce((a, x) => a + x, 0) / r.length;
    out.set(m, r.reduce((a, x) => a + (x - mean) ** 2, 0));
  }
  return out;
}

/**
 * A complete monthly panel over [first, last] months (yyyymm) for the named sources.
 * sources: [{ name, file, column, daily? }]; a daily source adds that month's realized variance.
 * Returns { months: [yyyymm], names, returns: [Float64Array per series], variance: [Float64Array|null] }.
 */
export function panel(blocks, sources, first, last) {
  const from = monthIndex(first), to = monthIndex(last);
  const months = [];
  for (let m = from; m <= to; m++) months.push(monthLabel(m));
  const returns = [], variance = [];
  for (const s of sources) {
    const series = monthlySeries(blocks[s.file], s.column);
    returns.push(Float64Array.from(months, (yyyymm) => {
      const v = series.get(monthIndex(yyyymm));
      if (v === undefined) throw new Error(`${s.name}: no return for ${yyyymm}`);
      return v;
    }));
    if (s.daily) {
      const rv = monthlyVariance(blocks[s.daily.file], s.daily.column);
      variance.push(Float64Array.from(months, (yyyymm) => {
        const v = rv.get(monthIndex(yyyymm));
        if (!(v > 0)) throw new Error(`${s.name}: no daily returns for ${yyyymm}`);
        return v;
      }));
    } else variance.push(null);
  }
  return { months, names: sources.map((s) => s.name), returns, variance };
}

/** The last month every source covers (yyyymm). */
export function lastCommonMonth(blocks, sources) {
  let last = Infinity;
  for (const s of sources) {
    const series = monthlySeries(blocks[s.file], s.column);
    last = Math.min(last, Math.max(...series.keys()));
    if (s.daily) last = Math.min(last, Math.max(...monthlyVariance(blocks[s.daily.file], s.daily.column).keys()));
  }
  return monthLabel(last);
}
