// prediction_markets: what traders on Polymarket and Kalshi are paying for an outcome (a Fed
// decision, an election, a company milestone), found by words, from the venues' own public APIs.
// A price is the cost of a contract that pays 1 if the outcome happens, so it reads as the market's
// probability, before fees and the bid-ask spread.
import { z } from "zod";

import { getJson } from "./sources.mjs";

export const predictionsInput = z.object({
  query: z.string().min(2).max(120).describe("What the market is about, in words: \"fed rate cut\", \"recession 2026\", \"bitcoin 150k\"."),
  venue: z.enum(["both", "polymarket", "kalshi"]).optional().describe("Default both."),
  limit: z.number().int().min(1).max(20).optional().describe("Most events per venue; default 6."),
}).strict();

// A ladder of strikes ("Bitcoin above ___") can hold dozens of markets; the first ones the venue lists are kept.
const PER_EVENT = 20;
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const round = (x, d = 4) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
const parseList = (v) => { if (Array.isArray(v)) return v; try { const x = JSON.parse(v ?? "[]"); return Array.isArray(x) ? x : []; } catch { return []; } };
const clip = (s, n = 400) => (typeof s === "string" && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? null);

// The market's probability: the middle of the bid and ask when both are quoted, else the last trade.
export function probability(bid, ask, last) {
  if (bid !== null && ask !== null && ask > 0 && ask >= bid) return round((bid + ask) / 2);
  return last;
}

async function polymarket(session, query, limit) {
  const url = `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query)}&limit_per_type=${limit}&events_status=active`;
  const data = await getJson(session, url);
  const rows = [], events = [];
  for (const e of (Array.isArray(data?.events) ? data.events : []).slice(0, limit)) {
    const link = e.slug ? `https://polymarket.com/event/${e.slug}` : null;
    events.push({ venue: "Polymarket", event: e.title ?? null, closes: e.endDate ?? null, volume_usd: round(num(e.volume), 0), resolution: clip(e.description ?? e.markets?.[0]?.description), url: link });
    for (const m of (Array.isArray(e.markets) ? e.markets : []).filter((m) => !m.closed)) {
      const outcomes = parseList(m.outcomes), prices = parseList(m.outcomePrices).map(num);
      const yes = outcomes.findIndex((o) => String(o).toLowerCase() === "yes");
      const at = yes >= 0 ? yes : 0;
      // Polymarket's listed outcome price is its midpoint; the last trade is reported apart.
      const bid = num(m.bestBid), ask = num(m.bestAsk), last = num(m.lastTradePrice) ?? prices[at] ?? null;
      if (rows.filter((r) => r[1] === (e.title ?? null)).length >= PER_EVENT) continue;
      rows.push(["Polymarket", e.title ?? null, m.groupItemTitle || m.question || null, outcomes[at] ?? null, probability(yes >= 0 ? bid : null, yes >= 0 ? ask : null, prices[at] ?? last), yes >= 0 ? bid : null, yes >= 0 ? ask : null, last, round(num(m.volume), 0), m.endDate ?? e.endDate ?? null, link]);
    }
  }
  return { url, rows, events };
}

async function kalshi(session, query, limit) {
  const url = `https://api.elections.kalshi.com/v1/search/series?query=${encodeURIComponent(query)}&page_size=${limit}`;
  const data = await getJson(session, url);
  const rows = [], events = [];
  for (const e of (Array.isArray(data?.current_page) ? data.current_page : []).slice(0, limit)) {
    // Kalshi counts volume in contracts (each pays 1 dollar if the outcome happens), not dollars.
    events.push({ venue: "Kalshi", event: e.event_title ?? null, subtitle: e.event_subtitle ?? null, ticker: e.event_ticker ?? null, volume_contracts: round(num(e.total_volume), 0), category: e.category ?? null });
    for (const m of (Array.isArray(e.markets) ? e.markets : []).slice(0, PER_EVENT)) {
      const bid = num(m.yes_bid_dollars), ask = num(m.yes_ask_dollars), last = num(m.last_price_dollars);
      rows.push(["Kalshi", e.event_title ?? null, m.yes_subtitle || m.ticker || null, "Yes", probability(bid, ask, last), bid, ask, last, null, m.close_ts ?? null, null]);
    }
  }
  return { url, rows, events };
}

export async function predictionMarkets(session, args) {
  const a = predictionsInput.parse(args);
  const venue = a.venue ?? "both", limit = a.limit ?? 6;
  const runs = [];
  if (venue !== "kalshi") runs.push(polymarket(session, a.query, limit).catch((e) => ({ error: `Polymarket: ${e.message}` })));
  if (venue !== "polymarket") runs.push(kalshi(session, a.query, limit).catch((e) => ({ error: `Kalshi: ${e.message}` })));
  const got = await Promise.all(runs);
  const ok = got.filter((g) => !g.error);
  if (!ok.length) throw new Error(got.map((g) => g.error).join("; "));
  const rows = ok.flatMap((g) => g.rows);
  return {
    query: a.query,
    columns: ["venue", "event", "market", "outcome", "probability", "bid", "ask", "last", "volume_usd", "closes", "url"],
    rows,
    events: ok.flatMap((g) => g.events),
    ...(got.some((g) => g.error) ? { unavailable: got.filter((g) => g.error).map((g) => g.error) } : {}),
    ...(rows.length ? {} : { note: "No open market matched these words; try fewer or other words (\"fed\", \"cpi\", \"election\")." }),
    sources: ok.map((g) => g.url),
    limits: [
      "Prices are what traders pay, not Canli Capital's forecasts: a price is the cost of a contract paying 1 if the outcome happens, so it reads as a probability before fees and the spread. probability is the middle of the bid and ask when both are quoted, else the last trade.",
      "Thin markets move on small trades; read volume and the spread before relying on a price. Each venue's rules decide how a market resolves.",
      "Volume is not one measure across venues: Polymarket's is dollars traded (volume_usd), Kalshi's is contracts traded (volume_contracts on its events; each contract pays 1 dollar if the outcome happens).",
      "Not investment advice, and not an offer to trade; access to each venue depends on where you live.",
    ],
  };
}
