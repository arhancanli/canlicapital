// Options and volatility from Cboe's public delayed data (at least 15 minutes old): option chains
// with Cboe's implied volatilities and greeks, the volatility surface and skew, and Cboe futures
// curves (VIX) from its daily settlements. No key; Cboe's terms for its website data apply.
import { z } from "zod";

import { getJson, getText, NotFound } from "./sources.mjs";

const CBOE = "https://cdn-api.cboe.com/api/global/delayed_quotes";
const SETTLEMENTS = "https://www.cboe.com/us/futures/market_statistics/settlement/csv";
const round = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const LIMITS = [
  "Cboe's public delayed quotes (at least 15 minutes old) and its implied volatilities and greeks, as Cboe computes them; for personal use under Cboe's terms. CANLI_KEYLESS_OPTIONS=0 turns this source off.",
  "Not investment advice.",
];

// Indexes are "_SPX" on Cboe; stocks and ETFs by ticker.
const INDEXES = Object.freeze({ spx: "SPX", "s&p 500": "SPX", "^spx": "SPX", "^gspc": "SPX", spxw: "SPX", vix: "VIX", "^vix": "VIX", ndx: "NDX", "nasdaq 100": "NDX", "^ndx": "NDX", rut: "RUT", "russell 2000": "RUT", "^rut": "RUT", djx: "DJX", xsp: "XSP", "mini spx": "XSP" });
export function cboeSymbol(q) {
  const s = String(q).trim();
  const index = INDEXES[s.toLowerCase()];
  if (index) return { file: `_${index}`, symbol: index, index: true };
  if (!/^[A-Za-z]{1,6}(\.[A-Za-z])?$/.test(s)) throw new NotFound(`"${q}" is not a ticker or an index Cboe lists options for (SPX, NDX, RUT, VIX, XSP, or a stock or ETF such as AAPL or SPY).`);
  return { file: s.toUpperCase().replace(".", ""), symbol: s.toUpperCase(), index: false };
}

// "AAPL261012C00245000" or "SPXW261016P05800000": root, expiry, type and strike (OSI symbology).
export function parseOsi(sym) {
  const m = String(sym).match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return { root: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] === "C" ? "call" : "put", strike: Number(m[6]) / 1000 };
}

function keyless(session) {
  if (/^(0|false|no)$/i.test(String(session.env.CANLI_KEYLESS_OPTIONS ?? ""))) throw new Error("Cboe's delayed option data is turned off (CANLI_KEYLESS_OPTIONS=0).");
}

async function chain(session, q) {
  keyless(session);
  const s = cboeSymbol(q);
  let d;
  try {
    d = await getJson(session, `${CBOE}/options/${s.file}.json`, { maxBytes: 48 * 1024 * 1024 });
  } catch (err) {
    if (err instanceof NotFound) throw new NotFound(`Cboe lists no options for ${s.symbol}.`);
    throw err;
  }
  const data = d?.data ?? {};
  const contracts = [];
  for (const o of data.options ?? []) {
    const p = parseOsi(o.option);
    if (!p) continue;
    const mid = o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : null;
    contracts.push({ ...p, bid: o.bid ?? null, ask: o.ask ?? null, mid, last: o.last_trade_price ?? null, iv: o.iv || null, delta: o.delta ?? null, gamma: o.gamma ?? null, theta: o.theta ?? null, vega: o.vega ?? null, oi: o.open_interest ?? 0, volume: o.volume ?? 0 });
  }
  if (!contracts.length) throw new NotFound(`Cboe's file for ${s.symbol} has no option contracts.`);
  return { ...s, as_of: d.timestamp ?? null, spot: data.current_price ?? data.close ?? null, change_pct: data.price_change_percent == null ? null : round(data.price_change_percent / 100, 6), iv30: data.iv30 == null ? null : round(data.iv30 / 100, 6), contracts };
}

const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const today = (session) => new Date(session.now()).toISOString().slice(0, 10);

// The strike where option holders lose the most at expiry: the classic "max pain".
function maxPain(list) {
  const strikes = [...new Set(list.map((c) => c.strike))].sort((a, b) => a - b);
  let best = null;
  for (const k of strikes) {
    const pain = list.reduce((s, c) => s + c.oi * (c.type === "call" ? Math.max(0, k - c.strike) : Math.max(0, c.strike - k)), 0);
    if (!best || pain < best.pain) best = { strike: k, pain };
  }
  return best?.strike ?? null;
}

// Interpolated implied volatility at a moneyness (strike / spot) from out-of-the-money options.
function ivAt(list, spot, m) {
  const k = spot * m;
  const pts = list.filter((c) => c.iv && ((c.type === "put" && c.strike <= spot) || (c.type === "call" && c.strike >= spot))).sort((a, b) => a.strike - b.strike);
  if (!pts.length) return null;
  let lo = null, hi = null;
  for (const p of pts) { if (p.strike <= k) lo = p; if (p.strike >= k && !hi) hi = p; }
  if (!lo || !hi) return null;
  if (hi.strike === lo.strike) return lo.iv;
  return lo.iv + ((hi.iv - lo.iv) * (k - lo.strike)) / (hi.strike - lo.strike);
}

export const chainInput = z.object({
  symbol: z.string().min(1).max(20).describe("A stock or ETF (AAPL, SPY, QQQ) or an index (SPX, NDX, RUT, VIX, XSP)."),
  expiration: z.string().max(10).optional().describe("An expiration date (2026-11-20), or \"nearest\" (default); the result lists every expiration."),
  window: z.number().min(0.01).max(1).optional().describe("Strikes within this fraction of the underlying price; default 0.1 (10 percent)."),
  type: z.enum(["calls", "puts", "both"]).optional().describe("Default both."),
  min_open_interest: z.number().int().min(0).optional().describe("Only contracts with at least this open interest; default 0."),
}).strict();

export async function optionsChain(session, args) {
  const a = chainInput.parse(args);
  const c = await chain(session, a.symbol);
  const now = today(session);
  const live = c.contracts.filter((x) => x.expiry >= now);
  const expiries = [...new Set(live.map((x) => x.expiry))].sort();
  if (!expiries.length) throw new NotFound(`Cboe lists no unexpired options for ${c.symbol}.`);
  const want = !a.expiration || a.expiration === "nearest" ? expiries[0] : a.expiration;
  if (!expiries.includes(want)) throw new NotFound(`${c.symbol} has no options expiring ${want}; expirations: ${expiries.slice(0, 12).join(", ")}${expiries.length > 12 ? ", …" : ""}.`);
  const ofExpiry = live.filter((x) => x.expiry === want);
  const spot = c.spot;
  const w = a.window ?? 0.1;
  const rows = ofExpiry
    .filter((x) => (a.type ?? "both") === "both" || x.type === (a.type === "calls" ? "call" : "put"))
    .filter((x) => !spot || Math.abs(x.strike / spot - 1) <= w)
    .filter((x) => x.oi >= (a.min_open_interest ?? 0))
    .sort((x, y) => x.strike - y.strike || x.type.localeCompare(y.type));
  // At the money: the strike nearest the underlying, its call and put.
  const atmStrike = spot ? ofExpiry.reduce((b, x) => (b == null || Math.abs(x.strike - spot) < Math.abs(b - spot) ? x.strike : b), null) : null;
  const atmCall = ofExpiry.find((x) => x.strike === atmStrike && x.type === "call"), atmPut = ofExpiry.find((x) => x.strike === atmStrike && x.type === "put");
  const straddle = atmCall?.mid != null && atmPut?.mid != null ? atmCall.mid + atmPut.mid : null;
  const sum = (list, k) => list.reduce((s, x) => s + (x[k] ?? 0), 0);
  const calls = ofExpiry.filter((x) => x.type === "call"), puts = ofExpiry.filter((x) => x.type === "put");
  return {
    underlying: { symbol: c.symbol, price: spot, change_pct: c.change_pct, iv30: c.iv30, as_of: c.as_of },
    expiration: want, days_to_expiration: days(now, want),
    summary: {
      put_call_volume_ratio: sum(calls, "volume") ? round(sum(puts, "volume") / sum(calls, "volume"), 4) : null,
      put_call_open_interest_ratio: sum(calls, "oi") ? round(sum(puts, "oi") / sum(calls, "oi"), 4) : null,
      max_pain: maxPain(ofExpiry), atm_strike: atmStrike, atm_iv: atmCall?.iv && atmPut?.iv ? round((atmCall.iv + atmPut.iv) / 2, 4) : atmCall?.iv ?? atmPut?.iv ?? null,
      expected_move: straddle != null ? { dollars: round(straddle, 4), fraction_of_price: spot ? round(straddle / spot, 4) : null, from: "at-the-money straddle mid" } : null,
    },
    columns: ["strike", "type", "bid", "ask", "mid", "last", "iv", "delta", "gamma", "theta", "vega", "open_interest", "volume"],
    rows: rows.map((x) => [x.strike, x.type, x.bid, x.ask, x.mid == null ? null : round(x.mid, 4), x.last, x.iv, x.delta, x.gamma, x.theta, x.vega, x.oi, x.volume]),
    expirations: { columns: ["expiration", "days", "contracts", "call_open_interest", "put_open_interest"], rows: expiries.map((e) => { const l = live.filter((x) => x.expiry === e); return [e, days(now, e), l.length, sum(l.filter((x) => x.type === "call"), "oi"), sum(l.filter((x) => x.type === "put"), "oi")]; }) },
    source: `https://www.cboe.com/delayed_quotes/${c.symbol.toLowerCase()}/quote_table`,
    limits: [...LIMITS, "IV and greeks are per contract as Cboe publishes them (IV as a fraction a year; theta per day). Max pain and the expected move are computed here from Cboe's open interest and quotes."],
  };
}

const MONEYNESS = [0.8, 0.9, 0.95, 1, 1.05, 1.1, 1.2];
export const surfaceInput = z.object({
  symbol: z.string().min(1).max(20).describe("A stock or ETF (AAPL, SPY) or an index (SPX, NDX, RUT, VIX)."),
  expirations: z.number().int().min(1).max(24).optional().describe("How many expirations from the nearest; default 8."),
}).strict();

export async function volatilitySurface(session, args) {
  const a = surfaceInput.parse(args);
  const c = await chain(session, a.symbol);
  const spot = c.spot;
  if (!spot) throw new NotFound(`Cboe's file for ${c.symbol} has no underlying price.`);
  const now = today(session);
  const expiries = [...new Set(c.contracts.filter((x) => x.expiry > now).map((x) => x.expiry))].sort().slice(0, a.expirations ?? 8);
  const near = (list, type, target) => list.filter((x) => x.type === type && x.delta != null && x.iv).sort((x, y) => Math.abs(Math.abs(x.delta) - target) - Math.abs(Math.abs(y.delta) - target))[0];
  const rows = [], smile = [];
  for (const e of expiries) {
    const l = c.contracts.filter((x) => x.expiry === e);
    const atm = ivAt(l, spot, 1);
    const p25 = near(l, "put", 0.25)?.iv ?? null, c25 = near(l, "call", 0.25)?.iv ?? null;
    rows.push([e, days(now, e), round(atm, 4), round(p25, 4), round(c25, 4), p25 != null && c25 != null ? round(p25 - c25, 4) : null, p25 != null && c25 != null && atm != null ? round((p25 + c25) / 2 - atm, 4) : null]);
    smile.push([e, ...MONEYNESS.map((m) => round(ivAt(l, spot, m), 4))]);
  }
  return {
    underlying: { symbol: c.symbol, price: spot, iv30: c.iv30, as_of: c.as_of },
    term_structure: { columns: ["expiration", "days", "atm_iv", "put_25_delta_iv", "call_25_delta_iv", "risk_reversal", "butterfly"], rows },
    smile: { columns: ["expiration", ...MONEYNESS.map((m) => `iv_at_${m}`)], rows: smile, note: "iv_at_0.9 is the implied volatility at a strike of 90 percent of the underlying price, interpolated from out-of-the-money options (puts below the price, calls above)." },
    source: `https://www.cboe.com/delayed_quotes/${c.symbol.toLowerCase()}/quote_table`,
    limits: [...LIMITS, "risk_reversal is the 25-delta put's IV minus the 25-delta call's (positive: downside protection costs more); butterfly is their average minus at-the-money IV. Contracts nearest 25 delta are used, not interpolated."],
  };
}

// Cboe futures settlements: one file, the latest settlement for each listed contract.
export const FUTURES = Object.freeze({ vix: "VX", vx: "VX", "mini vix": "VXM", vxm: "VXM", "variance": "VA", "bitcoin": "XBTF", "high yield": "IBHY", "investment grade": "IBIG", "emerging market bonds": "IEMD" });
export const curveInput = z.object({
  product: z.string().max(30).optional().describe("A Cboe futures product: VIX (default), mini VIX, S&P 500 variance, bitcoin, or the iBoxx high yield, investment grade and emerging market bond index futures."),
}).strict();

export async function futuresCurve(session, args) {
  const a = curveInput.parse(args);
  keyless(session);
  const product = FUTURES[String(a.product ?? "vix").trim().toLowerCase()] ?? String(a.product ?? "").trim().toUpperCase();
  const csv = await getText(session, SETTLEMENTS, { maxBytes: 2 * 1024 * 1024 });
  const lines = csv.trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
  const all = lines.filter((r) => r[0] === product);
  if (!all.length) throw new NotFound(`Cboe's settlement file has no ${product} futures; it lists ${[...new Set(lines.map((r) => r[0]))].join(", ")}. Futures on oil, stocks or rates trade on CME; price_history has their front-month prices.`);
  // Monthly contracts ("VX/V6") make the curve; weeklies ("VX41/V6") are listed apart.
  const monthly = all.filter((r) => /^[A-Z]+\/[A-Z]\d$/.test(r[1])).sort((x, y) => x[2].localeCompare(y[2]));
  const curve = (monthly.length >= 2 ? monthly : all).map((r) => [r[1], r[2], Number(r[3])]);
  let spot = null;
  if (product === "VX" || product === "VXM") {
    try { const q = await getJson(session, `${CBOE}/quotes/_VIX.json`); spot = q?.data?.current_price ?? null; } catch (err) { if (!(err instanceof NotFound)) throw err; }
  }
  const [f1, f2] = curve;
  const now = today(session);
  return {
    product, ...(spot != null ? { spot_index: spot } : {}),
    columns: ["contract", "expiration", "settlement"],
    rows: curve,
    ...(f1 && f2 ? { shape: { front_to_second: round(f2[2] - f1[2], 4), front_to_second_pct: round(f2[2] / f1[2] - 1, 6), state: f2[2] > f1[2] ? "contango" : f2[2] < f1[2] ? "backwardation" : "flat", ...(spot != null ? { front_premium_to_spot_pct: round(f1[2] / spot - 1, 6), front_days: days(now, f1[1]) } : {}) } } : {}),
    weeklies: monthly.length >= 2 ? all.filter((r) => !/^[A-Z]+\/[A-Z]\d$/.test(r[1])).length : 0,
    source: "https://www.cboe.com/us/futures/market_statistics/settlement/",
    limits: [...LIMITS, "Daily settlement prices from Cboe Futures Exchange's latest settlement file; the spot index is Cboe's delayed quote."],
  };
}
