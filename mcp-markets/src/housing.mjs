// housing_market: the US housing market, nationally or by metro: the typical home value from Zillow's Home Value
// Index (mid-tier homes, smoothed, seasonally adjusted) with its change on a month, a year and five years and its
// distance from the peak; the market from Realtor.com's listings (median listing price, active and new listings, days
// on market, the share of listings with a price cut, pending sales), each against a year earlier; and the 30-year
// mortgage rate (Freddie Mac, via FRED). Or the largest metros ranked by how fast home values are rising or falling.
// No key.
import { z } from "zod";

import { csvRows } from "./cycle.mjs";
import { fredCsv, getText, NotFound } from "./sources.mjs";

const ZILLOW = "https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv";
const REALTOR_METRO = "https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Metro.csv";
const REALTOR_US = "https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Country_History.csv";
const MONTHS = 72;

export const housingInput = z.object({
  area: z.string().min(2).max(80).optional().describe("\"US\" (default) or a metro area by its main city (\"Austin\", \"Austin, TX\", \"New York\")."),
  rank: z.enum(["rising", "falling"]).optional().describe("Instead of one area: the largest metros ranked by the change in home values on a year."),
  metros: z.number().int().min(10).max(400).optional().describe("rank: how many of the largest metros are ranked; default 100."),
  limit: z.number().int().min(1).max(100).optional().describe("rank: metros listed; default 15."),
}).strict();

const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const num = (s) => (s === "" || s == null || !Number.isFinite(Number(s)) ? null : Number(s));
const change = (a, b) => (a == null || !b ? null : round((a / b - 1) * 100));
// A metro's key across sources: its first city and first state ("austin|tx").
export const metroKey = (name) => {
  // The first city, before a hyphen or a slash (Realtor.com's "Louisville/Jefferson County, KY-IN" is Zillow's "Louisville, KY").
  const m = /^\s*([^,/-]+?)\s*(?:[-/][^,]*)?,\s*([A-Za-z]{2})/.exec(String(name ?? ""));
  return m ? `${m[1].toLowerCase()}|${m[2].toLowerCase()}` : String(name ?? "").trim().toLowerCase();
};

// Zillow's wide file (a column a month since 2000, 4.5 MB) kept as its last six years.
export function zillowFile(text) {
  const [head, ...rows] = csvRowsRaw(text);
  const first = head.findIndex((h) => /^\d{4}-\d{2}-\d{2}$/.test(h));
  const keep = Math.max(first, head.length - MONTHS);
  return JSON.stringify({
    months: head.slice(keep).map((d) => d.slice(0, 7)),
    regions: rows.map((r) => ({ name: r[head.indexOf("RegionName")], type: r[head.indexOf("RegionType")], rank: Number(r[head.indexOf("SizeRank")]), values: r.slice(keep).map(num) })),
  });
}
// Rows as arrays (Zillow's header repeats no names, but its region names hold commas inside quotes).
function csvRowsRaw(text) {
  const rows = csvRows(text);
  if (!rows.length) return [[]];
  const head = Object.keys(rows[0]);
  return [head, ...rows.map((r) => head.map((h) => r[h]))];
}

const readZillow = (session) => getText(session, ZILLOW, { transform: zillowFile, parse: JSON.parse, timeoutMs: 30000 });
const readRealtor = (session, url) => getText(session, url, { parse: (t) => csvRows(t), timeoutMs: 30000 });

function homeValue(z, region) {
  const v = region.values, last = v.length - 1;
  const peakAt = v.reduce((m, x, i) => (x != null && (v[m] == null || x > v[m]) ? i : m), 0);
  return {
    month: z.months[last], typical_value: round(v[last], 0),
    change_on_month_pct: change(v[last], v[last - 1]), change_on_year_pct: change(v[last], v[last - 12]), change_five_years_pct: change(v[last], v[last - 60]),
    peak: { month: z.months[peakAt], typical_value: round(v[peakAt], 0) }, below_peak_pct: change(v[last], v[peakAt]),
  };
}

function listings(row) {
  if (!row) return null;
  const pct = (k) => (num(row[k]) == null ? null : round(num(row[k]) * 100));
  return {
    month: `${row.month_date_yyyymm.slice(0, 4)}-${row.month_date_yyyymm.slice(4, 6)}`,
    median_listing_price: num(row.median_listing_price), median_listing_price_yy_pct: pct("median_listing_price_yy"),
    active_listings: num(row.active_listing_count), active_listings_yy_pct: pct("active_listing_count_yy"),
    new_listings: num(row.new_listing_count), new_listings_yy_pct: pct("new_listing_count_yy"),
    median_days_on_market: num(row.median_days_on_market), days_on_market_yy_pct: pct("median_days_on_market_yy"),
    price_reduced_share_pct: pct("price_reduced_share"), price_reduced_share_yy_points: pct("price_reduced_share_yy"),
    pending_ratio: num(row.pending_ratio),
  };
}

const LIMITS = [
  "Home values are Zillow's Home Value Index (typical value of mid-tier homes, smoothed and seasonally adjusted, ZHVI); listings are Realtor.com's monthly inventory data; both are cited as the sources and revise past months.",
  "Listing prices are asking prices, not sale prices; a metro is its whole metropolitan area, matched across the two sources by its main city and state.",
  "Not investment advice.",
];
const SOURCE = `${ZILLOW} (Zillow ZHVI); ${REALTOR_METRO} and ${REALTOR_US} (Realtor.com); FRED MORTGAGE30US (Freddie Mac)`;

export async function housingMarket(session, args) {
  const a = housingInput.parse(args);
  const zillow = await readZillow(session);
  if (a.rank) {
    const [realtor] = await Promise.all([readRealtor(session, REALTOR_METRO)]);
    const byKey = new Map(realtor.map((r) => [metroKey(r.cbsa_title), r]));
    const metros = zillow.regions.filter((r) => r.type === "msa" && r.rank <= (a.metros ?? 100)).map((r) => {
      const hv = homeValue(zillow, r), l = listings(byKey.get(metroKey(r.name)));
      return [r.name, hv.typical_value, hv.change_on_year_pct, hv.below_peak_pct, l?.active_listings_yy_pct ?? null, l?.median_days_on_market ?? null, l?.price_reduced_share_pct ?? null];
    }).filter((x) => x[2] != null).sort((x, y) => (a.rank === "falling" ? x[2] - y[2] : y[2] - x[2])).slice(0, a.limit ?? 15);
    return {
      month: zillow.months.at(-1), rank: a.rank, of_metros: a.metros ?? 100,
      columns: ["metro", "typical_value", "change_on_year_pct", "below_peak_pct", "active_listings_yy_pct", "median_days_on_market", "price_reduced_share_pct"], rows: metros,
      reading: `The ${a.metros ?? 100} largest metro areas ranked by the change in Zillow's typical home value on a year (${a.rank === "falling" ? "falling fastest" : "rising fastest"} first), with Realtor.com's listings beside them.`,
      source: SOURCE, limits: LIMITS,
    };
  }
  const words = String(a.area ?? "US").trim();
  const national = /^(us|usa|united states|america|national|the us|nationwide)$/i.test(words);
  const [region, realtorRows, mortgage] = await Promise.all([
    national ? zillow.regions.find((r) => r.type === "country") : (async () => {
      const want = words.toLowerCase(), key = metroKey(words);
      const found = zillow.regions.filter((r) => r.type === "msa" && (metroKey(r.name) === key || r.name.toLowerCase().startsWith(want))).sort((x, y) => x.rank - y.rank)[0];
      if (!found) throw new NotFound(`Zillow's index has no metro area named ${words}; name its main city, as "Austin" or "Austin, TX".`);
      return found;
    })(),
    readRealtor(session, national ? REALTOR_US : REALTOR_METRO),
    fredCsv(session, "MORTGAGE30US", { start: new Date(session.now() - 400 * 86400000).toISOString().slice(0, 10) }).catch(() => null),
  ]);
  const hv = homeValue(zillow, region);
  const realtor = national ? realtorRows.filter((r) => /united states/i.test(r.country ?? "")).sort((x, y) => x.month_date_yyyymm.localeCompare(y.month_date_yyyymm)).at(-1) : realtorRows.find((r) => metroKey(r.cbsa_title) === metroKey(region.name));
  const l = listings(realtor);
  const rates = mortgage?.rows.filter(([, v]) => v != null) ?? [];
  const lastRate = rates.at(-1), yearRate = rates.filter(([d]) => lastRate && d <= new Date(Date.parse(lastRate[0]) - 364 * 86400000).toISOString().slice(0, 10)).at(-1);
  const where = national ? "the US" : region.name;
  const summary = [`Zillow's typical home value in ${where} was $${hv.typical_value.toLocaleString("en-US")} in ${hv.month}, ${hv.change_on_year_pct >= 0 ? "up" : "down"} ${Math.abs(hv.change_on_year_pct)}% on a year${hv.below_peak_pct < 0 ? ` and ${Math.abs(hv.below_peak_pct)}% below its peak (${hv.peak.month})` : " and at its peak"}.`];
  if (l) summary.push(`Realtor.com counted ${l.active_listings?.toLocaleString("en-US")} active listings in ${l.month} (${l.active_listings_yy_pct >= 0 ? "+" : ""}${l.active_listings_yy_pct}% on a year), a median ${l.median_days_on_market} days on market, and price cuts on ${l.price_reduced_share_pct}% of listings.`);
  if (lastRate) summary.push(`The 30-year mortgage rate was ${lastRate[1]}% (${lastRate[0]})${yearRate ? `, against ${yearRate[1]}% a year earlier` : ""}.`);
  return {
    area: where, summary, home_value: hv, listings: l,
    mortgage_rate_30y: lastRate ? { date: lastRate[0], pct: lastRate[1], year_ago_pct: yearRate?.[1] ?? null } : null,
    reading: "Zillow's typical home value with its changes and its distance from the peak; Realtor.com's listings for the latest month, each against a year earlier; and the 30-year fixed mortgage rate.",
    source: SOURCE,
    limits: [...(l ? [] : [`Realtor.com's listings could not be matched to ${where}.`]), ...LIMITS],
  };
}
