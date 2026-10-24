// A portfolio seen through its funds: each fund or ETF is replaced by the positions in its latest
// public Form N-PORT, scaled by the fund's weight in the portfolio, and added to the stocks held
// directly, so the result is the portfolio's real exposure to each company, the overlap between its
// funds, and how concentrated it is once the funds are opened up.
import { z } from "zod";

import { loadNport, resolveFund, seriesFilings } from "./funds.mjs";
import { NotFound, resolveEntity } from "./sources.mjs";

// Unit investment trusts file no N-PORT; the same index's ETF stands in for them, and says so.
const STAND_IN = Object.freeze({ SPY: "IVV", DIA: null, MDY: "IJH" });

export const xrayInput = z.object({
  holdings: z.array(z.object({
    symbol: z.string().min(1).max(20).describe("A stock (AAPL) or a fund or ETF (VOO, QQQ, AGG, FXAIX)."),
    weight: z.number().positive().describe("Its weight or its value: weights are rescaled to sum to 1."),
  }).strict()).min(1).max(25),
  top: z.number().int().min(1).max(200).optional().describe("Most look-through positions to list; default 25."),
}).strict();

const legal = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|class [a-c]|cl [a-c]|the|sa|nv|ag|se|lp|llc)\b/g;
export const issuerKey = (name) => String(name ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(legal, " ").replace(/\s+/g, " ").trim();
const round = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

export async function portfolioXray(session, args) {
  const a = xrayInput.parse(args);
  const total = a.holdings.reduce((s, h) => s + h.weight, 0);
  const exposure = new Map(), funds = [], notes = [];
  const add = (key, name, w, via) => {
    const e = exposure.get(key) ?? { name, weight: 0, via: new Map() };
    e.weight += w; e.via.set(via, (e.via.get(via) ?? 0) + w); exposure.set(key, e);
  };
  for (const h of a.holdings) {
    const w = h.weight / total, sym = h.symbol.toUpperCase();
    let fund = null, used = sym;
    try { fund = await resolveFund(session, sym); } catch (err) {
      if (!(err instanceof NotFound)) throw err;
      const proxy = STAND_IN[sym];
      if (proxy) { fund = await resolveFund(session, proxy); used = proxy; notes.push(`${sym} files no N-PORT (a unit investment trust); ${proxy}, which tracks the same index, stands in for it.`); }
    }
    if (!fund) {
      // A stock held directly: keyed by its SEC name, as funds report their issuers.
      const e = await resolveEntity(session, sym).catch(() => null);
      add(issuerKey(e?.name ?? sym), e?.name ?? sym, w, sym);
      continue;
    }
    const filings = await seriesFilings(session, fund.series);
    if (!filings.length) { add(issuerKey(sym), sym, w, sym); notes.push(`${sym} has no public N-PORT; it is counted as one position.`); continue; }
    const port = await loadNport(session, filings[0]);
    let covered = 0;
    for (const p of port.holdings) {
      if (!Number.isFinite(p.pct)) continue;
      covered += p.pct / 100;
      add(issuerKey(p.name), p.name, (w * p.pct) / 100, sym);
    }
    funds.push({ symbol: sym, ...(used !== sym ? { looked_through: used } : {}), fund: port.series.name, period: port.period, filed: filings[0].filed, positions: port.holdings.length, weight: round(w, 6), weights_add_to: round(covered, 4) });
  }
  const ranked = [...exposure.values()].sort((x, y) => y.weight - x.weight);
  const sum2 = ranked.reduce((s, e) => s + e.weight ** 2, 0);
  // Overlap between two funds: the weight they share, the sum over issuers of the smaller of the
  // two funds' own weights in it (1 for identical funds, 0 for none in common).
  const own = (sym) => { const f = funds.find((x) => x.symbol === sym); return f ? f.weight : null; };
  const overlap = [];
  for (let i = 0; i < funds.length; i += 1) for (let j = i + 1; j < funds.length; j += 1) {
    const [p, q] = [funds[i].symbol, funds[j].symbol];
    let shared = 0;
    for (const e of exposure.values()) { const x = e.via.get(p), y = e.via.get(q); if (x && y) shared += Math.min(x / own(p), y / own(q)); }
    overlap.push([p, q, round(Math.min(1, shared), 4)]); // N-PORT weights can add to a little over 1 (derivatives, cash)
  }
  return {
    holdings: a.holdings.length, funds,
    positions_after_look_through: ranked.length,
    effective_positions: round(1 / sum2, 1),
    top_weight: round(ranked[0]?.weight ?? 0, 6),
    columns: ["issuer", "weight", "via"],
    rows: ranked.slice(0, a.top ?? 25).map((e) => [e.name, round(e.weight, 6), Object.fromEntries([...e.via].map(([k, v]) => [k, round(v, 6)]))]),
    overlap: { columns: ["fund", "fund", "shared_weight"], rows: overlap },
    ...(notes.length ? { notes } : {}),
    meaning: "weight is the share of the whole portfolio in the issuer after opening each fund; via splits it by the holding it comes through. effective_positions is 1 / sum of squared weights: the number of equal positions with the same concentration. Overlap is the share of each fund's weight the two have in common.",
    limits: ["Funds are opened with their latest public N-PORT, filed up to 60 days after a quarter ends, so positions can be months old.", "Issuers are matched by name across funds and stocks; an issuer named differently by two funds counts twice.", "Not investment advice."],
  };
}
