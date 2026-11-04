// job_postings: labour demand as Indeed sees it, day by day, from the Indeed Hiring Lab's job postings index (CC BY
// 4.0, cited as the source): postings against 1 February 2020 (= 100), seasonally adjusted, a seven-day average, in
// eleven economies, by occupational sector and by state, province or region; with the change over four weeks, a
// quarter and a year, and the distance from the peak. No key.
import { z } from "zod";

import { csvRows } from "./cycle.mjs";
import { getText, NotFound } from "./sources.mjs";

const REPO = "https://raw.githubusercontent.com/hiring-lab/job_postings_tracker/master/";
const COUNTRIES = { US: "United States", CA: "Canada", GB: "United Kingdom", AU: "Australia", DE: "Germany", FR: "France", IE: "Ireland", IT: "Italy", ES: "Spain", NL: "Netherlands", EA: "Euro area" };
const ALIASES = { usa: "US", "united states": "US", america: "US", canada: "CA", uk: "GB", "united kingdom": "GB", britain: "GB", "great britain": "GB", england: "GB", australia: "AU", germany: "DE", france: "FR", ireland: "IE", italy: "IT", spain: "ES", netherlands: "NL", holland: "NL", "euro area": "EA", eurozone: "EA", "euro zone": "EA" };
const REGIONS = { US: ["state_job_postings_us.csv", "state"], CA: ["provincial_postings_ca.csv", "province"], GB: ["regional_gb.csv", "region"], AU: ["regional_au.csv", "region"], DE: ["regional_de.csv", "region"], FR: ["regional_fr.csv", "region"], IE: ["regional_ie.csv", "region"] };
const SPAN = 400;
// A country as a sentence names it.
const named = (code) => ({ US: "the United States", GB: "the United Kingdom", NL: "the Netherlands", EA: "the euro area" })[code] ?? COUNTRIES[code];

export const jobsInput = z.object({
  country: z.string().min(2).max(40).optional().describe("US (default), CA, GB, AU, DE, FR, IE, IT, ES, NL or EA (the euro area), by code or name; \"all\" sets every one side by side."),
  by: z.enum(["total", "sector", "region"]).optional().describe("total (default): the country's postings; sector: each occupational sector, ranked by its change on a year; region: each state, province or region."),
  weeks: z.number().int().min(1).max(350).optional().describe("total: weeks shown, a row a week, latest last; default 13."),
}).strict();

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const DAY = 86400000;
const back = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);

export function countryCode(words) {
  const w = String(words ?? "US").trim();
  const code = /^[A-Za-z]{2}$/.test(w) ? w.toUpperCase().replace(/^UK$/, "GB") : ALIASES[w.toLowerCase()];
  if (!code || !COUNTRIES[code]) throw new NotFound(`Indeed's index covers ${Object.entries(COUNTRIES).map(([k, v]) => `${v} (${k})`).join(", ")}; not ${w}.`);
  return code;
}

// A long file (a row a day for each series) kept as each series' days, the last SPAN days unless all are wanted.
export function seriesFile(text, { key, value, keep = (r) => true, span = SPAN } = {}) {
  const rows = csvRows(text).filter(keep);
  const series = {};
  for (const r of rows) {
    const v = Number(r[value]);
    if (!r.date || r[value] === "" || !Number.isFinite(v)) continue;
    (series[r[key] ?? "all"] ??= []).push([r.date, v]);
  }
  for (const s of Object.values(series)) s.sort((a, b) => a[0].localeCompare(b[0]));
  const last = Object.values(series).reduce((m, s) => (s.at(-1)?.[0] > m ? s.at(-1)[0] : m), "");
  const from = span ? back(last, span) : "";
  return JSON.stringify(Object.fromEntries(Object.entries(series).map(([k, s]) => [k, s.filter(([d]) => d >= from)])));
}

const read = (session, url, opts) => getText(session, url, { transform: (t) => seriesFile(t, opts), parse: JSON.parse, maxBytes: 32 * 1024 * 1024, timeoutMs: 30000 }).catch((err) => {
  if (/HTTP 404|was not found/.test(err.message)) throw new NotFound(`Indeed's repository has no ${url.slice(REPO.length)}.`);
  throw err;
});

// The value on a day, or the last before it.
const on = (s, date) => { let v = null; for (const [d, x] of s) { if (d > date) break; v = x; } return v; };
const changes = (s) => {
  const [date, now] = s.at(-1);
  return Object.fromEntries([["4_weeks", 28], ["13_weeks", 91], ["52_weeks", 364]].map(([k, days]) => {
    const then = on(s, back(date, days));
    return [k, then == null ? null : { points: round(now - then), pct: round((now / then - 1) * 100, 1) }];
  }));
};

const LIMITS = [
  "Source: Indeed Hiring Lab, Job Postings Index (CC BY 4.0). Postings on Indeed, seasonally adjusted, as a seven-day average, against 1 February 2020 (= 100); Indeed revises past values when it re-estimates seasonal factors.",
  "Postings are openings advertised on one site, not hires or jobs filled; how much of a market Indeed covers differs by country and occupation.",
  "Not investment advice.",
];

export async function jobPostings(session, args) {
  const a = jobsInput.parse(args);
  const by = a.by ?? "total";
  if (String(a.country ?? "").trim().toLowerCase() === "all") {
    const got = await Promise.allSettled(Object.keys(COUNTRIES).map((c) => read(session, `${REPO}${c}/aggregate_job_postings_${c}.csv`, { key: "variable", value: "indeed_job_postings_index_SA", span: 0 })));
    const rows = Object.keys(COUNTRIES).map((c, i) => {
      if (got[i].status !== "fulfilled") return [COUNTRIES[c], c, null, null, null, null];
      const s = got[i].value["total postings"] ?? [];
      const ch = s.length ? changes(s) : {};
      return [COUNTRIES[c], c, s.at(-1)?.[0] ?? null, round(s.at(-1)?.[1]), ch["52_weeks"]?.points ?? null, ch["52_weeks"]?.pct ?? null];
    }).sort((x, y) => (y[3] ?? -1) - (x[3] ?? -1));
    return {
      columns: ["country", "code", "date", "index", "change_52_weeks_points", "change_52_weeks_pct"], rows,
      reading: "Each economy's job postings on Indeed against its own 1 February 2020 level (= 100), highest first, with the change on a year.",
      source: `${REPO} (Indeed Hiring Lab)`, limits: LIMITS,
    };
  }
  const code = countryCode(a.country);
  if (by === "sector" || by === "region") {
    const [file, key] = by === "sector" ? [`job_postings_by_sector_${code}.csv`, "display_name"] : REGIONS[code] ?? [];
    if (!file) throw new NotFound(`Indeed shares regional postings for ${Object.keys(REGIONS).map((c) => COUNTRIES[c]).join(", ")}; not ${COUNTRIES[code]}.`);
    const series = await read(session, `${REPO}${code}/${file}`, { key, value: "indeed_job_postings_index", keep: (r) => !r.variable || r.variable === "total postings" });
    // US states and Canadian provinces come as lower-case codes ("ak").
    const label = (name) => (/^[a-z]{2}$/.test(name) ? name.toUpperCase() : name);
    const rows = Object.entries(series).filter(([, s]) => s.length).map(([name, s]) => { const ch = changes(s); return [label(name), s.at(-1)[0], round(s.at(-1)[1]), ch["4_weeks"]?.points ?? null, ch["52_weeks"]?.points ?? null, ch["52_weeks"]?.pct ?? null]; })
      .sort((x, y) => (y[5] ?? -1e9) - (x[5] ?? -1e9));
    const top = rows[0], bottom = rows.at(-1);
    return {
      country: COUNTRIES[code], code, by,
      summary: top && bottom && top !== bottom ? [`In ${named(code)}, ${top[0]} postings rose most on a year (${top[5] >= 0 ? "+" : ""}${top[5]}%, to ${top[2]}) and ${bottom[0]} fell most (${bottom[5]}%, to ${bottom[2]}), each against its own 1 February 2020 level.`] : [],
      columns: [by, "date", "index", "change_4_weeks_points", "change_52_weeks_points", "change_52_weeks_pct"], rows,
      reading: `Job postings on Indeed in each ${by} of ${COUNTRIES[code]} against its own 1 February 2020 level (= 100), ranked by the change on a year.`,
      source: `${REPO}${code}/${file} (Indeed Hiring Lab)`, limits: LIMITS,
    };
  }
  const url = `${REPO}${code}/aggregate_job_postings_${code}.csv`;
  const series = await read(session, url, { key: "variable", value: "indeed_job_postings_index_SA", span: 0 });
  const total = series["total postings"], fresh = series["new postings"] ?? [];
  if (!total?.length) throw new NotFound(`Indeed's file for ${COUNTRIES[code]} held no total postings.`);
  const [date, now] = total.at(-1);
  const peak = total.reduce((m, x) => (x[1] > m[1] ? x : m), total[0]);
  const ch = changes(total);
  const weeks = a.weeks ?? 13;
  const rows = Array.from({ length: weeks }, (_, i) => back(date, (weeks - 1 - i) * 7)).filter((d) => d >= total[0][0]).map((d) => [d, round(on(total, d)), round(on(fresh, d))]);
  const sign = (x) => (x >= 0 ? `up ${x}` : `down ${-x}`);
  return {
    country: COUNTRIES[code], code, date,
    summary: [`Job postings on Indeed in ${named(code)} stood at ${round(now)}% of their 1 February 2020 level on ${date} (seasonally adjusted), ${ch["52_weeks"] ? `${sign(ch["52_weeks"].points)} points on a year (${ch["52_weeks"].pct}%)` : ""}${ch["4_weeks"] ? ` and ${sign(ch["4_weeks"].points)} in four weeks` : ""}; their peak was ${round(peak[1])} on ${peak[0]}.`],
    latest: { total: round(now), new_postings: round(fresh.at(-1)?.[1]) },
    changes: ch, peak: { date: peak[0], index: round(peak[1]), below_peak_pct: round((now / peak[1] - 1) * 100, 1) },
    columns: ["date", "total", "new_postings"], rows,
    reading: `Job postings on Indeed in ${COUNTRIES[code]} against 1 February 2020 (= 100), seasonally adjusted, a row a week; new postings are those on Indeed for a week or less.`,
    source: `${url} (Indeed Hiring Lab)`, limits: LIMITS,
  };
}
