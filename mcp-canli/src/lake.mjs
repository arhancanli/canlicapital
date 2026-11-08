// mcp-canli/src/lake.mjs
//
// The data lake's tools (the lake itself is local/lake.mjs): save any tool's table as a dated vintage, import a local
// file, list, query with read-only SQL, and pivot into a wide panel the backtest tools read with $file. Local only.
import { createHash } from "node:crypto";

import { z } from "zod";

const NAME = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/, "lower-case letters, digits and _, starting with a letter");
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

export const LAKE_LIMITS = "Kept on this machine as Parquet under CANLI_HOME/lake. Each save is a new dated vintage, never written over, so a panel can be built as the lake knew it on a day; that covers what this machine saved, from the day it saved it. DuckDB here reaches only the lake folder: no other file, no network.";

export const LAKE_TOOLS = Object.freeze([
  { name: "lake_save", pack: "desk", toolset: "desk", title: "Save a tool's table into the data lake", annotations: { ...WRITES, openWorldHint: true },
    input: z.object({ dataset: NAME.describe("The dataset to add a vintage to."), name: z.string().min(1).max(100).describe("The tool whose table to save, as find_tool names it (price_history, crypto_markets, history, ...)."), arguments: z.record(z.string(), z.unknown()).optional(), path: z.string().max(100).optional().describe("Where the table sits in the answer, when not at its top (e.g. bars).") }).strict(),
    description: "Run a tool and save its table (columns and rows) into a dataset in the data lake on this machine, as a new vintage stamped with the time saved. Every free source the server reads can feed the lake this way. Needs DuckDB: npx -y canli-mcp lake setup. Local server only.",
    keywords: "data lake save store parquet duckdb local warehouse cache history dataset vintage point in time",
    args: "dataset: string, name: string, arguments?: object, path?: string" },
  { name: "lake_import", pack: "desk", toolset: "desk", title: "Import a local file into the data lake", annotations: WRITES,
    input: z.object({ dataset: NAME, file: z.string().min(1).max(500).describe("A .csv, .tsv or .parquet file on this machine (your own or licensed data).") }).strict(),
    description: "Copy a local CSV, TSV or Parquet file into a dataset in the data lake as a new dated vintage, with its hash. For data you already hold, such as a licensed options or futures history. Local server only.",
    keywords: "import csv parquet file data lake load bring your own data licensed options futures",
    args: "dataset: string, file: string" },
  { name: "lake_list", pack: "desk", toolset: "desk", title: "The data lake's datasets", annotations: RO,
    input: z.object({}).strict(),
    description: "Each dataset in the data lake on this machine: rows, columns and types, how many vintages and when saved, and where the latest came from.",
    keywords: "data lake list datasets tables catalog schema vintages",
    args: "" },
  { name: "lake_query", pack: "desk", toolset: "desk", title: "Query the data lake with SQL", annotations: RO,
    input: z.object({ sql: z.string().min(1).max(8000).describe("One read-only DuckDB statement; each dataset is a view by its name, with _saved_at on every row."), limit: z.number().int().min(1).max(20000).optional().describe("Rows returned, default 1000.") }).strict(),
    description: "Run one read-only DuckDB SQL statement (SELECT, WITH, FROM, DESCRIBE, SUMMARIZE) over the data lake's datasets, each a view by its name. Writes, other files and the network are refused. Local server only.",
    keywords: "sql query duckdb data lake select aggregate join window analytics local",
    args: "sql: string, limit?: integer" },
  { name: "lake_panel", pack: "desk", toolset: "desk", title: "A wide price panel from the data lake", annotations: WRITES,
    input: z.object({
      dataset: NAME, date: z.string().min(1).max(64).describe("The date column."), symbol: z.string().min(1).max(64).describe("The column naming each series (ticker, pair, factor)."), value: z.string().min(1).max(64).describe("The value column, such as close."),
      symbols: z.array(z.string().min(1).max(40)).max(2000).optional(), start: DAY.optional(), end: DAY.optional(),
      as_of: DAY.optional().describe("Build it from vintages saved on or before this day: the lake as it was then."),
      name: NAME.describe("The panel's file name."),
    }).strict(),
    description: "Pivot a long dataset (date, symbol, value) into a wide panel, one column per symbol, the latest vintage of each value, or as the lake knew it on as_of, written as CSV in the lake for backtests: prices_file or {\"$file\": ..., \"columns\": \"all\"}. Local server only.",
    keywords: "panel pivot wide matrix prices universe point in time as of backtest input multi asset",
    args: "dataset: string, date: string, symbol: string, value: string, symbols?: string[], start?: date, end?: date, as_of?: date, name: string" },
]);

const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

// ctx: { call(name, args), at(value, path), lake: async () => the lake (local/lake.mjs) }.
export async function runLake(ctx, name, args) {
  const spec = LAKE_TOOLS.find((t) => t.name === name);
  const a = spec.input.parse(args ?? {});
  const lake = await ctx.lake();
  if (name === "lake_save") {
    if (a.name.startsWith("lake_")) throw new Error("lake_save saves another tool's table, not the lake's own.");
    const result = await ctx.call(a.name, a.arguments ?? {});
    const table = a.path ? ctx.at(result, a.path) : result;
    if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) throw new Error(`${a.name}'s answer${a.path ? ` at ${a.path}` : ""} has no table (columns and rows)${a.path ? "" : "; name its place with path"}.`);
    const saved = await lake.save(a.dataset, table, { tool: a.name, input_sha256: sha({ name: a.name, arguments: a.arguments ?? {} }), output_sha256: sha(table) });
    return { ...saved, limits: LAKE_LIMITS };
  }
  if (name === "lake_import") return { ...(await lake.import(a.dataset, a.file)), limits: LAKE_LIMITS };
  if (name === "lake_list") return { datasets: await lake.list(), dir: lake.dir, limits: LAKE_LIMITS };
  if (name === "lake_query") return await lake.query(a.sql, a.limit ?? 1000);
  return { ...(await lake.panel(a)), limits: LAKE_LIMITS };
}
