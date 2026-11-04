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
  commodity: z.string().min(2).max(40).describe("wheat, corn, coarse grains, rice, cotton, soybeans, soybean meal or soybean oil (world and US); sorghum, barley, oats or feed grains (US only)."),
  region: z.string().min(2).max(60).optional().describe("A country or region in the USDA's table (China, Brazil, European Union, World...); United States gives the US balance sheet with its farm price; \"all\" for every country at this month's projection. Default World."),
  report: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("The report's month, YYYY-MM; default the latest."),
}).strict();

const clean = (s) => String(s ?? "").replace(/\r\n|\s+/g, " ").replace(/\s*\/?\d\/\s*$|\s+\d\/|\s*\/\d\b/g, "").trim();
// A cell as a number: thousands commas and the report's footnote stars ("776 *") dropped.
const number = (s) => { const t = String(s ?? "").replace(/,/g, "").replace(/\s*\*+\s*$/, "").trim(); const n = Number(t); return t === "" || !Number.isFinite(n) ? null : n; };

// The commodity a request names: the most specific first ("soybean meal" before "soybeans").
const RULES = [[/meal/, "soybean_meal"], [/soy\w*\s*oil|soyoil/, "soybean_oil"], [/feed grain/, "feed_grains"], [/coarse/, "coarse_grains"], [/corn|maize/, "corn"], [/wheat/, "wheat"], [/rice/, "rice"], [/cotton/, "cotton"], [/sorghum/, "sorghum"], [/barley/, "barley"], [/\boats?\b/, "oats"], [/soy/, "soybeans"]];

// The US balance sheets, with the season-average farm price: each by its page, its table's place on the page and the
// units the report prints for it (the XML spreads a unit over cells, so they are named here, as the report shows them).
const BU = { area: "million acres", yield: "bushels per acre", qty: "million bushels" };
export const US_TABLES = Object.freeze({
  corn: { page: /^U\.S\. Feed Grain and Corn/i, matrix: 2, units: BU },
  feed_grains: { page: /^U\.S\. Feed Grain and Corn/i, matrix: 1, units: { area: "million acres", yield: "metric tons per acre", qty: "million metric tons" } },
  wheat: { page: /^U\.S\. Wheat Supply/i, matrix: 1, units: BU },
  sorghum: { page: /^U\.S\. Sorghum, Barley, and Oats/i, matrix: 1, units: BU },
  barley: { page: /^U\.S\. Sorghum, Barley, and Oats/i, matrix: 2, units: BU },
  oats: { page: /^U\.S\. Sorghum, Barley, and Oats/i, matrix: 3, units: BU },
  rice: { page: /^U\.S\. Rice Supply/i, matrix: 1, units: { area: "million acres", yield: "pounds per acre", qty: "million hundredweight" } },
  soybeans: { page: /^U\.S\. Soybeans and Products/i, matrix: 1, units: BU },
  soybean_oil: { page: /^U\.S\. Soybeans and Products/i, matrix: 2, units: { qty: "million pounds" } },
  soybean_meal: { page: /^U\.S\. Soybeans and Products/i, matrix: 3, units: { qty: "thousand short tons" } },
  cotton: { page: /^U\.S\. Cotton Supply/i, matrix: 1, units: { area: "million acres", yield: "pounds per acre", qty: "million 480-pound bales", price: "cents per pound" } },
});
const unitOf = (attribute, units) => {
  if (/price/i.test(attribute)) return attribute.match(/\(([^)]*\/[^)]*)\)/)?.[1] ?? units.price ?? null;
  if (/milling yield/i.test(attribute)) return "percent";
  if (/yield/i.test(attribute)) return units.yield ?? null;
  if (/^(area|planted|harvested)/i.test(attribute)) return units.area ?? null;
  return units.qty;
};
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
    const matrix = /^matrix(\d+)$/.exec(el.name);
    if (matrix) c.matrix = Number(matrix[1]);
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

// A US balance sheet from its own page: one row a line with its unit, the projection as last month and this month set it.
export function usBalanceSheet(tables, commodity) {
  const t = US_TABLES[commodity];
  const page = tables.find((x) => t.page.test(x.title));
  if (!page) throw new NotFound(`This WASDE report has no US ${commodity.replace("_", " ")} page.`);
  const records = page.records.filter((r) => r.matrix === t.matrix).map((r) => ({ ...r, attribute: clean(r.attribute) }));
  if (!records.length) throw new NotFound(`The US ${commodity.replace("_", " ")} table is not where the report usually prints it.`);
  const columns = [...new Map(records.map((r) => [`${r.market_year}|${r.forecast_month ?? ""}`, { year: r.market_year, month: r.forecast_month ?? "" }])).values()];
  const projections = columns.filter((c) => c.month);
  const [before, now] = projections.slice(-2);
  const attributes = [...new Set(records.map((r) => r.attribute))];
  const value = (attr, c) => records.find((r) => r.attribute === attr && r.market_year === c.year && (r.forecast_month ?? "") === c.month)?.value ?? null;
  const rows = attributes.map((a) => [a, unitOf(a, t.units), ...columns.map((c) => value(a, c)), ...(before && now ? [round(value(a, now) - value(a, before))] : [])]);
  return {
    unit: "per line (see the unit column)", region: "United States",
    columns: ["attribute", "unit", ...columns.map((c) => (c.month ? `${c.year} (${c.month})` : c.year)), ...(before && now ? [`change ${before.month} to ${now.month}`] : [])],
    rows,
    changes: before && now ? rows.filter((r) => r.at(-1)).map((r) => ({ attribute: r[0], unit: r[1], [before.month]: value(r[0], before), [now.month]: value(r[0], now), change: r.at(-1) })) : [],
  };
}

export async function cropOutlook(session, args) {
  const a = cropInput.parse(args);
  const commodity = findCommodity(a.commodity);
  if (!commodity) throw new Error(`"${a.commodity}" is not a commodity in the WASDE's tables. They are: ${[...new Set([...Object.keys(COMMODITIES), ...Object.keys(US_TABLES)])].map((k) => k.replace("_", " ")).join(", ")}.`);
  const page = await getText(session, PUBLICATION);
  const reports = reportsFrom(page);
  if (!reports.length) throw new Error(`ESMIS listed no WASDE report at ${PUBLICATION}.`);
  const report = a.report ? reports.find((r) => r.month === a.report) : reports[0];
  if (!report) throw new NotFound(`ESMIS lists WASDE reports for ${reports.map((r) => r.month).join(", ")}; ${a.report} is not among them.`);
  const tables = wasdeTables(await getText(session, report.url, { maxBytes: 32 * 1024 * 1024 }));
  // The US's own page (with its farm price) for a US request; the world table for the rest. Sorghum, barley, oats
  // and feed grains have only a US page.
  const usOnly = !COMMODITIES[commodity];
  const usAsked = /^(us|usa|u\.s\.?|united states|america)$/i.test(String(a.region ?? "").trim());
  if (usOnly && a.region && !usAsked) throw new NotFound(`The WASDE has ${commodity.replace("_", " ")} for the United States only.`);
  const sheet = usOnly || usAsked ? usBalanceSheet(tables, commodity) : balanceSheet(tables, commodity, a.region ?? "World");
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
      "The world tables and the US crop balance sheets; the livestock, dairy and sugar tables are not read yet.",
      "Not investment advice.",
    ],
  };
}
