// crop_outlook: the USDA's World Agricultural Supply and Demand Estimates (WASDE), from the monthly report's XML at
// the USDA's publication service (ESMIS). A commodity's world balance sheet by country: beginning stocks,
// production, imports, use, exports and ending stocks for the last two market years and this year's projection,
// with last month's projection beside it, so a revision reads as a number. No key.
import { z } from "zod";

import { getText, NotFound } from "./sources.mjs";
import { parseXml } from "./xml.mjs";

const ESMIS = "https://esmis.nal.usda.gov";
const PUBLICATION = `${ESMIS}/publication/world-agricultural-supply-and-demand-estimates`;
// The world tables, by the title each has in the report.
export const COMMODITIES = Object.freeze({
  wheat: { title: /^World Wheat Supply/i, words: "wheat" },
  corn: { title: /^World Corn Supply/i, words: "corn maize" },
  coarse_grains: { title: /^World Coarse Grain Supply/i, words: "coarse grains feed grains" },
  rice: { title: /^World Rice Supply/i, words: "rice" },
  cotton: { title: /^World Cotton Supply/i, words: "cotton" },
  soybeans: { title: /^World Soybean Supply/i, words: "soybeans soybean soy soya beans" },
  soybean_meal: { title: /^World Soybean Meal Supply/i, words: "soybean meal soymeal meal" },
  soybean_oil: { title: /^World Soybean Oil Supply/i, words: "soybean oil soyoil soy oil" },
});
const REGION_NAMES = { us: "United States", usa: "United States", "u.s.": "United States", america: "United States", eu: "European Union", europe: "European Union", "euro area": "European Union" };

export const cropInput = z.object({
  commodity: z.string().min(2).max(40).describe("wheat, corn, coarse grains, rice, cotton, soybeans, soybean meal or soybean oil."),
  region: z.string().min(2).max(60).optional().describe("A country or region in the USDA's table (United States, China, Brazil, European Union, World...); \"all\" for every one at this month's projection. Default World."),
  report: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("The report's month, YYYY-MM; default the latest."),
}).strict();

const clean = (s) => String(s ?? "").replace(/\r\n|\s+/g, " ").replace(/\s*\/?\d\/\s*$|\s+\d\/|\s*\/\d\b/g, "").trim();
const number = (s) => { const n = Number(String(s ?? "").replace(/,/g, "").trim()); return String(s ?? "").trim() === "" || !Number.isFinite(n) ? null : n; };

// The commodity a request names: the most specific first ("soybean meal" before "soybeans").
const RULES = [[/meal/, "soybean_meal"], [/soy\w*\s*oil|soyoil/, "soybean_oil"], [/coarse|feed grain/, "coarse_grains"], [/corn|maize/, "corn"], [/wheat/, "wheat"], [/rice/, "rice"], [/cotton/, "cotton"], [/soy/, "soybeans"]];
export const findCommodity = (q) => { const s = String(q).toLowerCase().replace(/[_-]/g, " "); return RULES.find(([re]) => re.test(s))?.[1] ?? null; };

// The reports ESMIS lists, newest first: each month's XML (a re-issue, wasde0626v2, replaces the first).
export function reportsFrom(html) {
  const out = new Map();
  for (const m of html.matchAll(/\/sites\/default\/release-files\/\d+\/wasde(\d{2})(\d{2})(v\d+)?\.xml/gi)) {
    const month = `20${m[2]}-${m[1]}`;
    if (!out.has(month) || m[3]) out.set(month, `${ESMIS}${m[0]}`);
  }
  return [...out].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, url]) => ({ month, url }));
}

// Every figure in a sub-report as a record: its region, attribute, market year and (for the projection) the month
// it was projected in.
export function wasdeTables(xml) {
  const root = parseXml(xml.replace(/^﻿/, ""));
  const tables = [];
  const walk = (el, ctx, out) => {
    const c = { ...ctx };
    for (const [k, v] of Object.entries(el.attrs)) {
      if (/^cell_value/.test(k)) { const n = number(v); if (n != null && c.attribute) out.push({ ...c, value: n }); continue; }
      const key = k.replace(/\d+$/, "");
      if (["region", "attribute", "forecast_month", "market_year", "region_header"].includes(key)) c[key === "region_header" ? "market_year" : key] = String(v).replace(/\r\n/g, " ").trim();
    }
    for (const ch of el.children) walk(ch, c, out);
  };
  const reports = [];
  const find = (el) => { for (const ch of el.children) { if (ch.name === "Report" && /^sr\d+$/.test(ch.attrs.Name ?? "")) reports.push(ch); else find(ch); } };
  find(root);
  for (const r of reports) {
    const records = [];
    walk(r, {}, records);
    tables.push({ id: r.attrs.Name, title: clean(r.attrs.sub_report_title), unit: String(r.attrs.sub_report_subtitle ?? "").replace(/[()]/g, "").trim() || null, month: r.attrs.Report_Month ?? null, records, reliability: reliabilityRows(r) });
  }
  return tables;
}

// The report's own record of this month's projections against the final estimates (its reliability pages): for each
// commodity, line and region, the root mean square error and 90 percent interval (percent), the average, smallest
// and largest differences (the table's unit), and the years the projection fell below and above the final.
function reliabilityRows(report) {
  const out = [];
  const walk = (el, ctx) => {
    const c = { ...ctx };
    if (el.name === "commodity_group") c.commodity = clean(el.attrs.commodity);
    if (el.name === "attribute_group") c.attribute = clean(el.attrs.attribute);
    if (el.name === "region_group" && el.attrs.root_mean_square_error !== undefined) {
      const n = (k) => number(el.attrs[k]);
      out.push({ ...c, region: clean(el.attrs.region), rmse_pct: n("root_mean_square_error"), ci90_pct: n("confidence_interval"), average: n("average"), smallest: n("smallest"), largest: n("largest"), below_final: n("below_final"), above_final: n("above_final") });
    }
    for (const ch of el.children) walk(ch, c);
  };
  walk(report, {});
  return out;
}
// The reliability pages name commodities their own way.
const RELIABILITY = { wheat: /^WHEAT/i, coarse_grains: /^COARSE/i, rice: /^RICE/i, soybeans: /^SOYBEANS/i, cotton: /^COTTON/i };
export function reliabilityOf(tables, commodity, region) {
  const want = RELIABILITY[commodity];
  if (!want) return null;
  const rows = tables.flatMap((t) => t.reliability ?? []).filter((r) => want.test(r.commodity ?? ""));
  if (!rows.length) return null;
  const r = String(region ?? "World").toLowerCase();
  const reg = r === "world" || r === "all" ? "World" : r === "united states" ? "U.S." : "Foreign";
  const mine = rows.filter((x) => x.region === reg);
  return {
    region: reg === "Foreign" ? "Foreign (every country but the US; the USDA keeps no record by country)" : reg,
    columns: ["attribute", "rmse_pct", "ci90_pct", "average", "smallest", "largest", "years_below_final", "years_above_final"],
    rows: mine.map((x) => [x.attribute, x.rmse_pct, x.ci90_pct, x.average, x.smallest, x.largest, x.below_final, x.above_final]),
    reading: "The USDA's record of this month's projection against the final estimate since 1981/82: two times in three the projection has been within rmse_pct percent of the final, nine in ten within ci90_pct; average, smallest and largest are the absolute differences in the table's unit; the years count misses each way.",
  };
}

// A commodity's balance sheet: one row an attribute, one column a market year (the projection twice: last month's and
// this month's), with the change between them.
export function balanceSheet(tables, commodity, region) {
  const mine = tables.filter((t) => COMMODITIES[commodity].title.test(t.title));
  if (!mine.length) throw new NotFound(`This WASDE report has no world ${commodity.replace("_", " ")} table.`);
  const records = mine.flatMap((t) => t.records.map((r) => ({ ...r, region: clean(r.region), attribute: clean(r.attribute) })));
  const regions = [...new Set(records.map((r) => r.region))];
  const columns = [...new Map(records.map((r) => [`${r.market_year}|${r.forecast_month ?? ""}`, { year: r.market_year, month: r.forecast_month ?? "" }])).values()];
  const label = (c) => (c.month ? `${c.year} (${c.month})` : c.year);
  const attributes = [...new Set(records.map((r) => r.attribute))];
  const projections = columns.filter((c) => c.month);
  const [before, now] = projections.slice(-2);
  const value = (reg, attr, c) => records.find((r) => r.region === reg && r.attribute === attr && r.market_year === c.year && (r.forecast_month ?? "") === c.month)?.value ?? null;
  const unit = mine[0].unit;
  if (String(region).toLowerCase() === "all") {
    if (!now) throw new NotFound("This report's table has no projection to compare regions on.");
    return {
      unit, regions,
      columns: ["region", ...attributes, ...(before ? ["ending_stocks_change"] : [])],
      rows: regions.map((reg) => [reg, ...attributes.map((a) => value(reg, a, now)), ...(before ? [round(value(reg, "Ending Stocks", now) - value(reg, "Ending Stocks", before))] : [])]),
      market_year: `${now.year.replace(/\s*Proj\.?$/i, "")} as projected in ${now.month}`,
    };
  }
  const want = String(region ?? "World").toLowerCase();
  const reg = regions.find((r) => r.toLowerCase() === (REGION_NAMES[want] ?? want).toLowerCase()) ?? regions.find((r) => r.toLowerCase().startsWith((REGION_NAMES[want] ?? want).toLowerCase()));
  if (!reg) throw new NotFound(`The USDA's world ${commodity.replace("_", " ")} table has no region "${region}". It has: ${regions.join(", ")}.`);
  const rows = attributes.map((a) => [a, ...columns.map((c) => value(reg, a, c)), ...(before && now ? [round(value(reg, a, now) - value(reg, a, before))] : [])]);
  const changes = before && now ? rows.filter((r) => r.at(-1)).map((r) => ({ attribute: r[0], [before.month]: value(reg, r[0], before), [now.month]: value(reg, r[0], now), change: r.at(-1) })) : [];
  return { unit, region: reg, regions, columns: ["attribute", ...columns.map(label), ...(before && now ? [`change ${before.month} to ${now.month}`] : [])], rows, changes };
}
const round = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000 || 0);

export async function cropOutlook(session, args) {
  const a = cropInput.parse(args);
  const commodity = findCommodity(a.commodity);
  if (!commodity) throw new Error(`"${a.commodity}" is not a commodity in the WASDE's world tables. They are: ${Object.keys(COMMODITIES).map((k) => k.replace("_", " ")).join(", ")}.`);
  const page = await getText(session, PUBLICATION);
  const reports = reportsFrom(page);
  if (!reports.length) throw new Error(`ESMIS listed no WASDE report at ${PUBLICATION}.`);
  const report = a.report ? reports.find((r) => r.month === a.report) : reports[0];
  if (!report) throw new NotFound(`ESMIS lists WASDE reports for ${reports.map((r) => r.month).join(", ")}; ${a.report} is not among them.`);
  const tables = wasdeTables(await getText(session, report.url, { maxBytes: 32 * 1024 * 1024 }));
  const sheet = balanceSheet(tables, commodity, a.region ?? "World");
  const record = reliabilityOf(tables, commodity, sheet.region ?? a.region);
  return {
    report: { month: tables[0]?.month ?? report.month, url: report.url },
    commodity, ...sheet,
    ...(record ? { reliability: record } : {}),
    reading: "Market years run as the USDA defines them for each crop (local marketing years aggregated). The projection appears twice: as last month's report projected it and as this one does; the change is this month's revision.",
    source: report.url,
    sources: [PUBLICATION, report.url],
    limits: [
      "The USDA's World Agricultural Outlook Board estimates; earlier years are revised as countries report.",
      "World tables only: the US balance sheets with prices and the livestock tables are not read yet.",
      "Not investment advice.",
    ],
  };
}
