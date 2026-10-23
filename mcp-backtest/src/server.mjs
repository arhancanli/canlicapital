#!/usr/bin/env node
// canli-backtest-mcp: backtests an agent can trust. Point-in-time factors from SEC filings, a
// cross-sectional backtest of any signal against prices the caller supplies (a trade only ever uses
// what was known before it), costs and turnover on the actual trades, and every variant recorded in
// a trial ledger so the best of a search is judged against the whole search.
//
// Local stdio only: prices, signals and ledgers stay on this machine. Point-in-time SEC data comes
// from canli-fundamentals-mcp (cached under ~/.cache/canli-fundamentals); the ledger is
// canli-validation-mcp's (files under ~/.canli/ledgers), so both servers read the same searches.
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { createSession as fundamentalsSession, loadCompany, resolveSeries } from "canli-fundamentals-mcp/src/server.mjs";
import { createSession as marketsSession } from "canli-markets-mcp/src/sources.mjs";
import { ledgerDir, recordTrial } from "canli-validation-mcp/src/ledger.mjs";

import { agreementInput, annotationAgreement, annotationGold, annotationPacket, goldInput, packetInput } from "./annotate.mjs";
import { BREADTH_LIMITS_TEXT, effectiveBets, runBreadth, signalCatalog } from "./breadth.mjs";
import { ENGINE_LIMITS_TEXT, describe, runBacktest } from "./engine.mjs";
import { readPanel, writePanel } from "./panel-io.mjs";
import { FACTORS, PIT_LIMITS_TEXT, buildFactorPanel } from "./pit.mjs";

export const SERVER_NAME = "canli-backtest-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SERVER_INSTRUCTIONS = "Backtests that refuse lookahead. Build a point-in-time factor from SEC filings with pit_factor (or bring your own signal CSV, each row dated when it was known), then run backtest_signal against your own prices CSV. Pass the same ledger name to every backtest_signal call in one search: the reply judges the best variant against all of them. For breadth, breadth_book builds a sleeve for every signal in every industry from one price panel and trades them as one netted account; effective_bets counts the independent bets in any set of return series. For datasets, annotation_packet, annotation_agreement and annotation_gold turn figures into a gold set people have checked against the filings.";
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

// A path the file system can take: no NUL characters (Node throws a TypeError on them).
const filePath = z.string().min(1).refine((s) => !s.includes("\0"), "a file path cannot contain a NUL character");
export const pitInput = z.object({
  factor: z.string().describe(`One of ${Object.keys(FACTORS).join(", ")}, or level:<measure> (revenue, net_income, assets, ...).`),
  tickers: z.array(z.string().min(1).max(20)).min(1).max(1000).describe("Tickers (or CIKs) to compute it for."),
  start: date, end: date,
  out_file: filePath.optional().describe("Where to write the signal CSV; default a new temporary file."),
});
export const backtestInput = z.object({
  prices_file: filePath.describe("CSV: a date column (YYYY-MM-DD) and one column of closing prices per ticker."),
  signal_file: filePath.describe("CSV in the same shape; each row dated when its values became known (pit_factor writes this)."),
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

export const breadthInput = z.object({
  prices_file: filePath.describe("CSV: a date column and one column of closing (total-return) prices per ticker."),
  groups_file: filePath.optional().describe("CSV with columns ticker,group (an industry, say): one sleeve per signal per group. Default: one group, the whole panel."),
  dollar_volume_file: filePath.optional().describe("CSV like prices_file with daily dollar volume: adds the liquidity signals, a $5m liquidity floor and cost tiers by volume."),
  signals: z.array(z.string().min(1).max(40)).min(1).max(40).optional().describe("Signals from breadth_signals. Default: every one the data allows."),
  min_names: z.number().int().min(3).max(200).optional().describe("Fewest eligible names a group needs at a rebalance. Default 10."),
  smoothing: z.number().int().min(1).max(12).optional().describe("Rebalances whose weights are averaged (overlapping portfolios). Default 3 (monthly), 4 (weekly)."),
  cost_bps: z.number().min(0).max(500).optional().describe("Cost per unit traded when no dollar volume is given. Default 10."),
  target_vol: z.number().gt(0).max(1).optional().describe("Each sleeve's volatility target. Default 0.10."),
  split_date: date.optional().describe("Report the book before and after this date: choose on the first part, judge on the second."),
  out_file: filePath.optional().describe("Where to write every sleeve's daily returns (CSV, one column per sleeve): a dataset to train or select on. Its specs go beside it as .specs.json. Default: a new temporary file."),
  ledger: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/).optional().describe("Record the netted book in a search ledger and judge it against every run there."),
}).strict();
export const betsInput = z.object({
  returns_file: filePath.describe("CSV: a date column and one column of daily returns per series (breadth_book's out_file, say)."),
  family_separator: z.string().min(1).max(3).optional().describe("Columns named family<sep>member are grouped into families, e.g. \"@\" for breadth_book's signal@group. Default: no families."),
  threshold: z.number().gt(0).lt(1).optional().describe("Families whose books correlate at least this much (in absolute value, average linkage) count as one idea. Default 0.5."),
}).strict();

export const TOOL_DESCRIPTIONS = Object.freeze({
  breadth_signals: "The cross-sectional signals breadth_book builds sleeves from: momentum, reversal, low volatility and beta, idiosyncratic risk, lottery demand, skewness, price delay, seasonality and liquidity, each with its formula's source and the data it needs.",
  breadth_book: `Build many weakly correlated sleeves (every signal inside every group of names) from your price panel and trade them as one netted account, ALPHAC's breadth lab: rank-weighted within each group, overlapping portfolios, hedged and scaled to a volatility target, costs on actual trades. Returns the book netted and standalone, the netting ratio, effective independent bets and ideas, and writes every sleeve's returns as a training dataset. ${BREADTH_LIMITS_TEXT[1]}`,
  annotation_packet: "Start a labelled dataset: figures (company, measure, period, value) are checked by machine against the SEC filings and written as blind CSV packets for two or more people to label, with guidelines and a key holding the machine labels.",
  annotation_agreement: "Read filled annotation packets: how often the people agree (Cohen's kappa), how often they agree with the machine, and every disagreement.",
  annotation_gold: "Merge filled annotation packets and a reviewer's decisions into a gold dataset (JSONL: each item's label, who decided it, the machine label and source) with a datasheet of agreement and hashes.",
  effective_bets: "How many independent bets a set of return series holds: the participation ratio of their weekly correlations (n for unrelated series, 1 for copies), and with families, the families' bets and the ideas they cluster into.",
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
    factor, meaning: (Object.hasOwn(FACTORS, factor) ? FACTORS[factor].meaning : null) ?? `annual ${factor.slice(6)} as filed`, file,
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

function readGroups(path) {
  const lines = readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const out = {};
  for (const [i, line] of lines.entries()) {
    const [t, g] = line.split(",").map((x) => x.trim());
    if (i === 0 && /^ticker$/i.test(t)) continue;
    if (!t || !g) throw new RangeError(`groups_file line ${i + 1}: expected ticker,group`);
    out[t] = g;
  }
  return out;
}
const asFloat = (values, tickers) => Object.fromEntries(tickers.map((t) => [t, Float64Array.from(values[t], (v) => (v === null ? NaN : v))]));

export async function toolBreadthBook(session, args) {
  const a = breadthInput.parse(args);
  const prices = readPanel(a.prices_file, "prices_file");
  const dv = a.dollar_volume_file ? readPanel(a.dollar_volume_file, "dollar_volume_file") : null;
  if (dv && dv.dates.join() !== prices.dates.join()) throw new RangeError("dollar_volume_file must have the same dates as prices_file");
  const tickers = prices.tickers.filter((t) => !dv || dv.tickers.includes(t));
  const r = runBreadth({ dates: prices.dates, tickers, prices: asFloat(prices.values, tickers), dollarVolume: dv ? asFloat(dv.values, tickers) : null,
    groups: a.groups_file ? readGroups(a.groups_file) : null, signals: a.signals ?? null, minNames: a.min_names ?? 10, smoothing: a.smoothing ?? null,
    costBps: a.cost_bps ?? 10, targetVol: a.target_vol ?? 0.1, splitDate: a.split_date ?? null });
  if (!r.sleeves) throw new RangeError("No sleeve had enough eligible names: lower min_names, add names to the groups, or check that prices are at least 5.");
  const file = a.out_file ?? join(session.outDir ?? mkdtempSync(join(tmpdir(), "canli-breadth-")), "sleeves.csv");
  const cell = (x) => (Number.isNaN(x) ? null : Math.round(x * 1e8) / 1e8);
  writePanel(file, { dates: prices.dates, tickers: [...r.series.ids, "book_netted"], values: Object.fromEntries([...r.series.ids.map((id, j) => [id, Array.from(r.series.returns[j], cell)]), ["book_netted", Array.from(r.series.book, cell)]]) });
  writeFileSync(`${file}.specs.json`, JSON.stringify({ schema: "canli.breadth-sleeves.v1", prices_file: a.prices_file, settings: { min_names: a.min_names ?? 10, smoothing: a.smoothing ?? null, cost_bps: a.cost_bps ?? 10, target_vol: a.target_vol ?? 0.1 }, sleeves: r.specs }, null, 1));
  let search = null;
  if (a.ledger) {
    const res = recordTrial(session.ledgerDir, { ledger: a.ledger, label: `breadth ${r.signals} signals x ${r.groups} groups`, returns: Array.from(r.series.book).filter((x) => !Number.isNaN(x)), periods_per_year: 252, params: { signals: a.signals ?? "all", groups_file: a.groups_file ?? null, min_names: a.min_names ?? 10 } });
    search = { ledger: res.ledger, trial: res.trial, trials: res.trials, deflated: res.deflated, plain_reading: res.plain_reading };
  }
  const b = r.book;
  const top = [...r.sleeve_rows].sort((x, y) => (y[4] ?? -9) - (x[4] ?? -9));
  return text({
    sleeves: r.sleeves, signals: r.signals, groups: r.groups, book: b, effective_bets: r.effective_bets,
    sleeve_columns: r.sleeve_columns, best_sleeves: top.slice(0, 10), worst_sleeves: top.slice(-5),
    dataset: { file, specs: `${file}.specs.json`, columns: r.sleeves + 1, rows: prices.dates.length },
    plain_reading: `${r.sleeves} sleeves (${r.signals} signals x ${r.groups} groups) hold ${r.effective_bets.effective_bets} independent bets at sleeve level${r.effective_bets.effective_bets_families ? `, ${r.effective_bets.effective_bets_families} across signal families and ${r.effective_bets.ideas} ideas` : ""}. Traded as one account the book's Sharpe after costs is ${b.netted.sharpe ?? "n/a"} (${b.standalone.sharpe ?? "n/a"} if each sleeve paid its own costs); netting cuts costs to ${b.netting_ratio} of the standalone total.`,
    ...(search ? { search } : {}),
    limits: BREADTH_LIMITS_TEXT,
  });
}

export async function toolEffectiveBets(args) {
  const a = betsInput.parse(args);
  const p = readPanel(a.returns_file, "returns_file");
  const series = p.tickers.map((t) => Float64Array.from(p.values[t], (v) => (v === null ? NaN : v)));
  const family = a.family_separator ? p.tickers.map((t) => t.split(a.family_separator)[0]) : null;
  return text({ ...effectiveBets(p.dates, series, family, { threshold: a.threshold ?? 0.5 }), meaning: "effective_bets is (sum of eigenvalues)^2 / sum of squared eigenvalues of the weekly correlation matrix: Sharpe grows with the square root of independent bets, not of series. A sign flip does not make a new bet." });
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
  tool("breadth_signals", "Breadth lab signals", z.object({}).strict(), READ_ONLY, async () => text({ signals: signalCatalog(), next: "breadth_book with your prices_file (and groups_file, dollar_volume_file) builds a sleeve per signal per group.", limits: BREADTH_LIMITS_TEXT }));
  tool("breadth_book", "Breadth book of sleeves", breadthInput, WRITES_LOCAL, (args) => toolBreadthBook(session, args));
  tool("effective_bets", "Effective independent bets", betsInput, READ_ONLY, (args) => toolEffectiveBets(args));
  tool("annotation_packet", "Annotation packets", packetInput, { ...WRITES_LOCAL, openWorldHint: true }, async (args) => text(await annotationPacket(session.markets ??= marketsSession(), args)));
  tool("annotation_agreement", "Annotation agreement", agreementInput, READ_ONLY, async (args) => text(annotationAgreement(args)));
  tool("annotation_gold", "Annotation gold set", goldInput, WRITES_LOCAL, async (args) => text(annotationGold(args)));
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
