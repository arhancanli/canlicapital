// Alternative data that is free and needs no key. shipping_activity reads the IMF's PortWatch: ship
// counts at the world's chokepoints and ports, estimated from satellite tracking of ships' AIS signals.
// page_attention reads Wikipedia's page views, a plain measure of public attention.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const PORTWATCH = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services";
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const minusDays = (date, n) => dayOf(Date.parse(`${date}T00:00:00Z`) - n * 86400000);
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const day = (d) => `DATE ${quote(d)}`;
const query = (layer, where, extra = "") => `${PORTWATCH}/${layer}/FeatureServer/0/query?where=${encodeURIComponent(where)}&outFields=*${extra}&f=json`;
// The service refuses the first query of a new shape as "invalid", then answers the same one (seen
// 2026-11-02, every time), so a refusal is tried again before it counts.
const features = async (session, url) => {
  for (let attempt = 0; ; attempt += 1) {
    const r = await getJson(session, url, { maxBytes: 24 * 1024 * 1024, timeoutMs: 45000, maxAgeMs: attempt ? 0 : undefined });
    if (!r?.error) return (r?.features ?? []).map((f) => f.attributes);
    if (attempt >= 3) throw new Error(`PortWatch would not answer: ${r.error.message ?? "an error"}`);
    await session.sleep(1000 * (attempt + 1));
  }
};
// Sorting the table on the server is slow, so the newest day is found among the last few weeks' rows.
const latestDay = async (session) => {
  const rows = await features(session, query("Daily_Chokepoints_Data", `portid = 'chokepoint1' AND date >= ${day(minusDays(dayOf(session.now()), 45))}`));
  return rows.reduce((best, r) => (!best || r.date > best ? r.date : best), null);
};
const sum = (rows, key) => rows.reduce((a, x) => a + (Number(x[key]) || 0), 0);
const pct = (now, was) => (was ? Number(((now / was - 1) * 100).toFixed(1)) : null);

const SOURCE = "IMF PortWatch (https://portwatch.imf.org), from satellite AIS tracking of ships";
const LIMITS = [
  "These are estimates from ships' own tracking signals. A ship that turns its signal off is not counted, and that happens most in conflict zones and under sanctions.",
  "The latest days can be revised, and the data arrives about a week or more after the day it covers.",
  "Ship counts say how much moved through a place. They do not say what any one company shipped, and nothing here shows they predict a price.",
];

export const shippingInput = z.object({
  chokepoint: z.string().min(2).max(60).optional().describe("A strait or canal, such as Suez Canal, Panama Canal, Malacca Strait or Strait of Hormuz. Without chokepoint or port you get every chokepoint."),
  port: z.string().min(2).max(60).optional().describe("A port by name, such as Shanghai or Rotterdam."),
  start: DATE.optional().describe("First day; default 90 days before the latest."),
  end: DATE.optional().describe("Last day; default the latest with data."),
}).strict();

const weekOf = (date) => { const t = Date.parse(`${date}T00:00:00Z`), d = new Date(t).getUTCDay(); return dayOf(t - ((d + 6) % 7) * 86400000); };
function weekly(rows, keys) {
  const weeks = new Map();
  for (const r of rows) {
    const w = weekOf(r.date);
    const row = weeks.get(w) ?? { week_of: w, days: 0, ...Object.fromEntries(keys.map((k) => [k, 0])) };
    row.days += 1;
    for (const k of keys) row[k] += Number(r[k]) || 0;
    weeks.set(w, row);
  }
  return [...weeks.values()].sort((a, b) => (a.week_of < b.week_of ? 1 : -1));
}

export async function shippingActivity(session, args) {
  const a = shippingInput.parse(args);
  if (a.chokepoint && a.port) throw new Error("Pass chokepoint or port, not both.");
  if (a.port) return portActivity(session, a);
  const latest = await latestDay(session);
  if (!latest) throw new Error("PortWatch returned no chokepoint data for the last 45 days.");
  if (!a.chokepoint) {
    const span = (end) => `date >= ${day(minusDays(end, 6))} AND date <= ${day(end)}`;
    const [now, was] = await Promise.all([features(session, query("Daily_Chokepoints_Data", span(latest))), features(session, query("Daily_Chokepoints_Data", span(minusDays(latest, 364))))]);
    const byName = (rows) => { const m = new Map(); for (const r of rows) m.set(r.portname, [...(m.get(r.portname) ?? []), r]); return m; };
    const before = byName(was);
    const rows = [...byName(now)].map(([name, list]) => {
      const old = before.get(name) ?? [], total = sum(list, "n_total"), tankers = sum(list, "n_tanker"), boxes = sum(list, "n_container");
      return [name, total, tankers, boxes, sum(old, "n_total"), pct(total, sum(old, "n_total")), pct(tankers, sum(old, "n_tanker"))];
    }).sort((x, y) => y[1] - x[1]);
    return {
      period: { from: minusDays(latest, 6), to: latest, compared_with: `the same seven days of the week, 52 weeks earlier` },
      columns: ["chokepoint", "ships", "tankers", "container_ships", "ships_a_year_earlier", "change_percent", "tankers_change_percent"],
      rows, meaning: "Ship transits in seven days. Name one chokepoint for its weekly series.", source: SOURCE, limits: LIMITS,
    };
  }
  const end = a.end ?? latest, start = a.start ?? minusDays(end, 90);
  const want = a.chokepoint.trim().toLowerCase();
  const names = await features(session, query("Daily_Chokepoints_Data", `date = ${day(latest)}`));
  const hit = names.find((n) => String(n.portname).toLowerCase() === want) ?? names.find((n) => String(n.portname).toLowerCase().includes(want));
  if (!hit) throw new NotFound(`No chokepoint "${a.chokepoint}". PortWatch covers: ${names.map((n) => n.portname).join(", ")}.`);
  const rows = await features(session, query("Daily_Chokepoints_Data", `portid = ${quote(hit.portid)} AND date >= ${day(start)} AND date <= ${day(end)}`));
  const keys = ["n_total", "n_tanker", "n_container", "n_dry_bulk", "capacity"];
  const weeks = weekly(rows, keys);
  return {
    chokepoint: hit.portname, latest_data: latest,
    columns: ["week_of", "days", "ships", "tankers", "container_ships", "dry_bulk_ships", "capacity_metric_tons"],
    rows: weeks.map((w) => [w.week_of, w.days, w.n_total, w.n_tanker, w.n_container, w.n_dry_bulk, w.capacity]),
    meaning: "Transits per week, newest first; a week with fewer than seven days is only part of one. Capacity is PortWatch's estimate of the ships' carrying capacity.",
    source: SOURCE, limits: LIMITS,
  };
}

async function portActivity(session, a) {
  const found = await features(session, query("PortWatch_ports_database", `fullname LIKE ${quote(`${a.port.trim()}%`)}`, "&returnGeometry=false"));
  const port = found.sort((x, y) => (y.vessel_count_total ?? 0) - (x.vessel_count_total ?? 0))[0];
  if (!port) throw new NotFound(`PortWatch has no port named "${a.port}". Use the port's own name, such as Shanghai or Rotterdam.`);
  const end = a.end ?? await latestDay(session), start = a.start ?? minusDays(end, 90);
  const rows = await features(session, query("Daily_Ports_Data", `portid = ${quote(port.portid)} AND date >= ${day(start)} AND date <= ${day(end)}`));
  if (!rows.length) throw new NotFound(`PortWatch has no daily figures for ${port.fullname} between ${start} and ${end}.`);
  const keys = ["portcalls", "portcalls_container", "portcalls_tanker", "import", "export"];
  const weeks = weekly(rows, keys);
  return {
    port: port.fullname, portid: port.portid, days_read: rows.length,
    columns: ["week_of", "days", "port_calls", "container_calls", "tanker_calls", "imports_metric_tons", "exports_metric_tons"],
    rows: weeks.map((w) => [w.week_of, w.days, w.portcalls, w.portcalls_container, w.portcalls_tanker, w.import, w.export]),
    meaning: "Per week, newest first; a week with fewer than seven days is only part of one. Tons are PortWatch's estimates from ships' draft and size.",
    source: SOURCE, limits: LIMITS,
  };
}

export const attentionInput = z.object({
  topic: z.string().min(1).max(120).describe("A company or subject, such as Nvidia or Bitcoin. The closest English Wikipedia article is used, and its title comes back so you can check it."),
  days: z.number().int().min(7).max(1100).optional().describe("How far back, in days; default 90."),
}).strict();

export async function pageAttention(session, args) {
  const a = attentionInput.parse(args);
  const search = await getJson(session, `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(a.topic)}&limit=1`);
  const page = search?.pages?.[0];
  if (!page) throw new NotFound(`No Wikipedia article close to "${a.topic}".`);
  const end = dayOf(session.now() - 86400000), start = minusDays(end, (a.days ?? 90) - 1);
  const stamp = (d) => d.replace(/-/g, "");
  const r = await getJson(session, `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encodeURIComponent(page.key)}/daily/${stamp(start)}/${stamp(end)}`);
  const items = (r?.items ?? []).map((x) => [`${x.timestamp.slice(0, 4)}-${x.timestamp.slice(4, 6)}-${x.timestamp.slice(6, 8)}`, x.views]);
  if (!items.length) throw new NotFound(`Wikipedia has no page views for "${page.title}" in that time.`);
  const sorted = items.map((x) => x[1]).sort((x, y) => x - y), median = sorted[Math.floor(sorted.length / 2)];
  const latest7 = items.slice(-7).reduce((s, x) => s + x[1], 0) / Math.min(7, items.length);
  const peak = items.reduce((b, x) => (x[1] > b[1] ? x : b));
  return {
    article: page.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
    summary: { median_views_a_day: median, last_7_days_average: Math.round(latest7), last_7_against_median: median ? Number((latest7 / median).toFixed(2)) : null, peak_day: peak[0], peak_views: peak[1] },
    columns: ["date", "views"], rows: items.slice(-Math.min(items.length, 400)),
    source: "Wikimedia page views (people only, no known bots), English Wikipedia",
    limits: ["Page views measure attention, not opinion: good news and bad news both raise them.", "One article in one language. A company's name can also be someone's or something else's, so check the article title."],
  };
}
