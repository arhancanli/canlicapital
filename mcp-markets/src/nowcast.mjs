// inflation_nowcast: the Federal Reserve Bank of Cleveland's daily nowcasts of CPI, core CPI, PCE and core PCE
// inflation for the months and quarters not yet published, month over month, year over year and the quarter
// annualized, each with its path day by day and, once published, the actual figure; and the nowcast's own record,
// its last nowcast before each release against what was published. No key.
import { z } from "zod";

import { getText } from "./sources.mjs";

const BASE = "https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/";
const FILES = { month: `${BASE}nowcast_month.json`, year: `${BASE}nowcast_year.json`, quarter: `${BASE}nowcast_quarter.json` };
const PAGE = "https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting";
const MEASURES = { cpi: "CPI", core_cpi: "core CPI", pce: "PCE", core_pce: "core PCE" };
const KEEP = 40;

export const nowcastInput = z.object({
  measure: z.enum(Object.keys(MEASURES)).optional().describe("cpi, core_cpi, pce or core_pce; default all four."),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("A target month (YYYY-MM): its nowcast day by day, and the published figure once out."),
  record: z.boolean().optional().describe("The nowcast's record: its last nowcast before each release against the published figure, month by month."),
  months: z.number().int().min(1).max(36).optional().describe("record: published months shown, latest last; default 12."),
}).strict();

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const keyOf = (name) => ({ "CPI Inflation": "cpi", "Core CPI Inflation": "core_cpi", "PCE Inflation": "pce", "Core PCE Inflation": "core_pce" })[String(name).replace(/^Actual /, "").trim()] ?? null;
const pad = (period) => period.replace(/^(\d{4})-(\d)$/, "$1-0$2").replace(/^(\d{4}):Q(\d)$/, "$1-Q$2");

// One file (all its target periods since 2013, 5 to 8 MB) kept as its last periods: each nowcast path by date and
// each published figure with the day it appeared. Chart dates are MM/DD; a date before the period's first month
// falls in the next year. The chart's release markers ("CPI Sep", vline) are categories without a data point, so
// each point's date is read from its own tooltip, and the categories without markers only where it has none.
export function nowcastFile(text) {
  const charts = JSON.parse(text.replace(/^﻿/, ""));
  if (!Array.isArray(charts) || !charts.length) throw new Error("The Cleveland Fed's nowcast file held no periods.");
  const periods = charts.slice(-KEEP).map((c) => {
    const period = pad(String(c.chart?.subcaption ?? ""));
    const year = Number(period.slice(0, 4)), first = /Q(\d)$/.test(period) ? Number(period.slice(-1)) * 3 - 2 : Number(period.slice(5, 7));
    const iso = (label) => {
      const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(label ?? "").trim());
      return m ? `${Number(m[1]) < first ? year + 1 : year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
    };
    const days = (c.categories?.[0]?.category ?? []).filter((x) => x?.vline !== "true").map((x) => iso(x.label));
    const dateOf = (point, i) => iso(/\{br\}(\d{1,2}\/\d{1,2})\{br\}/.exec(point?.tooltext ?? "")?.[1]) ?? days[i] ?? null;
    const byDate = new Map();
    const path = {}, actual = {};
    for (const s of c.dataset ?? []) {
      const key = keyOf(s.seriesname);
      if (!key) continue;
      const points = (s.data ?? []).map((x, i) => [dateOf(x, i), x?.value === "" || x?.value == null ? null : Number(x.value)]).filter(([d]) => d);
      if (/^Actual /.test(s.seriesname)) {
        const hit = points.find(([, v]) => v != null);
        if (hit) actual[key] = { value: hit[1], date: hit[0] };
      } else {
        path[key] = new Map(points);
        for (const [d, v] of points) if (v != null) byDate.set(d, true);
      }
    }
    const dates = [...byDate.keys()].sort();
    return { period, dates, path: Object.fromEntries(Object.entries(path).map(([k, m]) => [k, dates.map((d) => m.get(d) ?? null)])), actual };
  });
  return JSON.stringify({ updated: String(charts.at(-1)?.chart?._comment ?? "").slice(0, 10) || null, periods });
}

const read = (session, which) => getText(session, FILES[which], { transform: nowcastFile, parse: JSON.parse, timeoutMs: 30000 });

// A period's last nowcast for a measure, with its date: the day before the figure was published, or the latest day.
function last(p, key) {
  const values = p.path[key] ?? [];
  for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] != null) return { value: values[i], date: p.dates[i] };
  return null;
}

const LIMITS = [
  "A nowcast is the Cleveland Fed's model estimate from daily oil and gasoline prices and the latest inflation readings, not a forecast by its staff or a Fed view; it moves as prices do until the figure is published.",
  "Month over month is on the seasonally adjusted index, year over year on the index as published (CPI not seasonally adjusted), quarters as annualized rates; actuals are as first published and taken from the Cleveland Fed's own files.",
  "Not investment advice.",
];

export async function inflationNowcast(session, args) {
  const a = nowcastInput.parse(args);
  const keys = a.measure ? [a.measure] : Object.keys(MEASURES);
  if (a.month) {
    const [mom, yoy] = await Promise.all([read(session, "month"), read(session, "year")]);
    const m = mom.periods.find((p) => p.period === a.month), y = yoy.periods.find((p) => p.period === a.month);
    if (!m || !y) throw new Error(`The Cleveland Fed's files hold nowcasts for ${mom.periods[0].period} to ${mom.periods.at(-1).period}; ${a.month} is not among them.`);
    const rows = m.dates.map((d, i) => [d, ...keys.flatMap((k) => [round(m.path[k]?.[i]), round(y.path[k]?.[y.dates.indexOf(d)])])]).filter((r) => r.slice(1).some((v) => v != null));
    return {
      month: a.month, updated: mom.updated,
      columns: ["date", ...keys.flatMap((k) => [`${k}_month_pct`, `${k}_year_pct`])], rows,
      published: Object.fromEntries(keys.map((k) => [k, m.actual[k] ? { date: m.actual[k].date, month_pct: round(m.actual[k].value), year_pct: round(y.actual[k]?.value) } : null])),
      reading: `The Cleveland Fed's nowcast of ${a.month}'s inflation each day, month over month and year over year, in percent; published is the figure and the day it came out.`,
      source: PAGE, limits: LIMITS,
    };
  }
  const [mom, yoy, qtr] = await Promise.all([read(session, "month"), read(session, "year"), read(session, "quarter")]);
  const yearOf = (period) => yoy.periods.find((p) => p.period === period);
  if (a.record) {
    const done = mom.periods.filter((p) => keys.every((k) => p.actual[k] && yearOf(p.period)?.actual[k])).slice(-(a.months ?? 12));
    const rows = done.flatMap((p) => keys.map((k) => {
      const y = yearOf(p.period), nm = last(p, k), ny = last(y, k);
      return [p.period, k, round(nm?.value), round(p.actual[k].value), round(nm?.value - p.actual[k].value), round(ny?.value), round(y.actual[k].value), round(ny?.value - y.actual[k].value), p.actual[k].date];
    }));
    const mae = (k, col) => { const errs = rows.filter((r) => r[1] === k && r[col] != null).map((r) => Math.abs(r[col])); return errs.length ? round(errs.reduce((s, x) => s + x, 0) / errs.length, 3) : null; };
    return {
      updated: mom.updated,
      columns: ["month", "measure", "nowcast_month_pct", "actual_month_pct", "miss_month", "nowcast_year_pct", "actual_year_pct", "miss_year", "published"], rows,
      mean_absolute_miss: Object.fromEntries(keys.map((k) => [k, { month_pct: mae(k, 4), year_pct: mae(k, 7), months: done.length }])),
      reading: "For each published month, the Cleveland Fed's last nowcast before the release against the figure published, in percentage points (miss = nowcast less actual).",
      source: PAGE, limits: LIMITS,
    };
  }
  // The latest: every month and quarter with a measure not yet published while its nowcast is still kept up (a month
  // never published, as October 2025's CPI after the shutdown, drops out once its path stops), and the last one
  // fully published.
  const newest = mom.periods.reduce((m, p) => (p.dates.at(-1) > m ? p.dates.at(-1) : m), "");
  const alive = (p) => p.dates.length && Date.parse(p.dates.at(-1)) >= Date.parse(newest) - 10 * 86400000;
  const open = mom.periods.filter((p) => alive(p) && keys.some((k) => !p.actual[k]));
  const lastDone = mom.periods.filter((p) => keys.every((k) => p.actual[k])).at(-1);
  const shown = [...(lastDone ? [lastDone] : []), ...open];
  const rows = shown.flatMap((p) => keys.map((k) => {
    const y = yearOf(p.period);
    return [p.period, k, round(last(p, k)?.value), round(y ? last(y, k)?.value : null), round(p.actual[k]?.value), round(y?.actual[k]?.value), p.actual[k]?.date ?? null];
  }));
  const quarters = qtr.periods.filter((p) => alive(p) && keys.some((k) => !p.actual[k])).flatMap((p) => keys.map((k) => [p.period, k, round(last(p, k)?.value), round(p.actual[k]?.value)]));
  const summary = open.map((p) => {
    const y = yearOf(p.period);
    // The month and year files are cached apart, so for a while a new month can be in one and not the other.
    const parts = keys.filter((k) => !p.actual[k] && last(p, k)).map((k) => { const yv = y ? last(y, k)?.value : null; return `${MEASURES[k]} ${round(last(p, k).value)}% on the month${yv == null ? "" : ` and ${round(yv)}% on a year`}`; });
    return parts.length ? `The Cleveland Fed's nowcast for ${p.period}, not yet published: ${parts.join("; ")}.` : null;
  }).filter(Boolean);
  // Each quarter still open, with only the measures not yet published (a quarter's CPI is out weeks before its PCE).
  for (const q of qtr.periods.filter((p) => alive(p) && keys.some((k) => !p.actual[k]))) {
    const parts = keys.filter((k) => !q.actual[k] && last(q, k)).map((k) => `${MEASURES[k]} ${round(last(q, k).value)}%`);
    if (parts.length) summary.push(`${q.period} at an annualized rate, not yet published: ${parts.join(", ")}.`);
  }
  return {
    updated: mom.updated, summary,
    months: { columns: ["month", "measure", "nowcast_month_pct", "nowcast_year_pct", "actual_month_pct", "actual_year_pct", "published"], rows },
    quarters: { columns: ["quarter", "measure", "nowcast_annualized_pct", "actual_annualized_pct"], rows: quarters },
    reading: "The Cleveland Fed's latest nowcast for each month and quarter not yet published, and the last month fully published with its figures, in percent.",
    source: PAGE, limits: LIMITS,
  };
}
