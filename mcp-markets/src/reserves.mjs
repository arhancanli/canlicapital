// reserve_currencies: what the world's central banks hold their foreign exchange reserves in, from the IMF's Currency
// Composition of Official Foreign Exchange Reserves (COFER): each currency's share of the reserves whose currency is
// reported and its value in dollars, the change on a year and over ten years, and the shares quarter by quarter. No key.
import { z } from "zod";

import { csvRows } from "./cycle.mjs";
import { getText, NotFound } from "./sources.mjs";

const QUERY = "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/COFER/+/G001.AFXRA.*.SHRO_PT+NV_USD.Q?lastNObservations=45";
const PAGE = "https://data.imf.org/en/datasets/IMF.STA:COFER";
const NAMES = { CI_USD: "US dollar", CI_EUR: "euro", CI_JPY: "Japanese yen", CI_GBP: "pound sterling", CI_CNY: "Chinese renminbi", CI_CAD: "Canadian dollar", CI_AUD: "Australian dollar", CI_CHF: "Swiss franc", CI_OTHC: "other currencies" };
const SHORT = { CI_USD: "usd", CI_EUR: "eur", CI_JPY: "jpy", CI_GBP: "gbp", CI_CNY: "cny", CI_CAD: "cad", CI_AUD: "aud", CI_CHF: "chf", CI_OTHC: "other" };

export const reservesInput = z.object({
  quarters: z.number().int().min(1).max(44).optional().describe("Quarters of shares shown, latest last; default 8."),
}).strict();

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
// "2026-Q2" less n quarters.
export function quarterBack(q, n) {
  const [y, k] = [Number(q.slice(0, 4)), Number(q.slice(-1))];
  const i = y * 4 + (k - 1) - n;
  return `${Math.floor(i / 4)}-Q${(i % 4) + 1}`;
}

// The IMF's CSV as each currency's shares and dollar values by quarter.
export function coferTable(text) {
  const out = {};
  for (const r of csvRows(text)) {
    const cur = r.FXR_CURRENCY, how = r.TYPE_OF_TRANSFORMATION, q = r.TIME_PERIOD, v = Number(r.OBS_VALUE);
    if (!cur || !/^\d{4}-Q[1-4]$/.test(q ?? "") || r.OBS_VALUE === "" || !Number.isFinite(v)) continue;
    const kind = how === "SHRO_PT" ? "share" : how === "NV_USD" ? "value" : null;
    if (kind) ((out[cur] ??= { share: {}, value: {} })[kind][q] = v);
  }
  return out;
}

export async function reserveCurrencies(session, args) {
  const a = reservesInput.parse(args);
  const table = coferTable(await getText(session, QUERY, { headers: { Accept: "application/vnd.sdmx.data+csv;version=2.0.0" }, timeoutMs: 30000 }));
  const latest = Object.keys(table.CI_T?.value ?? {}).sort().at(-1);
  if (!latest) throw new NotFound("The IMF's COFER answer held no world total.");
  const year = quarterBack(latest, 4), decade = quarterBack(latest, 40);
  const held = Object.keys(NAMES).filter((c) => table[c]?.share[latest] != null);
  const rows = held.map((c) => {
    const s = table[c].share, v = table[c].value;
    return [NAMES[c], round(s[latest]), round(v[latest] / 1e9, 1), s[year] == null ? null : round(s[latest] - s[year]), s[decade] == null ? null : round(s[latest] - s[decade]), v[year] ? round((v[latest] / v[year] - 1) * 100, 1) : null];
  }).sort((x, y) => (x[0] === "other currencies") - (y[0] === "other currencies") || y[1] - x[1]);
  const quarters = Array.from({ length: a.quarters ?? 8 }, (_, i) => quarterBack(latest, (a.quarters ?? 8) - 1 - i));
  const total = table.CI_T.value[latest] / 1e12;
  const usd = rows.find((r) => r[0] === "US dollar");
  const others = rows.filter((r) => r[0] !== "US dollar" && r[0] !== "other currencies").slice(0, 4).map((r) => `the ${r[0]} ${r[1]}%`).join(", ");
  return {
    quarter: latest,
    summary: usd ? [`In ${latest} the US dollar was ${usd[1]}% of the world's foreign exchange reserves whose currency is reported ($${round(usd[2] / 1000, 2)} trillion of $${round(total, 2)} trillion), ${usd[3] == null ? "" : `${usd[3] >= 0 ? "up" : "down"} ${Math.abs(usd[3])} points on a year`}${usd[4] == null ? "" : ` and ${usd[4] >= 0 ? "up" : "down"} ${Math.abs(usd[4])} points on ten years`}; ${others}.`] : [],
    total_trillions_usd: round(total, 3),
    columns: ["currency", "share_pct", "billions_usd", "share_change_on_year", "share_change_ten_years", "value_change_on_year_pct"], rows,
    history: { columns: ["quarter", ...held.map((c) => SHORT[c])], rows: quarters.map((q) => [q, ...held.map((c) => round(table[c].share[q]))]) },
    reading: `Each currency's share of the world's allocated foreign exchange reserves at the end of ${latest}, its value in billions of dollars, and the change in share (points) on a year and ten years; history gives the shares quarter by quarter.`,
    source: `${QUERY} (IMF COFER; ${PAGE})`,
    limits: [
      "Shares are of the reserves whose currency central banks report to the IMF (allocated reserves); the IMF publishes no country's holdings.",
      "A change in share is partly valuation: when the dollar rises, other currencies' reserves are worth fewer dollars without anyone selling them.",
      "Not investment advice.",
    ],
  };
}
