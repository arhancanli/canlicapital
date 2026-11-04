// rate_expectations: what the futures market expects the Fed to do. From 30-day fed funds futures (CBOT, a contract
// a month, quoted by Yahoo), the rate each month's contract implies; at each scheduled FOMC meeting (the Fed's own
// calendar) the rate expected after it, the chances of each move, and the chances of each target range, by the
// method CME's FedWatch publishes. The target range and the effective rate today are the Fed's (FRED). No key.
import { z } from "zod";

import { parseCalendar } from "./centralbank.mjs";
import { fredCsv, getJson, getText } from "./sources.mjs";

const CODES = "FGHJKMNQUVXZ";
const CALENDAR = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const SPARK = (symbols) => `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(","))}&range=5d&interval=1d`;
const STEP = 0.25;

export const expectationsInput = z.object({
  meetings: z.number().int().min(1).max(10).optional().describe("Scheduled FOMC meetings shown, soonest first; default 8."),
}).strict();

const DAY = 86400000;
const round = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const pct = (p) => Math.round(p * 1000) / 10;
const monthKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const contractOf = (y, m) => `ZQ${CODES[m - 1]}${String(y).slice(2)}.CBT`;
const range = (low) => `${low.toFixed(2)}-${(low + STEP).toFixed(2)}`;

// Each meeting month's rate going in and coming out, by FedWatch's method: a month's contract settles on the average
// effective rate, so with d days at the old rate (the change takes effect the day after the decision) of N,
// average = (d * in + (N - d) * out) / N. A month without a meeting holds one rate, so its contract anchors the month
// on either side; between two meeting months the rate is carried forward.
export function meetingRates(months, effr) {
  const out = [];
  let carried = null;
  months.forEach((m, i) => {
    if (!m.meeting) { carried = m.implied; return; }
    const prev = months[i - 1], next = months[i + 1];
    const start = prev && !prev.meeting && prev.implied != null ? prev.implied : carried ?? effr;
    const d = Number(m.meeting.slice(8, 10)), n = m.days;
    const end = next && !next.meeting && next.implied != null ? next.implied : m.implied == null ? null : (n * m.implied - d * start) / (n - d);
    out.push({ meeting: m.meeting, start, end });
    carried = end;
  });
  return out;
}

// A meeting's moves: the expected change split between the two nearest multiples of a quarter point.
export function moves(change) {
  const steps = Math.abs(change) / STEP, k = Math.floor(steps + 1e-9), frac = steps - k, sign = change < 0 ? -1 : 1;
  return frac < 1e-6 ? [[sign * k, 1]] : [[sign * k, 1 - frac], [sign * (k + 1), frac]];
}

export async function rateExpectations(session, args) {
  const a = expectationsInput.parse(args);
  if (session.env?.CANLI_KEYLESS_PRICES === "0") throw new Error("Futures prices are off on this server (CANLI_KEYLESS_PRICES=0). On the hosted server, run the local one: npx -y canli-mcp.");
  const today = new Date(session.now()).toISOString().slice(0, 10);
  const start = new Date(session.now() - 30 * DAY).toISOString().slice(0, 10);
  const [calendar, low, high, effrRows] = await Promise.all([
    getText(session, CALENDAR).then(parseCalendar),
    fredCsv(session, "DFEDTARL", { start }), fredCsv(session, "DFEDTARU", { start }), fredCsv(session, "EFFR", { start }),
  ]);
  // Every contract to the tenth meeting is read in one request, whatever is shown, so one answer serves them all.
  const meetings = calendar.filter((m) => m.end >= today).slice(0, 10), shown = a.meetings ?? 8;
  if (!meetings.length) throw new Error("The Fed's calendar lists no FOMC meeting after today.");
  const lastOf = (rows) => rows.filter(([, v]) => v != null).at(-1);
  const [, lower] = lastOf(low.rows), [, upper] = lastOf(high.rows), [effrDate, effr] = lastOf(effrRows.rows);
  // A contract for every month from this one to the month after the last meeting, the anchor on its far side.
  const months = [];
  const [y0, m0] = today.split("-").map(Number), [y1, m1] = meetings.at(-1).end.split("-").map(Number);
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1 + 1); m === 12 ? (y += 1, m = 1) : (m += 1)) {
    months.push({ key: monthKey(y, m), symbol: contractOf(y, m), days: daysIn(y, m), meeting: meetings.find((x) => x.end.startsWith(monthKey(y, m)))?.end ?? null, implied: null, price: null, quoted: null });
  }
  const quotes = await getJson(session, SPARK(months.map((m) => m.symbol)), { timeoutMs: 12000 });
  for (const x of quotes?.spark?.result ?? []) {
    const meta = x?.response?.[0]?.meta, m = months.find((k) => k.symbol === x.symbol);
    if (m && meta?.regularMarketPrice > 0) { m.price = meta.regularMarketPrice; m.implied = 100 - meta.regularMarketPrice; m.quoted = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10) : null; }
  }
  if (!months.some((m) => m.implied != null)) throw new Error("No fed funds futures price could be read from Yahoo.");
  const rates = meetingRates(months, effr);
  // The tree: each meeting's moves applied to every range the last meeting could have left, from today's range.
  let dist = new Map([[0, 1]]);
  const rows = [], ranges = [];
  for (const r of rates.slice(0, shown)) {
    if (r.end == null) break;
    const change = r.end - r.start, next = new Map();
    for (const [steps, p] of dist) for (const [k, q] of moves(change)) next.set(steps + k, (next.get(steps + k) ?? 0) + p * q);
    dist = next;
    const single = moves(change), chance = (f) => pct(single.filter(([k]) => f(k)).reduce((s, [, q]) => s + q, 0));
    const likely = [...dist].sort((x, y) => y[1] - x[1])[0];
    rows.push([r.meeting, round(r.end), Math.round(change * 1000) / 10, Math.round((r.end - effr) * 1000) / 10, chance((k) => k === 0), chance((k) => k > 0), chance((k) => k < 0), range(lower + likely[0] * STEP), pct(likely[1])]);
    ranges.push([r.meeting, new Map(dist)]);
  }
  const all = [...new Set(ranges.flatMap(([, d]) => [...d.keys()]))].sort((x, y) => x - y);
  const stale = months.filter((m) => m.quoted && Date.parse(today) - Date.parse(m.quoted) > 5 * DAY).map((m) => `${m.symbol} (${m.quoted})`);
  const missing = months.filter((m) => m.implied == null).map((m) => m.symbol);
  const words = (k, p) => `${pct(p)}% ${k === 0 ? "no change" : `a ${Math.abs(k) * 25} bp ${k > 0 ? "hike" : "cut"}`}`;
  const first = rows[0], firstMoves = moves((rates[0].end ?? rates[0].start) - rates[0].start).sort((x, y) => y[1] - x[1]);
  const summary = first ? [
    `Fed funds futures price ${firstMoves.map(([k, p]) => words(k, p)).join(" and ")} at the ${first[0]} meeting; the target range is ${range(lower)}% and the effective rate ${effr}% (${effrDate}).`,
    ...(rows.length > 1 ? [`By the ${rows.at(-1)[0]} meeting they imply ${rows.at(-1)[1]}% (${rows.at(-1)[3] >= 0 ? "+" : ""}${rows.at(-1)[3]} bp from today's effective rate), the likeliest range ${rows.at(-1)[7]}% (${rows.at(-1)[8]}%).`] : []),
  ] : [];
  return {
    as_of: today, summary,
    current: { target_range: `${range(lower)}`, lower, upper, effective_rate: effr, effective_rate_date: effrDate },
    meetings: { columns: ["meeting", "implied_rate_after", "expected_change_bp", "change_from_today_bp", "no_change_pct", "hike_pct", "cut_pct", "likeliest_range", "likeliest_range_pct"], rows },
    target_ranges: { columns: ["meeting", ...all.map((k) => range(lower + k * STEP))], rows: ranges.map(([m, d]) => [m, ...all.map((k) => (d.has(k) ? pct(d.get(k)) : 0))]) },
    futures: { columns: ["month", "contract", "price", "implied_rate", "meeting", "quoted"], rows: months.map((m) => [m.key, m.symbol, m.price, round(m.implied), m.meeting, m.quoted]) },
    reading: "At each scheduled FOMC meeting, the effective rate the futures imply after it, the expected change at that meeting and from today (basis points), the chances of no change, a hike or a cut there, and the likeliest target range; target_ranges gives every range's chance after each meeting, in percent.",
    source: `${CALENDAR} (meetings); Yahoo Finance quotes of CBOT 30-day fed funds futures (${months[0].symbol} to ${months.at(-1).symbol}); FRED DFEDTARL, DFEDTARU, EFFR`,
    limits: [
      ...(missing.length ? [`No price for ${missing.join(", ")}; meetings that need it are not shown.`] : []),
      ...(stale.length ? [`Last traded more than five days ago: ${stale.join(", ")}.`] : []),
      "The method is the one CME's FedWatch publishes (each contract settles on the month's average effective rate; a change takes effect the day after the decision; a month without a meeting anchors its neighbours; each expected change is split between the nearest quarter-point moves); FedWatch's own figures can differ by a few points with its prices and day counts.",
      "Futures prices hold a small term premium, so the chances are the market's pricing, not a pure forecast. Not investment advice.",
    ],
  };
}
