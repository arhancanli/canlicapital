// recession_watch: the indicators economists read for a US recession, each beside the line it is read against: the
// New York Fed's yield-curve model (the chance of being in recession twelve months ahead from the 10-year less 3-month spread,
// computed as the New York Fed publishes it), the Sahm rule, the 10-year less 2-year curve and how long it has been
// inverted, jobless claims against a year earlier, the Chauvet-Piger probability that a recession is under way,
// GDPNow, and the Fed Board staff's model of a recession starting within twelve months from the excess bond premium.
// Every input from FRED but that model's, from the Fed Board's own file. No key.
import { z } from "zod";

import { EBP_PAGE, readEbp } from "./conditions.mjs";
import { fredCsv } from "./sources.mjs";

export const recessionInput = z.object({
  months: z.number().int().min(1).max(240).optional().describe("Months of the yield-curve model's probability shown, latest last; default 13."),
}).strict();

const DAY = 86400000;
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
// The standard normal distribution (Abramowitz and Stegun 7.1.26, error under 1.5e-7).
export function normalCdf(x) {
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + (x >= 0 ? erf : -erf));
}
// The New York Fed's probit (estimated on 1959 to 2009): the 10-year Treasury yield less the 3-month bill rate on a
// bond-equivalent basis, monthly averages. For September 2026 this gives 0.95509 and 12.7587%, as the New York Fed's
// own chart of 4 October 2026 shows.
export const billBondEquivalent = (discountPct) => { const d = discountPct / 100; return (100 * 365 * d) / (360 - 91 * d); };
export const curveRecessionChance = (spread) => normalCdf(-0.5333 - 0.6330 * spread);

const monthAhead = (yyyymm, n) => { const [y, m] = yyyymm.split("-").map(Number); const i = y * 12 + (m - 1) + n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; };

export async function recessionWatch(session, args) {
  const a = recessionInput.parse(args);
  const since = (days) => new Date(session.now() - days * DAY).toISOString().slice(0, 10);
  const [gs10, tb3, sahm, cp, t10y2y, claims, gdpnow, ebp] = await Promise.all([
    fredCsv(session, "GS10", { start: since(2600) }), fredCsv(session, "TB3MS", { start: since(2600) }), fredCsv(session, "SAHMREALTIME", { start: since(800) }),
    fredCsv(session, "RECPROUSM156N", { start: since(800) }), fredCsv(session, "T10Y2Y", { start: since(1500) }), fredCsv(session, "IC4WSA", { start: since(800) }),
    fredCsv(session, "GDPNOW", { start: since(800) }), readEbp(session),
  ].map((p) => p.catch(() => null)));
  const valid = (s) => s?.rows.filter(([, v]) => v != null) ?? [];
  const rows = [], summary = [];
  // The yield-curve model, month by month.
  const bills = new Map(valid(tb3).map(([d, v]) => [d.slice(0, 7), v]));
  const curve = valid(gs10).filter(([d]) => bills.has(d.slice(0, 7))).map(([d, v]) => {
    const spread = v - billBondEquivalent(bills.get(d.slice(0, 7)));
    return [d.slice(0, 7), round(spread, 5), round(100 * curveRecessionChance(spread), 2)];
  });
  const lastCurve = curve.at(-1);
  if (lastCurve) {
    rows.push(["yield_curve_model", "chance of being in recession twelve months ahead (New York Fed model)", lastCurve[2], lastCurve[0], "percent", "30%, the line it is commonly read against; it rose past it before most recessions since 1970, and from 2022 to 2024 without one", lastCurve[2] >= 30 ? "warning" : "clear"]);
    summary.push(`The New York Fed's yield-curve model gives a ${lastCurve[2]}% chance of the US being in recession in ${monthAhead(lastCurve[0], 12)}, twelve months ahead (10-year less 3-month spread ${lastCurve[1]} points in ${lastCurve[0]}).`);
  }
  // The Fed Board staff's model (Favara, Gilchrist, Lewis and Zakrajšek, 2016): the chance that a recession starts
  // sometime in the next twelve months, from the excess bond premium.
  const e = (ebp ?? []).filter((x) => x[3] != null).at(-1);
  if (e) {
    const pct = round(e[3] * 100, 1);
    rows.push(["ebp_model", "chance of a recession starting within twelve months (Fed Board staff's excess bond premium model)", pct, e[0].slice(0, 7), "percent", "50%, more likely than not, the line used here; its authors set none", pct >= 50 ? "warning" : "clear"]);
    summary.push(`The Fed Board staff's excess bond premium model gives a ${pct}% chance of a recession starting within twelve months (${e[0].slice(0, 7)}; the premium ${round(e[2])} points).`);
  }
  const s = valid(sahm).at(-1);
  if (s) {
    rows.push(["sahm_rule", "rise in the 3-month average unemployment rate over its low of the past year (real time)", round(s[1]), s[0].slice(0, 7), "points", "0.50, Sahm's line; reached early in every recession since 1970, and in 2024 without one", s[1] >= 0.5 ? "warning" : "clear"]);
    summary.push(`The Sahm rule reads ${round(s[1])} (${s[0].slice(0, 7)}), ${s[1] >= 0.5 ? "at or above" : "below"} its 0.50 line.`);
  }
  const ys = valid(t10y2y);
  if (ys.length) {
    const [d, v] = ys.at(-1);
    let since0 = null;
    if (v < 0) { for (let i = ys.length - 1; i >= 0 && ys[i][1] < 0; i--) since0 = ys[i][0]; }
    const lastInverted = [...ys].reverse().find(([, x]) => x < 0)?.[0] ?? null;
    rows.push(["curve_10y_2y", "10-year less 2-year Treasury yield", round(v), d, "points", "below 0 (inverted) has come before recessions, often by a year or more", v < 0 ? "warning" : "clear"]);
    summary.push(v < 0 ? `The 10-year less 2-year curve is inverted at ${round(v)} points (${d}), since ${since0}.` : `The 10-year less 2-year curve is ${round(v)} points (${d})${lastInverted ? `, last inverted on ${lastInverted}` : ""}.`);
  }
  const c = valid(claims);
  if (c.length) {
    const [d, v] = c.at(-1), before = c.filter(([x]) => x <= new Date(Date.parse(d) - 364 * DAY).toISOString().slice(0, 10)).at(-1);
    const change = before ? round((v / before[1] - 1) * 100, 1) : null;
    rows.push(["jobless_claims", "initial jobless claims, 4-week average", v, d, "claims", "a rise of 20% on a year, the line used here; claims climb as layoffs spread", change != null && change >= 20 ? "warning" : "clear", change]);
    summary.push(`Initial jobless claims average ${v.toLocaleString("en-US")} a week (${d})${change != null ? `, ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% on a year` : ""}.`);
  }
  const p = valid(cp).at(-1);
  if (p) rows.push(["chauvet_piger", "smoothed probability that a recession is under way (Chauvet and Piger)", round(p[1]), p[0].slice(0, 7), "percent", "50%, the line used here; it has been near 100% in each NBER recession", p[1] >= 50 ? "warning" : "clear"]);
  const g = valid(gdpnow).at(-1);
  if (g) rows.push(["gdpnow", "Atlanta Fed GDPNow, this quarter's real growth at an annual rate", round(g[1]), g[0].slice(0, 7), "percent", "below 0 is a contracting quarter", g[1] < 0 ? "warning" : "clear"]);
  const warnings = rows.filter((r) => r[6] === "warning").map((r) => r[0]);
  summary.unshift(`${warnings.length} of ${rows.length} recession indicators are past their lines${warnings.length ? ` (${warnings.join(", ")})` : ""}.`);
  return {
    summary,
    columns: ["indicator", "measures", "latest", "as_of", "unit", "line_read_against", "signal", "change_on_year_pct"], rows: rows.map((r) => [...r.slice(0, 7), r[7] ?? null]),
    yield_curve_model: { columns: ["month", "spread_10y_less_3m", "recession_chance_12m_pct"], rows: curve.slice(-(a.months ?? 13)) },
    reading: "Each indicator's latest reading beside the line economists read it against; signal says whether it is past that line. The yield-curve model's chance is of the economy being in recession in the month twelve months after the one shown, not of one starting at any time before then.",
    source: `FRED: GS10 and TB3MS (the New York Fed's yield-curve model, its published coefficients -0.5333 and -0.6330), SAHMREALTIME, T10Y2Y, IC4WSA, RECPROUSM156N, GDPNOW; the Fed Board's excess bond premium file (${EBP_PAGE})`,
    limits: [
      "Each indicator has missed or given false alarms (the curve was inverted from 2022 into 2024 without a recession); none is a forecast of the Federal Reserve. Lines are those their authors and the literature use.",
      "The excess bond premium model is the Fed Board staff's research product, not an official statistic; it is posted about the fourth business day of each month and may be revised.",
      "Not investment advice.",
    ],
  };
}
