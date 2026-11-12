// The data lake on this machine: tables kept as Parquet in CANLI_HOME/lake, read with DuckDB. Any canli tool's table
// can be saved into it (so every free source the server reads feeds it), local CSV or Parquet files imported, and the
// lake queried with SQL or pivoted into a wide price panel that the backtest tools read with $file.
//
// Every save is a new vintage stamped with the time it was saved (_saved_at), never written over, so a panel can be
// built as the lake knew it on a past day. That is point-in-time for what this machine collected, from the day it
// collected it; it cannot know what a source said before then.
//
// DuckDB is optional (about 66 MB): `canli-mcp lake setup` installs a pinned version into CANLI_HOME/lake-engine. Each
// connection is locked before any SQL runs: it reaches only the lake folder (no other file, no network, no
// extensions), and the lock cannot be lifted from SQL. Queries must be one read-only statement.
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DUCKDB_PACKAGE = "@duckdb/node-api@1.5.6-r.2";
const NAME = /^[a-z][a-z0-9_]{0,47}$/;
const MAX_ROWS_OUT = 20000;

export const lakeDir = (home) => join(home, "lake");
export const engineDir = (home) => join(home, "lake-engine");

async function loadDuckDb(home) {
  const dir = engineDir(home);
  if (existsSync(join(dir, "node_modules", "@duckdb", "node-api"))) {
    const req = createRequire(join(dir, "package.json"));
    return import(pathToFileURL(req.resolve("@duckdb/node-api")).href);
  }
  try { return await import("@duckdb/node-api"); } catch {
    throw new Error(`The data lake needs DuckDB, which is not installed. Run once: npx -y canli-mcp lake setup (installs ${DUCKDB_PACKAGE}, about 66 MB, into ${dir}).`);
  }
}

const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
// DuckDB's BIGINT and HUGEINT come back as BigInt; dates and timestamps as their text.
const plain = (v) => (typeof v === "bigint" ? Number(v) : v && typeof v === "object" && !Array.isArray(v) && typeof v.toString === "function" && !(v instanceof Date) ? String(v) : v);

export async function openLake(home, { now = () => new Date().toISOString() } = {}) {
  const dir = lakeDir(home);
  const { DuckDBInstance } = await loadDuckDb(home);
  mkdirSync(join(dir, "panels"), { recursive: true, mode: 0o700 });
  mkdirSync(join(dir, ".staging"), { recursive: true, mode: 0o700 });
  const instance = await DuckDBInstance.create(":memory:", { autoinstall_known_extensions: "false", autoload_known_extensions: "false" });
  const conn = await instance.connect();
  await conn.run(`SET allowed_directories = [${sqlString(resolve(dir))}]`);
  await conn.run("SET enable_external_access = false");
  await conn.run("SET lock_configuration = true");

  const datasets = () => readdirSync(dir).filter((d) => NAME.test(d) && statSync(join(dir, d)).isDirectory() && readdirSync(join(dir, d)).some((f) => f.endsWith(".parquet")));
  const glob = (name) => sqlString(join(resolve(dir), name, "*.parquet"));
  const views = async () => { for (const d of datasets()) await conn.run(`CREATE OR REPLACE VIEW ${ident(d)} AS SELECT * FROM read_parquet(${glob(d)}, union_by_name = true)`); };
  const read = async (sql, limit = MAX_ROWS_OUT) => {
    const r = await conn.runAndReadAll(sql);
    const columns = r.columnNames(), rows = r.getRows().slice(0, limit).map((row) => row.map(plain));
    return { columns, rows, total: r.currentRowCount };
  };
  const stamp = () => now().replace(/[:.]/g, "-");
  const checkName = (name) => { if (!NAME.test(name)) throw new Error(`A dataset name is lower-case letters, digits and _ (starting with a letter), up to 48: not "${name}".`); return name; };
  const writeMeta = (name, meta) => writeFileSync(join(dir, name, "vintages.jsonl"), `${JSON.stringify(meta)}\n`, { flag: "a", mode: 0o600 });

  return {
    dir,
    datasets,
    // A table {columns, rows} saved as a new vintage of a dataset.
    async save(name, table, meta = {}) {
      checkName(name);
      const { columns, rows } = table ?? {};
      if (!Array.isArray(columns) || !Array.isArray(rows) || !rows.length) throw new Error("Nothing to save: the result has no table (columns and rows).");
      if (columns.some((c) => typeof c !== "string" || !c || c.startsWith("_saved"))) throw new Error("Every column needs a name, and names starting with _saved are the lake's own.");
      mkdirSync(join(dir, name), { recursive: true, mode: 0o700 });
      const savedAt = now(), staging = join(dir, ".staging", `${name}-${stamp()}.json`);
      writeFileSync(staging, rows.map((r) => JSON.stringify(Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null])))).join("\n"), { mode: 0o600 });
      const out = join(dir, name, `${stamp()}.parquet`);
      try {
        await conn.run(`COPY (SELECT *, TIMESTAMPTZ ${sqlString(savedAt)} AS _saved_at FROM read_json_auto(${sqlString(staging)}, format = 'newline_delimited')) TO ${sqlString(out)} (FORMAT parquet)`);
      } finally { rmSync(staging, { force: true }); }
      writeMeta(name, { saved_at: savedAt, file: basename(out), rows: rows.length, columns, ...meta });
      return { dataset: name, saved_at: savedAt, rows: rows.length, columns, file: out };
    },
    // A local CSV or Parquet file copied in as a new vintage (the copy is made outside DuckDB, which sees only the lake).
    async import(name, file) {
      checkName(name);
      const full = resolve(String(file));
      const ext = extname(full).toLowerCase();
      if (![".csv", ".parquet", ".tsv"].includes(ext)) throw new Error("lake_import reads .csv, .tsv or .parquet files.");
      // One descriptor: the file checked is the file read, and the copy and its hash are of the same bytes.
      const fd = openSync(full, "r");
      let bytes;
      try {
        if (!fstatSync(fd).isFile()) throw new Error(`${file} is not a file.`);
        bytes = readFileSync(fd);
      } finally { closeSync(fd); }
      mkdirSync(join(dir, name), { recursive: true, mode: 0o700 });
      const savedAt = now(), staging = join(dir, ".staging", `${name}-${stamp()}${ext}`);
      writeFileSync(staging, bytes, { mode: 0o600 });
      const out = join(dir, name, `${stamp()}.parquet`);
      try {
        const source = ext === ".parquet" ? `read_parquet(${sqlString(staging)})` : `read_csv_auto(${sqlString(staging)})`;
        await conn.run(`COPY (SELECT *, TIMESTAMPTZ ${sqlString(savedAt)} AS _saved_at FROM ${source}) TO ${sqlString(out)} (FORMAT parquet)`);
      } finally { rmSync(staging, { force: true }); }
      const n = (await read(`SELECT count(*) FROM read_parquet(${sqlString(out)})`)).rows[0][0];
      writeMeta(name, { saved_at: savedAt, file: basename(out), rows: n, imported_from: basename(full), sha256: (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex") });
      return { dataset: name, saved_at: savedAt, rows: n, file: out };
    },
    async list() {
      await views();
      const out = [];
      for (const d of datasets()) {
        const vintages = readFileSync(join(dir, d, "vintages.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
        const desc = await read(`DESCRIBE ${ident(d)}`);
        const n = (await read(`SELECT count(*) FROM ${ident(d)}`)).rows[0][0];
        out.push({ dataset: d, rows: n, vintages: vintages.length, first_saved: vintages[0]?.saved_at, last_saved: vintages.at(-1)?.saved_at, columns: desc.rows.map((r) => `${r[0]} ${r[1]}`), source: vintages.at(-1)?.tool ? { tool: vintages.at(-1).tool, input_sha256: vintages.at(-1).input_sha256 } : vintages.at(-1)?.imported_from ? { imported_from: vintages.at(-1).imported_from } : null });
      }
      return out;
    },
    // One read-only statement over the datasets, each a view by its name.
    async query(sql, limit = 1000) {
      await views();
      const { StatementType } = await loadDuckDb(home);
      const statements = await conn.extractStatements(sql);
      if (statements.count !== 1) throw new Error("One SQL statement at a time.");
      const prepared = await statements.prepare(0);
      if (prepared.statementType !== StatementType.SELECT) throw new Error("lake_query runs one read-only statement (SELECT, WITH, FROM, DESCRIBE, SUMMARIZE); lake_panel pivots, and the lake changes only through lake_save and lake_import.");
      const r = await prepared.runAndReadAll();
      const columns = r.columnNames(), all = r.getRows();
      return { columns, rows: all.slice(0, limit).map((row) => row.map(plain)), total: all.length, ...(all.length > limit ? { truncated: true } : {}) };
    },
    // A wide panel (date, then one column per symbol), as the lake knew it at as_of, written as CSV for $file.
    async panel({ dataset, date, symbol, value, symbols, start, end, as_of, name }) {
      await views();
      if (!datasets().includes(dataset)) throw new Error(`No dataset ${dataset}; lake_list names them.`);
      checkName(name);
      const where = [`${ident(value)} IS NOT NULL`, ...(symbols?.length ? [`${ident(symbol)} IN (${symbols.map(sqlString).join(", ")})`] : []), ...(start ? [`CAST(${ident(date)} AS DATE) >= DATE ${sqlString(start)}`] : []), ...(end ? [`CAST(${ident(date)} AS DATE) <= DATE ${sqlString(end)}`] : []), ...(as_of ? [`_saved_at <= TIMESTAMPTZ ${sqlString(`${as_of}T23:59:59Z`)}`] : [])];
      // The latest vintage of each date and symbol that was saved by as_of.
      const latest = `SELECT CAST(${ident(date)} AS DATE) AS d, CAST(${ident(symbol)} AS VARCHAR) AS s, ${ident(value)} AS v FROM ${ident(dataset)} WHERE ${where.join(" AND ")} QUALIFY row_number() OVER (PARTITION BY CAST(${ident(date)} AS DATE), CAST(${ident(symbol)} AS VARCHAR) ORDER BY _saved_at DESC) = 1`;
      const syms = symbols?.length ? symbols : (await read(`SELECT DISTINCT s FROM (${latest}) ORDER BY s`)).rows.map((r) => r[0]);
      if (!syms.length) throw new Error("No rows match.");
      const wide = `SELECT d AS date, ${syms.map((s) => `max(v) FILTER (WHERE s = ${sqlString(s)}) AS ${ident(s)}`).join(", ")} FROM (${latest}) GROUP BY d ORDER BY d`;
      const out = join(dir, "panels", `${name}.csv`);
      await conn.run(`COPY (${wide}) TO ${sqlString(out)} (HEADER, DELIMITER ',')`);
      const shape = (await read(`SELECT count(*), min(date), max(date) FROM read_csv_auto(${sqlString(out)})`)).rows[0];
      return { panel: out, rows: shape[0], first: shape[1], last: shape[2], symbols: syms, ...(as_of ? { as_of } : {}), use: `{"$file": "${out}", "columns": "all"} or prices_file: "${out}"` };
    },
    close() { conn.closeSync?.(); instance.closeSync?.(); },
  };
}
