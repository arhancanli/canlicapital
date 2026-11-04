// crypto_options: crypto options from Deribit, the exchange where most of them trade, read from its public
// API (no key). The term structure (each expiry's at-the-money implied volatility, open interest by calls
// and puts, the day's volume) with DVOL, Deribit's 30-day implied volatility index; or one expiry's chain,
// strike by strike, with prices in US dollars.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const API = "https://www.deribit.com/api/v2/public";
const MONTHS = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
// BTC and ETH options are inverse (priced and settled in the coin); the others are linear, in USDC.
const INVERSE = new Set(["BTC", "ETH"]);
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

export const optionsInput = z.object({
  currency: z.string().regex(/^[A-Za-z]{2,10}$/).describe("The coin: BTC, ETH, SOL, XRP, BNB and others Deribit lists options on."),
  view: z.enum(["summary", "chain"]).optional().describe("summary: every expiry's at-the-money volatility, open interest and volume, with DVOL. chain: one expiry strike by strike. Default summary."),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD").optional().describe("For chain: the expiry date; default the nearest at least a day away."),
}).strict();

// "BTC-13NOV26-83000-P" or "XRP_USDC-13NOV26-2d5-C" (2d5 is 2.5).
export function parseInstrument(name) {
  const m = /^([A-Z0-9]+(?:_[A-Z]+)?)-(\d{1,2})([A-Z]{3})(\d{2})-([\dd.]+)-([CP])$/.exec(name);
  if (!m || !MONTHS[m[3]]) return null;
  return { base: m[1], expiry: `20${m[4]}-${MONTHS[m[3]]}-${m[2].padStart(2, "0")}`, strike: Number(m[5].replace("d", ".")), type: m[6] === "C" ? "call" : "put" };
}

export async function cryptoOptions(session, args) {
  const a = optionsInput.parse(args);
  const coin = a.currency.toUpperCase(), inverse = INVERSE.has(coin);
  const book = await getJson(session, `${API}/get_book_summary_by_currency?currency=${inverse ? coin : "USDC"}&kind=option`);
  const prefix = inverse ? `${coin}-` : `${coin}_USDC-`;
  const options = (book?.result ?? []).filter((r) => r.instrument_name?.startsWith(prefix)).map((r) => ({ ...r, ...parseInstrument(r.instrument_name) })).filter((r) => r.expiry);
  if (!options.length) throw new NotFound(`Deribit lists no ${coin} options. It lists them on BTC and ETH, and in USDC on a few other coins (SOL, XRP, BNB among them).`);
  const today = new Date(session.now()).toISOString().slice(0, 10);
  // Inverse prices are fractions of a coin: in dollars they are price times the expiry's underlying price.
  const usd = (r, p) => (p == null ? null : round(inverse ? p * r.underlying_price : p, 2));
  const expiries = [...new Set(options.map((r) => r.expiry))].sort();
  const days = (e) => Math.round((Date.parse(`${e}T08:00:00Z`) - session.now()) / 86400000 * 10) / 10;
  const common = {
    currency: coin, settled_in: inverse ? coin : "USDC", as_of: new Date(session.now()).toISOString(),
    source: "https://www.deribit.com/options",
    limits: ["Deribit's public market data as it stood when read: marks and implied volatilities are Deribit's own, from its order books.", "Implied volatility is annualized, in percent. Options expire at 08:00 UTC.", "Not investment advice."],
  };
  if ((a.view ?? "summary") === "chain") {
    const expiry = a.expiry ?? expiries.find((e) => days(e) >= 1) ?? expiries[expiries.length - 1];
    const legs = options.filter((r) => r.expiry === expiry);
    if (!legs.length) throw new NotFound(`No ${coin} options expire on ${expiry}. Expiries listed: ${expiries.join(", ")}.`);
    const strikes = [...new Set(legs.map((r) => r.strike))].sort((x, y) => x - y);
    const leg = (k, type) => legs.find((r) => r.strike === k && r.type === type);
    const rows = strikes.map((k) => { const c = leg(k, "call"), p = leg(k, "put"); return [k, c ? usd(c, c.bid_price) : null, c ? usd(c, c.ask_price) : null, c?.mark_iv ?? null, c?.open_interest ?? null, p ? usd(p, p.bid_price) : null, p ? usd(p, p.ask_price) : null, p?.mark_iv ?? null, p?.open_interest ?? null]; });
    return {
      ...common, view: "chain", expiry, days_to_expiry: days(expiry), underlying_price: legs[0].underlying_price, underlying: legs[0].underlying_index,
      units: `prices in US dollars per option on one ${coin}; open interest in ${coin} (contracts of one coin)`,
      columns: ["strike", "call_bid", "call_ask", "call_iv", "call_open_interest", "put_bid", "put_ask", "put_iv", "put_open_interest"], rows,
      expiries,
    };
  }
  const summary = expiries.map((e) => {
    const legs = options.filter((r) => r.expiry === e), forward = legs[0].underlying_price;
    // At the money: the strike nearest the expiry's forward, the mean of its call's and put's marks.
    const atm = legs.reduce((best, r) => (Math.abs(r.strike - forward) < Math.abs(best - forward) ? r.strike : best), legs[0].strike);
    const ivs = legs.filter((r) => r.strike === atm && r.mark_iv > 0).map((r) => r.mark_iv);
    const oi = (type) => round(legs.filter((r) => r.type === type).reduce((t, r) => t + (r.open_interest ?? 0), 0), 2);
    const calls = oi("call"), puts = oi("put");
    return [e, days(e), round(forward, 2), atm, ivs.length ? round(ivs.reduce((t, x) => t + x, 0) / ivs.length, 2) : null, calls, puts, calls ? round(puts / calls, 3) : null, round(legs.reduce((t, r) => t + (r.volume_usd ?? 0), 0), 0)];
  });
  let dvol = null;
  if (inverse) {
    const now = session.now(), d = await getJson(session, `${API}/get_volatility_index_data?currency=${coin}&start_timestamp=${now - 31 * 86400000}&end_timestamp=${now}&resolution=1D`).catch(() => null);
    const closes = (d?.result?.data ?? []).map((c) => [new Date(c[0]).toISOString().slice(0, 10), c[4]]);
    if (closes.length) dvol = { latest: closes[closes.length - 1][1], date: closes[closes.length - 1][0], low_30d: Math.min(...closes.map((c) => c[1])), high_30d: Math.max(...closes.map((c) => c[1])), what: "Deribit's DVOL: the 30-day implied volatility of its options, annualized, in percent" };
  }
  return {
    ...common, view: "summary", today,
    units: `open interest in ${coin}; volume over the last 24 hours in US dollars; implied volatility annualized, percent`,
    columns: ["expiry", "days", "forward", "atm_strike", "atm_iv", "call_open_interest", "put_open_interest", "put_call_ratio", "volume_usd_24h"], rows: summary,
    ...(dvol ? { dvol } : {}),
  };
}
