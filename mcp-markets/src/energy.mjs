// energy_report: the week in US oil and natural gas, from the Energy Information Administration's weekly reports.
// Oil, from the Weekly Petroleum Status Report (Wednesdays): stocks of crude (commercial, at Cushing, in the
// Strategic Petroleum Reserve), gasoline, distillate, jet fuel and propane, with the change on the week and the year
// and where each stands against its five-year average for the time of year; refinery runs and utilization; crude
// production, imports and exports; and products supplied, the usual stand-in for demand, over four weeks. Gas, from
// the Weekly Natural Gas Storage Report (Thursdays): working gas in storage by region against a year ago and the
// five-year average, as EIA states them. Or one stock week by week against its five-year range. No key.
import { z } from "zod";

import { csvTable } from "./cycle.mjs";
import { getEncodedText, getText } from "./sources.mjs";

const WPSR = "https://ir.eia.gov/wpsr/";
const GAS = "https://ir.eia.gov/ngs/wngsr.json";
// The weekly files sit behind one redirect to a signed address on the same host; the tables are Windows-1252.
const release = (session, url, encoding = "utf-8") => getEncodedText(session, url, { encoding });
const HISTORY = (id) => `https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=${id}&f=W`;

// The stocks shown, by table 4's names, with EIA's weekly series for the five-year comparison.
const STOCKS = [
  ["crude_oil_commercial", "Commercial (Excluding SPR)", "WCESTUS1", "Commercial crude oil stocks"],
  ["crude_oil_cushing", "Cushing", "W_EPC0_SAX_YCUOK_MBBL", "Crude oil stocks at Cushing, Oklahoma,"],
  ["crude_oil_spr", "SPR", null, "Crude oil in the Strategic Petroleum Reserve"],
  ["gasoline", "Total Motor Gasoline", "WGTSTUS1", "Gasoline stocks"],
  ["distillate", "Distillate Fuel Oil", "WDISTUS1", "Distillate stocks (diesel and heating oil)"],
  ["jet_fuel", "Kerosene-Type Jet Fuel", "WKJSTUS1", "Jet fuel stocks"],
  ["propane", "Propane/Propylene", "WPRSTUS1", "Propane and propylene stocks"],
  ["total_excluding_spr", "Total Stocks (Excluding SPR)", null, "Commercial petroleum stocks"],
];
// Table 1's supply lines shown, by section and line (thousand barrels a day).
const SUPPLY = [
  ["crude_production", "Crude Oil Supply", "Domestic Production"],
  ["crude_imports", "Crude Oil Supply", "Imports"],
  ["crude_exports", "Crude Oil Supply", "Exports"],
  ["crude_net_imports", "Crude Oil Supply", "Net Imports (Including SPR)"],
  ["refinery_crude_runs", "Crude Oil Supply", "Crude Oil Input to Refineries"],
  ["product_exports", "Other Supply", "Exports"],
  ["products_supplied_total", "Products Supplied", "Total"],
  ["gasoline_supplied", "Products Supplied", "Finished Motor Gasoline"],
  ["distillate_supplied", "Products Supplied", "Distillate Fuel Oil"],
  ["jet_fuel_supplied", "Products Supplied", "Kerosene-Type Jet Fuel"],
  ["propane_supplied", "Products Supplied", "Propane/Propylene"],
  ["net_imports_crude_and_products", "Net Imports of Crude and Petroleum Products", "Total"],
];
const DISTRICTS = ["East Coast (PADD 1)", "Midwest (PADD 2)", "Gulf Coast (PADD 3)", "Rocky Mountain (PADD 4)", "West Coast (PADD 5)"];
const WITH_HISTORY = STOCKS.filter((s) => s[2]).map((s) => s[0]);

export const energyInput = z.object({
  report: z.enum(["both", "oil", "gas"]).optional().describe("oil: the weekly petroleum report (Wednesdays); gas: the weekly natural gas storage report (Thursdays); default both."),
  by_district: z.boolean().optional().describe("Also crude stocks, refinery runs and utilization by PADD district."),
  stock: z.enum(WITH_HISTORY).optional().describe("One stock week by week against its five-year average and range, instead of the report."),
  weeks: z.number().int().min(1).max(520).optional().describe("Weeks shown for stock, latest last; default 26."),
}).strict();

const num = (s) => {
  const t = String(s ?? "").replace(/,/g, "").trim();
  const n = Number(t);
  return t === "" || !Number.isFinite(n) ? null : n;
};
const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const pct = (a, b) => (a == null || !b ? null : round((a / b - 1) * 100));
const iso = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(s ?? "").trim());
  return m ? `${m[3].length === 2 ? 2000 + Number(m[3]) : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
};
const DAY = 86400000;
const ms = (d) => Date.parse(`${d}T00:00:00Z`);

// A WPSR table as its header and rows of trimmed fields; a line's "(17)" numbering is dropped.
export function wpsrTable(text) {
  const rows = csvTable(text).map((r) => r.map((c) => c.trim()));
  const head = rows.findIndex((r) => /^STUB_1$/.test(r[0]));
  if (head < 0) throw new Error("An EIA weekly petroleum table had no header row.");
  return { head: rows[head], rows: rows.slice(head + 1).filter((r) => r[0] !== "STUB_1").map((r) => r.map((c, i) => (i < 2 ? c.replace(/^\(\d+\)\s*/, "") : c))) };
}

// Table 1 holds two tables, stocks then supply; the supply one starts at its own header row.
function supplyTable(text) {
  const rows = csvTable(text).map((r) => r.map((c) => c.trim()));
  const head = rows.findIndex((r, i) => i > 0 && r[0] === "STUB_1" && r[1] === "STUB_2");
  if (head < 0) throw new Error("EIA's petroleum balance sheet (table 1) had no supply table.");
  return { head: rows[head], rows: rows.slice(head + 1).map((r) => [r[0], (r[1] ?? "").replace(/^\(\d+\)\s*/, ""), ...r.slice(2)]) };
}

// EIA's history page for a weekly series: a row a month, each week's date (MM/DD) and value, then the release
// dates. Kept as the last fifteen years, in million barrels (the page is in thousands).
export function historyPage(html) {
  const weeks = [];
  for (const row of html.split(/<tr>/i)) {
    const ym = /class='B6'>(?:&nbsp;|\s)*(\d{4})-[A-Z][a-z]{2}/.exec(row);
    if (!ym) continue;
    for (const m of row.matchAll(/class='B5'>(\d{2})\/(\d{2})(?:&nbsp;|\s)*<\/td>\s*<td class='B3'>([\d,.-]+)/g)) {
      const v = num(m[3]);
      if (v != null) weeks.push([`${ym[1]}-${m[1]}-${m[2]}`, v / 1000]);
    }
  }
  weeks.sort((a, b) => a[0].localeCompare(b[0]));
  if (!weeks.length) throw new Error("EIA's weekly history page held no weeks.");
  const from = `${Number(weeks.at(-1)[0].slice(0, 4)) - 15}${weeks.at(-1)[0].slice(4)}`;
  const date = (re) => { const m = re.exec(html); return m ? iso(`${m[1]}/${m[2]}/${m[3]}`) : null; };
  return JSON.stringify({ released: date(/(?<!Next )Release Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/), next: date(/Next Release Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/), weeks: weeks.filter(([d]) => d >= from) });
}

// The same week in each of the five years before, the comparison EIA's weekly highlights make: each year's week
// is the one nearest the same date. For the week of 2026-09-11 this gives crude 0.8% above, gasoline 4.8% below,
// distillate 13.1% below and propane 22.3% above; EIA's highlights said 1% above, 5%, 13% below and 22% above.
export function fiveYear(weeks, date, years = 5) {
  const y = Number(date.slice(0, 4));
  const picks = [];
  for (let k = 1; k <= years; k += 1) {
    const target = ms(`${y - k}${date.slice(4)}`);
    let best = null;
    for (const [d, v] of weeks) {
      const gap = Math.abs(ms(d) - target);
      if (gap <= 3.5 * DAY && (!best || gap < best.gap)) best = { gap, v };
    }
    if (best) picks.push(best.v);
  }
  if (picks.length < years) return null;
  return { average: picks.reduce((s, v) => s + v, 0) / years, low: Math.min(...picks), high: Math.max(...picks) };
}

const history = (session, id) => getText(session, HISTORY(id), { transform: historyPage, parse: JSON.parse });

async function oilReport(session, byDistrict) {
  // The history pages are slow (up to 5 seconds); they are read while the week's tables are.
  const reading = Promise.allSettled(STOCKS.map(([, , id]) => (id ? history(session, id) : null)));
  const [t1, t2, t4] = await Promise.all([1, 2, 4].map((n) => release(session, `${WPSR}table${n}.csv`, "windows-1252")));
  const stocks = wpsrTable(t4), supply = supplyTable(t1), refining = wpsrTable(t2);
  const week = iso(stocks.head[1]);
  if (!week) throw new Error("EIA's stocks table (table 4) named no week.");
  const pasts = await reading;
  const found = new Map(stocks.rows.map((r) => [r[0], r]));
  const rows = [], missing = [];
  for (const [i, [key, name, id]] of STOCKS.entries()) {
    const r = found.get(name);
    if (!r) { missing.push(name); continue; }
    const five = id && pasts[i].status === "fulfilled" ? fiveYear(pasts[i].value.weeks, week) : null;
    const now = num(r[1]);
    rows.push([key, now, num(r[3]), num(r[4]), num(r[5]), round(five?.average), pct(now, five?.average), round(five?.low), round(five?.high)]);
  }
  const line = new Map(supply.rows.map((r) => [`${r[0]}|${r[1]}`, r]));
  const flows = SUPPLY.map(([key, section, label]) => {
    const r = line.get(`${section}|${label}`);
    return r ? [key, num(r[2]), num(r[4]), num(r[7]), num(r[8]), num(r[9])] : null;
  }).filter(Boolean);
  // Table 2: a group's line ("Percent Utilization") then its districts.
  const groups = {};
  let group = null;
  for (const r of refining.rows) {
    if (!/^Refiner Inputs and Utilization/.test(r[0])) continue;
    if (!DISTRICTS.includes(r[1])) { group = r[1]; groups[group] = { total: r, districts: {} }; } else if (group) groups[group].districts[r[1]] = r;
  }
  const use = groups["Percent Utilization"]?.total;
  const released = pasts.find((p) => p.status === "fulfilled" && p.value?.weeks.at(-1)?.[0] === week)?.value;
  const out = {
    week_ending: week,
    ...(released ? { released: released.released, next_release: released.next } : {}),
    stocks: { unit: "million barrels", columns: ["stock", "level", "change_on_week", "year_ago", "change_on_year_pct", "five_year_average", "vs_five_year_pct", "five_year_low", "five_year_high"], rows },
    supply: { unit: "thousand barrels a day", columns: ["line", "week", "change_on_week", "four_week_average", "four_week_average_year_ago", "four_week_change_on_year_pct"], rows: flows },
    refining: use ? {
      utilization_pct: num(use[2]), week_ago_pct: num(use[3]), year_ago_pct: num(use[5]), four_week_average_pct: num(use[9]),
      crude_runs: num(groups["Crude Oil Inputs"]?.total[2]), gross_inputs: num(groups["Gross Inputs"]?.total[2]), operable_capacity: num(groups["Operable Capacity"]?.total[2]),
    } : null,
  };
  if (byDistrict) {
    out.by_district = {
      columns: ["district", "crude_stocks_million_barrels", "refinery_crude_runs", "refinery_utilization_pct"],
      rows: DISTRICTS.map((d) => [d, num(found.get(d)?.[1]), num(groups["Crude Oil Inputs"]?.districts[d]?.[2]), num(groups["Percent Utilization"]?.districts[d]?.[2])]),
    };
  }
  const failed = STOCKS.filter(([, , id], i) => id && pasts[i].status === "rejected").map(([key]) => key);
  return { out, missing, failed };
}

function gasReport(text) {
  const j = JSON.parse(text.replace(/^﻿/, ""));
  const date = (s) => {
    const m = /^(\d{4})-([A-Z][a-z]{2})-(\d{2})/.exec(String(s ?? ""));
    const mon = m ? "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[2]) / 3 + 1 : 0;
    return mon ? `${m[1]}-${String(mon).padStart(2, "0")}-${m[3]}` : String(s ?? "").slice(0, 10) || null;
  };
  const rows = (j.series ?? []).map((s) => {
    const c = s.calculated ?? {};
    const level = s.data?.[0]?.[1] ?? null;
    return [s.name, level, c.net_change ?? null, c.implied_flow ?? null, s.data?.[2]?.[1] ?? null, c["pct-change_yrago"] ?? null, c["5yr-avg"] ?? null, c["pct-chg_5yr-avg"] ?? null];
  });
  if (!rows.length) throw new Error("EIA's natural gas storage report held no regions.");
  const flagged = (j.series ?? []).filter((s) => [...(s.revision_flag ?? []), ...Object.entries(s.calculated ?? {}).filter(([k]) => /flag/.test(k)).map(([, v]) => v), ...(s.reclassification_flag ?? [])].includes("true")).map((s) => s.name);
  return {
    week_ending: j.current_week ?? null, released: date(j.release_date), year_ago_week: j.year_ago ?? null, five_year_basis: j["5yr_avg"] ?? null,
    unit: "billion cubic feet",
    columns: ["region", "working_gas", "net_change", "implied_flow", "year_ago", "vs_year_ago_pct", "five_year_average", "vs_five_year_pct"],
    rows,
    ...(flagged.length ? { revised_or_reclassified: flagged } : {}),
  };
}

const LIMITS = [
  "Weekly figures are EIA's estimates from company surveys; EIA revises them in its monthly data, and one week's change is often undone the next.",
  "Products supplied is what left primary supply (refineries, pipelines, terminals), EIA's usual stand-in for demand, not what was burned.",
  "Oil's five-year comparison is computed here from EIA's weekly history: the same week (the nearest to the same date) in each of the five years before. Gas's is EIA's own; its implied flow differs from the net change when EIA reclassified gas between base and working storage.",
  "Not investment advice.",
];

function oilSentences(oil) {
  const by = new Map(oil.stocks.rows.map((r) => [r[0], r]));
  const s = [];
  for (const [key, , , label] of STOCKS.filter(([k]) => ["crude_oil_commercial", "crude_oil_cushing", "gasoline", "distillate"].includes(k))) {
    const r = by.get(key);
    if (!r || r[1] == null || r[2] == null) continue;
    const move = r[2] > 0 ? `rose ${round(r[2])}` : r[2] < 0 ? `fell ${round(-r[2])}` : "were unchanged at";
    const five = r[6] == null ? "" : `, ${Math.abs(r[6])}% ${r[6] >= 0 ? "above" : "below"} the five-year average for the week`;
    s.push(`${label} ${move}${r[2] ? " million barrels to" : ""} ${round(r[1])} million barrels${five}.`);
  }
  if (oil.refining?.utilization_pct != null) s.push(`Refineries ran at ${oil.refining.utilization_pct}% of capacity (${oil.refining.week_ago_pct}% the week before).`);
  return s;
}

function gasSentence(gas) {
  const r = gas.rows.find((x) => /lower 48/i.test(x[0])) ?? gas.rows[0];
  if (!r || r[1] == null || r[2] == null) return [];
  const move = r[2] >= 0 ? `rose ${r[2]}` : `fell ${-r[2]}`;
  const against = [[r[5], "a year ago"], [r[7], "the five-year average"]].filter(([p]) => p != null).map(([p, what]) => `${Math.abs(p)}% ${p >= 0 ? "above" : "below"} ${what}`);
  return [`Working gas in storage ${move} Bcf to ${r[1].toLocaleString("en-US")} Bcf in the week to ${gas.week_ending}${against.length ? `, ${against.join(" and ")}` : ""}.`];
}

// One stock week by week against the five-year average and range for each week.
async function stockHistory(session, key, weeks = 26) {
  const [, name, id, label] = STOCKS.find((s) => s[0] === key);
  const page = await history(session, id);
  const shown = page.weeks.slice(-weeks);
  const rows = shown.map(([d, v]) => {
    const five = fiveYear(page.weeks, d);
    return [d, round(v, 3), round(five?.average), pct(v, five?.average), round(five?.low), round(five?.high)];
  });
  return {
    stock: key, name: label.replace(/,$/, ""), eia_line: name, unit: "million barrels", released: page.released, next_release: page.next,
    columns: ["week_ending", "level", "five_year_average", "vs_five_year_pct", "five_year_low", "five_year_high"], rows,
    reading: `${label.replace(/,$/, "")} at each week's end, against the same week in each of the five years before it.`,
    source: HISTORY(id), limits: LIMITS,
  };
}

export async function energyReport(session, args) {
  const a = energyInput.parse(args);
  if (a.stock) return stockHistory(session, a.stock, a.weeks);
  const report = a.report ?? "both";
  const [oil, gas] = await Promise.allSettled([
    report === "gas" ? null : oilReport(session, a.by_district),
    report === "oil" ? null : release(session, GAS).then(gasReport),
  ]);
  if ((report !== "gas" && oil.status === "rejected") && (report !== "oil" && gas.status === "rejected")) throw oil.reason;
  if (report === "oil" && oil.status === "rejected") throw oil.reason;
  if (report === "gas" && gas.status === "rejected") throw gas.reason;
  const limits = [...LIMITS];
  const out = {};
  if (report !== "gas") {
    if (oil.status === "fulfilled") {
      out.oil = oil.value.out;
      if (oil.value.missing.length) limits.unshift(`EIA's stocks table did not name ${oil.value.missing.join(", ")} this week.`);
      if (oil.value.failed.length) limits.unshift(`EIA's weekly history could not be read for ${oil.value.failed.join(", ")}, so their five-year comparison is missing.`);
    } else out.oil = { unavailable: oil.reason?.message ?? String(oil.reason) };
  }
  if (report !== "oil") out.gas = gas.status === "fulfilled" ? gas.value : { unavailable: gas.reason?.message ?? String(gas.reason) };
  // A week's report comes five or six days after it ends, a holiday's up to thirteen.
  const stale = [out.oil?.week_ending, out.gas?.week_ending].filter(Boolean).filter((d) => session.now() - ms(d) > 15 * DAY);
  if (stale.length) limits.unshift(`EIA's latest file is for the week to ${stale.join(" and ")}; a newer report may be late or delayed.`);
  return {
    summary: [...(out.oil?.stocks ? oilSentences(out.oil) : []), ...(out.gas?.rows ? gasSentence(out.gas) : [])],
    ...out,
    reading: "Stocks at the week's end with the change on the week and against a year ago and the five-year average for the same week; flows are averages a day over the week and four weeks.",
    source: `${WPSR}table1.csv, table2.csv and table4.csv (Weekly Petroleum Status Report); ${GAS} (Weekly Natural Gas Storage Report); https://www.eia.gov/dnav/pet/hist/ (weekly history for the five-year comparison)`,
    limits,
  };
}
