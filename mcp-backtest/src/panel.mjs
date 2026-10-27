// A price panel for the breadth lab and backtest_signal, built from free sources: the tickers you
// name or an index fund's current holdings (its latest SEC N-PORT), each ticker's daily adjusted
// closes and volume from canli-markets-mcp's price_history, and an industry for each company from
// its SEC SIC code, grouped into the twelve Fama-French industries. Writes prices, dollar volume and
// groups as CSV files breadth_book reads directly.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fundPortfolio } from "canli-markets-mcp/src/funds.mjs";
import { submissions, tickerTable } from "canli-markets-mcp/src/sources.mjs";
import { priceHistory } from "canli-markets-mcp/src/tools.mjs";
import { z } from "zod";

import { writePanel } from "./panel-io.mjs";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
export const panelInput = z.object({
  tickers: z.array(z.string().min(1).max(12).regex(/^[A-Za-z0-9.\-]+$/)).min(2).max(600).optional().describe("US tickers to include."),
  index_fund: z.string().min(2).max(10).optional().describe("Or an index fund or ETF whose current holdings make the universe: IVV (S&P 500), IJH (mid caps), IJR (small caps), QQQ, VTI..."),
  max_names: z.number().int().min(2).max(600).optional().describe("With index_fund: the largest holdings to take. Default 500."),
  start: date.describe("First date."),
  end: date.optional().describe("Last date; default today."),
  out_dir: z.string().min(1).max(1000).optional().describe("Folder for prices.csv, dollar_volume.csv and groups.csv. Default: a new temporary folder."),
}).strict();

// The twelve Fama-French industries by four-digit SIC (Kenneth French's definitions).
const FF12 = [
  ["NoDur", [[100, 999], [2000, 2399], [2700, 2749], [2770, 2799], [3100, 3199], [3940, 3989]]],
  ["Durbl", [[2500, 2519], [2590, 2599], [3630, 3659], [3710, 3711], [3714, 3714], [3716, 3716], [3750, 3751], [3792, 3792], [3900, 3939], [3990, 3999]]],
  ["Manuf", [[2520, 2589], [2600, 2699], [2750, 2769], [3000, 3099], [3200, 3569], [3580, 3629], [3700, 3709], [3712, 3713], [3715, 3715], [3717, 3749], [3752, 3791], [3793, 3799], [3830, 3839], [3860, 3899]]],
  ["Enrgy", [[1200, 1399], [2900, 2999]]],
  ["Chems", [[2800, 2829], [2840, 2899]]],
  ["BusEq", [[3570, 3579], [3660, 3692], [3694, 3699], [3810, 3829], [7370, 7379]]],
  ["Telcm", [[4800, 4899]]],
  ["Utils", [[4900, 4949]]],
  ["Shops", [[5000, 5999], [7200, 7299], [7600, 7699]]],
  ["Hlth", [[2830, 2839], [3693, 3693], [3840, 3859], [8000, 8099]]],
  ["Money", [[6000, 6999]]],
];
export function ff12(sic) {
  const s = Number(sic);
  if (!Number.isFinite(s) || s <= 0) return null;
  for (const [name, ranges] of FF12) if (ranges.some(([lo, hi]) => s >= lo && s <= hi)) return name;
  return "Other";
}

const legal = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|class [a-c]|cl [a-c]|the|sa|nv|ag|se|lp|llc|new|del|de)\b/g;
const key = (name) => String(name ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(legal, " ").replace(/\s+/g, " ").trim();

// The holdings of an index fund as tickers, matched to SEC's ticker table by name (a holding whose
// name matches no listed company, or several, is left out and counted).
async function fundTickers(session, fund, max) {
  const p = await fundPortfolio(session, { fund, top: Math.min(max * 2, 500), compare: false });
  const byName = new Map();
  for (const r of Object.values(await tickerTable(session))) {
    const k = key(r.title);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(r);
  }
  const at = (c) => p.columns.indexOf(c);
  const tickers = [], unmatched = [], seen = new Set();
  for (const row of p.rows) {
    if (row[at("asset_category")] !== "EC") continue; // equities only
    const hits = byName.get(key(row[at("name")])) ?? [];
    const cik = new Set(hits.map((h) => h.cik_str));
    if (cik.size !== 1) { unmatched.push(row[at("name")]); continue; }
    if (seen.has(hits[0].cik_str)) continue;
    seen.add(hits[0].cik_str);
    tickers.push(hits[0].ticker);
    if (tickers.length >= max) break;
  }
  return { tickers, unmatched, fund: p.fund, period: p.period };
}

export async function buildPanel(session, args) {
  const a = panelInput.parse(args);
  if (!a.tickers === !a.index_fund) throw new RangeError("Send tickers or index_fund.");
  const end = a.end ?? new Date(session.now()).toISOString().slice(0, 10);
  if (!(a.start < end)) throw new RangeError("start must be before end.");
  let universe = a.tickers?.map((t) => t.toUpperCase()) ?? null, from = null;
  if (a.index_fund) { from = await fundTickers(session, a.index_fund.toUpperCase(), a.max_names ?? 500); universe = from.tickers; }
  const cikOf = new Map(Object.values(await tickerTable(session)).map((r) => [r.ticker, r.cik_str]));
  const series = new Map(), groups = {}, failed = [];
  for (const t of universe) {
    try {
      const p = await priceHistory(session, { symbol: t, start: a.start, end, adjusted: true });
      series.set(t, p);
      const cik = cikOf.get(t.replace(/\./g, "-"));
      const sub = cik ? await submissions(session, cik).catch(() => null) : null;
      groups[t] = ff12(sub?.sic) ?? "Other";
    } catch (err) { failed.push([t, String(err.message).slice(0, 120)]); }
  }
  const tickers = [...series.keys()];
  if (tickers.length < 2) throw new RangeError(`Prices came back for ${tickers.length} ticker(s); ${failed.slice(0, 5).map((f) => f.join(": ")).join("; ")}`);
  const dates = [...new Set(tickers.flatMap((t) => series.get(t).dates))].sort();
  const idx = new Map(dates.map((d, i) => [d, i]));
  const prices = {}, dollars = {};
  for (const t of tickers) {
    const p = series.get(t), px = new Array(dates.length).fill(null), dv = new Array(dates.length).fill(null);
    p.dates.forEach((d, i) => { px[idx.get(d)] = p.close[i]; dv[idx.get(d)] = p.volume?.[i] != null && p.close[i] != null ? Math.round(p.volume[i] * p.close[i]) : null; });
    prices[t] = px; dollars[t] = dv;
  }
  const dir = a.out_dir ?? mkdtempSync(join(tmpdir(), "canli-panel-"));
  const files = { prices_file: join(dir, "prices.csv"), dollar_volume_file: join(dir, "dollar_volume.csv"), groups_file: join(dir, "groups.csv") };
  writePanel(files.prices_file, { dates, tickers, values: prices });
  writePanel(files.dollar_volume_file, { dates, tickers, values: dollars });
  writeFileSync(files.groups_file, `ticker,group\n${tickers.map((t) => `${t},${groups[t]}`).join("\n")}\n`);
  const count = {};
  for (const g of Object.values(groups)) count[g] = (count[g] ?? 0) + 1;
  return {
    ...files, tickers: tickers.length, dates: dates.length, first_date: dates[0], last_date: dates.at(-1),
    groups: count, source: [...new Set(tickers.map((t) => series.get(t).source))],
    ...(from ? { universe: { fund: from.fund, period: from.period, unmatched_holdings: from.unmatched.length } } : {}),
    ...(failed.length ? { failed: { count: failed.length, examples: failed.slice(0, 10) } } : {}),
    next: `breadth_book with prices_file ${files.prices_file}, groups_file ${files.groups_file} and dollar_volume_file ${files.dollar_volume_file}.`,
    limits: [
      "An index fund's current holdings are today's survivors: companies that left the index or failed before today are missing, which flatters a backtest over past years (survivorship bias).",
      "Prices are price_history's provider's (Yahoo's public chart data unless you set an Alpaca or Tiingo key): adjusted for splits and dividends by the provider.",
      "Industries come from each company's SEC SIC code, grouped into the twelve Fama-French industries; a SIC code describes the filer's main line of business as SEC records it.",
    ],
  };
}
