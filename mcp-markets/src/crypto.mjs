// crypto_fundamentals: what a DeFi protocol, a chain or a stablecoin does in numbers, from
// DefiLlama's open data: total value locked (and its history), the fees users pay and the revenue
// the protocol keeps, and a stablecoin's supply in circulation. Prices are price_history's job.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

export const cryptoInput = z.object({
  protocol: z.string().min(2).max(80).optional().describe("A DeFi protocol by name or DefiLlama slug: aave, lido, uniswap, maker, pendle."),
  chain: z.string().min(2).max(40).optional().describe("A chain's total value locked: Ethereum, Solana, Arbitrum, Base."),
  stablecoin: z.string().min(2).max(40).optional().describe("A stablecoin's supply in circulation: USDT, USDC, DAI, USDe."),
  days: z.number().int().min(7).max(3650).optional().describe("Days of history to return; default 365."),
}).strict().refine((a) => [a.protocol, a.chain, a.stablecoin].filter(Boolean).length === 1, { message: "Give exactly one of protocol, chain or stablecoin." });

const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const round = (x, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
const day = (unix) => new Date(Number(unix) * 1000).toISOString().slice(0, 10);
const pct = (now, then) => (now !== null && then ? round((now / then - 1) * 100) : null);
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

// Every protocol DefiLlama lists (about 9 MB), read once a session.
async function protocols(session) {
  if (!session.llamaProtocols) session.llamaProtocols = await getJson(session, "https://api.llama.fi/protocols", { maxBytes: 64 * 1024 * 1024 });
  return Array.isArray(session.llamaProtocols) ? session.llamaProtocols : [];
}

// A protocol by its slug, name or symbol; a family ("aave") resolves to its parent, which DefiLlama
// serves under the family's own slug.
export function resolveProtocol(list, query) {
  const k = key(query);
  const exact = list.find((p) => key(p.slug) === k || key(p.name) === k);
  if (exact) return { slug: exact.slug, name: exact.name, parent: false, alternatives: [] };
  const children = list.filter((p) => String(p.parentProtocol ?? "") === `parent#${String(query).toLowerCase().trim().replace(/\s+/g, "-")}`);
  if (children.length) return { slug: String(query).toLowerCase().trim().replace(/\s+/g, "-"), name: null, parent: true, alternatives: children.slice(0, 8).map((c) => c.slug) };
  const loose = list.filter((p) => key(p.name).includes(k) || key(p.slug).includes(k) || key(p.symbol ?? "") === k).sort((a, b) => (num(b.tvl) ?? 0) - (num(a.tvl) ?? 0));
  if (!loose.length) throw new NotFound(`DefiLlama lists no protocol named "${query}". Try its slug as DefiLlama writes it (aave-v3, uniswap-v3, lido).`);
  return { slug: loose[0].slug, name: loose[0].name, parent: false, alternatives: loose.slice(1, 6).map((p) => p.slug) };
}

async function feesSummary(session, slug, dataType) {
  const url = `https://api.llama.fi/summary/fees/${encodeURIComponent(slug)}?dataType=${dataType}&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`;
  const d = await getJson(session, url).catch(() => null);
  if (!d || d.total24h === undefined) return null;
  return { last_24h: num(d.total24h), last_7d: num(d.total7d), last_30d: num(d.total30d), last_1y: num(d.total1y), all_time: num(d.totalAllTime), source: url };
}

// A protocol's own record: first under the name as a slug (aave, lido, aave-v3), which saves
// reading the whole list; else by name or symbol through the list.
async function protocolRecord(session, query) {
  const slug = String(query).toLowerCase().trim().replace(/\s+/g, "-");
  if (/^[a-z0-9.-]+$/.test(slug)) {
    const url = `https://api.llama.fi/protocol/${encodeURIComponent(slug)}`;
    const d = await getJson(session, url, { maxBytes: 64 * 1024 * 1024 }).catch(() => null);
    if (d && Array.isArray(d.tvl)) return { p: { slug, name: d.name ?? null, parent: Array.isArray(d.otherProtocols) && d.otherProtocols.length > 1 && String(d.id ?? "").startsWith("parent#"), alternatives: [] }, d, url };
  }
  const p = resolveProtocol(await protocols(session), query);
  const url = `https://api.llama.fi/protocol/${encodeURIComponent(p.slug)}`;
  return { p, d: await getJson(session, url, { maxBytes: 64 * 1024 * 1024 }), url };
}

async function protocolFacts(session, query, days) {
  const { p, d, url } = await protocolRecord(session, query);
  const series = (Array.isArray(d?.tvl) ? d.tvl : []).map((x) => [day(x.date), num(x.totalLiquidityUSD)]).filter((x) => x[1] !== null);
  const latest = series.at(-1) ?? null;
  const ago = (n) => series[series.length - 1 - n]?.[1] ?? null;
  const byChain = Object.entries(d?.currentChainTvls ?? {}).filter(([c]) => !/-|staking|pool2|borrowed|vesting|offers|treasury/i.test(c)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([chain, v]) => [chain, round(num(v), 0)]);
  const [fees, revenue] = await Promise.all([feesSummary(session, p.slug, "dailyFees"), feesSummary(session, p.slug, "dailyRevenue")]);
  const kept = series.slice(-days);
  return {
    protocol: { name: d?.name ?? p.name, slug: p.slug, category: d?.category ?? null, chains: d?.chains ?? [], url: d?.url ?? null, ...(p.parent ? { family_of: p.alternatives.length ? p.alternatives : (d?.otherProtocols ?? []).filter((x) => x !== d?.name) } : {}) },
    tvl: latest ? { usd: round(latest[1], 0), date: latest[0], change_1d_pct: pct(latest[1], ago(1)), change_7d_pct: pct(latest[1], ago(7)), change_30d_pct: pct(latest[1], ago(30)), by_chain: { columns: ["chain", "tvl_usd"], rows: byChain } } : null,
    ...(fees ? { fees_usd: fees } : {}), ...(revenue ? { revenue_usd: revenue } : {}),
    dates: kept.map((x) => x[0]), values: kept.map((x) => round(x[1], 0)), series: "TVL, USD",
    ...(p.alternatives.length && !p.parent ? { also_matched: p.alternatives } : {}),
    source: url,
  };
}

async function chainFacts(session, query, days) {
  const list = await getJson(session, "https://api.llama.fi/v2/chains");
  const c = (Array.isArray(list) ? list : []).find((x) => key(x.name) === key(query) || key(x.gecko_id ?? "") === key(query) || key(x.tokenSymbol ?? "") === key(query));
  if (!c) throw new NotFound(`DefiLlama lists no chain named "${query}". Examples: Ethereum, Solana, Arbitrum, Base, BSC, Tron.`);
  const url = `https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(c.name)}`;
  const series = (await getJson(session, url, { maxBytes: 32 * 1024 * 1024 })).map((x) => [day(x.date), num(x.tvl)]).filter((x) => x[1] !== null);
  const latest = series.at(-1) ?? null, ago = (n) => series[series.length - 1 - n]?.[1] ?? null;
  const kept = series.slice(-days);
  return {
    chain: { name: c.name, token: c.tokenSymbol ?? null },
    tvl: latest ? { usd: round(latest[1], 0), date: latest[0], change_1d_pct: pct(latest[1], ago(1)), change_7d_pct: pct(latest[1], ago(7)), change_30d_pct: pct(latest[1], ago(30)) } : null,
    dates: kept.map((x) => x[0]), values: kept.map((x) => round(x[1], 0)), series: "TVL, USD",
    source: url,
  };
}

async function stablecoinFacts(session, query) {
  const url = "https://stablecoins.llama.fi/stablecoins?includePrices=true";
  const d = await getJson(session, url, { maxBytes: 32 * 1024 * 1024 });
  const assets = Array.isArray(d?.peggedAssets) ? d.peggedAssets : [];
  const s = assets.find((x) => key(x.symbol) === key(query)) ?? assets.find((x) => key(x.name) === key(query)) ?? assets.find((x) => key(x.name).includes(key(query)));
  if (!s) throw new NotFound(`DefiLlama lists no stablecoin "${query}". Examples: USDT, USDC, DAI, USDe, FDUSD, PYUSD.`);
  const peg = s.pegType ?? "peggedUSD";
  const now = num(s.circulating?.[peg]), day1 = num(s.circulatingPrevDay?.[peg]), week = num(s.circulatingPrevWeek?.[peg]), month = num(s.circulatingPrevMonth?.[peg]);
  const chains = Object.entries(s.chainCirculating ?? {}).map(([chain, v]) => [chain, round(num(v?.current?.[peg]), 0)]).filter((x) => x[1] !== null).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    stablecoin: { name: s.name, symbol: s.symbol, peg: peg.replace(/^pegged/, ""), mechanism: s.pegMechanism ?? null, price: num(s.price) },
    circulating: { amount: round(now, 0), change_1d_pct: pct(now, day1), change_7d_pct: pct(now, week), change_30d_pct: pct(now, month), by_chain: { columns: ["chain", "circulating"], rows: chains } },
    source: url,
  };
}

export async function cryptoFundamentals(session, args) {
  const a = cryptoInput.parse(args);
  const days = a.days ?? 365;
  const facts = a.protocol ? await protocolFacts(session, a.protocol, days) : a.chain ? await chainFacts(session, a.chain, days) : await stablecoinFacts(session, a.stablecoin);
  return {
    ...facts,
    limits: [
      "From DefiLlama's open data, which adds protocols, chains and methods over time and restates history when it does; TVL counts the deposits it can see on chain, valued at market prices.",
      "Fees are what users pay; revenue is the part the protocol keeps. Both are DefiLlama's adapters' measures, and a protocol's own reports can count them otherwise.",
      "Not investment advice.",
    ],
  };
}
