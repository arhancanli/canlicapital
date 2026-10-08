#!/usr/bin/env node
// canli-backtest-mcp: backtests an agent can trust. Point-in-time factors from SEC filings, a
// cross-sectional backtest of any signal against prices the caller supplies (a trade only ever uses
// what was known before it), costs and turnover on the actual trades, and every variant recorded in
// a trial ledger so the best of a search is judged against the whole search.
//
// Local stdio only: prices, signals and ledgers stay on this machine. Point-in-time SEC data comes
// from canli-fundamentals-mcp (cached under ~/.cache/canli-fundamentals); the ledger is
// canli-validation-mcp's (files under ~/.canli/ledgers), so both servers read the same searches.
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { createSession as fundamentalsSession, loadCompany, resolveSeries } from "canli-fundamentals-mcp/src/server.mjs";
import { ledgerDir, recordTrial } from "canli-validation-mcp/src/ledger.mjs";

import { ENGINE_LIMITS_TEXT, describe, runBacktest } from "./engine.mjs";
import { readPanel, writePanel } from "./panel-io.mjs";
import { FACTORS, PIT_LIMITS_TEXT, buildFactorPanel } from "./pit.mjs";

export const SERVER_NAME = "canli-backtest-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SERVER_INSTRUCTIONS = "Backtests that refuse lookahead. Build a point-in-time factor from SEC filings with pit_factor (or bring your own signal CSV, each row dated when it was known), then run backtest_signal against your own prices CSV. Pass the same ledger name to every backtest_signal call in one search: the reply judges the best variant against all of them.";
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  title: "Canli Backtest",
  websiteUrl: "https://canlicapital.com/mcp-servers",
  icons: [
    { src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
    { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
  ],
});

const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");

export function createSession({ fundamentals, ledger, outDir } = {}) {
  return { fundamentals: fundamentals ?? fundamentalsSession(), ledgerDir: ledger ?? ledgerDir(), outDir: outDir ?? null };
}

// First trading day of each month in [start, end], from the weekday calendar (exchange holidays are
// not modelled; the engine aligns signal rows to whatever price dates exist).
export function monthStarts(start, end) {
  const out = [];
  const d = new Date(`${start}T00:00:00Z`);
  let month = null;
  while (d.toISOString().slice(0, 10) <= end) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() % 6 !== 0 && iso.slice(0, 7) !== month) { out.push(iso); month = iso.slice(0, 7); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const pitInput = z.object({
  factor: z.string().describe(`One of ${Object.keys(FACTORS).join(", ")}, or level:<measure> (revenue, net_income, assets, ...).`),
  tickers: z.array(z.string().min(1).max(20)).min(1).max(1000).describe("Tickers (or CIKs) to compute it for."),
  start: date, end: date,
  out_file: z.string().optional().describe("Where to write the signal CSV; default a new temporary file."),
});
export const backtestInput = z.object({
  prices_file: z.string().describe("CSV: a date column (YYYY-MM-DD) and one column of closing prices per ticker."),
  signal_file: z.string().describe("CSV in the same shape; each row dated when its values became known (pit_factor writes this)."),
  rebalance: z.union([z.enum(["weekly", "monthly", "quarterly"]), z.number().int().min(1)]).optional().describe("Default monthly; or every N trading days."),
  lag_days: z.number().int().min(1).optional().describe("Trading days between a signal becoming known and trading on it. Default 1, the minimum."),
  side: z.enum(["long_short", "long_only"]).optional().describe("Default long_short: long the top quantile, short the bottom."),
  quantile: z.number().gt(0).max(0.5).optional().describe("Fraction of ranked names in each leg. Default 0.2."),
  cost_bps: z.number().min(0).optional().describe("Cost per unit traded, in basis points. Default 10."),
  min_names: z.number().int().min(2).optional().describe("Skip a rebalance with fewer ranked names. Default 5."),
  periods_per_year: z.number().positive().optional().describe("Default 252 (daily prices)."),
  ledger: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/).optional().describe("Record this run in a search ledger (created if new) and judge it against every run recorded there."),
  label: z.string().min(1).max(200).optional().describe("The variant's name in the ledger. Default: the settings."),
});

export const TOOL_DESCRIPTIONS = Object.freeze({
  list_factors: "The point-in-time factors pit_factor builds from SEC filings, and what each measures.",
  pit_factor: `Build a factor from SEC filings for a list of tickers, monthly from start to end, using only what had been filed by each date (restatements invisible until filed). Writes a signal CSV for backtest_signal. ${PIT_LIMITS_TEXT[0]}`,
  backtest_signal: `Backtest a signal against your prices: rank, long and short quantiles, rebalance, trading only on what was known lag_days earlier, costs on actual trades. Pass ledger to judge the best of a search against all of it. ${ENGINE_LIMITS_TEXT[1]}`,
});

export async function toolPitFactor(session, args) {
  const { factor, tickers, start, end, out_file } = pitInput.parse(args);
  if (!(start < end)) throw new RangeError("start must be before end");
  const dates = monthStarts(start, end);
  const loadSeries = async (ticker, names) => {
    const entry = await loadCompany(session.fundamentals, ticker);
    const series = {};
    for (const n of names) { try { series[n] = resolveSeries(entry, n); } catch { /* measure not reported */ } }
    return { matchedName: entry.name, series };
  };
  const panel = await buildFactorPanel({ factor, tickers, dates, loadSeries });
  const file = out_file ?? join(session.outDir ?? mkdtempSync(join(tmpdir(), "canli-pit-")), `${factor.replace(":", "-")}.csv`);
  writePanel(file, panel);
  const covered = panel.coverage.map((c) => c.companies_with_value);
  return text({
    factor, meaning: FACTORS[factor]?.meaning ?? `annual ${factor.slice(6)} as filed`, file,
    dates: dates.length, tickers: tickers.length, first_date: dates[0], last_date: dates.at(-1),
    coverage: { min: Math.min(...covered), median: covered.slice().sort((a, b) => a - b)[Math.floor(covered.length / 2)], max: Math.max(...covered) },
    matched: panel.matched, ...(Object.keys(panel.missing).length ? { missing: panel.missing } : {}),
    next: `backtest_signal with signal_file ${file} and your prices_file; lag_days 1 or more.`,
    limits: PIT_LIMITS_TEXT,
  });
}

export async function toolBacktestSignal(session, args) {
  const a = backtestInput.parse(args);
  const prices = readPanel(a.prices_file, "prices_file");
  const signal = readPanel(a.signal_file, "signal_file");
  const tickers = prices.tickers.filter((t) => signal.tickers.includes(t));
  const cfg = { rebalance: a.rebalance ?? "monthly", lagDays: a.lag_days ?? 1, side: a.side ?? "long_short", quantile: a.quantile ?? 0.2, costBps: a.cost_bps ?? 10, minNames: a.min_names ?? 5, periodsPerYear: a.periods_per_year ?? 252 };
  const result = runBacktest({ dates: prices.dates, tickers, prices: prices.values, signalDates: signal.dates, signals: signal.values, ...cfg });
  const stats = describe(result);
  const settings = { rebalance: cfg.rebalance, lag_days: cfg.lagDays, side: cfg.side, quantile: cfg.quantile, cost_bps: cfg.costBps, min_names: cfg.minNames };
  let search = null;
  if (a.ledger) {
    const label = a.label ?? `${a.signal_file.split("/").pop()} ${cfg.side} q${cfg.quantile} ${cfg.rebalance} lag${cfg.lagDays} ${cfg.costBps}bps`;
    const r = recordTrial(session.ledgerDir, { ledger: a.ledger, label, returns: result.returns, periods_per_year: cfg.periodsPerYear, params: { ...settings, signal_file: a.signal_file } });
    search = { ledger: r.ledger, trial: r.trial, trials: r.trials, best: r.best, deflated: r.deflated, overfitting: r.overfitting, plain_reading: r.plain_reading };
  }
  const plain = `${stats.first_date} to ${stats.last_date}, ${tickers.length} tickers: annualized Sharpe ${stats.sharpe_annualized?.toFixed(2)}, return ${(100 * (stats.annualized_return ?? 0)).toFixed(1)}% a year, worst drawdown ${(100 * stats.max_drawdown).toFixed(1)}%, turnover ${stats.turnover_per_year?.toFixed(1)}x a year after ${cfg.costBps} bps costs. Every trade used signals at least ${stats.causality.min_days_signal_to_trade} calendar days old.`;
  return text({ settings, tickers: tickers.length, ...stats, plain_reading: plain, ...(search ? { search } : {}), limits: ENGINE_LIMITS_TEXT });
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITES_LOCAL = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export function registerTools(server, session) {
  const catalog = {};
  const tool = (name, title, input, annotations, handler) => {
    server.registerTool(name, { title, annotations: { title, ...annotations }, description: TOOL_DESCRIPTIONS[name], inputSchema: input }, handler);
    catalog[name] = { description: TOOL_DESCRIPTIONS[name], inputSchema: input };
  };
  tool("list_factors", "Point-in-time factors", z.object({}).strict(), READ_ONLY, async () => text({ factors: Object.fromEntries(Object.entries(FACTORS).map(([k, v]) => [k, v.meaning])), plus: "level:<measure> for any annual measure (revenue, net_income, assets, equity, operating_cash_flow, ...)", limits: PIT_LIMITS_TEXT }));
  tool("pit_factor", "Build a point-in-time factor", pitInput, { ...WRITES_LOCAL, openWorldHint: true }, (args) => toolPitFactor(session, args));
  tool("backtest_signal", "Backtest a signal without lookahead", backtestInput, WRITES_LOCAL, (args) => toolBacktestSignal(session, args));
  return catalog;
}

const isMain = (() => {
  try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

if (isMain) {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server, createSession());
  await server.connect(new StdioServerTransport());
}
