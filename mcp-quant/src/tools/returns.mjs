// Returns transforms and attribution: price/return conversions, resampling to coarser periods by
// calendar, calendar-month return tables, and Brinson-Fachler performance attribution.
import { z } from "zod";

import { isoDate, parseDate } from "../dates.mjs";
import { MAX_SERIES } from "../inputs.mjs";

const datesArg = z.array(isoDate).min(2).max(MAX_SERIES).describe("Dates, YYYY-MM-DD, one per return (the period's end).");

function groupBy(dates, returns, key) {
  const out = new Map();
  dates.forEach((d, i) => { const p = parseDate(d, `dates[${i}]`), k = key(p); out.set(k, (out.get(k) ?? 1) * (1 + returns[i])); });
  return [...out.entries()].map(([k, g]) => [k, g - 1]);
}

export const TOOLS = [
  {
    name: "convert_returns",
    title: "Convert prices and returns",
    description: "Convert between prices, simple returns and log returns, or rebase a price series to start at 100; returns the converted series.",
    keywords: "convert returns log simple prices rebase index cumulative growth",
    input: z.object({
      values: z.array(z.number()).min(2).max(MAX_SERIES).describe("The input series."),
      from: z.enum(["prices", "simple", "log"]).describe("What values are."),
      to: z.enum(["prices", "simple", "log", "rebased"]).describe("What to return; prices from returns start at start_value."),
      start_value: z.number().positive().optional().describe("First price when converting returns to prices; default 100."),
    }).strict(),
    run({ values: v, from, to, start_value = 100 }) {
      let simple;
      if (from === "prices") { if (v.some((x) => !(x > 0))) throw new Error("Prices must be positive."); simple = v.slice(1).map((x, i) => x / v[i] - 1); }
      else if (from === "log") simple = v.map((x) => Math.expm1(x));
      else simple = v;
      if (to === "simple") return { values: simple };
      if (to === "log") return { values: simple.map((x) => { if (x <= -1) throw new Error("A simple return of -100% or less has no log return."); return Math.log1p(x); }) };
      const base = to === "rebased" ? 100 : start_value, prices = [base];
      for (const r of simple) prices.push(prices.at(-1) * (1 + r));
      return { values: prices };
    },
  },
  {
    name: "resample_returns",
    title: "Resample returns to weeks, months or years",
    description: "Compound periodic returns into calendar weeks (ISO), months, quarters or years using their dates.",
    keywords: "resample returns monthly weekly quarterly annual compound aggregate frequency",
    input: z.object({ returns: z.array(z.number().gt(-1)).min(2).max(MAX_SERIES).describe("Returns per period."), dates: datesArg, to: z.enum(["week", "month", "quarter", "year"]).describe("Target frequency.") }).strict(),
    run({ returns, dates, to }) {
      if (returns.length !== dates.length) throw new Error("returns and dates need the same length.");
      const key = {
        month: (p) => `${p.y}-${String(p.m).padStart(2, "0")}`,
        quarter: (p) => `${p.y}-Q${Math.ceil(p.m / 3)}`,
        year: (p) => `${p.y}`,
        // ISO week: the week's Thursday fixes the year.
        week: (p) => { const d = new Date(p.serial * 86400000); d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); const y = d.getUTCFullYear(); return `${y}-W${String(1 + Math.floor((d - Date.UTC(y, 0, 1)) / 86400000 / 7)).padStart(2, "0")}`; },
      }[to];
      const rows = groupBy(dates, returns, key);
      return { columns: ["period", "return"], rows };
    },
  },
  {
    name: "monthly_returns_table",
    title: "Calendar monthly returns table",
    description: "Build the year-by-month return table from periodic returns and dates, with each year's compounded total, the best and worst months and the share of positive months.",
    keywords: "monthly returns table calendar year month heatmap tearsheet annual returns",
    input: z.object({ returns: z.array(z.number().gt(-1)).min(2).max(MAX_SERIES).describe("Returns per period."), dates: datesArg }).strict(),
    run({ returns, dates }) {
      if (returns.length !== dates.length) throw new Error("returns and dates need the same length.");
      const months = groupBy(dates, returns, (p) => `${p.y}-${p.m}`), years = new Map();
      for (const [k, r] of months) { const [y, m] = k.split("-").map(Number); if (!years.has(y)) years.set(y, new Array(12).fill(null)); years.get(y)[m - 1] = r; }
      const rows = [...years.entries()].sort((a, b) => a[0] - b[0]).map(([y, ms]) => [y, ...ms, ms.reduce((g, r) => (r === null ? g : g * (1 + r)), 1) - 1]);
      const all = months.map((m) => m[1]);
      return { columns: ["year", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "year_total"], rows, best_month: Math.max(...all), worst_month: Math.min(...all), positive_month_share: all.filter((r) => r > 0).length / all.length };
    },
  },
  {
    name: "brinson_attribution",
    title: "Brinson-Fachler performance attribution",
    description: "Attribute active return to allocation, selection and interaction effects by segment (Brinson-Fachler) from portfolio and benchmark weights and returns.",
    keywords: "brinson attribution fachler allocation selection interaction active return sector performance attribution",
    input: z.object({
      segments: z.array(z.string().max(60)).min(1).max(200).describe("Segment names, e.g. sectors."),
      portfolio_weights: z.array(z.number()).min(1).max(200).describe("Portfolio weight per segment."),
      benchmark_weights: z.array(z.number()).min(1).max(200).describe("Benchmark weight per segment."),
      portfolio_returns: z.array(z.number()).min(1).max(200).describe("Portfolio return per segment."),
      benchmark_returns: z.array(z.number()).min(1).max(200).describe("Benchmark return per segment."),
    }).strict(),
    run({ segments: s, portfolio_weights: wp, benchmark_weights: wb, portfolio_returns: rp, benchmark_returns: rb }) {
      const n = s.length;
      if (![wp, wb, rp, rb].every((a) => a.length === n)) throw new Error("Every array needs one entry per segment.");
      const Rb = wb.reduce((a, w, i) => a + w * rb[i], 0), Rp = wp.reduce((a, w, i) => a + w * rp[i], 0);
      const rows = s.map((name, i) => { const al = (wp[i] - wb[i]) * (rb[i] - Rb), se = wb[i] * (rp[i] - rb[i]), it = (wp[i] - wb[i]) * (rp[i] - rb[i]); return [name, al, se, it, al + se + it]; });
      const tot = (k) => rows.reduce((a, r) => a + r[k], 0);
      return { portfolio_return: Rp, benchmark_return: Rb, active_return: Rp - Rb, allocation: tot(1), selection: tot(2), interaction: tot(3), columns: ["segment", "allocation", "selection", "interaction", "total"], rows };
    },
  },
];
