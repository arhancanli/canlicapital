// Crypto perpetual funding: what longs paid shorts every eight hours on OKX's USDT-margined
// perpetual swaps (public data, no key), per coin over a window. Funding is the carry a hedged
// position earns (long spot, short the perpetual) before fees and borrowing: positive funding pays
// the short side. ALPHAC's breadth lab found this carry strong in 2023-24 and near zero since 2025.
import { z } from "zod";

import { getJson } from "./sources.mjs";

const API = "https://www.okx.com/api/v5/public/funding-rate-history";
const PER_DAY = 3;

export const fundingInput = z.object({
  coins: z.array(z.string().regex(/^[A-Za-z0-9]{1,15}$/, "a coin symbol such as BTC")).min(1).max(20).optional().describe("Coin symbols, e.g. [\"BTC\", \"ETH\", \"SOL\"]; default BTC, ETH, SOL, XRP, DOGE."),
  days: z.number().int().min(1).max(90).optional().describe("Window, in days back from now; default 30."),
  series: z.boolean().optional().describe("Also return each coin's funding by period; default false."),
}).strict();

const round = (x, d = 6) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

// One coin's funding over the window, newest first, page by page (100 periods a page).
async function history(session, coin, days) {
  const inst = `${coin.toUpperCase()}-USDT-SWAP`, since = session.now() - days * 86400000, out = [];
  let after = null;
  for (let page = 0; page < 4; page += 1) {
    const r = await getJson(session, `${API}?instId=${inst}&limit=100${after ? `&after=${after}` : ""}`);
    if (r?.code !== "0") throw new Error(`OKX has no USDT perpetual ${inst} (${r?.msg || `code ${r?.code}`}).`);
    const rows = (r.data ?? []).map((x) => [Number(x.fundingTime), Number(x.realizedRate ?? x.fundingRate)]).filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v));
    for (const row of rows) if (row[0] >= since) out.push(row);
    if (rows.length < 100 || rows.at(-1)[0] < since) break;
    after = rows.at(-1)[0];
  }
  return { inst, rows: out };
}

export async function fundingRates(session, args) {
  const a = fundingInput.parse(args);
  const coins = (a.coins ?? ["BTC", "ETH", "SOL", "XRP", "DOGE"]).map((c) => c.toUpperCase());
  const days = a.days ?? 30, out = [], series = {}, missing = [];
  for (const c of coins) {
    try {
      const h = await history(session, c, days);
      if (!h.rows.length) { missing.push([c, "no funding in the window"]); continue; }
      const v = h.rows.map((x) => x[1]), mean = v.reduce((s, x) => s + x, 0) / v.length;
      const recent = h.rows.filter((x) => x[0] >= session.now() - 7 * 86400000).map((x) => x[1]);
      const recentMean = recent.length ? recent.reduce((s, x) => s + x, 0) / recent.length : null;
      out.push([c, h.inst, round(v[0]), round(mean), round(mean * PER_DAY * 365, 4), round(recentMean === null ? null : recentMean * PER_DAY * 365, 4), round(v.filter((x) => x > 0).length / v.length, 3), v.length]);
      if (a.series) series[c] = h.rows.map(([t, x]) => [new Date(t).toISOString().slice(0, 16), round(x, 8)]);
    } catch (err) { missing.push([c, String(err.message).slice(0, 140)]); }
  }
  out.sort((x, y) => (y[4] ?? -9) - (x[4] ?? -9));
  return {
    days, columns: ["coin", "instrument", "latest", "mean_per_period", "annualized", "annualized_last_7d", "share_positive", "periods"],
    rows: out, ...(a.series ? { series } : {}), ...(missing.length ? { missing } : {}),
    meaning: "Funding is paid every eight hours (three periods a day): a positive rate means longs pay shorts. annualized = mean rate x 3 x 365, the carry of being short the perpetual against a long spot position, before trading fees, borrowing and the risk of the two legs drifting apart.",
    source: API,
    limits: ["OKX's USDT-margined perpetuals only; other venues' funding differs.", "A carry earned in the past is not a forecast: funding falls when many traders take the same side.", "Not investment advice."],
  };
}
