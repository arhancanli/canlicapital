// gdp_nowcast: the Atlanta Fed's GDPNow, its running estimate of this quarter's real GDP growth: the latest nowcast,
// each update with the data releases that moved it since the quarter's first, what each part of spending adds, the
// BEA's latest estimates for the quarters before, and the model's record against the BEA's advance estimates. Read
// from the Atlanta Fed's own workbook. No key.
import { z } from "zod";

import { getZipText, NotFound } from "./sources.mjs";
import { xlsxSheets } from "./xlsx.mjs";

const FILE = "https://www.atlantafed.org/-/media/Project/Atlanta/FRBA/Documents/research-and-data/data/gdpnow/GDPTrackingModelDataAndForecasts.xlsx";
const PAGE = "https://www.atlantafed.org/cqer/research/gdpnow";
const PARTS = { PCE: "consumer spending", "Equip- ment": "equipment", "Intell. prop. prod.": "intellectual property", "Nonres. struct.": "business structures", "Resid. inves.": "housing", "Govt.": "government", "Net exports": "net exports", CIPI: "inventories" };

export const gdpnowInput = z.object({
  quarters: z.number().int().min(1).max(60).optional().describe("Quarters of the track record shown, latest first; default 8."),
}).strict();

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const num = (s) => (s === "" || s == null || !Number.isFinite(Number(s)) ? null : Number(s));
// Excel counts days from 30 December 1899.
export const excelDate = (serial) => (num(serial) == null ? null : new Date(Date.UTC(1899, 11, 30) + Math.round(Number(serial)) * 86400000).toISOString().slice(0, 10));
const quarterOf = (iso) => (iso ? `${iso.slice(0, 4)}-Q${Math.ceil(Number(iso.slice(5, 7)) / 3)}` : null);
const label = (words) => String(words ?? "").replace(/^(\d{2}):Q(\d)$/, "20$1-Q$2");

// The three tabs read from the 11 MB workbook (growth by part, contributions by part, the track record), each kept to
// its first table: the tabs hold other tables below, past an empty row.
const firstTable = (rows) => { const end = rows.findIndex((r, i) => i > 0 && r.every((c) => c === "")); return end < 0 ? rows : rows.slice(0, end); };
export const workbookTabs = (bytes) => JSON.stringify(xlsxSheets(bytes, ["Table", "TableCont", "TrackRecord"]).map(firstTable));

export async function gdpNowcast(session, args) {
  const a = gdpnowInput.parse(args);
  const [table, parts, record] = JSON.parse(await getZipText(session, FILE, { decode: workbookTabs }));
  const head = table[0], body = table.slice(1).filter((r) => num(r[2]) != null);
  const bea = body.filter((r) => /^Latest BEA estimate for/i.test(r[1])).map((r) => ({ quarter: label(/for (\S+)$/.exec(r[1])?.[1]), gdp_pct: round(num(r[2])), as_of: excelDate(r[0]) }));
  const updates = body.filter((r) => !/^Latest BEA estimate/i.test(r[1]));
  if (!updates.length) throw new NotFound("The Atlanta Fed's workbook held no nowcast for this quarter.");
  const first = updates[0], last = updates.at(-1);
  const quarter = label(/(\d{2}:Q\d)/.exec(first[1])?.[1]) ?? null;
  const latestParts = parts.slice(1).filter((r) => num(r[2]) != null).at(-1);
  const contributions = latestParts ? parts[0].slice(3).map((h, i) => [PARTS[h] ?? h, round(num(latestParts[i + 3]))]).filter(([, v]) => v != null) : [];
  const growth = head.slice(3).map((h, i) => [h.replace(/-\s+/, ""), round(num(last[i + 3]))]).filter(([h, v]) => v != null && !/^Change in/i.test(h));
  const track = record.slice(1).filter((r) => excelDate(r[0]) && num(r[1]) != null && num(r[2]) != null).map((r) => [quarterOf(excelDate(r[0])), round(num(r[1])), round(num(r[2])), round(num(r[1]) - num(r[2])), num(r[3]) > num(r[0]) ? excelDate(r[3]) : null]).sort((x, y) => y[0].localeCompare(x[0]));
  const shown = track.slice(0, a.quarters ?? 8);
  const miss = shown.length ? round(shown.reduce((s, r) => s + Math.abs(r[3]), 0) / shown.length) : null;
  const adds = contributions.filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  const takes = contributions.filter(([, v]) => v < 0).sort((x, y) => x[1] - y[1]).map(([k, v]) => `${k} ${Math.abs(v)}`).join(", ");
  return {
    quarter,
    summary: [
      `The Atlanta Fed's GDPNow puts real GDP growth in ${quarter} at ${round(num(last[2]))}% (annualized) on ${excelDate(last[0])}, after ${last[1].replace(/\s*\(Full report\)/gi, "")}; it began the quarter at ${round(num(first[2]))}% on ${excelDate(first[0])}.`,
      ...(contributions.length ? [`In points of growth, ${adds}${takes ? `; less ${takes}` : ""}.`] : []),
      ...(shown.length ? [`Its last nowcast before each of the BEA's last ${shown.length} advance estimates missed by ${miss} points on average (${shown[0][0]}: ${shown[0][1]}% against ${shown[0][2]}%).`] : []),
    ],
    latest: { date: excelDate(last[0]), gdp_pct: round(num(last[2])), after: last[1] },
    first: { date: excelDate(first[0]), gdp_pct: round(num(first[2])) },
    bea_estimates: bea,
    updates: { columns: ["date", "releases", "gdp_pct", "change"], rows: updates.map((r, i) => [excelDate(r[0]), r[1], round(num(r[2])), i ? round(num(r[2]) - num(updates[i - 1][2])) : null]) },
    contributions_points: { columns: ["part", "points"], rows: contributions },
    growth_pct: { columns: ["part", "pct"], rows: growth },
    track_record: { columns: ["quarter", "last_nowcast_pct", "advance_estimate_pct", "miss", "advance_released"], rows: shown, mean_absolute_miss: miss },
    reading: `GDPNow's estimate of real GDP growth in ${quarter} at an annual rate, as each release came in; contributions are percentage points of growth by part of spending, growth is each part's own annualized growth.`,
    source: `${FILE} (${PAGE})`,
    limits: [
      "GDPNow is a model's running estimate from the data published so far, not an official forecast of the Atlanta Fed or the Federal Reserve; it changes with each release until the BEA's advance estimate.",
      "Not investment advice.",
    ],
  };
}
