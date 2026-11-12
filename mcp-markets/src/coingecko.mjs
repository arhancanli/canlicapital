// crypto_markets: the crypto market from CoinGecko's public API (no key). Coins ranked by market value with
// price, volume, the change over a day, a week and a month, supply and the distance from the all-time high,
// and the whole market's value with bitcoin's and ether's share of it. Or the coins asked for, by symbol or
// CoinGecko id.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const API = "https://api.coingecko.com/api/v3";
export const marketsInput = z.object({
  coins: z.array(z.string().min(1).max(40).regex(/^[A-Za-z0-9-]+$/)).max(50).optional().describe("Coins by symbol (btc, eth) or CoinGecko id (bitcoin, ethereum); default the largest by market value."),
  limit: z.number().int().min(1).max(250).optional().describe("How many of the largest; default 25."),
}).strict();

const r2 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

export async function cryptoMarkets(session, args) {
  const a = marketsInput.parse(args ?? {});
  const wanted = a.coins?.map((c) => c.toLowerCase());
  // Each name is asked for as a symbol (btc) and as an id (bitcoin), in two requests: CoinGecko applies one
  // filter when given both.
  const page = (q) => getJson(session, `${API}/coins/markets?vs_currency=usd&order=market_cap_desc${q}&price_change_percentage=24h,7d,30d`, { maxAgeMs: 60000 });
  const [lists, global] = await Promise.all([
    Promise.all(wanted ? [page(`&symbols=${wanted.join(",")}`), page(`&ids=${wanted.join(",")}`)] : [page(`&per_page=${a.limit ?? 25}&page=1`)]),
    getJson(session, `${API}/global`, { maxAgeMs: 60000 }).catch(() => null),
  ]);
  const seen = new Set(), all = lists.flatMap((l) => (Array.isArray(l) ? l : []));
  // A name that is a coin's id means that coin: other coins whose symbol happens to be the same word are left out.
  const ids = new Set(all.map((c) => c.id));
  const coins = all.filter((c) => !seen.has(c.id) && seen.add(c.id)).filter((c) => !wanted || wanted.includes(c.id) || !ids.has(String(c.symbol).toLowerCase())).sort((x, y) => (x.market_cap_rank ?? 1e9) - (y.market_cap_rank ?? 1e9));
  if (!coins.length) throw new NotFound(wanted ? `CoinGecko lists none of ${wanted.join(", ")}; use a symbol (btc) or CoinGecko's id (bitcoin).` : "CoinGecko returned no coins just now.");
  const g = global?.data;
  return {
    as_of: new Date(session.now()).toISOString(),
    ...(g ? { market: { total_value_usd: r2(g.total_market_cap?.usd), change_24h_pct: r2(g.market_cap_change_percentage_24h_usd), bitcoin_share_pct: r2(g.market_cap_percentage?.btc), ether_share_pct: r2(g.market_cap_percentage?.eth), coins_tracked: g.active_cryptocurrencies ?? null } } : {}),
    columns: ["rank", "symbol", "name", "price_usd", "market_value_usd", "volume_24h_usd", "change_24h_pct", "change_7d_pct", "change_30d_pct", "circulating_supply", "max_supply", "all_time_high_usd", "from_high_pct", "high_date", "id"],
    rows: coins.map((c) => [c.market_cap_rank ?? null, String(c.symbol ?? "").toUpperCase(), c.name, c.current_price ?? null, c.market_cap ?? null, c.total_volume ?? null, r2(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h), r2(c.price_change_percentage_7d_in_currency), r2(c.price_change_percentage_30d_in_currency), c.circulating_supply ?? null, c.max_supply ?? null, c.ath ?? null, r2(c.ath_change_percentage), String(c.ath_date ?? "").slice(0, 10) || null, c.id]),
    source: "https://www.coingecko.com/",
    limits: ["CoinGecko's aggregate of exchange prices as it stood when read (its public API, rate-limited); market value is price times circulating supply as CoinGecko counts it.", "A symbol can belong to more than one coin: each is listed, with its CoinGecko id.", "Not investment advice."],
  };
}
