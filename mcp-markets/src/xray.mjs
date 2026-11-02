// A portfolio seen through its funds: each fund or ETF is replaced by the positions in its latest
// public Form N-PORT, scaled by the fund's weight in the portfolio, and added to the stocks held
// directly, so the result is the portfolio's real exposure to each company, the overlap between its
// funds, and how concentrated it is once the funds are opened up.
import { z } from "zod";

import { loadNport, resolveFund, seriesFilings } from "./funds.mjs";
import { NotFound, resolveEntity } from "./sources.mjs";
import { issuerKey, mergeOpened } from "./xray-merge.mjs";

export { issuerKey };

// Unit investment trusts file no N-PORT; the same index's ETF stands in for them, and says so.
const STAND_IN = Object.freeze({ SPY: "IVV", DIA: null, MDY: "IJH" });

export const xrayInput = z.object({
  holdings: z.array(z.object({
    symbol: z.string().min(1).max(20).describe("A stock (AAPL) or a fund or ETF (VOO, QQQ, AGG, FXAIX)."),
    weight: z.number().positive().describe("Its weight or its value: weights are rescaled to sum to 1."),
  }).strict()).min(1).max(25),
  top: z.number().int().min(1).max(200).optional().describe("Most look-through positions to list; default 25."),
}).strict();

// What one holding is: a fund with the positions in its latest N-PORT, or a stock, named as the SEC names it.
export async function openHolding(session, symbol) {
  const sym = String(symbol).toUpperCase();
  let fund = null, used = sym, note = null;
  try { fund = await resolveFund(session, sym); } catch (err) {
    if (!(err instanceof NotFound)) throw err;
    const proxy = STAND_IN[sym];
    if (proxy) { fund = await resolveFund(session, proxy); used = proxy; note = `${sym} files no N-PORT (a unit investment trust); ${proxy}, which tracks the same index, stands in for it.`; }
  }
  if (!fund) {
    const e = await resolveEntity(session, sym).catch(() => null);
    return { kind: "stock", name: e?.name ?? sym, ...(note ? { note } : {}) };
  }
  const filings = await seriesFilings(session, fund.series);
  if (!filings.length) return { kind: "stock", name: sym, note: `${sym} has no public N-PORT; it is counted as one position.` };
  const port = await loadNport(session, filings[0]);
  return { kind: "fund", ...(used !== sym ? { looked_through: used } : {}), fund: port.series.name, period: port.period, filed: filings[0].filed, positions: port.holdings.map((p) => [p.name, p.pct]), ...(note ? { note } : {}) };
}

// The words that go with any look-through, here and on the page.
export const XRAY_MEANING = "weight is the share of the whole portfolio in the issuer after opening each fund; via splits it by the holding it comes through. effective_positions is 1 / sum of squared weights: the number of equal positions with the same concentration. Overlap is the share of each fund's weight the two have in common.";
export const XRAY_LIMITS = Object.freeze(["Funds are opened with their latest public N-PORT, filed up to 60 days after a quarter ends, so positions can be months old.", "Issuers are matched by name across funds and stocks; an issuer named differently by two funds counts twice.", "Not investment advice."]);

export async function portfolioXray(session, args) {
  const a = xrayInput.parse(args);
  const opened = new Map();
  for (const h of a.holdings) {
    const sym = h.symbol.toUpperCase();
    if (!opened.has(sym)) opened.set(sym, await openHolding(session, sym));
  }
  return { ...mergeOpened(a.holdings, (sym) => opened.get(sym), { top: a.top ?? 25 }), meaning: XRAY_MEANING, limits: [...XRAY_LIMITS] };
}
